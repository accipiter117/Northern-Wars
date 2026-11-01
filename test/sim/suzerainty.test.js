// Becoming suzerain (M29 B): protection asked and offered, pressure with
// Fear and a gift, vassalage at the peace, the AI's great powers courting
// vassals by the same routes; one suzerain at a time; Mahakam takes
// protection only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, applyAction, suzerainOf, vassalsOf, titlesOf, pressureOdds, canPressure, canOfferProtection } from '../../src/sim/index.js';
import { monthlySuzerainty, makeVassal } from '../../src/sim/suzerainty.js';
import { startWar } from '../../src/sim/war.js';
import { signDeal } from '../../src/sim/deals.js';
import { makeRng } from '../../src/sim/rng.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();
const tuned = (patch) => {
  const z = world.diplomacy.suzerainty;
  const out = {};
  for (const [k, v] of Object.entries(z)) out[k] = typeof v === 'object' && !Array.isArray(v) ? { ...v, ...(patch[k] ?? {}) } : v;
  return { ...world, diplomacy: { ...world.diplomacy, suzerainty: out } };
};
const fresh = (seed = 1) => {
  const s = createState(world, seed);
  s.treasury = 20000;
  return s;
};

test('a threatened petty king asks the crown for protection; taken, he is our vassal', () => {
  const w = tuned({ protection: { chance: 1, dangerAbove: 0.1 } });
  const s = fresh();
  startWar(s, w, makeRng(1), 'redania', 'kerack', 'none');
  s.neighbours.kerack.relation = 90;
  monthlySuzerainty(s, w, makeRng(2));
  const ask = s.suzerainty.asks.find((a) => a.realm === 'kerack');
  assert.ok(ask, 'Kerack asks us');
  const out = applyAction(s, w, { type: 'protection', id: ask.id, choice: 0 });
  assert.equal(out.error, undefined);
  assert.equal(suzerainOf(out.state, 'kerack'), 'temeria');
  assert.ok(titlesOf(out.state, w).includes('Protector of Kerack'));
});

test('a petty king who dislikes us turns to another great power', () => {
  const w = tuned({ protection: { chance: 1, dangerAbove: 0.1 } });
  const s = fresh();
  startWar(s, w, makeRng(1), 'redania', 'kerack', 'none');
  s.neighbours.kerack.relation = -90;
  monthlySuzerainty(s, w, makeRng(2));
  const lord = suzerainOf(s, 'kerack');
  assert.ok(lord && lord !== 'temeria' && lord !== 'redania', `protected by ${lord}`);
  assert.ok(!s.suzerainty.asks.some((a) => a.realm === 'kerack'));
});

test('the crown can offer protection, and press with Fear and a gift, the odds shown first', () => {
  const s = fresh();
  assert.ok(canOfferProtection(s, world, 'verden').ok);
  assert.ok(pressureOdds(s, world, 'verden', 1500) > pressureOdds(s, world, 'verden', 0), 'a gift helps');
  s.conquest.fear.verden = { temeria: 40 };
  assert.ok(pressureOdds(s, world, 'verden', 0) > 0, 'Fear helps');
  const sure = tuned({ pressure: { base: 1, most: 1 } });
  const out = applyAction(s, sure, { type: 'pressure', realm: 'verden', gift: 500 });
  assert.equal(out.error, undefined);
  assert.equal(suzerainOf(out.state, 'verden'), 'temeria');
  assert.equal(out.state.realms.verden.vassal.loyalty, world.diplomacy.suzerainty.pressure.loyalty, 'a reluctant vassal');
  assert.equal(out.state.treasury, s.treasury - 500);
  const offered = applyAction(s, tuned({ offer: { base: 1, most: 1 } }), { type: 'offerProtection', realm: 'cidaris' });
  assert.equal(suzerainOf(offered.state, 'cidaris'), 'temeria');
});

test('a beaten petty kingdom can be made a vassal at the peace', () => {
  const s = fresh();
  startWar(s, world, makeRng(1), 'temeria', 'brugge', 'none');
  signDeal(s, world, 'brugge', [{ kind: 'peace', terms: 'vassal' }]);
  assert.equal(suzerainOf(s, 'brugge'), 'temeria');
  assert.equal(s.realms.brugge.vassal.route, 'peace');
});

test('Mahakam takes protection, never pressure or peace terms', () => {
  const s = fresh();
  assert.equal(canPressure(s, world, 'mahakam').ok, false);
  assert.equal(pressureOdds(s, world, 'mahakam', 1500), 0);
  assert.equal(makeVassal(s, world, 'mahakam', 'temeria', 'peace', 50), false);
  assert.equal(makeVassal(s, world, 'mahakam', 'temeria', 'pressure', 50), false);
  assert.equal(makeVassal(s, world, 'mahakam', 'temeria', 'protection', 50), true);
  assert.ok(titlesOf(s, world).includes('Protector of Mahakam'));
});

test('a vassal has one suzerain; the AI great powers court vassals too', () => {
  const s = fresh();
  makeVassal(s, world, 'sodden', 'redania', 'protection', 50);
  assert.deepEqual(vassalsOf(s, world, 'redania'), ['sodden']);
  makeVassal(s, world, 'sodden', 'temeria', 'protection', 50);
  assert.equal(suzerainOf(s, 'sodden'), 'temeria');
  assert.equal(vassalsOf(s, world, 'redania').length, 0);
  assert.equal(s.realms.sodden.vassal.from, 'redania');
  // Only petty kingdoms become vassals.
  assert.equal(makeVassal(s, world, 'cintra', 'temeria', 'protection', 50), false);
  const keen = tuned({ ai: { chance: 1, ratio: 1, affinity: -100, reach: 2000 } });
  const t = fresh(2);
  monthlySuzerainty(t, keen, makeRng(3));
  const held = Object.keys(t.realms).filter((r) => suzerainOf(t, r) && suzerainOf(t, r) !== 'temeria');
  assert.ok(held.length >= 2, `AI vassals: ${held.join(', ')}`);
  for (const p of ['redania', 'kaedwen', 'aedirn']) assert.ok(vassalsOf(t, world, p).length <= world.diplomacy.suzerainty.ai.most, `${p} holds no more than its share`);
  assert.ok(!held.includes('mahakam'));
});
