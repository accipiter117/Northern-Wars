import { formatDate, totalPopulation } from '../sim/index.js';
import { number, escapeHtml } from './format.js';

export function realmMenuHtml(world, state, hasSave) {
  let people = 0;
  let soldiers = 0;
  for (const s of Object.values(state.settlements)) {
    people += totalPopulation(s);
    soldiers += s.garrison;
  }
  return `
    <h2>The Realm of ${escapeHtml(world.kingdom.name)}</h2>
    <p class="sub">${number(people)} souls in ${world.geography.settlements.length} settlements, ${number(soldiers)} under arms.</p>
    <div class="menu-list">
      <button type="button" data-action="chronicle">Chronicle<small>Dispatches from across the realm</small></button>
      <button type="button" data-action="save">Save now<small>Also saved at the start of every month</small></button>
      <button type="button" data-action="load" ${hasSave ? '' : 'disabled'}>Load last save</button>
      <button type="button" data-action="export">Export save<small>Download the reign as a file</small></button>
      <button type="button" data-action="import">Import save<small>Continue a reign from a file</small></button>
      <button type="button" data-action="new" class="danger">Start a new reign</button>
    </div>
    <h3>Coming in later milestones</h3>
    <p class="sub">Laws, Faith and Peoples, Nobles, Military.</p>
  `;
}

export function chronicleHtml(state) {
  const items = state.chronicle.slice().reverse().map((d) =>
    `<li><time>${formatDate(d.day)}</time>${escapeHtml(d.text)}</li>`).join('');
  return `
    <h2>Chronicle</h2>
    <div class="menu-list"><button type="button" data-action="back">Back to the realm</button></div>
    <ul class="chronicle">${items || '<li>Nothing of note yet.</li>'}</ul>
  `;
}
