// The three meters (M22 D): Trust in the Crown, Unrest and Dread each move
// with their causes and say why; what they do when they run high or low;
// nothing reads or spends Authority any more; deposition follows Trust and
// Unrest together; old saves gain the three meters.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createState, step, serialize, deserialize, standing, nudge, realmUnrest, unrestPressures } from '../../src/sim/index.js';
import { monthlyMeters } from '../../src/sim/meters.js';
import { resolvePetition } from '../../src/sim/petitions.js';
import { STATE_VERSION } from '../../src/sim/state.js';
import { ROOT, nodeWorld } from '../helpers.js';

const world = await nodeWorld();
const fresh = (seed = 1) => {
  const s = createState(world, seed);
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  return s;
};
const clone = (s) => structuredClone(s);
// One month's turn of the meters on a copy, after `set` changes the realm.
const month = (s, set = () => {}) => {
  const t = clone(s);
  set(t);
  monthlyMeters(t, world, null);
  return t;
};
const why = (s, meter) => s.meters.reasons[meter].map((r) => r.why);

test('Trust in the Crown moves with its causes, and says why', () => {
  const s = fresh();
  const base = month(s);
  // Hunger.
  const hungry = month(s, (t) => { for (const x of Object.values(t.settlements)) x.hunger = 0.5; });
  assert.ok(hungry.trust < base.trust - 5, `hunger ${hungry.trust} vs ${base.trust}`);
  assert.ok(why(hungry, 'trust').includes('Hunger'));
  // Threats cleared.
  const cleared = month(s, (t) => { t.threats.tally.cleared = (t.meters.last.cleared ?? 0) + 3; });
  assert.ok(cleared.trust > base.trust);
  assert.ok(why(cleared, 'trust').includes('Threats cleared'));
  // Raids left unanswered.
  const raided = month(s, (t) => { t.threats.tally.raids = (t.meters.last.raids ?? 0) + 2; });
  assert.ok(raided.trust < base.trust);
  assert.ok(why(raided, 'trust').includes('Raids left unanswered'));
  // Fair taxes are neutral; light ones win the folk, heavy ones lose them.
  const light = month(s, (t) => { t.laws.tax_peasants.option = 'light'; });
  const heavy = month(s, (t) => { t.laws.tax_peasants.option = 'heavy'; });
  assert.ok(light.trust > base.trust && heavy.trust < base.trust);
  assert.ok(why(heavy, 'trust').includes('Heavy taxes on the villages'));
  // Heavy levies.
  const levied = month(s, (t) => { t.armies.push({ id: 'x', side: 'temeria', folk: true, levyMen: 3000, soldiers: 3000, bands: [] }); });
  assert.ok(levied.trust < base.trust);
  assert.ok(why(levied, 'trust').includes('Men taken for the levies'));
  // Reasons are few and biggest first.
  const r = hungry.meters.reasons.trust;
  assert.ok(r.length >= 1 && r.length <= 5);
  for (let i = 1; i < r.length; i++) assert.ok(Math.abs(r[i - 1].v) >= Math.abs(r[i].v));
});

test('a grant the treasury cannot pay is a broken promise, and costs Trust', () => {
  const s = fresh();
  const pid = Object.keys(world.petitions.petitions).find((k) => world.petitions.petitions[k].choices.some((c) => (c.effects.treasury ?? 0) < 0));
  const choice = world.petitions.petitions[pid].choices.findIndex((c) => (c.effects.treasury ?? 0) < 0);
  s.petitions = [{ id: 1, petition: pid, place: 'vizima', day: s.day }];
  s.treasury = 10;
  const trust = s.trust;
  const unrest = s.settlements.vizima.unrest;
  resolvePetition(s, world, 1, choice);
  assert.equal(s.treasury, 10, 'the coin never came');
  assert.ok(s.trust < trust && s.settlements.vizima.unrest > unrest);
  assert.ok('Promises to petitioners broken' in s.meters.month.trust);
});

test('full granaries through the winter win Trust; low Trust drives people away', () => {
  let s = fresh();
  s = step(s, 300, world, { ambient: false });
  // Deep in winter with the granaries full.
  const full = month(s, (t) => { for (const x of Object.values(t.settlements)) x.stock.food = 1e6; });
  assert.ok(why(full, 'trust').includes('Full granaries through the winter'));
  // Low Trust: the people drift away and the works go slack.
  const pop = (t) => Object.values(t.settlements).reduce((a, x) => a + x.population.human, 0);
  const low = month(s, (t) => { t.trust = 0; });
  const ok = month(s);
  assert.ok(pop(low) < pop(ok), 'people leave a crown they do not trust');
  const p = (t) => Object.values(t.settlements).reduce((a, x) => a + x.prosperity, 0);
  assert.ok(p(low) < p(ok));
});

test('Unrest follows the towns and the great houses, and high Unrest brings strikes', () => {
  const s = fresh();
  const u0 = realmUnrest(s, world);
  const t = clone(s);
  nudge(t, world, 'unrest', 10, 'Test');
  assert.ok(t.unrest > u0 + 5, 'moving Unrest moves the towns');
  // Sullen lords add to it.
  const sullen = clone(s);
  for (const h of Object.values(sullen.houses)) h.loyalty = 10;
  assert.ok(realmUnrest(sullen, world) > u0 + 5);
  // Heavy taxes show up among its pressures.
  const taxed = clone(s);
  taxed.laws.tax_towns.option = 'heavy';
  assert.ok(unrestPressures(taxed, world).some((r) => /Heavy taxes/.test(r.why)));
  // Past its line, the angriest town strikes and its workshops idle.
  const angry = month(s, (x) => { for (const st of Object.values(x.settlements)) st.unrest = 90; x.unrest = realmUnrest(x, world); });
  assert.ok(Object.values(angry.settlements).some((st) => st.strike > angry.day));
  assert.ok(angry.chronicle.some((c) => /Strike in/.test(c.text)));
});

test('Dread rises with monsters, plague and enemies near, and falls with garrisons and time', () => {
  const s = fresh();
  s.dread = 15;
  const base = month(s);
  const v = world.byId.vizima;
  const beasts = month(s, (t) => {
    t.threats.list.push({ id: 'tb1', kind: 'monsters', sighted: true, x: v.x + 10, y: v.y }, { id: 'tb2', kind: 'monsters', sighted: true, x: v.x - 10, y: v.y });
  });
  assert.ok(beasts.dread > base.dread);
  assert.ok(why(beasts, 'dread').includes('Beasts near our towns'));
  const plague = month(s, (t) => { t.settlements.vizima.plague = t.day + 60; });
  assert.ok(plague.dread > base.dread);
  assert.ok(why(plague, 'dread').includes('Plague'));
  // Bare garrisons: more fear.
  const bare = month(s, (t) => { for (const x of Object.values(t.settlements)) x.garrison = 0; });
  assert.ok(bare.dread > base.dread);
  // With nothing to fear, it ebbs with time.
  const high = month(s, (t) => { t.dread = 80; });
  assert.ok(high.dread < 80);
  // High Dread: the roads go quiet, villagers crowd behind walls, the folk
  // turn to the Eternal Fire. Low Dread: busy roads.
  const dread = month(s, (t) => { t.dread = 100; for (const x of Object.values(t.settlements)) x.plague = t.day + 60; });
  assert.ok(dread.meters.trade < 1);
  const vil = (t) => Object.entries(t.settlements).filter(([id]) => world.byId[id].type === 'village').reduce((a, [, x]) => a + x.population.human, 0);
  assert.ok(vil(dread) < vil(s));
  const calm = month(s, (t) => { t.dread = 0; });
  assert.ok(calm.meters.trade > 1);
});

test('Standing comes from the three meters and is never shown', () => {
  const s = fresh();
  const hi = { ...s, trust: 90, unrest: 10, dread: 10 };
  const lo = { ...s, trust: 10, unrest: 80, dread: 80 };
  assert.ok(standing(hi, world) > 80 && standing(lo, world) < 25);
});

test('nothing still reads or spends Authority or Stability', async () => {
  const s = fresh();
  assert.equal(s.authority, undefined);
  assert.equal(s.stability, undefined);
  const after = step(s, 120, world, { ambient: false });
  assert.equal(after.authority, undefined);
  assert.equal(after.stability, undefined);
  for (const dir of ['src/sim', 'src/ui', 'data']) {
    for (const f of await readdir(join(ROOT, dir), { recursive: true })) {
      if (!/\.(js|json)$/.test(f) || f.endsWith('save.js')) continue;
      // Comments may tell the history; code and data may not use it.
      const text = (await readFile(join(ROOT, dir, f), 'utf8')).replace(/^\s*\/\/.*$/gm, '').replace(/"note": "[^"]*"/g, '');
      assert.doesNotMatch(text, /\.authority\b|"authority"|\.stability\b|"stability"|\bAuthority\b/, `${dir}/${f}`);
    }
  }
});

test('deposition follows months of very low Trust together with very high Unrest', () => {
  const run = (trust, unrest) => {
    let s = fresh(3);
    for (let m = 0; m < 9; m++) {
      s.trust = trust;
      for (const st of Object.values(s.settlements)) st.unrest = unrest;
      s = step(s, 30, world, { ambient: false });
      if (s.depositions.length) return true;
    }
    return false;
  };
  assert.equal(run(0, 90), true, 'no Trust and the realm in uproar');
  assert.equal(run(0, 20), false, 'no Trust, but the towns quiet');
  assert.equal(run(60, 90), false, 'the towns in uproar, but the folk still trust the crown');
});

test('a version 23 save gains Trust, Unrest and Dread', () => {
  const s = step(fresh(5), 40, world, { ambient: false });
  const old = clone(s);
  delete old.trust;
  delete old.unrest;
  delete old.dread;
  delete old.meters;
  old.authority = 70;
  old.stability = 60;
  old.version = 23;
  const up = deserialize(JSON.stringify({ format: 'northern-wars-save', version: 23, state: old }), world);
  assert.equal(up.version, STATE_VERSION);
  for (const m of ['trust', 'unrest', 'dread']) assert.ok(up[m] >= 0 && up[m] <= 100, m);
  assert.ok(up.trust > 50, 'high Authority carries over as Trust');
  assert.equal(up.authority, undefined);
  assert.equal(up.stability, undefined);
  assert.equal(deserialize(serialize(step(up, 30, world, { ambient: false })), world).version, STATE_VERSION);
});
