# Working on Galaxy Defenders: Motherlands

A full 3D remake of Joshua's HTML prototype "Galaxy Defenders: Mother Overlord"
(`docs/reference/galaxy-defenders-mother-overlord.html`: the reference for every system brought over).
TypeScript + Vite + Three.js, hosted on GitHub Pages from `main` through Actions.

## Folders

- `Game/`: everything we build. Pages builds and deploys this.
- `Char_B/`: a copy of the Custom Character Builder System (code AND models, copied together at one commit;
  see `Char_B/COPIED_FROM.md`). NEVER edited by hand. Refreshed by copying the builder's newest approved `main`
  over it. `Char_B/CLAUDE.md` is the builder's own notes: read it for how her body, clothes and cloth work, but
  its git and task rules are the builder repo's, not this one's.
- `docs/reference/`: the original HTML game.

The game reads the builder through the `@charb/` alias (`Game/vite.config.ts`, `Game/tsconfig.json`), and both
use the game's single copy of three.js.

## The game (decided with Joshua, 2026-11-16)

- World: Joshua's `Half_Sphere.obj` dome (12 slices = 12 dome sections, each with its own HP; a section at zero
  shatters and lets enemies through) over a simple grid city; the heroine in a central plaza. The dome is reused
  for later themes (island, countryside).
- Cameras: third person (default: drag to rotate, pinch to zoom, auto-aim) and first person (camera at her head
  bone, offset so looking down shows her belly, as in Beyond Extinction; manual aim and fire). No jumping.
  FIRST PERSON IS HER HEAD (Joshua, 2026-11-20: "un-hide the head and always keep it visible and just offset forward at
  touch and keep same eye height like in Beyond Extinction... it can only bend what the head can do"; `fastHeroine.ts`
  `eyeView`, cameraRig.ts): the camera is FIXED TO HER SKULL AT HER EYES (7.5 cm ahead of and 5.1 cm above its base);
  it turns and tips with her head, NOTHING EASED. IT DRAWS FROM 1 CM (cameraRig.ts `FIRST_NEAR`; third person 6 cm,
  `THIRD_NEAR`; the farthest 20 km on the island): at 6 cm her shoulder was cut open turning her head at the bar
  (Joshua: "Is there a way for the camera to not cut through the clothing"); rendered at 6, 2 and 1 cm. So HER HEAD IS
  HIDDEN FROM HER OWN CAMERA, NOT MOVED OR SHRUNK (Joshua: "don't scale the head down or anything, just hide it (shadows
  stay)"; `hideHeadPatch`: a pixel whose point her head's bones carry over half is left out), her hair hidden the
  same way (`hideHairPatch`; on the shadow-only layer it dropped out of her shadow too: three.js draws into a shadow
  only what the MAIN camera's layers see); her shadow keeps both (at 1 cm her own cheek and nose filled the view). (v0.2.103-106 hid it too,
  folded into her skull; then it was shown again, v0.2.107-109.) (First it sat just clear of her face, 3.7 cm further on Blaze: looking down that put it by her chin,
  Joshua: "Camera seems too low".) Where the player looks
  is where her head is asked to look, and her NECK'S REACH IS FROM HER TORSO'S LINE (Joshua: "relative to the torso...
  same for all directions"): 75 degrees down, 55 up (`HEAD_DOWN_MOST`, `HEAD_UP_MOST`; his research: 45-60 up, 70-80
  down), her torso's lean (`torsoLean`, pelvis to neck) added, so bent over 42 winded her head reaches 117 down in the
  world, and on all fours (67) level is past her reach (12 down). Sideways: the five yaw bands (her head 90, then her
  body turns). Her own looks (at a kick, bowed winded) move her head and so the view; turning the view frees her head
  where it is (`freeLook`), firing ends a kick look. Settings -> CAMERA -> 1st person eye forward (`gdm.eyeAhead`,
  `?eye=`, -6..12 cm, along her face) and eye height (`gdm.eyeHigher`, `?eye_up=`, -6..20 cm, along her head's own up:
  straight up in the world showed a bowed head's own face): Joshua tunes them in game and sends the numbers.
  NO BOB OR SWAY IN FIRST PERSON (Joshua, 2026-11-20: "make the camera like v0.2.102 attached to the bone no damping...
  the body naturally has a bob and sway adjustment... in 1st person, make 0% Bob, Sway, but show it in 3rd person";
  bodyMotion.ts `bobSwayShare`, set by `setFirstPerson`): her look's own Bob and Sway are 0 in first person, as they are
  in third. (Tried and dropped, v0.2.102-106: easing the camera, BE-style, which swayed, stuttered dragging the view and
  let her face poke through.) HER HEAD HELD STEADY (Joshua, 2026-11-20: "The camera bob is fixed,
  but the sway is still there"; fastHeroine.ts `steadyHead`): first person, her skull is turned each frame to look
  EXACTLY where it is meant to, level, no roll (her walk's hip and shoulder twist had swung it 6.4 degrees); measured
  walking: 0 degrees of turn, 1.2 cm side to side and 2.6 cm up and down left in her eyes. FIRST PERSON STANDING, HER BODY FOLLOWS HER HEAD (Joshua, 2026-11-20: "after 1s of no camera movements, the body
  catches up to the head since that is what steers the player... remove all the delays, and have the body follow like it
  does in 3rd person and based on our angle system"): the view is her head and her body follows it by the five bands
  (bodyTurn.ts: past 90 body North is pulled round, once the look stops it comes round to match, each band a moment
  behind), so she already faces where she will go. Nothing settles the view back. ALL OF HER AT ONCE, FIRST PERSON ONLY (Joshua, 2026-11-21: "1.3s is still too
  laggy"; then, after a 0.1 s chain head to feet in v0.2.114: "Still feels laggy, only in 1st person remove the delay
  chain and sync them all at once"; bodyTurn.ts): standing, body North IS where she looks and every band is where it is
  to be the same frame, no lag (her feet step round under her). Third person keeps the eased lags and the 1.3 s
  catch-up. (v0.2.108-112 held her body still and
  settled the view back to it after 1 s, over 1.5 s; the stick then put the view back where it was left: all removed.)
  HER HEAD'S YAW AND PITCH ARE FIXED TO HER TORSO'S ANGLE (Joshua, 2026-11-20: "the left and right ended up on the
  twist axis... supposed to be left and right relative to the torso like standing"; "The head's yaw and pitch need to be
  fixed to the torso's angle"; fastHeroine.ts `torsoFrame`, `sideAndTip`, `steadyHead(yaw, tip, side)`): a gimbal on
  her torso, swung left or right about her torso's up, tipped from her torso's line, no roll of its own. Standing that
  is an ordinary turn, level at any tip (rendered: down 60 and turned 60, 0 tilt); crouched or bent over, the turn goes
  with her torso (crouched 14 degrees of tilt, winded 35). (Tried: turning about the world's upright, which spun the
  view leaning over a bar; about the head's own up, which rolled it 49-59 degrees: "it's rolling and not yawing".)
  First person the player's look is that turn and tip; third person a target is turned into them; her head is held
  steady so in both views. Her back's and neck's twists go along her spine (pelvis to neck), not the world's upright. HER HEAD KEPT LEVEL FROM A JOG UP (Joshua, 2026-11-20: "when moving left
  or right the camera banks"; "while anything over a walk, keep the neck and head level and the body and move as
  needed... Winded, Walk, idle, and other things would be normal with natural angle tilts"; fastHeroine.ts
  `HEAD_LEVEL_FROM` 1.6 .. `HEAD_LEVEL_AT` 2.4 m/s, `headFrameLean`): her head's frame leans with her torso at a walk and
  below and is the world's level from a jog up, eased between; measured looking 84 degrees aside: walk 2.9 degrees of
  tilt (her lean), jog and run 0. AT THE TABLE, BARS AND DOOR the up and down
  look is her neck's reach too (was 70 each way of level: leaning on a bar she could not look down far enough), and
  LEFT AND RIGHT TOO (Joshua: "I can only move the camera up and down, not left to right"): her body faces what she holds
  (`busyFace` as bodyTurn's `hold`), her head ALONE follows the player's look, 90 each side, the rest of her square (bodyTurn.ts
  `grip`; Joshua first asked for 30 more from her shoulders, then: "remove that extra 30° from the shoulders"); let go, the view waits 10 s (`BUSY_LOOK_WAIT`; Joshua, 2026-11-21: "from 1s to 10s, with the transition after"; the same wait first person in Auto, following her aim target) then goes back over 1.5 s.
- Movement (Joshua, 2026-11-17): free movement in both views over the whole map, with the MOVE stick (five rings
  set her pace: walk, jog, run, sprint). The ring track round the plaza and the "free walk in third person"
  setting were removed. Buildings are solid and the dome wall stops her.
- Her feet drive her (Joshua, 2026-11-17): her stride is measured from her foot bones and turned by the distance she
  really covers; a planted foot is held to the spot it landed on (`Game/src/heroine/fast/footGround.ts`).
- Which way each part of her faces (Joshua's five bands, 2026-11-17; `Game/src/input/bodyTurn.ts`): from body North
  her head turns up to 90 degrees, her shoulders/arms/hands 80% of that (72), her belly/torso 60% (54), her upper
  legs 40% (36), her lower legs and feet 20% (18). Past 90 body North is pulled round; when the looking stops it
  comes round to match within 4 seconds. HER HEAD LEADS, HER BODY CATCHES UP (Joshua, 2026-11-20: "the joystick moving the
  head which the body will catch up and look more natural in 1st and 3rd person"; bodyTurn.ts `bandLag`, `headLead`):
  each band follows the one above it a moment behind (shoulders 0.1 s, belly 0.18, upper legs 0.26, feet 0.34), so a
  turn runs down her from head to feet; going a new way in third person with nothing to aim at, her head turns there
  first (quicker than body North, `moveTurn` 7). First person the look is the camera; third person it is her auto-aim
  target. Moving, body North turns to the way she goes (so walking sideways she goes shoulder first), SIDE STEPS IN THIRD
  PERSON TAKEN OUT (Joshua, 2026-11-20: "remove the side step... and just rotate head which will turn her": main.ts
  `walkSides` now only backing up, which still keeps her facing the camera's way); they are kept holding a door. As they
  were (Joshua, 2026-11-18), in third
  person MANUAL AT A WALK she kept facing the way the camera looks and the stick snapped to
  FOUR moves only, nothing between: walk ahead, walk back, and the CRAB STEP left or right (`footGround.ts` 8: the lead
  foot steps out a shoulder width, her body catches up, the trailing foot comes in a shoulder width behind it; at most
  1.0 m/s, 0.8 at full term; a metre sideways costs 1.25 times the stamina). Jogging or faster there are no side
  steps: the stick moves her ahead, back, left or right of the camera and her body turns to run that way.
  TURNING ON THE SPOT IS STEPPED (Joshua, 2026-11-20: "she looks like she is marching in place but her body rotates";
  `footGround.ts` 10): standing, a planted foot keeps facing the way it landed while her body turns over it; at 15
  degrees of turn the foot on the side she turns to steps OUT and a little BACK, toes turned out 15 degrees; at 40
  (his number) the other foot comes in under its shoulder, square to her; and again while she turns (L, R, L, R). No
  tidy step on the spot while she turns; a turn that stops is squared up after 1 s still.
  PICKING UP PACE (Joshua, 2026-11-21: "It feels like driving a semi"; input/pace.ts): ring 4 a pace every 0.6 s (walk to
  sprint 1.8 s, was 6), ring 3 every 1.5 s (4.5 s, was 15), ring 1 down a pace every 0.7 s (was 2); her speed follows
  at 6 m/s a second (was 5).
    SQUARED UP BETWEEN MOVES (Joshua, 2026-11-20: "right before it say sidesteps to forward, it resets really quickly
  (maybe 0.3s or variable depending on speed) to both feet side by side then plays the next one... as soon as you
  release the stick or it centers, it also puts the feet in the normal standing state"; main.ts `gait`, `GAIT_*`,
  footGround.ts 11 `squareUp`, bodyMotion.ts `standCap`): her move (stand / ahead / back / left / right with her facing
  held / go) changing from a move to anything else sets both feet side by side at home TOGETHER first,
  her walk faded out with them and restarted from the stride's beginning; INSTANT
  (Joshua: 0.3 "was slightly too long", then 0.1, then "make it 0.0"): her feet snap home in a frame and the next move
  starts at once. The 4-way stick keeps its move until another is 1.4x nearer (`GAIT_KEEP`), so a diagonal does not
  flick. Measured: her ankles never closer than 0.28 m (her stance 0.30). (A shuffle
  and a skip are built in `footGround.ts` but not used.) She stands with her feet her shoulder width apart (measured
  from her own bones). Holding a door, her facing is held too (the same four moves).
- Loading and turning the phone (Joshua, 2026-11-17, "like how Beyond Extinction does it"): a splash with a real
  loading bar, percentage and time left (`Game/index.html`, `Game/src/ui/splash.ts`; the numbers come from
  `Game/src/core/loadMeter.ts`, which counts real bytes and steps and remembers the device's last load), and the
  game waits behind it until everything is in, her live body too. Held upright, a "rotate your device" cover shows
  (plain CSS in `index.html`) and the game pauses; back on its side the pause menu waits with Resume and Settings
  (`Game/src/ui/pauseMenu.ts`). The stage is never turned by code any more; it is re-fitted after every turn
  (`Game/src/core/orientation.ts`). While paused no game time passes.
- Her arms keep clear of her belly and her breasts (Joshua, 2026-11-17; `Game/src/heroine/fast/armClear.ts`): a
  simple collision with about 2 cm of space. Her belly and each breast are measured from her own skin as egg shapes
  (again whenever her shape changes). A hand coming across at belly height stops at her belly; looking up it passes
  over, looking down it stops; an upper arm that would cut her breast is turned out at the shoulder and the elbow
  bends as needed. Her bust turns with her shoulders (her lower spine bone carries it).
- Belt gear (Joshua, 2026-11-18; `Game/src/heroine/fast/beltGear.ts`): a belt pinned to her skin along her leggings'
  grey waistband trim (found in her own picture), thigh straps and a drop strap each side, a holster on each thigh (rigid on
  the thigh bone, gun barrel down, grip back) and six clip pouches, three behind each hip. The belt rises over a small
  belly (fully at 25%, on the trim from 60%). HOLSTER / DRAW (L, R) on the go (`Game/src/world/holsterUse.ts`): her head
  leads 0.7 s, she keeps walking; grabbing a bar holsters her guns instead of the table; the table draws holstered guns
  it needs. RELOAD from the belt on the go (`Game/src/world/beltReload.ts`): one gun at a time, the other holstered; the
  clip hand takes a fresh clip from a pouch on ITS side, holds the empty beside it, clicks the fresh one in, and tucks the
  empty (upright, dark top) into the pouch the fresh one came from; the table's RELOAD swaps empties for full clips.
  Clip grips (table and belt) come from `Game/src/world/clipGrip.ts`.
  The belt is drawn TIGHT round her (Joshua, 2026-11-19: "span across her buttock cheeks vs dipping into them"):
  `bridgeHollows` lays each edge on the outline a stretched band would take round her, seen from above, and runs it
  straight across every hollow (between her cheeks, and across her thighs' tops at the buckle, which had folded into a
  'W'). Checked at 10, 50, 100, 150 and 200% on the catsuit and the pink two-piece; at 200% the front is tucked under
  her belly, not inside it.
- Doors (Joshua, 2026-11-18; `Game/src/world/door.ts`): a lever on the pull side, a knob on the push side. OPEN DOOR
  walks her to the handle; she takes it with the hand OPPOSITE the handle's side (handle on her right: left hand), a
  little side-on so her belly is beside her reach, and twists it. Her grip is chosen as the way round the handle that
  turns her wrist least (her joint limits had left her hand twisted), never palm up. Then walking back pulls it, forward pushes it (her
  elbow's spring: a few cm of play round where her hand closed on it), and LET GO is manual. Opened from the push side
  and let go it swings shut (waiting while she is in the doorway); from the pull side it stays. The door is solid. HER RAIL (Joshua, 2026-11-20, his drawing): holding it she walks an invisible path
  (door.ts `buildRail`, `keepOnRail`), built from where she took hold: from the PUSH side straight up the doorway at
  `railPush` (0.6 m from the hinge, a little past mid-door so her hand reaches the knob across her body; she stands there to
  take it) then round the hinge; from the PULL side straight back, easing out to `railPull` (1.0 m, just outside the free
  edge: inside it the door shut her in against the wall) then round. Only ahead and back move her along it (sideways does
  nothing), she faces along it (still side-on), turning with the door; the handle's pull moves her along it; the panel
  stops her on it, never pushes her off. At the stop she waits for LET GO.
- THE GRAY AND RED SUIT (Joshua's outfit design 2, 2026-11-18; `docs/reference/outfits/`; look `graySuit`, open with
  `?look=graySuit`, NOT the default until he approves): `Game/src/heroine/looks/graySuit.ts` paints the builder's full
  bodysuit in light gray with red edging, red bands painted by code (`paintMask.ts` now measures her trunk and arms as
  well as her legs) and darker gray panels; no strip across her cleavage (his pick); her navel shown wholly through the
  suit (flattening it was baked at 100% and drove it in at other sizes). Baked with `scripts/bake_heroine.py graySuit`.
  Its 3D pieces (`Game/src/heroine/fast/suitGear.ts`, chosen per look in `looks/gear.ts`): tall FLAT combat boots
  (Joshua: no heels), wrist cuffs and shoulder plates, each a shell measured round her own skin on one bone; the belt
  gear takes the look's colours. Still to come: glowing lines along the red bands, a smoother boot.
- OUTFITS SWITCH IN SETTINGS (Joshua, 2026-11-19): Settings -> HEROINE -> Outfit lists every saved look
  (`OUTFIT_CHOICES` in `Game/src/heroine/heroineSettings.ts`, saved as `gdm.outfit`; changing it reloads the game;
  `?look=` still wins). For testing now; later each outfit has its place (Look 1 outdoors/action, the formal ones in the
  command center). Default stays the pink and black two-piece.
- LOOK 2, THE ANIME SPACE HEROINE (Joshua, 2026-11-19/20, IN PROGRESS; `looks/spaceHeroine.ts`, references
  `docs/reference/outfits/look2-anime-space-heroine-*.jpg` and the enhanced board he sent): ON HIS OWN BASE (his export
  "character-blaze-white-leotard": the builder's Long-sleeve leotard template, short sleeves 0.27, neck 0.95/0.97, his
  braided Blaze) in NAVY with GOLD edging bands (the template's trim); WHITE painted by code (`whiteAt`: cups with a navy
  V, side bands down to her hips, her hips, a back yoke) over a slightly bigger GOLD piping. No waist windows: a template
  can only be painted over, never cut. HIS PICTURES laid on in their own colours (`clothShine.prints`,
  outfitMaterial.ts: over the cloth baked in a colour, three-sided, with depth): navy sparkle knit (10 cm, 0.4 mm),
  gold glitter (4 cm, 0.3 mm), white tech pattern (14 cm, its lines drawn out 3x). 3D (`suitGear.ts` design 'anime'):
  navy shoulder plates edged gold, long white bracers with a navy band, navy collar and fingerless gloves, navy knee caps,
  white knee boots with gold piping, navy toes and SMALL HEELS (the sole lifted under her arch); ONE HIP PANEL each side
  (106-178 degrees round her, behind her holster so it never cuts through it; its curve round her smoothed over 24
  degrees, no creases; about a quarter of her round, mid-thigh, white edged gold, lined red), hinged at the belt and swung by her thigh
  (`update`); their gold-hemmed tops hang OVER the belt's lower half, clamped by four gold studs each (`hipPanelTop`,
  Joshua 2026-11-20: "they look like they are floating"). Belt: ONE holster, her right (`holsters`), no pouches (`pouches: false`: table reloads only); a gun put
  away on her left is stowed out of sight. Her arm keeps clear of a holstered gun only where a holster is drawn.
- CATSUIT STYLES ARE THE THEME (Joshua, 2026-11-20: "one piece catsuits like the back one, just different variations of
  looks as styles are better for the theme"; references `docs/reference/outfits/looks5-6-catsuit-styles-*.jpg`, a green
  and gold armoured one and a glossy bronze/brown one): each built on his catsuit export, colours, painted panels,
  his texture pictures and a few 3D pieces. THE BRONZE CATSUIT (`looks/bronzeSuit.ts`), since 2026-11-20 ALL ON THE BUILDER'S
  OWN DRAWN CATSUIT (v0.9.60: smooth edges; `BRONZE_NECKLINES`): `bronzeSuit` a turtleneck (1.06) with a KEYHOLE cutout
  over the top of her cleavage; `bronzeSuitLow` a low wide U (0.7); `bronzeSuitHigh` his high crew (0.94). Nothing
  painted by code any more: the painted keyhole, sweetheart, seams, cups and trim strips had rough, wandering edges (a
  painted shape is only as fine as her skin's points). Very glossy (cloth 0.3, trim 0.16), flat KNEE-HIGH bronze boots
  (`bootTop` 0.03; his ask), his pebble picture's GRAIN only over the bronze (12 cm, 0.3 mm; "looks more muddy then
  bronze"). Under the high neck the builder leaves her cleavage to its cleavage piece, and in the game her skin showed
  through it: the gap is FILLED in the same bronze on paint layer 2 (`FILL_CLEAVAGE`) and the piece left out. Joshua is
  having ChatGPT redraw outfits 2-4 (Look 2's renders: `docs/reference/outfits/look2-anime-space-heroine-chatgpt-*`:
  bare sides at her waist and an open back with a white heart yoke, which the builder cannot cut yet); next: the green
  and gold.
  MORE COLOURS OF THE SAME CATSUIT (Joshua, 2026-11-20: "a shiny gold, black, sliver, etc, maybe even top half above
  belly/at bottom of breasts one tone, and below another"): every catsuit style is made by ONE recipe, `looks/catsuit.ts`
  (`catsuitLook({ colour, neck })`, `NECKLINES` keyhole/lowU/high/diamond, the high-neck gap filled), the bronze ones
  too. EVERY COLOUR IN THE SAME THREE STYLES (Joshua: "Make sure all outfits have the same style per color"): keyhole
  (the name as it is), `Low`, `High`; Settings -> Outfit picks the colour, Settings -> Catsuit style the style
  (`gdm.catsuitNeck`, `?neck=`; heroineSettings.ts `outfitLook`; changes while playing). `looks/catsuitStyles.ts`:
  GOLD, BLACK, SILVER, each baked in the three; and TWO TONES drawn by the game over one of those bakes (`looks/bakedAs.ts` `BAKED_AS`, gear's `clothShine.twoTone`,
  outfitMaterial.ts): the top colour wherever the suit's own colour is, above `TWO_TONE_LINE` (1.19 m up her as
  baked, the bottom of her bust) and all down her arms (her arms' bones, `setToneArms`), per pixel so the line is
  clean: black & gold, gold & black, black & silver. (Tried first: a long-sleeved top cut at her bust over the
  suit; the builder's shirt keeps its own hem and hangs a drape between her legs.) `clothShine.metal` gives gold and
  silver a metal sheen (about a third: the game has no sky reflections for a full metal). Gear by the look ASKED FOR,
  not the folder it was baked in (fastHeroine.ts `lookGear`).
- LOOK 1, THE SHADOW OPERATIVE CATSUIT (Joshua, 2026-11-19; `looks/shadowSuit.ts`, reference
  `docs/reference/outfits/look1-shadow-operative-closeup.jpg`): built ON JOSHUA'S OWN EXPORT (his Blaze in her black
  CCBS catsuit, with her braid, eye/lip colours and face; `EXPORT_BODY`, `EXPORT_SUIT_LAYER`), with red stripes painted
  by code (neon red FF0000) with a GLOSSY BLACK BORDER each side, glossy fingerless gloves and a mock collar up her neck
  (`paintMask.ts` `neckPlace`) in the builder's smooth Flat black; the knit suit glossy but a little under the first shine (cloth 0.49; Joshua: the full
  shine picked out her nipples, half looked too plain; "a sci-fi spacesuit"). `clothShine` in `looks/gear.ts` is `{ cloth, trim }`: the game swaps the knit's and
  the Flat cloth's roughness, her skin keeps its own. Her suit layer is painted by code (`paintSuit`, his fabric) so
  it covers her cleavage (the builder's 3 paint layers are all used); a
  leather belt slung on her hips that sags in front (`beltLine`), and black guns with red (`gun`, per look; the clips
  in her pouches and on the table match). The suit is his athletic knit in its Dark gray, darkened about half way to Black by the game (`clothShine.darken`).
  Its knit is a LIVE KNIT drawn by the game over the bake (`clothShine.knit`, `outfitMaterial.ts`, laid on from three
  sides; `setKnitStitch` sizes it live for test pages): the PERFORATED MESH of his picture ("a multi-layer breathable
  mesh, but where no skin shows through the holes"), drawn by `Game/scripts/make_mesh_tile.py` as
  `public/fabrics/perforated-mesh-tile.png`, at 1.5x (Joshua's pick: the picture's own hole size, 1.2x, blurs at game distance). The athletic swatch
  (`athletic-darkgray-tile.jpg`, `ATHLETIC_KNIT`; Joshua picked 2.2x for it) is kept.
  SUIT FABRIC (Joshua, 2026-11-19): Settings -> HEROINE -> Suit fabric (`gdm.suitKnit`, `?knit=`): his WOVEN MESH PHOTO
  (`public/fabrics/woven-mesh-tile.png`, made to tile by `scripts/make_weave_tile.py`: light flattened, edges cross-faded
  thread on thread, glints softened; at 2.4x, Joshua: 3x read "a bit coarse" in first person) is the default, the drawn
  perforated mesh the other choice (`SUIT_KNITS`). It is laid on by where her skin WAS as baked (`knitRest`, shapedBody.ts),
  so it STRETCHES with her belly: measured per pixel, from 4% to 40% stretch its holes open (darker gaps, flatter threads).
  Its depth fades where a thread is under about two pixels (no shimmer where the cloth curves away).
  Its THREADS HAVE REAL DEPTH, 0.5 mm (Joshua, 2026-11-19): his height map (`woven-mesh-height.png`, made in his
  LOCAL TEXTURE LAB, `docs/tools/Local_Texture_Lab.html`: an offline page that turns any picture into seamless
  base/height/normal/roughness/AO maps, or makes rocky dirt, sand, mud and cliff textures; use it for later textures) is
  read the same three ways as the knit and tilts the light per pixel (a bump, `outfitMaterial.ts`): nothing moves, so it
  costs almost nothing. 1 mm looked grainy close up. The tile is the lab's Base Color so the two line up thread for thread.
  See-through: nipple 0.43, navel 0.81 (Joshua, 2026-11-19: "I can't really see the belly button at 150%"; was halved to 0.225/0.4). His plain catsuit, nothing added, is the look `blazeCatsuit` (to compare).
  `trunkPlace` turns round her trunk's MEASURED middle at each height (her back plus half her usual depth); round a
  line straight up from her hips, her upper back read as her side and stripes spilled across it in ragged bands.
  THE "HOLES" ON HER BACK SHOULDERS (Joshua, 2026-11-21) were a lone red speck in its black border on each: the back
  stripe's top ran on past her armpit (where her skin is her ARM's), was cut, and its end came out on the back of her
  shoulder. It now ends under her arm (`STRIPE_TOP.back` 0.88 -> 0.8). Re-baked on builder v0.9.60 (front unchanged)
  and its skin height remade.
- SENSITIVITY (Joshua, 2026-11-21: "lower the camera sensitivity (ahh, make movement and camera sensitivity adjustable in
  settings)... then I can tweak both"): Settings -> CAMERA -> Camera sensitivity (`gdm.lookSensitivity`, 20-200%, starts
  at 60%, 100% the old speed: cameraRig.ts `lookScale` on drags and the camera stick) and Move stick sensitivity
  (`gdm.moveSensitivity`, 20-200%, starts 100%: controls.ts `moveScale`, the stick's push scaled, never past its edge, so
  above 100% each ring comes with less of a push). Both live. (A saved zoom closer than -0.1 was thrown away at start:
  heroineSettings.ts now keeps it down to -0.2.)
- CAMERA STYLES (Joshua, 2026-11-19; `Game/src/camera/cameraRig.ts`): the CAM button also goes to SIDE L and SIDE R,
  square to her left or right side at her middle's height, turning with her (eased), so her whole profile and belly
  show. In them, aimed by hand, dragging up and down TIPS HER HEAD within her neck's reach, as first person does
  (Joshua, 2026-11-20: "For the side views, can we make up and down work for the head?"; main.ts `sideView`,
  cameraRig.ts applyLook); left and right already turned it. ZOOM IN TWICE AS CLOSE, EVERY STYLE (Joshua, 2026-11-21: "double how close you can zoom in with all the cameras";
  cameraRig.ts `ZOOM_MIN`, `styleSpan`): follow/orbit to 0.8 m (was 1.6), shoulder 0.38 m (0.75), side 0.9 m (1.8), top 3 m
  (6), drone 1.25 m up (2.5); zoom 0 to 1 as before. AIMED BY HAND (manual) CAM now shows in third person too and goes round its own few styles (shoulder, follow,
  side L, side R; `gdm.cameraStyleManual`); while FIRE is held and 1.2 s after, the camera is over her shoulder whatever
  is chosen, and away from it she aims level the way she was turned and the crosshair is hidden.
- GUNS AT THE START, AND AT REST IN THIRD PERSON MANUAL (Joshua, 2026-11-20: "Why are the guns always raised and ready
  to shoot at start in 3rd person and missing the crosshairs?"; "Keep guns in holsters at start up"): she starts with
  both guns in their holsters (holsterUse.ts `startHolstered`; DRAW takes them out). Drawn, in third person MANUAL with
  the camera not over her shoulder (follow, side), her guns are DOWN, not aimed; FIRE brings the shoulder camera, the
  crosshair and her aim (main.ts step 4).
- HUD (Joshua's pick "design 4", 2026-11-18; `Game/src/ui/hud.ts`, `hud.css`): vitals card top-left with one FPS/version
  line under it (full readout only with "Show full readout"; dome test buttons in Settings -> TEST TOOLS); a rail of
  square buttons on the right edge that show only when needed (HOLSTER/DRAW, RELOAD at the table or from the belt, CAM,
  AUTO/MANUAL); L/R beside it pick the hand for the next action; one prompt bubble near the table or a bar; FIRE always
  on screen. Every control is in Edit controls (`layoutEditor.ts`). Aim/fire/reload start MANUAL (`gdm.autoFire2`).
- Heroine: the builder's full body with its real painted clothing and cloth simulation (one heroine on screen).
  Aiming is procedural. Six heroines: Blaze, Coral, Vela, Nova, Tessa, Aurora. Their outfits are built in `Game/`.
- Outfits are ARMOR FIRST (Joshua, 2026-11-16): real 3D armor built in code (`Game/src/armor/`). Rigid pieces
  locked to a bone (helmet and visor, shoulder pads, forearm guards, knee and shin armor, boots, guns); plates
  that follow the skin, made from her own skin surface pushed outward so they grow with her belly and breath
  (chest, hip and thigh plates, Tessa's and Aurora's belly shells); and only a thin painted under-suit beneath,
  so no bare skin shows where plates meet. A piece that must match an image exactly can later be a Meshy model.
- Enemies come from all around the dome sky; rooftop turrets cover sections of it. Cards, waves, tech tree,
  quests, missions and bosses carry over from the HTML version. Economy starts fresh, saved locally.
- COMMANDER DIRECTION (Joshua, 2026-11-16, after ChatGPT's design review, kept outside the repo): the rooftop
  turrets are the main guns (about 65% of the work), the heroine commands the dome and fights, repairs and
  boosts (about 25% + 10%). A mission is 5 waves + a boss (5-10 min), with an untimed calm build phase between
  waves and a pick-1-of-3 card after each. Duplicate turrets allowed; first four: Flak, Mortar, Laser Lance,
  Shield Projector. MP is earned and spent inside one mission and resets; Shards are permanent. Blaze first,
  then Tessa. A breach is a recoverable crisis (enemies fly in and attack the city core until the section is
  resealed). A HUD minimap opens a full-screen Command Radar (a 2D overlay, never a second 3D scene) and the
  game pauses while it is open. Sector health colours on the radar are Joshua's 11-stop scale (neon green at
  100% down through browns, orange, red, magenta at 10%, charcoal at 0), always with the number shown.
- First step is split: 1a = one playable wave (a couple of enemy types, two turrets, dome damage, Blaze
  fighting, the minimap ring); 1b = the rest of the five-wave mission. Later: six heroines and abilities;
  Power/Repair/Radar buildings, a few residents, short story quests; one small rover; then Kawi.
- Outfits (Joshua, 2026-11-16): the first 3D armor "looks too boxy". Helmet, armor, guns and boots stay 3D
  pieces but must be reshaped to match the attire in his images; NO body paint until the armor matches. Some
  outfits show the bare belly (as his images do).
- THE BUILDER, v0.9.71 (copied 2026-11-21 from its `main` a2bf91c at Joshua's word, "9.71 is being deployed now for CCBS, grab the
  latest": his face, eyes, facial hair and twelve hairstyles; in SQUAT and RECLINE her bump carried as she stands and her
  thighs giving way to it, `bellyContact.ts`; seated, the side and back of her hips keep her own weights. Before that
  v0.9.68, `main` e2ebcf8, at Joshua's word: her seated fixes, no pinching at her belly
  and pelvis, and the male body's outfits; checked in the BUILT game, her hidden live body running. Before that v0.9.60, 2026-11-20, `main` bae4157: the catsuit DRAWN, smooth edges; its
  neckline from a low U/V to a turtleneck, neck shape and width; a CHEST CUTOUT, oval, diamond or keyhole; its room now
  disposes its head panel, the 350 MB leak; before that v0.9.51, skin depth's hybrid; v0.9.49, the hybrid pregnancy
  curve, kicks, exact belly %; Joshua says when to copy a newer one). EVERY OUTFIT RE-BAKED ON v0.9.71 (v0.2.142, his
  standing rule): all 19 looks and John, skin heights, packed pictures (45-65 dB, all marked packed) and thumbnails; before/after
  pictured. `blaze` (the all-pink two-piece, `?look=blaze`, not in Settings' list) had last been baked on v0.9.40 at a
  100% belly (week 37); it is now baked at its look's 10% (Joshua's export of 2026-11-19), as every other look is. Since v0.9.45 it can UPLOAD AN IMAGE as a
  piece's texture (kept with a saved character) and EXPORT one, several or all characters, as a zip with the pictures
  and the JSON when an image was uploaded. For later (Joshua): reference images painted on her body by its UVs and
  scaled to size, for more exact looks.
- HER LIVE BODY IS COMPLETE (Joshua, 2026-11-19): `models/sarah-skeleton.glb` is shipped (`Game/charb-files.json`), and
  as in the builder it is FITTED INSIDE HER ONLY WHEN WANTED (X-RAY raised, or her sneakers off: `SarahLabScene.ts`,
  "seconds of work on a phone"). So the hidden live body always wears the builder's sneakers (`liveBody.ts` `bareLook`;
  never drawn): with no shoes it was fitted on every load, and the iPhone froze and crash-reloaded ("A problem
  repeatedly occurred"), as the builder's own room did on 2026-11-11. Also: every reload lets go of the graphics first
  (`core/restart.ts`); the hidden live body opens without clothes, fabrics or hair. The dev server reads Char_B
  directly: check the BUILT game.
- THE ISLAND IS THE MAIN MAP (Joshua, 2026-11-19; `Game/src/world/island/`): Beyond Extinction's real Kauai DEM at TRUE
  SCALE (56 km, 8 x 8 tiles of 7 km, copied into `Game/public/island/`, see its `COPIED_FROM.md`; never edited by hand).
  The 3 x 3 tiles round her are loaded (in a worker), the one(s) within 1.5 km of her at the fine grid (192 phone /
  256 computer) and the rest at half; past them one coarse mesh of the whole island (`overview.png`, made by
  `scripts/make_island_overview.py`). Sea, shore and day sky from Beyond Extinction. The game's (0, 0) is her arrival
  point, BE's Wailua beach spawn (island metres 21290, 1288), facing inland; heights are metres above the sea and she
  stands on the drawn ground (`setPosition(x, z, y)`; the camera keeps above the ground). She wades to 0.6 m deep and
  cannot climb slopes over 1.2 m up per metre. The table, bars and door stand on the beach beside her. The domed town
  is kept as a test map (Settings -> WORLD -> Map, `gdm.map`, `?map=town`) until Joshua picks its place on the island.
  Her FEET stand on the ground under each of them (`footGround.ts` 9, `setGround`): she comes down to her lower
  planted foot's ground, the higher knee bends, each foot is tipped along its slope (up to about 28 degrees).
  RIVERS AND LAKES (Joshua, 2026-11-19; `carve.ts`, `carveCore.ts`, `hydro.ts`, from BE): the real waterways are cut
  into each tile's heights as it arrives and filled with water levelled on the FINE grid (`fineHeightAtIsland`), built
  per tile once its 4 neighbours are in. In a river or lake deeper than 1.25 m she is held up to her shoulders
  (`standAt`: a stand-in until swimming); the sea still stops her past her knees. `waterLevelAt` takes the NEAREST
  river sample (not the highest) and ignores reaches levelled below the sea.
  THE FOREST, PHASE 1 (Joshua, 2026-11-20: "landscaping next... what Beyond Extinction did which I think was flat
  images... also check TCS"; `world/island/trees.ts`, from BE's `KauaiTrees.ts`): BE's PHOTO TREES, each one camera-facing
  quad swayed by the wind in the shader, one draw per kind per 300 m patch, planted where the REAL island has trees or
  shrubs (BE's USGS/ESA rasters, `public/island/veg/`) and off the rivers and lakes, kind by height above the sea (palm,
  cycad, sago, fern, aspen, conifer, bush under all), streamed within 1050 m of the camera, drawn to 900 m (dithered
  out), let go past 2600 m. Settings -> WORLD -> Trees (`gdm.trees`, `?trees=off`); the full readout's `trees N · D
  draws`. At the arrival: about 1,000-4,800 trees in 47-82 draws, 2 triangles each.
  LANDSCAPING, PHASE 2 (Joshua, 2026-11-20: "Only Image Landscaping / Hybrid - Image + Objects / Only Objects";
  `treeObjects.ts`, `treeModels.ts`): Settings -> WORLD -> Landscaping (`gdm.landscaping`, `?land=`; live): Images only,
  HYBRID (default: within 60-80 m each photo turns into a 3D model of its kind on the same spot), Objects only (3D to
  280 m, light models past 80 m), Off. The 3D trees are made in code after Thronemound's tree maker (leaning, flared,
  tapering trunks; boughs on a golden spiral; palm/cycad/sago/fern rosettes of drooping fronds; conifer tiers; leaf
  cards from one leaf picture drawn in code), Thronemound's bark photos (`public/island/bark/`), a palm bark drawn in
  code; one instanced draw per kind per piece. Their TRUNKS ARE SOLID (`trunkBlocks`, her body 0.25 m round). Their bark FACES OUT (Joshua, 2026-11-21: a palm's trunk drawn inside out, 'flipped'; treeModels.ts `tube` had its triangles wound inward, 0 of 112 facing out on a palm; now all out). EVERY
  FADE WIPES UP THE TREE (Joshua: "fade top to bottom... you can see the trunk of it first"): the trunk shows first and
  the top last; photo and 3D wipes are exact opposites at the swap. Next: ground cover (grass, small ferns) near her.
  Not yet: swimming.
- HER STRIDE GROWS WITH HER SPEED (Joshua, 2026-11-20: "the faster you run, the longer the stride length"; "let the
  longer stride carry her about 10% faster"; `Game/src/heroine/fast/strideShape.ts`): the game writes her legs itself
  (the builder's writeLeg, with numbers that follow her speed, `STRIDE_ROWS`): stride 1.18 m walking, 1.95 jogging, 2.55
  running, 3.1 sprinting (shorter with her belly), each foot down 56% of a stride walking to 23.5% sprinting (the rest is
  FLIGHT: the stride grows in the air, her hip never reaching further than the builder's own run), knees lifting higher
  and her feet nearer one line the faster she goes. Her feet's planting follows the same share (`plantedAt`,
  footGround.ts). Jog, run and sprint are 10% faster: 2.64, 4.18, 6.05 m/s (full term 1.72, 2.41, 3.44), her stamina
  and effort tables moved with them. The readout's `stride` line: her stride now and the share a foot is down.
- CROUCH, PRONE, ALL FOURS (Joshua, 2026-11-20: "Walk while crouch, crawling on belly (however, once pregnancy is on,
  make her crawl on all four with weapons holstered)"; his answers: separate CROUCH and PRONE buttons, all fours
  "whenever Pregnancy is on", on her belly "aim and fire propped on her elbows while still", on all fours still she
  "can pull out one... (keep 3 contact points to ground), but has to holster it before moving";
  `Game/src/heroine/fast/groundPose.ts`, `STANCE`): the builder has neither, so they are the game's, written as the
  builder writes its walk (turns from her bind pose). CROUCH: her hips drop (0.36 of her leg) with her feet kept planted
  (footGround.ts `crouchDrop`), her back leans 24 degrees, her head kept up; walk pace only, 0.9 m/s; she aims and fires.
  PRONE (not pregnant): her whole body tipped forward about her hips (`fit.rotation.x`) to lie along the ground (and its
  slope), chest propped on her elbows, head up; the ARMY CRAWL, one elbow reaching as the opposite knee is drawn up,
  0.35 m/s; aims and fires only while still. ALL FOURS (pregnant): hands and knees, her back about level, knees wider
  round her belly, the diagonal crawl, 0.55 m/s; her guns holstered going down and before she moves; still, one may be
  drawn (L, R or the main button draws the right). Down and up go through her crouch, STEP BY STEP (Joshua, 2026-11-21:
  "a more realistic transition from standing to crawling without the body sinking underground"; groundPose.ts `KNEEL`,
  `kneelTurns`, `downSteps`; then his marked pictures: "still cuts in a bit, what about going the standing to kneeling (one
  knee to both) then crawl?"): crouch, then ONE KNEE (her right knee down, its toes TUCKED under, heel up; her left foot
  flat in front, that knee at her hips' height, `frontThigh`/`frontKnee` 114), then BOTH KNEES (the front knee comes down
  beside it, its shin folded up under her on the way, `frontFold`, so its foot passes over the floor), then hands forward
  to ALL FOURS, then (prone) down onto her elbows; all fours 1.7 s down / 1.8 up, prone 2.2 / 2.3, still while she does.
  NEVER UNDER THE GROUND (`STANCE.groundPad`): each frame getting down or up her knees, ankles, TOES (the bone past each
  ankle, 4.5 cm: it sits that high in her shoe standing), hands, elbows, head and hips are measured against the ground
  under them and her whole body lifted by any that would be under. Measured in the lab: nothing under at any step; on
  one knee her back knee about 6 cm off the floor, both knees down at 5 cm (their joints' own height). (v0.2.118 went
  from the crouch to both knees with her feet pointed: her toes pointed into the floor while her knees were up.) The camera comes down with her (cameraRig.ts `lower`). Busy at the table, a bar or a door, she stands. Her
  body's yaw bands and her arms' keeping clear of her belly are off while she is down. NOTE: the BUILDER'S ELBOW BEND
  (about Y) only twists this body file's forearm (its arms already hang in the bind): the game bends elbows about X.
  The buttons sit just above FIRE (movable in Edit controls); PRONE reads ALL 4s while Pregnancy is on.
- HER HAND TO HER BELLY WHEN THE BABY KICKS (Joshua, 2026-11-20; `Game/src/heroine/fast/bellyTouch.ts`): on a new
  kick of her hidden live body (the builder's kicks: a spot, a way out, a push), a FREE hand (no gun, no job of the
  game's) goes: the nearer one, or the far one only if the way from its shoulder to just in front of the spot stays out
  of her belly; a spot it cannot reach is left. Its palm rests 2 mm off HER OWN skin there, and every finger
  bone too (Joshua: "re-measure and fix"; `skinPatch.ts`): her trunk's skin points as they lie NOW (skinned, breathing,
  read again every 0.3 s) measured onto a 26 x 26 cm grid of 4 mm cells laid on her skin at the spot, the kick's bump
  added while it lasts; a ball, then a smooth fitted patch, were up to 5 mm in her or 1 cm off at the fingertips. Each
  finger bone in turn is laid 2 mm off it by its own joint (fingerTouch.ts `layFlat`: closing where her skin falls away,
  opening back up to 35% where it rises), HER THUMB RESTS ON ITS OUTSIDE EDGE, SPREAD AWAY FROM HER FINGERS (Joshua: "find the
  outside side of the thumb and that will be placed against the belly"; "needs to rotate away from the fingers"):
  `handPads.ts` measures each thumb bone's flesh on the side away from the index finger (Blaze 14.4 / 7.9 / 9 mm);
  `layThumb` tries its base opened out, its outer joints and a tip at its base together, keeps its skin 8 mm off the
  index finger's (`thumbApart`), and takes the place whose outside edge lies nearest along her skin (its tip still
  lifts about a centimetre over her belly's curve: a straight thumb cannot wrap); 3 s, then back; 1.5 s
  before another. Measured with `handGaps(hand)` (test pages): palm 2 mm, finger bones 2-6 mm off her (mid-bone over a
  hollow), none in her.
  WHEN, AND WHICH HANDS (Joshua, 2026-11-20, bellyTouch.ts `BELLY_TOUCH`): 35% of kicks call a hand, 3-7 s after the
  kick; it rests 3-7 s; on 40% of touches she LOOKS, 2-3 s after her hand lands (1 s down, 0.5 s, 1 s up) and her hands
  let go as her head comes back up. First person the view does the look (the camera is her head); turning the view frees her
  head where it is, firing eases it back; no look while firing, 3 s
  after, or from a run. With both hands free, 1 in 3 touches put the other hand opposite round her belly (180 degrees
  +-25). HOLDING HER BELLY UP (Joshua: "from a run and up", "anything over 30 weeks"): a free hand under its low curve
  toward its own side, fingers forward and in, as far under as her arm reaches (`startSupport` searches the egg),
  until she slows below a jog-and-a-half (main.ts SUPPORT_*); the other hand keeps its gun and fires.
  WINDED (Joshua, 2026-11-20; groundPose.ts `WINDED`): UNTIL HER BREATHING IS 28 A MINUTE OR LOWER (Joshua, 2026-11-21:
  "wait to release her until her breathing is about 28 or lower instead of our 10s so it's more dynamic"; input/pace.ts
  `windedBreathsUp`, at least `windedLeast` 5 s, at most `windedMost` 20 s: fear adds breaths), then she straightens up over
  1.5 s (`windedRiseSeconds`, his "same 1.5s for consistency"). Measured with the game's vitals: a sprint to empty stands
  up at 11 s, a run at 15 s, a jog or a pregnant sprint at the 5 s least. THIRD PERSON SHE LOOKS ROUND (Joshua: "randomly
  looks around like her belly, chest, feet, maybe off to the sides a little up at the horizon... Lerp's between points";
  fastHeroine.ts `lookRound`, `WINDED_LOOK`): resting 1.2-2.5 s on a spot, gliding 0.7-1 s to the next (eased), mostly down
  while her breath is high, more aside and to the horizon as it calms (`windedCalm`); first person keeps her bowed head.
  Bent over 40 degrees
  (lowerBody.ts `bendOver`: most at her hips, leaning in to 50 if her hands fall short, NEVER her hips forward: with
  them forward she tipped over her toes, "over halfway to fall over"), a deeper squat (Joshua: "a
  slight more squat so her hands are closer to her knee"; hips down 0.36 of her leg, knees out round her belly), both
  palms (guns and all) on her thighs 7 cm above her knees, her head bowed as far as it goes ON HER BENT BACK, chin to chest, 65 degrees from her back's line
  (Joshua: "the max downward angle relative to the torso as the head doesn't offset off the torso"; `WINDED.headDown`); eased in 0.6 s, back up over the
  hold's last 1 s; no aiming or firing; FIRST PERSON the view is her bowed head (about 117 degrees down in the world: her chest,
  belly and hands on her knees); turning the view frees her head (no side limit except at the table, bars and door, 90
  each way; up and down her neck's reach). HER THUMB (Joshua: "the thumb is hidden in the belly"): its curl only folds
  it across her palm, so it is laid by trying its curl AND a tip at its base toward her palm's side together
  (`layThumb`, `tipThumb`, once a touch), measured from its second bone out (its first is under the ball of her palm). Not while she is down. Test pages: `pokeBelly(round, up)`.
  HAND PADS (Joshua: "measure out from each finger and thumb bone to the skin... create that finger offset file for all
  future hand related tasks"; `Game/src/heroine/fast/handPads.ts`): each finger and thumb bone's flesh on its touching
  side, and her palm's, MEASURED from her own skin when she is made (fingers straightened, the pad side square to each
  bone in the plane her fingers curl in; her two hands averaged as a pair); fingerTouch.ts uses them for every hand job
  (poles, door, clips, belly) instead of one guess. Blaze: finger bones 7-11 / 6-8 / 5.5-7.5 mm, thumb 16 / 15, palm 15.
  Logged as "[hand pads]" in the console.
- (The heroine lab shows no body at detail under 100 with `live=off`: use `detail=100` for test pictures.)
- THE LAGOON BEHIND THE BEACH (Joshua, 2026-11-20, screenshots: "different splotches... that water is too transparent
  it stopped me before I thought I was in the water"; "the ocean was fine, it was the closest inland water"): the
  Wailua river's mouth is low ground at sea level, drawn by the SEA (ocean.ts), and a river cascade streak lay across it
  where it crosses a tile seam (x = -290). Cascades now only where a river falls 3 m in 100 (hydro.ts
  `CASCADE_MIN_SLOPE`): on flat water the 64 m streak was the pale straight-edged patch. Near the camera the sea is full
  by half a metre deep (was 1.4 m; `hiddenG`/`visibleG`), so the lagoon reads as water where she wades.
- OUTFIT PICTURES IN SETTINGS (Joshua, 2026-11-20: "a little thumbnail... bake the images at 10%, 50%, 80%, 120%, and
  150% and it will pick the closest based on the belly slider"): `public/thumbs/<look>-<belly>.webp` (135, 120 x 200,
  about 4 KB each), made by `Game/scripts/make_outfit_thumbs.py` from the built game; Settings -> Outfit is a grid of
  them (hud.ts), each the picture nearest her belly, a catsuit in the chosen style. Re-run the script for a look after
  re-baking it. Hidden once the story game decides outfits.
- HER PREGNANCY (Joshua, 2026-11-19; `Game/src/heroine/pregnancyPlan.ts`): Settings -> PREGNANCY has Pregnancy on/off
  (`gdm.pregnant`), a Belly slider 10-150% with a lock that opens all of 0-200% (`gdm.belly`, `gdm.bellyUnlocked`), the
  week shown beside it off HER OWN builder chart (Blaze: START 10% = week 12, BIGGEST 150% at week 42, END 30%; the
  builder's hybrid curve), and a TIME LAPSE from week 12 to her delivery week at a day a second (7 s a week, 224 s),
  stopping there exactly, with the week in a chip at the top (a tap stops it). Off: her belly is only her shape (no
  weeks for her vitals, no slowing, the hidden live body's PREGNANT pressed off so no kicks). The story's plan: 10% not pregnant for a while; pregnancy on at 10% (= week 12);
  growing with the weeks over quests to 150% at 42; off at the birth; over 3-4 game months settling to 30%. The birth and
  the settling are for later.
  HER BELLY'S SHAPE comes from the builder itself (Joshua, 2026-11-19: the time lapse gave "a pointy belly"; "update
  every 1%"): the hidden live body's belly follows hers once it has stayed put 0.35 s (or once a second while it keeps
  changing: at every whole percent at once, dragging the slider closed the game on the iPhone), and 0.2 s after a change the WEIGHTS the
  builder gives every body shape, and the points it moves itself, are read off its skin (`liveBody.ts` `takeShape`,
  CPU only) and she takes their change since her baked belly (`shapedBody.ts` `setBuilderWeights`; her four motion
  shapes stay with her motion, which tilts a bigger belly by itself). v0.2.68 read her whole skin back from the graphics
  chip instead: three.js copied her 43 body shapes for it, about 160 MB each time, and an iPhone closes a page for that.
  HER NAVEL comes out with her belly as in the builder (Joshua, 2026-11-19: "In CCBS it does automatically... in real
  time"): the builder's shader pushes it out by her womb's pressure (`navelSoft.ts`), and that push is read on the CPU
  (`navelOffsetOf`) with the points; where the builder moved points, her surface's directions are worked out again from
  her triangles (`shapedBody.ts` `renormal`), or the outie stayed lit like the baked innie and read as a dark hole.
  What stays as baked: the painted pictures (her suit's colour and fine detail), which only stretch with her.
  Without the live body she keeps the few size shapes only.
- HER FACE, BUST AND BELLY STAY SHARP at every detail level (Joshua, 2026-11-19: at 1% "her face and belly looks bad";
  `sharpParts` in `Game/src/heroine/fast/detailLevels.ts`): their points (her head above her neck, and where her belly,
  bust and navel shapes move her) are LOCKED, so the lightening never takes them away; the rest of her is lightened.
  At 1% she is then about 58,000 triangles (8,000 without, 233,000 at 100%). Settings -> HEROINE -> Sharp face, bust &
  belly (`gdm.sharpParts`, `?sharp_parts=off`) turns it off; changing it reloads.
  ONLY WITH THE CAMERA NEAR (Joshua, 2026-11-19: "at 2m out (or body height) and beyond that, it starts fading like
  normal"): two sets of levels (worker meshes 0 sharp, 2 plain; level KEYS in shapedBody.ts `PLAIN_KEY`); within 2.0 m of
  her middle (or first person) the sharp one, past 2.3 m the plain one. At 1%: 58,549 near, 8,163 far.
  12 M NOW (v0.2.140; Joshua, 2026-11-21: "What is the detail for the belly?", then "Try raising the distance to 12
  meters"): fastHeroine.ts `SHARP_WITHIN` 12, `SHARP_LEAVE` 12.5. Within it her belly (with her face, bust, hands and
  arms) is at 100 %; past it, the plain set, at the level with the rest of her ("100% detail on belly below 12 meters,
  can be 1% over 12 meters"; a 50 % belly part far off was tried and taken out before it was pushed). The pointy
  belly he saw during the TIME LAPSE is not detail: her live body's shape reaches her at most once a second while her
  belly keeps changing (liveBody.ts `LIVE_BELLY_EVERY`, kept at 1 s: his call); stopped, it is the builder's shape.
  HER HANDS TOO (Joshua, 2026-11-19: her fingers round a bar "look weird" at 1%): locked as her face (out at her sides,
  below her wrists, as `skinImportance` finds them): at 1% near she is then 92,075 triangles.
  HER ARMS TOO (Joshua, 2026-11-20, Look 2 at 25% near: "her arm is flat like a pancake"): her left upper arm lightened to
  a flat strip; locked (shoulders to wrists, out at her sides) it stays round. More weight in the lightening alone
  (`skinImportance` `arm`, kept for the far levels) was not enough.
  HER SHOULDERS AND NECK AT 30 % NEAR (v0.2.134; Joshua, 2026-11-21, a close-up with John in the game: "Her shoulder
  looks off"): between her sharp head and arms, the band from the top of her chest to her head was lightened with the
  rest, and in the lab at 10, 5 and 1 % each shoulder's top folded into one flat slab with a sharp corner and the
  collar's edge went jagged (round at 30 %). With John in, the frame rate is lower and Auto live took her under 30 %.
  Now that band (detailLevels.ts `shoulderPart`, from `SHOULDERS_FROM` 0.76 of her height to her head) is a PART kept
  at 30 % (fastHeroine.ts `SHOULDERS_DETAIL`) in the sharp set only: about 2,300 triangles more (Shadow Operative at
  1 % near: 103,643 -> 105,991), round at every level. v0.2.135: IN HER FAR (PLAIN) SET TOO (Joshua, his picture from
  about 3 m: "Her shoulders still aren't fixed yet": past SHARP_LEAVE she wears the plain set, which v0.2.134 left
  out); lab at 3 m, 1 %: round, 14,113 triangles in all. Not on a male body.
- HER HAIR AS STRANDS AND LOCKS (Joshua, 2026-11-19: "add lines in it, add depth to look better than a shiny hat";
  `Game/src/heroine/fast/hairStrands.ts`, chained after the builder's own hair patches, game only): locks a few mm wide
  across the strands (the hair picture's U; strands run down its V) with darker grooves, 0.8 mm of bump depth, and hair's
  own BANDED shine (Kajiya-Kay, from the strand's direction worked out per pixel) in fine streaks, the plain round shine
  turned down (roughness 0.9). All of it fades where locks are smaller than a pixel (no sparkle) and on cards seen
  edge-on (the parting faded into the hair, his ask). Settings -> HEROINE -> Hair strands (`gdm.hairStrands`,
  `?strands=off`). To be made permanent in the builder by its own agent if Joshua wants.
- THE BRAID'S FACE LOCKS EASED OFF HER CHEEKS (Joshua, 2026-11-19: "is this one hair strand in the cheek?... Just offset
  that piece, don't remove it"; `fastHair.ts` `easeFaceLocks`, braid only: the ponytail's long side locks hang clear
  already): the small pieces of the hair file lying in front of her ears went INTO her cheek (the tip showed as a dark
  speck); each one's lower part is moved straight out from her head, NOT its top (it stays in her hair: Joshua, "now the
  top part is out of the hair"), growing with the square of the way down to 45% of its length at the tip, so it comes
  out of her cheek and rests on it. (A try at testing each point against her skin on the CPU found them all clear: the
  CPU's skin is not where the drawn one is, so the move is measured by eye.) Settings -> HEROINE -> Locks by her face (`gdm.faceLocks`,
  `?face_locks=on` for the builder's own place).
- HER SKIN'S DEPTH, THE BUILDER'S HYBRID (Joshua, 2026-11-19, relayed from the builder's agent; Char_B/CLAUDE.md "THE
  HYBRID, AS IT IS NOW"; `Game/src/heroine/fast/skinTexture.ts`): two depths on her BARE skin only (where the roughness
  picture reads below cloth), one bump: (1) her own skin picture's depth, 0.5 mm: each look's own baked picture turned
  into a 4096 height map by the lab's Convert recipe, edge blending off (`scripts/make_skin_height.py`, the same maths as
  the builder's `scripts/skinHeight.mjs`; her game body's layout is not the builder's skin file's, so made per look ->
  `public/heroines/<look>/skinHeight.webp`; re-run after re-baking a look), read where her colour is; (2) the builder's
  pore and crease tile, 0.3 mm (`charb/models/skins/skin-detail-1024.png`, in `charb-files.json`), triplanar on where her
  skin was as baked (`knitRest`), 6 cm a tile, pits 18% darker. The builder's numbers; keep them unless Joshua changes
  them. ON by default: Settings -> HEROINE -> Skin depth (`gdm.skinDepth`, `?skin_texture=off`).
- HER SKIN'S SHINE, DRY TO OILY, AND WET FROM THE WATER (Joshua, 2026-11-19: "dry skin a little darker, more oily or wet
  skin could naturally have the shine... stepping in the water would turn her skin more shiny for about 2 minutes and
  then fade over 30s... getting wet would be instant"; `Game/src/heroine/fast/skinShine.ts`, bare skin only): Settings
  -> HEROINE -> Skin shine 0 dry (rougher +0.18, 5% darker) .. 25 NATURAL, the default (Joshua: "I would set 25 as
  normal"; `SKIN_SHINE_NATURAL`) .. 100 oily (smoother -0.25) (`gdm.skinShine`, `?shine=`, live). WET: roughness 0.12 and 12% darker, only below the WATER LINE (the deepest the water came up her this
  time, measured from her feet in her model's own height, plus 5 cm of splash, a 6 cm soft edge); main.ts tells her the
  water's depth at her feet each frame (a river or lake's surface, or the sea's, `island.seaLevel`, above the ground);
  `SkinWetness`: wet at once, fully wet 120 s after leaving the water, then dry over 30 s. Settings -> TEST TOOLS -> Get wet
  soaks her all over (for the town map).
- HER FOOD BAR IS HER STOMACH (Joshua, 2026-11-19: "Full food = max stomach, half food = about normal, below 1/3 to 1/4,
  hungry kicks in"; `Game/src/vitals/heroineVitals.ts` `foodBarOf`, `VITALS_TUNING.foodBar`): the bar is the FOOD in her
  stomach: empty 0, the builder's stomach room (450 mL, where her belly starts to stand out) half, the most a stomach
  holds (1.5 L, her belly at its fullest) full. HUNGER (speed, health) from the bar: none above a third, worst empty
  (thirst stays the builder's gut's). Under half her belly draws in, up to 180 mL of room at empty
  (`bellyShrinkMl` -> `skinBreath.ts`). Water in her stomach still stands her belly out but is not on the food bar.
- HER WATER BAR DRAINS, WATER BEFORE FOOD (Joshua, 2026-11-19: "does the water drain at all?... fluids is what really
  should be draining the fastest... You can only survive a few days without water"; `waterBarOf`, `VITALS_TUNING.waterBar`):
  the bar is her WATER BALANCE (body water over or under what she needs, plus what is still in her stomach): balanced
  half, 500 mL to spare full, 1.2 L short (2% of her weight) empty. It falls from the moment she stops drinking (about
  100 mL an hour at rest, up to 500 more running hard; at the 15x clock about half in 15 real minutes standing, empty in
  about 20 running). THIRST from a third of the bar (400 mL short). Health: parched wears it at the full rate, starving
  at a seventh (`health.hungerShare`, 3 days against 3 weeks); neither alone takes her under 30.
- OUTFITS CHANGE WHILE THE GAME RUNS (Joshua, 2026-11-20: "It should freeze the screen, remove the old clothing, apply
  the new one, then unfreeze"; main.ts `changeOutfit`): Settings -> Outfit (and suit fabric, hair strands, skin depth,
  face locks, sharp parts, and since 2026-11-21 Live body on/off) no longer reload. NOTHING VISUAL RESTARTS THE GAME
  (Joshua, 2026-11-21: "turning the stats on and off are causing a whole app restart which ends up crashing... It's just a
  visual toggle"): Show full readout is shown or hidden at once (hud.ts `setDebug`; the readout is always made), the eye
  sliders are read every frame; only Map, Body (Performance/Visual) and Skin (the Visual body's) still restart, as they
  build a different world or kind of heroine. An outfit swap that throws part-way still falls back to a restart. The game freezes under a "Changing outfit" cover, waits for whatever she is
  doing to end (lets go of a bar or door), LETS GO OF THE OLD BODY FIRST, makes the new one where she stood (facing,
  belly, pregnancy, view, guns in hand/holster/on the table with their rounds, full pouches), then unfreezes. Everything
  holds her through ONE stand-in (`heroine`, a Proxy onto `bodyNow`), so nothing is handed over again. Her hidden live
  body is KEPT when the new look is on the same body (`detachLive`, `readAgain`). Checked with heap snapshots: memory
  settles over six swaps. LEAKS FOUND AND FIXED: a closure made inside the swap kept the old body (keep loader callbacks
  out of scopes that hold old things); the builder's head panel leaves a page 'pointerup' listener that kept every
  closed hidden room (builderRoom.ts PAGE LISTENERS removes it; BUILDER BUG: headPanel is not disposed in its room's
  dispose); prints' and skin-depth pictures were never disposed.
- THE iPHONE AUDIT (ChatGPT, 2026-11-20, `GDM-iPhone-audit.md`, kept outside the repo): fixed in v0.2.89: the detail
  slider no longer costs MORE memory lower down (`LIVE_UP_TO = -1`: no level carries all 43 shapes; same look); a
  detail level no longer wanted is not built; only the last KEEP_LEVELS (3) levels and 100% are kept; the offline cache
  keeps only the game's own 4.5 MB at install (outfits, fabrics, builder, island kept on first use, each in its own
  store); the portrait cover's picture is 480 px wide. TEXTURES STAY AT MAX (Joshua: "if I can run it at max now at
  30-70fps, why lower the quality"): tiers (256-4096, Auto) are the LAST thing to try, only if crashes remain.
- MEMORY (Joshua, 2026-11-19: v0.2.81-83 restarted twice and closed on his iPhone a few seconds in): the LIVE detail
  levels (5% and under, all 43 body shapes each) were all kept once made; with her hands sharp too they were nearly as
  heavy as the high ones. Now any live level she has left is let go (`wear` in fastHeroine.ts); it is made again if she
  comes back to it.
- FOOD & DRINK, TO TEST (Joshua, 2026-11-19; Settings -> FOOD & DRINK, `main.ts` `intake`): snack bar 150 / small meal
  400 / full meal 700 mL of food, sip 100 / bottle 500 / canteen 1000 mL of water, each taken in over a few seconds (her
  bar and belly rise as she eats); Make hungry / Make thirsty (bar to 25%); Bathroom: she squats 5 s (`squatFor`, a point
  just above her floor so lowerBody.ts squats) and her bladder (and rectum) is emptied (`vitals.relieve`), until there is
  a toilet. Body clock (`gdm.bodyClock`): 1x, 6x (Joshua's real-life plan, 1 h = 6 h), 15x (as it was, the default),
  60x, game hours per real hour for her gut. The full readout's last line: `gut food+water · bladder` in mL. The stomach
  holds at most 1.5 L (the builder's STOMACH.mostMl; more is refused); her belly stands out by all of it past 450 mL.
- THE BATHROOM BAR AND 🚽 (Joshua, 2026-11-19: "add a bathroom stat to watch"; `heroineVitals.ts` `bathroomOf`,
  `vitalsPanel.ts`): a fifth bar on her vitals card, her bladder (of the builder's 600 mL) or rectum (of 300 mL),
  whichever is fuller. Grey; AMBER at the urge (bladder 300 mL, rectum 150), RED and pulsing when strong (bladder 500,
  rectum 240; the builder's `BLADDER.urgeMl`, `RECTUM`). From the urge a 🚽 button shows left of the gear (pulsing red
  when strong; movable in Edit controls): it does the squat, 10 s (Joshua, 2026-11-21: "someone rarely ever goes in
  5s, lol"), still where she is, no aiming. Late in a pregnancy her baby presses on her bladder: it holds up to 30% less
  (`bladderSqueeze`), so every mark comes sooner. THE ETA (Joshua, 2026-11-21: "once it gets to 85% full, will show an
  ETA until you will go regardless of what's going on"): from 85% the 🚽 stat shows the real m:ss until full, from
  how fast it has been filling (`bathroomEta`, smoothed 8 s); at 0:00 she GOES WHATEVER SHE IS DOING (main.ts
  `mustGoNow`): lets go of a bar or door, drops what she was about to do, holsters her guns, stands, squats 10 s.
  To test: FOOD & DRINK -> Need to go (350 mL) / Must go now (520 mL).
- HER VITALS CARD, TWO LAYOUTS (Joshua, 2026-11-21, approved step by step as drawings; `vitals/vitalsPanel.ts`):
  Settings -> HUD -> Vitals style (`gdm.vitalsStyle`, `?vitals=`): LIST, the default (two columns: emoji, number, name;
  heart, breathing, speed, then her stats) or GAUGES (heart, breathing, speed as plain numbers on the left; four ROUND
  gauges over two rows of HEXAGONS, 4 then 3 tucked between, each ring filling like a bar). Settings -> HUD -> Units
  (`gdm.units`, `?units=`): Both (default: mph with km/h, °F with °C), Imperial, Metric. Emoji he picked: ❤️ heart rate,
  ⛑️ health (not ❤️: it read as the heart rate twice), ⚡️ stamina, 💧 water, 🍽️ food, 🔋 energy, 🚽, 👻 fear, 🔥
  adrenaline, mood's face (😄 great, 🙂 okay, 😟 uneasy, 😫 miserable), 🌡️, 💪 effort. THE PRIORITY LIST
  (`VITALS_PRIORITY`): health, water, food, stamina (the big four), energy, bathroom, fear, adrenaline, mood,
  temperature, effort; an URGENT one (bathroom from 85%, energy under 15%, fear over 75%, mood under 15%, temperature
  out of 35.8-38.5 C) SWAPS with the least important big one until it is not; what needs her attention pulses. CHIPS
  under the card only while they apply: 🤰 WEEK, 👶 KICK, 😮‍💨 WINDED, 🤕 PAIN, 🍽️ HUNGRY, 💧 THIRSTY. Checked at 932 x 430.
  UNITS KEPT TOGETHER (Joshua, 2026-11-21: "like 2.6mph(7.6km), or 96.6F(31.6C)"): 13.5 mph (21.8 km/h), 101.4 °F
  (38.6°C), one line in the list (under it on the gauges card, or it is 50 px wider); her pace's name is NOT on the card
  (it is over the MOVE stick; WINDED has its chip). The list's rows are a FIXED width (his screenshots: it grew with
  SPRINT/WINDED and 100.4°F ran into its name). Everything but the beating heart is written 10 times a second.
  THE NEW STATS (`heroineVitals.ts` VITALS_TUNING): ENERGY, her tiredness over the day on her body clock: drains moving
  (awake 16 h, plus effort squared a bar per 8 h, 30% faster late in a pregnancy), back STANDING STILL (empty to full
  in 3 h; his pick until beds and sleep); under half it caps how far her stamina refills (to 50% at empty) and lowers
  her mood. ADRENALINE: follows her fear and a fight (fired in the last 3 s: 35%) up in 1 s, jumps on a hit, fades
  over 90 s; lifts her heart (+12) and breathing (+2), refills stamina up to 50% faster, dulls pain by up to 60%, and
  CRASHES her energy as it fades (12% for a full fade). MOOD from her needs (Sims style), shown only. TEMPERATURE,
  37 C at rest, to 38.8 working her hardest, cooler wet (0.4) and in water (1 at 1 m), shown only. Effort and fear were
  there already, now shown. TEST: FOOD & DRINK -> Make tired (energy 10%).
- SOUND, AND HER BREATHING HEARD (v0.2.142; Joshua, 2026-11-21: his ElevenLabs breathing loops, "verify the breathing
  rate and maybe between the numbers speed up or slow down fading into the next one… level the sound effects across all
  of them"; he approved the preview: "sounds good to me and can add to the game"). THE GAME'S FIRST SOUND.
  `audio/sound.ts`: one Web Audio context (made as a step of the load, v0.2.144), woken by the first touch (and again whenever an iPhone puts it to sleep),
  suspended while paused or changing outfit; Settings -> SOUND -> Master volume (`gdm.soundVolume`, `?sound=`, 80%) and
  Breathing volume (`gdm.breathVolume`, `?breath=`, 70%), both live. The ring/silent switch mutes it on an iPhone.
  THE FILES: his sources in `docs/reference/audio/breathing/female-<asked>.mp3`; `scripts/make_breathing.py` MEASURES
  each one's real rate (every in- and out-breath is a sound between dips of quiet, round the loop; they alternate in all
  seven), tells in from out (the shorter of a pair, or the brighter), lists every breath ([in, out, end]), turns the loop
  to start at a breath in and smooths its old loop point (a click in the 45 and 40), LEVELS all to -23 LUFS (a quick
  limiter holds the few sharp peaks under -1.5 dBFS), one channel, MP3 80k, and puts a 0.1 s pad with a tick in front so
  the game finds where the breaths start whatever the browser's decoder did (`markerAt`). MEASURED (asked -> real):
  15 -> 16, 20 -> 24, 25 -> 30, 30 -> 28, 35 -> 58, 40 -> 78, 45 -> 116 a minute: ElevenLabs did not keep to the numbers;
  her range is 14 (16 pregnant) to 50 (about 70 with fear, pain, adrenaline), so the 45 is left out (`FASTEST_USED` 90)
  and 30-57 is a gap (he may make 35/40/45/50 files; the prompt given says seconds per breath). Out:
  `public/audio/breathing/female-*.mp3` + `female.json` (about 860 KB; kept on first use like the outfits, sw.js `audio/`).
  HOW IT PLAYS (`audio/breathSound.ts`, `BREATH_SOUND`): NOT a loop. Breath by breath with her chest: her vitals' breath
  cycle (`VitalsReading.breathCycle`, `breathInShare`, added for this) starting again plays a breath IN over her
  in-share of the breath; reaching it, that breath's OUT over the rest. Each breath from the file whose measured rate is
  nearest hers (ratio), kept until another is 12% nearer, each file's breaths in turn; a change of file only ever between
  breaths (never two of her at once). Sped up or slowed to fit (Web Audio playback rate, 0.8-1.25x); too long fades out,
  too short leaves a pause. Loudness by the air she moves (`quietest` 0.3 at rest .. 1 from 80 L a minute: about 9 dB
  between calm and her hardest), then by the camera's distance (full within 1 m, half at 4 m; first person full). Blaze
  only (`BREATH_VOICES` in main.ts; John when Joshua makes the male files), played or standing by. Test pages:
  `gdm.breathing()`. `scripts/preview_breathing.py` plays the same rules over a made-up run into an MP3 (the one he
  approved). Checked in the browser: the game's own BreathSound recorded off its master (21 breaths in 40 s, the files
  switching as in the preview, calm -34 / hard -25 dB RMS); in the game the files load and the tick is found (start 0.1000).
- v0.2.143, AFTER 142 "KEEPS CRASHING ON LOAD" ON HIS iPHONE (Joshua, 2026-11-22; the first start ran, John looked to
  have "no hair/eyes", every start after closed during loading). Not reproduced here: the BUILT game loads John's crew
  hair and his face's eyes (no file missing, rendered at 1 % with his head at 100 %). What was done:
  (1) HOW FAR THE LAST START GOT (`core/startupLog.ts`, first made on wip-131): every step the splash shows, 'Blaze
  made', 'John made', 'playing', frames 1/5/30, '5 s' and '30 s' written to localStorage AS REACHED, with the seconds,
  the MB downloaded and the graphics memory asked for (est., `core/gpuTally.ts` from wip-131, installed on the renderer
  before any upload). A start that never reached '30 s' was closed by the phone: the NEXT splash says, in amber, where
  it stopped (`splash-last`; the full readout's `last:` lines). Checked: a start closed during John's load is told.
  (2) THE SIZE ON THE SPLASH (Joshua: "TRADDOMIUM, BE would show the (Total Size/Current, % download, ETA)"):
  `62.4 / 98.1 MB · 64% · 5.2 MB/s` (loadMeter.ts `bytes`, `bytesExpected` = what the whole load came to last time on
  this device, `bytesPerSecond` over 2 s); a first load shows what has arrived only. Under the time left.
  (3) HIS STEPS SAID AS HIS ("when it's John should say he"): main.ts `forHim` ("unpacking his body", "dressing him").
  (4) ONLY THE OUTFITS WORN ARE KEPT ON THE PHONE (Joshua: "only John and Blaze's last saved outfit... clears the past
  outfit"): the game only ever FETCHED the worn ones (measured: blazeSuit and john), but the offline copy kept every
  outfit tried. main.ts `keepWornOutfits` tells the worker ('gdm-keep-outfits', her folder as baked, BAKED_AS, and
  'john') 8 s into play and after every outfit change; sw.js `keepOnlyOutfits` lets every other heroines/<folder>/ file
  go. Tested on the built game: a third outfit's files dropped, the worn two kept.
  (5) THE SOUND: the Web Audio context is made only when first wanted (`Sound.start`), her breathing files decoded one
  at a time. v0.2.143 held them back until 12 s into play; v0.2.144 LOADS THEM AS A STEP OF THE LOAD (Joshua: "load
  the audio on start… don't wait until after in the game… that doesn't make sense"): 'Loading her breathing…' before
  the first picture, at most 20 s (never a reason not to start), so she is heard from her first breath.
  (6) BLAZE'S LIVE BODY ONLY WHEN SOMEONE IS NEAR HER (Joshua: "only if playing her, or within 12m as another character
  ... It will freeze her live portions until close again"): main.ts `wakeBlazesLiveBody`, LIVE_NEAR 12 m (asleep past
  12.5) between the one played and her; fastHeroine.ts `setLiveAwake`: asleep, her live body is not stepped at all,
  her kicks and shape stay as they were. Readout: `Blaze live: asleep (far)`. Tested: John 30 m off, asleep; back, awake.
  WHAT THE START LOG SHOWED (his iPhone on v0.2.143, 2026-11-22 06:06): "closed after: frame 1 · 12.5 s in · 105.8 MB
  downloaded · ~311 MB graphics (est.)": the phone closed the game RIGHT AFTER ITS FIRST FRAME OF PLAY, at random (the
  next starts ran: "the loading and crashes are random on load"). So, v0.2.144:
  (7) EACH PACKED PICTURE GOES UP AS IT IS UNPACKED, AND THE PAGE'S COPY IS LET GO (packedPictures.ts `packedTexture`:
  `renderer.initTexture` then every level's data emptied; its anisotropy set first, the same min(4, max) the materials
  ask for, as a texture's settings are only read as it goes up). three.js keeps a texture's data in the page after
  sending it to the chip: each packed picture was held twice, about 49 MB a character, all going up together in the
  first frames. (A lost-graphics restore cannot re-send them: glTrouble.ts says so, a restart brings them back.)
  (8) START FRESH (Joshua: "a manual clear local saved data from phone, so when I start again, it loads it all from
  scratch"; `core/freshStart.ts`): this game's stores (gdm-*) and its service worker let go (only this game's: other
  games share the site), the start log cleared, settings kept; then a restart. Settings -> TEST TOOLS -> Clear saved
  files (two taps), and on the splash beside the amber last-start line (`splash-fresh`), for when the game cannot get
  as far as Settings. Tested on the built game: the stores emptied, the game reloaded and downloaded everything.
  WHY THE DOWNLOAD JUMPS ("5mb to 50mb, slowly up to 52mb, jump to 100mb"): files the phone already keeps arrive in a
  moment, new or changed ones at the network's speed.
  (9) TRIED AND TAKEN OUT: A CLOSED START STARTING FRESH BY ITSELF (v0.2.145; Joshua, 2026-11-22: "if it crashes, the
  default will be to redownload everything again and clear the cache... and maybe a 5s cancel button"): a 5 s count
  under the amber line, then the clear. On his phone the load went on behind the count and the clear came part-way
  through ("there was a race between the 5s and it already loading"); a v0.2.146 that held the load for the choice also
  found the clear sat on "Clearing saved files…" (a new version's install waits for 'gdm-up', and the browser queues the
  unregister behind it). Then Joshua: "Remove that automatic feature for now (leave manual as that works)": v0.2.146 is
  v0.2.144's splash and clear (the manual button) with v0.2.145's distance lines in the AI bubble. Kept, not live:
  branch `auto-fresh-start-wip` (v0.2.145) and git stash "v0.2.146 wip" (the held load, sw.js 'gdm-give-up', a 3 s cap
  on the unregister). IF THE MANUAL CLEAR EVER HANGS, that queue is why: the stash has the fix.
- THE MEMORY PLAN, AFTER TRADDOMIUM (v0.2.147; Joshua, 2026-11-22: crashes still random right after the first picture,
  "I'm curious still on what all loads", then "how did we split the GPU/CPU usage... and use something that works as a
  template"). MEASURED on the built game (fresh browser, the island, both of them; /tmp scripts, a GL hook and a heap
  snapshot): WHAT LOADS, 115 MB in 120 files: Blaze's live body 46 (builder files; her 15.4 MB body file a second time,
  under `?r=`: the offline copy keys by path, so the phone stores it once and downloads it twice only with nothing kept),
  Blaze 37, John 33, island 12, code 1.3, breathing 0.8. AT THE FIRST PICTURE: graphics chip 317 MB (his phone's line
  said 311-328), page about 710 (Chrome: buffers 603 + JS 106). After a clean-up the page's buffers are 491 MB: Blaze's
  LIVE BODY 213 (all builder internals: her 43 body shapes as floats, its build fields, fabric and fit data), Blaze's
  fast body 137 (70 of it her 43 shapes, packed Int16, kept to follow the builder's weights: HER SHAPES ARE HELD TWICE),
  John 56, three.js's copies 34 (morph textures' data 15.5), breathing decoded 14.4, island 12. ON THE CHIP: both looks'
  packed pictures 99, the island SKY 59 (three.js turns an equirect background into a 1024 cube and keeps six depth
  buffers), shadow map 32, coast mask 21, ground/river/tree pictures about 45, buffers 30.
  TRADDOMIUM'S SPLIT (its docs/PERFORMANCE.md, sea/OceanView.ts, world/sea/swell.ts, assets/textureQuality.ts,
  detailQuality.ts): ONE formula (the swell) that the graphics chip evaluates per vertex every frame and the processor
  only at the few points gameplay asks; and TWO separate ladders, TEXTURES (memory: a cliff, the tab is killed) and
  DETAIL (vertices a frame: a slope), each texture rung a quarter of the one above, Ultra never offered on a phone.
  STEP 1, SAME LOOK, LESS MEMORY (this version): the sky drawn straight from its picture (`world/island/skyPicture.ts`,
  a camera-turned box reading the picture per pixel, seam-free mip steps; PIXEL-IDENTICAL to the cube, compared),
  the coast mask sent as one channel (ocean.ts `RedFormat`: the shader reads .r), John keeps only the level he wears
  (fastHeroine.ts `oneLevel`: his 100 % was built as he was made and kept for nothing). Graphics est. 317 -> 252 MB;
  page buffers after clean-up 491 -> 467 MB. NEXT (his call): step 2 a TEXTURES setting separate from Detail with phone
  rungs (her skin-depth picture to 2048 first); step 3 HER LIVE BODY (TRADDOMIUM: keep the formula, not the whole body;
  Joshua's idea from Anthill Airways: Live / Frozen / Auto, frozen between changes of her belly).
- JOHN, BLAZE'S HUSBAND (Joshua, 2026-11-21: "Both in game for now... with maybe a 🔄 swap character... like how Beyond
  Extinction does it"; 🔄 next to Settings; his stats exactly as the builder's, no breasts or pregnancy). His export
  `docs/reference/characters/character-john.json` -> `looks/john.ts` (the builder's MALE BASE MODEL, `male-base.glb`:
  123,023 points, 69 bones, his spine one bone longer, only 2 body shapes: his belly is drawn by the builder's
  `maleBelly.ts`, baked at his 50%), baked as `public/heroines/john/` (5 MB). PHASE 1 IN PROGRESS: he loads and walks as
  the fast heroine (`bodyFileFor`, `LOOKS[look].body.model`; bones by role, `measureHuman`). Found on the way:
  (1) BUILDER BUG: a save card on another body loads it at once, and the room's held-back first load loaded him AGAIN:
  two of him, one bare, and his outfit dropped. builderRoom.ts lets that load go only for her body. (2) Her pieces the
  room leaves on him (`cleavageBridge`, `tunicDrape`) are not baked on the male body (bakeLook.ts `herPieceOnHim`); the
  gap the builder's tops leave at the chest is filled in his shirt's navy (`fillCleavage(0.966, 0.5, 70)`). (3) No hair
  on the male body (the manifest's `hair` null; `body: 'male-base'`).
  IN THE GAME (v0.2.126; Joshua: "modify his colors to be Black and Neon Green, had his own stats that link up to his
  organs, and then the swap button"): BLACK AND NEON GREEN (tights #141416, tee #16171a with a neon #39ff14 trim, the
  chest gap filled black; belt and guns black with neon, gear.ts `john`), re-baked. He stands 1.4 m to her right and
  0.6 m behind at the start (her left is the weapons table), made only as a fast body (`createHeroine(..., 'john',
  true)`; Body: Performance only; `?john=off` leaves him out); he has no hidden live body of his own. main.ts
  `Character` { name, body, vitals, ownTurn, x, z, yaw }: `blaze`, `john`, `playing`; the one not played stands where
  left, drawn and updated, his or her OWN vitals stepped (standing still) and fed to the body. His vitals are his own
  `HeroineVitals` (age 30, never pregnant); the belly slider, pregnancy and time lapse are always Blaze's.
  🔄 SWAP (hud.ts `.gd-swap`, right of the gear; Edit controls "Swap character"): waits until the one played has
  finished what they are in the middle of (the table, a bar, a door, a holster/draw, a reload, winded, the toilet),
  then hands the controls, vitals card and turn to the other where they stand; a "Now playing: X" notice. EACH HOLDS
  THEIR OWN (Joshua, 2026-11-21: "save the last known heading... each one should save independently"; "hold poses and
  last actions"; main.ts `Character` `cam`, `stance`, `holstered`): their CAMERA (heading and tip, back at once; the
  first time, the way they face), their STANCE (crouched or down they stay so) and their GUNS (in hand or holstered).
  John's guns start holstered, as hers do. (EACH HOLDS THEIR OWN is v0.2.129: NOT LIVE since the step back to v0.2.128,
  kept on `backup-v129`; THEIR OWN CAMERA alone came back in v0.2.134, Joshua: "they need to save and resume their last
  camera position per character": `Character.cam`, saved and restored in `swapCharacter`, cameraRig.ts
  `faceAtOnce(yaw, pitch)`. Their held stance, guns and everything else they were doing came back in v0.2.137, each
  character's own kit: see EACH ONE THEIR OWN below.) An outfit
  change while John is played waits for Blaze ("Blaze changes when you swap back to her"). Test pages:
  `gdm.cast()`. SETTINGS FOR BOTH (Joshua: "link up him to the same detail %"): Target FPS and Skin shine go to both bodies,
  played or standing by (main.ts onGraphicsChange). DETAIL IS THE PLAYER'S (Joshua: "anyone within 5m is the same as
  the player's quality... a smooth transition so it's not a snap"; then "raise it to 20m for mobile, unlimited for PC";
  heroine/fast/otherDetail.ts): the one played keeps the Detail setting (Auto live by default); the one standing by
  is drawn at the player's level NOW within 20 m on a phone (a touch screen), then stepped down one offered level at a
  time to 1 % over the next 10 m (no flicker: a step changes only three quarters into the next); on a computer always
  the player's level. `?other_near=<m>` sets the 20 m for a test. Measured on the phone setting: 21 m 30 %, 24 m 10 %,
  27 m 3 %, 35 m 1 %; back beside her 30 % again (once rebuilt). SHIPPED BODY FILE (v0.2.127): `models/male-base.glb` (17 MB) is in `Game/charb-files.json`; v0.2.126 left it out, so
  the BUILT game had no John (the dev server reads Char_B directly). If he cannot be made, a notice says why. v0.2.128: JOHN ALWAYS FROM HIS SHARP SET (fastHeroine.ts `want`): on the
  iPhone his plain set did not draw (only near the camera, or in first person, was he seen); his levels do not lighten
  anyway (about 88 K triangles each). GRAPHICS TROUBLE ON SCREEN (core/glTrouble.ts): a shader the phone will not
  build, or lost graphics, shows as a notice. THE PAGE NEVER FROM THE BROWSER'S CACHE (sw.js navigate `no-store`): his
  iPhone showed 127's loading screen and then 126's game. COST: about 120-300 K more triangles (his detail follows the frame rate like hers) and 34 draw calls.
  NOT YET: the one not played does not act on needs (bladder held) until the NPC brain; his belly fixed at 50%; his
  breathing uses her thorax data. LATER (Joshua): a one-piece suit for him, dark hunter green or camouflage with neon
  trim. ChatGPT's NPC brain template is kept in `docs/npc-brain/`: next, once John is stable on his iPhone.
  EACH ONE THEIR OWN, AND THE ONE STANDING BY RUNS ON (v0.2.137; Joshua, 2026-11-21: "Each character should store the
  complete state on swap whether crouching, holding on to something, auto shooting"; "Each one should work auto
  independently"; "when you select that character, you can take control back"; "import and set up the AI brain"):
  STEP 1, A KIT EACH (main.ts `Kit`, `makeKit`, `KitState`): every character has their OWN motion, body turn, table /
  bar / door use, holster, belt reload, pace, burst fire, eating, aim and state (stance, bathroom, after-queues, gait,
  winded, wet, limits...). The game's own names (`motion`, `turn`, `tableUse`...) point at the PLAYED one's kit
  (`pointAt`); a few plain values of the played frame are copied in and out (`saveState`, `loadState`). So a swap is
  INSTANT, mid-anything: crouched or down they stay so, a bar or the door held stays held, a reload or a draw finishes
  on its own, their AUTO/MANUAL is their own (`Character.autoFire`; John starts MANUAL). Swapping refuses only while
  frozen or changing outfit. The world's things are ONE AT A TIME (`tableTaken`, `barTaken`, `doorTaken`): no button for
  what the other one has. STEP 2, THE BRAIN (`Game/src/npc/`, ChatGPT's template fitted): `brain.ts` his `NpcBrain` (a
  queue by priority; modes ai / player / scripted), `types.ts` (+ draw, reload), `gdmPort.ts` `GdmActorPort` (its orders
  become `ActorWants`: walk to, look, aim at, fire; it allows fireAt only in AUTO, 1-20 shots, a target it can find),
  `routines.ts` `NeedsRoutine` (the bathroom at 83%, where they stand; food, water and rest only once there are places),
  `autoCombat.ts` `AutoCombat` (in AUTO, every 0.25 s: draw if holstered, reload if empty, else 6 shots at the nearest
  target; nothing over a higher task). The played one's brain is 'player' (does nothing); swapped away it is 'ai'.
  `stepStandingBy` runs the one standing by each frame with the same systems in the same order (no camera, HUD or
  stick). Checked in the town map: John standing by in AUTO drew and fired on his own; swapped to, his brain stood
  down ("Player takeover"); swapped back, he fought on. Test pages: `gdm.swap()`, `gdm.brain('john')`, `gdm.kitOf(name)`.
  NOT YET: they do not walk anywhere on their own (no places for food, water or rest), no cover or dodging.
  THE THOUGHT BUBBLE (v0.2.137; Joshua, 2026-11-21: "draw over John his state of mind 🧠 that way I can know what it's
  'Thinking' and if it's working"; Blaze runs the same brain while John is played): `ui/thoughtBubble.ts` (+ .css), its
  words from `npc/thoughts.ts` `thoughtLines`: who, AUTO/MANUAL and rounds; what the brain does NOW (its active order,
  shots fired / seconds left); WHY (🎯 `AutoCombat.thought`, 🩺 `NeedsRoutine.thought`: the last decision of each, for
  show only); the next order; how the last ended (✓ / ⏸ / ✗ and the reason); needs and danger as the brain sees them. A
  page element over the one STANDING BY's head (their eye + 0.3 m, projected each frame; words 10 a second), never
  below 55% of the screen, under every control, no touch. OUT OF VIEW (aside, behind, past 80 m) it DOCKS at the top
  middle with ◀ or ▶ their way (pushed to the edge it hid under the vitals card or 🔄/⚙️ at 932 x 430). Settings ->
  TEST TOOLS -> AI thoughts (`gdm.npcThoughts`, `?thoughts=off`; on by default while the brain is tested; live).
  HOW FAR, AND HOW THEY ARE DRAWN (v0.2.145; Joshua, 2026-11-22: "distance to other character so I can get where I
  want the better quality to be so I can test pregnant and not"): two more lines, `📏 8.4 m to John · 📷 9.1 m` (from
  the one played, and from the camera to their middle, worked out in main.ts every frame) and `🔍 30% · sharp · live ✓`
  (their detail now; their sharp set, face/bust/belly/hands at 100 % within SHARP_WITHIN 12 m of the camera, or plain;
  Blaze's live body awake within LIVE_NEAR 12 m of the one played, or 💤). The distances he tunes from it: OtherDetail
  20 m on a phone (the one standing by at the player's level, then down to 1 % over 10 m), SHARP_WITHIN 12, LIVE_NEAR 12.
  John's detail is fixed (1 %), so his line shows no sharp or plain.
  HIS HEAD AND HAIR (v0.2.141; Joshua, 2026-11-21: "Here is the updated look for John with hair and face details now",
  "Look at head details only, not clothing"; his export `docs/reference/characters/character-john-2026-11-22.json`):
  `looks/john.ts` `body.head` is that export's head (a CREW cut, length 0, #1c1b1d; green eyes #4c7a46; his face
  settings); his clothes stay the game's black and neon green. Re-baked on builder v0.9.71 (his face is the builder's,
  fitted to his head, maleFace.ts). HIS HAIR: the bake now keeps a male look's hair (bakeLook.ts: none only for a male
  look with no head of its own, whose default would read as HER ponytail), and fastHair.ts `loadFastHair(..., male)`
  takes HIS file of the style (`hairStyle(id, true)`: `models/hair/male/<id>.glb`, made on his head, bound to his 69
  bones; crew.glb and crew-light.glb in `charb-files.json`). Its hairline is a per-point mask in the file's colours,
  cut at 0.42, which the game keeps. PICTURED against the builder's own room from his front, three-quarter and back: the
  same cut (it comes down to his nape), eyes, brows and face; a little more shine on it in the game (hairStrands.ts).
  HIS HEAD AT 100 % (same version; Joshua: "Can you put John's head at 100% detail"): main.ts `JOHN_HEAD_DETAIL` 100 (a
  part at 100 % is kept whole, detailWorker.ts skips its second pass), and his HAIR GOES WITH HIS HEAD (fastHeroine.ts
  `showHair`: the full haircut, not the light one his 1 % would pick). Lab: John at 1 % 64,241 triangles, his hair 27,886.
  HIS OWN SKIN (v0.2.142; Joshua, 2026-11-21: "Why does his face look like that and spotty?"): he was wearing HER skin
  picture. The builder's room puts the FACE tab's skin (all hers; EVEN = `sarah-v2-skin-even-2048.webp`) on any body it
  loads (`applySkin` in `loadSarah`) while it fetches his own (`MALE_EVEN_SKIN`); the last to land is worn, and hers did
  (MEASURED: still hers 8 s after loading). Read through HIS texture layout her picture scattered pieces of her skin
  over him: a brown speck under his left eye, a strip down his forehead, patches on his jaw and neck (not detail: with
  his normal map and skin depth off they stayed). builderRoom.ts 5c now waits for that skin to land and puts his own on
  (`HIS_SKIN`, in `charb-files.json`); re-baked, his face is clean. BUILDER BUG: `applySkin` should give a male body his
  own skin (sent to its agent through Joshua).
- BACK TO v0.2.129 (Joshua, 2026-11-21, 15:11): after crashes on his iPhone the game went back to v0.2.126 (14:51),
  which then ran again ("It's working now... on v126"), so the crashes look like the phone's state (memory, stored
  files) more than the code; then "revert to v129... that will be easier". Kept on other branches, not live:
  `after-126-fixes` (v0.2.130: John held at one detail level, his crash guard, TEST TOOLS John on/off; builder v0.9.70
  and the builder's squat) and `wip-131` (v0.2.130 + core/startupLog.ts, core/gpuTally.ts (estimated GPU memory),
  skin height stored as one channel (about 64 MB less per character), `?fresh=1`, the live body run only for the
  one played and the one standing by worked out 15 times a second). Measured on a desktop with gpuTally: the first
  frame uploads every picture, about 480 MB est. with Blaze alone, 770 with John; the biggest are 4096 x 4096
  pictures (each look's albedo and skin height).
- BACK TO v0.2.128 (Joshua, 2026-11-21, 15:52): v0.2.129 kept crashing on his iPhone ("Let's not change the textures
  yet... as it was working before... there must be another issue"); then "Revert back to v128 but save your work as a
  backup". v0.2.128 is the last version he played with both characters drawn (he swapped between them and asked for
  the saved camera headings). Game/ is v0.2.128's exactly; this file is kept current. Kept, not live: `backup-v129`
  (v0.2.129: each character keeps its own camera, stance and guns; John's guns holstered at the start),
  `texture-memory` (v0.2.132 candidate on v0.2.129: skin height as one channel, each big picture's unpacked copy let go
  of once it is on the graphics chip (`freeAfterUpload`, bakedLook.ts), `navigator.storage.persist()`; built, not tested
  on a phone), and `after-126-fixes`, `wip-131` as above. Proposed, not yet asked for: a build of 128 with switches,
  `?john_sharp=off` (127's detail sets), `?nosw=1` (no offline copy), `?john=off`; each opened twice (the first open
  after an update, then a second).
- JOHN FIXED AT 1 % (v0.2.133, on v0.2.128; Joshua, 2026-11-21: 128 froze about 10 s in; "Put him at 1% detail. If that
  works, then we can do the face and hands only and try again… and slowly add more"; "if no crashes, then we can make
  certain parts maybe at 10% or 15% details where it looks good but not heavy either since she should be the main
  one"): main.ts `JOHN_DETAIL` (1; null = he follows the player's level as before) and `JOHN_SHARP_PARTS` (false: none
  of him kept sharp). Played or standing by, whatever Detail or the frame rate says, he is made once at 1 % and never
  rebuilt; Blaze standing by keeps her own Detail choice (not his 1 %); OtherDetail is not used while his is fixed.
  fastHeroine.ts `want`: a male body always takes the SHARP set's keys (the way that draws on the iPhone), even with
  nothing locked. Measured in the lab before: his levels were 100 % 256 K triangles (skin 222 K + belt, guns, gear
  34 K), 30 % 98 K, 10 % to 1 % about 92 K (his face, chest, belly, hands and arms locked held about 57 K of skin);
  now about 2 K of skin at 1 %, about 36 K with his gear. NEXT (his plan): certain parts of him (face, hands) at
  10-15 %, a lock that lightens them less rather than keeping them at 100 %.
  v0.2.133 RAN ON HIS iPHONE ("Yay, I am in!", 46-48 FPS), his face a blank blob at 1 %. PARTS AT THEIR OWN DETAIL
  (v0.2.134; Joshua: "Let's try raising only his face details to 30%"): detailWorker.ts `parts` ({ points, detail }),
  `lighten` in passes (every part held while the rest goes to the level, then each part alone, everything else held, to
  its own percent: the simplifier itself knows only locked or free); detailLevels.ts `headPart` (above `HEAD_FROM`,
  0.875 of the height, the line `sharpParts` uses), fastHeroine.ts option `headDetail`, main.ts `JOHN_HEAD_DETAIL` 30.
  Measured in the lab (`heroine-lab.html?heroine=fast&look=john&detail=1&sharp_parts=off&head=30`, the lab now takes
  `sharp_parts` and `head`): John at 1 % 5,849 triangles in all, with his head at 30 % 13,063: a real face again (a
  few colour patches where his skin picture's pieces meet). Next the same way: hands, and so on.
  v0.2.136 (Joshua, after 134: "His face is better, but not 100%"; "Do face at 70%, hands at 15%"): main.ts
  `JOHN_HEAD_DETAIL` 70, `JOHN_HANDS_DETAIL` 15 (fastHeroine.ts option `handsDetail`, detailLevels.ts `handPart`, the
  same points `sharpParts` calls her hands; with the sharp set, as on Blaze near, they leave its 100 % lock for their
  percent, but Blaze does not ask for it: her hands stay 100 % near). createHeroine's last argument is now
  `{ headDetail, handsDetail }`. Lab (`&head=70&hands=15`): 28,821 triangles at 1 % (head 30 % alone 13,063).
- OUTFIT FILES ARE NEVER AN OLD COPY (Joshua, 2026-11-21: the Shadow Operative suit re-baked in v0.2.123 still showed its
  specks on his iPhone in v0.2.124): bakedLook.ts asks for look.json with `?v=<game version>` and every other file with
  `?bake=<its bake time>`, skinTexture.ts the skin height with the version, so a re-baked look's files have new
  addresses and no cache (Safari's or one on the way) can hand back the old picture.
- CHATGPT'S LOADING REVIEW, DONE IN PART (v0.2.138; Joshua, 2026-11-21, after 137 crashed three times in a row near
  the end of loading, then ran; he skipped "load the island's tiles progressively" and "start before her live body is
  ready": the game is up in under a minute, and her live body stays ready at the start). Nothing looks different:
  (1) A NEW VERSION'S INSTALL WAITS FOR THE GAME AND KEEPS WHAT DID NOT CHANGE (vite.config.ts `pwa()` sw.js; main.ts
  `tellGameIsUp`): Safari checks for a new sw.js as the app opens, so the install always ran DURING loading, fetching
  all 4.4 MB of the game's own files again. Now it waits for 'gdm-up' (sent 8 s into play) or 90 s; a file under
  assets/ with the same name is copied from the old store (the name carries its content's fingerprint), only new
  names and the few unfingerprinted files (page, icons, manifest, dome model) are fetched, past the browser's cache.
  Tested on the built game: nothing fetched before 'gdm-up'; on a new version 36 code files copied, 7 fetched. (The
  stores are on the phone's storage, not in its memory.) (2) THE TOWN ONLY ON THE TOWN MAP (main.ts; dome.ts
  `Dome.sectionsOnly`): its sky (a 512-pixel cube drawn on the graphics chip), ground, city, walls and dome glass were
  made on the island too and never shown; on the island the dome is its 12 sections as numbers (danger, TEST TOOLS).
  (3) LANDSCAPING OFF LOADS NO TREES (trees.ts `started`): the forest's maps and six photos load the first time it is
  on. (4) ONE PORE TILE FOR BOTH (skinTexture.ts `takePoreTile`, `SkinPictures.release`): counted, let go when the
  last body gives it back. Not done (his call): texture compression (KTX2), the big memory saver (about 480 MB est. on
  the graphics chip with Blaze, 770 with John, mostly the 4096 pictures), as he asked to keep the textures for now.
- HER PICTURES PACKED FOR THE GRAPHICS CHIP (v0.2.139; Joshua, 2026-11-21: "Do the compression of the textures first, as
  long as it looks the same"): each look's four big pictures (albedo 4096, skinHeight 4096, normal 2048, surface 1024:
  about 206 MB a character on the chip as unpacked RGBA, plus about 150 MB of decoded copies the page kept) are ALSO
  kept as KTX2, Basis UASTC with their mipmaps and Zstandard (`scripts/make_ktx2.py`, which calls
  `scripts/ktx2_encode.mjs`, ktx2-encoder PINNED at 0.5.4: 0.6's encoder refuses over 12 megapixels). The game turns
  them, in one short-lived worker, into the chip's own packed form (`heroine/fast/packedPictures.ts`; three's
  KTX2Loader, its transcoder in assets/): ASTC 4x4 on an iPhone, BC7 on most computers. About 51 MB a character on the
  chip, a quarter. CHECKED: make_ktx2.py decodes every packed picture back with the game's own transcoder
  (`scripts/ktx2_decode.cjs`) and compares it with the original; a look under 45 dB PSNR is not marked packed. Blaze:
  albedo 53.7, skin height 62.1, normal 66.0, surface 48.9 dB (about 40 is where a difference starts to be seen);
  rendered in the lab the two are the same pixel for pixel but for edge shimmer from her breathing. No RDO (9% smaller
  files, 3x the time, less quality). look.json `packed` names the files (+ `albedoSmall`, `packedAt`); bakedLook.ts
  loads them when it is there (`loadBakedLook(look, renderer)`), skinTexture.ts the skin height (`loadSkinPictures`,
  now async). The ONE CPU read of her colour (beltGear.ts, her waistband trim) uses `albedo-small.webp` (1024;
  `BakedLook.cpuPicture`). The full readout's `her` line ends with how her pictures are kept (ASTC, BC7, ETC2, RGBA,
  or WebP). `?packed=off` loads the WebP pictures as before (to compare). NEVER STUCK (v0.2.141): a packed picture that fails or takes
  over 45 s (`PACKED_WAIT_S`) falls back to its WebP picture; on the development server three's loader lost its way to
  the transcoder and waited for ever, so there it is told the folder (node_modules/three/.../libs/basis/). RE-RUN `python3 scripts/make_ktx2.py <look>`
  AFTER RE-BAKING A LOOK OR REMAKING ITS SKIN HEIGHT (a 4096 picture takes about a minute; two at a time). COST: bigger
  downloads (Blaze 12.8 MB, John 12.4, Shadow Operative 24.5, against 1.5-4.5 MB of WebP), kept on the phone after.
  THE OFFLINE COPY KEEPS EACH BIG FILE BY ITS OWN FINGERPRINT (vite.config.ts `pwa()`, same version): outfits, fabrics,
  thumbs, the builder's files and the island are one store, `gdm-files`, an entry per file and its contents' SHA-256
  (`HASHES` in sw.js); a push re-downloads only the files whose contents changed (before, any changed outfit file threw
  away every outfit file). The first install of it checks the files older versions kept (their gdm-looks-/charb-/
  island- stores) against their fingerprints once, after the game is up, and keeps the same ones. Tested on the built
  game: a changed file is dropped and fetched, the rest kept.
- Later: Duo mode, an idle/offline income mode, more dome themes.
- Later (Joshua's idea, 2026-11-16): the domed town placed on the large island of Kawi (Beyond Extinction,
  TRADDOMIUM), each location its own section that loads separately, joined into one big map the way Call of
  Duty's large map is its small maps put together. So each location is built as a self-contained section.
- Lessons from the games that inspired it: no paywalls, free 2x speed, a smooth difficulty curve checked by
  simulation, new turret cards useful at once, bosses beatable in a few tries; reuse bullets and enemies
  (object pools) so long sessions never get choppy.

## Standing rules (Joshua's)

- Work on `claude-work`. `main` moves only when Joshua approves a batch.
- Before a push, ask "good to push or wait?" as a normal chat message (never a popup).
- After a push, wait for its build/deploy to succeed AND 5 minutes before pushing again.
- Previews: keep one local preview running and reuse the same browser page for all screenshots; screenshot only
  what changed; shut the preview down when done.
- Ask before changing anything major in a clothing design.
- ON EVERY NEW BUILDER (CCBS) COPY, RE-BAKE EVERY OUTFIT (Joshua, 2026-11-21: "Yes, rebake on new CCBS updates"): each
  look in `Game/public/heroines/` with `scripts/bake_heroine.py`, then `scripts/make_skin_height.py`,
  `scripts/make_ktx2.py` and `scripts/make_outfit_thumbs.py`, so every outfit is the builder's newest (a bake is a
  snapshot: the game never runs the outfits live, the iPhone cannot carry that). Show him before/after pictures.
- Phone first (iPhone 15 Plus, held on its side: the game is played in landscape only): at least 30 FPS; nothing
  outside the camera's view is drawn; the bottom corners stay free for the player's controls.
- The debug readout is only READ (Joshua could not open Settings when it grew over the gear, 2026-11-17): it never
  takes a touch (only its three dome buttons do), it is made first so every control is drawn over it, its lines
  stay short (about 30 letters), and it keeps to the top-left corner beside her vitals card. Check any change to it
  at his phone's size (932 x 430) before asking to push.
- Code is commented so Joshua can learn from it; full files, not fragments.
- His reference images of the heroines stay out of the repo unless he says otherwise.
- Units: metres, Y up, plaza centre at the origin (`Game/src/core/contracts.ts`).
