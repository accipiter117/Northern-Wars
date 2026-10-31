// Ambient traffic: caravans, patrols and barges that make the realm look alive.
// Cosmetic only. It reads the realm (prosperity, garrisons) but never writes to
// it, and draws only from the ambient RNG stream, so turning it off or changing
// it can never alter game outcomes.
//
// Since M22 B every traveller stands for something real and carries what it
// is for, so a long press can say it in one line: merchant caravans for the
// surplus sold at home, Temerian and foreign merchants for the trade deals,
// pilgrims for a real shrine or cathedral, patrols for the companies on
// patrol orders, barges for the realm's trade on its rivers.
import { seasonOf } from './calendar.js';
import { dist, nearby, roadPath, polylineLength } from './world.js';
import { totalPopulation } from './state.js';
import { foreignTrade } from './neighbours.js';
import { realmFaith } from './culture.js';
import { visionOf, updateIntel } from './vision.js';
import { monthlyOutput, homeSalePrice, exportPrice, importPrice } from './market.js';
import { TEMERIA, hostile } from './conflict.js';

const HALTED = new Set(['caravan', 'grain', 'goods', 'route', 'export', 'foreign', 'pilgrim', 'deal']);
const HALT_RANGE = 18;

export function stepAmbientDay(state, world, rng) {
  const cfg = world.ambient;
  const season = seasonOf(state.day);
  const seasonSpeed = cfg.seasonSpeed[season] ?? 1;

  // Where bands hold the road, carts and caravans stop: stripped, or turned
  // back to wait. This only reads the threats; it never changes them.
  const bands = (state.threats?.list ?? []).filter((t) => t.band && t.band.phase === 'lurk').map((t) => t.band);
  const kept = [];
  for (const u of state.ambient.units) {
    u.speed = cfg.kinds[u.kind].speed * seasonSpeed;
    u.held = false;
    if (bands.length && HALTED.has(u.kind)) {
      const p = unitPosition(world, u, u.pos);
      if (bands.some((b) => Math.hypot(b.x - p.x, b.y - p.y) < HALT_RANGE)) {
        u.held = true;
        u.speed = 0;
      }
    }
    u.pos += u.speed;
    if (u.pos < unitLength(world, u)) kept.push(u);
  }
  state.ambient.units = kept;

  for (const kind of Object.keys(cfg.kinds)) {
    const k = cfg.kinds[kind];
    const count = kept.reduce((n, u) => n + (u.kind === kind ? 1 : 0), 0);
    let rate = season === 'winter' && k.winterSpawn !== undefined ? k.winterSpawn : k.spawnPerDay;
    rate *= RATE[kind]?.(state, k, world) ?? 1;
    // Some kinds have as many on the road as their source allows: one patrol
    // for each company out on patrol.
    const cap = Math.min(k.max, CAP[kind]?.(state, world) ?? k.max);
    if (count >= cap || !rng.chance(rate)) continue;
    const unit = SPAWNERS[kind](state, world, rng);
    if (!unit) continue;
    unit.id = state.ambient.nextId++;
    unit.kind = kind;
    unit.pos = 0;
    unit.speed = k.speed * seasonSpeed;
    kept.push(unit);
  }
  if (world.grid && state.realms) updateIntel(state, world, visionOf(state, world, travellerPositions(state, world)));
}

// Temerian units whose eyes count abroad: merchants and patrols.
export function travellerPositions(state, world, frac = 0) {
  const out = [];
  for (const u of state.ambient.units) {
    if (u.kind !== 'export' && u.kind !== 'patrol' && u.kind !== 'route') continue;
    const p = unitPosition(world, u, u.pos + (u.speed ?? 0) * frac);
    out.push({ kind: u.kind === 'route' ? 'export' : u.kind, x: p.x, y: p.y });
  }
  return out;
}

// How busy each kind of traffic is, read from the real economy.
const RATE = {
  // Merchant caravans carry the surplus sold at home (M21), and none run
  // when nothing is sold.
  caravan(state, k, world) {
    if (state.market && world.market) return Math.min(2, homeSales(state, world).total / k.tradeBaseline);
    const last = state.ledger.history.at(-1);
    if (!last) return 1;
    return Math.min(2, Math.max(0.3, (last.income.trade + last.income.sales) / k.tradeBaseline));
  },
  // Merchants both ways follow the trade deals (M21): ours out with what we
  // sell, theirs in with what we buy.
  export(state, k, world) {
    if (state.market && world.market) return Math.min(1.5, liveDeals(state, world).filter((d) => d.sell).length);
    return 1;
  },
  foreign(state, k, world) {
    if (state.market && world.market) return Math.min(1.5, liveDeals(state, world).filter((d) => d.buy).length);
    return Math.min(1.5, foreignTrade(state, world).total / k.tradeBaseline);
  },
  // Barges carry the realm's trade on its rivers: home sales and deals.
  barge(state, k, world) {
    if (!state.market || !world.market) return 1;
    const deals = liveDeals(state, world).reduce((a, d) => a + (d.sell?.value ?? 0) + (d.buy?.value ?? 0), 0);
    return Math.min(1, (homeSales(state, world).total + deals) / k.tradeBaseline);
  },
  // Patrols ride only for companies on patrol orders.
  patrol(state) {
    return patrollers(state).length ? 1 : 0;
  },
  pilgrim(state, k) {
    return Math.min(1.5, realmFaith(state).melitele / k.faithBaseline);
  },
  // Refugees only walk when somewhere is in trouble, starving or sacked.
  refugee(state) {
    let troubled = 0;
    for (const s of Object.values(state.settlements)) if (fleeing(state, s)) troubled++;
    return Math.min(1, troubled / 3);
  },
  // Columns of people driven out of a town walk while the exodus lasts (M19).
  exile(state) {
    return (state.conquest?.exodus ?? []).some((e) => e.until > state.day && e.to) ? 1 : 0;
  },
  // Crown caravans run in proportion to what the routes earn.
  route(state, k, world) {
    let v = 0;
    for (const r of state.routes ?? []) if (!r.closed) v += r.last;
    return Math.min(3, v * (world.trade?.caravansPerCrown ?? 0));
  },
  // Caravans under treaty run while a deal sends goods either way.
  deal(state) {
    const n = (state.diplomacy?.deals ?? []).filter((d) => d.items.some((i) => i.kind === 'goods' && i.left > 0)).length;
    return Math.min(1, n);
  },
  // Carts of wool, charcoal and finished goods run as the chains flow.
  goods(state, k, world) {
    const c = world.industry?.carts;
    if (!c) return 0;
    const moved = (state.industry?.flows ?? []).reduce((a, f) => a + f.qty, 0);
    return Math.min(c.max, moved * c.perUnit);
  },
  grain(state, k) {
    const flowing = Object.values(state.flows.in).reduce((a, b) => a + b, 0);
    return Math.min(1, flowing / k.flowBaseline);
  },
};

const CAP = {
  patrol: (state) => patrollers(state).length,
};

// The crown's companies out on patrol orders, free of any army or task.
function patrollers(state) {
  return (state.forces?.companies ?? []).filter((c) => !c.army && !c.task && c.order?.kind === 'patrol' && c.order.from && c.order.to);
}

// What the realm sold at home last month (M21), by good, in crowns.
function homeSales(state, world) {
  const by = {};
  let total = 0;
  for (const [g, r] of Object.entries(state.market?.report ?? {})) {
    if (!(r.sold > 0) || !world.market.goods[g]) continue;
    by[g] = Math.round(r.sold * homeSalePrice(state, world, g));
    total += by[g];
  }
  return { by, total };
}

// The trade deals running now (M21), each side with its monthly value.
function liveDeals(state, world) {
  const out = [];
  for (const [rid, d] of Object.entries(state.market?.deals ?? {})) {
    if (state.realms?.[rid]?.fallen || hostile(state, TEMERIA, rid)) continue;
    out.push({
      rid,
      sell: d.sell?.qty > 0 ? { ...d.sell, value: Math.round(d.sell.qty * exportPrice(world, d.sell.good, state)) } : null,
      buy: d.buy?.qty > 0 ? { ...d.buy, value: Math.round(d.buy.qty * importPrice(world, d.buy.good)) } : null,
    });
  }
  return out;
}

// Our places that make a market good, weighted by how much.
function makerOf(state, world, rng, good) {
  const list = world.geography.settlements.filter((st) => !state.settlements[st.id]?.occupier)
    .map((st) => ({ id: st.id, q: monthlyOutput(state, world, [st.id])[good] ?? 0 })).filter((x) => x.q > 0);
  return list.length ? weightedPick(rng, list, (x) => x.q).id : null;
}

// Our towns and cities with a market, where goods are sold.
function marketTowns(state, world) {
  return world.geography.settlements.filter((st) => (st.type === 'town' || st.type === 'city') && !state.settlements[st.id]?.occupier).map((st) => st.id);
}

// A realm's capital, or its gateway town on our border.
function partnerSeat(world, rid) {
  return world.realms?.realms[rid]?.capital ?? world.neighbours?.realms[rid]?.gateway ?? null;
}

// Places of one realm, weighted by how many live there.
function realmPick(state, world, rng, rid, filter = () => true) {
  const ids = (world.foreignByRealm[rid] ?? []).filter(filter);
  if (!ids.length) return null;
  return weightedPick(rng, ids, (id) => Math.sqrt(state.realms[rid].settlements[id].population) + 1);
}

function livelyRealms(state, world) {
  return Object.keys(state.realms ?? {}).filter((rid) => (world.foreignByRealm[rid] ?? []).length > 1 && world.realms.realms[rid]?.builds.length);
}

const SPAWNERS = {
  // A realm's own caravans, between its own towns.
  abroad(state, world, rng) {
    const realms = livelyRealms(state, world);
    if (!realms.length) return null;
    const rid = weightedPick(rng, realms, (r) => Object.values(state.realms[r].settlements).reduce((a, s) => a + s.population, 0));
    const from = realmPick(state, world, rng, rid);
    const to = realmPick(state, world, rng, rid, (id) => id !== from);
    const route = from && to ? roadPath(world, from, to, true) : null;
    return route && route.length > 1 && route.every((id) => world.realmOf[id] === rid) ? { route, realm: rid } : null;
  },

  // A realm's riders, out from a stronghold and back.
  abroad_patrol(state, world, rng) {
    const realms = livelyRealms(state, world);
    if (!realms.length) return null;
    const rid = rng.pick(realms);
    const from = realmPick(state, world, rng, rid, (id) => state.realms[rid].settlements[id].garrison >= 100);
    if (!from) return null;
    const near = world.fullAdjacency[from].map((e) => e.to).filter((id) => world.realmOf[id] === rid);
    if (!near.length) return null;
    const out = [from, rng.pick(near)];
    return { route: [...out, from], realm: rid };
  },

  // Temerian merchants carry goods into realms that trade with the crown,
  // and see the country as they go.
  export(state, world, rng) {
    // Since M21: the goods we sell under a deal, from a place that makes
    // them to the partner's seat.
    if (state.market && world.market) {
      const deals = liveDeals(state, world).filter((d) => d.sell);
      if (!deals.length) return null;
      const d = weightedPick(rng, deals, (x) => x.sell.value);
      const from = makerOf(state, world, rng, d.sell.good) ?? world.kingdom.capital;
      const to = partnerSeat(world, d.rid);
      const route = to ? roadPath(world, from, to, true) : null;
      return route && route.length > 1 ? { route, realm: d.rid, good: d.sell.good, qty: d.sell.qty, value: d.sell.value } : null;
    }
    const trade = foreignTrade(state, world).by;
    const realms = Object.keys(trade).filter((r) => trade[r] > 0 && world.foreignByRealm[r]);
    if (!realms.length) return null;
    const rid = weightedPick(rng, realms, (r) => trade[r]);
    const homes = world.geography.settlements.filter((s) => s.type === 'city' || s.type === 'town').map((s) => s.id);
    const from = rng.pick(homes);
    const to = realmPick(state, world, rng, rid);
    const route = to ? roadPath(world, from, to, true) : null;
    return route && route.length > 1 ? { route, realm: rid } : null;
  },

  // A caravan carrying a deal's goods between Vizima and the other capital,
  // whichever way the goods go.
  deal(state, world, rng) {
    const deals = (state.diplomacy?.deals ?? []).filter((d) => d.items.some((i) => i.kind === 'goods' && i.left > 0));
    if (!deals.length) return null;
    const d = rng.pick(deals);
    const item = rng.pick(d.items.filter((i) => i.kind === 'goods' && i.left > 0));
    const home = world.kingdom.capital;
    const there = world.realms?.realms[d.with]?.capital ?? world.neighbours.realms[d.with]?.gateway;
    const path = there ? roadPath(world, home, there, true) : null;
    if (!path || path.length < 2) return null;
    return { route: item.from === 'us' ? path : [...path].reverse(), realm: d.with, good: item.good };
  },

  // A crown caravan works one of the crown's trade routes, from either end.
  route(state, world, rng) {
    const open = (state.routes ?? []).filter((r) => !r.closed && r.last > 0);
    if (!open.length) return null;
    const r = weightedPick(rng, open, (x) => x.last);
    const path = roadPath(world, r.from, r.to, true);
    if (!path || path.length < 2) return null;
    return { route: rng.chance(0.5) ? [...path] : [...path].reverse(), crownRoute: r.id };
  },

  // A cart of goods from the place that made them to the one that works
  // them, or to the head of the crown route that carries them.
  goods(state, world, rng) {
    const flows = (state.industry?.flows ?? []).filter((f) => f.from !== f.to && f.qty > 0);
    if (!flows.length) return null;
    const f = weightedPick(rng, flows, (x) => x.qty);
    const route = roadPath(world, f.from, f.to);
    return route && route.length > 1 ? { route, good: f.good } : null;
  },

  // Pilgrims set out from wherever the faithful are for a real holy place:
  // the Temple of Melitele, or the nearest cathedral or shrine standing whole.
  pilgrim(state, world, rng) {
    const holy = holyPlaces(state, world);
    if (!holy.length) return null;
    const ids = world.geography.settlements.map((s) => s.id).filter((id) => !state.settlements[id]?.occupier);
    const from = weightedPick(rng, ids, (id) => totalPopulation(state.settlements[id]) * (state.settlements[id].faith.melitele + state.settlements[id].faith.eternal_fire));
    let best = null;
    for (const h of holy) {
      if (h.id === from) continue;
      const d = Math.hypot(world.byId[h.id].x - world.byId[from].x, world.byId[h.id].y - world.byId[from].y) / h.pull;
      if (!best || d < best.d) best = { d, h };
    }
    const route = best ? roadPath(world, from, best.h.id) : null;
    return route && route.length > 1 ? { route, holy: best.h.what } : null;
  },

  // A people driven out of a town walk the roads towards their kin (M19).
  exile(state, world, rng) {
    const list = (state.conquest?.exodus ?? []).filter((e) => e.until > state.day && e.to);
    if (!list.length) return null;
    const e = rng.pick(list);
    const route = roadPath(world, e.from, e.to, true);
    return route && route.length > 1 ? { route, people: e.kind } : null;
  },

  // People flee a troubled or starving place for the nearest town or city
  // that is neither.
  refugee(state, world, rng) {
    const bad = (id) => fleeing(state, state.settlements[id]);
    const sources = world.geography.settlements.map((s) => s.id).filter(bad);
    if (!sources.length) return null;
    const from = rng.pick(sources);
    let best = null;
    for (const st of world.geography.settlements) {
      if ((st.type !== 'town' && st.type !== 'city') || bad(st.id) || st.id === from) continue;
      const route = roadPath(world, from, st.id);
      if (!route) continue;
      const d = polylineLength(route.map((id) => world.byId[id]));
      if (!best || d < best.d) best = { d, route };
    }
    return best ? { route: best.route } : null;
  },

  // Merchants from abroad cross the border, pass their gateway town and
  // carry on to a Temerian market. Realms they would not trade with send none.
  foreign(state, world, rng) {
    // Since M21: the goods we buy under a deal, from the partner's seat to
    // one of our market towns.
    if (state.market && world.market) {
      const deals = liveDeals(state, world).filter((d) => d.buy);
      if (!deals.length) return null;
      const d = weightedPick(rng, deals, (x) => x.buy.value);
      const from = partnerSeat(world, d.rid);
      const to = weightedPick(rng, marketTowns(state, world), (id) => totalPopulation(state.settlements[id]));
      const route = from ? roadPath(world, from, to, true) : null;
      return route && route.length > 1 ? { route, realm: d.rid, good: d.buy.good, qty: d.buy.qty, value: d.buy.value } : null;
    }
    const trade = foreignTrade(state, world).by;
    const realms = Object.keys(trade).filter((id) => trade[id] > 0);
    if (!realms.length) return null;
    const realm = weightedPick(rng, realms, (id) => trade[id]);
    const gate = world.neighbours.realms[realm].gateway;
    const towns = world.geography.settlements.filter((s) => s.type === 'city' || s.type === 'town').map((s) => s.id);
    const to = weightedPick(rng, towns, (id) => totalPopulation(state.settlements[id]));
    const route = to === gate ? [gate] : roadPath(world, gate, to);
    return route ? { entry: realm, route } : null;
  },

  // Grain carts follow where food is actually moving: from full stores to
  // hungry ones.
  grain(state, world, rng) {
    const outs = Object.keys(state.flows.out);
    const ins = Object.keys(state.flows.in);
    if (!outs.length || !ins.length) return null;
    const from = weightedPick(rng, outs, (id) => state.flows.out[id]);
    const to = weightedPick(rng, ins, (id) => state.flows.in[id]);
    const route = from === to ? null : roadPath(world, from, to);
    return route && route.length > 1 ? { route } : null;
  },

  // Since M21: the surplus sold at home, from a place that makes the good
  // to a market town. Before, trade between places weighted by prosperity.
  caravan(state, world, rng) {
    if (state.market && world.market) {
      const sales = homeSales(state, world);
      const goods = Object.keys(sales.by);
      if (!goods.length) return null;
      const good = weightedPick(rng, goods, (g) => sales.by[g]);
      const from = makerOf(state, world, rng, good);
      if (!from) return null;
      const towns = marketTowns(state, world).filter((id) => id !== from);
      const to = weightedPick(rng, towns, (id) => totalPopulation(state.settlements[id]) / (40 + Math.hypot(world.byId[id].x - world.byId[from].x, world.byId[id].y - world.byId[from].y)));
      const route = to ? roadPath(world, from, to) : null;
      return route && route.length > 1 ? { route, good, value: sales.by[good] } : null;
    }
    const ids = world.geography.settlements.filter((s) => s.type !== 'castle').map((s) => s.id);
    const weight = (id) => {
      const s = state.settlements[id];
      return (s.prosperity / 100) * Math.sqrt(totalPopulation(s));
    };
    const from = weightedPick(rng, ids, weight);
    const to = weightedPick(rng, ids.filter((id) => id !== from), weight);
    const route = roadPath(world, from, to);
    return route && route.length > 1 ? { route } : null;
  },

  // Outriders of a company on patrol orders (M22 B), along its road and
  // back, one for each company that has none on the road yet.
  patrol(state, world, rng) {
    const out = new Set(state.ambient.units.filter((u) => u.kind === 'patrol').map((u) => u.company));
    const free = patrollers(state).filter((c) => !out.has(c.id));
    if (!free.length) return null;
    const c = rng.pick(free);
    const path = roadPath(world, c.order.from, c.order.to);
    if (!path || path.length < 2) return null;
    return { route: [...path, ...path.slice(0, -1).reverse()], company: c.id, name: c.name };
  },

  // Barges ply the rivers our towns stand on, carrying their trade; none
  // while the rivers are frozen (data: winterSpawn 0).
  barge(state, world, rng) {
    const names = Object.keys(world.rivers).filter((n) => riverTowns(state, world, n) > 0);
    if (!names.length) return null;
    const river = weightedPick(rng, names, (n) => riverTowns(state, world, n));
    return { river, reverse: rng.chance(0.5) };
  },
};

// Holy places pilgrims make for: the Temple of Melitele, and every
// cathedral and shrine of ours standing whole (cathedrals draw from further).
function holyPlaces(state, world) {
  const out = [];
  const temple = world.ambient.kinds.pilgrim.shrine;
  if (world.byId[temple] && state.settlements[temple] && !state.settlements[temple].occupier) out.push({ id: temple, pull: 3, what: 'the Temple of Melitele' });
  for (const [id, s] of Object.entries(state.settlements)) {
    if (s.occupier || id === temple) continue;
    const whole = (b) => s.buildings.includes(b) && (s.cond?.[b] ?? 100) >= 50;
    if (whole('cathedral')) out.push({ id, pull: 2, what: `the cathedral at ${world.byId[id].name}` });
    else if (whole('shrine')) out.push({ id, pull: 1, what: `the shrine at ${world.byId[id].name}` });
  }
  return out;
}

// How many of our places stand on a river (by their river spaces, named
// "the Ismena" for the Ismena).
const riverCache = new WeakMap();
function riverTowns(state, world, name) {
  let byRiver = riverCache.get(world);
  if (!byRiver) {
    byRiver = {};
    for (const [id, list] of Object.entries(world.spaces ?? {})) {
      for (const sp of list) {
        if (sp.kind !== 'river' || !sp.name) continue;
        const key = sp.name.replace(/^the /, '');
        (byRiver[key] ??= []).push(id);
      }
    }
    riverCache.set(world, byRiver);
  }
  return (byRiver[name] ?? []).filter((id) => state.settlements[id] && !state.settlements[id].occupier).length;
}

// A place people are leaving: riots, hunger, or an army through its gates.
function fleeing(state, s) {
  return s.troubled > 0 || s.hunger > 0.2 || (s.sacked ?? 0) > state.day;
}

function weightedPick(rng, items, weight) {
  let total = 0;
  const ws = items.map((it) => {
    const w = Math.max(0, weight(it));
    total += w;
    return w;
  });
  let r = rng.next() * total;
  for (let i = 0; i < items.length; i++) {
    r -= ws[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}

// Geometry. Shared with the renderer so the sim and the screen agree on where
// a unit is.

const pointCache = new WeakMap();

export function unitPoints(world, u) {
  let byUnit = pointCache.get(world);
  if (!byUnit) pointCache.set(world, (byUnit = new Map()));
  const key = u.river ? `r:${u.river}:${u.reverse ? 1 : 0}` : `p:${u.entry ?? ''}:${u.route.join(',')}`;
  let entry = byUnit.get(key);
  if (!entry) {
    let pts = u.river
      ? world.rivers[u.river].points
      : u.route.map((id) => ({ x: world.byId[id].x, y: world.byId[id].y }));
    if (u.entry) {
      const [x, y] = world.neighbours.realms[u.entry].entry;
      pts = [{ x, y }, ...pts];
    }
    if (u.river && u.reverse) pts = [...pts].reverse();
    entry = { pts, length: polylineLength(pts) };
    byUnit.set(key, entry);
  }
  return entry;
}

export function unitLength(world, u) {
  return unitPoints(world, u).length;
}

// Position at `pos` map units along the unit's path, plus heading in radians.
export function unitPosition(world, u, pos = u.pos) {
  const { pts, length } = unitPoints(world, u);
  let left = Math.max(0, Math.min(pos, length));
  for (let i = 1; i < pts.length; i++) {
    const seg = dist(pts[i - 1], pts[i]);
    if (left <= seg || i === pts.length - 1) {
      const t = seg > 0 ? Math.min(1, left / seg) : 0;
      return {
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t,
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t,
        angle: Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x),
      };
    }
    left -= seg;
  }
  return { x: pts[0].x, y: pts[0].y, angle: 0 };
}

// What a unit is and where it is going, in one line, for the tap label and
// the long press (M22 B): "Merchant caravan: timber and stone from Carreras
// to Maribor, sold at home for about 120 crowns a month".
export function describeUnit(world, u, state = null) {
  const kind = world.ambient.kinds[u.kind].name;
  const name = (id) => world.byId[id]?.name ?? id;
  const from = u.route ? name(u.route[0]) : '';
  const to = u.route ? name(u.route[u.route.length - 1]) : '';
  const crowns = (v) => `${Math.round(v).toLocaleString('en-GB')} crowns a month`;
  const good = (g) => world.market?.goods[g]?.short ?? world.industry?.goods[g]?.name.toLowerCase() ?? world.diplomacy?.goods?.[g]?.name.toLowerCase() ?? 'goods';
  const realm = (r) => world.geography.neighbours[r]?.name ?? r;
  if (u.river) {
    const { pts } = unitPoints(world, u);
    const east = pts[pts.length - 1].x > pts[0].x;
    return `${kind}: on the ${world.rivers[u.river].name}, heading ${east ? 'east' : 'west'} with the towns' trade`;
  }
  switch (u.kind) {
    case 'abroad': return `Caravan of ${realm(u.realm)}: from ${from} to ${to}`;
    case 'abroad_patrol': return `Riders of ${realm(u.realm)}: out of ${from} and back`;
    case 'exile': {
      const who = world.groups?.groups[u.people]?.name ?? 'People';
      return `${u.people === 'human' ? 'Townsfolk' : who} driven out: from ${from} to ${to}`;
    }
    case 'route': {
      const r = state?.routes?.find((x) => x.id === u.crownRoute);
      return `${kind}: on the crown's route from ${from} to ${to}${r?.last ? `, ${crowns(r.last)}` : ''}`;
    }
    case 'goods': return `Goods cart: ${good(u.good)} from ${from} to ${to}`;
    case 'deal': return `${kind}: ${good(u.good)} under our treaty with ${realm(u.realm)}, from ${from} to ${to}`;
    case 'export':
      return u.good ? `${kind}: ${u.qty} loads of ${good(u.good)} a month from ${from} to ${to} under our deal with ${realm(u.realm)}, ${crowns(u.value)}`
        : `${kind}: from ${from} to ${to} in ${realm(u.realm)}`;
    case 'foreign':
      if (u.good) return `Merchants of ${realm(u.realm)}: ${u.qty} loads of ${good(u.good)} a month from ${from} to ${to} under our deal, ${crowns(u.value)}`;
      return `Merchants of ${realm(u.entry)}: bound for ${to}`;
    case 'caravan':
      return u.good ? `${kind}: ${good(u.good)} from ${from} to ${to}, sold at home for about ${crowns(u.value)}` : `${kind}: from ${from} to ${to}`;
    case 'pilgrim': return `Pilgrims: from ${from} to ${u.holy ?? to}`;
    case 'refugee': return `Refugees: fleeing ${from} for ${to}`;
    case 'grain': return `Grain cart: from the full stores of ${from} to hungry ${to}`;
    case 'patrol': {
      const c = state?.forces?.companies.find((x) => x.id === u.company);
      const n = c?.name ?? u.name;
      const turn = name(u.route[Math.floor(u.route.length / 2)]);
      return `Patrol: ${n ? `the ${n.replace(/^The /, '')}` : 'riders'} on the road from ${from} to ${turn}`;
    }
    default: return `${kind}: from ${from} to ${to}`;
  }
}
