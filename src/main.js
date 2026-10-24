// Wires the simulation, the map and the panels together, and owns the clock.
import { loadWorld, createState, step, serialize, deserialize, dateOf, describeUnit, applyAction } from './sim/index.js';
import { createCamera, resizeCamera } from './render/camera.js';
import { attachMapInput } from './render/input.js';
import { createRenderer } from './render/renderer.js';
import { createTopbar } from './ui/topbar.js';
import { createSheet } from './ui/sheet.js';
import { settlementCardHtml } from './ui/settlementCard.js';
import { realmMenuHtml, chronicleHtml, ledgerHtml } from './ui/menu.js';
import { lawsHtml } from './ui/laws.js';
import { neighboursHtml, realmCardHtml, envoyHtml } from './ui/neighbours.js';
import { faithHtml, petitionHtml } from './ui/faith.js';
import { noblesHtml, houseCardHtml, demandHtml, depositionHtml } from './ui/nobles.js';
import { writeSave, readSave, downloadText } from './ui/storage.js';

const MAX_DAYS_PER_FRAME = 8;
const params = new URLSearchParams(location.search);

async function readJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Could not load ${path}`);
  return res.json();
}

async function boot() {
  const world = await loadWorld(readJson);
  const [peoples, faiths, goods] = await Promise.all(['data/peoples.json', 'data/faiths.json', 'data/goods.json'].map(readJson));
  const lookups = { peoples, faiths, goods };

  let state = startingState(world);
  let speed = 0;
  let frac = 0;
  let selection = null;
  let unitLabelUntil = 0;

  const stage = document.getElementById('stage');
  const canvas = document.getElementById('map');
  const unitLabel = document.getElementById('unit-label');
  const toastEl = document.getElementById('toast');
  const cam = createCamera(world);
  const renderer = createRenderer(canvas, world, cam);

  const topbar = createTopbar(world, { onSpeed: setSpeed, onMenu: openMenu });
  const sheet = createSheet({ onClose: () => { if (selection?.settlement) selection = null; } });

  let toastTimer = 0;
  function toast(text) {
    toastEl.textContent = text;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastEl.hidden = true), 2600);
  }

  function setSpeed(s) {
    speed = s;
    topbar.setSpeed(s);
  }

  function save(quiet) {
    const err = writeSave(serialize(state));
    if (err) toast(err);
    else if (!quiet) toast('The reign is saved.');
  }

  function replaceState(next, message) {
    state = next;
    frac = 0;
    shownDepositions = state.depositions.length;
    selection = null;
    sheet.close();
    hideUnitLabel();
    topbar.update(state);
    if (message) toast(message);
  }

  // Panels

  function openSettlement(id) {
    selection = { settlement: id };
    hideUnitLabel();
    const body = sheet.open(`settlement:${id}`, settlementCardHtml(world, state, id, lookups));
    body.onclick = (e) => {
      const b = e.target.closest('[data-build]');
      const house = e.target.closest('[data-house]');
      if (b && !b.disabled) order({ type: 'build', settlement: id, building: b.dataset.build });
      else if (house) openHouse(house.dataset.house);
    };
  }

  // Player orders go through the simulation's own rules, like everything else.
  function order(action) {
    const out = applyAction(state, world, action);
    if (out.error) return toast(out.error);
    state = out.state;
    topbar.update(state);
    refreshOpenSheet();
    const last = state.chronicle.at(-1);
    if (last) toast(last.text);
  }

  function openMenu() {
    if (sheet.current === 'menu') return sheet.close();
    selection = null;
    const body = sheet.open('menu', realmMenuHtml(world, state, !!readSave()));
    body.onclick = (e) => menuAction(e.target.closest('[data-action]')?.dataset.action);
  }

  let openLaw = null;
  function openLaws() {
    const body = sheet.open('laws', lawsHtml(world, state, openLaw));
    body.onclick = (e) => {
      const head = e.target.closest('[data-law]');
      const pick = e.target.closest('[data-decree]');
      if (head) {
        openLaw = openLaw === head.dataset.law ? null : head.dataset.law;
        sheet.patch('laws', lawsHtml(world, state, openLaw));
      } else if (pick && !pick.disabled) {
        const [law, option] = pick.dataset.decree.split(':');
        const name = world.laws.laws[law].options[option].name;
        // Decrees cost Authority and cannot be undone for a month, so ask once.
        if (confirm(`Decree: ${name}?`)) {
          order({ type: 'law', law, option });
          sheet.patch('laws', lawsHtml(world, state, openLaw));
        }
      } else menuAction(e.target.closest('[data-action]')?.dataset.action);
    };
  }

  function openNeighbours() {
    selection = null;
    const body = sheet.open('neighbours', neighboursHtml(world, state));
    body.onclick = (e) => {
      const realm = e.target.closest('[data-realm]');
      const envoy = e.target.closest('[data-envoy]');
      if (realm) openRealm(realm.dataset.realm);
      else if (envoy) openEnvoy(Number(envoy.dataset.envoy));
      else menuAction(e.target.closest('[data-action]')?.dataset.action);
    };
  }

  function openRealm(id) {
    selection = null;
    hideUnitLabel();
    const body = sheet.open(`realm:${id}`, realmCardHtml(world, state, id));
    body.onclick = (e) => {
      const st = e.target.closest('[data-stance]');
      if (st && !st.disabled) order({ type: 'stance', realm: id, stance: st.dataset.stance });
      else menuAction(e.target.closest('[data-action]')?.dataset.action);
    };
  }

  // Envoys pause the game and wait for an answer, once each. Closed unanswered,
  // they stay listed under Neighbouring realms until their time runs out.
  const shownEnvoys = new Set();
  function openEnvoy(id) {
    const pending = state.envoys.find((p) => p.id === id);
    if (!pending) return;
    shownEnvoys.add(id);
    selection = null;
    hideUnitLabel();
    const body = sheet.open(`envoy:${id}`, envoyHtml(world, pending));
    body.onclick = (e) => {
      const c = e.target.closest('[data-choice]');
      if (!c) return;
      order({ type: 'envoy', id, choice: Number(c.dataset.choice) });
      sheet.close();
      showNextDecision();
    };
  }

  function openFaith() {
    selection = null;
    const body = sheet.open('faith', faithHtml(world, state, lookups));
    body.onclick = (e) => {
      const place = e.target.closest('[data-place]');
      const pet = e.target.closest('[data-petition]');
      if (place) openSettlement(place.dataset.place);
      else if (pet) openPetition(Number(pet.dataset.petition));
      else menuAction(e.target.closest('[data-action]')?.dataset.action);
    };
  }

  const shownPetitions = new Set();
  function openPetition(id) {
    const pending = state.petitions.find((p) => p.id === id);
    if (!pending) return;
    shownPetitions.add(id);
    selection = null;
    hideUnitLabel();
    const body = sheet.open(`petition:${id}`, petitionHtml(world, pending));
    body.onclick = (e) => {
      const c = e.target.closest('[data-choice]');
      if (!c) return;
      order({ type: 'petition', id, choice: Number(c.dataset.choice) });
      sheet.close();
      showNextDecision();
    };
  }

  function openNobles() {
    selection = null;
    const body = sheet.open('nobles', noblesHtml(world, state));
    body.onclick = (e) => {
      const house = e.target.closest('[data-house]');
      const demand = e.target.closest('[data-demand]');
      if (house) openHouse(house.dataset.house);
      else if (demand) openDemand(Number(demand.dataset.demand));
      else menuAction(e.target.closest('[data-action]')?.dataset.action);
    };
  }

  let housePicking = null;
  function openHouse(id, picking = null) {
    selection = null;
    hideUnitLabel();
    housePicking = picking;
    const body = sheet.open(`house:${id}`, houseCardHtml(world, state, id, picking));
    body.onclick = (e) => {
      const t = e.target;
      const act = t.closest('[data-house-action]');
      const pick = t.closest('[data-house-pick]');
      const grant = t.closest('[data-grant]');
      const strip = t.closest('[data-strip]');
      const place = t.closest('[data-place]');
      const name = world.houses.houses[id].name;
      if (act && !act.disabled) {
        const kind = act.dataset.houseAction;
        // Fines and levies leave grievances behind, so ask once.
        if ((kind === 'fine' || kind === 'levies') && !confirm(`${act.querySelector('.build-name').textContent}: ${name}?`)) return;
        order({ type: 'house', house: id, kind });
      } else if (pick && !pick.disabled) {
        openHouse(id, housePicking === pick.dataset.housePick ? null : pick.dataset.housePick);
      } else if (grant) {
        if (confirm(`Grant ${world.byId[grant.dataset.grant].name} to ${name}?`)) {
          order({ type: 'house', house: id, kind: 'grant', settlement: grant.dataset.grant });
          openHouse(id);
        }
      } else if (strip) {
        if (confirm(`Strip ${name} of ${world.byId[strip.dataset.strip].name}? Every house will remember.`)) {
          order({ type: 'house', house: id, kind: 'strip', settlement: strip.dataset.strip });
          openHouse(id);
        }
      } else if (place) openSettlement(place.dataset.place);
      else menuAction(t.closest('[data-action]')?.dataset.action);
    };
  }

  const shownDemands = new Set();
  function openDemand(id) {
    const pending = state.demands.find((p) => p.id === id);
    if (!pending) return;
    shownDemands.add(id);
    selection = null;
    hideUnitLabel();
    const body = sheet.open(`demand:${id}`, demandHtml(world, pending));
    body.onclick = (e) => {
      const c = e.target.closest('[data-choice]');
      if (!c) return;
      order({ type: 'demand', id, choice: Number(c.dataset.choice) });
      sheet.close();
      showNextDecision();
    };
  }

  // A deposition is shown once, when it happens. The regency is already in
  // place; the player may carry on or start afresh.
  let shownDepositions = state.depositions.length;
  function openDeposition() {
    shownDepositions = state.depositions.length;
    const summary = state.depositions.at(-1);
    const body = sheet.open('deposition', depositionHtml(summary));
    body.onclick = (e) => {
      if (e.target.closest('[data-regency]')) {
        sheet.close();
        showNextDecision();
        toast('The regency council takes up the crown.');
      } else if (e.target.closest('[data-new-reign]') && confirm('Abandon this realm and start anew?')) {
        replaceState(createState(world, freshSeed()), 'A new reign begins.');
        shownDepositions = state.depositions.length;
        save(true);
      }
    };
  }

  // Decisions waiting on the crown open one at a time, the gravest first.
  // Answering one opens the next, so a crowded morning is dealt with in a row.
  function showNextDecision() {
    if (state.depositions.length > shownDepositions) { openDeposition(); return true; }
    const demand = state.demands.find((p) => !shownDemands.has(p.id));
    if (demand) { openDemand(demand.id); return true; }
    const envoy = state.envoys.find((p) => !shownEnvoys.has(p.id));
    if (envoy) { openEnvoy(envoy.id); return true; }
    const petition = state.petitions.find((p) => !shownPetitions.has(p.id));
    if (petition) { openPetition(petition.id); return true; }
    return false;
  }

  function openLedger() {
    const body = sheet.open('ledger', ledgerHtml(world, state));
    body.onclick = (e) => menuAction(e.target.closest('[data-action]')?.dataset.action);
  }

  function openChronicle() {
    const body = sheet.open('chronicle', chronicleHtml(state));
    body.onclick = (e) => menuAction(e.target.closest('[data-action]')?.dataset.action);
  }

  function menuAction(action) {
    if (!action) return;
    if (action === 'chronicle') openChronicle();
    else if (action === 'ledger') openLedger();
    else if (action === 'laws') openLaws();
    else if (action === 'neighbours') openNeighbours();
    else if (action === 'faith') openFaith();
    else if (action === 'nobles') openNobles();
    else if (action === 'back') openMenu();
    else if (action === 'save') save(false);
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

  // Map input

  function hideUnitLabel() {
    unitLabel.hidden = true;
    if (selection?.unit) selection = null;
  }

  function onTap(x, y) {
    const hit = renderer.pick(x, y, state, frac);
    if (hit?.settlement) openSettlement(hit.settlement);
    else if (hit?.neighbour) openRealm(hit.neighbour);
    else if (hit?.unit) {
      sheet.close();
      selection = { unit: hit.unit };
      const u = state.ambient.units.find((v) => v.id === hit.unit);
      unitLabel.textContent = describeUnit(world, u);
      unitLabel.hidden = false;
      unitLabelUntil = performance.now() + 4000;
    } else {
      sheet.close();
      hideUnitLabel();
    }
  }

  attachMapInput(canvas, cam, world, { onTap, onChange: () => renderer.invalidate() });

  let firstSize = true;
  function layout() {
    document.documentElement.style.setProperty('--bar-h', `${document.getElementById('topbar').offsetHeight}px`);
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    resizeCamera(cam, world, w, h, firstSize);
    if (firstSize) { cam.x = 500; cam.y = 420; resizeCamera(cam, world, w, h, false); }
    firstSize = false;
    renderer.resize(w, h);
  }
  new ResizeObserver(layout).observe(stage);
  layout();

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === ' ') { e.preventDefault(); setSpeed(speed ? 0 : 1); }
    if (e.key === '1') setSpeed(1);
    if (e.key === '2') setSpeed(2);
    if (e.key === '3') setSpeed(4);
    if (e.key === 'Escape') { sheet.close(); hideUnitLabel(); }
  });

  // The clock. Whole days go through the simulation; the leftover fraction
  // only slides ambient units along so motion looks smooth between days.
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    if (speed > 0) {
      frac += dt * speed;
      const days = Math.min(MAX_DAYS_PER_FRAME, Math.floor(frac));
      if (days > 0) {
        frac -= days;
        const month = dateOf(state.day).month;
        state = step(state, days, world);
        if (dateOf(state.day).month !== month) save(true);
        topbar.update(state);
        refreshOpenSheet();
        if (showNextDecision()) setSpeed(0);
      }
    }
    if (selection?.unit) {
      const p = renderer.unitScreen(state, selection.unit, frac);
      if (!p || now > unitLabelUntil) hideUnitLabel();
      else {
        // Keep the label on screen even when its unit is near an edge.
        const half = unitLabel.offsetWidth / 2 + 8;
        unitLabel.style.left = `${Math.min(stage.clientWidth - half, Math.max(half, p.x))}px`;
        unitLabel.style.top = `${p.y}px`;
      }
    }
    renderer.draw(state, frac, selection);
    requestAnimationFrame(frame);
  }

  function refreshOpenSheet() {
    const cur = sheet.current;
    if (cur?.startsWith('settlement:')) sheet.patch(cur, settlementCardHtml(world, state, cur.slice(11), lookups));
    else if (cur === 'chronicle') sheet.patch(cur, chronicleHtml(state));
    else if (cur === 'ledger') sheet.patch(cur, ledgerHtml(world, state));
    else if (cur === 'laws') sheet.patch(cur, lawsHtml(world, state, openLaw));
    else if (cur === 'neighbours') sheet.patch(cur, neighboursHtml(world, state));
    else if (cur?.startsWith('realm:')) sheet.patch(cur, realmCardHtml(world, state, cur.slice(6)));
    else if (cur?.startsWith('envoy:') && !state.envoys.some((p) => `envoy:${p.id}` === cur)) sheet.close();
    else if (cur === 'faith') sheet.patch(cur, faithHtml(world, state, lookups));
    else if (cur?.startsWith('petition:') && !state.petitions.some((p) => `petition:${p.id}` === cur)) sheet.close();
    else if (cur === 'nobles') sheet.patch(cur, noblesHtml(world, state));
    else if (cur?.startsWith('house:')) sheet.patch(cur, houseCardHtml(world, state, cur.slice(6), housePicking));
    else if (cur?.startsWith('demand:') && !state.demands.some((p) => `demand:${p.id}` === cur)) sheet.close();
  }

  topbar.update(state);
  setSpeed(params.has('paused') ? 0 : 1);
  document.getElementById('loading').hidden = true;
  requestAnimationFrame(frame);

  // A small handle for browser tests and curious players.
  window.northernWars = {
    world,
    get state() { return state; },
    get speed() { return speed; },
    setSpeed,
    screenOf(id) {
      const st = world.byId[id];
      const r = canvas.getBoundingClientRect();
      return { x: r.left + (st.x - cam.x) * cam.scale + cam.viewW / 2, y: r.top + (st.y - cam.y) * cam.scale + cam.viewH / 2 };
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
