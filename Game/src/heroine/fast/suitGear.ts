// ============================================================================
// suitGear.ts -- THE SUIT'S 3D PIECES, made to fit HER: tall flat combat
// boots, wrist cuffs and shoulder plates (Joshua, 2026-11-18: his outfit design
// 2, the gray and red suit, docs/reference/outfits/02-catsuit-gray-red.png;
// "just make tall flat combat style boots").
//
// HOW A PIECE IS FITTED. Every piece rides ONE bone (her shin, her foot, her
// forearm, her upper arm) as a rigid shell, so it moves exactly as that part
// of her moves. It is shaped round HER OWN SKIN, measured when she is made:
//
//   1. Her skin's points are posed as she stands (the same sums the graphics
//      card does to bend her skin with her bones: "skinning"), and the points
//      that bone carries most are kept.
//   2. Round the bone's line, in slices along it and in angles round it, the
//      FURTHEST point out is found: her outline there.
//   3. The shell is built that far out plus a small gap, with a wall of its
//      own thickness, smoothed so it does not copy every bump.
//
// So the boots are her calves' and feet's shape and size, the cuffs her
// wrists', and they would fit another heroine's body just as well.
//
// A FOOT IS NOT ROUND, so the boot's foot is built differently: in slices from
// her heel to her toes, each slice a rounded box as wide as her foot there and
// as tall as her instep, down to a flat sole just under her own sole.
//
// What each piece looks like (colours, bands, glowing strips) comes from a
// `SuitGearStyle` (looks/gear.ts) so another outfit can reuse the fitting.
//
// Nothing here runs per frame: the pieces are children of her bones.
// ============================================================================
import * as THREE from 'three';
import type { Hand } from '../../core/contracts';

/** The colours and choices of one outfit's pieces (looks/gear.ts). */
export interface SuitGearStyle {
  /** The main plate colour, the darker trim, the accent (red), the sole, and the glowing strips. */
  readonly plate: string;
  readonly trim: string;
  readonly accent: string;
  readonly sole: string;
  /** The glowing strips' colour; empty: no glowing strips. */
  readonly glow: string;
  /** Which pieces: tall boots, wrist cuffs, shoulder plates. */
  readonly boots: boolean;
  readonly cuffs: boolean;
  readonly shoulders: boolean;
  /**
   * LOOK 2's SET (Joshua's Anime Space Heroine, 2026-11-20; looks/spaceHeroine.ts): 'anime' draws the same fitted pieces
   * its way -- white boots up to her knees with gold piping, navy toes and SMALL HEELS; long white bracers with a navy
   * band; navy shoulder plates edged gold -- with `plate` its white, `trim` its navy and `accent` its gold. Left out:
   * the combat set (the gray and red suit, the catsuit).
   */
  readonly design?: 'combat' | 'anime';
  /** More pieces: navy knee caps, a collar up her neck, fingerless gloves (each in `trim`, edged in `accent`). */
  readonly knees?: boolean;
  readonly collar?: boolean;
  readonly gloves?: boolean;
  /**
   * LOOK 2's HIP PANELS (Joshua, 2026-11-19: "that white cape around her hips could be a solid shell, but clamp to the
   * hips and the hips while moving should make it look natural"; mid-thigh, open in front): stiff panels in `plate`
   * edged in `accent`, lined in this colour, hinged at the belt and swung by her thighs. Left out: none.
   */
  readonly hipPanelLining?: string;
  /**
   * Where the hip panels hang from: their tops' height over her hip joints at her sides and behind (metres). The
   * look's own belt line, so the panels' tops go up over the lower half of the belt and hang from it (Joshua,
   * 2026-11-20: "make the side panels look like they are connected to the belt, they look like they are floating").
   * Left out: just under where a belt would be.
   */
  readonly hipPanelTop?: readonly [number, number];
  /** How high the boots come: their top as a share of the way down her shin (0 her knee). Left out: `SUIT_GEAR.bootTop`. */
  readonly bootTop?: number;
}

/** GAME TUNING: sizes of the pieces (metres) and where on each bone they sit (shares of the bone's length). */
export const SUIT_GEAR = Object.freeze({
  /** Slices along a piece and angles round it, when it is measured and built. */
  slices: 18,
  around: 28,
  /** Clear of her skin, and the wall's thickness, for the boot's shaft, the cuffs and the shoulder plates. */
  bootGap: 0.005, bootWall: 0.006,
  cuffGap: 0.004, cuffWall: 0.009,
  shoulderGap: 0.007, shoulderWall: 0.007,
  /** The boot's shaft: from this share of her shin down from her knee, to a little past her ankle. */
  bootTop: 0.24, bootBottom: 1.06,
  /** The red band at the top of the shaft, and the glowing ring under it (shares of her shin). */
  bootBand: 0.1, bootGlowAt: 0.36, glowHalf: 0.004, glowOut: 0.0015,
  /** The boot's foot: how far its collar rises over her ankle joint, its sole's thickness, its toe's length past her toes. */
  collarUp: 0.06, sole: 0.012, toePast: 0.012, footGap: 0.005, footWall: 0.005,
  /** The cuffs: from this share of her forearm to this (her wrist is 1). */
  cuffFrom: 0.7, cuffTo: 0.97,
  /** The shoulder plate: from this share of her upper arm (above her shoulder joint: minus) to this, and how far round. */
  shoulderFrom: -0.12, shoulderTo: 0.3, shoulderHalfAngle: 95,
  /** LOOK 2 ('anime'): the boots come up to just under her knee (her knee caps over the top); the bracers run from this
   *  share of her forearm to her wrist; the shoulder plates are a little longer. */
  animeBootTop: 0.03, bracerFrom: 0.4, animeShoulderTo: 0.36,
  /** Small heels: the boot's sole is lifted this much under her arch (metres), so its heel stands as a heel. */
  archLift: 0.013,
  /** The knee caps, round the front of her knee: from this share of her shin above her knee joint to this below it, and how far round. */
  kneeFrom: -0.1, kneeTo: 0.09, kneeHalfAngle: 62, kneeGap: 0.004, kneeWall: 0.008,
  /** The collar: from the base of her neck up this share of the way to her skull; its gap and wall. */
  collarTo: 0.62, collarGap: 0.003, collarWall: 0.005,
  /** The gloves: over the back and palm of her hand, from her wrist to just short of her knuckles. */
  gloveTo: 0.85, gloveGap: 0.0018, gloveWall: 0.0025,
  /**
   * THE HIP PANELS: where they hang from, above her hip joints (metres; at her sides, and behind), and how far below her
   * hip joints they reach (mid-thigh); how far round her each one runs (degrees from her front: 0 front, 90 her side,
   * 180 her back; two each side, open in front); clear of her skin, and how much they flare out as they go down (metres
   * out per metre down); the shell's thickness.
   */
  panelTop: { side: 0.0, back: 0.055 }, panelDown: 0.25,
  // (one each side, about a quarter of her round, from her side to near her back's middle: Joshua, 2026-11-20, of his
  //  reference, "only has one per side that covers about 1/4 of her body on each side... 4 panels is too much")
  // (from behind her holster, on the outside of her thigh, round to near her back's middle: Joshua, 2026-11-20, "the
  //  gun holsters clipping through the white panels")
  panels: [[106, 178]] as readonly (readonly [number, number])[],
  // (clear of her skin at their top by a little more than the belt stands out, so the top hem lies OVER the belt's lower
  //  half, against it, and is clamped on by gold studs; they flare out from there as they go down)
  panelGap: 0.0105, panelFlare: 0.2, panelThick: 0.0035,
  /** The gold hem along each panel's top (how many of its 12 rows), and the studs on it: how many, their size (metres). */
  panelHemRows: 1, panelStuds: 4, panelStud: 0.007,
  /**
   * HOW THE PANELS SWING (radians of panel per radian her thigh swings from where it stood): a side panel is pushed out
   * by her thigh swinging either way and by her leg going out to her side; a back panel by her thigh going back (and a
   * little forward, the cloth pulled with her). Eased toward it, so they sway after her rather than snap.
   */
  sideSwing: 0.35, sideSpread: 0.9, backSwing: 0.95, backForward: 0.15, swingEase: 9, swingMost: 0.9,
});

/** What the pieces are fitted from. */
export interface SuitGearSource {
  readonly skin: THREE.SkinnedMesh;
  /** Her skin's points as shaped now (her mesh's own units), and which four bones move each one, and how much. */
  readonly points: Float32Array;
  readonly skinIndex: ArrayLike<number>;
  readonly skinWeight: ArrayLike<number>;
  /** Her root (facing +Z as she stands), and which side is her left (+1: +x). */
  readonly root: THREE.Object3D;
  readonly leftSign: number;
  /** Each side's bones: upper arm, forearm, hand; thigh, shin, foot. */
  readonly arm: Record<Hand, { readonly upper: THREE.Bone; readonly fore: THREE.Bone; readonly hand: THREE.Bone }>;
  readonly leg: Record<Hand, { readonly thigh: THREE.Bone; readonly shin: THREE.Bone; readonly foot: THREE.Bone }>;
  /** The base of her neck and the bone of her skull above it (for a collar). */
  readonly neck?: { readonly neck: THREE.Bone; readonly skull: THREE.Bone };
}

export interface SuitGear {
  /** Every piece (already on her bones). */
  readonly meshes: readonly THREE.Object3D[];
  /** Once a frame, after she is posed: the hip panels swing with her thighs (nothing to do without them). */
  update(dt: number): void;
  dispose(): void;
}

const v = new THREE.Vector3(), w = new THREE.Vector3();

/** One piece's surface colour at a place on it: `t` along it (0..1), `angle` round it (degrees, 0 her front). */
type Paint = (t: number, angle: number) => THREE.Color;

/**
 * Build an outfit's pieces on her. She must be standing (her bones in her stand pose) when this is called.
 */
export function buildSuitGear(src: SuitGearSource, style: SuitGearStyle): SuitGear {
  const { skin, points, skinIndex, skinWeight, root } = src;
  const bones = skin.skeleton.bones;
  root.updateMatrixWorld(true);
  skin.updateMatrixWorld(true);
  skin.skeleton.update();

  // ---- 1. her skin's points as she stands, in the world, each with the bone that carries it most ------------------
  const count = points.length / 3;
  const posed = new Float32Array(count * 3);
  const strongest = new Int32Array(count);
  {
    const boneMatrices = bones.map((b, k) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, skin.skeleton.boneInverses[k]));
    const bind = skin.bindMatrix, toWorld = new THREE.Matrix4().copy(skin.matrixWorld).multiply(skin.bindMatrixInverse);
    const p = new THREE.Vector3(), sum = new THREE.Vector3(), part = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      p.fromArray(points, i * 3).applyMatrix4(bind);
      sum.set(0, 0, 0);
      let best = -1, most = -1;
      for (let c = 0; c < 4; c++) {
        const wt = skinWeight[i * 4 + c];
        if (wt <= 0) continue;
        const k = skinIndex[i * 4 + c];
        sum.addScaledVector(part.copy(p).applyMatrix4(boneMatrices[k]), wt);
        if (wt > most) { most = wt; best = k; }
      }
      sum.applyMatrix4(toWorld);
      posed[i * 3] = sum.x; posed[i * 3 + 1] = sum.y; posed[i * 3 + 2] = sum.z;
      strongest[i] = best;
    }
  }
  /** The points carried most by one of these bones (or anything hanging from them, with `below`), in that bone's space. */
  const pointsOn = (bone: THREE.Bone, below: boolean): THREE.Vector3[] => {
    const set = new Set<number>([bones.indexOf(bone)]);
    if (below) bone.traverse((n) => { const k = bones.indexOf(n as THREE.Bone); if (k >= 0) set.add(k); });
    const toBone = new THREE.Matrix4().copy(bone.matrixWorld).invert();
    const out: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) if (set.has(strongest[i])) out.push(new THREE.Vector3(posed[i * 3], posed[i * 3 + 1], posed[i * 3 + 2]).applyMatrix4(toBone));
    return out;
  };
  /** A direction in the world (her root's frame) as a direction in a bone's own space. */
  const dirIn = (bone: THREE.Bone, x: number, y: number, z: number): THREE.Vector3 => {
    const q = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
    return new THREE.Vector3(x, y, z).transformDirection(root.matrixWorld).applyQuaternion(q).normalize();
  };
  /** Where a bone's child joint is, in the bone's own space (its line runs from 0 to here). */
  const childAt = (bone: THREE.Bone, child: THREE.Bone): THREE.Vector3 => bone.worldToLocal(child.getWorldPosition(new THREE.Vector3()));

  // ---- the materials: one for the plates (each point its own colour), one for the glowing strips ---------------------
  const plateMaterial = new THREE.MeshStandardMaterial({ name: 'suit-gear', vertexColors: true, roughness: 0.42, metalness: 0.25 });
  const glowColour = new THREE.Color(style.glow || '#000000');
  // (the hip panels: both faces drawn, their own colours, a satin shine)
  const panelMaterial = new THREE.MeshStandardMaterial({ name: 'suit-gear-panels', vertexColors: true, roughness: 0.45, metalness: 0.05, side: THREE.DoubleSide });
  const glowMaterial = new THREE.MeshStandardMaterial({ name: 'suit-gear-glow', color: glowColour, emissive: glowColour, emissiveIntensity: 1.6, roughness: 0.4 });
  const C = { plate: new THREE.Color(style.plate), trim: new THREE.Color(style.trim), accent: new THREE.Color(style.accent), sole: new THREE.Color(style.sole) };
  const meshes: THREE.Object3D[] = [];
  const add = (bone: THREE.Bone, geometry: THREE.BufferGeometry, material: THREE.Material, name: string): void => {
    if (material === glowMaterial && !style.glow) { geometry.dispose(); return; }   // (an outfit with no glowing strips)
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.frustumCulled = false;   // (it rides a bone that moves: its own box would be wrong)
    bone.add(mesh);
    meshes.push(mesh);
  };

  const anime = style.design === 'anime';

  // ---- LOOK 2's COLLAR: up her neck from its base, navy with a gold top edge ----------------------------------------
  if (style.collar && src.neck) {
    const { neck, skull } = src.neck;
    const profile = measureRound(pointsOn(neck, false), childAt(neck, skull), dirIn(neck, 0, 0, 1), dirIn(neck, 1, 0, 0), -0.05, SUIT_GEAR.collarTo);
    const paint: Paint = (t) => (t > 0.9 ? C.accent : C.trim);
    add(neck, roundShell(profile, SUIT_GEAR.collarGap, SUIT_GEAR.collarWall, paint, 360), plateMaterial, 'collar');
  }

  for (const hand of ['left', 'right'] as const) {
    const side = hand === 'left' ? src.leftSign : -src.leftSign;   // her left or right, as +x or -x of her root
    const arm = src.arm[hand], leg = src.leg[hand];

    // ---- THE BOOT'S SHAFT: round her shin, from under her knee to past her ankle --------------------------------
    if (style.boots) {
      const line = childAt(leg.shin, leg.foot);
      const front = dirIn(leg.shin, 0, 0, 1), outward = dirIn(leg.shin, side, 0, 0);
      const top = style.bootTop ?? (anime ? SUIT_GEAR.animeBootTop : SUIT_GEAR.bootTop);
      const profile = measureRound(pointsOn(leg.shin, false), line, front, outward, top, SUIT_GEAR.bootBottom);
      const combatPaint: Paint = (t, angle) => {
        const share = SUIT_GEAR.bootTop + (SUIT_GEAR.bootBottom - SUIT_GEAR.bootTop) * t;
        if (share < SUIT_GEAR.bootTop + SUIT_GEAR.bootBand) return C.accent;                 // the red band at the top
        if (Math.abs(angle) < 16 && share < 0.78) return C.accent;                          // a red stripe down her shin's front
        if (Math.abs(Math.abs(angle) - 180) < 40) return C.trim;                            // the darker back
        return C.plate;
      };
      // (Look 2: white, a gold edge at the top, two gold pipings down the front of her shin that part toward her ankle)
      const animePaint: Paint = (t, angle) => {
        const a = Math.abs(angle), piping = 26 + 18 * t;
        if (t < 0.025) return C.accent;
        if (Math.abs(a - piping) < 2.6) return C.accent;
        return C.plate;
      };
      const paint = anime ? animePaint : combatPaint;
      add(leg.shin, roundShell(profile, SUIT_GEAR.bootGap, SUIT_GEAR.bootWall, paint, 360), plateMaterial, `boot-shaft-${hand}`);
      // the glowing ring round the shaft under its red band
      const glowT = (SUIT_GEAR.bootGlowAt - SUIT_GEAR.bootTop) / (SUIT_GEAR.bootBottom - SUIT_GEAR.bootTop);
      add(leg.shin, glowRing(profile, glowT, SUIT_GEAR.bootGap + SUIT_GEAR.bootWall + SUIT_GEAR.glowOut, SUIT_GEAR.glowHalf / Math.max(1e-3, profile.length)), glowMaterial, `boot-glow-${hand}`);

      // ---- THE BOOT'S FOOT: her foot and toes, down to a flat sole, with a collar up round her ankle ----------
      add(leg.foot, footShell(pointsOn(leg.foot, true), dirIn(leg.foot, 0, 0, 1), dirIn(leg.foot, 0, 1, 0), dirIn(leg.foot, side, 0, 0), C, anime), plateMaterial, `boot-foot-${hand}`);
    }

    // ---- LOOK 2's KNEE CAP: round the front of her knee, on her shin, navy edged gold ------------------------------
    if (style.knees) {
      const line = childAt(leg.shin, leg.foot);
      const profile = measureRound(pointsOn(leg.shin, false), line, dirIn(leg.shin, 0, 0, 1), dirIn(leg.shin, side, 0, 0), SUIT_GEAR.kneeFrom, SUIT_GEAR.kneeTo, SUIT_GEAR.kneeHalfAngle);
      const paint: Paint = (t, angle) => (t < 0.07 || t > 0.93 || Math.abs(angle) > SUIT_GEAR.kneeHalfAngle - 9 ? C.accent : C.trim);
      add(leg.shin, roundShell(profile, SUIT_GEAR.kneeGap, SUIT_GEAR.kneeWall, paint, SUIT_GEAR.kneeHalfAngle * 2), plateMaterial, `knee-${hand}`);
    }

    // ---- LOOK 2's FINGERLESS GLOVE: round her palm and the back of her hand, from her wrist to short of her knuckles
    if (style.gloves) {
      // (her hand's line: from her wrist to the middle of her fingers' roots, its child bones)
      const roots = new THREE.Vector3();
      let n = 0;
      for (const c of arm.hand.children) if ((c as THREE.Bone).isBone) { roots.add(arm.hand.worldToLocal((c as THREE.Bone).getWorldPosition(new THREE.Vector3()))); n++; }
      if (n > 0) {
        roots.multiplyScalar(1 / n);
        const profile = measureRound(pointsOn(arm.hand, false), roots, dirIn(arm.hand, 0, 1, 0), dirIn(arm.hand, side, 0, 0), -0.05, SUIT_GEAR.gloveTo);
        const paint: Paint = (t) => (t < 0.12 ? C.accent : C.trim);
        add(arm.hand, roundShell(profile, SUIT_GEAR.gloveGap, SUIT_GEAR.gloveWall, paint, 360), plateMaterial, `glove-${hand}`);
      }
    }

    // ---- THE WRIST CUFF: round her forearm, by her wrist ------------------------------------------------------------
    if (style.cuffs) {
      const line = childAt(arm.fore, arm.hand);
      const front = dirIn(arm.fore, 0, 0, 1), outward = dirIn(arm.fore, side, 0, 0);
      const profile = measureRound(pointsOn(arm.fore, false), line, front, outward, anime ? SUIT_GEAR.bracerFrom : SUIT_GEAR.cuffFrom, SUIT_GEAR.cuffTo);
      // (Look 2's long bracer: white, gold at both ends, a navy band with gold edges round its middle)
      const paint: Paint = anime
        ? (t) => (t < 0.05 || t > 0.95 || Math.abs(t - 0.42) < 0.11 && Math.abs(t - 0.42) > 0.085 ? C.accent : Math.abs(t - 0.42) < 0.085 ? C.trim : C.plate)
        : (t) => (t < 0.12 || t > 0.88 ? C.plate : C.trim);
      add(arm.fore, roundShell(profile, SUIT_GEAR.cuffGap, SUIT_GEAR.cuffWall, paint, 360), plateMaterial, `cuff-${hand}`);
      // a glowing slot on its outer side
      add(arm.fore, glowPatch(profile, 0.5, 90, 0.3, 22, SUIT_GEAR.cuffGap + SUIT_GEAR.cuffWall + SUIT_GEAR.glowOut), glowMaterial, `cuff-glow-${hand}`);
    }

    // ---- THE SHOULDER PLATE: over the top and outside of her shoulder ---------------------------------------------
    if (style.shoulders) {
      const line = childAt(arm.upper, arm.fore);
      // (round her upper arm, "front" is straight UP: the plate is centred over the top of her shoulder, leaning out)
      const up = dirIn(arm.upper, side * 0.45, 1, 0), outward = dirIn(arm.upper, 0, 0, -1);
      const profile = measureRound(pointsOn(arm.upper, false), line, up, outward, SUIT_GEAR.shoulderFrom, anime ? SUIT_GEAR.animeShoulderTo : SUIT_GEAR.shoulderTo, SUIT_GEAR.shoulderHalfAngle);
      // (Look 2's: navy, a thin gold edge all round)
      const paint: Paint = anime
        ? (t, angle) => (Math.abs(angle) > SUIT_GEAR.shoulderHalfAngle - 8 || t > 0.93 || t < 0.05 ? C.accent : C.trim)
        : (t, angle) => (Math.abs(angle) > SUIT_GEAR.shoulderHalfAngle - 16 || t > 0.86 ? C.accent : C.plate);
      add(arm.upper, roundShell(profile, SUIT_GEAR.shoulderGap, SUIT_GEAR.shoulderWall, paint, SUIT_GEAR.shoulderHalfAngle * 2), plateMaterial, `shoulder-${hand}`);
      add(arm.upper, glowPatch(profile, 0.5, 0, 0.55, 5, SUIT_GEAR.shoulderGap + SUIT_GEAR.shoulderWall + SUIT_GEAR.glowOut), glowMaterial, `shoulder-glow-${hand}`);
    }
  }

  // ---- LOOK 2's HIP PANELS ------------------------------------------------------------------------------------------
  const swingers: { pivot: THREE.Object3D; axis: THREE.Vector3; side: Hand; back: boolean; now: number }[] = [];
  const legRest: Record<Hand, { pitch: number; spread: number }> = { left: { pitch: 0, spread: 0 }, right: { pitch: 0, spread: 0 } };
  const carrier = src.leg.left.thigh.parent as THREE.Bone | null;
  const legLine = (hand: Hand): { pitch: number; spread: number } => {
    // her thigh's line (hip joint to knee) in her root's frame: how far it swings forward and out to her side
    const sideOut = hand === 'left' ? src.leftSign : -src.leftSign;
    const a = src.leg[hand].thigh.getWorldPosition(v), b = src.leg[hand].shin.getWorldPosition(w);
    const d = b.sub(a).transformDirection(rootInverse);
    return { pitch: Math.atan2(d.z, -d.y), spread: Math.atan2(d.x * sideOut, -d.y) };
  };
  const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  if (style.hipPanelLining && carrier && carrier.isBone) {
    const T = SUIT_GEAR;
    const lining = new THREE.Color(style.hipPanelLining);
    // her hip joints, in her root's frame: the panels hang round the point between them
    const hipL = src.leg.left.thigh.getWorldPosition(new THREE.Vector3()).applyMatrix4(rootInverse);
    const hipR = src.leg.right.thigh.getWorldPosition(new THREE.Vector3()).applyMatrix4(rootInverse);
    const centre = hipL.clone().add(hipR).multiplyScalar(0.5);
    const [hangSide, hangBack] = style.hipPanelTop ?? [T.panelTop.side, T.panelTop.back];
    const top = (deg: number): number => centre.y + hangSide + (hangBack - hangSide) * Math.max(0, Math.min(1, (deg - 90) / 90));
    const bottom = centre.y - T.panelDown;
    // her outline round that point: for each degree round her (both sides folded together, 0 her front .. 180 her back)
    // and each 1 cm of height, how far out her skin is
    const H = Math.ceil((T.panelTop.back + 0.04 + T.panelDown) / 0.01) + 1, A = 181;
    const reach = Array.from({ length: H }, () => new Float32Array(A));
    const toRoot = new THREE.Vector3();
    // (only her hips' and thighs' own skin: her hands hang beside her hips, and counted they stood the panels far out)
    const hipBones = new Set([carrier, carrier.parent, src.leg.left.thigh, src.leg.right.thigh].map((b) => bones.indexOf(b as THREE.Bone)).filter((k) => k >= 0));
    for (let i = 0; i < count; i++) {
      if (!hipBones.has(strongest[i])) continue;
      toRoot.set(posed[i * 3], posed[i * 3 + 1], posed[i * 3 + 2]).applyMatrix4(rootInverse);
      const h = Math.round((toRoot.y - bottom) / 0.01);
      if (h < 0 || h >= H) continue;
      const x = toRoot.x - centre.x, z = toRoot.z - centre.z, r = Math.hypot(x, z);
      if (r > 0.3) continue;
      const deg = Math.round(Math.abs(Math.atan2(x, z)) * (180 / Math.PI));
      for (const dd of [deg - 1, deg, deg + 1]) if (dd >= 0 && dd < A && r > reach[h][dd]) reach[h][dd] = r;
    }
    /** How far out her skin reaches from a height up to the panel's top, at each degree (a stiff panel clears it all). */
    const rawAt = (d: number, y: number): number => {
      const from = Math.round((y - bottom) / 0.01), to = Math.round((top(d) - bottom) / 0.01);
      let most = 0.05;
      for (let h = Math.max(0, from); h <= Math.min(H - 1, to); h++) most = Math.max(most, reach[h][d]);
      return most;
    };
    /**
     * How far out a panel must be at this height and angle: past all of her from its top down to here, flaring out.
     * SMOOTHED ROUND HER (Joshua, 2026-11-20: "there is a wrinkle in the panels"): her outline round her is lumpy (her
     * hip bone, the top of her buttock), and a stiff panel copying each lump creased. Here the most of her within 12
     * degrees either way, then that evened over the same span: a smooth curve that still clears all of her.
     */
    const radiusAt = (deg: number, y: number): number => {
      const d = Math.max(0, Math.min(180, Math.round(deg)));
      let sum = 0, n = 0;
      for (let k = -12; k <= 12; k += 3) {
        let most = 0;
        for (let j = -12; j <= 12; j += 3) most = Math.max(most, rawAt(Math.max(0, Math.min(180, d + k + j)), y));
        sum += most; n++;
      }
      return sum / n + T.panelGap + T.panelFlare * Math.max(0, top(deg) - y);
    };
    const toCarrier = new THREE.Matrix4().copy(carrier.matrixWorld).invert().multiply(root.matrixWorld);
    const up = new THREE.Vector3(0, 1, 0);
    for (const hand of ['left', 'right'] as const) {
      const sideX = hand === 'left' ? src.leftSign : -src.leftSign;
      legRest[hand] = legLine(hand);
      src.leg[hand].thigh.updateMatrixWorld(true);
      T.panels.forEach(([from, to], k) => {
        // the panel's points in her root's frame: a grid round her from `from` to `to` degrees, from its top down
        const COLS = 20, ROWS = 12;
        const at = (c: number, r: number, out: number): THREE.Vector3 => {
          const deg = from + ((to - from) * c) / COLS;
          const y = top(deg) + (bottom - top(deg)) * (r / ROWS);
          const rad = radiusAt(deg, y) + out, a = deg * (Math.PI / 180);
          return new THREE.Vector3(centre.x + Math.sin(a) * rad * sideX, y, centre.z + Math.cos(a) * rad);
        };
        // its hinge: the middle of its top edge; it swings about the line along that edge
        const midDeg = (from + to) / 2, ma = midDeg * (Math.PI / 180);
        const hinge = at(COLS / 2, 0, 0);
        const radial = new THREE.Vector3(Math.sin(ma) * sideX, 0, Math.cos(ma));
        const axisRoot = new THREE.Vector3().crossVectors(radial, up).normalize();
        const positions: number[] = [], colours: number[] = [], index: number[] = [];
        const P = (COLS + 1) * (ROWS + 1);
        for (let layer = 0; layer < 2; layer++) for (let r = 0; r <= ROWS; r++) for (let c = 0; c <= COLS; c++) {
          const p = at(c, r, layer === 0 ? T.panelThick : 0).sub(hinge);
          positions.push(p.x, p.y, p.z);
          // outside: white edged gold; inside: the red lining
          const edge = r === ROWS || c === 0 || c === COLS || r < T.panelHemRows;
          const col = layer === 1 ? lining : edge ? C.accent : C.plate;
          colours.push(col.r, col.g, col.b);
        }
        const id = (layer: number, r: number, c: number) => layer * P + r * (COLS + 1) + c;
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
          index.push(id(0, r, c), id(0, r + 1, c), id(0, r, c + 1), id(0, r, c + 1), id(0, r + 1, c), id(0, r + 1, c + 1));
          index.push(id(1, r, c), id(1, r, c + 1), id(1, r + 1, c), id(1, r, c + 1), id(1, r + 1, c + 1), id(1, r + 1, c));
        }
        // its edges closed: outside to inside along the bottom and both sides
        const rim = (a0: number, a1: number, b0: number, b1: number) => index.push(a0, b0, a1, a1, b0, b1, a0, a1, b0, a1, b1, b0);
        for (let c = 0; c < COLS; c++) rim(id(0, ROWS, c), id(0, ROWS, c + 1), id(1, ROWS, c), id(1, ROWS, c + 1));
        for (let r = 0; r < ROWS; r++) { rim(id(0, r, 0), id(0, r + 1, 0), id(1, r, 0), id(1, r + 1, 0)); rim(id(0, r, COLS), id(0, r + 1, COLS), id(1, r, COLS), id(1, r + 1, COLS)); }
        // THE STUDS clamping its hem to the belt: small gold squares standing proud of the hem, evenly along it
        for (let n = 0; n < T.panelStuds; n++) {
          const c = (COLS * (n + 0.5)) / T.panelStuds, half = T.panelStud / 2;
          const base = positions.length / 3;
          const middle = at(c, 0.45, T.panelThick + 0.0015).sub(hinge);
          const deg = from + ((to - from) * c) / COLS, a = deg * (Math.PI / 180);
          const out = new THREE.Vector3(Math.sin(a) * sideX, 0, Math.cos(a)), along = new THREE.Vector3().crossVectors(up, out).normalize();
          for (const [x, y, o] of [[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] as const) {
            const p = middle.clone().addScaledVector(along, x * half).addScaledVector(up, y * half).addScaledVector(out, o * 0.003);
            positions.push(p.x, p.y, p.z);
            colours.push(C.accent.r, C.accent.g, C.accent.b);
          }
          // (its outer face and four sides)
          for (const [a0, a1, a2, a3] of [[4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) index.push(base + a0, base + a1, base + a2, base + a0, base + a2, base + a3);
        }
        // (on her left, a mirror of her right: its faces wound the other way)
        const geometry = made(positions, colours, index, sideX < 0);
        // the panel on its pivot at the hinge, in the bone the legs hang from (so it turns with her hips)
        const pivot = new THREE.Object3D();
        pivot.name = `hip-panel-${hand}-${k}`;
        // (its frame is her root's, turned and scaled into the bone's: the bone may be in other units)
        const scale = new THREE.Vector3();
        toCarrier.decompose(new THREE.Vector3(), pivot.quaternion, scale);
        pivot.scale.copy(scale);
        pivot.position.copy(hinge).applyMatrix4(toCarrier);
        const mesh = new THREE.Mesh(geometry, panelMaterial);
        mesh.frustumCulled = false;
        pivot.add(mesh);
        carrier.add(pivot);
        meshes.push(pivot);
        swingers.push({ pivot, axis: axisRoot, side: hand, back: true, now: 0 });
      });
    }
  }
  const rest = swingers.map((s) => s.pivot.quaternion.clone());
  const turn = new THREE.Quaternion();

  return {
    meshes,
    update(dt: number): void {
      if (!swingers.length) return;
      rootInverse.copy(root.matrixWorld).invert();
      const T = SUIT_GEAR;
      const line = { left: legLine('left'), right: legLine('right') };
      swingers.forEach((s, i) => {
        const swing = line[s.side].pitch - legRest[s.side].pitch, spread = Math.max(0, line[s.side].spread - legRest[s.side].spread);
        const want = Math.min(T.swingMost, s.back
          ? T.backSwing * Math.max(0, -swing) + T.backForward * Math.max(0, swing) + 0.5 * T.sideSpread * spread
          : T.sideSwing * Math.abs(swing) + T.sideSpread * spread);
        s.now += (want - s.now) * (1 - Math.exp(-T.swingEase * Math.max(0, dt)));
        // (turned about the line of its top edge, in its own frame: its rest turn is the carrier's; the axis is in her
        //  root's frame, which the pivot's own frame is)
        s.pivot.quaternion.copy(rest[i]).multiply(turn.setFromAxisAngle(s.axis, s.now));
      });
    },
    dispose(): void {
      for (const m of meshes) { m.removeFromParent(); m.traverse((n) => (n as THREE.Mesh).geometry?.dispose()); }
      plateMaterial.dispose();
      glowMaterial.dispose();
      panelMaterial.dispose();
    },
  };
}

// ------------------------------------------------------------------ measuring round a bone

/** Her outline round a bone: for each slice along it and each angle round it, how far out her skin reaches. */
interface RoundProfile {
  /** The bone's line in its own space (from 0), its length, and the two directions round it (angle 0, and +90). */
  readonly axis: THREE.Vector3;
  readonly length: number;
  readonly front: THREE.Vector3;
  readonly side: THREE.Vector3;
  /** Where the piece starts and ends along the line (shares of its length). */
  readonly from: number;
  readonly to: number;
  /** How far round it goes each way from angle 0 (degrees; 180: all the way round). */
  readonly halfAngle: number;
  /** radius[slice][angle] (metres), slices from `from` to `to`, angles from -halfAngle to +halfAngle. */
  readonly radius: Float32Array[];
  /**
   * True when (front, side, along) is a MIRRORED frame (her other side's piece is the mirror of this one): its faces
   * must be wound the other way round, or they face inward and only the inside of the piece is seen.
   */
  readonly mirrored: boolean;
}

function measureRound(pts: readonly THREE.Vector3[], line: THREE.Vector3, frontDir: THREE.Vector3, sideDir: THREE.Vector3, from: number, to: number, halfAngle = 180): RoundProfile {
  const S = SUIT_GEAR.slices, A = SUIT_GEAR.around, length = line.length();
  const axis = line.clone().normalize();
  // two directions square to the line: "front" (angle 0) and "side" (angle +90)
  const front = frontDir.clone().addScaledVector(axis, -frontDir.dot(axis)).normalize();
  const side = new THREE.Vector3().crossVectors(axis, front).normalize();
  if (side.dot(sideDir) < 0) side.negate();
  const full = halfAngle >= 180;
  const radius = Array.from({ length: S + 1 }, () => new Float32Array(A + (full ? 0 : 1)).fill(-1));
  const slab = (to - from) / S;
  for (const p of pts) {
    const along = p.dot(axis) / length;
    if (along < from - slab || along > to + slab) continue;
    v.copy(p).addScaledVector(axis, -along * length);
    const r = v.length();
    if (r > 0.25) continue;   // (nothing of a limb is that far from its bone)
    const angle = Math.atan2(v.dot(side), v.dot(front)) * (180 / Math.PI);
    if (!full && Math.abs(angle) > halfAngle + 20) continue;
    const s = Math.round(((along - from) / (to - from)) * S);
    const a = full
      ? ((Math.round(((angle + 360) % 360) / (360 / A)) % A) + A) % A
      : Math.round(((angle + halfAngle) / (2 * halfAngle)) * A);
    for (const ss of [s - 1, s, s + 1]) {
      if (ss < 0 || ss > S) continue;
      const aa = Math.min(radius[ss].length - 1, Math.max(0, a));
      if (r > radius[ss][aa]) radius[ss][aa] = r;
    }
  }
  // places with no point of her skin: their neighbours' (round, then along), and at worst the median of all
  const all: number[] = [];
  for (const row of radius) for (const r of row) if (r > 0) all.push(r);
  all.sort((x, y) => x - y);
  const median = all.length ? all[all.length >> 1] : 0.04;
  for (let pass = 0; pass < 6; pass++) {
    for (let s = 0; s <= S; s++) {
      const row = radius[s], n = row.length;
      for (let a = 0; a < n; a++) {
        if (row[a] > 0) continue;
        const near = [full ? row[(a + 1) % n] : row[Math.min(n - 1, a + 1)], full ? row[(a - 1 + n) % n] : row[Math.max(0, a - 1)], s > 0 ? radius[s - 1][a] : -1, s < S ? radius[s + 1][a] : -1].filter((r) => r > 0);
        if (near.length) row[a] = Math.max(...near);
      }
    }
  }
  for (const row of radius) for (let a = 0; a < row.length; a++) if (row[a] <= 0) row[a] = median;
  // smoothed (so the shell does not copy every bump), never inside her outline
  const smoothRows = radius.map((row, s) => row.map((r, a) => {
    const n = row.length;
    const at = (ss: number, aa: number): number => radius[Math.min(S, Math.max(0, ss))][full ? (aa + n) % n : Math.min(n - 1, Math.max(0, aa))];
    const mean = (at(s, a - 1) + at(s, a + 1) + at(s - 1, a) + at(s + 1, a) + 2 * r) / 6;
    return Math.max(r, mean);
  }));
  const mirrored = new THREE.Vector3().crossVectors(front, side).dot(axis) < 0;
  return { axis, length, front, side, from, to, halfAngle, radius: smoothRows.map((row) => Float32Array.from(row)), mirrored };
}

/** A point on a profile's surface: slice `s` (may be fractional), angle step `a`, `out` metres outside her outline. */
function profilePoint(p: RoundProfile, s: number, a: number, out: number, target: THREE.Vector3): THREE.Vector3 {
  const S = p.radius.length - 1, n = p.radius[0].length, full = p.halfAngle >= 180;
  const s0 = Math.min(S, Math.max(0, Math.floor(s))), s1 = Math.min(S, s0 + 1), fs = Math.min(1, Math.max(0, s - s0));
  const aa = full ? ((a % n) + n) % n : Math.min(n - 1, Math.max(0, a));
  const r = p.radius[s0][aa] * (1 - fs) + p.radius[s1][aa] * fs + out;
  const angle = full ? (aa / n) * 2 * Math.PI : ((aa / (n - 1)) * 2 - 1) * p.halfAngle * (Math.PI / 180);
  const along = (p.from + (p.to - p.from) * (s / S)) * p.length;
  return target.copy(p.axis).multiplyScalar(along)
    .addScaledVector(p.front, Math.cos(angle) * r)
    .addScaledVector(p.side, Math.sin(angle) * r);
}
/** The angle (degrees, 0 the front) of angle step `a` on a profile. */
const angleOf = (p: RoundProfile, a: number): number => {
  const n = p.radius[0].length;
  if (p.halfAngle >= 180) { const d = (a / n) * 360; return d > 180 ? d - 360 : d; }
  return ((a / (n - 1)) * 2 - 1) * p.halfAngle;
};

/** A geometry from lists of points, colours and triangles. */
function made(positions: number[], colours: number[], index: number[], mirrored = false): THREE.BufferGeometry {
  // (a mirrored frame: every triangle wound the other way, so it faces out)
  if (mirrored) for (let i = 0; i < index.length; i += 3) { const t = index[i + 1]; index[i + 1] = index[i + 2]; index[i + 2] = t; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (colours.length) g.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/**
 * A SHELL round a profile: its outside `gap + wall` out from her outline, its inside `gap` out, its edges closed.
 * Each point coloured by `paint`. `spanDegrees` 360: a closed ring; less: a plate (its two sides closed too).
 */
function roundShell(p: RoundProfile, gap: number, wall: number, paint: Paint, spanDegrees: number): THREE.BufferGeometry {
  const S = p.radius.length - 1, n = p.radius[0].length, full = spanDegrees >= 360;
  const cols = full ? n : n;   // (angle steps)
  const positions: number[] = [], colours: number[] = [], index: number[] = [];
  const at = new THREE.Vector3();
  // outside surface (layer 0) then inside surface (layer 1)
  for (let layer = 0; layer < 2; layer++) {
    for (let s = 0; s <= S; s++) for (let a = 0; a < cols; a++) {
      profilePoint(p, s, a, gap + (layer === 0 ? wall : 0), at);
      positions.push(at.x, at.y, at.z);
      const c = paint(s / S, angleOf(p, a));
      colours.push(c.r, c.g, c.b);
    }
  }
  const id = (layer: number, s: number, a: number): number => layer * (S + 1) * cols + s * cols + (full ? ((a % cols) + cols) % cols : a);
  const quad = (a0: number, a1: number, b0: number, b1: number, flip: boolean): void => {
    if (flip) index.push(a0, b0, a1, a1, b0, b1); else index.push(a0, a1, b0, a1, b1, b0);
  };
  const steps = full ? cols : cols - 1;
  for (let s = 0; s < S; s++) for (let a = 0; a < steps; a++) {
    quad(id(0, s, a), id(0, s, a + 1), id(0, s + 1, a), id(0, s + 1, a + 1), false);   // outside, facing out
    quad(id(1, s, a), id(1, s, a + 1), id(1, s + 1, a), id(1, s + 1, a + 1), true);    // inside, facing in
  }
  // its two ends: outside to inside
  for (let a = 0; a < steps; a++) {
    quad(id(0, 0, a), id(0, 0, a + 1), id(1, 0, a), id(1, 0, a + 1), true);
    quad(id(0, S, a), id(0, S, a + 1), id(1, S, a), id(1, S, a + 1), false);
  }
  // a plate's two long sides
  if (!full) for (let s = 0; s < S; s++) {
    quad(id(0, s, 0), id(0, s + 1, 0), id(1, s, 0), id(1, s + 1, 0), false);
    quad(id(0, s, cols - 1), id(0, s + 1, cols - 1), id(1, s, cols - 1), id(1, s + 1, cols - 1), true);
  }
  return made(positions, colours, index, p.mirrored);
}

/** A thin GLOWING RING round a profile at `t` (0..1 along it), `half` of a share of its length wide each way. */
function glowRing(p: RoundProfile, t: number, out: number, half: number): THREE.BufferGeometry {
  const S = p.radius.length - 1, n = p.radius[0].length;
  const positions: number[] = [], index: number[] = [];
  const at = new THREE.Vector3();
  const rows = [Math.max(0, (t - half * (p.to - p.from) ** -1) * S), Math.min(S, (t + half * (p.to - p.from) ** -1) * S)];
  for (const s of rows) for (let a = 0; a < n; a++) { profilePoint(p, s, a, out, at); positions.push(at.x, at.y, at.z); }
  for (let a = 0; a < n; a++) { const b = (a + 1) % n; index.push(a, b, n + a, b, n + b, n + a); }
  return made(positions, [], index, p.mirrored);
}

/** A GLOWING PATCH on a profile: centred at `t` along it and `angle` round it, `tSpan` long (share) and `angleSpan` degrees wide. */
function glowPatch(p: RoundProfile, t: number, angle: number, tSpan: number, angleSpan: number, out: number): THREE.BufferGeometry {
  const S = p.radius.length - 1, n = p.radius[0].length, full = p.halfAngle >= 180;
  // the angle as a (fractional) angle step
  const stepOf = (deg: number): number => (full ? (((deg + 360) % 360) / 360) * n : ((deg / p.halfAngle + 1) / 2) * (n - 1));
  const positions: number[] = [], index: number[] = [];
  const at = new THREE.Vector3();
  const K = 6;
  for (let i = 0; i <= K; i++) for (let j = 0; j <= 1; j++) {
    const s = (t - tSpan / 2 + (tSpan * i) / K) * S;
    const a = stepOf(angle + (j - 0.5) * angleSpan);
    const a0 = Math.floor(a), fa = a - a0;
    const pa = profilePoint(p, s, a0, out, new THREE.Vector3()), pb = profilePoint(p, s, a0 + 1, out, at);
    pa.lerp(pb, fa);
    positions.push(pa.x, pa.y, pa.z);
  }
  for (let i = 0; i < K; i++) { const r = i * 2; index.push(r, r + 1, r + 2, r + 1, r + 3, r + 2); }
  return made(positions, [], index, p.mirrored);
}

// ------------------------------------------------------------------ the boot's foot

/**
 * THE BOOT'S FOOT round her foot's points (in her foot bone's space): slices from her heel to her toes, each a rounded
 * box as wide as her foot there and as tall as her instep, down to a flat sole just under her own sole; a collar rises
 * round her ankle so the shaft above overlaps it.
 */
function footShell(pts: readonly THREE.Vector3[], forward: THREE.Vector3, up: THREE.Vector3, outward: THREE.Vector3, C: { plate: THREE.Color; trim: THREE.Color; accent: THREE.Color; sole: THREE.Color }, heeled = false): THREE.BufferGeometry {
  const T = SUIT_GEAR;
  // a frame on the floor: forward (heel to toe), up, across
  const fwd = forward.clone().addScaledVector(up, -forward.dot(up)).normalize();
  const across = new THREE.Vector3().crossVectors(up, fwd).normalize();
  if (across.dot(outward) < 0) across.negate();
  // her foot's points in that frame
  let back = Infinity, toe = -Infinity, low = Infinity;
  const f = pts.map((p) => { const q = { z: p.dot(fwd), y: p.dot(up), x: p.dot(across) }; back = Math.min(back, q.z); toe = Math.max(toe, q.z); low = Math.min(low, q.y); return q; });
  const ankleTop = T.collarUp;   // (the bone's origin is her ankle joint: the collar rises this far over it)
  const S = 16;
  const length = toe - back;
  // for each slice: her foot's half widths (inner, outer) and its top
  const inner = new Float32Array(S + 1).fill(0), outer = new Float32Array(S + 1).fill(0), top = new Float32Array(S + 1).fill(low + 0.02);
  for (const q of f) {
    if (q.y > ankleTop + 0.02) continue;
    const s = Math.round(((q.z - back) / length) * S);
    if (s < 0 || s > S) continue;
    if (q.x > outer[s]) outer[s] = q.x;
    if (-q.x > inner[s]) inner[s] = -q.x;
    if (q.y > top[s]) top[s] = q.y;
  }
  for (let s = 0; s <= S; s++) {
    // (slices with too few points take their neighbours'; widths never under 2 cm a side)
    if (outer[s] < 0.02) outer[s] = s > 0 ? outer[s - 1] : 0.035;
    if (inner[s] < 0.02) inner[s] = s > 0 ? inner[s - 1] : 0.035;
  }
  const floor = low - T.sole + 0.006;   // (its sole's underside: a few millimetres under her own sole)
  const gap = T.footGap, wall = T.footWall;
  const R = 20;   // points round each slice
  const positions: number[] = [], colours: number[] = [], index: number[] = [];
  // each slice is a rounded box from the sole's top to her top there, from her inside to her outside
  const ring = (s: number, extraBack: number): void => {
    const share = s / S;
    const z = back - gap - wall - extraBack + share * (length + 2 * (gap + wall) + T.toePast + extraBack);
    // the toe tapers to a rounded front, the heel to a rounded back
    const tipTaper = Math.sin(Math.min(1, share * 6) * (Math.PI / 2)) * Math.sin(Math.min(1, (1 - share) * 5) * (Math.PI / 2));
    const ins = (inner[s] + gap + wall) * (0.55 + 0.45 * tipTaper), outs = (outer[s] + gap + wall) * (0.55 + 0.45 * tipTaper);
    // (the collar round her ankle eases down over her instep to her toes: no step)
    const collar = 1 - Math.min(1, Math.max(0, (share - 0.25) / 0.35));
    const ease = collar * collar * (3 - 2 * collar);
    const yTop = Math.max(top[s], top[s] + (ankleTop - top[s]) * ease) + gap + wall;
    // (SMALL HEELS, Look 2: the sole lifted under her arch, rising behind the ball of her foot and coming down again in
    //  front of her heel, so the heel stands on its own as a heel would; her foot itself stays on the ground)
    const arch = heeled ? Math.sin(Math.min(1, Math.max(0, (share - 0.2) / 0.42)) * Math.PI) : 0;
    const yLow = floor + T.archLift * arch;
    for (let k = 0; k < R; k++) {
      // round the slice: a superellipse (a box with round corners)
      const a = (k / R) * Math.PI * 2;
      const cx = Math.cos(a), cy = Math.sin(a);
      const ex = Math.sign(cx) * Math.pow(Math.abs(cx), 0.55), ey = Math.sign(cy) * Math.pow(Math.abs(cy), 0.55);
      const x = ex > 0 ? ex * outs : ex * ins;
      const y = yLow + (ey + 1) * 0.5 * (yTop - yLow);
      const p = new THREE.Vector3().addScaledVector(across, x).addScaledVector(up, y).addScaledVector(fwd, z);
      positions.push(p.x, p.y, p.z);
      // colours: the sole (the lowest band), a darker toe cap, a red heel counter, the plate elsewhere
      const height = (y - yLow) / Math.max(1e-3, yTop - yLow);
      const c = heeled
        // (Look 2: a navy sole and heel, a gold line over it, a navy toe cap, white elsewhere)
        ? (height < 0.14 ? C.sole : height < 0.2 ? C.accent : share > 0.8 ? C.trim : C.plate)
        : height < 0.16 ? C.sole : share > 0.78 ? C.trim : share < 0.2 && height < 0.7 ? C.accent : C.plate;
      colours.push(c.r, c.g, c.b);
    }
  };
  for (let s = 0; s <= S; s++) ring(s, 0);
  for (let s = 0; s < S; s++) for (let k = 0; k < R; k++) {
    const a = s * R + k, b = s * R + ((k + 1) % R), c = (s + 1) * R + k, d = (s + 1) * R + ((k + 1) % R);
    index.push(a, c, b, b, c, d);
  }
  // closed ends: a fan at the heel and at the toe
  const capAt = (s: number, flip: boolean): void => {
    const centre = positions.length / 3;
    let x = 0, y = 0, z = 0;
    for (let k = 0; k < R; k++) { x += positions[(s * R + k) * 3]; y += positions[(s * R + k) * 3 + 1]; z += positions[(s * R + k) * 3 + 2]; }
    positions.push(x / R, y / R, z / R);
    colours.push(C.trim.r, C.trim.g, C.trim.b);
    for (let k = 0; k < R; k++) { const a = s * R + k, b = s * R + ((k + 1) % R); if (flip) index.push(centre, b, a); else index.push(centre, a, b); }
  };
  capAt(0, false);
  capAt(S, true);
  // (her other foot's frame is the mirror of this one's: its faces wound the other way)
  return made(positions, colours, index, new THREE.Vector3().crossVectors(across, up).dot(fwd) > 0);
}

/** (kept for a later outfit's thinner pieces: a point between two) */
export const midway = (a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3 => w.copy(a).lerp(b, 0.5);
