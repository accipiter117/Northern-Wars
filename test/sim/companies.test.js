// One military (M22 C): every soldier in a company, one strength formula for
// all of them; a town's muster raises the right companies and takes its
// hands; armies merge and detach companies; the skirmish table's targets
// hold; old saves turn their armies into companies with nothing lost.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createState, step, applyAction, serialize, deserialize, armyStrength, companyStrength, placeMuster, localStrength, garrisonCompanies, bandStrength,
} from '../../src/sim/index.js';
import { STATE_VERSION } from '../../src/sim/state.js';
import { skirmishTable } from '../../tools/skirmish.mjs';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();
const run = (s, days) => step(s, days, world, { ambient: false });
const act = (s, a) => {
  const out = applyAction(s, world, a);
  assert.equal(out.error, undefined, `${a.type}: ${out.error}`);
  return out.state;
};
const quiet = (s) => {
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  return s;
};
const raise = (over = {}) => ({ type: 'raise', muster: 'vizima', levy: 'third', nobles: false, mercs: [], units: [], marshal: 'vestibor', stance: 'cautious', ...over });

test('one strength formula: an army is the sum of its companies', () => {
  let s = quiet(run(createState(world, 1), 40));
  s.treasury = 8000;
  s = act(s, { type: 'recruit', settlement: 'vizima', kind: 'menatarms' });
  s = act(s, raise({ mercs: ['kovir'], units: [s.forces.companies[0].id] }));
  const a = s.armies.find((x) => x.side === 'temeria');
  // Levies, a standing company and hired men, each a company with its source.
  assert.deepEqual([...new Set(a.bands.map((b) => b.source))].sort(), ['levy', 'mercenary', 'standing']);
  assert.ok(Math.abs(a.bands.reduce((v, b) => v + b.men, 0) - a.soldiers) < 1);
  const st = world.war.stances[a.stance];
  const marshal = world.war.marshals[a.marshal].skill;
  const sum = a.bands.reduce((v, b) => v + companyStrength(world, { ...b, morale: a.morale }, 'soldiers'), 0);
  // Standing in Vizima behind its walls, the walls' bonus on top.
  const k = armyStrength(s, world, a) / (sum * marshal * st.attack * (a.arms ?? 1));
  assert.ok(Math.abs(k - 1) < 1e-9 || Math.abs(k - world.war.battle.wallsDefence) < 1e-9, `factor ${k}`);
  // No separate quality: losses come off every company alike.
  assert.equal(a.quality, undefined);
  const before = armyStrength(s, world, a);
  a.soldiers *= 0.5;
  assert.ok(Math.abs(armyStrength(s, world, a) - before * 0.5) < 1e-6);
  // A place's strength is its garrison and its own muster by the same formula.
  const id = 'ellander';
  const parts = [...garrisonCompanies(world, id, s.settlements[id].garrison), ...placeMuster(s, world, id)];
  assert.ok(Math.abs(localStrength(s, world, id, 'bandits') - bandStrength(world, parts, world.forces.morale.start, 'bandits') * (1 + 0)) / localStrength(s, world, id, 'bandits') < 0.5);
});

test('a town\'s muster raises the right companies, takes its hands, and gives them back', () => {
  let s = quiet(run(createState(world, 2), 92));
  const city = placeMuster(s, world, 'maribor');
  assert.ok(city.some((b) => b.type === 'militia') && city.some((b) => b.type === 'crossbows'), 'spears and crossbows from a city');
  const village = placeMuster(s, world, 'zavada');
  assert.ok(village.every((b) => ['militia', 'archers'].includes(b.type)), 'spears and bows from a village');
  for (const b of city) assert.ok(b.men >= 100 && b.men <= 300, `company of ${b.men}`);
  const hands = s.labour.report.fields.hands + s.labour.report.crafts.hands;
  s = act(s, { type: 'muster', settlement: 'maribor' });
  const m = s.armies.find((a) => a.muster === 'maribor');
  assert.ok(m && m.folk && m.levy.maribor > 0);
  assert.equal(m.bands.length, city.length);
  assert.match(applyAction(s, world, { type: 'muster', settlement: 'maribor' }).error, /already/);
  s = run(s, 1);
  const away = s.labour.report.fields.hands + s.labour.report.crafts.hands;
  assert.ok(away < hands - m.soldiers * 0.5, `${hands} hands, ${away} with the muster under arms`);
  s = act(s, { type: 'disband', army: m.id });
  s = run(s, 1);
  assert.ok(s.labour.report.fields.hands + s.labour.report.crafts.hands > away + m.soldiers * 0.5, 'home to work again');
});

test('armies merge, keeping every company, and companies detach', () => {
  let s = quiet(run(createState(world, 3), 40));
  s.treasury = 8000;
  s = act(s, { type: 'recruit', settlement: 'vizima', kind: 'archers' });
  const cid = s.forces.companies[0].id;
  s = act(s, raise({ units: [cid] }));
  s = act(s, { type: 'muster', settlement: 'vizima' });
  const [a, b] = [s.armies.find((x) => x.side === 'temeria' && !x.muster), s.armies.find((x) => x.muster === 'vizima')];
  const men = a.soldiers + b.soldiers;
  const names = [...a.bands, ...b.bands].map((x) => x.name).sort();
  a.morale = 80;
  b.morale = 40;
  const morale = (80 * a.soldiers + 40 * b.soldiers) / men;
  s.armies.find((x) => x.id === a.id).morale = 80;
  s.armies.find((x) => x.id === b.id).morale = 40;
  s = act(s, { type: 'merge', army: b.id, into: a.id });
  const m = s.armies.find((x) => x.id === a.id);
  assert.ok(!s.armies.some((x) => x.id === b.id));
  assert.ok(Math.abs(m.soldiers - men) < 1);
  assert.deepEqual(m.bands.map((x) => x.name).sort(), names, 'every company keeps its name');
  assert.ok(Math.abs(m.morale - morale) < 0.01);
  // Detach the standing company: free again where the army stands.
  const i = m.bands.findIndex((x) => x.source === 'standing');
  s = act(s, { type: 'detach', army: m.id, band: i });
  assert.equal(s.forces.companies.find((c) => c.id === cid).army, null);
  // Detach a levy company: it goes home, and the army is smaller.
  const after = s.armies.find((x) => x.id === a.id);
  const j = after.bands.findIndex((x) => x.source === 'levy');
  const n0 = after.soldiers;
  const levy0 = after.levyMen;
  s = act(s, { type: 'detach', army: after.id, band: j });
  const last = s.armies.find((x) => x.id === a.id);
  assert.ok(last.soldiers < n0 && last.levyMen < levy0);
});

test('the skirmish table: local forces beat ordinary threats; the large ones need an army', () => {
  const s = createState(world, 1);
  const rows = skirmishTable(s, world);
  for (const r of rows) {
    if (r.size === 'ordinary') assert.ok(r.odds.city >= 0.8, `${r.label}: city ${r.odds.city}`);
    if (r.size === 'small') assert.ok(r.odds.town >= 0.75, `${r.label}: town ${r.odds.town}`);
    if (r.need) assert.ok(r.odds.town < 0.9 && r.odds.village < 0.1, `${r.label} should need an army: town ${r.odds.town}`);
  }
  assert.ok(rows.some((r) => r.need && r.kind === 'monsters') && rows.some((r) => r.need && r.kind === 'raiders'));
});

test('a version 22 save turns its armies into companies, with nothing lost', () => {
  let s = quiet(run(createState(world, 4), 40));
  s.treasury = 8000;
  s = act(s, raise({ mercs: ['kovir'] }));
  const a = s.armies.find((x) => x.side === 'temeria');
  const men = a.soldiers;
  delete a.bands;
  a.quality = 1.1;
  s.version = 22;
  const up = deserialize(JSON.stringify({ format: 'northern-wars-save', version: 22, state: s }), world);
  assert.equal(up.version, STATE_VERSION);
  const b = up.armies.find((x) => x.side === 'temeria');
  assert.ok(b.bands.length > 1);
  assert.ok(Math.abs(b.bands.reduce((v, x) => v + x.men, 0) - men) < 1);
  assert.ok(b.bands.some((x) => x.source === 'mercenary'));
  assert.equal(b.quality, undefined);
  assert.equal(deserialize(serialize(run(up, 30)), world).version, STATE_VERSION);
});
