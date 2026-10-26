import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, applyAction, relationTarget, foreignTrade, serialize, deserialize, envoyText } from '../../src/sim/index.js';
import { STATE_VERSION } from '../../src/sim/state.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();
const run = (s, days) => step(s, days, world, { ambient: false });
const act = (s, a) => applyAction(s, world, a);

test('every neighbour on the map has a realm, a known gateway and sound envoy data', () => {
  const ids = Object.keys(world.geography.neighbours);
  assert.deepEqual(Object.keys(world.neighbours.realms).sort(), ids.sort());
  for (const r of Object.values(world.neighbours.realms)) assert.ok(world.byId[r.gateway], r.gateway);
  for (const [id, e] of Object.entries(world.envoys.envoys)) {
    for (const r of [...(e.only ?? []), ...(e.excludes ?? [])]) assert.ok(ids.includes(r), `${id}: ${r}`);
    assert.equal(e.choices.filter((c) => c.default).length, 1, `${id} needs one default`);
    assert.doesNotMatch(e.text + e.title + e.choices.map((c) => c.label).join(''), /\u2014/);
  }
});

test('a friendly stance warms a realm over time and costs gifts each month', () => {
  const base = run(createState(world, 1), 365);
  let s = act(createState(world, 1), { type: 'stance', realm: 'kaedwen', stance: 'friendly' }).state;
  s = run(s, 365);
  assert.ok(s.neighbours.kaedwen.relation > base.neighbours.kaedwen.relation + 10, `${s.neighbours.kaedwen.relation}`);
  assert.equal(s.ledger.history.at(-1).expenses.gifts, 30);
});

test('stance cannot be changed again for a while', () => {
  const s = act(createState(world, 1), { type: 'stance', realm: 'redania', stance: 'cold' }).state;
  assert.match(act(s, { type: 'stance', realm: 'redania', stance: 'neutral' }).error, /Too soon/);
  assert.equal(act(run(s, 90), { type: 'stance', realm: 'redania', stance: 'neutral' }).error, undefined);
});

test('laws carry abroad: expelling non-humans turns Mahakam against the crown', () => {
  const s = createState(world, 1);
  const before = relationTarget(s, world, 'mahakam');
  s.laws.nonhumans = { option: 'expulsion', previous: 'restricted', since: s.day };
  assert.equal(relationTarget(s, world, 'mahakam'), before - 50);
});

test('borders close to trade when relations sour', () => {
  const s = createState(world, 1);
  const open = foreignTrade(s, world);
  assert.ok(open.by.redania > 0);
  assert.equal(open.by.brokilon, 0);
  s.neighbours.redania.relation = -50;
  assert.equal(foreignTrade(s, world).by.redania, 0);
});

test('rulers ask for audiences, and unanswered requests lapse within their time', () => {
  // Since M17 the old random envoys give way to rulers' own proposals.
  let s = createState(world, 2);
  let seen = 0;
  for (let m = 0; m < 36; m++) {
    s = run(s, 30);
    seen += s.diplomacy.requests.length;
    assert.equal(s.envoys.length, 0);
    for (const q of s.diplomacy.requests) assert.ok(s.day - q.day < world.diplomacy.requests.expireDays);
  }
  assert.ok(seen > 0);
});

test('answering an envoy applies its effects', () => {
  const s = createState(world, 1);
  s.envoys.push({ id: 7, envoy: 'refugees', realm: 'brugge', day: s.day });
  const pop = s.settlements.vorune.population.human;
  const rel = s.neighbours.brugge.relation;
  const t = envoyText(world, s.envoys[0]);
  assert.match(t.text, /Brugge[\s\S]*Vorune/);
  const out = act(s, { type: 'envoy', id: 7, choice: 0 }).state;
  assert.equal(out.envoys.length, 0);
  assert.equal(out.settlements.vorune.population.human, pop + 200);
  assert.equal(out.neighbours.brugge.relation, rel + 5);
  assert.match(act(out, { type: 'envoy', id: 7, choice: 0 }).error, /gone/);
});

test('a version 3 save gains its neighbours', () => {
  const s = JSON.parse(serialize(createState(world, 1)));
  s.version = 3;
  delete s.state.neighbours;
  delete s.state.envoys;
  delete s.state.nextEnvoyId;
  const up = deserialize(JSON.stringify(s), world);
  assert.equal(up.version, STATE_VERSION);
  assert.equal(up.neighbours.cintra.stance, 'neutral');
  assert.ok(Number.isFinite(run(up, 60).treasury));
});
