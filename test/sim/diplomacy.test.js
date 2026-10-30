// Audiences with rulers (M17): rulers weigh what is laid on the table by
// their own temper and needs, say so in a word, and can name a price the
// crown can pay; treaties bind realms to one another's wars; breaking one
// costs trust everywhere; the realms make and break pacts among themselves;
// deals are carried out month by month in the ledger.
import test from 'node:test';
import assert from 'node:assert/strict';
import { nodeWorld } from '../helpers.js';
import {
  createState, step, applyAction, serialize, deserialize, weighDeal, counterOffer, canSign, itemValue, itemProblem, trustIn,
  moodReasons, moodTarget, treatyBetween, proposeDeal, parties, warReasons, canDeclareWith, ledgerNet,
} from '../../src/sim/index.js';
import { STATE_VERSION } from '../../src/sim/state.js';
import { startWar } from '../../src/sim/war.js';
import { makeTreaty, endTreaty } from '../../src/sim/diplomacy.js';
import { makeRng } from '../../src/sim/rng.js';

const world = await nodeWorld();
const act = (s, a) => applyAction(s, world, a);
const quiet = (s) => {
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  return s;
};

test('the verdict is the ruler\'s own valuation, in four words', () => {
  const s = quiet(step(createState(world, 3), 40, world));
  const tables = [
    [{ kind: 'treaty', from: 'us', treaty: 'trade' }],
    [{ kind: 'goods', from: 'them', good: 'iron', qty: 15, months: 6 }],
    [{ kind: 'goods', from: 'them', good: 'iron', qty: 15, months: 6 }, { kind: 'coin', from: 'us', amount: 60 }],
    [{ kind: 'coin', from: 'them', amount: 5000 }],
    [{ kind: 'coin', from: 'us', amount: 300 }],
    [{ kind: 'intel', from: 'them', months: 6 }],
  ];
  let seen = new Set();
  for (const pid of parties(world)) {
    for (const items of tables) {
      const w = weighDeal(s, world, pid, items);
      seen.add(w.verdict);
      // The word follows the sum of the ruler's own item values.
      const sum = items.reduce((a, i) => a + itemValue(s, world, pid, i), 0);
      assert.ok(Math.abs(w.lines.reduce((a, l) => a + l.value, 0) - sum) <= items.length, `${pid}: lines add up`);
      if (w.verdict === 'Acceptable') assert.ok(w.net >= 0 && !w.reason, `${pid}: acceptable at ${w.net}`);
      else if (!w.reason) assert.ok(w.net < 0, `${pid}: ${w.verdict} at ${w.net}`);
      // The rules sign exactly what the ruler accepts.
      const can = canSign(s, world, pid, items);
      if (!items.some((i) => itemProblem(s, world, pid, i))) assert.equal(can.ok, w.verdict === 'Acceptable', `${pid} ${JSON.stringify(items)}`);
    }
  }
  for (const word of ['Acceptable', 'Insulting']) assert.ok(seen.has(word), word);
  assert.ok(seen.has('Close') || seen.has('They want more'));
  // Asking a ruler for a fortune for nothing is an insult.
  assert.equal(weighDeal(s, world, 'redania', [{ kind: 'coin', from: 'them', amount: 5000 }]).verdict, 'Insulting');
});

test('a counter-offer is one the crown can afford and the ruler accepts', () => {
  const s = quiet(step(createState(world, 4), 40, world));
  s.treasury = 3000;
  let made = 0;
  for (const pid of parties(world)) {
    for (const items of [[{ kind: 'goods', from: 'them', good: 'iron', qty: 15, months: 6 }], [{ kind: 'intel', from: 'them', months: 6 }], [{ kind: 'treaty', from: 'us', treaty: 'nonaggression' }]]) {
      const c = counterOffer(s, world, pid, items);
      if (!c.items) {
        assert.ok(c.reason);
        continue;
      }
      made++;
      assert.equal(weighDeal(s, world, pid, c.items).verdict, 'Acceptable');
      for (const i of c.items) assert.equal(itemProblem(s, world, pid, i), null, JSON.stringify(i));
      const out = act(s, { type: 'deal', realm: pid, items: c.items });
      assert.ok(!out.error, out.error);
    }
  }
  assert.ok(made >= 10, `${made} counters`);
  // A ruler's own proposal always satisfies them.
  for (const pid of parties(world)) {
    const p = proposeDeal(s, world, pid);
    if (p) assert.equal(weighDeal(s, world, pid, p).verdict, 'Acceptable', pid);
  }
});

test('mood is a list of reasons that adds up to where the relation drifts', () => {
  const s = createState(world, 1);
  s.laws.nonhumans.option = 'charter';
  const reasons = moodReasons(s, world, 'mahakam');
  assert.ok(reasons.some((r) => /charter/i.test(r.text)));
  assert.equal(Math.round(reasons.reduce((a, r) => a + r.value, 0)), Math.round(moodTarget(s, world, 'mahakam')));
  makeTreaty(s, world, 'trade', 'temeria', 'mahakam');
  assert.ok(moodReasons(s, world, 'mahakam').some((r) => /trade pact/i.test(r.text)));
});

test('treaties trigger calls to arms; friendship alone does not', () => {
  const rng = makeRng(5);
  let s = quiet(createState(world, 5));
  // A warm friend without a treaty is not ours to defend.
  s.neighbours.aedirn.stance = 'friendly';
  s.neighbours.aedirn.relation = 95;
  startWar(s, world, rng, 'kaedwen', 'aedirn', 'test');
  assert.ok(!s.warDecisions.some((d) => d.kind === 'call'));
  // A defensive pact calls us when they are attacked.
  s = quiet(createState(world, 5));
  makeTreaty(s, world, 'defensive', 'temeria', 'cintra');
  startWar(s, world, rng, 'verden', 'cintra', 'test');
  assert.ok(s.warDecisions.some((d) => d.kind === 'call' && d.realm === 'cintra'));
  // ...but not when they attack; an alliance calls us either way.
  s = quiet(createState(world, 5));
  makeTreaty(s, world, 'defensive', 'temeria', 'cintra');
  startWar(s, world, rng, 'cintra', 'verden', 'test');
  assert.ok(!s.warDecisions.some((d) => d.kind === 'call'));
  s = quiet(createState(world, 5));
  makeTreaty(s, world, 'alliance', 'temeria', 'cintra');
  startWar(s, world, rng, 'cintra', 'verden', 'test');
  assert.ok(s.warDecisions.some((d) => d.kind === 'call' && d.realm === 'cintra'));
  // Our partners come when we are attacked, or break their word.
  let joined = 0;
  let broke = 0;
  for (let i = 0; i < 20; i++) {
    const t = quiet(createState(world, 10 + i));
    // (Cintra, unlike Mahakam, has no standing pact with Kaedwen to keep it out.)
    makeTreaty(t, world, 'defensive', 'temeria', 'cintra');
    const war = startWar(t, world, makeRng(100 + i), 'kaedwen', 'temeria', 'test');
    if (war.sides[1].includes('cintra')) joined++;
    else if (!treatyBetween(t, 'temeria', 'cintra')) broke++;
  }
  assert.ok(joined >= 12, `Cintra joined ${joined} times`);
  assert.equal(joined + broke, 20);
});

test('breaking a treaty costs trust with that ruler and with every other', () => {
  let s = quiet(createState(world, 6));
  makeTreaty(s, world, 'defensive', 'temeria', 'brugge');
  const before = Object.fromEntries(parties(world).map((p) => [p, trustIn(s, world, p, 'temeria')]));
  s = act(s, { type: 'breakTreaty', realm: 'brugge', treaty: 'defensive' }).state;
  assert.equal(treatyBetween(s, 'temeria', 'brugge'), null);
  assert.ok(trustIn(s, world, 'brugge', 'temeria') <= before.brugge - world.diplomacy.treaties.defensive.breakTrust + 1);
  for (const p of parties(world)) {
    if (p === 'brugge') continue;
    assert.ok(trustIn(s, world, p, 'temeria') < before[p], `${p} still trusts us as much`);
  }
  // Honourable rulers mind most.
  const lost = (p) => before[p] - trustIn(s, world, p, 'temeria');
  assert.ok(lost('mahakam') > lost('kerack'));
  // And low trust closes doors: the ruler names the wrong.
  s.diplomacy.trust.brugge.temeria = 10;
  const w = weighDeal(s, world, 'brugge', [{ kind: 'treaty', from: 'us', treaty: 'nonaggression' }]);
  assert.equal(w.verdict, 'Insulting');
  assert.match(w.reason, /does not trust us after we broke our defensive pact/);
  // A war without a cause costs trust everywhere.
  const t = quiet(createState(world, 6));
  t.love = 100;
  const prior = trustIn(t, world, 'cintra', 'temeria');
  assert.ok(canDeclareWith(t, world, 'kaedwen', 'none').ok);
  assert.ok(!warReasons(t, world, 'kaedwen').find((r) => r.key === 'claim').ok);
  const out = act(t, { type: 'declare', realm: 'kaedwen', reason: 'none' }).state;
  assert.ok(trustIn(out, world, 'cintra', 'temeria') < prior);
});

test('over thirty years the realms make and break pacts among themselves', () => {
  let s = createState(world, 1);
  s = step(s, 30 * 365, world, { ambient: false });
  const made = s.diplomacy.log.filter((l) => l.what === 'made' && l.a !== 'temeria' && l.b !== 'temeria');
  assert.ok(made.length + s.diplomacy.treaties.filter((t) => t.a !== 'temeria' && t.b !== 'temeria').length >= 5, `${made.length} pacts made`);
  const ended = s.diplomacy.broken.filter((b) => b.by !== 'temeria' && b.with !== 'temeria').length
    + s.diplomacy.log.filter((l) => l.what !== 'made' && l.a !== 'temeria' && l.b !== 'temeria').length;
  assert.ok(ended >= 1, 'no foreign pact ever ended');
  assert.ok(new Set(s.diplomacy.treaties.map((t) => t.kind)).size >= 1);
  for (const t of s.diplomacy.treaties) assert.ok(t.until > s.day);
});

test('deals pay and deliver month by month in the ledger, and caravans carry the goods', () => {
  let s = quiet(step(createState(world, 8), 2, world));
  s.treasury = 4000;
  const items = [
    { kind: 'goods', from: 'them', good: 'iron', qty: 15, months: 3 },
    { kind: 'monthly', from: 'us', amount: 40, months: 3 },
  ];
  const c = counterOffer(s, world, 'kaedwen', items);
  assert.ok(c.items, c.reason);
  s = act(s, { type: 'deal', realm: 'kaedwen', items: c.items }).state;
  assert.equal(s.diplomacy.deals.length, 1);
  const ironBefore = Object.values(s.settlements).reduce((a, x) => a + x.stock.iron, 0);
  s = step(s, 35, world);
  const month = s.ledger.history.at(-1);
  assert.equal(month.expenses.deals.Kaedwen, 40);
  assert.ok(month.deliveries.some((d) => d.good === 'iron' && d.qty === 15 && !d.out));
  assert.ok(ledgerNet(month).out >= 40);
  assert.ok(Object.values(s.settlements).reduce((a, x) => a + x.stock.iron, 0) > ironBefore - 200);
  // Caravans of the deal on the road.
  let caravans = 0;
  for (let i = 0; i < 20 && !caravans; i++) {
    s = step(s, 2, world);
    caravans = s.ambient.units.filter((u) => u.kind === 'deal').length;
  }
  assert.ok(caravans > 0, 'no caravans for the deal');
  // Three months on, the deal is done and honoured.
  const trust = trustIn(s, world, 'kaedwen', 'temeria');
  s = step(s, 70, world);
  assert.equal(s.diplomacy.deals.length, 0);
  assert.ok(trustIn(s, world, 'kaedwen', 'temeria') > trust - 1);
  assert.ok(s.chronicle.some((d) => /honoured in full/.test(d.text)));
});

test('a version 13 save gains audiences: friends become pacts, envoys are answered', () => {
  const s = JSON.parse(serialize(createState(world, 1)));
  s.version = 13;
  s.state.version = 13;
  delete s.state.diplomacy;
  s.state.neighbours.cintra.stance = 'friendly';
  s.state.neighbours.cintra.relation = 80;
  s.state.envoys = [{ id: 1, envoy: 'refugees', realm: 'brugge', day: s.state.day }];
  const up = deserialize(JSON.stringify(s), world);
  assert.equal(up.version, STATE_VERSION);
  assert.ok(treatyBetween(up, 'temeria', 'cintra', 'defensive'));
  assert.equal(up.envoys.length, 0);
  assert.ok(up.diplomacy.trust.cintra.temeria > 50);
  const later = step(up, 60, world);
  assert.ok(deserialize(serialize(later), world));
});

test('the steward signs treaties and trade deals', async () => {
  const { makeCrowns } = await import('../../tools/crowns.mjs');
  const crowns = makeCrowns(world);
  let s = createState(world, 2);
  for (let m = 0; m < 48; m++) {
    s = step(s, 30, world, { ambient: false });
    s = crowns.steward(s, m, false);
  }
  const ours = s.diplomacy.treaties.filter((t) => t.a === 'temeria' || t.b === 'temeria');
  const signed = s.diplomacy.log.filter((l) => l.what === 'made' && (l.a === 'temeria' || l.b === 'temeria'));
  assert.ok(signed.length >= 2, `${signed.length} treaties signed`);
  assert.ok(ours.length >= 1);
});
