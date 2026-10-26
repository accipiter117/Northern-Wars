import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, applyAction, realmFaith, tensionTarget, petitionText, serialize, deserialize } from '../../src/sim/index.js';
import { STATE_VERSION } from '../../src/sim/state.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();
const run = (s, days) => step(s, days, world, { ambient: false });
const decreeNow = (s, law, option) => { s.laws[law] = { option, previous: s.laws[law].option, since: s.day }; return s; };

test('petition data is sound', () => {
  for (const [id, p] of Object.entries(world.petitions.petitions)) {
    assert.equal(p.choices.filter((c) => c.default).length, 1, `${id} needs one default`);
    assert.doesNotMatch(p.title + p.text + p.choices.map((c) => c.label).join(''), /\u2014/);
  }
});

test('under the customary laws the realm keeps the peace', () => {
  const s = run(createState(world, 1), 3650);
  assert.equal(s.chronicle.filter((d) => /^(Riot|Pogrom)/.test(d.text)).length, 0);
});

test('faith follows patronage: Melitele gains when the crown backs her', () => {
  const base = realmFaith(run(createState(world, 2), 1825));
  const backed = realmFaith(run(decreeNow(createState(world, 2), 'patronage', 'melitele'), 1825));
  assert.ok(backed.melitele > base.melitele + 5, `${backed.melitele} vs ${base.melitele}`);
  for (const f of Object.values(backed)) assert.ok(f >= 0 && f <= 100);
});

test('the Eternal Fire grows in the cities', () => {
  const s0 = createState(world, 3);
  const s = run(s0, 3650);
  assert.ok(s.settlements.vizima.faith.eternal_fire > s0.settlements.vizima.faith.eternal_fire + 3);
  const sum = Object.values(s.settlements.vizima.faith).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 100) < 1e-6);
});

test('Fire patronage and expulsion raise tension; a charter lowers it', () => {
  const s = createState(world, 1);
  const base = tensionTarget(s, world, 'carreras');
  decreeNow(s, 'patronage', 'eternal_fire');
  decreeNow(s, 'nonhumans', 'expulsion');
  assert.equal(tensionTarget(s, world, 'carreras'), base + 33);
  decreeNow(s, 'nonhumans', 'charter');
  decreeNow(s, 'patronage', 'tolerance');
  assert.equal(tensionTarget(s, world, 'carreras'), base - 10);
});

test('persecution brings riots and Scoia\'tael commandos, and drives elves to sympathy', () => {
  let s = decreeNow(decreeNow(createState(world, 1), 'patronage', 'eternal_fire'), 'nonhumans', 'expulsion');
  let commandos = 0;
  for (let d = 0; d < 3650; d += 30) {
    s = run(s, 30);
    commandos = Math.max(commandos, s.threats.list.filter((t) => t.kind === 'scoiatael').length);
  }
  assert.ok(s.chronicle.some((d) => /^Riot in/.test(d.text)));
  assert.ok(commandos > 0, 'commandos came out of the woods');
  assert.ok(s.sympathy > 50);
});

test('a pogrom kills and scatters non-humans and angers Mahakam', () => {
  let s = createState(world, 1);
  for (const st of Object.values(s.settlements)) st.tension = 100;
  s = decreeNow(decreeNow(s, 'patronage', 'eternal_fire'), 'nonhumans', 'expulsion');
  for (const st of Object.values(s.settlements)) st.hunger = 1;
  const dwarves = s.settlements.carreras.population.dwarf;
  const rel = s.neighbours.mahakam.relation;
  s.day += 30; // land on the first of a month
  const before = s.chronicle.length;
  s = run(s, 3);
  const pogroms = s.chronicle.slice(before).filter((d) => /^Pogrom/.test(d.text));
  assert.ok(pogroms.length > 0);
  assert.ok(s.neighbours.mahakam.relation < rel);
  assert.ok(s.settlements.carreras.population.dwarf <= dwarves);
});

test('petitions arrive, can be answered, and settle themselves if ignored', () => {
  let s = createState(world, 1);
  let seen = 0;
  // Looked at every ten days, so a petition settled within the month is not missed.
  for (let m = 0; m < 108; m++) {
    s = run(s, 10);
    seen += s.petitions.length;
    for (const p of s.petitions) assert.ok(s.day - p.day < world.culture.petitionDefaultDays);
  }
  assert.ok(seen > 0);
  assert.ok(s.chronicle.some((d) => /Vizima sent no answer/.test(d.text)));

  const t = createState(world, 1);
  t.petitions.push({ id: 3, petition: 'fire_preacher', place: 'vizima', day: t.day });
  assert.match(petitionText(world, t.petitions[0]).text, /Vizima/);
  const fire = t.settlements.vizima.faith.eternal_fire;
  const tension = t.settlements.vizima.tension;
  const out = applyAction(t, world, { type: 'petition', id: 3, choice: 0 }).state;
  assert.ok(out.settlements.vizima.faith.eternal_fire > fire);
  assert.ok(out.settlements.vizima.tension > tension);
  assert.match(applyAction(out, world, { type: 'petition', id: 3, choice: 0 }).error, /settled/);
});

test('a version 4 save gains tension and petitions', () => {
  const s = JSON.parse(serialize(createState(world, 1)));
  s.version = 4;
  delete s.state.sympathy;
  delete s.state.petitions;
  delete s.state.nextPetitionId;
  for (const st of Object.values(s.state.settlements)) { delete st.tension; delete st.troubled; }
  const up = deserialize(JSON.stringify(s), world);
  assert.equal(up.version, STATE_VERSION);
  assert.ok(up.settlements.vizima.tension > 0);
  assert.ok(Number.isFinite(run(up, 60).sympathy));
});
