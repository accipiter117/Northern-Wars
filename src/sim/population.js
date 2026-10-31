// Monthly births, deaths and departures. Every people grows at the same rate
// for now; faith and tension (M4) will pull them apart.
import { addDispatch } from './realm.js';
import { number } from './text.js';
import { prosperityMult } from './economy.js';
import { bookEffect } from './book.js';
import { lawEffects } from './laws.js';

const say = (state, text) => addDispatch(state, text, 'realm');

export function monthlyPopulation(state, world, rng) {
  const p = world.economy.population;
  const starving = [];
  const law = lawEffects(state, world);
  let exiles = 0;
  for (const [id, s] of Object.entries(state.settlements)) {
    let rate = p.growthPerMonth * prosperityMult(world, s) * (1 - s.hunger) * Math.max(0, 1 + law.growth);
    // Poor relief (M26) keeps the hungry alive.
    rate -= p.hungerDeathsPerMonth * s.hunger * Math.max(0, 1 + bookEffect(state, world, 'hungerDeaths'));
    if (s.unrest > p.emigrationAboveUnrest) rate -= p.emigrationPerMonth;
    for (const people of Object.keys(s.population)) {
      const n = s.population[people];
      const leaving = people === 'human' ? 0 : law.nonhumanExodus;
      const change = n * (rate - leaving);
      if (leaving) exiles += n * leaving;
      // Stochastic rounding so small villages still grow, a soul at a time.
      const whole = Math.floor(change);
      s.population[people] = Math.max(0, n + whole + (rng.next() < change - whole ? 1 : 0));
    }
    if (s.hunger > 0.2) starving.push(world.byId[id].name);
  }
  if (exiles >= 1) say(state, `${number(exiles)} dwarves, elves and halflings left the realm this month, carrying what they could.`);
  if (starving.length) {
    const names = starving.length > 3 ? `${starving.slice(0, 3).join(', ')} and ${starving.length - 3} more` : starving.join(', ');
    say(state, `Hunger stalks ${names}. The old and the young are the first to go.`);
  }
}
