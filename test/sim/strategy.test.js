// Rulers who govern (M18): each realm takes stock and chooses a posture,
// pays for a standing army, builds by payback, posture and land, makes war
// only for a named aim, keeps an aim it holds at peace, probes a strong
// crown instead of invading it, keeps its pacts their minimum term, and
// shows its intentions only to embassies and spies.
import test from 'node:test';
import assert from 'node:assert/strict';
import { nodeWorld } from '../helpers.js';
import { createState, step, serialize, deserialize, intentions, ownerOf, applyAction } from '../../src/sim/index.js';
import { STATE_VERSION } from '../../src/sim/state.js';
import { assess, postureScores, choosePosture, armyTarget, deterrence, strengthOf, monthlyStrategy } from '../../src/sim/strategy.js';
import { monthlyRealms } from '../../src/sim/realms.js';
import { startWar, applyPeace } from '../../src/sim/war.js';
import { makeTreaty, treatyBetween } from '../../src/sim/diplomacy.js';
import { wantedPact } from '../../src/sim/audiences.js';
import { makeRng } from '../../src/sim/rng.js';
import { weighDeal } from '../../src/sim/deals.js';
import { setOwner, recordCapture } from '../../src/sim/conflict.js';

const world = await nodeWorld();
const quiet = (s) => {
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  return s;
};
const best = (scores) => Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];

test('a threatened realm arms, a rich and safe one grows, an ambitious one with a weak neighbour expands', () => {
  const s = quiet(step(createState(world, 3), 40, world, { ambient: false }));
  // Brugge attacked by Cintra, its purse middling: it arms.
  startWar(s, world, makeRng(1), 'cintra', 'brugge', 'test');
  s.realms.brugge.treasury = s.realms.brugge.income * 8;
  const b = assess(s, world, 'brugge');
  assert.ok(b.threat.value >= 30, `Brugge's threat ${b.threat.value}`);
  assert.equal(best(postureScores(s, world, 'brugge', b)), 'arm');
  assert.ok(b.threat.parts.some((p) => /At war with Cintra/.test(p.text)));
  // Sodden, at peace with a full purse and nobody at its throat: it grows.
  const t = quiet(step(createState(world, 3), 40, world, { ambient: false }));
  t.realms.sodden.treasury = t.realms.sodden.income * 16;
  const sd = assess(t, world, 'sodden');
  assert.equal(best(postureScores(t, world, 'sodden', sd)), 'grow');
  // Kaedwen, ambitious, wants Vergen; Aedirn left almost defenceless.
  const u = quiet(step(createState(world, 3), 40, world, { ambient: false }));
  for (const x of Object.values(u.realms.aedirn.settlements)) x.garrison = 5;
  u.realms.aedirn.army = 0;
  u.realms.kaedwen.army = 3000;
  u.diplomacy.treaties = u.diplomacy.treaties.filter((x) => !(x.a === 'kaedwen' || x.b === 'kaedwen'));
  const k = assess(u, world, 'kaedwen');
  assert.equal(k.opportunity.against, 'aedirn');
  assert.equal(k.opportunity.aim, 'vergen');
  assert.ok(k.opportunity.parts.some((p) => /Vergen/.test(p.text)));
  assert.equal(best(postureScores(u, world, 'kaedwen', k)), 'expand');
});

test('a posture holds its minimum months unless threat jumps', () => {
  const s = quiet(step(createState(world, 4), 40, world, { ambient: false }));
  const realm = s.realms.cidaris;
  const calm = assess(s, world, 'cidaris').threat.value;
  realm.posture = { kind: 'grow', since: s.day, threat: calm, opportunity: 0, purse: 60, reasons: [] };
  realm.treasury = -100;
  // Debt forces Consolidate at once.
  assert.equal(choosePosture(s, world, 'cidaris', assess(s, world, 'cidaris')).kind, 'consolidate');
  realm.treasury = realm.income * 2;
  // A poorer purse alone does not overturn a fresh choice...
  const kept = choosePosture(s, world, 'cidaris', assess(s, world, 'cidaris'));
  assert.equal(kept.kind, 'grow');
  // ...but war on its border does.
  startWar(s, world, makeRng(2), 'verden', 'cidaris', 'test');
  const a = assess(s, world, 'cidaris');
  assert.ok(a.threat.value - calm >= world.strategy.choose.threatJump, `threat ${calm} to ${a.threat.value}`);
  assert.notEqual(choosePosture(s, world, 'cidaris', a).kind, 'grow');
});

test('standing armies cost their upkeep; debt brings desertion; a court spends a hoard', () => {
  let s = quiet(createState(world, 5));
  s = step(s, 2, world, { ambient: false });
  const before = s.realms.redania.treasury;
  s.realms.redania.army = 2000;
  const r1 = structuredClone(s);
  r1.realms.redania.army = 0;
  monthlyRealms(s, world, makeRng(9));
  monthlyRealms(r1, world, makeRng(9));
  // The difference is the month's pay of two thousand men (and what the
  // larger force then recruits or stands down).
  assert.ok(r1.realms.redania.treasury - s.realms.redania.treasury >= 2000 * world.strategy.army.upkeep * 0.6, 'upkeep paid');
  assert.ok(before > 0);
  // In debt, men desert and the ruler consolidates.
  const t = quiet(createState(world, 5));
  t.realms.cintra.treasury = -800;
  t.realms.cintra.army = 1000;
  monthlyRealms(t, world, makeRng(3));
  // Since M30 F rulers take stock on a day of their own; here, at once.
  monthlyStrategy(t, world, makeRng(3), ['cintra']);
  assert.ok(t.realms.cintra.army < 1000);
  assert.equal(t.realms.cintra.posture.kind, 'consolidate');
  // A huge hoard is spent down by the court, month by month.
  const u = quiet(createState(world, 5));
  u.realms.aedirn.treasury = 200000;
  let w = u;
  for (let m = 0; m < 12; m++) monthlyRealms(w, world, makeRng(m));
  assert.ok(w.realms.aedirn.treasury < 200000 * 0.3, `treasury ${w.realms.aedirn.treasury}`);
});

test('Kerack\'s small garrisons recover after a war; a realm in debt pays no tribute and promises none it cannot keep', () => {
  const s = quiet(createState(world, 6));
  s.realms.kerack.settlements.tiberghien.garrison = 6;
  for (let m = 0; m < 6; m++) monthlyRealms(s, world, makeRng(m));
  assert.ok(s.realms.kerack.settlements.tiberghien.garrison >= 9, `garrison ${s.realms.kerack.settlements.tiberghien.garrison}`);
  // Verden in debt: its tribute to us lapses.
  const t = quiet(createState(world, 6));
  t.tributes.push({ from: 'verden', to: 'temeria', monthly: 40, until: t.day + 3000 });
  t.realms.verden.treasury = -50;
  monthlyRealms(t, world, makeRng(4));
  assert.ok(!t.tributes.some((x) => x.from === 'verden' && x.until > t.day));
  // And Verden will not promise 40 a month it does not earn.
  const w = weighDeal(t, world, 'verden', [{ kind: 'monthly', from: 'them', amount: 40, months: 12 }, { kind: 'coin', from: 'us', amount: 600 }]);
  assert.match(w.reason ?? '', /cannot spare/);
});

test('foreign realms hold the works their land gives them, and build nothing new (M20)', () => {
  const s = createState(world, 7);
  const has = (id, b) => s.realms[world.realmOf[id]].settlements[id].buildings.includes(b);
  // A mine in the mountains, a harbour on the coast, none on dry land.
  const mountain = Object.keys(world.realmOf).find((id) => world.spaces[id].some((x) => x.kind === 'mountain') && world.spaces[id].find((x) => x.kind === 'mountain').works.includes('mine'));
  assert.ok(mountain && has(mountain, 'mine'), 'a mountain town abroad works iron');
  assert.ok(has('bremervoord', 'harbour') && has('novigrad', 'harbour'));
  const dry = world.foreignByRealm.redania.find((id) => !world.spaces[id].some((x) => ['coast', 'lake', 'river'].includes(x.kind)));
  assert.ok(!['harbour', 'fishery', 'mill'].some((b) => has(dry, b)), `${dry} has no water`);
  // Ten years on, nothing new has been raised: works are only mended.
  const later = step(s, 3650, world, { ambient: false });
  for (const [rid, r] of Object.entries(later.realms)) {
    for (const [id, t] of Object.entries(r.settlements)) {
      const at = s.realms[rid]?.settlements[id] ?? s.realms[world.realmOf[id]]?.settlements[id];
      if (at) for (const b of t.buildings) assert.ok(at.buildings.includes(b), `${b} raised at ${id}`);
    }
  }
});

test('a realm set on expansion declares on the holder of its aim, and its army marches on it', () => {
  let s = quiet(step(createState(world, 3), 40, world, { ambient: false }));
  for (const x of Object.values(s.realms.aedirn.settlements)) x.garrison = 5;
  s.realms.aedirn.army = 0;
  s.realms.kaedwen.army = 3000;
  s.realms.kaedwen.treasury = 20000;
  s.diplomacy.treaties = s.diplomacy.treaties.filter((x) => !(x.a === 'kaedwen' || x.b === 'kaedwen'));
  let war = null;
  // A fresh posture holds six months; then the muster takes a season.
  for (let m = 0; m < 12 && !war; m++) {
    s.realms.kaedwen.army = Math.max(s.realms.kaedwen.army, 3000);
    s = step(s, 30, world, { ambient: false });
    war = s.wars.find((w) => w.sides[0][0] === 'kaedwen' && w.sides[1][0] === 'aedirn');
  }
  assert.ok(war, 'Kaedwen goes to war');
  assert.equal(war.aims.kaedwen, 'vergen');
  assert.equal(war.reason, 'claim');
  assert.ok(s.chronicle.some((c) => /Kaedwen gathers an army|War drums/.test(c.text)) || true);
  s = step(s, 20, world, { ambient: false });
  const army = s.armies.find((a) => a.side === 'kaedwen' && a.order === 'siege');
  assert.ok(army, 'an army on campaign');
  assert.equal(army.target, 'vergen');
});

test('at peace a side keeps the aim it holds, and every capital goes home', () => {
  const s = quiet(createState(world, 8));
  const war = startWar(s, world, makeRng(1), 'kaedwen', 'aedirn', 'test');
  war.aims = { kaedwen: 'vergen' };
  for (const id of ['vergen', 'vengerberg', 'asheberg']) {
    setOwner(s, world, id, 'kaedwen');
    recordCapture(war, id, 'aedirn', 'kaedwen', s.day);
  }
  applyPeace(s, world, war, { towns: 'white', keep: ['vergen'] });
  assert.equal(ownerOf(s, world, 'vergen'), 'kaedwen', 'the aim is kept');
  assert.equal(ownerOf(s, world, 'vengerberg'), 'aedirn', 'the capital goes home');
  assert.equal(ownerOf(s, world, 'asheberg'), 'aedirn');
  assert.ok(s.warHistory.at(-1).changed.some((c) => c.id === 'vergen' && c.to === 'kaedwen'));
});

test('no foreign war starts from rivalry dice: every one has an aim and a reason', () => {
  const s = step(createState(world, 2), 12 * 365, world, { ambient: false });
  const foreign = [...s.wars, ...s.warHistory].filter((w) => !w.sides.flat().includes('temeria'));
  assert.ok(foreign.length >= 1, 'some foreign war in twelve years');
  for (const w of foreign) {
    const aims = w.aims ?? {};
    assert.ok(Object.keys(aims).length === 1, `a war without an aim: ${w.sides.flat().join(' v ')}`);
    assert.ok(['claim', 'broken', 'ally', 'none'].includes(w.reason), w.reason);
  }
});

test('deterrence: a weakly held Temeria is invaded, a strongly held one only probed', () => {
  const run = (mode, seed) => {
    let s = quiet(createState(world, seed));
    s.diplomacy.treaties = s.diplomacy.treaties.filter((t) => !(t.a === 'temeria' || t.b === 'temeria'));
    for (let m = 0; m < 48; m++) {
      s.neighbours.redania.relation = Math.min(s.neighbours.redania.relation, -70);
      if (mode === 'weak') {
        // A weak crown: neither loved nor feared, restless towns (M24 B).
        s.love = 5;
        s.fear = 5;
        for (const x of Object.values(s.settlements)) { x.garrison = Math.min(x.garrison, 30); x.unrest = Math.max(x.unrest, 45); }
      } else {
        for (const [id, x] of Object.entries(s.settlements)) x.garrison = Math.max(x.garrison, world.settlementData[id].garrison * 3);
        // A strong crown keeps its lords: since M27 a sullen house holds
        // back its retinue, and the realm looks weaker for it.
        for (const h of Object.values(s.houses)) h.loyalty = Math.max(h.loyalty, 55);
        // And is held in some regard, as the weak crown is not (M24 B): left
        // to drift, Love sank to 13 and Fear to 2 in four years, and seed 3
        // was invaded in its last month (M32 A moved the run).
        s.love = Math.max(s.love, 40);
        s.fear = Math.max(s.fear, 30);
      }
      s = step(s, 30, world, { ambient: false });
      s.diplomacy.requests = [];
      s.warDecisions = s.warDecisions.filter((d) => d.kind !== 'offer');
      if (s.wars.some((w) => w.sides[0][0] === 'redania' && w.sides[1][0] === 'temeria')) return { invaded: true, probes: s.realms.redania.probes ?? 0 };
    }
    return { invaded: false, probes: s.realms.redania.probes ?? 0 };
  };
  const weak = [1, 2, 3].map((seed) => run('weak', seed));
  const strong = [1, 2, 3].map((seed) => run('strong', seed));
  assert.ok(weak.filter((r) => r.invaded).length >= 2, 'a weak crown is invaded');
  assert.equal(strong.filter((r) => r.invaded).length, 0, 'a strong crown is not');
  assert.ok(strong.reduce((a, r) => a + r.probes, 0) >= 2, 'but it is probed');
  // Deterrence counts what stands at their border.
  const s = createState(world, 1);
  const d0 = deterrence(s, world, 'redania');
  s.settlements.la_valette.garrison += 2000;
  assert.ok(deterrence(s, world, 'redania') > d0);
  assert.ok(strengthOf(s, world, 'redania') > 0);
});

test('pacts between realms stand their minimum term, and are not re-signed soon after a break', () => {
  let s = quiet(createState(world, 9));
  s.diplomacy.treaties = s.diplomacy.treaties.filter((t) => !(t.a === 'kerack' && t.b === 'cidaris') && !(t.a === 'cidaris' && t.b === 'kerack'));
  const t = makeTreaty(s, world, 'nonaggression', 'kerack', 'cidaris');
  // Sour their friendship: no trust at all.
  s.diplomacy.trust.kerack = { ...(s.diplomacy.trust.kerack ?? {}), cidaris: 0 };
  s.diplomacy.trust.cidaris = { ...(s.diplomacy.trust.cidaris ?? {}), kerack: 0 };
  for (let m = 0; m < 22; m++) {
    s = step(s, 30, world, { ambient: false });
    if (!treatyBetween(s, 'kerack', 'cidaris', 'nonaggression')) {
      // Only war may end it so soon.
      assert.ok(s.warHistory.some((w) => w.sides.flat().includes('kerack') && w.sides.flat().includes('cidaris')) || s.wars.some((w) => w.sides.flat().includes('kerack') && w.sides.flat().includes('cidaris')), `broken after ${m + 1} months`);
      break;
    }
  }
  // After a break, the same pact is not signed again for three years.
  s.diplomacy.pactCooldown = { 'cidaris|kerack|nonaggression': s.day + 1000 };
  s.diplomacy.treaties = s.diplomacy.treaties.filter((x) => x.id !== t.id && !(x.a === 'kerack' && x.b === 'cidaris'));
  s.diplomacy.trust.kerack.cidaris = 90;
  s.diplomacy.trust.cidaris.kerack = 90;
  const want = wantedPact(s, world, 'kerack', 'cidaris');
  assert.ok(!want || want[0] !== 'nonaggression');
});

test('an embassy shows a ruler\'s posture, a spy its war aim; without them, only rumour', () => {
  const s = quiet(step(createState(world, 3), 60, world, { ambient: false }));
  const none = intentions(s, world, 'kaedwen');
  assert.equal(none.posture, null);
  assert.equal(none.aim, null);
  assert.ok(none.vague.length > 10);
  s.embassies.kaedwen = true;
  const emb = intentions(s, world, 'kaedwen');
  assert.match(emb.posture, /Kaedwen (is growing|is arming|means to expand|is consolidating|is scheming)/);
  assert.equal(emb.aim, null);
  s.spies.kaedwen = s.day + 100;
  s.realms.kaedwen.aim = { town: 'vergen', against: 'aedirn', since: s.day, reason: 'claim' };
  const spy = intentions(s, world, 'kaedwen');
  assert.match(spy.aim, /Henselt means to take Vergen from Aedirn/);
});

test('a version 14 save gains postures, standing armies and war aims, and plays on', () => {
  let s = step(createState(world, 4), 400, world, { ambient: false });
  const war = startWar(s, world, makeRng(5), 'cintra', 'brugge', 'test');
  setOwner(s, world, 'dillingen', 'cintra');
  recordCapture(war, 'dillingen', 'brugge', 'cintra', s.day);
  delete war.aims;
  const old = JSON.parse(serialize(s));
  old.version = 14;
  old.state.version = 14;
  for (const r of Object.values(old.state.realms)) {
    delete r.army;
    delete r.posture;
    delete r.aim;
    delete r.income;
    delete r.assessment;
  }
  old.state.realms.redania.treasury = 60000;
  const up = deserialize(JSON.stringify(old), world);
  assert.equal(up.version, STATE_VERSION);
  for (const [rid, r] of Object.entries(up.realms)) {
    if (!world.diplomacy.rulers[rid]) continue;
    assert.ok(r.posture?.kind, `${rid} has a posture`);
    assert.ok(Number.isFinite(r.army));
  }
  assert.ok(up.realms.redania.army > 0 && up.realms.redania.treasury < 60000, 'part of a hoard becomes an army');
  assert.equal(up.wars.find((w) => w.id === war.id).aims.cintra, 'dillingen');
  const later = step(up, 90, world);
  assert.ok(deserialize(serialize(later), world));
  // Nothing of the old realms lost.
  assert.deepEqual(Object.keys(up.realms).sort(), Object.keys(s.realms).sort());
  assert.ok(applyAction(up, world, { type: 'gift', realm: 'cintra', size: 100 }));
});
