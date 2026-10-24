// Placeholder realm dynamics for M1. They exist so the top bar meters move and
// the long-run tests have something to guard; M2 replaces the numbers with the
// real economy.
import { dateOf, MONTHS } from './calendar.js';

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
  const hungry = state.granary <= 0;
  for (const [id, s] of Object.entries(state.settlements)) {
    const start = world.settlementData[id];
    // Unrest and prosperity wander but are pulled back to where they started,
    // with winter and empty granaries pushing unrest up.
    let pull = start.unrest;
    if (date.season === 'winter') pull += 4;
    if (hungry) pull += 15;
    s.unrest = clamp(s.unrest + (pull - s.unrest) * 0.02 + (rng.next() - 0.5) * 0.8, 0, 100);
    s.prosperity = clamp(s.prosperity + (start.prosperity - s.prosperity) * 0.02 + (rng.next() - 0.5) * 0.6, 0, 100);
  }
  state.stability = computeStability(state);

  if (date.day === 1) monthlyLedger(state, rng, date);
}

function monthlyLedger(state, rng, date) {
  let people = 0;
  let income = 0;
  let upkeep = 0;
  for (const s of Object.values(state.settlements)) {
    const pop = popOf(s);
    people += pop;
    income += pop * (s.prosperity / 100) * 0.02;
    upkeep += s.garrison * 0.1;
  }
  income = Math.round(income);
  upkeep = Math.round(upkeep);
  state.treasury = Math.max(0, state.treasury + income - upkeep);

  // The month that just ended decides food: harvest months fill the granary,
  // winter months eat into it harder.
  const ended = date.month === 1 ? 12 : date.month - 1;
  const eaten = Math.round((people / 50) * (ended === 12 || ended <= 2 ? 1.3 : 1));
  let reaped = 0;
  if (ended >= 8 && ended <= 10) reaped = Math.round((people / 50) * 4.4 * (0.8 + rng.next() * 0.4));
  state.granary = clamp(state.granary + reaped - eaten, 0, 30000);

  const name = MONTHS[ended - 1].name;
  let text = `The ledger for ${name}: ${income} crowns in taxes, ${upkeep} spent on garrisons.`;
  if (reaped) text += ` The harvest brought in ${reaped} measures of grain.`;
  if (state.granary <= 0) text += ' The granaries stand empty and the people go hungry.';
  addDispatch(state, text);
}

export function addDispatch(state, text) {
  state.chronicle.push({ day: state.day, text });
  if (state.chronicle.length > CHRONICLE_LIMIT) state.chronicle.splice(0, state.chronicle.length - CHRONICLE_LIMIT);
}
