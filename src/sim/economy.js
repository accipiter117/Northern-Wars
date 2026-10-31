// The crown's economy. Every settlement keeps its own stockpiles: farms fill
// the food store, woodcutters, quarries and mines fill the rest, people eat,
// and surplus grain moves along the market to places running short. Once a
// month the ledger is drawn up: taxes and trade in, garrisons, upkeep, court
// and interest out. The treasury may go below zero; the bankers lend, at a price.
import { nudge, taxCollected, sabotage } from './meters.js';
import { normalise } from './companies.js';
import { dateOf, MONTHS } from './calendar.js';
import { integrationFactor, conquestYield } from './conquest.js';
import { totalPopulation } from './state.js';
import { addDispatch } from './realm.js';
import { number } from './text.js';
import { lawEffects, enactment } from './laws.js';
import { foreignTrade, stanceCost } from './neighbours.js';
import { crownShare } from './houses.js';
import { garrisonFactor, quarantined } from './military.js';
import { companyUpkeep } from './forces.js';
import { TEMERIA, ownerOf, leviedMap, besieged, sideName } from './conflict.js';
import { tradeLedger, routeKey } from './trade.js';
import { goldLedger } from './gold.js';
import { industryLedger, saltStorage } from './industry.js';
import { dealLedger } from './deals.js';
import { worksFactor, upkeepFactor } from './works.js';
import { farmFactor, levyFactor } from './labour.js';
import { loanLedger } from './loans.js';
import { bookEffect, outputMult } from './book.js';
import { nonhumanShare } from './culture.js';
import { churchLand, faithEffect } from './faiths.js';
import { marketLedger, noteMade, noteUsed, noteSpill, offer, isHeld, marketGoodOf } from './market.js';

const say = (state, text) => addDispatch(state, text, 'treasury');

const GOODS = ['timber', 'stone', 'iron'];

const EFFECTS = [
  'foodYield', 'goodsYield', 'storage', 'trade', 'prosperity', 'unrest', 'vision', 'goodsStorage', 'sales', 'craft', 'customs',
  'routes', 'routeValue', 'garrisonUpkeep', 'garrisonBonus', 'soldierStrength', 'armyArms', 'ironUse', 'plagueSpread', 'plagueDeaths',
  'love', 'fear', 'tension', 'creditLimit', 'interest', 'traffic', 'gold', 'silver', 'taxBonus',
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
  return world.economy.debt.creditLimit + realmEffect(state, world, 'creditLimit') + bookEffect(state, world, 'creditLimit');
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
  // As many hands as the fields need bring the harvest in (M20 C).
  return f.farmBase[type] * focus * terrain * prosperityMult(world, s) * (1 + fx.foodYield + (law?.foodYield ?? 0)) * (f.monthWeights[month - 1] / mean) * Math.max(law?.harvestFloor ?? 0, farmFactor(world, s));
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

// War's takings, for the Steward's report.
export const WAR_TAKINGS = ['purses', 'raids', 'loot', 'ransom', 'conquests', 'tribute', 'reparations', 'requisition'];

// The Steward's report (M24 C): last month in three numbers, the three
// costs that weighed most and the kinds of work under half manned, for the
// inbox and the Treasury. Of the court's cost, `hoard` is what a full
// treasury draws in courtiers.
export function stewardReport(state, world) {
  const last = state.ledger?.history?.at(-1);
  if (!last) return null;
  const { in: income, out, net } = ledgerNet(last);
  const sum = (v) => (typeof v === 'number' ? v : Object.values(v ?? {}).reduce((a, b) => a + b, 0));
  const costs = Object.entries(last.expenses).filter(([k]) => k !== 'construction' && k !== 'decrees')
    .map(([key, v]) => ({ key, v: Math.round(sum(v)) })).filter((c) => c.v > 0).sort((a, b) => b.v - a.v).slice(0, 3);
  const u = world.economy.upkeep;
  const hoard = Math.round(Math.max(0, (last.treasury ?? state.treasury) - u.hoardFree) * u.hoardPerMonth);
  // What fighting brought in (M24 D), line by line.
  const war = WAR_TAKINGS.map((key) => ({ key, v: Math.round(sum(last.income[key])) })).filter((w) => w.v > 0);
  return { month: last.month, year: last.year, in: Math.round(income), out: Math.round(out), net: Math.round(net), costs, hoard, war };
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
    if (GOODS.includes(s.production)) {
      // The Old Ways (M26 C): more timber from the woods.
      const q = goodsYield(world, id, s) * (s.production === 'timber' ? Math.max(0, 1 + faithEffect(state, world, 'woods')) : 1);
      s.stock[s.production] += q;
      noteMade(state, world, s.production, q);
    }
    const need = foodNeed(world, s, date.season);
    let shortfall = 0;
    if (s.stock.food >= need) s.stock.food -= need;
    else {
      shortfall = need > 0 ? (need - s.stock.food) / need : 0;
      s.stock.food = 0;
    }
    // Hunger is smoothed so one bad day is not a famine, but a bad month is.
    s.hunger = s.hunger * 0.9 + shortfall * 0.1;
    // Grain above the granaries' room would spoil; the market sells it (M21).
    const room = foodCapacity(world, s, law);
    if (s.stock.food > room) {
      if (!s.occupier) noteSpill(state, world, s.stock.food - room);
      s.stock.food = room;
    }
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
// The drain of debt on the crown's Love (M24 B; M22 D: the rest of what moves
// it, month by month, is in meters.js).
export function debtLove(state, world) {
  const debt = Math.max(0, -state.treasury);
  return debt > 0 ? -(debt / 1000) * world.economy.debt.lovePerThousand : 0;
}

// Coin that comes to the crown at once from war and deals (M21): loot,
// ransoms, coin in peace terms, requisition, lump sums from deals. It is in
// the treasury at once, and shows on the month's ledger as its own line.
export function windfall(state, kind, coin) {
  if (!(coin > 0)) return;
  state.treasury += coin;
  state.ledger.windfalls ??= {};
  state.ledger.windfalls[kind] = (state.ledger.windfalls[kind] ?? 0) + coin;
}

// Commanders and lords (M24 D) Temeria holds are bought back by their realms after a month,
// when they can pay: the ransom is war's takings on the ledger (M21).
export function collectRansoms(state, world) {
  const r = world.war?.battles?.ransom;
  if (!r?.paidAfterDays || !state.captives?.length) return;
  for (const c of [...state.captives]) {
    if (c.by !== TEMERIA || state.day - c.day < r.paidAfterDays) continue;
    const realm = state.realms?.[c.side];
    if (!realm || realm.treasury < c.ransom) continue;
    realm.treasury -= c.ransom;
    windfall(state, 'ransom', c.ransom);
    state.captives = state.captives.filter((x) => x !== c);
    const who = c.marshal ? world.war.marshals[c.marshal]?.name ?? 'their commander' : c.lord ? 'a lord taken in battle' : 'their commander';
    say(state, `${sideName(world, c.side)} pays ${number(c.ransom)} crowns to ransom ${who}.`);
  }
}

// A place's taxes to the crown (M21), each by its estate's setting: in
// cities and towns the head tax and the market dues (the merchants' trade),
// in villages, castles and temples the hearth tax and a tithe of the
// month's harvest at the grain price. Cities pay most a head and villages
// least; richer places pay more, and market halls, guildhalls and
// merchants' quarters more again. Lords keep part of what their lands
// yield; a conquered town pays as it has come to accept the crown and as
// its works are mended (M19, M24 C), and less again under a charter won by
// rising.
export function placeTaxes(state, world, id, s, law, { fx = buildingEffects(world, s), tradeMult = 1, month = dateOf(state.day).month } = {}) {
  const e = world.economy;
  const type = world.byId[id].type;
  const town = type === 'city' || type === 'town';
  const share = crownShare(state, world, s);
  const yoke = conquestYield(world, s) * (s.charter > state.day ? world.conquest.revolt.charterTax : 1);
  const rate = Math.max(0, 1 + law.tax + (law.taxBy?.[type] ?? 0));
  const pop = totalPopulation(s);
  const tax = pop * e.taxes.perPersonMonth[type] * taxProsperity(world, s) * (1 + fx.taxBonus) * rate * yoke * share;
  // Roads held by bandits keep the carts at home.
  const robbed = 1 - (world.forces?.roads.tradeCut ?? 0) * Math.min(1, (state.threats?.robbed[id] ?? 0) / 30);
  const focus = s.production === 'coin' ? e.trade.coinFocus : 1;
  const trade = pop * e.trade.perPersonMonth[type] * focus * prosperityMult(world, s) * (1 + fx.trade * (e.trade.worksScale ?? 1))
    * tradeMult * (town ? rate : 1) * share * robbed * yoke * (quarantined(state, s) ? 0 : 1);
  const days = MONTHS[month - 1].days;
  const tithe = town ? 0 : foodYield(world, id, s, month) * days * (e.taxes.tithe ?? 0) * (world.diplomacy?.goods.grain.price ?? 0.05) * rate * yoke * share;
  return { tax, trade, tithe, estate: town ? 'towns' : 'peasants' };
}

// Each great house's monthly due to the crown: a base and a share by the
// people of its lands, times the lords' setting. Rebels and houses granted
// an exemption pay nothing.
export function houseDues(state, world, law) {
  const n = world.economy.taxes.nobles;
  const out = {};
  if (!n || !state.houses) return out;
  for (const [h, house] of Object.entries(state.houses)) {
    if (house.rebel || (house.exemptUntil !== null && state.day < house.exemptUntil)) continue;
    const people = Object.values(state.settlements).filter((t) => t.holder === h && !t.occupier).reduce((a, t) => a + totalPopulation(t), 0);
    if (!people) continue;
    out[h] = (n.base + n.perPerson * people) * (law.nobleTax ?? 1);
  }
  return out;
}

// What each estate would pay a month under each of its settings, fully in
// force and all else as it stands, for the Treasury's choice.
export function estateTaxPreview(state, world) {
  const base = lawEffects(state, world);
  const g = world.groups.effects;
  const tradeMult = Math.max(0, 1 + base.trade + (state.opinion.burghers - 50) * g.burgherTrade);
  const month = dateOf(state.day).month;
  const out = {};
  for (const [estate, lawId] of [['towns', 'tax_towns'], ['peasants', 'tax_peasants'], ['nobles', 'tax_nobles']]) {
    const law = world.laws.laws[lawId];
    if (!law) continue;
    out[estate] = {};
    // What this law adds to the effects now, while a change takes hold too.
    const l = state.laws[lawId] ?? { option: law.default, previous: law.default };
    const k = enactment(state, world, lawId);
    const cur = law.options[l.option].effects;
    const prev = law.options[l.previous ?? l.option].effects;
    const now = { nobleTax: (cur.nobleTax ?? 0) * k + (prev.nobleTax ?? 0) * (1 - k), taxBy: {} };
    for (const t of Object.keys(base.taxBy)) now.taxBy[t] = (cur.taxBy?.[t] ?? 0) * k + (prev.taxBy?.[t] ?? 0) * (1 - k);
    for (const [opt, def] of Object.entries(law.options)) {
      const fx = { ...base, taxBy: { ...base.taxBy }, nobleTax: base.nobleTax - now.nobleTax + (def.effects.nobleTax ?? 0) };
      for (const t of Object.keys(fx.taxBy)) fx.taxBy[t] = base.taxBy[t] - now.taxBy[t] + (def.effects.taxBy?.[t] ?? 0);
      let sum = 0;
      if (estate === 'nobles') sum = Object.values(houseDues(state, world, fx)).reduce((a, v) => a + v, 0);
      else {
        for (const [id, s] of Object.entries(state.settlements)) {
          if (s.occupier) continue;
          const t = placeTaxes(state, world, id, s, fx, { tradeMult, month });
          if (t.estate === estate) sum += t.tax + t.trade + t.tithe;
        }
      }
      out[estate][opt] = Math.round(sum);
    }
  }
  return out;
}

export function monthlyLedger(state, world, rng = null) {
  collectRansoms(state, world);
  const e = world.economy;
  const debtCfg = e.debt;
  const law = lawEffects(state, world);
  const g = world.groups.effects;
  const tradeMult = Math.max(0, 1 + law.trade + (state.opinion.burghers - 50) * g.burgherTrade);
  const income = {
    taxes: 0, tithe: 0, nobles: 0, trade: 0, sales: 0, foreign: foreignTrade(state, world).total, conquests: 0, tribute: 0,
    crafts: {}, customs: 0, gold: 0, silver: 0, tolls: 0, rents: 0, donations: 0, contracts: 0, goods: {}, routes: {}, deals: {},
  };
  // Winter work (M24 C): hands the winter turn cannot place spin, mend and
  // cart at home for a little coin.
  const home = Object.values(state.labour?.report ?? {}).reduce((a, r) => a + (r.home ?? 0), 0);
  if (home > 0) income.homework = home * (e.homeWork ?? 0);
  // Taxes by estate (M21), for the Treasury's tax settings.
  const estates = { towns: 0, peasants: 0, nobles: 0 };
  const lastMonth = dateOf(state.day - 1).month;
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

  // What the crown's Authority gathers of the tax due, and the quiet
  // sabotage of a crown feared but not loved (M24 B).
  const collect = taxCollected(state, world);
  const quiet = sabotage(state, world);
  // The Book of Laws (M26): guild monopolies and long hours drive the
  // crafts harder; the non-human charter lifts their quarters' crafts.
  const lawCrafts = (1 + bookEffect(state, world, 'crafts')) * outputMult(state, world);
  const nonhumanCrafts = bookEffect(state, world, 'nonhumanCrafts');
  for (const [id, s] of Object.entries(state.settlements)) {
    // An occupied town pays its occupier, not the crown.
    if (s.occupier) continue;
    const mult = prosperityMult(world, s);
    const fx = buildingEffects(world, s);
    // Lords keep part of what their lands yield, and pay their own soldiers.
    const share = crownShare(state, world, s);
    const type = world.byId[id].type;
    // The towns' head tax and market dues, or the villages' hearth tax and
    // tithe (M21), each by its estate's setting.
    const t = placeTaxes(state, world, id, s, law, { fx, tradeMult, month: lastMonth });
    // Only as much as the crown's Authority can gather (M24 B).
    t.tax *= collect;
    t.tithe *= collect;
    income.taxes += t.tax;
    // Uproar under a weak crown empties the roads and the markets with them;
    // a calm realm fills them (M24 B; Dread's work in M22 D).
    t.trade *= state.meters?.trade ?? 1;
    income.trade += t.trade;
    income.tithe += t.tithe;
    estates[t.estate] += t.tax + t.trade + t.tithe;
    put(id, t.tax + t.trade + t.tithe);
    // Each craft pays by the size and fortunes of its place, on its own
    // line; quays on the river or the sea collect customs.
    const scale = e.crafts.placeScale[type] * mult * share * conquestYield(world, s);
    for (const b of s.buildings) {
      if (!world.buildings[b].effects.craft) continue;
      // Church land (M26 C): its takings go to the faith, not the crown.
      if (churchLand(state, id, b)) continue;
      // A strike (M22 D: high Unrest) stops half the workshops.
      const strike = (s.strike ?? 0) > state.day ? 1 - (world.meters?.unrest.strike ?? 0) : 1;
      const c = world.buildings[b].effects.craft * crowd(b) * worksFactor(s, b) * (e.crafts.works ?? 1) * strike * (1 - quiet) * lawCrafts * (nonhumanShare(s) >= 0.1 ? 1 + nonhumanCrafts : 1);
      income.crafts[b] = (income.crafts[b] ?? 0) + c * scale;
      put(id, c * scale);
      // Each place's crafts on their own, for its card and the law harness.
      places[id].crafts = (places[id].crafts ?? 0) + c * scale;
    }
    if (fx.customs && world.waterOf?.[id]?.navigable) {
      income.customs += fx.customs * share;
      put(id, fx.customs * share);
    }
    // Surplus goods above what the place can store go to market (M21), or
    // stay in store while the crown holds them back; a warehouse stores
    // more. Without a market they are sold at once as before.
    const cap = e.goods.storageCap + fx.goodsStorage;
    for (const g of GOODS) {
      const over = s.stock[g] - cap;
      if (over <= 0) continue;
      if (world.market) {
        if (isHeld(state, marketGoodOf(world, g).good)) continue;
        offer(state, world, g, over);
      } else {
        income.sales += over * e.goods.prices[g] * (1 + fx.sales);
        put(id, over * e.goods.prices[g] * (1 + fx.sales));
      }
      s.stock[g] = cap;
    }
    // Smithies and armouries eat iron, from home first and then the realm.
    if (fx.ironUse) useIron(state, world, s, fx.ironUse);
    const pay = s.holder === 'crown' ? s.garrison * e.upkeep.garrisonPerSoldierMonth * Math.max(0.2, 1 + law.garrisonUpkeep + fx.garrisonUpkeep) : 0;
    const keep = s.buildings.reduce((a, b) => a + world.buildings[b].upkeep * upkeepFactor(world, s, b), 0);
    // A conquered town (M24 C) keeps its garrison and its works from its
    // own takings first, and never costs the crown more than it brings in.
    const own = s.integration !== undefined ? Math.min(1, Math.max(0, (places[id]?.in ?? 0) - (places[id]?.out ?? 0)) / Math.max(1e-9, pay + keep)) : 1;
    expenses.garrisons += pay * own;
    expenses.upkeep += keep * own;
    cost(id, (pay + keep) * own);
  }
  // A soft cap (M21): the crafts together never earn more than a share of
  // the taxes and dues, however many works the realm has.
  const craftSum = Object.values(income.crafts).reduce((a, v) => a + v, 0);
  const craftCap = (e.crafts.capShare ?? Infinity) * (income.taxes + income.trade + income.tithe) * lawCrafts * (1 + nonhumanCrafts);
  if (craftSum > craftCap && craftSum > 0) for (const b of Object.keys(income.crafts)) income.crafts[b] *= craftCap / craftSum;
  // The great houses' dues, by the lords' setting (M21).
  for (const [h, v] of Object.entries(houseDues(state, world, law))) {
    income.nobles += v;
    estates.nobles += v;
    const seat = world.houses.houses[h]?.seat;
    if (seat) put(seat, v);
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
    const pay = companyUpkeep(world, c, state);
    expenses.companies += pay;
    cost(c.station, pay);
  }
  industryLedger(state, world, income, put, dateOf(state.day - 1).season);
  // The five goods: deals with partner realms, then home sales (M21).
  marketLedger(state, world, income, expenses);
  // A dwarven bank lends cheaper.
  if (state.treasury < 0) expenses.interest = -state.treasury * debtCfg.interestPerMonth * Math.max(0.25, 1 + Math.min(0, realmEffect(state, world, 'interest') + bookEffect(state, world, 'interest')));

  for (const k of Object.keys(income)) {
    if (typeof income[k] === 'number') income[k] = Math.round(income[k]);
    else for (const j of Object.keys(income[k])) income[k][j] = Math.round(income[k][j]);
  }
  state.ledger.places = Object.fromEntries(Object.entries(places).map(([id, v]) => [id, { in: Math.round(v.in), out: Math.round(v.out), ...(v.crafts ? { crafts: Math.round(v.crafts) } : {}) }]));
  for (const k of Object.keys(expenses)) {
    if (typeof expenses[k] === 'number') expenses[k] = Math.round(expenses[k]);
    else for (const j of Object.keys(expenses[k])) expenses[k][j] = Math.round(expenses[k][j]);
  }
  // War's takings and lump sums came in when they happened (M21): listed
  // here, but already in the treasury.
  const windfalls = state.ledger.windfalls ?? {};
  let already = 0;
  for (const [k, v] of Object.entries(windfalls)) {
    income[k] = (typeof income[k] === 'number' ? income[k] : 0) + Math.round(v);
    already += Math.round(v);
  }
  state.ledger.windfalls = {};
  // Loan payments, if the treasury can meet them (M21).
  const pre = ledgerNet({ income, expenses });
  loanLedger(state, world, expenses, state.treasury + pre.in - already - pre.out);
  const net = ledgerNet({ income, expenses });
  const totalIn = net.in;
  const totalOut = net.out;
  state.treasury += totalIn - already - totalOut;
  armiesAfterLedger(state, world);
  // Past the bankers' limit the bills simply go unpaid, so the debt stops
  // growing a little beyond it (and the soldiers desert, below).
  const limit = creditLimit(state, world);
  state.treasury = Math.max(state.treasury, -limit * 1.25);

  // Debt costs the crown its grip on the lords. Past the bankers' limit the
  // soldiers go unpaid, grumble and slip away.
  const debt = Math.max(0, -state.treasury);
  // Debt drains the folk's Love for the crown.
  if (debt > 0) nudge(state, world, 'love', debtLove(state, world), 'Debts to the bankers');
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
      // The levies' share of the kingdom's hands fills or thins them (M20 C).
      const target = Math.max(0, world.settlementData[id].garrison * Math.max(0, 1 + law.garrison) * level * barracks * willing * levyFactor(state, world) - (levied[id] ?? 0));
      s.garrison = Math.max(0, Math.round(s.garrison + (target - s.garrison) * 0.1));
    }
  }

  const date = dateOf(state.day - 1);
  state.ledger.history.push({
    year: date.year, month: date.month, income, expenses, treasury: Math.round(state.treasury),
    estates: Object.fromEntries(Object.entries(estates).map(([k, v]) => [k, Math.round(v)])),
    ...(deliveries.length ? { deliveries } : {}),
  });
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

// An army's pay for a month (M21): its levies and retinues by the man, more
// while campaigning (beyond the realm, or besieging or raiding), and its
// mercenaries at their own rate. The crown's standing companies are paid
// with the companies.
export function armyPay(state, world, a) {
  const r = world.war.raise;
  if (!a.folk || !r.pay) return 0;
  const f = Math.min(1, a.soldiers / Math.max(1, a.raised));
  const away = a.order === 'siege' || a.order === 'raid' || ownerOf(state, world, a.at) !== TEMERIA;
  const field = away ? r.pay.field : 1;
  const mc = r.mercenaries?.companies ?? {};
  return ((a.levyMen ?? 0) * r.pay.levy + (a.retinueMen ?? 0) * r.pay.retinue) * f * field + (a.mercs ?? []).reduce((v, m) => v + (mc[m.id]?.monthly ?? 0), 0);
}

// After the month's accounts (M21): mercenaries whose season is out go,
// and armies the treasury cannot pay lose heart, then men.
export function armiesAfterLedger(state, world) {
  const r = world.war?.raise;
  if (!r?.pay || !state.armies) return;
  const mc = r.mercenaries?.companies ?? {};
  for (const a of state.armies) {
    if (a.side !== TEMERIA || !a.folk) continue;
    for (const m of [...(a.mercs ?? [])]) {
      if (m.until > state.day) continue;
      const f = Math.min(1, a.soldiers / Math.max(1, a.raised));
      let gone = Math.round(m.men * f);
      // Its own companies march off (M22 C).
      if (a.bands?.length) {
        normalise(a);
        const theirs = a.bands.filter((b) => b.merc === m.id);
        if (theirs.length) gone = Math.round(theirs.reduce((v, b) => v + b.men, 0));
        a.bands = a.bands.filter((b) => b.merc !== m.id);
      }
      a.soldiers = Math.max(0, a.soldiers - gone);
      a.raised = Math.max(1, a.raised - m.men);
      a.mercs = a.mercs.filter((x) => x !== m);
      say(state, `${mc[m.id]?.name ?? 'A hired company'} has served its season and leaves ${a.name}: ${number(gone)} men.`);
    }
    if (state.treasury >= 0) {
      a.unpaid = 0;
      continue;
    }
    // The first month unpaid they grumble; from the second, men slip away.
    a.unpaid = (a.unpaid ?? 0) + 1;
    a.morale = Math.max(0, a.morale - r.unpaid.morale);
    if (a.unpaid >= 2 || a.morale < r.unpaid.desertBelow) {
      const gone = Math.round(a.soldiers * r.unpaid.desert);
      a.soldiers -= gone;
      say(state, `${a.name} goes unpaid: ${number(gone)} men desert.`);
    } else say(state, `${a.name} goes unpaid, and grumbles.`);
  }
}

// War's share of the ledger: the armies' pay, what conquered towns yield and
// cost to hold, and tribute paid or received.
function warLedger(state, world, income, expenses, law) {
  if (!world.war || !state.armies) return;
  const r = world.war.raise;
  for (const a of state.armies) {
    if (a.side !== TEMERIA) continue;
    if (a.folk) {
      expenses.armies += armyPay(state, world, a);
      continue;
    }
    const hired = Math.min(a.soldiers, a.companies * r.company);
    expenses.armies += (a.soldiers - hired) * r.fieldPayPerSoldier + a.companies * r.companyMonthly;
  }
  const re = world.realms.economy;
  for (const [rid, realm] of Object.entries(state.realms ?? {})) {
    for (const [id, s] of Object.entries(realm.settlements)) {
      if (ownerOf(state, world, id) !== TEMERIA) continue;
      // An occupied town pays for its own garrison and never costs the
      // crown more than it yields (M24 C).
      const takes = s.population * re.taxPerPersonMonth * (0.6 + 0.008 * s.prosperity) * Math.max(0, 1 + law.tax) * conquestYield(world, s);
      income.conquests += takes;
      expenses.occupation += Math.min(takes, s.garrison * world.economy.upkeep.garrisonPerSoldierMonth * (1 + law.garrisonUpkeep));
    }
  }
  for (const t of state.tributes ?? []) {
    if (t.until <= state.day) continue;
    if (t.to === TEMERIA) income.tribute += t.monthly;
    if (t.from === TEMERIA) expenses.tribute += t.monthly;
  }
}

function useIron(state, world, s, need) {
  noteUsed(state, world, 'iron', need);
  const own = Math.min(s.stock.iron, need);
  s.stock.iron -= own;
  let left = need - own;
  if (left <= 0) return;
  const total = Object.values(state.settlements).reduce((a, t) => a + t.stock.iron, 0);
  if (total <= 0) return;
  const take = Math.min(left, total);
  for (const t of Object.values(state.settlements)) t.stock.iron -= (take * t.stock.iron) / total;
}
