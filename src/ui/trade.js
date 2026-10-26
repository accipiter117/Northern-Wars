// The Trade screen, and the trade and gold sections of a settlement card.
import {
  TEMERIA, routeValue, routeLimit, routeCost, routeEndOk, canOpenRoute, routeKey, sideName, ownerOf,
  depositsOf, depositAt, activeMines, goldYield, canProspect, slotsOf, formatDate,
} from '../sim/index.js';
import { number, escapeHtml } from './format.js';
import { icon } from './icons.js';
import { cardHead, orderAttr, info } from './card.js';
import { form } from './memory.js';
export const SAFETY = (t) => (t < 20 ? 'safe roads' : t < 35 ? 'some danger on the road' : t < 50 ? 'dangerous roads' : 'perilous roads');

export function placeName(world, state, id) {
  const owner = ownerOf(state, world, id);
  return owner === TEMERIA ? world.byId[id].name : `${world.byId[id].name} (${sideName(world, owner)})`;
}

// Towns and cities the crown could trade from (ours) and to (ours, or a
// neighbour's whose markets are open to us).
export function routeEnds(world, state) {
  const ours = [];
  const theirs = [];
  for (const id of Object.keys(world.byId)) {
    if (!routeEndOk(state, world, id).ok) continue;
    (ownerOf(state, world, id) === TEMERIA ? ours : theirs).push(id);
  }
  const byName = (a, b) => world.byId[a].name.localeCompare(world.byId[b].name);
  return { ours: ours.sort(byName), theirs: theirs.sort(byName) };
}

function routeRow(world, state, r) {
  const v = routeValue(state, world, r);
  const status = v.closed
    ? `<span class="badge bad">Closed: ${escapeHtml(v.closed)}</span>`
    : r.raided ? '<span class="badge bad">Robbed last month</span>' : '';
  const carried = Object.entries(r.goods ?? {}).filter(([, q]) => q > 0)
    .map(([g, q]) => `${number(q)} ${world.industry?.goods[g]?.name.toLowerCase() ?? g}`).join(', ');
  const detail = v.closed ? '' : `About ${number(v.value)} crowns a month from trade, ${SAFETY(v.parts.threat)}.${carried ? ` Last month it carried ${escapeHtml(carried)}, for ${number(r.premium ?? 0)} more.` : ''}`;
  return `<div class="law-option current"><span class="build-name">${escapeHtml(placeName(world, state, r.from))} to ${escapeHtml(placeName(world, state, r.to))} ${status}</span>
    <span class="build-cost">${detail} Since ${formatDate(r.since)}; ${world.trade.upkeep} a month to run.</span>
    <button type="button" class="chip" data-close-route="${r.id}" ${orderAttr({ type: 'route', close: true, id: r.id }, 'Wind up this trade route?')}>Wind up</button></div>`;
}

// The form for a new route: a town of ours to start from and a destination
// picked on the map, with what it would earn before the crown commits.
export function routeForm(app) {
  const { world, state } = app;
  const f = form(app.memory, 'trade', { from: world.kingdom.capital, to: null });
  const ends = routeEnds(world, state);
  if (!ends.ours.includes(f.from)) f.from = ends.ours[0] ?? null;
  if (f.to && (f.to === f.from || !routeEndOk(state, world, f.to).ok)) f.to = null;
  return f;
}

export function routePreview(app, from, to) {
  const { world, state } = app;
  const check = canOpenRoute(state, world, from, to);
  const v = routeValue(state, world, { from, to });
  const estimate = !v.closed
    ? `About ${number(v.value)} crowns a month (${SAFETY(v.parts.threat)}${v.parts.wares > 1 ? ', each end selling what the other lacks' : ''}).`
    : escapeHtml(v.closed);
  return { check, estimate, value: v.value };
}

export function routesHtml(app) {
  const { world, state } = app;
  const limit = routeLimit(state, world);
  const f = routeForm(app);
  const last = state.ledger.history.at(-1);
  const takings = last ? Object.values(last.income.routes ?? {}).reduce((a, b) => a + b, 0) : 0;
  const routes = state.routes.map((r) => routeRow(world, state, r)).join('');
  const p = f.from && f.to ? routePreview(app, f.from, f.to) : null;
  const openBtn = p
    ? `<button type="button" class="act primary wide" data-open-route ${orderAttr({ type: 'route', from: f.from, to: f.to })} ${p.check.ok ? '' : 'disabled'}><span class="act-label">Open the route${p.check.ok ? ` for ${number(p.check.cost)} crowns` : ''}</span><span class="act-sub">${p.check.ok ? p.estimate : escapeHtml(p.check.reason)}</span></button>`
    : '';
  return `
    ${cardHead({
      status: `<span>Crown routes carry the realm's trade for a share of it.</span>`,
      infoText: 'A crown route earns from the size and fortunes of both towns, the length of the haul, wares one has and the other lacks, and safe roads. Patrols protect it; bandits rob it; war closes it. Market halls, guildhalls and harbours let the crown run more.',
      chips: [{ icon: 'scroll', label: 'Routes', value: `${state.routes.length} of ${limit}` }, { icon: 'coin', label: 'Last month', value: last ? number(takings) : 'None yet' }],
    })}
    <div data-part="open" data-form="trade"><h3>Open a route</h3>
      <div class="rows">
        <button type="button" class="row" data-pick-start='{"kind":"routeFrom"}'><span class="row-main"><span class="row-sub">From</span><span class="row-name">${f.from ? escapeHtml(world.byId[f.from].name) : 'None of ours can'}</span></span><span class="row-end">${icon('target')} Change</span></button>
        <button type="button" class="row" data-pick-start='{"kind":"route"}'><span class="row-main"><span class="row-sub">To</span><span class="row-name">${f.to ? escapeHtml(placeName(world, state, f.to)) : 'Tap to pick on the map'}</span></span><span class="row-end">${icon('target')} Pick</span></button>
      </div>
      ${openBtn}</div>
    <div data-part="routes"><h3>Crown trade routes</h3>${routes || '<p class="sub">None yet.</p>'}</div>`;
}

export function industryHtml(app) {
  const { world, state } = app;
  const mines = activeMines(state, world).map(({ id, settlement }) => {
    const left = state.gold.deposits[id].remaining;
    return `<li>${escapeHtml(world.gold.deposits[id].name)} at ${escapeHtml(world.byId[settlement].name)}: about ${number(goldYield(state, world, id))} crowns a month, ${Math.round((left / world.gold.deposits[id].gold) * 100)}% of the seam left</li>`;
  }).join('');
  const known = Object.entries(world.gold.deposits).filter(([id]) => state.gold.deposits[id].known && state.gold.deposits[id].remaining > 0
    && !state.settlements[world.gold.deposits[id].settlement]?.buildings.includes('goldmine'))
    .map(([id, d]) => `<button type="button" class="chip" data-go="town:${d.settlement}">${escapeHtml(d.name)} (${escapeHtml(world.byId[d.settlement].name)})</button>`).join(' ');
  return `
    ${goodsHtml(world, state)}
    <div data-part="gold"><h3>Gold ${info('Other hills may hide gold. Prospect from the card of a place near hills or mountains: open its Overview.', 'gold')}</h3>
      ${mines ? `<ul class="cares">${mines}</ul>` : '<p class="sub">No gold mine is working.</p>'}
      ${known ? `<p class="sub">Known seams waiting for a mine:</p><div class="chips">${known}</div>` : ''}</div>
  `;
}

// The realm's goods last month: how much each chain made and what it sold for.
function goodsHtml(world, state) {
  if (!world.industry) return '';
  const last = state.ledger.history.at(-1);
  const made = state.industry?.made ?? {};
  const rows = Object.entries(world.industry.goods).filter(([g]) => made[g])
    .map(([g, def]) => `<li>${escapeHtml(def.name)}: ${number(made[g])} made${last?.income.goods?.[g] ? `, sold for ${number(last.income.goods[g])} crowns` : ', all worked into other goods'}</li>`).join('');
  return `<div data-part="goods"><h3>Goods ${info('Pastures, studs and salt pans make goods; weavers, distillers, charcoal burners and weaponsmiths work them into dearer ones. Crown routes carry finished goods at a premium where the far end lacks them, most of all abroad; the rest sells at home, cheaper once the home market is full.', 'goods')}</h3>${rows ? `<ul class="cares">${rows}</ul>` : '<p class="sub">No workshop or pasture of the crown makes goods yet.</p>'}</div>`;
}

// A settlement card's trade, gold and room-to-build lines.
export function settlementTradeHtml(world, state, id) {
  const s = state.settlements[id];
  const parts = [];
  const used = s.buildings.length;
  parts.push(`<p class="sub">Room for ${Math.max(0, slotsOf(world, id) - used)} more of ${slotsOf(world, id)} buildings.</p>`);
  const mine = state.routes.filter((r) => r.from === id || r.to === id)
    .map((r) => `<li>${escapeHtml(placeName(world, state, r.from === id ? r.to : r.from))}: ${r.closed ? 'closed' : `${number(r.last)} crowns last month`}</li>`).join('');
  if (routeEndOk(state, world, id).ok) {
    parts.push(`<h3>Trade</h3>${mine ? `<ul class="cares">${mine}</ul>` : ''}
      <button type="button" class="act" data-route-from="${id}" data-pick-start='{"kind":"route","from":"${id}"}'><span class="act-label">Open a trade route from here</span>
      <span class="act-sub">${state.routes.length} of ${routeLimit(state, world)} crown routes in use. Pick the far end on the map.</span></button>`);
  }
  const deps = depositsOf(world, id).filter((d) => state.gold.deposits[d].known);
  const gold = deps.map((d) => {
    const left = state.gold.deposits[d].remaining;
    const g = world.gold.deposits[d];
    if (left <= 0) return `<li>${escapeHtml(g.name)}: worked out.</li>`;
    const working = s.buildings.includes('goldmine');
    return `<li>${escapeHtml(g.name)}: ${working ? `yielding about ${number(goldYield(state, world, d))} crowns a month, ` : 'a known seam, waiting for a gold mine; '}${Math.round((left / g.gold) * 100)}% left.</li>`;
  }).join('');
  const pc = canProspect(state, world, id);
  const prospecting = state.gold.prospects.find((p) => p.settlement === id);
  if (gold || !pc.hidden || prospecting) {
    parts.push(`<h3>Gold</h3>${gold ? `<ul class="cares">${gold}</ul>` : ''}
      ${prospecting ? `<p class="sub">Prospectors are in the hills; they report back on ${formatDate(prospecting.until)}.</p>`
        : !pc.hidden ? `<button type="button" class="act" data-prospect ${orderAttr({ type: 'prospect', settlement: id })} ${pc.ok ? '' : 'disabled'}><span class="act-label">Send prospectors</span>
        <span class="act-sub">${pc.ok ? `${world.gold.prospect.coin} crowns and ${world.gold.prospect.days} days. They may find nothing.` : escapeHtml(pc.reason)}</span></button>` : ''}`);
  }
  return parts.join('');
}

// Route lines in the ledger, labelled by their towns.
export function routeLedgerRows(world, last, row) {
  return Object.entries(last.income.routes ?? {}).map(([key, v]) => {
    const [a, b] = key.split('>');
    return row(`Route: ${escapeHtml(world.byId[a]?.name ?? a)} to ${escapeHtml(world.byId[b]?.name ?? b)}`, v);
  }).join('');
}

export { routeKey, depositAt };
