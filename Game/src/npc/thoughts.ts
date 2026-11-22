// ============================================================================
// thoughts.ts -- WHAT A BRAIN IS THINKING, as a few short lines for the bubble over their head.
//
// Joshua, 2026-11-21: "maybe draw over John his state of mind 🧠 that way I can know what it's 'Thinking' and if it's
// working." The bubble (ui/thoughtBubble.ts) shows these lines over whoever is NOT being played (John while you play
// Blaze, Blaze while you play John), so you can watch their brain work:
//
//   🧠 John · AUTO · L 19 R 18      who, AUTO or MANUAL, the rounds in each gun
//   🔫 Firing at target 3 · 2/6     what their brain is doing NOW (its active order), and how far along
//   🎯 target 3 is nearest: fire    WHY: the fight routine's last decision (npc/autoCombat.ts `thought`)
//   🩺 Needs are fine               the needs routine's last decision (npc/routines.ts `thought`)
//   ⏭ next: 🚽 bathroom             the next order waiting, if any
//   ✓ Drew guns                     how the last order ended (✓ done, ⏸ interrupted, ✗ failed and why)
//   🚽 45 💧 60 🍽️ 70 🔋 80 ⚠️ 30     their needs and the danger, as their brain sees them (percent)
//   📏 8.4 m to John · 📷 9.1 m      how far they are from the one played and from the camera (v0.2.145)
//   🔍 30% · sharp · live ✓          how they are drawn: detail, the sharp set, Blaze's live body awake
//
// Nothing here decides anything: it only reads the brain, so it can never change what they do. Each line is kept
// short (about 30 letters) so the bubble stays small on the phone.
// ============================================================================
import type { NpcBrain } from './brain';
import type { AutoCombat } from './autoCombat';
import type { GdmActorPort } from './gdmPort';
import type { NeedsRoutine } from './routines';
import type { BrainEvent, FullCommand } from './types';

/** Everything the bubble reads from one character. */
export interface ThoughtSource {
  name: string;
  brain: NpcBrain;
  port: GdmActorPort;
  combat: AutoCombat | null;
  needs: NeedsRoutine | null;
  /** AUTO (their brain fights) or MANUAL (it holds fire). */
  auto: boolean;
  /** Rounds in each gun (null: no gun in that hand). */
  rounds: { left: number | null; right: number | null };
  /**
   * HOW FAR, AND HOW THEY ARE DRAWN (Joshua, 2026-11-22: "add in the stats of the AI player, distance to other character
   * so I can get where I want the better quality to be"): metres from the one played (`from`, their name) and from the
   * camera; their detail now (percent); whether they wear their sharp set; Blaze's live body awake (null: none).
   */
  view?: { apart: number | null; from: string; camera: number | null; detail: number | null; sharp: boolean | null; live: boolean | null };
}

/** The longest a line may be, in letters, before it is cut with '…' (the bubble is about 190 px wide). */
const LONGEST = 32;
const cut = (text: string): string => (text.length > LONGEST ? `${text.slice(0, LONGEST - 1)}…` : text);

/** A target's id ('target:3') as words ('target 3'). */
const targetName = (id: string): string => id.replace(':', ' ');

/** An order in a few words, with its emoji: what they are doing (`now`) or are about to do. */
function orderWords(c: Readonly<FullCommand>, elapsed: number | null, port: GdmActorPort): string {
  // (seconds left of a timed order, while it runs)
  const left = (seconds: number): string => (elapsed === null ? '' : ` · ${Math.max(0, Math.ceil(seconds - elapsed))} s`);
  switch (c.kind) {
    case 'fireAt': return `🔫 Firing at ${targetName(c.targetId)}${elapsed === null ? '' : ` · ${port.firedFor(c.id)}/${c.maxShots}`}`;
    case 'draw': return '✋ Drawing guns';
    case 'holster': return '✋ Holstering guns';
    case 'reload': return '🔄 Reloading';
    case 'useBathroom': return `🚽 Bathroom${left(c.seconds ?? 10)}`;
    case 'rest': return `😴 Resting${left(c.seconds)}`;
    case 'eat': return '🍽️ Eating';
    case 'drink': return '💧 Drinking';
    case 'walkTo': case 'walkToObject': return '🚶 Walking';
    case 'follow': return `🚶 Following ${c.targetId}`;
    case 'wait': return `⏳ Waiting${left(c.seconds)}`;
    case 'grab': return `✊ Grabbing the ${c.bar}`;
    case 'releaseGrip': return '✋ Letting go';
    case 'openDoor': return '🚪 Opening the door';
    default: return `• ${c.kind}`;
  }
}

/** How an order ended, in a few words: ✓ done, ⏸ interrupted, ✗ failed (with its reason). */
function endWords(e: BrainEvent): string {
  const what = e.kind === 'fireAt' ? 'Fired' : e.kind === 'draw' ? 'Drew guns' : e.kind === 'holster' ? 'Holstered'
    : e.kind === 'reload' ? 'Reloaded' : e.kind === 'useBathroom' ? 'Bathroom' : e.kind;
  if (e.phase === 'completed') return `✓ ${what}`;
  if (e.phase === 'interrupted') return `⏸ ${what}: ${e.reason ?? 'stopped'}`;
  return `✗ ${what}: ${e.reason ?? 'failed'}`;
}

/** The bubble's lines for one character, top to bottom. */
export function thoughtLines(s: ThoughtSource): string[] {
  const { brain, port } = s;
  const lines: string[] = [];
  const state = brain.inspect();
  // 1. WHO, AUTO OR MANUAL, AND THEIR ROUNDS (and the brain's mode, if it is not running them: 'player', 'scripted')
  const gun = (n: number | null): string => (n === null ? '–' : String(n));
  const mode = state.mode === 'ai' ? '' : ` · ${state.mode}`;
  lines.push(`🧠 ${s.name} · ${s.auto ? 'AUTO' : 'MANUAL'} · L ${gun(s.rounds.left)} R ${gun(s.rounds.right)}${mode}`);
  // 2. WHAT IT IS DOING NOW (its active order), or idle
  const active = brain.active;
  lines.push(active ? orderWords(active, state.active?.elapsed ?? 0, port) : '💤 Idle');
  // 3-4. WHY: the fight's and the needs' last decisions
  if (s.combat?.thought) lines.push(`🎯 ${s.combat.thought}`);
  if (s.needs?.thought) lines.push(`🩺 ${s.needs.thought}`);
  // 5. WHAT IS NEXT (the first order waiting)
  const next = brain.queued[0];
  if (next) lines.push(`⏭ next: ${orderWords(next, null, port)}${brain.queued.length > 1 ? ` +${brain.queued.length - 1}` : ''}`);
  // 6. HOW THE LAST ORDER ENDED (the newest event that is not a start)
  for (let i = brain.events.length - 1; i >= 0; i--) {
    const e = brain.events[i];
    if (e && e.phase !== 'started') { lines.push(endWords(e)); break; }
  }
  // 7. THEIR NEEDS AND THE DANGER, as their brain sees them
  const o = port.observe(), n = o.needs, pct = (v: number): number => Math.round(v * 100);
  lines.push(`🚽 ${pct(n.bathroom)} 💧 ${pct(n.water)} 🍽️ ${pct(n.food)} 🔋 ${pct(n.energy)}${o.danger > 0.05 ? ` ⚠️ ${pct(o.danger)}` : ''}`);
  // 8. HOW FAR, AND HOW THEY ARE DRAWN (for tuning the distances: Joshua, 2026-11-22)
  const v = s.view;
  if (v) {
    const m = (x: number): string => `${x < 10 ? x.toFixed(1) : Math.round(x)} m`;
    if (v.apart !== null || v.camera !== null) {
      lines.push([v.apart !== null ? `📏 ${m(v.apart)} to ${v.from}` : '', v.camera !== null ? `📷 ${m(v.camera)}` : ''].filter(Boolean).join(' · '));
    }
    const drawn = [
      v.detail !== null ? `🔍 ${Math.round(v.detail)}%` : '',
      v.sharp === null ? '' : v.sharp ? 'sharp' : 'plain',
      v.live === null ? '' : v.live ? 'live ✓' : 'live 💤',
    ].filter(Boolean);
    if (drawn.length) lines.push(drawn.join(' · '));
  }
  return lines.map(cut);
}
