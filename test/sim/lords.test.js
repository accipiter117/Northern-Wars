// What a great house gives and wants (M27 A and B): loyal houses guard their
// lands and lower Unrest there, disloyal ones let it fester; retinues of
// the stated grade and size; dues that follow loyalty and stop in
// rebellion; one open demand at a time; wants that turn ambition into
// loyalty when granted and into grievance when ignored; Love and Authority
// shaping the lords.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createState, step, applyAction, houseRetinue, houseDues, lawEffects, loyaltyTarget, holdingsOf, guardUnrest, duesShare, houseGives,
} from '../../src/sim/index.js';
import { monthlyGuard, monthlyWants } from '../../src/sim/lords.js';
import { retinueCompanies } from '../../src/sim/companies.js';
import { makeRng } from '../../src/sim/rng.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();
const run = (s, days) => step(s, days, world, { ambient: false });
const quiet = (s) => {
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  if (s.diplomacy) s.diplomacy.requests = [];
  return s;
};
const fresh = (seed = 1) => {
  const s = quiet(createState(world, seed));
  s.treasury = 20000;
  return s;
};

// A bandit camp planted in a house's lands.
function camp(s, near) {
  const st = world.byId[near];
  const t = { id: s.threats.nextId++, kind: 'bandits', men: 40, x: st.x + 20, y: st.y + 10, near, born: s.day, sighted: true, morale: 60 };
  s.threats.list.push(t);
  return t;
}

test('a loyal house clears the camps in its lands; a disloyal one lets them stand', () => {
  const s = fresh();
  const land = holdingsOf(s, 'wolbrecht')[1];
  s.threats.list = [];
  const t = camp(s, land);
  s.houses.wolbrecht.loyalty = 75;
  const rng = makeRng(3);
  for (let m = 0; m < 6 && s.threats.list.includes(t); m++) monthlyGuard(s, world, rng);
  assert.ok(!s.threats.list.includes(t), 'the camp is gone');
  assert.ok(s.chronicle.some((c) => /House Wolbrecht's men put down the .* near/.test(c.text)));
  assert.ok(s.houses.wolbrecht.guarded >= 1);

  s.threats.list = [];
  const u = camp(s, land);
  s.houses.wolbrecht.loyalty = 20;
  for (let m = 0; m < 12; m++) monthlyGuard(s, world, rng);
  assert.ok(s.threats.list.includes(u), 'a disloyal house leaves it');
});

test('Unrest is calmer under a loyal house and festers under a disloyal one', () => {
  const s = fresh();
  const place = s.settlements[holdingsOf(s, 'dravnik')[0]];
  s.houses.dravnik.loyalty = 70;
  assert.ok(guardUnrest(s, world, place) < 0);
  s.houses.dravnik.loyalty = 20;
  assert.ok(guardUnrest(s, world, place) > 0);
});

test('retinues come as companies a grade above levies, sized by lands and loyalty', () => {
  const s = run(fresh(4), 40);
  s.houses.dravnik.loyalty = 70;
  const r = houseRetinue(s, world, 'dravnik');
  assert.ok(r.men > 100, `${r.men} men`);
  const bands = retinueCompanies(world, 'dravnik', r.men);
  assert.ok(bands.every((b) => b.xp === world.forces.retinue.xp && b.xp > 0 && b.source === 'retinue'));
  assert.ok(Math.abs(bands.reduce((a, b) => a + b.men, 0) - r.men) <= 2);
  assert.match(houseGives(s, world, 'dravnik', r, 100).retinue, /^Retinue about \d+ men$/);
});

test('dues are a real line, follow loyalty and stop in rebellion', () => {
  const s = fresh();
  for (const h of Object.values(s.houses)) h.loyalty = 70;
  const law = lawEffects(s, world);
  const full = houseDues(s, world, law);
  const total = Object.values(full).reduce((a, b) => a + b, 0);
  assert.ok(total > 900, `five loyal houses pay ${Math.round(total)} a month`);
  s.houses.gelbrand.loyalty = 30;
  assert.ok(duesShare(s, world, 'gelbrand') < 1 && duesShare(s, world, 'gelbrand') > 0);
  assert.ok(houseDues(s, world, law).gelbrand < full.gelbrand);
  s.houses.gelbrand.rebel = { since: s.day, months: 0 };
  assert.equal(houseDues(s, world, law).gelbrand, undefined);
});

test('at most one open demand from all the houses at a time', () => {
  let s = fresh(2);
  for (const h of Object.values(s.houses)) h.ambition = 90;
  for (let m = 0; m < 18; m++) {
    s.petitions = [];
    s.envoys = [];
    s = run(s, 15);
    assert.ok(s.demands.length <= 1, `${s.demands.length} demands open`);
  }
});

test('a granted want turns ambition into loyalty; an ignored one into grievance', () => {
  let s = fresh();
  const h = s.houses.gelbrand;
  h.want = { kind: 'honours', since: s.day };
  h.ambition = 60;
  const before = loyaltyTarget(s, world, 'gelbrand');
  s = applyAction(s, world, { type: 'house', house: 'gelbrand', kind: 'honours' }).state;
  assert.equal(s.houses.gelbrand.ambition, 60 - world.houses.wants.convert);
  assert.equal(s.houses.gelbrand.want, null);
  assert.ok(loyaltyTarget(s, world, 'gelbrand') >= before + world.houses.wants.convert);

  const t = fresh();
  const o = t.houses.ostrowicz;
  o.want = { kind: 'honours', since: t.day - 30 * (world.houses.wants.patience + 1) };
  o.ambition = 40;
  o.grievance = 0;
  monthlyWants(t, world, makeRng(1));
  assert.ok(o.ambition > 40 && o.grievance > 0);
  assert.ok(t.chronicle.some((c) => /patience is wearing thin/.test(c.text)));
});

test('a land want is granted by the land; justice by redress', () => {
  let s = fresh();
  const target = Object.keys(s.settlements).find((id) => s.settlements[id].holder === 'crown' && world.byId[id].type === 'village');
  s.houses.dravnik.want = { kind: 'land', target, since: s.day };
  s = applyAction(s, world, { type: 'house', house: 'dravnik', kind: 'grant', settlement: target }).state;
  assert.equal(s.settlements[target].holder, 'dravnik');
  assert.equal(s.houses.dravnik.want, null);
  s.houses.brodowin.want = { kind: 'justice', since: s.day };
  s.houses.brodowin.grievance = 30;
  s = applyAction(s, world, { type: 'house', house: 'brodowin', kind: 'redress' }).state;
  assert.equal(s.houses.brodowin.grievance, 0);
  assert.equal(s.houses.brodowin.want, null);
});

test('every house comes to want something, drawn from its traits', () => {
  let s = fresh(5);
  s = run(s, 120);
  assert.ok(Object.values(s.houses).filter((h) => h.want).length >= 3);
});

test('a loved crown keeps loyal lords; a weak one is not obeyed by doubtful ones', () => {
  const s = fresh();
  s.love = 30;
  const low = loyaltyTarget(s, world, 'ostrowicz');
  s.love = 80;
  assert.ok(loyaltyTarget(s, world, 'ostrowicz') > low);
  s.houses.ostrowicz.loyalty = 40;
  s.love = 5;
  s.fear = 5;
  const out = applyAction(s, world, { type: 'house', house: 'ostrowicz', kind: 'summon' });
  assert.match(out.error ?? '', /would not come/);
});
