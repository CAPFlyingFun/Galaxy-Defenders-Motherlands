# Claude Handoff: NPC Brain Prototype

**Planning and template only.** Do not change the GitHub repository, the v0.5 Markdown, or CCBS until Joshua authorizes implementation. This is an independent, testable ZIP, with an isolated adapter for GDM v0.2.123 and a roadmap for Mary/John control switching.

## Objective

Give each in-game actor the same small command vocabulary: move, follow, grasp, open, release, repair, scan, eat, drink, use bathroom, rest, communicate and limited context-authorized shooting. Use this for background autonomy, cooperative research and scripted missions. Player-controlled characters have their AI paused/disabled; characters do not share needs or equipment.

## Good build order

**First milestone: single NPC laboratory**

1. Read current `CLAUDE.md` and `Game/src/main.ts`, compare their APIs with this package.
2. Preserve the existing player character, current high-detail skin and outfits, and all live-body behavior.
3. Add a separate lightweight NPC stand-in with independent `PlayerMotion` and `HeroineVitals`.
4. Integrate `NpcBrain` and `GdmNpcAdapter`, with navigation and interactions on the same actor-controlled loop.
5. Place a pole, door, water bottle, meal, toilet/bathroom area and research object in a small test room.
6. Exercise: walk to location, holster, grab pole, let go, open door fully, eat, drink, use bathroom, scan object.
7. Verify existing player's animations and camera remain unchanged.

**Next milestone: Mary/John handoff**

1. After male model/clothing is approved, add John's model. The controlled character's runtime owns camera and input.
2. Toggle control and confirm the other actor continues a low-cost assigned task, keeps location, needs, and pose.
3. Call the partner and request help. Test no-signal restrictions.
4. Record state and reload during AI activities; no duplicate consumption, damage, or quest completion.
5. Soak-test iPhone memory and FPS, especially repeated switches and outfit changes.

## Definition of done (first milestone)

- [ ] NPC can follow 6 explicit orders with no duplicate start or completion.
- [ ] Reaches a target within tolerance or reports a blocked route, never hangs indefinitely.
- [ ] Grabs GDM pole with the *existing* fingers, releases, and frees hands.
- [ ] Opens GDM door *fully* using existing door rail; does not confuse grasping handle with opening.
- [ ] Eats/drinks and relieves bladder exactly once; vitals visibly change.
- [ ] Existing player still moves, aims, and changes outfits normally.
- [ ] Any NPC automatic shooting is bounded, target-authorized, and uses game ammo/projectile code.
- [ ] Player takeover immediately stops NPC AI tasks.
- [ ] No main/`Char_B` modifications outside an explicitly approved integration branch.
- [ ] Typecheck/build/tests and mobile smoke test all pass, with screenshots and measured FPS/memory.

## Potential game-side structure

```
Game/src/actors/
  ActorRuntime.ts        # one runtime for player OR NPC
  NpcBrain.ts            # copy/adapt the generic scheduler
  NpcNeedsRoutine.ts     # basic need planner
  GdmNpcAdapter.ts       # wired to ACTUAL actor systems
  ActorRegistry.ts       # stable actor and world-object IDs
  Navigation.ts          # waypoint/navmesh + collision
  InteractionRegistry.ts # custom puzzle/archaeology actions
  StoryDirector.ts       # quests, forced viewpoints, discovery rules
  CharacterSwitcher.ts   # 70/30 preferred protagonist, handoffs
  PhoneService.ts        # comms coverage, calls, responses
```

Avoid introducing all modules at once. Prove the small room first, then grow incrementally. The source's `src/` can be copied into GDM after review, but imports and class names should be reconciled with live repo code at the time of implementation.
