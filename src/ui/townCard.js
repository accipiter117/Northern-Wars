// A town's card: a summary head (population, prosperity, unrest, holder,
// garrison) and the actions most often wanted, then four tabs. Works (M20)
// shows the place's spaces, what stands in each and how well, with the
// crown's repairs; the crown no longer builds.
import {
  totalPopulation, foodNeed, foodYield, goodsYield, foodCapacity, seasonOf, dateOf, tensionWeight, routeEndOk,
} from '../sim/index.js';
import { mixHtml as mix, gaugeHtml, FAITH_COLOURS, PEOPLE_COLOURS, TENSION_WORDS } from './faith.js';
import { defenceHtml, statusBadges } from './military.js';
import { occupationHtml, siegeNote } from './war.js';
import { conquestTownHtml } from './conquest.js';
import { settlementTradeHtml } from './trade.js';
import { settlementForcesHtml } from './forces.js';
import { number, escapeHtml, describeLevel } from './format.js';
import { icon } from './icons.js';
import { cardHead, segs } from './card.js';
import { worksTabHtml, worksPipsHtml, landTags } from './works.js';

const TYPE_NAMES = { city: 'City', town: 'Town', village: 'Village', castle: 'Castle', temple: 'Temple' };
const TERRAIN_NAMES = { open: 'open farmland', marsh: 'marshland', forest: 'woodland', hills: 'hill country', mountains: 'the mountain foothills' };
const PROSPERITY_WORDS = ['Destitute', 'Poor', 'Getting by', 'Comfortable', 'Thriving'];
const UNREST_WORDS = ['Quiet', 'Grumbling', 'Restless', 'Angry', 'On the brink'];
export const TOWN_TABS = [['overview', 'Overview'], ['works', 'Works'], ['military', 'Military'], ['people', 'People']];

export function townCard(app, id) {
  const { world, state, lookups, memory } = app;
  const geo = world.byId[id];
  const s = state.settlements[id];
  const sub = memory.sub.town ?? 'overview';
  const capital = id === world.kingdom.capital;
  const holder = s.holder === 'crown' || !world.houses.houses[s.holder] ? null : s.holder;
  const what = `${capital ? `${TYPE_NAMES[geo.type]}, seat of the crown` : TYPE_NAMES[geo.type]}, in ${TERRAIN_NAMES[world.terrainOf[id]]}`;
  // Since M21 the crown trades by deals with partners, not routes by hand.
  const trade = !s.occupier && world.trade && !world.market && routeEndOk(state, world, id).ok;
  const actions = s.occupier ? '' : [
    world.forces ? `<button type="button" class="act" data-tsub="military" data-recruit-here><span class="act-label">${icon('sword')} Recruit here</span></button>` : '',
    trade ? `<button type="button" class="act" data-route-from="${id}" data-pick-start='{"kind":"route","from":"${id}"}'><span class="act-label">${icon('scroll')} Trade route from here</span></button>` : '',
  ].join('');
  const head = cardHead({
    status: `<span>${what}. ${statusBadges(state, id)}</span>${world.spaces ? `<span class="tags" data-part="land">${landTags(world, state, id)}</span>` : ''}`,
    chips: [
      { icon: 'people', label: 'Population', value: number(totalPopulation(s)) },
      { icon: 'sun', label: 'Prosperity', value: describeLevel(s.prosperity, PROSPERITY_WORDS), tone: s.prosperity < 30 ? 'bad' : s.prosperity >= 70 ? 'good' : '' },
      { icon: 'flame', label: 'Unrest', value: describeLevel(s.unrest, UNREST_WORDS), tone: s.unrest >= 50 ? 'bad' : '' },
      holder ? { icon: 'crown', label: 'Holder', value: escapeHtml(world.houses.houses[holder].name), go: `house:${holder}` } : { icon: 'crown', label: 'Holder', value: 'Crown demesne' },
      { icon: 'shield', label: 'Garrison', value: s.garrison ? `${number(s.garrison)}${state.unpaid ? ' unpaid' : ''}` : 'None', tone: state.unpaid ? 'bad' : '' },
    ],
    extra: (world.war ? occupationHtml(world, state, id) + siegeNote(world, state, id) : '') + conquestTownHtml(world, state, id)
      + (s.troubled > 0 ? '<p class="warn">Riots or raiders have struck here lately. Some folk are leaving.</p>' : ''),
    actions,
  });
  const body = { overview: overviewHtml, works: worksTabHtml, military: militaryTabHtml, people: peopleHtml }[sub] ?? overviewHtml;
  return `${head}${segs(TOWN_TABS, sub, 'data-tsub')}${body(app, id, lookups)}`;
}

function overviewHtml(app, id, lookups) {
  const { world, state } = app;
  const s = state.settlements[id];
  return `
    <div data-part="accounts">${accountsHtml(state, id)}<p class="sub">Produces ${escapeHtml(lookups.goods[s.production]?.name?.toLowerCase() ?? s.production)}.</p></div>
    <div data-part="stores">${storesHtml(world, state, id)}</div>
    <div data-part="works">${worksPipsHtml(world, state, id)}</div>
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
