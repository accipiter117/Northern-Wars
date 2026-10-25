import { relationTarget, foreignTrade, canSetStance, envoyText, formatDate, canOpenEmbassy, canSendSpy } from '../sim/index.js';
import { number, escapeHtml, describeLevel } from './format.js';
import { decisionHtml } from './faith.js';

const WORDS = ['Hostile', 'Cold', 'Wary', 'Cordial', 'Warm'];
const back = (action, label) => `<div class="menu-list"><button type="button" data-action="${action}">${label}</button></div>`;

function relationGauge(state, world, id) {
  const rel = state.neighbours[id].relation;
  const gap = relationTarget(state, world, id) - rel;
  const trend = gap > 2 ? ' <span class="up" aria-label="warming">&#9650;</span>' : gap < -2 ? ' <span class="down" aria-label="cooling">&#9660;</span>' : '';
  const pct = (rel + 100) / 2;
  return `<div class="gauge-row"><div class="lbl"><span>Relations</span><span>${describeLevel(pct, WORDS)}${trend}</span></div>
    <div class="gauge mood"><span style="width:${Math.round(pct)}%"></span></div></div>`;
}

function tradeLine(world, state, id) {
  const r = world.neighbours.realms[id];
  if (!r.trade) return 'Does not trade with outsiders';
  const t = foreignTrade(state, world).by[id];
  return t > 0 ? `${number(t)} crowns a month` : 'The border is closed to trade';
}

export function neighboursHtml(world, state) {
  const waiting = state.envoys.map((e) => {
    const t = envoyText(world, e);
    return `<button type="button" class="build" data-envoy="${e.id}"><span class="build-name">${escapeHtml(t.title)}</span>
      <span class="build-cost">From ${escapeHtml(world.geography.neighbours[e.realm].name)}, waiting since ${formatDate(e.day)}</span></button>`;
  }).join('');
  const rows = Object.keys(world.neighbours.realms).map((id) => {
    const n = state.neighbours[id];
    return `<button type="button" class="law-head realm-row" data-realm="${id}">
      <span class="build-name">${escapeHtml(world.geography.neighbours[id].name)}</span>
      <span class="law-now">${escapeHtml(world.neighbours.realms[id].ruler)}. ${describeLevel((n.relation + 100) / 2, WORDS)}, ${world.neighbours.stances[n.stance].name.toLowerCase()} stance. ${tradeLine(world, state, id)}.</span>
    </button>`;
  }).join('');
  return `
    <div data-part="head"><h2>Neighbouring realms</h2>${back('back', 'Back to the realm')}</div>
    <div data-part="envoys">${waiting ? `<h3>Envoys waiting</h3><div class="build-list">${waiting}</div>` : ''}</div>
    <div data-part="realms"><div class="realm-list">${rows}</div></div>
  `;
}

export function realmCardHtml(world, state, id) {
  const r = world.neighbours.realms[id];
  const n = state.neighbours[id];
  const cares = Object.entries(r.cares).map(([key, v]) => {
    const [law, option] = key.split(':');
    const name = world.laws.laws[law].options[option].name;
    return `<li class="${v > 0 ? 'up' : 'down'}">${v > 0 ? 'Pleased by' : 'Angered by'} ${escapeHtml(name.toLowerCase())}</li>`;
  }).join('');
  const stances = Object.entries(world.neighbours.stances).map(([sid, st]) => {
    if (sid === n.stance) return `<div class="law-option current"><span class="build-name">${st.name} (our stance)</span><span class="build-blurb">${escapeHtml(st.blurb)}</span></div>`;
    const check = canSetStance(state, world, id, sid);
    const cost = st.monthly ? `Costs ${st.monthly} crowns a month in gifts.` : 'Costs nothing.';
    return `<button type="button" class="build" data-stance="${sid}" ${check.ok ? '' : 'disabled'}>
      <span class="build-name">${st.name}</span><span class="build-blurb">${escapeHtml(st.blurb)}</span>
      <span class="build-cost">${check.ok ? cost : escapeHtml(check.reason)}</span></button>`;
  }).join('');
  return `
    <div data-part="head">
      <h2>${escapeHtml(world.geography.neighbours[id].name)}</h2>
      <p class="sub">Ruled by ${escapeHtml(r.ruler)}. ${escapeHtml(r.temper)}</p>
      ${back('neighbours', 'All neighbouring realms')}
    </div>
    <div data-part="relation">
      ${relationGauge(state, world, id)}
      <dl class="stats"><div><dt>Trade</dt><dd>${tradeLine(world, state, id)}</dd></div>
      <div><dt>Gateway</dt><dd>${escapeHtml(world.byId[r.gateway].name)}</dd></div></dl>
    </div>
    <div data-part="cares">${cares ? `<h3>What they care about</h3><ul class="cares">${cares}</ul>` : ''}</div>
    <div data-part="stance"><h3>Our stance</h3><div class="build-list">${stances}</div></div>
    ${world.realms ? `<div data-part="intel">${intelligenceHtml(world, state, id)}</div>` : ''}
  `;
}

export function envoyHtml(world, pending) {
  const t = envoyText(world, pending);
  return decisionHtml(`An envoy from ${world.geography.neighbours[pending.realm].name}`, t.title, t.text, t.choices);
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
      <h2>${escapeHtml(st.name)}</h2>
      <p class="sub">${TYPE_NAMES[st.type]}${capital ? `, seat of the crown of ${escapeHtml(realm)}` : ` in ${escapeHtml(realm)}`}. ${status}</p>
      <div class="menu-list"><button type="button" data-realm="${st.realm}">${escapeHtml(realm)}</button></div>
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
    ? `<button type="button" class="build" data-embassy="close"><span class="build-name">Close the embassy</span><span class="build-cost">Saves ${c.embassy.monthly} crowns a month.</span></button>`
    : (() => {
      const check = canOpenEmbassy(state, world, rid);
      return `<button type="button" class="build" data-embassy="open" ${check.ok ? '' : 'disabled'}><span class="build-name">Open an embassy</span>
        <span class="build-cost">${check.ok ? `${c.embassy.coin} crowns, then ${c.embassy.monthly} a month. Sees round their capital and brings their news.` : escapeHtml(check.reason)}</span></button>`;
    })();
  const spyCheck = canSendSpy(state, world, rid);
  const spy = `<button type="button" class="build" data-spy ${spyCheck.ok ? '' : 'disabled'}><span class="build-name">Send a spy</span>
    <span class="build-cost">${spyCheck.ok ? `${c.spy.coin} crowns. Shows the whole realm for ${c.spy.days} days; one in ${Math.round(1 / c.spy.discovery)} is caught.` : escapeHtml(spyCheck.reason)}</span></button>`;
  const seen = (world.foreignByRealm[rid] ?? []).filter((id) => state.ambient.intel?.seen[id]);
  const known = seen.map((id) => `<button type="button" class="chip" data-foreign="${id}">${escapeHtml(world.byId[id].name)}</button>`).join(' ');
  return `<h3>What we see</h3><p class="sub">${sight}</p>
    <div class="build-list">${embassy}${spy}</div>
    <h3>Places we know</h3><div class="chips">${known || '<p class="sub">None yet. Their land lies under the fog.</p>'}</div>`;
}
