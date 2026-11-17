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

/** GAME TUNING for her turning. Angles in radians, times in seconds. */
export const TURN = {
  /** How far her head turns from body North, each way (Joshua: 90 degrees). */
  reach: 90 * DEG,
  /**
   * What share of her head's turn each band below it takes (Joshua's picture): at her head's full 90 degrees these
   * are 72, 54, 36 and 18 degrees.
   */
  shares: { shoulders: 0.8, belly: 0.6, upperLegs: 0.4, feet: 0.2 },
  /** Once the looking stops, body North comes round the whole reach in this long (Joshua: "after 4s"); less to go takes less. */
  catchUpSeconds: 4,
  /** The look counts as stopped when it turns slower than this each second; faster than that body North waits. */
  stillBelow: 20 * DEG,
  /** How long the look's turning speed is read over (a thumb on a screen moves in small jumps). */
  lookSmooth: 0.1,
  /** Everything below her head follows its turn: about this long to cover most of the way. */
  followLag: 0.09,
  /** THIRD PERSON: how fast her head turns to a target, each second. */
  headSpeed: 360 * DEG,
  /** THIRD PERSON: the fastest her head pulls body North round after it, each second. */
  dragSpeed: 240 * DEG,
  /** MOVING: how quickly body North turns to the way she goes (bigger is snappier). */
  moveTurn: 10,
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
}

/** An angle brought into -180°..180°. */
export function wrapAngle(angle: number): number {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
}
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** `from` turned toward `to` the short way round, by no more than `most`. */
function turnToward(from: number, to: number, most: number): number {
  return wrapAngle(from + clamp(wrapAngle(to - from), -most, most));
}

export class BodyTurn {
  /** BODY NORTH: the way she faces with nothing of her turned (the yaw the game gives her body). */
  base = 0;
  /** Which way her head points. */
  head = 0;
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

  /** How far the bands below her head have followed its turn from body North (her head's turn, a moment behind). */
  private followed = 0;
  /** Where she looked last frame, and how fast the look is turning (each second, smoothed). */
  private lastLook: number | null = null;
  private lookSpeed = 0;

  /** Stand her facing one way, all of her. */
  reset(yaw: number): void {
    this.base = this.head = this.shoulders = this.belly = this.upperLegs = this.feet = wrapAngle(yaw);
    this.followed = 0;
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
    if (input.move !== null) {
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
        headWant = this.aimed && input.look !== null ? input.look : this.base;
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
    if (Math.abs(behind) > reach && (first || input.move === null)) {
      const want = headWant - Math.sign(behind) * reach;
      // (first person the camera cannot wait, so body North keeps up exactly; third person it turns at its own speed)
      this.base = first ? wrapAngle(want) : turnToward(this.base, want, TURN.dragSpeed * dt);
    }

    // ---- her head: at once in first person; at its own speed in third; never past its reach from body North ----
    this.head = first ? wrapAngle(headWant) : turnToward(this.head, headWant, TURN.headSpeed * dt);
    this.head = wrapAngle(this.base + clamp(wrapAngle(this.head - this.base), -reach, reach));

    // ---- standing with the look stopped: body North comes round to match, the whole reach in `catchUpSeconds` ----
    if (input.move === null) {
      const pace = (reach / TURN.catchUpSeconds) * calm;
      this.base = turnToward(this.base, this.head, pace * dt);
    }

    // ---- the bands below her head: each its share of her head's turn, a moment behind, ending where it ends ----
    const turned = wrapAngle(this.head - this.base);
    this.followed = clamp(this.followed + (turned - this.followed) * (1 - Math.exp(-dt / TURN.followLag)), -reach, reach);
    this.shoulders = wrapAngle(this.base + TURN.shares.shoulders * this.followed);
    this.belly = wrapAngle(this.base + TURN.shares.belly * this.followed);
    this.upperLegs = wrapAngle(this.base + TURN.shares.upperLegs * this.followed);
    this.feet = wrapAngle(this.base + TURN.shares.feet * this.followed);

    // (third person, standing: her arms come up once her head has nearly turned to the target)
    if (!first && input.move === null && input.look !== null) this.aimed = Math.abs(wrapAngle(input.look - this.head)) <= TURN.raiseWithin;
  }
}
