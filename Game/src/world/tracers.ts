// ============================================================================
// tracers.ts -- the glowing streak a shot leaves.
//
// A fixed POOL of streaks is made once and reused: firing takes a free one,
// and when it has flown its distance it goes back in the pool. Nothing is
// created or thrown away while playing, so long sessions stay smooth. All of
// them are one InstancedMesh (one draw call, and none at all while no shot is
// in the air).
// ============================================================================
import * as THREE from 'three';
import type { FrameInfo } from '../core/contracts';
import { PALETTE } from './config';

const POOL_SIZE = 24;
const SPEED = 170; // metres per second
const LENGTH = 7; // metres

/** One streak in the pool. */
interface Tracer {
  active: boolean;
  position: THREE.Vector3;
  direction: THREE.Vector3;
  /** Metres it may still fly. */
  left: number;
  /** Metres it has flown so far. */
  flown: number;
}

export class Tracers {
  /** Add this to the scene. */
  readonly mesh: THREE.InstancedMesh;

  private readonly pool: Tracer[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly turn = new THREE.Quaternion();
  private readonly size = new THREE.Vector3(1, 1, 1);
  private readonly hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  private readonly forward = new THREE.Vector3(0, 0, 1);
  private readonly middle = new THREE.Vector3();
  private next = 0;

  constructor() {
    // A thin bar lying along +Z.
    const geometry = new THREE.BoxGeometry(0.12, 0.12, LENGTH);
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(PALETTE.pink).lerp(new THREE.Color(PALETTE.white), 0.45),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, POOL_SIZE);
    this.mesh.frustumCulled = false; // streaks fly anywhere; the mesh is simply hidden when none are active
    this.mesh.visible = false;
    for (let i = 0; i < POOL_SIZE; i++) {
      this.pool.push({ active: false, position: new THREE.Vector3(), direction: new THREE.Vector3(), left: 0, flown: 0 });
      this.mesh.setMatrixAt(i, this.hidden);
    }
  }

  /** Send a streak from `from` toward `to`. */
  fire(from: THREE.Vector3, to: THREE.Vector3): void {
    // Take the next streak in turn; if all are flying, the oldest is reused.
    const tracer = this.pool[this.next];
    this.next = (this.next + 1) % POOL_SIZE;
    tracer.active = true;
    tracer.position.copy(from);
    tracer.direction.copy(to).sub(from);
    tracer.left = tracer.direction.length();
    tracer.flown = 0;
    tracer.direction.normalize();
  }

  update(frame: FrameInfo): void {
    let anyActive = false;
    for (let i = 0; i < POOL_SIZE; i++) {
      const tracer = this.pool[i];
      if (!tracer.active) continue;
      const step = SPEED * frame.dt;
      tracer.position.addScaledVector(tracer.direction, step);
      tracer.left -= step;
      tracer.flown += step;
      if (tracer.left <= 0) {
        tracer.active = false;
        this.mesh.setMatrixAt(i, this.hidden);
        continue;
      }
      anyActive = true;
      // Turn the bar to point along its flight; its tail trails behind its position.
      // Just after the shot the streak is only as long as the distance flown, so it
      // grows out of the gun instead of starting behind it.
      const length = Math.min(LENGTH, tracer.flown);
      this.size.z = length / LENGTH;
      this.turn.setFromUnitVectors(this.forward, tracer.direction);
      this.middle.copy(tracer.position).addScaledVector(tracer.direction, -length / 2);
      this.mesh.setMatrixAt(i, this.matrix.compose(this.middle, this.turn, this.size));
    }
    // The mesh stays visible for the one frame that hides the last streak, then switches off.
    if (anyActive || this.mesh.visible) this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.visible = anyActive;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
