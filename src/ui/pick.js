// Map pick mode: anything that needs a target on the map (a hunt, a patrol,
// a station, a trade route, an army's march, a muster place) is chosen by
// tapping the map. A banner says what to tap; once tapped it shows the odds
// or the value, and the player confirms or taps somewhere else.
import { TEMERIA, ownerOf, sideName, hostile, huntOdds, routeEndOk, placesHeldBy } from '../sim/index.js';
import { escapeHtml, number } from './format.js';
import { threatLabel } from './forces.js';
import { musterPlaces, targets } from './war.js';
import { routeForm, routePreview, routeEnds } from './trade.js';
import { form } from './memory.js';
import { RAISE_DEFAULTS } from './war.js';

// What each kind of pick wants, how to describe a candidate and what to do
// on confirm. `accept` returns null when the tap is no use for this pick,
// or { ok, text, detail } to show in the banner.
function kinds(app) {
  const { world } = app;
  const name = (id) => world.byId[id].name;
  const company = (p) => app.state.forces.companies.find((c) => c.id === p.company);
  const army = (p) => app.state.armies.find((a) => a.id === p.army);
  return {
    hunt: {
      prompt: 'Tap a threat or an enemy army on the map to hunt',
      wants: ['threat', 'army'],
      accept(p, hit) {
        const c = company(p);
        const st = app.state;
        if (!c) return null;
        if (hit.threat) {
          const t = st.threats.list.find((x) => x.id === hit.threat);
          if (!t || !(t.sighted || t.campSeen)) return null;
          return { ok: true, text: `Hunt ${threatLabel(world, t)}`, detail: `Odds: ${huntOdds(st, world, [c], t).word}` };
        }
        if (hit.army) {
          const a = st.armies.find((x) => x.id === hit.army);
          if (!a || a.side === TEMERIA || !hostile(st, TEMERIA, a.side)) return null;
          return { ok: true, text: `Attack ${a.name}`, detail: `Odds: ${huntOdds(st, world, [c], a).word}` };
        }
        return null;
      },
      confirm(p, hit) { app.order({ type: 'company', id: p.company, order: hit.threat ? { kind: 'hunt', threat: hit.threat } : { kind: 'hunt', army: hit.army } }); },
    },
    station: {
      prompt: 'Tap a town of ours on the map to station the company there',
      wants: ['settlement'],
      accept(p, hit) {
        const s = app.state.settlements[hit.settlement];
        if (!s || s.occupier) return { ok: false, text: name(hit.settlement), detail: 'Not ours to station men in.' };
        return { ok: true, text: `Station at ${name(hit.settlement)}`, detail: 'Holds it, and rides out to nothing.' };
      },
      confirm(p, hit) { app.order({ type: 'company', id: p.company, order: { kind: 'station', place: hit.settlement } }); },
    },
    patrol: {
      prompt: 'Tap the first town of the road to patrol',
      wants: ['settlement'],
      accept(p, hit) {
        const s = app.state.settlements[hit.settlement];
        if (!s || s.occupier) return { ok: false, text: name(hit.settlement), detail: 'Not ours to patrol from.' };
        if (!p.from) return { ok: true, text: `From ${name(hit.settlement)}`, detail: 'Then tap where the patrol rides to.', step: true };
        if (hit.settlement === p.from) return { ok: false, text: name(hit.settlement), detail: 'Pick another town for the far end.' };
        return { ok: true, text: `Patrol ${name(p.from)} to ${name(hit.settlement)}`, detail: 'Rides the road between them, back and forth.' };
      },
      next(p, hit) { return { ...p, from: hit.settlement, prompt: `From ${name(hit.settlement)}: now tap where the patrol rides to` }; },
      confirm(p, hit) { app.order({ type: 'company', id: p.company, order: { kind: 'patrol', from: p.from, to: hit.settlement } }); },
    },
    route: {
      prompt: 'Tap a town or city to trade with',
      wants: ['settlement', 'foreign'],
      start(p) {
        const f = routeForm(app);
        if (p.from) f.from = p.from;
        return { ...p, from: f.from, prompt: `From ${name(f.from)}: tap a town or city to trade with` };
      },
      accept(p, hit) {
        const to = hit.settlement ?? hit.foreign;
        if (to === p.from) return { ok: false, text: name(to), detail: 'Pick somewhere else.' };
        if (!routeEndOk(app.state, world, to).ok) return { ok: false, text: name(to), detail: routeEndOk(app.state, world, to).reason ?? 'No market for a crown route.' };
        const pv = routePreview(app, p.from, to);
        return { ok: pv.check.ok, text: `${name(p.from)} to ${name(to)}`, detail: pv.check.ok ? `${pv.estimate} Opening costs ${number(pv.check.cost)}.` : pv.check.reason };
      },
      confirm(p, hit) {
        const f = routeForm(app);
        f.to = hit.settlement ?? hit.foreign;
        app.order({ type: 'route', from: p.from, to: f.to });
      },
    },
    routeFrom: {
      prompt: 'Tap a town or city of ours to trade from',
      wants: ['settlement'],
      accept(p, hit) {
        if (!routeEnds(world, app.state).ours.includes(hit.settlement)) return { ok: false, text: name(hit.settlement), detail: 'Not a market of ours that can run a route.' };
        return { ok: true, text: `Trade from ${name(hit.settlement)}`, detail: 'Then pick where to.' };
      },
      confirm(p, hit) {
        const f = routeForm(app);
        f.from = hit.settlement;
        if (f.to === f.from) f.to = null;
      },
    },
    muster: {
      prompt: 'Tap a town, city or castle of ours to muster the army',
      wants: ['settlement'],
      accept(p, hit) {
        if (!musterPlaces(world, app.state).includes(hit.settlement)) return { ok: false, text: name(hit.settlement), detail: 'Armies muster only at our towns, cities and castles.' };
        return { ok: true, text: `Muster at ${name(hit.settlement)}`, detail: 'The levies gather there.' };
      },
      confirm(p, hit) { form(app.memory, 'raise', RAISE_DEFAULTS).muster = hit.settlement; },
    },
    hold: {
      prompt: 'Tap a place of ours for the army to hold',
      wants: ['settlement'],
      accept(p, hit) {
        const a = army(p);
        if (!a) return null;
        if (!placesHeldBy(app.state, world, TEMERIA).includes(hit.settlement)) return { ok: false, text: name(hit.settlement), detail: 'Not ours to hold. Besiege it instead.' };
        return { ok: true, text: `Hold ${name(hit.settlement)}`, detail: 'Marches there and meets any enemy that comes near.' };
      },
      confirm(p, hit) { app.order({ type: 'army', army: p.army, order: 'defend', target: hit.settlement }); },
    },
    siege: {
      prompt: 'Tap an enemy town or castle to besiege',
      wants: ['settlement', 'foreign'],
      accept(p, hit) {
        const a = army(p);
        if (!a) return null;
        const id = hit.settlement ?? hit.foreign;
        if (!targets(world, app.state, a).siege.includes(id)) return { ok: false, text: name(id), detail: 'Not an enemy place we are at war with.' };
        const owner = ownerOf(app.state, world, id);
        const seen = app.state.settlements[id] || app.state.ambient.intel?.seen[id];
        const garrison = app.foreignView(id)?.garrison;
        return { ok: true, text: `Besiege ${name(id)}`, detail: `Held by ${sideName(world, owner)}. ${seen ? (garrison ? `About ${number(garrison)} soldiers inside against our ${number(a.soldiers)}.` : `Our ${number(a.soldiers)} men march on it.`) : 'Unscouted: we know nothing of its walls.'}` };
      },
      confirm(p, hit) { app.order({ type: 'army', army: p.army, order: 'siege', target: hit.settlement ?? hit.foreign }); },
    },
  };
}

export function createPick(app, { onStart, onEnd }) {
  const bar = document.getElementById('pickbar');
  let active = null;

  function render() {
    if (!active) return;
    const c = active.choice;
    bar.innerHTML = c
      ? `<span class="pick-text">${escapeHtml(c.text)}<small>${escapeHtml(c.detail ?? '')}</small></span>
        ${c.ok ? '<button type="button" class="confirm" data-pick-confirm>Confirm</button>' : ''}<button type="button" data-pick-cancel>Cancel</button>`
      : `<span class="pick-text">${escapeHtml(active.params.prompt ?? active.kind.prompt)}<small>Tap a target on the map</small></span><button type="button" data-pick-cancel>Cancel</button>`;
  }

  function start(params) {
    const kind = kinds(app)[params.kind];
    if (!kind) return;
    active = { kind, params: kind.start ? kind.start(params) : params, choice: null, hit: null };
    bar.hidden = false;
    document.body.classList.add('picking');
    render();
    onStart?.();
  }

  function end() {
    if (!active) return;
    active = null;
    bar.hidden = true;
    bar.innerHTML = '';
    document.body.classList.remove('picking');
    onEnd?.();
  }

  // A tap on the map while picking. Returns true when the pick used it.
  function tap(hit) {
    if (!active || !hit) return !!active;
    const key = active.kind.wants.find((k) => hit[k] !== undefined);
    if (!key) return true;
    const choice = active.kind.accept(active.params, hit);
    if (!choice) return true;
    app.highlight(hit);
    // The first of two picks (a patrol's start) moves straight on.
    if (choice.step && choice.ok && active.kind.next) {
      active.params = active.kind.next(active.params, hit);
      active.choice = null;
      render();
      return true;
    }
    active.choice = choice;
    active.hit = hit;
    render();
    return true;
  }

  function confirm() {
    if (!active?.choice?.ok) return;
    const { kind, params, hit } = active;
    end();
    kind.confirm(params, hit);
    app.afterPick();
  }

  bar.addEventListener('click', (e) => {
    if (e.target.closest('[data-pick-confirm]')) confirm();
    else if (e.target.closest('[data-pick-cancel]')) { end(); app.afterPick(); }
  });

  return {
    start, end, tap, confirm,
    get active() { return !!active; },
    get wants() { return active?.kind.wants ?? []; },
  };
}

