import { relationTarget, foreignTrade, canSetStance, formatDate, canOpenEmbassy, canSendSpy, hostile, TEMERIA } from '../sim/index.js';
import { number, escapeHtml, describeLevel } from './format.js';
import { realmWarHtml, siegeNote } from './war.js';
import { sideName } from '../sim/index.js';
import { cardHead, orderAttr, section } from './card.js';
import { icon } from './icons.js';
import { pendingDecisions, inboxHtml } from './inbox.js';

const WORDS = ['Hostile', 'Cold', 'Wary', 'Cordial', 'Warm'];

function tradeLine(world, state, id) {
  const r = world.neighbours.realms[id];
  if (!r.trade) return 'Does not trade with outsiders';
  const t = foreignTrade(state, world).by[id];
  return t > 0 ? `${number(t)} crowns a month` : 'The border is closed to trade';
}

function trendArrow(state, world, id) {
  const gap = relationTarget(state, world, id) - state.neighbours[id].relation;
  return gap > 2 ? ' <small class="up">\u25B2</small>' : gap < -2 ? ' <small class="down">\u25BC</small>' : '';
}

export function neighboursHtml(app) {
  const { world, state } = app;
  const waiting = new Set(state.envoys.map((e) => e.realm));
  const rows = Object.keys(world.neighbours.realms).map((id) => {
    const n = state.neighbours[id];
    return `<button type="button" class="row realm-row" data-realm="${id}" data-go="realm:${id}">
      ${icon('dove')}<span class="row-main"><span class="row-name">${escapeHtml(world.geography.neighbours[id].name)}${waiting.has(id) ? ' <span class="badge bad">Envoy waiting</span>' : ''}${hostile(state, TEMERIA, id) ? ' <span class="badge bad">At war</span>' : ''}</span>
      <span class="row-sub">${escapeHtml(world.neighbours.realms[id].ruler)}. ${world.neighbours.stances[n.stance].name} stance. ${tradeLine(world, state, id)}.</span></span>
      <span class="row-end">${describeLevel((n.relation + 100) / 2, WORDS)}${trendArrow(state, world, id)}</span></button>`;
  }).join('');
  return `<div data-part="realms"><div class="rows">${rows}</div></div>`;
}

// What the crown can see of each realm, and its embassies and spies.
export function intelListHtml(app) {
  const { world, state } = app;
  if (!world.realms) return '<div data-part="intel"><p class="sub">Nothing known.</p></div>';
  const c = world.realms.intelligence;
  const embassies = Object.keys(state.embassies ?? {}).filter((r) => state.embassies[r]).length;
  const spies = Object.keys(state.spies ?? {}).filter((r) => state.spies[r] > state.day).length;
  const rows = Object.keys(world.neighbours.realms).map((rid) => {
    const bits = [];
    if ((state.spies[rid] ?? 0) > state.day) bits.push(`an agent until ${formatDate(state.spies[rid])}`);
    if (state.embassies[rid]) bits.push('an embassy');
    const known = (world.foreignByRealm[rid] ?? []).filter((id) => state.ambient.intel?.seen[id]).length;
    return `<button type="button" class="row realm-row" data-go="realm:${rid}">
      <span class="row-main"><span class="row-name">${escapeHtml(world.geography.neighbours[rid].name)}</span>
      <span class="row-sub">${bits.length ? `We have ${bits.join(' and ')}.` : 'Only what our border watchers see.'} ${known} place${known === 1 ? '' : 's'} known.</span></span></button>`;
  }).join('');
  return `${cardHead({
    status: '<span>Embassies watch a capital and bring its news; spies show a whole realm for a time, at the risk of being caught. Open a realm to send either.</span>',
    chips: [{ icon: 'castle', label: 'Embassies', value: embassies }, { icon: 'target', label: 'Spies abroad', value: spies }, { icon: 'coin', label: 'Embassy', value: `${c.embassy.monthly} a month` }],
  })}<div data-part="intel"><div class="rows">${rows}</div></div>`;
}

export function envoysHtml(app) {
  const list = pendingDecisions(app.state, app.world).filter((d) => d.kind === 'envoy');
  return inboxHtml(list, { empty: 'No envoy waits at court.' });
}

export function realmCard(app, id) {
  const { world, state, memory } = app;
  const r = world.neighbours.realms[id];
  const n = state.neighbours[id];
  const route = `realm:${id}`;
  const cares = Object.entries(r.cares).map(([key, v]) => {
    const [law, option] = key.split(':');
    const name = world.laws.laws[law].options[option].name;
    return `<li class="${v > 0 ? 'up' : 'down'}">${v > 0 ? 'Pleased by' : 'Angered by'} ${escapeHtml(name.toLowerCase())}</li>`;
  }).join('');
  const stances = Object.entries(world.neighbours.stances).map(([sid, st]) => {
    if (sid === n.stance) return `<div class="law-option current"><span class="build-name">${st.name} (our stance)</span><span class="build-blurb">${escapeHtml(st.blurb)}</span></div>`;
    const check = canSetStance(state, world, id, sid);
    const cost = st.monthly ? `Costs ${st.monthly} crowns a month in gifts.` : 'Costs nothing.';
    return `<button type="button" class="build" data-stance="${sid}" ${orderAttr({ type: 'stance', realm: id, stance: sid })} ${check.ok ? '' : 'disabled'}>
      <span class="build-name">${st.name}</span><span class="build-blurb">${escapeHtml(st.blurb)}</span>
      <span class="build-cost">${check.ok ? cost : escapeHtml(check.reason)}</span></button>`;
  }).join('');
  const envoys = pendingDecisions(state, world).filter((d) => d.kind === 'envoy' && d.realm === id);
  return `
    ${cardHead({
      status: `<span>Ruled by ${escapeHtml(r.ruler)}.</span>`,
      infoText: r.temper,
      chips: [
        { icon: 'dove', label: 'Relations', value: `${describeLevel((n.relation + 100) / 2, WORDS)}${trendArrow(state, world, id)}`, tone: n.relation < -30 ? 'bad' : n.relation > 30 ? 'good' : '' },
        { label: 'Stance', value: world.neighbours.stances[n.stance].name },
        { icon: 'coin', label: 'Trade', value: tradeLine(world, state, id) },
        { icon: 'castle', label: 'Gateway', value: escapeHtml(world.byId[r.gateway].name) },
      ],
    })}
    <div data-part="envoys">${envoys.length ? inboxHtml(envoys).replace(/data-part="[^"]*"/g, '') : ''}</div>
    <div data-part="stance"><h3>Our stance</h3><div class="build-list">${stances}</div></div>
    ${world.war ? `<div data-part="war">${realmWarHtml(world, state, id)}</div>` : ''}
    ${world.realms ? `<div data-part="intel">${intelligenceHtml(world, state, id)}</div>` : ''}
    ${section(memory, route, 'cares', 'What they care about', cares ? `<ul class="cares">${cares}</ul>` : '')}
  `;
}

const PROSPERITY_WORDS = ['Destitute', 'Poor', 'Getting by', 'Comfortable', 'Thriving'];
const TYPE_NAMES = { city: 'City', town: 'Town', village: 'Village', castle: 'Castle', temple: 'Sacred place' };

// Round figures, as a spy or a passing merchant would report them.
function about(n) {
  if (n < 100) return `${Math.round(n / 10) * 10 || 'a few'}`;
  const step = n < 1000 ? 50 : n < 10000 ? 500 : 1000;
  return `about ${number(Math.round(n / step) * step)}`;
}

// What the crown knows of a foreign town: as it stands, if someone of ours
// can see it now, or as it was when last seen.
export function foreignCardHtml(world, state, id, view) {
  const st = world.byId[id];
  const realm = world.geography.neighbours[st.realm].name;
  const seenOn = state.ambient.intel?.seen[id]?.day;
  const status = view.visible ? 'In sight now.' : `As our watchers last saw it, on ${formatDate(seenOn)}.`;
  const built = view.buildings.map((b) => `<li>${escapeHtml(world.buildings[b].name)}</li>`).join('');
  const capital = world.realms.realms[st.realm]?.capital === id;
  return `
    <div data-part="head">
      <p class="sub">${TYPE_NAMES[st.type]}${capital ? `, seat of the crown of ${escapeHtml(realm)}` : ` in ${escapeHtml(realm)}`}. ${status}</p>
      ${view.owner && view.owner !== st.realm ? `<p class="warn">Held by ${escapeHtml(sideName(world, view.owner))}.</p>` : ''}
      ${view.visible && world.war ? siegeNote(world, state, id) : ''}
      <button type="button" class="act" data-realm="${st.realm}" data-go="realm:${st.realm}"><span class="act-label">${escapeHtml(realm)}</span></button>
    </div>
    <div data-part="stats">
      <dl class="stats">
        <div><dt>People</dt><dd>${about(view.population)}</dd></div>
        <div><dt>Soldiers</dt><dd>${view.garrison ? about(view.garrison) : 'None seen'}</dd></div>
        <div><dt>Fortunes</dt><dd>${describeLevel(view.prosperity ?? 50, PROSPERITY_WORDS)}</dd></div>
        <div><dt>Works</dt><dd>${view.construction ? `Raising a ${escapeHtml(world.buildings[view.construction].name.toLowerCase())}` : 'None'}</dd></div>
      </dl>
      <h3>Buildings</h3>${built ? `<ul class="built">${built}</ul>` : '<p class="sub">Nothing of note.</p>'}
    </div>
  `;
}

// The realm card's intelligence section: what the crown can see of it and
// the means of seeing more.
export function intelligenceHtml(world, state, rid) {
  const v = world.realms.vision;
  const n = state.neighbours[rid];
  const c = world.realms.intelligence;
  let sight = 'Only what our border watchers and merchants can see.';
  if ((state.spies[rid] ?? 0) > state.day) sight = `All of it, through our agent, until ${formatDate(state.spies[rid])}.`;
  else if (n.stance === 'friendly' && n.relation >= v.allyAt) sight = 'All of it: they are true friends and hide nothing.';
  else if (n.stance === 'friendly' && n.relation >= v.friendlyAt) sight = 'The country round their towns, which they share as friends.';
  if (state.embassies[rid]) sight += ' Our embassy watches their capital.';
  const embassy = state.embassies[rid]
    ? `<button type="button" class="build" data-embassy="close" ${orderAttr({ type: 'embassy', realm: rid, close: true })}><span class="build-name">Close the embassy</span><span class="build-cost">Saves ${c.embassy.monthly} crowns a month.</span></button>`
    : (() => {
      const check = canOpenEmbassy(state, world, rid);
      return `<button type="button" class="build" data-embassy="open" ${orderAttr({ type: 'embassy', realm: rid, close: false })} ${check.ok ? '' : 'disabled'}><span class="build-name">Open an embassy</span>
        <span class="build-cost">${check.ok ? `${c.embassy.coin} crowns, then ${c.embassy.monthly} a month. Sees round their capital and brings their news.` : escapeHtml(check.reason)}</span></button>`;
    })();
  const spyCheck = canSendSpy(state, world, rid);
  const spy = `<button type="button" class="build" data-spy ${orderAttr({ type: 'spy', realm: rid }, `Send a spy into ${world.geography.neighbours[rid].name}? If caught, they will not forget it.`)} ${spyCheck.ok ? '' : 'disabled'}><span class="build-name">Send a spy</span>
    <span class="build-cost">${spyCheck.ok ? `${c.spy.coin} crowns. Shows the whole realm for ${c.spy.days} days; one in ${Math.round(1 / c.spy.discovery)} is caught.` : escapeHtml(spyCheck.reason)}</span></button>`;
  const seen = (world.foreignByRealm[rid] ?? []).filter((id) => state.ambient.intel?.seen[id]);
  const known = seen.map((id) => `<button type="button" class="chip" data-foreign="${id}" data-go="foreign:${id}">${escapeHtml(world.byId[id].name)}</button>`).join(' ');
  return `<h3>What we see</h3><p class="sub">${sight}</p>
    <div class="build-list">${embassy}${spy}</div>
    <h3>Places we know</h3><div class="chips">${known || '<p class="sub">None yet. Their land lies under the fog.</p>'}</div>`;
}
