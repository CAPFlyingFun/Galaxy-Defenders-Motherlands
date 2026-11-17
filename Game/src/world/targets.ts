// ============================================================================
// targets.ts -- a few placeholder targets drifting in the sky.
//
// They stand in for enemies until enemies exist: in third person the heroine
// auto-aims at whichever one is most in front of her, which shows the aiming
// working. All of them are one InstancedMesh (one draw call).
// ============================================================================
import * as THREE from 'three';
import type { FrameInfo } from '../core/contracts';
import { PALETTE } from './config';

const TARGET_COUNT = 6;
const TARGET_RADIUS = 2.2;

/** How one target circles the plaza. */
interface Orbit {
  distance: number; // metres from the plaza centre, measured along the ground
  height: number; // metres up
  speed: number; // radians per second around the plaza (negative = the other way)
  phase: number; // where on its circle it starts
  bob: number; // how far it drifts up and down
}

export class SkyTargets {
  /** Add this to the scene. */
  readonly mesh: THREE.InstancedMesh;
  readonly count = TARGET_COUNT;

  private readonly orbits: Orbit[] = [];
  private readonly positions: THREE.Vector3[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly idleColor = new THREE.Color(PALETTE.pink).multiplyScalar(0.55);
  private readonly aimedColor = new THREE.Color(PALETTE.gold);
  private aimed = -1;

  constructor() {
    const geometry = new THREE.SphereGeometry(TARGET_RADIUS, 14, 10);
    const material = new THREE.MeshBasicMaterial();
    this.mesh = new THREE.InstancedMesh(geometry, material, TARGET_COUNT);
    // They move all over the sky, so there is no small sphere to test against the view; always draw them.
    this.mesh.frustumCulled = false;

    for (let i = 0; i < TARGET_COUNT; i++) {
      this.orbits.push({
        distance: 45 + (i % 3) * 14,
        height: 38 + ((i * 7) % 5) * 9,
        speed: (i % 2 === 0 ? 1 : -1) * (0.05 + i * 0.012),
        phase: (i / TARGET_COUNT) * Math.PI * 2,
        bob: 3 + i,
      });
      this.positions.push(new THREE.Vector3());
      this.mesh.setColorAt(i, this.idleColor);
    }
  }

  /** Where target `index` is right now. The returned vector is the target's own: read it, do not change it. */
  position(index: number): THREE.Vector3 {
    return this.positions[index];
  }

  /**
   * Choose the target most directly in front of someone standing at (x, z) and
   * facing `yaw`. Returns its number.
   */
  pick(x: number, z: number, yaw: number): number {
    const faceX = Math.sin(yaw);
    const faceZ = Math.cos(yaw);
    let best = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < TARGET_COUNT; i++) {
      const dx = this.positions[i].x - x;
      const dz = this.positions[i].z - z;
      // How much of the direction to the target points the way she faces (1 = dead ahead).
      // The target she already aims at gets a small bonus so she does not flip between two.
      const score = (dx * faceX + dz * faceZ) / (Math.hypot(dx, dz) || 1) + (i === this.aimed ? 0.08 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best;
  }

  /** Light up the target being aimed at (-1 for none). */
  setAimed(index: number): void {
    if (index === this.aimed) return;
    if (this.aimed >= 0) this.mesh.setColorAt(this.aimed, this.idleColor);
    if (index >= 0) this.mesh.setColorAt(index, this.aimedColor);
    this.aimed = index;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(frame: FrameInfo): void {
    for (let i = 0; i < TARGET_COUNT; i++) {
      const orbit = this.orbits[i];
      const angle = orbit.phase + frame.elapsed * orbit.speed;
      const p = this.positions[i];
      p.set(
        Math.sin(angle) * orbit.distance,
        orbit.height + Math.sin(frame.elapsed * 0.4 + orbit.phase) * orbit.bob,
        Math.cos(angle) * orbit.distance,
      );
      this.mesh.setMatrixAt(i, this.matrix.makeTranslation(p.x, p.y, p.z));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
