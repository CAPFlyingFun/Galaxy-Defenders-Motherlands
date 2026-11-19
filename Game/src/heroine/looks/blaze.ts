// ============================================================================
// blaze.ts -- BLAZE (Bullet Mom), as Joshua saved her in the Character Builder.
//
// This is his own export from the Character Room (2026-11-16, builder v0.9.40):
// her body at 100 percent belly, and a painted two-piece in pink: a sports bra
// and low-rise leggings cut under the belly, so her belly is bare. It is the
// starting point for her "bare belly (two-piece)" outfit; the black panels,
// trim and the small 3D pieces (collar, shoulder caps, belt, boots, guns) are
// added on top of it in the game.
//
// One value differs from the export: the top's front neckline (neckFront) is 0.7, not 0.76, lowered at his word
// ("I forgot to lower the neckline for the top at 0.7") to sit closer to his reference picture of her.
// Otherwise the JSON below is pasted exactly as the builder wrote it (only the card's
// thumbnail picture and save time are left out). To change her painted outfit,
// change it in the Character Room, export, and paste the new entry here.
// ============================================================================
import type { HeroineLook } from '../heroineLook';

export const BLAZE_LOOK: HeroineLook = {
  name: 'Blaze',
  body: {
    "model": "v2-body",
    // (Joshua's export of 2026-11-19 00:58: "the updated Blaze stats as she will find out soon in the story she is
    // pregnant, but not visually be pregnant yet... the story will slowly add it as it progresses". Her BODY and her
    // PREGNANCY are his new ones -- 10 % belly, her first belly at 10 %, full term at 150 % in week 42, 30 % after her
    // birth; breast size 5 and her baby floating -- and her outfit below is left as it was, as on 2026-11-17.)
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
            "family": "flat",
            "colour": 0,
            "tint": "#ff4bff"
          },
          "match": true,
          "trim": {
            "family": "flat",
            "colour": 4
          },
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
          "id": "leggingsUnder",
          "params": {
            "riseFront": -0.06,
            "riseSide": 0.06499999999999995,
            "riseBack": 0.24,
            "riseFrontWidth": 1,
            "legStart": 0,
            "legEnd": 0.92,
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
              "waist": 0.015
            },
            "lowBowl": 0.7
          }
        },
        "mask": ""
      },
      {
        "choice": {
          "fabric": {
            "family": "flat",
            "colour": 0,
            "tint": "#ff4bff"
          },
          "match": true,
          "trim": {
            "family": "flat",
            "colour": 0,
            "tint": "#ff4bff"
          },
          "stitch": 1,
          "opacity": 1
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
            "hemFront": 0.63,
            "hemBack": 0.6599999999999998,
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
      "nipple": 0,
      "navel": 1
    },
    "shoes": "sneakers"
  },
};
