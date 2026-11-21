// ============================================================================
// bodyTurn.ts -- WHICH WAY EACH PART OF HER FACES.
//
// Joshua's rule (2026-11-17), in his words, with a picture of a body cut into
// five bands:
//   "You are facing north, you can turn your head (your camera in 1st person)
//    +/-90°, the shoulders/arms/hands at 80% of that to an angle of +/-72°,
//    belly/torso to +/-54°, upper legs to +/-36°, lower legs/feet to +/-18°...
//    with max ranges from relative North (body North)."
//
//        band                    share of her head's turn     at the most
//        head                    100 %                        90°
//        shoulders, arms, hands   80 %                        72°
//        belly and torso          60 %                        54°
//        upper legs               40 %                        36°
//        lower legs and feet      20 %                        18°
//
// BODY NORTH is the way she faces when nothing of her is turned: every band's
// turn is measured from it. It is the yaw the game gives her body.
//
// And from the rule he gave first that day, which this one tweaks:
//   * past the most her head turns, body North is pulled round after it ("the
//     feet move around in the turn"), so her head is never further from it;
//   * "if I don't move, her bottom half will catch up to match ... after 4s":
//     once the looking stops, body North comes round to where she looks, and
//     all of her faces one way again;
//   * "maybe add a slight lag between camera/head and arms for a more realistic
//     effect but both lock and end up the same direction": everything below her
//     head follows its turn a moment behind.
//   * HER HEAD LEADS, HER BODY CATCHES UP (Joshua, 2026-11-20: "when turning the
//     joystick left or right, what is happening is the body is turning but what
//     really should be happening is the joystick moving the head which the body
//     will catch up and look more natural in 1st and 3rd person"): each band
//     follows a moment behind the one above it, shoulders, then belly, then upper
//     legs, then feet (`bandLag`), whether her head turned or her whole body did;
//     and going a new way in third person with nothing to aim at, her head turns
//     to it first (before, it simply faced the way her body did).
//
// Every direction here is a compass angle like a heroine's yaw (radians, 0 = +Z,
// turning toward +X as it grows).
//
// WHERE SHE LOOKS comes from the game:
//   FIRST PERSON  the camera itself, followed at once (the camera is her eyes);
//   THIRD PERSON  the target her auto-aim has picked: her head turns to it at
//                 its own speed.
// And when she is MOVING, body North turns to the way she goes:
//   FIRST PERSON  as far as her head's reach from where she looks. So walking
//                 sideways she goes shoulder first, looking across herself, and
//                 walking backward she backs up;
//   THIRD PERSON  all the way: her legs carry her the way she runs, and she
//                 looks at a target within her head's reach of that. A target
//                 further round is not aimed at until she turns.
//
// This file only works out numbers. It knows nothing of three.js, the camera or
// the heroine's body, so it can be tested on its own.
// ============================================================================

const DEG = Math.PI / 180;
/** No band below her head follows its turn (standing, looking round freely). */
const NO_SHARES = { shoulders: 0, belly: 0, upperLegs: 0, feet: 0 } as const;

/** GAME TUNING for her turning. Angles in radians, times in seconds. */
export const TURN = {
  /** How far her head turns from body North, each way (Joshua: 90 degrees). */
  reach: 90 * DEG,
  /**
   * What share of her head's turn each band below it takes (Joshua's picture): at her head's full 90 degrees these
   * are 72, 54, 36 and 18 degrees.
   */
  shares: { shoulders: 0.8, belly: 0.6, upperLegs: 0.4, feet: 0.2 },
  /**
   * Once the looking stops, body North comes round the whole reach in this long; less to go takes less. (Joshua:
   * "after 4s" at first; "can we lower that 4s down to 1.3s?", 2026-11-17.)
   */
  catchUpSeconds: 1.3,
  /** The look counts as stopped when it turns slower than this each second; faster than that body North waits. */
  stillBelow: 20 * DEG,
  /** How long the look's turning speed is read over (a thumb on a screen moves in small jumps). */
  lookSmooth: 0.1,
  /**
   * HER HEAD LEADS (Joshua, 2026-11-20): each band below her head reaches its own turn about this long behind (seconds,
   * about two thirds of the way in that time), each a little more than the band above it, so a turn runs down her from
   * her head to her feet. (Before: all of them together, 0.09 s behind her head.)
   */
  bandLag: { shoulders: 0.1, belly: 0.18, upperLegs: 0.26, feet: 0.34 },
  /** THIRD PERSON, MOVING with nothing to aim at: how quickly her head turns to the way she goes (bigger is snappier). */
  headLead: 14,
  /** THIRD PERSON: how fast her head turns to a target, each second. */
  headSpeed: 360 * DEG,
  /** THIRD PERSON: the fastest her head pulls body North round after it, each second. */
  dragSpeed: 240 * DEG,
  /** MOVING: how quickly body North turns to the way she goes (bigger is snappier; her head is quicker: `headLead`). */
  moveTurn: 7,
  /**
   * FIRST PERSON, MOVING: she backs up when the way she moves is more than `backFrom` round from where she looks,
   * and steps forward again when it is back within `backUntil`. Both are a little past a right angle, so going
   * straight sideways she always steps FORWARD, shoulder first (never backward with her back to the way she goes),
   * and two numbers, so a thumb wavering at the line does not flick her between the two.
   */
  backFrom: 105 * DEG,
  backUntil: 95 * DEG,
  /** THIRD PERSON, MOVING: a target she already aims at is kept this far past her reach before she lets it go. */
  aimHold: 8 * DEG,
  /** THIRD PERSON, STANDING: her arms come up to aim once her head is within this of the target. */
  raiseWithin: 30 * DEG,
} as const;

/** What the game tells her turning each frame. */
export interface TurnInput {
  /** First person (the look is the camera, followed at once) or third (the look is a target her head turns to). */
  readonly view: 'first' | 'third';
  /** Where she looks, as a compass angle; null when there is nothing to look at (she looks the way she faces). */
  readonly look: number | null;
  /** The way she is moving over the ground, as a compass angle; null while she stands. */
  readonly move: number | null;
  /**
   * KEEP FACING THIS WAY (a compass angle), whichever way she moves: body North stays turned to it, so she steps
   * backward or sideways facing it (holding a door's handle: Joshua, 2026-11-18). Null or left out: as usual.
   */
  readonly hold?: number | null;
  /**
   * FREE LOOK (first person, standing still: Joshua, 2026-11-20): her head turns to the look, but body North stays where
   * it is: never pulled round, never coming round to match. The game keeps the look within her head's reach of it.
   */
  readonly free?: boolean;
  /**
   * HOLDING ON (first person at a bar, the railing, the table or a door): her head alone turns, up to `reach` from body
   * North; the rest of her stays square to what she holds. (Joshua, 2026-11-20, first: "30° just for the
   * shoulders/torso + the 90° for the head", then: "remove that extra 30° from the shoulders".)
   */
  readonly grip?: boolean;
}

/** An angle brought into -180°..180°. */
export function wrapAngle(angle: number): number {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
}
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** `from` eased toward `to` the short way round, about two thirds of the way in `seconds` (the same at any frame rate). */
function follow(from: number, to: number, seconds: number, dt: number): number {
  return wrapAngle(from + wrapAngle(to - from) * (1 - Math.exp(-dt / seconds)));
}
/** `from` turned toward `to` the short way round, by no more than `most`. */
function turnToward(from: number, to: number, most: number): number {
  return wrapAngle(from + clamp(wrapAngle(to - from), -most, most));
}

export class BodyTurn {
  /** BODY NORTH: the way she faces with nothing of her turned (the yaw the game gives her body). */
  base = 0;
  /** Which way her head points. */
  head = 0;
  /** How far her head tips up (+) or down (-), radians: set by the game (where she looks while she does something). */
  headPitch = 0;
  /** Which way her shoulders, arms and hands point (and her guns). */
  shoulders = 0;
  /** Which way her belly and torso (her hips with them) face. */
  belly = 0;
  /** Which way her upper legs face. */
  upperLegs = 0;
  /** Which way her lower legs and feet face. */
  feet = 0;
  /** She is aiming at what she looks at (false: it is too far round, or there is nothing; her arms come down). */
  aimed = false;
  /** FIRST PERSON, MOVING: she is backing up (stepping backward, body North facing away from the way she goes). */
  backing = false;

  /** Where she looked last frame, and how fast the look is turning (each second, smoothed). */
  private lastLook: number | null = null;
  private lookSpeed = 0;

  /** Stand her facing one way, all of her. */
  reset(yaw: number): void {
    this.base = this.head = this.shoulders = this.belly = this.upperLegs = this.feet = wrapAngle(yaw);
    this.aimed = false;
    this.backing = false;
    this.lastLook = null;
    this.lookSpeed = 0;
  }

  /** One frame of `dt` seconds. */
  step(dt: number, input: TurnInput): void {
    const reach = TURN.reach, first = input.view === 'first';

    // How fast the look is turning: body North only comes round to match once it has stopped.
    if (input.look !== null && this.lastLook !== null && dt > 0) {
      const speed = Math.abs(wrapAngle(input.look - this.lastLook)) / dt;
      this.lookSpeed += (speed - this.lookSpeed) * (1 - Math.exp(-dt / TURN.lookSmooth));
    } else if (input.look === null) this.lookSpeed = 0;
    this.lastLook = input.look;
    /** 1 when the look is still, 0 when it turns at `stillBelow` or faster. */
    const calm = 1 - clamp(this.lookSpeed / TURN.stillBelow, 0, 1);

    // ---- where her head wants to point, and where body North wants to be ----
    let headWant: number;
    if (input.hold !== undefined && input.hold !== null) {
      // HELD FACING ONE WAY: body North turns to it at her moving speed whether she moves or stands; her head looks
      // where she looks (within its reach of it, below)
      this.backing = false;
      this.base = wrapAngle(this.base + wrapAngle(input.hold - this.base) * (1 - Math.exp(-TURN.moveTurn * dt)));
      headWant = input.look ?? input.hold;
      this.aimed = false;
    } else if (input.move !== null) {
      // MOVING
      if (first && input.look !== null) {
        // First person: body North turns to the way she moves, or away from it when she backs up, no further than
        // her head's reach from where she looks.
        const round = Math.abs(wrapAngle(input.move - input.look));
        if (this.backing ? round < TURN.backUntil : round > TURN.backFrom) this.backing = !this.backing;
        const stepping = this.backing ? input.move + Math.PI : input.move;
        const baseWant = input.look + clamp(wrapAngle(stepping - input.look), -reach, reach);
        this.base = wrapAngle(this.base + wrapAngle(baseWant - this.base) * (1 - Math.exp(-TURN.moveTurn * dt)));
        headWant = input.look;
        this.aimed = true;
      } else {
        // Third person: body North is the way she runs; she looks at a target within her head's reach of that.
        this.backing = false;
        this.base = wrapAngle(this.base + wrapAngle(input.move - this.base) * (1 - Math.exp(-TURN.moveTurn * dt)));
        // (how far round the target is from the way she RUNS: body North is still turning to it when she sets off)
        const off = input.look === null ? Infinity : Math.abs(wrapAngle(input.look - input.move));
        this.aimed = off <= reach + (this.aimed ? TURN.aimHold : 0);
        // (nothing to aim at: her head looks the way she is going, and gets there before her body: `headLead`)
        headWant = this.aimed && input.look !== null ? input.look : input.move;
      }
    } else {
      // STANDING: she turns her head to what she looks at; body North stays until it is pulled round (below).
      this.backing = false;
      headWant = input.look ?? this.base;
      this.aimed = input.look !== null;
    }

    // ---- body North pulled round by her head: never more than her head's reach behind where it is to point ----
    // (not while she runs in third person: there body North goes the way she runs, and her head is held within reach)
    const behind = wrapAngle(headWant - this.base);
    const held = (input.hold !== undefined && input.hold !== null) || input.free === true;
    if (Math.abs(behind) > reach && (first || input.move === null) && !held) {
      const want = headWant - Math.sign(behind) * reach;
      // (first person the camera cannot wait, so body North keeps up exactly; third person it turns at its own speed)
      this.base = first ? wrapAngle(want) : turnToward(this.base, want, TURN.dragSpeed * dt);
    }

    // ---- her head: at once in first person; at its own speed in third; never past its reach from body North ----
    // (third person, going somewhere with nothing to aim at: eased to the way she goes, quicker than her body)
    const leading = !first && input.move !== null && !this.aimed && (input.hold === undefined || input.hold === null);
    this.head = first ? wrapAngle(headWant)
      : leading ? wrapAngle(this.head + wrapAngle(headWant - this.head) * (1 - Math.exp(-TURN.headLead * dt)))
      : turnToward(this.head, headWant, TURN.headSpeed * dt);
    this.head = wrapAngle(this.base + clamp(wrapAngle(this.head - this.base), -reach, reach));

    // ---- standing with the look stopped: body North comes round to match, the whole reach in `catchUpSeconds` ----
    // (not while her facing is held, or she looks round freely: see `free`)
    if (input.move === null && !held) {
      const pace = (reach / TURN.catchUpSeconds) * calm;
      this.base = turnToward(this.base, this.head, pace * dt);
    }

    // ---- the bands below her head: each its share of her head's turn, ending where it ends, but each a moment behind
    //      the band above it (HER HEAD LEADS: `bandLag`), whether her head turned or body North did ----
    const turned = wrapAngle(this.head - this.base);
    // (STANDING, LOOKING ROUND FREELY: her head alone turns, the rest of her stays square (Joshua, 2026-11-20: "unlink
    //  that rule when standing still so the head is truly independent"; her shoulders still turning after a drag
    //  stopped had pulled the view back a little); HOLDING ON, the same: her head alone)
    const lag = TURN.bandLag;
    const shares = input.free || input.grip ? NO_SHARES : TURN.shares;
    this.shoulders = follow(this.shoulders, this.base + shares.shoulders * turned, lag.shoulders, dt);
    this.belly = follow(this.belly, this.base + shares.belly * turned, lag.belly, dt);
    this.upperLegs = follow(this.upperLegs, this.base + shares.upperLegs * turned, lag.upperLegs, dt);
    this.feet = follow(this.feet, this.base + shares.feet * turned, lag.feet, dt);

    // (third person, standing: her arms come up once her head has nearly turned to the target)
    if (!first && input.move === null && input.look !== null) this.aimed = Math.abs(wrapAngle(input.look - this.head)) <= TURN.raiseWithin;
  }
}
