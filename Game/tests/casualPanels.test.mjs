import test from 'node:test';
import assert from 'node:assert/strict';
import { panelDistance } from '../src/heroine/looks/casualPanels.ts';

test('side panel is confined to the trunk and leg, and misses bare arms', () => {
  assert.ok(panelDistance('trunk', { along: 0.55, turn: 90, radius: 0.14 }) > 0);
  assert.ok(panelDistance('leg', { along: 0.4, turn: 90, radius: 0.12 }) > 0);
  assert.ok(panelDistance('arm', { along: 0.8, turn: 90, radius: 0.08 }) < 0);
  assert.ok(panelDistance('trunk', { along: 0.55, turn: 0, radius: 0.14 }) < 0);
});
