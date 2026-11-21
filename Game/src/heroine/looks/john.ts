// ============================================================================
// john.ts -- JOHN, BLAZE'S HUSBAND, exactly as Joshua saved him in the
// Character Builder (export "character-john.json", 2026-11-21 12:29; kept in
// docs/reference/characters/). The builder's MALE BASE MODEL (male-base.glb,
// one bone more in his spine than hers), his belly at 50%, his long-sleeve
// shirt (navy jersey) over his tights (charcoal athletic knit), sneakers.
//
// Joshua, 2026-11-21: "Here is the male model and Blaze's husband name will be
// John"; both in the game at once with a swap button, as Beyond Extinction does.
// Nothing here is re-made by hand: it is his export, pasted.
// ============================================================================
import type { HeroineLook } from '../heroineLook';
import { fillCleavage } from './catsuit';

export const JOHN_LOOK: HeroineLook = {
  name: 'John',
  // his body: the male base model, his belly at 50% (the builder's own text for his proportions)
  body: {
  "model": "male-base",
  "bump": 50,
  "shape": "{\"version\":1,\"shape\":{\"bellyTilt\":17,\"bellyHeight\":-0.7,\"bellyWidth\":10,\"bellyDepth\":2,\"bellyUpper\":6,\"bellyLower\":-1,\"navel\":-3,\"navelAfter\":0,\"babyWeight\":-15,\"bellyFirmness\":52,\"bellyBounce\":130,\"babyFloat\":70,\"babyKicks\":110,\"breastSize\":-12,\"breastWidth\":-5,\"breastHeight\":1,\"breastDepth\":6,\"breastSpacing\":0.1,\"breastPosition\":0.8,\"breastDroop\":-3,\"breastUpper\":-2,\"breastLower\":-7,\"milkBalance\":16,\"breastFirmness\":70,\"breastBounce\":85,\"height\":6,\"upperLeg\":2.5,\"lowerLeg\":-1,\"torso\":-0.5,\"neck\":-1,\"upperArm\":-0.5,\"forearm\":1.5,\"shoulders\":-0.5,\"waist\":-10,\"hips\":1,\"head\":1,\"hands\":-6}}",
  "refine": false,
  "random": {
    "rules": {},
    "groups": []
  },
  "pregnancy": {
    "pregnant": false,
    "week": null,
    "weekAtBump": null,
    "firstWeekBump": null,
    "deliveryBump": null,
    "deliveryWeek": null,
    "afterBump": null,
    "births": {
      "single": 0,
      "twins": 0,
      "triplets": 0
    }
  }
} as HeroineLook['body'],
  // his clothes, as exported (both paint layers; the rest empty)
  // (his paint layers 1 and 2 are his export's own; layer 3 is the chest fill, painted here)
  // (from 0.5 of the way up his trunk, 70 degrees either side of his front: at her 0.7 and 45 a strip of his chest showed)
  maskPainters: [null, null, fillCleavage(0.966, 0.5, 70)],
  noCleavageBridge: true,
  clothes: {
  "outfit": "his long-sleeve shirt + tights",
  "shirtLength": 0,
  "layers": [
    {
      "choice": {
        "fabric": {
          "family": "athletic",
          "colour": 0,
          "tint": "#232326"
        },
        "match": true,
        "trim": null,
        "stitch": 1,
        "opacity": null
      },
      "detail": {
        "mode": "auto",
        "material": null,
        "override": {
          "nipple": 0.45,
          "navel": 0.8
        }
      },
      "template": {
        "id": "tightsMale",
        "params": {
          "riseFront": 0.1,
          "riseSide": 0.14,
          "riseBack": 0.18,
          "riseFrontWidth": 1,
          "legStart": 0,
          "legEnd": 1,
          "feet": false,
          "hemFront": null,
          "hemBack": null,
          "neckFront": null,
          "neckBack": null,
          "sleeve": -1,
          "topFront": null,
          "topBack": null,
          "topSide": null,
          "strap": 0,
          "strapIn": 0,
          "armhole": null,
          "neckStyle": "crew",
          "legCut": null,
          "length": null,
          "lowBand": {
            "waist": 0.035,
            "leg": 0.01
          }
        }
      },
      "mask": ""
    },
    {
      "choice": {
        "fabric": {
          "family": "jersey",
          "colour": 0,
          "tint": "#26324f"
        },
        "match": true,
        "trim": null,
        "stitch": 1,
        "opacity": null
      },
      "detail": {
        "mode": "auto",
        "material": null,
        "override": {
          "nipple": 0.45,
          "navel": 0.8
        }
      },
      "template": {
        "id": "teeLong",
        "params": {
          "riseFront": null,
          "riseSide": null,
          "riseBack": null,
          "riseFrontWidth": 1,
          "legStart": 0,
          "legEnd": 0,
          "feet": false,
          "hemFront": -0.1,
          "hemBack": -0.1,
          "neckFront": 0.966,
          "neckBack": 0.97,
          "sleeve": 1,
          "topFront": null,
          "topBack": null,
          "topSide": null,
          "strap": 0,
          "strapIn": 0,
          "armhole": null,
          "neckStyle": "crew",
          "legCut": null,
          "length": 0,
          "band": {
            "sleeve": 0.05
          }
        }
      },
      "mask": ""
    },
    // 3. THE GAP AT HIS CHEST FILLED IN, in his shirt's own navy jersey (painted by code, below). The builder's drawn
    //    tops leave the front of the chest between the breasts to the strip it lays across her cleavage; on him that
    //    strip was baked as a patch on his chest and a spike down between his legs, so it is left out (bakeLook.ts)
    //    and the gap is filled as her high-necked catsuits' is (catsuit.ts `fillCleavage`), up to his crew neck.
    {
      "choice": { "fabric": { "family": "jersey", "colour": 0, "tint": "#26324f" }, "match": true, "trim": null, "stitch": 1, "opacity": null },
      "detail": { "mode": "auto", "material": null, "override": { "nipple": 0.45, "navel": 0.8 } },
      "template": null,
      "mask": ""
    },
    null,
    null,
    null
  ],
  "garments": {},
  "detail": {
    "nipple": null,
    "navel": null
  },
  "shoes": "sneakers"
},
};
