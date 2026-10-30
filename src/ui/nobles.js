import { loyaltyTarget, housePower, holdingsOf, crownShare, canHouseAction, formatDate, dateOf } from '../sim/index.js';
import { number, escapeHtml, describeLevel } from './format.js';
import { cardHead, section, orderAttr } from './card.js';
import { pendingDecisions, decisionHtml } from './inbox.js';

const LOYALTY_WORDS = ['Treacherous', 'Disloyal', 'Wavering', 'Loyal', 'Devoted'];
const AMBITION_WORDS = ['Content', 'Settled', 'Restless', 'Grasping', 'Hungry for power'];

export function swatch(world, id) {
  const [field, charge] = world.houses.houses[id].colours;
  return `<i class="house-swatch" style="background:${field};border-color:${charge}"></i>`;
}

function badges(state, id) {
  const h = state.houses[id];
  const out = [];
  if (h.rebel) out.push('<span class="badge bad">In rebellion</span>');
  if (h.office) out.push('<span class="badge">On the council</span>');
  if (h.exemptUntil !== null && state.day < h.exemptUntil) out.push('<span class="badge">Exempt from taxes</span>');
  return out.join(' ');
}

export function noblesHtml(app) {
  const { world, state } = app;
  const d = world.houses.deposition;
  const crisis = state.crisisMonths > 0
    ? `<p class="warn">The lords speak of a regency. ${state.crisisMonths} of ${d.months} months of crisis.</p>` : '';
  const waiting = new Set(state.demands.map((p) => p.house));
  const rows = Object.entries(world.houses.houses).map(([id, def]) => {
    const p = housePower(state, world, id);
    const h = state.houses[id];
    return `<button type="button" class="row realm-row" data-house="${id}" data-go="house:${id}">
      ${swatch(world, id)}<span class="row-main"><span class="row-name">${escapeHtml(def.name)} ${badges(state, id)}${waiting.has(id) ? ' <span class="badge bad">Demand waiting</span>' : ''}</span>
      <span class="row-sub">${escapeHtml(def.lord)}. ${holdingsOf(state, id).length} holdings, ${number(p.soldiers)} soldiers.</span></span>
      <span class="row-end">${describeLevel(h.loyalty, LOYALTY_WORDS)}</span></button>`;
  }).join('');
  const reign = state.reign;
  return `
    <div data-part="head"><p class="status"><span>Reign ${reign.number}, since ${formatDate(reign.since)}. Their lands pay the crown half their taxes, and they keep their own soldiers.</span></p>${crisis}</div>
    <div data-part="houses"><div class="rows">${rows}</div></div>
  `;
}

const ACTIONS = [
  ['honours', 'Bestow honours', (a) => `${a.coin} crowns.`],
  ['summon', 'Summon to court', (a) => `Raises Unrest by ${a.unrest}. Cools his ambition.`],
  ['levies', 'Demand levies', () => 'A quarter of his soldiers march to Vizima. He will resent it.'],
  ['fine', 'Impose a fine', (a) => `Raises Unrest by ${a.unrest}. Coin for the crown, a grievance for him.`],
  // M24 B: a child of the house kept at court.
  ['hostages', 'Take a hostage', (a) => `Fear +${a.fear}. A child of the house at court for its good behaviour; a deep grievance.`],
];

export function houseCard(app, id) {
  const { world, state, memory } = app;
  const route = `house:${id}`;
  const picking = memory.forms[route]?.picking ?? null;
  const def = world.houses.houses[id];
  const h = state.houses[id];
  const p = housePower(state, world, id);
  const traits = def.traits.map((t) => `<li><b>${escapeHtml(world.houses.traits[t].name)}.</b> ${escapeHtml(world.houses.traits[t].about)}</li>`).join('');
  const lands = holdingsOf(state, id).map((sid) => `<button type="button" class="chip" data-place="${sid}" data-go="town:${sid}">${escapeHtml(world.byId[sid].name)}${sid === def.seat ? ' (seat)' : ''}</button>`).join(' ');
  const share = holdingsOf(state, id).length ? crownShare(state, world, state.settlements[holdingsOf(state, id)[0]]) : 0;
  const gap = loyaltyTarget(state, world, id) - h.loyalty;
  const trend = gap > 2 ? ' <small class="up">\u25B2</small>' : gap < -2 ? ' <small class="down">\u25BC</small>' : '';
  const actions = ACTIONS.map(([kind, label, cost]) => {
    const check = canHouseAction(state, world, id, kind);
    const ask = kind === 'fine' || kind === 'levies' || kind === 'hostages' ? `${label}: ${def.name}?` : '';
    return `<button type="button" class="build" data-house-action="${kind}" ${orderAttr({ type: 'house', house: id, kind }, ask)} ${check.ok ? '' : 'disabled'}>
      <span class="build-name">${label}</span><span class="build-cost">${check.ok ? cost(world.houses.actions[kind]) : escapeHtml(check.reason)}</span></button>`;
  }).join('');
  let pickList = '';
  if (picking === 'grant') {
    const crown = Object.keys(state.settlements).filter((sid) => canHouseAction(state, world, id, 'grant', sid).ok);
    pickList = `<h3>Grant which land?</h3><div class="chips">${crown.map((sid) => `<button type="button" class="chip" data-grant="${sid}" ${orderAttr({ type: 'house', house: id, kind: 'grant', settlement: sid }, `Grant ${world.byId[sid].name} to ${def.name}?`)}>${escapeHtml(world.byId[sid].name)}</button>`).join(' ')}</div>`;
  } else if (picking === 'strip') {
    const theirs = holdingsOf(state, id).filter((sid) => canHouseAction(state, world, id, 'strip', sid).ok);
    pickList = `<h3>Strip which land? (raises Unrest by ${world.houses.actions.strip.unrest})</h3><div class="chips">${theirs.map((sid) => `<button type="button" class="chip" data-strip="${sid}" ${orderAttr({ type: 'house', house: id, kind: 'strip', settlement: sid }, `Strip ${def.name} of ${world.byId[sid].name}? Every house will remember.`)}>${escapeHtml(world.byId[sid].name)}</button>`).join(' ') || '<p class="sub">Nothing but the seat.</p>'}</div>`;
  }
  const demands = pendingDecisions(state, world).filter((x) => x.kind === 'demand' && x.house === id);
  return `
    ${cardHead({
      status: `<span>${escapeHtml(def.lord)}. ${badges(state, id)}</span>`,
      chips: [
        { icon: 'crown', label: 'Loyalty', value: `${describeLevel(h.loyalty, LOYALTY_WORDS)}${trend}`, tone: h.loyalty < 30 ? 'bad' : '' },
        { label: 'Ambition', value: describeLevel(h.ambition, AMBITION_WORDS), tone: h.ambition > 70 ? 'bad' : '' },
        { label: 'Favour', value: number(h.favour) },
        { label: 'Grievances', value: number(h.grievance), tone: h.grievance > 30 ? 'bad' : '' },
        { icon: 'sword', label: 'Soldiers', value: number(p.soldiers) },
        { icon: 'people', label: 'People', value: number(p.people) },
        { icon: 'coin', label: "Crown's share", value: `${Math.round(share * 100)}%` },
      ],
    })}
    <div data-part="demand">${demands.map((d) => decisionHtml(d)).join('')}</div>
    <div data-part="actions" data-form="${route}"><h3>The crown's hand</h3><div class="build-list">${actions}
      <button type="button" class="build${picking === 'grant' ? ' open' : ''}" data-house-pick="grant" data-set="picking:${picking === 'grant' ? '' : 'grant'}"><span class="build-name">Grant land</span><span class="build-cost">Favour now; half the taxes, forever.</span></button>
      <button type="button" class="build danger" data-house-pick="strip" data-set="picking:${picking === 'strip' ? '' : 'strip'}" ${h.rebel ? 'disabled' : ''}><span class="build-name">Strip a title</span><span class="build-cost">Every house will remember.</span></button>
    </div>${pickList}</div>
    <div data-part="lands"><h3>Lands</h3><div class="chips">${lands || '<p class="sub">None.</p>'}</div></div>
    ${section(memory, route, 'traits', 'Character', `<ul class="cares">${traits}</ul>`)}
  `;
}

// The end of a reign: what was left behind, and a choice to carry on.
export function depositionHtml(summary) {
  const from = dateOf(summary.from);
  const to = dateOf(summary.to);
  const years = Math.max(0, Math.round((summary.to - summary.from) / 365));
  const change = summary.popEnd - summary.popStart;
  return `
    <p class="sub envoy-from">The end of a reign</p>
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
      <button type="button" class="build" data-regency><span class="build-name">Continue under a regency</span><span class="build-cost">The realm stays as it is. The council restores some of the folk's Love.</span></button>
      <button type="button" class="build danger" data-new-reign><span class="build-name">Start a new reign</span><span class="build-cost">A fresh Temeria.</span></button>
    </div>
  `;
}
