import { formatDate, dateOf, totalPopulation, realmStock, MONTHS, ledgerNet, creditLimit } from '../sim/index.js';
import { number, escapeHtml } from './format.js';
import { routeLedgerRows } from './trade.js';

const signed = (n) => (n < 0 ? `−${number(-n)}` : number(n));

export function realmMenuHtml(world, state, hasSave) {
  let people = 0;
  let soldiers = 0;
  let works = 0;
  for (const s of Object.values(state.settlements)) {
    if (s.occupier) continue;
    people += totalPopulation(s);
    soldiers += s.garrison;
    if (s.construction) works++;
  }
  const stock = realmStock(state);
  const debt = state.treasury < 0
    ? `<p class="warn">The crown owes ${escapeHtml(world.economy.debt.lender)} ${number(-state.treasury)} crowns. They will lend up to ${number(creditLimit(state, world))}.${state.unpaid ? ' They will lend no more, and the garrisons go unpaid.' : ''}</p>`
    : '';
  return `
    <h2>The Realm of ${escapeHtml(world.kingdom.name)}</h2>
    <p class="sub">${number(people)} souls in ${Object.values(state.settlements).filter((s) => !s.occupier).length} settlements, ${number(soldiers)} under arms${works ? `, ${works} building works under way` : ''}.</p>
    ${debt}
    <dl class="stats">
      <div><dt>Food</dt><dd>${number(stock.food)}</dd></div>
      <div><dt>Timber</dt><dd>${number(stock.timber)}</dd></div>
      <div><dt>Stone</dt><dd>${number(stock.stone)}</dd></div>
      <div><dt>Iron</dt><dd>${number(stock.iron)}</dd></div>
    </dl>
    <div class="menu-list">
      <button type="button" data-action="laws">Laws and edicts<small>Decree, and see how the realm feels about it</small></button>
      <button type="button" data-action="trade">Trade and gold<small>Crown trade routes, gold mines and prospecting</small></button>
      <button type="button" data-action="war">War${state.wars?.some((w) => w.sides.flat().includes('temeria')) ? ' <span class="badge bad">At war</span>' : ''}<small>Armies, marshals, sieges and peace</small></button>
      <button type="button" data-action="forces">Forces<small>The crown's companies, and every threat sighted</small></button>
      <button type="button" data-action="military">Garrisons and danger<small>Town garrisons, and where bandits and beasts breed</small></button>
      <button type="button" data-action="nobles">The great houses<small>Loyalty, lands, demands and the crown's hand</small></button>
      <button type="button" data-action="faith">Faith and peoples<small>Faiths, tensions, the Scoia'tael and petitions</small></button>
      <button type="button" data-action="neighbours">Neighbouring realms<small>Relations, trade and envoys</small></button>
      <button type="button" data-action="ledger">Treasury<small>Every crown in and out, and what each place earns</small></button>
      <button type="button" data-action="chronicle">Chronicle<small>Dispatches from across the realm</small></button>
      <button type="button" data-action="help">Help<small>The hints again, and turning them on or off</small></button>
      <button type="button" data-action="save">Save now<small>Also saved at the start of every month</small></button>
      <button type="button" data-action="load" ${hasSave ? '' : 'disabled'}>Load last save</button>
      <button type="button" data-action="export">Export save<small>Download the reign as a file</small></button>
      <button type="button" data-action="import">Import save<small>Continue a reign from a file</small></button>
      <button type="button" data-action="new" class="danger">Start a new reign</button>
    </div>
  `;
}

// Labels for the money lines that are not one per building, good or route.
const INCOME = [
  ['taxes', 'Taxes'],
  ['trade', 'Market trade in the towns'],
  ['sales', 'Surplus timber, stone and iron'],
  ['foreign', 'Trade over the borders'],
  ['customs', 'River and sea customs'],
  ['gold', 'Gold'],
  ['silver', 'Silver'],
  ['tolls', 'Bridge tolls'],
  ['rents', "Rents (merchants' quarters)"],
  ['donations', "Donations (pilgrims' hostel)"],
  ['contracts', 'Shipyard contracts'],
  ['conquests', 'Conquered towns'],
  ['tribute', 'Tribute received'],
];
const EXPENSES = [
  ['garrisons', 'Garrisons'],
  ['upkeep', 'Building upkeep'],
  ['court', 'The court'],
  ['edicts', 'Edicts'],
  ['gifts', 'Gifts to friendly realms'],
  ['companies', 'Standing companies'],
  ['patrols', 'Patrols'],
  ['embassies', 'Embassies abroad'],
  ['armies', 'Armies in the field'],
  ['occupation', 'Garrisons in conquered towns'],
  ['tribute', 'Tribute paid'],
  ['routes', 'Running trade routes'],
  ['interest', 'Interest to the bankers'],
];
const ALWAYS = new Set(['taxes', 'trade', 'garrisons', 'upkeep', 'court', 'interest']);

// The Treasury: last month's ledger, a line for every source of money and
// every cost, the places that earned most, and the past year.
export function ledgerHtml(world, state) {
  const back = '<div class="menu-list"><button type="button" data-action="back">Back to the realm</button></div>';
  const last = state.ledger.history.at(-1);
  if (!last) {
    return `<h2>Treasury</h2>${back}<p class="sub">The first accounts are drawn up at the start of next month.</p>`;
  }
  const i = last.income;
  const e = last.expenses;
  const { in: totalIn, out: totalOut, net } = ledgerNet(last);
  const row = (label, v, total = false) => `<div${total ? ' class="total"' : ''}><dt>${label}</dt><dd>${signed(v)}</dd></div>`;
  const lines = (list, from) => list.filter(([k]) => typeof from[k] === 'number' && (from[k] || ALWAYS.has(k))).map(([k, label]) => row(label, from[k])).join('');
  const crafts = typeof i.crafts === 'number' ? (i.crafts ? row('Crafts', i.crafts) : '')
    : Object.entries(i.crafts ?? {}).filter(([, v]) => v).sort((a, b) => b[1] - a[1])
      .map(([b, v]) => row(escapeHtml(world.buildings[b]?.name ?? 'Crafts'), v)).join('');
  const goods = Object.entries(i.goods ?? {}).filter(([, v]) => v).sort((a, b) => b[1] - a[1])
    .map(([g, v]) => row(`${escapeHtml(world.industry?.goods[g]?.name ?? g)} sold`, v)).join('');
  const routes = routeLedgerRows(world, last, row);
  const history = state.ledger.history.slice().reverse().map((h) => {
    const { net: n } = ledgerNet(h);
    return `<tr><td>${MONTHS[h.month - 1].name.slice(0, 3)} ${h.year}</td><td>${signed(n)}</td><td>${number(h.expenses.construction)}</td><td>${signed(h.treasury)}</td></tr>`;
  }).join('');
  const places = Object.entries(state.ledger.places ?? {}).filter(([id]) => world.byId[id])
    .map(([id, p]) => ({ id, ...p, net: p.in - p.out })).sort((a, b) => b.net - a.net);
  const placeRow = (p) => `<button type="button" class="place-row" data-place="${p.id}"><span>${escapeHtml(world.byId[p.id].name)}</span><span>${signed(p.in)} in, ${number(p.out)} out</span></button>`;
  const top = places.slice(0, 6).map(placeRow).join('');
  const worst = places.filter((p) => p.net < 0).slice(-3).reverse().map(placeRow).join('');
  return `
    <h2>Treasury</h2>
    ${back}
    <dl class="stats">
      <div><dt>${MONTHS[last.month - 1].name} ${last.year}</dt><dd>${signed(net)} <small>net</small></dd></div>
      <div><dt>In the treasury</dt><dd>${signed(Math.round(state.treasury))}</dd></div>
    </dl>
    <h3>Income</h3>
    <dl class="ledger">${lines(INCOME.slice(0, 5), i)}</dl>
    ${crafts ? `<h4>Crafts</h4><dl class="ledger">${crafts}</dl>` : ''}
    ${goods ? `<h4>Goods from the chains</h4><dl class="ledger">${goods}</dl>` : ''}
    <dl class="ledger">${lines(INCOME.slice(5), i)}</dl>
    ${routes ? `<h4>Crown trade routes</h4><dl class="ledger">${routes}</dl>` : ''}
    <dl class="ledger">${row('Total income', totalIn, true)}</dl>
    <h3>Expenses</h3>
    <dl class="ledger">${lines(EXPENSES, e)}${row('Total expenses', totalOut, true)}</dl>
    ${state.treasury > world.economy.upkeep.hoardFree ? '<p class="sub">A full treasury draws courtiers and hangers-on: the court costs more while the coffers stay this full.</p>' : ''}
    <p class="sub">Paid when ordered this month: ${number(e.construction)} crowns on building works, ${number(e.decrees ?? 0)} on decrees.</p>
    ${top ? `<h3>Where the money came from</h3><div class="place-list">${top}</div>` : ''}
    ${worst ? `<h3>Where it went</h3><p class="sub">Places that cost the crown more than they earned, mostly for their garrisons.</p><div class="place-list">${worst}</div>` : ''}
    <h3>The past year</h3>
    <table class="history"><thead><tr><th>Month</th><th>Net</th><th>Works</th><th>Treasury</th></tr></thead><tbody>${history}</tbody></table>
  `;
}

const CHRONICLE_KINDS = {
  all: 'All',
  treasury: 'Treasury and works',
  realm: 'Laws and people',
  abroad: 'Abroad',
  faith: 'Faith and peoples',
  nobles: 'The houses',
  military: 'War and peril',
};

// The chronicle: how this reign stands, then every dispatch, newest first,
// grouped by year and filtered by subject.
export function chronicleHtml(state, filter = 'all') {
  const r = state.reign;
  let pop = 0;
  for (const s of Object.values(state.settlements)) pop += totalPopulation(s);
  const years = Math.floor((state.day - r.since) / 365);
  const change = pop - r.popStart;
  const summary = `
    <h3>Reign ${r.number}${state.depositions.length ? ` (after ${state.depositions.length} deposition${state.depositions.length === 1 ? '' : 's'})` : ''}</h3>
    <dl class="stats">
      <div><dt>Ruling since</dt><dd>${formatDate(r.since)}</dd></div>
      <div><dt>Years</dt><dd>${years}</dd></div>
      <div><dt>People</dt><dd>${number(pop)} <small>(${change >= 0 ? '+' : '\u2212'}${number(Math.abs(change))})</small></dd></div>
      <div><dt>Decrees</dt><dd>${r.decrees}</dd></div>
      <div><dt>Buildings</dt><dd>${r.built}</dd></div>
      <div><dt>Riots and pogroms</dt><dd>${r.riots + r.pogroms}</dd></div>
    </dl>`;
  const chips = Object.entries(CHRONICLE_KINDS).map(([k, label]) =>
    `<button type="button" class="chip${k === filter ? ' on' : ''}" data-chronicle="${k}" aria-pressed="${k === filter}">${label}</button>`).join(' ');
  let year = null;
  const items = [];
  for (const d of state.chronicle.slice().reverse()) {
    if (filter !== 'all' && (d.kind ?? 'realm') !== filter) continue;
    const y = dateOf(d.day).year;
    if (y !== year) {
      year = y;
      items.push(`<li class="year">${y}</li>`);
    }
    items.push(`<li><time>${formatDate(d.day)}</time>${escapeHtml(d.text)}</li>`);
  }
  return `
    <div data-part="head"><h2>Chronicle</h2>
      <div class="menu-list"><button type="button" data-action="back">Back to the realm</button></div></div>
    <div data-part="summary">${summary}</div>
    <div data-part="filter"><div class="chips chronicle-filter">${chips}</div></div>
    <div data-part="entries"><ul class="chronicle">${items.join('') || '<li>Nothing of note yet.</li>'}</ul></div>
  `;
}
