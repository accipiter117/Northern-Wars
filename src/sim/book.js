// The Book of Laws (M26 A). Five chapters, each with two rival paths of three
// tiers. Signing a path's first law locks its rival until the path is
// repealed from the top down. The ink must dry between signings, and a law
// once changed rests before it can be changed again. Every law has one
// headline effect the player can feel within a season; signing and
// repealing move Love, Fear and Unrest at once, and a line from the people
// and the court says how it landed.
import { nudge, authority, onProgress, realmUnrest } from './meters.js';
import { creditLimit } from './economy.js';
import { addDispatch, clamp } from './realm.js';

const B = (world) => world.book;
const SCOPED = ['unrest', 'prosperity', 'taxBy'];
const TYPES = ['village', 'town', 'city', 'castle', 'temple'];
const say = (state, text) => addDispatch(state, text, 'realm');

export function defaultBook() {
  return { signed: {}, ink: 0, changed: {}, faith: null };
}

export function bookOf(state) {
  return (state.book ??= defaultBook());
}

// Every law with where it stands: its chapter, its path, its rival path and
// its tier (1 to 3). Worked out once per world.
const index = new WeakMap();
export function bookLaws(world) {
  let out = index.get(world);
  if (out) return out;
  out = {};
  for (const [cid, ch] of Object.entries(B(world)?.chapters ?? {})) {
    const pids = Object.keys(ch.paths);
    for (const pid of pids) {
      ch.paths[pid].laws.forEach((law, i) => {
        out[law.id] = { law, chapter: cid, path: pid, rival: pids.find((p) => p !== pid), tier: i + 1 };
      });
    }
  }
  index.set(world, out);
  return out;
}

export function lawDef(world, id) {
  return bookLaws(world)[id] ?? null;
}

export function signed(state, id) {
  return !!state.book?.signed?.[id];
}

// How many tiers of a path stand signed.
export function pathDepth(state, world, chapter, path) {
  return B(world).chapters[chapter].paths[path].laws.filter((l) => signed(state, l.id)).length;
}

// 0 just signed, 1 once fully in force.
export function lawEnactment(state, world, id) {
  const s = state.book?.signed?.[id];
  if (!s) return 0;
  return clamp((state.day - s.day) / (B(world).enactDays || 1), 0, 1);
}

export function inkLeft(state) {
  return Math.max(0, (state.book?.ink ?? 0) - state.day);
}

// Days before this law can be changed again (signed or repealed).
export function restLeft(state, world, id) {
  const at = state.book?.changed?.[id];
  return at === undefined ? 0 : Math.max(0, at + B(world).lawCooldown - state.day);
}

// Why a law cannot be signed now, or null. The order of the checks is the
// order the player meets them on the page.
function lockReason(state, world, id) {
  const d = lawDef(world, id);
  if (!d) return 'Unknown law.';
  if (signed(state, id)) return 'Already signed.';
  const rival = B(world).chapters[d.chapter].paths[d.rival];
  if (pathDepth(state, world, d.chapter, d.rival) > 0) return `Locked while ${rival.name} stands: repeal it first.`;
  const before = B(world).chapters[d.chapter].paths[d.path].laws[d.tier - 2];
  if (before && !signed(state, before.id)) return `Needs ${before.name} first.`;
  return null;
}

export function canSignLaw(state, world, id, choice = null) {
  if (!B(world)) return { ok: false, reason: 'No Book of Laws in this world.' };
  const locked = lockReason(state, world, id);
  if (locked) return { ok: false, reason: locked, locked: true };
  const law = lawDef(world, id).law;
  const ink = inkLeft(state);
  if (ink > 0) return { ok: false, reason: `The ink is still drying: ${ink} days before another law can be signed.` };
  const rest = restLeft(state, world, id);
  if (rest > 0) return { ok: false, reason: `Changed too lately: ${rest} days before it can be signed again.` };
  if (onProgress(state)) return { ok: false, reason: 'The king is away on progress: no laws until he is back at court.' };
  if (authority(state, world) < (law.authority ?? 0)) return { ok: false, reason: `Needs Authority of ${law.authority}: the realm would not heed it.` };
  if (law.choose === 'faith' && !B(world).faiths.includes(choice)) return { ok: false, reason: 'Choose the faith.' };
  if (state.treasury - (law.cost ?? 0) < -creditLimit(state, world)) return { ok: false, reason: 'The bankers will not lend that much.' };
  return { ok: true, borrow: law.cost > 0 && state.treasury - law.cost < 0 };
}

// The groups a law would please and anger while it stands.
export function lawOpinion(world, id, choice = null) {
  const law = lawDef(world, id)?.law;
  if (!law) return {};
  return { ...(law.opinion ?? {}), ...((law.opinionBy && choice && law.opinionBy[choice]) || {}) };
}

function moveMeters(state, world, m, why) {
  for (const k of ['love', 'fear']) if (m?.[k]) nudge(state, world, k, m[k], why);
  if (m?.unrest) {
    for (const s of Object.values(state.settlements)) if (!s.occupier) s.unrest = clamp(s.unrest + m.unrest, 0, 100);
    state.unrest = realmUnrest(state, world);
  }
}

function shock(state, world, opinion, k) {
  for (const [g, v] of Object.entries(opinion)) {
    if (state.opinion?.[g] === undefined) continue;
    state.opinion[g] = clamp(state.opinion[g] + v * k, 0, 100);
  }
}

export function signLaw(state, world, id, choice = null) {
  const b = bookOf(state);
  const { law } = lawDef(world, id);
  state.treasury -= law.cost ?? 0;
  state.ledger.decrees = (state.ledger.decrees ?? 0) + (law.cost ?? 0);
  b.signed[id] = { day: state.day, ...(choice ? { choice } : {}) };
  if (law.choose === 'faith') b.faith = choice;
  b.ink = state.day + B(world).inkDays;
  b.changed[id] = state.day;
  if (state.reign) state.reign.decrees += 1;
  // The news lands before the law takes hold: a sharp first reaction from
  // the groups it touches, and the realm's mood moves at once.
  shock(state, world, lawOpinion(world, id, choice), world.laws.shock ?? 0.4);
  moveMeters(state, world, law.meters, `Signed: ${law.name}`);
  say(state, `Signed into the Book of Laws: ${law.name}. ${law.reaction}`);
}

// Only a path's top signed law can be repealed: a path comes down from the
// top. It must have rested since it was signed.
export function canRepeal(state, world, id) {
  const d = lawDef(world, id);
  if (!d || !signed(state, id)) return { ok: false, reason: 'Not in force.' };
  const above = B(world).chapters[d.chapter].paths[d.path].laws[d.tier];
  if (above && signed(state, above.id)) return { ok: false, reason: `Repeal ${above.name} first.` };
  const rest = restLeft(state, world, id);
  if (rest > 0) return { ok: false, reason: `Signed too lately: ${rest} days before it can be repealed.` };
  if (onProgress(state)) return { ok: false, reason: 'The king is away on progress: no laws until he is back at court.' };
  return { ok: true };
}

// What repealing would cost, for the card before confirming.
export function repealCost(state, world, id) {
  const { law } = lawDef(world, id);
  const r = B(world).repeal;
  const liked = Object.entries(lawOpinion(world, id, state.book?.signed?.[id]?.choice)).filter(([, v]) => v > 0).map(([g]) => g);
  return { love: r.love ?? 0, unrest: r.unrest ?? 0, fear: law.meters?.fear > 0 ? -law.meters.fear : 0, angered: liked };
}

export function repealLaw(state, world, id) {
  const b = bookOf(state);
  const { law } = lawDef(world, id);
  const choice = b.signed[id]?.choice ?? null;
  const cost = repealCost(state, world, id);
  delete b.signed[id];
  if (law.choose === 'faith') b.faith = null;
  b.changed[id] = state.day;
  b.ink = state.day + B(world).inkDays;
  // Those who liked it are angry: their goodwill falls, and the realm's mood
  // with it.
  const liked = Object.fromEntries(Object.entries(lawOpinion(world, id, choice)).filter(([, v]) => v > 0).map(([g, v]) => [g, -v]));
  shock(state, world, liked, B(world).repealShock);
  moveMeters(state, world, { love: cost.love, fear: cost.fear, unrest: cost.unrest }, `Repealed: ${law.name}`);
  const names = cost.angered.map((g) => world.groups.groups[g]?.name ?? g);
  say(state, `Struck from the Book of Laws: ${law.name}.${names.length ? ` ${names.join(', ')} take it hard.` : ''}`);
}

// ---- Effects ----

let cacheKey = '';
let cacheValue = null;

// Every signed law's effects, each as far as it has taken hold.
export function bookEffects(state, world) {
  const b = state.book;
  if (!b || !B(world)) return {};
  const key = `${state.day}|${JSON.stringify(b.signed)}`;
  if (key === cacheKey) return cacheValue;
  const out = {};
  for (const id of Object.keys(b.signed)) {
    const d = lawDef(world, id);
    if (!d) continue;
    const k = lawEnactment(state, world, id);
    for (const [e, v] of Object.entries(d.law.effects ?? {})) {
      // Effects that differ by kind of place are always kept per kind, so a
      // plain number (curfews: Unrest -10 everywhere) and a per-kind one
      // (assizes: towns and cities) add up.
      if (SCOPED.includes(e)) {
        out[e] ??= Object.fromEntries(TYPES.map((t) => [t, 0]));
        for (const t of TYPES) out[e][t] += (typeof v === 'number' ? v : v[t] ?? 0) * k;
      } else if (typeof v === 'number') out[e] = (out[e] ?? 0) + v * k;
    }
  }
  cacheKey = key;
  cacheValue = out;
  return out;
}

export function bookEffect(state, world, key) {
  const v = bookEffects(state, world)[key];
  return typeof v === 'number' ? v : 0;
}

// Where the groups settle while the Book's laws stand.
export function bookOpinion(state, world) {
  const out = {};
  for (const [id, s] of Object.entries(state.book?.signed ?? {})) {
    for (const [g, v] of Object.entries(lawOpinion(world, id, s.choice))) out[g] = (out[g] ?? 0) + v;
  }
  return out;
}

// The faith the crown has taken for its own, if any.
export function crownFaith(state) {
  return state.book?.signed?.faith_of_the_crown ? state.book.faith : null;
}

// Whether an act of the crown is unlocked by the Book.
export function unlocked(state, world, act) {
  return Object.values(bookLaws(world)).some((d) => d.law.unlocks === act && signed(state, d.law.id));
}

export function lawUnlocking(world, act) {
  return Object.values(bookLaws(world)).find((d) => d.law.unlocks === act)?.law ?? null;
}

// Whether a law stands, by the keys data uses: "book:<law>" for a law of the
// Book, "faith:<faith>" for the faith of the crown, "<setting>:<option>" for a
// setting (taxes, the court, bounties).
export function lawStands(state, key) {
  const [a, b] = key.split(':');
  if (a === 'book') return signed(state, b);
  if (a === 'faith') return crownFaith(state) === b;
  return state.laws?.[a]?.option === b;
}

// Its name, for a line of reasons ("Our law: the inquisition").
export function lawLabel(world, key) {
  const [a, b] = key.split(':');
  if (a === 'book') return lawDef(world, b)?.law.name ?? b;
  if (a === 'faith') return `the ${world.groups?.groups?.[b]?.name ?? b} as the crown's faith`;
  return world.laws.laws[a]?.options[b]?.name ?? b;
}

// v27: the old laws become the nearest laws of the Book, each in force at
// once with no cooldowns running. A path is signed from its first tier up
// to the law the old one maps to; a mapping whose rival path is already
// taken is skipped. Settings the old laws defaulted to map to nothing.
const UPGRADE = [
  ['alms', 'alms', ['poor_relief']],
  ['public_order', 'curfew', ['curfews']],
  ['public_order', 'martial', ['curfews']],
  ['public_order', 'riders', ['curfews', 'executions', 'riders']],
  ['guilds', 'monopoly', ['guild_monopolies']],
  ['grain_prices', 'granaries', ['guild_monopolies', 'royal_mines', 'royal_granaries']],
  ['conscription', 'seasonal', ['seasonal_conscription']],
  ['conscription', 'standing', ['standing_companies']],
  ['patronage', 'eternal_fire', ['faith_of_the_crown:eternal_fire']],
  ['patronage', 'melitele', ['faith_of_the_crown:melitele']],
  ['nonhumans', 'charter', ['freedom_of_worship', 'nonhuman_charter']],
  ['nonhumans', 'expulsion', ['faith_of_the_crown:eternal_fire', 'restrictions']],
  ['mages', 'free', ['freedom_of_worship', 'nonhuman_charter', 'licensed_mages']],
  ['mages', 'banished', ['faith_of_the_crown:eternal_fire', 'restrictions', 'inquisition']],
];

export function upgradeLaws(state, world) {
  const b = (state.book = defaultBook());
  const old = state.laws ?? {};
  if (B(world)) {
    for (const [law, option, ids] of UPGRADE) {
      if (old[law]?.option !== option) continue;
      for (const entry of ids) {
        const [id, choice] = entry.split(':');
        const d = lawDef(world, id);
        if (!d || signed(state, id) || pathDepth(state, world, d.chapter, d.rival) > 0) continue;
        b.signed[id] = { day: state.day - B(world).enactDays, ...(choice ? { choice } : {}) };
        if (choice) b.faith = choice;
      }
    }
  }
  // Only the settings stay among the old laws.
  for (const id of Object.keys(old)) if (!world.laws.laws[id]) delete old[id];
  for (const [id, law] of Object.entries(world.laws.laws)) old[id] ??= { option: law.default, previous: law.default, since: 0 };
  state.laws = old;
  return state;
}

// How hard the works are driven (M26): Long hours adds to every works'
// output, and Every man a soldier takes a tenth away while levies are out.
export function outputMult(state, world) {
  const raised = (state.armies ?? []).some((a) => a.side === 'temeria' && (a.levyMen ?? 0) > 0);
  return Math.max(0, 1 + bookEffect(state, world, 'worksOutput') + (raised ? bookEffect(state, world, 'levyWorks') : 0));
}
