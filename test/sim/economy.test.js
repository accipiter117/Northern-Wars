import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createState, step, serialize, deserialize, canRepairWorks,
  foodYield, foodNeed, foodCapacity, totalPopulation, ledgerNet,
} from '../../src/sim/index.js';
import { STATE_VERSION } from '../../src/sim/state.js';
import { startingWorks } from '../../src/sim/works.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();
const run = (s, days) => step(s, days, world, { ambient: false });
const pop = (s) => Object.values(s.settlements).reduce((n, st) => n + totalPopulation(st), 0);

test('the harvest comes in late summer and autumn, not in winter', () => {
  const s = createState(world, 1).settlements.white_orchard;
  assert.ok(foodYield(world, 'white_orchard', s, 9) > 10 * foodYield(world, 'white_orchard', s, 1));
});

test('winter makes people eat more', () => {
  const s = createState(world, 1).settlements.vizima;
  assert.ok(foodNeed(world, s, 'winter') > foodNeed(world, s, 'summer'));
});

test('a starving town goes hungry, grows restless and loses people', () => {
  let s = createState(world, 1);
  for (const st of Object.values(s.settlements)) st.stock.food = 0;
  s.day += 120; // Late June: little to reap until August.
  const before = pop(s);
  const unrestBefore = s.settlements.vizima.unrest;
  s = run(s, 35);
  assert.ok(s.settlements.vizima.hunger > 0.3, `hunger ${s.settlements.vizima.hunger}`);
  // Its walls and shrines (M20) steady it a little, but hunger still tells.
  assert.ok(s.settlements.vizima.unrest > unrestBefore + 3);
  assert.ok(pop(s) < before);
  assert.ok(s.chronicle.some((d) => /Hunger stalks/.test(d.text)));
});

test('grain moves from full stores to empty ones', () => {
  let s = createState(world, 1);
  s.settlements.vizima.stock.food = 0;
  s = run(s, 10);
  assert.ok(s.settlements.vizima.stock.food > 0);
  assert.ok(Object.keys(s.flows.in).includes('vizima'));
});

test('food beyond a settlement\'s stores spoils', () => {
  let s = createState(world, 1);
  s.settlements.tegmond.stock.food = 1e6;
  s = run(s, 1);
  assert.ok(s.settlements.tegmond.stock.food <= foodCapacity(world, s.settlements.tegmond) + 1e-6);
});

test('the crown can borrow up to the bankers\' limit, and debt costs Authority and interest', () => {
  let s = createState(world, 1);
  s.treasury = -7500;
  // Since M20 the crown mends rather than builds: a dear rebuild is beyond
  // the bankers, a cheap patch is not.
  s.settlements.vizima.cond = { mint: 10 };
  s.settlements.tegmond.cond = { fields: 40 };
  assert.equal(canRepairWorks(s, world, 'vizima', 'mint', 'rebuild').ok, false);
  assert.equal(canRepairWorks(s, world, 'tegmond', 'fields', 'patch').ok, true);
  s = run(s, 31);
  const last = s.ledger.history.at(-1);
  // About one per cent a month, on what is still owed when the month closes.
  const owed = -(last.treasury - ledgerNet(last).net);
  assert.ok(Math.abs(last.expenses.interest - owed * 0.01) <= owed * 0.003, `interest ${last.expenses.interest} on ${owed}`);
  assert.ok(s.authority < 60);
  assert.ok(s.chronicle.some((d) => d.text.includes('owes')));
});

test('past the limit, soldiers go unpaid and desert', () => {
  let s = createState(world, 1);
  s.treasury = -20000;
  const garrison = s.settlements.vizima.garrison;
  s = run(s, 31);
  assert.equal(s.unpaid, true);
  assert.ok(s.settlements.vizima.garrison < garrison);
});

test('out of debt, Authority slowly returns', () => {
  let s = createState(world, 1);
  s.authority = 40;
  s = run(s, 31);
  assert.ok(s.authority > 40 && s.authority <= 60);
});

test('the monthly ledger balances', () => {
  let s = run(createState(world, 4), 31);
  const before = s.treasury;
  s = run(s, 30);
  const l = s.ledger.history.at(-1);
  const { net } = ledgerNet(l);
  assert.ok(l.income.foreign > 0);
  assert.ok(Math.abs(s.treasury - (before + net)) < 1e-6);
});

test('a version 1 save is brought up to date', () => {
  const s = createState(world, 1);
  const v1 = structuredClone(s);
  v1.version = 1;
  v1.granary = 6000;
  delete v1.ledger;
  delete v1.flows;
  delete v1.unpaid;
  for (const st of Object.values(v1.settlements)) {
    delete st.stock; delete st.hunger; delete st.buildings; delete st.construction;
  }
  const text = JSON.stringify({ format: 'northern-wars-save', version: 1, state: v1 });
  const up = deserialize(text, world);
  assert.equal(up.version, STATE_VERSION);
  assert.equal(up.granary, undefined);
  assert.ok(up.settlements.vizima.stock.food > 0);
  // Since M20 (v17) every place gets the works its land gives it.
  assert.deepEqual(up.settlements.vizima.buildings, startingWorks(world, 'vizima').buildings);
  const later = run(up, 60);
  assert.ok(Number.isFinite(later.treasury));
  assert.equal(deserialize(serialize(later), world).version, STATE_VERSION);
});
