// The Dawn of the Reign (M33 A): five places run down, each with quest
// chains that finish by the game's own systems, a place in order back to
// full prosperity, and older saves skipping the Dawn.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize, applyAction } from '../../src/sim/index.js';
import { STATE_VERSION } from '../../src/sim/state.js';
import { stepDawnDay, dawnView, dawnNext } from '../../src/sim/dawn.js';
import { resolveDilemma, dilemmasOf } from '../../src/sim/dilemmas.js';
import { nodeWorld, signLaws } from '../helpers.js';

const world = await nodeWorld();
const fresh = () => createState(world, 1);
const days = (s, n) => { for (let i = 0; i < n; i++) { s.day += 1; stepDawnDay(s, world); } };
const chain = (s, place, cid) => s.dawn.places[place].chains[cid];

test('a new reign begins in the Dawn: five places run down, every chain under way', () => {
  const s = fresh();
  const v = dawnView(s, world);
  assert.equal(v.places.length, 5);
  assert.equal(v.finished, 0);
  for (const id of ['vizima', 'maribor', 'gors_velen', 'ellander', 'white_bridge']) {
    assert.equal(s.settlements[id].prosperity, world.settlementData[id].prosperity - world.dawn.startDrop, id);
  }
  const quest = s.threats.list.filter((t) => t.quest);
  assert.equal(quest.length, 3, 'the drowners and two bandit bands');
  assert.ok(quest.every((t) => t.sighted));
  assert.ok(quest.every((t) => (t.men ?? 0) <= 14 && (t.count ?? 0) <= 3), 'small and safe');
  assert.equal(s.dilemmas?.open?.length ?? 0, 0, 'the court is quiet on the first day');
  assert.equal(dawnNext(s, world).place, 'vizima');
});

test('the repair, threat and labour quests', () => {
  const s = fresh();
  s.treasury = 20000;
  // The masons can be sent; while they work it is not done.
  const r = applyAction(s, world, { type: 'repair', settlement: 'vizima', building: 'quarter', kind: 'rebuild' });
  assert.ok(!r.error, r.error);
  const t = r.state;
  t.day += 1;
  stepDawnDay(t, world);
  assert.equal(chain(t, 'vizima', 'manor').done, null);
  // Mended.
  s.settlements.vizima.cond.quarter = 100;
  days(s, 1);
  assert.notEqual(chain(s, 'vizima', 'manor').done, null);
  // The drowners, then the boats.
  const id = chain(s, 'vizima', 'marsh').threat;
  s.threats.list = s.threats.list.filter((t) => t.id !== id);
  days(s, 1);
  assert.equal(chain(s, 'vizima', 'marsh').step, 1);
  s.settlements.vizima.staff = { ...(s.settlements.vizima.staff ?? {}), harbour: 100 };
  s.settlements.vizima.cond = { ...(s.settlements.vizima.cond ?? {}), harbour: 100 };
  days(s, 1);
  assert.notEqual(chain(s, 'vizima', 'marsh').done, null);
});

test('the calm quest needs a month of calm, unbroken', () => {
  const s = fresh();
  const v = s.settlements.vizima;
  v.tension = 20;
  days(s, 20);
  v.tension = 40;
  days(s, 1);
  v.tension = 20;
  days(s, 20);
  assert.equal(chain(s, 'vizima', 'temple').done, null, 'the month starts again');
  days(s, 11);
  assert.notEqual(chain(s, 'vizima', 'temple').done, null);
});

test('trade, law, faith, a company and the garrison', () => {
  const s = fresh();
  s.market.deals.mahakam = { sell: null, buy: { good: 'iron', qty: 20 }, since: s.day };
  signLaws(s, world, 'commons_charter');
  ((s.faiths.endowed ??= {}).ellander ??= {}).melitele = s.day + 1;
  s.forces.companies.push({ id: 999, type: 'militia', station: 'ellander', men: 150, order: { kind: 'station' } });
  s.settlements.white_bridge.garrison = 320;
  days(s, 1);
  for (const [p, c] of [['maribor', 'mahakam'], ['gors_velen', 'charter'], ['ellander', 'temple'], ['ellander', 'pilgrims'], ['white_bridge', 'crossing']]) assert.notEqual(chain(s, p, c).done, null, `${p} ${c}`);
});

test('the court quests come one by one, and an answer finishes each', () => {
  const s = fresh();
  days(s, 21);
  const open = dilemmasOf(s).open.filter((o) => o.dilemma?.startsWith('dawn_'));
  assert.deepEqual(open.map((o) => o.dilemma), ['dawn_mint']);
  assert.equal(open[0].place, 'maribor');
  assert.ok(resolveDilemma(s, world, open[0].id, 2));
  days(s, 1);
  assert.notEqual(chain(s, 'maribor', 'mint').done, null);
  days(s, 30);
  assert.ok(dilemmasOf(s).open.some((o) => o.dilemma === 'dawn_thanedd'));
});

test('a place in order returns to full prosperity; all five end the Dawn', () => {
  const s = fresh();
  for (const [id, p] of Object.entries(s.dawn.places)) {
    for (const [cid, c] of Object.entries(p.chains)) {
      if (id === 'white_bridge' && cid === 'bridge') continue;
      c.done = s.day;
    }
  }
  const t = s.settlements.white_bridge;
  t.cond = { ...(t.cond ?? {}), tollbridge: 100 };
  delete t.repair;
  const treasury = s.treasury;
  days(s, 1);
  assert.ok(s.treasury > treasury, 'the bridge chain pays');
  assert.ok(t.prosperity >= Math.min(world.dawn.fullCap, world.settlementData.white_bridge.prosperity + world.dawn.fullBonus));
  assert.notEqual(s.dawn.done, null);
  assert.ok(s.chronicle.some((c) => /The Dawn of the reign is over/.test(c.text)));
  assert.equal(dawnNext(s, world), null);
});

test('a reign from before the Dawn skips it', () => {
  const s = fresh();
  const old = JSON.parse(serialize(s));
  old.version = 37;
  old.state.version = 37;
  delete old.state.dawn;
  const up = deserialize(JSON.stringify(old), world);
  assert.equal(up.version, STATE_VERSION);
  assert.ok(up.dawn.skipped && up.dawn.done !== null);
  assert.equal(dawnNext(up, world), null);
  assert.ok(dawnView(up, world).places.every((p) => p.done));
});
