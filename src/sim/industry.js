// Industry: the realm's production chains and the trades that earn on their
// own. Pastures, salt pans and studs make goods; charcoal burners, weavers,
// weaponsmiths and distilleries work one good into another; finished goods
// ride the crown's trade routes at a premium where the far end lacks them,
// and the rest sells at home, cheaper once the home market is full. Silver
// mines, toll bridges, merchants' quarters, the pilgrims' hostel and the
// shipyard pay the crown directly. Everything here runs once a month, from
// the ledger, and is deterministic: no dice.
import { totalPopulation } from './state.js';
import { prosperityMult, foodNeed } from './economy.js';
import { crownShare } from './houses.js';
import { realmFaith } from './culture.js';
import { atWar } from './conflict.js';
import { routePath, routeKey } from './trade.js';
import { foreignTrade } from './neighbours.js';
import { intersectSegments } from './geometry.js';
import { worksFactor } from './works.js';
import { bookEffect, outputMult } from './book.js';
import { noteMade, noteUsed, noteShort, offer } from './market.js';

const I = (world) => world.industry;
const MATERIALS = ['timber', 'stone', 'iron'];

// Places the crown governs that stand a building, in a fixed order.
function withBuilding(state, id) {
  const out = [];
  for (const [sid, s] of Object.entries(state.settlements)) if (!s.occupier && s.buildings.includes(id)) out.push(sid);
  return out;
}

// Which good, if any, a building makes.
export function goodOf(world, buildingId) {
  const i = I(world);
  return i?.makers[buildingId]?.good ?? i?.workers[buildingId]?.good ?? null;
}

// Does this place (ours or abroad) make a good itself?
function makes(state, world, id, good) {
  const s = state.settlements[id];
  if (s) return s.buildings.some((b) => goodOf(world, b) === good);
  return (I(world).abroadMakes[world.realmOf[id]] ?? []).includes(good);
}

// The price of a good this month: arms fetch more while the realms round
// about are at war.
export function goodPrice(state, world, good) {
  const g = I(world).goods[good];
  if (!g.warBonus) return g.price;
  const wars = Object.keys(world.neighbours.realms).filter((r) => atWar(state, r)).length;
  return g.price * (1 + g.warBonus * wars);
}

// Salt keeps food: every salt pan lets every granary in the realm hold a
// little more before it spoils.
export function saltStorage(state, world) {
  const c = I(world)?.salt;
  if (!c) return 0;
  return Math.min(c.storageMax, withBuilding(state, 'saltpans').reduce((a, id) => a + worksFactor(state.settlements[id], 'saltpans'), 0) * c.storagePer);
}

// Hunters thin out the beasts in the country round their lodge.
export function lodgeCut(state, world, id) {
  const c = I(world)?.lodge;
  if (!c) return 0;
  const p = world.byId[id];
  let v = 0;
  for (const sid of withBuilding(state, 'lodge')) {
    const q = world.byId[sid];
    if (Math.hypot(q.x - p.x, q.y - p.y) <= c.reach) v += c.monsterCut * worksFactor(state.settlements[sid], 'lodge');
  }
  return v;
}

// ---- Toll bridges ----

const crossingCache = new WeakMap();
// Road links that cross the toll river, each given to the nearest toll
// bridge site in reach.
export function bridgeCrossings(world) {
  let out = crossingCache.get(world);
  if (out) return out;
  out = {};
  const t = I(world)?.tolls;
  const river = t && world.geography.rivers[t.river];
  if (river) {
    for (const id of Object.keys(t.bridges)) out[id] = new Set();
    for (const [a, list] of Object.entries(world.fullAdjacency)) {
      for (const e of list) {
        if (a > e.to) continue;
        const A = world.byId[a];
        const B = world.byId[e.to];
        for (let i = 1; i < river.length; i++) {
          const q = intersectSegments(A, B, { x: river[i - 1][0], y: river[i - 1][1] }, { x: river[i][0], y: river[i][1] });
          if (!q) continue;
          let best = null;
          for (const id of Object.keys(t.bridges)) {
            const d = Math.hypot(world.byId[id].x - q.x, world.byId[id].y - q.y);
            if (d <= t.reach && (!best || d < best.d)) best = { id, d };
          }
          if (best) {
            out[best.id].add(`${a}|${e.to}`);
            out[best.id].add(`${e.to}|${a}`);
          }
        }
      }
    }
  }
  crossingCache.set(world, out);
  return out;
}

// Caravans that crossed at a bridge last month, and what they paid: the
// crown's own routes over the river, the trade of the realms beyond it, and
// local carts. Ambient traffic on the map is drawn from this, never the
// other way round.
export function tollsAt(state, world, id) {
  const t = I(world).tolls;
  const bridge = t.bridges[id];
  if (!bridge) return { caravans: 0, value: 0, routes: 0 };
  const edges = bridgeCrossings(world)[id];
  let caravans = t.local;
  let routes = 0;
  for (const r of state.routes ?? []) {
    if (r.closed) continue;
    const path = routePath(world, r.from, r.to);
    if (!path) continue;
    let crosses = false;
    for (let i = 1; i < path.length && !crosses; i++) crosses = edges.has(`${path[i - 1]}|${path[i]}`);
    if (crosses) {
      routes++;
      caravans += (r.last ?? 0) * t.routeCaravansPerCrown;
    }
  }
  const trade = foreignTrade(state, world).by;
  for (const realm of bridge.realms) caravans += (trade[realm] ?? 0) * t.foreignCaravansPerCrown;
  return { caravans, value: caravans * t.perCaravan, routes };
}

// ---- The month's industry ----

// Draw a material from the realm's stockpiles, home first.
function drawStock(state, world, id, key, want) {
  noteUsed(state, world, key, want);
  const own = state.settlements[id].stock;
  const take = Math.min(own[key], want);
  own[key] -= take;
  let left = want - take;
  if (left <= 0) return want;
  const others = Object.values(state.settlements).filter((s) => !s.occupier && s.stock[key] > 0);
  const total = others.reduce((a, s) => a + s.stock[key], 0);
  const more = Math.min(left, total);
  for (const s of others) s.stock[key] -= (more * s.stock[key]) / total;
  return take + more;
}

function stockOf(state, id, key) {
  let v = 0;
  for (const s of Object.values(state.settlements)) if (!s.occupier) v += s.stock[key];
  return v;
}

// Grain beyond what a place needs to keep in store.
function spareGrain(state, world, id, season) {
  const s = state.settlements[id];
  return Math.max(0, s.stock.food - foodNeed(world, s, season) * I(world).grainReserveDays);
}

function drawGrain(state, world, id, want, season) {
  let got = 0;
  const own = Math.min(spareGrain(state, world, id, season), want);
  state.settlements[id].stock.food -= own;
  got += own;
  for (const sid of Object.keys(state.settlements)) {
    if (got >= want) break;
    if (sid === id || state.settlements[sid].occupier) continue;
    const take = Math.min(spareGrain(state, world, sid, season), want - got);
    state.settlements[sid].stock.food -= take;
    got += take;
  }
  return got;
}

function availableGrain(state, world, season) {
  let v = 0;
  for (const [sid, s] of Object.entries(state.settlements)) if (!s.occupier) v += spareGrain(state, world, sid, season);
  return v;
}

// Takes from the pool of a good, oldest makers first in proportion.
function takePool(pool, want) {
  const total = pool.reduce((a, e) => a + e.qty, 0);
  if (total <= 0) return [];
  const f = Math.min(1, want / total);
  return pool.map((e) => {
    const q = e.qty * f;
    e.qty -= q;
    return { id: e.id, qty: q };
  }).filter((e) => e.qty > 0);
}

// The month's chains, and the trades that pay directly. `put(id, crowns)`
// credits a place's own account. Run after the trade routes, whose takings
// the tolls count.
export function industryLedger(state, world, income, put, season) {
  const i = I(world);
  if (!i) return;
  const share = (id) => crownShare(state, world, state.settlements[id]);
  // Each works yields as it stands and is manned (M20).
  // Long hours (M26) drive every works harder.
  const drive = outputMult(state, world);
  const wf = (id, b) => worksFactor(state.settlements[id], b) * drive;
  const pool = {};
  for (const g of Object.keys(i.goods)) pool[g] = [];
  const flows = [];
  const made = {};
  const make = (good, id, qty) => {
    pool[good].push({ id, qty });
    made[good] = (made[good] ?? 0) + qty;
    noteMade(state, world, good, qty);
  };

  // Makers.
  for (const [b, m] of Object.entries(i.makers)) {
    for (const id of withBuilding(state, b)) make(m.good, id, m.amount * prosperityMult(world, state.settlements[id]) * wf(id, b));
  }
  // Workers, in order, so charcoal is burnt before the forges want it.
  for (const b of i.order) {
    const w = i.workers[b];
    for (const id of withBuilding(state, b)) {
      const s = state.settlements[id];
      let qty = w.amount * prosperityMult(world, s) * wf(id, b);
      for (const [k, per] of Object.entries(w.uses)) {
        const have = pool[k] ? pool[k].reduce((a, e) => a + e.qty, 0)
          : k === 'grain' ? availableGrain(state, world, season) : stockOf(state, id, k);
        qty = Math.min(qty, have / per);
      }
      if (qty <= 0) continue;
      for (const [k, per] of Object.entries(w.uses)) {
        const want = qty * per;
        if (pool[k]) {
          // Suppliers are paid the raw price out of the finished good's sale.
          noteUsed(state, world, k, want);
          for (const e of takePool(pool[k], want)) {
            const v = e.qty * i.goods[k].price * share(id);
            put(e.id, v);
            put(id, -v);
            if (e.id !== id) flows.push({ from: e.id, to: id, good: k, qty: e.qty });
          }
        } else if (k === 'grain') drawGrain(state, world, id, want, season);
        else if (MATERIALS.includes(k)) drawStock(state, world, id, k, want);
      }
      make(w.good, id, qty);
    }
  }

  // The crown keeps back arms and horses for its companies.
  const stores = state.forces?.stores;
  const caps = world.forces?.stores;
  if (stores && caps) {
    for (const g of ['arms', 'horses']) {
      const want = Math.max(0, caps[g] - stores[g]);
      for (const e of takePool(pool[g], want)) {
        stores[g] += e.qty;
        noteUsed(state, world, g, e.qty);
      }
    }
  }

  // Roads held by bandits cut what a place's goods fetch.
  const robbed = (id) => 1 - (world.forces?.roads.tradeCut ?? 0) * Math.min(1, (state.threats?.robbed[id] ?? 0) / 30);

  // Crown routes carry finished goods to ends that lack them.
  const carried = {};
  for (const r of state.routes ?? []) {
    r.goods = {};
    r.premium = 0;
    if (r.closed) continue;
    let room = i.routes.carry;
    const abroad = !state.settlements[r.from] || !state.settlements[r.to];
    const goods = Object.keys(i.goods).filter((g) => i.goods[g].finished).sort((a, b) => goodPrice(state, world, b) - goodPrice(state, world, a));
    for (const g of goods) {
      if (room <= 0) break;
      const left = pool[g].reduce((a, e) => a + e.qty, 0) - (carried[g] ?? 0);
      if (left <= 0) continue;
      if (makes(state, world, r.from, g) && makes(state, world, r.to, g)) continue;
      const q = Math.min(room, left);
      room -= q;
      carried[g] = (carried[g] ?? 0) + q;
      r.goods[g] = Math.round(q);
      const premium = q * goodPrice(state, world, g) * (abroad ? i.routes.abroad : i.routes.home);
      income.routes[routeKey(r)] = (income.routes[routeKey(r)] ?? 0) + premium;
      r.premium += Math.round(premium);
      for (const end of [r.from, r.to]) if (state.settlements[end]) put(end, premium / (state.settlements[r.from] && state.settlements[r.to] ? 2 : 1));
      const maker = pool[g].find((e) => e.qty > 0);
      if (maker) flows.push({ from: maker.id, to: state.settlements[r.from] ? r.from : r.to, good: g, qty: q });
    }
  }

  // What is left sells at home up to what the realm wants; beyond that it
  // goes to the market (M21), to be sold abroad by the crown's deals or at
  // home for less, or held back. What the realm wants and lacks is a
  // shortage that raises the price.
  const people = Object.values(state.settlements).reduce((a, s) => a + (s.occupier ? 0 : totalPopulation(s)), 0);
  for (const [g, def] of Object.entries(i.goods)) {
    const total = pool[g].reduce((a, e) => a + e.qty, 0);
    const price = goodPrice(state, world, g);
    const exported = Math.min(total, carried[g] ?? 0);
    const home = total - exported;
    const want = people * def.demand;
    const sold = Math.min(home, want);
    noteUsed(state, world, g, exported + sold);
    noteShort(state, world, g, want - home);
    if (total <= 0) continue;
    const excess = home - sold;
    let value = exported * price + sold * price;
    // Without a market, the excess sells at home at the glut price as before.
    if (excess > 0 && !offer(state, world, g, excess) && !world.market) value += excess * price * i.glut;
    const unit = value / total;
    for (const e of pool[g]) {
      const v = e.qty * unit * share(e.id) * robbed(e.id);
      income.goods[g] = (income.goods[g] ?? 0) + v;
      put(e.id, v);
    }
  }

  // Silver, tolls, rents, donations and contracts.
  for (const id of withBuilding(state, 'silvermine')) {
    const v = i.silver.amount * share(id) * wf(id, 'silvermine') * (1 + bookEffect(state, world, 'mines'));
    income.silver += v;
    put(id, v);
  }
  for (const id of withBuilding(state, 'tollbridge')) {
    const v = tollsAt(state, world, id).value * share(id) * wf(id, 'tollbridge');
    income.tolls += v;
    put(id, v);
  }
  for (const id of withBuilding(state, 'quarter')) {
    const s = state.settlements[id];
    const v = totalPopulation(s) * i.quarter.rentPerPerson * prosperityMult(world, s) * share(id) * wf(id, 'quarter');
    income.rents += v;
    put(id, v);
  }
  for (const id of withBuilding(state, 'hostel')) {
    const v = (i.hostel.base + i.hostel.perShare * (realmFaith(state).melitele ?? 0) / 100) * share(id) * wf(id, 'hostel');
    income.donations += v;
    put(id, v);
  }
  for (const id of withBuilding(state, 'shipyard')) {
    const v = i.shipyard.contracts * prosperityMult(world, state.settlements[id]) * share(id) * wf(id, 'shipyard');
    income.contracts += v;
    put(id, v);
  }

  // Carts on the map follow the biggest flows.
  flows.sort((a, b) => b.qty - a.qty);
  state.industry = { made: Object.fromEntries(Object.entries(made).map(([g, v]) => [g, Math.round(v)])), flows: flows.slice(0, 16).map((f) => ({ ...f, qty: Math.round(f.qty) })) };
}

export function defaultIndustry() {
  return { made: {}, flows: [] };
}
