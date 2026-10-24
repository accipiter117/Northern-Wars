import { totalPopulation } from '../sim/index.js';
import { number, escapeHtml, describeLevel } from './format.js';

const TYPE_NAMES = { city: 'City', town: 'Town', village: 'Village', castle: 'Castle', temple: 'Temple' };
const PEOPLE_COLOURS = { human: '#c9b48a', dwarf: '#9a6a3a', elf: '#6f9a5a', halfling: '#d28c4a' };
const FAITH_COLOURS = { eternal_fire: '#c0582c', melitele: '#d9c27a', old_ways: '#5f7d4c' };
const PROSPERITY_WORDS = ['Destitute', 'Poor', 'Getting by', 'Comfortable', 'Thriving'];
const UNREST_WORDS = ['Quiet', 'Grumbling', 'Restless', 'Angry', 'On the brink'];

export function settlementCardHtml(world, state, id, data) {
  const geo = world.byId[id];
  const s = state.settlements[id];
  const pop = totalPopulation(s);
  const capital = id === world.kingdom.capital;
  const holder = s.holder === 'crown' ? 'Crown demesne' : escapeHtml(s.holder);
  const sub = capital ? `${TYPE_NAMES[geo.type]}, seat of the crown of ${escapeHtml(world.kingdom.name)}` : TYPE_NAMES[geo.type];

  return `
    <h2>${escapeHtml(geo.name)}</h2>
    <p class="sub">${sub}</p>
    <dl class="stats">
      <div><dt>Population</dt><dd>${number(pop)}</dd></div>
      <div><dt>Holder</dt><dd>${holder}</dd></div>
      <div><dt>Produces</dt><dd>${escapeHtml(data.goods[s.production]?.name ?? s.production)}</dd></div>
      <div><dt>Garrison</dt><dd>${s.garrison ? number(s.garrison) : 'None'}</dd></div>
    </dl>
    ${gauge('Prosperity', s.prosperity, describeLevel(s.prosperity, PROSPERITY_WORDS), false)}
    ${gauge('Unrest', s.unrest, describeLevel(s.unrest, UNREST_WORDS), true)}
    <h3>Peoples</h3>
    ${mix(s.population, data.peoples, PEOPLE_COLOURS, (v) => number(v), pop)}
    <h3>Faith</h3>
    ${mix(s.faith, data.faiths, FAITH_COLOURS, (v) => `${Math.round(v)}%`, 100, 'short')}
    <h3>Buildings</h3>
    <p class="sub">Nothing raised by the crown here yet.</p>
  `;
}

function gauge(label, value, word, bad) {
  return `<div class="gauge-row">
    <div class="lbl"><span>${label}</span><span>${word}</span></div>
    <div class="gauge${bad ? ' bad' : ''}"><span style="width:${Math.round(value)}%"></span></div>
  </div>`;
}

function mix(values, names, colours, fmt, total, nameKey = 'name') {
  const entries = Object.entries(values).filter(([, v]) => v > 0);
  const bar = entries.map(([k, v]) => `<span style="width:${(v / total) * 100}%;background:${colours[k]}"></span>`).join('');
  const legend = entries.map(([k, v]) =>
    `<li><i style="background:${colours[k]}"></i>${escapeHtml(names[k]?.[nameKey] ?? k)}<b>${fmt(v)}</b></li>`).join('');
  return `<div class="mix">${bar}</div><ul class="legend">${legend}</ul>`;
}
