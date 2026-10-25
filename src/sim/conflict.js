// Who holds what, and who is at war with whom. A Temerian town taken by an
// enemy keeps its place in state.settlements but carries an `occupier`; a
// foreign town taken by Temeria or a third realm carries an `owner`. Wars
// remember every town that changed hands in them, so a peace can hand them
// back or let them stand.
import { totalPopulation } from './state.js';
import { clamp } from './realm.js';

export const TEMERIA = 'temeria';

const W = (world) => world.war;

export function originOf(world, id) {
  return world.realmOf[id] ?? TEMERIA;
}

export function ownerOf(state, world, id) {
  const home = state.settlements[id];
  if (home) return home.occupier ?? TEMERIA;
  const rid = world.realmOf[id];
  return state.realms?.[rid]?.settlements[id]?.owner ?? rid;
}

// A Temerian settlement still governed from Vizima.
export function crownHolds(state, id) {
  return !state.settlements[id]?.occupier;
}

export function sideName(world, side) {
  return side === TEMERIA ? world.kingdom.name : world.geography.neighbours[side]?.name ?? side;
}

export function sideColours(world, side) {
  return side === TEMERIA ? ['#23365e', '#efe6cf'] : world.realms?.realms[side]?.colours ?? ['#555', '#eee'];
}

// The record of a place, at home or abroad, for the things war does to it.
export function placeOf(state, world, id) {
  return state.settlements[id] ?? state.realms?.[world.realmOf[id]]?.settlements[id] ?? null;
}

export function peopleAt(state, world, id) {
  const p = placeOf(state, world, id);
  if (!p) return 0;
  return typeof p.population === 'number' ? p.population : totalPopulation(p);
}

export function hasWalls(state, world, id) {
  return !!placeOf(state, world, id)?.buildings.includes('walls');
}

// Every place a side holds, at home and abroad.
export function placesHeldBy(state, world, side) {
  const out = [];
  for (const id of Object.keys(state.settlements)) if (ownerOf(state, world, id) === side) out.push(id);
  for (const realm of Object.values(state.realms ?? {})) {
    for (const id of Object.keys(realm.settlements)) if (ownerOf(state, world, id) === side) out.push(id);
  }
  return out;
}

export function valueOf(state, world, id) {
  const v = W(world).values;
  const capital = id === world.kingdom.capital || world.realms?.realms[world.realmOf[id]]?.capital === id;
  return v[world.byId[id].type] * (capital ? v.capital : 1);
}

// Damage to a place: prosperity and people lost, food carried off, anger.
export function hurtPlace(state, world, id, { prosperity = 0, people = 0, food = 0, unrest = 0 }) {
  const p = placeOf(state, world, id);
  if (!p) return;
  p.prosperity = clamp(p.prosperity - prosperity, 0, 100);
  if (typeof p.population === 'number') p.population = Math.round(p.population * (1 - people));
  else for (const k of Object.keys(p.population)) p.population[k] -= Math.round(p.population[k] * people);
  if (p.stock) p.stock.food *= 1 - food;
  if (p.unrest !== undefined) p.unrest = clamp(p.unrest + unrest, 0, 100);
}

// ---- Wars ----

export function sideIndex(war, realm) {
  if (war.sides[0].includes(realm)) return 0;
  if (war.sides[1].includes(realm)) return 1;
  return -1;
}

export function warBetween(state, a, b) {
  for (const w of state.wars ?? []) {
    const ia = sideIndex(w, a);
    const ib = sideIndex(w, b);
    if (ia >= 0 && ib >= 0 && ia !== ib) return w;
  }
  return null;
}

export function hostile(state, a, b) {
  return a !== b && !!warBetween(state, a, b);
}

export function warsOf(state, realm) {
  return (state.wars ?? []).filter((w) => sideIndex(w, realm) >= 0);
}

export function atWar(state, realm) {
  return warsOf(state, realm).length > 0;
}

export function enemiesOf(state, realm) {
  const out = new Set();
  for (const w of warsOf(state, realm)) for (const r of w.sides[1 - sideIndex(w, realm)]) out.add(r);
  return [...out];
}

const pairKey = (a, b) => [a, b].sort().join('|');

export function truceUntil(state, a, b) {
  return state.truces?.[pairKey(a, b)] ?? 0;
}

export function setTruce(state, a, b, until) {
  (state.truces ??= {})[pairKey(a, b)] = until;
}

// Value of the towns one side of a war has taken from the other in it.
export function heldValue(state, world, war, side) {
  let v = 0;
  for (const t of war.taken) {
    if (sideIndex(war, ownerOf(state, world, t.id)) === side && sideIndex(war, t.from) === 1 - side) v += valueOf(state, world, t.id);
  }
  return v;
}

// How the war stands for one side: battles won plus ground held, less the
// same for the other side. Positive means winning.
export function warScore(state, world, war, side) {
  const other = 1 - side;
  return war.points[side] - war.points[other] + heldValue(state, world, war, side) - heldValue(state, world, war, other);
}

// How tired of the war a side is, 0 to 100: its length, its dead and the
// ground it has lost.
export function exhaustion(state, world, war, side) {
  const p = W(world).peace;
  const months = (state.day - war.since) / 30;
  const lostShare = war.lost[side] / Math.max(200, war.base[side]);
  return clamp(months * p.exhaustionPerMonth + lostShare * p.exhaustionPerLoss + heldValue(state, world, war, 1 - side) * p.exhaustionPerValue, 0, 100);
}

// A town changes hands: note it in the war, so a peace can settle it.
export function recordCapture(war, id, from, to, day) {
  const i = war.taken.findIndex((t) => t.id === id);
  if (i < 0) war.taken.push({ id, from, to, day });
  else if (war.taken[i].from === to) war.taken.splice(i, 1);
  else war.taken[i].to = to;
}

export function setOwner(state, world, id, side) {
  const home = state.settlements[id];
  if (home) {
    if (side === TEMERIA) delete home.occupier;
    else {
      home.occupier = side;
      home.occupiedSince = state.day;
    }
    return;
  }
  const s = placeOf(state, world, id);
  if (side === world.realmOf[id]) delete s.owner;
  else s.owner = side;
}

// Soldiers drawn from each place's garrison into armies in the field. Those
// garrisons are not refilled while their men are away.
export function leviedMap(state) {
  const out = {};
  for (const a of state.armies ?? []) for (const [id, n] of Object.entries(a.levy)) out[id] = (out[id] ?? 0) + n;
  return out;
}

export function besieged(state, id) {
  return (state.armies ?? []).some((a) => a.siege && a.at === id);
}
