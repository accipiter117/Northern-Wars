// The Trade screen, and the trade and gold sections of a settlement card.
import {
  TEMERIA, routeValue, routeLimit, routeCost, routeEndOk, canOpenRoute, routeKey, sideName, ownerOf,
  depositsOf, depositAt, activeMines, goldYield, canProspect, slotsOf, formatDate,
} from '../sim/index.js';
import { number, escapeHtml } from './format.js';

const back = '<div class="menu-list"><button type="button" data-action="back">Back to the realm</button></div>';
const SAFETY = (t) => (t < 20 ? 'safe roads' : t < 35 ? 'some danger on the road' : t < 50 ? 'dangerous roads' : 'perilous roads');

function placeName(world, state, id) {
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
    <button type="button" class="chip" data-close-route="${r.id}">Wind up</button></div>`;
}

export function tradeHtml(world, state, form) {
  const limit = routeLimit(state, world);
  const ends = routeEnds(world, state);
  if (!ends.ours.includes(form.from)) form.from = ends.ours[0];
  const all = [...ends.ours, ...ends.theirs].filter((id) => id !== form.from);
  if (!all.includes(form.to)) form.to = all[0];
  const opt = (id) => `<option value="${id}"${id === form.to ? ' selected' : ''}>${escapeHtml(placeName(world, state, id))}</option>`;
  const fromSel = `<select class="pick" data-pick="from" aria-label="from">${ends.ours.map((id) => `<option value="${id}"${id === form.from ? ' selected' : ''}>${escapeHtml(world.byId[id].name)}</option>`).join('')}</select>`;
  const toSel = `<select class="pick" data-pick="to" aria-label="to"><optgroup label="In Temeria">${ends.ours.filter((id) => id !== form.from).map(opt).join('')}</optgroup>
    ${ends.theirs.length ? `<optgroup label="Abroad">${ends.theirs.map(opt).join('')}</optgroup>` : ''}</select>`;
  const check = form.from && form.to ? canOpenRoute(state, world, form.from, form.to) : { ok: false, reason: 'Choose two towns.' };
  const preview = form.from && form.to ? routeValue(state, world, { from: form.from, to: form.to }) : null;
  const estimate = preview && !preview.closed
    ? `Would earn about ${number(preview.value)} crowns a month (${SAFETY(preview.parts.threat)}${preview.parts.wares > 1 ? ', each end selling what the other lacks' : ''}).`
    : '';
  const routes = state.routes.map((r) => routeRow(world, state, r)).join('');
  const last = state.ledger.history.at(-1);
  const takings = last ? Object.values(last.income.routes ?? {}).reduce((a, b) => a + b, 0) : 0;
  const mines = activeMines(state, world).map(({ id, settlement }) => {
    const left = state.gold.deposits[id].remaining;
    return `<li>${escapeHtml(world.gold.deposits[id].name)} at ${escapeHtml(world.byId[settlement].name)}: about ${number(goldYield(state, world, id))} crowns a month, ${Math.round((left / world.gold.deposits[id].gold) * 100)}% of the seam left</li>`;
  }).join('');
  const known = Object.entries(world.gold.deposits).filter(([id]) => state.gold.deposits[id].known && state.gold.deposits[id].remaining > 0
    && !state.settlements[world.gold.deposits[id].settlement]?.buildings.includes('goldmine'))
    .map(([id, d]) => `<button type="button" class="chip" data-place="${d.settlement}">${escapeHtml(d.name)} (${escapeHtml(world.byId[d.settlement].name)})</button>`).join(' ');
  return `
    <div data-part="head"><h2>Trade and gold</h2>${back}
      <dl class="stats">
        <div><dt>Routes</dt><dd>${state.routes.length} of ${limit}</dd></div>
        <div><dt>Last month</dt><dd>${last ? `${number(takings)} crowns` : 'None yet'}</dd></div>
      </dl>
      <p class="sub">A crown route earns from the size and fortunes of both towns, the length of the haul, wares one has and the other lacks, and safe roads. Patrols protect it; bandits rob it; war closes it. Market halls, guildhalls and harbours let the crown run more.</p></div>
    <div data-part="routes"><h3>Crown trade routes</h3>${routes || '<p class="sub">None yet.</p>'}</div>
    <div data-part="open"><h3>Open a route</h3>
      <div class="form-row"><span>From</span>${fromSel}</div>
      <div class="form-row"><span>To</span>${toSel}</div>
      <button type="button" class="build" data-open-route ${check.ok ? '' : 'disabled'}><span class="build-name">Open the route${check.ok ? ` for ${number(check.cost)} crowns` : ''}</span>
        <span class="build-cost">${escapeHtml(check.ok ? estimate : check.reason)}</span></button></div>
    ${goodsHtml(world, state)}
    <div data-part="gold"><h3>Gold</h3>
      ${mines ? `<ul class="cares">${mines}</ul>` : '<p class="sub">No gold mine is working.</p>'}
      ${known ? `<p class="sub">Known seams waiting for a mine:</p><div class="chips">${known}</div>` : ''}
      <p class="sub">Other hills may hide gold. Prospect from the card of a place near hills or mountains.</p></div>
  `;
}

// The realm's goods last month: how much each chain made and what it sold for.
function goodsHtml(world, state) {
  if (!world.industry) return '';
  const last = state.ledger.history.at(-1);
  const made = state.industry?.made ?? {};
  const rows = Object.entries(world.industry.goods).filter(([g]) => made[g])
    .map(([g, def]) => `<li>${escapeHtml(def.name)}: ${number(made[g])} made${last?.income.goods?.[g] ? `, sold for ${number(last.income.goods[g])} crowns` : ', all worked into other goods'}</li>`).join('');
  return `<div data-part="goods"><h3>Goods</h3>${rows ? `<ul class="cares">${rows}</ul>` : '<p class="sub">No workshop or pasture of the crown makes goods yet.</p>'}
    <p class="sub">Pastures, studs and salt pans make goods; weavers, distillers, charcoal burners and weaponsmiths work them into dearer ones. Crown routes carry finished goods at a premium where the far end lacks them, most of all abroad; the rest sells at home, cheaper once the home market is full.</p></div>`;
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
      <button type="button" class="build" data-route-from="${id}"><span class="build-name">Open a trade route from here</span>
      <span class="build-cost">${state.routes.length} of ${routeLimit(state, world)} crown routes in use.</span></button>`);
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
        : !pc.hidden ? `<button type="button" class="build" data-prospect ${pc.ok ? '' : 'disabled'}><span class="build-name">Send prospectors</span>
        <span class="build-cost">${pc.ok ? `${world.gold.prospect.coin} crowns and ${world.gold.prospect.days} days. They may find nothing.` : escapeHtml(pc.reason)}</span></button>` : ''}`);
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
