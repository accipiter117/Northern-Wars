// The crown's economy. Every settlement keeps its own stockpiles: farms fill
// the food store, woodcutters, quarries and mines fill the rest, people eat,
// and surplus grain moves along the market to places running short. Once a
// month the ledger is drawn up: taxes and trade in, garrisons, upkeep, court
// and interest out. The treasury may go below zero; the bankers lend, at a price.
import { dateOf } from './calendar.js';
import { integrationFactor } from './conquest.js';
import { totalPopulation } from './state.js';
import { addDispatch } from './realm.js';
import { number } from './text.js';
import { lawEffects } from './laws.js';
import { foreignTrade, stanceCost } from './neighbours.js';
import { crownShare } from './houses.js';
import { garrisonFactor, quarantined } from './military.js';
import { companyUpkeep } from './forces.js';
import { TEMERIA, ownerOf, leviedMap, besieged } from './conflict.js';
import { tradeLedger, routeKey } from './trade.js';
import { goldLedger } from './gold.js';
import { industryLedger, saltStorage } from './industry.js';
import { dealLedger } from './deals.js';
import { worksFactor, upkeepFactor } from './works.js';

const say = (state, text) => addDispatch(state, text, 'treasury');

const GOODS = ['timber', 'stone', 'iron'];

const EFFECTS = [
  'foodYield', 'goodsYield', 'storage', 'trade', 'prosperity', 'unrest', 'vision', 'goodsStorage', 'sales', 'craft', 'customs',
  'routes', 'routeValue', 'garrisonUpkeep', 'garrisonBonus', 'soldierStrength', 'armyArms', 'ironUse', 'plagueSpread', 'plagueDeaths',
  'authority', 'tension', 'creditLimit', 'interest', 'traffic', 'gold', 'silver', 'taxBonus',
];

// What a place's works add up to, each as it stands (M20: the lower of its
// condition and its staffing). Numbers stack; `opinion` and `faith` (per
// group or faith) are gathered separately where they are used.
export function buildingEffects(world, s) {
  const fx = {};
  for (const k of EFFECTS) fx[k] = 0;
  for (const id of s.buildings) {
    const f = worksFactor(s, id);
    for (const [k, v] of Object.entries(world.buildings[id].effects)) if (typeof v === 'number') fx[k] = (fx[k] ?? 0) + v * f;
  }
  return fx;
}

// Sum of one effect over every place the crown governs.
export function realmEffect(state, world, key) {
  let v = 0;
  for (const s of Object.values(state.settlements)) {
    if (s.occupier) continue;
    for (const b of s.buildings) v += (world.buildings[b].effects[key] ?? 0) * worksFactor(s, b);
  }
  return v;
}

// How far the bankers will let the crown go into debt; a dwarven bank lends more.
export function creditLimit(state, world) {
  return world.economy.debt.creditLimit + realmEffect(state, world, 'creditLimit');
}

export function prosperityMult(world, s) {
  const p = world.economy.prosperityYield;
  return p.min + p.perPoint * s.prosperity;
}

export function foodNeed(world, s, season) {
  const f = world.economy.food;
  return totalPopulation(s) * f.perPersonDay * (season === 'winter' ? f.winterFactor : 1);
}

// Taxes rise faster with a place's fortunes than its other yields do.
export function taxProsperity(world, s) {
  const t = world.economy.taxes;
  return t.prosperityBase + t.perProsperity * s.prosperity;
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
  const sum = (v) => (typeof v === 'number' ? v : Object.values(v ?? {}).reduce((a, b) => a + b, 0));
  let i = 0;
  for (const v of Object.values(income)) i += sum(v);
  let o = 0;
  for (const [k, v] of Object.entries(expenses)) if (k !== 'construction' && k !== 'decrees') o += sum(v);
  return { in: i, out: o, net: i - o };
}

export function realmStock(state) {
  const total = { food: 0, timber: 0, stone: 0, iron: 0 };
  for (const s of Object.values(state.settlements)) for (const k of Object.keys(total)) total[k] += s.stock[k];
  return total;
}

export function stepEconomyDay(state, world) {
  const date = dateOf(state.day);
  // Salt from the pans keeps every store a little longer.
  const salt = saltStorage(state, world);
  const law = salt ? { ...lawEffects(state, world) } : lawEffects(state, world);
  if (salt) law.storage = (law.storage ?? 0) + salt;
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
    if (need <= 0 || s.occupier) continue;
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
    // Work stops in a town under an enemy's flag.
    if (!s.construction || s.occupier) continue;
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
// What will move Authority on the first of next month, part by part: its
// slow return by itself, the lords' mood, the laws in force, buildings such
// as a cathedral of the Fire, and the drain of debt. The monthly ledger uses
// these very figures, so the meter's card and the rules never disagree.
export function authorityParts(state, world) {
  const g = world.groups.effects;
  const debt = Math.max(0, -state.treasury);
  return {
    regen: state.authority < (g.authorityRegenBelow ?? 100) ? g.authorityRegen : 0,
    nobles: (state.opinion.nobles - 50) * g.nobleAuthority,
    laws: lawEffects(state, world).authority,
    buildings: realmEffect(state, world, 'authority'),
    debt: debt > 0 ? -(debt / 1000) * world.economy.debt.authorityPerThousand : 0,
    // Above what a crown regains of itself, prestige fades unless renewed
    // (M19: in a long peace it no longer creeps to the cap).
    fade: -Math.max(0, state.authority - (g.authorityRegenBelow ?? 100)) * (g.authorityFade ?? 0),
  };
}

export function monthlyLedger(state, world, rng = null) {
  const e = world.economy;
  const debtCfg = e.debt;
  const law = lawEffects(state, world);
  const g = world.groups.effects;
  const tradeMult = Math.max(0, 1 + law.trade + (state.opinion.burghers - 50) * g.burgherTrade);
  const income = {
    taxes: 0, trade: 0, sales: 0, foreign: foreignTrade(state, world).total, conquests: 0, tribute: 0,
    crafts: {}, customs: 0, gold: 0, silver: 0, tolls: 0, rents: 0, donations: 0, contracts: 0, goods: {}, routes: {}, deals: {},
  };
  // What each place earned for the crown and cost it, for its card.
  const places = {};
  const put = (id, v) => { if (state.settlements[id]) (places[id] ??= { in: 0, out: 0 }).in += v; };
  const cost = (id, v) => { (places[id] ??= { in: 0, out: 0 }).out += v; };
  const expenses = {
    garrisons: 0,
    upkeep: 0,
    // A full treasury draws courtiers and hangers-on, so a hoard levels off
    // instead of piling up for ever.
    court: e.upkeep.courtMonth * Math.max(0, 1 + law.court) + Math.max(0, state.treasury - e.upkeep.hoardFree) * e.upkeep.hoardPerMonth,
    edicts: law.monthly,
    gifts: stanceCost(state, world),
    companies: 0,
    embassies: Object.keys(state.embassies ?? {}).length * (world.realms?.intelligence.embassy.monthly ?? 0),
    armies: 0,
    occupation: 0,
    tribute: 0,
    deals: {},
    routes: 0,
    interest: 0,
    construction: state.ledger.construction,
    decrees: state.ledger.decrees ?? 0,
  };

  // The more of one craft the realm has, the less each earns: the market
  // for leather or potions is only so big.
  const crafts = {};
  for (const s of Object.values(state.settlements)) {
    if (s.occupier) continue;
    for (const b of s.buildings) if (world.buildings[b].effects.craft) crafts[b] = (crafts[b] ?? 0) + 1;
  }
  const crowd = (b) => 1 / (1 + e.crafts.crowding * (crafts[b] - 1));

  for (const [id, s] of Object.entries(state.settlements)) {
    // An occupied town pays its occupier, not the crown.
    if (s.occupier) continue;
    const pop = totalPopulation(s);
    const mult = prosperityMult(world, s);
    const fx = buildingEffects(world, s);
    // Lords keep part of what their lands yield, and pay their own soldiers.
    const share = crownShare(state, world, s);
    const type = world.byId[id].type;
    // Cities pay most a head and villages least; richer places pay more,
    // and market halls, guildhalls and merchants' quarters more again.
    // A conquered town pays as it has come to accept the crown (M19), and
    // less again under a charter won by rising.
    const yoke = integrationFactor(world, s, 'taxAt') * (s.charter > state.day ? world.conquest.revolt.charterTax : 1);
    const tax = pop * e.taxes.perPersonMonth[type] * taxProsperity(world, s) * (1 + fx.taxBonus) * Math.max(0, 1 + law.tax) * share * yoke;
    income.taxes += tax;
    const focus = s.production === 'coin' ? e.trade.coinFocus : 1;
    // Roads held by bandits keep the carts at home.
    const robbed = 1 - (world.forces?.roads.tradeCut ?? 0) * Math.min(1, (state.threats?.robbed[id] ?? 0) / 30);
    const trade = pop * e.trade.perPersonMonth[type] * focus * mult * (1 + fx.trade * (e.trade.worksScale ?? 1)) * tradeMult * share * robbed * (quarantined(state, s) ? 0 : 1);
    income.trade += trade;
    put(id, tax + trade);
    // Each craft pays by the size and fortunes of its place, on its own
    // line; quays on the river or the sea collect customs.
    const scale = e.crafts.placeScale[type] * mult * share;
    for (const b of s.buildings) {
      if (!world.buildings[b].effects.craft) continue;
      const c = world.buildings[b].effects.craft * crowd(b) * worksFactor(s, b) * (e.crafts.works ?? 1);
      income.crafts[b] = (income.crafts[b] ?? 0) + c * scale;
      put(id, c * scale);
    }
    if (fx.customs && world.waterOf?.[id]?.navigable) {
      income.customs += fx.customs * share;
      put(id, fx.customs * share);
    }
    // Surplus goods are sold off above what the place can store; a
    // warehouse stores more and sells dearer.
    const cap = e.goods.storageCap + fx.goodsStorage;
    for (const g of GOODS) {
      const over = s.stock[g] - cap;
      if (over > 0) {
        income.sales += over * e.goods.prices[g] * (1 + fx.sales);
        put(id, over * e.goods.prices[g] * (1 + fx.sales));
        s.stock[g] = cap;
      }
    }
    // Smithies and armouries eat iron, from home first and then the realm.
    if (fx.ironUse) useIron(state, s, fx.ironUse);
    if (s.holder === 'crown') {
      const pay = s.garrison * e.upkeep.garrisonPerSoldierMonth * Math.max(0.2, 1 + law.garrisonUpkeep + fx.garrisonUpkeep);
      expenses.garrisons += pay;
      cost(id, pay);
    }
    for (const b of s.buildings) {
      const u = world.buildings[b].upkeep * upkeepFactor(world, s, b);
      expenses.upkeep += u;
      cost(id, u);
    }
  }
  warLedger(state, world, income, expenses, law);
  tradeLedger(state, world, income, expenses);
  for (const r of state.routes ?? []) {
    const ends = [r.from, r.to].filter((x) => state.settlements[x]);
    for (const x of ends) {
      put(x, (income.routes[routeKey(r)] ?? 0) / ends.length);
      cost(x, world.trade.upkeep / ends.length);
    }
  }
  goldLedger(state, world, income, put);
  // Deals struck in audiences: payments and goods, month by month.
  const deliveries = [];
  dealLedger(state, world, income, expenses, deliveries);
  // The standing companies, paid where they are stationed.
  for (const c of state.forces?.companies ?? []) {
    const pay = companyUpkeep(world, c);
    expenses.companies += pay;
    cost(c.station, pay);
  }
  industryLedger(state, world, income, put, dateOf(state.day - 1).season);
  // A dwarven bank lends cheaper.
  if (state.treasury < 0) expenses.interest = -state.treasury * debtCfg.interestPerMonth * Math.max(0.5, 1 + Math.min(0, realmEffect(state, world, 'interest')));

  for (const k of Object.keys(income)) {
    if (typeof income[k] === 'number') income[k] = Math.round(income[k]);
    else for (const j of Object.keys(income[k])) income[k][j] = Math.round(income[k][j]);
  }
  state.ledger.places = Object.fromEntries(Object.entries(places).map(([id, v]) => [id, { in: Math.round(v.in), out: Math.round(v.out) }]));
  for (const k of Object.keys(expenses)) {
    if (typeof expenses[k] === 'number') expenses[k] = Math.round(expenses[k]);
    else for (const j of Object.keys(expenses[k])) expenses[k][j] = Math.round(expenses[k][j]);
  }
  const net = ledgerNet({ income, expenses });
  const totalIn = net.in;
  const totalOut = net.out;
  state.treasury += totalIn - totalOut;
  // Past the bankers' limit the bills simply go unpaid, so the debt stops
  // growing a little beyond it (and the soldiers desert, below).
  const limit = creditLimit(state, world);
  state.treasury = Math.max(state.treasury, -limit * 1.25);

  // Debt costs the crown its grip on the lords. Past the bankers' limit the
  // soldiers go unpaid, grumble and slip away.
  const debt = Math.max(0, -state.treasury);
  // Authority returns slowly by itself, faster when the lords are content
  // and the court impresses them, and drains while the crown is in debt.
  // The crown's grip returns by itself only so far; beyond that it takes
  // content lords or a court that dazzles them.
  const parts = authorityParts(state, world);
  state.authority += parts.regen + parts.nobles + parts.laws + parts.buildings + parts.fade;
  if (debt > 0) state.authority += parts.debt;
  state.authority = Math.max(0, Math.min(100, state.authority));
  state.unpaid = debt > limit;
  const levied = leviedMap(state);
  for (const [id, s] of Object.entries(state.settlements)) {
    // An occupier keeps his own garrison, and a town under siege gets no fresh men.
    if (s.occupier || besieged(state, id)) continue;
    if (state.unpaid) s.garrison = Math.floor(s.garrison * (1 - debtCfg.desertionPerMonth));
    else {
      // Garrisons drift towards what the conscription law calls for, less
      // the men away with the army.
      const level = s.holder === 'crown' ? garrisonFactor(state, world, id) : 1;
      // Barracks quarter more men for their ordinary pay.
      const barracks = 1 + buildingEffects(world, s).garrisonBonus;
      const willing = integrationFactor(world, s, 'levyAt');
      const target = Math.max(0, world.settlementData[id].garrison * Math.max(0, 1 + law.garrison) * level * barracks * willing - (levied[id] ?? 0));
      s.garrison = Math.max(0, Math.round(s.garrison + (target - s.garrison) * 0.1));
    }
  }

  const date = dateOf(state.day - 1);
  state.ledger.history.push({ year: date.year, month: date.month, income, expenses, treasury: Math.round(state.treasury), ...(deliveries.length ? { deliveries } : {}) });
  if (state.ledger.history.length > 12) state.ledger.history.shift();
  state.ledger.construction = 0;
  state.ledger.decrees = 0;
  if (state.threats) {
    state.threats.blocked = {};
    state.threats.robbed = {};
  }

  let text = `The ledger for the month: ${number(totalIn)} crowns in, ${number(totalOut)} out. `;
  text += state.treasury >= 0
    ? `The treasury holds ${number(state.treasury)}.`
    : `The crown owes ${debtCfg.lender} ${number(debt)} crowns${expenses.interest ? `, and paid ${number(expenses.interest)} in interest` : ''}.`;
  if (state.unpaid) text += ' The bankers will lend no more. The garrisons go unpaid and men are deserting.';
  say(state, text);
}

// War's share of the ledger: the armies' pay, what conquered towns yield and
// cost to hold, and tribute paid or received.
function warLedger(state, world, income, expenses, law) {
  if (!world.war || !state.armies) return;
  const r = world.war.raise;
  for (const a of state.armies) {
    if (a.side !== TEMERIA) continue;
    const hired = Math.min(a.soldiers, a.companies * r.company);
    expenses.armies += (a.soldiers - hired) * r.fieldPayPerSoldier + a.companies * r.companyMonthly;
  }
  const re = world.realms.economy;
  for (const [rid, realm] of Object.entries(state.realms ?? {})) {
    for (const [id, s] of Object.entries(realm.settlements)) {
      if (ownerOf(state, world, id) !== TEMERIA) continue;
      income.conquests += s.population * re.taxPerPersonMonth * (0.6 + 0.008 * s.prosperity) * Math.max(0, 1 + law.tax);
      expenses.occupation += s.garrison * world.economy.upkeep.garrisonPerSoldierMonth * (1 + law.garrisonUpkeep);
    }
  }
  for (const t of state.tributes ?? []) {
    if (t.until <= state.day) continue;
    if (t.to === TEMERIA) income.tribute += t.monthly;
    if (t.from === TEMERIA) expenses.tribute += t.monthly;
  }
}

function useIron(state, s, need) {
  const own = Math.min(s.stock.iron, need);
  s.stock.iron -= own;
  let left = need - own;
  if (left <= 0) return;
  const total = Object.values(state.settlements).reduce((a, t) => a + t.stock.iron, 0);
  if (total <= 0) return;
  const take = Math.min(left, total);
  for (const t of Object.values(state.settlements)) t.stock.iron -= (take * t.stock.iron) / total;
}
