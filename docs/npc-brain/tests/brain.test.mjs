import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NpcBrain, NeedsRoutine, GdmNpcAdapter } from '../dist/index.js';

class FakePort {
  position = { x: 0, z: 0 };
  needs = { food: 0.8, water: 0.8, energy: 0.9, bathroom: 0.1, health: 100 };
  performed = [];
  cancelled = [];
  stopped = 0;
  objects = { bench: { x: 5, z: 0 }, bathroom: { x: 2, z: 0 }, water: { x: 4, z: 0 }, food: { x: 6, z: 0 }, bed: { x: 7, z: 0 } };
  observe() { return { actorId: 'john', position: { ...this.position }, needs: this.needs, danger: 0 }; }
  locate(id) { return this.objects[id] ?? null; }
  moveTo(p, stop, speed, dt) {
    const dx = p.x - this.position.x, dz = p.z - this.position.z, distance = Math.hypot(dx, dz);
    if (distance <= stop) return { status: 'succeeded' };
    const amount = Math.min(speed * dt, distance - stop);
    this.position.x += amount * dx / distance; this.position.z += amount * dz / distance;
    return { status: Math.hypot(p.x-this.position.x,p.z-this.position.z) <= stop ? 'succeeded':'running' };
  }
  stopMoving() { this.stopped++; }
  perform(cmd) { this.performed.push(cmd.kind); return { status: 'succeeded' }; }
  cancel(cmd) { this.cancelled.push(cmd.kind); }
}

test('sequential walking + scanning complete through commands', () => {
  const port = new FakePort(), brain = new NpcBrain(port);
  brain.enqueueSequence([
    { kind: 'walkToObject', targetId: 'bench', priority: 40 },
    { kind: 'scan', targetId: 'bench', priority: 40 },
  ], 'quest:artifact');
  for (let i=0; i<30; i++) brain.tick(0.2);
  assert.deepEqual(port.performed, ['scan']);
  assert.equal(brain.queued.length, 0);
  assert.equal(brain.active, null);
  assert.ok(port.position.x >= 4);
  assert.equal(brain.events.filter(e=>e.phase==='completed').length, 2);
});

test('urgent tasks interrupt a lower-priority movement and resume navigation', () => {
  const port = new FakePort(), brain = new NpcBrain(port);
  brain.enqueue({ kind:'walkTo', point:{x:20,z:0}, priority:20 });
  brain.tick(0.2);
  brain.enqueue({ kind:'call', recipientId:'mary', topic:'urgent', priority:95, source:'story' });
  brain.tick(0.2);
  assert.equal(port.performed[0], 'call');
  assert.equal(brain.queued.some(c => c.kind === 'walkTo'), true); // movement queued to resume
  brain.tick(0.2); assert.equal(brain.active?.kind, 'walkTo');
  assert.equal(brain.events.filter(e=>e.phase==='interrupted').length,1);
});

test('player takeover stops AI safely, then allows AI to return', () => {
  const port=new FakePort(), brain=new NpcBrain(port);
  brain.enqueue({kind:'walkTo',point:{x:10,z:0}}); brain.tick(0.1);
  const x=port.position.x;
  brain.setMode('player'); brain.tick(2);
  assert.equal(brain.active,null);
  assert.equal(port.position.x,x);
  assert.ok(port.cancelled.includes('walkTo'));
  brain.setMode('ai'); brain.enqueue({kind:'wait',seconds:0.1}); brain.tick(0.2);
  assert.equal(brain.events.at(-1).phase,'completed');
});

test('NPC routines schedule urgent bathroom trip but not duplicate it', () => {
  const port = new FakePort(), brain=new NpcBrain(port);
  port.needs.bathroom=0.99;
  const routine=new NeedsRoutine(brain,{bathroomId:'bathroom', foodStationId:'food',waterStationId:'water',bedId:'bed'});
  for(let i=0;i<4;i++) routine.tick(0.25);
  assert.equal(brain.queued.filter(c=>c.group==='need:bathroom').length,2);
  assert.equal(brain.queued.some(c=>c.kind==='useBathroom'),true);
});

test('story lock pauses autonomous tasks but scripted tasks can run in scripted mode', () => {
  const port=new FakePort(); port.observe=()=>({actorId:'john',position:{x:0,z:0},needs:port.needs,danger:0,storyLocked:true});
  const brain=new NpcBrain(port);
  brain.enqueue({kind:'call',recipientId:'mary',topic:'hi',source:'routine'});
  brain.tick(.5); assert.equal(port.performed.length,0);
  brain.setMode('scripted');
  brain.enqueue({kind:'call',recipientId:'mary',topic:'story',source:'story',priority:90});
  brain.tick(.5);
  assert.deepEqual(port.performed,['call']);
  assert.equal(brain.queued.length,1);
});

function fakeGdm() {
  let bladder=0, calls=0, consumed=[], squats=[];
  const gdm={
    actorId:'mary',
    motion:{x:0,z:0,speed:0,update(dt,mx,my,yaw,speed){this.x+=Math.sin(yaw)*speed*dt;this.z+=Math.cos(yaw)*speed*dt;this.speed=speed;}},
    body:{setPosition(){},setYaw(){},setWalk(){},squatFor(sec){squats.push(sec);}},
    vitals:{reading:{food:.5,water:.5,energy:.5,bathroom:.8,health:100},consume(f,w){consumed.push([f,w]);},relieve(){bladder++;}},
    locate(){return {x:1,z:0};},danger:()=>0,groundAt:()=>0,canUseBathroom:()=>true,
    phone(){calls++;return true;}
  };
  return {gdm, get:()=>({bladder,calls,consumed,squats})};
}

test('GDM port calls vitals.consume exactly once AFTER eating animation', () => {
  const f=fakeGdm(), brain=new NpcBrain(new GdmNpcAdapter(f.gdm));
  brain.enqueue({kind:'eat',foodMl:200,seconds:2});
  brain.tick(.5);assert.deepEqual(f.get().consumed,[]);
  brain.tick(1);assert.deepEqual(f.get().consumed,[]);
  brain.tick(.6); assert.deepEqual(f.get().consumed,[[200,0]]);
  brain.tick(.6); assert.deepEqual(f.get().consumed,[[200,0]]);
});

test('GDM bathroom uses squat animation then relieves one time', () => {
  const f=fakeGdm(), brain=new NpcBrain(new GdmNpcAdapter(f.gdm));
  brain.enqueue({kind:'useBathroom',seconds:5});brain.tick(1);
  assert.equal(f.get().bladder,0);assert.deepEqual(f.get().squats,[5]);
  brain.tick(4.1); assert.equal(f.get().bladder,1);
  brain.tick(1);assert.equal(f.get().bladder,1);
});

test('NPC cannot use bathroom without a suitable location', () => {
  const f=fakeGdm(); delete f.gdm.canUseBathroom;
  const brain=new NpcBrain(new GdmNpcAdapter(f.gdm));
  brain.enqueue({kind:'useBathroom'});brain.tick(.1);
  assert.equal(brain.events.at(-1).phase,'failed');assert.equal(f.get().bladder,0);
});

test('NPC never auto-shoots without explicit combat permission', () => {
  const f=fakeGdm(); let shots=0;
  f.gdm.combat={canFire:()=>true,shoot:()=>{shots++;return true;},stop(){}};
  const brain=new NpcBrain(new GdmNpcAdapter(f.gdm));
  brain.enqueue({kind:'fireAt',targetId:'intruder',mode:'defense',maxShots:3,source:'routine'});
  brain.tick(.2); assert.equal(shots,0);
  assert.equal(brain.events.at(-1).phase,'failed');
  brain.enqueue({kind:'fireAt',targetId:'control-panel',mode:'utility',maxShots:2,interval:0.2});
  brain.tick(.2);brain.tick(.2);brain.tick(.2);
  assert.equal(shots,2);
});

test('GDM door/hand actions use existing state machine instead of directly animating', () => {
  const f=fakeGdm();let starts=0;
  f.gdm.doorId='lab-door';
  f.gdm.finishOpeningDoor=()=>({status:'succeeded'});
  f.gdm.doorUse={active:false,holding:false,busy:false,start(){starts++;this.active=true;this.busy=true;},letGo(){this.active=false;this.holding=false;this.busy=false;}};
  const brain=new NpcBrain(new GdmNpcAdapter(f.gdm));
  brain.enqueue({kind:'openDoor',doorId:'lab-door'});brain.tick(.1);brain.tick(.1);
  assert.equal(starts,1);assert.equal(brain.active.kind,'openDoor');
  f.gdm.doorUse.holding=true;f.gdm.doorUse.busy=false;brain.tick(.1);
  assert.equal(brain.active,null);assert.equal(brain.events.at(-1).phase,'completed');
});
