// The tiers of the North (M29 A): every realm has its tier; petty kings keep
// their distance from a great king, sending short requests instead of
// envoys unless relations are warm or the offer very good; middle and petty
// crowns rarely take on a great power alone; the crown's style grows with
// each title.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, applyAction, tierOf, crownStyle, titlesOf, appetiteAgainst, dilemmaText } from '../../src/sim/index.js';
import { monthlyRequests } from '../../src/sim/audiences.js';
import { makeRng } from '../../src/sim/rng.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();

test('every realm has its tier', () => {
  const want = { temeria: 'great', redania: 'great', kaedwen: 'great', aedirn: 'great', cintra: 'middle', sodden: 'petty', brugge: 'petty', verden: 'petty', cidaris: 'petty', kerack: 'petty', mahakam: 'petty', brokilon: 'none' };
  for (const [rid, t] of Object.entries(want)) assert.equal(tierOf(world, rid), t, rid);
  assert.equal(world.realms.realms.mahakam.protectorateOnly, true);
});

// Many months of requests from a court, all cooldowns cleared each month.
function requests(relation, opts = {}) {
  const w = opts.big ? { ...world, diplomacy: { ...world.diplomacy, tiers: { ...world.diplomacy.tiers, bigOffer: Infinity } } } : world;
  const s = createState(w, 3);
  const rng = makeRng(9);
  let audiences = 0;
  for (let m = 0; m < 80; m++) {
    for (const pid of Object.keys(s.neighbours)) s.neighbours[pid].relation = pid === 'kerack' ? relation : -100;
    s.diplomacy.requests = [];
    s.diplomacy.cooldowns = {};
    monthlyRequests(s, w, rng);
    audiences += s.diplomacy.requests.filter((q) => q.realm === 'kerack').length;
  }
  return { audiences, open: (s.dilemmas?.open ?? []).filter((o) => o.realm === 'kerack'), s, w };
}

test('a petty king sends short requests, not envoys, unless relations are warm', () => {
  const cold = requests(10, { big: true });
  assert.equal(cold.audiences, 0, 'no audiences while relations are cool');
  assert.ok(cold.open.length >= 1, 'a short request instead');
  const t = dilemmaText(cold.s, cold.w, cold.open[0]);
  assert.match(t.kicker, /A request from Kerack/);
  assert.ok(t.choices.length >= 2 && t.choices.every((c) => c.hint));
  const warm = requests(60, { big: true });
  assert.ok(warm.audiences > 0, 'warm relations bring an envoy');
});

test('answering a petty request moves relations with that court', () => {
  const { s, w, open } = requests(10, { big: true });
  const before = s.neighbours.kerack.relation;
  const o = open[0];
  const def = w.dilemmas.realmRequests[o.realmRequest];
  const best = def.choices.reduce((bi, c, i) => ((c.fx.relation ?? 0) > (def.choices[bi].fx.relation ?? 0) ? i : bi), 0);
  s.treasury = 10000;
  const out = applyAction(s, w, { type: 'dilemma', id: o.id, choice: best });
  assert.equal(out.error, undefined);
  assert.ok(out.state.neighbours.kerack.relation > before);
});

test('middle and petty crowns rarely take on a great power alone', () => {
  assert.ok(appetiteAgainst(world, 'cintra', 'temeria') < 0.5);
  assert.ok(appetiteAgainst(world, 'kerack', 'temeria') < appetiteAgainst(world, 'cintra', 'temeria'));
  assert.equal(appetiteAgainst(world, 'redania', 'temeria'), 1);
  assert.equal(appetiteAgainst(world, 'cintra', 'brugge'), 1);
});

test('the crown\'s style grows with each title won', () => {
  const s = createState(world, 1);
  assert.equal(crownStyle(s, world), 'Foltest, King of Temeria');
  s.realms.sodden.suzerain = 'temeria';
  s.realms.brugge.suzerain = 'temeria';
  assert.deepEqual(titlesOf(s, world).sort(), ['Prince of Sodden', 'Protector of Brugge']);
  assert.equal(crownStyle(s, world), 'Foltest, King of Temeria, Prince of Sodden, Protector of Brugge');
});
