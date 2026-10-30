// The Treasury's Trade and Taxes screens (M21), and the deal form shown on a
// realm's card and the board: the five goods with what the realm has to
// spare or lacks, the deals with partner realms, the three estates' tax
// settings with what each would yield, and loans from the bank.
import {
  MARKET_GOODS, partnerTrade, canTrade, dealPreview, homePrice, homeSalePrice, exportPrice, balanceLine,
  estateTaxPreview, enactment, canDecree, loanTerms, canBorrow, canPayOff, payOffCost, owedOnLoans, loanCap, sideName, hostile, TEMERIA,
} from '../sim/index.js';
import { number, escapeHtml } from './format.js';
import { orderAttr, button } from './card.js';
import { form } from './memory.js';

const crowns = (n) => `${number(Math.round(n))} crowns`;
const price = (n) => (n >= 10 ? number(Math.round(n)) : n.toFixed(2).replace(/0$/, ''));

// ---- Trade ----

function goodRow(world, state, g) {
  const def = world.market.goods[g];
  const r = state.market?.report?.[g];
  const held = !!state.market?.hold?.[g];
  const tone = !r ? '' : r.balance > 0 ? 'up' : r.balance < 0 ? 'down' : '';
  const moved = r ? [r.exported ? `${number(r.exported)} sent abroad` : '', r.imported ? `${number(r.imported)} bought in` : '', r.sold ? `${number(r.sold)} sold at home` : ''].filter(Boolean).join(', ') : '';
  return `<div class="good-row" data-good="${g}">
    <div class="gr-main"><span class="gr-line ${tone}">${escapeHtml(balanceLine(world, g, r))}</span>
      <span class="gr-sub">Price at home ${price(homePrice(state, world, g))} a load; surplus sells at home for ${price(homeSalePrice(state, world, g))}, abroad for ${price(exportPrice(world, g))}.${moved ? ` Last month: ${moved}.` : ''}${held ? ` Held back: ${number(state.market.store?.[g] ?? 0)} in store.` : ''}</span></div>
    <button type="button" class="chip${held ? ' on' : ''}" aria-pressed="${held}" data-hold="${g}" ${orderAttr({ type: 'hold', good: g, on: !held })}>${held ? 'Held' : 'Hold back'}</button>
  </div>`;
}

function dealRow(world, state, rid, d) {
  const p = dealPreview(state, world, rid, d.sell, d.buy);
  const parts = [d.sell ? `sell ${number(d.sell.qty)} ${world.market.goods[d.sell.good].short}` : '', d.buy ? `buy ${number(d.buy.qty)} ${world.market.goods[d.buy.good].short}` : ''].filter(Boolean).join(', ');
  const short = d.sell && d.sent !== undefined && d.sent < d.sell.qty ? ` Only ${number(d.sent)} could be sent last month.` : '';
  return `<div class="deal-row" data-deal="${rid}">
    <div class="gr-main"><span class="gr-line">${escapeHtml(sideName(world, rid))}: ${escapeHtml(parts)} a month</span>
      <span class="gr-sub">${p.net >= 0 ? '+' : '−'}${crowns(Math.abs(p.net))} a month.${short}</span></div>
    <button type="button" class="chip" data-go="${world.neighbours.realms[rid] ? 'realm' : 'board'}:${rid}">Change</button>
    <button type="button" class="chip" data-end-trade="${rid}" ${orderAttr({ type: 'endTrade', realm: rid }, `End the trade with ${sideName(world, rid)}?`)}>End</button>
  </div>`;
}

function partnerRow(world, state, rid) {
  const p = partnerTrade(state, world, rid);
  if (!p) return '';
  const names = (list) => list.map((g) => world.market.goods[g].short).join(' and ');
  const closed = hostile(state, TEMERIA, rid) ? 'At war: no trade.' : (state.neighbours?.[rid]?.relation ?? 0) < world.market.deals.minRelation ? 'Borders closed to our merchants.' : '';
  return `<button type="button" class="place-row" data-partner="${rid}" data-go="${world.neighbours.realms[rid] ? 'realm' : 'board'}:${rid}"><span>${escapeHtml(sideName(world, rid))}</span>
    <span>${closed ? escapeHtml(closed) : `Wants ${escapeHtml(names(p.wants))}; offers ${escapeHtml(names(p.offers))}. Up to ${number(p.capacity)} a month.`}</span></button>`;
}

export function marketHtml(app) {
  const { world, state } = app;
  if (!world.market) return '<p class="sub">No market in this world.</p>';
  const deals = Object.entries(state.market?.deals ?? {});
  const partners = Object.keys(world.geography.neighbours ?? {}).filter((rid) => state.realms?.[rid] && !state.realms[rid].fallen && rid !== 'brokilon');
  return `<div data-part="goods"><p class="sub">What the realm has to spare or lacks each month. Surplus sells at home for less; deals sell it abroad for more.</p>
      ${MARKET_GOODS.map((g) => goodRow(world, state, g)).join('')}</div>
    <div data-part="deals"><h3>Deals</h3>${deals.length ? deals.map(([rid, d]) => dealRow(world, state, rid, d)).join('') : '<p class="sub">No deals yet. Choose a partner below, or tap a realm on the board.</p>'}</div>
    <div data-part="partners"><h3>Partners</h3><div class="place-list">${partners.map((rid) => partnerRow(world, state, rid)).join('')}</div></div>`;
}

// The deal form for one partner: what to sell (a good it wants) and buy (a
// good it offers), so much a month, with what it would bring in. `mode` is
// 'order' on the board (sent at the month's turn) or 'now' on a realm's
// card (agreed at once).
export function dealFormHtml(app, rid, mode = 'now') {
  const { world, state, memory } = app;
  if (!world.market) return '';
  const p = partnerTrade(state, world, rid);
  if (!p) return '';
  const cur = state.market?.deals?.[rid];
  const f = form(memory, `deal:${rid}`, {
    sell: cur?.sell?.good ?? p.wants[0], sellQty: cur?.sell?.qty ?? 0,
    buy: cur?.buy?.good ?? p.offers[0], buyQty: cur?.buy?.qty ?? 0,
  });
  if (!p.wants.includes(f.sell)) f.sell = p.wants[0];
  if (!p.offers.includes(f.buy)) f.buy = p.offers[0];
  const amounts = [0, 10, 25, 50, 100, 200, 400].filter((q) => q <= p.capacity);
  if (p.capacity > 0 && !amounts.includes(p.capacity)) amounts.push(p.capacity);
  if (!amounts.includes(f.sellQty)) f.sellQty = 0;
  if (!amounts.includes(f.buyQty)) f.buyQty = 0;
  const goodChips = (key, list) => list.map((g) => `<button type="button" class="chip${f[key] === g ? ' on' : ''}" aria-pressed="${f[key] === g}" data-set="${key}:${g}">${escapeHtml(world.market.goods[g].name)}</button>`).join('');
  const qtyChips = (key) => amounts.map((q) => `<button type="button" class="chip${f[key] === q ? ' on' : ''}" aria-pressed="${f[key] === q}" data-set="${key}:${q}">${q ? number(q) : 'None'}</button>`).join('');
  const sell = f.sellQty ? { good: f.sell, qty: f.sellQty } : null;
  const buy = f.buyQty ? { good: f.buy, qty: f.buyQty } : null;
  const check = canTrade(state, world, rid, sell, buy);
  const pv = dealPreview(state, world, rid, sell, buy);
  const action = mode === 'order' ? { type: 'order', order: { kind: 'trade', realm: rid, sell, buy } } : { type: 'trade', realm: rid, sell, buy };
  const label = mode === 'order' ? 'Trade (an order for this month)' : cur ? 'Change the deal' : 'Agree the deal';
  const sub = check.ok ? `${pv.net >= 0 ? '+' : '−'}${crowns(Math.abs(pv.net))} a month at today's prices` : escapeHtml(check.reason);
  return `<div data-form="deal:${rid}" data-part="trade">
    <p class="sub">${escapeHtml(sideName(world, rid))} wants ${escapeHtml(p.wants.map((g) => world.market.goods[g].short).join(' and '))} and offers ${escapeHtml(p.offers.map((g) => world.market.goods[g].short).join(' and '))}, up to ${number(p.capacity)} loads a month of each.</p>
    <div class="form-row"><span>Sell</span><div class="chips">${goodChips('sell', p.wants)}</div></div>
    <div class="form-row"><span>A month</span><div class="chips">${qtyChips('sellQty')}</div></div>
    <div class="form-row"><span>Buy</span><div class="chips">${goodChips('buy', p.offers)}</div></div>
    <div class="form-row"><span>A month</span><div class="chips">${qtyChips('buyQty')}</div></div>
    ${pv.lines.length ? `<p class="sub" data-part="deal-preview">${pv.lines.map(escapeHtml).join(' ')}</p>` : ''}
    ${button(label, `data-board-order="trade" data-deal-go="${rid}" ${orderAttr(action)}`, { disabled: !check.ok, sub })}
  </div>`;
}

// ---- Taxes and loans ----

const ESTATES = [['towns', 'tax_towns'], ['peasants', 'tax_peasants'], ['nobles', 'tax_nobles']];

function estateRow(world, state, estate, lawId, preview) {
  const law = world.laws.laws[lawId];
  const now = state.laws[lawId]?.option ?? law.default;
  const s = enactment(state, world, lawId);
  const opts = Object.entries(law.options).map(([oid, opt]) => {
    const v = preview?.[oid] ?? 0;
    const cur = oid === now;
    const check = cur ? { ok: false } : canDecree(state, world, lawId, oid);
    return `<button type="button" class="tax-opt${cur ? ' on' : ''}" data-tax="${lawId}:${oid}" ${cur ? 'aria-pressed="true"' : orderAttr({ type: 'law', law: lawId, option: oid })} ${cur || check.ok ? '' : 'disabled'}>
      <b>${escapeHtml(opt.name)}</b><span>${number(v)} a month</span></button>`;
  }).join('');
  const cur = law.options[now];
  return `<div class="tax-row" data-estate="${estate}">
    <div class="gr-main"><span class="gr-line">${escapeHtml(law.name)}</span>
      <span class="gr-sub">${escapeHtml(cur.blurb)}${s < 1 ? ` Taking hold, ${Math.round(s * 100)}%.` : ''}</span></div>
    <div class="tax-opts">${opts}</div></div>`;
}

export function taxesHtml(app) {
  const { world, state } = app;
  const preview = estateTaxPreview(state, world);
  const taxes = ESTATES.filter(([, id]) => world.laws.laws[id]).map(([e, id]) => estateRow(world, state, e, id, preview[e])).join('');
  return `<div data-part="taxes"><p class="sub">Heavier taxes bring more crowns and anger the estate that pays: the burghers and the towns, the villages (who also grow more slowly), or the lords. A change takes a month to take hold.</p>${taxes}</div>
    ${loansHtml(app)}`;
}

function loansHtml(app) {
  const { world, state } = app;
  const c = world.economy.loans;
  if (!c) return '';
  const owed = owedOnLoans(state);
  const cap = loanCap(state, world);
  const offers = c.sums.map((sum) => {
    const t = loanTerms(state, world, sum);
    const check = canBorrow(state, world, sum);
    return button(`Borrow ${number(sum)}`, `data-loan="${sum}" ${orderAttr({ type: 'loan', sum }, `Borrow ${number(sum)} crowns from ${c.lender}, repaid in ${t.months} payments of ${number(t.payment)}?`)}`,
      { disabled: !check.ok, sub: check.ok ? `${t.months} payments of ${number(t.payment)} (${number(t.total)} in all)` : escapeHtml(check.reason) });
  }).join('');
  const loans = (state.loans ?? []).map((l) => {
    const check = canPayOff(state, world, l.id);
    return `<div class="deal-row" data-loan-id="${l.id}"><div class="gr-main"><span class="gr-line">${number(l.sum)} borrowed: ${number(l.payment)} a month, ${l.left} payments left</span>
      <span class="gr-sub">${l.missed ? `${l.missed} payment${l.missed > 1 ? 's' : ''} missed; the rate has risen.` : 'Paid on time.'}</span></div>
      <button type="button" class="chip" data-pay-off="${l.id}" ${orderAttr({ type: 'payOff', id: l.id })} ${check.ok ? '' : 'disabled'} title="${escapeHtml(check.ok ? '' : check.reason)}">Pay off ${number(payOffCost(state, world, l.id))}</button></div>`;
  }).join('');
  return `<div data-part="loans"><h3>Loans from ${escapeHtml(c.lender)}</h3>
    <p class="sub">Owed on loans: ${number(owed)} of the ${number(cap)} the bank allows (six months of income). A missed payment raises the rate and costs the folk's Love.</p>
    ${loans}<div class="actions">${offers}</div></div>`;
}

