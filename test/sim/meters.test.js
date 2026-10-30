// Love, Fear, Authority and Unrest (M24 B): each meter moves with its
// causes and says why; Authority follows its formula; a feared but unloved
// crown still collects its taxes and levies; Fear fades and collapses as
// stated; Unrest below 50 costs nothing; the crown's own acts; nothing
// reads Trust, Dread or the old Standing; deposition; the v25 save.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createState, step, serialize, deserialize, nudge, realmUnrest, unrestPressures, applyAction } from '../../src/sim/index.js';
import { monthlyMeters, authority, taxCollected, musterAnswer, canRiot, sabotage, fearCollapse } from '../../src/sim/meters.js';
import { resolvePetition } from '../../src/sim/petitions.js';
import { STATE_VERSION } from '../../src/sim/state.js';
import { ROOT, nodeWorld } from '../helpers.js';

const world = await nodeWorld();
const fresh = (seed = 1) => {
  const s = createState(world, seed);
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  return s;
};
const clone = (s) => structuredClone(s);
const month = (s, set = () => {}) => {
  const t = clone(s);
  set(t);
  monthlyMeters(t, world, null);
  return t;
};
const why = (s, meter) => s.meters.reasons[meter].map((r) => r.why);
const act = (s, a) => {
  const out = applyAction(s, world, a);
  assert.equal(out.error, undefined, `${a.type}: ${out.error}`);
  return out.state;
};

test('Authority is the higher of Love and Fear plus a quarter of the lower', () => {
  const s = fresh();
  for (const [love, fear, want] of [[80, 0, 80], [0, 80, 80], [60, 40, 70], [40, 60, 70], [10, 10, 12.5], [100, 100, 100], [0, 0, 0]]) {
    assert.equal(authority({ ...s, love, fear }, world), want, `${love}/${fear}`);
  }
});

test('Love moves with its causes, slowly, and says why', () => {
  const s = fresh();
  const base = month(s);
  const hungry = month(s, (t) => { for (const x of Object.values(t.settlements)) x.hunger = 0.5; });
  assert.ok(hungry.love < base.love - 5);
  assert.ok(why(hungry, 'love').includes('Hunger'));
  const cleared = month(s, (t) => { t.threats.tally.cleared = (t.meters.last.cleared ?? 0) + 3; });
  assert.ok(cleared.love > base.love && why(cleared, 'love').includes('Threats cleared'));
  const raided = month(s, (t) => { t.threats.tally.raids = (t.meters.last.raids ?? 0) + 2; });
  assert.ok(raided.love < base.love && why(raided, 'love').includes('Raids left unanswered'));
  const light = month(s, (t) => { t.laws.tax_peasants.option = 'light'; });
  const heavy = month(s, (t) => { t.laws.tax_peasants.option = 'heavy'; });
  assert.ok(light.love > base.love && heavy.love < base.love);
  const alms = month(s, (t) => { t.laws.alms = { option: 'alms', since: -999 }; });
  assert.ok(alms.love > base.love, 'alms win love');
  const levied = month(s, (t) => { t.armies.push({ id: 'x', side: 'temeria', folk: true, levyMen: 3000, soldiers: 3000, bands: [] }); });
  assert.ok(levied.love < base.love && why(levied, 'love').includes('Men taken for the levies'));
  // It decays very slowly: a loved crown left alone keeps most of it for a year.
  let t = clone(s);
  t.love = 90;
  for (let i = 0; i < 12; i++) monthlyMeters(t, world, null);
  assert.ok(t.love > 70, `love after a year untended ${t.love}`);
});

test('Fear rises quickly with punishment, fades unless renewed, and collapses as stated', () => {
  let s = fresh();
  s.fear = 10;
  s.treasury = 5000;
  const town = 'tegmond';
  const unrest = s.settlements[town].unrest;
  s = act(s, { type: 'act', kind: 'hang', settlement: town });
  assert.ok(s.fear >= 16, 'hangings bring fear at once');
  assert.ok(s.settlements[town].unrest < unrest, 'and quiet the town');
  assert.match(applyAction(s, world, { type: 'act', kind: 'hang', settlement: town }).error, /too fresh/);
  s = act(s, { type: 'act', kind: 'gibbets', settlement: 'maribor' });
  const withGibbets = month(s);
  assert.ok(why(withGibbets, 'fear').includes('Gibbets at the crossroads'));
  // Left alone, Fear fades.
  let t = clone(s);
  t.meters.gibbets = {};
  t.fear = 50;
  for (let i = 0; i < 6; i++) monthlyMeters(t, world, null);
  assert.ok(t.fear < 30, `fear fades: 50 to ${t.fear}`);
  // The king's riders renew it each month.
  t = clone(s);
  t.meters.gibbets = {};
  t.laws.public_order = { option: 'riders', since: -999 };
  for (let i = 0; i < 12; i++) monthlyMeters(t, world, null);
  assert.ok(t.fear > 15, `the riders keep fear up: ${t.fear}`);
  // Collapse: a lost battle on our soil, and the anger breaks out.
  t = clone(s);
  t.fear = 60;
  const u0 = realmUnrest(t, world);
  fearCollapse(t, world, world.meters.fear.lostBattle, 'A battle lost on our soil');
  assert.equal(t.fear, 60 - world.meters.fear.lostBattle);
  assert.ok(realmUnrest(t, world) > u0, 'Unrest jumps when fear collapses');
  // Garrisons withdrawn.
  t = clone(s);
  t.fear = 40;
  t = act(t, { type: 'garrison', settlement: 'maribor', level: 'skeleton' });
  assert.ok(t.fear < 40, 'withdrawing a garrison loosens the grip');
});

test('a feared but unloved crown collects its taxes and levies; one neither loved nor feared does not', () => {
  const s = fresh();
  const feared = { ...s, love: 5, fear: 75 };
  const loved = { ...s, love: 75, fear: 5 };
  const neither = { ...s, love: 8, fear: 8 };
  assert.equal(taxCollected(feared, world), 1);
  assert.equal(taxCollected(loved, world), 1);
  assert.ok(taxCollected(neither, world) < 0.75);
  assert.equal(musterAnswer(feared, world), 1);
  assert.ok(musterAnswer(neither, world) < 0.7);
  // A loved crown gets volunteers in a war; a feared one none.
  assert.ok(musterAnswer({ ...s, love: 90, fear: 0 }, world, true) > 1);
  assert.equal(musterAnswer(feared, world, true), 1);
  // A feared crown that is not loved is quietly sabotaged.
  assert.ok(sabotage(feared, world) > 0);
  assert.equal(sabotage(loved, world), 0);
  // And in the ledger: the same realm gathers more under a feared crown than under neither.
  const run = (love, fear) => {
    let t = clone(s);
    t.love = love;
    t.fear = fear;
    t = step(t, 31, world, { ambient: false });
    return t.ledger.history.at(-1).income.taxes;
  };
  assert.ok(run(5, 80) > run(5, 5) * 1.2, 'fear gathers the taxes');
});

test('Unrest below 50 costs nothing; high Unrest bites only when Authority is low', () => {
  const s = fresh();
  const grumbling = month(s, (t) => { for (const x of Object.values(t.settlements)) x.unrest = 45; t.unrest = realmUnrest(t, world); });
  assert.ok(!Object.values(grumbling.settlements).some((x) => x.strike > grumbling.day), 'no strikes at 45');
  assert.equal(grumbling.meters.trade, 1);
  // High Unrest under a strong crown: still nothing.
  const strong = month(s, (t) => { t.love = 80; for (const x of Object.values(t.settlements)) x.unrest = 85; t.unrest = realmUnrest(t, world); });
  assert.equal(canRiot(strong, world), false);
  assert.ok(!Object.values(strong.settlements).some((x) => x.strike > strong.day), 'a strong crown holds the towns down');
  // High Unrest under a weak crown: strikes, flight from the villages, quiet roads.
  const weak = month(s, (t) => { t.love = 5; t.fear = 5; for (const x of Object.values(t.settlements)) x.unrest = 85; t.unrest = realmUnrest(t, world); });
  assert.ok(Object.values(weak.settlements).some((x) => x.strike > weak.day));
  assert.ok(weak.meters.trade < 1);
  // Beasts and bandits near a town anger it (what Dread carried).
  const v = world.byId.vizima;
  const t = clone(s);
  t.threats.list.push({ id: 'tb', kind: 'monsters', sighted: true, x: v.x + 10, y: v.y });
  assert.ok(unrestPressures(t, world).some((r) => /Beasts and bandits/.test(r.why)));
});

test('a feast and a royal progress win love; the king away cannot decree', () => {
  let s = fresh();
  s.treasury = 6000;
  const love = s.love;
  s = act(s, { type: 'act', kind: 'feast' });
  assert.ok(s.love > love);
  assert.match(applyAction(s, world, { type: 'act', kind: 'feast' }).error, /Not again/);
  s = act(s, { type: 'act', kind: 'progress' });
  assert.ok(s.meters.progress && s.figures.some((f) => f.kind === 'progress'));
  assert.match(applyAction(s, world, { type: 'law', law: 'tax_peasants', option: 'light' }).error, /away on progress/);
  const l1 = s.love;
  s = step(s, 32, world, { ambient: false });
  assert.equal(s.meters.progress, null, 'home again');
  assert.ok(s.meters.reasons.love.some((r) => r.why === 'A royal progress') || s.love > l1 - 1);
  assert.equal(applyAction(s, world, { type: 'law', law: 'tax_peasants', option: 'light' }).error, undefined);
});

test('hostages from a great house bring fear and a grievance', () => {
  let s = fresh();
  const hid = Object.keys(world.houses.houses)[0];
  const g = s.houses[hid].grievance;
  const f = s.fear;
  s = act(s, { type: 'house', house: hid, kind: 'hostages' });
  assert.ok(s.fear > f && s.houses[hid].grievance > g);
});

test('a broken promise to petitioners costs Love', () => {
  const s = fresh();
  const pid = Object.keys(world.petitions.petitions).find((k) => world.petitions.petitions[k].choices.some((c) => (c.effects.treasury ?? 0) < 0));
  const choice = world.petitions.petitions[pid].choices.findIndex((c) => (c.effects.treasury ?? 0) < 0);
  s.petitions = [{ id: 1, petition: pid, place: 'vizima', day: s.day }];
  s.treasury = 10;
  const love = s.love;
  resolvePetition(s, world, 1, choice);
  assert.ok(s.love < love && 'Promises to petitioners broken' in s.meters.month.love);
});

test('nothing reads Trust, Dread or the old Standing', async () => {
  const s = fresh();
  assert.equal(s.trust, undefined);
  assert.equal(s.dread, undefined);
  const after = step(s, 120, world, { ambient: false });
  assert.equal(after.trust, undefined);
  assert.equal(after.dread, undefined);
  for (const dir of ['src/sim', 'src/ui', 'src/render', 'data']) {
    for (const f of await readdir(join(ROOT, dir), { recursive: true })) {
      if (!/\.(js|json)$/.test(f) || f.endsWith('save.js')) continue;
      const text = (await readFile(join(ROOT, dir, f), 'utf8')).replace(/^\s*\/\/.*$/gm, '').replace(/"note": "[^"]*"/g, '');
      assert.doesNotMatch(text, /state\.trust\b|state\.dread\b|\bstanding\(state|'trust'|'dread'|\bTrust in the Crown\b|"dread"/, `${dir}/${f}`);
    }
  }
});

test('deposition follows months of very low Authority together with very high Unrest', () => {
  const run = (love, fear, unrest) => {
    let s = fresh(3);
    for (let m = 0; m < 9; m++) {
      s.love = love;
      s.fear = fear;
      for (const st of Object.values(s.settlements)) st.unrest = unrest;
      s = step(s, 30, world, { ambient: false });
      if (s.depositions.length) return true;
    }
    return false;
  };
  assert.equal(run(0, 0, 90), true, 'neither loved nor feared, and the realm in uproar');
  assert.equal(run(0, 80, 90), false, 'hated but feared, he still rules');
  assert.equal(run(0, 0, 20), false, 'weak, but the towns quiet');
});

test('a version 25 save gains Love and Fear from Trust and Dread', () => {
  const s = step(fresh(5), 40, world, { ambient: false });
  const old = clone(s);
  delete old.love;
  delete old.fear;
  old.trust = 70;
  old.dread = 20;
  old.laws.public_order = { option: 'martial', since: 0 };
  old.meters = { month: { trust: {}, unrest: {}, dread: {} }, reasons: { trust: [], unrest: [], dread: [] }, last: { cleared: 0, raids: 0 }, trade: 1 };
  old.version = 25;
  const up = deserialize(JSON.stringify({ format: 'northern-wars-save', version: 25, state: old }), world);
  assert.equal(up.version, STATE_VERSION);
  assert.equal(up.love, 70);
  assert.ok(up.fear >= 20 + 8 - 1, `fear ${up.fear}`);
  assert.equal(up.trust, undefined);
  assert.equal(up.dread, undefined);
  assert.equal(deserialize(serialize(step(up, 30, world, { ambient: false })), world).version, STATE_VERSION);
  void nudge;
});
