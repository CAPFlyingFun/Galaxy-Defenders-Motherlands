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
  FIRST PERSON AT HER REAL EYES (Joshua, 2026-11-19: "measure at the eye balls... tilt the head down 70 degrees, how far
  forward... place the camera accordingly"; `fastHeroine.ts` `eye(out, pitch)`): measured on her, the middle of her
  eyeballs is 7.5 cm ahead of and 5.1 cm above the base of her skull (1.595 m standing); the camera's tilt is half her
  neck bending at its base, half her head nodding, so 70 degrees down brings her eyes 6.4 cm (2.5") forward and 13.7 cm
  (5.4") lower (Joshua's own guess for himself: 6" forward, 4" lower). Before, the eye sat 2 cm in front of her face.
  RAISED 10 cm (Joshua, 2026-11-19: "part of the lens is cutting into her chest"; `EYE_LIFT`): straight up from there,
  so her bust stays outside the camera's nearest 6 cm looking down.
- Movement (Joshua, 2026-11-17): free movement in both views over the whole map, with the MOVE stick (five rings
  set her pace: walk, jog, run, sprint). The ring track round the plaza and the "free walk in third person"
  setting were removed. Buildings are solid and the dome wall stops her.
- Her feet drive her (Joshua, 2026-11-17): her stride is measured from her foot bones and turned by the distance she
  really covers; a planted foot is held to the spot it landed on (`Game/src/heroine/fast/footGround.ts`).
- Which way each part of her faces (Joshua's five bands, 2026-11-17; `Game/src/input/bodyTurn.ts`): from body North
  her head turns up to 90 degrees, her shoulders/arms/hands 80% of that (72), her belly/torso 60% (54), her upper
  legs 40% (36), her lower legs and feet 20% (18). Past 90 body North is pulled round; when the looking stops it
  comes round to match within 4 seconds. First person the look is the camera; third person it is her auto-aim
  target. Moving, body North turns to the way she goes (so walking sideways she goes shoulder first), EXCEPT in third
  person MANUAL AT A WALK (Joshua, 2026-11-18): there she keeps facing the way the camera looks and the stick snaps to
  FOUR moves only, nothing between: walk ahead, walk back, and the CRAB STEP left or right (`footGround.ts` 8: the lead
  foot steps out a shoulder width, her body catches up, the trailing foot comes in a shoulder width behind it; at most
  1.0 m/s, 0.8 at full term; a metre sideways costs 1.25 times the stamina). Jogging or faster there are no side
  steps: the stick moves her ahead, back, left or right of the camera and her body turns to run that way.
  TURNING ON THE SPOT IS STEPPED (Joshua, 2026-11-20: "she looks like she is marching in place but her body rotates";
  `footGround.ts` 10): standing, a planted foot keeps facing the way it landed while her body turns over it; at 15
  degrees of turn the foot on the side she turns to steps OUT and a little BACK, toes turned out 15 degrees; at 40
  (his number) the other foot comes in under its shoulder, square to her; and again while she turns (L, R, L, R). No
  tidy step on the spot while she turns; a turn that stops is squared up after 1 s still.
  SQUARED UP BETWEEN MOVES (Joshua, 2026-11-20: "right before it say sidesteps to forward, it resets really quickly
  (maybe 0.3s or variable depending on speed) to both feet side by side then plays the next one... as soon as you
  release the stick or it centers, it also puts the feet in the normal standing state"; main.ts `gait`, `GAIT_*`,
  footGround.ts 11 `squareUp`, bodyMotion.ts `standCap`): her move (stand / ahead / back / left / right with her facing
  held / go) changing from a move to anything else sets both feet side by side at home TOGETHER first, over 0.3 s at a
  walk (shorter faster, at least 0.15), her walk faded out with them and restarted from the stride's beginning; she
  waits meanwhile. The 4-way stick keeps its move until another is 1.4x nearer (`GAIT_KEEP`), so a diagonal does not
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
  and let go it swings shut (waiting while she is in the doorway); from the pull side it stays. The door is solid.
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
- CAMERA STYLES (Joshua, 2026-11-19; `Game/src/camera/cameraRig.ts`): the CAM button also goes to SIDE L and SIDE R,
  square to her left or right side at her middle's height, turning with her (eased), so her whole profile and belly
  show. AIMED BY HAND (manual) CAM now shows in third person too and goes round its own few styles (shoulder, follow,
  side L, side R; `gdm.cameraStyleManual`); while FIRE is held and 1.2 s after, the camera is over her shoulder whatever
  is chosen, and away from it she aims level the way she was turned and the crosshair is hidden.
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
- THE BUILDER, v0.9.60 (copied 2026-11-20 from its approved `main` bae4157: the catsuit DRAWN, smooth edges; its
  neckline from a low U/V to a turtleneck, neck shape and width; a CHEST CUTOUT, oval, diamond or keyhole; its room now
  disposes its head panel, the 350 MB leak; before that v0.9.51, skin depth's hybrid; v0.9.49, the hybrid pregnancy
  curve, kicks, exact belly %; Joshua says when to copy a newer one). Since v0.9.45 it can UPLOAD AN IMAGE as a
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
  code; one instanced draw per kind per piece. Their TRUNKS ARE SOLID (`trunkBlocks`, her body 0.25 m round). EVERY
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
  drawn (L, R or the main button draws the right). Down and up go through her crouch (1.0 s down, 1.2 s up, still while
  she does). The camera comes down with her (cameraRig.ts `lower`). Busy at the table, a bar or a door, she stands. Her
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
  let go as her head comes back up. First person the view does the look (main.ts `herLook`, laid over the player's view,
  taken off again each frame); turning the view stops it where it is, firing eases it back; no look while firing, 3 s
  after, or from a run. With both hands free, 1 in 3 touches put the other hand opposite round her belly (180 degrees
  +-25). HOLDING HER BELLY UP (Joshua: "from a run and up", "anything over 30 weeks"): a free hand under its low curve
  toward its own side, fingers forward and in, as far under as her arm reaches (`startSupport` searches the egg),
  until she slows below a jog-and-a-half (main.ts SUPPORT_*); the other hand keeps its gun and fires.
  WINDED (Joshua, 2026-11-20; groundPose.ts `WINDED`, input/pace.ts `windedHoldSeconds` now 10): bent over 40 degrees
  (lowerBody.ts `bendOver`: most at her hips, leaning in to 60 if her hands fall short), a deeper squat (Joshua: "a
  slight more squat so her hands are closer to her knee"; hips down 0.36 of her leg, knees out round her belly), both
  palms (guns and all) on her thighs 7 cm above her knees, her head down 50 more at her feet ("look more at her feet"; 70 more, to 75 at most: 50 was "too high up"); eased in 0.6 s, back up over the
  hold's last 1 s; no aiming or firing; first person the view tips down to 85 degrees (her chest, belly and feet)
  unless turned. HER THUMB (Joshua: "the thumb is hidden in the belly"): its curl only folds
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
  HER HANDS TOO (Joshua, 2026-11-19: her fingers round a bar "look weird" at 1%): locked as her face (out at her sides,
  below her wrists, as `skinImportance` finds them): at 1% near she is then 92,075 triangles.
  HER ARMS TOO (Joshua, 2026-11-20, Look 2 at 25% near: "her arm is flat like a pancake"): her left upper arm lightened to
  a flat strip; locked (shoulders to wrists, out at her sides) it stays round. More weight in the lightening alone
  (`skinImportance` `arm`, kept for the far levels) was not enough.
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
  face locks, sharp parts) no longer reload. The game freezes under a "Changing outfit" cover, waits for whatever she is
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
  when strong; movable in Edit controls): it does the 5 s squat. Not automatic (no accidents) until the NPC brain.
  To test: FOOD & DRINK -> Need to go (350 mL) / Must go now (520 mL).
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
- Phone first (iPhone 15 Plus, held on its side: the game is played in landscape only): at least 30 FPS; nothing
  outside the camera's view is drawn; the bottom corners stay free for the player's controls.
- The debug readout is only READ (Joshua could not open Settings when it grew over the gear, 2026-11-17): it never
  takes a touch (only its three dome buttons do), it is made first so every control is drawn over it, its lines
  stay short (about 30 letters), and it keeps to the top-left corner beside her vitals card. Check any change to it
  at his phone's size (932 x 430) before asking to push.
- Code is commented so Joshua can learn from it; full files, not fragments.
- His reference images of the heroines stay out of the repo unless he says otherwise.
- Units: metres, Y up, plaza centre at the origin (`Game/src/core/contracts.ts`).
