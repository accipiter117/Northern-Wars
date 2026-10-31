// The faiths (M26 C): Devotion and its levels, cumulative perks, powers that
// open at level 3 and rest between uses, the crown's acts for a faith, the
// faith of the crown growing twice as fast, clashes only between strong
// rivals (halved by Freedom of worship, won by the Fire under the
// inquisition), AI realms on the same rules, and old saves brought up.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createState, step, applyAction, faithLevel, perksOf, faithEffect, faithRest, canFaithAct, powerReadyAt, churchLand, dateOf,
  serialize, deserialize,
} from '../../src/sim/index.js';
import { STATE_VERSION } from '../../src/sim/state.js';
import { nodeWorld, signLaws } from '../helpers.js';

const world = await nodeWorld();
const run = (s, days) => step(s, days, world, { ambient: false });
const quiet = (s) => {
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  if (s.diplomacy) s.diplomacy.requests = [];
  return s;
};
const fresh = (seed = 1) => {
  const s = quiet(createState(world, seed));
  s.treasury = 50000;
  return s;
};
const act = (s, kind, faith, extra = {}) => applyAction(s, world, { type: 'faith', kind, faith, ...extra });

test('Devotion levels come at 20, 40, 60, 80 and 100, and perks add up', () => {
  const s = fresh();
  for (const [d, lv] of [[0, 0], [19.9, 0], [20, 1], [45, 2], [60, 3], [99, 4], [100, 5]]) {
    s.faiths.devotion.melitele = d;
    assert.equal(faithLevel(s, world, 'melitele'), lv, `Devotion ${d}`);
  }
  s.faiths.devotion.melitele = 45;
  assert.deepEqual(perksOf(s, world, 'melitele').map((p) => p.level), [1, 2]);
  assert.equal(faithEffect(s, world, 'foodYield'), 0.1);
  assert.equal(faithEffect(s, world, 'plagueDeaths'), -0.3);
  s.faiths.devotion.melitele = 10;
  assert.equal(faithEffect(s, world, 'foodYield'), 0, 'no perks below level 1');
});

test('a power opens at level 3, then rests between uses', () => {
  let s = fresh();
  s.faiths.devotion.melitele = 50;
  assert.equal(canFaithAct(s, world, 'blessing', 'melitele').locked, true);
  assert.equal(powerReadyAt(s, world, 'blessing', 'melitele'), null);
  s.faiths.devotion.melitele = 62;
  assert.equal(canFaithAct(s, world, 'blessing', 'melitele').ok, true);
  const coin = s.treasury;
  s = act(s, 'blessing', 'melitele').state;
  assert.equal(s.treasury, coin - world.devotion.faiths.melitele.powers.blessing.coin);
  assert.ok(faithEffect(s, world, 'foodYield') >= 0.25 + 0.1, 'the blessing is in force with the perk');
  assert.equal(faithRest(s, world, 'blessing', 'melitele'), 365);
  assert.match(canFaithAct(s, world, 'blessing', 'melitele').reason, /Not again for 365 days/);
  assert.equal(powerReadyAt(s, world, 'blessing', 'melitele'), s.day + 365);
  // The level 5 power stays closed until 100.
  assert.equal(canFaithAct(s, world, 'healers', 'melitele', 'vizima').locked, true);
});

test('endowing a temple costs coin, stirs fervour and the town, then rests', () => {
  let s = fresh();
  const before = s.settlements.vizima.faith.eternal_fire;
  const out = act(s, 'endow', 'eternal_fire', { settlement: 'vizima' });
  assert.equal(out.error, undefined);
  s = out.state;
  assert.equal(s.treasury, 50000 - world.devotion.acts.endow.coin);
  assert.equal(s.faiths.fervour.eternal_fire, world.devotion.acts.endow.fervour);
  assert.ok(s.settlements.vizima.faith.eternal_fire > before);
  assert.ok(act(s, 'endow', 'eternal_fire', { settlement: 'vizima' }).error);
  assert.equal(faithRest(s, world, 'endow', 'eternal_fire'), world.devotion.acts.endow.cooldown);
  // Another faith's temple is its own act, with its own rest.
  assert.equal(act(s, 'endow', 'melitele', { settlement: 'vizima' }).error, undefined);
});

test('a festival only in its season and once a year; a pilgrimage takes the king away a month', () => {
  let s = fresh();
  const fest = world.devotion.faiths.melitele.festival.months;
  const year = dateOf(s.day).year;
  while (fest.includes(dateOf(s.day).month)) s.day += 30;
  assert.match(canFaithAct(s, world, 'festival', 'melitele').reason, /Only in its season/);
  while (!fest.includes(dateOf(s.day).month)) s.day += 10;
  s = act(s, 'festival', 'melitele').state;
  assert.match(canFaithAct(s, world, 'festival', 'melitele').reason, /Already held this year/);
  assert.ok(dateOf(s.day).year >= year);

  s = act(s, 'pilgrimage', 'melitele').state;
  assert.equal(s.faiths.pilgrimage.until, s.day + 30);
  assert.ok(act(s, 'pilgrimage', 'old_ways').error, 'one pilgrimage at a time');
});

test('church land takes a works\' takings, and taking it back angers the faith', () => {
  let s = fresh();
  const works = s.settlements.vizima.buildings[0];
  s = act(s, 'land', 'melitele', { settlement: 'vizima', works }).state;
  assert.equal(churchLand(s, 'vizima', works), true);
  const opinion = s.opinion.melitele;
  s = applyAction(s, world, { type: 'revokeLand', settlement: 'vizima', works }).state;
  assert.equal(churchLand(s, 'vizima', works), false);
  assert.ok(s.opinion.melitele < opinion);
});

test('the faith of the crown grows twice as fast', () => {
  const gain = (crown) => {
    let s = fresh(3);
    if (crown) signLaws(s, world, 'faith_of_the_crown:melitele');
    s.faiths.devotion.melitele = 0;
    s = run(s, 180);
    return s.faiths.devotion.melitele;
  };
  const plain = gain(false);
  const crowned = gain(true);
  assert.ok(crowned > plain * 1.4, `${plain} -> ${crowned}`);
});

// Two years with the rivals held at the given Devotion each month.
function clashYears(devotion, ...laws) {
  let s = fresh(2);
  signLaws(s, world, ...laws);
  const start = s.faiths.clashes;
  for (let m = 0; m < 24; m++) {
    Object.assign(s.faiths.devotion, devotion);
    s = quiet(run(s, 30));
  }
  return { n: s.faiths.clashes - start, s };
}

test('rival faiths clash only when both are strong, and Freedom of worship halves it', () => {
  assert.equal(clashYears({ eternal_fire: 35, old_ways: 35, melitele: 35 }).n, 0, 'none below 40');
  const strong = clashYears({ eternal_fire: 60, old_ways: 55, melitele: 50 });
  assert.ok(strong.n >= 6, `${strong.n} clashes`);
  assert.ok(strong.s.chronicle.some((c) => c.kind === 'faith' && /Clash of faiths/.test(c.text)), 'a clash report');
  const free = clashYears({ eternal_fire: 60, old_ways: 55, melitele: 50 }, 'freedom_of_worship');
  assert.ok(free.n < strong.n * 0.75, `${strong.n} -> ${free.n}`);
});

test('under the inquisition the Fire wins every clash', () => {
  const { n, s } = clashYears({ eternal_fire: 60, old_ways: 55, melitele: 50 }, 'faith_of_the_crown:eternal_fire', 'restrictions', 'inquisition');
  assert.ok(n > 0);
  assert.equal(s.faiths.lastClash.win, 'eternal_fire');
});

test('AI realms keep Devotion by the same drift: Redania leans to the Fire', () => {
  const s = run(fresh(), 365);
  const r = s.faiths.realms.redania;
  assert.ok(r.eternal_fire > r.melitele && r.eternal_fire > r.old_ways);
  assert.ok(s.faiths.realms.brokilon.old_ways > 60);
});

test('a version 27 save gains the faiths', () => {
  const s = createState(world, 2);
  const old = JSON.parse(serialize(s));
  old.version = 27;
  delete old.state.faiths;
  const up = deserialize(JSON.stringify(old), world);
  assert.equal(up.version, STATE_VERSION);
  assert.ok(up.faiths.devotion.melitele > 0);
  assert.deepEqual(up.faiths.acted, {});
});
