// The realm's day: the economy turns, moods drift, and on the first of each
// month the ledger and the census are drawn up.
import { dateOf } from './calendar.js';
import { stepEconomyDay, monthlyLedger, buildingEffects, foodNeed } from './economy.js';
import { monthlyPopulation } from './population.js';
import { lawEffects, stepOpinionDay, opinionUnrest } from './laws.js';
import { stepNeighboursDay, monthlyEnvoy } from './neighbours.js';

const CHRONICLE_LIMIT = 200;

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Stability is public order, so it follows unrest weighted by how many people
// live under it.
export function computeStability(state) {
  let people = 0;
  let weighted = 0;
  for (const s of Object.values(state.settlements)) {
    const pop = popOf(s);
    people += pop;
    weighted += pop * s.unrest;
  }
  return people > 0 ? clamp(100 - weighted / people, 0, 100) : 0;
}

function popOf(s) {
  return s.population.human + s.population.dwarf + s.population.elf + s.population.halfling;
}

export function stepRealmDay(state, world, rng) {
  const date = dateOf(state.day);
  stepEconomyDay(state, world);
  stepOpinionDay(state, world);
  stepNeighboursDay(state, world);
  const law = lawEffects(state, world);
  const m = world.economy.mood;
  for (const [id, s] of Object.entries(state.settlements)) {
    const start = world.settlementData[id];
    const fx = buildingEffects(world, s);
    const need = foodNeed(world, s, date.season);
    const wellFed = need > 0 && s.stock.food / need >= m.wellFedDays;
    // Each settlement has a mood it settles towards: where it started, moved
    // by hunger, winter, unpaid soldiers and what the crown has built there.
    const type = world.byId[id].type;
    let unrestTarget = start.unrest + fx.unrest + s.hunger * m.hungerUnrest + law.unrest[type] + opinionUnrest(state, world, id, s);
    if (date.season === 'winter') unrestTarget += m.winterUnrest;
    if (state.unpaid && s.garrison > 0) unrestTarget += world.economy.debt.unpaidUnrest;
    unrestTarget -= Math.max(0, s.prosperity - 50) * m.prosperityCalm;
    let prosperityTarget = start.prosperity + fx.prosperity + law.prosperity[type] - s.hunger * m.hungerProsperity;
    if (wellFed) prosperityTarget += m.wellFedProsperity;
    prosperityTarget -= Math.max(0, s.unrest - 50) * m.unrestBlight;

    s.unrest = clamp(s.unrest + (clamp(unrestTarget, 0, 100) - s.unrest) * m.drift + (rng.next() - 0.5) * 0.8, 0, 100);
    s.prosperity = clamp(s.prosperity + (clamp(prosperityTarget, 0, 100) - s.prosperity) * m.drift + (rng.next() - 0.5) * 0.6, 0, 100);
  }
  state.stability = computeStability(state);

  if (date.day === 1) {
    monthlyLedger(state, world);
    monthlyPopulation(state, world, rng);
    monthlyEnvoy(state, world, rng);
  }
}

export function addDispatch(state, text) {
  state.chronicle.push({ day: state.day, text });
  if (state.chronicle.length > CHRONICLE_LIMIT) state.chronicle.splice(0, state.chronicle.length - CHRONICLE_LIMIT);
}
