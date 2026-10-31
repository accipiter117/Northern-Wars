// A war an ally leads must still be able to end: the leaders settle as in
// any foreign war, and the crown can make a separate peace of its own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, applyAction, separateTerms, canSeparatePeace } from '../../src/sim/index.js';
import { startWar, monthlyWar } from '../../src/sim/war.js';
import { makeTreaty } from '../../src/sim/diplomacy.js';
import { setOwner, ownerOf, truceUntil } from '../../src/sim/conflict.js';
import { makeRng } from '../../src/sim/rng.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();

function allyWar(seed = 7) {
  const rng = makeRng(13);
  const s = createState(world, seed);
  makeTreaty(s, world, 'defensive', 'temeria', 'aedirn');
  const war = startWar(s, world, rng, 'kaedwen', 'aedirn', 'test');
  s.warDecisions = [];
  war.sides[1].push('temeria');
  war.called = true;
  const town = (world.foreignByRealm.kaedwen ?? []).find((id) => world.byId[id].type !== 'city');
  setOwner(s, world, town, 'temeria');
  war.taken.push({ id: town, from: 'kaedwen', to: 'temeria', day: s.day });
  return { s, war, town, rng };
}

test('in an ally\'s war the crown is offered a separate peace, not only withdrawal', () => {
  const { s, war } = allyWar();
  war.since = s.day - 120;
  const t = separateTerms(s, world, war);
  assert.deepEqual(t.list.map((x) => x.key), ['sell', 'keep', 'white']);
  const sell = t.list.find((x) => x.key === 'sell');
  assert.ok(sell.monthly > 0 && sell.price > 0);
  assert.equal(canSeparatePeace(s, world, war.id, 'nonsense').ok, false);
});

test('selling back our takings ends our war, pays us, and leaves the ally fighting', () => {
  const { s, war, town } = allyWar();
  war.since = s.day - 120;
  war.lost = [1e6, 0];
  const check = canSeparatePeace(s, world, war.id, 'sell');
  assert.ok(check.ok, check.reason);
  const before = s.neighbours.aedirn.relation;
  const out = applyAction(s, world, { type: 'separatePeace', war: war.id, terms: 'sell' });
  assert.equal(out.error, undefined, out.error);
  const n = out.state;
  assert.equal(ownerOf(n, world, town), 'kaedwen');
  assert.ok(!n.wars.some((w) => w.sides.flat().includes('temeria')), 'the crown is out of the war');
  assert.ok(n.wars.some((w) => w.id === war.id && w.sides.flat().includes('aedirn')), 'the ally fights on');
  assert.ok(n.tributes.some((x) => x.from === 'kaedwen' && x.to === 'temeria' && x.monthly > 0));
  assert.ok(truceUntil(n, 'temeria', 'kaedwen') > n.day);
  assert.ok(n.neighbours.aedirn.relation < before);
});

test('a war an ally leads ends when its leaders are spent, with the crown in the treaty', () => {
  const { s, war } = allyWar();
  war.since = s.day - 40 * 30;
  monthlyWar(s, world, makeRng(5));
  assert.ok(!s.wars.some((w) => w.id === war.id), 'the ally-led war has ended');
});
