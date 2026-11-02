// The non-human quarters (M32 B): gnomes as a people, each quarter's mood
// and pogrom risk with what drives it, the pogrom as a disaster, and the
// quarter's own dilemmas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, serialize, deserialize } from '../../src/sim/index.js';
import { STATE_VERSION } from '../../src/sim/state.js';
import { quarterOf, quarters, hasQuarter } from '../../src/sim/quarters.js';
import { tensionTarget, pogromRisk, pogrom, monthlyCulture } from '../../src/sim/culture.js';
import { monthlyDilemmas, resolveDilemma, dilemmasOf } from '../../src/sim/dilemmas.js';
import { makeRng } from '../../src/sim/rng.js';
import { nodeWorld, signLaws } from '../helpers.js';

const world = await nodeWorld();
const fresh = () => createState(world, 1);

test('gnomes live where the lore puts them, and have a mind of their own', () => {
  const s = fresh();
  assert.equal(s.settlements.vizima.population.gnome, 120);
  assert.ok(s.settlements.carreras.population.gnome > 0);
  assert.equal(s.settlements.anchor.population.gnome, 0, 'none in a fishing village');
  assert.equal(Object.values(s.settlements.vizima.population).reduce((a, b) => a + b, 0), 18000, 'the town is no bigger');
  assert.equal(s.opinion.gnome, 50);
  assert.ok(world.groups.groups.gnome);
});

test('towns with a meaningful share of non-humans have a quarter; hamlets with a handful do not', () => {
  const s = fresh();
  const ids = quarters(s, world).map((q) => q.id);
  for (const id of ['vizima', 'maribor', 'carreras', 'zavada', 'vidort']) assert.ok(ids.includes(id), id);
  for (const id of ['anchor', 'windley', 'tegmond']) assert.ok(!hasQuarter(world, s.settlements[id]), id);
  const q = quarterOf(s, world, 'vizima');
  assert.deepEqual(q.peoples.map((x) => x.people), ['dwarf', 'elf', 'halfling', 'gnome']);
  assert.equal(q.total, 1800);
  assert.ok(q.regardWord && q.neighboursWord);
});

test('the quarter regards the crown as its peoples do, and a pogrom darkens it for years', () => {
  const s = fresh();
  s.opinion.dwarf = 80;
  s.opinion.gnome = 80;
  const warm = quarterOf(s, world, 'carreras').regard;
  assert.ok(warm > 70, `${warm}`);
  s.settlements.carreras.quarter = { pogrom: s.day, lost: 100, dead: 30 };
  assert.ok(quarterOf(s, world, 'carreras').regard < warm - 15);
  s.day += world.culture.pogrom.remember;
  assert.ok(Math.abs(quarterOf(s, world, 'carreras').regard - warm) < 1, 'forgotten in five years');
});

test('what raises the pogrom risk, and what lowers it', () => {
  const at = (s) => tensionTarget(s, world, 'maribor');
  const base = at(fresh());
  const higher = {
    restrictions: signLaws(fresh(), world, 'restrictions'),
    hunger: (() => { const s = fresh(); s.settlements.maribor.hunger = 0.5; return s; })(),
    scoiatael: (() => { const s = fresh(); s.settlements.maribor.scoiaNear = s.day; return s; })(),
    refugees: (() => { const s = fresh(); s.conquest.exodus.push({ from: 'x', to: 'maribor', people: 300, kind: 'human', until: s.day + 40 }); return s; })(),
    preaching: (() => { const s = fresh(); s.settlements.maribor.faith.eternal_fire += 30; return s; })(),
  };
  for (const [why, s] of Object.entries(higher)) assert.ok(at(s) > base + 3, `${why}: ${at(s)} vs ${base}`);
  const lower = {
    charter: signLaws(fresh(), world, 'nonhuman_charter'),
    prosperity: (() => { const s = fresh(); s.settlements.maribor.prosperity = 95; return s; })(),
    devotion: (() => { const s = fresh(); s.faiths.devotion.lebioda = 100; s.faiths.devotion.melitele = 100; return s; })(),
  };
  for (const [why, s] of Object.entries(lower)) assert.ok(at(s) < base - 3, `${why}: ${at(s)} vs ${base}`);
  const bare = fresh();
  bare.settlements.maribor.garrison = 0;
  assert.ok(at(bare) > base + 3, 'a garrison keeps the peace');
});

test('the risk is nothing in a calm town, climbs past 60, and the quarter warns once', () => {
  const s = fresh();
  const t = s.settlements.maribor;
  assert.equal(pogromRisk(world, t), 0);
  t.tension = 75;
  const r75 = pogromRisk(world, t);
  t.tension = 90;
  assert.ok(pogromRisk(world, t) > r75 && r75 > 0.1);
  // Pin the tension (the month's drift is daily) and stop the pogrom itself.
  const quiet = { ...world, culture: { ...world.culture, pogrom: { ...world.culture.pogrom, risk: { ...world.culture.pogrom.risk } } } };
  const rng = { chance: () => false, next: () => 0.99, int: () => 0 };
  monthlyCulture(s, quiet, rng);
  monthlyCulture(s, quiet, rng);
  const warned = s.chronicle.filter((c) => /quarter of Maribor bars its doors/.test(c.text));
  assert.equal(warned.length, 1);
  assert.ok(quarterOf(s, world, 'maribor').warn);
});

test('a pogrom empties the quarter, burns its works, sends its young to the woods and is remembered', () => {
  let s = step(fresh(), 30, world, { ambient: false });
  const t = s.settlements.vizima;
  const before = quarterOf(s, world, 'vizima').total;
  const sympathy = s.sympathy;
  const elves = s.opinion.elf;
  pogrom(s, world, makeRng(4), 'vizima');
  const after = quarterOf(s, world, 'vizima');
  assert.ok(after.total <= before * 0.5, `${after.total} of ${before}`);
  assert.ok(t.quarter.dead > 0 && t.quarter.lost > t.quarter.dead);
  assert.ok(Object.values(t.cond ?? {}).some((c) => c < 100), 'works burned');
  assert.ok(s.scoiatael.recruits > 0, 'recruits for the Scoia\'tael');
  assert.ok(s.sympathy > sympathy && s.opinion.elf < elves);
  assert.match(s.chronicle.at(-1).text, /Pogrom in Vizima[\s\S]*will not be forgotten/);
  assert.ok(after.pogrom && after.regard < 50);
});

test('the quarter\'s own dilemmas come to towns with a quarter of that people', () => {
  const kinds = ['quarter_shop_burned', 'quarter_debt_called', 'quarter_grove_ploughed', 'quarter_inn_licence', 'quarter_gnome_patent'];
  for (const k of kinds) {
    const s = fresh();
    const only = { ...world, dilemmas: { ...world.dilemmas, chance: 1, gapDays: 0, demands: { ...world.dilemmas.demands, chance: 0 }, dilemmas: { [k]: world.dilemmas.dilemmas[k] } } };
    monthlyDilemmas(s, only, makeRng(2));
    const o = dilemmasOf(s).open.find((x) => x.dilemma === k);
    assert.ok(o, `${k} opened`);
    assert.ok(hasQuarter(world, s.settlements[o.place]), `${k} at ${o.place}`);
    const people = Object.keys(world.dilemmas.dilemmas[k].place.minPeople)[0];
    assert.ok(s.settlements[o.place].population[people] > 0);
  }
  // Answering one moves the quarter's fear.
  const s = fresh();
  const only = { ...world, dilemmas: { ...world.dilemmas, chance: 1, gapDays: 0, demands: { ...world.dilemmas.demands, chance: 0 }, dilemmas: { quarter_shop_burned: world.dilemmas.dilemmas.quarter_shop_burned } } };
  monthlyDilemmas(s, only, makeRng(2));
  const o = dilemmasOf(s).open[0];
  const was = s.settlements[o.place].tension;
  assert.ok(resolveDilemma(s, only, o.id, 2));
  assert.ok(s.settlements[o.place].tension > was);
});

test('older saves take their gnomes from the dwarves of the towns the lore names', () => {
  const s = step(fresh(), 30, world, { ambient: false });
  const old = JSON.parse(serialize(s));
  old.version = 36;
  old.state.version = 36;
  for (const t of Object.values(old.state.settlements)) {
    t.population.dwarf += t.population.gnome;
    delete t.population.gnome;
  }
  delete old.state.opinion.gnome;
  const up = deserialize(JSON.stringify(old), world);
  assert.equal(up.version, STATE_VERSION);
  assert.equal(up.settlements.vizima.population.gnome, s.settlements.vizima.population.gnome);
  assert.equal(up.settlements.vizima.population.dwarf, s.settlements.vizima.population.dwarf);
  assert.equal(up.settlements.anchor.population.gnome, 0);
  assert.equal(up.opinion.gnome, up.opinion.dwarf);
});
