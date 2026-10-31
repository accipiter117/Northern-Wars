// Raising a new house (M27 E): a fallen house's lands wait under the crown
// for a loyal commander; the new house starts grateful under its own
// banner; the choice stays open while no one is fit; a conquered town can
// be offered; the number of houses grows and shrinks over a reign.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, applyAction, loyaltyTarget, candidatesFor, serialize, deserialize, holdingsOf } from '../../src/sim/index.js';
import { rise, stepRebellionDay } from '../../src/sim/rebellion.js';
import { fallHouse } from '../../src/sim/judgement.js';
import { monthlyGratitude } from '../../src/sim/newhouses.js';
import { setOwner } from '../../src/sim/conflict.js';
import { makeRng } from '../../src/sim/rng.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();
const quiet = (s) => {
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  if (s.diplomacy) s.diplomacy.requests = [];
  return s;
};
const fresh = (seed = 1) => {
  const s = quiet(createState(world, seed));
  s.treasury = 30000;
  return s;
};
const withArmy = (s) => applyAction(s, world, { type: 'raise', muster: 'vizima', levy: 'third', nobles: false }).state;

test('a fallen house\'s lands wait for a new house, raised from a loyal commander', () => {
  let s = withArmy(fresh());
  const lands = holdingsOf(s, 'gelbrand');
  fallHouse(s, world, 'gelbrand', 'execute');
  assert.equal(s.raisings.length, 1);
  assert.ok(lands.every((id) => s.settlements[id].holder === 'crown'));
  const cands = candidatesFor(s, world);
  assert.ok(cands.length >= 1 && cands.length <= world.houses.newHouses.most);
  assert.ok(cands.every((c) => c.traits.length === 2 && /^(Lord|Lady) /.test(c.lord) && c.deed));
  const pick = cands[0];
  s = applyAction(s, world, { type: 'raising', id: s.raisings[0].id, choice: 0 }).state;
  assert.equal(s.raisings.length, 0);
  const [id, h] = Object.entries(s.houses).find(([, x]) => x.def?.name === pick.name);
  assert.equal(h.loyalty, world.houses.newHouses.loyalty);
  assert.equal(h.ambition, world.houses.newHouses.ambition);
  assert.ok(lands.every((sid) => s.settlements[sid].holder === id));
  const flown = Object.entries(world.houses.houses).filter(([k]) => k !== id && s.houses[k]).map(([, d]) => d.colours[0]);
  assert.ok(!flown.includes(h.def.colours[0]), 'a banner of its own');
  assert.ok(s.chronicle.some((c) => c.text.includes(`${pick.lord} kneels and rises lord of`)));
  // Saved and loaded, the world knows it again.
  const back = deserialize(serialize(s), world);
  delete world.houses.houses[id];
  step(back, 1, world, { ambient: false });
  assert.equal(world.houses.houses[id].name, pick.name);
});

test('with no one fit, the crown holds the lands and the choice stays open', () => {
  let s = fresh();
  for (const h of Object.values(s.houses)) h.loyalty = 20;
  fallHouse(s, world, 'dravnik', 'strip');
  assert.equal(candidatesFor(s, world).length, 0);
  for (let m = 0; m < 4; m++) {
    for (const h of Object.values(s.houses)) h.loyalty = 20;
    for (const c of s.forces.companies) c.wins = 0;
    s = quiet(step(s, 30, world, { ambient: false }));
  }
  for (const h of Object.values(s.houses)) h.loyalty = 20;
  for (const c of s.forces.companies) c.wins = 0;
  assert.equal(s.raisings.length, 1, 'still waiting');
  const out = applyAction(s, world, { type: 'raising', id: s.raisings[0].id, choice: 0 });
  assert.ok(out.error);
});

test('a new house is grateful for years, the gratitude fading', () => {
  let s = withArmy(fresh());
  fallHouse(s, world, 'ostrowicz', 'exile');
  s = applyAction(s, world, { type: 'raising', id: s.raisings[0].id, choice: 0 }).state;
  const id = Object.keys(s.houses).find((k) => s.houses[k].def);
  const g0 = s.houses[id].gratitude;
  const t0 = loyaltyTarget(s, world, id);
  for (let m = 0; m < 36; m++) monthlyGratitude(s, world);
  assert.ok(s.houses[id].gratitude < g0 * 0.4);
  assert.ok(loyaltyTarget(s, world, id) <= t0);
  assert.ok(s.houses[id].gratitude > 0, 'still a little grateful after three years');
});

test('a conquered town can be offered for a new house', () => {
  let s = withArmy(fresh());
  const town = Object.keys(s.settlements).find((x) => s.settlements[x].holder === 'crown' && world.byId[x].type === 'village');
  assert.ok(applyAction(s, world, { type: 'offerTown', settlement: town }).error, 'only a conquered town');
  s.settlements[town].conquered = { day: s.day, how: 'storm', from: 'redania' };
  s = applyAction(s, world, { type: 'offerTown', settlement: town }).state;
  assert.deepEqual(s.raisings[0].lands, [town]);
  s = applyAction(s, world, { type: 'raising', id: s.raisings[0].id, choice: 0 }).state;
  assert.notEqual(s.settlements[town].holder, 'crown');
});

test('houses come and go over a reign; a raised house can rise and be judged like any other', () => {
  let s = withArmy(fresh());
  const n = Object.keys(s.houses).length;
  fallHouse(s, world, 'brodowin', 'execute');
  assert.equal(Object.keys(s.houses).length, n - 1);
  s = applyAction(s, world, { type: 'raising', id: s.raisings[0].id, choice: 0 }).state;
  assert.equal(Object.keys(s.houses).length, n);
  const id = Object.keys(s.houses).find((k) => s.houses[k].def);
  s.armies = s.armies.filter((a) => a.side !== 'temeria');
  rise(s, world, id);
  assert.ok(s.houses[id].rebel);
  s.armies = s.armies.filter((a) => a.side !== `rebel:${id}`);
  setOwner(s, world, s.houses[id].def.seat, 'temeria');
  stepRebellionDay(s, world, makeRng(1));
  assert.equal(s.judgements.at(-1).house, id);
  s = applyAction(s, world, { type: 'judgement', id: s.judgements.at(-1).id, choice: 4 }).state;
  assert.equal(s.houses[id], undefined);
  assert.equal(s.raisings.length, 1);
});

test('a new reign begins with only the founding houses', () => {
  let s = withArmy(fresh());
  fallHouse(s, world, 'wolbrecht', 'strip');
  applyAction(s, world, { type: 'raising', id: s.raisings[0].id, choice: 0 });
  const t = createState(world, 7);
  assert.deepEqual(Object.keys(t.houses).sort(), ['brodowin', 'dravnik', 'gelbrand', 'ostrowicz', 'wolbrecht']);
});
