// Conquest on the cards (M19): a conquered town's people and how far they
// have taken to the crown; what an occupied town can be made to give; and on
// the Diplomacy tab, how much the North fears us, the league sworn against
// us, and the rulers we have driven into exile.
import {
  TEMERIA, sideName, formatDate, integrationParts, canResettle, canRepair, canRequisition, peopleOf, fearOfTemeria, northFear, claimantName,
  canPension, pensionCost, canSpyOnClaimant, crushOdds, ownerOf,
} from '../sim/index.js';
import { number, escapeHtml, describeLevel } from './format.js';
import { orderAttr } from './card.js';

const INTEGRATION_WORDS = ['Hostile', 'Sullen', 'Resigned', 'Settling', 'Loyal'];
const FEAR_WORDS = ['Untroubled', 'Wary', 'Uneasy', 'Afraid', 'In dread'];
const HOW = { spared: 'spared', sacked: 'sacked', expelled: 'with some of its people driven out' };

// A conquered town: its people, how it was taken, and the bar of its
// integration with the reasons it is rising or falling.
export function conquestTownHtml(world, state, id) {
  const s = state.settlements[id];
  if (!s || !world.conquest) return '';
  let out = '';
  if (s.smoulder && s.smoulder > state.day) out += '<p class="warn">The ruins still smoulder from the sack.</p>';
  if (s.expelled) out += `<p class="sub">Its ${escapeHtml(s.expelled.kind === 'human' ? 'old folk' : world.groups.groups[s.expelled.kind]?.name.toLowerCase() ?? s.expelled.kind)} were driven out; the town will feel the gap for years.</p>`;
  const r = (state.conquest?.revolts ?? []).find((x) => x.town === id);
  if (r) out += `<p class="warn">In revolt since ${formatDate(r.since)}: ${number(r.rebels)} rebels${r.held ? ' hold the town' : ' in the streets'}. Odds of crushing them: ${Math.round(crushOdds(state, world, id, r) * 100)}%.</p>`;
  if (s.integration === undefined) return out;
  const who = peopleOf(world, s.origin);
  const parts = integrationParts(state, world, id);
  const trend = parts.reduce((a, p) => a + p.value, 0);
  const list = parts.map((p) => `<li class="${p.value >= 0 ? 'up' : 'down'}">${escapeHtml(p.text)} <small>${p.value > 0 ? '+' : ''}${p.value}</small></li>`).join('');
  const resettle = canResettle(state, world, id);
  const repairs = (s.damaged ?? []).map((b) => {
    const c = canRepair(state, world, id, b);
    return `<button type="button" class="build" ${orderAttr({ type: 'repair', settlement: id, building: b })} ${c.ok ? '' : 'disabled'}>
      <span class="build-name">Rebuild the ${escapeHtml(world.buildings[b].name.toLowerCase())}</span><span class="build-cost">${c.ok ? `${number(c.cost)} crowns` : escapeHtml(c.reason)}</span></button>`;
  }).join('');
  out += `<div class="integration" data-part="integration">
    <div class="gauge-row"><div class="lbl"><span>Integration: ${escapeHtml(who.name)}${s.conquered ? `, ${HOW[s.conquered.how] ?? 'taken'} on ${formatDate(s.conquered.day)}` : ''}</span><span>${describeLevel(s.integration, INTEGRATION_WORDS)} ${trend > 0.05 ? '<small class="up">▲</small>' : trend < -0.05 ? '<small class="down">▼</small>' : ''}</span></div>
    <div class="gauge${s.integration < 30 ? ' bad' : ''}"><span style="width:${Math.round(s.integration)}%"></span></div></div>
    <p class="sub">A town that has not taken to the crown pays less and sends fewer men${s.integration < 30 ? ', and may rise' : ''}.${s.charter > state.day ? ' Its charter lightens its taxes.' : ''}${s.resettle ? ` Settlers from Temeria are arriving (${s.resettle.months} months more).` : ''}</p>
    ${list ? `<ul class="cares">${list}</ul>` : ''}
    <div class="build-list">
      ${s.resettle ? '' : `<button type="button" class="build" ${orderAttr({ type: 'resettle', settlement: id }, 'Bring Temerian settlers? Some of the old folk will be turned off their land.')} ${resettle.ok ? '' : 'disabled'}>
        <span class="build-name">Bring settlers from Temeria</span><span class="build-blurb">Integration rises faster for a year; some locals lose their land and side with the old crown.</span>
        <span class="build-cost">${resettle.ok ? `${number(resettle.cost)} crowns` : escapeHtml(resettle.reason)}</span></button>`}
      ${repairs}
    </div></div>`;
  return out;
}

// An occupied town abroad: what it can be made to give while the war lasts.
export function occupiedHtml(world, state, id) {
  if (!world.conquest || state.settlements[id] || ownerOf(state, world, id) !== TEMERIA) return '';
  const c = canRequisition(state, world, id);
  return `<div data-part="occupied"><p class="warn">Occupied by our soldiers. Nothing is built or granted here until a peace makes it ours.</p>
    <div class="build-list"><button type="button" class="build" ${orderAttr({ type: 'requisition', settlement: id })} ${c.ok ? '' : 'disabled'}>
      <span class="build-name">Requisition grain and coin</span><span class="build-blurb">Its people will resent it, and remember it after the peace.</span>
      <span class="build-cost">${c.ok ? `About ${number(c.coin)} crowns and ${number(c.food)} grain` : escapeHtml(c.reason)}</span></button></div></div>`;
}

// Fear of Temeria across the North, the league, and the exiles.
export function fearHtml(world, state) {
  if (!world.conquest || !state.conquest) return '';
  const avg = northFear(state, world);
  const l = state.conquest.league;
  const league = l ? `<p class="warn">Sworn against us since ${formatDate(l.since)}: ${l.members.map((r) => escapeHtml(sideName(world, r))).join(', ')}. Strike one and the rest will march.</p>` : '';
  const exiles = (state.claimants ?? []).map((c) => {
    const against = c.against === TEMERIA;
    const pension = against ? canPension(state, world, c.realm) : null;
    const spy = against ? canSpyOnClaimant(state, world, c.realm) : null;
    return `<div class="claimant">
      <p><b>${escapeHtml(claimantName(world, c))}</b>, exiled from ${escapeHtml(sideName(world, c.realm))}${c.host ? ` at the court of ${escapeHtml(sideName(world, c.host))}` : ''}${against ? '' : `, against ${escapeHtml(sideName(world, c.against))}`}. Legitimacy ${Math.round(c.legitimacy)}.</p>
      ${against ? `<div class="build-list">
        <button type="button" class="build" ${orderAttr({ type: 'pension', realm: c.realm }, 'Pay the exile to renounce the claim?')} ${pension.ok ? '' : 'disabled'}>
          <span class="build-name">A pension to renounce</span><span class="build-cost">${pension.ok ? `${number(pensionCost(state, world, c))} crowns` : escapeHtml(pension.reason)}</span></button>
        <button type="button" class="build" ${orderAttr({ type: 'claimantSpy', realm: c.realm })} ${spy.ok ? '' : 'disabled'}>
          <span class="build-name">Send an agent against them</span><span class="build-blurb">May discredit them; may be caught.</span><span class="build-cost">${spy.ok ? `${number(spy.cost)} crowns` : escapeHtml(spy.reason)}</span></button>
      </div>` : ''}</div>`;
  }).join('');
  return `<div data-part="fear"><h3>Fear of Temeria</h3>
    <p class="sub">The North as a whole: ${describeLevel(avg, FEAR_WORDS).toLowerCase()} (${Math.round(avg)}). Every town we take raises it, sacks and expulsions twice over; it ebbs in peace. When it runs high, rulers swear a league against us.</p>
    ${league}${exiles ? `<h3>Exiles</h3>${exiles}` : ''}</div>`;
}

export function fearWord(state, rid) {
  return describeLevel(fearOfTemeria(state, rid), FEAR_WORDS);
}
