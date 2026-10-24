import { makeRng } from './rng.js';
import { stepRealmDay } from './realm.js';
import { stepAmbientDay } from './ambient.js';

// Advance the game by whole days and return a new state; the input is left
// untouched. The RNG streams live in state.rng, so the same state always
// steps to the same result, including after a save and load.
export function step(state, days, world, { ambient = true } = {}) {
  const next = structuredClone(state);
  const gameRng = makeRng(next.rng.game);
  const ambientRng = makeRng(next.rng.ambient);
  for (let i = 0; i < days; i++) {
    next.day += 1;
    stepRealmDay(next, world, gameRng);
    if (ambient) stepAmbientDay(next, world, ambientRng);
  }
  next.rng.game = gameRng.seed;
  next.rng.ambient = ambientRng.seed;
  return next;
}
