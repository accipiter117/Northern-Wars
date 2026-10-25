// Crown trade routes: the crown backs a caravan line between two towns or
// cities, at home or in a friendly neighbour, and takes its share each
// month. A route earns from the size and fortunes of both ends, the length
// of the haul, what each end makes that the other lacks, and how safe the
// road is between them. Bands holding its road rob its caravans; patrols
// keep it open; war closes it.
import { addDispatch, clamp } from './realm.js';
import { roadPath, polylineLength } from './world.js';
import { totalPopulation } from './state.js';
import { creditLimit, buildingEffects } from './economy.js';
import { threatLevel, patrolledSet } from './military.js';
import { tradeFactor } from './neighbours.js';
import { TEMERIA, ownerOf, hostile, sideName, placeOf } from './conflict.js';

const T = (world) => world.trade;
const say = (state, text) => addDispatch(state, text, 'treasury');

export const routeKey = (r) => `${r.from}>${r.to}`;

// Who answers for the far end of a route: the crown at home (or in a town
// it has taken), else the realm that holds it.
function endOwner(state, world, id) {
  return ownerOf(state, world, id);
}

export function routeEndOk(state, world, id) {
  const t = T(world);
  const place = world.byId[id];
  if (!place || !t.endTypes.includes(place.type)) return { ok: false, reason: 'Only towns and cities trade at this scale.' };
  const owner = endOwner(state, world, id);
  if (owner === TEMERIA) return { ok: true };
  if (!state.settlements[id] && !world.realmOf[id]) return { ok: false, reason: 'Unknown place.' };
  const n = state.neighbours[owner];
  if (!n || !world.neighbours.realms[owner]?.trade) return { ok: false, reason: `${sideName(world, owner)} does not trade with us.` };
  if (hostile(state, TEMERIA, owner)) return { ok: false, reason: `We are at war with ${sideName(world, owner)}.` };
  if (n.relation < t.foreign.minRelation) return { ok: false, reason: `${sideName(world, owner)} is not friendly enough to open its markets.` };
  return { ok: true };
}

export function routePath(world, from, to) {
  return roadPath(world, from, to, true);
}

export function routeLength(world, from, to) {
  const p = routePath(world, from, to);
  return p ? polylineLength(p.map((id) => world.byId[id])) : Infinity;
}

export function routeCost(world, from, to) {
  const t = T(world);
  return Math.round(t.cost.base + t.cost.perDistance * routeLength(world, from, to));
}

// How many routes the crown can run: a base, half a route per market hall,
// more for guildhalls and harbours, and the guild law.
export function routeLimit(state, world) {
  const t = T(world);
  let markets = 0;
  let extra = 0;
  for (const s of Object.values(state.settlements)) {
    if (s.occupier) continue;
    if (s.buildings.includes('market')) markets++;
    extra += buildingEffects(world, s).routes;
  }
  const n = t.limit.base + Math.floor(markets * t.limit.perMarket) + extra + (t.limit.guilds[state.laws.guilds?.option] ?? 0);
  return Math.max(1, Math.min(t.limit.max ?? 99, n));
}

function produce(state, world, id) {
  const s = state.settlements[id];
  if (s) return s.production;
  // Foreign wares are foreign: they always bring something we lack.
  return `abroad:${world.realmOf[id]}`;
}

// The safety of the road: Temerian stretches by their bandit and monster
// threat, foreign ones at a middling risk.
export function routeSafety(state, world, path, patrolled = patrolledSet(state, world)) {
  const t = T(world);
  let sum = 0;
  for (const id of path) {
    sum += state.settlements[id]
      ? Math.max(threatLevel(state, world, id, 'bandits', patrolled), threatLevel(state, world, id, 'monsters', patrolled))
      : 25;
  }
  const avg = sum / path.length;
  return { avg, factor: clamp(1 - avg * t.safety.perThreat, t.safety.min, 1) };
}

// A route's worth this month, with the reasons, for the ledger and the cards.
export function routeValue(state, world, r) {
  const t = T(world);
  const path = routePath(world, r.from, r.to);
  const out = { value: 0, closed: null, path, parts: {} };
  for (const id of [r.from, r.to]) {
    const s = state.settlements[id];
    if (s?.occupier) out.closed = `${world.byId[id].name} is held by ${sideName(world, s.occupier)}`;
    const owner = endOwner(state, world, id);
    if (owner !== TEMERIA && hostile(state, TEMERIA, owner)) out.closed = `war with ${sideName(world, owner)}`;
  }
  if (!path) out.closed = 'no road';
  if (out.closed) return out;
  const a = placeOf(state, world, r.from);
  const b = placeOf(state, world, r.to);
  const pop = (p) => (typeof p.population === 'number' ? p.population : totalPopulation(p));
  const size = t.base * Math.sqrt(pop(a) * pop(b));
  const fortunes = (a.prosperity + b.prosperity) / 2 / t.prosperityRef;
  const length = polylineLength(path.map((id) => world.byId[id]));
  const haul = clamp(length / t.distance.per, t.distance.min, t.distance.max);
  const wares = produce(state, world, r.from) !== produce(state, world, r.to) ? t.complement.differ : t.complement.same;
  const safety = routeSafety(state, world, path);
  // Far ends abroad pay by how warmly their realm sees us, and pay well.
  let relation = 1;
  for (const id of [r.from, r.to]) {
    const owner = endOwner(state, world, id);
    if (owner !== TEMERIA) relation *= tradeFactor(world, state.neighbours[owner].relation) * t.foreign.bonus;
  }
  let bonus = 1;
  for (const p of [a, b]) {
    if (p.buildings.includes('market')) bonus += t.marketBonus;
    if (p.stock) bonus += buildingEffects(world, p).routeValue;
  }
  // A town's merchants are only so many: routes from the same town share them.
  const others = (id) => Math.max(1, (state.routes ?? []).filter((x) => x !== r && (x.from === id || x.to === id)).length + 1);
  const crowding = 1 / Math.sqrt(Math.sqrt(others(r.from) * others(r.to)));
  out.parts = { size, fortunes, haul, wares, safety: safety.factor, threat: safety.avg, relation, bonus, crowding };
  out.value = size * fortunes * haul * wares * safety.factor * relation * bonus * crowding;
  return out;
}

export function canOpenRoute(state, world, from, to) {
  if (!from || !to || from === to) return { ok: false, reason: 'Choose two different towns.' };
  for (const id of [from, to]) {
    const check = routeEndOk(state, world, id);
    if (!check.ok) return check;
  }
  if (!state.settlements[from] && !state.settlements[to] && endOwner(state, world, from) !== TEMERIA && endOwner(state, world, to) !== TEMERIA) {
    return { ok: false, reason: 'One end must be ours.' };
  }
  if (state.routes.some((r) => (r.from === from && r.to === to) || (r.from === to && r.to === from))) return { ok: false, reason: 'That route already runs.' };
  if (!routePath(world, from, to)) return { ok: false, reason: 'No road joins them.' };
  const limit = routeLimit(state, world);
  if (state.routes.length >= limit) return { ok: false, reason: `The crown can run only ${limit} routes. Market halls, guildhalls and harbours allow more.` };
  const cost = routeCost(world, from, to);
  if (state.treasury - cost < -creditLimit(state, world)) return { ok: false, reason: 'The bankers will not lend that much.' };
  return { ok: true, cost };
}

export function openRoute(state, world, from, to) {
  const cost = routeCost(world, from, to);
  state.treasury -= cost;
  state.ledger.construction += cost;
  state.routes.push({ id: state.nextRouteId++, from, to, since: state.day, last: 0, raided: false, closed: null });
  say(state, `A crown trade route opens between ${world.byId[from].name} and ${world.byId[to].name}, for ${cost} crowns in wagons, warehouses and bribes.`);
}

export function closeRoute(state, world, id) {
  const r = state.routes.find((x) => x.id === id);
  state.routes = state.routes.filter((x) => x.id !== id);
  say(state, `The crown's trade route between ${world.byId[r.from].name} and ${world.byId[r.to].name} is wound up.`);
}

// The month's takings, a line per route, and its upkeep. A route whose road
// a band held for part of the month loses that part of its takings.
export function tradeLedger(state, world, income, expenses) {
  if (!state.routes?.length) return;
  const t = T(world);
  for (const r of state.routes) {
    const v = routeValue(state, world, r);
    let value = v.value;
    r.closed = v.closed;
    r.raided = false;
    if (!v.closed && v.path) {
      let held = 0;
      for (let i = 1; i < v.path.length; i++) {
        const k = `${v.path[i - 1]}|${v.path[i]}`;
        const k2 = `${v.path[i]}|${v.path[i - 1]}`;
        held = Math.max(held, state.threats?.blocked[k] ?? 0, state.threats?.blocked[k2] ?? 0);
      }
      if (held > 0) {
        const lost = Math.min(1, held / 30);
        value *= 1 - lost;
        r.raided = true;
        say(state, `Bandits held the road between ${world.byId[r.from].name} and ${world.byId[r.to].name} for ${held} day${held === 1 ? '' : 's'}; the crown's caravans lost ${Math.round(lost * 100)}% of the month's takings.`);
      }
    }
    r.last = Math.round(value);
    income.routes[routeKey(r)] = value;
    expenses.routes += t.upkeep;
  }
}
