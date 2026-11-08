// Cities in depth (v2 step 3): a focus each month, works worn by war and
// mended with production, and conquered cities kept and settled.
import { makeRng } from '../../../src/sim/rng.js';
import { say, nameOf, clamp, payCost } from './core.js';

const C = (table) => table.data.game.cities;

// The distinct works of a city (a works counted once, as the spaces did).
export const worksOf = (table, id) => [...new Set(table.works[id])];

// A works' condition, 0 to 100 (100 unless war has worn it).
export const condOf = (state, id, b) => state.cities[id].cond?.[b] ?? 100;

export function damage(state, table, id, points, count = Infinity) {
  const c = state.cities[id];
  const list = worksOf(table, id).filter((b) => Object.keys(table.data.game.works[b] ?? {}).length);
  if (!list.length) return;
  const rng = makeRng(state.rng);
  const hit = count >= list.length ? list : Array.from({ length: count }, () => rng.pick(list));
  state.rng = rng.seed;
  c.cond ??= {};
  for (const b of hit) c.cond[b] = clamp(condOf(state, id, b) - points, 0, 100);
}

// What mending every worn works would cost, in production.
export function repairCost(state, table, id) {
  const missing = worksOf(table, id).reduce((a, b) => a + (100 - condOf(state, id, b)), 0);
  return Math.ceil(missing * C(table).repair);
}

export function repair(state, table, rid, id, { crowns = false } = {}) {
  const c = state.cities[id];
  if (!c || c.owner !== rid || c.holder) return { error: 'Not one of our cities.' };
  const cost = repairCost(state, table, id);
  if (!cost) return { error: 'Nothing here needs mending.' };
  const paid = payCost(state, table, rid, cost, crowns);
  if (paid.error) return paid;
  delete c.cond;
  return { ok: true, cost };
}

export function setFocus(state, table, rid, id, focus) {
  const c = state.cities[id];
  if (!c || c.owner !== rid) return { error: 'Not one of our cities.' };
  if (!C(table).focus.kinds.includes(focus)) return { error: 'No such focus.' };
  c.focus = focus;
  return { ok: true };
}

// How much of its takings a conquered city yields as it settles.
export function settled(table, c) {
  if (c.integration === undefined) return 1;
  const f = C(table).integration.floor;
  return f + (1 - f) * (c.integration / 100);
}

// Keep a city taken in war: it becomes ours, sullen at first.
export function annex(state, table, rid, id) {
  const c = state.cities[id];
  if (!c || c.holder !== rid) return { error: 'We do not hold it.' };
  const was = c.owner;
  c.owner = rid;
  c.holder = null;
  c.siege = null;
  c.integration = C(table).integration.start;
  c.focus = 'balanced';
  state.realms[rid].fear = clamp(state.realms[rid].fear + C(table).integration.fear, 0, 100);
  say(state, `${nameOf(table, rid)} annexes ${table.board.regions[id].name}, taken from ${nameOf(table, was)}.`);
  return { ok: true };
}

// The month for cities: conquered ones settle, faster with an army in them.
export function monthlyCities(state, table, bonus) {
  const ig = C(table).integration;
  for (const [id, c] of Object.entries(state.cities)) {
    if (c.integration === undefined || c.holder) continue;
    const garrison = state.armies.some((a) => a.owner === c.owner && a.region === id);
    c.integration = clamp(c.integration + ig.month + (garrison ? ig.garrison : 0) + (bonus(c.owner).integration ?? 0), 0, 100);
    if (c.integration >= 100) delete c.integration;
  }
}

// Unrest a realm takes from its unsettled cities.
export function unsettledUnrest(state, table, rid) {
  const ig = C(table).integration;
  return Object.values(state.cities).filter((c) => c.owner === rid && c.integration !== undefined && c.integration < ig.unrestBelow).length * ig.unrest;
}

// The AI keeps what it has held a while.
export function aiAnnex(state, table, rid) {
  for (const [id, c] of Object.entries(state.cities)) {
    if (c.holder !== rid) continue;
    c.heldFor = (c.heldFor ?? 0) + 1;
    if (c.heldFor >= C(table).aiAnnexAfter) annex(state, table, rid, id);
  }
}
