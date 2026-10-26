// The Forces screen, the company and threat cards, and a town's companies.
import {
  TEMERIA, freeCompanies, crownArmies, describeArmy, describeCompany, companyUpkeep, huntOdds, bestCompanyFor, canRecruit, recruitCost,
  companySlots, threatPos, threatName, threatSize, isCamp, nearestPlace, witcherCost, speciesOf, ledgerNet, targetOf, hostile,
} from '../sim/index.js';
import { number, escapeHtml } from './format.js';
import { icon } from './icons.js';
import { cardHead, orderAttr, section } from './card.js';

const MORALE = (m) => (m >= 75 ? 'eager' : m >= 55 ? 'steady' : m >= 35 ? 'shaken' : 'close to breaking');
const XP = (x) => (x >= 0.6 ? 'veterans' : x >= 0.25 ? 'seasoned' : 'green');

function moraleBar(m) {
  return `<span class="mini-bar" role="img" aria-label="morale ${Math.round(m)}"><span style="width:${Math.round(m)}%"></span></span>`;
}

export function distanceWord(world, p) {
  const n = nearestPlace(world, p);
  return `${Math.round(n.d)} miles from ${world.byId[n.id].name}`;
}

export function threatLabel(world, t) {
  const size = threatSize(t);
  if (t.kind === 'monsters') {
    const sp = speciesOf(world, t);
    return size === 1 ? sp.name : `${sp.name} (${size})`;
  }
  return `${threatName(world, t)}${t.band && isCamp(t) ? ', a band out on the roads' : ''} (${size} men)`;
}

function companyRow(world, state, c) {
  const t = world.forces.companies[c.type];
  return `<button type="button" class="row realm-row" data-company="${c.id}" data-go="company:${c.id}">
    <span class="row-main"><span class="row-name">${escapeHtml(c.name)} ${moraleBar(c.morale)}</span>
    <span class="row-sub">${number(c.men)} of ${c.max} ${escapeHtml(t.plural)}, ${MORALE(c.morale)}. ${escapeHtml(describeCompany(state, world, c).replace(`${c.name}, ${Math.round(c.men)} men, `, ''))}.</span></span>
    <span class="row-end">${icon('coin')}${number(companyUpkeep(world, c))}</span></button>`;
}

function threatRow(world, state, t) {
  const best = bestCompanyFor(state, world, t);
  const hunted = freeCompanies(state).find((c) => c.task?.threat === t.id);
  const contract = state.threats.contracts.find((c) => c.threat === t.id);
  let act;
  if (hunted) act = `<span class="build-cost">${escapeHtml(hunted.name)} is on its way.</span>`;
  else if (contract) act = '<span class="build-cost">A witcher is on the trail.</span>';
  else act = `<button type="button" class="act primary" data-send="${t.id}" ${best ? '' : 'disabled'}><span class="act-label">Send nearest suitable company</span><span class="act-sub">${best ? `${best.odds.word} for ${escapeHtml(best.c.name)}` : 'No company is free'}</span></button>`;
  return `<div class="decision"><button type="button" class="row" data-threat="${t.id}" data-go="threat:${t.id}">
      ${icon('target')}<span class="row-main"><span class="row-name">${escapeHtml(threatLabel(world, t))}</span>
      <span class="row-sub">${escapeHtml(distanceWord(world, threatPos(t)))}.</span></span></button>
    <div class="actions">${act}</div></div>`;
}

export function forcesHtml(app) {
  const { world, state } = app;
  const companies = state.forces.companies;
  const free = companies.filter((c) => !c.army);
  const upkeep = companies.reduce((a, c) => a + companyUpkeep(world, c), 0);
  const h = state.ledger.history;
  const income = h.length ? h.reduce((a, m) => a + ledgerNet(m).in, 0) / h.length : 0;
  const armies = crownArmies(state).map((a) => `<button type="button" class="row realm-row" data-army="${a.id}" data-go="army:${a.id}">
    <span class="row-main"><span class="row-name">${escapeHtml(a.name)} ${moraleBar(a.morale)}</span>
    <span class="row-sub">${escapeHtml(describeArmy(state, world, a).replace(`${a.name}, `, ''))}.</span></span></button>`).join('');
  return `
    ${cardHead({
      status: '<span>Companies are recruited from a town\'s card. Give each a standing order; they march by road, fight what they meet, and come home.</span>',
      chips: [
        { icon: 'sword', label: 'Companies', value: companies.length },
        { icon: 'coin', label: 'Pay', value: `${number(upkeep)} a month${income ? ` (${Math.round((upkeep / income) * 100)}%)` : ''}` },
        { label: 'Arms', value: number(state.forces.stores.arms) },
        { label: 'Horses', value: number(state.forces.stores.horses) },
      ],
    })}
    <div data-part="companies"><h3>The crown's companies</h3>
      ${free.length ? `<div class="rows">${free.map((c) => companyRow(world, state, c)).join('')}</div>` : '<p class="sub">None yet. Recruit them from a town, city or castle of the crown: open its card, then Military.</p>'}</div>
    ${armies ? `<div data-part="armies"><h3>Armies in the field</h3><div class="rows">${armies}</div></div>` : ''}
  `;
}

export function threatsHtml(app) {
  const { world, state } = app;
  const sighted = state.threats.list.filter((t) => t.sighted || t.campSeen);
  const rumours = state.threats.list.filter((t) => !t.sighted && !t.campSeen && t.rumour).length;
  const foes = (state.armies ?? []).filter((a) => a.side !== TEMERIA && hostile(state, TEMERIA, a.side));
  return `
    <div data-part="threats">
      ${sighted.length ? sighted.map((t) => threatRow(world, state, t)).join('') : '<p class="sub">Nothing in sight.</p>'}
      ${rumours ? `<p class="sub">And ${rumours} rumour${rumours === 1 ? '' : 's'} of something further off: send a company or build watchtowers to see.</p>` : ''}
      ${foes.length ? `<p class="warn">Enemy armies in the field: ${foes.map((a) => escapeHtml(a.name)).join(', ')}.</p>` : ''}</div>`;
}

// ---- A company's card ----

export function companyCard(app, id) {
  const { world, state, memory } = app;
  const c = state.forces.companies.find((x) => x.id === id);
  if (!c) return '<div data-part="head"><p class="sub">That company is no more.</p></div>';
  const t = world.forces.companies[c.type];
  const route = `company:${id}`;
  const radius = c.order.radius ?? world.forces.respond.default;
  const hunts = state.threats.list.filter((x) => x.sighted || x.campSeen).map((x) => {
    const o = huntOdds(state, world, [c], x);
    return `<button type="button" class="build" data-hunt="${x.id}" ${orderAttr({ type: 'company', id, order: { kind: 'hunt', threat: x.id } })}><span class="build-name">Hunt: ${escapeHtml(threatLabel(world, x))}</span>
      <span class="build-cost">${o.word}. ${escapeHtml(distanceWord(world, threatPos(x)))}.</span></button>`;
  }).join('');
  const armies = (state.armies ?? []).filter((a) => a.side !== TEMERIA && hostile(state, TEMERIA, a.side)).map((a) => {
    const o = huntOdds(state, world, [c], a);
    return `<button type="button" class="build" data-hunt-army="${a.id}" ${orderAttr({ type: 'company', id, order: { kind: 'hunt', army: a.id } })}><span class="build-name">Attack: ${escapeHtml(a.name)}</span>
      <span class="build-cost">${o.word}. ${number(a.soldiers)} men.</span></button>`;
  }).join('');
  const target = targetOf(state, c);
  const routes = (state.routes ?? []).map((r) => `<button type="button" class="chip${c.order.kind === 'escort' && c.order.route === r.id ? ' on' : ''}" data-escort="${r.id}" ${orderAttr({ type: 'company', id, order: { kind: 'escort', route: r.id } })}>${escapeHtml(world.byId[r.from].name)} to ${escapeHtml(world.byId[r.to].name)}</button>`).join(' ');
  const pick = (kind, label, sub) => `<button type="button" class="act" data-order-kind="${kind}" data-pick-start='{"kind":"${kind}","company":${id}}'><span class="act-label">${icon('target')} ${label}</span><span class="act-sub">${sub}</span></button>`;
  const orders = c.army ? '<div data-part="orders"><p class="sub">It marches with an army; give orders to the army.</p></div>' : `
    <div data-part="orders"><h3>Orders</h3>
      <div class="actions">
        ${pick('hunt', 'Hunt', 'Tap a threat on the map')}
        ${pick('patrol', 'Patrol', 'Tap two towns on the map')}
        ${pick('station', 'Station', 'Tap a town of ours')}
      </div>
      <div class="form-row"><span>Respond</span><div class="chips">${world.forces.respond.radii.map((r) => `<button type="button" class="chip${c.order.kind === 'respond' && radius === r ? ' on' : ''}" data-respond="${r}" ${orderAttr({ type: 'company', id, order: { kind: 'respond', radius: r } })}>${r} miles</button>`).join(' ')}</div></div>
      ${routes ? `<div class="form-row"><span>Escort a route</span><div class="chips">${routes}</div></div>` : ''}
    </div>
    ${section(memory, route, 'hunt', 'Hunt something sighted', hunts || armies ? `<div class="build-list">${hunts}${armies}</div>` : '', { open: true })}
    <div data-part="disband"><button type="button" class="act danger" data-disband-company ${orderAttr({ type: 'company', id, disband: true }, 'Stand this company down? Its men go home.')} data-then="back"><span class="act-label">Stand the company down</span></button></div>`;
  return `
    ${cardHead({
      status: `<span>${escapeHtml(describeCompany(state, world, c).replace(`${c.name}, `, ''))}.${target ? ` Odds against its quarry: ${huntOdds(state, world, [c], target).word}.` : ''}</span>`,
      infoText: t.blurb + ' Respond: stay at its station, ride out to any threat sighted within that distance when the odds are fair, then come home.',
      chips: [
        { icon: 'people', label: 'Men', value: `${number(c.men)} of ${c.max}${c.wounded >= 1 ? `, ${number(c.wounded)} hurt` : ''}` },
        { label: 'Morale', value: MORALE(c.morale), tone: c.morale < 35 ? 'bad' : '' },
        { label: 'Experience', value: `${XP(c.xp)}${c.wins ? ` (${c.wins} won)` : ''}` },
        { icon: 'coin', label: 'Pay', value: `${number(companyUpkeep(world, c))} a month` },
      ],
    })}
    ${orders}
  `;
}

// ---- A threat's card ----

export function threatCard(app, id) {
  const { world, state } = app;
  const t = state.threats.list.find((x) => x.id === id);
  if (!t) return '<div data-part="head"><p class="sub">Whatever was there is gone.</p></div>';
  const best = bestCompanyFor(state, world, t);
  const kind = {
    bandits: t.band ? 'A raiding band out of a camp in the wilds. It holds the roads, robbing what passes, and falls on weak villages.' : 'Outlaws camped in the wilds. The camp grows while the country round it is poor and restless, and sends bands to the roads.',
    monsters: 'Beasts with a lair in the wilds. They prey on the roads and the villages near, and grow bolder with time. Witchers deal with them best; troops can, at a cost in men.',
    scoiatael: 'Elven commandos out of the woods. They strike roads and patrols, then vanish back into the forest.',
    raiders: 'A war party from over the border, come to plunder and go home.',
  }[t.kind];
  const hunted = freeCompanies(state).filter((c) => c.task?.threat === t.id);
  const contract = state.threats.contracts.find((c) => c.threat === t.id);
  const others = freeCompanies(state).filter((c) => !c.army && c.id !== best?.c.id && !hunted.includes(c)).map((c) => {
    const o = huntOdds(state, world, [c], t);
    return `<button type="button" class="build" ${orderAttr({ type: 'company', id: c.id, order: { kind: 'hunt', threat: t.id } })}><span class="build-name">Send ${escapeHtml(c.name)}</span><span class="build-cost">${o.word}.</span></button>`;
  }).join('');
  const actions = [
    best && !hunted.length ? `<button type="button" class="act primary" data-send="${t.id}"><span class="act-label">Send nearest suitable company</span><span class="act-sub">${escapeHtml(best.c.name)}, ${best.odds.word.toLowerCase()} odds</span></button>` : '',
    t.kind === 'monsters' && !contract ? `<button type="button" class="act" data-witcher="${t.id}" ${orderAttr({ type: 'witcher', threat: t.id })}><span class="act-label">Hire a witcher</span><span class="act-sub">${number(witcherCost(state, world, t))} crowns; no soldier need die</span></button>` : '',
  ].join('');
  return `
    ${cardHead({
      status: `<span>${escapeHtml(distanceWord(world, threatPos(t)))}.${hunted.length ? ` ${escapeHtml(hunted.map((c) => c.name).join(', '))} ${hunted.length === 1 ? 'is' : 'are'} on the way.` : ''}${contract ? ' A witcher is on the trail.' : ''}${!best && !hunted.length ? ' No company is free to send.' : ''}</span>`,
      infoText: kind + (t.kind === 'monsters' ? ' Nine in ten witchers come back with a trophy.' : ''),
      chips: [{ icon: 'target', label: 'Size', value: threatSize(t) }],
      actions,
    })}
    ${others ? `<div data-part="others"><h3>Or send another</h3><div class="build-list">${others}</div></div>` : ''}`;
}

// ---- A town's companies and recruiting ----

export function settlementForcesHtml(world, state, id) {
  const s = state.settlements[id];
  if (s.occupier || !world.forces) return '';
  const here = state.forces.companies.filter((c) => c.station === id);
  const rows = Object.entries(world.forces.companies).map(([type, t]) => {
    const check = canRecruit(state, world, id, type);
    if (check.hidden) return '';
    const cost = recruitCost(state, world, id, type);
    const needs = [t.arms ? `${t.arms} arms` : '', t.horses ? `${t.horses} horses` : ''].filter(Boolean).join(' and ');
    return `<button type="button" class="build" data-recruit="${type}" ${orderAttr({ type: 'recruit', settlement: id, kind: type })} ${check.ok ? '' : 'disabled'}>
      <span class="build-name">${escapeHtml(t.name)}: ${t.men} men</span>
      <span class="build-cost">${check.ok ? `${number(cost.coin)} crowns${needs ? ` and ${needs} from store` : ''}${cost.short.arms ? ' (arms bought abroad)' : ''}${cost.short.horses && type !== 'knights' ? ' (horses bought abroad)' : ''}; ${number(t.men * t.upkeep)} a month.` : escapeHtml(check.reason)}</span></button>`;
  }).join('');
  if (!here.length && !rows) return '';
  return `<h3>Companies here</h3>
    ${here.length ? `<div class="rows">${here.map((c) => companyRow(world, state, c)).join('')}</div>` : '<p class="sub">None stationed here.</p>'}
    <h3>Recruit here</h3>
    <p class="sub">Room for ${companySlots(state, world, id)} compan${companySlots(state, world, id) === 1 ? 'y' : 'ies'} stationed here; barracks allow more and better.</p>
    ${rows ? `<div class="build-list" id="recruit">${rows}</div>` : ''}`;
}
