import { formatDate, dateOf, totalPopulation, MONTHS, ledgerNet, creditLimit } from '../sim/index.js';
import { cardHead, section } from './card.js';
import { number, escapeHtml } from './format.js';
import { routeLedgerRows } from './trade.js';

const signed = (n) => (n < 0 ? `−${number(-n)}` : number(n));

// Labels for the money lines that are not one per building, good or route.
export const INCOME = [
  ['taxes', 'Head tax'],
  ['trade', 'Market dues in the towns'],
  ['tithe', 'Tithe of the harvest'],
  ['nobles', 'Dues from the lords'],
  ['sales', 'Surplus sold at home'],
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
  ['loot', 'Loot'],
  ['ransom', 'Ransoms'],
  ['reparations', 'Coin in peace terms'],
  ['requisition', 'Requisitions from occupied towns'],
  ['payments', 'Payments under deals'],
  ['borrowed', 'Borrowed from the bank'],
];
export const EXPENSES = [
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
  ['loans', 'Loan payments'],
];
const ALWAYS = new Set(['taxes', 'trade', 'garrisons', 'upkeep', 'court', 'interest']);

// The one ledger (M21): every money line folded into a handful of groups,
// so the month reads at a glance; the full breakdown stays under Details.
const INCOME_GROUPS = [
  ['taxes', 'Taxes', ['taxes', 'trade', 'tithe', 'nobles']],
  ['trade', 'Trade deals', ['exports', 'foreign', 'routes']],
  ['sales', 'Sales at home', ['sales', 'goods']],
  ['crafts', 'Crafts and mines', ['crafts', 'gold', 'silver']],
  ['tolls', 'Tolls and dues', ['customs', 'tolls', 'rents', 'donations', 'contracts']],
  ['war', 'War', ['conquests', 'tribute', 'loot', 'ransom', 'reparations', 'requisition', 'payments']],
  ['loans', 'Loans', ['borrowed']],
];
const EXPENSE_GROUPS = [
  ['armies', 'Armies and garrisons', ['garrisons', 'companies', 'patrols', 'armies', 'occupation']],
  ['upkeep', 'Upkeep of buildings', ['upkeep']],
  ['court', 'The court', ['court', 'edicts', 'gifts', 'embassies', 'tribute']],
  ['trade', 'Goods bought abroad', ['imports', 'routes']],
  ['loans', 'Loans and interest', ['interest', 'loans']],
];
const ESTATES = [['towns', 'towns'], ['peasants', 'villages'], ['nobles', 'lords']];
const sumOf = (v) => (typeof v === 'number' ? v : Object.values(v ?? {}).reduce((a, b) => a + b, 0));

function groupedLedger(last, row) {
  const group = (groups, from) => {
    const seen = new Set();
    const rows = groups.map(([id, label, keys]) => {
      keys.forEach((k) => seen.add(k));
      const v = keys.reduce((a, k) => a + sumOf(from[k]), 0);
      if (!v && id !== 'taxes' && id !== 'armies') return '';
      let sub = '';
      // Taxes by estate, when the month's accounts carry them.
      if (id === 'taxes' && last.estates) {
        sub = ESTATES.filter(([k]) => last.estates[k]).map(([k, name]) => `${name} ${signed(last.estates[k])}`).join(', ').replace(/^./, (c) => c.toUpperCase());
      }
      return `<div data-line="${id}"><dt>${label}${sub ? `<small>${escapeHtml(sub)}</small>` : ''}</dt><dd>${signed(Math.round(v))}</dd></div>`;
    });
    const other = Object.entries(from).filter(([k]) => !seen.has(k) && k !== 'construction' && k !== 'decrees').reduce((a, [, v]) => a + sumOf(v), 0);
    if (Math.round(other)) rows.push(row('Other', Math.round(other)));
    return rows.join('');
  };
  return { income: group(INCOME_GROUPS, last.income), expenses: group(EXPENSE_GROUPS, last.expenses) };
}

// The Ledger: last month's accounts, a line for every source of money and
// every cost, then (folded away) the places that earned most and the past
// year.
export function ledgerHtml(app) {
  const { world, state, memory } = app;
  const route = 'tab:treasury';
  const last = state.ledger.history.at(-1);
  const debt = state.treasury < 0
    ? `<p class="warn">The crown owes ${escapeHtml(world.economy.debt.lender)} ${number(-state.treasury)} crowns. They will lend up to ${number(creditLimit(state, world))}.${state.unpaid ? ' They will lend no more, and the garrisons go unpaid.' : ''}</p>`
    : '';
  if (!last) {
    return `<div data-part="head">${debt}<p class="sub">The first accounts are drawn up at the start of next month.</p></div>`;
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
  const partners = (obj, verb) => Object.entries(obj ?? {}).filter(([, v]) => v).sort((a, b) => b[1] - a[1]).map(([n, v]) => row(`${verb} ${escapeHtml(n)}`, v)).join('');
  const exportsRows = partners(i.exports, 'Sold to');
  const importsRows = partners(e.imports, 'Bought from');
  const history = state.ledger.history.slice().reverse().map((h) => {
    const { net: n } = ledgerNet(h);
    return `<tr><td>${MONTHS[h.month - 1].name.slice(0, 3)} ${h.year}</td><td>${signed(n)}</td><td>${number(h.expenses.construction)}</td><td>${signed(h.treasury)}</td></tr>`;
  }).join('');
  const places = Object.entries(state.ledger.places ?? {}).filter(([id]) => world.byId[id])
    .map(([id, p]) => ({ id, ...p, net: p.in - p.out })).sort((a, b) => b.net - a.net);
  const placeRow = (p) => `<button type="button" class="place-row" data-place="${p.id}" data-go="town:${p.id}"><span>${escapeHtml(world.byId[p.id].name)}</span><span>${signed(p.in)} in, ${number(p.out)} out</span></button>`;
  const top = places.slice(0, 6).map(placeRow).join('');
  const worst = places.filter((p) => p.net < 0).slice(-3).reverse().map(placeRow).join('');
  const head = cardHead({
    status: `<span>The accounts for ${MONTHS[last.month - 1].name} ${last.year}.</span>`,
    chips: [
      { icon: 'coin', label: 'Net', value: signed(net), tone: net < 0 ? 'bad' : 'good' },
      { label: 'In', value: number(totalIn) },
      { label: 'Out', value: number(totalOut) },
      { label: 'Treasury', value: signed(Math.round(state.treasury)), tone: state.treasury < 0 ? 'bad' : '' },
    ],
    extra: debt,
  });
  const detailIncome = `<dl class="ledger">${lines(INCOME.slice(0, 7), i)}</dl>
    ${exportsRows ? `<h4>Trade deals</h4><dl class="ledger">${exportsRows}</dl>` : ''}
    ${crafts ? `<h4>Crafts</h4><dl class="ledger">${crafts}</dl>` : ''}
    ${goods ? `<h4>Goods from the chains</h4><dl class="ledger">${goods}</dl>` : ''}
    <dl class="ledger">${lines(INCOME.slice(7), i)}</dl>
    ${routes ? `<h4>Crown trade routes</h4><dl class="ledger">${routes}</dl>` : ''}
    <dl class="ledger">${row('Total income', totalIn, true)}</dl>`;
  const detailExpenses = `<dl class="ledger">${lines(EXPENSES, e)}${importsRows}${row('Total expenses', totalOut, true)}</dl>
    ${state.treasury > world.economy.upkeep.hoardFree ? '<p class="sub">A full treasury draws courtiers and hangers-on: the court costs more while the coffers stay this full.</p>' : ''}
    <p class="sub">Paid when ordered this month: ${number(e.construction)} crowns on repairs, ${number(e.decrees ?? 0)} on decrees.</p>`;
  const where = `${top ? `<h3>Where the money came from</h3><div class="place-list">${top}</div>` : ''}
    ${worst ? `<h3>Where it went</h3><p class="sub">Places that cost the crown more than they earned, mostly for their garrisons.</p><div class="place-list">${worst}</div>` : ''}`;
  const g = groupedLedger(last, row);
  const ledger = `<div data-part="ledger"><h3>Income</h3><dl class="ledger grouped">${g.income}${row('Total income', totalIn, true)}</dl>
    <h3>Expenses</h3><dl class="ledger grouped">${g.expenses}<div data-line="repairs"><dt>Repairs and decrees<small>paid when ordered, not counted above</small></dt><dd>${number((e.construction ?? 0) + (e.decrees ?? 0))}</dd></div>${row('Total expenses', totalOut, true)}</dl></div>`;
  return `${head}
    ${ledger}
    ${section(memory, route, 'details', 'Details', `<h4>Income</h4>${detailIncome}<h4>Expenses</h4>${detailExpenses}`)}
    ${section(memory, route, 'places', 'Places that earn and cost', where)}
    ${section(memory, route, 'year', 'The past year', `<table class="history"><thead><tr><th>Month</th><th>Net</th><th>Works</th><th>Treasury</th></tr></thead><tbody>${history}</tbody></table>`)}`;
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
    <div data-part="summary">${summary}</div>
    <div data-part="filter"><div class="chips chronicle-filter">${chips}</div></div>
    <div data-part="entries"><ul class="chronicle">${items.join('') || '<li>Nothing of note yet.</li>'}</ul></div>
  `;
}
