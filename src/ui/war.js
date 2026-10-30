// The war panel, army cards and the war's part of the realm and town cards.
import {
  TEMERIA, formatDate, sideName, ownerOf, placesHeldBy, warsOf, warScore, exhaustion, heldValue, sideIndex, musterPreview,
  canRaise, canDeclare, peaceTerms, describeArmy, crownArmies, hostile, truceUntil, armyPosition, freeCompanies, houseRetinue, mercenaryOffer, canMerge,
} from '../sim/index.js';
import { number, escapeHtml } from './format.js';
import { icon } from './icons.js';
import { cardHead, orderAttr, section } from './card.js';
import { form } from './memory.js';
import { siegeHtml, attritionHtml, defendedSiegeHtml } from './battle.js';
import { companyLine } from './military.js';
const LEVIES = { none: 'No levy', third: 'A third', half: 'Half', all: 'All' };
const TERMS = {
  white: ['Peace as we were', 'Every town taken in this war goes back to its old master.'],
  keep: ['Each keeps what it holds', 'The towns taken stay with whoever holds them now.'],
  tribute: ['Peace, and tribute to us', 'We keep what we hold, and they pay us every month for two years.'],
  pay: ['Buy peace', 'Every town goes back, and we pay them to go home.'],
};

function standing(score) {
  if (score >= 40) return 'We are winning handsomely';
  if (score >= 10) return 'The war goes our way';
  if (score > -10) return 'Neither side has the better of it';
  if (score > -40) return 'The war goes against us';
  return 'We are being beaten';
}

function weariness(v) {
  return v >= 75 ? 'exhausted' : v >= 50 ? 'weary' : v >= 25 ? 'tiring' : 'fresh';
}

function warRowHtml(world, state, war) {
  const me = sideIndex(war, TEMERIA);
  const them = 1 - me;
  const foes = war.sides[them].map((r) => sideName(world, r)).join(' and ');
  const friends = war.sides[me].filter((r) => r !== TEMERIA).map((r) => sideName(world, r));
  const taken = war.taken.filter((t) => ownerOf(state, world, t.id) === TEMERIA).map((t) => world.byId[t.id].name);
  const lost = war.taken.filter((t) => t.from === TEMERIA && ownerOf(state, world, t.id) !== TEMERIA).map((t) => world.byId[t.id].name);
  const leads = war.sides[me][0] === TEMERIA;
  let peace;
  if (!leads) {
    peace = `<p class="sub">${escapeHtml(sideName(world, war.sides[me][0]))} leads this war and will make the peace.</p>
      <button type="button" class="build" data-withdraw="${war.id}" ${orderAttr({ type: 'withdraw', war: war.id }, 'Leave our friend to fight alone?')}><span class="build-name">Withdraw from the war</span>
      <span class="build-cost">Hand back what we took; our friend will not thank us.</span></button>`;
  } else {
    const t = peaceTerms(state, world, war);
    peace = t.list.map((term) => {
      const [name, blurb] = TERMS[term.key];
      const price = term.lump ? ` We pay ${number(term.lump)} crowns.` : term.monthly ? ` They pay ${term.monthly} crowns a month.` : '';
      const verdict = !t.ready ? `Too soon: no one makes peace in the first ${world.war.peace.minMonths} months.` : term.accept ? 'They would accept.' : 'They would refuse.';
      return `<button type="button" class="build" data-peace="${war.id}:${term.key}" ${orderAttr({ type: 'peace', war: war.id, terms: term.key }, 'Make peace on these terms?')} ${term.accept ? '' : 'disabled'}>
        <span class="build-name">${name}</span><span class="build-blurb">${blurb}${price}</span><span class="build-cost">${verdict}</span></button>`;
    }).join('');
  }
  return `<div class="war-row">
    <h3>Against ${escapeHtml(foes)}</h3>
    <p class="sub">Since ${formatDate(war.since)}${friends.length ? `, beside ${escapeHtml(friends.join(' and '))}` : ''}. ${standing(warScore(state, world, war, me))}; the enemy is ${weariness(exhaustion(state, world, war, them))}, our people ${weariness(exhaustion(state, world, war, me))}.</p>
    ${taken.length ? `<p class="sub">We hold: ${escapeHtml(taken.join(', '))}.</p>` : ''}
    ${lost.length ? `<p class="warn">They hold: ${escapeHtml(lost.join(', '))}.</p>` : ''}
    <div class="build-list">${peace}</div>
  </div>`;
}

function chips(name, options, value) {
  return `<div class="chips">${options.map(([v, label]) =>
    `<button type="button" class="chip${String(v) === String(value) ? ' on' : ''}" data-set="${name}:${v}" aria-pressed="${String(v) === String(value)}">${escapeHtml(label)}</button>`).join(' ')}</div>`;
}

export function musterPlaces(world, state) {
  return placesHeldBy(state, world, TEMERIA)
    .filter((id) => world.byId[id].type !== 'village' && world.byId[id].type !== 'temple')
    .sort((a, b) => world.byId[a].name.localeCompare(world.byId[b].name));
}

export const RAISE_DEFAULTS = { muster: 'vizima', levy: 'third', nobles: false, companies: 0, mercs: [], marshal: 'vestibor', stance: 'cautious', units: [] };

export function raiseForm(app) {
  const f = form(app.memory, 'raise', RAISE_DEFAULTS);
  const places = musterPlaces(app.world, app.state);
  if (!places.includes(f.muster)) f.muster = places[0];
  return f;
}

function raiseHtml(world, state, form) {
  const w = world.war;
  const p = musterPreview(state, world, form);
  const check = canRaise(state, world, form);
  // A marshal already in the field cannot lead a second army.
  const busy = new Set(crownArmies(state).map((a) => a.marshal));
  const marshals = Object.entries(w.marshals).filter(([id]) => !busy.has(id));
  if (busy.has(form.marshal)) form.marshal = marshals[0]?.[0] ?? null;
  const marshal = w.marshals[form.marshal];
  const refuse = p.refuse.map((h) => world.houses.houses[h].name);
  const standing = freeCompanies(state).filter((c) => !c.task);
  const action = { type: 'raise', ...form };
  const mc = w.raise.mercenaries?.companies ?? {};
  // The houses' likely retinues, before they are called (M21).
  const houses = Object.keys(state.houses ?? {}).map((h) => {
    const r = houseRetinue(state, world, h);
    return `${escapeHtml(world.houses.houses[h].name.replace('House ', ''))} ${r.refuse ? 'would refuse' : `${number(r.men)}${r.half ? ' (half-hearted)' : ''}`}`;
  }).join(', ');
  const mercs = Object.entries(mc).map(([id, m]) => {
    const offer = mercenaryOffer(state, world, id);
    const on = (form.mercs ?? []).includes(id);
    return `<button type="button" class="chip${on ? ' on' : ''}" data-merc="${id}" aria-pressed="${on}" ${offer.ok ? '' : 'disabled'} title="${escapeHtml(offer.ok ? m.blurb : offer.reason)}">${escapeHtml(m.name)} (${number(m.men)}, ${number(m.coin)} now)</button>`;
  }).join(' ');
  // The preview: men, hands taken from the works, the pay a month, the days
  // for the levies to gather (M21).
  const summary = p.hands !== undefined
    ? `${number(p.soldiers)} men: ${[p.levyMen ? `${number(p.levyMen)} levied` : '', p.retinueMen ? `${number(p.retinueMen)} from the lords` : '', p.mercMen ? `${number(p.mercMen)} hired` : '', p.unitMen ? `${number(p.unitMen)} standing` : ''].filter(Boolean).join(', ')}.`
    : `${number(p.soldiers)} men.`;
  const costs = p.hands !== undefined
    ? `${number(p.hands)} hands leave the works. ${number(p.monthly)} crowns a month (half as much again on campaign)${p.coin ? `, and ${number(p.coin)} now for the hired companies` : ''}. Gathers in ${p.days} days.`
    : '';
  return `<h3>Raise an army</h3>
    <p class="sub">The levy is a share of each place's people, more from the cities: the men leave the works while they are away. The lords send men by the size of their lands and their loyalty.</p>
    <button type="button" class="row" data-pick-start='{"kind":"muster"}'><span class="row-main"><span class="row-sub">Muster at</span><span class="row-name">${form.muster ? escapeHtml(world.byId[form.muster].name) : 'Nowhere'}</span></span><span class="row-end">${icon('target')} Change</span></button>
    <div class="form-row"><span>Crown levy</span>${chips('levy', Object.entries(LEVIES), form.levy)}</div>
    <div class="form-row"><span>The lords' men</span>${chips('nobles', [[true, 'Call them'], [false, 'Leave them']], form.nobles)}</div>
    ${houses ? `<p class="sub" data-part="retinues">Their likely men: ${houses}.</p>` : ''}
    ${mercs ? `<div class="form-row"><span>Mercenaries, for a season</span><div class="chips">${mercs}</div></div>` : ''}
    ${standing.length ? `<div class="form-row"><span>Standing companies</span><div class="chips">${standing.map((c) => {
      const on = (form.units ?? []).includes(c.id);
      return `<button type="button" class="chip${on ? ' on' : ''}" data-unit="${c.id}" aria-pressed="${on}">${escapeHtml(c.name)} (${number(c.men)})</button>`;
    }).join(' ')}</div></div>` : ''}
    <div class="form-row"><span>Marshal</span>${marshals.length ? chips('marshal', marshals.map(([id, m]) => [id, m.short]), form.marshal) : '<p class="sub">Every marshal is in the field.</p>'}</div>
    ${marshal ? `<p class="sub">${escapeHtml(marshal.name)}: ${escapeHtml(marshal.blurb)}</p>` : ''}
    <div class="form-row"><span>Stance</span>${chips('stance', Object.entries(w.stances).map(([id, s]) => [id, s.name]), form.stance)}</div>
    <p class="sub">${escapeHtml(w.stances[form.stance].blurb)}</p>
    <p class="sub" data-part="raise-preview"><b>${escapeHtml(summary)}</b> ${escapeHtml(costs)}</p>
    <button type="button" class="act primary wide" data-raise ${orderAttr(action)} ${check.ok ? '' : 'disabled'}><span class="act-label">Raise ${number(p.soldiers)} men</span>
      <span class="act-sub">${check.ok ? 'Call them to arms' : escapeHtml(check.reason)}</span></button>
    ${refuse.length ? `<p class="warn">${escapeHtml(refuse.join(', '))} would send excuses instead of men.</p>` : ''}`;
}

export function warHtml(app) {
  const { world, state, memory } = app;
  const f = raiseForm(app);
  const wars = warsOf(state, TEMERIA);
  const waiting = state.warDecisions.length;
  const armies = crownArmies(state).map((a) => `<button type="button" class="row realm-row" data-army="${a.id}" data-go="army:${a.id}">
    <span class="row-main"><span class="row-name">${escapeHtml(a.name)}</span><span class="row-sub">${escapeHtml(describeArmy(state, world, a).replace(`${a.name}, `, ''))}.</span></span></button>`).join('');
  const abroad = (state.wars ?? []).filter((w) => sideIndex(w, TEMERIA) < 0)
    .map((w) => `<li>${escapeHtml(w.sides.map((s) => s.map((r) => sideName(world, r)).join(' and ')).join(' against '))}, since ${formatDate(w.since)}</li>`).join('');
  const tributes = (state.tributes ?? []).filter((t) => t.until > state.day && (t.from === TEMERIA || t.to === TEMERIA))
    .map((t) => `<li>${t.to === TEMERIA ? `${escapeHtml(sideName(world, t.from))} pays us` : `We pay ${escapeHtml(sideName(world, t.to))}`} ${t.monthly} crowns a month until ${formatDate(t.until)}</li>`).join('');
  return `
    <div data-part="head"><p class="status"><span>${wars.length ? 'The realm is at war.' : 'The realm is at peace.'} Declare war from a neighbour\'s card under Diplomacy.</span></p>
      ${waiting ? `<button type="button" class="act wide" data-tab-go="court:inbox"><span class="act-label">${waiting} war decision${waiting === 1 ? '' : 's'} waiting</span><span class="act-sub">Answer under Court, Decisions</span></button>` : ''}</div>
    <div data-part="wars">${wars.map((w) => warRowHtml(world, state, w)).join('')}</div>
    <div data-part="armies"><h3>Our armies</h3>${armies ? `<div class="rows">${armies}</div>` : '<p class="sub">None in the field.</p>'}</div>
    <div data-part="raise" data-form="raise">${raiseHtml(world, state, f)}</div>
    ${abroad || tributes ? section(memory, 'tab:military', 'abroad', 'Abroad and tribute', `${abroad ? `<h3>Wars abroad that we know of</h3><ul class="cares">${abroad}</ul>` : ''}${tributes ? `<h3>Tribute</h3><ul class="cares">${tributes}</ul>` : ''}`) : '<div data-part="sec-abroad"></div>'}
  `;
}

// Where an army could be sent: our own places to hold, enemy places to
// besiege (every map names them, though the fog hides how they stand), and
// enemy realms to raid.
export function targets(world, state, a) {
  const from = armyPosition(world, a);
  const near = (id) => Math.hypot(world.byId[id].x - from.x, world.byId[id].y - from.y);
  const hold = musterPlaces(world, state).concat(placesHeldBy(state, world, TEMERIA).filter((id) => !musterPlaces(world, state).includes(id)))
    .sort((x, y) => near(x) - near(y));
  const siege = Object.keys(world.byId)
    .filter((id) => hostile(state, TEMERIA, ownerOf(state, world, id)))
    .sort((x, y) => near(x) - near(y));
  const raid = [...new Set(warsOf(state, TEMERIA).flatMap((w) => w.sides[1 - sideIndex(w, TEMERIA)]))];
  return { hold, siege, raid };
}

export function armyCard(app, id) {
  const { world, state } = app;
  const a = state.armies.find((x) => x.id === id);
  if (!a) return '<div data-part="head"><p class="sub">This army is no more.</p></div>';
  const w = world.war;
  const t = targets(world, state, a);
  const m = w.marshals[a.marshal];
  const raidChips = t.raid.map((r) => `<button type="button" class="chip" data-raid="${r}" ${orderAttr({ type: 'army', army: id, order: 'raid', target: r })}>${escapeHtml(sideName(world, r))}</button>`).join(' ');
  const pick = (kind, label, sub, ok = true) => `<button type="button" class="act" data-order-kind="${kind}" data-pick-start='{"kind":"${kind}","army":${id}}' ${ok ? '' : 'disabled'}><span class="act-label">${icon('target')} ${label}</span><span class="act-sub">${sub}</span></button>`;
  return `
    ${cardHead({
      status: `<span>${escapeHtml(describeArmy(state, world, a).replace(`${a.name}, `, ''))}.</span>`,
      chips: [
        { icon: 'people', label: 'Men', value: number(Math.round(a.soldiers)) },
        { label: 'Spirit', value: a.morale >= 75 ? 'Eager' : a.morale >= 50 ? 'Steady' : a.morale >= 30 ? 'Shaken' : 'Broken', tone: a.morale < 30 ? 'bad' : '' },
        { icon: 'crown', label: 'Marshal', value: m ? escapeHtml(m.short ?? m.name) : 'None' },
        { label: 'Companies', value: a.bands?.length ?? 0 },
      ],
    })}
    ${a.battle ? `<div data-part="inbattle"><button type="button" class="act primary" data-go="battle:${a.battle}"><span class="act-label">${icon('sword')} In battle: to the field</span></button></div>` : ''}
    ${siegeHtml(world, state, a)}
    <div data-part="attrition">${attritionHtml(a)}</div>
    <div data-part="orders"><h3>Orders</h3>
      <div class="actions">
        ${pick('hold', 'Hold a place', 'Meets any enemy that comes near')}
        ${pick('siege', 'Besiege', t.siege.length ? 'Starves or storms it, then holds it' : 'No enemy place we know of', t.siege.length > 0)}
      </div>
      ${raidChips ? `<div class="form-row"><span>Raid a realm</span><div class="chips">${raidChips}</div></div><p class="sub">Burns and plunders their unwalled towns and villages, then comes home.</p>` : ''}</div>
    <div data-part="stance"><h3>Stance</h3>
      <div class="chips">${Object.entries(w.stances).map(([sid, s]) => `<button type="button" class="chip${a.stance === sid ? ' on' : ''}" data-stance="${sid}" ${orderAttr({ type: 'army', army: id, order: a.order, target: a.target, stance: sid })} aria-pressed="${a.stance === sid}">${s.name}</button>`).join(' ')}</div>
      <p class="sub">${escapeHtml(w.stances[a.stance].blurb)}</p></div>
    ${companiesHtml(app, a)}
    <div data-part="disband"><button type="button" class="act danger" data-disband ${orderAttr({ type: 'disband', army: id }, `Stand down ${a.name}?`)} data-then="back"><span class="act-label">Stand the army down</span><span class="act-sub">The levies go home to their garrisons; the companies are paid off.</span></button></div>
  `;
}

// An army's companies (M22 C), each keeping its name, with what it adds;
// any one can be detached, and another army of ours in the same place can
// be joined to this one.
function companiesHtml(app, a) {
  const { world, state, memory } = app;
  if (!a.bands?.length || a.side !== TEMERIA) return '';
  const total = a.soldiers || 1;
  const sum = a.bands.reduce((v, b) => v + b.men, 0) || 1;
  const rows = a.bands.map((b, i) => {
    const men = Math.round((b.men * total) / sum);
    const what = b.source === 'standing' ? 'standing company' : b.source === 'levy' ? 'levy' : b.source === 'retinue' ? 'retinue' : b.source === 'mercenary' ? 'hired' : 'company';
    return `<li class="company-row" data-band="${i}"><span>${companyLine(world, { ...b, men })} <small>(${what})</small></span>${a.bands.length > 1 ? `<button type="button" class="chip" data-detach="${i}" ${orderAttr({ type: 'detach', army: a.id, band: i })}>Detach</button>` : ''}</li>`;
  });
  // Eight rows, then the rest folded (M21 F).
  const list = rows.length > 8 ? `${rows.slice(0, 8).join('')}<li><details class="more"><summary>${rows.length - 8} more</summary><ul class="companies">${rows.slice(8).join('')}</ul></details></li>` : rows.join('');
  const others = crownArmies(state).filter((x) => x !== a && canMerge(state, world, x, a).ok);
  const joins = others.map((x) => `<button type="button" class="act" data-merge="${x.id}" ${orderAttr({ type: 'merge', army: x.id, into: a.id })}><span class="act-label">Join ${escapeHtml(x.name)} to this army</span><span class="act-sub">${number(Math.round(x.soldiers))} men, ${x.bands?.length ?? 0} companies</span></button>`).join('');
  return `<div data-part="companies">${section(memory, `army:${a.id}`, 'companies', `Companies (${a.bands.length})`, `<ul class="companies">${list}</ul>`)}${joins ? `<div class="actions">${joins}</div>` : ''}</div>`;
}

// The realm card's war section: declare, or how the war with them stands.
export function realmWarHtml(world, state, rid) {
  if (world.war.noWar.includes(rid)) return '';
  if (hostile(state, TEMERIA, rid)) {
    return `<h3>War</h3><p class="warn">We are at war with them.</p><button type="button" class="act" data-tab-go="military:war"><span class="act-label">To the war</span></button>`;
  }
  const truce = truceUntil(state, TEMERIA, rid);
  const check = canDeclare(state, world, rid);
  const held = Object.keys(state.settlements).filter((id) => state.settlements[id].occupier === rid).map((id) => world.byId[id].name);
  return `<h3>War</h3>
    ${held.length ? `<p class="warn">They hold Temerian land: ${escapeHtml(held.join(', '))}. We have a just cause.</p>` : ''}
    ${truce > state.day ? `<p class="sub">A truce holds until ${formatDate(truce)}.</p>` : ''}
    <button type="button" class="build danger" data-declare ${orderAttr({ type: 'declare', realm: rid }, `Declare war on ${world.geography.neighbours[rid].name}?`)} data-then="tab:military:war" ${check.ok ? '' : 'disabled'}><span class="build-name">Declare war</span>
    <span class="build-cost">${check.ok ? (check.cost ? `Costs ${check.cost} Trust: the folk want a cause.` : 'A just cause: it costs no Trust.') : escapeHtml(check.reason)} Trade with them stops.</span></button>`;
}

// For a Temerian town under an enemy flag.
export function occupationHtml(world, state, id) {
  const s = state.settlements[id];
  if (!s.occupier) return '';
  return `<p class="warn">Held by ${escapeHtml(sideName(world, s.occupier))} since ${formatDate(s.occupiedSince)}. It pays the crown nothing and takes no orders from Vizima.</p>`;
}

// Battles and sieges round a place, for the town cards.
export function siegeNote(world, state, id) {
  const a = state.armies.find((x) => x.siege && x.at === id);
  return a ? `<p class="warn">Under siege by ${escapeHtml(a.name)} (${escapeHtml(sideName(world, a.side))}), ${number(Math.round(a.soldiers))} men.</p>${defendedSiegeHtml(world, state, id)}` : '';
}
