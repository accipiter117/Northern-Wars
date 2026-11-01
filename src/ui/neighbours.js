import { relationTarget, foreignTrade, canSetStance, formatDate, canOpenEmbassy, canSendSpy, hostile, TEMERIA, lawLabel,
} from '../sim/index.js';
import { number, escapeHtml, describeLevel } from './format.js';
import { realmWarHtml, siegeNote } from './war.js';
import { sideName } from '../sim/index.js';
import { cardHead, orderAttr, section } from './card.js';
import { dealFormHtml } from './market.js';
import { icon } from './icons.js';
import { pendingDecisions, inboxHtml } from './inbox.js';
import { portraitImg } from './audience.js';
import { occupiedHtml, fearHtml, fearWord, worthHtml } from './conquest.js';
import { parties, rulerShort, moodWord, treatyDef, intentions, tierOf, suzerainOf } from '../sim/index.js';

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

// The rulers of the North, each a portrait to tap for an audience.
export function rulersRowHtml(app) {
  const { world, state } = app;
  if (!world.diplomacy) return '';
  const waiting = new Set((state.diplomacy?.requests ?? []).map((q) => q.realm));
  return `<div data-part="rulers" class="rulers-row" role="list">${parties(world).map((pid) => {
    const rel = state.neighbours[pid]?.relation ?? 0;
    return `<button type="button" class="ruler-chip" role="listitem" data-audience="${pid}" aria-label="An audience with ${escapeHtml(rulerShort(world, pid))}">
      ${portraitImg(world, pid, 56)}${waiting.has(pid) ? '<span class="dot" aria-hidden="true"></span>' : ''}
      <span class="ruler-name">${escapeHtml(rulerShort(world, pid))}</span><span class="ruler-mood ${rel >= 5 ? 'good' : rel < -25 ? 'bad' : ''}">${moodWord(rel)}</span></button>`;
  }).join('')}</div>`;
}

const PACT_STYLE = {
  nonaggression: { colour: '#b5a27e', dash: '5 4', width: 1.6 },
  trade: { colour: '#d2ab5f', dash: '', width: 2 },
  defensive: { colour: '#6f8fc4', dash: '', width: 2.6 },
  alliance: { colour: '#c9573f', dash: '', width: 3.4 },
  access: { colour: '#7fa86a', dash: '2 4', width: 1.6 },
  protectorate: { colour: '#a77ac9', dash: '8 3', width: 2.4 },
};

// The web of pacts and wars across the North, drawn where each capital lies.
export function pactsHtml(app) {
  const { world, state } = app;
  if (!state.diplomacy) return '<div data-part="pacts"><p class="sub">No treaties in this realm.</p></div>';
  const ids = ['temeria', ...parties(world)];
  const at = (pid) => world.byId[pid === 'temeria' ? world.kingdom.capital : world.realms.realms[pid].capital];
  const pts = ids.map((p) => at(p));
  const x0 = Math.min(...pts.map((p) => p.x)) - 80;
  const x1 = Math.max(...pts.map((p) => p.x)) + 80;
  const y0 = Math.min(...pts.map((p) => p.y)) - 70;
  const y1 = Math.max(...pts.map((p) => p.y)) + 90;
  // Nodes and lines sized to the span of the North, so they read on a phone.
  const k = (x1 - x0) / 700;
  const lines = state.diplomacy.treaties.map((t) => {
    const a = at(t.a);
    const b = at(t.b);
    const st = PACT_STYLE[t.kind];
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${st.colour}" stroke-width="${st.width * 3 * k}" ${st.dash ? `stroke-dasharray="${st.dash.split(' ').map((n) => n * 3 * k).join(' ')}"` : ''} stroke-linecap="round"><title>${escapeHtml(treatyDef(world, t.kind).name)}: ${escapeHtml(sideName(world, t.a))} and ${escapeHtml(sideName(world, t.b))}</title></line>`;
  }).join('');
  const wars = (state.wars ?? []).flatMap((w) => w.sides[0].flatMap((a) => w.sides[1].map((b) => [a, b]))).filter(([a, b]) => ids.includes(a) && ids.includes(b)).map(([a, b]) => {
    const p = at(a);
    const q = at(b);
    return `<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" stroke="#e0432f" stroke-width="${5 * k}" stroke-dasharray="${4 * k} ${10 * k}" stroke-linecap="round"><title>War: ${escapeHtml(sideName(world, a))} and ${escapeHtml(sideName(world, b))}</title></line>`;
  }).join('');
  const nodes = ids.map((pid) => {
    const p = at(pid);
    const label = pid === 'temeria' ? 'Temeria' : sideName(world, pid);
    const r = 26 * k;
    const img = pid === 'temeria' ? `<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="#23365e" stroke="#d2ab5f" stroke-width="${3 * k}"/>`
      : `<image href="${portraitImg(world, pid, 48).match(/src="([^"]+)"/)[1]}" x="${p.x - r}" y="${p.y - r}" width="${2 * r}" height="${2 * r}"/>`;
    return `<g class="web-node"${pid === 'temeria' ? '' : ` data-audience="${pid}"`}>${img}<text x="${p.x}" y="${p.y + r + 20 * k}" text-anchor="middle" style="font-size:${20 * k}px;stroke-width:${4 * k}px">${escapeHtml(label)}</text></g>`;
  }).join('');
  const legend = Object.entries(PACT_STYLE).map(([k, st]) => `<span class="leg"><svg width="28" height="10" aria-hidden="true"><line x1="2" y1="5" x2="26" y2="5" stroke="${st.colour}" stroke-width="${st.width}" ${st.dash ? `stroke-dasharray="${st.dash}"` : ''}/></svg>${escapeHtml(treatyDef(world, k).name)}</span>`).join('')
    + '<span class="leg"><svg width="28" height="10" aria-hidden="true"><line x1="2" y1="5" x2="26" y2="5" stroke="#e0432f" stroke-width="2" stroke-dasharray="2 3"/></svg>At war</span>';
  const list = state.diplomacy.treaties.slice().sort((a, b) => (a.a === 'temeria' || a.b === 'temeria' ? -1 : 0) - (b.a === 'temeria' || b.b === 'temeria' ? -1 : 0))
    .map((t) => `<li>${escapeHtml(treatyDef(world, t.kind).name)}: ${escapeHtml(sideName(world, t.a))} and ${escapeHtml(sideName(world, t.b))}, until ${formatDate(t.until)}</li>`).join('');
  const recent = state.diplomacy.log.slice(-6).reverse().filter((l) => l.what !== 'made')
    .map((l) => `<li>${escapeHtml(treatyDef(world, l.kind).name)} between ${escapeHtml(sideName(world, l.a))} and ${escapeHtml(sideName(world, l.b))} ${l.what === 'broken' ? `broken by ${escapeHtml(sideName(world, l.by))}` : 'ran its course'}, ${formatDate(l.day)}</li>`).join('');
  return `<div data-part="pacts">
    <p class="sub">Who is bound to whom across the North. Tap a ruler for an audience.</p>
    <svg class="web" viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}" role="img" aria-label="The web of pacts and alliances">${wars}${lines}${nodes}</svg>
    <div class="legend">${legend}</div>
    <h3>Treaties in force</h3>${list ? `<ul class="plain">${list}</ul>` : '<p class="sub">None.</p>'}
    ${recent ? `<h3>Lately ended</h3><ul class="plain">${recent}</ul>` : ''}
  </div>`;
}

// One relations screen (M29 A), sorted by weight: the great powers in full,
// then our own vassals, the middle crowns, the other powers' spheres folded
// under each suzerain, and the independent petty kingdoms last.
export function neighboursHtml(app) {
  const { world, state } = app;
  const waiting = new Set([...state.envoys.map((e) => e.realm), ...(state.diplomacy?.requests ?? []).map((q) => q.realm)]);
  const row = (id, short = false) => {
    const n = state.neighbours[id];
    const fallen = state.realms?.[id]?.fallen;
    const fear = world.conquest && !fallen && (state.conquest?.fear?.[id]?.temeria ?? 0) >= 5 ? ` ${fearWord(state, id)} of us.` : '';
    const sub = fallen ? `Fell to ${escapeHtml(sideName(world, fallen.by))} in ${formatDate(fallen.day)}.`
      : short ? `${escapeHtml(world.neighbours.realms[id].ruler)}.`
        : `${escapeHtml(world.neighbours.realms[id].ruler)}. ${world.neighbours.stances[n.stance].name} stance. ${tradeLine(world, state, id)}.${fear}`;
    return `<button type="button" class="row realm-row${short ? ' short' : ''}" data-realm="${id}" data-tier="${tierOf(world, id)}" data-go="realm:${id}">
      ${icon('dove')}<span class="row-main"><span class="row-name">${escapeHtml(world.geography.neighbours[id].name)}${waiting.has(id) ? ' <span class="badge bad">Asks an audience</span>' : ''}${hostile(state, TEMERIA, id) ? ' <span class="badge bad">At war</span>' : ''}${fallen ? ' <span class="badge">Fallen</span>' : ''}</span>
      <span class="row-sub">${sub}</span></span>
      <span class="row-end">${fallen ? '' : `${describeLevel((n.relation + 100) / 2, WORDS)}${trendArrow(state, world, id)}`}</span></button>`;
  };
  const all = Object.keys(world.neighbours.realms);
  const by = (tier) => all.filter((id) => tierOf(world, id) === tier);
  const ours = all.filter((id) => suzerainOf(state, id) === TEMERIA);
  const great = by('great');
  const middle = by('middle').filter((id) => !ours.includes(id) && !suzerainOf(state, id));
  const spheres = great.map((g) => [g, all.filter((id) => suzerainOf(state, id) === g)]).filter(([, l]) => l.length);
  const free = [...by('petty'), ...by('none')].filter((id) => !suzerainOf(state, id) && !ours.includes(id));
  const group = (part, title, ids, short = false) => (ids.length ? `<div data-part="${part}"><h3>${title}</h3><div class="rows">${ids.map((id) => row(id, short)).join('')}</div></div>` : '');
  const folds = spheres.map(([g, l]) => `<details class="sphere" data-part="sphere-${g}"><summary>${escapeHtml(sideName(world, g))}'s sphere <small>(${l.length})</small></summary><div class="rows">${l.map((id) => row(id, true)).join('')}</div></details>`).join('');
  return `${rulersRowHtml(app)}<div data-part="realms">
    ${group('great', 'The great powers', great)}
    ${group('vassals', 'Our vassals', ours)}
    ${group('middle', 'The middle crowns', middle)}
    ${folds ? `<div data-part="spheres"><h3>Other powers' spheres</h3>${folds}</div>` : ''}
    ${group('petty', 'The petty kingdoms', free, true)}
  </div>${fearHtml(world, state)}`;
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
  const list = pendingDecisions(app.state, app.world).filter((d) => d.kind === 'envoy' || d.kind === 'request');
  return inboxHtml(list, { empty: 'No ruler waits for an audience.' });
}

export function realmCard(app, id) {
  const { world, state, memory } = app;
  const r = world.neighbours.realms[id];
  const n = state.neighbours[id];
  const route = `realm:${id}`;
  const cares = Object.entries(r.cares).map(([key, v]) => {
    const name = lawLabel(world, key);
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
  const envoys = pendingDecisions(state, world).filter((d) => (d.kind === 'envoy' || d.kind === 'request') && d.realm === id);
  const audience = world.diplomacy?.rulers[id]
    ? `<button type="button" class="act primary" data-audience="${id}"><span class="act-label">${icon('crown')} An audience with ${escapeHtml(rulerShort(world, id))}</span><span class="act-sub">Trade, diplomacy, alliances and war</span></button>` : '';
  const fallen = state.realms?.[id]?.fallen;
  if (fallen) {
    const c = (state.claimants ?? []).find((x) => x.realm === id);
    return `<div data-part="head"><p class="warn">${escapeHtml(world.geography.neighbours[id].name)} is no more: its last town fell to ${escapeHtml(sideName(world, fallen.by))} in ${formatDate(fallen.day)}.</p>
      <p class="sub">${c ? `${escapeHtml(r.ruler)} lives in exile${c.host ? ` at the court of ${escapeHtml(sideName(world, c.host))}` : ''}, still claiming the crown (legitimacy ${Math.round(c.legitimacy)}).` : 'Its old ruler has given up the claim.'}</p></div>${fearHtml(world, state)}`;
  }
  return `
    ${cardHead({
      status: `<span>Ruled by ${escapeHtml(r.ruler)}.${world.conquest ? ` ${fearWord(state, id)} of us.` : ''}</span>`,
      infoText: r.temper,
      actions: audience,
      chips: [
        { icon: 'dove', label: 'Relations', value: `${describeLevel((n.relation + 100) / 2, WORDS)}${trendArrow(state, world, id)}`, tone: n.relation < -30 ? 'bad' : n.relation > 30 ? 'good' : '' },
        { label: 'Stance', value: world.neighbours.stances[n.stance].name },
        { icon: 'coin', label: 'Trade', value: tradeLine(world, state, id) },
        { icon: 'castle', label: 'Gateway', value: escapeHtml(world.byId[r.gateway].name) },
      ],
    })}
    <div data-part="envoys">${envoys.length ? inboxHtml(envoys).replace(/data-part="[^"]*"/g, '') : ''}</div>
    <div data-part="stance"><h3>Our stance</h3><div class="build-list">${stances}</div></div>
    ${world.market && !hostile(state, TEMERIA, id) ? section(memory, route, 'trade', 'Trade', dealFormHtml(app, id, 'now'), { open: !!state.market?.deals?.[id] }) : ''}
    ${intentionsHtml(world, state, id)}
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
      ${occupiedHtml(world, state, id)}
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
    ${worthHtml(world, state, id, view)}
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

// What the crown knows of a ruler's intentions (M18): an embassy shows the
// posture and its main reason, a spy the war aim and any muster planned;
// otherwise only what merchants and travellers say.
export function intentionsHtml(world, state, rid) {
  const i = intentions(state, world, rid);
  if (!i) return '';
  const lines = [];
  if (i.posture) lines.push(`<p>${escapeHtml(i.posture)}</p>`);
  else lines.push(`<p class="sub">${escapeHtml(i.vague)} An embassy would tell us more.</p>`);
  if (i.aim) lines.push(`<p class="warn">${escapeHtml(i.aim)}</p>`);
  else if (i.posture) lines.push('<p class="sub">Only a spy would learn what war they mean to make.</p>');
  return `<div data-part="intent"><h3>Their intentions</h3>${lines.join('')}</div>`;
}
