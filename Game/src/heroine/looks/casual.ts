import { COVERAGE_TEMPLATES } from '@charb/sarahlab/paintTemplates';
import type { HeroineLook } from '../heroineLook';
import type { MaskPainter, LegPlace } from '../paintMask';
import maryDefault from './maryDefault.json';
import { panelDistance } from './casualPanels';

const bodysuit = COVERAGE_TEMPLATES.find((t) => t.id === 'bodysuitFull');
if (!bodysuit) throw new Error('CCBS full bodysuit template is missing');
const flat = (tint: string) => ({ family: 'flat', colour: 0, tint });
const detail = { mode: 'auto', material: null, override: { nipple: 0.43, navel: 0.81 } };
const layer = (colour: string) => ({ choice: { fabric: flat(colour), match: true, trim: flat(colour), stitch: 1, opacity: 1 }, detail, template: null, mask: '' });

/** The top's paint stays below the neckline on the underlying template. */
const top: MaskPainter = (surface) => {
  const d = new Float32Array(surface.count).fill(-1);
  const p: LegPlace = { along: 0, turn: 0, radius: 0 };
  for (let v = 0; v < surface.count; v++) {
    if (surface.trunkPlace(v, p)) d[v] = Math.min(p.along - 0.12, 0.74 - p.along);
  }
  return d;
};

const accent: MaskPainter = (surface) => {
  const d = new Float32Array(surface.count).fill(-1);
  const p: LegPlace = { along: 0, turn: 0, radius: 0 };
  for (let v = 0; v < surface.count; v++) {
    if (surface.trunkPlace(v, p)) d[v] = panelDistance('trunk', p);
    else if (surface.legPlace(v, p)) d[v] = panelDistance('leg', p);
  }
  return d;
};

function casual(topColour: string, accentColour: string, sleeve: number): HeroineLook {
  return {
    name: 'Blaze', body: maryDefault.body as HeroineLook['body'],
    clothes: {
      ...maryDefault.clothes,
      layers: [
        { ...maryDefault.clothes.layers[0], template: { id: bodysuit!.id, params: { ...bodysuit!.params, ...maryDefault.clothes.layers[0]!.template!.params, sleeve, neckFront: 0.88, neckShape: 'crew' } } },
        layer(topColour), layer(accentColour),
      ],
    },
    maskPainters: [null, top, accent], onlyNamedPieces: true,
  };
}

export const CASUAL_LOOKS: Readonly<Record<string, HeroineLook>> = {
  maryTechTee: casual('#292d32', '#28aab0', 0.32),
  maryExplorerTank: casual('#662d42', '#9b405a', 0.04),
  maryZipTop: casual('#909298', '#a6488c', 0.32),
};
