import { threatLevel, localStrength, patrolledSet, patrolRoute, patrolCapacity, patrolCost, crownSoldiers, canSetGarrison, eventText, plagueActive, quarantined } from '../sim/index.js';
import { number, escapeHtml, describeLevel } from './format.js';
import { gaugeHtml, decisionHtml } from './faith.js';

const THREAT_WORDS = ['Safe', 'Watchful', 'Dangerous', 'Perilous', 'Lawless'];

export function militaryHtml(world, state, pick = {}) {
  const patrolled = patrolledSet(state, world);
  const cap = patrolCapacity(state, world);
  const last = state.ledger.history.at(-1);
  const patrols = state.patrols.map((p) => {
    const route = patrolRoute(world, p).map((id) => world.byId[id].name).join(', ');
    return `<div class="law-option current"><span class="build-name">${escapeHtml(world.byId[p.from].name)} to ${escapeHtml(world.byId[p.to].name)}</span>
      <span class="build-cost">Covers ${escapeHtml(route)}. ${number(patrolCost(state, world, p))} crowns a month.</span>
      <button type="button" class="chip" data-unpatrol="${p.id}">Recall</button></div>`;
  }).join('');
  const options = world.geography.settlements.slice().sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
  const sel = (name, val) => `<select class="pick" data-pick="${name}" aria-label="${name}">${options.replace(`value="${val}"`, `value="${val}" selected`)}</select>`;
  const danger = Object.keys(state.settlements)
    .map((id) => ({ id, b: threatLevel(state, world, id, 'bandits', patrolled), m: threatLevel(state, world, id, 'monsters', patrolled) }))
    .sort((a, b) => Math.max(b.b, b.m) - Math.max(a.b, a.m))
    .slice(0, 6)
    .map(({ id, b, m }) => `<button type="button" class="law-head realm-row" data-place="${id}">
      <span class="build-name">${escapeHtml(world.byId[id].name)} ${statusBadges(state, id)}</span>
      <span class="law-now">${number(state.settlements[id].garrison)} soldiers, strength ${number(localStrength(state, world, id, patrolled))}${patrolled.has(id) ? ', patrolled' : ''}.</span>
      ${gaugeHtml('Bandits', b, describeLevel(b, THREAT_WORDS), true)}${gaugeHtml('Monsters', m, describeLevel(m, THREAT_WORDS), true)}</button>`).join('');
  return `
    <div data-part="head"><h2>Military and threats</h2>
      <div class="menu-list"><button type="button" data-action="back">Back to the realm</button></div>
      <dl class="stats">
        <div><dt>Crown soldiers</dt><dd>${number(crownSoldiers(state))}</dd></div>
        <div><dt>Their pay</dt><dd>${last ? `${number(last.expenses.garrisons)} a month` : 'Not yet reckoned'}</dd></div>
        <div><dt>Patrols</dt><dd>${state.patrols.length} of ${cap}</dd></div>
        <div><dt>Patrols cost</dt><dd>${number(state.patrols.reduce((a, p) => a + patrolCost(state, world, p), 0))} a month</dd></div>
      </dl>
      <p class="sub">Set how strongly each crown settlement is held from its card. Every ${world.military.patrol.soldiersPer} crown soldiers can spare men for one patrol. A patrol costs by the length of road it rides; horse studs make it cheaper.</p>
    </div>
    <div data-part="patrols"><h3>Patrols on the roads</h3>${patrols || '<p class="sub">None yet.</p>'}
      <div class="patrol-order">${sel('from', pick.from ?? 'vizima')}<span>to</span>${sel('to', pick.to ?? 'gors_velen')}
      <button type="button" class="build" data-order-patrol><span class="build-name">Order a patrol</span>
      <span class="build-cost">About ${number(patrolCost(state, world, { from: pick.from ?? 'vizima', to: pick.to ?? 'gors_velen' }))} crowns a month.</span></button></div></div>
    <div data-part="danger"><h3>Where danger lies</h3><div class="realm-list">${danger}</div></div>
  `;
}

export function statusBadges(state, id) {
  const s = state.settlements[id];
  const out = [];
  if (plagueActive(state, s)) out.push(`<span class="badge bad">Plague${quarantined(state, s) ? ', quarantined' : ''}</span>`);
  if ((s.raided ?? 0) > state.day) out.push(`<span class="badge bad">${s.raidKind === 'monsters' ? 'Beast attacks' : 'Raided'}</span>`);
  return out.join(' ');
}

// The settlement card's defence section.
export function defenceHtml(world, state, id) {
  const s = state.settlements[id];
  const patrolled = patrolledSet(state, world);
  const b = threatLevel(state, world, id, 'bandits', patrolled);
  const m = threatLevel(state, world, id, 'monsters', patrolled);
  let levels = '';
  if (s.holder === 'crown' && world.settlementData[id].garrison) {
    const current = state.garrisonLevel[id] ?? 'standard';
    levels = `<div class="chips">${Object.entries(world.military.garrisonLevels).map(([lid, l]) => {
      const check = canSetGarrison(state, world, id, lid);
      return `<button type="button" class="chip${lid === current ? ' on' : ''}" data-garrison="${lid}" ${check.ok ? '' : 'disabled'} aria-pressed="${lid === current}">${l.name}</button>`;
    }).join(' ')}</div>`;
  }
  return `
    <h3>Defence ${statusBadges(state, id)}</h3>
    ${gaugeHtml('Bandits', b, describeLevel(b, THREAT_WORDS), true)}
    ${gaugeHtml('Monsters', m, describeLevel(m, THREAT_WORDS), true)}
    <p class="sub">Strength ${number(localStrength(state, world, id, patrolled))}${s.buildings.includes('walls') ? ', behind walls' : ''}${patrolled.has(id) ? ', on a patrolled road' : ''}.</p>
    ${levels ? `<p class="sub">How strongly the crown holds it:</p>${levels}` : ''}
  `;
}

export function eventHtml(world, pending) {
  const t = eventText(world, pending);
  return decisionHtml(`News from ${t.place}`, t.title, t.text, t.choices);
}
