# Motherlands NPC Brain Template v0.1 🧠

**Created as a standalone, testable TypeScript handoff for Claude.** No GitHub files were changed.

## Purpose

One reusable brain per character, suitable for **Mary “Blaze” Fisher**, **John “Sparks” Fisher**, and future A.R.C.H. NPCs. When a character is not player-controlled, its brain can walk to targets, use existing GDM doors and grab-bars, eat, drink, use a bathroom, rest, call a partner, work on archaeological objects, or fire a limited number of shots with explicit game permission.

This is a **template and adapter, not a finished GDM feature**. The pure task scheduler, priorities, needs routine, control modes, action dispatch and tests are working. GDM-specific animation and world hooks still require integration.

## What is included

| File | Responsibility |
|---|---|
| `src/types.ts` | Typed action commands and NPC observations |
| `src/brain.ts` | Per-character queue, priorities, task timeouts, interrupts, AI/player/scripted control |
| `src/gdmAdapter.ts` | Structural adapter corresponding to real GDM movement, `DoorUse`, `GrabUse`, `HolsterUse`, `HeroineVitals` |
| `src/routines.ts` | Automatic food, water, bladder, rest and archaeological work planning |
| `src/index.ts` | Public exports |
| `examples/story-setup.ts` | Mary/John orders, player switching, archaeology puzzles |
| `docs/GDM_INTEGRATION.md` | Concrete GDM integration notes and limitations |
| `docs/ACTION_CATALOG.md` | Every command and constraints |
| `docs/CLAUDE_HANDOFF.md` | Implementation sequence / definition of done |
| `tests/brain.test.mjs` | Offline tests for movement, needs, interrupts, permissions, door hooks |

## Run offline

Node 22+ and TypeScript (`tsc`) are needed. If TypeScript is not installed globally, run `npm install` first.

```bash
npm run typecheck
npm test
```

The included ten tests passed in the generated package. There is no runtime dependency on Three.js in the template. Once moved into the GDM repository, the bridge should use GDM's installed Three.js and real types instead of the structural interfaces.

## Example

```ts
import { NpcBrain, requestPartnerHelp } from './src/index.js';

// `johnPort` is GdmNpcAdapter (constructed from John's own body/motion/vitals).
const johnBrain = new NpcBrain(johnPort);
johnBrain.enqueue({ kind: 'walkToObject', targetId: 'excavation-table' });
johnBrain.enqueue({ kind: 'study', targetId: 'artifact-42', seconds: 12 });
requestPartnerHelp(johnBrain, 'ancient-door');

// When the player takes John over:
johnBrain.setMode('player'); // AI stops, including any active action.
// When John is again the non-player partner:
johnBrain.setMode('ai');
```

## Important boundaries

- CCBS remains the source of truth for reusable **body data, clothing, poses, needs and measurements**. Do not add quest directors, pathfinding or task logic to CCBS.
- **GDM** owns controller switching, quest state, behavior decisions, navigation, NPC state and communication.
- Only one component may write an actor's movement and interactions in a frame. Refactor GDM's single-player `main.ts` into actor-owned runtimes before enabling companion AI.
- The current `PlayerMotion` only handles steering and collisions. The example navigation is direct steering, **not full pathfinding**. Add pathfinding for island rocks, buildings and interior ruins.
- `DoorUse.start()` does not physically swing a door by itself. The caller must walk its rail while holding the handle; the `finishOpeningDoor` hook is **required** to report success.
- `GrabUse.start()` owns the reaching/closing sequence. Do not create a second competing hand animation.
- `HeroineVitals.consume()` and `.relieve()` change the **actual body's needs**; use only after the corresponding action completes, and do not duplicate GDM's existing bathroom handler.
- Fire requires a **game-level** callback that handles ammo, line-of-sight, target eligibility, recoil, tracers and projectiles. `HeroineBody.fire(hand)` is not sufficient alone. Defensive firing is disabled unless the game explicitly authorizes it.
- The current `main.ts` has one heroine and one set of movement/vitals/doors. Mary and John each need **independent instances**, not two brains pointing at Blaze's objects.
- Story-sensitive actions (disappearance, discoveries, pregnancy week-12 activation, reunion) must come from the authored story director. Routine AI must not complete them automatically.
- Save **semantic tasks and actor state**, never raw animation internals or active combat frames. Suspend out-of-range NPC rendering and keep low-cost needs/task simulation.

**Review-first:** This handoff is not authorization to edit or commit the repositories. Joshua approves story and implementation direction.
