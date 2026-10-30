// Money from fighting (M24 D): threat purses, raid loot, ransoms for lords
// and commanders, each its own line in the ledger and the Steward's report.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createState, step, applyAction, threatPurse, raidPreview, raidLootAt, stewardReport, witcherCost,
} from '../../src/sim/index.js';
import { destroyThreat } from '../../src/sim/threats.js';
import { collectRansoms } from '../../src/sim/economy.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();
const run = (s, days) => step(s, days, world, { ambient: false });
const quiet = (s) => {
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  return s;
};
const camp = (s) => s.threats.list.find((t) => t.kind === 'bandits' && !t.abroad);

test('a bandit camp\'s purse is its hoard and the burghers\' bounty, paid when it is broken', () => {
  const s = quiet(run(createState(world, 1), 200));
  const t = camp(s);
  assert.ok(t, 'a camp to break');
  const p = threatPurse(s, world, t);
  assert.deepEqual(p.parts.map((x) => x.key), ['hoard', 'bounty']);
  assert.ok(p.total > 100, `purse ${p.total}`);
  assert.equal(p.fee, 0);
  const before = s.treasury;
  destroyThreat(s, world, t);
  assert.equal(Math.round(s.treasury - before), p.total);
  assert.equal(s.ledger.windfalls.purses, p.total);
});

test('beasts pay a reward and trophies; a witcher\'s fee comes off; Scoia\'tael pay only under bounties', () => {
  const s = quiet(run(createState(world, 1), 200));
  const beast = s.threats.list.find((t) => t.kind === 'monsters' && !t.abroad);
  const p = threatPurse(s, world, beast);
  assert.deepEqual(p.parts.map((x) => x.key), ['reward', 'trophies']);
  assert.equal(p.fee, witcherCost(s, world, beast));
  assert.equal(p.net, p.total - p.fee);
  // A big beast is worth the witcher; the trophies grow with its strength.
  const big = { ...beast, count: beast.count * 20 };
  assert.ok(threatPurse(s, world, big).net > p.net);
  const elves = { kind: 'scoiatael', men: 30, near: beast.near };
  assert.equal(threatPurse(s, world, elves).total, 0, 'no bounty without the law');
  s.laws.bounties = { ...s.laws.bounties, option: 'witchers', previous: 'witchers' };
  assert.equal(threatPurse(s, world, elves).total, 30 * world.forces.purses.scoiatael.bountyPerMan);
  // Nothing from what lies abroad.
  assert.equal(threatPurse(s, world, { ...beast, abroad: 'redania' }).total, 0);
});

test('a raid carries off plunder, caravans and herds; the raided remember it and the North fears us', () => {
  const s = quiet(createState(world, 2));
  const town = world.foreign.find((g) => g.type === 'town' && g.realm === 'redania');
  const village = world.foreign.find((g) => g.type === 'village' && g.realm === 'redania');
  const r = world.war.raid;
  assert.ok(raidLootAt(s, world, town.id) > r.caravans.town * 0.5, 'a town\'s caravans');
  assert.ok(raidLootAt(s, world, village.id) > r.herds.village * 0.5, 'a village\'s herds');
  const preview = raidPreview(s, world, 'redania');
  assert.equal(preview.places, r.count);
  assert.ok(preview.loot > 1000, `a raid on Redania, about ${preview.loot}`);
});

test('lords taken in a beaten army are ransomed by their realm a month on', () => {
  const s = quiet(createState(world, 3));
  s.captives = [{ id: 1, side: 'redania', by: 'temeria', marshal: null, lord: true, day: s.day - 40, ransom: world.war.battles.ransom.lord }];
  s.realms.redania.treasury = 5000;
  const before = s.treasury;
  collectRansoms(s, world);
  assert.equal(s.captives.length, 0);
  assert.equal(s.treasury - before, world.war.battles.ransom.lord);
  assert.equal(s.ledger.windfalls.ransom, world.war.battles.ransom.lord);
  assert.ok(s.chronicle.some((d) => /ransom a lord taken in battle/.test(d.text)));
});

test('war\'s takings show on the month\'s ledger and in the Steward\'s report, line by line', () => {
  let s = quiet(run(createState(world, 1), 200));
  destroyThreat(s, world, camp(s));
  s.captives = [{ id: 1, side: 'redania', by: 'temeria', marshal: null, lord: true, day: s.day - 40, ransom: 450 }];
  s.realms.redania.treasury = 5000;
  s = run(s, 31);
  const last = s.ledger.history.at(-1);
  assert.ok(last.income.purses > 0 && last.income.ransom === 450);
  const r = stewardReport(s, world);
  assert.deepEqual(r.war.map((w) => w.key).filter((k) => ['purses', 'ransom'].includes(k)), ['purses', 'ransom']);
});

test('an army sent to raid brings its loot home, and the realm raided remembers it', () => {
  // A war with Redania, an army raised at Vizima and sent to raid.
  let s = quiet(createState(world, 4));
  s.treasury = 50000;
  let out = applyAction(s, world, { type: 'declare', realm: 'redania', reason: 'none' });
  if (out.error) out = applyAction(s, world, { type: 'declare', realm: 'redania', reason: 'claim' });
  assert.equal(out.error, undefined, out.error);
  s = out.state;
  s = applyAction(s, world, { type: 'raise', muster: 'vizima', levy: 'half', nobles: true }).state;
  s = run(s, 20);
  const a = s.armies.find((x) => x.side === 'temeria');
  s = applyAction(s, world, { type: 'army', army: a.id, order: 'raid', target: 'redania', stance: 'bold' }).state;
  let raided = 0;
  for (let i = 0; i < 12 && !raided; i++) {
    s = run(s, 10);
    raided = s.ledger.history.reduce((acc, h) => acc + (h.income.raids ?? 0), 0) + (s.ledger.windfalls?.raids ?? 0);
  }
  assert.ok(raided > 0, 'loot from the raid');
  const mem = s.diplomacy.memory.redania ?? [];
  assert.ok(mem.some((m) => /raiders burned/.test(m.text) && m.value < 0), 'Redania remembers');
});
