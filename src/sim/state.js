import { dayNumber } from './calendar.js';
import { streamSeed } from './rng.js';
import { computeStability, addDispatch } from './realm.js';

export const STATE_VERSION = 1;

export function createState(world, seed = 1) {
  const k = world.kingdom;
  const settlements = {};
  for (const s of world.geography.settlements) {
    const d = world.settlementData[s.id];
    if (!d) throw new Error(`No starting data for settlement ${s.id}`);
    settlements[s.id] = {
      population: { ...d.population },
      faith: { ...d.faith },
      prosperity: d.prosperity,
      unrest: d.unrest,
      production: d.production,
      garrison: d.garrison,
      holder: d.holder,
    };
  }
  const state = {
    version: STATE_VERSION,
    kingdom: k.id,
    seed: seed >>> 0,
    day: dayNumber(k.start),
    rng: { game: streamSeed(seed, 1), ambient: streamSeed(seed, 2) },
    treasury: k.treasury,
    granary: k.granary,
    authority: k.authority,
    stability: 0,
    settlements,
    ambient: { nextId: 1, units: [] },
    chronicle: [],
  };
  state.stability = computeStability(state);
  if (k.opening) addDispatch(state, k.opening);
  return state;
}

export function totalPopulation(s) {
  let n = 0;
  for (const v of Object.values(s.population)) n += v;
  return n;
}
