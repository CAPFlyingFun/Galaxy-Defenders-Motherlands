// ============================================================================
// The armor kit: everything the rest of the game needs, in one place.
//
//   import { HEROINE_LOOKS, buildRigidArmor, attachRigidArmor, buildSkinPlates } from './armor';
//
//   const look = HEROINE_LOOKS.blaze;
//   const armor = buildRigidArmor(look);              // helmet, pads, guards, boots, guns: one mesh per piece
//   attachRigidArmor(armor, heroineModel);            // each piece onto the bone it names
//   const plates = await buildSkinPlates(look, skin); // chest, hips, thighs, belly shell: follow her skin
//
// Files:
//   looks.ts        what each heroine wears (data)            bodyFit.ts / bodyFitData.ts  how it fits the real body
//   rigidArmor.ts   build + attach the rigid pieces           skinPlates.ts                the skin-following plates
//   pieces/*.ts     one builder per kind of piece             geo.ts, fitShapes.ts         the geometry toolkit
//   materials.ts    the one shared armor material             lab/*                        the armor lab's own tools
// ============================================================================
export * from './looks';
export * from './bodyFit';
export { BODY_FIT } from './bodyFitData';
export * from './kit';
export * from './materials';
export * from './rigidArmor';
export * from './skinPlates';
export { buildHelmet, type HelmetOptions, type VisorStyle, type CrestStyle, type EarStyle } from './pieces/helmet';
export { buildShoulderPad, type ShoulderOptions, type ShoulderStyle } from './pieces/shoulder';
export { buildForearmGuard, buildKneeGuard, buildShinArmor, buildThighHolster, type ForearmOptions, type ForearmStyle, type KneeOptions, type KneeStyle, type ShinOptions, type ShinStyle, type HolsterOptions } from './pieces/limbs';
export { buildBoot, type BootOptions, type BootStyle } from './pieces/boot';
export { buildHipPiece, type HipOptions, type HipStyle } from './pieces/hip';
export { buildGun, GUN_DESIGNS, type GunOptions, type GunDesign } from './pieces/guns';
