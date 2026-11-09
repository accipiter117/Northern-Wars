// The peoples (v2, M50): the dwarves, elves, halflings and gnomes in the
// cities, each realm's standing with them, what they bring to the cities
// they live in, and what comes of hating them: Scoia'tael raids, pogroms.
// Content peoples send volunteers to a crown at war. Pure.
import { makeRng } from '../../../src/sim/rng.js';
import { say, clamp } from './core.js';
import { damage } from './cities.js';
import { enacted } from './laws.js';

const P = (table) => table.data.peoples;
export const PEOPLES = ['dwarf', 'elf', 'halfling', 'gnome'];

// Each city's non-human shares (in every hundred).
export function newPeoples(table) {
  const cfg = P(table);
  if (!cfg) return null;
  const shares = {};
  for (const r of Object.values(table.board.regions)) {
    const sums = {};
    for (const m of r.members) for (const [k, v] of Object.entries(table.world.settlementData?.[m]?.population ?? {})) sums[k] = (sums[k] ?? 0) + v;
    const total = Object.values(sums).reduce((a, b) => a + b, 0);
    shares[r.id] = total
      ? Object.fromEntries(PEOPLES.filter((p) => sums[p]).map((p) => [p, Math.round((sums[p] / total) * 1000) / 10]))
      : { ...(cfg.realmShares[r.realm] ?? cfg.defaultShares) };
  }
  return { shares, mood: {}, volunteered: {} };
}

export const peopleName = (table, p) => P(table).peoples[p]?.name ?? p;

// A realm's standing with a people (made on first asking).
export function moodOf(state, table, rid, p) {
  const m = (state.peoples.mood[rid] ??= {});
  m[p] ??= P(table).start[rid]?.[p] ?? P(table).base;
  return m[p];
}

// Where a realm's standing with a people is heading, and why.
export function moodTarget(state, table, rid, p) {
  const cfg = P(table);
  const parts = [{ why: 'the realm', n: cfg.base }];
  const love = state.realms[rid]?.love ?? 50;
  parts.push({ why: 'Love', n: Math.round((love - 50) * cfg.love) });
  for (const id of enacted(state, rid)) {
    const l = cfg.laws[id];
    if (!l) continue;
    const n = (l[p] ?? 0) + (l.all ?? 0);
    if (n) parts.push({ why: `law: ${id.replaceAll('_', ' ')}`, n });
  }
  return { target: clamp(parts.reduce((a, x) => a + x.n, 0), 0, 100), parts };
}

// A people's weight in a city: how many of them, and how content.
export function weightIn(state, table, id, p) {
  const cfg = P(table);
  const share = state.peoples?.shares?.[id]?.[p] ?? 0;
  if (!share) return 0;
  const owner = state.cities[id].owner;
  const mood = moodOf(state, table, owner, p);
  return Math.min(1, share / cfg.fullShare) * clamp((mood - cfg.moodFrom) / cfg.moodSpan, 0, cfg.moodMost);
}

// What the peoples add to a city's yields, as shares of each.
export function peopleGifts(state, table, id) {
  const out = {};
  if (!P(table) || !state.peoples) return out;
  for (const p of PEOPLES) {
    const w = weightIn(state, table, id, p);
    if (!w) continue;
    for (const [k, v] of Object.entries(P(table).peoples[p].gifts)) out[k] = (out[k] ?? 0) + v * w;
  }
  return out;
}

const ourCities = (state, rid) => Object.keys(state.cities).filter((id) => state.cities[id].owner === rid && !state.cities[id].holder);

function volunteer(state, table, rid, p) {
  const cfg = P(table);
  const home = ourCities(state, rid).sort((a, b) => (state.peoples.shares[b][p] ?? 0) - (state.peoples.shares[a][p] ?? 0))[0];
  if (!home) return;
  const type = cfg.volunteers.company[p];
  let army = state.armies.find((a) => a.owner === rid && a.region === home && a.companies.length < table.data.game.maxCompanies);
  if (army) army.companies.push({ type, str: 100 });
  else {
    army = { id: state.nextArmy++, owner: rid, region: home, companies: [{ type, str: 100 }], points: 0 };
    state.armies.push(army);
  }
  state.peoples.volunteered[`${rid}:${p}`] = state.turn;
  say(state, `${peopleName(table, p)} of ${table.board.regions[home].name} send a company of volunteers to the war.`);
}

// The month: standings drift for every realm; raids, pogroms and
// volunteers for the player's.
export function monthlyPeoples(state, table) {
  const cfg = P(table);
  if (!cfg || !state.peoples) return;
  for (const rid of Object.keys(state.realms)) {
    for (const p of PEOPLES) {
      const now = moodOf(state, table, rid, p);
      const { target } = moodTarget(state, table, rid, p);
      state.peoples.mood[rid][p] = Math.round((now + (target - now) * cfg.drift) * 10) / 10;
    }
  }
  const me = state.player;
  const realm = state.realms[me];
  if (!realm) return;
  const rng = makeRng(state.rng);
  const mine = ourCities(state, me);
  const garrisoned = (id) => state.armies.some((a) => a.owner === me && a.region === id);
  // Scoia'tael: bitter elves raid a city where elves live.
  if (moodOf(state, table, me, 'elf') < cfg.scoiatael.below && rng.chance(cfg.scoiatael.chance)) {
    const where = mine.filter((id) => (state.peoples.shares[id].elf ?? 0) >= cfg.scoiatael.minShare && !garrisoned(id));
    if (where.length) {
      const id = rng.pick(where);
      damage(state, table, id, 30, cfg.scoiatael.works);
      realm.unrest = clamp(realm.unrest + cfg.scoiatael.unrest, 0, 100);
      say(state, `Scoia'tael commandos strike at ${table.board.regions[id].name}: works burn, and the roads are watched.`);
    }
  }
  // Pogroms: a hated people, a restless realm, a city with no army of ours.
  if (realm.unrest > cfg.pogrom.unrest) {
    for (const p of PEOPLES) {
      if (moodOf(state, table, me, p) >= cfg.pogrom.below || !rng.chance(cfg.pogrom.chance)) continue;
      const where = mine.filter((id) => (state.peoples.shares[id][p] ?? 0) >= cfg.pogrom.minShare && !garrisoned(id));
      if (!where.length) continue;
      const id = rng.pick(where);
      state.peoples.shares[id][p] = Math.round(state.peoples.shares[id][p] * cfg.pogrom.cut * 10) / 10;
      state.peoples.mood[me][p] = clamp(state.peoples.mood[me][p] + cfg.pogrom.mood, 0, 100);
      damage(state, table, id, 40, cfg.pogrom.works);
      realm.fear = clamp(realm.fear + cfg.pogrom.fear, 0, 100);
      say(state, `A pogrom in ${table.board.regions[id].name}: the ${peopleName(table, p).toLowerCase()}'s quarter burns, and many flee.`);
      break;
    }
  }
  // Volunteers, once a year at most, from a content people while we are at war.
  if (state.wars.some((w) => w.split('|').includes(me))) {
    for (const p of PEOPLES) {
      const last = state.peoples.volunteered[`${me}:${p}`];
      if (moodOf(state, table, me, p) < cfg.volunteers.above || (last !== undefined && state.turn - last < cfg.volunteers.every)) continue;
      if (!mine.some((id) => (state.peoples.shares[id][p] ?? 0) >= 1) || !rng.chance(cfg.volunteers.chance)) continue;
      volunteer(state, table, me, p);
    }
  }
  state.rng = rng.seed;
}

// The realm's peoples: how many live in its cities, and its standing with each.
export function realmPeoples(state, table, rid) {
  const cities = ourCities(state, rid);
  const pop = cities.reduce((a, id) => a + state.cities[id].pop, 0) || 1;
  return PEOPLES.map((p) => ({
    p, name: peopleName(table, p),
    share: Math.round((cities.reduce((a, id) => a + state.cities[id].pop * (state.peoples.shares[id][p] ?? 0), 0) / pop) * 10) / 10,
    mood: Math.round(moodOf(state, table, rid, p)),
    ...moodTarget(state, table, rid, p),
  }));
}

