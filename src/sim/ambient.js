// Ambient traffic: caravans, patrols and barges that make the realm look alive.
// Cosmetic only. It reads the realm (prosperity, garrisons) but never writes to
// it, and draws only from the ambient RNG stream, so turning it off or changing
// it can never alter game outcomes.
import { seasonOf } from './calendar.js';
import { dist, nearby, roadPath, polylineLength } from './world.js';
import { totalPopulation } from './state.js';
import { foreignTrade } from './neighbours.js';
import { realmFaith } from './culture.js';
import { visionOf, updateIntel } from './vision.js';

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
    if (count >= k.max || !rng.chance(rate)) continue;
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
  caravan(state, k) {
    const last = state.ledger.history.at(-1);
    if (!last) return 1;
    return Math.min(2, Math.max(0.3, (last.income.trade + last.income.sales) / k.tradeBaseline));
  },
  foreign(state, k, world) {
    return Math.min(1.5, foreignTrade(state, world).total / k.tradeBaseline);
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

  // Pilgrims set out for the Temple of Melitele from wherever her faithful are.
  pilgrim(state, world, rng) {
    const shrine = world.ambient.kinds.pilgrim.shrine;
    if (!world.byId[shrine]) return null;
    const ids = world.geography.settlements.map((s) => s.id).filter((id) => id !== shrine);
    const from = weightedPick(rng, ids, (id) => totalPopulation(state.settlements[id]) * state.settlements[id].faith.melitele);
    const route = roadPath(world, from, shrine);
    return route && route.length > 1 ? { route } : null;
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

  // Trade flows between places with people and money, so both ends are
  // weighted by prosperity and size.
  caravan(state, world, rng) {
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

  // Garrison riders go out from strongholds to a nearby place and back.
  // (The crown's patrolling companies are on the map in their own right.)
  patrol(state, world, rng) {
    const bases = world.geography.settlements
      .filter((s) => state.settlements[s.id].garrison >= 100)
      .map((s) => s.id);
    if (!bases.length) return null;
    const from = weightedPick(rng, bases, (id) => state.settlements[id].garrison);
    const reach = nearby(world, from, world.ambient.kinds.patrol.reach);
    if (!reach.length) return null;
    const out = roadPath(world, from, rng.pick(reach));
    return { route: [...out, ...out.slice(0, -1).reverse()] };
  },

  barge(state, world, rng) {
    const names = Object.keys(world.rivers);
    if (!names.length) return null;
    const river = weightedPick(rng, names, (n) => world.rivers[n].length);
    return { river, reverse: rng.chance(0.5) };
  },
};

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

// What a unit is and where it is going, in words, for the tap label.
export function describeUnit(world, u) {
  const kind = world.ambient.kinds[u.kind].name;
  if (u.river) {
    const { pts } = unitPoints(world, u);
    const east = pts[pts.length - 1].x > pts[0].x;
    return `${kind} on the ${world.rivers[u.river].name}, heading ${east ? 'east' : 'west'}`;
  }
  if (u.kind === 'abroad' || u.kind === 'abroad_patrol') {
    const realm = world.geography.neighbours[u.realm].name;
    if (u.kind === 'abroad_patrol') return `Riders of ${realm} out of ${world.byId[u.route[0]].name}`;
    return `A caravan of ${realm} from ${world.byId[u.route[0]].name}, bound for ${world.byId[u.route[u.route.length - 1]].name}`;
  }
  if (u.kind === 'exile') {
    const who = world.groups?.groups[u.people]?.name ?? 'People';
    return `${u.people === 'human' ? 'Townsfolk' : who} driven out of ${world.byId[u.route[0]].name}, on the road to ${world.byId[u.route[u.route.length - 1]].name}`;
  }
  if (u.kind === 'route') {
    return `${kind} on the crown's route, from ${world.byId[u.route[0]].name} bound for ${world.byId[u.route[u.route.length - 1]].name}`;
  }
  if (u.kind === 'goods') {
    const good = world.industry.goods[u.good]?.name.toLowerCase() ?? 'goods';
    return `A cart of ${good} from ${world.byId[u.route[0]].name}, bound for ${world.byId[u.route[u.route.length - 1]].name}`;
  }
  if (u.kind === 'deal') {
    const good = world.diplomacy?.goods[u.good]?.name.toLowerCase() ?? 'goods';
    return `A caravan of ${good} under our treaty with ${world.geography.neighbours[u.realm].name}, from ${world.byId[u.route[0]].name} bound for ${world.byId[u.route[u.route.length - 1]].name}`;
  }
  if (u.kind === 'export') {
    return `${kind} from ${world.byId[u.route[0]].name}, bound for ${world.byId[u.route[u.route.length - 1]].name} in ${world.geography.neighbours[u.realm].name}`;
  }
  if (u.entry) {
    return `${kind} from ${world.geography.neighbours[u.entry].name}, bound for ${world.byId[u.route[u.route.length - 1]].name}`;
  }
  const from = world.byId[u.route[0]].name;
  if (u.kind === 'refugee') {
    return `${kind} fleeing ${from}, making for ${world.byId[u.route[u.route.length - 1]].name}`;
  }
  if (u.kind === 'patrol') {
    const turn = world.byId[u.route[Math.floor(u.route.length / 2)]].name;
    return `${kind} out of ${from}, riding to ${turn} and back`;
  }
  return `${kind} from ${from}, bound for ${world.byId[u.route[u.route.length - 1]].name}`;
}
