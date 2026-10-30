import {
  threatLevel, localStrength, patrolledSet, crownSoldiers, canSetGarrison, plagueActive, quarantined, garrisonCompanies, placeMuster, freeCompanies, crownArmies, canMuster,
} from '../sim/index.js';
import { icon } from './icons.js';
import { number, escapeHtml, describeLevel } from './format.js';
import { gaugeHtml } from './faith.js';
import { cardHead, orderAttr } from './card.js';

const THREAT_WORDS = ['Safe', 'Watchful', 'Dangerous', 'Perilous', 'Lawless'];

// Garrisons and danger: what the garrisons cost, and where bandits and beasts
// breed in the wilds.
export function garrisonsHtml(app) {
  const { world, state } = app;
  const patrolled = patrolledSet(state, world);
  const last = state.ledger.history.at(-1);
  const danger = Object.keys(state.settlements)
    .map((id) => ({ id, b: threatLevel(state, world, id, 'bandits', patrolled), m: threatLevel(state, world, id, 'monsters', patrolled) }))
    .sort((a, b) => Math.max(b.b, b.m) - Math.max(a.b, a.m))
    .slice(0, 6)
    .map(({ id, b, m }) => `<button type="button" class="row realm-row" data-place="${id}" data-go="town:${id}">
      <span class="row-main"><span class="row-name">${escapeHtml(world.byId[id].name)} ${statusBadges(state, id)}</span>
      <span class="row-sub">${number(state.settlements[id].garrison)} soldiers${patrolled.has(id) ? ', patrolled' : ''}. Bandits ${describeLevel(b, THREAT_WORDS).toLowerCase()}, beasts ${describeLevel(m, THREAT_WORDS).toLowerCase()}.</span></span></button>`).join('');
  return `
    ${cardHead({
      status: '<span>Garrisons defend their own town and nothing else. Set each from its card, under Military.</span>',
      infoText: 'The danger below is what breeds bandit camps and monster lairs in the wilds nearby: companies patrolling the roads keep the bandits down, and witcher contracts the beasts.',
      chips: [
        { icon: 'shield', label: 'Garrison soldiers', value: number(crownSoldiers(state)) },
        { icon: 'coin', label: 'Their pay', value: last ? `${number(last.expenses.garrisons)} a month` : 'Not yet reckoned' },
      ],
    })}
    <div data-part="danger"><h3>Where danger lies</h3><div class="rows">${danger}</div></div>
  `;
}

export function statusBadges(state, id) {
  const s = state.settlements[id];
  const out = [];
  if (plagueActive(state, s)) out.push(`<span class="badge bad">Plague${quarantined(state, s) ? ', quarantined' : ''}</span>`);
  if ((s.raided ?? 0) > state.day) out.push(`<span class="badge bad">${s.raidKind === 'monsters' ? 'Beast attacks' : 'Raided'}</span>`);
  return out.join(' ');
}

// How strongly the crown holds a town: one chip per garrison level.
export function garrisonLevelsHtml(world, state, id) {
  const s = state.settlements[id];
  if (s.holder !== 'crown' || !world.settlementData[id].garrison || s.occupier) return '';
  const current = state.garrisonLevel[id] ?? 'standard';
  return `<div class="chips">${Object.entries(world.military.garrisonLevels).map(([lid, l]) => {
    const check = canSetGarrison(state, world, id, lid);
    return `<button type="button" class="chip${lid === current ? ' on' : ''}" data-garrison="${lid}" ${orderAttr({ type: 'garrison', settlement: id, level: lid })} ${check.ok ? '' : 'disabled'} aria-pressed="${lid === current}">${l.name}</button>`;
  }).join(' ')}</div>`;
}

// The town card's defence: the dangers round it and its strength.
export function defenceHtml(world, state, id) {
  const s = state.settlements[id];
  const patrolled = patrolledSet(state, world);
  const b = threatLevel(state, world, id, 'bandits', patrolled);
  const m = threatLevel(state, world, id, 'monsters', patrolled);
  const levels = garrisonLevelsHtml(world, state, id);
  return `
    <h3>Defence ${statusBadges(state, id)}</h3>
    ${levels ? `<p class="sub">How strongly the crown holds it:</p>${levels}` : ''}
    ${gaugeHtml('Bandits', b, describeLevel(b, THREAT_WORDS), true)}
    ${gaugeHtml('Monsters', m, describeLevel(m, THREAT_WORDS), true)}
    <p class="sub">Strength ${number(localStrength(state, world, id))}${s.buildings.includes('walls') ? ', behind walls' : ''}${patrolled.has(id) ? ', on a patrolled road' : ''}.</p>
    ${musterHtml(world, state, id)}
  `;
}

// One military (M22 C): the place's garrison companies, the levy it could
// raise and how fast, the standing companies near, and its muster.
const TROOP = (world, b) => world.forces.companies[b.type]?.plural ?? world.forces.garrison?.plural ?? b.type;
export function companyLine(world, b) {
  return `${escapeHtml(b.name ?? 'A company')}: ${number(Math.round(b.men))} ${escapeHtml(TROOP(world, b))}`;
}
// "430 militia and 286 crossbowmen".
function byType(world, bands) {
  const sum = {};
  for (const b of bands) sum[TROOP(world, b)] = (sum[TROOP(world, b)] ?? 0) + b.men;
  const parts = Object.entries(sum).map(([t, n]) => `${number(Math.round(n))} ${escapeHtml(t)}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts.join('');
}
export function musterHtml(world, state, id) {
  const s = state.settlements[id];
  if (!s || s.occupier || !world.forces?.levy) return '';
  const garrison = garrisonCompanies(world, id, s.garrison);
  const levy = placeMuster(state, world, id);
  const men = levy.reduce((v, b) => v + b.men, 0);
  const near = freeCompanies(state).filter((c) => Math.hypot(c.x - world.byId[id].x, c.y - world.byId[id].y) < 150);
  const called = crownArmies(state).find((a) => a.muster === id);
  const check = canMuster(state, world, id);
  return `<div data-part="muster"><h3>Its men</h3>
    <ul class="companies">${garrison.length ? `<li>Garrison of ${escapeHtml(world.byId[id].name)}: ${number(s.garrison)} garrison soldiers in ${garrison.length} compan${garrison.length === 1 ? 'y' : 'ies'}</li>` : '<li>No garrison.</li>'}</ul>
    <p class="sub">${levy.length ? `Its muster: ${number(men)} men in ${levy.length} compan${levy.length === 1 ? 'y' : 'ies'} (${byType(world, levy)}), under arms in a day. Their hands leave the works while they serve.` : 'Too few people here to muster.'}</p>
    ${near.length ? `<p class="sub">Standing companies near: ${near.map((c) => escapeHtml(c.name)).join(', ')}.</p>` : ''}
    ${called ? `<button type="button" class="act" data-go="army:${called.id}"><span class="act-label">${icon('sword')} The muster is under arms</span><span class="act-sub">${number(Math.round(called.soldiers))} men</span></button>`
    : `<button type="button" class="act" data-muster="${id}" ${orderAttr({ type: 'muster', settlement: id })} ${check.ok ? '' : 'disabled'}><span class="act-label">${icon('sword')} Call the muster</span><span class="act-sub">${check.ok ? 'To defend it, answer a threat near, or join an army' : escapeHtml(check.reason)}</span></button>`}</div>`;
}
