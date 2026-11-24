// ============================================================================
// floraSpecies.ts -- THE LIST OF THE ISLAND'S SCI-FI FLORA: what each species
// variant is called, how big it grows on the island, how it glows, and the
// numbers the game will want when it plants them (walking into them, how far
// to draw them).
//
// Every model is ONE UNIT TALL (floraModels.ts): a planted one is scaled by a
// height picked from its `sizeM` range. Everything marked GAME TUNING is a
// first guess to be tried on Joshua's phone.
// ============================================================================
import type { FloraHue } from './floraMaterial';
import type { FloraId } from './floraModels';

export type FloraFamily = 'tall cap' | 'giant cap' | 'cluster' | 'bracket' | 'plant';

export interface FloraSpecies {
  id: FloraId;
  /** Its name, as shown in the lab. */
  name: string;
  family: FloraFamily;
  /** How tall it grows, in metres (smallest, biggest). */
  sizeM: readonly [number, number];
  /** Which material draws it: 'lit' never glows; 'glow' has glowing parts (each plant given a colour). */
  material: 'lit' | 'glow';
  /** How its glowing parts glow (what floraMaterial.ts calls "always" and "night only"), in words. */
  glows: string;
  /** The glow colour it is shown with in the lab (any of the six can be given to any plant). */
  hue: FloraHue | null;
  /**
   * WHAT STOPS HER WALKING (GAME TUNING): the radius of its stem or rock at its foot as a share of its height (0: she
   * walks through it, as through a fern or a bush). A 12 m Lantern Cap's stem is about 0.5 m round its foot.
   */
  solid: number;
  /** Made to sit against something (a cliff, a trunk, a giant's stem): its back is the plane z = 0, it faces +z. */
  onHost?: boolean;
  /** WHERE ITS NEAR MODEL GIVES WAY TO ITS FAR ONE, and how far it is drawn at all (metres; GAME TUNING). */
  nearM: number;
  farM: number;
  /** A line about it. */
  about: string;
}

export const FLORA_SPECIES: readonly FloraSpecies[] = [
  {
    id: 'lanternCap', name: 'Lantern Cap', family: 'tall cap', sizeM: [8, 15], material: 'glow',
    glows: 'gills always (dim by day), spots and rim at night', hue: 'violet', solid: 0.045, nearM: 90, farM: 1200,
    about: 'A tall leaning mushroom: an indigo cap with pale raised spots over glowing gills, a lilac stem with a frilly skirt and root lobes at its foot.',
  },
  {
    id: 'umberParasol', name: 'Umber Parasol', family: 'tall cap', sizeM: [8, 15], material: 'lit',
    glows: 'none', hue: null, solid: 0.045, nearM: 90, farM: 1200,
    about: 'The plain one of the family: a broad flat cap, rust to ochre with dark scales, cream gills and a snake-banded stem.',
  },
  {
    id: 'skyParasol', name: 'Sky Parasol', family: 'giant cap', sizeM: [20, 40], material: 'glow',
    glows: 'gills, rim, shelf edges and hanging threads always (dim by day)', hue: 'cyan', solid: 0.06, nearM: 160, farM: 3000,
    about: 'A landmark: a thick fluted stem on buttress roots, shelf fungi up it, a vast teal-blue cap mottled violet hung with glowing threads.',
  },
  {
    id: 'rustCrown', name: 'Rust Crown', family: 'giant cap', sizeM: [20, 40], material: 'lit',
    glows: 'none', hue: null, solid: 0.06, nearM: 160, farM: 3000,
    about: 'The plain giant: a rust-red cap with pale scales, its rim turned up, ochre shelves up a bone-pale stem.',
  },
  {
    id: 'glowbellCluster', name: 'Glowbell Cluster', family: 'cluster', sizeM: [0.1, 5], material: 'glow',
    glows: 'caps and gills at night only', hue: 'emerald', solid: 0, nearM: 25, farM: 90,
    about: 'Five slender mushrooms of different heights from one mound, pale bell caps that light up at dusk; tiny buttons round them.',
  },
  {
    id: 'buttonCluster', name: 'Button Cluster', family: 'cluster', sizeM: [0.1, 5], material: 'lit',
    glows: 'none', hue: null, solid: 0, nearM: 25, farM: 90,
    about: 'The familiar kind: stout cream stems and round brown caps from one mound.',
  },
  {
    id: 'bracketBoulder', name: 'Shelf Fungus Boulder', family: 'bracket', sizeM: [1, 4], material: 'glow',
    glows: 'shelf lips and pores at night only', hue: 'amber', solid: 0.38, nearM: 40, farM: 220,
    about: 'A mossy basalt boulder flecked with the violet mineral, tiers of shelf fungi on its sides, zoned in bands like tree rings.',
  },
  {
    id: 'bracketTiers', name: 'Shelf Tiers', family: 'bracket', sizeM: [0.3, 3], material: 'glow',
    glows: 'shelf lips and pores at night only', hue: 'amber', solid: 0, onHost: true, nearM: 30, farM: 160,
    about: 'Nine shelves climbing a surface, alone: to set against a cliff, a trunk or a giant mushroom\'s stem (its back is z = 0).',
  },
  {
    id: 'siphonCoral', name: 'Siphon Coral', family: 'plant', sizeM: [0.5, 3], material: 'glow',
    glows: 'inside its tubes always; rings near the top faintly', hue: 'magenta', solid: 0, nearM: 30, farM: 160,
    about: 'A clump of open tubes like sea sponges on land, pale and violet-banded, each throat glowing.',
  },
  {
    id: 'crescentFern', name: 'Crescent Fern', family: 'plant', sizeM: [0.8, 3], material: 'glow',
    glows: 'midribs and coiled tips at night only', hue: 'cyan', solid: 0, nearM: 25, farM: 140,
    about: 'Broad sickle-curved fronds, teal on top and violet beneath, with two young fronds still coiled in the middle.',
  },
  {
    id: 'sporePods', name: 'Spore Pods', family: 'plant', sizeM: [0.5, 2.5], material: 'glow',
    glows: 'seams always (faint), tips at night', hue: 'crimson', solid: 0, nearM: 25, farM: 140,
    about: 'Ribbed onion-shaped pods on curved stalks over strap leaves, warm cream with violet seams, each tip a glowing pore.',
  },
];

/** A species by its id. */
export function floraSpecies(id: FloraId): FloraSpecies {
  return FLORA_SPECIES.find((s) => s.id === id)!;
}
