// A town's card: a summary head (population, prosperity, unrest, holder,
// garrison) and the actions most often wanted, then four tabs. Build lists
// only what can be raised here, one line each; what this place can never
// have is folded away.
import {
  totalPopulation, foodNeed, foodYield, goodsYield, foodCapacity, canBuild, seasonOf, dateOf, tensionWeight, tollsAt, goodOf, routeEndOk,
} from '../sim/index.js';
import { mixHtml as mix, gaugeHtml, FAITH_COLOURS, PEOPLE_COLOURS, TENSION_WORDS } from './faith.js';
import { defenceHtml, statusBadges } from './military.js';
import { occupationHtml, siegeNote } from './war.js';
import { settlementTradeHtml } from './trade.js';
import { settlementForcesHtml } from './forces.js';
import { number, escapeHtml, describeLevel } from './format.js';
import { icon } from './icons.js';
import { cardHead, segs, section, orderAttr } from './card.js';
import { isOpen } from './memory.js';

const TYPE_NAMES = { city: 'City', town: 'Town', village: 'Village', castle: 'Castle', temple: 'Temple' };
const TERRAIN_NAMES = { open: 'open farmland', marsh: 'marshland', forest: 'woodland', hills: 'hill country', mountains: 'the mountain foothills' };
const PROSPERITY_WORDS = ['Destitute', 'Poor', 'Getting by', 'Comfortable', 'Thriving'];
const UNREST_WORDS = ['Quiet', 'Grumbling', 'Restless', 'Angry', 'On the brink'];
export const TOWN_TABS = [['overview', 'Overview'], ['build', 'Build'], ['military', 'Military'], ['people', 'People']];

// Why a building cannot be ordered now: something money or time will cure,
// or something this place will never have as it stands.
const LATER = /lacks|bankers|busy/;

export function townCard(app, id) {
  const { world, state, lookups, memory } = app;
  const geo = world.byId[id];
  const s = state.settlements[id];
  const sub = memory.sub.town ?? 'overview';
  const capital = id === world.kingdom.capital;
  const holder = s.holder === 'crown' || !world.houses.houses[s.holder] ? null : s.holder;
  const what = `${capital ? `${TYPE_NAMES[geo.type]}, seat of the crown` : TYPE_NAMES[geo.type]}, in ${TERRAIN_NAMES[world.terrainOf[id]]}`;
  const trade = !s.occupier && world.trade && routeEndOk(state, world, id).ok;
  const actions = s.occupier ? '' : [
    world.forces ? `<button type="button" class="act" data-tsub="military" data-recruit-here><span class="act-label">${icon('sword')} Recruit here</span></button>` : '',
    trade ? `<button type="button" class="act" data-route-from="${id}" data-pick-start='{"kind":"route","from":"${id}"}'><span class="act-label">${icon('scroll')} Trade route from here</span></button>` : '',
  ].join('');
  const head = cardHead({
    status: `<span>${what}. ${statusBadges(state, id)}</span>`,
    chips: [
      { icon: 'people', label: 'Population', value: number(totalPopulation(s)) },
      { icon: 'sun', label: 'Prosperity', value: describeLevel(s.prosperity, PROSPERITY_WORDS), tone: s.prosperity < 30 ? 'bad' : s.prosperity >= 70 ? 'good' : '' },
      { icon: 'flame', label: 'Unrest', value: describeLevel(s.unrest, UNREST_WORDS), tone: s.unrest >= 50 ? 'bad' : '' },
      holder ? { icon: 'crown', label: 'Holder', value: escapeHtml(world.houses.houses[holder].name), go: `house:${holder}` } : { icon: 'crown', label: 'Holder', value: 'Crown demesne' },
      { icon: 'shield', label: 'Garrison', value: s.garrison ? `${number(s.garrison)}${state.unpaid ? ' unpaid' : ''}` : 'None', tone: state.unpaid ? 'bad' : '' },
    ],
    extra: (world.war ? occupationHtml(world, state, id) + siegeNote(world, state, id) : '')
      + (s.troubled > 0 ? '<p class="warn">Riots or raiders have struck here lately. Some folk are leaving.</p>' : ''),
    actions,
  });
  const body = { overview: overviewHtml, build: buildTabHtml, military: militaryTabHtml, people: peopleHtml }[sub] ?? overviewHtml;
  return `${head}${segs(TOWN_TABS, sub, 'data-tsub')}${body(app, id, lookups)}`;
}

function overviewHtml(app, id, lookups) {
  const { world, state } = app;
  const s = state.settlements[id];
  return `
    <div data-part="accounts">${accountsHtml(state, id)}<p class="sub">Produces ${escapeHtml(lookups.goods[s.production]?.name?.toLowerCase() ?? s.production)}.</p></div>
    <div data-part="stores">${storesHtml(world, state, id)}</div>
    <div data-part="works">${worksHtml(world, state, id)}</div>
    <div data-part="trade">${world.trade ? settlementTradeHtml(world, state, id) : ''}</div>`;
}

function storesHtml(world, state, id) {
  const s = state.settlements[id];
  const season = seasonOf(state.day);
  const need = foodNeed(world, s, season);
  const grown = foodYield(world, id, s, dateOf(state.day).month);
  const days = need > 0 ? s.stock.food / need : Infinity;
  const cap = foodCapacity(world, s);
  let note = '';
  if (s.hunger > 0.05) note = '<p class="warn">The stores are empty. People are going hungry.</p>';
  else if (days < 30) note = '<p class="warn">Less than a month of food left.</p>';
  const made = goodsYield(world, id, s);
  return `
    <h3>Stores</h3>
    <dl class="stats">
      <div><dt>${icon('wheat')} Food</dt><dd>${number(s.stock.food)} <small>of ${number(cap)}</small></dd></div>
      <div><dt>Lasts</dt><dd>${Number.isFinite(days) ? `${number(days)} days` : 'For ever'}</dd></div>
      <div><dt>Grown a day</dt><dd>${grown.toFixed(1)}</dd></div>
      <div><dt>Eaten a day</dt><dd>${need.toFixed(1)}</dd></div>
      <div><dt>Timber, stone, iron</dt><dd>${['timber', 'stone', 'iron'].map((g) => number(s.stock[g])).join(' / ')}</dd></div>
      ${made ? `<div><dt>${cap1(s.production)} a day</dt><dd>${made.toFixed(1)}</dd></div>` : ''}
    </dl>
    ${note}
  `;
}

// What the place earned the crown last month (its taxes, trade, crafts,
// goods and tolls) and what it cost (its garrison and upkeep).
function accountsHtml(state, id) {
  const p = state.ledger.places?.[id];
  if (!p) return '';
  const net = p.in - p.out;
  return `<p class="sub accounts">Last month this place earned the crown ${number(p.in)} crowns and cost it ${number(p.out)}: <b class="${net < 0 ? 'neg' : 'pos'}">${net < 0 ? 'a loss of ' : 'a gain of '}${number(Math.abs(net))}</b>.</p>`;
}

function construction(world, s) {
  if (!s.construction) return '';
  const b = world.buildings[s.construction.building];
  const done = 1 - s.construction.daysLeft / s.construction.days;
  return `<div class="gauge-row"><div class="lbl"><span>Raising: ${escapeHtml(b.name)}</span><span>${s.construction.daysLeft} days</span></div>
    <div class="gauge"><span style="width:${Math.round(done * 100)}%"></span></div></div>`;
}

function worksHtml(world, state, id) {
  const s = state.settlements[id];
  const note = (b) => {
    if (b === 'tollbridge' && world.industry) {
      const t = tollsAt(state, world, id);
      return ` (${number(t.caravans)} caravans a month, ${number(t.value)})`;
    }
    const g = goodOf(world, b);
    return g ? ` (${escapeHtml(world.industry.goods[g].name.toLowerCase())})` : '';
  };
  const built = s.buildings.map((b) => `<span class="fig">${escapeHtml(world.buildings[b].name)}${note(b)}</span>`).join('');
  return `<h3>Buildings</h3>${built ? `<div class="figs">${built}</div>` : '<p class="sub">Nothing raised by the crown here yet.</p>'}${construction(world, s)}`;
}

function costText(b) {
  return Object.entries(b.cost).map(([k, v]) => (k === 'coin' ? `${v} crowns` : `${v} ${k}`)).join(', ');
}

function buildTabHtml(app, id) {
  const { world, state, memory } = app;
  const s = state.settlements[id];
  const route = `town:${id}`;
  if (s.occupier) return '<div data-part="build"><p class="sub">The enemy holds it. Nothing can be built for the crown here.</p></div>';
  const options = Object.entries(world.buildings)
    .map(([bid, b]) => ({ bid, b, check: canBuild(state, world, id, bid) }))
    .filter((o) => !o.check.hidden);
  const possible = options.filter((o) => o.check.ok || LATER.test(o.check.reason));
  const never = options.filter((o) => !possible.includes(o));
  const rows = possible.map(({ bid, b, check }) => {
    const open = isOpen(memory, route, `b:${bid}`);
    const row = `<button type="button" class="row${open ? ' open' : ''}${check.ok ? '' : ' off'}" data-expand="b:${bid}" data-build-row="${bid}" aria-expanded="${open}">
      ${icon('hammer')}<span class="row-main"><span class="row-name">${escapeHtml(b.name)}</span></span><span class="row-end">${escapeHtml(costText(b))}</span></button>`;
    if (!open) return row;
    const status = check.ok ? `${b.days} days${check.borrow ? ', borrowed from the bankers' : ''}.` : check.reason;
    return `${row}<div class="row-detail"><p>${escapeHtml(b.blurb)}</p>
      <button type="button" class="act primary wide" data-build="${bid}" ${orderAttr({ type: 'build', settlement: id, building: bid })} ${check.ok ? '' : 'disabled'}><span class="act-label">Build ${escapeHtml(b.name.toLowerCase())}</span><span class="act-sub">${escapeHtml(costText(b))}. ${escapeHtml(status)}</span></button></div>`;
  }).join('');
  const neverRows = never.map(({ b, check }) => `<div class="row off"><span class="row-main"><span class="row-name">${escapeHtml(b.name)}</span><span class="row-sub">${escapeHtml(check.reason)}</span></span></div>`).join('');
  const room = world.buildingSlots?.[world.byId[id].type] ?? 99;
  const built = s.buildings.map((b) => `<span class="fig">${escapeHtml(world.buildings[b].name)}</span>`).join('');
  return `
    <div data-part="built"><p class="sub">${s.buildings.length} of ${room} buildings.${s.construction ? '' : ' Tap one to see it and order it.'}</p>${built ? `<div class="figs">${built}</div>` : ''}${construction(world, s)}</div>
    <div data-part="options">${s.construction ? '<p class="sub">The workers here are busy. Another building can be ordered once this one is finished.</p>' : ''}${rows ? `<div class="rows">${rows}</div>` : '<p class="sub">Nothing more can be raised here.</p>'}</div>
    ${section(memory, route, 'never', 'Not possible here', neverRows ? `<div class="rows">${neverRows}</div>` : '', { count: never.length })}`;
}

function militaryTabHtml(app, id) {
  const { world, state } = app;
  return `
    <div data-part="defence">${defenceHtml(world, state, id)}</div>
    <div data-part="companies">${settlementForcesHtml(world, state, id)}</div>`;
}

function peopleHtml(app, id, data) {
  const { world, state } = app;
  const s = state.settlements[id];
  const pop = totalPopulation(s);
  return `
    <div data-part="peoples">
      <h3>Peoples</h3>
      ${mix(s.population, data.peoples, PEOPLE_COLOURS, (v) => number(v), pop)}
      <h3>Faith</h3>
      ${mix(s.faith, data.faiths, FAITH_COLOURS, (v) => `${Math.round(v)}%`, 100, 'short')}
      ${gaugeHtml('Prosperity', s.prosperity, describeLevel(s.prosperity, PROSPERITY_WORDS), false)}
      ${gaugeHtml('Unrest', s.unrest, describeLevel(s.unrest, UNREST_WORDS), true)}
      ${tensionWeight(world, s) > 0 ? gaugeHtml('Tension between peoples', s.tension, describeLevel(s.tension, TENSION_WORDS), true) : ''}
    </div>`;
}

const cap1 = (w) => w[0].toUpperCase() + w.slice(1);
