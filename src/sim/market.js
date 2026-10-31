// The market (M21): the realm's trade in five goods. Grain, timber and
// stone, iron and arms, cloth, and luxuries each roll up the underlying
// goods the realm grows, digs and makes, measured in loads. Each month every
// good has a balance (made against what the realm uses), and its price at
// home rises with a shortage and falls with a glut. Trade deals, one per
// partner realm, sell a good the partner wants and buy one it offers, so
// much a month; whatever surplus is left sells at home, cheaper than abroad,
// unless the crown holds it back. War and closed borders cut deals and make
// what they supplied dearer. The routes, carts and tolls underneath carry
// the goods but are not managed one by one.
import { totalPopulation } from './state.js';
import { foodYield, foodNeed, goodsYield, prosperityMult } from './economy.js';
import { worksFactor } from './works.js';
import { MONTHS, dateOf } from './calendar.js';
import { addDispatch } from './realm.js';
import { TEMERIA, hostile, placesHeldBy, sideName, atWar } from './conflict.js';
import { bookEffect } from './book.js';
import { number } from './text.js';

const M = (world) => world.market;
const say = (state, text) => addDispatch(state, text, 'treasury');
export const MARKET_GOODS = ['grain', 'materials', 'iron', 'cloth', 'luxuries'];

// Which of the five goods an underlying good rolls up into, and how many
// loads one unit of it makes.
export function marketGoodOf(world, under) {
  for (const [g, def] of Object.entries(M(world)?.goods ?? {})) if (def.of[under] !== undefined) return { good: g, per: def.of[under] };
  return null;
}

export function defaultMarket(world) {
  const goods = Object.keys(M(world)?.goods ?? {});
  return {
    hold: Object.fromEntries(goods.map((g) => [g, false])),
    price: Object.fromEntries(goods.map((g) => [g, 1])),
    deals: {},
    cut: {},
    store: Object.fromEntries(goods.map((g) => [g, 0])),
    report: {},
    month: freshMonth(goods),
  };
}

// What the month's working records: loads offered for sale (surplus), loads
// short of what the realm wants, and what the stores made and used.
function freshMonth(goods) {
  const z = () => Object.fromEntries(goods.map((g) => [g, 0]));
  return { offer: z(), short: z(), made: z(), used: z(), spill: 0 };
}

function month(state, world) {
  state.market ??= defaultMarket(world);
  state.market.month ??= freshMonth(Object.keys(M(world).goods));
  return state.market.month;
}

export const isHeld = (state, good) => !!state.market?.hold?.[good];

// Recorders, called from the economy and industry as goods move.
export function noteMade(state, world, under, qty) {
  if (!M(world) || qty <= 0) return;
  const m = marketGoodOf(world, under);
  if (m) month(state, world).made[m.good] += qty * m.per;
}
export function noteUsed(state, world, under, qty) {
  if (!M(world) || qty <= 0) return;
  const m = marketGoodOf(world, under);
  if (m) month(state, world).used[m.good] += qty * m.per;
}
// Surplus of an underlying good put up for sale this month; held goods go
// to the crown's store instead. Returns whether it was offered.
export function offer(state, world, under, qty) {
  if (!M(world) || qty <= 0) return false;
  const m = marketGoodOf(world, under);
  if (!m) return false;
  if (isHeld(state, m.good)) {
    state.market.store[m.good] = (state.market.store[m.good] ?? 0) + qty * m.per;
    return false;
  }
  month(state, world).offer[m.good] += qty * m.per;
  return true;
}
export function noteShort(state, world, under, qty) {
  if (!M(world) || qty <= 0) return;
  const m = marketGoodOf(world, under);
  if (m) month(state, world).short[m.good] += qty * m.per;
}
// Grain that would spoil above the granaries' room, counted daily.
export function noteSpill(state, world, food) {
  if (!M(world) || food <= 0) return;
  month(state, world).spill += food;
}

// ---- Prices ----

export function homePrice(state, world, good) {
  return M(world).goods[good].base * (state.market?.price?.[good] ?? 1);
}
// The home price of one unit of an underlying good (a cart of timber, a
// bar of iron), for buying in what the stores lack.
export function underPrice(state, world, under) {
  const m = M(world) && marketGoodOf(world, under);
  if (!m) return world.economy.goods.prices[under] ?? 1;
  return homePrice(state, world, m.good) * m.per;
}

export function homeSalePrice(state, world, good) {
  return homePrice(state, world, good) * M(world).home;
}

// A year's harvest against a year's eating, a month's worth, in loads.
export function grainBalance(state, world) {
  let made = 0;
  let used = 0;
  for (const [id, s] of Object.entries(state.settlements)) {
    if (s.occupier) continue;
    for (let m = 1; m <= 12; m++) {
      made += foodYield(world, id, s, m) * MONTHS[m - 1].days;
      used += foodNeed(world, s, seasonOfMonth(m)) * MONTHS[m - 1].days;
    }
  }
  const per = M(world).goods.grain.of.food;
  return { made: (made / 12) * per, used: (used / 12) * per };
}

function seasonOfMonth(m) {
  return m === 12 || m <= 2 ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'autumn';
}

// What the realm (or a list of its places) makes in a month as its works
// stand and are manned, in loads of the five goods, and what its crafts
// earn: for previews of a change to the hands (M21 C). Inputs between works
// (charcoal for the smiths, wool for the weavers) are not netted out.
export function monthlyOutput(state, world, ids = null) {
  const cfg = M(world);
  const out = { grain: 0, materials: 0, iron: 0, cloth: 0, luxuries: 0, crowns: 0 };
  if (!cfg) return out;
  const d = dateOf(state.day);
  const days = MONTHS[d.month - 1].days;
  const i = world.industry;
  const e = world.economy;
  for (const id of ids ?? Object.keys(state.settlements)) {
    const s = state.settlements[id];
    if (!s || s.occupier) continue;
    out.grain += foodYield(world, id, s, d.month) * days * cfg.goods.grain.of.food;
    const q = goodsYield(world, id, s) * days;
    const m = q > 0 && marketGoodOf(world, s.production);
    if (m) out[m.good] += q * m.per;
    const mult = prosperityMult(world, s);
    for (const b of s.buildings) {
      const wf = worksFactor(s, b);
      const make = i?.makers[b] ?? i?.workers[b];
      if (make) {
        const g = marketGoodOf(world, make.good);
        if (g) out[g.good] += make.amount * mult * wf * g.per;
      }
      const craft = world.buildings[b].effects.craft;
      if (craft) out.crowns += craft * (e.crafts.works ?? 1) * e.crafts.placeScale[world.byId[id].type] * mult * wf;
    }
  }
  return out;
}

// ---- Partners ----

// What a partner realm wants and offers, from its own land: the two goods
// its works make most of for its people, and the two they make least of. War
// makes it want iron and arms; worn fields make it want grain.
export function partnerTrade(state, world, rid) {
  const cfg = M(world);
  const realm = state.realms?.[rid];
  if (!cfg || !realm) return null;
  const score = Object.fromEntries(MARKET_GOODS.map((g) => [g, 0]));
  let people = 0;
  let fields = 0;
  let fieldsWorn = 0;
  for (const id of placesHeldBy(state, world, rid)) {
    const p = realm.settlements[id] ?? state.settlements[id];
    if (!p) continue;
    people += p.population !== undefined && typeof p.population === 'number' ? p.population : totalPopulation(p);
    for (const b of p.buildings ?? []) {
      const cond = (p.cond?.[b] ?? 100) / 100;
      for (const g of MARKET_GOODS) if (cfg.realmWorks[g].includes(b)) score[g] += cond;
      if (b === 'fields') {
        fields += 1;
        if (cond < 0.6) fieldsWorn += 1;
      }
    }
  }
  for (const made of world.industry?.abroadMakes?.[rid] ?? []) {
    const m = marketGoodOf(world, made);
    if (m) score[m.good] += 2;
  }
  const per = Math.max(1, people / 10000);
  const ranked = [...MARKET_GOODS].sort((a, b) => score[b] / per - score[a] / per || MARKET_GOODS.indexOf(a) - MARKET_GOODS.indexOf(b));
  let offers = ranked.slice(0, 2);
  let wants = ranked.slice(-2).reverse();
  const needs = [];
  if (atWar(state, rid)) needs.push('iron');
  if (fields && fieldsWorn / fields > 0.3) needs.push('grain');
  for (const g of needs) {
    if (wants.includes(g)) continue;
    offers = offers.filter((x) => x !== g);
    wants = [g, ...wants].slice(0, 2);
  }
  while (offers.length < 2) offers.push(ranked.find((g) => !offers.includes(g) && !wants.includes(g)));
  return { wants, offers, capacity: Math.round(people * cfg.deals.perPerson), people };
}

// Merchant charters (M26) raise what partners pay, when the realm is known.
export function exportPrice(world, good, state = null) {
  return M(world).goods[good].base * M(world).export.want * (state ? 1 + bookEffect(state, world, 'dealPrice') : 1);
}
export function importPrice(world, good) {
  return M(world).goods[good].base * M(world).import.offer;
}

function relationOf(state, rid) {
  return state.neighbours?.[rid]?.relation ?? 0;
}

// Can the crown strike this deal with a partner? `sell` and `buy` are
// { good, qty } or null.
export function canTrade(state, world, rid, sell, buy) {
  const cfg = M(world);
  if (!cfg) return { ok: false, reason: 'No trade in this world.' };
  const p = partnerTrade(state, world, rid);
  if (!p || state.realms[rid]?.fallen) return { ok: false, reason: 'Choose a realm of the North.' };
  if (hostile(state, TEMERIA, rid)) return { ok: false, reason: 'No trade with an enemy.' };
  if (relationOf(state, rid) < cfg.deals.minRelation) return { ok: false, reason: `${sideName(world, rid)} keeps its borders closed to our merchants.` };
  if (!sell && !buy) return { ok: false, reason: 'Choose something to sell or to buy.' };
  for (const [side, x, list, what] of [['sell', sell, p.wants, 'want'], ['buy', buy, p.offers, 'offer']]) {
    if (!x) continue;
    if (!cfg.goods[x.good]) return { ok: false, reason: 'Unknown good.' };
    if (!list.includes(x.good)) return { ok: false, reason: `${sideName(world, rid)} does not ${what} ${cfg.goods[x.good].short} (${side === 'sell' ? 'they want' : 'they offer'} ${list.map((g) => cfg.goods[g].short).join(' and ')}).` };
    if (!(x.qty >= cfg.deals.minQty)) return { ok: false, reason: `At least ${cfg.deals.minQty} loads a month.` };
    if (x.qty > p.capacity) return { ok: false, reason: `${sideName(world, rid)} can ${side === 'sell' ? 'take' : 'supply'} at most ${number(p.capacity)} loads a month.` };
  }
  return { ok: true };
}

// What a deal would bring in and cost a month, at today's prices.
export function dealPreview(state, world, rid, sell, buy) {
  const income = sell ? sell.qty * exportPrice(world, sell.good, state) : 0;
  const cost = buy ? buy.qty * importPrice(world, buy.good) : 0;
  const lines = [];
  if (sell) {
    const surplus = state.market?.report?.[sell.good]?.balance ?? 0;
    lines.push(`Sell ${number(sell.qty)} loads of ${M(world).goods[sell.good].short} a month: +${number(income)} crowns${surplus < sell.qty ? ` (our surplus is ${number(Math.max(0, surplus))} a month; the rest would come from the stores)` : ''}.`);
  }
  if (buy) {
    const short = -(state.market?.report?.[buy.good]?.balance ?? 0);
    lines.push(`Buy ${number(buy.qty)} loads of ${M(world).goods[buy.good].short} a month: −${number(cost)} crowns${short > 0 ? ` (we are short ${number(short)} a month)` : ''}.`);
  }
  return { income: Math.round(income), cost: Math.round(cost), net: Math.round(income - cost), lines };
}

export function makeDeal(state, world, rid, sell, buy) {
  state.market ??= defaultMarket(world);
  state.market.deals[rid] = { sell: sell ? { good: sell.good, qty: Math.round(sell.qty) } : null, buy: buy ? { good: buy.good, qty: Math.round(buy.qty) } : null, since: state.day };
}

export function endDeal(state, world, rid, why = null) {
  const d = state.market?.deals?.[rid];
  if (!d) return;
  delete state.market.deals[rid];
  if (why) {
    // What they supplied grows dear for a while.
    if (d.buy) state.market.cut[d.buy.good] = state.day + M(world).price.cutMonths * 30;
    say(state, `Our trade with ${sideName(world, rid)} is cut: ${why}.${d.buy ? ` ${M(world).goods[d.buy.good].name} will be dearer for a while.` : ''}`);
  }
}

// ---- The month ----

function takeFromStores(state, world, good, loads) {
  const cfg = M(world);
  let left = loads;
  const take = (key, per, keep) => {
    for (const s of Object.values(state.settlements)) {
      if (left <= 0) return;
      if (s.occupier) continue;
      const spare = Math.max(0, (s.stock[key] ?? 0) - keep(s));
      const q = Math.min(spare, left / per);
      s.stock[key] -= q;
      left -= q * per;
    }
  };
  if (good === 'grain') {
    const reserve = (s) => foodNeed(world, s, 'winter') * 30 * cfg.grainReserveMonths;
    take('food', cfg.goods.grain.of.food, reserve);
  } else if (good === 'materials') {
    take('timber', 1, () => cfg.materialsReserve);
    take('stone', 1, () => cfg.materialsReserve);
  } else if (good === 'iron') take('iron', 1, () => cfg.materialsReserve);
  return loads - left;
}

function deliver(state, world, good, loads) {
  const cfg = M(world);
  const cap = state.settlements[world.kingdom.capital];
  if (!cap) return 0;
  if (good === 'grain') cap.stock.food += loads / cfg.goods.grain.of.food;
  else if (good === 'materials') {
    cap.stock.timber += loads / 2;
    cap.stock.stone += loads / 2;
  } else if (good === 'iron') cap.stock.iron += loads;
  else return loads;
  return 0;
}

// Run once a month from the ledger, after the industry has made its offers.
export function marketLedger(state, world, income, expenses) {
  const cfg = M(world);
  if (!cfg) return;
  const mk = state.market;
  const m = month(state, world);
  income.exports ??= {};
  expenses.imports ??= {};
  // Grain that would have spoiled is offered instead, unless held.
  if (!isHeld(state, 'grain')) m.offer.grain += m.spill * cfg.goods.grain.of.food;
  // Last month's store, freed from holding, comes to market.
  for (const g of MARKET_GOODS) if (!isHeld(state, g) && mk.store[g] > 0) {
    m.offer[g] += mk.store[g];
    mk.store[g] = 0;
  }

  // Balances and prices.
  const grain = grainBalance(state, world);
  const report = {};
  for (const g of MARKET_GOODS) {
    const made = g === 'grain' ? grain.made : m.made[g];
    const used = g === 'grain' ? grain.used : m.used[g] + m.short[g];
    const balance = made - used;
    const ratio = balance / Math.max(made, used, 1);
    const p = cfg.price;
    let target = Math.min(p.max, Math.max(p.min, 1 - p.swing * ratio));
    if ((mk.cut[g] ?? 0) > state.day) target *= 1 + p.cut;
    mk.price[g] = mk.price[g] + (target - mk.price[g]) * p.ease;
    report[g] = { made: Math.round(made), used: Math.round(used), balance: Math.round(made) - Math.round(used), sold: 0, exported: 0, imported: 0, price: Math.round(homePrice(state, world, g) * 100) / 100 };
  }

  // Deals, partner by partner: cut by war or closed borders, else carried out.
  for (const rid of Object.keys(mk.deals)) {
    if (!state.realms?.[rid] || state.realms[rid].fallen) { endDeal(state, world, rid, `${sideName(world, rid)} is no more`); continue; }
    if (hostile(state, TEMERIA, rid)) { endDeal(state, world, rid, `we are at war with ${sideName(world, rid)}`); continue; }
    if (relationOf(state, rid) < cfg.deals.minRelation) { endDeal(state, world, rid, `${sideName(world, rid)} has closed its borders to us`); continue; }
    const d = mk.deals[rid];
    const name = sideName(world, rid);
    if (d.sell && !isHeld(state, d.sell.good)) {
      const g = d.sell.good;
      let q = Math.min(d.sell.qty, m.offer[g]);
      m.offer[g] -= q;
      if (q < d.sell.qty) q += takeFromStores(state, world, g, d.sell.qty - q);
      const v = q * exportPrice(world, g, state);
      income.exports[name] = (income.exports[name] ?? 0) + v;
      if (state.realms[rid]) state.realms[rid].treasury -= v;
      report[g].exported += Math.round(q);
      d.sent = Math.round(q);
    } else if (d.sell) d.sent = 0;
    if (d.buy) {
      const g = d.buy.good;
      const q = d.buy.qty;
      const c = q * importPrice(world, g);
      expenses.imports[name] = (expenses.imports[name] ?? 0) + c;
      if (state.realms[rid]) state.realms[rid].treasury += c;
      report[g].imported += q;
      // Grain, timber, stone and iron go into the stores; cloth and
      // luxuries go to market, at the home price while the realm is short.
      const rest = deliver(state, world, g, q);
      if (rest > 0) {
        const short = Math.max(0, -report[g].balance);
        const atHome = Math.min(rest, short);
        income.sales += atHome * homePrice(state, world, g) + (rest - atHome) * homeSalePrice(state, world, g);
      }
    }
  }

  // What is left sells at home, cheaper than abroad.
  for (const g of MARKET_GOODS) {
    const q = m.offer[g];
    if (q <= 0) continue;
    income.sales += q * homeSalePrice(state, world, g);
    report[g].sold = Math.round(q);
  }
  mk.report = report;
  mk.month = freshMonth(MARKET_GOODS);
}

// One line per good, for the Treasury: "Iron and arms: short 40 a month".
export function balanceLine(world, good, r) {
  const name = M(world).goods[good].name;
  if (!r) return name;
  if (Math.abs(r.balance) < 1) return `${name}: in balance`;
  return r.balance > 0 ? `${name}: surplus ${number(r.balance)} a month` : `${name}: short ${number(-r.balance)} a month`;
}

// v20: a fresh market, and each crown route abroad folded into a deal with
// that partner, selling the first good it wants (the route stays, to carry
// the goods and earn its tolls).
export function upgradeMarket(state, world) {
  state.market = defaultMarket(world);
  if (!M(world)) return state;
  for (const r of state.routes ?? []) {
    const abroad = [r.from, r.to].find((x) => !state.settlements[x] && world.realmOf?.[x]);
    const rid = abroad && world.realmOf[abroad];
    if (!rid || state.market.deals[rid] || !state.realms?.[rid] || hostile(state, TEMERIA, rid)) continue;
    const p = partnerTrade(state, world, rid);
    if (!p) continue;
    const qty = Math.max(M(world).deals.minQty, Math.min(p.capacity, Math.round(p.capacity / 3)));
    makeDeal(state, world, rid, { good: p.wants[0], qty }, null);
  }
  return state;
}

