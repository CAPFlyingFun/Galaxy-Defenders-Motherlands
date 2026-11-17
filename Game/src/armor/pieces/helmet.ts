// ============================================================================
// helmet.ts -- the helmet, with its visor, crest and ear discs.
//
// FRAME (slot "head", riding her head bone):
//   origin = the head joint (the top of her head-and-neck chain: inside her
//            skull, about level with her eyebrows; 8.3 cm under her crown and
//            13.4 cm above her chin on the measured body)
//   +Y up the head, +Z out through her face, +X toward her left ear.
//
// SIZE. The shell is an egg sized from her measured head: 27 mm clear of her
// skull at the sides, 28 mm above her crown, 30 mm in front of her nose,
// 24 mm behind, and closed flat 22 mm under her chin. On the measured body
// that is about 22 cm wide, 27 cm deep and 27 cm tall.
//
// HOW IT IS BUILT. One smooth closed shell, then everything else is a PATCH:
// a piece of the same egg, very slightly larger, with a shaped outline and its
// edge tucked back down to the shell. The visor is a patch in visor glass;
// the colour panels and the crest are patches in paint. So each has a crisp,
// clean outline and nothing floats. The ear discs are small turned shapes.
//
// STYLES
//   visor: 'band'  a wide wrap-round strip (Blaze)
//          'full'  a big full-face opening, wider at the brow (Coral, Nova, Tessa)
//          'vee'   wide and angular, dipping to a point between the eyes (Vela)
//          'mask'  a narrow brow slit over a tall face plate (Aurora)
//   crest: 'none' | 'stripe' one band over the top | 'twin' two bands |
//          'fin' a raised ridge | 'block' a raised square panel on the brow
//   ears:  'disc' flat discs | 'ring' a ring round a cap | 'lens' a dark glass lens
//   cheeks: side panels in the second colour (the two-tone helmets)
// ============================================================================
import * as THREE from 'three';
import { PieceBuilder, clamp, dark, grid, lerp, paint, place, revolve, smooth, visorGlass, type Finish } from '../geo';
import { deg } from '../fitShapes';
import { defaultKit, finishPiece, type ArmorKit, type PieceColors } from '../kit';

export type VisorStyle = 'band' | 'full' | 'vee' | 'mask';
export type CrestStyle = 'none' | 'stripe' | 'twin' | 'fin' | 'block';
export type EarStyle = 'disc' | 'ring' | 'lens';

export interface HelmetOptions {
  readonly visor: VisorStyle;
  readonly crest: CrestStyle;
  readonly ears: EarStyle;
  /** Side panels in the second colour. */
  readonly cheeks: boolean;
  /** 1 = as measured; a little more makes a bigger, rounder helmet. */
  readonly size?: number;
}

/** Colours: main = shell, second = cheek panels and jaw, accent = crest and ear caps, dark = trim, visor = glass. */
export function buildHelmet(o: HelmetOptions, c: PieceColors, kit: ArmorKit = defaultKit()): THREE.Mesh {
  const b = new PieceBuilder();
  const head = kit.fit.head, box = head.box;

  // ---- The egg: its middle and its reach each way, from her measured head ----
  const top = box.max[1] + 0.028, bottom = head.chinY - 0.022;
  const cy = box.max[1] - 0.105;                       // the egg's middle: about eye level
  const ryUp = top - cy, ryDown = (cy - bottom) / 0.8;  // (the lower half is cut off flat four fifths of the way down)
  const front = box.max[2] + 0.03, back = box.min[2] - 0.024;
  const cz = (front + back) / 2, rz = (front - back) / 2;
  const rx = Math.max(-box.min[0], box.max[0]) + 0.027;

  /**
   * The helmet's surface at a direction: `az` round the head (0 = face, + toward her left), `el` up (+) or down (-).
   * `s` swells it (1 = the shell itself). The dome is a little squarer than a ball above, and squarer still below
   * (so there is room for her jaw and chin), and the bottom is cut off flat.
   */
  const surf = (az: number, el: number, s: number, out: THREE.Vector3): THREE.Vector3 => {
    const p = el >= 0 ? 2.3 : 3.0;
    const ce = Math.pow(Math.abs(Math.cos(el)), 2 / p), se = Math.sign(el) * Math.pow(Math.abs(Math.sin(el)), 2 / p);
    const y = cy + (el >= 0 ? ryUp : ryDown) * se * s;
    return out.set(rx * ce * Math.sin(az) * s, Math.max(y, bottom - (s - 1) * 0.1), cz + rz * ce * Math.cos(az) * s);
  };
  const centre = new THREE.Vector3(0, cy, cz);

  // ---- The shell ----
  b.add(grid(28, 14, (u, v, out) => surf(u * Math.PI * 2, lerp(-Math.PI / 2, Math.PI / 2, v), 1, out), { closeU: true, from: centre }), paint(c.main));

  /**
   * A patch: `map` gives the direction (az, el) at (u, v) across the patch; `s` is how proud it stands. The outermost
   * ring of the patch is tucked back down onto the shell, so its edge reads as a small rounded step.
   */
  const patch = (nu: number, nv: number, map: (u: number, v: number) => readonly [number, number], s: number, finish: Finish, sFn?: (u: number, v: number) => number) => {
    b.add(grid(nu + 2, nv + 2, (gu, gv, out) => {
      const i = Math.round(gu * (nu + 2)), j = Math.round(gv * (nv + 2));
      const edge = i === 0 || j === 0 || i === nu + 2 || j === nv + 2;
      const u = clamp((i - 1) / nu, 0, 1), v = clamp((j - 1) / nv, 0, 1);
      const [az, el] = map(u, v);
      surf(az, el, edge ? 0.997 : sFn ? sFn(u, v) : s, out);
    }, { from: centre }), finish);
  };
  /** The same patch on both sides of the head. */
  const patchPair = (nu: number, nv: number, map: (u: number, v: number) => readonly [number, number], s: number, finish: Finish) => {
    patch(nu, nv, map, s, finish);
    patch(nu, nv, (u, v) => { const [az, el] = map(u, v); return [-az, el]; }, s, finish);
  };
  /** A direction given as "how far over the top from the face" (alpha) and "how far to the side" (beta). For crests. */
  const overTop = (alpha: number, beta: number): readonly [number, number] => {
    const x = Math.sin(beta), y = Math.cos(beta) * Math.sin(alpha), z = Math.cos(beta) * Math.cos(alpha);
    return [Math.atan2(x, z), Math.asin(clamp(y, -1, 1))];
  };

  // ---- Cheek panels (two-tone helmets): each side, from behind the visor round to the back ----
  if (o.cheeks) patchPair(8, 8, (u, v) => [lerp(deg(62), deg(158), u), lerp(deg(-80), deg(34) - deg(16) * u, v)], 1.012, paint(c.second));

  // ---- The visor ----
  // Glass is darker at the top and catches more colour toward the bottom, like a tinted visor under a sky.
  const glass = visorGlass(c.visor, (p, col) => col.multiplyScalar(lerp(1.5, 0.55, smooth(cy - 0.06, cy + 0.06, p.y))));
  const trim = dark(c.dark, 0.5);
  const visor = (map: (u: number, v: number) => readonly [number, number], frame: number, nu = 16, nv = 6) => {
    // (a dark frame first: the same outline, a little bigger and not quite as proud)
    patch(nu, nv, (u, v) => {
      const [az, el] = map(u, v), [a0, e0] = map(0.5, 0.5);
      return [a0 + (az - a0) * (1 + frame), e0 + (el - e0) * (1 + frame * 2.2)];
    }, 1.014, trim);
    patch(nu, nv, map, 1.026, glass);
  };
  if (o.visor === 'band') {
    visor((u, v) => { const k = 2 * u - 1; return [k * deg(100), lerp(deg(-13) - deg(4) * (1 - k * k), deg(15), v)]; }, 0.04, 20, 5);
  } else if (o.visor === 'full') {
    visor((u, v) => {
      const k = 2 * u - 1, w = lerp(deg(40), deg(66), smooth(0, 0.75, v));
      return [k * w, lerp(deg(-43), deg(30) - deg(11) * Math.abs(k) ** 3, v)];
    }, 0.06, 14, 8);
  } else if (o.visor === 'vee') {
    visor((u, v) => { const k = Math.abs(2 * u - 1); return [(2 * u - 1) * deg(84), lerp(deg(-30) + deg(18) * k, deg(9) + deg(15) * k, v)]; }, 0.05, 18, 5);
  } else {
    // 'mask': a tall face plate, and a dark brow slit over it that dips in the middle
    visor((u, v) => { const k = 2 * u - 1, w = lerp(deg(30), deg(60), smooth(0, 0.9, v)); return [k * w, lerp(deg(-50), deg(4), v)]; }, 0.06, 12, 8);
    patch(18, 3, (u, v) => { const k = Math.abs(2 * u - 1); return [(2 * u - 1) * deg(72), lerp(deg(2) + deg(8) * k, deg(13) + deg(9) * k, v)]; }, 1.034, visorGlass(0x101216));
  }

  // ---- The crest ----
  const crestPaint = paint(c.accent);
  const a0 = deg(40), a1 = deg(168);
  if (o.crest === 'stripe') {
    patch(4, 14, (u, v) => overTop(lerp(a0, a1, v), lerp(-deg(11), deg(11), u)), 1.018, crestPaint);
  } else if (o.crest === 'twin') {
    for (const side of [-1, 1]) patch(3, 14, (u, v) => overTop(lerp(a0, a1, v), side * lerp(deg(7), deg(19), u)), 1.018, crestPaint);
  } else if (o.crest === 'fin') {
    // a ridge: tallest along its middle and at the top of the head, fading out at both ends
    patch(4, 14, (u, v) => overTop(lerp(a0, a1, v), lerp(-deg(7), deg(7), u)), 1, crestPaint,
      (u, v) => 1.02 + 0.075 * (1 - (2 * u - 1) ** 2) * Math.sin(Math.PI * v) ** 0.7);
  } else if (o.crest === 'block') {
    patch(5, 5, (u, v) => overTop(lerp(deg(44), deg(82), v), lerp(-deg(17), deg(17), u)), 1.05, paint(c.main));
    patch(4, 4, (u, v) => overTop(lerp(deg(50), deg(76), v), lerp(-deg(11), deg(11), u)), 1.062, crestPaint);
  }

  // ---- A small dark breather under the visor, and the neck seal ----
  patch(6, 2, (u, v) => [lerp(-deg(20), deg(20), u), lerp(deg(-66), deg(-56), v)], 1.012, trim);
  const neckR = head.neckRadius + 0.006 + 0.008;
  b.add(revolve([[neckR + 0.012, bottom + 0.004], [neckR + 0.012, bottom - 0.012], [neckR, bottom - 0.03], [neckR - 0.008, bottom - 0.03], [neckR - 0.008, bottom + 0.004]], { seg: 20, closed: true }), dark(c.dark), place(0, 0, -0.03));

  // ---- The ear discs: turned shapes, laid on their sides over each ear ----
  const earY = cy - 0.012, earZ = cz - 0.006, earX = rx - 0.006;
  const ear = (profile: Array<[number, number]>, finish: Finish) =>
    b.addPair(revolve(profile, { seg: 18 }), finish, place(earX, earY, earZ, 0, 0, -Math.PI / 2));
  if (o.ears === 'disc') {
    ear([[0.052, 0], [0.052, 0.014], [0.044, 0.022], [0.03, 0.022]], paint(c.second));
    ear([[0.03, 0.022], [0.03, 0.028], [0.022, 0.032], [0, 0.032]], paint(c.accent));
  } else if (o.ears === 'ring') {
    ear([[0.054, 0], [0.054, 0.016], [0.046, 0.024], [0.036, 0.024], [0.036, 0.016]], dark(c.dark, 0.45));
    ear([[0.036, 0.016], [0.034, 0.02], [0.02, 0.026], [0, 0.027]], paint(c.accent));
  } else {
    ear([[0.056, 0], [0.056, 0.018], [0.048, 0.03], [0.04, 0.03], [0.04, 0.022]], dark(c.dark, 0.45));
    ear([[0.04, 0.022], [0.03, 0.03], [0.016, 0.035], [0, 0.036]], visorGlass(0x14161c));
  }

  return finishPiece(b, 'helmet', kit, 'L', o.size ?? 1);
}
