# Exact GDM Integration Map (reviewed 2026-11-21)

This document identifies source code inspected in `CAPFlyingFun/Galaxy-Defenders-Motherlands` main (`60838dd`, Game v0.2.123), and CCBS main (`e2ebcf8`, v0.9.68). The bridge was **not** committed, executed in the actual game, or performance-tested on an iPhone. It is a prepared integration point.

## Ownership and relevant files

| Real GDM path | Existing capability | Use from NPC actor runtime |
|---|---|---|
| `Game/src/main.ts` | Currently creates one heroine, one `PlayerMotion`, one `HeroineVitals`, one set of interactions | Split actor-owned state from single-player loop; player and NPC use the same actor interfaces |
| `Game/src/core/contracts.ts` | `HeroineBody` with `setPosition`, `setYaw`, `setWalk`, `aimAt`, `fire`, `squatFor`, `hands` | Body/animation contract for each actor; later generalize name |
| `Game/src/input/playerMotion.ts` | `PlayerMotion.update(dt, moveX, moveY, viewYaw, speed)` respecting collision | Per-actor movement, with a pathfinder supplying direction |
| `Game/src/world/door.ts` | `DoorUse.start(x,z,hand)`, `update`, `.holding`, `.active`, `.letGo` | Request door handle interaction and advance its existing rail movement |
| `Game/src/world/grabBars.ts` | `GrabUse.start(bar,which)`, `update`, `.holding`, `.busy`, `.letGo` | Request existing pole/rail hand animations |
| `Game/src/world/holsterUse.ts` | `HolsterUse.holsterAll`, `start`, `.busy` | Free hands before touching objects |
| `Game/src/world/burstFire.ts` | `BurstFire.update(dt,wanted,ready,fire)` | Reuse cadence; do not bypass GDM ammo logic |
| `Game/src/vitals/heroineVitals.ts` | `HeroineVitals.step`, `.reading`, `.consume(foodMl,waterMl)`, `.relieve()` | Needs, bladder, hunger, thirst, energy, mood per NPC |
| `Game/src/heroine/fast/fastHeroine.ts` | Baked/live body, kicks, gestures, arms, gait, face/look | Rendering and animation for Mary; John will need adapted male actor |
| `Game/src/heroine/fast/liveBody.ts` | Uses CCBS hidden room; body shape/belly/pregnancy and kicks | Keep Mary-specific body live behavior separate from John's body |
| `Game/src/heroine/pregnancyPlan.ts` | 10–150 default, 0–200 unlock, week-12 to week-42 curve | Story director activates Mary's status at week 12; never infer it from belly size |
| `Char_B/COPIED_FROM.md` | Documents copied CCBS source at v0.9.60 (`bae4157`) | Refresh from approved CCBS main ONLY as a single matching code+assets copy |
| CCBS `src/sarahlab/maleRig.ts` | Male-to-female skeleton name mapping | John rig compatibility after clothing/pose review |

## Critical: interaction ownership

GDM `DoorUse.update` and `GrabUse.update` each output movement / look requests to the current gameplay controller. `start()` does not finish an animation on its own. The game loop MUST advance them once per frame and feed their movement requests to the owning actor's motion. Do NOT have the brain advance a separate competing reach/door animation. When `DoorUse.holding` is true, the handle has been taken: to **open** the panel the actor must move along the door's existing rail using the `finishOpeningDoor` callback. A door is not open merely because the handle is held.

The provided `GdmNpcAdapter` can call existing methods once given actor-owned instances. Its default `moveTo` uses direct heading through `PlayerMotion`; it cannot route around ruins. Provide `navigate` to a navmesh/waypoint system for real missions. The brain detects a stall and fails the task rather than walking into a wall indefinitely.

## Example real-time frame ownership

```ts
// PSEUDOCODE: adapt where Game/src/main.ts currently does this only for Blaze.
// One actor runtime = body + PlayerMotion + HeroineVitals + DoorUse + GrabUse + HolsterUse.
// The story director owns who is player-controlled and who is AI-controlled.

if (!gamePaused && !outfitChanging) {
  for (const actor of nearbyActors) {
    actor.vitals.step(dt, actor.currentVitalsInput());
    actor.updateDoorAndGrabInteractions(dt); // Drive OWN existing GDM animations/movement
    actor.needsRoutine.tick(dt); // cheap decision every 0.5s
    actor.brain.tick(dt);        // execute at most one current command per frame
    actor.body.update(actor.frameInfo); // existing GDM body update
  }
}
```

The above is an outline, not code you can paste unchanged into the present main loop. `actor` methods are hypothetical integration wrappers. Avoid double-stepping the current player loop or running NPC behavior during pause/loading/outfit changes.

## Story director and main-character preference

- Select preferred player actor on New Game: `mary` or `john`.
- Both have independent `NpcBrain` and `HeroineVitals` (later generically named) and independent inventories/locations/outfits.
- Preferred player receives about 70% of playtime as a **soft target**, never override an authored important scene to meet a quota.
- On switch: old player actor `setMode('ai')`, new actor `setMode('player')` *after* control handoff. The story can force a switch for a short playable scene.
- Uncontrolled actor receives local routines (eat, drink, repair, research). While distant, simulate only state, not full high-detail skinned body or a hidden CCBS room; use distance-based updates.
- Phone calls are allowed only when radio/phone coverage and story state permit. John's disappearance can suppress calls for a meaningful plot reason.
- Quest achievements, artifact discovery reveals, and Mary's pregnancy milestone are **story director** actions. The brain does not invent these events.
- At pregnancy week 12: keep Mary at 10% belly, enable pregnancy flag; continue CCBS growth curve to 150% at week 42, 30% postpartum target; pregnancy effects belong only to Mary's independent body state.

## Mobile performance and lifecycle

GDM has had iOS memory failures while changing outfits. It now frees old high-detail bodies before creating replacements, and its code describes stale listeners holding hundreds of MB. Therefore never keep two unneeded full-resolution live bodies on an iPhone. Use proximity LOD, shared static asset caches, light idle animation and offscreen statistical simulation. Do NOT keep a second full CCBS room running far away. Test changing player character and outfits repeatedly while measuring FPS, draw calls and memory, and verify disposal of old bodies/listeners.

## To-do before declaring game-ready

1. Create a generic `ActorRuntime` for Mary and John, with one authoritative mover and interaction pipeline per actor.
2. Finish male model and costumes in CCBS, then import a **matching approved CCBS commit**, using `Char_B/COPIED_FROM.md` procedure. Do not edit `Char_B` by hand.
3. Implement world IDs, navmesh/waypoint movement, and per-actor `DoorUse`/`GrabUse` updates.
4. Implement object action registry for `scan`, `study`, `repair`, tool/puzzle interactions; gate quest-critical events.
5. Implement game-level `CombatAction`, using GDM's actual `BurstFire`/tracers/ammo/LOS, with consent/mission rules.
6. Implement bathroom and eating animations with item consumption and privacy; avoid triggering `relieve()` twice.
7. Add autonomous offscreen simulation, NPC positioning, inventory, save/load, and player-switch acceptance tests.
8. Test iPhone portrait/landscape, 30+ FPS target and 20-switch memory soak test; do not declare passing without running the game.
