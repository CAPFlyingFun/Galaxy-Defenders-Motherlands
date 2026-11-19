// ============================================================================
// blazePink.ts -- BLAZE exactly as Joshua saved her on 2026-11-19 (Character
// Room export, 00:58): her new body and pregnancy (10 % belly, full term at
// 150 % in week 42) AND her outfit as he saved it: the builder's athletic fabric
// all in pink, a sports bra and under-belly leggings cut short (to 0.23 of her
// leg), sneakers.
//
// A LOOK TO TRY (Joshua, 2026-11-19: "Try the outfit even though all pink and
// see if that's better"): open it with ?look=blazePink. The game's Blaze stays
// in blazeSuit.ts until he picks. Pasted exactly as the builder wrote it (only
// the card's thumbnail picture and save time are left out).
// ============================================================================
import type { HeroineLook } from '../heroineLook';

export const BLAZE_PINK_LOOK: HeroineLook = {
  name: 'Blaze',
  body: {
    "model": "v2-body",
    "bump": 10,
    "shape": "{\"version\":1,\"shape\":{\"bellyLower\":5,\"navel\":20,\"babyFloat\":200,\"breastSize\":5,\"milk\":50,\"breastBounce\":200,\"walkBob\":200,\"walkSway\":200,\"legGap\":1.5}}",
    "refine": false,
    "random": {
      "rules": {},
      "groups": []
    },
    "pregnancy": {
      "pregnant": true,
      "week": null,
      "weekAtBump": null,
      "firstWeekBump": 10,
      "deliveryBump": 150,
      "deliveryWeek": 42,
      "afterBump": 30,
      "births": null
    }
  },
  clothes: {
    "outfit": "painted sports bra + leggings",
    "shirtLength": 0,
    "layers": [
      {
        "choice": {
          "fabric": {
            "family": "athletic",
            "colour": 0,
            "tint": "#ff08fe"
          },
          "match": true,
          "trim": {
            "family": "athletic",
            "colour": 0,
            "tint": "#ff08fe"
          },
          "stitch": 0.5,
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
          "id": "leggingsUnder",
          "params": {
            "riseFront": -0.07,
            "riseSide": 0.03499999999999989,
            "riseBack": 0.21,
            "riseFrontWidth": 1,
            "legStart": 0,
            "legEnd": 0.23,
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
              "waist": 0.0085
            },
            "lowBowl": 0.7
          }
        },
        "mask": ""
      },
      {
        "choice": {
          "fabric": {
            "family": "athletic",
            "colour": 0,
            "tint": "#ff07fe"
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
          "id": "sportsBra",
          "params": {
            "riseFront": null,
            "riseSide": null,
            "riseBack": null,
            "riseFrontWidth": 1,
            "legStart": 0,
            "legEnd": 0,
            "feet": false,
            "hemFront": 0.65,
            "hemBack": 0.6799999999999998,
            "neckFront": 0.7,
            "neckBack": 0.86,
            "sleeve": -1,
            "topFront": null,
            "topBack": null,
            "topSide": null,
            "strap": 0.65,
            "strapIn": 0.85,
            "armhole": 0.78,
            "neckStyle": "crew",
            "legCut": null,
            "length": null,
            "band": {
              "hem": 0.035
            },
            "top": "sportsBra"
          }
        },
        "mask": ""
      },
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
