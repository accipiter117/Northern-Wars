// The audience: a full-screen meeting with a ruler. The top half is the
// ruler (portrait, name, realm, temper, mood and the reasons for it); the
// bottom half is four large buttons, Trade, Diplomacy, Alliance and War,
// each opening its own panel. Back returns to the four buttons; closing
// returns to wherever the player came from. Every order goes through the
// simulation's own rules, like everything else.
import {
  TEMERIA, rulerOf, rulerName, rulerShort, agendaText, agendaOf, trustIn, moodReasons, moodWord, treatiesOf, treatyBetween, treatyDef,
  partnerOf, fearOf, weighDeal, counterOffer, proposeDeal, canSign, itemProblem, describeItem, goodsInHand, ourValue,
  canGift, canDenounce, canDemandTribute, tributeAsk, asksOf, canAsk, canUltimatum, warReasons, canDeclareWith, reasonCost,
  canSetStance, canOpenEmbassy, canSendSpy, hostile, warsOf, sideIndex, sideName, ownerOf, routeValue, canDeclare, formatDate,
  realmPotential, valueOf, intentions,
} from '../sim/index.js';
import { drawPortrait } from '../render/portraits.js';
import { escapeHtml, number } from './format.js';
import { icon } from './icons.js';
import { orderAttr } from './card.js';

// ---- Portraits as images, drawn once per ruler and size ----

const portraits = new Map();
export function portraitUrl(world, pid, size = 96) {
  const key = `${pid}:${size}`;
  if (portraits.has(key)) return portraits.get(key);
  const c = document.createElement('canvas');
  const px = size * 2;
  c.width = px;
  c.height = px;
  drawPortrait(c.getContext('2d'), px / 2, px / 2, px, rulerOf(world, pid), world.realms?.realms[pid]?.colours);
  const url = c.toDataURL('image/png');
  portraits.set(key, url);
  return url;
}

export function portraitImg(world, pid, size = 96, cls = '') {
  return `<img class="portrait${cls ? ` ${cls}` : ''}" src="${portraitUrl(world, pid, size)}" width="${size}" height="${size}" alt="" draggable="false">`;
}

const signed = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v))}`;

// A ruler's greeting, from their mood and trust: short, plain, generated.
function greeting(world, state, pid) {
  const name = rulerShort(world, pid);
  const rel = state.neighbours[pid]?.relation ?? 0;
  const trust = trustIn(state, world, pid, TEMERIA);
  if (hostile(state, TEMERIA, pid)) return `${name} receives our envoy under a flag of truce, and does not offer a seat.`;
  const mood = rel < -60 ? 'barely hides contempt for our envoy' : rel < -25 ? 'keeps our envoy waiting, then listens coldly'
    : rel < 5 ? 'listens with care and gives nothing away' : rel < 30 ? 'receives our envoy politely' : rel < 60 ? 'greets our envoy warmly' : 'greets our envoy as an old friend';
  const word = trust < 30 ? ' Our word counts for little here.' : trust >= 70 ? ' Our word is trusted here.' : '';
  return `${name} ${mood}.${word}`;
}

const VERDICT_CLASS = { Acceptable: 'good', Close: 'close', 'They want more': 'more', Insulting: 'bad' };

// ---- The screen ----

export function createAudience(app) {
  const el = document.getElementById('audience');
  let cur = null;

  const world = () => app.world;
  const state = () => app.state;

  function open(pid, { panel = null, items = null } = {}) {
    if (!rulerOf(app.world, pid)) return;
    const wasOpen = !!cur;
    cur = { pid, panel: null, table: [], adding: null, line: null, reason: null, depth: wasOpen ? cur.depth : 0 };
    if (!wasOpen) {
      app.nav.mark();
      cur.depth = 1;
      app.pauseFor(true);
    }
    el.hidden = false;
    document.body.classList.add('in-audience');
    if (panel) openPanel(panel, { items });
    else render();
    app.haptic?.('tap');
  }

  function close({ fromHistory = false } = {}) {
    if (!cur) return;
    if (!fromHistory && cur.depth > 0) app.nav.unwind(cur.depth);
    cur = null;
    el.hidden = true;
    el.innerHTML = '';
    document.body.classList.remove('in-audience');
    app.pauseFor(false);
  }

  function openPanel(panel, { items = null } = {}) {
    cur.panel = panel;
    cur.adding = null;
    if (items) cur.table = items.map((i) => ({ ...i }));
    app.nav.mark();
    cur.depth += 1;
    render();
    el.querySelector('.aud-bottom')?.scrollTo?.(0, 0);
  }

  // The back gesture or button: a panel goes back to the four buttons; at
  // the four buttons, the audience ends.
  function onBack() {
    if (!cur) return false;
    cur.depth = Math.max(0, cur.depth - 1);
    if (cur.panel) {
      cur.panel = null;
      cur.adding = null;
      render();
    } else close({ fromHistory: true });
    return true;
  }

  function render() {
    if (!cur) return;
    const scroll = el.querySelector('.aud-bottom')?.scrollTop ?? 0;
    el.innerHTML = audienceHtml(app, cur);
    const b = el.querySelector('.aud-bottom');
    if (b) b.scrollTop = scroll;
  }

  // After an order: the ruler's answer, if the rules gave one, as their line.
  function doOrder(action, undo = '') {
    const ok = undo ? app.orderWithUndo(action, undo) : app.order(action);
    const note = app.takeNote?.();
    if (note) cur.line = note;
    else if (ok) cur.line = null;
    return ok;
  }

  el.addEventListener('click', (e) => {
    if (!cur) return;
    const t = e.target;
    const btn = t.closest('button');
    if (!btn || btn.disabled) return;
    const d = btn.dataset;
    if ('audClose' in d) return close();
    if ('audBack' in d) return history.back();
    if (d.audPanel) return openPanel(d.audPanel);
    if (d.audAdd) {
      cur.adding = cur.adding === d.audAdd ? null : d.audAdd;
      return render();
    }
    if (d.audItem) {
      addItem(JSON.parse(d.audItem));
      return render();
    }
    if (d.audRemove !== undefined) {
      cur.table.splice(Number(d.audRemove), 1);
      return render();
    }
    if ('audClear' in d) {
      cur.table = [];
      cur.line = null;
      return render();
    }
    if ('audCounter' in d) {
      const c = counterOffer(state(), world(), cur.pid, cur.table);
      if (c.items) {
        cur.table = c.items;
        cur.line = `${rulerShort(world(), cur.pid)} names the price.`;
      } else cur.line = c.reason;
      return render();
    }
    if ('audPropose' in d) {
      const p = proposeDeal(state(), world(), cur.pid);
      if (p) {
        cur.table = p;
        cur.line = `${rulerShort(world(), cur.pid)} lays out an offer.`;
      } else cur.line = `${rulerShort(world(), cur.pid)} has nothing to propose.`;
      return render();
    }
    if ('audSign' in d) {
      if (doOrder({ type: 'deal', realm: cur.pid, items: cur.table })) {
        cur.table = [];
        cur.line = `${rulerShort(world(), cur.pid)} seals the deal.`;
      }
      return render();
    }
    // A ready-made deal (a treaty, an exchange of reports): sealed at once
    // if the ruler accepts it as it stands, otherwise laid on the table.
    if (d.audDeal) {
      const items = JSON.parse(d.audDeal);
      const w = weighDeal(state(), world(), cur.pid, items);
      if (w.verdict === 'Acceptable' && canSign(state(), world(), cur.pid, items).ok) {
        doOrder({ type: 'deal', realm: cur.pid, items });
        return render();
      }
      cur.table = items;
      cur.line = w.line;
      return openPanel('trade');
    }
    if (d.audReason) {
      cur.reason = d.audReason;
      return render();
    }
    if (d.order) {
      const action = JSON.parse(d.order);
      doOrder(action, d.undo);
      // A declaration ends the audience: the envoys go home.
      if (action.type === 'declare' && hostile(state(), TEMERIA, cur.pid)) cur.line = `${rulerShort(world(), cur.pid)} sends our envoy home. It is war.`;
      return render();
    }
  });

  function addItem(item) {
    const same = cur.table.find((i) => i.kind === item.kind && i.from === item.from && (item.kind === 'coin' || (item.kind === 'monthly' && i.months === item.months)));
    if (same && item.kind === 'coin') same.amount += item.amount;
    else if (same && item.kind === 'monthly') same.amount += item.amount;
    else if (!cur.table.some((i) => JSON.stringify(i) === JSON.stringify(item))) cur.table.push(item);
    cur.adding = null;
  }

  return {
    open, close, onBack, render,
    get open_() { return !!cur; },
    get pid() { return cur?.pid ?? null; },
  };
}

// ---- The whole audience ----

export function audienceHtml(app, cur) {
  const { world, state } = app;
  const pid = cur.pid;
  const r = rulerOf(world, pid);
  const rel = state.neighbours[pid]?.relation ?? 0;
  const trust = Math.round(trustIn(state, world, pid, TEMERIA));
  const traits = r.traits.map((t) => `<span class="trait" title="${escapeHtml(world.diplomacy.traits[t].blurb)}">${escapeHtml(world.diplomacy.traits[t].name)}</span>`).join('');
  const agenda = agendaOf(world, pid) ? `<span class="trait agenda">${escapeHtml(agendaText(world, pid))}</span>` : '';
  const reasons = moodReasons(state, world, pid).sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).map((x) =>
    `<li><span>${escapeHtml(x.text)}</span><b class="${x.value > 0 ? 'up' : 'down'}">${signed(x.value)}</b></li>`).join('');
  const pacts = treatiesOf(state, pid).filter((t) => partnerOf(t, pid) === TEMERIA).map((t) => treatyDef(world, t.kind).name);
  const line = cur.line ?? greeting(world, state, pid);
  return `<div class="aud${cur.panel ? ' with-panel' : ''}">
    <header class="aud-head">
      ${cur.panel ? `<button type="button" class="aud-icon" data-aud-back aria-label="Back">${icon('back')}</button>` : '<span class="aud-icon-space"></span>'}
      <span class="aud-kicker">${cur.panel ? escapeHtml(PANEL_TITLES[cur.panel]) : 'An audience'}</span>
      <button type="button" class="aud-icon" data-aud-close aria-label="End the audience">${icon('close')}</button>
    </header>
    <section class="aud-top" data-part="aud-top">
      <div class="aud-who">
        ${portraitImg(world, pid, 96)}
        <div class="aud-name">
          <h2>${escapeHtml(rulerName(world, pid))}</h2>
          <p class="sub">${escapeHtml(sideName(world, pid))}</p>
          <div class="traits">${traits}${agenda}</div>
        </div>
      </div>
      <div class="aud-mood">
        <span class="mood-word ${rel >= 5 ? 'good' : rel < -25 ? 'bad' : ''}">${moodWord(rel)}</span>
        <span class="mood-num">${signed(rel)}</span>
        <span class="aud-trust">Trust ${trust}${trust < world.diplomacy.trust.lowAt ? ' (low)' : ''}</span>
        ${pacts.length ? `<span class="aud-pacts">${escapeHtml(pacts.join(', '))}</span>` : ''}
      </div>
      <p class="aud-line" data-part="aud-line">${escapeHtml(line)}</p>
      ${intentLine(world, state, pid)}
      <details class="aud-reasons"${cur.panel ? '' : ' open'}><summary>Why ${escapeHtml(rulerShort(world, pid))} feels this way</summary><ul class="reasons">${reasons || '<li><span>Nothing in particular.</span></li>'}</ul></details>
    </section>
    <section class="aud-bottom">${cur.panel ? PANELS[cur.panel](app, cur) : fourButtons(app, cur)}</section>
  </div>`;
}

// Their intentions, as far as our embassy and spies tell us (M18).
function intentLine(world, state, pid) {
  const i = intentions(state, world, pid);
  if (!i) return '';
  return `<p class="aud-intent">${escapeHtml(i.posture ?? i.vague)}${i.aim ? ` <b>${escapeHtml(i.aim)}</b>` : ''}</p>`;
}

const PANEL_TITLES = { trade: 'The deal table', diplomacy: 'Diplomacy', alliance: 'Alliances and treaties', war: 'War' };

function fourButtons(app, cur) {
  const { world, state } = app;
  const pid = cur.pid;
  const war = hostile(state, TEMERIA, pid);
  const pacts = treatiesOf(state, pid).filter((t) => partnerOf(t, pid) === TEMERIA).length;
  const deals = state.diplomacy.deals.filter((d) => d.with === pid).length;
  const big = (key, ic, label, sub) => `<button type="button" class="aud-big" data-aud-panel="${key}">${icon(ic)}<span class="big-label">${label}</span><span class="big-sub">${escapeHtml(sub)}</span></button>`;
  return `<div class="aud-four">
    ${big('trade', 'coin', 'Trade', war ? 'Terms of peace' : deals ? `${deals} deal${deals === 1 ? '' : 's'} running` : 'Lay a deal on the table')}
    ${big('diplomacy', 'dove', 'Diplomacy', 'Gifts, envoys and demands')}
    ${big('alliance', 'shield', 'Alliance', pacts ? `${pacts} treat${pacts === 1 ? 'y' : 'ies'} in force` : 'No treaties')}
    ${big('war', 'sword', 'War', war ? 'At war' : 'Reasons and terms')}
  </div>`;
}

// ---- Trade: the deal table ----

function itemRow(app, pid, item, index) {
  const { world, state } = app;
  const problem = itemProblem(state, world, pid, item);
  return `<li class="deal-item"><span class="deal-text">${escapeHtml(describeItem(world, item, pid))}${problem ? `<small class="warn">${escapeHtml(problem)}</small>` : ''}</span>
    <button type="button" class="deal-remove" data-aud-remove="${index}" aria-label="Take it off the table">${icon('close')}</button></li>`;
}

function presets(app, pid, side) {
  const { world, state } = app;
  const out = [];
  const war = hostile(state, TEMERIA, pid);
  const add = (label, item) => out.push({ label, item: { ...item, from: side } });
  if (war && side === 'us') {
    add('Peace: each keeps what it holds', { kind: 'peace', terms: 'keep' });
    add('Peace: every town handed back', { kind: 'peace', terms: 'white' });
    // A small realm may keep its ruler as our vassal (M19).
    if (world.conquest && (world.foreignByRealm[pid] ?? []).length <= world.conquest.vassal.maxTowns) add('Peace: they become our vassal', { kind: 'peace', terms: 'vassal' });
  }
  // Commanders taken in battle, ransomed either way (M19).
  for (const c of state.captives ?? []) {
    if (side === 'them' && c.side === TEMERIA && c.by === pid) add(`${c.marshal ? world.war.marshals[c.marshal]?.short ?? 'Our marshal' : 'Our captain'}, their prisoner`, { kind: 'captive', captive: c.id });
    if (side === 'us' && c.side === pid && c.by === TEMERIA) add(c.lord ? 'A captured lord' : 'Their captured commander', { kind: 'captive', captive: c.id, ...(c.lord ? { lord: true } : {}) });
  }
  // An exile they shelter, handed over or sent away (M19).
  if (side === 'them' && (state.claimants ?? []).some((c) => c.host === pid && c.against === TEMERIA)) add('Hand over the exile they shelter', { kind: 'claimant' });
  for (const a of [100, 250, 500, 1000]) add(`${number(a)} crowns`, { kind: 'coin', amount: a });
  for (const a of [20, 40, 80]) add(`${a} crowns a month, 12 months`, { kind: 'monthly', amount: a, months: 12 });
  if (!war) {
    for (const [g, def] of Object.entries(world.diplomacy.goods)) {
      if (side === 'us' && goodsInHand(state, world, g) < def.unit) continue;
      add(`${def.name}: ${def.unit} a month, 6 months`, { kind: 'goods', good: g, qty: def.unit, months: 6 });
    }
    add(side === 'us' ? 'What our watchers see, 6 months' : 'What their watchers see, 6 months', { kind: 'intel', months: 6 });
    add(side === 'us' ? 'Passage for their armies, 12 months' : 'Passage for our armies, 12 months', { kind: 'passage', months: 12 });
    if (side === 'them' && !state.embassies[pid]) add('Our embassy in their capital', { kind: 'embassy' });
    if (side === 'us') add('Their embassy at Vizima', { kind: 'embassy' });
    if (side === 'them') {
      // Their markets: the best roads between our towns and theirs.
      const ours = world.geography.settlements.filter((s) => s.type === 'city' || s.type === 'town').map((s) => s.id);
      const theirs = (world.foreignByRealm[pid] ?? []).filter((id) => ['city', 'town'].includes(world.byId[id].type) && ownerOf(state, world, id) === pid);
      const routes = [];
      for (const a of ours) for (const b of theirs) {
        const item = { kind: 'route', a, b, from: 'them' };
        if (itemProblem(state, world, pid, item)) continue;
        routes.push({ a, b, v: routeValue(state, world, { from: a, to: b }).value });
      }
      routes.sort((x, y) => y.v - x.v);
      for (const x of routes.slice(0, 3)) add(`A trade route, ${world.byId[x.a].name} to ${world.byId[x.b].name}`, { kind: 'route', a: x.a, b: x.b });
    }
  }
  // Towns: near the border on our side, near us on theirs.
  const cap = world.byId[world.realms?.realms[pid]?.capital ?? world.kingdom.capital];
  const viz = world.byId[world.kingdom.capital];
  if (side === 'us') {
    const ours = Object.keys(state.settlements).filter((id) => ownerOf(state, world, id) === TEMERIA && id !== world.kingdom.capital && world.byId[id].type !== 'temple')
      .sort((a, b) => Math.hypot(world.byId[a].x - cap.x, world.byId[a].y - cap.y) - Math.hypot(world.byId[b].x - cap.x, world.byId[b].y - cap.y));
    for (const id of ours.slice(0, 3)) add(`Cede ${world.byId[id].name}`, { kind: 'town', town: id });
  } else {
    const theirs = (world.foreignByRealm[pid] ?? []).filter((id) => ownerOf(state, world, id) === pid)
      .sort((a, b) => Math.hypot(world.byId[a].x - viz.x, world.byId[a].y - viz.y) - Math.hypot(world.byId[b].x - viz.x, world.byId[b].y - viz.y));
    for (const id of theirs.slice(0, 3)) add(`${world.byId[id].name} to be ours`, { kind: 'town', town: id });
  }
  return out;
}

function tradePanel(app, cur) {
  const { world, state } = app;
  const pid = cur.pid;
  const col = (side, title) => {
    const rows = cur.table.map((it, i) => (it.from === side ? itemRow(app, pid, it, i) : '')).join('');
    const picking = cur.adding === side;
    const pick = picking ? `<div class="deal-pick">${presets(app, pid, side).map((p) =>
      `<button type="button" class="chip" data-aud-item='${escapeHtml(JSON.stringify(p.item))}'>${escapeHtml(p.label)}</button>`).join('')}</div>` : '';
    return `<div class="deal-col"><h3>${title}</h3><ul class="deal-list">${rows || '<li class="sub">Nothing yet.</li>'}</ul>
      <button type="button" class="act small${picking ? ' on' : ''}" data-aud-add="${side}"><span class="act-label">${picking ? 'Done adding' : '+ Add'}</span></button>${pick}</div>`;
  };
  const w = weighDeal(state, world, pid, cur.table);
  const sign = canSign(state, world, pid, cur.table);
  const ours = cur.table.length ? ourValue(state, world, pid, cur.table) : null;
  const verdict = w.verdict
    ? `<div class="verdict ${VERDICT_CLASS[w.verdict]}" data-part="verdict"><b>${w.verdict}</b><span>${escapeHtml(w.line)}</span>${ours !== null ? `<small>To us, worth about ${ours >= 0 ? '' : 'minus '}${number(Math.abs(ours))} crowns.</small>` : ''}</div>`
    : '<div class="verdict" data-part="verdict"><span>Lay something on the table, or hear their proposal.</span></div>';
  return `<div class="deal">
    <div class="deal-cols">${col('us', 'We offer')}${col('them', 'They offer')}</div>
    ${verdict}
    <div class="deal-acts">
      <button type="button" class="act" data-aud-counter ${cur.table.length ? '' : 'disabled'}><span class="act-label">What would they accept?</span></button>
      <button type="button" class="act" data-aud-propose><span class="act-label">Hear their proposal</span></button>
      <button type="button" class="act" data-aud-clear ${cur.table.length ? '' : 'disabled'}><span class="act-label">Clear the table</span></button>
      <button type="button" class="act primary" data-aud-sign ${sign.ok ? '' : 'disabled'}><span class="act-label">Seal the deal</span>${sign.ok ? '' : `<span class="act-sub">${escapeHtml(cur.table.length ? sign.reason : 'Nothing to seal.')}</span>`}</button>
    </div>
    ${runningDeals(app, pid)}
  </div>`;
}

function runningDeals(app, pid) {
  const { world, state } = app;
  const list = state.diplomacy.deals.filter((d) => d.with === pid);
  if (!list.length) return '';
  return `<h3>Deals running</h3><ul class="plain">${list.map((d) => `<li>${d.items.map((i) => `${i.from === 'us' ? 'We send' : 'They send'} ${escapeHtml(describeItem(world, { ...i, months: i.left }, pid).toLowerCase())}`).join('; ')}</li>`).join('')}</ul>`;
}

// ---- Diplomacy ----

function diplomacyPanel(app, cur) {
  const { world, state } = app;
  const pid = cur.pid;
  const n = state.neighbours[pid];
  const btn = (label, action, check, sub = '', confirmText = '') => `<button type="button" class="build" ${orderAttr(action, confirmText)} ${check.ok ? '' : 'disabled'}>
    <span class="build-name">${label}</span><span class="build-cost">${escapeHtml(check.ok ? sub : check.reason)}</span></button>`;
  const stances = Object.entries(world.neighbours.stances).map(([sid, st]) => {
    if (sid === n.stance) return `<button type="button" class="chip on" disabled>${st.name}</button>`;
    const c = canSetStance(state, world, pid, sid);
    return `<button type="button" class="chip" ${orderAttr({ type: 'stance', realm: pid, stance: sid })} ${c.ok ? '' : 'disabled'} title="${escapeHtml(c.ok ? st.blurb : c.reason)}">${st.name}</button>`;
  }).join(' ');
  const g = world.diplomacy.actions.gift;
  const gifts = g.sizes.map((size) => {
    const c = canGift(state, world, pid, size);
    return `<button type="button" class="chip" ${orderAttr({ type: 'gift', realm: pid, size })} ${c.ok ? '' : 'disabled'}>${number(size)} crowns</button>`;
  }).join(' ');
  const giftWait = canGift(state, world, pid, g.sizes[0]);
  const ic = world.realms.intelligence;
  const embassy = state.embassies[pid]
    ? btn('Close our embassy', { type: 'embassy', realm: pid, close: true }, { ok: true }, `Saves ${ic.embassy.monthly} crowns a month.`)
    : btn('Open an embassy', { type: 'embassy', realm: pid, close: false }, canOpenEmbassy(state, world, pid), `${ic.embassy.coin} crowns, then ${ic.embassy.monthly} a month.`);
  const spy = btn('Send a spy', { type: 'spy', realm: pid }, canSendSpy(state, world, pid), `${ic.spy.coin} crowns; one in ${Math.round(1 / ic.spy.discovery)} is caught.`, `Send a spy into ${sideName(world, pid)}?`);
  const months = world.diplomacy.actions.intel.months;
  const exchange = [{ kind: 'intel', from: 'us', months }, { kind: 'intel', from: 'them', months }];
  const request = [{ kind: 'intel', from: 'them', months }];
  const weigh = (items) => weighDeal(state, world, pid, items).verdict;
  const intel = hostile(state, TEMERIA, pid) ? '' : `<h3>Intelligence</h3><div class="build-list">
    <button type="button" class="build" data-aud-deal='${escapeHtml(JSON.stringify(exchange))}'><span class="build-name">Exchange what our watchers see</span><span class="build-cost">${months} months each way. ${weigh(exchange)}.</span></button>
    <button type="button" class="build" data-aud-deal='${escapeHtml(JSON.stringify(request))}'><span class="build-name">Ask for their watchers' reports</span><span class="build-cost">${months} months. ${weigh(request)}.</span></button></div>`;
  const tribute = btn(`Demand tribute: ${tributeAsk(state, world, pid)} crowns a month`, { type: 'tribute', realm: pid }, canDemandTribute(state, world, pid),
    fearOf(state, world, pid) >= 1 ? 'They fear us. They may pay.' : 'They do not fear us. They will likely refuse.', 'Demand tribute? A refusal sours them.');
  const asks = asksOf(state, world, pid).map((a) => btn(a.label, { type: 'ask', realm: pid, what: a.key }, canAsk(state, world, pid, a.key), 'They may agree, if they fear or like us enough.')).join('');
  return `<h3>Our stance</h3><div class="chips">${stances}</div>
    <h3>A gift</h3><div class="chips">${gifts}</div>${giftWait.ok ? '' : `<p class="sub">${escapeHtml(giftWait.reason)}</p>`}
    <h3>Envoys and agents</h3><div class="build-list">${embassy}${spy}</div>
    ${intel}
    <h3>Pressure</h3><div class="build-list">
      ${btn(`Denounce ${escapeHtml(sideName(world, pid))}`, { type: 'denounce', realm: pid }, canDenounce(state, world, pid), 'Worse with them; better with their enemies.', `Denounce ${sideName(world, pid)} before the North?`)}
      ${tribute}${asks}</div>`;
}

// ---- Alliances and treaties ----

function alliancePanel(app, cur) {
  const { world, state } = app;
  const pid = cur.pid;
  const ours = treatiesOf(state, pid).filter((t) => partnerOf(t, pid) === TEMERIA);
  const inForce = ours.map((t) => {
    const def = treatyDef(world, t.kind);
    const years = Math.max(0, (t.until - state.day) / 365);
    return `<div class="treaty"><span class="build-name">${escapeHtml(def.name)}</span><span class="build-cost">${escapeHtml(def.blurb)} Until ${formatDate(t.until)} (${years < 1 ? 'under a year' : `${Math.round(years)} years`} left).${t.kind === 'protectorate' && t.terms?.monthly ? ` They pay ${t.terms.monthly} a month.` : ''}</span>
      <button type="button" class="act danger small" ${orderAttr({ type: 'breakTreaty', realm: pid, treaty: t.kind }, `Break the ${def.name.toLowerCase()} with ${sideName(world, pid)}? They will trust us far less, and every other court a little less.`)}><span class="act-label">Break it</span></button></div>`;
  }).join('');
  const kinds = Object.keys(world.diplomacy.treaties).filter((k) => k !== 'protectorate' || world.diplomacy.treaties.protectorate.small.includes(pid));
  const propose = kinds.filter((k) => !treatyBetween(state, TEMERIA, pid, k)).map((k) => {
    const def = treatyDef(world, k);
    const items = k === 'protectorate'
      ? [{ kind: 'treaty', from: 'us', treaty: k }, { kind: 'monthly', from: 'them', amount: def.tribute, months: def.years * 12 }]
      : k === 'access' ? [{ kind: 'passage', from: 'them', months: def.years * 12 }] : [{ kind: 'treaty', from: 'us', treaty: k }];
    const w = weighDeal(state, world, pid, items);
    return `<button type="button" class="build" data-aud-deal='${escapeHtml(JSON.stringify(items))}'>
      <span class="build-name">${escapeHtml(def.name)} <span class="vchip ${VERDICT_CLASS[w.verdict]}">${w.verdict}</span></span>
      <span class="build-blurb">${escapeHtml(def.blurb)} ${def.years} years.</span>
      <span class="build-cost">${escapeHtml(w.verdict === 'Acceptable' ? 'Tap to sign.' : w.reason ?? 'Tap to bargain at the deal table.')}</span></button>`;
  }).join('');
  const theirs = treatiesOf(state, pid).filter((t) => partnerOf(t, pid) !== TEMERIA)
    .map((t) => `<li>${escapeHtml(treatyDef(world, t.kind).name)} with ${escapeHtml(sideName(world, partnerOf(t, pid)))}</li>`).join('');
  return `<h3>In force</h3>${inForce || '<p class="sub">No treaty binds us.</p>'}
    <h3>Propose</h3><div class="build-list">${propose || '<p class="sub">Every treaty there is, we have.</p>'}</div>
    <h3>Their other pacts</h3>${theirs ? `<ul class="plain">${theirs}</ul>` : '<p class="sub">None that we know of.</p>'}`;
}

// ---- War ----

function warPanel(app, cur) {
  const { world, state } = app;
  const pid = cur.pid;
  if (hostile(state, TEMERIA, pid)) {
    const war = warsOf(state, TEMERIA).find((w) => sideIndex(w, pid) >= 0 && sideIndex(w, pid) !== sideIndex(w, TEMERIA));
    const lead = war && war.sides[sideIndex(war, TEMERIA)][0] === TEMERIA;
    const months = war ? Math.floor((state.day - war.since) / 30) : 0;
    const keep = [{ kind: 'peace', from: 'us', terms: 'keep' }];
    const white = [{ kind: 'peace', from: 'us', terms: 'white' }];
    const w1 = weighDeal(state, world, pid, keep);
    const w2 = weighDeal(state, world, pid, white);
    return `<p class="warn">We are at war with ${escapeHtml(sideName(world, pid))}, ${months} month${months === 1 ? '' : 's'} now.</p>
      ${lead ? `<h3>Terms of peace</h3><div class="build-list">
        <button type="button" class="build" data-aud-deal='${escapeHtml(JSON.stringify(keep))}'><span class="build-name">Each keeps what it holds <span class="vchip ${VERDICT_CLASS[w1.verdict]}">${w1.verdict}</span></span><span class="build-cost">${escapeHtml(w1.line)}</span></button>
        <button type="button" class="build" data-aud-deal='${escapeHtml(JSON.stringify(white))}'><span class="build-name">Every town handed back <span class="vchip ${VERDICT_CLASS[w2.verdict]}">${w2.verdict}</span></span><span class="build-cost">${escapeHtml(w2.line)}</span></button>
      </div><p class="sub">Crowns, tribute and towns can be added at the deal table.</p>` : '<p class="sub">Our ally leads this war. The War screen can make a separate peace with them, or withdraw us.</p>'}`;
  }
  const base = canDeclare(state, world, pid);
  if (!base.ok && !/Authority/.test(base.reason)) return `<p class="sub">${escapeHtml(base.reason)}</p>`;
  const reasons = warReasons(state, world, pid);
  const chosen = cur.reason && reasons.find((r) => r.key === cur.reason && r.ok) ? cur.reason : reasons.find((r) => r.ok && r.key !== 'none')?.key ?? 'none';
  const list = reasons.map((r) => `<button type="button" class="reason${r.key === chosen ? ' on' : ''}" data-aud-reason="${r.key}" ${r.ok ? '' : 'disabled'}>
    <span class="build-name">${escapeHtml(r.name)}</span><span class="build-cost">${escapeHtml(r.why)}${r.ok ? ` Needs Authority ${reasonCost(state, world, pid, r.key)}, and costs Love.` : ''}</span></button>`).join('');
  const check = canDeclareWith(state, world, pid, chosen);
  const declare = `<button type="button" class="act danger" ${orderAttr({ type: 'declare', realm: pid, reason: chosen }, `Declare war on ${sideName(world, pid)}${chosen === 'none' ? ' without a cause? Every court in the North will trust us less' : ''}?`)} ${check.ok ? '' : 'disabled'}>
    <span class="act-label">Declare war</span><span class="act-sub">${escapeHtml(check.ok ? `Needs Authority ${check.cost}, and costs Love. Every treaty with them ends.` : check.reason)}</span></button>`;
  // Terms before war.
  const fear = fearOf(state, world, pid);
  const hint = fear >= 1.2 ? 'They fear us.' : fear >= 0.8 ? 'They are wary of us.' : 'They do not fear us.';
  const demands = [];
  for (const a of [500, 1000, 2000]) demands.push({ label: `Pay ${number(a)} crowns`, demand: { kind: 'pay', amount: a } });
  const towns = (world.foreignByRealm[pid] ?? []).filter((id) => ownerOf(state, world, id) === pid && world.realms.realms[pid]?.capital !== id)
    .sort((a, b) => valueOf(state, world, a) - valueOf(state, world, b)).slice(0, 2);
  for (const id of towns) demands.push({ label: `Cede ${world.byId[id].name}`, demand: { kind: 'cede', town: id } });
  for (const t of treatiesOf(state, pid).filter((x) => partnerOf(x, pid) !== TEMERIA)) {
    demands.push({ label: `Break their ${treatyDef(world, t.kind).name.toLowerCase()} with ${sideName(world, partnerOf(t, pid))}`, demand: { kind: 'break', treaty: t.id } });
  }
  const terms = demands.map((d) => {
    const c = canUltimatum(state, world, pid, d.demand);
    return `<button type="button" class="build" ${orderAttr({ type: 'ultimatum', realm: pid, demand: d.demand }, `Demand that ${sideName(world, pid)} ${d.label.toLowerCase()}, or face war?`)} ${c.ok ? '' : 'disabled'}>
      <span class="build-name">${escapeHtml(d.label)}</span><span class="build-cost">${escapeHtml(c.ok ? hint : c.reason)}</span></button>`;
  }).join('');
  return `<h3>Terms before war</h3><p class="sub">Demand something, or face war. A refusal gives us a cause for ${Math.round(world.diplomacy.actions.ultimatum.cause / 30)} months.</p>
    <div class="build-list">${terms}</div>
    <h3>The reason we give</h3><div class="build-list reasons-list">${list}</div>
    <div class="actions">${declare}</div>
    <p class="sub">Their strength: about ${number(Math.round(realmPotential(state, world, pid) / 100) * 100)} men under arms.</p>`;
}

const PANELS = { trade: tradePanel, diplomacy: diplomacyPanel, alliance: alliancePanel, war: warPanel };
