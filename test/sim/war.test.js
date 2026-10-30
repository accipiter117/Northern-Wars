import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, applyAction, serialize, deserialize, foreignTrade, ownerOf, warsOf, peaceTerms, visionOf, canSee } from '../../src/sim/index.js';
import { STATE_VERSION } from '../../src/sim/state.js';
import { startWar, applyPeace } from '../../src/sim/war.js';
import { makeTreaty } from '../../src/sim/diplomacy.js';
import { makeRng } from '../../src/sim/rng.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();
const run = (s, days) => step(s, days, world, { ambient: false });
const act = (s, a) => {
  const out = applyAction(s, world, a);
  assert.equal(out.error, undefined, `${a.type}: ${out.error}`);
  return out.state;
};
const quiet = (s) => {
  for (const k of ['envoys', 'petitions', 'demands', 'events']) s[k] = [];
  return s;
};

test('declaring war costs Love without a cause, closes trade, and cannot be repeated', () => {
  let s = createState(world, 1);
  const auth = s.love;
  assert.ok(foreignTrade(s, world).by.redania > 0);
  s = act(s, { type: 'declare', realm: 'redania' });
  assert.ok(s.love < auth);
  assert.equal(warsOf(s, 'temeria').length, 1);
  assert.equal(foreignTrade(s, world).by.redania, 0);
  assert.match(applyAction(s, world, { type: 'declare', realm: 'redania' }).error, /already at war/);
  assert.match(applyAction(s, world, { type: 'declare', realm: 'brokilon' }).error, /dryads/);
  // At war, relations sink and stay sunk.
  s = run(s, 60);
  assert.ok(s.neighbours.redania.relation <= -60);
});

test('raising an army takes men from the people, not the garrisons; standing it down sends them home', () => {
  let s = createState(world, 2);
  const g0 = s.settlements.vizima.garrison;
  const t0 = s.treasury;
  s = act(s, { type: 'raise', muster: 'vizima', levy: 'half', nobles: false, mercs: [], marshal: 'vestibor', stance: 'cautious' });
  const a = s.armies[0];
  // Since M21 the garrisons stay at home and the levy is a share of the people.
  assert.equal(s.settlements.vizima.garrison, g0);
  assert.equal(s.treasury, t0);
  assert.ok(a.soldiers > 1000);
  // The marshal is busy now.
  assert.match(applyAction(s, world, { type: 'raise', muster: 'maribor', levy: 'third', marshal: 'vestibor', stance: 'bold' }).error, /already leads/);
  s = run(s, 31);
  assert.ok(s.ledger.history.at(-1).expenses.armies > 0);
  s = act(s, { type: 'disband', army: a.id });
  // (A neighbour's show of force may stand on the border meanwhile.)
  assert.equal(s.armies.filter((x) => x.side === 'temeria').length, 0);
  assert.ok(s.settlements.vizima.garrison > g0 * 0.9);
});

test('an army besieges and takes a foreign town, which then pays the crown', () => {
  let s = quiet(createState(world, 3));
  s = act(s, { type: 'declare', realm: 'cidaris' });
  s = act(s, { type: 'raise', muster: 'gors_velen', levy: 'half', nobles: false, mercs: ['kovir'], marshal: 'captain', stance: 'bold' });
  const id = s.armies.find((a) => a.side === 'temeria').id;
  // The levies gather first (M21).
  s = run(s, s.armies.find((a) => a.id === id).gatherUntil - s.day);
  s = act(s, { type: 'army', army: id, order: 'siege', target: 'caelf' });
  let taken = false;
  for (let d = 0; d < 120 && !taken; d += 5) {
    s = run(s, 5);
    taken = ownerOf(s, world, 'caelf') === 'temeria';
  }
  assert.ok(taken, 'Caelf falls');
  assert.equal(s.realms.cidaris.settlements.caelf.owner, 'temeria');
  assert.ok(s.chronicle.some((c) => /Caelf has fallen to Temeria/.test(c.text)));
  const war = warsOf(s, 'temeria')[0];
  assert.ok(war.taken.some((t) => t.id === 'caelf' && t.from === 'cidaris'));
  // Its army holds it and awaits orders; the crown can now see round it.
  assert.equal(s.armies.find((a) => a.id === id).target, 'caelf');
  const p = world.byId.caelf;
  assert.ok(canSee(world, visionOf(s, world), p.x, p.y));
  s = run(s, 31);
  assert.ok(s.ledger.history.at(-1).income.conquests > 0);
});

test('an occupied Temerian town pays no taxes and is left out of the realm\'s order', () => {
  let s = createState(world, 4);
  const before = run(s, 31).ledger.history.at(-1).income.taxes;
  s.settlements.maribor.occupier = 'sodden';
  s.settlements.maribor.occupiedSince = s.day;
  s.settlements.maribor.unrest = 100;
  const after = run(s, 31);
  assert.ok(after.ledger.history.at(-1).income.taxes < before * 0.9);
  assert.ok(after.unrest < 50, 'an occupied town does not count in the realm Unrest');
  after.settlements.maribor.cond = { market: 40 };
  assert.match(applyAction(after, world, { type: 'repair', settlement: 'maribor', building: 'market', kind: 'patch' }).error, /enemy flag/);
});

test('peace: as we were hands towns back; each keeps what it holds lets them stand; a truce follows', () => {
  const rng = makeRng(9);
  let s = createState(world, 5);
  const war = startWar(s, world, rng, 'temeria', 'cidaris', 'test');
  s.realms.cidaris.settlements.caelf.owner = 'temeria';
  war.taken.push({ id: 'caelf', from: 'cidaris', to: 'temeria', day: s.day });
  const keep = structuredClone(s);
  applyPeace(s, world, s.wars[0], { towns: 'white' });
  assert.equal(ownerOf(s, world, 'caelf'), 'cidaris');
  assert.equal(s.wars.length, 0);
  assert.match(applyAction(s, world, { type: 'declare', realm: 'cidaris' }).error, /truce/);
  applyPeace(keep, world, keep.wars[0], { towns: 'keep', tribute: { from: 'cidaris', to: 'temeria', monthly: 50, until: keep.day + 720 } });
  assert.equal(ownerOf(keep, world, 'caelf'), 'temeria');
  const later = run(keep, 31);
  assert.equal(later.ledger.history.at(-1).income.tribute, 50);
  // Cidaris resents the loss of its town.
  assert.ok(later.neighbours.cidaris.relation < world.neighbours.realms.cidaris.relation);
});

test('peace terms are refused early and accepted once the enemy is beaten and tired', () => {
  const rng = makeRng(11);
  const s = createState(world, 6);
  const war = startWar(s, world, rng, 'temeria', 'kerack', 'test');
  let terms = peaceTerms(s, world, war);
  assert.ok(!terms.ready && terms.list.every((t) => !t.accept));
  s.day += 200;
  war.points[0] = 30;
  terms = peaceTerms(s, world, war);
  assert.ok(terms.list.find((t) => t.key === 'white').accept);
  const next = act(s, { type: 'peace', war: war.id, terms: 'white' });
  assert.equal(next.wars.length, 0);
});

test('a weakly held crown is warned, then invaded by a soured neighbour', () => {
  // Since M18 rulers choose their wars: a neighbour with bad blood and the
  // strength to win gathers an army, the crown hears the drums, then war.
  let invaded = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    let s = quiet(createState(world, seed));
    s.diplomacy.treaties = s.diplomacy.treaties.filter((t) => !(t.a === 'temeria' || t.b === 'temeria'));
    for (let m = 0; m < 48; m++) {
      s.neighbours.redania.relation = Math.min(s.neighbours.redania.relation, -70);
      // A weak crown: neither loved nor feared, restless towns (M24 B).
      s.love = 5;
      s.fear = 5;
      for (const x of Object.values(s.settlements)) { x.garrison = Math.min(x.garrison, 30); x.unrest = Math.max(x.unrest, 45); }
      s = run(s, 30);
      s.warDecisions = s.warDecisions.filter((d) => d.kind !== 'offer');
      if (s.wars.some((w) => w.sides[0][0] === 'redania' && w.sides[1][0] === 'temeria')) {
        assert.ok(s.chronicle.some((c) => /War drums in Redania/.test(c.text)), 'warning came first');
        invaded++;
        break;
      }
    }
  }
  assert.ok(invaded >= 3, `invaded in ${invaded} of 5 reigns`);
});

test('an ally attacked calls on the crown; answering puts Temeria at its side', () => {
  const rng = makeRng(13);
  let s = createState(world, 7);
  // Since M17 calls to arms follow treaties, not friendship alone.
  makeTreaty(s, world, 'defensive', 'temeria', 'aedirn');
  const war = startWar(s, world, rng, 'kaedwen', 'aedirn', 'test');
  const call = s.warDecisions.find((d) => d.kind === 'call');
  assert.ok(call);
  s = act(s, { type: 'warDecision', id: call.id, choice: 0 });
  assert.ok(s.wars.find((w) => w.id === war.id).sides[1].includes('temeria'));
  assert.ok(s.neighbours.kaedwen.relation <= world.war.atWarRelation);
});

test('left alone for thirty years, the neighbours fight each other and towns change hands', () => {
  let s = createState(world, 1);
  s = run(s, 30 * 365);
  assert.ok(s.warHistory.length >= 2, `${s.warHistory.length} wars`);
  for (const a of s.armies) {
    assert.ok(Number.isFinite(a.soldiers) && a.soldiers > 0);
    assert.ok(world.byId[a.at]);
  }
  for (const realm of Object.values(s.realms)) {
    assert.ok(Number.isFinite(realm.treasury));
    for (const t of Object.values(realm.settlements)) assert.ok(t.garrison >= 0 && Number.isFinite(t.garrison));
  }
});

test('a version 8 save gains the means of war', () => {
  const s = createState(world, 8);
  for (const k of ['wars', 'armies', 'musters', 'battles', 'truces', 'tributes', 'warDecisions', 'warHistory', 'nextWarId', 'nextArmyId', 'nextWarDecisionId']) delete s[k];
  s.version = 8;
  const loaded = deserialize(JSON.stringify({ format: 'northern-wars-save', version: 8, state: s }), world);
  assert.equal(loaded.version, STATE_VERSION);
  assert.deepEqual(loaded.armies, []);
  const later = run(loaded, 60);
  assert.ok(later.day > loaded.day);
  assert.ok(deserialize(serialize(later), world));
});
