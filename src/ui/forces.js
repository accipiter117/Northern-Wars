// The Forces screen, the company and threat cards, and a town's companies.
import {
  TEMERIA, freeCompanies, crownArmies, describeArmy, describeCompany, companyUpkeep, huntOdds, bestCompanyFor, canRecruit, recruitCost,
  companySlots, threatPos, threatName, threatSize, isCamp, nearestPlace, witcherCost, speciesOf, ledgerNet, targetOf, hostile,
} from '../sim/index.js';
import { number, escapeHtml } from './format.js';

const back = '<div class="menu-list"><button type="button" data-action="back">Back to the realm</button></div>';
const MORALE = (m) => (m >= 75 ? 'eager' : m >= 55 ? 'steady' : m >= 35 ? 'shaken' : 'close to breaking');
const XP = (x) => (x >= 0.6 ? 'veterans' : x >= 0.25 ? 'seasoned' : 'green');

function moraleBar(m) {
  return `<span class="mini-bar" role="img" aria-label="morale ${Math.round(m)}"><span style="width:${Math.round(m)}%"></span></span>`;
}

function distanceWord(world, p) {
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
  return `<button type="button" class="law-head realm-row" data-company="${c.id}">
    <span class="build-name">${escapeHtml(c.name)} ${moraleBar(c.morale)}</span>
    <span class="law-now">${number(c.men)} of ${c.max} ${escapeHtml(t.plural)}${c.wounded >= 1 ? `, ${number(c.wounded)} wounded` : ''}; ${MORALE(c.morale)}, ${XP(c.xp)}; ${number(companyUpkeep(world, c))} crowns a month.
    ${escapeHtml(describeCompany(state, world, c).replace(`${c.name}, ${Math.round(c.men)} men, `, ''))}.</span></button>`;
}

function threatRow(world, state, t) {
  const best = bestCompanyFor(state, world, t);
  const odds = best ? `${best.odds.word} for ${escapeHtml(best.c.name)}` : 'no company free';
  const hunted = freeCompanies(state).find((c) => c.task?.threat === t.id);
  const contract = state.threats.contracts.find((c) => c.threat === t.id);
  return `<div class="law-option current"><button type="button" class="law-head realm-row" data-threat="${t.id}">
      <span class="build-name">${escapeHtml(threatLabel(world, t))}</span>
      <span class="law-now">${escapeHtml(distanceWord(world, threatPos(t)))}.</span></button>
    ${hunted ? `<span class="build-cost">${escapeHtml(hunted.name)} is on its way.</span>`
      : contract ? '<span class="build-cost">A witcher is on the trail.</span>'
        : `<button type="button" class="chip" data-send="${t.id}" ${best ? '' : 'disabled'}>Send the nearest company (${odds})</button>`}
  </div>`;
}

export function forcesHtml(world, state) {
  const companies = state.forces.companies;
  const free = companies.filter((c) => !c.army);
  const upkeep = companies.reduce((a, c) => a + companyUpkeep(world, c), 0);
  const h = state.ledger.history;
  const income = h.length ? h.reduce((a, m) => a + ledgerNet(m).in, 0) / h.length : 0;
  const sighted = state.threats.list.filter((t) => t.sighted || t.campSeen);
  const rumours = state.threats.list.filter((t) => !t.sighted && !t.campSeen && t.rumour).length;
  const armies = crownArmies(state).map((a) => `<button type="button" class="law-head realm-row" data-army="${a.id}">
    <span class="build-name">${escapeHtml(a.name)} ${moraleBar(a.morale)}</span>
    <span class="law-now">${escapeHtml(describeArmy(state, world, a).replace(`${a.name}, `, ''))}.</span></button>`).join('');
  const foes = (state.armies ?? []).filter((a) => a.side !== TEMERIA && hostile(state, TEMERIA, a.side));
  return `
    <div data-part="head"><h2>Forces</h2>${back}
      <dl class="stats">
        <div><dt>Companies</dt><dd>${companies.length}</dd></div>
        <div><dt>Their pay</dt><dd>${number(upkeep)} a month${income ? ` <small>(${Math.round((upkeep / income) * 100)}% of income)</small>` : ''}</dd></div>
        <div><dt>Arms in store</dt><dd>${number(state.forces.stores.arms)}</dd></div>
        <div><dt>Horses in the stables</dt><dd>${number(state.forces.stores.horses)}</dd></div>
      </dl>
      <p class="sub">Companies are recruited from a town's card. Give each a standing order; they march by road, fight what they meet, and come home.</p></div>
    <div data-part="threats"><h3>Threats sighted</h3>
      ${sighted.length ? sighted.map((t) => threatRow(world, state, t)).join('') : '<p class="sub">Nothing in sight.</p>'}
      ${rumours ? `<p class="sub">And ${rumours} rumour${rumours === 1 ? '' : 's'} of something further off: send a company or build watchtowers to see.</p>` : ''}
      ${foes.length ? `<p class="warn">Enemy armies in the field: ${foes.map((a) => escapeHtml(a.name)).join(', ')}.</p>` : ''}</div>
    <div data-part="companies"><h3>The crown's companies</h3>
      ${free.length ? free.map((c) => companyRow(world, state, c)).join('') : '<p class="sub">None yet. Recruit them from a town, city or castle of the crown.</p>'}</div>
    ${armies ? `<div data-part="armies"><h3>Armies in the field</h3>${armies}</div>` : ''}
  `;
}

// ---- A company's card ----

function select(name, options, value) {
  return `<select class="pick" data-pick="${name}" aria-label="${name}">${options.map(([v, label]) =>
    `<option value="${v}"${String(v) === String(value) ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select>`;
}

export function companyCardHtml(world, state, id, pick) {
  const c = state.forces.companies.find((x) => x.id === id);
  if (!c) return `<h2>Gone</h2>${back}<p class="sub">That company is no more.</p>`;
  const t = world.forces.companies[c.type];
  const crownPlaces = Object.keys(state.settlements).filter((p) => !state.settlements[p].occupier).sort((a, b) => world.byId[a].name.localeCompare(world.byId[b].name));
  const places = crownPlaces.map((p) => [p, world.byId[p].name]);
  pick.station ??= c.station;
  pick.from ??= c.order.from ?? c.station;
  pick.to ??= c.order.to ?? world.adjacency[c.station][0]?.to;
  pick.route ??= c.order.route ?? state.routes?.[0]?.id;
  const routes = (state.routes ?? []).map((r) => [r.id, `${world.byId[r.from].name} to ${world.byId[r.to].name}`]);
  const radius = c.order.radius ?? world.forces.respond.default;
  const targets = state.threats.list.filter((x) => x.sighted || x.campSeen).map((x) => {
    const o = huntOdds(state, world, [c], x);
    return `<button type="button" class="build" data-hunt="${x.id}"><span class="build-name">Hunt: ${escapeHtml(threatLabel(world, x))}</span>
      <span class="build-cost">${o.word}. ${escapeHtml(distanceWord(world, threatPos(x)))}.</span></button>`;
  }).join('');
  const armies = (state.armies ?? []).filter((a) => a.side !== TEMERIA && hostile(state, TEMERIA, a.side)).map((a) => {
    const o = huntOdds(state, world, [c], a);
    return `<button type="button" class="build" data-hunt-army="${a.id}"><span class="build-name">Attack: ${escapeHtml(a.name)}</span>
      <span class="build-cost">${o.word}. ${number(a.soldiers)} men.</span></button>`;
  }).join('');
  const target = targetOf(state, c);
  return `
    <div data-part="head"><h2>${escapeHtml(c.name)}</h2>
      <div class="menu-list"><button type="button" data-action="forces">All forces</button></div>
      <p class="sub">${escapeHtml(t.blurb)}</p>
      <dl class="stats">
        <div><dt>Men</dt><dd>${number(c.men)} <small>of ${c.max}${c.wounded >= 1 ? `, ${number(c.wounded)} wounded` : ''}</small></dd></div>
        <div><dt>Morale</dt><dd>${MORALE(c.morale)} ${moraleBar(c.morale)}</dd></div>
        <div><dt>Experience</dt><dd>${XP(c.xp)}${c.wins ? ` <small>(${c.wins} won)</small>` : ''}</dd></div>
        <div><dt>Pay</dt><dd>${number(companyUpkeep(world, c))} a month</dd></div>
      </dl>
      <p class="sub">${escapeHtml(describeCompany(state, world, c))}.</p>
      ${target ? `<p class="sub">Odds against its quarry: ${huntOdds(state, world, [c], target).word}.</p>` : ''}</div>
    ${c.army ? '<p class="sub">It marches with an army; give orders to the army.</p>' : `<div data-part="orders"><h3>Standing orders</h3>
      <div class="form-row"><span>Station</span>${select('station', places, pick.station)}<button type="button" class="chip" data-order-kind="station">Hold it</button></div>
      <div class="form-row"><span>Patrol</span>${select('from', places, pick.from)}<span>to</span>${select('to', places, pick.to)}<button type="button" class="chip" data-order-kind="patrol">Ride it</button></div>
      ${routes.length ? `<div class="form-row"><span>Escort</span>${select('route', routes, pick.route)}<button type="button" class="chip" data-order-kind="escort">Guard it</button></div>` : ''}
      <div class="form-row"><span>Respond</span><div class="chips">${world.forces.respond.radii.map((r) => `<button type="button" class="chip${c.order.kind === 'respond' && radius === r ? ' on' : ''}" data-respond="${r}">${r} miles</button>`).join(' ')}</div></div>
      <p class="sub">Respond: stay at its station, ride out to any threat sighted within that distance when the odds are fair, then come home.</p>
      <h3>Hunt</h3>
      ${targets || armies ? `<div class="build-list">${targets}${armies}</div>` : '<p class="sub">Nothing sighted to hunt.</p>'}
      <div class="menu-list"><button type="button" class="danger" data-disband-company>Stand the company down</button></div></div>`}
  `;
}

// ---- A threat's card ----

export function threatCardHtml(world, state, id) {
  const t = state.threats.list.find((x) => x.id === id);
  if (!t) return `<h2>Gone</h2>${back}<p class="sub">Whatever was there is gone.</p>`;
  const best = bestCompanyFor(state, world, t);
  const kind = {
    bandits: t.band ? 'A raiding band out of a camp in the wilds. It holds the roads, robbing what passes, and falls on weak villages.' : 'Outlaws camped in the wilds. The camp grows while the country round it is poor and restless, and sends bands to the roads.',
    monsters: 'Beasts with a lair in the wilds. They prey on the roads and the villages near, and grow bolder with time. Witchers deal with them best; troops can, at a cost in men.',
    scoiatael: 'Elven commandos out of the woods. They strike roads and patrols, then vanish back into the forest.',
    raiders: 'A war party from over the border, come to plunder and go home.',
  }[t.kind];
  const hunted = freeCompanies(state).filter((c) => c.task?.threat === t.id);
  const contract = state.threats.contracts.find((c) => c.threat === t.id);
  return `
    <div data-part="head"><h2>${escapeHtml(threatLabel(world, t))}</h2>
      <div class="menu-list"><button type="button" data-action="forces">All forces</button></div>
      <p class="sub">${escapeHtml(kind)}</p>
      <p class="sub">${escapeHtml(distanceWord(world, threatPos(t)))}.</p>
      ${hunted.length ? `<p class="sub">${escapeHtml(hunted.map((c) => c.name).join(', '))} ${hunted.length === 1 ? 'is' : 'are'} on the way.</p>` : ''}
      ${contract ? '<p class="sub">A witcher is on the trail.</p>' : ''}</div>
    <div data-part="act">
      ${best ? `<button type="button" class="build" data-send="${t.id}"><span class="build-name">Send ${escapeHtml(best.c.name)}</span>
        <span class="build-cost">Odds: ${best.odds.word}.</span></button>` : '<p class="sub">No company is free to send. Recruit one from a town.</p>'}
      ${t.kind === 'monsters' && !contract ? `<button type="button" class="build" data-witcher="${t.id}"><span class="build-name">Hire a witcher</span>
        <span class="build-cost">${number(witcherCost(state, world, t))} crowns. Nine in ten come back with a trophy; no soldier need die.</span></button>` : ''}
    </div>`;
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
    return `<button type="button" class="build" data-recruit="${type}" ${check.ok ? '' : 'disabled'}>
      <span class="build-name">${escapeHtml(t.name)}: ${t.men} men</span>
      <span class="build-blurb">${escapeHtml(t.blurb)}</span>
      <span class="build-cost">${check.ok ? `${number(cost.coin)} crowns${needs ? ` and ${needs} from store` : ''}${cost.short.arms ? ' (arms bought abroad)' : ''}${cost.short.horses && type !== 'knights' ? ' (horses bought abroad)' : ''}; ${number(t.men * t.upkeep)} a month.` : escapeHtml(check.reason)}</span></button>`;
  }).join('');
  if (!here.length && !rows) return '';
  return `<h3>Companies</h3>
    ${here.length ? here.map((c) => `<button type="button" class="chip" data-company="${c.id}">${escapeHtml(c.name)} (${number(c.men)})</button>`).join(' ') : ''}
    <p class="sub">Room for ${companySlots(state, world, id)} compan${companySlots(state, world, id) === 1 ? 'y' : 'ies'} stationed here; barracks allow more and better.</p>
    ${rows ? `<div class="build-list">${rows}</div>` : ''}`;
}
