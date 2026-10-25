// The war panel, army cards and the war's part of the realm and town cards.
import {
  TEMERIA, formatDate, sideName, ownerOf, placesHeldBy, warsOf, warScore, exhaustion, heldValue, sideIndex, musterPreview,
  canRaise, canDeclare, peaceTerms, describeArmy, crownArmies, warDecisionText, hostile, truceUntil, armyPosition, freeCompanies,
} from '../sim/index.js';
import { number, escapeHtml } from './format.js';
import { decisionHtml } from './faith.js';

const back = '<div class="menu-list"><button type="button" data-action="back">Back to the realm</button></div>';
const LEVIES = { none: 'No levy', third: 'A third', half: 'Half' };
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
      <button type="button" class="build" data-withdraw="${war.id}"><span class="build-name">Withdraw from the war</span>
      <span class="build-cost">Hand back what we took; our friend will not thank us.</span></button>`;
  } else {
    const t = peaceTerms(state, world, war);
    peace = t.list.map((term) => {
      const [name, blurb] = TERMS[term.key];
      const price = term.lump ? ` We pay ${number(term.lump)} crowns.` : term.monthly ? ` They pay ${term.monthly} crowns a month.` : '';
      const verdict = !t.ready ? `Too soon: no one makes peace in the first ${world.war.peace.minMonths} months.` : term.accept ? 'They would accept.' : 'They would refuse.';
      return `<button type="button" class="build" data-peace="${war.id}:${term.key}" ${term.accept ? '' : 'disabled'}>
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

function select(name, options, value) {
  return `<select class="pick" data-pick="${name}" aria-label="${name}">${options.map(([v, label]) =>
    `<option value="${v}"${v === value ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select>`;
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

function raiseHtml(world, state, form) {
  const w = world.war;
  const p = musterPreview(state, world, form);
  const check = canRaise(state, world, form);
  // A marshal already in the field cannot lead a second army.
  const busy = new Set(crownArmies(state).map((a) => a.marshal));
  const marshals = Object.entries(w.marshals).filter(([id]) => !busy.has(id));
  if (busy.has(form.marshal)) form.marshal = marshals[0]?.[0] ?? null;
  const marshal = w.marshals[form.marshal];
  const parts = [];
  if (Object.keys(p.levy).length) parts.push(`${number(p.soldiers - p.companies * w.raise.company - p.unitMen)} levied men`);
  if (p.companies) parts.push(`${p.companies * w.raise.company} hired swords (${number(p.coin)} crowns now, ${p.companies * w.raise.companyMonthly} a month)`);
  const refuse = p.refuse.map((h) => world.houses.houses[h].name);
  const standing = freeCompanies(state).filter((c) => !c.task);
  if (p.units.length) parts.push(`${p.units.length} standing compan${p.units.length === 1 ? 'y' : 'ies'} (${number(p.unitMen)} men)`);
  return `<h3>Raise an army</h3>
    <p class="sub">Levied men leave their garrisons thin and their fields untended. The lords resent sending theirs. Hired companies cost coin and nothing else.</p>
    <div class="form-row"><span>Muster at</span>${select('muster', musterPlaces(world, state).map((id) => [id, world.byId[id].name]), form.muster)}</div>
    <div class="form-row"><span>Crown levy</span>${chips('levy', Object.entries(LEVIES), form.levy)}</div>
    <div class="form-row"><span>The lords' men</span>${chips('nobles', [[true, 'Call them'], [false, 'Leave them']], form.nobles)}</div>
    <div class="form-row"><span>Hired companies</span>${chips('companies', [0, 1, 2, 3, 4, 5].map((n) => [n, String(n)]), form.companies)}</div>
    ${standing.length ? `<div class="form-row"><span>Standing companies</span><div class="chips">${standing.map((c) => {
      const on = (form.units ?? []).includes(c.id);
      return `<button type="button" class="chip${on ? ' on' : ''}" data-unit="${c.id}" aria-pressed="${on}">${escapeHtml(c.name)} (${number(c.men)})</button>`;
    }).join(' ')}</div></div>` : ''}
    <div class="form-row"><span>Marshal</span>${marshals.length ? chips('marshal', marshals.map(([id, m]) => [id, m.short]), form.marshal) : '<p class="sub">Every marshal is in the field.</p>'}</div>
    ${marshal ? `<p class="sub">${escapeHtml(marshal.name)}: ${escapeHtml(marshal.blurb)}</p>` : ''}
    <div class="form-row"><span>Stance</span>${chips('stance', Object.entries(w.stances).map(([id, s]) => [id, s.name]), form.stance)}</div>
    <p class="sub">${escapeHtml(w.stances[form.stance].blurb)}</p>
    <button type="button" class="build" data-raise ${check.ok ? '' : 'disabled'}><span class="build-name">Raise ${number(p.soldiers)} men</span>
      <span class="build-cost">${check.ok ? escapeHtml(parts.join(', ') || 'No one') : escapeHtml(check.reason)}</span></button>
    ${refuse.length ? `<p class="warn">${escapeHtml(refuse.join(', '))} would send excuses instead of men.</p>` : ''}`;
}

export function warHtml(world, state, form) {
  const wars = warsOf(state, TEMERIA);
  const waiting = state.warDecisions.map((d) => {
    const t = warDecisionText(state, world, d);
    return `<button type="button" class="build" data-war-decision="${d.id}"><span class="build-name">${escapeHtml(t.title)}</span>
      <span class="build-cost">${escapeHtml(t.kicker)}, waiting since ${formatDate(d.day)}</span></button>`;
  }).join('');
  const armies = crownArmies(state).map((a) => `<button type="button" class="law-head realm-row" data-army="${a.id}">
    <span class="build-name">${escapeHtml(a.name)}</span><span class="law-now">${escapeHtml(describeArmy(state, world, a).replace(`${a.name}, `, ''))}.</span></button>`).join('');
  const abroad = (state.wars ?? []).filter((w) => sideIndex(w, TEMERIA) < 0)
    .map((w) => `<li>${escapeHtml(w.sides.map((s) => s.map((r) => sideName(world, r)).join(' and ')).join(' against '))}, since ${formatDate(w.since)}</li>`).join('');
  const tributes = (state.tributes ?? []).filter((t) => t.until > state.day && (t.from === TEMERIA || t.to === TEMERIA))
    .map((t) => `<li>${t.to === TEMERIA ? `${escapeHtml(sideName(world, t.from))} pays us` : `We pay ${escapeHtml(sideName(world, t.to))}`} ${t.monthly} crowns a month until ${formatDate(t.until)}</li>`).join('');
  return `
    <div data-part="head"><h2>War</h2>${back}
      <p class="sub">${wars.length ? `The realm is at war.` : 'The realm is at peace.'} Declare war from a neighbour's card under Neighbouring realms.</p></div>
    <div data-part="decisions">${waiting ? `<h3>Waiting on the crown</h3><div class="build-list">${waiting}</div>` : ''}</div>
    <div data-part="wars">${wars.map((w) => warRowHtml(world, state, w)).join('')}</div>
    <div data-part="armies"><h3>Our armies</h3>${armies ? `<div class="realm-list">${armies}</div>` : '<p class="sub">None in the field.</p>'}</div>
    <div data-part="raise">${raiseHtml(world, state, form)}</div>
    <div data-part="abroad">${abroad ? `<h3>Wars abroad that we know of</h3><ul class="cares">${abroad}</ul>` : ''}
      ${tributes ? `<h3>Tribute</h3><ul class="cares">${tributes}</ul>` : ''}</div>
  `;
}

// Where an army could be sent: our own places to hold, enemy places to
// besiege (every map names them, though the fog hides how they stand), and
// enemy realms to raid.
function targets(world, state, a) {
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

export function armyCardHtml(world, state, id, pick) {
  const a = state.armies.find((x) => x.id === id);
  if (!a) return `<div data-part="head"><h2>Gone</h2><p class="sub">This army is no more.</p>${back}</div>`;
  const w = world.war;
  const t = targets(world, state, a);
  const m = w.marshals[a.marshal];
  const label = (sid) => `${world.byId[sid].name} (${sideName(world, ownerOf(state, world, sid))}${state.settlements[sid] || state.ambient.intel?.seen[sid] ? '' : ', unscouted'})`;
  const holdSel = select('hold', t.hold.map((sid) => [sid, world.byId[sid].name]), pick.hold ?? t.hold[0]);
  const siegeSel = t.siege.length ? select('siege', t.siege.map((sid) => [sid, label(sid)]), pick.siege ?? t.siege[0]) : '';
  const raidChips = t.raid.map((r) => `<button type="button" class="chip" data-raid="${r}">${escapeHtml(sideName(world, r))}</button>`).join(' ');
  return `
    <div data-part="head">
      <h2>${escapeHtml(a.name)}</h2>
      <p class="sub">${escapeHtml(describeArmy(state, world, a).replace(`${a.name}, `, ''))}.</p>
      <div class="menu-list"><button type="button" data-action="war">All our wars and armies</button></div>
    </div>
    <div data-part="stats">
      <dl class="stats">
        <div><dt>Men</dt><dd>${number(Math.round(a.soldiers))}</dd></div>
        <div><dt>Spirit</dt><dd>${a.morale >= 75 ? 'Eager' : a.morale >= 50 ? 'Steady' : a.morale >= 30 ? 'Shaken' : 'Broken'}</dd></div>
        <div><dt>Marshal</dt><dd>${m ? escapeHtml(m.name) : 'None'}</dd></div>
        <div><dt>Hired</dt><dd>${a.companies ? `${a.companies} compan${a.companies === 1 ? 'y' : 'ies'}` : 'None'}</dd></div>
      </dl>
      ${a.siege ? `<p class="sub">The siege is ${Math.round(a.siege.progress)}% of the way to starving them out.</p>` : ''}
    </div>
    <div data-part="stance"><h3>Stance</h3>
      <div class="chips">${Object.entries(w.stances).map(([sid, s]) => `<button type="button" class="chip${a.stance === sid ? ' on' : ''}" data-stance="${sid}" aria-pressed="${a.stance === sid}">${s.name}</button>`).join(' ')}</div>
      <p class="sub">${escapeHtml(w.stances[a.stance].blurb)}</p></div>
    <div data-part="orders"><h3>Orders</h3>
      <div class="patrol-order">${holdSel}<button type="button" class="build" data-order="defend"><span class="build-name">Hold it</span></button></div>
      <p class="sub">Holds the place and marches out to meet any enemy army that comes near.</p>
      ${siegeSel ? `<div class="patrol-order">${siegeSel}<button type="button" class="build" data-order="siege"><span class="build-name">Besiege it</span></button></div>
      <p class="sub">Marches there, starves it out or storms it, and holds it once taken.</p>` : '<p class="sub">No enemy place we know of to besiege.</p>'}
      ${raidChips ? `<h3>Raid a realm</h3><div class="chips">${raidChips}</div><p class="sub">Burns and plunders their unwalled towns and villages, then comes home.</p>` : ''}
      <button type="button" class="build danger" data-disband><span class="build-name">Stand the army down</span><span class="build-cost">The levies go home to their garrisons; the companies are paid off.</span></button>
    </div>
  `;
}

export function warDecisionHtml(world, state, d) {
  const t = warDecisionText(state, world, d);
  return decisionHtml(t.kicker, t.title, t.text, t.choices);
}

// The realm card's war section: declare, or how the war with them stands.
export function realmWarHtml(world, state, rid) {
  if (world.war.noWar.includes(rid)) return '';
  if (hostile(state, TEMERIA, rid)) {
    return `<h3>War</h3><p class="warn">We are at war with them.</p><div class="menu-list"><button type="button" data-action="war">To the war</button></div>`;
  }
  const truce = truceUntil(state, TEMERIA, rid);
  const check = canDeclare(state, world, rid);
  const held = Object.keys(state.settlements).filter((id) => state.settlements[id].occupier === rid).map((id) => world.byId[id].name);
  return `<h3>War</h3>
    ${held.length ? `<p class="warn">They hold Temerian land: ${escapeHtml(held.join(', '))}. We have a just cause.</p>` : ''}
    ${truce > state.day ? `<p class="sub">A truce holds until ${formatDate(truce)}.</p>` : ''}
    <button type="button" class="build danger" data-declare ${check.ok ? '' : 'disabled'}><span class="build-name">Declare war</span>
    <span class="build-cost">${check.ok ? (check.cost ? `Costs ${check.cost} Authority: the lords want a cause.` : 'A just cause: it costs no Authority.') : escapeHtml(check.reason)} Trade with them stops.</span></button>`;
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
  return a ? `<p class="warn">Under siege by ${escapeHtml(a.name)} (${escapeHtml(sideName(world, a.side))}), ${number(Math.round(a.soldiers))} men.</p>` : '';
}
