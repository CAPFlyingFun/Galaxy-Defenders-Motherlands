// ============================================================================
// bodyTurn.ts -- WHICH WAY HER TOP HALF AND HER BOTTOM HALF FACE.
//
// Joshua's rule (2026-11-17), in his words:
//   "her head and arms rotate up to +/-45° from her relative body direction to
//    her hips and legs, after 45° the head and torso is still 45° from the
//    bottom half still at around 45° in a locked position while the feet move
//    around in the turn so like if she is facing North... I look to the right,
//    the head and shoulders/torso will match (maybe add a slight lag between
//    camera/head and arms for a more realistic effect but both lock and end up
//    the same direction and angles), once my top half is facing North East, the
//    lower half starts to catch up so if I am now facing East, her lower half is
//    facing North East, and if I don't move, her bottom half will catch up to
//    match the same East direction after 4s."
//
// So she has THREE directions, each a compass angle like a heroine's yaw
// (radians, 0 = +Z, turning toward +X as it grows):
//   legs   her hips, legs and feet (this is the yaw the game gives her body);
//   head   where her head points: it leads;
//   torso  her chest, arms and guns: they follow her head a moment behind and
//          end on the same direction.
//
// WHERE SHE LOOKS comes from the game:
//   FIRST PERSON  the camera itself, followed at once (the camera is her eyes);
//   THIRD PERSON  the target her auto-aim has picked: her head turns to it at
//                 its own speed.
// And when she is MOVING:
//   FIRST PERSON  her legs turn toward the way she moves, as far as 45° from
//                 where she looks (so walking sideways she walks half-turned,
//                 and walking backward she backs up);
//   THIRD PERSON  her legs face the way she runs, and her top half aims up to
//                 45° off that. A target further round is not aimed at until
//                 she turns.
//
// This file only works out numbers. It knows nothing of three.js, the camera or
// the heroine's body, so it can be tested on its own (it is: see the numbers in
// the commit that added it).
// ============================================================================

const DEG = Math.PI / 180;

/** GAME TUNING for her turning. Angles in radians, times in seconds. */
export const TURN = {
  /** How far her top half turns from her hips and legs, each way (Joshua: 45 degrees). */
  reach: 45 * DEG,
  /** Once the looking stops, her legs come round the whole reach in this long (Joshua: "after 4s"); less to go takes less. */
  catchUpSeconds: 4,
  /** The look counts as stopped when it turns slower than this each second; faster than that her legs wait. */
  stillBelow: 20 * DEG,
  /** How long the look's turning speed is read over (a thumb on a screen moves in small jumps). */
  lookSmooth: 0.1,
  /** Her torso and arms follow her head: about this long to cover most of the way. */
  torsoLag: 0.12,
  /** THIRD PERSON: how fast her head turns to a target, each second. */
  headSpeed: 360 * DEG,
  /** THIRD PERSON: the fastest her top half pulls her legs round after it, each second. */
  dragSpeed: 240 * DEG,
  /** MOVING: how quickly her legs turn to the way she goes (bigger is snappier). */
  moveTurn: 10,
  /**
   * FIRST PERSON, MOVING: she backs up when the way she moves is more than `backFrom` round from where she looks,
   * and steps forward again when it is back within `backUntil` (two numbers, so going exactly sideways she does
   * not flick between the two).
   */
  backFrom: 100 * DEG,
  backUntil: 80 * DEG,
  /** THIRD PERSON, MOVING: a target she already aims at is kept this far past her reach before she lets it go. */
  aimHold: 8 * DEG,
  /** Her arms come up to aim once her torso is within this of the target. */
  raiseWithin: 30 * DEG,
} as const;

/** What the game tells her turning each frame. */
export interface TurnInput {
  /** First person (the look is the camera, followed at once) or third (the look is a target her head turns to). */
  readonly view: 'first' | 'third';
  /** Where she looks, as a compass angle; null when there is nothing to look at (she looks the way her legs face). */
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
  /** Which way her hips, legs and feet face. */
  legs = 0;
  /** Which way her head points. */
  head = 0;
  /** Which way her chest, arms and guns point. */
  torso = 0;
  /** She is aiming at what she looks at (false: it is too far round, or there is nothing; her arms come down). */
  aimed = false;
  /** FIRST PERSON, MOVING: she is backing up (stepping backward, her legs facing away from the way she goes). */
  backing = false;

  /** Where she looked last frame, and how fast the look is turning (each second, smoothed). */
  private lastLook: number | null = null;
  private lookSpeed = 0;

  /** Stand her facing one way, all of her. */
  reset(yaw: number): void {
    this.legs = this.head = this.torso = wrapAngle(yaw);
    this.aimed = false;
    this.backing = false;
    this.lastLook = null;
    this.lookSpeed = 0;
  }

  /** One frame of `dt` seconds. */
  step(dt: number, input: TurnInput): void {
    const reach = TURN.reach, first = input.view === 'first';

    // How fast the look is turning: her legs only come round to match once it has stopped.
    if (input.look !== null && this.lastLook !== null && dt > 0) {
      const speed = Math.abs(wrapAngle(input.look - this.lastLook)) / dt;
      this.lookSpeed += (speed - this.lookSpeed) * (1 - Math.exp(-dt / TURN.lookSmooth));
    } else if (input.look === null) this.lookSpeed = 0;
    this.lastLook = input.look;
    /** 1 when the look is still, 0 when it turns at `stillBelow` or faster. */
    const calm = 1 - clamp(this.lookSpeed / TURN.stillBelow, 0, 1);

    // ---- where her head wants to point, and where her legs want to face ----
    let headWant: number;
    if (input.move !== null) {
      // MOVING
      if (first && input.look !== null) {
        // First person: her legs turn toward the way she moves, or away from it when she backs up, no further than
        // her reach from where she looks.
        const round = Math.abs(wrapAngle(input.move - input.look));
        if (this.backing ? round < TURN.backUntil : round > TURN.backFrom) this.backing = !this.backing;
        const stepping = this.backing ? input.move + Math.PI : input.move;
        const legsWant = input.look + clamp(wrapAngle(stepping - input.look), -reach, reach);
        this.legs = wrapAngle(this.legs + wrapAngle(legsWant - this.legs) * (1 - Math.exp(-TURN.moveTurn * dt)));
        headWant = input.look;
        this.aimed = true;
      } else {
        // Third person: her legs face the way she runs; her top half aims at a target within her reach of that.
        this.backing = false;
        this.legs = wrapAngle(this.legs + wrapAngle(input.move - this.legs) * (1 - Math.exp(-TURN.moveTurn * dt)));
        // (how far round the target is from the way she RUNS: her legs are still turning to it when she sets off)
        const off = input.look === null ? Infinity : Math.abs(wrapAngle(input.look - input.move));
        this.aimed = off <= reach + (this.aimed ? TURN.aimHold : 0);
        headWant = this.aimed && input.look !== null ? input.look : this.legs;
      }
    } else {
      // STANDING: she turns her head to what she looks at; her legs stay until they are pulled round (below).
      this.backing = false;
      headWant = input.look ?? this.legs;
      this.aimed = input.look !== null;
    }

    // ---- her legs pulled round by her top half: never more than her reach behind where her head is to point ----
    // (not while she runs in third person: there her legs go the way she runs, and her head is held within reach)
    const behind = wrapAngle(headWant - this.legs);
    if (Math.abs(behind) > reach && (first || input.move === null)) {
      const want = headWant - Math.sign(behind) * reach;
      // (first person the camera cannot wait, so her legs keep up exactly; third person they turn at their own speed)
      this.legs = first ? wrapAngle(want) : turnToward(this.legs, want, TURN.dragSpeed * dt);
    }

    // ---- her head: at once in first person; at its own speed in third; never past her reach from her legs ----
    this.head = first ? wrapAngle(headWant) : turnToward(this.head, headWant, TURN.headSpeed * dt);
    this.head = wrapAngle(this.legs + clamp(wrapAngle(this.head - this.legs), -reach, reach));

    // ---- standing with the look stopped: her legs come round to match, the whole reach in `catchUpSeconds` ----
    if (input.move === null) {
      const pace = (reach / TURN.catchUpSeconds) * calm;
      this.legs = turnToward(this.legs, this.head, pace * dt);
    }

    // ---- her torso and arms follow her head, a moment behind, and end where it ends ----
    this.torso = wrapAngle(this.torso + wrapAngle(this.head - this.torso) * (1 - Math.exp(-dt / TURN.torsoLag)));
    this.torso = wrapAngle(this.legs + clamp(wrapAngle(this.torso - this.legs), -reach, reach));

    // (third person, standing: her arms come up once her torso has nearly turned to the target)
    if (!first && input.move === null && input.look !== null) this.aimed = Math.abs(wrapAngle(input.look - this.torso)) <= TURN.raiseWithin;
  }
}
