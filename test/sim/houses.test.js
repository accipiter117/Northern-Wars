import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, applyAction, loyaltyTarget, holdingsOf, crownShare, demandText, serialize, deserialize, houseDues, lawEffects,
} from '../../src/sim/index.js';
import { STATE_VERSION } from '../../src/sim/state.js';
import { nodeWorld, signLaws } from '../helpers.js';

const world = await nodeWorld();
const run = (s, days) => step(s, days, world, { ambient: false });
const act = (s, a) => applyAction(s, world, a);

test('house data is sound and the houses hold their lands from the start', () => {
  const s = createState(world, 1);
  for (const [id, h] of Object.entries(world.houses.houses)) {
    assert.ok(h.holdings.includes(h.seat), `${id} holds its seat`);
    for (const t of h.traits) assert.ok(world.houses.traits[t], `${id}: ${t}`);
    assert.deepEqual(holdingsOf(s, id).sort(), [...h.holdings].sort());
  }
  for (const [id, d] of Object.entries(world.demands.demands)) {
    assert.equal(d.choices.filter((c) => c.default).length, 1, `${id} needs one default`);
    assert.doesNotMatch(d.title + d.text + d.choices.map((c) => c.label).join(''), /\u2014/);
  }
  assert.equal(s.settlements.vizima.holder, 'crown');
  assert.equal(s.settlements.mayena.holder, 'dravnik');
});

test('the crown takes half the taxes of held lands and pays none of their soldiers', () => {
  const s = createState(world, 1);
  assert.equal(crownShare(s, world, s.settlements.mayena), world.houses.heldTaxShare);
  assert.equal(crownShare(s, world, s.settlements.vizima), 1);
  s.houses.dravnik.exemptUntil = s.day + 100;
  assert.equal(crownShare(s, world, s.settlements.mayena), 0);
  const base = run(createState(world, 1), 31).ledger.history.at(-1).expenses.garrisons;
  const t = createState(world, 1);
  for (const st of Object.values(t.settlements)) st.holder = 'crown';
  assert.ok(run(t, 31).ledger.history.at(-1).expenses.garrisons > base);
});

test('loyalty follows favour, grievance, the lords\' mood and the laws a house cares about', () => {
  const s = createState(world, 1);
  const base = loyaltyTarget(s, world, 'wolbrecht');
  signLaws(s, world, 'faith_of_the_crown:melitele');
  assert.equal(loyaltyTarget(s, world, 'wolbrecht'), base + 10);
  s.houses.wolbrecht.grievance = 30;
  assert.equal(loyaltyTarget(s, world, 'wolbrecht'), base - 20);
  s.opinion.nobles = 30;
  assert.equal(loyaltyTarget(s, world, 'wolbrecht'), base - 30);
});

test('crown actions: honours, a grant of land, a fine and stripping a title', () => {
  let s = createState(world, 1);
  const t0 = s.treasury;
  s = act(s, { type: 'house', house: 'brodowin', kind: 'honours' }).state;
  assert.equal(s.treasury, t0 - 300);
  assert.match(act(s, { type: 'house', house: 'brodowin', kind: 'honours' }).error, /Too soon/);
  assert.match(act(s, { type: 'house', house: 'brodowin', kind: 'grant', settlement: 'vizima' }).error, /stays with the crown/);
  s = act(s, { type: 'house', house: 'brodowin', kind: 'grant', settlement: 'white_orchard' }).state;
  assert.equal(s.settlements.white_orchard.holder, 'brodowin');
  const t1 = s.treasury;
  s = act(s, { type: 'house', house: 'gelbrand', kind: 'fine' }).state;
  assert.ok(s.treasury >= t1 + 100);
  assert.ok(s.houses.gelbrand.grievance >= 40, 'greedy houses take fines hard');
  assert.match(act(s, { type: 'house', house: 'gelbrand', kind: 'strip', settlement: 'red_fort' }).error, /seat/);
  const a = s.unrest;
  s = act(s, { type: 'house', house: 'gelbrand', kind: 'strip', settlement: 'dregsdon' }).state;
  assert.equal(s.settlements.dregsdon.holder, 'crown');
  assert.ok(s.unrest > a, 'stripping a house angers the towns');
  assert.ok(s.houses.wolbrecht.grievance > 0, 'every house takes note');
});

test('levies bring soldiers to Vizima at the cost of a grievance', () => {
  let s = createState(world, 1);
  const viz = s.settlements.vizima.garrison;
  s = act(s, { type: 'house', house: 'dravnik', kind: 'levies' }).state;
  assert.ok(s.settlements.vizima.garrison > viz);
  assert.ok(s.houses.dravnik.grievance > 0);
});

test('demands arrive, are answered, and default to refusal if ignored', () => {
  let s = createState(world, 1);
  let seen = 0;
  for (let m = 0; m < 36; m++) {
    s = run(s, 30);
    seen += s.demands.length;
    for (const d of s.demands) assert.ok(s.day - d.day < world.houses.demandDefaultDays);
  }
  assert.ok(seen > 0);
  assert.ok(s.chronicle.some((d) => /no answer came from the throne/.test(d.text)));

  const t = createState(world, 1);
  t.demands.push({ id: 4, house: 'dravnik', demand: 'land', day: t.day, target: 'cleves' });
  assert.match(demandText(world, t.demands[0]).text, /Radomir Dravnik[\s\S]*Cleves/);
  const out = act(t, { type: 'demand', id: 4, choice: 0 }).state;
  assert.equal(out.settlements.cleves.holder, 'dravnik');
  t.demands[0].id = 5;
  const refused = act(t, { type: 'demand', id: 5, choice: 1 }).state;
  assert.equal(refused.houses.dravnik.grievance, 30, 'a proud house takes refusal twice as hard');
});

// Since M27 a rising is a war (rebellion.test.js): a crown that raises no
// army against it is forced to terms in the end.
test('a house pushed past breaking rises in arms, withholds its dues, and a crown with no army is forced to terms', () => {
  let s = createState(world, 1);
  s.houses.ostrowicz.grievance = 200;
  s.houses.ostrowicz.loyalty = 0;
  s.fear = 0;
  let rose = false;
  for (let m = 0; m < 24 && !rose; m++) {
    s = run(s, 30);
    rose = !!s.houses.ostrowicz?.rebel;
  }
  assert.ok(rose);
  assert.ok(s.chronicle.some((d) => /Ostrowicz has risen/.test(d.text)));
  assert.equal(houseDues(s, world, lawEffects(s, world)).ostrowicz, undefined, 'no dues in rebellion');
  for (let m = 0; m < world.houses.rebellion.forceTermsAfter + 2 && s.houses.ostrowicz.rebel; m++) {
    s.armies = s.armies.filter((a) => a.side !== 'temeria');
    s = run(s, 30);
  }
  assert.ok(s.chronicle.some((d) => /Too weak to break House Ostrowicz, the crown makes terms/.test(d.text)));
});

test('a crown with no Authority amid Unrest is deposed, and a regency takes over', () => {
  let s = createState(world, 1);
  for (let m = 0; m < 12; m++) {
    s.love = 0;
    s.fear = 0;
    for (const st of Object.values(s.settlements)) st.unrest = 80;
    s = run(s, 30);
    if (s.depositions.length) break;
  }
  assert.equal(s.depositions.length, 1);
  assert.equal(s.reign.number, 2);
  assert.ok(s.love >= world.houses.deposition.regencyLove - 1);
  const d = s.depositions[0];
  assert.equal(d.reign, 1);
  assert.ok(d.to > d.from && d.popEnd > 0);
  assert.ok(s.chronicle.some((x) => /deposed the crown/.test(x.text)));
});

test('a version 5 save gains the great houses', () => {
  const s = JSON.parse(serialize(createState(world, 1)));
  s.version = 5;
  for (const k of ['houses', 'demands', 'nextDemandId', 'crisisMonths', 'depositions', 'reign']) delete s.state[k];
  for (const st of Object.values(s.state.settlements)) st.holder = 'crown';
  const up = deserialize(JSON.stringify(s), world);
  assert.equal(up.version, STATE_VERSION);
  assert.equal(up.settlements.houtborg.holder, 'wolbrecht');
  assert.ok(Number.isFinite(run(up, 60).houses.dravnik.loyalty));
});
