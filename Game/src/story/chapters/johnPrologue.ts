// ============================================================================
// johnPrologue.ts -- THE PROLOGUE, SCENE 1: "BENEATH THE ISLAND" (John), as a script.
//
// Joshua's opening demo, Draft 1 (2026-11-22; docs/plan/MOTHERLANDS_PLAN.md, section 5 "The opening demo"). Story and
// dialogue are PROVISIONAL: the lines below are the draft's own, and change when the draft does. Written so it reads
// like the draft: each `await` waits for the game (a line read, a place reached, a wall scanned).
//
//   DAY 9 | 07:42 | A.R.C.H. EXPEDITION SITE. Black. Water dripping. The radio.
//   The flashlight flickers on; the player takes over. OBJECTIVE: Rejoin the expedition.
//   The markings that "weren't in the original survey"; John scans them; the A.R.C.H. display rebuilds part of an
//   inscription, several symbols unidentified. A faint vibration: "Did anyone else feel that?"
//   Further on, the vibration again, a little stronger. At the passage's end, the chamber's blue light through a gap.
//
// The scene ends there for now (Scene 2, the chamber, is the next version): a card says so, with Play again.
// Two more walls of markings can be found and scanned on the way (not needed): their symbols repeat the first
// wall's, and not quite, which is where Scene 2's "almost like... instructions" begins.
// ============================================================================

import type { StoryDirector, ScanReport } from '../storyDirector';
import type { Tunnel } from '../../world/prologue/tunnel';
import type { Flashlight } from '../../world/prologue/flashlight';
import type { CaveSounds } from '../../world/prologue/caveSounds';

/** What the script works with in the scene. */
export interface PrologueWorld {
  readonly tunnel: Tunnel;
  readonly flashlight: Flashlight;
  readonly sounds: CaveSounds;
  /** How far along the passage John is (metres from its start). */
  progress(): number;
  /** The scene again from the start (the game restarts, on the prologue). */
  playAgain(): void;
}

/** The three walls that can be scanned, in the order they are passed. */
const WALLS = ['markingA', 'markingB', 'markingC'] as const;

/** What the scanner's display says of each wall. (PROVISIONAL, a blockout's words.) */
const REPORTS: Record<string, ScanReport> = {
  markingA: {
    title: 'A.R.C.H. FIELD SCANNER · INSCRIPTION 1',
    lines: [
      'Reconstructed 58% · 18 symbols',
      'Identified: 4 types (S-101, S-205, S-312, S-418)',
      'Unidentified: 6 · no match in expedition records',
      'Not in the original survey · est. 30 m of sediment above',
    ],
  },
  markingB: {
    title: 'A.R.C.H. FIELD SCANNER · INSCRIPTION 2',
    lines: [
      'Reconstructed 41% · 10 symbols',
      'S-101, S-205, S-312, S-418 repeat from Inscription 1',
      'Near-matches: S-109, S-433 · same outer form, different marks',
      'Order differs from Inscription 1',
    ],
  },
  markingC: {
    title: 'A.R.C.H. FIELD SCANNER · INSCRIPTION 3',
    lines: [
      'Reconstructed 33% · 12 symbols',
      'S-101 appears 5 times',
      'Unidentified: 7 · outer forms unknown (family 6xx)',
      'Note: arrangement suggests a sequence',
    ],
  },
};

/** The line under the objective: the walls scanned so far. */
function scannedLine(story: StoryDirector): string {
  const n = story.scannedOf(WALLS);
  return n === 0 ? 'Follow the passage' : `Follow the passage · markings scanned ${n} / ${WALLS.length}`;
}

/** Scene 1. Runs from the first frame of play to the end of the passage. */
export async function playBeneathTheIsland(story: StoryDirector, w: PrologueWorld): Promise<void> {
  const wallA = w.tunnel.markings.find((m) => m.id === 'markingA');
  story.addScannables(w.tunnel.markings.filter((m) => m.scannable));
  story.reportFor = (id) => REPORTS[id] ?? { title: 'A.R.C.H. FIELD SCANNER', lines: [] };
  // (every wall scanned, wherever in the scene: the count under the objective)
  let past = false;
  story.onScanned = () => { if (past) story.objectiveLine(scannedLine(story)); };

  // ---- BLACK. Water drips somewhere in the darkness. A radio crackles. -----------------------------------------------
  story.locked = true;
  story.overlay.fade(1, 0);
  w.flashlight.set(false);
  await story.wait(0.9);
  story.overlay.showTimeCard('DAY 9  |  07:42  |  A.R.C.H. EXPEDITION SITE');
  await story.wait(3.4);
  story.overlay.showTimeCard(null);
  await story.wait(1.0);
  await story.say('EXPEDITION LEADER', 'John? You still with us?', { radio: true });
  await story.say('JOHN', 'Unfortunately. I’ve been staring at the same rock for twenty minutes.');
  await story.say('EXPEDITION LEADER', 'Then you’ll be happy to know we found another one.', { radio: true });
  await story.say('JOHN', 'Wonderful. I’ll name it after you.');

  // ---- A flashlight flickers on. Ancient passageways stretch ahead. Player gains control. ---------------------------
  w.sounds.click();
  w.flashlight.set(true);
  w.flashlight.flicker([0.12, 0.2, 0.45, 0.52, 0.95, 1.05, 1.4], false);
  story.overlay.fade(0, 0.5);
  await story.wait(1.6);
  story.locked = false;
  story.objective('REJOIN THE EXPEDITION', 'Follow the passage');
  story.hint('MOVE to walk · 🔦 LIGHT turns the flashlight off and on', 7);

  // ---- "These markings weren't in the original survey." -------------------------------------------------------------
  const sA = wallA?.s ?? 23;
  await story.until(() => w.progress() > sA - 6.5);
  await story.say('JOHN', 'These markings weren’t in the original survey.');
  await story.say('RESEARCHER', 'Probably because the original survey didn’t include a wall buried under thirty meters of sediment.', { radio: true });
  await story.say('JOHN', 'Fair point.');
  story.objectiveLine('Scan the markings on the wall');
  if (!story.isScanned('markingA')) story.hint('Go up to the markings, look at them and tap SCAN', 7);
  // John scans the wall (or, if he walks on past it, the story goes on without it)
  await Promise.race([story.scanned('markingA'), story.until(() => w.progress() > sA + 12)]);
  past = true;
  story.objectiveLine(scannedLine(story));

  // ---- A faint vibration passes through the stone. -------------------------------------------------------------------
  await story.wait(1.2);
  w.sounds.rumble(2.8, 0.35);
  story.shake(0.012, 2.6);
  await story.wait(2.4);
  await story.say('JOHN', 'Did anyone else feel that?');
  await story.say('EXPEDITION LEADER', 'Feel what?', { radio: true });
  await story.say('JOHN', 'Never mind. Probably the equipment.');
  story.objectiveLine(scannedLine(story));

  // ---- The vibration returns, slightly stronger. ---------------------------------------------------------------------
  await story.until(() => w.progress() > 67);
  w.sounds.rumble(3.6, 0.75);
  story.shake(0.03, 3.2);
  w.flashlight.flicker([0.35, 0.42, 1.1, 1.16, 1.3, 1.42], true);

  // ---- The passage's end: the chamber's light through the gap. ------------------------------------------------------
  await story.until(() => w.progress() > w.tunnel.length - 7);
  story.objectiveDone();
  await story.wait(1.6);
  const found = story.scannedOf(WALLS);
  story.overlay.showCard('SCENE 1 COMPLETE', [
    'Beneath the Island · Rejoin the expedition ✓',
    `Markings scanned: ${found} of ${WALLS.length}`,
    'Next: Scene 2, The Chamber (the next version)',
  ], [
    { label: 'Play again', act: () => w.playAgain() },
    { label: 'Keep exploring', act: () => { story.overlay.hideCard(); story.overlay.setObjective(null); } },
  ]);
}
