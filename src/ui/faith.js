import { realmFaith, tensionWeight, totalPopulation, petitionText, formatDate } from '../sim/index.js';
import { number, escapeHtml, describeLevel } from './format.js';

export const FAITH_COLOURS = { eternal_fire: '#c0582c', melitele: '#d9c27a', old_ways: '#5f7d4c' };
export const PEOPLE_COLOURS = { human: '#c9b48a', dwarf: '#9a6a3a', elf: '#6f9a5a', halfling: '#d28c4a' };
export const TENSION_WORDS = ['Calm', 'Uneasy', 'Strained', 'Bitter', 'Boiling'];
const SYMPATHY_WORDS = ['Scarcely a whisper', 'Muttering', 'Open sympathy', 'Many in the woods', 'A rising'];

export function mixHtml(values, names, colours, fmt, total, nameKey = 'name') {
  const entries = Object.entries(values).filter(([, v]) => v > 0);
  const bar = entries.map(([k, v]) => `<span style="width:${(v / total) * 100}%;background:${colours[k]}"></span>`).join('');
  const legend = entries.map(([k, v]) =>
    `<li><i style="background:${colours[k]}"></i>${escapeHtml(names[k]?.[nameKey] ?? k)}<b>${fmt(v)}</b></li>`).join('');
  return `<div class="mix">${bar}</div><ul class="legend">${legend}</ul>`;
}

export function gaugeHtml(label, value, word, bad) {
  return `<div class="gauge-row"><div class="lbl"><span>${label}</span><span>${word}</span></div>
    <div class="gauge${bad ? ' bad' : ''}"><span style="width:${Math.round(value)}%"></span></div></div>`;
}

export function faithHtml(world, state, lookups) {
  const faith = realmFaith(state);
  const peoples = { human: 0, dwarf: 0, elf: 0, halfling: 0 };
  let pop = 0;
  for (const s of Object.values(state.settlements)) {
    pop += totalPopulation(s);
    for (const p of Object.keys(peoples)) peoples[p] += s.population[p];
  }
  const tense = Object.entries(state.settlements)
    .filter(([, s]) => tensionWeight(world, s) > 0)
    .sort((a, b) => b[1].tension - a[1].tension)
    .slice(0, 6)
    .map(([id, s]) => `<button type="button" class="law-head realm-row" data-place="${id}">
      <span class="build-name">${escapeHtml(world.byId[id].name)}${s.troubled > 0 ? ' <span class="down">(riot-struck)</span>' : ''}</span>
      ${gaugeHtml('Tension', s.tension, describeLevel(s.tension, TENSION_WORDS), true)}</button>`).join('');
  const waiting = state.petitions.map((p) => {
    const t = petitionText(world, p);
    return `<button type="button" class="build" data-petition="${p.id}"><span class="build-name">${escapeHtml(t.title)}</span>
      <span class="build-cost">From ${escapeHtml(t.place)}, waiting since ${formatDate(p.day)}</span></button>`;
  }).join('');
  return `
    <div data-part="head"><h2>Faith and peoples</h2>
      <div class="menu-list"><button type="button" data-action="back">Back to the realm</button></div></div>
    <div data-part="petitions">${waiting ? `<h3>Petitions waiting</h3><div class="build-list">${waiting}</div>` : ''}</div>
    <div data-part="faith"><h3>Faith across the realm</h3>${mixHtml(faith, lookups.faiths, FAITH_COLOURS, (v) => `${Math.round(v)}%`, 100, 'short')}</div>
    <div data-part="peoples"><h3>The peoples</h3>${mixHtml(peoples, lookups.peoples, PEOPLE_COLOURS, (v) => number(v), pop)}</div>
    <div data-part="sympathy"><h3>The Scoia'tael</h3>
      ${gaugeHtml("Sympathy among the elves", state.sympathy, describeLevel(state.sympathy, SYMPATHY_WORDS), true)}
      <p class="sub">Grows when the elves are wronged. Above three in five, commandos strike on the roads near the forests.</p></div>
    <div data-part="tense"><h3>Where tempers run high</h3><div class="realm-list">${tense || '<p class="sub">Nowhere yet.</p>'}</div></div>
  `;
}

// One card layout for every decision that waits on the crown: envoys from
// abroad and petitions from home.
export function decisionHtml(kicker, title, text, choices) {
  const buttons = choices.map((label, i) => `<button type="button" class="build" data-choice="${i}"><span class="build-name">${escapeHtml(label)}</span></button>`).join('');
  return `
    <p class="sub envoy-from">${escapeHtml(kicker)}</p>
    <h2>${escapeHtml(title)}</h2>
    <p>${escapeHtml(text)}</p>
    <div class="build-list">${buttons}</div>
    <p class="sub">Leave it unanswered and the cautious choice will be made for you in time.</p>
  `;
}

export function petitionHtml(world, pending) {
  const t = petitionText(world, pending);
  return decisionHtml(`A petition from ${t.place}`, t.title, t.text, t.choices);
}
