# NPC Command Catalog

All commands are discriminated objects with a `kind`, optional `priority`, `source`, `group`, `timeoutSeconds`, and `interruptible`.

`source` = `story` | `player-request` | `safety` | `routine`. Higher priorities interrupt lower ones only if the active command is interruptible. The queue is stable for equal priorities. Commands have timeouts and report completion/failure events for debugging.

| `kind` | Inputs | What happens | Actual integration needed |
|---|---|---|---|
| `walkTo` | `point`, optional `distance`, `speed` | Navigate to a world point | `PlayerMotion` + pathfinder |
| `walkToObject` | `targetId` | Find a moving or fixed object from registry | `locate(id)` |
| `follow` | `targetId`, `distance`, optional `seconds` | Stay near target; with `seconds`, keep following for duration | Navigation + actor registry |
| `grab` | `bar: 'pole'/'rail'`, `hand` | Existing GDM grab reach/finger animation | `GrabUse.start`, game update loop |
| `releaseGrip` | none | Let go of pole/rail/door | `GrabUse.letGo`, `DoorUse.letGo` |
| `openDoor` | `doorId`, optional hand | Reach, twist, take handle, then swing fully open | `DoorUse.start`, `finishOpeningDoor` **required** |
| `holster` | optional `hand` | Free one/both hands | `HolsterUse` |
| `fireAt` | `targetId`, `mode`, `maxShots`, optional `interval` | Bounded utility or defense shots | Game-level ammo/projectile/LOS callback + policy |
| `eat` | optional `foodMl`, `seconds` | Gesture then consume food (once) | Gesture and `HeroineVitals.consume` |
| `drink` | optional `waterMl`, `seconds` | Gesture then drink (once) | Gesture and `HeroineVitals.consume` |
| `useBathroom` | optional `seconds` | Squat/toilet animation then relieve once | Privacy check, `squatFor`, `relieve` |
| `rest` | `seconds` | Wait while existing vitals recover energy | Actor's `HeroineVitals.step` |
| `scan` | `targetId`, optional `seconds` | Investigate archaeological find | World interact callback |
| `repair` | `targetId`, optional `seconds` | Fix equipment | World interact callback |
| `study` | `targetId`, optional `seconds` | Analyze artifact | World interact callback |
| `interact` | `targetId`, `action`, optional `seconds` | Game-specific action, e.g. operate console, lift rock | Custom world interact callback |
| `call` | `recipientId`, `topic` | Initiate permitted phone call | `phone` callback + story comms state |
| `wait` | `seconds` | Idle before next task | Built in |

## Sample field actions

```ts
brain.enqueueSequence([
  {kind:'walkToObject', targetId:'ruin-pole', priority:60},
  {kind:'holster', hand:'both', priority:60},
  {kind:'grab', bar:'pole', hand:'right', priority:60},
  {kind:'wait', seconds:2, priority:60},
  {kind:'releaseGrip', priority:60},
  {kind:'walkToObject', targetId:'ruin-door', priority:60},
  {kind:'openDoor', doorId:'ruin-door', priority:60},
  {kind:'releaseGrip', priority:60},
], 'puzzle:ruin-entry');
```

## Limited shooting

```ts
// Utility: blast a brittle crystal or activate a heat-sensitive switch.
// In `combat.canFire`, allow only known environmental interaction targets.
brain.enqueue({kind:'fireAt', targetId:'brittle-crystal', mode:'utility', maxShots:1, priority:70, source:'story'});

// Defensive fire is denied unless all are true:
// 1. GDM's combat.canFire approves the specific hostile target.
// 2. Story/combat controller mayUseDefensiveForce() returns true.
// 3. Danger is >= 0.5 and the order came from story, player request, or safety.
// 4. Game-level shoot callback honors ammo and line of sight.
```

## Everyday routines

NeedsRoutine checks twice per second. Priorities: critical bathroom (99), bathroom (82), hydration (75), food (70), rest (65). It pauses during player control, story locks, incapacitation, and danger >0.4. It walks to configured stations before the corresponding action. It does not magically feed/rest an NPC who has no resources or location.

**Required next design choice:** Do NPCs use a physical toilet/station or the current temporary 5-second squat behavior? The template includes `canUseBathroom()` to prevent relieving anywhere by default.

## No hidden autonomy

The AI only executes explicitly registered actions. It does not generate arbitrary TypeScript, trigger new quests, or call a network service. New commands require a typed action and a game-world callback. This preserves predictable gameplay and makes debugging possible.
