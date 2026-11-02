// The Road to War (M33 C): five boxes, the war waiting on all of them, the
// pretext, the crown's spies slowing the Empire's, and the First Northern
// War when they are ticked: Cintra, Skellige, Sodden and Brugge, the Call
// of the North and the crowns that rally late.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, serialize, deserialize } from '../../src/sim/index.js';
import { STATE_VERSION } from '../../src/sim/state.js';
import { roadBoxes, roadOpen, monthlyRoad, beginFirstWar, answerCall, roadView } from '../../src/sim/road.js';
import { monthlyClock } from '../../src/sim/clock.js';
import { dilemmasOf, resolveDilemma } from '../../src/sim/dilemmas.js';
import { trustIn } from '../../src/sim/diplomacy.js';
import { makeRng } from '../../src/sim/rng.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();
const fresh = () => createState(world, 1);
const ready = (s) => {
  s.paths.temeria.step = world.paths.temeria.steps.length;
  s.paths.nilfgaard.step = world.paths.nilfgaard.steps.length;
  s.spycraft.nets.nilfgaard.cintra = 80;
  s.road = { pretext: { day: s.day, text: 'A spurned envoy.' }, began: null, calls: {} };
  s.day += 400;
  return s;
};
const tick = (s) => Object.fromEntries(roadBoxes(s, world).map((b) => [b.id, b.done]));

test('five boxes, none ticked in the first days of 1262', () => {
  const s = fresh();
  assert.deepEqual(tick(s), { foltest: false, emhyr: false, agents: false, pretext: false, year: false });
  assert.equal(roadOpen(s, world), false);
});

test('the war waits until every box is ticked, then begins of itself', () => {
  const s = ready(fresh());
  s.nilfgaard.stage = 'pressure';
  s.paths.nilfgaard.step = 2;
  monthlyClock(s, world, makeRng(1));
  assert.equal(s.nilfgaard.stage, 'pressure', 'Emhyr\'s path unfinished: no war');
  s.paths.nilfgaard.step = world.paths.nilfgaard.steps.length;
  assert.ok(roadOpen(s, world));
  monthlyClock(s, world, makeRng(1));
  assert.equal(s.nilfgaard.stage, 'war');
  const w = s.wars.find((x) => x.cause === 'invasion');
  assert.ok(w.sides[0].includes('nilfgaard') && w.sides[1].includes('cintra') && w.sides[1].includes('skellige'));
  for (const r of ['sodden', 'brugge']) assert.ok(w.sides.some((x) => x.includes(r)), `${r} drawn in`);
  assert.ok(dilemmasOf(s).open.some((o) => o.dilemma === 'call_of_the_north'), 'the Call reaches Vizima');
  assert.ok(s.chronicle.some((c) => /The First Northern War has begun/.test(c.text)));
});

test('a pretext comes only once Emhyr is ready and his agents are in place', () => {
  const s = fresh();
  s.day += 400;
  const sure = { ...world, war: { ...world.war, clock: { ...world.war.clock, road: { ...world.war.clock.road, pretext: 1 } } } };
  monthlyRoad(s, sure, makeRng(1));
  assert.equal(s.road.pretext, null);
  s.paths.nilfgaard.step = world.paths.nilfgaard.steps.length;
  s.spycraft.nets.nilfgaard.cintra = 75;
  monthlyRoad(s, sure, makeRng(1));
  assert.ok(s.road.pretext && /envoy|Yaruga/.test(s.road.pretext.text));
});

test('the crown\'s own spies in Cintra slow the Empire\'s', () => {
  const a = fresh();
  const b = fresh();
  for (const s of [a, b]) s.spycraft.nets.nilfgaard.cintra = 60;
  b.spycraft.nets.temeria.cintra = 70;
  monthlyRoad(a, world, makeRng(1));
  monthlyRoad(b, world, makeRng(1));
  assert.ok(b.spycraft.nets.nilfgaard.cintra < a.spycraft.nets.nilfgaard.cintra);
});

test('the Call of the North: join and Temeria marches; stand aside and the North remembers', () => {
  const join = ready(fresh());
  beginFirstWar(join, world, makeRng(1));
  const o = dilemmasOf(join).open.find((x) => x.dilemma === 'call_of_the_north');
  assert.ok(resolveDilemma(join, world, o.id, 0));
  assert.ok(join.wars.find((x) => x.cause === 'invasion').sides[1].includes('temeria'));
  const aside = ready(fresh());
  beginFirstWar(aside, world, makeRng(1));
  const before = trustIn(aside, world, 'redania', 'temeria');
  answerCall(aside, world, 'aside');
  assert.ok(trustIn(aside, world, 'redania', 'temeria') < before - 10);
  assert.ok(!aside.wars.find((x) => x.cause === 'invasion').sides.flat().includes('temeria'));
});

test('the other crowns rally late, in time for Sodden', () => {
  const s = ready(fresh());
  const sure = { ...world, war: { ...world.war, clock: { ...world.war.clock, road: { ...world.war.clock.road, rallyChance: 1 } } } };
  beginFirstWar(s, sure, makeRng(1));
  const w = s.wars.find((x) => x.cause === 'invasion');
  assert.ok(!w.sides[1].includes('redania'), 'not at once');
  s.nilfgaard.stage = 'war';
  s.day += 200;
  monthlyRoad(s, sure, makeRng(1));
  for (const r of ['redania', 'kaedwen', 'aedirn']) assert.ok(w.sides[1].includes(r) || s.realms[r]?.fallen, r);
  assert.ok(roadView(s, world).calls.every((c) => c.joined !== null));
});

test('an older reign gets the road; one already at war keeps it', () => {
  const s = step(fresh(), 10, world, { ambient: false });
  const old = JSON.parse(serialize(s));
  old.version = 39;
  old.state.version = 39;
  delete old.state.road;
  old.state.nilfgaard.stage = 'war';
  const up = deserialize(JSON.stringify(old), world);
  assert.equal(up.version, STATE_VERSION);
  assert.equal(up.road.began, up.nilfgaard.since);
});

test('once Emhyr is ready, his host grows every month the war is held back', () => {
  const s = fresh();
  s.paths.nilfgaard.step = world.paths.nilfgaard.steps.length;
  const army = s.realms.nilfgaard.army ?? 0;
  for (let i = 0; i < 12; i++) { s.day += 30; monthlyRoad(s, world, makeRng(i)); }
  assert.equal(s.realms.nilfgaard.army, army + 12 * world.war.clock.road.hostPerMonth);
  assert.equal(s.road.massed, 12 * world.war.clock.road.hostPerMonth);
});
