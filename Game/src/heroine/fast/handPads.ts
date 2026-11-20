// ============================================================================
// handPads.ts -- HOW THICK HER FINGERS, THUMB AND PALM ARE, MEASURED FROM HER
// OWN SKIN (Joshua, 2026-11-20: "measure out from each finger and thumb bone
// to the skin and that's the distance + 2mm it should offset from the belly
// skin... create that finger offset file for all future hand related tasks like
// the hands on the poles, or door handle").
//
// Every hand job lays her hand on something: a pole (grabBars.ts), a door's
// handle (door.ts), a clip (clipGrip.ts), her belly where the baby kicks
// (bellyTouch.ts). A finger's BONE runs down its middle; what touches is its
// SKIN. So each bone needs to know how far its skin stands off it on the side
// that touches. Before this, one guess served every finger (9 mm), the thumb
// (12 mm) and the palm (16 mm).
//
// HOW IT IS MEASURED, once when she is made, from her hand's skin posed exactly
// as she stands then (on the CPU) and her bones as they are then:
//   * each finger bone's PAD: of her skin's points carried mostly by that bone
//     and lying along it (between it and the next joint, or its tip), how far
//     they stand off the bone's line on the PALM side (the way her palm faces):
//     only the skin straight under it (its sides are thinner), the 75th in every
//     hundred (her fingernail side is not what touches);
//   * the THUMB's pads: the same, but all the way round (round a pole);
//   * the THUMB's OUTSIDE (Joshua, 2026-11-20: "find the outside side of the
//     thumb and that will be placed against the belly, all the other fingers,
//     will be at the finger pads"): as a hand lies flat on something, its thumb
//     rests on its outer edge, the side away from the index finger. Each thumb
//     bone's skin on that side: square to the bone, away from the index
//     finger's knuckle;
//   * her PALM: of the points carried by her hand bone within 2.5 cm of the
//     middle of her palm, how far they stand off it the way her palm faces;
//   * her two hands are a PAIR: each finger takes the mean of itself and its
//     twin on her other hand (the file's two hands are not cut quite alike).
// All in metres. fingerTouch.ts takes these instead of the old guesses: a finger
// (or thumb, or palm) closes until its SKIN is the job's gap from what it
// touches (0 on a pole: resting on it; 2 mm on her belly).
//
// MEASURED ON BLAZE (2026-11-20, the same on the pink two-piece and the
// catsuit: her hands are bare in both), millimetres from the bone's line to its
// skin on the touching side, knuckle bone / middle / tip:
//   thumb   16.2 / 15.0 / (12: too few points of its own, the old guess)
//   index    7.4 /  6.1 / 6.3      middle  10.4 / 6.0 / 7.5
//   ring    11.3 /  7.2 / 5.5      little  10.9 / 8.0 / 6.9
//   palm    15.3
//   thumb's OUTSIDE 14.4 / 7.9 / 9.0
// The browser's console prints them as "[hand pads]" each time she is made (a
// look with gloves would measure thicker by itself).
// ============================================================================
import * as THREE from 'three';

/** One hand's pads: for each of its fingers (in `motion.fingers` order), each bone's pad; and its palm's. */
export interface HandPads {
  /** pad[i][k]: finger i's bone k, metres from the bone's line to its skin on the touching side. */
  readonly pad: number[][];
  /** Each hand's palm, metres from the middle of the palm (the hand bone's palm point) to its skin: [left, right]. */
  readonly palm: [number, number];
  /** side[i][k]: a THUMB's bone k, metres from the bone's line to its skin on its OUTSIDE (away from the index finger); null for the other fingers. */
  readonly side: (number[] | null)[];
}

/** The way a thumb bone's OUTSIDE faces (into `out`): square to the bone `along`, away from `index` (its index finger's knuckle). */
export function thumbOutside(from: THREE.Vector3, along: THREE.Vector3, index: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  out.copy(from).sub(index);
  out.addScaledVector(along, -out.dot(along));
  return out.lengthSq() > 1e-10 ? out.normalize() : out.set(0, 0, 0);
}

/** What a hand uses if her skin cannot be read (the old guesses, close to Blaze's measured numbers above). */
export const PAD_FALLBACK = { finger: 0.009, thumb: 0.012, palm: 0.016, thumbSide: 0.009 } as const;

/** What measuring needs from her body. */
export interface PadInput {
  /** Her skin, as she stands now (its own points, skinned on the CPU, are read: three.js getVertexPosition). */
  readonly skin: THREE.SkinnedMesh;
  /** Her fingers: which hand, whether the thumb, its bones from the knuckle out, its tip. */
  readonly fingers: readonly { hand: number; thumb: boolean; bones: readonly THREE.Bone[]; tip: THREE.Bone }[];
  /** Her two hand bones, left then right. */
  readonly hands: readonly [THREE.Bone, THREE.Bone];
  /** Each hand's palm: its middle (a point) and the way it faces (a direction), in the WORLD as she stands now. */
  palmOf(hand: 0 | 1): { point: THREE.Vector3; out: THREE.Vector3; across: THREE.Vector3 };
  /** Straighten every finger (her own pose puts them back next frame): each finger's palm side is then her palm's. */
  straighten(): void;
}

/** The 75th in every hundred of a list (0 if it is empty): the skin's surface, not its odd outlying point. */
function high(values: number[]): number {
  if (values.length === 0) return 0;
  values.sort((a, b) => a - b);
  return values[Math.min(values.length - 1, Math.floor(values.length * 0.75))];
}

/**
 * MEASURE HER HAND PADS (see the header), in the WORLD as she stands now: her hand's skin posed on the CPU exactly as
 * her bones have it (reading her file's points as made, they sat up to a centimetre off her finger bones near the tips).
 * Falls back to `PAD_FALLBACK` for any bone with too few points of its own.
 */
export function measureHandPads(input: PadInput): HandPads {
  const { skin } = input;
  // (her palms first: finding which way a palm faces curls her fingers for a moment; then her fingers straight, and her
  //  skin posed on them, so each finger bone's palm side is her palm's own facing)
  const palmNow = ([0, 1] as const).map((h) => input.palmOf(h));
  input.straighten();
  skin.updateMatrixWorld(true);
  skin.skeleton.update();
  const bones = skin.skeleton.bones;
  const index = skin.geometry.getAttribute('skinIndex'), weight = skin.geometry.getAttribute('skinWeight');
  // her hand bones and every finger bone: only their skin is posed (a few thousand points, not all of her)
  const wanted = new Set<number>();
  for (const h of input.hands) wanted.add(bones.indexOf(h));
  for (const f of input.fingers) for (const b of f.bones) wanted.add(bones.indexOf(b));
  const carried = new Map<number, THREE.Vector3[]>();
  for (let i = 0; i < index.count; i++) {
    let top = 0, most = weight.getX(i);
    for (let j = 1; j < 4; j++) { const w = weight.getComponent(i, j); if (w > most) { most = w; top = j; } }
    const bone = index.getComponent(i, top);
    if (!wanted.has(bone)) continue;
    let list = carried.get(bone);
    if (!list) carried.set(bone, (list = []));
    list.push(skin.localToWorld(skin.getVertexPosition(i, new THREE.Vector3())));
  }
  const at = (b: THREE.Object3D): THREE.Vector3 => b.getWorldPosition(new THREE.Vector3());
  // (each thumb's index finger: the finger of its hand whose knuckle is nearest the thumb's base)
  const indexKnuckle = (thumb: typeof input.fingers[number]): THREE.Vector3 => {
    const base = at(thumb.bones[0]);
    let best = base.clone().add(new THREE.Vector3(1, 0, 0)), nearest = Infinity;
    for (const f of input.fingers) {
      if (f.thumb || f.hand !== thumb.hand) continue;
      const k = at(f.bones[0]), d = k.distanceTo(base);
      if (d < nearest) { nearest = d; best = k; }
    }
    return best;
  };
  const side = input.fingers.map((finger) => !finger.thumb ? null : finger.bones.map((bone, k) => {
    const from = at(bone), to = at(k + 1 < finger.bones.length ? finger.bones[k + 1] : finger.tip);
    const along = to.clone().sub(from), length = along.length();
    if (length < 1e-5) return PAD_FALLBACK.thumbSide;
    along.multiplyScalar(1 / length);
    const outside = thumbOutside(from, along, indexKnuckle(finger), new THREE.Vector3());
    const found: number[] = [];
    for (const q of carried.get(bones.indexOf(bone)) ?? []) {
      const rel = q.clone().sub(from), t = rel.dot(along);
      if (t < -0.008 || t > length + 0.025) continue;
      const off = rel.addScaledVector(along, -t);
      if (off.length() > 0.025) continue;
      const d = off.dot(outside), round = Math.sqrt(Math.max(0, off.lengthSq() - d * d));
      if (d > 0 && round < 0.6 * d) found.push(d);
    }
    const measured = high(found);
    return found.length >= 4 && measured > 0.002 && measured < 0.03 ? measured : PAD_FALLBACK.thumbSide;
  }));
  const pad = input.fingers.map((finger) => finger.bones.map((bone, k) => {
    const from = at(bone), to = at(k + 1 < finger.bones.length ? finger.bones[k + 1] : finger.tip);
    const along = to.clone().sub(from), length = along.length();
    if (length < 1e-5) return finger.thumb ? PAD_FALLBACK.thumb : PAD_FALLBACK.finger;
    along.multiplyScalar(1 / length);
    // THE PAD SIDE OF THIS BONE: square to it, in the plane her finger curls in (about the line across her hand), on
    // the side her palm faces at the knuckle. (A finger at rest is curled a little more at each joint, so the last bone
    // can point almost the way her palm faces: one facing for every bone found its pad side at the knuckle only.)
    const palmHere = palmNow[finger.hand === 0 ? 0 : 1];
    const knuckleWay = at(finger.bones[1] ?? finger.tip).sub(at(finger.bones[0])).normalize();
    const sign = Math.sign(new THREE.Vector3().crossVectors(knuckleWay, palmHere.across).dot(palmHere.out)) || 1;
    const facing = new THREE.Vector3().crossVectors(along, palmHere.across).multiplyScalar(sign).normalize();
    const found: number[] = [];
    for (const q of carried.get(bones.indexOf(bone)) ?? []) {
      const rel = q.clone().sub(from), t = rel.dot(along);
      // (a bone's skin lies about its own joint and on toward the next; the last bone's on past its tip bone to the
      //  end of her finger)
      if (t < -0.008 || t > length + 0.025) continue;
      const off = rel.addScaledVector(along, -t);
      if (off.length() > 0.025) continue;   // (another finger's, or her palm's, carried a little by this bone)
      if (finger.thumb) { found.push(off.length()); continue; }
      // (a finger: only the skin straight under the bone on its palm side: further round to its sides it is thinner)
      const d = off.dot(facing), side = Math.sqrt(Math.max(0, off.lengthSq() - d * d));
      if (d > 0 && side < 0.6 * d) found.push(d);
    }
    const measured = high(found);
    return found.length >= 4 && measured > 0.002 && measured < 0.03 ? measured : finger.thumb ? PAD_FALLBACK.thumb : PAD_FALLBACK.finger;
  }));
  // HER HANDS ARE A PAIR: each finger's bones the mean of hers and its twin's on her other hand
  const twin = (i: number): number => {
    const f = input.fingers[i], mine = input.fingers.filter((g) => g.hand === f.hand), theirs = input.fingers.filter((g) => g.hand !== f.hand);
    const k = mine.indexOf(f);
    return k >= 0 && k < theirs.length && theirs[k].thumb === f.thumb ? input.fingers.indexOf(theirs[k]) : -1;
  };
  const paired = pad.map((bonesPad, i) => { const j = twin(i); return j < 0 ? bonesPad : bonesPad.map((v, k) => (pad[j][k] !== undefined ? (v + pad[j][k]) / 2 : v)); });
  const sidePaired = side.map((bonesSide, i) => { const j = twin(i), them = j < 0 ? null : side[j]; return !bonesSide || !them ? bonesSide : bonesSide.map((v, k) => (them[k] !== undefined ? (v + them[k]) / 2 : v)); });
  const palm = ([0, 1] as const).map((h) => {
    const { point, out } = palmNow[h], found: number[] = [];
    for (const q of carried.get(bones.indexOf(input.hands[h])) ?? []) {
      const rel = q.clone().sub(point), d = rel.dot(out);
      if (d > 0 && rel.addScaledVector(out, -d).length() < 0.025) found.push(d);
    }
    const measured = high(found);
    return found.length >= 6 && measured > 0.004 && measured < 0.04 ? measured : PAD_FALLBACK.palm;
  }) as [number, number];
  const both = (palm[0] + palm[1]) / 2;
  return { pad: paired, palm: [both, both], side: sidePaired };
}
