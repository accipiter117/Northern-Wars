// Spies (M31 A). Every great power keeps a network in each other realm,
// 0 to 100 deep. A network grows each month with its master's skill, the
// coin spent on it and how open the target is, less the target's own
// watchfulness, and fades by a share of its depth, so each settles where
// growth and fading meet. The crown's networks are run by a spymaster, an
// office the player fills from a few candidates; deep foreign networks in
// Temeria may buy him or kill him. Operations come with Part B, caught
// agents with Part C.
import { addDispatch, clamp } from './realm.js';
import { makeRng, streamSeed } from './rng.js';
import { sideName } from './conflict.js';
import { bookEffect } from './book.js';

const TEMERIA = 'temeria';
const S = (world) => world.spies;
const pick = (map, key) => map?.[key] ?? map?.default ?? 0;
const living = (state, rid) => rid === TEMERIA || (state.realms?.[rid] && !state.realms[rid].fallen);

// Who keeps networks: the great powers in data/spies.json that stand.
export function spyOwners(state, world) {
  return Object.keys(S(world)?.owners ?? {}).filter((o) => living(state, o));
}

// Every realm a network may reach from an owner.
export function spyTargets(state, world, owner) {
  return [TEMERIA, ...Object.keys(state.realms ?? {})].filter((r) => r !== owner && living(state, r));
}

export function newSpycraft(state, world) {
  const c = S(world);
  if (!c) return null;
  const nets = {};
  for (const [o, def] of Object.entries(c.owners)) {
    if (!living(state, o)) continue;
    nets[o] = {};
    for (const t of spyTargets(state, world, o)) nets[o][t] = pick(def.start, t);
  }
  const sc = { nets, budget: 0, spymaster: null, candidates: [], candidatesDay: state.day, nextId: 1 };
  sc.candidates = drawCandidates(state, world, sc);
  return sc;
}

// Candidates come from their own stream, so drawing them never moves the
// game's dice.
function drawCandidates(state, world, sc) {
  const m = S(world).spymaster;
  const rng = makeRng(streamSeed(state.seed ?? 1, 31000 + Math.floor(state.day / m.refreshDays)));
  const pool = [...m.pool];
  const traits = Object.keys(m.traits);
  const out = [];
  while (out.length < m.candidates && pool.length) {
    const p = pool.splice(rng.int(pool.length), 1)[0];
    const trait = traits[rng.int(traits.length)];
    const base = p.skill[0] + rng.int(p.skill[1] - p.skill[0] + 1);
    out.push({ id: sc.nextId++, name: p.name, from: p.from, trait, skill: clamp(base + m.traits[trait].skill, 10, 95) });
  }
  return out;
}

export const spycraftOf = (state) => state.spycraft ?? null;
export const netDepth = (state, owner, target) => state.spycraft?.nets?.[owner]?.[target] ?? 0;
export const ourDepth = (state, rid) => netDepth(state, TEMERIA, rid);

// What a depth of ours shows or allows, as data/spies.json lists it.
export function unlocked(world, depth, key) {
  const u = S(world)?.unlocks.find((x) => x.key === key);
  return !!u && depth >= u.at;
}

// Whether we see into a realm as though an agent sat there: a network deep
// enough to show its armies, or an agent sent in (the old single spy).
export function hasSpy(state, world, rid) {
  if ((state.spies?.[rid] ?? 0) > state.day) return true;
  return unlocked(world, ourDepth(state, rid), 'armies');
}

// Whether we know a realm's plans (its aims and the war it weighs).
export function knowsPlans(state, world, rid) {
  return unlocked(world, ourDepth(state, rid), 'plans');
}

function skillOf(state, world, owner) {
  const c = S(world);
  if (owner !== TEMERIA) return c.owners[owner].skill;
  const sm = state.spycraft?.spymaster;
  const skill = sm ? sm.skill : c.owners[TEMERIA].skill;
  // A turned spymaster works for the new masters first.
  return sm?.turned ? skill / 2 : skill;
}

function spendOf(state, world, owner) {
  const c = S(world);
  if (owner === TEMERIA) return Math.max(c.minFactor, (state.spycraft?.budget ?? 0) / c.budgetFull);
  return c.minFactor + (1 - c.minFactor) * c.owners[owner].spend;
}

// How hard a realm is to work in: its own watch at home, and in Temeria the
// spymaster's (unless he has been bought by the very network he watches).
export function guardOf(state, world, target, owner = null) {
  const c = S(world);
  let g = pick(c.homeGuard, target);
  const sm = state.spycraft?.spymaster;
  if (target === TEMERIA && sm && sm.turned !== owner) g += sm.skill / 4;
  // Curfews, the king's riders and the inquisition catch agents too (M31 C).
  if (target === TEMERIA) g += bookEffect(state, world, 'counterSpy');
  return g;
}

// A month's growth for one network, before fading.
export function netGrowth(state, world, owner, target) {
  const c = S(world);
  const guard = Math.min(0.9, guardOf(state, world, target, owner) / c.guardCut);
  return c.growth * (skillOf(state, world, owner) / 50) * pick(c.openness, target) * spendOf(state, world, owner) * (1 - guard);
}

// Where a network would settle if nothing changed.
export const settlesAt = (state, world, owner, target) => clamp(netGrowth(state, world, owner, target) / S(world).decay, 0, 100);

// What the crown pays each month: the budget and the spymaster's wage.
export function spyExpense(state, world) {
  const sc = state.spycraft;
  if (!sc || !S(world)) return 0;
  return sc.budget + (sc.spymaster ? S(world).spymaster.wage : 0);
}

export function monthlySpies(state, world, rng) {
  const c = S(world);
  if (!c) return;
  const sc = (state.spycraft ??= newSpycraft(state, world));
  for (const o of spyOwners(state, world)) {
    const row = (sc.nets[o] ??= {});
    for (const t of spyTargets(state, world, o)) {
      const d = row[t] ?? 0;
      row[t] = Math.round(clamp(d + netGrowth(state, world, o, t) - d * c.decay, 0, 100) * 10) / 10;
    }
    // Networks in fallen realms fade with them.
    for (const t of Object.keys(row)) if (!living(state, t)) delete row[t];
  }
  for (const o of Object.keys(sc.nets)) if (!living(state, o)) delete sc.nets[o];
  if (!sc.spymaster && state.day - sc.candidatesDay >= c.spymaster.refreshDays) {
    sc.candidates = drawCandidates(state, world, sc);
    sc.candidatesDay = state.day;
  }
  spymasterRisk(state, world, rng, sc);
}

// Deep foreign networks at home reach for the spymaster: gold first, then a
// knife. A loyal man cannot be bought; a cautious one is hard to find.
function spymasterRisk(state, world, rng, sc) {
  const sm = sc.spymaster;
  if (!sm) return;
  const m = S(world).spymaster;
  const t = m.traits[sm.trait] ?? { turn: 1 };
  for (const o of spyOwners(state, world)) {
    if (o === TEMERIA) continue;
    const d = netDepth(state, o, TEMERIA);
    if (d >= m.killAt && rng.chance(m.killChance * (sm.trait === 'cautious' ? 0.5 : 1))) {
      addDispatch(state, `${sm.name}, the crown's spymaster, is pulled from the Ismena below the Vizima bridges. No one saw how it happened.`, 'realm');
      sc.spymaster = null;
      sc.lost = { name: sm.name, day: state.day, by: o, how: 'killed' };
      sc.candidates = drawCandidates(state, world, sc);
      sc.candidatesDay = state.day;
      return;
    }
    if (!sm.turned && d >= m.turnAt && rng.chance(m.turnChance * t.turn)) {
      // Quietly: the crown learns of it only when it is found out (Part C).
      sm.turned = o;
      sm.turnedDay = state.day;
    }
  }
}

// ---- The crown's actions ----

export function canSetBudget(state, world, amount) {
  const c = S(world);
  if (!c) return { ok: false, reason: 'There is no one to pay.' };
  if (!c.budgetSteps.includes(amount)) return { ok: false, reason: 'Not a sum the treasury pays.' };
  return { ok: true };
}

export function setBudget(state, world, amount) {
  const sc = (state.spycraft ??= newSpycraft(state, world));
  sc.budget = amount;
}

export function canAppoint(state, world, id) {
  const sc = state.spycraft;
  if (!sc) return { ok: false, reason: 'There is no office yet.' };
  if (sc.spymaster) return { ok: false, reason: 'The office is filled. Dismiss the spymaster first.' };
  if (!sc.candidates.some((x) => x.id === id)) return { ok: false, reason: 'That candidate is gone.' };
  return { ok: true };
}

export function appoint(state, world, id) {
  const sc = state.spycraft;
  const c = sc.candidates.find((x) => x.id === id);
  sc.spymaster = { ...c, since: state.day };
  sc.candidates = sc.candidates.filter((x) => x.id !== id);
  const t = S(world).spymaster.traits[c.trait];
  addDispatch(state, `${c.name}, ${c.from}, is named the crown's spymaster. ${t.line}`, 'realm');
}

export function dismiss(state, world) {
  const sc = state.spycraft;
  if (!sc?.spymaster) return false;
  addDispatch(state, `${sc.spymaster.name} is dismissed as spymaster. A great many secrets leave the palace too.`, 'realm');
  sc.spymaster = null;
  sc.candidates = drawCandidates(state, world, sc);
  sc.candidatesDay = state.day;
  return true;
}

// An agent sent in (the old single spy) also deepens the network there.
export function boostNet(state, world, rid) {
  const c = S(world);
  if (!c) return;
  const sc = (state.spycraft ??= newSpycraft(state, world));
  const row = (sc.nets[TEMERIA] ??= {});
  row[rid] = clamp((row[rid] ?? 0) + c.spyBoost, 0, 100);
}

// What the crown knows of foreign networks at home. With a spymaster, how
// deep each runs, roughly; exactly where our own network reaches their
// court deeply enough to read their letters (the "plans" depth).
export function foreignAtHome(state, world) {
  const sc = state.spycraft;
  if (!sc) return [];
  const out = [];
  for (const o of spyOwners(state, world)) {
    if (o === TEMERIA) continue;
    const d = netDepth(state, o, TEMERIA);
    const exact = knowsPlans(state, world, o) || (sc.known?.[o] ?? 0) > state.day;
    if (!exact && !sc.spymaster) continue;
    out.push({ owner: o, name: sideName(world, o), depth: exact ? Math.round(d) : null, band: band(d) });
  }
  return out.sort((a, b) => netDepth(state, b.owner, TEMERIA) - netDepth(state, a.owner, TEMERIA));
}

export function band(d) {
  if (d >= 70) return 'deep';
  if (d >= 45) return 'strong';
  if (d >= 20) return 'some';
  return 'faint';
}
