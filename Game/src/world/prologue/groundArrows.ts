// ============================================================================
// groundArrows.ts -- ARROWS ON THE FLOOR, THIS WAY TO THE OBJECTIVE (the prologue first).
//
// Joshua, 2026-11-22, after playing v0.2.153: "a big one is ground arrows or something to tell you which way towards
// your objective like maybe a little compass 🧭 or mini map". Beyond Extinction's TypeScript version guides with a chip
// over the objective that turns into an arrow on the screen's edge (its engine/HudMarker.ts), a ring and an icon on the
// objective itself (ObjectiveHighlight.ts) and a minimap (Minimap.ts). In a WINDING passage an arrow straight at the
// objective points into rock at every bend, so here the arrows lie ON THE FLOOR AND FOLLOW THE PASSAGE: a few faint
// A.R.C.H.-teal chevrons a couple of metres ahead of John, the way the passage runs toward the objective (back the
// way he came if it is behind him), glowing one after another like a ripple running ahead. Within 3 m of the
// objective they are gone. (The minimap, ui/miniMap.ts, shows the same way from above.)
//
// In the story they are the A.R.C.H. field scanner's guide, projected ahead of him. Four small flat squares with one
// picture made in code: next to nothing to draw.
// ============================================================================

import * as THREE from 'three';

/** How many arrows, where the first lies (metres ahead of him along the passage) and how far apart they are. */
const ARROWS = 4;
const FIRST_AHEAD = 2.2;
const APART = 1.7;
/** How big each is (metres across). */
const SIZE = 0.6;
/** No arrows this near the objective (metres along the passage). */
const NEAR_ENOUGH = 3;

/** The passage as the arrows need it (world/prologue/tunnel.ts). */
export interface ArrowPath {
  pointAt(s: number, out: { x: number; z: number; tx: number; tz: number }): { x: number; z: number; tx: number; tz: number };
  readonly length: number;
}

/** One chevron, pointing UP the picture, white on clear with a soft glow (it is tinted teal by its material). */
function chevronPicture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d');
  if (g) {
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const draw = (width: number, alpha: number): void => {
      g.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
      g.lineWidth = width;
      g.beginPath();
      g.moveTo(26, 88);
      g.lineTo(64, 46);
      g.lineTo(102, 88);
      g.stroke();
    };
    draw(30, 0.18);   // (the glow)
    draw(18, 0.4);
    draw(10, 1);
  }
  const picture = new THREE.CanvasTexture(canvas);
  picture.colorSpace = THREE.SRGBColorSpace;
  return picture;
}

export class GroundArrows {
  readonly group = new THREE.Group();
  private readonly arrows: { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial }[] = [];
  private readonly picture = chevronPicture();
  private readonly geometry = new THREE.PlaneGeometry(SIZE, SIZE);
  private readonly spot = { x: 0, z: 0, tx: 0, tz: 1 };
  private time = 0;
  /** How much they show now, 0..1 (eased in and out). */
  private shown = 0;

  constructor(private readonly path: ArrowPath) {
    for (let k = 0; k < ARROWS; k++) {
      const material = new THREE.MeshBasicMaterial({
        map: this.picture, color: 0x5ee8c8, transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(this.geometry, material);
      // (laid flat, turned by its yaw: YXZ, so the yaw turns it about the upright after it is laid down)
      mesh.rotation.order = 'YXZ';
      mesh.rotation.x = -Math.PI / 2;
      mesh.renderOrder = 2;
      mesh.name = `ground arrow ${k}`;
      this.group.add(mesh);
      this.arrows.push({ mesh, material });
    }
  }

  /**
   * Once a frame: he is `from` metres along the passage, the objective `to` metres along it (null: none, or while the
   * story holds him still: `hide`).
   */
  update(dt: number, from: number, to: number | null, hide: boolean): void {
    this.time += dt;
    const want = to !== null && !hide && Math.abs(to - from) > NEAR_ENOUGH ? 1 : 0;
    this.shown += (want - this.shown) * (1 - Math.exp(-dt / 0.35));
    const way = to !== null && to < from ? -1 : 1;
    for (let k = 0; k < ARROWS; k++) {
      const { mesh, material } = this.arrows[k];
      const s = from + way * (FIRST_AHEAD + k * APART);
      // (none past the objective, nor past either end of the passage)
      const past = to === null || way * (to - s) < 1.2 || s < 0.5 || s > this.path.length - 0.5;
      if (past || this.shown < 0.01) { mesh.visible = false; continue; }
      mesh.visible = true;
      const p = this.path.pointAt(s, this.spot);
      mesh.position.set(p.x, 0.03, p.z);
      // (the picture's "up" laid along the way to go: see the rotation order above)
      mesh.rotation.y = Math.atan2(-p.tx * way, -p.tz * way);
      // (a ripple running ahead: each arrow brightest a moment after the one behind it)
      const wave = 0.5 + 0.5 * Math.sin((this.time * 1.8 - k * 0.32) * Math.PI * 2);
      material.opacity = this.shown * (0.22 + 0.5 * wave) * (1 - k * 0.12);
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const a of this.arrows) a.material.dispose();
    this.geometry.dispose();
    this.picture.dispose();
  }
}
