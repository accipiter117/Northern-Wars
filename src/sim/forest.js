// Where the Scoia'tael come from (M32 D). They recruit from the crown's own
// young non-humans: more where the laws persecute them, where the quarters
// go hungry and where the elves feel wronged; fewer under tolerance and in
// good times. Pogroms send their young to the woods at once (culture.js),
// foreign courts with deep networks in Temeria pay for more, and elves cross
// from Aedirn's Dol Blathanna. The pool makes commandos likelier and larger
// (threats.js), and the card says where this year's recruits came from.
import { lawStands } from './book.js';
import { dateOf } from './calendar.js';
import { atWar, hostile, TEMERIA } from './conflict.js';

const C = (world) => world.culture?.scoiatael;

export const RECRUIT_CAUSES = {
  persecution: 'the laws against them',
  hunger: 'hunger in the quarters',
  grievance: 'old grievances against the crown',
  young: 'restless young, as ever',
  pogroms: 'pogroms',
  spies: 'foreign silver',
  aedirn: "elves out of Aedirn's Dol Blathanna",
};

export function forestOf(state) {
  const sc = (state.scoiatael ??= { recruits: 0, from: {} });
  sc.from ??= {};
  return sc;
}

// Note recruits by cause, for the pool and for this year's account.
export function addRecruits(state, cause, n) {
  if (!(n > 0)) return;
  const sc = forestOf(state);
  sc.recruits += n;
  sc.from[cause] = (sc.from[cause] ?? 0) + n;
  const y = dateOf(state.day).year;
  if (sc.year?.y !== y) {
    if (sc.year) sc.lastYear = sc.year;
    sc.year = { y, from: {} };
  }
  sc.year.from[cause] = (sc.year.from[cause] ?? 0) + n;
}

// One town's recruits this month, cause by cause.
export function townRecruits(state, world, id) {
  const c = C(world);
  const s = state.settlements[id];
  if (!c || !s || s.occupier || s.holder === undefined) return {};
  let young = 0;
  for (const [p, w] of Object.entries(c.weights)) young += (s.population[p] ?? 0) * w;
  const base = (young / 1000) * c.perThousand;
  if (base <= 0) return {};
  let harsh = 0;
  let mild = 0;
  for (const [key, v] of Object.entries(c.laws)) if (lawStands(state, key)) { if (v > 0) harsh += v; else mild += v; }
  const op = state.opinion?.elf ?? 50;
  const out = {
    young: base,
    persecution: base * harsh,
    hunger: base * c.hunger * (s.hunger ?? 0),
    grievance: base * c.grievance * Math.max(0, (c.grievanceBelow - op) / c.grievanceBelow),
  };
  // Tolerance and good times keep the young at home; hard times do not.
  const calm = Math.max(0, 1 + mild - (s.prosperity - 50) * c.prosperity);
  for (const k of Object.keys(out)) out[k] *= calm;
  return out;
}

export function monthlyForest(state, world) {
  const c = C(world);
  if (!c) return;
  const sc = forestOf(state);
  sc.recruits *= 1 - c.decay;
  const sum = {};
  for (const id of Object.keys(state.settlements)) {
    for (const [k, v] of Object.entries(townRecruits(state, world, id))) sum[k] = (sum[k] ?? 0) + v;
  }
  for (const [k, v] of Object.entries(sum)) addRecruits(state, k, v);
  // Foreign silver: the Empire, and any court hostile to us, through a
  // network deep enough in Temeria.
  for (const [owner, row] of Object.entries(state.spycraft?.nets ?? {})) {
    if (owner === TEMERIA) continue;
    if (!c.spies.owners.includes(owner) && !hostile(state, TEMERIA, owner)) continue;
    const d = row?.[TEMERIA] ?? 0;
    if (d > c.spies.from) addRecruits(state, 'spies', (d - c.spies.from) * c.spies.per);
  }
  // Dol Blathanna, over the Aedirn border, while Aedirn stands.
  const a = state.realms?.[c.aedirn.realm];
  // How Demavend settled Dol Blathanna (M33 B) decides how many cross.
  const settled = { forced: 2, loyal: 0.25 }[state.paths?.aedirn?.elves] ?? 1;
  if (a && !a.fallen) addRecruits(state, 'aedirn', c.aedirn.base * settled * (atWar(state, c.aedirn.realm) ? c.aedirn.atWar : 1));
}

// This year's account, the largest cause first, in whole recruits.
export function recruitAccount(state) {
  const sc = state.scoiatael;
  const y = dateOf(state.day).year;
  const from = sc?.year?.y === y ? sc.year.from : {};
  const rows = Object.entries(from).map(([cause, n]) => ({ cause, n: Math.round(n), label: RECRUIT_CAUSES[cause] ?? cause })).filter((r) => r.n > 0).sort((a, b) => b.n - a.n);
  return { rows, total: rows.reduce((t, r) => t + r.n, 0), pool: Math.round(sc?.recruits ?? 0) };
}
