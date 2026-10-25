import { threatLevel, localStrength, patrolledSet, crownSoldiers, canSetGarrison, eventText, plagueActive, quarantined } from '../sim/index.js';
import { number, escapeHtml, describeLevel } from './format.js';
import { gaugeHtml, decisionHtml } from './faith.js';

const THREAT_WORDS = ['Safe', 'Watchful', 'Dangerous', 'Perilous', 'Lawless'];

export function militaryHtml(world, state) {
  const patrolled = patrolledSet(state, world);
  const last = state.ledger.history.at(-1);
  const danger = Object.keys(state.settlements)
    .map((id) => ({ id, b: threatLevel(state, world, id, 'bandits', patrolled), m: threatLevel(state, world, id, 'monsters', patrolled) }))
    .sort((a, b) => Math.max(b.b, b.m) - Math.max(a.b, a.m))
    .slice(0, 6)
    .map(({ id, b, m }) => `<button type="button" class="law-head realm-row" data-place="${id}">
      <span class="build-name">${escapeHtml(world.byId[id].name)} ${statusBadges(state, id)}</span>
      <span class="law-now">${number(state.settlements[id].garrison)} soldiers, strength ${number(localStrength(state, world, id))}${patrolled.has(id) ? ', patrolled' : ''}.</span>
      ${gaugeHtml('Bandits', b, describeLevel(b, THREAT_WORDS), true)}${gaugeHtml('Monsters', m, describeLevel(m, THREAT_WORDS), true)}</button>`).join('');
  return `
    <div data-part="head"><h2>Garrisons and danger</h2>
      <div class="menu-list"><button type="button" data-action="back">Back to the realm</button><button type="button" data-action="forces">The crown's companies and threats</button></div>
      <dl class="stats">
        <div><dt>Garrison soldiers</dt><dd>${number(crownSoldiers(state))}</dd></div>
        <div><dt>Their pay</dt><dd>${last ? `${number(last.expenses.garrisons)} a month` : 'Not yet reckoned'}</dd></div>
      </dl>
      <p class="sub">Garrisons defend their own town and nothing else. Set how strongly each crown settlement is held from its card. The danger below is what breeds bandit camps and monster lairs in the wilds nearby: companies patrolling the roads keep the bandits down, and witcher contracts the beasts.</p>
    </div>
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
    <p class="sub">Strength ${number(localStrength(state, world, id))}${s.buildings.includes('walls') ? ', behind walls' : ''}${patrolled.has(id) ? ', on a patrolled road' : ''}.</p>
    ${levels ? `<p class="sub">How strongly the crown holds it:</p>${levels}` : ''}
  `;
}

export function eventHtml(world, pending) {
  const t = eventText(world, pending);
  return decisionHtml(`News from ${t.place}`, t.title, t.text, t.choices);
}
