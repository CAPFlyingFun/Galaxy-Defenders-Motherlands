// ============================================================================
// shoulder.ts -- shoulder pads.
//
// FRAME (slots "shoulderL" / "shoulderR", riding the UPPER-ARM bone):
//   origin = the shoulder joint
//   +Y back up the arm (from the elbow toward the shoulder: straight up when
//      her arm hangs at her side)
//   +Z to her front,  +X to the arm's outer side.
//   The right pad is the left pad mirrored (its outer side is -X).
//
// SIZE. The pad's inside follows her measured shoulder (4 mm clear of her
// skin in every direction); only the outside is "designed". On the measured
// body her skin reaches about 5 cm from the point just under the joint, so a
// size-1 round pad is a 17 cm ball-cap and an angular one stands 1-3 cm off.
//
// STYLES
//   'round'    one big smooth dome with a smaller lobe under it and a dark
//              oval inset (Blaze)
//   'angular'  a faceted plate with a flared lower edge and a raised top tier
//              (Coral, Vela, Nova)
//   'layered'  three smooth overlapping tiers, each in its own colour
//              (Tessa, Aurora)
// ============================================================================
import * as THREE from 'three';
import { PieceBuilder, dark, faceted, paint } from '../geo';
import { deg, domePlate } from '../fitShapes';
import { defaultKit, finishPiece, type ArmorKit, type PieceColors, type Side } from '../kit';

export type ShoulderStyle = 'round' | 'angular' | 'layered';

export interface ShoulderOptions {
  readonly style: ShoulderStyle;
  /** 1 = standard; Blaze's big pads are about 1.25. Only the outside grows: the inside always fits her. */
  readonly size?: number;
}

/** Colours: main = the pad, second = its second tier, accent = its top tier or trim, dark = lining and insets. */
export function buildShoulderPad(o: ShoulderOptions, c: PieceColors, side: Side, kit: ArmorKit = defaultKit()): THREE.Mesh {
  const b = new PieceBuilder(), map = kit.fit.shoulderMap, k = o.size ?? 1, lining = dark(c.dark);
  // The way the middle of the pad faces: up and out.
  const axis = new THREE.Vector3(0.8, 0.6, 0);
  // Round the pad's edge, u = 0.75 is the side toward her neck: the pad reaches less far that way, to stay clear of her collar.
  const awayFromNeck = (u: number) => 1 - 0.5 * Math.max(0, -Math.sin(u * Math.PI * 2)) ** 1.5;
  // ...and u = 0.25 is the side down her arm: 1 there, 0 toward her neck.
  const downArm = (u: number) => Math.max(0, Math.sin(u * Math.PI * 2));

  // Her arm's own roundness ends about 7.5 cm from the point under the joint; beyond that the skin is chest, back or neck.
  const LIMIT = 0.078;

  if (o.style === 'round') {
    const R = 0.084 * k;
    b.addShell(domePlate({ map, axis, cone1: deg(96), reach: awayFromNeck, skinLimit: LIMIT, nu: 18, nv: 7, thick: () => 0.008, outer: (_d, inner) => Math.max(inner + 0.007, R) }), paint(c.main), lining, paint(c.main));
    // the smaller lobe below it, on the arm
    b.addShell(domePlate({ map, axis: new THREE.Vector3(0.9, -0.42, 0), cone1: deg(40), skinLimit: LIMIT, nu: 14, nv: 4, thick: () => 0.008, outer: (_d, inner) => Math.max(inner + 0.012, R * 0.86) }), paint(c.second), lining, paint(c.second));
    // the dark oval inset on its outer face
    b.add(domePlate({ map, axis: new THREE.Vector3(0.82, 0.3, 0.5), cone1: deg(21), reach: (u) => 1 - 0.3 * Math.cos(u * Math.PI * 2) ** 2, nu: 12, nv: 2, thick: () => 0.002, outer: (_d, inner) => Math.max(inner + 0.009, R + 0.003) }).outer, dark(c.dark, 0.35));
  } else if (o.style === 'angular') {
    // a low plate that flares outward at its lower edge like a short wing
    const plate = domePlate({ map, axis, cone1: deg(84), reach: awayFromNeck, skinLimit: LIMIT, nu: 8, nv: 3, thick: (u, v) => (0.009 + 0.026 * v * v * downArm(u)) * k });
    b.add(faceted(plate.outer), paint(c.main)).add(plate.inner, lining).add(plate.rim, paint(c.main));
    const tier = domePlate({ map, axis: new THREE.Vector3(0.7, 0.72, 0), cone1: deg(46), reach: awayFromNeck, skinLimit: LIMIT, nu: 8, nv: 2, base: 0.012, thick: (_u, v) => (0.012 + 0.006 * v) * k });
    b.add(faceted(tier.outer), paint(c.second)).add(tier.rim, paint(c.second));
    // a round joint cap on the front, where the pad is pinned
    b.add(domePlate({ map, axis: new THREE.Vector3(0.55, 0.1, 0.83), cone1: deg(16), nu: 10, nv: 2, base: 0.012, thick: (_u, v) => 0.012 * (1 - v * v) + 0.004 }).outer, dark(c.dark, 0.4));
  } else {
    // three tiers, the widest and thinnest underneath
    const tiers: Array<[number, number, number]> = [[deg(100), 0.008, c.main], [deg(74), 0.017, c.second], [deg(47), 0.027, c.accent]];
    for (const [cone, thick, colour] of tiers) {
      b.addShell(domePlate({ map, axis, cone1: cone, reach: awayFromNeck, skinLimit: LIMIT, nu: 16, nv: 5, thick: (_u, v) => thick * k * (1 - 0.25 * v * v) }), paint(colour), lining, paint(colour));
    }
  }
  return finishPiece(b, `shoulder${side}`, kit, side);
}
