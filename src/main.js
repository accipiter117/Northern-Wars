// Wires the simulation, the map and the panels together, and owns the clock.
import { loadWorld, createState, step, serialize, deserialize, dateOf, describeUnit, applyAction, describeArmy, TEMERIA } from './sim/index.js';
import { createCamera, resizeCamera, panBy } from './render/camera.js';
import { attachMapInput } from './render/input.js';
import { createRenderer } from './render/renderer.js';
import { createTopbar } from './ui/topbar.js';
import { createSheet } from './ui/sheet.js';
import { settlementCardHtml } from './ui/settlementCard.js';
import { realmMenuHtml, chronicleHtml, ledgerHtml } from './ui/menu.js';
import { lawsHtml } from './ui/laws.js';
import { neighboursHtml, realmCardHtml, envoyHtml, foreignCardHtml } from './ui/neighbours.js';
import { faithHtml, petitionHtml } from './ui/faith.js';
import { noblesHtml, houseCardHtml, demandHtml, depositionHtml } from './ui/nobles.js';
import { militaryHtml, eventHtml } from './ui/military.js';
import { warHtml, armyCardHtml, warDecisionHtml, musterPlaces } from './ui/war.js';
import { tradeHtml } from './ui/trade.js';
import { createHints, helpHtml } from './ui/hints.js';
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
  const [peoples, faiths, goods, hintData, layoutCfg] = await Promise.all(['data/peoples.json', 'data/faiths.json', 'data/goods.json', 'data/hints.json', 'data/layout.json'].map(readJson));
  const hints = createHints(hintData, { disabled: params.has('nohints') });
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
  const renderer = createRenderer(canvas, world, cam, layoutCfg);

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
    hints.note('townOpened');
    const body = sheet.open(`settlement:${id}`, settlementCardHtml(world, state, id, lookups));
    body.onclick = (e) => {
      const b = e.target.closest('[data-build]');
      const house = e.target.closest('[data-house]');
      const level = e.target.closest('[data-garrison]');
      const route = e.target.closest('[data-route-from]');
      const prospect = e.target.closest('[data-prospect]');
      if (route) {
        tradeForm.from = id;
        openTrade();
      } else if (prospect && !prospect.disabled) order({ type: 'prospect', settlement: id });
      else if (b && !b.disabled) order({ type: 'build', settlement: id, building: b.dataset.build });
      else if (house) openHouse(house.dataset.house);
      else if (level && !level.disabled) order({ type: 'garrison', settlement: id, level: level.dataset.garrison });
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
      const t = e.target;
      const st = t.closest('[data-stance]');
      const emb = t.closest('[data-embassy]');
      const spy = t.closest('[data-spy]');
      const place = t.closest('[data-foreign]');
      const declare = t.closest('[data-declare]');
      if (declare && !declare.disabled) {
        if (confirm(`Declare war on ${world.geography.neighbours[id].name}?`)) {
          order({ type: 'declare', realm: id });
          openWar();
        }
      } else if (st && !st.disabled) order({ type: 'stance', realm: id, stance: st.dataset.stance });
      else if (emb && !emb.disabled) order({ type: 'embassy', realm: id, close: emb.dataset.embassy === 'close' });
      else if (spy && !spy.disabled) {
        if (confirm(`Send a spy into ${world.geography.neighbours[id].name}? If caught, they will not forget it.`)) order({ type: 'spy', realm: id });
      } else if (place) openForeign(place.dataset.foreign);
      else menuAction(t.closest('[data-action]')?.dataset.action);
    };
  }

  // A foreign town, as far as the crown knows it.
  function openForeign(id) {
    selection = null;
    hideUnitLabel();
    // The renderer knows whether it is in sight; a remembered town comes from
    // the last report.
    const live = renderer.foreignInfo(id);
    const seen = state.ambient.intel?.seen[id];
    const view = live ?? (seen && { visible: false, ...seen });
    if (!view) return;
    const body = sheet.open(`foreign:${id}`, foreignCardHtml(world, state, id, view));
    body.onclick = (e) => {
      const realm = e.target.closest('[data-realm]');
      if (realm) openRealm(realm.dataset.realm);
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

  const patrolPick = { from: 'vizima', to: 'gors_velen' };
  function openMilitary() {
    selection = null;
    const body = sheet.open('military', militaryHtml(world, state, patrolPick));
    body.onchange = (e) => {
      const p = e.target.closest('[data-pick]');
      if (p) patrolPick[p.dataset.pick] = p.value;
    };
    body.onclick = (e) => {
      const place = e.target.closest('[data-place]');
      const recall = e.target.closest('[data-unpatrol]');
      if (e.target.closest('[data-order-patrol]')) {
        order({ type: 'patrol', from: patrolPick.from, to: patrolPick.to });
        renderer.invalidate();
      } else if (recall) {
        order({ type: 'unpatrol', id: Number(recall.dataset.unpatrol) });
        renderer.invalidate();
      } else if (place) openSettlement(place.dataset.place);
      else menuAction(e.target.closest('[data-action]')?.dataset.action);
    };
  }

  const shownEvents = new Set();
  function openEvent(id) {
    const pending = state.events.find((p) => p.id === id);
    if (!pending) return;
    shownEvents.add(id);
    selection = null;
    hideUnitLabel();
    const body = sheet.open(`event:${id}`, eventHtml(world, pending));
    body.onclick = (e) => {
      const c = e.target.closest('[data-choice]');
      if (!c) return;
      order({ type: 'event', id, choice: Number(c.dataset.choice) });
      sheet.close();
      showNextDecision();
    };
  }

  // Trade routes, gold mines and prospecting.
  const tradeForm = { from: 'vizima', to: 'maribor' };
  function openTrade() {
    selection = null;
    hideUnitLabel();
    hints.note('tradeOpened');
    const body = sheet.open('trade', tradeHtml(world, state, tradeForm));
    body.onchange = (e) => {
      const p = e.target.closest('[data-pick]');
      if (p) {
        tradeForm[p.dataset.pick] = p.value;
        sheet.patch('trade', tradeHtml(world, state, tradeForm));
      }
    };
    body.onclick = (e) => {
      const t = e.target;
      const close = t.closest('[data-close-route]');
      const place = t.closest('[data-place]');
      if (t.closest('[data-open-route]') && !t.closest('[data-open-route]').disabled) {
        order({ type: 'route', from: tradeForm.from, to: tradeForm.to });
        renderer.invalidate();
      } else if (close) {
        if (confirm('Wind up this trade route?')) {
          order({ type: 'route', close: true, id: Number(close.dataset.closeRoute) });
          renderer.invalidate();
        }
      } else if (place) openSettlement(place.dataset.place);
      else menuAction(t.closest('[data-action]')?.dataset.action);
    };
  }

  // War: the panel with every war, army and the raising form.
  const raiseForm = { muster: 'vizima', levy: 'third', nobles: false, companies: 0, marshal: 'vestibor', stance: 'cautious' };
  function openWar() {
    selection = null;
    hideUnitLabel();
    if (!musterPlaces(world, state).includes(raiseForm.muster)) raiseForm.muster = musterPlaces(world, state)[0];
    const body = sheet.open('war', warHtml(world, state, raiseForm));
    body.onchange = (e) => {
      const p = e.target.closest('[data-pick]');
      if (p) {
        raiseForm[p.dataset.pick] = p.value;
        sheet.patch('war', warHtml(world, state, raiseForm));
      }
    };
    body.onclick = (e) => {
      const t = e.target;
      const set = t.closest('[data-set]');
      const army = t.closest('[data-army]');
      const peace = t.closest('[data-peace]');
      const out = t.closest('[data-withdraw]');
      const dec = t.closest('[data-war-decision]');
      if (set) {
        const [k, v] = set.dataset.set.split(':');
        raiseForm[k] = k === 'companies' ? Number(v) : k === 'nobles' ? v === 'true' : v;
        sheet.patch('war', warHtml(world, state, raiseForm));
      } else if (t.closest('[data-raise]') && !t.closest('[data-raise]').disabled) {
        order({ type: 'raise', ...raiseForm });
        hints.note('armyRaised');
        const a = state.armies.at(-1);
        if (a?.side === TEMERIA) openArmy(a.id);
      } else if (army) openArmy(Number(army.dataset.army));
      else if (peace && !peace.disabled) {
        const [war, terms] = peace.dataset.peace.split(':');
        if (confirm('Make peace on these terms?')) order({ type: 'peace', war: Number(war), terms });
      } else if (out && confirm('Leave our friend to fight alone?')) order({ type: 'withdraw', war: Number(out.dataset.withdraw) });
      else if (dec) openWarDecision(Number(dec.dataset.warDecision));
      else menuAction(t.closest('[data-action]')?.dataset.action);
    };
  }

  const armyPick = {};
  function openArmy(id) {
    selection = { army: id };
    hideUnitLabel();
    const body = sheet.open(`army:${id}`, armyCardHtml(world, state, id, armyPick));
    body.onchange = (e) => {
      const p = e.target.closest('[data-pick]');
      if (p) armyPick[p.dataset.pick] = p.value;
    };
    body.onclick = (e) => {
      const t = e.target;
      const ord = t.closest('[data-order]');
      const stance = t.closest('[data-stance]');
      const raid = t.closest('[data-raid]');
      const a = state.armies.find((x) => x.id === id);
      if (!a) return menuAction(t.closest('[data-action]')?.dataset.action);
      if (ord) {
        const kind = ord.dataset.order;
        const sel = body.querySelector(`[data-pick="${kind === 'defend' ? 'hold' : 'siege'}"]`);
        order({ type: 'army', army: id, order: kind, target: sel?.value });
      } else if (stance) order({ type: 'army', army: id, order: a.order, target: a.target, stance: stance.dataset.stance });
      else if (raid) order({ type: 'army', army: id, order: 'raid', target: raid.dataset.raid });
      else if (t.closest('[data-disband]')) {
        if (confirm(`Stand down ${a.name}?`)) {
          order({ type: 'disband', army: id });
          openWar();
        }
      } else menuAction(t.closest('[data-action]')?.dataset.action);
    };
  }

  const shownWarDecisions = new Set();
  function openWarDecision(id) {
    const pending = state.warDecisions.find((p) => p.id === id);
    if (!pending) return;
    shownWarDecisions.add(id);
    selection = null;
    hideUnitLabel();
    const body = sheet.open(`warDecision:${id}`, warDecisionHtml(world, state, pending));
    body.onclick = (e) => {
      const c = e.target.closest('[data-choice]');
      if (!c) return;
      order({ type: 'warDecision', id, choice: Number(c.dataset.choice) });
      sheet.close();
      if (!showNextDecision() && pending.kind === 'declared' && state.wars.length) openWar();
    };
  }

  // Decisions waiting on the crown open one at a time, the gravest first.
  // Answering one opens the next, so a crowded morning is dealt with in a row.
  function showNextDecision() {
    const opened = nextDecision();
    if (opened) hints.note('decision');
    return opened;
  }

  function nextDecision() {
    if (state.depositions.length > shownDepositions) { openDeposition(); return true; }
    const warDecision = state.warDecisions?.find((p) => !shownWarDecisions.has(p.id));
    if (warDecision) { openWarDecision(warDecision.id); return true; }
    const event = state.events.find((p) => !shownEvents.has(p.id));
    if (event) { openEvent(event.id); return true; }
    const demand = state.demands.find((p) => !shownDemands.has(p.id));
    if (demand) { openDemand(demand.id); return true; }
    const envoy = state.envoys.find((p) => !shownEnvoys.has(p.id));
    if (envoy) { openEnvoy(envoy.id); return true; }
    const petition = state.petitions.find((p) => !shownPetitions.has(p.id));
    if (petition) { openPetition(petition.id); return true; }
    return false;
  }

  function openHelp() {
    const body = sheet.open('help', helpHtml(hintData, hints.enabled));
    body.onclick = (e) => menuAction(e.target.closest('[data-action]')?.dataset.action);
  }

  function openLedger() {
    const body = sheet.open('ledger', ledgerHtml(world, state));
    body.onclick = (e) => menuAction(e.target.closest('[data-action]')?.dataset.action);
  }

  let chronicleFilter = 'all';
  function openChronicle() {
    const body = sheet.open('chronicle', chronicleHtml(state, chronicleFilter));
    body.onclick = (e) => {
      const f = e.target.closest('[data-chronicle]');
      if (f) {
        chronicleFilter = f.dataset.chronicle;
        sheet.patch('chronicle', chronicleHtml(state, chronicleFilter));
      } else menuAction(e.target.closest('[data-action]')?.dataset.action);
    };
  }

  function menuAction(action) {
    if (!action) return;
    if (action === 'chronicle') openChronicle();
    else if (action === 'ledger') openLedger();
    else if (action === 'laws') openLaws();
    else if (action === 'neighbours') openNeighbours();
    else if (action === 'faith') openFaith();
    else if (action === 'nobles') openNobles();
    else if (action === 'military') openMilitary();
    else if (action === 'war') openWar();
    else if (action === 'trade') openTrade();
    else if (action === 'help') openHelp();
    else if (action === 'hints-off' || action === 'hints-on') {
      hints.setEnabled(action === 'hints-on');
      openHelp();
    }
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
    if (selection?.unit || selection?.label) selection = null;
  }

  function onTap(x, y) {
    const hit = renderer.pick(x, y, state, frac);
    if (hit?.settlement) openSettlement(hit.settlement);
    else if (hit?.neighbour) openRealm(hit.neighbour);
    else if (hit?.foreign) openForeign(hit.foreign);
    else if (hit?.army) {
      const a = state.armies.find((x) => x.id === hit.army);
      if (a.side === TEMERIA) openArmy(a.id);
      else {
        sheet.close();
        selection = { army: a.id, label: true };
        unitLabel.textContent = describeArmy(state, world, a);
        unitLabel.hidden = false;
        unitLabelUntil = performance.now() + 4000;
      }
    }
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

  // The renderer notices the camera moving by itself; a pan only slides its layers.
  attachMapInput(canvas, cam, world, { onTap, onChange: () => {} });

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
  let lastSheetRefresh = 0;
  let lastHintCheck = 0;
  // How long each frame's own work takes (the realm's days and the drawing),
  // for the performance test: it must fit well inside a sixtieth of a second.
  const frameStats = { frames: 0, ms: 0, max: 0, recent: [] };
  function frame(now) {
    const work = performance.now();
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
        // Open panels follow the realm twice a second at most: at 4x that
        // spares the phone rebuilding a card four times a second.
        if (now - lastSheetRefresh > 500) {
          lastSheetRefresh = now;
          refreshOpenSheet();
        }
        if (showNextDecision()) setSpeed(0);
      }
    }
    if (selection?.unit || selection?.label) {
      const p = selection.unit ? renderer.unitScreen(state, selection.unit, frac) : renderer.armyScreen(state, selection.army, frac);
      if (!p || now > unitLabelUntil) hideUnitLabel();
      else {
        // Keep the label on screen even when its unit is near an edge.
        const half = unitLabel.offsetWidth / 2 + 8;
        unitLabel.style.left = `${Math.min(stage.clientWidth - half, Math.max(half, p.x))}px`;
        unitLabel.style.top = `${p.y}px`;
      }
    }
    renderer.draw(state, frac, selection);
    if (now - lastHintCheck > 1000) {
      lastHintCheck = now;
      hints.check(state, world);
    }
    const took = performance.now() - work;
    frameStats.frames += 1;
    frameStats.ms += took;
    frameStats.max = Math.max(frameStats.max, took);
    frameStats.recent.push(took);
    if (frameStats.recent.length > 600) frameStats.recent.shift();
    requestAnimationFrame(frame);
  }

  function refreshOpenSheet() {
    const cur = sheet.current;
    if (cur?.startsWith('settlement:')) sheet.patch(cur, settlementCardHtml(world, state, cur.slice(11), lookups));
    else if (cur === 'chronicle') sheet.patch(cur, chronicleHtml(state, chronicleFilter));
    else if (cur === 'ledger') sheet.patch(cur, ledgerHtml(world, state));
    else if (cur === 'laws') sheet.patch(cur, lawsHtml(world, state, openLaw));
    else if (cur === 'neighbours') sheet.patch(cur, neighboursHtml(world, state));
    else if (cur?.startsWith('realm:')) sheet.patch(cur, realmCardHtml(world, state, cur.slice(6)));
    else if (cur?.startsWith('envoy:') && !state.envoys.some((p) => `envoy:${p.id}` === cur)) sheet.close();
    else if (cur === 'faith') sheet.patch(cur, faithHtml(world, state, lookups));
    else if (cur?.startsWith('petition:') && !state.petitions.some((p) => `petition:${p.id}` === cur)) sheet.close();
    else if (cur === 'nobles') sheet.patch(cur, noblesHtml(world, state));
    else if (cur === 'military') sheet.patch(cur, militaryHtml(world, state, patrolPick));
    else if (cur?.startsWith('event:') && !state.events.some((p) => `event:${p.id}` === cur)) sheet.close();
    else if (cur?.startsWith('house:')) sheet.patch(cur, houseCardHtml(world, state, cur.slice(6), housePicking));
    else if (cur?.startsWith('demand:') && !state.demands.some((p) => `demand:${p.id}` === cur)) sheet.close();
    else if (cur === 'war') sheet.patch(cur, warHtml(world, state, raiseForm));
    else if (cur === 'trade') sheet.patch(cur, tradeHtml(world, state, tradeForm));
    else if (cur?.startsWith('army:')) sheet.patch(cur, armyCardHtml(world, state, Number(cur.slice(5)), armyPick));
    else if (cur?.startsWith('warDecision:') && !state.warDecisions.some((p) => `warDecision:${p.id}` === cur)) sheet.close();
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
    get renderStats() { return renderer.stats; },
    get artStats() { return renderer.artStats; },
    get frameStats() {
      const sorted = [...frameStats.recent].sort((a, b) => a - b);
      return { frames: frameStats.frames, mean: frameStats.ms / Math.max(1, frameStats.frames), max: frameStats.max, p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0 };
    },
    resetFrameStats() { Object.assign(frameStats, { frames: 0, ms: 0, max: 0, recent: [] }); },
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
      renderer.invalidate();
    },
    screenOf(id) {
      const st = world.byId[id];
      const r = canvas.getBoundingClientRect();
      return { x: r.left + (st.x - cam.x) * cam.scale + cam.viewW / 2, y: r.top + (st.y - cam.y) * cam.scale + cam.viewH / 2 };
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
