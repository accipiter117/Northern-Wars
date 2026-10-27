// The board of the North (M20 D and E): a short card for a realm tapped on
// the board, with the three orders a month (march, trade, envoy), and the
// month's orders: what is set, what came of last month's, and what the
// rulers did at its turn.
import {
  TEMERIA, ORDERS_A_MONTH, boardRealm, canGiveOrder, envoysWaiting, marchTarget, sideName, hostile, TRADE_GIVE, formatDate,
} from '../sim/index.js';
import { number, escapeHtml } from './format.js';
import { chips, orderAttr, button } from './card.js';
import { form } from './memory.js';

const KIND = { march: 'March', trade: 'Trade', envoy: 'Envoy' };

function orderLine(world, o) {
  if (o.kind === 'march') return `March on ${escapeHtml(sideName(world, o.realm))}`;
  if (o.kind === 'trade') return `Trade with ${escapeHtml(sideName(world, o.realm))}: our ${escapeHtml(world.diplomacy.goods[o.give].name.toLowerCase())} for their ${escapeHtml(world.diplomacy.goods[o.take].name.toLowerCase())}`;
  return `An envoy to ${escapeHtml(sideName(world, o.realm))}`;
}

function setCount(state) {
  const n = state.orders?.list.length ?? 0;
  return `<p class="sub" data-part="count"><b>${n} of ${ORDERS_A_MONTH} orders set</b> this month. They go out at its turn, with the rulers' own.</p>`;
}

function marchHtml(app, rid) {
  const { world, state } = app;
  const armies = (state.armies ?? []).filter((a) => a.side === TEMERIA);
  if (!armies.length) return button('March', 'disabled', { sub: 'Raise an army first (Military).', disabled: true });
  return armies.map((a) => {
    const o = { kind: 'march', realm: rid, army: a.id };
    const check = canGiveOrder(state, world, o);
    const to = check.ok ? marchTarget(state, world, a, rid) : null;
    return button(`March: ${escapeHtml(a.name)}`, `data-board-order="march" ${orderAttr({ type: 'order', order: o })}`,
      { disabled: !check.ok, sub: check.ok ? `${number(a.soldiers)} men, on ${escapeHtml(world.byId[to].name)}` : escapeHtml(check.reason) });
  }).join('');
}

function tradeHtml(app, rid) {
  const { world, state, memory } = app;
  const goods = world.diplomacy?.goods ?? {};
  const f = form(memory, 'board-trade', { give: 'grain', take: 'iron' });
  if (f.give === f.take) f.take = Object.keys(goods).find((g) => g !== f.give);
  const row = (key, list) => `<div class="chips">${list.map((g) => `<button type="button" class="chip${f[key] === g ? ' on' : ''}" aria-pressed="${f[key] === g}" data-set="${key}:${g}">${escapeHtml(goods[g].name)}</button>`).join('')}</div>`;
  const o = { kind: 'trade', realm: rid, give: f.give, take: f.take };
  const check = canGiveOrder(state, world, o);
  return `<div data-form="board-trade" data-part="trade">
    <div class="form-row"><span>Send</span>${row('give', TRADE_GIVE.filter((g) => goods[g]))}</div>
    <div class="form-row"><span>Ask for</span>${row('take', Object.keys(goods).filter((g) => g !== f.give))}</div>
    ${button('Trade', `data-board-order="trade" ${orderAttr({ type: 'order', order: o })}`, { disabled: !check.ok, sub: check.ok ? 'A month\'s worth each way, for six months, if they agree' : escapeHtml(check.reason) })}
  </div>`;
}

export function boardCard(app, rid) {
  const { world, state } = app;
  const v = boardRealm(state, world, rid);
  const works = v.works.n ? `${Math.round(v.works.mean)}${v.works.worn ? `, ${v.works.worn} worn` : ''}` : 'none';
  const head = `<div data-part="head">
    ${chips([
      { icon: 'sword', label: 'Men', value: v.men === null ? 'unknown' : number(v.men) },
      { icon: 'castle', label: 'Places', value: v.towns },
      { icon: 'hammer', label: 'Works', value: works, tone: v.works.worn ? 'warn' : '' },
    ])}
    <p class="sub">${v.war ? `<span class="down">At war with Temeria.</span> ` : ''}${v.seen ? '' : 'We have no eyes there: its strength is guessed. '}</p>
  </div>`;
  const waiting = envoysWaiting(state, world).some((e) => e.realm === rid) && world.diplomacy?.rulers?.[rid]
    ? button('Hold the audience', `data-audience="${rid}" data-part="audience"`, { cls: 'act primary', sub: 'Our envoy is at their court' }) : '';
  const envoy = { kind: 'envoy', realm: rid };
  const ec = canGiveOrder(state, world, envoy);
  return `${head}${setCount(state)}${waiting}
    <h3>Orders</h3>
    <div class="actions" data-part="orders">
      ${marchHtml(app, rid)}
      ${button('Envoy', `data-board-order="envoy" ${orderAttr({ type: 'order', order: envoy })}`, { disabled: !ec.ok, sub: ec.ok ? 'Warmer relations, and an audience waiting' : escapeHtml(ec.reason) })}
      ${world.neighbours.realms[rid] ? button('The full card', `data-go="realm:${rid}"`, { sub: 'Stance, intelligence, pacts and war' }) : ''}
    </div>
    ${hostile(state, TEMERIA, rid) ? '' : tradeHtml(app, rid)}`;
}

export function boardTitle(app, rid) {
  return escapeHtml(boardRealm(app.state, app.world, rid).name);
}

// The month's orders: those set (each can be withdrawn), last month's
// results, and the rulers' moves at its turn.
export function ordersHtml(app) {
  const { world, state } = app;
  const o = state.orders ?? { list: [], last: [], theirs: [] };
  const set = o.list.map((x, i) => `<li data-kind="${x.kind}"><span>${orderLine(world, x)}</span> <button type="button" class="chip" ${orderAttr({ type: 'cancelOrder', index: i })} aria-label="Withdraw this order">Withdraw</button></li>`).join('');
  const last = (o.last ?? []).map((x) => `<li class="${x.ok ? 'up' : 'down'}">${escapeHtml(x.text)}</li>`).join('');
  const theirs = (o.theirs ?? []).map((x) => `<li>${escapeHtml(x.text)}</li>`).join('');
  return `${setCount(state)}
    <div data-part="set">${set ? `<ul class="plain orders">${set}</ul>` : '<p class="sub">No orders yet. Tap a realm on the board to give one.</p>'}</div>
    ${last ? `<h3>Last month</h3><ul class="plain orders" data-part="last">${last}</ul>` : ''}
    ${theirs ? `<h3>The rulers' moves</h3><ul class="plain orders" data-part="theirs">${theirs}</ul>` : ''}
    <p class="sub">${KIND.march}es are drawn as dashed lines on the board. Orders resolve on ${escapeHtml(formatDate(nextMonth(state.day)))}.</p>`;
}

function nextMonth(day) {
  let d = day + 1;
  while (formatDate(d).split(' ')[0] !== '1') d += 1;
  return d;
}
