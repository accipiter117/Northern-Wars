import { relationTarget, foreignTrade, canSetStance, envoyText, formatDate } from '../sim/index.js';
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
  `;
}

export function envoyHtml(world, pending) {
  const t = envoyText(world, pending);
  return decisionHtml(`An envoy from ${world.geography.neighbours[pending.realm].name}`, t.title, t.text, t.choices);
}
