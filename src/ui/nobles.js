import { loyaltyTarget, housePower, holdingsOf, crownShare, canHouseAction, demandText, formatDate, dateOf } from '../sim/index.js';
import { number, escapeHtml, describeLevel } from './format.js';
import { gaugeHtml, decisionHtml } from './faith.js';

const LOYALTY_WORDS = ['Treacherous', 'Disloyal', 'Wavering', 'Loyal', 'Devoted'];
const AMBITION_WORDS = ['Content', 'Settled', 'Restless', 'Grasping', 'Hungry for power'];

function swatch(world, id) {
  const [field, charge] = world.houses.houses[id].colours;
  return `<i class="house-swatch" style="background:${field};border-color:${charge}"></i>`;
}

function loyaltyGauge(state, world, id) {
  const h = state.houses[id];
  const gap = loyaltyTarget(state, world, id) - h.loyalty;
  const trend = gap > 2 ? ' <span class="up" aria-label="warming">&#9650;</span>' : gap < -2 ? ' <span class="down" aria-label="cooling">&#9660;</span>' : '';
  return gaugeHtml('Loyalty', h.loyalty, describeLevel(h.loyalty, LOYALTY_WORDS) + trend, false);
}

function badges(state, id) {
  const h = state.houses[id];
  const out = [];
  if (h.rebel) out.push('<span class="badge bad">In rebellion</span>');
  if (h.office) out.push('<span class="badge">On the council</span>');
  if (h.exemptUntil !== null && state.day < h.exemptUntil) out.push('<span class="badge">Exempt from taxes</span>');
  return out.join(' ');
}

export function noblesHtml(world, state) {
  const d = world.houses.deposition;
  const crisis = state.crisisMonths > 0
    ? `<p class="warn">The lords speak of a regency. ${state.crisisMonths} of ${d.months} months of crisis.</p>` : '';
  const waiting = state.demands.map((p) => {
    const t = demandText(world, p);
    return `<button type="button" class="build" data-demand="${p.id}"><span class="build-name">${escapeHtml(t.title)}</span>
      <span class="build-cost">From ${escapeHtml(t.house)}, waiting since ${formatDate(p.day)}</span></button>`;
  }).join('');
  const rows = Object.entries(world.houses.houses).map(([id, def]) => {
    const p = housePower(state, world, id);
    return `<button type="button" class="law-head realm-row" data-house="${id}">
      <span class="build-name">${swatch(world, id)} ${escapeHtml(def.name)} ${badges(state, id)}</span>
      <span class="law-now">${escapeHtml(def.lord)}. ${holdingsOf(state, id).length} holdings, ${number(p.soldiers)} soldiers.</span>
      ${loyaltyGauge(state, world, id)}
    </button>`;
  }).join('');
  const reign = state.reign;
  return `
    <div data-part="head"><h2>The great houses</h2>
      <div class="menu-list"><button type="button" data-action="back">Back to the realm</button></div>
      <p class="sub">Reign ${reign.number}, since ${formatDate(reign.since)}. Their lands pay the crown half their taxes, and they keep their own soldiers.</p>
      ${crisis}</div>
    <div data-part="demands">${waiting ? `<h3>Demands waiting</h3><div class="build-list">${waiting}</div>` : ''}</div>
    <div data-part="houses"><div class="realm-list">${rows}</div></div>
  `;
}

const ACTIONS = [
  ['honours', 'Bestow honours', (a) => `${a.coin} crowns.`],
  ['summon', 'Summon to court', (a) => `${a.authority} Authority. Cools his ambition.`],
  ['levies', 'Demand levies', () => 'A quarter of his soldiers march to Vizima. He will resent it.'],
  ['fine', 'Impose a fine', (a) => `${a.authority} Authority. Coin for the crown, a grievance for him.`],
];

export function houseCardHtml(world, state, id, picking) {
  const def = world.houses.houses[id];
  const h = state.houses[id];
  const p = housePower(state, world, id);
  const traits = def.traits.map((t) => `<li><b>${escapeHtml(world.houses.traits[t].name)}.</b> ${escapeHtml(world.houses.traits[t].about)}</li>`).join('');
  const lands = holdingsOf(state, id).map((sid) => `<button type="button" class="chip" data-place="${sid}">${escapeHtml(world.byId[sid].name)}${sid === def.seat ? ' (seat)' : ''}</button>`).join(' ');
  const share = holdingsOf(state, id).length ? crownShare(state, world, state.settlements[holdingsOf(state, id)[0]]) : 0;
  const actions = ACTIONS.map(([kind, label, cost]) => {
    const check = canHouseAction(state, world, id, kind);
    return `<button type="button" class="build" data-house-action="${kind}" ${check.ok ? '' : 'disabled'}>
      <span class="build-name">${label}</span><span class="build-cost">${check.ok ? cost(world.houses.actions[kind]) : escapeHtml(check.reason)}</span></button>`;
  }).join('');
  let pickList = '';
  if (picking === 'grant') {
    const crown = Object.keys(state.settlements).filter((sid) => canHouseAction(state, world, id, 'grant', sid).ok);
    pickList = `<h3>Grant which land?</h3><div class="chips">${crown.map((sid) => `<button type="button" class="chip" data-grant="${sid}">${escapeHtml(world.byId[sid].name)}</button>`).join(' ')}</div>`;
  } else if (picking === 'strip') {
    const theirs = holdingsOf(state, id).filter((sid) => canHouseAction(state, world, id, 'strip', sid).ok);
    pickList = `<h3>Strip which land? (${world.houses.actions.strip.authority} Authority)</h3><div class="chips">${theirs.map((sid) => `<button type="button" class="chip" data-strip="${sid}">${escapeHtml(world.byId[sid].name)}</button>`).join(' ') || '<p class="sub">Nothing but the seat.</p>'}</div>`;
  }
  return `
    <div data-part="head">
      <h2>${swatch(world, id)} ${escapeHtml(def.name)}</h2>
      <p class="sub">${escapeHtml(def.lord)}. ${badges(state, id)}</p>
      <div class="menu-list"><button type="button" data-action="nobles">All the great houses</button></div>
    </div>
    <div data-part="mood">
      ${loyaltyGauge(state, world, id)}
      ${gaugeHtml('Ambition', h.ambition, describeLevel(h.ambition, AMBITION_WORDS), true)}
      <dl class="stats">
        <div><dt>Favour owed</dt><dd>${number(h.favour)}</dd></div>
        <div><dt>Grievances</dt><dd>${number(h.grievance)}</dd></div>
        <div><dt>Soldiers</dt><dd>${number(p.soldiers)}</dd></div>
        <div><dt>People</dt><dd>${number(p.people)}</dd></div>
        <div><dt>Crown's share</dt><dd>${Math.round(share * 100)}%</dd></div>
      </dl>
    </div>
    <div data-part="traits"><h3>Character</h3><ul class="cares">${traits}</ul></div>
    <div data-part="lands"><h3>Lands</h3><div class="chips">${lands || '<p class="sub">None.</p>'}</div></div>
    <div data-part="actions"><h3>The crown's hand</h3><div class="build-list">${actions}
      <button type="button" class="build" data-house-pick="grant"><span class="build-name">Grant land</span><span class="build-cost">Favour now; half the taxes, forever.</span></button>
      <button type="button" class="build danger" data-house-pick="strip" ${h.rebel ? 'disabled' : ''}><span class="build-name">Strip a title</span><span class="build-cost">Every house will remember.</span></button>
    </div>${pickList}</div>
  `;
}

export function demandHtml(world, pending) {
  const t = demandText(world, pending);
  return decisionHtml(`A demand from ${t.house}`, t.title, t.text, t.choices);
}

// The end of a reign: what was left behind, and a choice to carry on.
export function depositionHtml(summary) {
  const from = dateOf(summary.from);
  const to = dateOf(summary.to);
  const years = Math.max(0, Math.round((summary.to - summary.from) / 365));
  const change = summary.popEnd - summary.popStart;
  return `
    <p class="sub envoy-from">The end of a reign</p>
    <h2>The crown is deposed</h2>
    <p>Reign ${summary.reign}, ${from.year === to.year ? `in ${from.year}` : `from ${from.year} to ${to.year}`}${years ? `, ${years} year${years === 1 ? '' : 's'}` : ''}. The great houses met at Vizima and agreed, for once, on one thing.</p>
    <dl class="stats">
      <div><dt>People</dt><dd>${number(summary.popEnd)} <small>(${change >= 0 ? '+' : '−'}${number(Math.abs(change))})</small></dd></div>
      <div><dt>Treasury</dt><dd>${summary.treasury < 0 ? '−' : ''}${number(Math.abs(summary.treasury))}</dd></div>
      <div><dt>Decrees</dt><dd>${summary.decrees}</dd></div>
      <div><dt>Buildings</dt><dd>${summary.built}</dd></div>
      <div><dt>Riots</dt><dd>${summary.riots}</dd></div>
      <div><dt>Pogroms</dt><dd>${summary.pogroms}</dd></div>
    </dl>
    <div class="build-list">
      <button type="button" class="build" data-regency><span class="build-name">Continue under a regency</span><span class="build-cost">The realm stays as it is. The council restores some Authority.</span></button>
      <button type="button" class="build danger" data-new-reign><span class="build-name">Start a new reign</span><span class="build-cost">A fresh Temeria.</span></button>
    </div>
  `;
}
