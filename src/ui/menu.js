import { formatDate, dateOf, totalPopulation, realmStock, MONTHS, ledgerNet } from '../sim/index.js';
import { number, escapeHtml } from './format.js';

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
    ? `<p class="warn">The crown owes ${escapeHtml(world.economy.debt.lender)} ${number(-state.treasury)} crowns. They will lend up to ${number(world.economy.debt.creditLimit)}.${state.unpaid ? ' They will lend no more, and the garrisons go unpaid.' : ''}</p>`
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
      <button type="button" data-action="war">War${state.wars?.some((w) => w.sides.flat().includes('temeria')) ? ' <span class="badge bad">At war</span>' : ''}<small>Armies, marshals, sieges and peace</small></button>
      <button type="button" data-action="military">Military and threats<small>Soldiers, patrols, bandits and monsters</small></button>
      <button type="button" data-action="nobles">The great houses<small>Loyalty, lands, demands and the crown's hand</small></button>
      <button type="button" data-action="faith">Faith and peoples<small>Faiths, tensions, the Scoia'tael and petitions</small></button>
      <button type="button" data-action="neighbours">Neighbouring realms<small>Relations, trade and envoys</small></button>
      <button type="button" data-action="ledger">Ledger<small>Where the crowns come from and where they go</small></button>
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

export function ledgerHtml(world, state) {
  const back = '<div class="menu-list"><button type="button" data-action="back">Back to the realm</button></div>';
  const last = state.ledger.history.at(-1);
  if (!last) {
    return `<h2>Ledger</h2>${back}<p class="sub">The first accounts are drawn up at the start of next month.</p>`;
  }
  const i = last.income;
  const e = last.expenses;
  const { in: totalIn, out: totalOut } = ledgerNet(last);
  const row = (label, v) => `<div><dt>${label}</dt><dd>${signed(v)}</dd></div>`;
  const history = state.ledger.history.slice().reverse().map((h) => {
    const { net } = ledgerNet(h);
    return `<tr><td>${MONTHS[h.month - 1].name.slice(0, 3)} ${h.year}</td><td>${signed(net)}</td><td>${number(h.expenses.construction)}</td><td>${signed(h.treasury)}</td></tr>`;
  }).join('');
  return `
    <h2>Ledger</h2>
    ${back}
    <h3>${MONTHS[last.month - 1].name} ${last.year}: income</h3>
    <dl class="ledger">${row('Taxes', i.taxes)}${row('Trade and tolls', i.trade)}${row('Surplus goods sold', i.sales)}${row('Trade over the borders', i.foreign ?? 0)}${i.conquests ? row('Conquered towns', i.conquests) : ''}${i.tribute ? row('Tribute received', i.tribute) : ''}${row('Total', totalIn)}</dl>
    <h3>Expenses</h3>
    <dl class="ledger">${row('Garrisons', e.garrisons)}${row('Building upkeep', e.upkeep)}${row('The court', e.court)}${row('Edicts', e.edicts ?? 0)}${row('Gifts to friendly realms', e.gifts ?? 0)}${row('Patrols', e.patrols ?? 0)}${row('Embassies abroad', e.embassies ?? 0)}${e.armies ? row('Armies in the field', e.armies) : ''}${e.occupation ? row('Garrisons in conquered towns', e.occupation) : ''}${e.tribute ? row('Tribute paid', e.tribute) : ''}${row('Interest to the bankers', e.interest)}${row('Total', totalOut)}</dl>
    ${state.treasury > world.economy.upkeep.hoardFree ? '<p class="sub">A full treasury draws courtiers and hangers-on: the court costs more while the coffers stay this full.</p>' : ''}
    <p class="sub">Paid when ordered this month: ${number(e.construction)} crowns on building works, ${number(e.decrees ?? 0)} on decrees.</p>
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
