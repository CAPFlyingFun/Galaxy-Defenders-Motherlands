// ============================================================================
// miniMap.ts -- THE MINIMAP AND COMPASS (the story's way-finding; the prologue's passage first).
//
// Joshua, 2026-11-22: "something to tell you which way towards your objective like maybe a little compass 🧭 or mini
// map… can look at how TypeScript Beyond Extinction did it". Made after Beyond Extinction's engine/Minimap.ts (a
// "blueprint-style vector minimap": drawn in code on a small canvas, its floor plan, the player's arrow, a pulsing
// objective dot; tapped, a big view in the middle of the screen), with two changes for a phone held in one's hands:
//
//   SMALL, IT IS ALSO A COMPASS: centred on the one played and TURNED WITH THE VIEW (what is ahead on the screen is up
//            on the map), round, with an N on its rim where north is (world -Z, as in Beyond Extinction's map). The
//            objective is a pulsing gold dot when it is on the map, or a gold ARROW ON THE RIM pointing to it when it
//            is further off, so the way is always shown.
//   TAPPED, THE WHOLE MAP: north up, all of it fitted in (BE's letterbox fit), the player's arrow showing the way the
//            view looks, the objective's dot. Tapped again, small again.
//
// The things to find (the markings on the walls) are small teal dots, grey once done. Drawn about 30 times a second;
// a few lines and dots on a canvas of 96 pixels: nothing to the game's speed. Its one touch is its own (a tap).
// ============================================================================

/** The place from above: its two walls (x, z, x, z... from one end to the other). */
export interface MapShape { readonly left: readonly number[]; readonly right: readonly number[] }
/** A thing to find, and whether it is done. */
export interface MapPoint { readonly x: number; readonly z: number; readonly done: boolean }

/** The small map's reach: metres from the middle to its rim. GAME TUNING. */
const RANGE = 16;
/** Colours (Beyond Extinction's blueprint set, and the game's A.R.C.H. teal for things to find). */
const COLOUR = {
  back: 'rgba(5, 13, 20, 0.74)', frame: 'rgba(89, 191, 242, 0.9)', floor: 'rgba(204, 224, 242, 0.16)',
  wall: 'rgba(204, 224, 242, 0.75)', player: 'rgba(77, 255, 115, 1)', target: 'rgba(255, 214, 26, 1)',
  find: 'rgba(94, 232, 200, 0.95)', done: 'rgba(150, 165, 180, 0.6)', north: 'rgba(255, 120, 110, 0.95)',
} as const;

export class MiniMap {
  private readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D | null;
  private readonly hint: HTMLDivElement;
  private big = false;
  private x = 0;
  private z = 0;
  /** The way the view looks (radians, 0 = +Z, as the game's yaw). */
  private yaw = 0;
  private target: { x: number; z: number } | null = null;
  private points: readonly MapPoint[] = [];
  private time = 0;
  private sinceDrawn = 1;
  private readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number };

  constructor(host: HTMLElement, private readonly shape: MapShape) {
    this.root = document.createElement('div');
    this.root.className = 'st-map';
    this.canvas = document.createElement('canvas');
    this.root.appendChild(this.canvas);
    this.hint = document.createElement('div');
    this.hint.className = 'st-map-hint';
    this.hint.textContent = 'MAP';
    this.root.appendChild(this.hint);
    host.appendChild(this.root);
    this.g = this.canvas.getContext('2d');
    // (a tap, as the finger lands: the big view, or back)
    this.root.addEventListener('pointerdown', (event) => { event.stopPropagation(); event.preventDefault(); this.toggle(); });
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const line of [shape.left, shape.right]) {
      for (let i = 0; i < line.length; i += 2) {
        minX = Math.min(minX, line[i]); maxX = Math.max(maxX, line[i]);
        minZ = Math.min(minZ, line[i + 1]); maxZ = Math.max(maxZ, line[i + 1]);
      }
    }
    this.bounds = { minX, maxX, minZ, maxZ };
  }

  /** Where the one played stands, and the way the view looks (the game's yaw). */
  setPlayer(x: number, z: number, yaw: number): void { this.x = x; this.z = z; this.yaw = yaw; }
  /** Where the objective is (null: none). */
  setTarget(target: { x: number; z: number } | null): void { this.target = target; }
  /** The things to find. */
  setPoints(points: readonly MapPoint[]): void { this.points = points; }
  /** Shown or not (hidden while the story holds the screen black). */
  setShown(shown: boolean): void { this.root.hidden = !shown; }

  private toggle(): void {
    this.big = !this.big;
    this.root.classList.toggle('is-big', this.big);
    this.hint.textContent = this.big ? 'tap to close' : 'MAP';
    this.sinceDrawn = 1;
  }

  /** The canvas's own pixels matched to its size on screen (sharp on the phone's screen). */
  private fit(): { w: number; h: number } | null {
    const w = this.root.clientWidth, h = this.root.clientHeight;
    if (!w || !h || !this.g) return null;
    const k = Math.min(window.devicePixelRatio || 1, 2);
    if (this.canvas.width !== Math.round(w * k) || this.canvas.height !== Math.round(h * k)) {
      this.canvas.width = Math.round(w * k);
      this.canvas.height = Math.round(h * k);
    }
    this.g.setTransform(k, 0, 0, k, 0, 0);
    return { w, h };
  }

  /** Once a frame (drawn about 30 times a second). */
  render(dt: number): void {
    this.time += dt;
    this.sinceDrawn += dt;
    if (this.root.hidden || this.sinceDrawn < 1 / 30) return;
    this.sinceDrawn = 0;
    const size = this.fit();
    if (!size || !this.g) return;
    if (this.big) this.drawWhole(this.g, size.w, size.h); else this.drawNear(this.g, size.w, size.h);
  }

  /** SMALL: round, around the one played, turned with the view. */
  private drawNear(g: CanvasRenderingContext2D, w: number, h: number): void {
    const cx = w / 2, cy = h / 2, rim = Math.min(w, h) / 2 - 2;
    const k = rim / RANGE;
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    // a world place on the map: across (his right, to the right) and ahead (up)
    const mx = (x: number, z: number): number => cx + ((x - this.x) * -c + (z - this.z) * s) * k;
    const my = (x: number, z: number): number => cy - ((x - this.x) * s + (z - this.z) * c) * k;
    g.clearRect(0, 0, w, h);
    g.save();
    g.beginPath();
    g.arc(cx, cy, rim, 0, Math.PI * 2);
    g.fillStyle = COLOUR.back;
    g.fill();
    g.clip();
    this.drawShape(g, mx, my);
    this.drawPoints(g, mx, my, 2.6);
    // the objective: a pulsing dot on the map, or an arrow on the rim toward it
    if (this.target) {
      const tx = mx(this.target.x, this.target.z), ty = my(this.target.x, this.target.z);
      const away = Math.hypot(tx - cx, ty - cy);
      if (away <= rim - 6) this.dot(g, tx, ty);
      else {
        const a = Math.atan2(ty - cy, tx - cx);
        const r = rim - 7;
        this.arrowAt(g, cx + Math.cos(a) * r, cy + Math.sin(a) * r, a, 6.5, COLOUR.target);
      }
    }
    g.restore();
    // the rim, the N where north (-Z) is, and the one played in the middle, looking up
    g.beginPath();
    g.arc(cx, cy, rim, 0, Math.PI * 2);
    g.strokeStyle = COLOUR.frame;
    g.lineWidth = 2;
    g.stroke();
    const nx = cx + (0 * -c + -1 * s) * (rim - 8), ny = cy - (0 * s + -1 * c) * (rim - 8);
    g.font = '700 10px system-ui, -apple-system, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = COLOUR.north;
    g.fillText('N', nx, ny);
    this.arrowAt(g, cx, cy, -Math.PI / 2, 6, COLOUR.player);
  }

  /** TAPPED: the whole place, north up, fitted in. */
  private drawWhole(g: CanvasRenderingContext2D, w: number, h: number): void {
    const inset = 14;
    const b = this.bounds;
    const k = Math.min((w - inset * 2) / (b.maxX - b.minX || 1), (h - inset * 2 - 14) / (b.maxZ - b.minZ || 1));
    const ox = inset + ((w - inset * 2) - (b.maxX - b.minX) * k) / 2 - b.minX * k;
    const oz = inset + ((h - inset * 2 - 14) - (b.maxZ - b.minZ) * k) / 2 - b.minZ * k;
    // (north up: -Z up, so +Z down; east, +X, to the right)
    const mx = (x: number): number => ox + x * k;
    const my = (_x: number, z: number): number => oz + z * k;
    g.clearRect(0, 0, w, h);
    g.fillStyle = COLOUR.back;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = COLOUR.frame;
    g.lineWidth = 2;
    g.strokeRect(1, 1, w - 2, h - 2);
    this.drawShape(g, (x) => mx(x), my);
    this.drawPoints(g, (x) => mx(x), my, 3.5);
    if (this.target) this.dot(g, mx(this.target.x), my(this.target.x, this.target.z));
    // the one played: an arrow the way the view looks (its yaw: +Z down the map, +X right)
    this.arrowAt(g, mx(this.x), my(this.x, this.z), Math.atan2(Math.cos(this.yaw), Math.sin(this.yaw)), 7, COLOUR.player);
    g.font = '700 11px system-ui, -apple-system, sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillStyle = COLOUR.north;
    g.fillText('N ↑', 8, 7);
  }

  /** The place's floor and walls. */
  private drawShape(g: CanvasRenderingContext2D, mx: (x: number, z: number) => number, my: (x: number, z: number) => number): void {
    const { left, right } = this.shape;
    g.beginPath();
    for (let i = 0; i < left.length; i += 2) { const x = mx(left[i], left[i + 1]), y = my(left[i], left[i + 1]); if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }
    for (let i = right.length - 2; i >= 0; i -= 2) g.lineTo(mx(right[i], right[i + 1]), my(right[i], right[i + 1]));
    g.closePath();
    g.fillStyle = COLOUR.floor;
    g.fill();
    g.strokeStyle = COLOUR.wall;
    g.lineWidth = 1.5;
    g.stroke();
  }

  private drawPoints(g: CanvasRenderingContext2D, mx: (x: number, z: number) => number, my: (x: number, z: number) => number, r: number): void {
    for (const p of this.points) {
      g.beginPath();
      g.arc(mx(p.x, p.z), my(p.x, p.z), r, 0, Math.PI * 2);
      g.fillStyle = p.done ? COLOUR.done : COLOUR.find;
      g.fill();
    }
  }

  /** The objective's dot, pulsing. */
  private dot(g: CanvasRenderingContext2D, x: number, y: number): void {
    const r = 4 + 1.5 * Math.sin(this.time * 5);
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = COLOUR.target;
    g.fill();
  }

  /** An arrow head at (x, y), pointing at angle `a` (canvas radians), `r` from its middle to its tip. */
  private arrowAt(g: CanvasRenderingContext2D, x: number, y: number, a: number, r: number, colour: string): void {
    const ca = Math.cos(a), sa = Math.sin(a);
    g.beginPath();
    g.moveTo(x + ca * r, y + sa * r);
    g.lineTo(x - ca * r * 0.7 - sa * r * 0.75, y - sa * r * 0.7 + ca * r * 0.75);
    g.lineTo(x - ca * r * 0.35, y - sa * r * 0.35);
    g.lineTo(x - ca * r * 0.7 + sa * r * 0.75, y - sa * r * 0.7 - ca * r * 0.75);
    g.closePath();
    g.fillStyle = colour;
    g.fill();
  }

  dispose(): void { this.root.remove(); }
}
