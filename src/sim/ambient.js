// Ambient traffic: caravans, patrols and barges that make the realm look alive.
// Cosmetic only. It reads the realm (prosperity, garrisons) but never writes to
// it, and draws only from the ambient RNG stream, so turning it off or changing
// it can never alter game outcomes.
import { seasonOf } from './calendar.js';
import { dist, nearby, roadPath, polylineLength } from './world.js';
import { totalPopulation } from './state.js';
import { foreignTrade } from './neighbours.js';

export function stepAmbientDay(state, world, rng) {
  const cfg = world.ambient;
  const season = seasonOf(state.day);
  const seasonSpeed = cfg.seasonSpeed[season] ?? 1;

  const kept = [];
  for (const u of state.ambient.units) {
    u.speed = cfg.kinds[u.kind].speed * seasonSpeed;
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
  grain(state, k) {
    const flowing = Object.values(state.flows.in).reduce((a, b) => a + b, 0);
    return Math.min(1, flowing / k.flowBaseline);
  },
};

const SPAWNERS = {
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

  // Patrols ride out from strongholds to a nearby place and back.
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
  if (u.entry) {
    return `${kind} from ${world.geography.neighbours[u.entry].name}, bound for ${world.byId[u.route[u.route.length - 1]].name}`;
  }
  const from = world.byId[u.route[0]].name;
  if (u.kind === 'patrol') {
    const turn = world.byId[u.route[Math.floor(u.route.length / 2)]].name;
    return `${kind} out of ${from}, riding to ${turn} and back`;
  }
  return `${kind} from ${from}, bound for ${world.byId[u.route[u.route.length - 1]].name}`;
}
