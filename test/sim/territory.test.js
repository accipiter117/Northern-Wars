// Borders that follow the towns (M19 D): at the start the land is the
// atlas's; when a town changes realm, the country round it changes too.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../../src/sim/index.js';
import { syncWorld, transferTown } from '../../src/sim/lands.js';
import { territoryAt, territoryOwners } from '../../src/sim/territory.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();

test('borders redraw from ownership', () => {
  const s = createState(world, 7);
  const near = [-240, 590];
  assert.equal(territoryAt(world, ...near), 'cidaris');
  assert.equal(territoryAt(world, 523, 343), 'temeria');
  assert.equal(territoryOwners(world).any, false, 'nothing changed at the start');
  transferTown(s, world, 'bremervoord', 'temeria');
  assert.equal(territoryAt(world, ...near), 'temeria');
  // Cidaris's capital keeps its own land.
  assert.equal(territoryAt(world, -70, 476), 'cidaris');
  assert.equal(territoryOwners(world).any, true);
  syncWorld(world, createState(world, 1));
  assert.equal(territoryAt(world, ...near), 'cidaris');
});
