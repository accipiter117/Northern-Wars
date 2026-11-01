// Who rules each town now (M19). A town taken in war is only occupied; it
// changes realm when a peace, a deal, a revolt or a defecting house says so.
// Then it moves for good: a foreign town Temeria gains becomes a full crown
// settlement, governed like any other, and a Temerian town lost becomes a
// record of the realm that took it. state.lands keeps every town whose realm
// differs from the one it had when the reign began; the world's lists of
// home and foreign towns, and Temeria's own road network, follow it.
import { registerHouses } from './newhouses.js';
import { newSettlement, totalPopulation } from './state.js';
import { seasonOf } from './calendar.js';
import { addDispatch, clamp } from './realm.js';
import { TEMERIA, ownerOf, originOf, realmNow, sideName } from './conflict.js';
import { affinity } from './audiences.js';
import { askGrant } from './conquest.js';
import { worksSummary } from './works.js';

const C = (world) => world.conquest;

// ---- The world follows the state ----

// Rebuilds the world's lists of home and foreign towns from state.lands.
// Cheap when nothing has changed; every entry point (createState, step,
// applyAction, a loaded save) calls it, so a world shared by many states
// (the tests, the tools) always matches the state in hand.
export function syncWorld(world, state) {
  // Houses raised in this reign (M27 E) are known to the world by their ids.
  registerHouses(world, state);
  if (!world.foreign) return world;
  const lands = state?.lands ?? {};
  const key = Object.keys(lands).sort().map((id) => `${id}:${lands[id].realm}`).join(',');
  if (key === world.landsKey) return world;
  const base = (world.base ??= {
    home: [...world.geography.settlements],
    foreign: [...world.foreign],
    settlementData: { ...world.settlementData },
    byId: { ...world.byId },
    realms: Object.keys(world.foreignByRealm),
  });
  const home = [];
  const foreign = [];
  const realmOf = {};
  const byRealm = Object.fromEntries(base.realms.map((r) => [r, []]));
  const settlementData = { ...base.settlementData };
  for (const g0 of [...base.home, ...base.foreign]) {
    const was = g0.realm ?? TEMERIA;
    const now = lands[g0.id]?.realm ?? was;
    let g = g0;
    if (now !== was) {
      const { realm, ...rest } = g0;
      g = now === TEMERIA ? rest : { ...rest, realm: now };
    }
    world.byId[g.id] = g;
    if (now === TEMERIA) {
      home.push(g);
      if (now !== was) settlementData[g.id] = lands[g.id].base;
    } else {
      foreign.push(g);
      realmOf[g.id] = now;
      (byRealm[now] ??= []).push(g.id);
      delete settlementData[g.id];
    }
  }
  // Temeria's own roads: every road between two of its towns, wherever it
  // was first laid.
  const adjacency = {};
  for (const g of home) adjacency[g.id] = world.fullAdjacency[g.id].filter((e) => !realmOf[e.to] && world.fullAdjacency[e.to]);
  world.geography.settlements = home;
  world.foreign = foreign;
  world.realmOf = realmOf;
  world.foreignByRealm = byRealm;
  world.settlementData = settlementData;
  world.adjacency = adjacency;
  world.pathCache.clear();
  world.landsKey = key;
  world.landsVersion += 1;
  return world;
}

// ---- Peoples ----

export function peopleOf(world, realm) {
  return C(world)?.peoples[realm] ?? C(world)?.peoples.temeria ?? { name: realm, adjective: realm, distance: 0 };
}

// Faith of a people as whole percentages, as Temerian towns keep it.
function faithMix(world, realm) {
  const f = peopleOf(world, realm).faith ?? { eternal_fire: 0.2, melitele: 0.6, old_ways: 0.2 };
  const out = {};
  for (const [k, v] of Object.entries(f)) out[k] = Math.round(v * 100);
  return out;
}

function splitPeople(world, realm, total) {
  const mix = peopleOf(world, realm).mix ?? { human: 0.94, dwarf: 0.02, elf: 0.02, halfling: 0.02 };
  const out = {};
  for (const [k, v] of Object.entries(mix)) out[k] = Math.round(total * v);
  return out;
}

// ---- Moving a town between realms ----

// The realm a town belongs to now differs from its owner, and no war is
// still being fought over it: the town changes realm for good. Called after
// every peace, deal and revolt, and each month (which also settles saves
// from before M19).
export function settleOwnership(state, world, { quiet = false } = {}) {
  if (!C(world)) return [];
  const contested = new Set((state.wars ?? []).flatMap((w) => w.taken.map((t) => t.id)));
  const moved = [];
  for (const id of Object.keys(world.byId)) {
    if (!world.fullAdjacency[id] || contested.has(id)) continue;
    const owner = ownerOf(state, world, id);
    const now = realmNow(world, id);
    if (owner === now || !owner) continue;
    if (owner !== TEMERIA && !state.realms[owner]) continue;
    moved.push({ id, from: now, to: owner });
    transferTown(state, world, id, owner, { quiet });
  }
  if (moved.length) fallenRealms(state, world, moved);
  return moved;
}

export function transferTown(state, world, id, to, { quiet = false, how = 'peace' } = {}) {
  const from = realmNow(world, id);
  if (from === to) return;
  let base = null;
  if (from === TEMERIA) homeToForeign(state, world, id, to);
  else if (to === TEMERIA) base = foreignToHome(state, world, id, from, how);
  else foreignToForeign(state, world, id, from, to);
  const lands = (state.lands ??= {});
  if (to === originOf(world, id)) delete lands[id];
  else lands[id] = { realm: to, since: state.day, ...(base ? { base } : {}) };
  syncWorld(world, state);
  // A town won from abroad: the crown decides who is to hold it.
  if (to === TEMERIA && base) askGrant(state, world, id);
  if (!quiet) {
    const name = world.byId[id].name;
    if (to === TEMERIA) addDispatch(state, `${name} is Temerian now: its people answer to Vizima and pay the crown's taxes.`, 'military');
    else if (from === TEMERIA) addDispatch(state, `${name} is lost to ${sideName(world, to)}. The crown's writ no longer runs there.`, 'military');
  }
}

function foreignToHome(state, world, id, rid, how) {
  const rec = state.realms[rid].settlements[id];
  const geo = world.byId[id];
  const origin = rec.origin ?? originOf(world, id);
  const start = world.realms.startByType[geo.type] ?? { garrison: 0 };
  const total = rec.population ?? 0;
  const population = rec.peoples && Math.abs(Object.values(rec.peoples).reduce((a, b) => a + b, 0) - total) < total * 0.5 + 10
    ? scale(rec.peoples, total) : splitPeople(world, origin, total);
  const wasHome = origin === TEMERIA && world.base?.settlementData[id];
  const base = wasHome ? null : {
    population: { ...population },
    faith: rec.faith ?? faithMix(world, origin),
    prosperity: Math.round(rec.prosperity),
    unrest: 20,
    production: workOfPlace(world, id),
    garrison: start.garrison,
    holder: 'crown',
  };
  const s = newSettlement(world, base ?? world.base.settlementData[id], seasonOf(state.day));
  s.population = population;
  if (rec.faith) s.faith = { ...rec.faith };
  s.prosperity = rec.prosperity;
  s.garrison = Math.round(rec.garrison);
  s.buildings = [...rec.buildings].filter((b) => world.buildings[b]);
  s.damaged = [...(rec.damaged ?? [])];
  // Its works come with their condition, damage included (M20).
  if (rec.cond) s.cond = { ...rec.cond };
  if (rec.worn) s.worn = { ...rec.worn };
  if (rec.grudge) s.grudge = rec.grudge;
  s.unrest = rec.unrest ?? 25;
  s.holder = 'crown';
  s.origin = origin;
  if (origin !== TEMERIA) {
    s.integration = rec.integration ?? integrationStart(state, world, id, origin, rec);
    s.conquered = { day: state.day, from: rid, how: rec.treated ?? 'spared', found: [...s.buildings], works: worksSummary(s).mean };
  }
  if (rec.smoulder) s.smoulder = rec.smoulder;
  if (rec.expelled) s.expelled = rec.expelled;
  // A seam the old rulers worked becomes a deposit of the crown's.
  if (rec.gold && state.gold && !state.gold.deposits[id]) {
    state.gold.deposits[id] = { known: true, remaining: Math.round((rec.gold.months ?? 12) * (C(world).goldPerMonth ?? 100)) };
  }
  state.settlements[id] = s;
  delete state.realms[rid].settlements[id];
  return base;
}

function homeToForeign(state, world, id, rid) {
  const s = state.settlements[id];
  state.realms[rid].settlements[id] = {
    population: totalPopulation(s),
    prosperity: s.prosperity,
    garrison: s.garrison,
    buildings: [...s.buildings],
    construction: null,
    peoples: { ...s.population },
    faith: { ...s.faith },
    origin: s.origin ?? TEMERIA,
    unrest: s.unrest,
    integration: s.origin === rid ? 90 : C(world).integration.start,
    ...(s.damaged?.length ? { damaged: [...s.damaged] } : {}),
    ...(s.cond ? { cond: { ...s.cond } } : {}),
    ...(s.worn ? { worn: { ...s.worn } } : {}),
    ...(s.smoulder ? { smoulder: s.smoulder } : {}),
  };
  delete state.settlements[id];
  forget(state, world, id);
}

function foreignToForeign(state, world, id, from, to) {
  const rec = state.realms[from].settlements[id];
  delete rec.owner;
  rec.origin ??= originOf(world, id);
  if (rec.integration === undefined) rec.integration = rec.origin === to ? 90 : C(world).integration.start;
  state.realms[to].settlements[id] = rec;
  delete state.realms[from].settlements[id];
}

function scale(peoples, total) {
  const sum = Object.values(peoples).reduce((a, b) => a + b, 0) || 1;
  const out = {};
  for (const [k, v] of Object.entries(peoples)) out[k] = Math.round((v * total) / sum);
  return out;
}

const WORK = { mountains: 'iron', hills: 'stone', forest: 'timber' };
function workOfPlace(world, id) {
  return WORK[world.terrainOf[id]] ?? 'food';
}

// A town gone from the crown takes nothing of the crown's with it: routes
// through it close, companies stationed there fall back on Vizima, and the
// petitions and events it raised are forgotten.
function forget(state, world, id) {
  state.routes = (state.routes ?? []).filter((r) => r.from !== id && r.to !== id);
  const cap = world.kingdom.capital;
  for (const c of state.forces?.companies ?? []) {
    if (c.station === id || c.home === id) {
      c.station = cap;
      c.home = cap;
      c.order = { kind: 'station' };
      c.task = null;
    }
  }
  delete state.ledger?.places?.[id];
  delete state.garrisonLevel?.[id];
  state.petitions = (state.petitions ?? []).filter((p) => p.place !== id);
  state.events = (state.events ?? []).filter((p) => p.place !== id);
  if (state.ambient?.units) state.ambient.units = state.ambient.units.filter((u) => !(u.route ?? []).includes(id) && u.home !== id);
}

// ---- Integration ----

// Where a conquered town's feeling for its new crown starts: spared or
// sacked, how far its people and faith stand from Temeria's, and how bloody
// the war was.
export function integrationStart(state, world, id, origin, rec = {}) {
  const c = C(world);
  const i = c.integration;
  let v = i.start - peopleOf(world, origin).distance * i.distance;
  const theirs = peopleOf(world, origin).faith;
  if (theirs) {
    const ours = state.settlements ? realmFaithShare(state) : null;
    if (ours) v -= faithGap(theirs, ours) * i.faithDistance;
  }
  if (rec.treated === 'sacked') v += c.capture.sack.integration;
  else if (rec.treated === 'expelled') v += c.capture.expel.integration;
  else v += c.capture.spare.integration;
  if (rec.bloody) v -= i.bloody * Math.min(1, rec.bloody / i.bloodyAt);
  return clamp(Math.round(v), 0, 100);
}

function realmFaithShare(state) {
  const out = { eternal_fire: 0, melitele: 0, old_ways: 0 };
  let n = 0;
  for (const s of Object.values(state.settlements)) {
    if (s.origin && s.origin !== TEMERIA) continue;
    const pop = totalPopulation(s);
    for (const k of Object.keys(out)) out[k] += ((s.faith?.[k] ?? 0) / 100) * pop;
    n += pop;
  }
  for (const k of Object.keys(out)) out[k] /= Math.max(1, n);
  return out;
}

function faithGap(a, b) {
  let d = 0;
  for (const k of Object.keys(b)) d += Math.abs((a[k] ?? 0) - b[k]);
  return d / 2;
}

// ---- Realms that fall ----

// A realm left with no towns is no more: its ruler goes into exile as a
// claimant, at the court of the realm most hostile to whoever took the last
// of its lands.
function fallenRealms(state, world, moved) {
  for (const rid of Object.keys(state.realms)) {
    const realm = state.realms[rid];
    if (realm.fallen || (world.foreignByRealm[rid] ?? []).length) continue;
    const last = moved.filter((m) => m.from === rid).at(-1);
    fallRealm(state, world, rid, last?.to ?? TEMERIA);
  }
}

export function fallRealm(state, world, rid, by) {
  const realm = state.realms[rid];
  realm.fallen = { day: state.day, by };
  realm.army = 0;
  realm.aim = null;
  realm.posture = null;
  for (const t of [...(state.diplomacy?.treaties ?? [])]) {
    if (t.a === rid || t.b === rid) state.diplomacy.treaties = state.diplomacy.treaties.filter((x) => x !== t);
  }
  state.tributes = (state.tributes ?? []).filter((t) => t.from !== rid && t.to !== rid);
  state.musters = (state.musters ?? []).filter((m) => m.realm !== rid && m.against !== rid);
  for (const w of [...(state.wars ?? [])]) {
    for (const side of w.sides) {
      const i = side.indexOf(rid);
      if (i >= 0) side.splice(i, 1);
    }
  }
  state.armies = (state.armies ?? []).filter((a) => a.side !== rid);
  const host = hostOf(state, world, rid, by);
  (state.claimants ??= []).push({
    realm: rid, legitimacy: C(world).claimant.legitimacy, since: state.day, host, against: by, funded: 0,
  });
  const name = world.geography.neighbours[rid]?.name ?? rid;
  const text = `${name} is no more. Its last town has fallen to ${sideName(world, by)}, and its ruler has fled into exile${host ? ` at the court of ${sideName(world, host)}` : ''}, still claiming the crown.`;
  addDispatch(state, text, by === TEMERIA ? 'military' : 'abroad');
}

// The court most hostile to the conqueror takes the exile in.
export function hostOf(state, world, rid, by) {
  let best = null;
  for (const [pid, realm] of Object.entries(state.realms)) {
    if (pid === rid || pid === by || realm.fallen || pid === 'brokilon') continue;
    const view = by === TEMERIA ? state.neighbours[pid]?.relation ?? 0 : affinity(state, world, pid, by);
    if (!best || view < best.v) best = { pid, v: view };
  }
  return best?.pid ?? null;
}

// The realms still standing.
export function livingRealms(state) {
  return Object.keys(state.realms ?? {}).filter((rid) => !state.realms[rid].fallen);
}

export function isFallen(state, rid) {
  return !!state.realms?.[rid]?.fallen;
}
