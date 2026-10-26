// The deal table. Each side lays down items (crowns, goods, a road, sight,
// passage, an embassy, a town, a treaty, peace); the ruler across the table
// weighs each in crowns by their own temper and needs, and answers:
// Acceptable, Close, They want more, or Insulting. What is agreed is carried
// out by the simulation: lump sums at once, monthly payments and deliveries
// through the ledger, goods on the road as caravans.
import { addDispatch, clamp } from './realm.js';
import { settleOwnership } from './lands.js';
import { creditLimit, realmStock } from './economy.js';
import { goodPrice } from './industry.js';
import { realmProsperity, openEmbassy } from './realms.js';
import { routeValue, routeEndOk, routePath, routeLimit } from './trade.js';
import { foreignTrade } from './neighbours.js';
import { TEMERIA, atWar, warBetween, sideIndex, heldValue, warScore, exhaustion, ownerOf, valueOf, setOwner, sideName } from './conflict.js';
import { applyPeace, hostilityTo } from './war.js';
import {
  D, rulerShort, traitMult, hasTrait, agendaOf, trustIn, changeTrust, remember, grievance, powerOf, fearOf, dangerTo,
  treatyDef, treatyBetween, makeTreaty, moodWord,
} from './diplomacy.js';

const V = (world) => D(world).values;
export const VERDICTS = ['Acceptable', 'Close', 'They want more', 'Insulting'];

// ---- Goods ----

export function goodDef(world, g) {
  return D(world).goods[g];
}

export function goodValue(state, world, g) {
  const d = goodDef(world, g);
  if (d.stock) return d.stock === 'food' ? d.price : world.economy.goods.prices[d.stock] ?? d.price ?? 1;
  return goodPrice(state, world, d.made ?? d.store);
}

const WORK = { forest: 'timber', hills: 'stone', mountains: 'iron' };

// Does a realm make this good itself, so has some to spare?
function makes(state, world, pid, g) {
  const d = goodDef(world, g);
  if (g === 'grain') return realmProsperity(state, pid) >= 45;
  if (d.stock) return (world.foreignByRealm[pid] ?? []).some((id) => WORK[world.terrainOf[id]] === d.stock);
  return (world.industry?.abroadMakes[pid] ?? []).includes(d.made ?? d.store);
}

// How much of a good the crown has to send this month.
export function goodsInHand(state, world, g) {
  const d = goodDef(world, g);
  if (d.stock) return realmStock(state)[d.stock];
  if (d.store) return state.forces?.stores[d.store] ?? 0;
  return state.industry?.made?.[d.made] ?? 0;
}

// ---- What a ruler thinks an item is worth ----

const trustFactor = (state, world, pid) => clamp(0.5 + trustIn(state, world, pid, TEMERIA) / 100, 0.6, 1.1);

function coinMult(state, world, pid) {
  // A poor realm values coin more.
  const purse = state.realms?.[pid]?.treasury ?? 1000;
  return traitMult(world, pid, 'coin') * clamp(1500 / (Math.max(0, purse) + 1000), 0.8, 1.3);
}

// The war this deal would end, if we are at war with them.
function warWith(state, pid) {
  return warBetween(state, TEMERIA, pid);
}

export function itemValue(state, world, pid, item) {
  const v = V(world);
  const ours = item.from === 'us';
  const sign = ours ? 1 : -1;
  switch (item.kind) {
    case 'coin': return sign * item.amount * coinMult(state, world, pid);
    case 'monthly': {
      const total = item.amount * item.months * v.monthlyDiscount * coinMult(state, world, pid);
      return ours ? total * trustFactor(state, world, pid) : -total;
    }
    case 'goods': {
      const total = item.qty * item.months * goodValue(state, world, item.good);
      const has = makes(state, world, pid, item.good);
      if (ours) return total * (has ? v.spare : v.need) * traitMult(world, pid, 'goods') * (item.months > 1 ? trustFactor(state, world, pid) : 1);
      return -total * (has ? v.makeCost : v.buyCost);
    }
    case 'route': {
      const monthly = routeValue(state, world, { from: item.a, to: item.b }).value;
      return monthly * v.routeMonths * v.routeShare * (agendaOf(world, pid)?.kind === 'trade' ? 2 : 1);
    }
    case 'intel': {
      const m = item.months;
      if (ours) return v.intelMonth * m * (agendaOf(world, pid)?.kind === 'scoiatael' ? 2 : 1) * traitMult(world, pid, 'safety');
      return -v.intelGiveMonth * m * traitMult(world, pid, 'safety');
    }
    case 'passage': {
      // Their armies through our land, or ours through theirs.
      if (ours) return v.askPassage * (atWar(state, pid) ? 1 : 0.3);
      const common = commonEnemy(state, world, pid);
      return -(v.passageBase + v.passageMonth * item.months) * (agendaOf(world, pid)?.kind === 'borders' ? 2 : 1) + (common ? 500 : 0);
    }
    case 'embassy': return ours ? v.embassy : -40 * (state.neighbours[pid]?.relation >= 30 ? 0 : 1);
    case 'town': {
      const worth = valueOf(state, world, item.town);
      const target = agendaOf(world, pid)?.kind === 'town' && agendaOf(world, pid).town === item.town;
      if (ours) return worth * v.townPer * traitMult(world, pid, 'town') * (target ? 3 : 1);
      const seat = world.realms?.realms[pid]?.capital === item.town ? 3 : 1;
      return -worth * v.townGivePer * seat * (warWith(state, pid) ? 0.3 : 1);
    }
    case 'treaty': return treatyValue(state, world, pid, TEMERIA, item.treaty, item.years);
    case 'peace': return peaceValue(state, world, pid, item.terms);
    default: return 0;
  }
}

function commonEnemy(state, world, pid) {
  return (state.wars ?? []).some((w) => {
    const me = sideIndex(w, TEMERIA);
    const them = sideIndex(w, pid);
    return me >= 0 && them >= 0 && me === them;
  });
}

// What a treaty with `q` is worth to `p`, by p's fears, needs and temper.
export function treatyValue(state, world, p, q, kind, years = null) {
  const tv = D(world).treatyValue;
  const def = treatyDef(world, kind);
  const scale = Math.sqrt((years ?? def.years) / def.years);
  const ag = agendaOf(world, p);
  const safety = traitMult(world, p, 'safety');
  const binding = traitMult(world, p, 'binding');
  const fear = clamp(powerOf(state, world, q) / powerOf(state, world, p), 0, 3);
  const danger = dangerTo(state, world, p);
  const theirDanger = dangerTo(state, world, q);
  // Opportunists count an obligation lightly: they do not mean to keep it.
  const keeps = hasTrait(world, p, 'opportunist') ? 0.5 : 1;
  let val = 0;
  if (kind === 'nonaggression') {
    val = tv.base + fear * tv.fear * 0.5 * safety * (ag?.kind === 'borders' ? 1.5 : 1) * binding;
    if (ag?.kind === 'town' && ownerOf(state, world, ag.town) === q) val -= tv.agendaTown;
    // A ruler who wants war with us gives up something real by promising peace.
    if (q === TEMERIA) val -= Math.max(0, hostilityTo(state, world, p)) * tv.hostility * traitMult(world, p, 'town');
  } else if (kind === 'trade') {
    const trade = q === TEMERIA ? foreignTrade(state, world).by[p] ?? 0 : (world.neighbours.realms[p]?.trade ?? 0) * 0.5;
    val = tv.base + trade * 12 * (years ?? def.years) * tv.tradeYears * (ag?.kind === 'trade' ? 2 : 1) * traitMult(world, p, 'coin');
    if (!world.neighbours.realms[p]?.trade) val = -200;
  } else if (kind === 'defensive') {
    val = tv.base * 0.5 + danger * tv.threat * safety * binding - theirDanger * tv.burden * keeps;
  } else if (kind === 'alliance') {
    val = danger * tv.threat * 1.4 * safety - theirDanger * tv.burden * 1.4 * keeps - 100 + (hasTrait(world, p, 'ambitious') ? 200 : 0);
  } else if (kind === 'access') {
    // q's armies through p's land.
    val = -tv.accessCost * (ag?.kind === 'borders' ? 2 : 1) + (commonEnemy(state, world, p) ? 500 : 0);
  } else if (kind === 'protectorate') {
    const small = def.small.includes(p) && powerOf(state, world, q) >= powerOf(state, world, p) * def.power;
    val = small ? danger * tv.protectBenefit + fear * tv.protectFear * 0.3 - tv.protectPride * traitMult(world, p, 'town') : -2000;
  }
  return val * scale;
}

// What ending a war on these terms is worth to the other side, in the same
// crowns as everything else: how tired and beaten they are, against what the
// terms take from them.
export function peaceValue(state, world, pid, terms) {
  const war = warWith(state, pid);
  if (!war) return 0;
  const p = world.war.peace;
  const me = sideIndex(war, TEMERIA);
  const them = 1 - me;
  const heldMe = heldValue(state, world, war, me);
  const heldThem = heldValue(state, world, war, them);
  const pressure = exhaustion(state, world, war, them) + warScore(state, world, war, me);
  const cost = terms === 'keep' ? heldMe * 1.5 - heldThem : heldThem * 1.5 - heldMe;
  return (pressure - p.acceptMargin - cost) * V(world).peacePoint;
}

// ---- Weighing a deal ----

// Things a ruler will not do whatever the price, in one plain line.
export function refusal(state, world, pid, items) {
  const name = rulerShort(world, pid);
  const realm = sideName(world, pid);
  const war = warWith(state, pid);
  const peace = items.find((i) => i.kind === 'peace');
  if (war && !peace && items.length) return `${name} will speak of peace, or of nothing.`;
  if (peace) {
    if (!war) return `${realm} is not at war with us.`;
    if (war.sides[sideIndex(war, TEMERIA)][0] !== TEMERIA) return 'Our ally leads this war; only it can make the peace.';
    if ((state.day - war.since) / 30 < world.war.peace.minMonths) return `${name} refuses: no one makes peace in the first ${world.war.peace.minMonths} months of a war.`;
  }
  for (const i of items) {
    if (i.kind === 'treaty') {
      const def = treatyDef(world, i.treaty);
      if (treatyBetween(state, TEMERIA, pid, i.treaty)) return `We already have a ${def.name.toLowerCase()} with ${realm}.`;
      const rel = state.neighbours[pid]?.relation ?? 0;
      if (rel < def.minRelation) return `${name} refuses: ${realm} is ${moodWord(rel).toLowerCase()} towards us, too far from friends for a ${def.name.toLowerCase()}.`;
      const trust = trustIn(state, world, pid, TEMERIA);
      if (trust < def.minTrust) {
        const why = grievance(state, world, pid);
        return why ? `${name} refuses: ${realm} does not trust us after ${why}.` : `${name} refuses: ${realm} does not trust us enough yet for a ${def.name.toLowerCase()}.`;
      }
      if (i.treaty === 'protectorate' && !def.small.includes(pid)) return `${name} laughs: ${realm} is no one's protectorate.`;
    }
    if (i.kind === 'embassy' && i.from === 'them' && world.realms?.intelligence.noEmbassy.includes(pid)) return `${name} receives no envoys.`;
    // A ruler will not promise monthly payments the realm cannot meet (M18).
    if (world.strategy && i.kind === 'monthly' && i.from === 'them' && !war) {
      const spare = Math.max(0, state.realms?.[pid]?.income ?? 0) * world.strategy.debt.spareShare;
      const others = items.filter((x) => x.kind === 'monthly' && x.from === 'them').reduce((a, x) => a + x.amount, 0);
      if (others > spare) return `${name} cannot spare ${others} crowns a month: ${realm} earns too little.`;
    }
    if (i.kind === 'town' && i.from === 'them' && world.realms?.realms[pid]?.capital === i.town && !war) return `${name} will never give up ${world.byId[i.town].name}.`;
  }
  return null;
}

// Goodwill: a ruler who likes and trusts us will take a slightly worse deal.
function goodwill(state, world, pid) {
  const v = V(world);
  const rel = state.neighbours[pid]?.relation ?? 0;
  return clamp(rel * v.goodwillRelation + (trustIn(state, world, pid, TEMERIA) - 50) * v.goodwillTrust, -v.goodwillMax, v.goodwillMax);
}

export function weighDeal(state, world, pid, items) {
  const v = V(world);
  const lines = items.map((item) => ({ item, value: Math.round(itemValue(state, world, pid, item)) }));
  if (!items.length) return { verdict: null, net: 0, gross: 0, lines, reason: null };
  const gross = lines.reduce((a, l) => a + Math.abs(l.value), 0);
  const war = !!warWith(state, pid);
  const net = lines.reduce((a, l) => a + l.value, 0) + (war ? 0 : goodwill(state, world, pid));
  const reason = refusal(state, world, pid, items);
  let verdict;
  if (reason) verdict = 'Insulting';
  else if (net >= 0) verdict = 'Acceptable';
  else if (net >= -Math.max(v.closeMin, v.close * gross)) verdict = 'Close';
  else if (net >= -Math.max(v.moreMin, v.more * gross)) verdict = 'They want more';
  else verdict = 'Insulting';
  return { verdict, net: Math.round(net), gross: Math.round(gross), lines, reason, line: reason ?? verdictLine(world, pid, verdict, items) };
}

function verdictLine(world, pid, verdict, items) {
  const name = rulerShort(world, pid);
  if (verdict === 'Acceptable') return `${name} nods: this will do.`;
  if (verdict === 'Close') return `${name} hesitates: a little more and it is done.`;
  if (verdict === 'They want more') return `${name} wants more for what ${items.some((i) => i.from === 'them') ? 'is asked' : 'is offered'}.`;
  return `${name} is insulted by the offer.`;
}

// ---- Can the crown give what it offers? ----

export function itemProblem(state, world, pid, item) {
  const credit = creditLimit(state, world);
  if (item.from === 'us') {
    if (item.kind === 'coin' && state.treasury - item.amount < -credit) return 'The bankers will not lend that much.';
    if (item.kind === 'goods' && goodsInHand(state, world, item.good) < item.qty) return `We have not ${item.qty} ${goodDef(world, item.good).name.toLowerCase()} to send.`;
    if (item.kind === 'town' && ownerOf(state, world, item.town) !== TEMERIA) return 'That town is not ours to give.';
    if (item.kind === 'town' && item.town === world.kingdom.capital) return 'Never Vizima.';
  } else if (item.kind === 'town' && ownerOf(state, world, item.town) !== pid) return 'That town is not theirs to give.';
  if (item.kind === 'route') {
    for (const id of [item.a, item.b]) {
      const ok = routeEndOk(state, world, id);
      if (!ok.ok) return ok.reason;
    }
    if (!routePath(world, item.a, item.b)) return 'No road joins them.';
    if (state.routes.length >= routeLimit(state, world)) return `The crown can run only ${routeLimit(state, world)} routes.`;
    if (state.routes.some((r) => (r.from === item.a && r.to === item.b) || (r.from === item.b && r.to === item.a))) return 'That route already runs.';
  }
  if (item.kind === 'embassy' && item.from === 'them' && state.embassies?.[pid]) return 'We already keep an embassy there.';
  return null;
}

export function canSign(state, world, pid, items) {
  if (!items.length) return { ok: false, reason: 'The table is empty.' };
  for (const i of items) {
    const p = itemProblem(state, world, pid, i);
    if (p) return { ok: false, reason: p };
  }
  const w = weighDeal(state, world, pid, items);
  if (w.verdict !== 'Acceptable') return { ok: false, reason: w.line };
  return { ok: true, weighed: w };
}

// ---- What would they accept? ----

// Costs to the crown, in crowns, of giving an item: for choosing the
// cheapest way to satisfy a ruler.
function costToUs(state, world, item) {
  if (item.kind === 'coin') return item.amount;
  if (item.kind === 'monthly') return item.amount * item.months;
  if (item.kind === 'goods') return item.qty * item.months * goodValue(state, world, item.good);
  if (item.kind === 'intel') return item.months * 3;
  if (item.kind === 'embassy') return 30;
  return 0;
}

// Build a counter-offer from what the ruler values most and the crown can
// afford: cheap things they need first, then crowns to close the gap; if the
// crown cannot afford it, ask for less from them instead.
export function counterOffer(state, world, pid, items) {
  let table = items.map((i) => ({ ...i }));
  const first = weighDeal(state, world, pid, table);
  if (first.reason) return { items: null, reason: first.reason };
  if (first.verdict === 'Acceptable') return { items: table, weighed: first };
  const has = (k, from) => table.some((i) => i.kind === k && i.from === from);
  const cands = [];
  if (!has('intel', 'us') && !warWith(state, pid)) cands.push({ kind: 'intel', from: 'us', months: D(world).actions.intel.months });
  if (!has('embassy', 'us') && !warWith(state, pid)) cands.push({ kind: 'embassy', from: 'us' });
  for (const g of Object.keys(D(world).goods)) {
    if (has('goods', 'us') || makes(state, world, pid, g)) continue;
    const unit = goodDef(world, g).unit;
    const item = { kind: 'goods', from: 'us', good: g, qty: unit, months: 6 };
    if (goodsInHand(state, world, g) >= unit * 3 && !itemProblem(state, world, pid, item)) cands.push(item);
  }
  cands.sort((a, b) => itemValue(state, world, pid, b) / Math.max(1, costToUs(state, world, b)) - itemValue(state, world, pid, a) / Math.max(1, costToUs(state, world, a)));
  let w = first;
  for (const c of cands) {
    if (w.net >= 0) break;
    const val = itemValue(state, world, pid, c);
    if (val <= 0) continue;
    // Only what does not overshoot the gap by much: crowns fill the rest.
    if (val > -w.net * 1.5 && c.kind === 'goods') continue;
    table.push(c);
    w = weighDeal(state, world, pid, table);
  }
  if (w.net < 0) {
    const mult = coinMult(state, world, pid);
    const amount = Math.ceil(-w.net / mult / 50) * 50;
    const coin = table.find((i) => i.kind === 'coin' && i.from === 'us');
    const total = (coin?.amount ?? 0) + amount;
    const room = state.treasury + creditLimit(state, world) * 0.5;
    if (total <= room) {
      if (coin) coin.amount = total;
      else table.push({ kind: 'coin', from: 'us', amount });
      w = weighDeal(state, world, pid, table);
    }
  }
  // Still short: ask less of them, the dearest thing first.
  while (w.net < 0) {
    const theirs = table.filter((i) => i.from === 'them' && i.kind !== 'peace' && i.kind !== 'treaty');
    if (!theirs.length) break;
    theirs.sort((a, b) => itemValue(state, world, pid, a) - itemValue(state, world, pid, b));
    table = table.filter((i) => i !== theirs[0]);
    w = weighDeal(state, world, pid, table);
  }
  if (w.verdict !== 'Acceptable') return { items: null, reason: `${rulerShort(world, pid)} names a price the crown cannot pay.` };
  return { items: table, weighed: w };
}

// The ruler's own opening proposal, by their agenda and needs. It always
// satisfies them; whether it suits us is for the crown to judge.
export function proposeDeal(state, world, pid) {
  const r = world.neighbours.realms[pid];
  const war = warWith(state, pid);
  const has = (kind) => !!treatyBetween(state, TEMERIA, pid, kind);
  const rel = state.neighbours[pid]?.relation ?? 0;
  const trust = trustIn(state, world, pid, TEMERIA);
  const okTreaty = (k) => {
    const def = treatyDef(world, k);
    return !has(k) && rel >= def.minRelation && trust >= def.minTrust;
  };
  const ag = agendaOf(world, pid);
  let items;
  if (war) {
    const keep = peaceValue(state, world, pid, 'keep') >= peaceValue(state, world, pid, 'white');
    items = [{ kind: 'peace', from: 'us', terms: keep ? 'keep' : 'white' }];
    if (warScore(state, world, war, 1 - sideIndex(war, TEMERIA)) > world.war.peace.tributeAt) items.push({ kind: 'monthly', from: 'us', amount: 40, months: 24 });
  } else if (D(world).treaties.protectorate.small.includes(pid) && dangerTo(state, world, pid) > 0.8 && okTreaty('protectorate')
    && treatyValue(state, world, pid, TEMERIA, 'protectorate') > 0) {
    items = [{ kind: 'treaty', from: 'us', treaty: 'protectorate' }, { kind: 'monthly', from: 'them', amount: D(world).treaties.protectorate.tribute, months: 120 }];
  } else if (dangerTo(state, world, pid) > 0.6 && okTreaty('defensive')) {
    items = [{ kind: 'treaty', from: 'us', treaty: 'defensive' }];
  } else if (ag?.kind === 'trade' && r?.trade && okTreaty('trade')) {
    items = [{ kind: 'treaty', from: 'us', treaty: 'trade' }];
  } else if (ag?.kind === 'borders' && okTreaty('nonaggression')) {
    items = [{ kind: 'treaty', from: 'us', treaty: 'nonaggression' }];
  } else if (hasTrait(world, pid, 'greedy') || ag?.kind === 'trade') {
    // Sell us something they make, for crowns.
    const g = Object.keys(D(world).goods).find((x) => makes(state, world, pid, x) && x !== 'grain');
    items = g ? [{ kind: 'goods', from: 'them', good: g, qty: goodDef(world, g).unit, months: 6 }] : [{ kind: 'intel', from: 'them', months: 6 }];
  } else {
    items = [{ kind: 'intel', from: 'them', months: 6 }, { kind: 'intel', from: 'us', months: 6 }];
  }
  const counter = counterOffer(state, world, pid, items);
  return counter.items ?? null;
}

// ---- What a deal is worth to the crown ----

// The crown's own reckoning, in crowns, for the steward and for advice:
// what we get less what we give.
export function ourValue(state, world, pid, items) {
  let v = 0;
  for (const i of items) {
    const sign = i.from === 'them' ? 1 : -1;
    if (i.kind === 'coin') v += sign * i.amount;
    else if (i.kind === 'monthly') v += sign * i.amount * i.months;
    else if (i.kind === 'goods') v += sign * i.qty * i.months * goodValue(state, world, i.good) * (i.from === 'them' ? 0.8 : 1);
    else if (i.kind === 'route') v += routeValue(state, world, { from: i.a, to: i.b }).value * 18;
    else if (i.kind === 'intel') v += i.from === 'them' ? 15 * i.months : -2 * i.months;
    else if (i.kind === 'embassy') v += i.from === 'them' ? 120 : -20;
    else if (i.kind === 'town') v += sign * valueOf(state, world, i.town) * 120;
    else if (i.kind === 'passage') v += i.from === 'them' ? 60 : -80;
    else if (i.kind === 'treaty') {
      if (i.treaty === 'nonaggression') v += hostilityTo(state, world, pid) > 0 ? 400 : 120;
      else if (i.treaty === 'trade') v += (foreignTrade(state, world).by[pid] ?? 0) * 0.25 * 12 * 5 + 50;
      else if (i.treaty === 'defensive') v += dangerTo(state, world, TEMERIA) * 500 - dangerTo(state, world, pid) * 500;
      else if (i.treaty === 'alliance') v += dangerTo(state, world, TEMERIA) * 700 - dangerTo(state, world, pid) * 700;
      else if (i.treaty === 'protectorate') v += 100 - dangerTo(state, world, pid) * 400;
      else if (i.treaty === 'access') v += 40;
    }
  }
  return Math.round(v);
}

// ---- Signing and carrying out ----

const SAY = (state, text) => addDispatch(state, text, 'abroad');

function pay(state, from, to, coin) {
  if (from === TEMERIA) {
    state.treasury -= coin;
    state.ledger.decrees = (state.ledger.decrees ?? 0) + coin;
  } else if (state.realms[from]) state.realms[from].treasury -= coin;
  if (to === TEMERIA) state.treasury += coin;
  else if (state.realms[to]) state.realms[to].treasury += coin;
}

export function describeItem(world, item, pid) {
  const them = sideName(world, pid);
  switch (item.kind) {
    case 'coin': return `${item.amount} crowns`;
    case 'monthly': return `${item.amount} crowns a month for ${item.months} months`;
    case 'goods': return `${item.qty} ${goodDef(world, item.good).name.toLowerCase()} a month for ${item.months} months`;
    case 'route': return `A trade route, ${world.byId[item.a].name} to ${world.byId[item.b].name}`;
    case 'intel': return `What ${item.from === 'us' ? 'our' : 'their'} watchers see, for ${item.months} months`;
    case 'passage': return `Passage for ${item.from === 'us' ? 'their' : 'our'} armies, ${item.months} months`;
    case 'embassy': return item.from === 'us' ? `Their embassy at Vizima` : `Our embassy in ${them}`;
    case 'town': return `${world.byId[item.town].name}`;
    case 'treaty': return `${treatyDef(world, item.treaty).name}${item.years ? ` (${item.years} years)` : ` (${treatyDef(world, item.treaty).years} years)`}`;
    case 'peace': return item.terms === 'keep' ? 'Peace: each keeps what it holds' : 'Peace: every town handed back';
    default: return item.kind;
  }
}

// Carry out an agreed deal. Lump sums, towns, embassies, roads, treaties and
// peace at once; monthly payments and goods are kept as a running deal.
export function signDeal(state, world, pid, items) {
  const name = sideName(world, pid);
  const peace = items.find((i) => i.kind === 'peace');
  const recurring = [];
  let protectTribute = null;
  const protect = items.find((i) => i.kind === 'treaty' && i.treaty === 'protectorate');
  for (const i of items) {
    const giver = i.from === 'us' ? TEMERIA : pid;
    const taker = i.from === 'us' ? pid : TEMERIA;
    if (i.kind === 'coin') pay(state, giver, taker, i.amount);
    else if (i.kind === 'monthly') {
      if (protect && i.from === 'them') protectTribute = i.amount;
      else if (peace) state.tributes.push({ from: giver, to: taker, monthly: i.amount, until: state.day + i.months * 30 });
      else recurring.push({ ...i, left: i.months });
    } else if (i.kind === 'goods') recurring.push({ ...i, left: i.months });
    else if (i.kind === 'town' && !peace) setOwner(state, world, i.town, taker);
    else if (i.kind === 'embassy' && i.from === 'them' && !state.embassies[pid]) openEmbassy(state, world, pid);
    else if (i.kind === 'route') state.routes.push({ id: state.nextRouteId++, from: i.a, to: i.b, since: state.day, last: 0, raided: false, closed: null, deal: true });
    else if (i.kind === 'intel') {
      const s = (state.diplomacy.sight[pid] ??= { theirs: 0, ours: 0 });
      if (i.from === 'them') s.theirs = Math.max(s.theirs, state.day + i.months * 30);
      else s.ours = Math.max(s.ours, state.day + i.months * 30);
    } else if (i.kind === 'passage') {
      // Access is held by the guest: `a` marches through `b`'s land.
      makeTreaty(state, world, 'access', i.from === 'them' ? TEMERIA : pid, i.from === 'them' ? pid : TEMERIA, { years: i.months / 12 });
    }
  }
  for (const i of items) {
    if (i.kind === 'treaty') {
      const t = i.treaty;
      if (t === 'protectorate') makeTreaty(state, world, t, TEMERIA, pid, { years: i.years, terms: { monthly: protectTribute ?? 0 } });
      else makeTreaty(state, world, t, TEMERIA, pid, { years: i.years });
    }
  }
  if (peace) {
    const war = warWith(state, pid);
    const cede = items.filter((i) => i.kind === 'town');
    applyPeace(state, world, war, { towns: peace.terms === 'keep' ? 'keep' : 'white' });
    for (const i of cede) setOwner(state, world, i.town, i.from === 'us' ? pid : TEMERIA);
  }
  // Towns sold, swapped or ceded change realm for good (M19).
  if (items.some((i) => i.kind === 'town')) settleOwnership(state, world);
  if (recurring.length) {
    state.diplomacy.deals.push({ id: state.diplomacy.nextId++, with: pid, since: state.day, items: recurring, short: 0 });
  }
  remember(state, world, pid, 'Deals struck with us', 4, { fade: 540 });
  if (!peace) SAY(state, `A deal is struck with ${name}: we give ${listOf(world, items.filter((i) => i.from === 'us'), pid)}; they give ${listOf(world, items.filter((i) => i.from === 'them'), pid)}.`);
}

function listOf(world, list, pid) {
  return list.length ? list.map((i) => describeItem(world, i, pid).toLowerCase()).join(', ') : 'nothing';
}

// The crown's capital and theirs: where caravans of a deal run between.
export function dealEnds(world, pid) {
  return [world.kingdom.capital, world.realms?.realms[pid]?.capital ?? world.neighbours.realms[pid]?.gateway];
}

// Each month's payments and deliveries, in the ledger. Goods we send come
// out of the stores; goods we receive go into them (finished goods are sold
// at home). A deal that falls short twice is broken.
export function dealLedger(state, world, income, expenses, deliveries) {
  if (!state.diplomacy) return;
  income.deals ??= {};
  expenses.deals ??= {};
  for (const deal of [...state.diplomacy.deals]) {
    const name = sideName(world, deal.with);
    let short = false;
    for (const i of deal.items) {
      if (i.left <= 0) continue;
      const out = i.from === 'us';
      if (i.kind === 'monthly') {
        if (out) {
          expenses.deals[name] = (expenses.deals[name] ?? 0) + i.amount;
          if (state.realms[deal.with]) state.realms[deal.with].treasury += i.amount;
        } else if (world.strategy && (state.realms[deal.with]?.treasury ?? 0) < 0) {
          // A realm in debt cannot pay what it promised (M18).
          i.left = 0;
          SAY(state, `${name} is in debt and stops its payments to us.`);
          remember(state, world, deal.with, 'Payments they could not make', 0);
          continue;
        } else {
          income.deals[name] = (income.deals[name] ?? 0) + i.amount;
          if (state.realms[deal.with]) state.realms[deal.with].treasury -= i.amount;
        }
      } else if (i.kind === 'goods') {
        const d = goodDef(world, i.good);
        const worth = i.qty * goodValue(state, world, i.good);
        if (out) {
          if (goodsInHand(state, world, i.good) < i.qty) { short = true; continue; }
          if (d.stock) takeStock(state, d.stock, i.qty);
          else if (d.store) state.forces.stores[d.store] -= i.qty;
          // Finished goods sent abroad are goods not sold at home.
          else expenses.deals[name] = (expenses.deals[name] ?? 0) + worth;
        } else if (d.stock) {
          const cap = state.settlements[world.kingdom.capital];
          cap.stock[d.stock] += i.qty;
        } else if (d.store) state.forces.stores[d.store] += i.qty;
        else income.deals[name] = (income.deals[name] ?? 0) + worth * 0.8;
        deliveries.push({ with: deal.with, good: i.good, qty: i.qty, out });
      }
      i.left -= 1;
    }
    if (short) {
      deal.short += 1;
      changeTrust(state, world, deal.with, TEMERIA, D(world).trust.dealShort);
      if (deal.short >= 2) {
        changeTrust(state, world, deal.with, TEMERIA, D(world).trust.dealBroken);
        remember(state, world, deal.with, 'We broke a deal', -12, { cause: 'we failed to deliver what we promised' });
        state.diplomacy.deals = state.diplomacy.deals.filter((x) => x !== deal);
        SAY(state, `Our deal with ${name} is broken: twice we failed to deliver. ${name} will remember it.`);
        continue;
      }
      SAY(state, `Our deliveries to ${name} fall short this month.`);
    }
    if (deal.items.every((i) => i.left <= 0)) {
      state.diplomacy.deals = state.diplomacy.deals.filter((x) => x !== deal);
      changeTrust(state, world, deal.with, TEMERIA, D(world).trust.dealDone);
      remember(state, world, deal.with, 'A deal honoured in full', 5);
      SAY(state, `Our deal with ${name} is done, honoured in full.`);
    }
  }
}

function takeStock(state, k, qty) {
  const total = Object.values(state.settlements).reduce((a, s) => a + s.stock[k], 0);
  if (total <= 0) return;
  for (const s of Object.values(state.settlements)) s.stock[k] -= (qty * s.stock[k]) / total;
}

export { fearOf };
