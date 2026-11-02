// Faiths and peoples over a reign (M32 E): the tolerant crown's crafts run
// richer and its woods quieter; the harsh crown rules by Fear, burns its
// quarters and breeds commandos. Five years of each, one seed, as a guard on
// the thirty-year runs in BALANCE.md (tools/peoples.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { reign } from '../../tools/peoples.mjs';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();

test('tolerant against harsh over five years', () => {
  const kind = reign(world, 'tolerant', 5, 1);
  const harsh = reign(world, 'harsh', 5, 1);
  assert.ok(kind.crafts > harsh.crafts * 1.25, `crafts ${kind.crafts} vs ${harsh.crafts}`);
  assert.ok(harsh.fear > kind.fear + 40, `fear ${harsh.fear} vs ${kind.fear}`);
  assert.ok(harsh.pogroms > kind.pogroms && harsh.riots > kind.riots);
  assert.ok(harsh.commandos > kind.commandos, `commandos ${harsh.commandos} vs ${kind.commandos}`);
  assert.equal(kind.pogroms, 0);
});
