// ============================================================================
// standIn.ts -- a simple stand-in heroine made of spheres and cylinders.
//
// She exists so the cameras and controls can be built and tested before the
// real Character Builder body is ready. She answers to exactly the same
// HeroineBody contract (core/contracts.ts), so the game cannot tell the two
// apart: swapping her for the real body is one line in main.ts.
//
// About 1.75 m tall, magenta and silver, with a round pregnant belly and two
// arms that hold simple guns and swing to point at whatever aimAt() is given.
// ============================================================================
import * as THREE from 'three';
import type { FrameInfo, Hand, HeroineBody } from '../core/contracts';

const HEIGHT = 1.75;
const HIP_HEIGHT = 0.92;
const SHOULDER_HEIGHT = 1.4;
const SHOULDER_OUT = 0.22; // metres from her middle to each shoulder
const HEAD_HEIGHT = 1.62; // the middle of her head
const EYE_FORWARD = 0.13; // the first-person camera sits this far in front of the middle of her head
const ARM_LENGTH = 0.56;

/** Arms at rest hang this far down from level (radians). */
const REST_PITCH = 1.3;
/** She cannot aim further round than this to either side (radians), so her arms never fold behind her back. */
const MAX_AIM_YAW = 1.9;
/** How quickly the arms swing to a new aim (bigger = snappier). */
const AIM_RATE = 12;
/** How quickly a shot's kick dies away. */
const RECOIL_RATE = 9;

/** One arm: the shoulder joint that turns, where the gun's muzzle is, and its motion. */
interface Arm {
  pivot: THREE.Group;
  muzzle: THREE.Object3D;
  yaw: number; // current turn to the side
  pitch: number; // current turn down (+) or up (-)
  recoil: number; // 1 right after a shot, fading to 0
}

class StandInHeroine implements HeroineBody {
  readonly root = new THREE.Group();
  /** The ground's height under her (the island's hills; 0 on the flat town). */
  private groundY = 0;
  readonly height = HEIGHT;
  /** The stand-in is built from code, so she is ready at once. */
  readonly ready = true;

  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly head = new THREE.Group();
  private readonly belly: THREE.Mesh;
  private readonly leftLeg: THREE.Group;
  private readonly rightLeg: THREE.Group;
  private readonly arms: Record<Hand, Arm>;

  private yaw = 0;
  private walkSpeed = 0;
  private stride = 0; // how far through a step she is, in radians
  private hasTarget = false;
  private readonly target = new THREE.Vector3();

  constructor() {
    // Lambert is the cheapest material that still reacts to the scene's lights.
    const magenta = this.keepMaterial(new THREE.MeshLambertMaterial({ color: 0xe0308f }));
    const silver = this.keepMaterial(new THREE.MeshLambertMaterial({ color: 0xc9d2e0 }));
    // The belly is a lighter pink than her suit, so it can be told apart when she looks down at it.
    const bellyPink = this.keepMaterial(new THREE.MeshLambertMaterial({ color: 0xff6fb8 }));
    const skin = this.keepMaterial(new THREE.MeshLambertMaterial({ color: 0xf0c4a8 }));
    const glow = this.keepMaterial(new THREE.MeshBasicMaterial({ color: 0xff8ad0 }));

    // --- Body: hips, torso, chest plate and the belly ---------------------
    this.add(this.root, new THREE.SphereGeometry(0.17, 14, 10), magenta, 0, 0.95, 0).scale.set(1.05, 0.75, 0.85);
    this.add(this.root, new THREE.CapsuleGeometry(0.14, 0.3, 4, 12), magenta, 0, 1.2, 0);
    this.add(this.root, new THREE.SphereGeometry(0.15, 14, 10), silver, 0, 1.33, 0).scale.set(1.15, 0.7, 0.75);
    this.belly = this.add(this.root, new THREE.SphereGeometry(0.21, 18, 14), bellyPink, 0, 1.08, 0.15);
    // A silver band over the belly so its round shape reads from every side.
    this.add(this.belly, new THREE.TorusGeometry(0.2, 0.014, 6, 24), silver, 0, 0, 0).rotation.y = Math.PI / 2;

    // --- Head: its own group, so first person can hide it -----------------
    this.root.add(this.head);
    this.add(this.head, new THREE.CylinderGeometry(0.045, 0.05, 0.1, 8), skin, 0, 1.47, 0);
    this.add(this.head, new THREE.SphereGeometry(0.11, 16, 12), skin, 0, HEAD_HEIGHT, 0);
    // Hair: a magenta cap over the back and top of her head.
    this.add(this.head, new THREE.SphereGeometry(0.125, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), magenta, 0, HEAD_HEIGHT + 0.005, -0.015);

    // --- Legs: each hangs from a hip joint that swings when she walks ------
    this.leftLeg = this.buildLeg(0.1, magenta, silver);
    this.rightLeg = this.buildLeg(-0.1, magenta, silver);

    // --- Arms: each turns at the shoulder and holds a gun ------------------
    // Her left is toward +X when she faces +Z.
    this.arms = {
      left: this.buildArm(SHOULDER_OUT, magenta, skin, silver, glow),
      right: this.buildArm(-SHOULDER_OUT, magenta, skin, silver, glow),
    };

    this.setBelly(100);
  }

  // ---- The HeroineBody contract --------------------------------------------

  setPosition(x: number, z: number, y = 0): void {
    this.root.position.x = x;
    this.root.position.z = z;
    this.groundY = y;
  }

  setYaw(yaw: number): void {
    this.yaw = yaw;
    this.root.rotation.y = yaw;
  }

  setWalk(speed: number): void {
    this.walkSpeed = speed;
  }

  aimAt(target: THREE.Vector3 | null): void {
    this.hasTarget = target !== null;
    if (target) this.target.copy(target);
  }

  fire(hand: Hand): void {
    this.arms[hand].recoil = 1;
  }

  muzzle(hand: Hand, out: THREE.Vector3): THREE.Vector3 {
    return this.arms[hand].muzzle.getWorldPosition(out);
  }

  eye(out: THREE.Vector3): THREE.Vector3 {
    // The middle of her head, pushed forward the way she faces, so that looking
    // straight down shows her chest and belly instead of the inside of her neck.
    return out.set(
      this.root.position.x + Math.sin(this.yaw) * EYE_FORWARD,
      this.root.position.y + HEAD_HEIGHT + 0.02,
      this.root.position.z + Math.cos(this.yaw) * EYE_FORWARD,
    );
  }

  setFirstPerson(on: boolean): void {
    this.head.visible = !on;
  }

  setBelly(percent: number): void {
    // 0% is nearly flat, 100% a clear round belly, 200% very large.
    const amount = Math.min(200, Math.max(0, percent)) / 100;
    const size = 0.55 + 0.45 * amount;
    this.belly.scale.set(size, size, size);
    // A bigger belly also sits further forward, so it grows outward and not into her back.
    this.belly.position.z = 0.05 + 0.1 * amount;
  }

  update(frame: FrameInfo): void {
    // --- Legs: swing in step with her ground speed --------------------------
    const moving = Math.min(1, Math.abs(this.walkSpeed) / 1.5);
    this.stride += Math.abs(this.walkSpeed) * frame.dt * 3.4;
    const swing = Math.sin(this.stride) * 0.55 * moving;
    this.leftLeg.rotation.x = swing;
    this.rightLeg.rotation.x = -swing;
    // A small bounce on every step.
    this.root.position.y = this.groundY + Math.abs(Math.cos(this.stride)) * 0.025 * moving;

    // --- Arms: swing toward the target, or down to rest ---------------------
    this.updateArm(this.arms.left, SHOULDER_OUT, frame.dt);
    this.updateArm(this.arms.right, -SHOULDER_OUT, frame.dt);
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.root.removeFromParent();
  }

  // ---- Building her ----------------------------------------------------------

  private keepMaterial<T extends THREE.Material>(material: T): T {
    this.materials.push(material);
    return material;
  }

  /** Make one mesh, put it under `parent` at (x, y, z) and remember its geometry for dispose(). */
  private add(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
    this.geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  private buildLeg(x: number, cloth: THREE.Material, boot: THREE.Material): THREE.Group {
    const hip = new THREE.Group();
    hip.position.set(x, HIP_HEIGHT, 0);
    this.root.add(hip);
    // Everything hangs BELOW the hip joint, so turning the joint swings the whole leg.
    this.add(hip, new THREE.CylinderGeometry(0.085, 0.06, 0.62, 10), cloth, 0, -0.31, 0);
    this.add(hip, new THREE.CylinderGeometry(0.065, 0.07, 0.26, 10), boot, 0, -0.75, 0);
    this.add(hip, new THREE.BoxGeometry(0.11, 0.07, 0.24), boot, 0, -0.885, 0.04);
    return hip;
  }

  private buildArm(x: number, sleeve: THREE.Material, skin: THREE.Material, metal: THREE.Material, glow: THREE.Material): Arm {
    const pivot = new THREE.Group();
    pivot.position.set(x, SHOULDER_HEIGHT, 0);
    // Turn to the side first (Y), then up or down (X): the natural order for pointing.
    pivot.rotation.order = 'YXZ';
    this.root.add(pivot);

    // The arm and gun are built pointing along +Z, so "turn the joint toward the target" aims them.
    this.add(pivot, new THREE.SphereGeometry(0.06, 10, 8), sleeve, 0, 0, 0);
    this.add(pivot, new THREE.CylinderGeometry(0.04, 0.05, ARM_LENGTH, 8).rotateX(Math.PI / 2), sleeve, 0, 0, ARM_LENGTH / 2);
    this.add(pivot, new THREE.SphereGeometry(0.05, 10, 8), skin, 0, 0, ARM_LENGTH);
    this.add(pivot, new THREE.BoxGeometry(0.05, 0.11, 0.07), metal, 0, -0.03, ARM_LENGTH + 0.01); // grip
    this.add(pivot, new THREE.BoxGeometry(0.055, 0.075, 0.3), metal, 0, 0.05, ARM_LENGTH + 0.13); // barrel
    this.add(pivot, new THREE.BoxGeometry(0.035, 0.035, 0.03), glow, 0, 0.05, ARM_LENGTH + 0.29); // glowing tip

    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.05, ARM_LENGTH + 0.31);
    pivot.add(muzzle);

    pivot.rotation.x = REST_PITCH;
    return { pivot, muzzle, yaw: 0, pitch: REST_PITCH, recoil: 0 };
  }

  // ---- Moving her ------------------------------------------------------------

  private updateArm(arm: Arm, shoulderX: number, dt: number): void {
    let wantYaw = 0;
    let wantPitch = REST_PITCH;

    if (this.hasTarget) {
      // The target as seen from her own point of view: undo her position, then undo her turn.
      const dx = this.target.x - this.root.position.x;
      const dz = this.target.z - this.root.position.z;
      const cos = Math.cos(this.yaw);
      const sin = Math.sin(this.yaw);
      const localX = dx * cos - dz * sin - shoulderX;
      const localZ = dx * sin + dz * cos;
      const localY = this.target.y - this.root.position.y - SHOULDER_HEIGHT;

      wantYaw = Math.max(-MAX_AIM_YAW, Math.min(MAX_AIM_YAW, Math.atan2(localX, localZ)));
      // Turning about X by a positive angle tips +Z DOWN, so "up" is a negative pitch.
      wantPitch = -Math.atan2(localY, Math.hypot(localX, localZ));
    }

    // Ease toward the wanted aim. (1 - e^(-rate*dt)) gives the same smooth motion at any frame rate.
    const ease = 1 - Math.exp(-AIM_RATE * dt);
    arm.yaw += (wantYaw - arm.yaw) * ease;
    arm.pitch += (wantPitch - arm.pitch) * ease;
    arm.recoil *= Math.exp(-RECOIL_RATE * dt);

    // A shot kicks the gun up and back a little.
    arm.pivot.rotation.y = arm.yaw;
    arm.pivot.rotation.x = arm.pitch - arm.recoil * 0.22;
    arm.pivot.position.z = -arm.recoil * 0.05;
  }
}

/** Make the stand-in heroine. */
export function createStandInHeroine(): HeroineBody {
  return new StandInHeroine();
}
