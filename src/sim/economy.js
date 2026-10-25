// The crown's economy. Every settlement keeps its own stockpiles: farms fill
// the food store, woodcutters, quarries and mines fill the rest, people eat,
// and surplus grain moves along the market to places running short. Once a
// month the ledger is drawn up: taxes and trade in, garrisons, upkeep, court
// and interest out. The treasury may go below zero; the bankers lend, at a price.
import { dateOf } from './calendar.js';
import { totalPopulation } from './state.js';
import { addDispatch } from './realm.js';
import { number } from './text.js';
import { lawEffects } from './laws.js';
import { foreignTrade, stanceCost } from './neighbours.js';
import { crownShare } from './houses.js';
import { garrisonFactor, quarantined } from './military.js';

const say = (state, text) => addDispatch(state, text, 'treasury');

const GOODS = ['timber', 'stone', 'iron'];

export function buildingEffects(world, s) {
  const fx = { foodYield: 0, goodsYield: 0, storage: 0, trade: 0, prosperity: 0, unrest: 0, vision: 0 };
  for (const id of s.buildings) {
    for (const [k, v] of Object.entries(world.buildings[id].effects)) fx[k] += v;
  }
  return fx;
}

export function prosperityMult(world, s) {
  const p = world.economy.prosperityYield;
  return p.min + p.perPoint * s.prosperity;
}

export function foodNeed(world, s, season) {
  const f = world.economy.food;
  return totalPopulation(s) * f.perPersonDay * (season === 'winter' ? f.winterFactor : 1);
}

export function foodCapacity(world, s, law = null) {
  const f = world.economy.food;
  const base = Math.max(f.storageMin, totalPopulation(s) * f.perPersonDay * f.storageDays);
  return base * (1 + buildingEffects(world, s).storage + (law?.storage ?? 0));
}

const weightMean = new WeakMap();

// Food grown per day this month. Month weights are normalised so a year's
// harvest equals the farm base times 365, whatever the shape of the curve.
export function foodYield(world, id, s, month, law = null) {
  const f = world.economy.food;
  let mean = weightMean.get(f);
  if (!mean) weightMean.set(f, (mean = f.monthWeights.reduce((a, b) => a + b, 0) / 12));
  const type = world.byId[id].type;
  const focus = s.production === 'food' ? f.farmingFocus.food : f.farmingFocus.other;
  const terrain = f.terrainYield[world.terrainOf[id]] ?? 1;
  const fx = buildingEffects(world, s);
  return f.farmBase[type] * focus * terrain * prosperityMult(world, s) * (1 + fx.foodYield + (law?.foodYield ?? 0)) * (f.monthWeights[month - 1] / mean);
}

// Timber, stone or iron per day, for settlements whose trade is one of those.
export function goodsYield(world, id, s) {
  if (!GOODS.includes(s.production)) return 0;
  const g = world.economy.goods;
  const bonus = g.terrainBonus[s.production] === world.terrainOf[id] ? g.terrainBonusFactor : 1;
  return g.base[s.production] * g.typeScale[world.byId[id].type] * bonus * prosperityMult(world, s) * (1 + buildingEffects(world, s).goodsYield);
}

// Money in and out for one month's ledger. Construction and decrees are paid
// when ordered, so they are listed but not counted here.
export function ledgerNet({ income, expenses }) {
  const i = income.taxes + income.trade + income.sales + (income.foreign ?? 0);
  const o = expenses.garrisons + expenses.upkeep + expenses.court + (expenses.edicts ?? 0) + (expenses.gifts ?? 0) + (expenses.patrols ?? 0) + (expenses.embassies ?? 0) + expenses.interest;
  return { in: i, out: o, net: i - o };
}

export function realmStock(state) {
  const total = { food: 0, timber: 0, stone: 0, iron: 0 };
  for (const s of Object.values(state.settlements)) for (const k of Object.keys(total)) total[k] += s.stock[k];
  return total;
}

export function stepEconomyDay(state, world) {
  const date = dateOf(state.day);
  const law = lawEffects(state, world);
  for (const [id, s] of Object.entries(state.settlements)) {
    s.stock.food += foodYield(world, id, s, date.month, law);
    if (GOODS.includes(s.production)) s.stock[s.production] += goodsYield(world, id, s);
    const need = foodNeed(world, s, date.season);
    let shortfall = 0;
    if (s.stock.food >= need) s.stock.food -= need;
    else {
      shortfall = need > 0 ? (need - s.stock.food) / need : 0;
      s.stock.food = 0;
    }
    // Hunger is smoothed so one bad day is not a famine, but a bad month is.
    s.hunger = s.hunger * 0.9 + shortfall * 0.1;
    s.stock.food = Math.min(s.stock.food, foodCapacity(world, s, law));
  }
  shipFood(state, world, date.season);
  advanceConstruction(state, world);
}

// Grain flows from places with plenty to places running low, losing a little
// on the road. Recorded flows drive the grain carts on the map.
function shipFood(state, world, season) {
  const f = world.economy.food;
  const sources = [];
  const sinks = [];
  let offer = 0;
  let want = 0;
  for (const [id, s] of Object.entries(state.settlements)) {
    const need = foodNeed(world, s, season);
    if (need <= 0) continue;
    const excess = s.stock.food - f.reserveHigh * need;
    const lack = f.reserveLow * need - s.stock.food;
    if (excess > 0) { sources.push([id, excess]); offer += excess; }
    if (lack > 0) { sinks.push([id, lack]); want += lack; }
  }
  const flows = state.flows;
  for (const side of ['out', 'in']) for (const k of Object.keys(flows[side])) {
    flows[side][k] *= 0.95;
    if (flows[side][k] < 0.5) delete flows[side][k];
  }
  if (!sources.length || !sinks.length) return;
  const moved = Math.min(offer * f.shipShare, want);
  for (const [id, excess] of sources) {
    const give = (moved * excess) / offer;
    state.settlements[id].stock.food -= give;
    flows.out[id] = (flows.out[id] ?? 0) + give;
  }
  for (const [id, lack] of sinks) {
    const get = ((moved * lack) / want) * (1 - f.shipLoss);
    state.settlements[id].stock.food += get;
    flows.in[id] = (flows.in[id] ?? 0) + get;
  }
}

function advanceConstruction(state, world) {
  for (const [id, s] of Object.entries(state.settlements)) {
    if (!s.construction) continue;
    s.construction.daysLeft -= 1;
    if (s.construction.daysLeft <= 0) {
      const b = s.construction.building;
      s.buildings.push(b);
      if (state.reign) state.reign.built += 1;
      s.construction = null;
      say(state, `The ${world.buildings[b].name.toLowerCase()} at ${world.byId[id].name} is finished.`);
    }
  }
}

// Called on the first day of each month for the month just ended.
export function monthlyLedger(state, world) {
  const e = world.economy;
  const debtCfg = e.debt;
  const law = lawEffects(state, world);
  const g = world.groups.effects;
  const tradeMult = Math.max(0, 1 + law.trade + (state.opinion.burghers - 50) * g.burgherTrade);
  const income = { taxes: 0, trade: 0, sales: 0, foreign: foreignTrade(state, world).total };
  const expenses = {
    garrisons: 0,
    upkeep: 0,
    // A full treasury draws courtiers and hangers-on, so a hoard levels off
    // instead of piling up for ever.
    court: e.upkeep.courtMonth * Math.max(0, 1 + law.court) + Math.max(0, state.treasury - e.upkeep.hoardFree) * e.upkeep.hoardPerMonth,
    edicts: law.monthly,
    gifts: stanceCost(state, world),
    patrols: state.patrols.length * world.military.patrol.cost,
    embassies: Object.keys(state.embassies ?? {}).length * (world.realms?.intelligence.embassy.monthly ?? 0),
    interest: 0,
    construction: state.ledger.construction,
    decrees: state.ledger.decrees ?? 0,
  };

  for (const [id, s] of Object.entries(state.settlements)) {
    const pop = totalPopulation(s);
    const mult = prosperityMult(world, s);
    const fx = buildingEffects(world, s);
    // Lords keep part of what their lands yield, and pay their own soldiers.
    const share = crownShare(state, world, s);
    income.taxes += pop * e.taxes.perPersonMonth * mult * Math.max(0, 1 + law.tax) * share;
    const focus = s.production === 'coin' ? e.trade.coinFocus : 1;
    income.trade += pop * e.trade.perPersonMonth[world.byId[id].type] * focus * mult * (1 + fx.trade) * tradeMult * share * (quarantined(state, s) ? 0 : 1);
    for (const g of GOODS) {
      const over = s.stock[g] - e.goods.storageCap;
      if (over > 0) {
        income.sales += over * e.goods.prices[g];
        s.stock[g] = e.goods.storageCap;
      }
    }
    if (s.holder === 'crown') expenses.garrisons += s.garrison * e.upkeep.garrisonPerSoldierMonth * (1 + law.garrisonUpkeep);
    for (const b of s.buildings) expenses.upkeep += world.buildings[b].upkeep;
  }
  if (state.treasury < 0) expenses.interest = -state.treasury * debtCfg.interestPerMonth;

  for (const k of Object.keys(income)) income[k] = Math.round(income[k]);
  for (const k of Object.keys(expenses)) expenses[k] = Math.round(expenses[k]);
  const net = ledgerNet({ income, expenses });
  const totalIn = net.in;
  const totalOut = net.out;
  state.treasury += totalIn - totalOut;

  // Debt costs the crown its grip on the lords. Past the bankers' limit the
  // soldiers go unpaid, grumble and slip away.
  const debt = Math.max(0, -state.treasury);
  // Authority returns slowly by itself, faster when the lords are content
  // and the court impresses them, and drains while the crown is in debt.
  // The crown's grip returns by itself only so far; beyond that it takes
  // content lords or a court that dazzles them.
  const regen = state.authority < (g.authorityRegenBelow ?? 100) ? g.authorityRegen : 0;
  state.authority += regen + (state.opinion.nobles - 50) * g.nobleAuthority + law.authority;
  if (debt > 0) state.authority -= (debt / 1000) * debtCfg.authorityPerThousand;
  state.authority = Math.max(0, Math.min(100, state.authority));
  state.unpaid = debt > debtCfg.creditLimit;
  for (const [id, s] of Object.entries(state.settlements)) {
    if (state.unpaid) s.garrison = Math.floor(s.garrison * (1 - debtCfg.desertionPerMonth));
    else {
      // Garrisons drift towards what the conscription law calls for.
      const level = s.holder === 'crown' ? garrisonFactor(state, world, id) : 1;
      const target = world.settlementData[id].garrison * Math.max(0, 1 + law.garrison) * level;
      s.garrison = Math.max(0, Math.round(s.garrison + (target - s.garrison) * 0.1));
    }
  }

  const date = dateOf(state.day - 1);
  state.ledger.history.push({ year: date.year, month: date.month, income, expenses, treasury: Math.round(state.treasury) });
  if (state.ledger.history.length > 12) state.ledger.history.shift();
  state.ledger.construction = 0;
  state.ledger.decrees = 0;

  let text = `The ledger for the month: ${number(totalIn)} crowns in, ${number(totalOut)} out. `;
  text += state.treasury >= 0
    ? `The treasury holds ${number(state.treasury)}.`
    : `The crown owes ${debtCfg.lender} ${number(debt)} crowns${expenses.interest ? `, and paid ${number(expenses.interest)} in interest` : ''}.`;
  if (state.unpaid) text += ' The bankers will lend no more. The garrisons go unpaid and men are deserting.';
  say(state, text);
}
