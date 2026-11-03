// The goods chain across the North (M35): the land gives pastures, studs,
// saltpans, charcoal, weavers, distillers and weaponsmiths in a share of
// places, ours and abroad; cloth and luxuries the realm cannot get cost a
// little Love; and an older reign gains the new works.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, serialize, deserialize } from '../../src/sim/index.js';
import { STATE_VERSION } from '../../src/sim/state.js';
import { monthlyMeters } from '../../src/sim/meters.js';
import { makeRng } from '../../src/sim/rng.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();
const count = (places, b) => places.filter((s) => s.buildings.includes(b)).length;

test('Temeria starts with sheep, looms, studs and stills enough to matter', () => {
  const home = Object.values(createState(world, 1).settlements);
  assert.ok(count(home, 'pasture') >= 4, 'pastures');
  assert.ok(count(home, 'weavers') >= 2, 'weavers');
  assert.ok(count(home, 'stud') >= 3, 'studs');
  assert.ok(count(home, 'distillery') >= 2, 'distilleries');
});

test('the great realms abroad have their own goods chain, worth taking', () => {
  const s = createState(world, 1);
  for (const rid of ['redania', 'kaedwen', 'aedirn', 'cintra', 'nilfgaard']) {
    const places = Object.values(s.realms[rid].settlements);
    const makers = ['pasture', 'weavers', 'stud', 'distillery', 'saltpans', 'weaponsmith'].reduce((a, b) => a + count(places, b), 0);
    assert.ok(makers >= 3, `${rid} has ${makers} makers`);
  }
});

test('the tannery is not counted a maker of cloth', () => {
  assert.ok(!world.market.realmWorks.cloth.includes('tannery'));
});

test('a year in, cloth and luxuries are no longer badly short', () => {
  let s = createState(world, 1);
  for (let m = 0; m < 12; m++) s = step(s, 30, world, { ambient: false });
  for (const g of ['cloth', 'luxuries']) {
    const r = s.market.report[g];
    assert.ok(r.balance > -0.1 * r.used, `${g}: made ${r.made}, used ${r.used}`);
  }
});

test('cloth the people cannot get costs a little Love, with its reason', () => {
  const s = createState(world, 1);
  s.market.report.cloth = { made: 20, used: 120, balance: -100 };
  s.market.report.luxuries = { made: 100, used: 100, balance: 0 };
  const before = s.meters.month.love['Cloth is scarce and dear'] ?? 0;
  monthlyMeters(s, world, makeRng(1));
  const why = s.meters.reasons.love.find((r) => r.why === 'Cloth is scarce and dear');
  assert.ok(why && why.v < 0 && why.v >= -world.meters.love.scarce.goods.cloth.max - before, JSON.stringify(s.meters.reasons.love));
  assert.ok(!s.meters.reasons.love.some((r) => r.why === 'Salt, spirit and horses are scarce'));
});

test('an older reign gains the new works where its land now holds them', () => {
  const s = step(createState(world, 1), 10, world, { ambient: false });
  const old = JSON.parse(serialize(s));
  old.version = 40;
  old.state.version = 40;
  const strip = (x) => { x.buildings = x.buildings.filter((b) => !['pasture', 'weavers', 'stud', 'distillery'].includes(b)); };
  for (const x of Object.values(old.state.settlements)) strip(x);
  for (const r of Object.values(old.state.realms)) for (const x of Object.values(r.settlements)) strip(x);
  const up = deserialize(JSON.stringify(old), world);
  assert.equal(up.version, STATE_VERSION);
  assert.equal(count(Object.values(up.settlements), 'pasture'), count(Object.values(s.settlements), 'pasture'));
  assert.equal(count(Object.values(up.realms.redania.settlements), 'weavers'), count(Object.values(s.realms.redania.settlements), 'weavers'));
});
