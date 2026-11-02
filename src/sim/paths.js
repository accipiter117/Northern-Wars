// The five paths (M33 B). Each great power has a path of four or five
// steps fitting its ruler. The crown's own steps are goals with rewards;
// the rivals' come on their own, month by month, and each changes that
// realm (a larger army, a fuller treasury, deeper networks, a stronger
// garrison). The news reaches Vizima in full where it has eyes in that
// court, as a rumour elsewhere. Part C waits on Foltest's and Emhyr's.
import { addDispatch, clamp } from './realm.js';
import { nudge } from './meters.js';
import { windfall } from './economy.js';
import { TEMERIA, sideName } from './conflict.js';
import { suzerainOf } from './tiers.js';
import { treatyBetween, trustIn } from './diplomacy.js';
import { informed } from './realms.js';

const P = (world) => world.paths;
// The realms with a path (the data's note aside).
const REALMS = (world) => Object.keys(P(world) ?? {}).filter((r) => r !== 'note');
const RIVALS = (world) => REALMS(world).filter((r) => r !== TEMERIA);

export function newPaths(state, world) {
  if (!P(world)) return null;
  const out = {};
  for (const rid of REALMS(world)) out[rid] = { step: 0, since: state.day, done: [] };
  return out;
}

// A reign from before M33 has its own path behind it (Part D: it moves
// straight to the Road to War); the rivals start from the beginning.
export function pathsForOldReign(state, world) {
  const p = newPaths(state, world);
  if (p?.[TEMERIA]) {
    const n = P(world)[TEMERIA].steps.length;
    p[TEMERIA] = { step: n, since: state.day, done: P(world)[TEMERIA].steps.map((s) => ({ id: s.id, day: state.day })) };
  }
  return p;
}

export const pathDone = (state, world, rid) => !!P(world)?.[rid] && (state.paths?.[rid]?.step ?? 0) >= P(world)[rid].steps.length;

// Whether one of the crown's steps holds now.
function holds(state, world, d) {
  switch (d.type) {
    case 'dawn': return state.dawn?.done != null;
    case 'suzerain': return suzerainOf(state, d.realm) === TEMERIA;
    case 'understanding': return !!treatyBetween(state, TEMERIA, d.realm) || trustIn(state, world, d.realm, TEMERIA) >= d.trust;
    default: return false;
  }
}

function reward(state, world, r = {}) {
  if (r.coin) windfall(state, 'quests', r.coin);
  if (r.love) nudge(state, world, 'love', r.love, "The Lion's path");
  if (r.fear) nudge(state, world, 'fear', r.fear, "The Lion's path");
}

export function rewardText(r = {}) {
  return [r.coin ? `${r.coin} crowns` : '', r.love ? `Love +${r.love}` : '', r.fear ? `Fear +${r.fear}` : ''].filter(Boolean).join(', ');
}

// What a rival's step does to its realm.
function apply(state, world, rng, rid, fx = {}) {
  const realm = state.realms?.[rid];
  if (!realm) return '';
  if (fx.army) realm.army = (realm.army ?? 0) + fx.army;
  if (fx.treasury) realm.treasury = (realm.treasury ?? 0) + fx.treasury;
  for (const [id, n] of Object.entries(fx.garrison ?? {})) if (realm.settlements?.[id]) realm.settlements[id].garrison = (realm.settlements[id].garrison ?? 0) + n;
  if (fx.nets && state.spycraft?.nets?.[rid]) {
    const row = state.spycraft.nets[rid];
    for (const [target, v] of Object.entries(fx.nets)) {
      const targets = target === 'all' ? Object.keys(row) : [target];
      for (const t of targets) if (row[t] !== undefined) row[t] = clamp(row[t] + v, 0, 100);
    }
  }
  // Dol Blathanna: by loyalty, the elves stay quiet and fight for Aedirn;
  // by force, they go to the woods and may side with the Empire.
  if (fx.elves) {
    const loyal = rng.chance(fx.elves.loyalty);
    (state.paths.aedirn ??= {}).elves = loyal ? 'loyal' : 'forced';
    return loyal ? ', by grants of land and the old rights: the elves keep faith with Vengerberg' : ', by fire and the sword: the elves who live have gone to the woods, and some say to the Empire';
  }
  return '';
}

export function monthlyPaths(state, world, rng) {
  if (!P(world)) return;
  state.paths ??= newPaths(state, world);
  // The crown's own path: goals, in order.
  const mine = state.paths[TEMERIA];
  const def = P(world)[TEMERIA];
  while (mine && mine.step < def.steps.length && holds(state, world, def.steps[mine.step].done)) {
    const st = def.steps[mine.step];
    mine.done.push({ id: st.id, day: state.day });
    mine.step += 1;
    mine.since = state.day;
    reward(state, world, st.reward);
    addDispatch(state, `${def.name}: ${st.name}.${rewardText(st.reward) ? ` The crown has ${rewardText(st.reward)}.` : ''}${mine.step >= def.steps.length ? ' The Lion\'s house is in order.' : ''}`, 'realm');
  }
  // The rivals: a step at a time, when their time comes.
  for (const rid of RIVALS(world)) {
    const p = (state.paths[rid] ??= { step: 0, since: state.day, done: [] });
    const r = P(world)[rid];
    if (!state.realms?.[rid] || state.realms[rid].fallen || p.step >= r.steps.length) continue;
    const st = r.steps[p.step];
    if (state.day - p.since < st.months * 30 || !rng.chance(st.chance)) continue;
    const how = apply(state, world, rng, rid, st.effects);
    p.done.push({ id: st.id, day: state.day });
    p.step += 1;
    p.since = state.day;
    const known = informed(state, world, rid);
    addDispatch(state, known
      ? `From ${sideName(world, rid)}: ${st.text.replace(/\.$/, '')}${how}. (${r.ruler}'s path, ${p.step} of ${r.steps.length})`
      : `Rumour from ${sideName(world, rid)}: ${r.ruler} is busy, and his court is pleased with itself.`, 'abroad');
  }
}

// For the screens: every path, what is done and what comes next. Rival
// steps are named only where the crown has eyes in that court.
export function pathsView(state, world) {
  if (!P(world) || !state.paths) return null;
  return REALMS(world).map((rid) => {
    const def = P(world)[rid];
    const p = state.paths[rid] ?? { step: 0, done: [] };
    const seen = rid === TEMERIA || informed(state, world, rid);
    return {
      rid, ruler: def.ruler, name: def.name, war: def.war ?? null, mine: rid === TEMERIA, seen,
      done: p.step >= def.steps.length, step: p.step, total: def.steps.length,
      steps: def.steps.map((st, i) => ({ id: st.id, name: seen || i < p.step ? st.name : 'Unknown', text: st.text, done: i < p.step, next: i === p.step, reward: st.reward ?? null, where: st.where ?? null })),
      elves: p.elves ?? null,
    };
  });
}
