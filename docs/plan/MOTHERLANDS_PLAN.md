# Galaxy Defenders: Motherlands — Story & Game Plan

**Last updated:** 2026-11-22
**Sources:** Joshua's development handoff of 2026-11-22 (his story planning with ChatGPT, and ChatGPT's review of `main`
at v0.2.148), plus what was measured and fixed in the game the same day.
**Status:** the story below is PROVISIONAL, not canon until Joshua approves it. The game's running design decisions
stay in `CLAUDE.md` (the repo's root); this file is the plan: where the game is going, in what order, and why.

---

## 1. Where things stand (2026-11-22)

| | |
|---|---|
| Live on `main` | **v0.2.152** (one heavy loading step at a time; a start left on purpose is not counted as a crash) |
| Being built | **v0.2.153**: the scene system and the prologue's first scene (section 5, "The opening demo") |
| The crash | **Looks solved by v0.2.151** (Joshua, 2026-11-22: island, town, a swap and back with no crash; then "Worked and no issues so far… I think we finally found our issues"). The splash's count keeps watching. |

### The island start crash: the evidence so far

- **iPhone 15 Plus, v0.2.148, island.** The splash's "last start" line, after each crash:
  - *Drawing the first picture…* · 11.1 s and 11.5 s in · 110.8 MB downloaded · ~11 MB graphics (est.) (twice)
  - *frame 1* · ~11–12 s in · ~99 MB graphics (est.) (three times, the same afternoon)
  - *Loading John: unpacking his body…* · 9 s in · ~5 MB graphics (est.) (once)
- **The town** (Settings → WORLD → Map → Domed town), the same version, Blaze and John both in: **three starts in a
  row with no crash and no restart** (Joshua, 14:24–14:39).
- **Measured on the built game** (desktop Chrome, phone settings, the island, both characters):
  - Graphics memory (est.) is **11 MB just before the first picture and 97 MB right after it**: nearly everything is
    sent to the graphics chip in that one frame, the moment the phone most often closes the game.
  - The page's own memory peaks at **about 700 MB while loading**: Blaze's live body about 213 MB, Blaze as drawn
    about 137 MB (her 43 body shapes held twice), John about 56 MB, plus short peaks while each body is unpacked.
    (Safari does not let a page read its own memory, so the phone's splash cannot show this number.)
- **In the code** (checked):
  - `world/island/tileStreamer.ts` `update()` starts `load()` for **every** missing tile of the 3 × 3 round her at once
    (`RADIUS = 1`), with no limit on how many at a time. Each tile: its height picture, the rivers carved into it, its
    mesh, and (once its 4 neighbours are in) its river and lake water.
  - `world/island/groundPaint.ts` loads all its ground pictures together (`Promise.all`).
  - `world/island/trees.ts` loads its vegetation maps one after another, then **all the species' photos together**
    (`Promise.all`).
  - Everything the island makes goes up to the graphics chip with the first picture, together with both characters.

### The island, in numbers

- The whole island is **56 km**, cut by Beyond Extinction into **8 × 8 tiles of 7 km** (513 × 513, about 0.43 MB
  each, 27 MB for all 64). **Since v0.2.150 the game reads them cut into 16 × 16 tiles of 3.5 km** (257 × 257, about
  99 KB each, 24.8 MB for all 256; the same heights).
- In the game: the **3 × 3 tiles round her**, now **10.5 km × 10.5 km** (was 21 km). Her tile, and any within 500 m of
  her, as **192 × 192 squares on a phone** (about 18 m each); the rest at half (36 m).
- Past them, **one coarse mesh of the whole island** (192 × 192, from `overview.png`).
- Rivers and lakes: one file for the whole island, `hydro.json`, **2.1 MB**.
- Trees: within 1050 m of the camera (photo trees), 3D trees within 60–80 m (Hybrid).

---

## 2. Direction

1. **Stabilise the island start first.** The town is the control: it works, so it is left as it is and used to
   compare against.
2. **Keep the town as a sandbox** for the story's first small scenes while the island is fixed.
3. **Then a small playable slice of the story:** John's 5–10 minute underground prologue → blackout and title card →
   Mary at A.R.C.H. headquarters.
4. **Story systems that can be reused**, in their own folder, not written into `main.ts` chapter by chapter.

No lowering of the approved character quality just to hide the crash (Joshua's standing rule: textures and her look
are the last things to give).

---

## 3. The crash: suspects, ranked, and how to tell

| # | Suspect | Why | How to tell |
|---|---|---|---|
| P0 | **Everything goes up to the graphics chip in the first frame** | Measured: 11 MB before the first picture, 97 MB after it; the phone's crashes stop exactly there | Send each picture and mesh up one at a time, with short breaks, BEFORE the first picture; the first frame then sends nothing new |
| P1 | **All the island's tiles load at once** | `TileStreamer.update()` starts every missing tile together; the town has nothing like it | Her own tile first, the other 8 one at a time once she is playing |
| P2 | **Trees and ground pictures load at once** | `Promise.all` in `trees.ts` and `groundPaint.ts` | Start with Landscaping Off (Settings → WORLD); then load them one at a time |
| P3 | **Island + both characters together pass the phone's limit** | The town (small) never crashes with the same two characters | Island with John off (`?john=off`), then both |
| P4 | **River and lake water** (carving, levelling, water meshes) | Built per tile as tiles arrive, during the first seconds | A Rivers & lakes switch in Settings (off: none of that code runs) |
| P5 | **Things kept after leaving a map** | `dispose()` exists; not every resource's release checked | Town → island → town, graphics estimate before and after |

Download size is not memory: a picture or a height map takes much more room once it is unpacked. Compare the start
log's downloaded MB with its graphics estimate, not either alone.

---

## 4. v0.2.150, the island started gently (BUILT, 2026-11-22; to test on the iPhone)

**What was built** (Joshua's choices: the 16 × 16 grid, her tile first, the rest one at a time once she plays; the
camera's far distance left at 20 km):
- The island read as **16 × 16 tiles of 3.5 km** (each 7 km tile cut into four by `scripts/make_island_tiles16.py`,
  every height unchanged): the 3 × 3 round her is **10.5 km** across, a quarter of the 21 km.
- **Before play only the tile under her.** Once she plays, the other 8 one at a time, nearest first; then the river and
  lake water as its ground comes in (one chunk a frame); the forest once all 9 are in.
- The ground and tree pictures load **one at a time** (they used `Promise.all`).
- Measured on the built game: as above, no errors; graphics est. 11 MB before the first picture, 89 MB after it.
- **Not built yet:** the warm-up (item 1 below) and the Rivers & lakes switch (item 4).

The plan as it was proposed:

1. **Warm-up before the first picture:** every texture and mesh sent up to the graphics chip one at a time
   (`renderer.initTexture`, one per short break), so the first frame has nothing left to send. Helps both maps.
2. **Her tile first:** the tile she stands on is loaded before she plays; the other 8 come one at a time after play
   begins (nearest first), never two at once.
3. **Ground pictures one at a time**, then **river and lake water**, then **trees**, each only after the one before is
   in, all after play begins.
4. **Settings → WORLD → Rivers & lakes** (on/off), to test the water directly (off: no carving, no water meshes).
5. **The splash's start count** (built in v0.2.149): *"Starts on v0.2.150 that reached 30 s: island 4 of 5 · town 3 of
   3"*, so the result does not have to be counted by hand.

**Done when:** three island starts in a row on the iPhone with no crash; a few minutes of walking about with no crash
and at least 30 FPS; the town still works; the graphics estimate does not keep climbing.

**iPhone test checklist for each version:**
- [ ] Open the game three times on the island (close it fully between). Screenshot the splash each time.
- [ ] Open it three times on the town.
- [ ] Note the splash's count line and any amber "last start" line.
- [ ] Walk a minute on the island; note the FPS.

---

## 5. The story (PROVISIONAL — not canon until Joshua approves)

- **Protagonists:** **Mary "Blaze" Fisher** and **John "Sparks" Fisher**, married. Each is playable, and run by their
  own AI when not selected (the game's NPC brain, `src/npc/`, already does this for the one standing by).
- **John's expedition:** he leaves on an A.R.C.H. expedition expected to last about **10 days**. The playable **John
  prologue is on Day 9–10**, lasts **5–10 minutes**, and ends when an ancient chamber **seals him inside**.
- **Beyond the chamber:** a vast ancient **underground network**. The expedition's members are **separated** throughout
  it.
- **Transition:** blackout → title card → **Mary at A.R.C.H. headquarters**. Mary does not yet know John is trapped.
- **Later chapters alternate** between chosen Mary and John perspectives (Q41: B), not free switching everywhere.
- **Rescued expedition teammates:** independent AI that also takes the player's commands (Q44: C). Their
  **personalities affect their decisions**, and they **say what worries them and what they need** (Q45: B).
  Important decisions stay readable to the player.
- **Working pregnancy timeline:** Mary is about **12 weeks** pregnant when John leaves, neither of them knowing; she
  finds out near **Day 13** (just before 14 weeks); A.R.C.H. formally tells her the expedition is missing around
  **Day 14**. Exact pacing and mechanics still to be reviewed. (In the game her pregnancy settings already start at
  10 % = week 12: `heroine/pregnancyPlan.ts`.)
- **Still open (do not decide by assumption):**
  - The island's name and history, and any ties to Joshua's other games.
  - Mother Overlord's identity and motives (unrevealed).
  - The pregnancy is **not** to be made a villain-targeting plot by assumption.
  - **Survival difficulty (Q46): not answered.** No option chosen.

### The opening demo, Draft 1 (Joshua's, 2026-11-22; about 8–10 minutes; PROVISIONAL)

From `Motherlands_Opening_Demo_Draft_1.docx` (kept outside the repo; its image placeholders are for later concept art
or screenshots). Story and dialogue are provisional.

- **Scene 1, Beneath the Island** (DAY 9 | 07:42 | A.R.C.H. EXPEDITION SITE): black screen, water dripping, a radio.
  John on the radio with the expedition leader ("staring at the same rock for twenty minutes"). His flashlight comes
  on: ancient passages, roots through cracks overhead, geometric markings on the walls. **Objective: Rejoin the
  expedition** (walking, the flashlight, inspect/scan). He scans markings that were not in the original survey (a
  researcher: the survey never covered a wall under thirty metres of sediment); the A.R.C.H. display rebuilds part of
  an inscription, several symbols unknown. A faint vibration through the stone; "Did anyone else feel that?" The
  vibration again, a little stronger.
- **Scene 2, The Chamber** (07:51): a huge round chamber, the expedition round a central structure with a faint blue
  light moving under its surface. **Objective: Investigate the central structure**: scan three symbols, examine a
  damaged control mechanism, compare the symbols with earlier finds (an easy introductory puzzle). "Almost like…
  instructions." Scanner warning: UNKNOWN ENERGY ACTIVITY (source: central structure; pattern: increasing;
  classification: unavailable). The symbols light one by one; a deep rumble.
- **Scene 3, The Seal** (07:58): the chamber shakes, "back to the entrance!", a stone barrier coming down. **Objective:
  Reach the exit**: a short scripted escape he cannot win (not a fail state). Sealed in; his calls get only static and
  a broken "…lower passage…"; the team is separated in shifting passages. Through a new archway, an enormous tunnel
  into the dark, bridges and structures far below. "What is this place?" An unknown signal; the lights go out; CUT TO
  BLACK, a low mechanical pulse. **TITLE CARD: GALAXY DEFENDERS: MOTHERLANDS.**
- **Scene 4, Mary** (DAY 10 | 08:16 | A.R.C.H. HEADQUARTERS): morning sun, terminals, a coffee machine. A colleague:
  "You're here early." / "Couldn't sleep." Nothing from John yet. The camera moves behind her and the player takes
  over. **Objective: Check the latest expedition reports.** Chapter 1 begins as Mary; the demo ends soon after.
- **Notes from the draft:** the chamber and headquarters are separate light scenes (the island is not loaded for the
  prologue); Mary does not yet know John is trapped, and neither knows of the pregnancy (Day 13 she finds out at the
  hospital, Day 14 A.R.C.H. tells her the expedition is missing); what sealed the chamber (an ancient defence, an
  accident, or someone else) and Mother Overlord's identity and tie to the ruins are undecided, and nothing in the demo
  implies a reveal. Character looks in the draft (Mary auburn or chestnut hair and brown eyes in an A.R.C.H. field
  jacket; John in a rugged expedition jacket with light stubble) are optional, not canon: today's looks stay until
  Joshua chooses (clothing changes are asked first).

**How it is being built (agreed 2026-11-22):** first as a BLOCKOUT (plain shapes, real lighting, text subtitles for the
radio and voices, every objective working), the art after the flow plays well. In versions:

1. **The scene system and Scene 1** (v0.2.153): Settings -> WORLD -> Map -> **Prologue** (`?map=prologue`; the island
   stays the default). Only John is made (no Blaze, no live body, no island). The tunnel, his flashlight, SCAN, the
   radio as subtitles, "Rejoin the expedition", the vibration.
2. **Scenes 2–3**: the chamber, three symbols, the warning, the barrier, the view, cut to black, the title card.
3. **Scene 4**: headquarters as Mary, her colleague, "Check the latest expedition reports", the end of the demo; the
   chapter saved so a restart comes back to it.
4. **Art**: stone, light, the structure's glow; voices if Joshua wants them (ElevenLabs).

Defaults taken (Joshua: "Yeah!" to them): the expedition stay radio voices in Scene 1, two or three at low detail at
the structure in Scene 2; the characters' looks as they are now; third person to start, first person there too.

---

## 6. The smallest useful playable story slice (after the island is stable)

1. **John's chamber scene:** walking, inspecting a relic, one investigation or puzzle, a warning from the place
   itself, the chamber sealing.
2. **Transition:** fade to black and a title card, loading a **separate small scene**, not the whole island.
3. **Mary's headquarters scene:** talking with a researcher, a first objective, a clue or report that starts her
   investigation.
4. **Save and restore:** the chapter, objectives, which character, and important events.
5. **One companion test:** a separated researcher John finds; follow / stay / interact; their own behaviour and
   warnings from their personality. Only once the story flow itself works.

### Proposed code layout (new files, not yet made)

```text
Game/src/story/
  storyDirector.ts      # chapter progression, events
  storyState.ts         # what has happened, saved
  objectives.ts         # objectives and what each needs first
  chapterLoader.ts      # entering and leaving each small scene, and letting go of it
  chapters/
    johnPrologue.ts
    maryHeadquarters.ts
```

It uses what is already there rather than copying it: `main.ts`'s character making (Blaze and John), the NPC brain
(`src/npc/`), the controls (`src/input/`), the builder's bodies, the start log (`core/startupLog.ts`) to measure each
scene change. A chapter loads only its own scene. Story data is kept apart from the code that builds a scene.

An example of a chapter's data (a sketch, not working code):

```ts
const johnPrologue = {
  id: 'john_prologue',
  character: 'john',
  world: 'underground_chamber',
  objectives: ['inspect_relic', 'investigate_signal', 'activate_terminal', 'escape_sealing_chamber'],
  nextChapter: 'mary_arch_headquarters',
};
```

---

## 7. Build order

1. **Island start stable**, with the start log and count to show it (the town kept as the control).
2. **John's playable prologue**, in its own small scene.
3. **Mary's A.R.C.H. headquarters** and her first quest.
4. **One rescued companion**, with commands and personality.
5. **The underground network grows**, chapters alternating; only then the surface world and more people.

The commander/turret direction of 2026-11-16 (`CLAUDE.md`: dome, waves, turrets, cards) is not replaced by this; how
the two fit together is still to be decided with Joshua.

---

## 8. Later: smaller island tiles, and the underground world (PROVISIONAL — not to be built yet)

From Joshua and ChatGPT, 2026-11-22. **Planning only: nothing here is built until Joshua approves it.** v0.2.150 is
finished and tested on the iPhone first.

### Smaller tiles, only if the measurements call for it

The island stays 56 × 56 km. If the phone still needs it after v0.2.150, the tiles could be cut smaller:

| Grid | Tile | 3 × 3 round her |
|---|---|---|
| 16 × 16 (v0.2.150) | 3.5 km | 10.5 × 10.5 km |
| 32 × 32 | 1.75 km | 5.25 × 5.25 km |
| 64 × 64 | 875 m | 2.625 × 2.625 km |

- The game already reads the grid's size from its manifest (`tileStreamer.ts` `across`, `tileSize`), and the same
  cutting can be done again (257 → 129 → 65 pixels a tile: each picture is cut into its quarters, its middle row and
  column shared). The ground's grid per tile (`SEG`) would be set to match the smaller tiles.
- Goals: less work per tile; her tile first; the rest streamed in gradually; tiles far off let go with everything they
  hold; tile size and ground detail kept as settings; no needless loss of look; the ground, footing, trees and water
  continuous across seams.
- **Smaller tiles do not by themselves mean less graphics memory.** Measure on the phone before cutting further.

### Real caves and underground places

In time, chosen places on the island could hold real ways in beneath it: natural caves and tunnels, ancient ruins,
underground laboratories, large underground cities on several levels, linked passages and hidden ways out. Built as
their own 3D geometry (not the island's height map), so they can have ceilings, overhangs, several floors and large
chambers.

### Two ways in

- **Seamless:** she walks straight into a cave and the underground around her streams in. Best for small caves and
  simple passages.
- **A scene change:** near a cave mouth, doorway or dark passage a prompt asks "Enter cave?"; yes fades to black, her
  state and the world's are saved, what the island no longer needs is let go, and the underground scene is loaded.
  Coming out, the right part of the surface is loaded again.
- **Start with the scene change** (the safer one for a phone's memory). Both use one shared system of destinations and
  return places.

### One connected world, and the story

Even where an underground place is its own scene, it stands for a real place under the island: in through a cave on
one side, through tunnels and old buildings, out somewhere else, back on the surface at the right spot. The underground
can go down several levels without making the island any bigger. This fits the provisional story (section 5): John
explores the ancient network after his expedition is trapped, Mary searches from the surface, and their paths may
meet.

### Order

1. v0.2.150 (16 × 16) finished.
2. Tested on the iPhone: the start, crossing between tiles, memory.
3. 32 × 32 or 64 × 64 only if the measurements call for it.
4. Later, one reusable system for ways in and out and for loading scenes.
5. One small underground chamber, for John's playable prologue (section 6).
6. Tested: going in, coming out, saving, loading, and letting go of what is left behind.
7. Then the linked caves and underground cities, as the story grows.

**The aim:** a large, connected surface and underground world, never all loaded at once. First: 30+ FPS on the phone,
steady memory, smooth exploring, one set of world coordinates, good-looking characters and places, and systems made
to be used again rather than one-off scene changes.

## 9. How the work is done (Joshua's standing rules, and the handoff's)

- Work on `claude-work`; `main` moves only when Joshua approves. Ask "good to push or wait?" in a normal message.
  After a push, wait for its deploy to succeed and 5 more minutes before another.
- `Char_B/` is never edited by hand: it is a copy of the Character Builder, refreshed from its own `main`.
- Before a change: the exact code it touches, the test that will tell, what result is expected. After: the type check
  and build pass, an iPhone test checklist, and the evidence (start log lines, screenshots, numbers).
- Unresolved story choices stay marked as open; nothing above is canon until Joshua says so.
