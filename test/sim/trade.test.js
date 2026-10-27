import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createState, step, applyAction, routeValue, routeLimit, deserialize, serialize, goldYield, activeMines, threatLevel, spacesOf, canRepairWorks,
} from '../../src/sim/index.js';
import { STATE_VERSION } from '../../src/sim/state.js';
import { startWar } from '../../src/sim/war.js';
import { makeRng } from '../../src/sim/rng.js';
import { planSettlement, overlaps, geoOf, segDist } from '../../src/render/layout.js';
import { nodeWorld, ROOT } from '../helpers.js';

const world = await nodeWorld();
const layout = JSON.parse(readFileSync(join(ROOT, 'data/layout.json'), 'utf8'));
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
const pop = (st) => Object.values(st.population).reduce((a, b) => a + b, 0);

// ---- Trade routes ----

test('a trade route costs coin, earns each month on its own ledger line, and costs upkeep', () => {
  let s = quiet(createState(world, 1));
  const t0 = s.treasury;
  s = act(s, { type: 'route', from: 'vizima', to: 'maribor' });
  assert.ok(s.treasury < t0 - 400);
  s = run(s, 31);
  const last = s.ledger.history.at(-1);
  assert.ok(last.income.routes['vizima>maribor'] > 20, `earned ${last.income.routes['vizima>maribor']}`);
  assert.equal(last.expenses.routes, world.trade.upkeep);
});

test('route value grows with prosperity, wares that differ, market halls and safe roads', () => {
  const s = createState(world, 2);
  const base = routeValue(s, world, { from: 'vizima', to: 'maribor' }).value;
  const richer = structuredClone(s);
  richer.settlements.vizima.prosperity = 90;
  richer.settlements.maribor.prosperity = 90;
  assert.ok(routeValue(richer, world, { from: 'vizima', to: 'maribor' }).value > base);
  // Vizima's market hall (there from the start since M20) is worth a fifth.
  const bare = structuredClone(s);
  bare.settlements.vizima.buildings = bare.settlements.vizima.buildings.filter((b) => b !== 'market');
  assert.ok(base > routeValue(bare, world, { from: 'vizima', to: 'maribor' }).value * 1.12);
  // Carreras (iron) and Ellander (food) sell each other what they lack.
  const differ = routeValue(s, world, { from: 'carreras', to: 'ellander' }).parts.wares;
  const same = routeValue(s, world, { from: 'vizima', to: 'maribor' }).parts.wares;
  assert.ok(differ > same);
  // Bandits on the road cut it.
  const lawless = structuredClone(s);
  for (const id of Object.keys(lawless.settlements)) {
    lawless.settlements[id].prosperity = 5;
    lawless.settlements[id].unrest = 90;
  }
  const v = routeValue(lawless, world, { from: 'vizima', to: 'maribor' });
  assert.ok(v.parts.safety < routeValue(s, world, { from: 'vizima', to: 'maribor' }).parts.safety);
});

test('foreign routes need good relations, and war closes them', () => {
  let s = quiet(createState(world, 3));
  s.treasury = 20000;
  s.neighbours.redania.relation = 0;
  assert.match(applyAction(s, world, { type: 'route', from: 'white_bridge', to: 'oxenfurt' }).error, /not friendly enough/);
  s.neighbours.redania.relation = 40;
  s.neighbours.redania.stance = 'friendly';
  s = act(s, { type: 'route', from: 'white_bridge', to: 'oxenfurt' });
  s = run(s, 31);
  assert.ok(s.ledger.history.at(-1).income.routes['white_bridge>oxenfurt'] > 0);
  startWar(s, world, makeRng(4), 'redania', 'temeria', 'test');
  s = run(s, 31);
  assert.equal(s.ledger.history.at(-1).income.routes['white_bridge>oxenfurt'], 0);
  assert.match(s.routes[0].closed, /war with Redania/);
});

test('the crown can run only so many routes; market halls and guildhalls allow more', () => {
  let s = quiet(createState(world, 4));
  s.treasury = 50000;
  const limit = routeLimit(s, world);
  const ends = world.geography.settlements.filter((x) => x.type === 'town' || x.type === 'city').map((x) => x.id);
  const pairs = [];
  for (const a of ends) for (const b of ends) if (a < b) pairs.push([a, b]);
  let n = 0;
  for (const [a, b] of pairs) {
    if (n >= limit) break;
    const out = applyAction(s, world, { type: 'route', from: a, to: b });
    if (!out.error) { s = out.state; n += 1; }
  }
  assert.equal(n, limit);
  const next = pairs.find(([a, b]) => !s.routes.some((r) => (r.from === a && r.to === b)));
  assert.match(applyAction(s, world, { type: 'route', from: next[0], to: next[1] }).error, /only \d+ routes/);
  // Without their market halls and guildhalls the towns would carry fewer.
  const bare = structuredClone(s);
  for (const t of Object.values(bare.settlements)) t.buildings = t.buildings.filter((b) => b !== 'market' && b !== 'guildhall');
  assert.ok(routeLimit(s, world) >= routeLimit(bare, world) + 2);
});

test('bands holding the road rob a route on dangerous roads', () => {
  let robbed = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    let s = quiet(createState(world, seed));
    s = act(s, { type: 'route', from: 'vizima', to: 'gors_velen' });
    for (const id of Object.keys(s.settlements)) s.settlements[id].prosperity = 10;
    s = run(s, 365);
    robbed += s.chronicle.filter((c) => /held the road between/.test(c.text)).length;
  }
  assert.ok(robbed > 0);
});

// ---- Gold ----

test('a gold mine pays each month and its seam runs out, slowly at first', () => {
  let s = quiet(createState(world, 5));
  s.treasury = 10000;
  // Since M20 the old workings stand flooded: the crown reopens them.
  assert.equal(goldYield(s, world, 'zavada_spur'), 0);
  s = act(s, { type: 'repair', settlement: 'zavada', building: 'goldmine', kind: 'rebuild' });
  s = run(s, 120);
  assert.equal(activeMines(s, world).length, 1);
  const full = goldYield(s, world, 'zavada_spur');
  // Whole again, less a month or two of wear.
  assert.ok(full >= world.gold.yield * 0.97 && full <= world.gold.yield, `${full}`);
  assert.ok(s.ledger.history.at(-1).income.gold > 0);
  // Late in its life, the seam thins.
  s.gold.deposits.zavada_spur.remaining = world.gold.deposits.zavada_spur.gold * 0.1;
  assert.ok(goldYield(s, world, 'zavada_spur') < full * 0.5);
  s.gold.deposits.zavada_spur.remaining = 10;
  s = run(s, 62);
  assert.equal(s.gold.deposits.zavada_spur.remaining, 0);
  assert.equal(activeMines(s, world).length, 0);
  assert.ok(s.chronicle.some((c) => /worked out/.test(c.text)));
});

test('gold draws miners and dwarves, and bandits to the country round it', () => {
  let s = quiet(createState(world, 6));
  s.treasury = 10000;
  const banditsBefore = threatLevel(s, world, 'zavada', 'bandits');
  const dwarves = s.settlements.zavada.population.dwarf;
  s = act(s, { type: 'repair', settlement: 'zavada', building: 'goldmine', kind: 'rebuild' });
  s = run(s, 365);
  assert.ok(s.settlements.zavada.population.dwarf > dwarves + 5);
  assert.ok(threatLevel(s, world, 'zavada', 'bandits') > banditsBefore + 10);
});

test('hidden deposits are found only by prospecting, which can fail', () => {
  let found = 0;
  let failed = 0;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]) {
    let s = quiet(createState(world, seed));
    // Its seam is no space of the town's until it is found (M20).
    assert.ok(!spacesOf(s, world, 'napeys').some((x) => x.kind === 'seam'));
    s = act(s, { type: 'prospect', settlement: 'napeys' });
    assert.match(applyAction(s, world, { type: 'prospect', settlement: 'napeys' }).error, /already at work/);
    s = run(s, world.gold.prospect.days + 1);
    if (s.gold.deposits.napeys_vein.known) {
      found++;
      assert.ok(spacesOf(s, world, 'napeys').some((x) => x.kind === 'seam'));
      assert.ok(canRepairWorks({ ...s, treasury: 10000 }, world, 'napeys', 'goldmine', 'rebuild').ok);
    } else failed++;
  }
  assert.ok(found > 0 && failed > 0, `found ${found}, failed ${failed}`);
  // Where there is nothing, prospectors say so, and are not sent twice.
  let s = quiet(createState(world, 9));
  s = act(s, { type: 'prospect', settlement: 'vorune' });
  s = run(s, world.gold.prospect.days + 1);
  assert.match(applyAction(s, world, { type: 'prospect', settlement: 'vorune' }).error, /found nothing/);
  assert.match(applyAction(s, world, { type: 'prospect', settlement: 'vizima' }).error, /hills/);
  // Both hidden seams can be looked for.
  assert.equal(applyAction(createState(world, 9), world, { type: 'prospect', settlement: 'dregsdon' }).error, undefined);
});

// ---- Buildings ----

test('works do what they promise', () => {
  const base = quiet(createState(world, 8));
  // The same realm with one works taken away, run a while.
  const without = (id, b, days = 61) => {
    const s = structuredClone(base);
    s.settlements[id].buildings = s.settlements[id].buildings.filter((x) => x !== b);
    return run(s, days);
  };
  const after = (mutate, days = 61) => {
    const s = structuredClone(base);
    mutate(s);
    return run(s, days);
  };
  const plain = run(structuredClone(base), 61);
  // A dwarven bank lends more.
  const unbanked = structuredClone(base);
  unbanked.settlements.vizima.buildings = unbanked.settlements.vizima.buildings.filter((x) => x !== 'bank');
  assert.match(applyAction({ ...unbanked, treasury: -7900 }, world, { type: 'prospect', settlement: 'vorune' }).error, /bankers/);
  assert.equal(applyAction({ ...base, treasury: -7900 }, world, { type: 'prospect', settlement: 'vorune' }).error, undefined);
  // Crafts pay whatever the size of the place, each on its own line.
  const crafted = after((s) => s.settlements.white_orchard.buildings.push('brewery', 'tannery'));
  assert.ok(crafted.ledger.history.at(-1).income.crafts.brewery > (plain.ledger.history.at(-1).income.crafts.brewery ?? 0) + 2);
  assert.ok(crafted.ledger.history.at(-1).income.crafts.tannery > (plain.ledger.history.at(-1).income.crafts.tannery ?? 0) + 2);
  // Vizima's harbour on the lake collects customs.
  assert.ok(plain.ledger.history.at(-1).income.customs > 0);
  assert.equal(without('vizima', 'harbour').ledger.history.at(-1).income.customs, 0);
  // Barracks hold more soldiers.
  const barracks = run(structuredClone(base), 400);
  assert.ok(barracks.settlements.maribor.garrison > without('maribor', 'barracks', 400).settlements.maribor.garrison * 1.2);
  // A cathedral raises tension among non-humans in its city.
  assert.ok(after((s) => s.settlements.vizima.buildings.push('cathedral'), 200).settlements.vizima.tension > run(structuredClone(base), 200).settlements.vizima.tension + 5);
});

test('a version 9 save gains trade and gold', () => {
  const s = createState(world, 9);
  delete s.routes;
  delete s.nextRouteId;
  delete s.gold;
  s.version = 9;
  const loaded = deserialize(JSON.stringify({ format: 'northern-wars-save', version: 9, state: s }), world);
  assert.equal(loaded.version, STATE_VERSION);
  assert.deepEqual(loaded.routes, []);
  assert.equal(loaded.gold.deposits.carreras_seam.known, true);
  assert.ok(deserialize(serialize(run(loaded, 40)), world));
});

// ---- Layouts ----

function placeOf(id, buildings, people, seed = 1) {
  const st = world.byId[id];
  return { id, x: st.x, y: st.y, type: st.type, people, production: world.settlementData[id].production, buildings, construction: null, seed };
}

function fullDevelopment(id) {
  const type = world.byId[id].type;
  return Object.keys(world.buildings).filter((b) => world.buildings[b].types.includes(type) && !world.buildings[b].needs).slice(0, world.buildingSlots[type]);
}

test('settlement layouts are the same every time for the same seed, and differ between seeds', () => {
  const a = planSettlement(world, layout, placeOf('ellander', ['market', 'walls', 'fields', 'mill'], 3000, 5));
  const b = planSettlement(world, layout, placeOf('ellander', ['market', 'walls', 'fields', 'mill'], 3000, 5));
  const c = planSettlement(world, layout, placeOf('ellander', ['market', 'walls', 'fields', 'mill'], 3000, 6));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.items.map((i) => [i.x, i.y]), c.items.map((i) => [i.x, i.y]));
});

test('no layout overlaps itself, a road, a river or a neighbour, even fully built', () => {
  const g = geoOf(world);
  for (const st of world.geography.settlements) {
    const people = pop(world.settlementData[st.id]) * 1.6;
    const plan = planSettlement(world, layout, placeOf(st.id, fullDevelopment(st.id), people, 3));
    assert.deepEqual(overlaps(plan), [], `${st.id} overlaps`);
    for (const it of [...plan.items, ...plan.fields]) {
      if (it.kind === 'landmark') continue;
      const x = st.x + it.x;
      const y = st.y + it.y;
      for (const s of g.roads) assert.ok(segDist(x, y, s) >= it.r + layout.clearance.road - 1e-6, `${st.id} ${it.sprite ?? it.kind} on a road`);
      if (!['mill', 'harbour'].includes(it.sprite)) for (const s of g.rivers) assert.ok(segDist(x, y, s) >= it.r + layout.clearance.river - 1e-6, `${st.id} ${it.sprite ?? it.kind} in a river`);
      for (const p of g.places) {
        if (p.id === st.id) continue;
        assert.ok(Math.hypot(p.x - x, p.y - y) > Math.hypot(it.x, it.y), `${st.id} ${it.sprite ?? it.kind} on ${p.id}'s ground`);
      }
    }
  }
});

test('layouts grow with their people and place buildings where they belong', () => {
  const small = planSettlement(world, layout, placeOf('maribor', [], 4000));
  const big = planSettlement(world, layout, placeOf('maribor', [], 20000));
  const houses = (p) => p.items.filter((i) => i.kind === 'house').length;
  assert.ok(houses(big) > houses(small) + 5);
  assert.ok(big.radius > small.radius);
  // Vizima's mill and harbour stand by the Ismena; Carreras's gold mine
  // towards its seam in the Mahakam foothills.
  const g = geoOf(world);
  const viz = planSettlement(world, layout, placeOf('vizima', ['mill', 'harbour'], 18000));
  for (const b of ['mill', 'harbour']) {
    const it = viz.items.find((i) => i.sprite === b);
    const near = Math.min(...g.rivers.map((s) => segDist(world.byId.vizima.x + it.x, world.byId.vizima.y + it.y, s)));
    assert.ok(near < 8, `${b} ${near} from the river`);
  }
  const car = planSettlement(world, layout, placeOf('carreras', ['goldmine'], 2200));
  const mine = car.items.find((i) => i.sprite === 'goldmine');
  assert.ok(mine.x > 0, 'the gold mine lies east, towards the seam');
  // A walled place keeps its heart inside the wall.
  const walled = planSettlement(world, layout, placeOf('ellander', ['walls'], 3000));
  assert.ok(walled.walls);
});
