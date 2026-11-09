// The Book of Laws and the faiths (v2, M47). Laws: four chapters, two rival
// paths in each; a crown holds as many laws as its chapter of the story
// allows. Faiths: each city keeps a mix, which spreads from its owner's
// patron, its neighbours and missionaries; a city of another faith than its
// owner's patron is restless. Pure.
import { say, nameOf, controller, authority, isPower, clamp } from './core.js';

const L = (table) => table.data.laws;
const MULT = new Set(['companyCost', 'upkeep', 'defend', 'missionCost', 'faithUnrest']);

// ---- Laws ----

export function lawDef(table, id) {
  for (const [cid, ch] of Object.entries(L(table)?.chapters ?? {})) {
    for (const [pid, p] of Object.entries(ch.paths)) {
      const law = p.laws.find((x) => x.id === id);
      if (law) return { ...law, chapter: cid, path: pid };
    }
  }
  return null;
}

export const newLaws = (state) => Object.fromEntries(Object.keys(state.realms).map((rid) => [rid, { enacted: [], cooldown: {} }]));

const lawsOf = (state, rid) => (state.laws ??= {})[rid] ??= { enacted: [], cooldown: {} };
export const enacted = (state, rid) => state.laws?.[rid]?.enacted ?? [];
export const lawSlots = (table, chapterIndex) => L(table)?.slots[Math.min(chapterIndex, L(table).slots.length - 1)] ?? 0;

// Why a crown may not enact a law now, or null when it may.
export function lawBar(state, table, rid, id, chapterIndex) {
  const law = lawDef(table, id);
  if (!law) return 'No such law.';
  const mine = lawsOf(state, rid);
  if (mine.enacted.includes(id)) return 'Already the law.';
  if ((mine.cooldown[id] ?? 0) > state.turn) return `Repealed lately; it may return in ${mine.cooldown[id] - state.turn} months.`;
  const rival = Object.entries(L(table).chapters[law.chapter].paths).find(([pid, p]) => pid !== law.path && p.laws.some((x) => mine.enacted.includes(x.id)));
  if (rival) return `Closed while ${rival[1].name} stands.`;
  if (mine.enacted.length >= lawSlots(table, chapterIndex)) return 'No room in the book this chapter; repeal a law first.';
  if (authority(state.realms[rid]) < law.authority) return `Needs ${law.authority} Authority.`;
  if (state.realms[rid].treasury < law.cost) return `Needs ${law.cost} crowns.`;
  return null;
}

export function enact(state, table, rid, id, chapterIndex) {
  const bar = lawBar(state, table, rid, id, chapterIndex);
  if (bar) return { error: bar };
  const law = lawDef(table, id);
  state.realms[rid].treasury -= law.cost;
  lawsOf(state, rid).enacted.push(id);
  say(state, `${nameOf(table, rid)} enacts a law: ${law.name.toLowerCase()}.`);
  return { ok: true };
}

export function repeal(state, table, rid, id) {
  const mine = lawsOf(state, rid);
  if (!mine.enacted.includes(id)) return { error: 'Not the law.' };
  const r = L(table).repeal;
  mine.enacted = mine.enacted.filter((x) => x !== id);
  mine.cooldown[id] = state.turn + r.cooldown;
  state.realms[rid].love = clamp(state.realms[rid].love - r.love, 0, 100);
  if (rid === state.player) say(state, `${lawDef(table, id).name} is repealed.`);
  return { ok: true };
}

// What a crown's laws do to its month, as one bonus.
export function lawBonus(state, table, rid) {
  const out = {};
  for (const id of enacted(state, rid)) {
    for (const [k, v] of Object.entries(lawDef(table, id)?.effects ?? {})) {
      out[k] = MULT.has(k) ? (out[k] ?? 1) * v : (out[k] ?? 0) + v;
    }
  }
  return out;
}

// Fold a law bonus into the realm's bonus (multipliers multiply).
export function mergeBonus(into, add) {
  for (const [k, v] of Object.entries(add)) into[k] = MULT.has(k) ? (into[k] ?? 1) * v : (into[k] ?? 0) + v;
  return into;
}

// The AI enacts the next law it favours when it has crowns to spare.
export function aiLaws(state, table, rid, chapterIndex) {
  for (const id of L(table)?.ai?.[rid] ?? []) {
    const law = lawDef(table, id);
    if (!law || state.realms[rid].treasury < law.cost + 150) continue;
    if (!lawBar(state, table, rid, id, chapterIndex)) {
      enact(state, table, rid, id, chapterIndex);
      return;
    }
  }
}

// ---- Faiths ----

const Fa = (table) => L(table).faiths;

// A realm's patron faith: the book's, else the strongest in its lean.
export function patronOf(table, rid) {
  const p = Fa(table).patrons[rid];
  if (p) return p;
  // A risen house keeps the faith of the realm it rose in.
  if (rid?.startsWith('house_') && table.data.houses) return patronOf(table, table.data.houses.realm);
  const lean = table.world.devotion?.realms?.lean?.[rid];
  return lean ? Object.entries(lean).sort((a, b) => b[1] - a[1])[0][0] : null;
}

const normalise = (mix) => {
  const total = Object.values(mix).reduce((a, b) => a + b, 0) || 1;
  for (const k of Object.keys(mix)) {
    mix[k] = Math.round((mix[k] * 100) / total * 10) / 10;
    if (mix[k] <= 0) delete mix[k];
  }
  return mix;
};

// Every city's mix of faiths: home towns from the real-time game's own,
// foreign ones from their realm's lean.
export function newFaiths(table) {
  const out = {};
  const leans = table.world.devotion?.realms?.lean ?? {};
  for (const r of Object.values(table.board.regions)) {
    const mix = {};
    const towns = r.realm === 'temeria' ? r.members.map((m) => table.world.settlementData?.[m]?.faith).filter(Boolean) : [];
    if (towns.length) for (const f of towns) for (const [k, v] of Object.entries(f)) mix[k] = (mix[k] ?? 0) + v / towns.length;
    else Object.assign(mix, leans[r.realm] ?? { [patronOf(table, r.realm) ?? 'old_ways']: 100 });
    out[r.id] = normalise(mix);
  }
  return out;
}

export const rulingFaith = (state, id) => {
  const mix = state.faiths?.[id];
  if (!mix) return null;
  let best = null;
  for (const [k, v] of Object.entries(mix)) if (!best || v > mix[best]) best = k;
  return best;
};

const neighbours = (table, id) => (table.board.adj[id] ?? []).map((l) => (l.a === id ? l.b : l.a));

// The month's spread: the owner's patron, the city's own temples, and the
// faith ruling each neighbour.
export function monthlyFaiths(state, table, faithYield) {
  if (!L(table)) return;
  const s = Fa(table).spread;
  const gains = {};
  for (const id of Object.keys(state.cities)) {
    const g = (gains[id] = {});
    const p = patronOf(table, state.cities[id].owner);
    if (p) g[p] = s.patron + s.perFaith * Math.max(0, faithYield(id));
    for (const n of neighbours(table, id)) {
      const f = rulingFaith(state, n);
      if (f) g[f] = (g[f] ?? 0) + s.neighbour;
    }
  }
  for (const [id, g] of Object.entries(gains)) {
    const mix = (state.faiths[id] ??= {});
    for (const [k, v] of Object.entries(g)) mix[k] = (mix[k] ?? 0) + v;
    normalise(mix);
  }
}

// Unrest a month from the realm's cities ruled by another faith.
export function faithUnrest(state, table, rid, mult = 1) {
  if (!L(table)) return 0;
  const p = patronOf(table, rid);
  const n = Object.keys(state.cities).filter((id) => state.cities[id].owner === rid && rulingFaith(state, id) !== p).length;
  return Math.min(Fa(table).unrestCap, n * Fa(table).unrest) * mult;
}

// Cities our missionaries can reach: within `reach` links of our land.
export function missionReach(state, table, rid) {
  const reach = Fa(table).missions.reach;
  const dist = {};
  const queue = [];
  for (const id of Object.keys(state.cities)) if (controller(state, id) === rid) { dist[id] = 0; queue.push(id); }
  while (queue.length) {
    const at = queue.shift();
    if (dist[at] >= reach) continue;
    for (const n of neighbours(table, at)) if (dist[n] === undefined) { dist[n] = dist[at] + 1; queue.push(n); }
  }
  return new Set(Object.keys(dist));
}

export const missionCost = (table, bonus) => Math.round(Fa(table).missions.cost * (bonus.missionCost ?? 1));

export function sendMission(state, table, rid, id, bonus = {}) {
  const p = patronOf(table, rid);
  const c = state.cities[id];
  if (!c || !p) return { error: 'No faith to send.' };
  if (!missionReach(state, table, rid).has(id)) return { error: 'Too far from our land.' };
  if (c.mission === state.turn) return { error: 'Missionaries are there already this month.' };
  if ((state.faiths[id]?.[p] ?? 0) >= 99) return { error: `${faithName(table, p)} already holds every soul there.` };
  const cost = missionCost(table, bonus);
  if (state.realms[rid].devotion < cost) return { error: `Needs ${cost} Devotion.` };
  state.realms[rid].devotion -= cost;
  c.mission = state.turn;
  const mix = state.faiths[id];
  mix[p] = (mix[p] ?? 0) + Fa(table).missions.share;
  normalise(mix);
  if (rid === state.player) say(state, `Missionaries of ${faithName(table, p)} go to ${table.board.regions[id].name}.`);
  return { ok: true };
}

export const faithName = (table, f) => table.data.faithNames?.[f]?.short ?? f;

// The AI's priests: a power sends missionaries to the nearest city it can
// reach that its faith does not yet rule, when Devotion allows.
export function aiMissions(state, table, rid, bonus) {
  if (!isPower(table, rid)) return;
  const p = patronOf(table, rid);
  if (state.realms[rid].devotion < missionCost(table, bonus) * 3) return;
  const target = [...missionReach(state, table, rid)].filter((id) => rulingFaith(state, id) !== p && state.cities[id].mission !== state.turn)
    .sort((a, b) => (state.faiths[b][p] ?? 0) - (state.faiths[a][p] ?? 0))[0];
  if (target) sendMission(state, table, rid, target, bonus);
}

// Each patron faith's share of all the cities it rules.
export function faithShares(state) {
  const out = {};
  const ids = Object.keys(state.cities);
  for (const id of ids) {
    const f = rulingFaith(state, id);
    if (f) out[f] = (out[f] ?? 0) + 1 / ids.length;
  }
  return out;
}
