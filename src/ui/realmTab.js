// The Realm tab: a dashboard (the four meters and where they are heading,
// what needs attention, the places in most trouble) and a searchable list of
// every place. Also the four meter cards that say why a meter moved.
import {
  totalPopulation, realmStock, foodNeed, foodYield, seasonOf, dateOf, ledgerNet, creditLimit, authorityParts,
  plagueActive, freeCompanies, warsOf, TEMERIA, MONTHS,
} from '../sim/index.js';
import { number, escapeHtml, describeLevel } from './format.js';
import { icon } from './icons.js';
import { chips, segs, section, cardHead } from './card.js';
import { form } from './memory.js';
import { INCOME, EXPENSES } from './menu.js';
import { pendingDecisions } from './inbox.js';

const signed = (n) => (n < 0 ? `−${number(-n)}` : `+${number(n)}`);
const UNREST_WORDS = ['Quiet', 'Grumbling', 'Restless', 'Angry', 'On the brink'];
const TYPE_NAMES = { city: 'City', town: 'Town', village: 'Village', castle: 'Castle', temple: 'Temple' };
const METERS = [
  ['treasury', 'Treasury', 'coin'],
  ['granary', 'Granary', 'wheat'],
  ['authority', 'Authority', 'crown'],
  ['stability', 'Stability', 'scales'],
];

export function meterValue(state, key) {
  if (key === 'treasury') return state.treasury;
  if (key === 'granary') return realmStock(state).food;
  return state[key];
}

// How a meter has moved over about a month, from the samples the interface
// takes once a day (or, for the treasury, last month's accounts).
export function trend(app, key, days = 30) {
  const now = meterValue(app.state, key);
  const old = app.samples.find((p) => p.day >= app.state.day - days);
  if (old && old.day < app.state.day) return now - old[key];
  if (key === 'treasury') {
    const last = app.state.ledger.history.at(-1);
    return last ? ledgerNet(last).net : 0;
  }
  return 0;
}

function trendWord(v, key) {
  const small = key === 'treasury' || key === 'granary' ? 20 : 1;
  if (Math.abs(v) < small) return { arrow: '', tone: '' };
  return v > 0 ? { arrow: '▲', tone: 'good' } : { arrow: '▼', tone: 'bad' };
}

function meterChips(app) {
  return chips(METERS.map(([key, label, ic]) => {
    const v = trend(app, key);
    const t = trendWord(v, key);
    const val = key === 'treasury' && app.state.treasury < 0 ? `−${number(-app.state.treasury)}` : number(meterValue(app.state, key));
    return { icon: ic, label, value: `${val}${t.arrow ? ` <small class="${t.tone === 'good' ? 'up' : 'down'}">${t.arrow}${number(Math.abs(v))}</small>` : ''}`, go: `meter:${key}`, tone: t.tone === 'bad' ? 'bad' : '' };
  }));
}

// What needs the crown's eye, each with where to go about it.
export function alertsOf(app) {
  const { state, world } = app;
  const out = [];
  const waiting = pendingDecisions(state, world, app.acked()).length;
  if (waiting) out.push({ text: `${waiting} decision${waiting === 1 ? '' : 's'} waiting at court`, tab: 'court:inbox', ic: 'inbox' });
  for (const w of warsOf(state, TEMERIA)) {
    const foes = w.sides[w.sides[0].includes(TEMERIA) ? 1 : 0].map((r) => world.geography.neighbours[r]?.name ?? r).join(' and ');
    out.push({ text: `At war with ${foes}`, tab: 'military:war', ic: 'sword', bad: true });
  }
  for (const [id, h] of Object.entries(state.houses)) if (h.rebel) out.push({ text: `${world.houses.houses[id].name} is in rebellion`, go: `house:${id}`, ic: 'crown', bad: true });
  if (state.crisisMonths > 0) out.push({ text: `The lords speak of a regency (${state.crisisMonths} of ${world.houses.deposition.months} months)`, tab: 'court:houses', ic: 'crown', bad: true });
  if (state.treasury < 0) out.push({ text: `In debt to the bankers: ${number(-state.treasury)} crowns${state.unpaid ? ', garrisons unpaid' : ''}`, go: 'meter:treasury', ic: 'coin', bad: true });
  const hungry = Object.entries(state.settlements).filter(([, s]) => s.hunger > 0.05 && !s.occupier);
  if (hungry.length) out.push({ text: `Hunger in ${hungry.length === 1 ? world.byId[hungry[0][0]].name : `${hungry.length} places`}`, go: hungry.length === 1 ? `town:${hungry[0][0]}` : 'meter:granary', ic: 'wheat', bad: true });
  for (const [id, s] of Object.entries(state.settlements)) {
    if (s.occupier) out.push({ text: `${world.byId[id].name} is held by the enemy`, go: `town:${id}`, ic: 'castle', bad: true });
    else if (plagueActive(state, s)) out.push({ text: `Plague in ${world.byId[id].name}`, go: `town:${id}`, ic: 'flame', bad: true });
  }
  const raided = Object.keys(state.settlements).filter((id) => (state.settlements[id].raided ?? 0) > state.day);
  if (raided.length) out.push({ text: `Raids on ${raided.length === 1 ? world.byId[raided[0]].name : `${raided.length} places`}`, go: raided.length === 1 ? `town:${raided[0]}` : null, tab: raided.length === 1 ? null : 'military:threats', ic: 'shield', bad: true });
  const hunted = new Set(freeCompanies(state).map((c) => c.task?.threat).filter(Boolean));
  const loose = (state.threats?.list ?? []).filter((t) => !t.abroad && (t.sighted || t.campSeen) && !hunted.has(t.id) && !state.threats.contracts.some((c) => c.threat === t.id));
  if (loose.length) out.push({ text: `${loose.length} threat${loose.length === 1 ? '' : 's'} sighted, nobody sent`, tab: 'military:threats', ic: 'target' });
  return out;
}

function alertsHtml(app) {
  const list = alertsOf(app);
  if (!list.length) return '<p class="sub">Nothing pressing. The realm goes about its business.</p>';
  return `<div class="rows">${list.map((a) => `<button type="button" class="row" ${a.go ? `data-go="${a.go}"` : `data-tab-go="${a.tab}"`}>
    ${icon(a.ic)}<span class="row-main"><span class="row-name${a.bad ? ' mood-bad' : ''}">${escapeHtml(a.text)}</span></span></button>`).join('')}</div>`;
}

// How badly a place is doing, and why in a few words.
export function troubleOf(app, id) {
  const { state, world } = app;
  const s = state.settlements[id];
  if (s.occupier) return { score: 0, why: [] };
  const why = [];
  let score = s.unrest;
  if (s.hunger > 0.05) { score += 40 + s.hunger * 60; why.push('hungry'); }
  if (plagueActive(state, s)) { score += 30; why.push('plague'); }
  if ((s.raided ?? 0) > state.day) { score += 20; why.push('raided'); }
  if (s.troubled > 0) { score += 15; why.push('riots'); }
  if (s.tension > 50) { score += (s.tension - 50) / 2; why.push('tense'); }
  if (s.unrest >= 40) why.unshift(describeLevel(s.unrest, UNREST_WORDS).toLowerCase());
  return { score, why, world };
}

function troubledHtml(app) {
  const rows = Object.keys(app.state.settlements)
    .map((id) => ({ id, ...troubleOf(app, id) }))
    .filter((r) => r.score > 35)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  if (!rows.length) return '<p class="sub">Nowhere is in real trouble.</p>';
  return `<div class="rows">${rows.map((r) => placeRow(app, r.id, r.why.join(', ') || 'uneasy')).join('')}</div>`;
}

function placeRow(app, id, note) {
  const { state, world } = app;
  const s = state.settlements[id];
  const pop = totalPopulation(s);
  return `<button type="button" class="row" data-go="town:${id}">
    <span class="row-main"><span class="row-name">${escapeHtml(world.byId[id].name)}</span><span class="row-sub">${TYPE_NAMES[world.byId[id].type]}${note ? `, ${escapeHtml(note)}` : ''}</span></span>
    <span class="row-end">${icon('people')}${number(pop)}</span></button>`;
}

function overviewHtml(app) {
  const { state } = app;
  let people = 0;
  let soldiers = 0;
  for (const s of Object.values(state.settlements)) {
    if (s.occupier) continue;
    people += totalPopulation(s);
    soldiers += s.garrison;
  }
  const places = Object.values(state.settlements).filter((s) => !s.occupier).length;
  return `
    <div data-part="meters"><p class="sub">${number(people)} souls in ${places} settlements, ${number(soldiers)} in the garrisons. Tap a meter to see why it moved.</p>${meterChips(app)}</div>
    <div data-part="alerts"><h3>Needs attention</h3>${alertsHtml(app)}</div>
    <div data-part="troubled"><h3>In most trouble</h3>${troubledHtml(app)}</div>`;
}

const FILTERS = [['all', 'All'], ['crown', 'Crown'], ['lords', "Lords'"], ['hungry', 'Hungry'], ['restless', 'Restless'], ['works', 'Building']];

function placesHtml(app) {
  const { state, world } = app;
  const f = form(app.memory, 'places', { q: '', filter: 'all', all: false });
  const q = f.q.trim().toLowerCase();
  const season = seasonOf(state.day);
  const keep = (id) => {
    const s = state.settlements[id];
    if (q && !world.byId[id].name.toLowerCase().includes(q)) return false;
    if (f.filter === 'crown') return s.holder === 'crown' && !s.occupier;
    if (f.filter === 'lords') return s.holder !== 'crown';
    if (f.filter === 'hungry') { const need = foodNeed(world, s, season); return s.hunger > 0.05 || (need > 0 && s.stock.food / need < 30); }
    if (f.filter === 'restless') return s.unrest >= 40;
    if (f.filter === 'works') return !!s.construction;
    return true;
  };
  const ids = Object.keys(state.settlements).filter(keep).sort((a, b) => world.byId[a].name.localeCompare(world.byId[b].name));
  const limit = q || f.all ? ids.length : 20;
  const note = (id) => {
    const s = state.settlements[id];
    const bits = [];
    if (s.occupier) bits.push('held by the enemy');
    else {
      if (s.holder !== 'crown' && world.houses.houses[s.holder]) bits.push(world.houses.houses[s.holder].name);
      const t = troubleOf(app, id);
      if (t.why.length) bits.push(t.why.join(', '));
      if (s.construction) bits.push(`raising a ${world.buildings[s.construction.building].name.toLowerCase()}`);
    }
    return bits.join('; ');
  };
  return `
    <div data-part="search" data-form="places"><label class="search">${icon('search')}<input type="search" data-field="q" value="${escapeHtml(f.q)}" placeholder="Find a place" aria-label="Find a place" autocomplete="off"></label>
      ${segs(FILTERS, f.filter, 'data-set-filter')}</div>
    <div data-part="list">${ids.length ? `<div class="rows">${ids.slice(0, limit).map((id) => placeRow(app, id, note(id))).join('')}</div>` : '<p class="sub">No place matches.</p>'}
      ${ids.length > limit ? `<button type="button" class="act wide" data-form="places" data-set="all:true">Show all ${ids.length} places</button>` : ''}</div>`;
}

export function realmTab(app) {
  const sub = app.memory.sub.realm;
  const body = sub === 'places' ? placesHtml(app) : overviewHtml(app);
  return {
    title: `The Realm of ${escapeHtml(app.world.kingdom.name)}`,
    html: `${segs([['overview', 'Overview'], ['places', 'Places']], sub)}${body}`,
  };
}

// ---- The meter cards: why a meter moved ----

function ledgerLines(world, from, list, n = 5) {
  return list.map(([k, label]) => {
    const v = from[k];
    const total = typeof v === 'number' ? v : Object.values(v ?? {}).reduce((a, b) => a + b, 0);
    return [label, total];
  }).filter(([, v]) => v).sort((a, b) => b[1] - a[1]).slice(0, n);
}

function linesHtml(lines, sign) {
  return `<dl class="ledger">${lines.map(([label, v]) => `<div><dt>${escapeHtml(label)}</dt><dd>${sign}${number(v)}</dd></div>`).join('')}</dl>`;
}

function treasuryCard(app) {
  const { state, world } = app;
  const last = state.ledger.history.at(-1);
  const head = cardHead({
    status: state.treasury < 0 ? `<span>In debt. The bankers will lend up to ${number(creditLimit(state, world))}.</span>` : '<span>Coin comes in on the first of each month and goes out on works and decrees as they are ordered.</span>',
    chips: [
      { icon: 'coin', label: 'Now', value: state.treasury < 0 ? `−${number(-state.treasury)}` : number(state.treasury), tone: state.treasury < 0 ? 'bad' : '' },
      last && { label: `${MONTHS[last.month - 1].name.slice(0, 3)} net`, value: signed(ledgerNet(last).net), tone: ledgerNet(last).net < 0 ? 'bad' : 'good' },
      { label: '30 days', value: signed(trend(app, 'treasury')) },
    ],
    actions: '<button type="button" class="act primary" data-tab-go="treasury:ledger"><span class="act-label">The full ledger</span></button>',
  });
  if (!last) return head + '<div data-part="none"><p class="sub">The first accounts are drawn up on the first of next month.</p></div>';
  const inc = ledgerLines(world, { ...last.income, crafts: last.income.crafts, goods: last.income.goods, routes: last.income.routes }, [...INCOME, ['crafts', 'Crafts'], ['goods', 'Goods sold'], ['routes', 'Crown trade routes']]);
  const exp = ledgerLines(world, last.expenses, EXPENSES);
  return `${head}
    <div data-part="in"><h3>What came in most</h3>${linesHtml(inc, '+')}</div>
    <div data-part="out"><h3>What went out most</h3>${linesHtml(exp, '−')}</div>
    <div data-part="works"><p class="sub">Also paid when ordered last month: ${number(last.expenses.construction)} on works, ${number(last.expenses.decrees ?? 0)} on decrees.</p></div>`;
}

function granaryCard(app) {
  const { state, world } = app;
  const season = seasonOf(state.day);
  const month = dateOf(state.day).month;
  let need = 0;
  let grown = 0;
  const rows = [];
  for (const [id, s] of Object.entries(state.settlements)) {
    if (s.occupier) continue;
    const n = foodNeed(world, s, season);
    need += n;
    grown += foodYield(world, id, s, month);
    rows.push({ id, days: n > 0 ? s.stock.food / n : Infinity, hunger: s.hunger });
  }
  const food = realmStock(state).food;
  const low = rows.filter((r) => r.hunger > 0.05 || r.days < 45).sort((a, b) => b.hunger - a.hunger || a.days - b.days).slice(0, 5);
  return `${cardHead({
    status: `<span>${grown >= need ? 'The fields grow more than the realm eats, for now.' : 'The realm eats more than its fields grow in this season.'} Grain moves by itself from full barns to empty ones.</span>`,
    chips: [
      { icon: 'wheat', label: 'In store', value: number(food) },
      { label: 'Grown a day', value: number(grown), tone: grown >= need ? 'good' : '' },
      { label: 'Eaten a day', value: number(need), tone: grown < need ? 'bad' : '' },
      { label: 'Lasts', value: need > grown ? `${number(food / (need - grown))} days` : 'Growing' },
      { label: '30 days', value: signed(trend(app, 'granary')) },
    ],
  })}
    <div data-part="low"><h3>Shortest of food</h3>${low.length ? `<div class="rows">${low.map((r) => placeRow(app, r.id, r.hunger > 0.05 ? 'going hungry' : `${number(r.days)} days of food`)).join('')}</div>` : '<p class="sub">Every place has a month and a half of food or more.</p>'}</div>`;
}

function authorityCard(app) {
  const { state, world } = app;
  const p = authorityParts(state, world);
  const total = p.regen + p.nobles + p.laws + p.buildings + p.debt + p.fade;
  const row = (label, v, note = '') => (Math.abs(v) < 0.05 ? '' : `<div><dt>${label}${note ? ` <small>${note}</small>` : ''}</dt><dd class="${v < 0 ? 'down' : 'up'}">${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(1)}</dd></div>`);
  return `${cardHead({
    status: '<span>Authority is the crown\'s grip on the realm: decrees, the lords and war all spend it. It moves on the first of each month.</span>',
    chips: [
      { icon: 'crown', label: 'Now', value: Math.round(state.authority), tone: state.authority < 25 ? 'bad' : '' },
      { label: 'Next month', value: `${total < 0 ? '−' : '+'}${Math.abs(total).toFixed(1)}`, tone: total < 0 ? 'bad' : 'good' },
      { label: '30 days', value: signed(trend(app, 'authority')) },
    ],
  })}
    <div data-part="parts"><h3>Next month, part by part</h3><dl class="ledger">
      ${row('Returns by itself', p.regen, p.regen ? '' : '(only below a point)')}
      ${row("The lords' mood", p.nobles)}
      ${row('Laws in force', p.laws)}
      ${row('Buildings', p.buildings)}
      ${row('Debt to the bankers', p.debt)}
      ${row('Prestige fades unless renewed', p.fade, '(above a point)')}
      <div class="total"><dt>In all</dt><dd>${total < 0 ? '−' : '+'}${Math.abs(total).toFixed(1)}</dd></div></dl>
      <p class="sub">Decrees, summons and fines spend it when ordered, and do not show here.</p></div>`;
}

function stabilityCard(app) {
  const { state } = app;
  const rows = Object.entries(state.settlements).filter(([, s]) => !s.occupier).sort((a, b) => b[1].unrest - a[1].unrest).slice(0, 5);
  return `${cardHead({
    status: '<span>Stability is the realm\'s calm: the unrest of every place, the big towns weighing most. Hunger, raids, plague, heavy taxes and bitter tempers raise unrest; garrisons, shrines and good harvests settle it.</span>',
    chips: [
      { icon: 'scales', label: 'Now', value: Math.round(state.stability), tone: state.stability < 40 ? 'bad' : '' },
      { label: '30 days', value: signed(trend(app, 'stability')) },
    ],
    actions: '<button type="button" class="act" data-tab-go="court:laws"><span class="act-label">Laws and the realm\'s mood</span></button>',
  })}
    <div data-part="restless"><h3>Most restless</h3><div class="rows">${rows.map(([id, s]) => placeRow(app, id, `${describeLevel(s.unrest, UNREST_WORDS).toLowerCase()} (${Math.round(s.unrest)})`)).join('')}</div></div>`;
}

export function meterCard(app, key) {
  const [, label] = METERS.find((m) => m[0] === key) ?? METERS[0];
  const html = { treasury: treasuryCard, granary: granaryCard, authority: authorityCard, stability: stabilityCard }[key]?.(app) ?? '';
  return { title: `${icon(METERS.find((m) => m[0] === key)?.[2] ?? 'coin')} ${label}`, html };
}

export { section };
