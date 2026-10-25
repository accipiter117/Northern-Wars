// Tutorial hints: short notes that appear once each, when their moment comes.
// What has been seen is remembered per device, not per save, so a second
// reign is not lectured again.
import { escapeHtml } from './format.js';

const KEY = 'northern-wars.hints';

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? { seen: [], off: false };
  } catch {
    return { seen: [], off: false };
  }
}

function store(v) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* hints are a nicety */ }
}

export function createHints(data, { disabled = false } = {}) {
  const el = document.getElementById('hint');
  let prefs = load();
  let showing = null;
  const flags = new Set();

  function hide() {
    el.hidden = true;
    showing = null;
  }

  function show(h) {
    showing = h.id;
    el.innerHTML = `<p class="hint-title">${escapeHtml(h.title)}</p><p>${escapeHtml(h.text)}</p>
      <div class="hint-buttons"><button type="button" data-hint="ok">Understood</button><button type="button" data-hint="off">No more hints</button></div>`;
    el.hidden = false;
  }

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-hint]');
    if (!b) return;
    if (showing && !prefs.seen.includes(showing)) prefs.seen.push(showing);
    if (b.dataset.hint === 'off') prefs.off = true;
    store(prefs);
    hide();
  });

  // Mark a moment the UI noticed (a town opened, a decision shown).
  function note(trigger) {
    flags.add(trigger);
  }

  function check(state, world = null) {
    if (disabled || prefs.off || showing) return;
    const fired = (t) => {
      switch (t) {
        case 'start': return true;
        case 'firstLedger': return state.ledger.history.length > 0;
        case 'noDecreeAfter60': return state.day - state.reign.since > 60 && state.reign.decrees === 0;
        case 'hunger': return Object.values(state.settlements).some((s) => s.hunger > 0.1);
        case 'debt': return state.treasury < 0;
        case 'day120': return state.day - state.reign.since > 120;
        case 'raid': return Object.values(state.settlements).some((s) => (s.raided ?? 0) > state.day);
        case 'lowAuthority': return state.authority < 20;
        case 'day45': return state.day - state.reign.since > 45;
        case 'day150NoRoutes': return state.day - state.reign.since > 150 && !(state.routes ?? []).length;
        case 'goldWaiting': return state.day - state.reign.since > 240 && !Object.values(state.settlements).some((s) => s.buildings.includes('goldmine'));
        case 'placeFull': return !!world && Object.entries(state.settlements).some(([id, s]) => s.buildings.length >= (world.buildingSlots[world.byId[id].type] ?? 99));
        case 'atWar': return (state.wars ?? []).some((w) => w.sides.flat().includes('temeria'));
        case 'warDrums': return (state.musters ?? []).length > 0;
        case 'townLost': return Object.values(state.settlements).some((s) => s.occupier);
        default: return flags.has(t);
      }
    };
    const next = data.hints.find((h) => !prefs.seen.includes(h.id) && fired(h.trigger));
    if (next) show(next);
  }

  function reset() {
    prefs = { seen: [], off: false };
    store(prefs);
  }

  return { note, check, hide, reset, get enabled() { return !prefs.off && !disabled; }, setEnabled(on) { prefs.off = !on; store(prefs); if (!on) hide(); } };
}

export function helpHtml(data, enabled) {
  const items = data.hints.map((h) => `<li><b>${escapeHtml(h.title)}.</b> ${escapeHtml(h.text)}</li>`).join('');
  return `
    <h2>Help</h2>
    <div class="menu-list">
      <button type="button" data-action="back">Back to the realm</button>
      <button type="button" data-action="${enabled ? 'hints-off' : 'hints-on'}">${enabled ? 'Turn hints off' : 'Turn hints back on'}</button>
    </div>
    <ul class="chronicle help">${items}</ul>
  `;
}
