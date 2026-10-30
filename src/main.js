// Wires the simulation, the map and the panels together, and owns the clock.
import { loadWorld, createState, step, serialize, deserialize, dateOf, describeUnit, witcherOnRoad, applyAction, describeArmy, authority, describeFigure, figurePosition, daysToArrive, TEMERIA, bestCompanyFor, freeCompanies, realmStock, repairOptions, markerAt } from './sim/index.js';
import { createCamera, resizeCamera, panBy, toWorld, toScreen, zoomAt } from './render/camera.js';
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
import { createAudio } from './ui/audio.js';
import { ask, attachDialog } from './ui/dialog.js';
import { focusOf } from './ui/focus.js';

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
  // The frame clock (M22 A): when the last frame ran, whether one is asked
  // for, the timer for a capped one, and when the camera last moved.
  let last = performance.now();
  let framePending = false;
  let frameTimer = null;
  let frameGap = 0;
  let camMovedAt = 0;
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
  // Battery saver (M22 A) starts on for phones until the player says otherwise.
  if (prefs.batterySaver === undefined) prefs.batterySaver = matchMedia('(pointer: coarse)').matches;
  stopBrowserGestures();
  instantPress();
  const haptic = createHaptics(prefs);
  const wake = createWakeLock(prefs);
  renderer.setSaver(prefs.batterySaver);
  const audio = createAudio(prefs, { save: savePrefs });
  // A long press completing ticks as well as buzzes.
  const quick = createQuick({ haptic: (k) => { haptic(k); if (k === 'press') audio.play('ring'); } });
  // The interface's memory survives reloads, but the panel starts closed:
  // one tap on a tab brings back exactly what was open.
  const memory = loadMemory();
  memory.open = false;

  const topbar = createTopbar(world, {
    onSpeed: setSpeed, onMore: toggleMore, onMeter: (route) => nav.push(route),
    // The line under the meters: the Labour screen up close, the month's orders on the board.
    onPressure: (board) => (board ? nav.push('orders') : goTab('realm:labour')),
  });

  // One context for every screen and control.
  const app = {
    world, lookups, hintData, hints, prefs, memory,
    get state() { return state; },
    samples: [],
    acked: () => acked,
    order,
    orderWithUndo,
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
    sound: (k) => audio.play(k),
    audio,
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
  attachDialog();
  const pick = createPick(app, {
    onStart: () => {
      hideUnitLabel();
      // Clear the map: the panel drops to its title bar while picking.
      if (nav.open && !panel.side && panel.snap !== 'peek') panel.setSnap('peek', { remember: false, instant: true });
    },
  });

  // ---- Notices ----

  let toastTimer = 0;
  // How long a weighty order's notice offers Undo.
  const UNDO_MS = 6000;
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
    audio.play('bell');
    return !!prefs.pauseOnSighting;
  }

  // Decisions go to the Court inbox with a badge and a short toast; the
  // game still pauses for each new one, as it always has.
  // Checked every day, so it only compares ids; the words are written out
  // only when something new has come.
  const decisionKeys = () => [
    ...(state.depositions.length > acked ? ['deposition'] : []),
    ...(state.warDecisions ?? []).map((d) => `warDecision:${d.id}`),
    ...(state.conquest?.decisions ?? []).map((d) => `conquestDecision:${d.id}`),
    ...(state.works?.decisions ?? []).map((d) => `worksDecision:${d.id}`),
    ...state.events.map((d) => `event:${d.id}`),
    ...state.demands.map((d) => `demand:${d.id}`),
    ...state.envoys.map((d) => `envoy:${d.id}`),
    ...state.petitions.map((d) => `petition:${d.id}`),
    ...(state.orders?.envoys ?? []).map((e) => `envoyAway:${e.realm}`),
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
    audio.play('bell');
    const d = fresh[0];
    toast(`${d.kicker}: ${d.title}. It waits at court.${fresh.length > 1 ? ` (${fresh.length} new)` : ''}`);
    updateBadges();
    // Repairs (M20) come often and keep, and our own envoys' audiences were
    // asked for: both wait at court without stopping the clock.
    return fresh.some((x) => x.kind !== 'worksDecision' && x.kind !== 'envoyAway');
  }

  // Battle pace (M19): when one of our armies gives battle, the game drops
  // to 1x so it can be watched (or pauses, if the player asked), and goes
  // back to its old speed once the fighting is over.
  const battlesSeen = new Set((state.fights ?? []).map((f) => f.id));
  let paceFrom = null;
  function battlePace() {
    const ours = (state.fights ?? []).filter((f) => !f.over && f.sides.includes(TEMERIA));
    const fresh = ours.find((f) => !battlesSeen.has(f.id));
    for (const f of ours) battlesSeen.add(f.id);
    if (fresh) {
      toast(`Battle near ${fresh.place}. Tap the banner to watch.`);
      audio.play('horn');
      if (prefs.pauseOnBattle) setSpeed(0);
      else if (speed > 1) {
        paceFrom ??= speed;
        setSpeed(1);
      }
      updateUrgent();
    } else if (!ours.length && paceFrom !== null) {
      if (speed === 1) setSpeed(paceFrom);
      paceFrom = null;
    }
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
    // War and sieges sound the horn; other urgent news rings the bell.
    audio.play(/^(declared|siege):/.test(top.key) ? 'horn' : 'bell');
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
    last = performance.now();
    wakeFrame();
  }

  function save(quiet) {
    const err = writeSave(serialize(state));
    saveMemory(memory);
    if (err) toast(err);
    else if (!quiet) toast('The reign is saved.');
  }

  function replaceState(next, message) {
    dropUndo();
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
    dropUndo();
    const out = applyAction(state, world, action);
    if (out.error) {
      audio.play('knock');
      toast(out.error);
      return false;
    }
    lastNote = out.note ?? null;
    const before = state.chronicle.length;
    const purse = state.treasury;
    const prev = state;
    state = out.state;
    followOrder(prev, action);
    orderSound(action, purse, state.treasury);
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

  // A weighty order that can be taken back (M23 A): it happens at once, and
  // its notice offers Undo for a few seconds, until a day passes or another
  // order is given. Undo puts the realm back exactly as it was.
  const undoEl = document.getElementById('undo');
  let undoable = null;
  let undoTimer = 0;
  function dropUndo() {
    undoable = null;
    clearTimeout(undoTimer);
    undoEl.hidden = true;
  }
  function orderWithUndo(action) {
    const prev = state;
    if (!order(action)) return false;
    // The same words the order's own notice would have said, with Undo.
    toastEl.hidden = true;
    clearTimeout(toastTimer);
    undoable = { prev, day: prev.day };
    const said = lastNote ?? (state.chronicle.length > prev.chronicle.length ? state.chronicle.at(-1).text : 'Done.');
    document.getElementById('undo-text').textContent = said;
    undoEl.hidden = false;
    clearTimeout(undoTimer);
    undoTimer = setTimeout(dropUndo, UNDO_MS);
    return true;
  }
  function undo() {
    if (!undoable) return;
    const { prev } = undoable;
    dropUndo();
    state = prev;
    audio.play('knock');
    topbar.update(state);
    renderer.invalidate();
    nav.refresh();
    updateBadges();
    updateUrgent();
    decisionsSeen = new Set(decisionKeys());
    audience?.render();
    toast('Undone.');
    wakeFrame();
  }
  document.getElementById('undo-go').addEventListener('click', undo);

  // Laws and peace are sealed; war is declared with a horn; everything else
  // lands with a wooden thunk, and coin clinks when the treasury moves.
  function orderSound(action, before, after) {
    const kind = action.type === 'declare' ? 'horn' : ['law', 'peace'].includes(action.type) ? 'seal' : 'confirm';
    audio.play(kind);
    if (Math.abs((after ?? 0) - (before ?? 0)) >= 1) setTimeout(() => audio.play('coin'), 90);
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
    else if (kind === 'board') selection = { realm: arg };
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
    if (action === 'saver-on' || action === 'saver-off') {
      prefs.batterySaver = action === 'saver-on';
      savePrefs(prefs);
      renderer.setSaver(prefs.batterySaver);
      wake.sync();
      nav.refresh();
    } else if (/^(haptics|awake)-(on|off)$/.test(action)) {
      const [k, v] = action.split('-');
      prefs[k === 'haptics' ? 'haptics' : 'keepAwake'] = v === 'on';
      savePrefs(prefs);
      wake.sync();
      if (k === 'haptics' && v === 'on') haptic('confirm');
      nav.refresh();
    } else if (action === 'silent-on' || action === 'silent-off') {
      audio.set('playOnSilent', action === 'silent-on');
      nav.refresh();
    } else if (/^(music|sfx)-(on|off)$/.test(action)) {
      const [k, v] = action.split('-');
      audio.set(k === 'music' ? 'musicOn' : 'sfxOn', v === 'on');
      nav.refresh();
    } else if (action === 'battle-pause-on' || action === 'battle-pause-off') {
      prefs.pauseOnBattle = action === 'battle-pause-on';
      savePrefs(prefs);
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
      ask('Abandon this reign and start anew? Unsaved progress will be lost.', { yes: 'Abandon it' }).then((yes) => {
        if (!yes) return;
        replaceState(createState(world, freshSeed()), 'A new reign begins.');
        save(true);
      });
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

  // An order that sends someone (a company after a threat, a witcher, an
  // army, a town's levy, an escort) glides the camera there and drops the
  // panel to its title bar, so the player sees it happen (M24 follow-up).
  const FOLLOW_ZOOM = 2.2;
  function followOrder(prev, action) {
    const p = focusOf(prev, world, action);
    if (!p || !mapInput) return;
    lowerPanel();
    mapInput.flyTo(p.x, p.y, Math.max(cam.scale, FOLLOW_ZOOM * (cam.cover || cam.scale)));
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
    // On the board: Temeria takes the crown back to its kingdom, any other
    // realm opens its short card.
    if (hit?.realm === TEMERIA) { hideUnitLabel(); toKingdom(x, y); }
    else if (hit?.realm) { hideUnitLabel(); nav.push(`board:${hit.realm}`); }
    else if (hit?.settlement) { hideUnitLabel(); nav.push(`town:${hit.settlement}`); }
    else if (hit?.neighbour) { hideUnitLabel(); nav.push(`realm:${hit.neighbour}`); }
    else if (hit?.foreign && foreignView(hit.foreign)) { hideUnitLabel(); nav.push(`foreign:${hit.foreign}`); }
    else if (hit?.battle) { hideUnitLabel(); nav.push(`battle:${hit.battle}`); }
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
      showLabel({ unit: hit.unit }, describeUnit(world, u, state));
    } else if (hit?.figure) {
      // A figure on the road (M23 C): who it is and what it is about.
      lowerPanel();
      const f = state.figures.find((v) => v.id === hit.figure);
      if (f) showLabel({ figure: f.id }, describeFigure(state, world, f));
    } else {
      lowerPanel();
      hideUnitLabel();
    }
  }

  // From the board back to the kingdom view: a glide in to the opening zoom.
  function toKingdom(x, y) {
    const f = (cam.cover || cam.scale) / cam.scale;
    if (f > 1.01) mapInput.animateZoom(x, y, f, 420);
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
    if (pick.active) return false;
    const hit = renderer.pick(x, y, state, frac);
    // A double tap on a realm of the board zooms into it.
    if (hit?.realm) { toKingdom(x, y); return true; }
    if (hit) return false;
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
    onChange: () => {
      camMovedAt = performance.now();
      wakeFrame();
    },
  });

  let firstSize = true;
  function layout() {
    wakeFrame();
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
    app.samples.push({ day: state.day, treasury: state.treasury, granary: realmStock(state).food, love: state.love, fear: state.fear, authority: authority(state, world), unrest: state.unrest });
    if (app.samples.length > 120) app.samples.shift();
  }

  // The clock. Whole days go through the simulation; the leftover fraction
  // only slides ambient units along so motion looks smooth between days.
  let lastSheetRefresh = 0;
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
    framePending = false;
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
        if (undoable) dropUndo();
        if (dateOf(state.day).month !== month) save(true);
        uiDue += 1;
        if (newSightings()) setSpeed(0);
        battlePace();
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
    renderer.draw(state, frac, nav.open || label || pick.active ? selection : null, { tick: speed === 0 && renderer.lively() ? now / 1000 : null });
    topbar.update(state, renderer.boardness >= 0.5);
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
    nextFrame(work);
  }

  // Frames on demand (M22 A). A frame is asked for only when something
  // needs drawing: the realm running, the camera moving, a tap or key, the
  // panel changing, or something on screen that moves of itself. Running,
  // the map draws at most 30 times a second (full rate only while the camera
  // moves, never with Battery saver); paused, it draws 15 times a second
  // while battles or smoke are in sight, 8 while only travellers are, and
  // not at all otherwise, until the next event. A hidden page draws nothing.
  function wakeFrame() {
    if (framePending || document.hidden) return;
    if (frameTimer) {
      // A frame already due within the cap stands; only a slow (paused)
      // one gives way to a tap.
      if (frameGap <= 1000 / 30 + 1) return;
      clearTimeout(frameTimer);
      frameTimer = null;
    }
    framePending = true;
    requestAnimationFrame(frame);
  }
  function nextFrame(started) {
    if (document.hidden) return;
    const now = performance.now();
    const moving = now - camMovedAt < 200;
    const saver = !!prefs.batterySaver;
    let gap;
    if (speed > 0) gap = moving && !saver ? 0 : 1000 / 30;
    else if (moving || label || pick.active || uiDue) gap = saver ? 1000 / 30 : 0;
    else if (renderer.unfinished()) gap = 1000 / 30;
    else {
      const alive = renderer.lively();
      if (alive === 'war') gap = 1000 / 15;
      else if (alive === 'life') gap = 1000 / 8;
      else return;
    }
    if (!gap) {
      wakeFrame();
      return;
    }
    frameGap = gap;
    frameTimer = setTimeout(() => {
      frameTimer = null;
      wakeFrame();
    }, Math.max(0, gap - (now - started)));
  }
  // Hints are checked once a second on their own timer, not in the frame
  // loop, which sleeps while nothing moves.
  setInterval(() => { if (!document.hidden) hints.check(state, world); }, 1000);
  // Any tap, key or change in the interface may need the map redrawn.
  for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'wheel', 'keydown', 'click', 'input', 'change']) {
    document.addEventListener(ev, () => wakeFrame(), { capture: true, passive: true });
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      last = performance.now();
      renderer.invalidate();
      wakeFrame();
    }
  });

  topbar.update(state);
  sample();
  updateBadges();
  updateUrgent();
  setSpeed(params.has('paused') ? 0 : 1);
  document.getElementById('loading').hidden = true;
  wakeFrame();

  // A small handle for browser tests and curious players.
  window.northernWars = {
    world,
    get state() { return state; },
    get speed() { return speed; },
    // What the interface has asked to hear, newest last (sounds play only
    // after the first tap and when not muted).
    get sounds() { return [...audio.log]; },
    get heard() { return [...audio.heard]; },
    // Give an order as a tap would, for browser tests.
    order: (a) => { const r = order(a); wakeFrame(); return r; },
    // The two levels of the map (M20 D): zoom to a share of the opening
    // zoom, how far the board has faded in, and where a realm's marker sits.
    zoomTo: (rel) => { zoomAt(cam, world, cam.viewW / 2, cam.viewH / 2, (rel * cam.cover) / cam.scale); wakeFrame(); },
    get boardness() { return renderer.boardness; },
    markerOf: (rid) => { const m = markerAt(state, world, rid); const p = toScreen(cam, m.x, m.y); const r = canvas.getBoundingClientRect(); return { x: r.left + p.x, y: r.top + p.y }; },
    get audio() { return { unlocked: audio.unlocked, musicPlaying: audio.musicPlaying, context: audio.context, src: audio.music?.getAttribute('src') ?? null }; },
    // Frames and power (M22 A): whether the screen is held awake, and the
    // Battery saver setting.
    get wakeHeld() { return wake.held; },
    get prefs() { return { ...prefs }; },
    get renderStats() { return renderer.stats; },
    renderer,
    get artStats() { return renderer.artStats; },
    get tileStats() { return renderer.tileStats; },
    // p95Calm leaves out the frames that also ran a day of the realm, to see
    // what the interface alone costs.
    get frameStats() {
      const p95 = (list) => [...list].sort((a, b) => a - b)[Math.floor(list.length * 0.95)] ?? 0;
      const calm = frameStats.recent.filter((_, i) => !frameStats.days[i]);
      // meanCalm (M22 A): with frames capped at 30 a second, the day of the
      // realm falls on a larger share of them, so the plain mean rises while
      // the work done each second falls; the interface's own cost is the
      // mean of the frames without a day.
      const meanCalm = calm.length ? calm.reduce((a, b) => a + b, 0) / calm.length : 0;
      return { frames: frameStats.frames, mean: frameStats.ms / Math.max(1, frameStats.frames), meanCalm, max: frameStats.max, p95: p95(frameStats.recent), p95Calm: p95(calm), dayFrames: frameStats.days.filter(Boolean).length };
    },
    // Where the interface stands: the open screen, the panel's height, and
    // its remembered state.
    get ui() {
      return { open: nav.open, route: nav.current, depth: nav.depth, snap: panel.side ? 'side' : panel.snap, scroll: panel.scroll, memory, picking: pick.active };
    },
    resetFrameStats() { Object.assign(frameStats, { frames: 0, ms: 0, max: 0, recent: [], days: [] }); },
    planOf: (id) => renderer.planOf(id),
    repairOptions: (id, b) => repairOptions(state, world, id, b),
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
      wakeFrame();
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
    // Where a witcher on contract is on screen (M22 B), by the lair's id.
    // Where a figure on the road is on screen (M23 C).
    figureScreenOf(id) {
      const f = state.figures?.find((x) => x.id === id);
      const w = f && figurePosition(world, f, state.day + frac);
      return w ? this.screenOfPoint(w.x, w.y - 4 / cam.scale) : null;
    },
    witcherScreenOf(threat) {
      const c = state.threats.contracts.find((x) => x.threat === threat);
      const w = c && witcherOnRoad(state, world, c, frac);
      return w ? this.screenOfPoint(w.x, w.y - 4 / cam.scale) : null;
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
