// Crown trade routes: the crown backs a caravan line between two towns or
// cities, at home or in a friendly neighbour, and takes its share each
// month. A route earns from the size and fortunes of both ends, the length
// of the haul, what each end makes that the other lacks, and how safe the
// road is between them. Bandits and beasts cut it and rob its caravans;
// patrols keep it open; war closes it.
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
  return Math.max(1, t.limit.base + Math.floor(markets * t.limit.perMarket) + extra + (t.limit.guilds[state.laws.guilds?.option] ?? 0));
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
  out.parts = { size, fortunes, haul, wares, safety: safety.factor, threat: safety.avg, relation, bonus };
  out.value = size * fortunes * haul * wares * safety.factor * relation * bonus;
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

// The month's takings, a line per route, and its upkeep. Bandits on the
// road may rob a month's caravans.
export function tradeLedger(state, world, income, expenses, rng = null) {
  if (!state.routes?.length) return;
  const t = T(world);
  for (const r of state.routes) {
    const v = routeValue(state, world, r);
    let value = v.value;
    r.closed = v.closed;
    r.raided = false;
    if (!v.closed && rng && rng.chance(t.raid.chance * (1 - v.parts.safety))) {
      value = 0;
      r.raided = true;
      say(state, `Bandits robbed the crown's caravans between ${world.byId[r.from].name} and ${world.byId[r.to].name}. A month's takings lost.`);
    }
    r.last = Math.round(value);
    income.routes[routeKey(r)] = value;
    expenses.routes += t.upkeep;
  }
}
