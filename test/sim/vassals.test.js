// Vassal kings as lords abroad (M29 C): tribute and retinues by loyalty,
// protection owed and its cost when ignored, rivals courting a disloyal
// vassal after a warning, a war for independence and the four judgements.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, applyAction, tributeOf, vassalRetinue, musterPreview, suzerainOf, titlesOf, trustIn } from '../../src/sim/index.js';
import { makeVassal } from '../../src/sim/suzerainty.js';
import { monthlyVassals, stepVassalsDay } from '../../src/sim/vassals.js';
import { startWar } from '../../src/sim/war.js';
import { setOwner, ownerOf } from '../../src/sim/conflict.js';
import { makeRng } from '../../src/sim/rng.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();
const tuned = (patch) => {
  const out = {};
  for (const [k, v] of Object.entries(world.diplomacy.vassals)) out[k] = typeof v === 'object' && !Array.isArray(v) ? { ...v, ...(patch[k] ?? {}) } : v;
  return { ...world, diplomacy: { ...world.diplomacy, vassals: out } };
};
function fresh(seed = 1) {
  const s = createState(world, seed);
  s.treasury = 20000;
  for (const r of ['sodden', 'brugge', 'mahakam']) makeVassal(s, world, r, 'temeria', 'protection', 70);
  for (const r of Object.values(s.realms)) r.income = Math.max(r.income ?? 0, 400);
  return s;
}

test('vassals pay tribute by loyalty; Mahakam pays none', () => {
  const s = fresh();
  const t = tributeOf(s, world, 'sodden');
  assert.ok(t > 0);
  const before = s.treasury;
  monthlyVassals(s, world, makeRng(1));
  assert.ok(s.treasury - before >= t * 0.8, 'tribute arrives');
  s.realms.sodden.vassal.loyalty = 10;
  assert.equal(tributeOf(s, world, 'sodden'), 0);
  assert.equal(tributeOf(s, world, 'mahakam'), 0);
});

test('vassals send their companies when the lords are called, by loyalty', () => {
  const s = fresh();
  const full = vassalRetinue(s, world, 'brugge');
  assert.ok(full > 0);
  s.realms.brugge.vassal.loyalty = 40;
  assert.ok(vassalRetinue(s, world, 'brugge') < full);
  s.realms.brugge.vassal.loyalty = 10;
  assert.equal(vassalRetinue(s, world, 'brugge'), 0);
  s.realms.brugge.vassal.loyalty = 70;
  const p = musterPreview(s, world, { muster: 'vizima', levy: 'none', nobles: true });
  assert.ok(p.vassals.brugge > 0 && p.soldiers >= p.vassalMen);
});

test('protection ignored costs the vassal\'s loyalty sharply, and the others notice', () => {
  const s = fresh();
  const war = startWar(s, world, makeRng(1), 'redania', 'sodden', 'none');
  war.since = s.day - 90;
  const sod = s.realms.sodden.vassal.loyalty;
  const bru = s.realms.brugge.vassal.loyalty;
  monthlyVassals(s, world, makeRng(2));
  assert.ok(s.realms.sodden.vassal.loyalty <= sod - 20, `${sod} -> ${s.realms.sodden.vassal.loyalty}`);
  assert.ok(s.realms.brugge.vassal.loyalty < bru);
});

test('a disloyal vassal is courted away, after a warning', () => {
  const w = tuned({ court: { chance: 1, warnDays: 60 }, revolt: { chance: 0 } });
  const s = fresh();
  s.realms.brugge.vassal.loyalty = 10;
  s.neighbours.brugge.relation = -100;
  monthlyVassals(s, w, makeRng(1));
  assert.ok(s.vassalNews.warnings.some((x) => x.realm === 'brugge'), 'the crown is warned');
  assert.equal(suzerainOf(s, 'brugge'), 'temeria');
  s.day += 61;
  monthlyVassals(s, w, makeRng(2));
  assert.notEqual(suzerainOf(s, 'brugge'), 'temeria', 'gone over');
});

test('a vassal in revolt goes to war; his capital taken, he comes to judgement', () => {
  const w = tuned({ revolt: { chance: 1 }, court: { chance: 0 } });
  const s = fresh();
  Object.assign(s.realms.sodden.vassal, { loyalty: 5, ambition: 90 });
  s.neighbours.sodden.relation = -100;
  monthlyVassals(s, w, makeRng(1));
  assert.ok(s.realms.sodden.vassal.rebel);
  assert.ok(s.wars.some((x) => x.sides.flat().includes('sodden') && x.sides.flat().includes('temeria')));
  // The peace reshapes the map's lands, so it runs on the real world (a
  // shallow copy would share and leak its geography).
  setOwner(s, world, world.realms.realms.sodden.capital, 'temeria');
  stepVassalsDay(s, world);
  assert.equal(s.vassalJudgements.length, 1);
});

function judged(choice) {
  const s = fresh();
  s.realms.sodden.vassal.rebel = { since: s.day };
  setOwner(s, world, world.realms.realms.sodden.capital, 'temeria');
  stepVassalsDay(s, world);
  const before = { fear: s.fear, trust: trustIn(s, world, 'redania', 'temeria'), brugge: { ...s.realms.brugge.vassal } };
  const out = applyAction(s, world, { type: 'vassalJudgement', id: s.vassalJudgements[0].id, choice });
  assert.equal(out.error, undefined);
  return { s: out.state, before };
}

test('depose: a pliant heir, still our vassal', () => {
  const { s } = judged(0);
  assert.equal(suzerainOf(s, 'sodden'), 'temeria');
  assert.equal(s.realms.sodden.vassal.loyalty, world.diplomacy.vassals.judgement.depose.loyalty);
});

test('annex: its towns become Temeria\'s and its title passes to the crown', () => {
  const { s } = judged(1);
  assert.ok((world.foreignByRealm.sodden ?? []).every((id) => ownerOf(s, world, id) === 'temeria' || !world.byId[id]));
  assert.ok(titlesOf(s, world).includes('Prince of Sodden'), 'the title kept for ever');
});

test('pardon: grateful, and the other vassals grow bolder', () => {
  const { s, before } = judged(2);
  assert.equal(s.realms.sodden.vassal.loyalty, world.diplomacy.vassals.judgement.pardon.loyalty);
  assert.ok(s.realms.brugge.vassal.ambition > before.brugge.ambition);
});

test('execute: Fear at home, vassals in line, every court trusts us less', () => {
  const { s, before } = judged(3);
  assert.ok(s.fear > before.fear);
  assert.ok(s.realms.brugge.vassal.loyalty > before.brugge.loyalty);
  assert.ok(trustIn(s, world, 'redania', 'temeria') < before.trust);
});

test('the crown\'s hand: honours grant the want; more tribute costs loyalty', () => {
  let s = fresh();
  s.realms.sodden.vassal.want = { kind: 'honours', since: s.day };
  s.realms.sodden.vassal.ambition = 40;
  s = applyAction(s, world, { type: 'vassal', realm: 'sodden', kind: 'honours' }).state;
  assert.equal(s.realms.sodden.vassal.want, null);
  const loyal = s.realms.brugge.vassal.loyalty;
  s = applyAction(s, world, { type: 'vassal', realm: 'brugge', kind: 'tribute' }).state;
  assert.ok(s.realms.brugge.vassal.tributeMult > 1 && s.realms.brugge.vassal.loyalty < loyal);
  assert.ok(applyAction(s, world, { type: 'vassal', realm: 'mahakam', kind: 'tribute' }).error);
});
