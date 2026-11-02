// The Realm tab: a dashboard (the four meters and where they are heading,
// what needs attention, the places in most trouble) and a searchable list of
// every place. Also the four meter cards that say why a meter moved.
import {
  totalPopulation, realmStock, foodNeed, foodYield, seasonOf, dateOf, ledgerNet, creditLimit,
  plagueActive, freeCompanies, warsOf, TEMERIA, MONTHS, monthlyOutput, authority, taxCollected, musterAnswer, canAct, ACT_NAMES, threatUnrest, canRiot,
  actRest,
  repairOrder,
} from '../sim/index.js';
import { number, escapeHtml, describeLevel } from './format.js';
import { closedSeams } from '../sim/gold.js';
import { icon } from './icons.js';
import { chips, segs, section, cardHead, orderAttr } from './card.js';
import { form } from './memory.js';
import { INCOME, EXPENSES } from './menu.js';
import { pendingDecisions } from './inbox.js';
import { cooling } from './cooldown.js';
import { labourHtml, labourStripHtml } from './labour.js';

const signed = (n) => (n < 0 ? `−${number(-n)}` : `+${number(n)}`);
const UNREST_WORDS = ['Quiet', 'Grumbling', 'Restless', 'Angry', 'On the brink'];
const TYPE_NAMES = { city: 'City', town: 'Town', village: 'Village', castle: 'Castle', temple: 'Temple' };
const METERS = [
  ['treasury', 'Treasury', 'coin'],
  ['granary', 'Granary', 'wheat'],
  ['love', 'Love', 'heart'],
  ['fear', 'Fear', 'gallows'],
  ['authority', 'Authority', 'sceptre'],
  ['unrest', 'Unrest', 'flame'],
  // The goods of the compact top bar (M24 A).
  ['fuel', 'Fuel', 'logs'],
  ['iron', 'Iron and arms', 'anvil'],
  ['cloth', 'Cloth', 'cloth'],
];

export function meterValue(state, key, world = null) {
  if (key === 'treasury') return state.treasury;
  if (key === 'granary') return realmStock(state).food;
  if (key === 'authority') return world ? authority(state, world) : (state.authorityNow ?? 0);
  if (key === 'fuel') return state.labour?.fuel ?? 0;
  if (key === 'iron') return realmStock(state).iron;
  if (key === 'cloth') return state.market?.report?.cloth?.balance ?? 0;
  return state[key] ?? 0;
}

// How a meter has moved over about a month, from the samples the interface
// takes once a day (or, for the treasury, last month's accounts).
export function trend(app, key, days = 30) {
  const now = meterValue(app.state, key, app.world);
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
    const val = key === 'treasury' && app.state.treasury < 0 ? `−${number(-app.state.treasury)}` : number(meterValue(app.state, key, app.world));
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
  // Old gold workings that could be reopened (M34 A), the richest first,
  // each one tap away.
  const seams = closedSeams(state, world).sort((a, b) => b.monthly - a.monthly);
  for (const m of seams.slice(0, 2)) out.push(seamAlert(world, m));
  if (seams.length > 2) out.push({ text: `${seams.length - 2} more old workings could be reopened`, tab: 'treasury:industry', ic: 'coin' });
  return out;
}

// One flooded seam as a line in Needs attention, with the order to reopen it.
export function seamAlert(world, m) {
  const months = Math.max(1, Math.round(m.days / 30));
  const when = months === 1 ? 'a month' : `${['', 'one', 'two', 'three', 'four', 'five', 'six'][months] ?? months} months`;
  return {
    text: `Old workings at ${world.byId[m.settlement].name} could be reopened: about ${number(m.coin)} crowns, ${when}, then about ${number(m.monthly)} crowns a month`,
    name: `Old workings at ${world.byId[m.settlement].name} could be reopened`,
    sub: `About ${number(m.coin)} crowns, ${when}, then about ${number(m.monthly)} crowns a month. Tap to reopen.`,
    order: { type: 'repair', settlement: m.settlement, building: 'goldmine', kind: 'rebuild' },
    confirm: `Reopen ${m.name} for about ${number(m.coin)} crowns?`,
    seam: m.settlement,
    ic: 'coin',
  };
}

function alertsHtml(app) {
  const list = alertsOf(app);
  if (!list.length) return '<p class="sub">Nothing pressing. The realm goes about its business.</p>';
  return `<div class="rows">${list.map((a) => `<button type="button" class="row" ${a.order ? `data-seam="${a.seam}" ${orderAttr(a.order, a.confirm)}` : a.go ? `data-go="${a.go}"` : `data-tab-go="${a.tab}"`}>
    ${icon(a.ic)}<span class="row-main"><span class="row-name${a.bad ? ' mood-bad' : ''}">${escapeHtml(a.name ?? a.text)}</span>${a.sub ? `<span class="row-sub">${escapeHtml(a.sub)}</span>` : ''}</span></button>`).join('')}</div>`;
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
    ${labourStripHtml(app)}
    <div data-part="alerts"><h3>Needs attention</h3>${alertsHtml(app)}</div>
    <div data-part="troubled"><h3>In most trouble</h3>${troubledHtml(app)}</div>`;
}

const FILTERS = [['all', 'All'], ['crown', 'Crown'], ['lords', "Lords'"], ['hungry', 'Hungry'], ['restless', 'Restless'], ['works', 'Repairing']];

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
    if (f.filter === 'works') return Object.keys(s.repair ?? {}).length > 0;
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
      for (const b of Object.keys(s.repair ?? {})) bits.push(`mending the ${world.buildings[b].name.toLowerCase()}`);
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
  const body = sub === 'places' ? placesHtml(app) : sub === 'overview' ? overviewHtml(app) : labourHtml(app);
  return {
    title: `The Realm of ${escapeHtml(app.world.kingdom.name)}`,
    html: `${segs([['labour', 'Labour'], ['overview', 'Overview'], ['places', 'Places']], sub)}${body}`,
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
    <div data-part="works"><p class="sub">Also paid when ordered last month: ${number(last.expenses.construction)} on repairs, ${number(last.expenses.decrees ?? 0)} on decrees.</p></div>
    ${repairOrderHtml(state)}`;
}

// The standing order for repairs (M28 A).
const ORDER_LABELS = [
  ['cheap', 'Mend the cheap, ask about the dear'],
  ['rebuild', 'Rebuild everything'],
  ['patch', 'Patch everything'],
  ['ask', 'Ask me each time'],
];

export function repairOrderHtml(state) {
  const o = repairOrder(state);
  const waiting = state.works?.pending?.length ?? 0;
  return `<div data-part="repair-order"><h3>Repairs</h3>
    <p class="sub">${o.mode === 'cheap' ? `Works costing up to ${number(o.limit)} crowns are mended without asking, food and fuel first; the dear ones come to court once a month, together.` : o.mode === 'ask' ? 'Every broken works is brought to court on its own.' : 'Works are mended without asking, as far as the treasury goes, food and fuel first.'}${waiting ? ` ${waiting} wait for coin or for next month's round.` : ''}</p>
    <div class="chips">${ORDER_LABELS.map(([m, label]) => `<button type="button" class="chip${o.mode === m ? ' on' : ''}" aria-pressed="${o.mode === m}" ${orderAttr({ type: 'repairOrder', mode: m })}>${escapeHtml(label)}</button>`).join(' ')}</div></div>`;
}

// Fuel (M24 A): what the woods cut against what the hearths burn.
function fuelCard(app) {
  const { state, world } = app;
  const lab = state.labour ?? {};
  const made = lab.made ?? 0;
  const burned = lab.burned ?? 0;
  const woods = lab.report?.woods;
  const reasons = [
    ['Cut last month by the woods hands', made],
    ['Burned last month in the hearths', -burned],
  ];
  if (woods && woods.need > 0) reasons.push([`Woods hands: ${number(woods.staffed)} at work of ${number(woods.need)} wanted`, null]);
  if ((lab.short ?? 0) > 0.05) reasons.unshift(['The woodpiles are empty: hearths are going cold', null]);
  return `${cardHead({
    status: '<span>Wood, charcoal and turf for the realm\'s hearths, cut by the woods hands and burned from November to March. Run short in winter and the poorest die of cold.</span>',
    chips: [
      { icon: 'logs', label: 'In store', value: number(lab.fuel ?? 0), tone: (lab.short ?? 0) > 0.05 ? 'bad' : '' },
      { label: 'Last month', value: signed(made - burned), tone: made < burned ? 'bad' : 'good' },
    ],
    actions: '<button type="button" class="act" data-tab-go="realm:labour"><span class="act-label">Labour</span></button>',
  })}
    <div data-part="why"><h3>Last month</h3><dl class="ledger" data-part="reasons">${reasons.map(([why, v]) => `<div><dt>${escapeHtml(why)}</dt><dd class="${v === null ? '' : v >= 0 ? 'up' : 'down'}">${v === null ? '' : signed(Math.round(v))}</dd></div>`).join('')}</dl></div>`;
}

// Iron and cloth (M24 A): the month's making and using, from the market's
// report, and where most of it is made.
function goodCard(app, good, iconName) {
  const { state, world } = app;
  const r = state.market?.report?.[good];
  const def = world.market?.goods?.[good];
  if (!r || !def) return '<p class="sub">No trade in this good in this world.</p>';
  const makers = Object.keys(state.settlements).filter((id) => !state.settlements[id].occupier)
    .map((id) => [id, monthlyOutput(state, world, [id])[good]]).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const lines = [
    ['Made', r.made], ['Used by the realm', -r.used],
    r.sold ? ['Sold at home', -r.sold] : null, r.exported ? ['Sent abroad', -r.exported] : null, r.imported ? ['Bought from abroad', r.imported] : null,
  ].filter(Boolean);
  const kept = good === 'iron' ? ` In store: ${number(realmStock(state).iron)}.` : ' Cloth is not kept in store: what is not used is sold.';
  return `${cardHead({
    status: `<span>${escapeHtml(def.blurb)}${kept}</span>`,
    chips: [
      { icon: iconName, label: 'Last month', value: signed(Math.round(r.balance)), tone: r.balance < 0 ? 'bad' : 'good' },
      { label: 'Price', value: r.price.toFixed(2) },
    ],
    actions: '<button type="button" class="act" data-tab-go="treasury:trade"><span class="act-label">Trade</span></button>',
  })}
    <div data-part="why"><h3>Last month</h3><dl class="ledger" data-part="reasons">${lines.map(([why, v]) => `<div><dt>${escapeHtml(why)}</dt><dd class="${v >= 0 ? 'up' : 'down'}">${signed(Math.round(v))}</dd></div>`).join('')}</dl></div>
    <div data-part="makers"><h3>Made most in</h3>${makers.length ? `<div class="rows">${makers.map(([id, v]) => placeRow(app, id, `${number(Math.round(v))} a month`)).join('')}</div>` : '<p class="sub">None of our places makes it.</p>'}</div>`;
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

// The crown's hold on the realm (M24 B): what each meter is, where it
// stands, the main reasons for its change last month (one line each,
// biggest first), and what the crown can do about it.
const ABOUT = {
  love: 'Love: the people\'s affection for the crown. It builds slowly and lasts. Full granaries, alms, feasts, light taxes, threats cleared, victories and a royal progress raise it; hunger, cold, raids left unanswered, defeats and heavy levies wear it away. A loved crown gets volunteers in war, towns that hold out for it and calmer towns, but its lords think it soft.',
  fear: 'Fear: the people\'s fear of the crown. It rises quickly with hangings, gibbets, crushed revolts, the king\'s riders, hostages and harsh laws, fades of itself unless renewed, and collapses after a defeat on our soil, a revolt that succeeds or garrisons withdrawn. A feared crown gets its taxes and levies on time and quiet towns, but the works are quietly sabotaged while it is not also loved.',
  authority: 'Authority: the higher of Love and Fear, and a quarter of the lower. A loved king and a feared king can both rule; one who is neither cannot. It decides how much tax is gathered, how many answer the muster, whether the great houses obey, whether a troubled town riots, and, with high Unrest for months, deposition.',
  unrest: 'Unrest: the realm\'s anger at the crown, from every town\'s unrest, beasts and bandits near the towns, the levies and the great houses\' grievances. 30 to 50 is the grumbling of a grim land and costs nothing; strikes, flight from the villages and revolt follow high Unrest only when Authority is low.',
};
function reasonsHtml(list, good) {
  if (!list?.length) return '<p class="sub">Nothing moved it much last month.</p>';
  return `<dl class="ledger" data-part="reasons">${list.slice(0, 5).map((r) => {
    const better = good === 'up' ? r.v > 0 : r.v < 0;
    const v = r.pressure ? `${r.v < 0 ? '−' : '+'}${Math.abs(r.v)}` : `${r.v < 0 ? '−' : '+'}${Math.abs(r.v).toFixed(1)}`;
    return `<div><dt>${escapeHtml(r.why)}</dt><dd class="${better ? 'up' : 'down'}">${v}</dd></div>`;
  }).join('')}</dl>`;
}
// The crown's own acts on the Love and Fear cards.
function actButton(app, kind, settlement, sub) {
  const { state, world } = app;
  const check = canAct(state, world, kind, settlement);
  const action = { type: 'act', kind, ...(settlement ? { settlement } : {}) };
  const rest = actRest(state, world, kind, settlement);
  return cooling(`<button type="button" class="build" data-act="${kind}" ${orderAttr(action, `${ACT_NAMES[kind]}${settlement ? ` at ${world.byId[settlement].name}` : ''}?`)} ${check.ok ? '' : 'disabled'}>
    <span class="build-name">${escapeHtml(ACT_NAMES[kind])}${settlement ? ` at ${escapeHtml(world.byId[settlement].name)}` : ''}</span><span class="build-cost">${escapeHtml(check.ok ? sub : check.reason)}</span></button>`, rest.left, rest.total, check.ok);
}
// The crown's acts aimed at one town that the Book of Laws has unlocked
// (M26): a pardon, the rope, the granaries, the court mage, the witch hunt.
export function townActsHtml(app, id) {
  const { state, world } = app;
  const a = world.meters?.acts;
  if (!a) return '';
  const subs = {
    pardon: `Unrest ${a.pardon.unrest}, Love +${a.pardon.love}.`,
    hang: `Unrest ${a.hang.unrest}, Fear +${a.hang.fear}, Love ${a.hang.love}.`,
    granaries: `${number(a.granaries.coin)} crowns. No one there goes hungry.`,
    mage: `${number(a.mage.coin)} crowns. Ends plague there, or the nearest beast lair.`,
    witchhunt: `${number(a.witchhunt.coin)} crowns. Clears the Scoia'tael from the district; Fear +${a.witchhunt.fear}.`,
  };
  const rows = Object.keys(subs).filter((k) => a[k] && !canAct(state, world, k, id).locked).map((k) => actButton(app, k, id, subs[k])).join('');
  return rows ? `<h3>Acts of the crown</h3><div class="build-list">${rows}</div>` : '';
}

function actsHtml(app, key) {
  const { state, world } = app;
  const a = world.meters?.acts;
  if (!a) return '';
  if (key === 'love') {
    return `<div data-part="acts"><h3>To win their love</h3><div class="build-list">
      ${actButton(app, 'feast', null, `${number(a.feast.coin)} crowns. Love +${a.feast.love}, and the lords pleased.`)}
      ${actButton(app, 'progress', null, `${number(a.progress.coin)} crowns, a month away from court (no decrees). Love and calm in the ${a.progress.towns} greatest towns.`)}
    </div></div>`;
  }
  if (key === 'fear') {
    // The most restless town of ours, for the rope; the one most troubled by
    // bandits and beasts, for the gibbets.
    const live = Object.keys(state.settlements).filter((id) => !state.settlements[id].occupier);
    const angry = live.sort((x, y) => state.settlements[y].unrest - state.settlements[x].unrest)[0];
    const roads = [...live].sort((x, y) => threatUnrest(state, world, y) - threatUnrest(state, world, x))[0];
    return `<div data-part="acts"><h3>To make them fear the crown</h3><div class="build-list">
      ${angry ? actButton(app, 'hang', angry, `Fear +${a.hang.fear}, the town quiet, Love ${a.hang.love}.`) : ''}
      ${roads ? actButton(app, 'gibbets', roads, `${number(a.gibbets.coin)} crowns. Fear +${a.gibbets.fear} and more each month they stand; the roads calmer.`) : ''}
    </div><p class="sub">The rope and the king's riders are laws of the Iron Hand in the Book of Laws; hostages are taken from a house's card.</p></div>`;
  }
  return '';
}
function meterOf(app, key, good, low) {
  const { state, world } = app;
  const v = Math.round(meterValue(state, key, world));
  const bad = good === 'up' ? v < low : v > low;
  const ic = { love: 'heart', fear: 'gallows', authority: 'sceptre', unrest: 'flame' }[key];
  const extra = key === 'authority'
    ? [{ label: 'From Love', value: Math.round(state.love) }, { label: 'From Fear', value: Math.round(state.fear) }, { label: 'Tax gathered', value: `${Math.round(taxCollected(state, world) * 100)}%` }]
    : [];
  const why = key === 'authority'
    ? `<div data-part="why"><h3>What it decides</h3><dl class="ledger" data-part="reasons">
        <div><dt>Of the tax due, gathered</dt><dd>${Math.round(taxCollected(state, world) * 100)}%</dd></div>
        <div><dt>Of the levy called, answering</dt><dd>${Math.round(musterAnswer(state, world) * 100)}%</dd></div>
        <div><dt>Troubled towns</dt><dd class="${canRiot(state, world) ? 'down' : 'up'}">${canRiot(state, world) ? 'may riot' : 'held down'}</dd></div>
      </dl></div>`
    : `<div data-part="why"><h3>${key === 'unrest' ? 'What keeps it there' : 'Last month'}</h3>${reasonsHtml(state.meters?.reasons?.[key], good)}</div>`;
  return `${cardHead({
    status: `<span>${escapeHtml(ABOUT[key])}</span>`,
    chips: [
      { icon: ic, label: 'Now', value: v, tone: bad ? 'bad' : '' },
      ...extra,
      { label: '30 days', value: signed(Math.round(trend(app, key))) },
    ],
    actions: key === 'unrest' ? '<button type="button" class="act" data-tab-go="court:laws"><span class="act-label">Laws and the realm\'s mood</span></button>' : '',
  })}
    ${why}${actsHtml(app, key)}`;
}
const loveCard = (app) => meterOf(app, 'love', 'up', 25);
const fearCard = (app) => meterOf(app, 'fear', 'up', 10);
const authorityCard = (app) => meterOf(app, 'authority', 'up', 35);
const unrestCard = (app) => meterOf(app, 'unrest', 'down', 60);

export function meterCard(app, key) {
  const [, label] = METERS.find((m) => m[0] === key) ?? METERS[0];
  const html = {
    treasury: treasuryCard, granary: granaryCard, love: loveCard, fear: fearCard, authority: authorityCard, unrest: unrestCard,
    fuel: fuelCard, iron: (a) => goodCard(a, 'iron', 'anvil'), cloth: (a) => goodCard(a, 'cloth', 'cloth'),
  }[key]?.(app) ?? '';
  return { title: `${icon(METERS.find((m) => m[0] === key)?.[2] ?? 'coin')} ${label}`, html };
}

export { section };
