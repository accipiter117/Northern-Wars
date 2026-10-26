// Wires the simulation, the map and the panels together, and owns the clock.
import { loadWorld, createState, step, serialize, deserialize, dateOf, describeUnit, applyAction, describeArmy, TEMERIA, bestCompanyFor, freeCompanies, realmStock } from './sim/index.js';
import { createCamera, resizeCamera, panBy, toWorld } from './render/camera.js';
import { attachMapInput } from './render/input.js';
import { createRenderer } from './render/renderer.js';
import { createTopbar } from './ui/topbar.js';
import { createPanel } from './ui/panel.js';
import { createNav } from './ui/nav.js';
import { attachPanelInput } from './ui/clicks.js';
import { createPick } from './ui/pick.js';
import { renderRoute } from './ui/router.js';
import { pendingDecisions, urgentItems } from './ui/inbox.js';
import { loadMemory, saveMemory, TABS } from './ui/memory.js';
import { icon } from './ui/icons.js';
import { escapeHtml } from './ui/format.js';
import { createHints, loadPrefs, savePrefs } from './ui/hints.js';
import { writeSave, readSave, downloadText } from './ui/storage.js';
import { createQuick } from './ui/quick.js';
import { longPress } from './ui/longpress.js';
import { createAudience } from './ui/audience.js';
import { stopBrowserGestures, instantPress, createHaptics, createWakeLock, registerWorker } from './ui/native.js';

const MAX_DAYS_PER_FRAME = 8;
const params = new URLSearchParams(location.search);

async function readJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Could not load ${path}`);
  return res.json();
}

async function boot() {
  const world = await loadWorld(readJson);
  const [peoples, faiths, goods, hintData, layoutCfg] = await Promise.all(['data/peoples.json', 'data/faiths.json', 'data/goods.json', 'data/hints.json', 'data/layout.json'].map(readJson));
  const hints = createHints(hintData, { disabled: params.has('nohints'), onOpen: (where) => openHint(where) });
  const lookups = { peoples, faiths, goods };

  let state = startingState(world);
  let speed = 0;
  let frac = 0;
  let selection = null;
  let label = null;
  let unitLabelUntil = 0;
  // Depositions the player has seen through (answered in the inbox).
  let acked = state.depositions.length;

  const stage = document.getElementById('stage');
  const canvas = document.getElementById('map');
  const unitLabel = document.getElementById('unit-label');
  const toastEl = document.getElementById('toast');
  const urgentEl = document.getElementById('urgent');
  const moreMenu = document.getElementById('more-menu');
  const cam = createCamera(world);
  const renderer = createRenderer(canvas, world, cam, layoutCfg);
  const prefs = loadPrefs();
  stopBrowserGestures();
  instantPress();
  const haptic = createHaptics(prefs);
  const wake = createWakeLock(prefs);
  const quick = createQuick({ haptic });
  // The interface's memory survives reloads, but the panel starts closed:
  // one tap on a tab brings back exactly what was open.
  const memory = loadMemory();
  memory.open = false;

  const topbar = createTopbar(world, { onSpeed: setSpeed, onMore: toggleMore, onMeter: (route) => nav.push(route) });

  // One context for every screen and control.
  const app = {
    world, lookups, hintData, hints, prefs, memory,
    get state() { return state; },
    samples: [],
    acked: () => acked,
    order,
    persist: () => saveMemory(memory),
    foreignView,
    looseThreats,
    startPick: (p) => pick.start(p),
    sendNearest,
    regency,
    newReign: () => menuAction('new'),
    goTab,
    armyRaised,
    menuAction,
    highlight: (hit) => { selection = hit.settlement ? { settlement: hit.settlement } : hit.foreign ? null : { ...hit }; },
    afterPick,
    scrolled: () => {},
    // A card's head, for a quick look from a list without leaving it.
    preview: (route) => renderRoute(app, route),
    peek: (x, y, title, html) => quick.peek(x, y, title, html),
    haptic: (k) => haptic(k),
    // An audience with a ruler, over everything; the realm waits meanwhile.
    audience: (pid, opts) => audience.open(pid, opts),
    takeNote: () => {
      const n = lastNote;
      lastNote = null;
      return n;
    },
    pauseFor,
  };

  const panel = createPanel({
    onBack: () => nav.back(),
    onClose: () => nav.close(),
    // Raised again from its title bar: bring the content up to date.
    onSnap: (s) => { if (s !== 'peek') nav.refresh(); },
  });
  panel.restoreSnap(memory.snap);
  document.getElementById('sheet-back').innerHTML = icon('back');
  document.getElementById('sheet-close').innerHTML = icon('close');
  const nav = createNav({
    memory, panel,
    render: (r) => renderRoute(app, r),
    persist: () => { memory.snap = panel.snap === 'peek' ? panel.raised : panel.snap; saveMemory(memory); },
    onShow,
    onBack: () => audience?.onBack(),
    onTab: (t, same) => {
      // A tap on Court while decisions wait goes straight to them.
      if (t === 'court' && !same && pendingDecisions(state, world, acked).length) memory.sub.court = 'inbox';
    },
  });
  app.nav = nav;
  const audience = createAudience(app);
  attachPanelInput(app);
  const pick = createPick(app, {
    onStart: () => {
      hideUnitLabel();
      // Clear the map: the panel drops to its title bar while picking.
      if (nav.open && !panel.side && panel.snap !== 'peek') panel.setSnap('peek', { remember: false, instant: true });
    },
  });

  // ---- Notices ----

  let toastTimer = 0;
  function toast(text) {
    toastEl.textContent = text;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastEl.hidden = true), 2600);
  }

  // Sightings already announced, so a loaded reign does not cry wolf again.
  let alertsSeen = new Set((state.threats?.alerts ?? []).map((a) => `${a.id}:${a.day}`));
  function newSightings() {
    let fresh = null;
    for (const a of state.threats?.alerts ?? []) {
      const k = `${a.id}:${a.day}`;
      if (alertsSeen.has(k)) continue;
      alertsSeen.add(k);
      fresh = a;
    }
    if (!fresh) return false;
    toast(fresh.text);
    return !!prefs.pauseOnSighting;
  }

  // Decisions go to the Court inbox with a badge and a short toast; the
  // game still pauses for each new one, as it always has.
  // Checked every day, so it only compares ids; the words are written out
  // only when something new has come.
  const decisionKeys = () => [
    ...(state.depositions.length > acked ? ['deposition'] : []),
    ...(state.warDecisions ?? []).map((d) => `warDecision:${d.id}`),
    ...state.events.map((d) => `event:${d.id}`),
    ...state.demands.map((d) => `demand:${d.id}`),
    ...state.envoys.map((d) => `envoy:${d.id}`),
    ...state.petitions.map((d) => `petition:${d.id}`),
  ];
  let decisionsSeen = new Set(decisionKeys());
  function newDecisions() {
    const keys = decisionKeys();
    if (keys.every((k) => decisionsSeen.has(k))) {
      if (keys.length !== decisionsSeen.size) decisionsSeen = new Set(keys);
      return false;
    }
    const fresh = pendingDecisions(state, world, acked).filter((d) => !decisionsSeen.has(d.key));
    decisionsSeen = new Set(keys);
    if (!fresh.length) return false;
    hints.note('decision');
    haptic('alert');
    const d = fresh[0];
    toast(`${d.kicker}: ${d.title}. It waits at court.${fresh.length > 1 ? ` (${fresh.length} new)` : ''}`);
    updateBadges();
    return true;
  }

  function looseThreats() {
    const hunted = new Set(freeCompanies(state).map((c) => c.task?.threat).filter(Boolean));
    return (state.threats?.list ?? []).filter((t) => !t.abroad && (t.sighted || t.campSeen) && !hunted.has(t.id) && !state.threats.contracts.some((c) => c.threat === t.id)).length;
  }

  function updateBadges() {
    nav.setBadges({
      court: pendingDecisions(state, world, acked).length,
      military: looseThreats(),
      diplomacy: state.envoys.length,
    });
  }

  // Only what cannot wait gets a banner across the top, until tapped or
  // dismissed.
  const dismissed = new Set();
  let urgentKey = '';
  function updateUrgent() {
    const items = urgentItems(state, world, acked).filter((u) => !dismissed.has(u.key));
    const top = items[0];
    const key = top ? `${top.key}|${items.length}` : '';
    if (key === urgentKey) return;
    urgentKey = key;
    urgentEl.hidden = !top;
    if (!top) { urgentEl.innerHTML = ''; return; }
    haptic('alert');
    urgentEl.innerHTML = `<button type="button" class="urgent-go" data-urgent="${escapeHtml(top.go)}">${escapeHtml(top.text)}${items.length > 1 ? ` <small>(and ${items.length - 1} more)</small>` : ''}</button>
      <button type="button" class="icon-button" data-urgent-x="${escapeHtml(top.key)}" aria-label="Dismiss">${icon('close')}</button>`;
  }
  urgentEl.addEventListener('click', (e) => {
    const go = e.target.closest('[data-urgent]');
    const x = e.target.closest('[data-urgent-x]');
    if (x) dismissed.add(x.dataset.urgentX);
    else if (go) {
      const where = go.dataset.urgent;
      if (where === 'inbox') goTab('court:inbox');
      else nav.push(where);
    }
    updateUrgent();
  });

  // ---- The clock and the state ----

  function setSpeed(s) {
    speed = s;
    topbar.setSpeed(s);
    wake.playing(s > 0);
  }

  function save(quiet) {
    const err = writeSave(serialize(state));
    saveMemory(memory);
    if (err) toast(err);
    else if (!quiet) toast('The reign is saved.');
  }

  function replaceState(next, message) {
    audience.close();
    state = next;
    frac = 0;
    acked = state.depositions.length;
    alertsSeen = new Set((state.threats?.alerts ?? []).map((a) => `${a.id}:${a.day}`));
    decisionsSeen = new Set(decisionKeys());
    app.samples.length = 0;
    pick.end();
    nav.close();
    // Cards from the old realm may name things that no longer exist.
    for (const t of TABS) memory.stacks[t] = [`tab:${t}`];
    memory.stacks.map = [];
    selection = null;
    hideUnitLabel();
    topbar.update(state);
    updateBadges();
    dismissed.clear();
    updateUrgent();
    if (message) toast(message);
  }

  // Player orders go through the simulation's own rules, like everything else.
  // The answer a ruler gave to the last order, for the audience to show.
  let lastNote = null;
  function order(action) {
    const out = applyAction(state, world, action);
    if (out.error) {
      toast(out.error);
      return false;
    }
    lastNote = out.note ?? null;
    const before = state.chronicle.length;
    state = out.state;
    topbar.update(state);
    renderer.invalidate();
    nav.refresh();
    updateBadges();
    updateUrgent();
    decisionsSeen = new Set(decisionKeys());
    haptic('confirm');
    if (out.note) toast(out.note);
    else if (state.chronicle.length > before) toast(state.chronicle.at(-1).text);
    audience?.render();
    return true;
  }

  // Opening an audience pauses the realm; ending it plays on as before.
  let pausedFrom = null;
  function pauseFor(on) {
    if (on) {
      if (pausedFrom === null) pausedFrom = speed;
      setSpeed(0);
    } else if (pausedFrom !== null) {
      setSpeed(pausedFrom);
      pausedFrom = null;
    }
  }

  function sendNearest(threatId) {
    const t = state.threats.list.find((x) => x.id === threatId);
    const best = t && bestCompanyFor(state, world, t);
    if (!best) return toast('No company is free to send.');
    order({ type: 'company', id: best.c.id, order: { kind: 'hunt', threat: threatId } });
  }

  function regency() {
    acked = state.depositions.length;
    nav.refresh();
    updateBadges();
    updateUrgent();
    toast('The regency council takes up the crown.');
  }

  function armyRaised() {
    hints.note('armyRaised');
    const a = state.armies.at(-1);
    if (a?.side === TEMERIA) nav.push(`army:${a.id}`);
  }

  // "military:war" opens the Military tab on its War sub-tab.
  // An explicit jump goes to the tab's own screen, not a card left open on it.
  function goTab(where) {
    const [t, sub] = where.split(':');
    nav.rememberScroll();
    if (sub) memory.sub[t] = sub;
    memory.stacks[t] = [`tab:${t}`];
    if (nav.open && memory.active === t) {
      nav.redraw();
      nav.updateTabs();
    } else nav.tab(t);
  }

  function openHint(where) {
    const old = { ledger: 'treasury:ledger', forces: 'military:threats' };
    goTab(old[where] ?? where);
  }

  function afterPick() {
    if (nav.open && panel.snap === 'peek') panel.setSnap(panel.raised);
    selectionFromRoute(nav.current);
    nav.refresh();
  }

  function foreignView(id) {
    // The renderer knows whether it is in sight; a remembered town comes from
    // the last report.
    const live = renderer.foreignInfo(id);
    const seen = state.ambient.intel?.seen[id];
    return live ?? (seen && { visible: false, ...seen });
  }

  function selectionFromRoute(r) {
    const [kind, arg] = (r ?? '').split(':');
    if (kind === 'town') selection = { settlement: arg };
    else if (kind === 'company') selection = { company: Number(arg) };
    else if (kind === 'threat') selection = { threat: Number(arg) };
    else if (kind === 'army') selection = { army: Number(arg) };
    else if (!label) selection = null;
  }

  function onShow(r) {
    if (panel.snap === 'peek' && !pick.active) panel.setSnap(panel.raised);
    if (!label) selectionFromRoute(r);
    if (r.startsWith('town:')) hints.note('townOpened');
    if (r === 'tab:treasury' && memory.sub.treasury === 'routes') hints.note('tradeOpened');
  }

  // ---- The overflow menu ----

  function moreHtml() {
    const has = !!readSave();
    return `<button type="button" data-more="chronicle">${icon('scroll')} Chronicle</button>
      <button type="button" data-more="help">${icon('info')} Help</button>
      <hr>
      <button type="button" data-more="save">Save now</button>
      <button type="button" data-more="load" ${has ? '' : 'disabled'}>Load last save</button>
      <button type="button" data-more="export">Export save</button>
      <button type="button" data-more="import">Import save</button>
      <hr>
      <button type="button" class="danger" data-more="new">Start a new reign</button>`;
  }

  function toggleMore() {
    const open = moreMenu.hidden;
    moreMenu.innerHTML = open ? moreHtml() : '';
    moreMenu.hidden = !open;
    document.getElementById('more-button').setAttribute('aria-expanded', String(open));
  }
  moreMenu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-more]');
    if (!b || b.disabled) return;
    toggleMore();
    const what = b.dataset.more;
    if (what === 'chronicle' || what === 'help') nav.push(what);
    else menuAction(what);
  });
  document.addEventListener('pointerdown', (e) => {
    if (!moreMenu.hidden && !e.target.closest('#more-menu, #more-button')) toggleMore();
  });

  function menuAction(action) {
    if (!action) return;
    if (/^(haptics|awake)-(on|off)$/.test(action)) {
      const [k, v] = action.split('-');
      prefs[k === 'haptics' ? 'haptics' : 'keepAwake'] = v === 'on';
      savePrefs(prefs);
      wake.sync();
      if (k === 'haptics' && v === 'on') haptic('confirm');
      nav.refresh();
    } else if (action === 'sighting-pause-on' || action === 'sighting-pause-off') {
      prefs.pauseOnSighting = action === 'sighting-pause-on';
      savePrefs(prefs);
      nav.refresh();
    } else if (action === 'hints-off' || action === 'hints-on') {
      hints.setEnabled(action === 'hints-on');
      nav.refresh();
    } else if (action === 'save') save(false);
    else if (action === 'load') {
      try {
        replaceState(deserialize(readSave(), world), 'The last save is restored.');
      } catch (err) {
        toast(err.message);
      }
    } else if (action === 'export') {
      const d = dateOf(state.day);
      downloadText(`northern-wars-${world.kingdom.id}-${d.year}-${String(d.month).padStart(2, '0')}.json`, serialize(state));
    } else if (action === 'import') document.getElementById('import-file').click();
    else if (action === 'new') {
      if (confirm('Abandon this reign and start anew? Unsaved progress will be lost.')) {
        replaceState(createState(world, freshSeed()), 'A new reign begins.');
        save(true);
      }
    }
  }

  document.getElementById('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      replaceState(deserialize(await file.text(), world), 'The reign is imported.');
      save(true);
    } catch (err) {
      toast(err.message);
    }
  });

  // ---- Map input ----

  function hideUnitLabel() {
    unitLabel.hidden = true;
    if (label) {
      label = null;
      selectionFromRoute(nav.open ? nav.current : null);
    }
  }

  function showLabel(sel, text) {
    label = sel;
    selection = sel;
    unitLabel.textContent = text;
    unitLabel.hidden = false;
    unitLabelUntil = performance.now() + 4000;
  }

  // A tap on the map never closes the panel: in portrait it drops to its
  // title bar, so the player's place is one tap away; beside the map in
  // landscape it simply stays.
  function lowerPanel() {
    if (nav.open && !panel.side && panel.snap !== 'peek') panel.setSnap('peek', { remember: false });
  }

  // What a tap means while picking a target: the thing wanted, or the
  // nearest place to the finger when a place is wanted.
  function hitForPick(x, y) {
    const hit = renderer.pick(x, y, state, frac);
    const wants = pick.wants;
    if (hit && wants.some((k) => hit[k] !== undefined)) return hit;
    if (!wants.includes('settlement') && !wants.includes('foreign')) return null;
    let best = null;
    const places = [...(wants.includes('settlement') ? world.geography.settlements : []), ...(wants.includes('foreign') ? world.foreign : [])];
    for (const st of places) {
      const px = (st.x - cam.x) * cam.scale + cam.viewW / 2;
      const py = (st.y - cam.y) * cam.scale + cam.viewH / 2;
      const d = Math.hypot(px - x, py - y);
      if (d < 44 && (!best || d < best.d)) best = { d, id: st.id, foreign: !state.settlements[st.id] };
    }
    if (!best) return null;
    return best.foreign ? { foreign: best.id } : { settlement: best.id };
  }

  function onTap(x, y) {
    if (pick.active) {
      pick.tap(hitForPick(x, y));
      return;
    }
    const hit = renderer.pick(x, y, state, frac);
    if (hit?.settlement) { hideUnitLabel(); nav.push(`town:${hit.settlement}`); }
    else if (hit?.neighbour) { hideUnitLabel(); nav.push(`realm:${hit.neighbour}`); }
    else if (hit?.foreign && foreignView(hit.foreign)) { hideUnitLabel(); nav.push(`foreign:${hit.foreign}`); }
    else if (hit?.company) { hideUnitLabel(); nav.push(`company:${hit.company}`); }
    else if (hit?.threat) { hideUnitLabel(); nav.push(`threat:${hit.threat}`); }
    else if (hit?.army) {
      const a = state.armies.find((v) => v.id === hit.army);
      if (a.side === TEMERIA) { hideUnitLabel(); nav.push(`army:${a.id}`); }
      else {
        lowerPanel();
        showLabel({ army: a.id }, describeArmy(state, world, a));
      }
    } else if (hit?.unit) {
      lowerPanel();
      const u = state.ambient.units.find((v) => v.id === hit.unit);
      showLabel({ unit: hit.unit }, describeUnit(world, u));
    } else {
      lowerPanel();
      hideUnitLabel();
    }
  }

  // Open a town's card on one of its tabs, scrolled to a part if asked.
  function openTown(id, sub = null, part = null) {
    const route = `town:${id}`;
    if (sub) memory.sub.town = sub;
    if (nav.open && nav.current === route) nav.redraw(true);
    else nav.push(route);
    if (part) document.getElementById(part)?.scrollIntoView({ block: 'start' });
  }

  // Long press on the map: quick actions, or what is known of the place.
  const pressCtx = {
    pick: (x, y) => renderer.pick(x, y, state, frac),
    toWorld: (x, y) => toWorld(cam, x, y),
    toPage: (x, y) => {
      const r = canvas.getBoundingClientRect();
      return { x: r.left + x, y: r.top + y };
    },
    ring: (x, y, title, list) => quick.show(x, y, title, list),
    peek: (x, y, title, html, list) => quick.peek(x, y, title, html, list),
    openTown,
  };
  function onLongPress(x, y) {
    if (pick.active) return;
    hideUnitLabel();
    longPress(app, pressCtx, x, y);
  }

  // Two quick taps on open land zoom in; on anything else they are taps.
  function onDoubleTap(x, y, zoom) {
    if (pick.active || renderer.pick(x, y, state, frac)) return false;
    zoom(2);
    return true;
  }

  // The renderer notices the camera moving by itself; a pan only slides its layers.
  const mapInput = attachMapInput(canvas, cam, world, {
    onTap: (x, y) => {
      if (quick.open) return quick.close();
      onTap(x, y);
    },
    onDoubleTap,
    onLongPress,
    onPress: (at) => quick.pressing(at),
    onChange: () => {},
  });

  let firstSize = true;
  function layout() {
    const root = document.documentElement.style;
    root.setProperty('--bar-h', `${document.getElementById('topbar').offsetHeight}px`);
    root.setProperty('--tab-h', `${panel.side ? 0 : document.getElementById('tabbar').offsetHeight}px`);
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    resizeCamera(cam, world, w, h, firstSize);
    if (firstSize) { cam.x = 500; cam.y = 420; resizeCamera(cam, world, w, h, false); }
    firstSize = false;
    renderer.resize(w, h);
    if (panel.open) panel.place();
  }
  new ResizeObserver(layout).observe(stage);
  layout();

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === ' ') { e.preventDefault(); setSpeed(speed ? 0 : 1); }
    if (e.key === '1') setSpeed(1);
    if (e.key === '2') setSpeed(2);
    if (e.key === '3') setSpeed(4);
    if (e.key === 'Escape') {
      if (pick.active) { pick.end(); afterPick(); } else nav.close();
      hideUnitLabel();
    }
  });

  // Put away or closed: save the reign and the interface's memory, and
  // pause. Coming back, it stays paused until the player plays on.
  const keep = () => {
    nav.rememberScroll();
    saveMemory(memory);
    writeSave(serialize(state));
  };
  window.addEventListener('pagehide', keep);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    keep();
    if (speed > 0) setSpeed(0);
    mapInput.stop();
  });

  registerWorker({
    onUpdate: (restart) => {
      const el = document.getElementById('update');
      el.hidden = false;
      document.getElementById('update-restart').onclick = () => {
        el.hidden = true;
        restart();
      };
    },
  });

  function sample() {
    const last = app.samples.at(-1);
    if (last?.day === state.day) return;
    app.samples.push({ day: state.day, treasury: state.treasury, granary: realmStock(state).food, authority: state.authority, stability: state.stability });
    if (app.samples.length > 120) app.samples.shift();
  }

  // The clock. Whole days go through the simulation; the leftover fraction
  // only slides ambient units along so motion looks smooth between days.
  let last = performance.now();
  let lastSheetRefresh = 0;
  let lastHintCheck = 0;
  // How long each frame's own work takes (the realm's days and the drawing),
  // for the performance test: it must fit well inside a sixtieth of a second.
  const frameStats = { frames: 0, ms: 0, max: 0, recent: [], days: [] };
  // After a day of the realm the interface catches up in the next frame
  // without one, so the frame that ran the day stays light.
  let uiDue = 0;
  function catchUp(now) {
    uiDue = 0;
    topbar.update(state);
    sample();
    // Open panels follow the realm twice a second at most: at 4x that
    // spares the phone rebuilding a card four times a second.
    if (now - lastSheetRefresh > 500) {
      lastSheetRefresh = now;
      nav.refresh();
      updateBadges();
      updateUrgent();
    }
  }

  function frame(now) {
    const work = performance.now();
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    let stepped = false;
    if (speed > 0) {
      frac += dt * speed;
      const days = Math.min(MAX_DAYS_PER_FRAME, Math.floor(frac));
      if (days > 0) {
        stepped = true;
        frac -= days;
        const month = dateOf(state.day).month;
        state = step(state, days, world);
        if (dateOf(state.day).month !== month) save(true);
        uiDue += 1;
        if (newSightings()) setSpeed(0);
        if (newDecisions()) {
          setSpeed(0);
          uiDue = 3;
          lastSheetRefresh = 0;
        }
      }
    }
    // Never more than a few frames behind, however busy the realm.
    if (uiDue && (!stepped || uiDue >= 3)) catchUp(now);
    if (label) {
      const p = label.unit ? renderer.unitScreen(state, label.unit, frac) : renderer.armyScreen(state, label.army, frac);
      if (!p || now > unitLabelUntil) hideUnitLabel();
      else {
        // Keep the label on screen even when its unit is near an edge.
        const half = unitLabel.offsetWidth / 2 + 8;
        unitLabel.style.left = `${Math.min(stage.clientWidth - half, Math.max(half, p.x))}px`;
        unitLabel.style.top = `${p.y}px`;
      }
    }
    renderer.draw(state, frac, nav.open || label || pick.active ? selection : null);
    if (now - lastHintCheck > 1000) {
      lastHintCheck = now;
      hints.check(state, world);
    }
    const took = performance.now() - work;
    frameStats.frames += 1;
    frameStats.ms += took;
    frameStats.max = Math.max(frameStats.max, took);
    frameStats.recent.push(took);
    frameStats.days.push(stepped);
    if (frameStats.recent.length > 600) {
      frameStats.recent.shift();
      frameStats.days.shift();
    }
    requestAnimationFrame(frame);
  }

  topbar.update(state);
  sample();
  updateBadges();
  updateUrgent();
  setSpeed(params.has('paused') ? 0 : 1);
  document.getElementById('loading').hidden = true;
  requestAnimationFrame(frame);

  // A small handle for browser tests and curious players.
  window.northernWars = {
    world,
    get state() { return state; },
    get speed() { return speed; },
    get renderStats() { return renderer.stats; },
    get artStats() { return renderer.artStats; },
    get tileStats() { return renderer.tileStats; },
    // p95Calm leaves out the frames that also ran a day of the realm, to see
    // what the interface alone costs.
    get frameStats() {
      const p95 = (list) => [...list].sort((a, b) => a - b)[Math.floor(list.length * 0.95)] ?? 0;
      const calm = frameStats.recent.filter((_, i) => !frameStats.days[i]);
      return { frames: frameStats.frames, mean: frameStats.ms / Math.max(1, frameStats.frames), max: frameStats.max, p95: p95(frameStats.recent), p95Calm: p95(calm), dayFrames: frameStats.days.filter(Boolean).length };
    },
    // Where the interface stands: the open screen, the panel's height, and
    // its remembered state.
    get ui() {
      return { open: nav.open, route: nav.current, depth: nav.depth, snap: panel.side ? 'side' : panel.snap, scroll: panel.scroll, memory, picking: pick.active };
    },
    resetFrameStats() { Object.assign(frameStats, { frames: 0, ms: 0, max: 0, recent: [], days: [] }); },
    planOf: (id) => renderer.planOf(id),
    // What a tap at these page coordinates would pick, for browser tests.
    pickAt(x, y) {
      const r = canvas.getBoundingClientRect();
      return renderer.pick(x - r.left, y - r.top, state, frac);
    },
    setSpeed,
    // Bring a map point to the middle of the screen.
    lookAt(x, y) {
      panBy(cam, world, (cam.x - x) * cam.scale, (cam.y - y) * cam.scale);
      renderer.recentre();
    },
    screenOf(id) {
      const st = world.byId[id];
      const r = canvas.getBoundingClientRect();
      return { x: r.left + (st.x - cam.x) * cam.scale + cam.viewW / 2, y: r.top + (st.y - cam.y) * cam.scale + cam.viewH / 2 };
    },
    screenOfPoint(x, y) {
      const r = canvas.getBoundingClientRect();
      return { x: r.left + (x - cam.x) * cam.scale + cam.viewW / 2, y: r.top + (y - cam.y) * cam.scale + cam.viewH / 2 };
    },
    armyScreenOf(id) {
      const p = renderer.armyScreen(state, id, frac);
      const r = canvas.getBoundingClientRect();
      return p && { x: r.left + p.x, y: r.top + p.y };
    },
    unitScreenOf(id) {
      const p = renderer.unitScreen(state, id, frac);
      const r = canvas.getBoundingClientRect();
      return p && { x: r.left + p.x, y: r.top + p.y };
    },
  };
}

function freshSeed() {
  return (Date.now() ^ Math.floor(Math.random() * 0x100000000)) >>> 0;
}

function startingState(world) {
  if (params.has('seed')) return createState(world, Number(params.get('seed')) >>> 0);
  const saved = readSave();
  if (saved && !params.has('fresh')) {
    try {
      return deserialize(saved, world);
    } catch (err) {
      console.warn('Saved game ignored:', err.message);
    }
  }
  return createState(world, freshSeed());
}

boot().catch((err) => {
  const loading = document.getElementById('loading');
  loading.hidden = false;
  loading.textContent = `The map could not be unrolled: ${err.message}`;
  throw err;
});
