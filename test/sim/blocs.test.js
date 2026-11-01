// Blocs and the petty kings (M29 D): a suzerain's vassals march with it by
// their loyalty; a pact with a suzerain covers its vassals; a vassal starts
// no war of its own; an old save's protectorates become suzerainty.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, serialize, deserialize, suzerainOf } from '../../src/sim/index.js';
import { makeVassal } from '../../src/sim/suzerainty.js';
import { startWar } from '../../src/sim/war.js';
import { blocBound, mayStartWar, blocHead } from '../../src/sim/blocs.js';
import { makeTreaty } from '../../src/sim/diplomacy.js';
import { STATE_VERSION } from '../../src/sim/state.js';
import { makeRng } from '../../src/sim/rng.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();

test('a war with a suzerain draws in its loyal vassals; a disloyal one may stay home, and is remembered for it', () => {
  const s = createState(world, 1);
  makeVassal(s, world, 'kerack', 'redania', 'protection', 80);
  makeVassal(s, world, 'cidaris', 'redania', 'pressure', 5);
  const war = startWar(s, world, makeRng(1), 'kaedwen', 'redania', 'none');
  const side = war.sides.findIndex((x) => x.includes('redania'));
  assert.ok(war.sides[side].includes('kerack'), 'the loyal vassal marches');
  assert.ok(!war.sides[side].includes('cidaris'), 'the disloyal one stays home');
  assert.ok(s.realms.cidaris.vassal.loyalty < 5);
});

test('our vassals march with us, and a pact with a suzerain covers its vassals', () => {
  const s = createState(world, 1);
  makeVassal(s, world, 'brugge', 'temeria', 'protection', 80);
  const war = startWar(s, world, makeRng(1), 'temeria', 'verden', 'none');
  assert.ok(war.sides[0].includes('brugge'));
  const t = createState(world, 2);
  makeVassal(t, world, 'sodden', 'aedirn', 'protection', 60);
  const pacts = new Set(['redania|aedirn']);
  const pact = (a, b) => pacts.has(`${a}|${b}`) || pacts.has(`${b}|${a}`);
  assert.equal(blocHead(t, 'sodden'), 'aedirn');
  assert.equal(blocBound(t, 'redania', 'sodden', pact), true, "Redania's pact with Aedirn covers Sodden");
  assert.equal(blocBound(t, 'redania', 'kerack', pact), false);
});

test('a vassal starts no war of its own', () => {
  let s = createState(world, 3);
  makeVassal(s, world, 'verden', 'redania', 'protection', 60);
  assert.equal(mayStartWar(s, 'verden'), false);
  assert.equal(mayStartWar(s, 'cintra'), true);
  for (let m = 0; m < 24; m++) {
    s = step(s, 30, world, { ambient: false });
    assert.ok(!s.wars.some((w) => w.sides[0][0] === 'verden'), 'Verden declares no war');
    assert.ok(!(s.musters ?? []).some((x) => x.realm === 'verden'), 'nor musters for one');
  }
});

test('the petty kings think once a month, cheaply', () => {
  const s = createState(world, 4);
  const t0 = performance.now();
  step(s, 360, world, { ambient: false });
  const ms = performance.now() - t0;
  assert.ok(ms < 60000, `a year in ${Math.round(ms)} ms`);
});

test("an old save's protectorates become suzerainty, with loyalty from the old relation", () => {
  const s = createState(world, 5);
  makeTreaty(s, world, 'protectorate', 'temeria', 'kerack', { terms: { monthly: 40 } });
  makeTreaty(s, world, 'protectorate', 'redania', 'cidaris', { terms: { monthly: 40 } });
  s.neighbours.kerack.relation = 40;
  const old = JSON.parse(serialize(s));
  old.version = 28;
  for (const r of Object.values(old.state.realms)) { delete r.suzerain; delete r.vassal; }
  const up = deserialize(JSON.stringify(old), world);
  assert.equal(up.version, STATE_VERSION);
  assert.equal(suzerainOf(up, 'kerack'), 'temeria');
  assert.equal(up.realms.kerack.vassal.loyalty, 70);
  assert.equal(suzerainOf(up, 'cidaris'), 'redania');
});
