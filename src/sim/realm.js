// The realm's day: the economy turns, moods drift, and on the first of each
// month the ledger and the census are drawn up.
import { stepMetersDay, monthlyMeters, crownCalm, threatUnrest } from './meters.js';
import { dateOf } from './calendar.js';
import { stepEconomyDay, monthlyLedger, buildingEffects, foodNeed, creditLimit } from './economy.js';
import { monthlyPopulation } from './population.js';
import { lawEffects, stepOpinionDay, opinionUnrest } from './laws.js';
import { stepNeighboursDay, monthlyEnvoy } from './neighbours.js';
import { monthlyDiplomacy, stepDiplomacyDay } from './audiences.js';
import { stepCultureDay, monthlyCulture, tensionUnrest } from './culture.js';
import { stepPetitionsDay, monthlyPetition } from './petitions.js';
import { stepDilemmasDay, monthlyDilemmas } from './dilemmas.js';
import { stepFiguresDay } from './figures.js';
import { stepHousesDay, monthlyHouses, holderUnrest } from './houses.js';
import { monthlyThreats, monthlyEvent, stepEventsDay, plagueActive } from './military.js';
import { monthlyRealms } from './realms.js';
import { stepArmiesDay } from './armies.js';
import { monthlyWar, stepWarDecisionsDay, warMonths } from './war.js';
import { monthlyConquest, stepConquestDay, integrationUnrest } from './conquest.js';
import { leviedMap } from './conflict.js';
import { monthlyGold, stepGoldDay } from './gold.js';
import { stepThreatsDay } from './threats.js';
import { stepCompaniesDay, monthlyCompanies } from './forces.js';
import { stepWorksDay, monthlyWorks, worksUnrest } from './works.js';
import { stepLabourDay, monthlyLabour } from './labour.js';
import { monthlyFaiths } from './faiths.js';
import { stepRebellionDay } from './rebellion.js';
import { stepVassalsDay } from './vassals.js';
import { resolveOrders, noteTheirMoves, marchingNow } from './board.js';

const CHRONICLE_LIMIT = 400;

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}


export function stepRealmDay(state, world, rng) {
  const date = dateOf(state.day);
  // Who works where today (M20 C), before anything is made.
  if (state.labour) stepLabourDay(state, world);
  stepEconomyDay(state, world);
  stepOpinionDay(state, world);
  stepNeighboursDay(state, world);
  stepDiplomacyDay(state, world);
  stepCultureDay(state, world);
  stepPetitionsDay(state, world);
  stepDilemmasDay(state, world);
  stepFiguresDay(state);
  stepHousesDay(state, world);
  stepEventsDay(state, world, rng);
  if (state.gold) stepGoldDay(state, world, rng);
  if (state.works) stepWorksDay(state, world);
  if (state.wars) {
    stepArmiesDay(state, world, rng);
    // A rising's seat retaken or its lord taken in the field (M27 C).
    if (state.houses) stepRebellionDay(state, world, rng);
    // A rebel vassal king's capital taken (M29 C).
    stepVassalsDay(state, world);
    stepWarDecisionsDay(state, world);
    stepConquestDay(state, world);
  }
  if (state.threats) {
    stepThreatsDay(state, world, rng);
    stepCompaniesDay(state, world, rng);
  }
  const law = lawEffects(state, world);
  const m = world.economy.mood;
  const wr = world.war?.weariness;
  const weary = wr ? Math.min(wr.maxUnrest, warMonths(state) * wr.unrestPerMonth) : 0;
  const levied = leviedMap(state);
  const debtShare = Math.min(1, Math.max(0, -state.treasury) / creditLimit(state, world));
  for (const [id, s] of Object.entries(state.settlements)) {
    const start = world.settlementData[id];
    const fx = buildingEffects(world, s);
    const need = foodNeed(world, s, date.season);
    const wellFed = need > 0 && s.stock.food / need >= m.wellFedDays;
    // Each settlement has a mood it settles towards: where it started, moved
    // by hunger, winter, unpaid soldiers and what the crown has built there.
    const type = world.byId[id].type;
    let unrestTarget = start.unrest + fx.unrest + s.hunger * m.hungerUnrest + law.unrest[type] + opinionUnrest(state, world, id, s) + tensionUnrest(world, s) + holderUnrest(state, world, s)
      + (plagueActive(state, s) ? world.military.plague.unrest : 0) + integrationUnrest(world, s) + worksUnrest(world, s);
    if (date.season === 'winter') unrestTarget += m.winterUnrest;
    // A long war, an occupier's yoke, and sons marched off with the levy.
    unrestTarget += s.occupier ? 30 : weary;
    if (state.unpaid && s.garrison > 0) unrestTarget += world.economy.debt.unpaidUnrest;
    // Deep in debt, the crown's tax farmers squeeze harder for the bankers.
    if (debtShare > 0) unrestTarget += world.economy.debt.debtUnrest * debtShare;
    unrestTarget -= Math.max(0, s.prosperity - 50) * m.prosperityCalm;
    // Folk who no longer trust the crown turn sullen, then angry (M22 D).
    const mt = world.meters?.love;
    if (mt && !s.occupier) {
      // Folk with no love for the crown turn sullen (M22 D); a loved or a
      // feared crown's towns are calmer (M24 B); beasts and bandits near a
      // town anger it (what Dread carried before).
      unrestTarget += Math.max(0, mt.lowBelow - (state.love ?? 50)) * (mt.lowAnger ?? 0);
      unrestTarget -= crownCalm(state, world);
      unrestTarget += threatUnrest(state, world, id);
    }
    let prosperityTarget = start.prosperity + fx.prosperity + law.prosperity[type] - s.hunger * m.hungerProsperity;
    if (wellFed) prosperityTarget += m.wellFedProsperity;
    if (levied[id]) prosperityTarget -= world.war.raise.levyProsperity * Math.min(1, levied[id] / Math.max(1, levied[id] + s.garrison));
    prosperityTarget -= Math.max(0, s.unrest - 50) * m.unrestBlight;

    s.unrest = clamp(s.unrest + (clamp(unrestTarget, 0, 100) - s.unrest) * m.drift + (rng.next() - 0.5) * 0.8, 0, 100);
    s.prosperity = clamp(s.prosperity + (clamp(prosperityTarget, 0, 100) - s.prosperity) * m.drift + (rng.next() - 0.5) * 0.6, 0, 100);
  }
  stepMetersDay(state, world);

  if (date.day === 1) {
    monthlyLedger(state, world, rng);
    monthlyCompanies(state, world);
    if (state.gold) monthlyGold(state, world);
    monthlyPopulation(state, world, rng);
    // Rulers' own requests for audiences replace the old random envoys.
    if (!state.diplomacy) monthlyEnvoy(state, world, rng);
    monthlyCulture(state, world, rng);
    // The faiths' Devotion, perks and clashes (M26 C).
    monthlyFaiths(state, world, rng);
    monthlyPetition(state, world, rng);
    // Dilemmas that follow from the crown's laws, and demands for change (M28).
    monthlyDilemmas(state, world, rng);
    // Love, Fear and Unrest take stock of the month (M24 B), before the
    // lords weigh the reign.
    monthlyMeters(state, world, rng);
    monthlyHouses(state, world, rng);
    monthlyThreats(state, world, rng);
    monthlyEvent(state, world, rng, date.season);
    // The turn of the month on the board (M20 E): the crown's orders go out
    // with the rulers' own moves.
    const marching = state.orders ? marchingNow(state, world) : null;
    if (state.orders) resolveOrders(state, world);
    monthlyRealms(state, world, rng);
    if (state.works) monthlyWorks(state, world, rng);
    if (state.labour) monthlyLabour(state, world, rng);
    monthlyDiplomacy(state, world, rng);
    if (state.wars) monthlyWar(state, world, rng);
    if (state.wars) monthlyConquest(state, world, rng);
    if (state.orders) noteTheirMoves(state, world, marching);
  }
}

// Every dispatch carries a kind, so the chronicle can be read by subject:
// treasury, realm, abroad, faith, nobles or military.
export function addDispatch(state, text, kind = 'realm') {
  state.chronicle.push({ day: state.day, text, kind });
  if (state.chronicle.length > CHRONICLE_LIMIT) state.chronicle.splice(0, state.chronicle.length - CHRONICLE_LIMIT);
}
