// Soldiers, roads and the things that prey on them. Bandits grow where
// people are poor and angry and the country is wild; monsters where marsh,
// forest and mountain come close. Each month they may strike a settlement,
// and the fight is settled by local strength: the garrison, its walls and
// any patrol on the road. Plague, once loose, spreads along the roads.
import { addDispatch, clamp } from './realm.js';
import { totalPopulation } from './state.js';
import { roadPath } from './world.js';

const say = (state, text) => addDispatch(state, text, 'military');

const mil = (world) => world.military;

export function garrisonFactor(state, world, id) {
  const level = state.garrisonLevel?.[id] ?? 'standard';
  return mil(world).garrisonLevels[level]?.factor ?? 1;
}

export function crownSoldiers(state) {
  let n = 0;
  for (const s of Object.values(state.settlements)) if (s.holder === 'crown') n += s.garrison;
  return n;
}

export function patrolCapacity(state, world) {
  return Math.floor(crownSoldiers(state) / mil(world).patrol.soldiersPer);
}

export function patrolRoute(world, p) {
  return roadPath(world, p.from, p.to) ?? [];
}

export function patrolledSet(state, world) {
  const set = new Set();
  for (const p of state.patrols) for (const id of patrolRoute(world, p)) set.add(id);
  return set;
}

export function threatLevel(state, world, id, kind, patrolled = patrolledSet(state, world)) {
  const t = mil(world).threats[kind];
  const s = state.settlements[id];
  let v = t.base;
  for (const [terrain, add] of Object.entries(t.wild)) if (world.wildOf[id][terrain]) v += add;
  if (kind === 'bandits') {
    v += Math.max(0, 50 - s.prosperity) * t.perPovertyPoint + s.unrest * t.perUnrestPoint;
  }
  if (kind === 'monsters' && state.laws.bounties?.option === 'witchers') v += t.bounties;
  if (patrolled.has(id)) v += t.patrolled;
  if (s.cleared?.[kind] > state.day) v *= 1 - mil(world).clearedCut;
  return clamp(v, 0, 100);
}

export function localStrength(state, world, id, patrolled = patrolledSet(state, world)) {
  const s = state.settlements[id];
  let v = s.garrison * (s.buildings.includes('walls') ? mil(world).walls : 1);
  if (patrolled.has(id)) v += mil(world).patrol.strength;
  return v;
}

export function plagueActive(state, s) {
  return (s.plague ?? 0) > state.day;
}

export function quarantined(state, s) {
  return (s.quarantine ?? 0) > state.day;
}

export function monthlyThreats(state, world, rng) {
  const m = mil(world);
  const patrolled = patrolledSet(state, world);
  for (const [id, s] of Object.entries(state.settlements)) {
    for (const kind of Object.keys(m.threats)) {
      const level = threatLevel(state, world, id, kind, patrolled);
      if (!rng.chance(m.incidentChance * (level / 100))) continue;
      const attack = level * m.strengthPerThreat * (0.5 + rng.next());
      if (localStrength(state, world, id, patrolled) >= attack) continue;
      raid(state, world, id, s, kind);
    }
  }
  plagueMonth(state, world, rng);
}

function raid(state, world, id, s, kind) {
  const l = mil(world).losses[kind];
  s.prosperity = clamp(s.prosperity - l.prosperity, 0, 100);
  s.unrest = clamp(s.unrest + l.unrest, 0, 100);
  s.stock.food *= 1 - l.food;
  for (const g of ['timber', 'stone', 'iron']) s.stock[g] *= 1 - l.goods;
  let dead = 0;
  for (const p of Object.keys(s.population)) {
    const n = Math.round(s.population[p] * l.people);
    s.population[p] -= n;
    dead += n;
  }
  s.raided = state.day + l.raidedDays;
  s.raidKind = kind;
  const name = world.byId[id].name;
  say(state, kind === 'bandits'
    ? `Bandits fell on ${name}: barns emptied, a carter hanged from his own shafts${dead ? `, ${dead} dead` : ''}. The garrison was too few to stop them.`
    : `Something came out of the wilds by night at ${name}. ${dead || 'Several'} villagers taken; the rest bar their doors at dusk.`);
}

function plagueMonth(state, world, rng) {
  const p = mil(world).plague;
  const spreadTo = [];
  for (const [id, s] of Object.entries(state.settlements)) {
    if (!plagueActive(state, s)) continue;
    const care = s.priestesses || state.laws.patronage?.option === 'melitele' ? p.melitele : 1;
    let dead = 0;
    for (const k of Object.keys(s.population)) {
      const n = Math.round(s.population[k] * p.deathsPerMonth * care);
      s.population[k] -= n;
      dead += n;
    }
    if (dead) say(state, `Plague in ${world.byId[id].name}: ${dead} dead this month.`);
    if (quarantined(state, s)) continue;
    for (const { to } of world.adjacency[id]) {
      const t = state.settlements[to];
      // Those who came through it lately do not take it again.
      if (!plagueActive(state, t) && (t.plagueImmune ?? 0) <= state.day && rng.chance(p.spread)) spreadTo.push(to);
    }
  }
  for (const id of new Set(spreadTo)) {
    startPlague(state, world, id, rngLength(world, rng));
    say(state, `The plague has reached ${world.byId[id].name}.`);
  }
  for (const s of Object.values(state.settlements)) if (!plagueActive(state, s)) s.priestesses = false;
}

function rngLength(world, rng) {
  const [lo, hi] = mil(world).plague.length;
  return Math.round(lo + rng.next() * (hi - lo));
}

function startPlague(state, world, id, days) {
  const s = state.settlements[id];
  s.plague = state.day + days;
  s.plagueImmune = s.plague + mil(world).plague.immunityDays;
}

// ---- Events ----

function fits(state, world, e, id) {
  const s = state.settlements[id];
  const type = world.byId[id].type;
  if (e.types && !e.types.includes(type)) return false;
  if (e.produces && !e.produces.includes(s.production)) return false;
  for (const [kind, min] of Object.entries(e.minThreat ?? {})) if (threatLevel(state, world, id, kind) < min) return false;
  for (const need of e.needs ?? []) {
    if (need === 'unpaid' && !state.unpaid) return false;
    if (need === 'noPlagueAnywhere' && Object.values(state.settlements).some((x) => plagueActive(state, x))) return false;
  }
  return true;
}

export function monthlyEvent(state, world, rng, season) {
  if (!rng.chance(mil(world).eventChance)) return;
  const options = [];
  for (const [eid, e] of Object.entries(world.events.events)) {
    if (e.seasons && !e.seasons.includes(season)) continue;
    for (const st of world.geography.settlements) {
      if (state.events.some((p) => p.place === st.id)) continue;
      if (fits(state, world, e, st.id)) options.push({ eid, place: st.id, w: e.weight });
    }
  }
  if (!options.length) return;
  // Each kind of event gets its weight once, whatever the number of places.
  const kinds = [...new Set(options.map((o) => o.eid))];
  let roll = rng.next() * kinds.reduce((a, k) => a + world.events.events[k].weight, 0);
  const eid = kinds.find((k) => (roll -= world.events.events[k].weight) < 0) ?? kinds[kinds.length - 1];
  const place = rng.pick(options.filter((o) => o.eid === eid)).place;
  state.events.push({ id: state.nextEventId++, event: eid, place, day: state.day });
}

export function eventText(world, pending) {
  const e = world.events.events[pending.event];
  const place = world.byId[pending.place].name;
  return { title: e.title, text: e.text.replaceAll('{place}', place), choices: e.choices.map((c) => c.label), place };
}

export function stepEventsDay(state, world, rng) {
  for (const p of [...state.events]) {
    if (state.day - p.day >= mil(world).eventDefaultDays) {
      const choices = world.events.events[p.event].choices;
      resolveEvent(state, world, p.id, Math.max(0, choices.findIndex((c) => c.default)), true, rng);
    }
  }
}

export function resolveEvent(state, world, eventId, choice, ignored = false, rng = null) {
  const i = state.events.findIndex((p) => p.id === eventId);
  if (i < 0) return false;
  const pending = state.events[i];
  const c = world.events.events[pending.event].choices[choice];
  if (!c) return false;
  state.events.splice(i, 1);
  const fx = c.effects;
  const s = state.settlements[pending.place];
  if (fx.treasury) state.treasury += fx.treasury;
  if (fx.authority) state.authority = clamp(state.authority + fx.authority, 0, 100);
  for (const [g, v] of Object.entries(fx.opinion ?? {})) state.opinion[g] = clamp(state.opinion[g] + v, 0, 100);
  if (fx.unrest) s.unrest = clamp(s.unrest + fx.unrest, 0, 100);
  if (fx.prosperity) s.prosperity = clamp(s.prosperity + fx.prosperity, 0, 100);
  if (fx.garrison) s.garrison = Math.max(0, s.garrison + fx.garrison);
  if (fx.food) s.stock.food *= 1 - fx.food;
  if (fx.nearbyFood) {
    for (const { to } of world.adjacency[pending.place]) if (world.byId[to].type === 'village') state.settlements[to].stock.food *= 1 - fx.nearbyFood;
  }
  if (fx.people) for (const k of Object.keys(s.population)) s.population[k] -= Math.round(s.population[k] * fx.people);
  for (const [kind, days] of Object.entries(fx.clear ?? {})) s.cleared = { ...(s.cleared ?? {}), [kind]: state.day + days };
  if (fx.plague) {
    const [lo, hi] = mil(world).plague.length;
    startPlague(state, world, pending.place, Math.round(rng ? lo + rng.next() * (hi - lo) : (lo + hi) / 2));
  }
  if (fx.quarantine) s.quarantine = state.day + fx.quarantine;
  if (fx.priestesses) s.priestesses = true;
  const t = eventText(world, pending);
  say(state, ignored
    ? `${t.title} (${t.place}): Vizima gave no orders, so it was taken as "${c.label.toLowerCase()}".`
    : `${t.title} (${t.place}): the crown chose to ${c.label.toLowerCase()}.`);
  return true;
}

// ---- Orders ----

export function canSetGarrison(state, world, id, level) {
  const s = state.settlements[id];
  if (!s || !mil(world).garrisonLevels[level]) return { ok: false, reason: 'Unknown.' };
  if (s.holder !== 'crown') return { ok: false, reason: 'The lord keeps his own soldiers here.' };
  if ((state.garrisonLevel[id] ?? 'standard') === level) return { ok: false, reason: 'Already so.' };
  if (!world.settlementData[id].garrison) return { ok: false, reason: 'No garrison to speak of.' };
  return { ok: true };
}

export function canAddPatrol(state, world, from, to) {
  if (from === to || !world.byId[from] || !world.byId[to]) return { ok: false, reason: 'Choose two different places.' };
  if (state.patrols.length >= patrolCapacity(state, world)) return { ok: false, reason: `Too few soldiers for another patrol (one per ${mil(world).patrol.soldiersPer}).` };
  if (state.patrols.some((p) => (p.from === from && p.to === to) || (p.from === to && p.to === from))) return { ok: false, reason: 'Already patrolled.' };
  if (!roadPath(world, from, to)) return { ok: false, reason: 'No road joins them.' };
  return { ok: true };
}

export function addPatrol(state, world, from, to) {
  state.patrols.push({ id: state.nextPatrolId++, from, to });
  say(state, `A patrol now rides the road from ${world.byId[from].name} to ${world.byId[to].name}.`);
}
