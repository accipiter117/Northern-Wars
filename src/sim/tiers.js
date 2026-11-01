// The tiers of the North (M29 A): great powers, middle crowns and petty
// kingdoms, and the titles a suzerain wins over its vassals. Brokilon sits
// outside the tiers. A vassal's suzerain is held on its realm (M29 B); until
// then a protectorate treaty counts, its protector the suzerain.
import { TEMERIA } from './conflict.js';

const T = (world) => world.diplomacy?.tiers;

export function tierOf(world, rid) {
  if (rid === TEMERIA) return 'great';
  return world.realms?.realms[rid]?.tier ?? 'petty';
}

export const isGreat = (world, rid) => tierOf(world, rid) === 'great';

export function suzerainOf(state, rid) {
  const own = state.realms?.[rid]?.suzerain;
  if (own) return own;
  const t = (state.diplomacy?.treaties ?? []).find((x) => x.kind === 'protectorate' && x.b === rid);
  return t?.a ?? null;
}

export function vassalsOf(state, world, side) {
  return Object.keys(state.realms ?? {}).filter((rid) => !state.realms[rid].fallen && suzerainOf(state, rid) === side);
}

// The titles a side holds: one for each vassal, and any won for ever (a
// kingdom annexed, M29 C).
export function titlesOf(state, world, side = TEMERIA) {
  const titles = T(world)?.titles ?? {};
  // In the order the titles are written, the oldest honours first.
  const mine = new Set(vassalsOf(state, world, side));
  const out = Object.keys(titles).filter((rid) => mine.has(rid)).map((rid) => titles[rid]);
  if (side === TEMERIA) for (const t of state.titles ?? []) if (!out.includes(t)) out.push(t);
  return out;
}

// Foltest's style on the Court screen, growing with each title won.
export function crownStyle(state, world) {
  const king = world.kingdom.king ?? 'Foltest';
  return [`${king}, King of ${world.kingdom.name}`, ...titlesOf(state, world, TEMERIA)].join(', ');
}

// Whether a petty ruler would come before a great king in person: only when
// relations are warm, or the offer is a very good one.
export function asksAudience(state, world, pid, offerValue = 0) {
  if (tierOf(world, pid) !== 'petty') return true;
  const t = T(world);
  if (!t) return true;
  return (state.neighbours?.[pid]?.relation ?? 0) >= t.audienceAbove || offerValue >= t.bigOffer;
}

// How readily a realm would take on another alone: middle and petty crowns
// rarely pick a fight with a great power.
export function appetiteAgainst(world, rid, target) {
  const t = T(world);
  if (!t || tierOf(world, target) !== 'great') return 1;
  const tier = tierOf(world, rid);
  if (tier === 'middle') return t.middleVsGreat;
  if (tier === 'petty') return t.pettyVsGreat;
  return 1;
}
