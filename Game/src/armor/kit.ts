// ============================================================================
// kit.ts -- what every piece builder is handed, and how a finished piece
// becomes a mesh.
// ============================================================================
import * as THREE from 'three';
import type { ArmorSlot, BodyFit } from './bodyFit';
import { BODY_FIT } from './bodyFitData';
import { createArmorMaterial } from './materials';
import type { PieceBuilder } from './geo';

/** The colours one piece is painted with (hex numbers). A look fills these in from its palette. */
export interface PieceColors {
  /** The piece's main paint. */
  readonly main: number;
  /** Its second paint (panels, plates laid on top). */
  readonly second: number;
  /** Small accents (stripes, caps, studs). */
  readonly accent: number;
  /** Dark under-armor: linings, straps, joints, soles. */
  readonly dark: number;
  /** Light strips. */
  readonly glow: number;
  /** Visor glass. */
  readonly visor: number;
}

/** What the builders share: her measured fit, and the one armor material. */
export interface ArmorKit {
  readonly fit: BodyFit;
  readonly material: THREE.Material;
}

let shared: ArmorKit | null = null;
/** The default kit: the measured body, and one armor material shared by everything built with it. */
export function defaultKit(): ArmorKit {
  if (!shared) shared = { fit: BODY_FIT, material: createArmorMaterial() };
  return shared;
}

/** The gap left between her skin and the inside of every piece (metres). */
export const SKIN_GAP = 0.004;

/** Which side of her a piece is for. Pieces are built for her LEFT and mirrored for her right. */
export type Side = 'L' | 'R';

/** Finish a piece: merge its parts into one mesh (mirrored for her right side). */
export function finishPiece(b: PieceBuilder, name: string, kit: ArmorKit, side: Side = 'L', scale = 1): THREE.Mesh {
  const mesh = new THREE.Mesh(b.build(side === 'R', scale), kit.material);
  mesh.name = name;
  return mesh;
}

/** A rigid piece ready to be attached: its mesh, the slot it belongs in, and (for guns) its marked points. */
export interface RigidPiece {
  readonly slot: ArmorSlot;
  readonly mesh: THREE.Mesh;
}
