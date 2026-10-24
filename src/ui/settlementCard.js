import { totalPopulation, foodNeed, foodYield, goodsYield, foodCapacity, canBuild, seasonOf, dateOf, tensionWeight } from '../sim/index.js';
import { mixHtml as mix, gaugeHtml, FAITH_COLOURS, PEOPLE_COLOURS, TENSION_WORDS } from './faith.js';
import { number, escapeHtml, describeLevel } from './format.js';

const TYPE_NAMES = { city: 'City', town: 'Town', village: 'Village', castle: 'Castle', temple: 'Temple' };
const TERRAIN_NAMES = { open: 'open farmland', marsh: 'marshland', forest: 'woodland', hills: 'hill country', mountains: 'the mountain foothills' };
const PROSPERITY_WORDS = ['Destitute', 'Poor', 'Getting by', 'Comfortable', 'Thriving'];
const UNREST_WORDS = ['Quiet', 'Grumbling', 'Restless', 'Angry', 'On the brink'];

// The card is split into parts so a daily refresh only replaces what changed,
// and a finger halfway through pressing a button does not lose it.
export function settlementCardHtml(world, state, id, data) {
  const geo = world.byId[id];
  const s = state.settlements[id];
  const pop = totalPopulation(s);
  const capital = id === world.kingdom.capital;
  const holder = s.holder === 'crown' ? 'Crown demesne' : escapeHtml(s.holder);
  const sub = `${capital ? `${TYPE_NAMES[geo.type]}, seat of the crown of ${escapeHtml(world.kingdom.name)}` : TYPE_NAMES[geo.type]}, in ${TERRAIN_NAMES[world.terrainOf[id]]}`;

  return `
    <div data-part="head">
      <h2>${escapeHtml(geo.name)}</h2>
      <p class="sub">${sub}</p>
    </div>
    <div data-part="stats">
      <dl class="stats">
        <div><dt>Population</dt><dd>${number(pop)}</dd></div>
        <div><dt>Holder</dt><dd>${holder}</dd></div>
        <div><dt>Produces</dt><dd>${escapeHtml(data.goods[s.production]?.name ?? s.production)}</dd></div>
        <div><dt>Garrison</dt><dd>${s.garrison ? `${number(s.garrison)}${state.unpaid ? ' <small>unpaid</small>' : ''}` : 'None'}</dd></div>
      </dl>
      ${gaugeHtml('Prosperity', s.prosperity, describeLevel(s.prosperity, PROSPERITY_WORDS), false)}
      ${gaugeHtml('Unrest', s.unrest, describeLevel(s.unrest, UNREST_WORDS), true)}
      ${tensionWeight(world, s) > 0 ? gaugeHtml('Tension between peoples', s.tension, describeLevel(s.tension, TENSION_WORDS), true) : ''}
      ${s.troubled > 0 ? '<p class="warn">Riots or raiders have struck here lately. Some folk are leaving.</p>' : ''}
    </div>
    <div data-part="stores">${storesHtml(world, state, id)}</div>
    <div data-part="works">${worksHtml(world, s)}</div>
    <div data-part="build">${buildHtml(world, state, id)}</div>
    <div data-part="peoples">
      <h3>Peoples</h3>
      ${mix(s.population, data.peoples, PEOPLE_COLOURS, (v) => number(v), pop)}
      <h3>Faith</h3>
      ${mix(s.faith, data.faiths, FAITH_COLOURS, (v) => `${Math.round(v)}%`, 100, 'short')}
    </div>
  `;
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
  const goods = ['timber', 'stone', 'iron'].map((g) => `<div><dt>${cap1(g)}</dt><dd>${number(s.stock[g])}</dd></div>`).join('');
  const made = goodsYield(world, id, s);
  return `
    <h3>Stores</h3>
    <dl class="stats">
      <div><dt>Food</dt><dd>${number(s.stock.food)} <small>of ${number(cap)}</small></dd></div>
      <div><dt>Lasts</dt><dd>${Number.isFinite(days) ? `${number(days)} days` : 'For ever'}</dd></div>
      <div><dt>Grown a day</dt><dd>${grown.toFixed(1)}</dd></div>
      <div><dt>Eaten a day</dt><dd>${need.toFixed(1)}</dd></div>
      ${goods}
      ${made ? `<div><dt>${cap1(s.production)} a day</dt><dd>${made.toFixed(1)}</dd></div>` : ''}
    </dl>
    ${note}
  `;
}

function worksHtml(world, s) {
  const built = s.buildings.map((b) => `<li>${escapeHtml(world.buildings[b].name)}</li>`).join('');
  let doing = '';
  if (s.construction) {
    const b = world.buildings[s.construction.building];
    const done = 1 - s.construction.daysLeft / s.construction.days;
    doing = `<div class="gauge-row"><div class="lbl"><span>Raising: ${escapeHtml(b.name)}</span><span>${s.construction.daysLeft} days</span></div>
      <div class="gauge"><span style="width:${Math.round(done * 100)}%"></span></div></div>`;
  }
  return `<h3>Buildings</h3>${built ? `<ul class="built">${built}</ul>` : '<p class="sub">Nothing raised by the crown here yet.</p>'}${doing}`;
}

function buildHtml(world, state, id) {
  if (state.settlements[id].construction) {
    return '<p class="sub">The workers here are busy. Another building can be ordered once this one is finished.</p>';
  }
  const options = Object.entries(world.buildings)
    .map(([bid, b]) => ({ bid, b, check: canBuild(state, world, id, bid) }))
    .filter((o) => !o.check.hidden);
  if (!options.length) return '';
  const rows = options.map(({ bid, b, check }) => {
    const cost = Object.entries(b.cost).map(([k, v]) => (k === 'coin' ? `${v} crowns` : `${v} ${k}`)).join(', ');
    const status = check.ok ? (check.borrow ? `${b.days} days, borrowed from the bankers.` : `${b.days} days.`) : check.reason;
    return `<button type="button" class="build" data-build="${bid}" ${check.ok ? '' : 'disabled'}>
      <span class="build-name">${escapeHtml(b.name)}</span>
      <span class="build-blurb">${escapeHtml(b.blurb)}</span>
      <span class="build-cost">${cost}. ${escapeHtml(status)}</span>
    </button>`;
  }).join('');
  return `<h3>Raise a building</h3><div class="build-list">${rows}</div>`;
}

const cap1 = (w) => w[0].toUpperCase() + w.slice(1);
