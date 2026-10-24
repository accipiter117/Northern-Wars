import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, applyAction, threatLevel, localStrength, patrolCapacity, eventText, plagueActive, serialize, deserialize, totalPopulation } from '../../src/sim/index.js';
import { STATE_VERSION } from '../../src/sim/state.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();
const run = (s, days, ambient = false) => step(s, days, world, { ambient });
const act = (s, a) => applyAction(s, world, a);

test('event data is sound', () => {
  for (const [id, e] of Object.entries(world.events.events)) {
    assert.equal(e.choices.filter((c) => c.default).length, 1, `${id} needs one default`);
    assert.doesNotMatch(e.title + e.text + e.choices.map((c) => c.label).join(''), /\u2014/);
  }
});

test('threats grow in wild country and fall with bounties, patrols and clearing', () => {
  const s = createState(world, 1);
  assert.ok(threatLevel(s, world, 'anchor', 'monsters') > threatLevel(s, world, 'vizima', 'monsters') + 30, 'the Velen marsh breeds monsters');
  const m = threatLevel(s, world, 'anchor', 'monsters');
  s.laws.bounties = { option: 'witchers', previous: 'none', since: s.day };
  assert.equal(threatLevel(s, world, 'anchor', 'monsters'), m - 15);
  const b = threatLevel(s, world, 'anchor', 'bandits');
  s.patrols.push({ id: 1, from: 'gors_velen', to: 'dorian' });
  assert.equal(threatLevel(s, world, 'anchor', 'bandits'), b - 20);
  s.settlements.anchor.cleared = { bandits: s.day + 10 };
  assert.ok(threatLevel(s, world, 'anchor', 'bandits') < (b - 20) * 0.3);
});

test('a stronger garrison costs more and stands taller; lords keep their own', () => {
  const base = run(createState(world, 1), 400);
  let s = act(createState(world, 1), { type: 'garrison', settlement: 'vizima', level: 'fortress' }).state;
  s = run(s, 400);
  assert.ok(s.settlements.vizima.garrison > base.settlements.vizima.garrison * 1.6);
  assert.ok(s.ledger.history.at(-1).expenses.garrisons > base.ledger.history.at(-1).expenses.garrisons);
  assert.match(act(createState(world, 1), { type: 'garrison', settlement: 'mayena', level: 'strong' }).error, /lord keeps/);
});

test('patrols are limited by soldiers, cost crowns, and strengthen the places on their road', () => {
  let s = createState(world, 1);
  const cap = patrolCapacity(s, world);
  assert.ok(cap >= 2);
  const before = localStrength(s, world, 'anchor');
  s = act(s, { type: 'patrol', from: 'gors_velen', to: 'dorian' }).state;
  assert.equal(localStrength(s, world, 'anchor'), before + world.military.patrol.strength);
  assert.match(act(s, { type: 'patrol', from: 'dorian', to: 'gors_velen' }).error, /Already/);
  s = run(s, 35, true);
  assert.equal(s.ledger.history.at(-1).expenses.patrols, world.military.patrol.cost);
  const id = s.patrols[0].id;
  s = act(s, { type: 'unpatrol', id }).state;
  assert.equal(s.patrols.length, 0);
});

test('an undefended wild village is raided; a strong garrison holds', () => {
  let weak = createState(world, 3);
  weak.settlements.anchor.garrison = 0;
  weak.settlements.anchor.prosperity = 5;
  weak.settlements.anchor.unrest = 90;
  let raided = false;
  for (let i = 0; i < 60 && !raided; i++) {
    weak = run(weak, 30);
    raided = weak.chronicle.some((d) => /^(Bandits fell on Anchor|Something came out of the wilds by night at Anchor)/.test(d.text));
    weak.settlements.anchor.garrison = 0;
  }
  assert.ok(raided);
  let strong = createState(world, 3);
  for (let i = 0; i < 60; i++) {
    strong.settlements.anchor.garrison = 5000;
    strong = run(strong, 30);
  }
  assert.ok(!strong.chronicle.some((d) => /^(Bandits fell on Anchor|Something came out of the wilds by night at Anchor)/.test(d.text)));
});

test('plague kills, spreads along the roads, ends, and leaves immunity; quarantine holds it', () => {
  const pop = (s) => Object.values(s.settlements).reduce((a, st) => a + totalPopulation(st), 0);
  let s = createState(world, 4);
  s.events.push({ id: 1, event: 'plague', place: 'maribor', day: s.day });
  s = act(s, { type: 'event', id: 1, choice: 2 }).state;
  assert.ok(plagueActive(s, s.settlements.maribor));
  const p0 = pop(s);
  s = run(s, 400);
  assert.ok(pop(s) < p0);
  assert.ok(s.chronicle.some((d) => /plague has reached/.test(d.text)));
  assert.ok(!plagueActive(s, s.settlements.maribor));
  assert.ok(s.settlements.maribor.plagueImmune > s.day);

  let q = createState(world, 4);
  q.events.push({ id: 1, event: 'plague', place: 'maribor', day: q.day });
  q = act(q, { type: 'event', id: 1, choice: 0 }).state;
  q = run(q, 100);
  assert.ok(!q.chronicle.some((d) => /plague has reached/.test(d.text)));
});

test('events arrive, can be answered, and take their default if ignored', () => {
  let s = createState(world, 1);
  let seen = 0;
  for (let m = 0; m < 36; m++) {
    s = run(s, 30);
    seen += s.events.length;
    for (const e of s.events) assert.ok(s.day - e.day < world.military.eventDefaultDays);
  }
  assert.ok(seen > 0);
  assert.ok(s.chronicle.some((d) => /Vizima gave no orders/.test(d.text)));

  const t = createState(world, 1);
  t.events.push({ id: 9, event: 'witcher', place: 'anchor', day: t.day });
  assert.match(eventText(world, t.events[0]).text, /Anchor/);
  const before = threatLevel(t, world, 'anchor', 'monsters');
  const out = act(t, { type: 'event', id: 9, choice: 0 }).state;
  assert.equal(out.treasury, t.treasury - 150);
  assert.ok(threatLevel(out, world, 'anchor', 'monsters') < before * 0.3);
});

test('a version 6 save gains patrols, threats and events', () => {
  const s = JSON.parse(serialize(createState(world, 1)));
  s.version = 6;
  for (const k of ['garrisonLevel', 'patrols', 'nextPatrolId', 'events', 'nextEventId']) delete s.state[k];
  for (const st of Object.values(s.state.settlements)) for (const k of ['plague', 'quarantine', 'priestesses', 'cleared', 'raided', 'raidKind']) delete st[k];
  const up = deserialize(JSON.stringify(s), world);
  assert.equal(up.version, STATE_VERSION);
  assert.deepEqual(up.patrols, []);
  assert.ok(Number.isFinite(run(up, 60).treasury));
});
