/** Example command sequences only: requires real GDM actor adapters, object registry and quest director. */
import { NpcBrain, NeedsRoutine, archaeologicalShift, requestPartnerHelp } from '../src/index.js';

export function setupFishers(maryBrain: NpcBrain, johnBrain: NpcBrain): void {
  // The preferred main character can be chosen in New Game. This is just an example.
  maryBrain.setMode('player');
  johnBrain.setMode('ai');

  // John has his own needs and independent vitals; he can research without the player's direction.
  archaeologicalShift(johnBrain, 'lab-research-table', 'artifact-01');

  // Phone / in-person request to work together on a specific ancient mechanism.
  requestPartnerHelp(johnBrain, 'sealed-observatory-door');

  // Mary can become an NPC after an authored perspective switch:
  // maryBrain.setMode('ai'); johnBrain.setMode('player');
}

export function johnAtExcavation(johnBrain: NpcBrain): void {
  johnBrain.setMode('scripted');
  johnBrain.enqueueSequence([
    {kind:'walkToObject',targetId:'dig-entrance',source:'story',priority:95,timeoutSeconds:90},
    {kind:'scan',targetId:'strange-artifact',seconds:5,source:'story',priority:95},
    {kind:'call',recipientId:'mary',topic:'I found unusual interference',source:'story',priority:95},
    {kind:'wait',seconds:3,source:'story',priority:95},
  ], 'quest:silent-expedition');
}

export function nonlethalResearchPuzzle(maryBrain: NpcBrain): void {
  maryBrain.enqueueSequence([
    {kind:'walkToObject',targetId:'brittle-crystal',source:'story',priority:75},
    // Uses a game-approved environmental tool discharge, not automatic lethal fire.
    {kind:'fireAt',targetId:'brittle-crystal',mode:'utility',maxShots:1,source:'story',priority:75},
    {kind:'walkToObject',targetId:'ancient-console',source:'story',priority:75},
    {kind:'interact',targetId:'ancient-console',action:'power-on',seconds:2,source:'story',priority:75},
  ], 'puzzle:observatory');
}

export function selfCare(brain: NpcBrain): NeedsRoutine {
  return new NeedsRoutine(brain, {
    bathroomId:'bathroom-station',foodStationId:'canteen-counter',
    waterStationId:'water-dispenser',bedId:'quarters-bed',
  });
}
