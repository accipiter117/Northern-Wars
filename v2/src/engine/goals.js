// Goals instead of technology (v2 step 4): each great power's two trees a
// chapter, checked at the end of every month, and what they unlock: unique
// units, a building, a wonder, and yields a month.
import { say, nameOf, controller, authority, isPower, regionsOf, payCost } from './core.js';

const G = (table) => table.data.goals;
const U = (table) => table.data.uniques;

// The chapter a month falls in (by date until step 8's story moves it).
export function chapterOf(table, date) {
  const list = G(table).chapters;
  for (let i = 0; i < list.length; i++) {
    const [y, m] = list[i].until;
    if (date.year < y || (date.year === y && date.month <= m)) return { ...list[i], index: i };
  }
  return { ...list.at(-1), index: list.length - 1 };
}

const chapterIndex = (table, id) => G(table).chapters.findIndex((c) => c.id === id);

export const goalsOf = (table, rid) => G(table).powers[rid] ?? [];

// What a need asks, and where we stand: { ok, have, want }.
export function needStatus(state, table, rid, key, want, ctx) {
  const realm = state.realms[rid];
  const armies = state.armies.filter((a) => a.owner === rid);
  const companies = armies.reduce((n, a) => n + a.companies.length, 0);
  switch (key) {
    case 'companies': return { ok: companies >= want, have: companies, want };
    case 'unit': {
      const n = armies.reduce((k, a) => k + a.companies.filter((c) => c.type === want.type).length, 0);
      return { ok: n >= want.n, have: n, want: want.n };
    }
    case 'treasury': case 'devotion': case 'renown': case 'love':
      return { ok: realm[key] >= want, have: Math.floor(realm[key]), want };
    case 'authority': return { ok: authority(realm) >= want, have: Math.floor(authority(realm)), want };
    case 'control': {
      const n = want.filter((id) => controller(state, id) === rid).length;
      return { ok: n === want.length, have: n, want: want.length };
    }
    case 'garrison': {
      const n = want.filter((id) => armies.some((a) => a.region === id)).length;
      return { ok: n === want.length, have: n, want: want.length };
    }
    case 'regions': { const n = regionsOf(state, rid).length; return { ok: n >= want, have: n, want }; }
    case 'pop': { const p = Math.round(state.cities[want.region]?.pop ?? 0); return { ok: p >= want.n && controller(state, want.region) === rid, have: p, want: want.n }; }
    case 'vassals': { const n = ctx.vassals(rid).length; return { ok: n >= want, have: n, want }; }
    case 'envoys': { const n = ctx.envoys(rid); return { ok: n >= want, have: n, want }; }
    case 'built': return { ok: state.built[want]?.by === rid, have: state.built[want]?.by === rid ? 1 : 0, want: 1 };
    case 'capitals': {
      const n = Object.values(table.board.regions).filter((r) => r.capital && r.realm !== rid && controller(state, r.id) === rid).length;
      return { ok: n >= want, have: n, want };
    }
    default: return { ok: false, have: 0, want };
  }
}

export function goalStatus(state, table, rid, goal, ctx) {
  const needs = Object.entries(goal.need).map(([k, v]) => ({ key: k, ...needStatus(state, table, rid, k, v, ctx) }));
  return { needs, ok: needs.every((n) => n.ok) };
}

// End of the month: every power's open goals of this chapter or earlier.
export function checkGoals(state, table, chapter, ctx) {
  for (const rid of table.data.game.powers) {
    const realm = state.realms[rid];
    if (!realm) continue;
    realm.goals ??= [];
    for (const goal of goalsOf(table, rid)) {
      if (realm.goals.includes(goal.id) || chapterIndex(table, goal.chapter) > chapter.index) continue;
      if (!goalStatus(state, table, rid, goal, ctx).ok) continue;
      realm.goals.push(goal.id);
      const what = unlockName(table, goal.unlock);
      if (rid === state.player) say(state, `Goal met: ${goal.name}. ${what}`);
      else say(state, `${nameOf(table, rid)} has met a goal: ${goal.name}.`);
    }
  }
}

export function unlockName(table, u) {
  if (!u) return '';
  if (u.unit) return `Unlocks ${U(table).units[u.unit].name}.`;
  if (u.building) return `Unlocks ${U(table).buildings[u.building].name}.`;
  if (u.wonder) return `Unlocks the wonder ${U(table).wonders[u.wonder].name}.`;
  if (u.bonus) return `${Object.entries(u.bonus).map(([k, v]) => `+${v} ${k}`).join(', ')} a month.`;
  return '';
}

const unlocks = (state, table, rid) => (state.realms[rid].goals ?? []).map((id) => goalsOf(table, rid).find((g) => g.id === id)?.unlock).filter(Boolean);

// The companies a realm may raise: the common three and its unlocked uniques.
export function companyTypes(state, table, rid) {
  const base = Object.keys(table.data.game.companies);
  if (!isPower(table, rid)) return base;
  return [...base, ...unlocks(state, table, rid).filter((u) => u.unit).map((u) => u.unit)];
}

export function companyDef(table, type) {
  return table.data.game.companies[type] ?? U(table).units[type];
}

// Unique buildings and wonders a realm has unlocked and not yet raised.
export function buildable(state, table, rid) {
  const out = [];
  for (const u of unlocks(state, table, rid)) {
    const id = u.building ?? u.wonder;
    if (!id) continue;
    const def = U(table).buildings[id] ?? U(table).wonders[id];
    if (!state.built[id]) out.push({ id, def, wonder: !!u.wonder });
  }
  return out;
}

export function raise(state, table, rid, id, { crowns = false } = {}) {
  const item = buildable(state, table, rid).find((b) => b.id === id);
  if (!item) return { error: 'Not unlocked, or already raised.' };
  const c = state.cities[item.def.at];
  if (!c || c.owner !== rid || c.holder) return { error: `Only at ${table.board.regions[item.def.at].name}, in our hands.` };
  const paid = payCost(state, table, rid, item.def.cost, crowns);
  if (paid.error) return paid;
  state.built[id] = { by: rid, region: item.def.at, turn: state.turn };
  say(state, `${nameOf(table, rid)} raises ${item.def.name} at ${table.board.regions[item.def.at].name}.`);
  return { ok: true };
}

const defOf = (table, id) => U(table).buildings[id] ?? U(table).wonders[id];

// Yields a city gets from the uniques raised in it.
export function uniqueYields(state, table, id) {
  const out = {};
  for (const [bid, b] of Object.entries(state.built)) {
    if (b.region !== id) continue;
    for (const [k, v] of Object.entries(defOf(table, bid).yields ?? {})) out[k] = (out[k] ?? 0) + v;
  }
  return out;
}

// A realm's standing changes from goals and uniques: yields a month and
// the realm-wide effects (companyCost, integration, defend, love, renown,
// movePoints). Uniques count while their city is in their owner's hands.
export function goalBonus(state, table, rid) {
  const out = { crowns: 0, production: 0, faith: 0, renown: 0, love: 0, companyCost: 1, integration: 0, defend: 1, movePoints: 0 };
  for (const u of unlocks(state, table, rid)) for (const [k, v] of Object.entries(u.bonus ?? {})) out[k] += v;
  for (const [bid, b] of Object.entries(state.built)) {
    if (b.by !== rid || controller(state, b.region) !== rid) continue;
    for (const [k, v] of Object.entries(defOf(table, bid).realm ?? {})) {
      if (k === 'companyCost' || k === 'defend') out[k] *= v;
      else out[k] += v;
    }
  }
  return out;
}

// The AI raises what it has unlocked when it can.
export function aiRaise(state, table, rid) {
  for (const b of buildable(state, table, rid)) {
    if (state.realms[rid].production >= b.def.cost + 30) raise(state, table, rid, b.id);
  }
}
