// Laws and the realm's opinion of them. A decree costs Authority and crowns,
// jolts the groups it touches at once, and then phases in over a month: until
// it has fully taken hold, the old law's effects fade as the new one's grow.
import { creditLimit } from './economy.js';
import { addDispatch, clamp } from './realm.js';

const say = (state, text) => addDispatch(state, text, 'realm');

const SUMMED = ['tax', 'trade', 'garrison', 'garrisonUpkeep', 'foodYield', 'court', 'authority', 'monthly', 'storage', 'growth', 'nonhumanExodus'];
const SCOPED = ['unrest', 'prosperity'];
const TYPES = ['village', 'town', 'city', 'castle', 'temple'];

export function defaultLaws(world) {
  const laws = {};
  for (const [id, law] of Object.entries(world.laws.laws)) laws[id] = { option: law.default, previous: law.default, since: 0 };
  return laws;
}

export function defaultOpinion(world) {
  const o = {};
  for (const g of Object.keys(world.groups.groups)) o[g] = 50;
  return o;
}

// 0 when just decreed, 1 once fully in force.
export function enactment(state, world, lawId) {
  const l = state.laws[lawId];
  if (l.option === l.previous) return 1;
  return clamp((state.day - l.since) / world.laws.enactDays, 0, 1);
}

let cacheKey = '';
let cacheValue = null;

export function lawEffects(state, world) {
  const key = `${state.day}|${JSON.stringify(state.laws)}`;
  if (key === cacheKey) return cacheValue;
  const out = {};
  for (const k of SUMMED) out[k] = 0;
  for (const k of SCOPED) out[k] = Object.fromEntries(TYPES.map((t) => [t, 0]));
  for (const [id, law] of Object.entries(world.laws.laws)) {
    const l = state.laws[id];
    const s = enactment(state, world, id);
    add(out, law.options[l.option].effects, s);
    if (s < 1) add(out, law.options[l.previous].effects, 1 - s);
  }
  cacheKey = key;
  cacheValue = out;
  return out;
}

function add(out, fx, weight) {
  for (const [k, v] of Object.entries(fx)) {
    if (SCOPED.includes(k)) {
      for (const t of TYPES) out[k][t] += (typeof v === 'number' ? v : v[t] ?? 0) * weight;
    } else out[k] += v * weight;
  }
}

// Where each group would settle given the laws standing now. Groups react to
// the decree, not to its slow enforcement, so this uses the new option at once.
export function opinionTargets(state, world) {
  const t = defaultOpinion(world);
  for (const [id, law] of Object.entries(world.laws.laws)) {
    for (const [g, v] of Object.entries(law.options[state.laws[id].option].opinion)) t[g] += v;
  }
  // Guildhalls, hospices, cathedrals and banks please their own, a little
  // more for each, up to a point.
  const built = {};
  for (const s of Object.values(state.settlements)) {
    if (s.occupier) continue;
    for (const b of s.buildings) for (const [g, v] of Object.entries(world.buildings[b].effects.opinion ?? {})) built[g] = (built[g] ?? 0) + v;
  }
  for (const [g, v] of Object.entries(built)) if (g in t) t[g] += clamp(v, -12, 12);
  for (const g of Object.keys(t)) t[g] = clamp(t[g], 0, 100);
  return t;
}

export function stepOpinionDay(state, world) {
  const target = opinionTargets(state, world);
  const drift = world.groups.effects.drift;
  for (const g of Object.keys(state.opinion)) state.opinion[g] += (target[g] - state.opinion[g]) * drift;
}

export function canDecree(state, world, lawId, optionId) {
  const law = world.laws.laws[lawId];
  const l = state.laws[lawId];
  if (!law || !law.options[optionId]) return { ok: false, reason: 'Unknown law.' };
  if (l.option === optionId) return { ok: false, reason: 'Already the law of the land.' };
  if (enactment(state, world, lawId) < 1) return { ok: false, reason: 'The last change is still taking hold.' };
  if (state.authority < law.authority) return { ok: false, reason: `Needs ${law.authority} Authority.` };
  if (state.treasury - law.coin < -creditLimit(state, world)) return { ok: false, reason: 'The bankers will not lend that much.' };
  return { ok: true, borrow: law.coin > 0 && state.treasury - law.coin < 0 };
}

export function decree(state, world, lawId, optionId) {
  const law = world.laws.laws[lawId];
  const l = state.laws[lawId];
  const before = opinionTargets(state, world);
  state.authority -= law.authority;
  state.treasury -= law.coin;
  state.ledger.decrees = (state.ledger.decrees ?? 0) + law.coin;
  state.laws[lawId] = { option: optionId, previous: l.option, since: state.day };
  if (state.reign) state.reign.decrees += 1;
  // The news lands before the law takes hold: a sharp first reaction.
  const after = opinionTargets(state, world);
  for (const g of Object.keys(state.opinion)) {
    state.opinion[g] = clamp(state.opinion[g] + (after[g] - before[g]) * world.laws.shock, 0, 100);
  }
  const opt = law.options[optionId];
  say(state, `By royal decree: ${opt.name.toLowerCase()}. ${opt.blurb}`);
}

// Who a choice pleases and who it angers, relative to the law standing now.
export function reactions(state, world, lawId, optionId) {
  const law = world.laws.laws[lawId];
  const now = law.options[state.laws[lawId].option].opinion;
  const next = law.options[optionId].opinion;
  const groups = new Set([...Object.keys(now), ...Object.keys(next)]);
  const pleased = [];
  const angered = [];
  for (const g of groups) {
    const d = (next[g] ?? 0) - (now[g] ?? 0);
    if (d > 0) pleased.push(g);
    if (d < 0) angered.push(g);
  }
  return { pleased, angered };
}

// Unrest a settlement feels from the groups who live there and how they
// regard the crown: peasants in villages, burghers in towns, lords in
// castles, each faith by its share of worshippers, each people by its share
// of the population.
export function opinionUnrest(state, world, id, s) {
  const fx = world.groups.effects;
  const type = world.byId[id].type;
  const o = state.opinion;
  let u = 0;
  for (const [g, scope] of Object.entries(fx.settlementUnrest)) u += (50 - o[g]) * (scope[type] ?? 0);
  for (const [f, share] of Object.entries(s.faith)) u += (50 - o[f]) * fx.faithUnrest * (share / 100);
  let pop = 0;
  for (const n of Object.values(s.population)) pop += n;
  if (pop > 0) {
    for (const p of ['dwarf', 'elf', 'halfling']) u += (50 - o[p]) * fx.peopleUnrest * (s.population[p] / pop);
  }
  return u;
}
