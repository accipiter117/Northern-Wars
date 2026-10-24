// Monthly births, deaths and departures. Every people grows at the same rate
// for now; faith and tension (M4) will pull them apart.
import { addDispatch } from './realm.js';
import { prosperityMult } from './economy.js';

export function monthlyPopulation(state, world, rng) {
  const p = world.economy.population;
  const starving = [];
  for (const [id, s] of Object.entries(state.settlements)) {
    let rate = p.growthPerMonth * prosperityMult(world, s) * (1 - s.hunger);
    rate -= p.hungerDeathsPerMonth * s.hunger;
    if (s.unrest > p.emigrationAboveUnrest) rate -= p.emigrationPerMonth;
    for (const people of Object.keys(s.population)) {
      const n = s.population[people];
      const change = n * rate;
      // Stochastic rounding so small villages still grow, a soul at a time.
      const whole = Math.floor(change);
      s.population[people] = Math.max(0, n + whole + (rng.next() < change - whole ? 1 : 0));
    }
    if (s.hunger > 0.2) starving.push(world.byId[id].name);
  }
  if (starving.length) {
    const names = starving.length > 3 ? `${starving.slice(0, 3).join(', ')} and ${starving.length - 3} more` : starving.join(', ');
    addDispatch(state, `Hunger stalks ${names}. The old and the young are the first to go.`);
  }
}
