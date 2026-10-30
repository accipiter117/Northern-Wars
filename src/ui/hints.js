// Tutorial hints: short notes that appear once each, when their moment comes.
// What has been seen is remembered per device, not per save, so a second
// reign is not lectured again.
import { soundPrefs } from './audio.js';
import { escapeHtml } from './format.js';
import { icon } from './icons.js';
import { form, isOpen } from './memory.js';

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

export function createHints(data, { disabled = false, onOpen = () => {} } = {}) {
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
      <div class="hint-buttons">${h.open ? `<button type="button" data-hint="open">${escapeHtml(h.openLabel ?? 'Show me')}</button>` : ''}<button type="button" data-hint="ok">Understood</button><button type="button" data-hint="off">No more hints</button></div>`;
    el.hidden = false;
  }

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-hint]');
    if (!b) return;
    if (showing && !prefs.seen.includes(showing)) prefs.seen.push(showing);
    if (b.dataset.hint === 'off') prefs.off = true;
    store(prefs);
    const open = b.dataset.hint === 'open' ? data.hints.find((h) => h.id === showing)?.open : null;
    hide();
    if (open) onOpen(open);
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
        case 'sighted': return (state.threats?.list ?? []).some((t) => t.sighted || t.campSeen);
        case 'lowAuthority': return state.authority < 20;
        case 'day45': return state.day - state.reign.since > 45;
        case 'day60': return state.day - state.reign.since > 60;
        case 'day150NoRoutes': return state.day - state.reign.since > 150 && !(state.routes ?? []).length;
        case 'goldWaiting': return state.day - state.reign.since > 240 && !Object.values(state.settlements).some((s) => s.buildings.includes('goldmine') && (s.cond?.goldmine ?? 100) > 0);
        case 'placeFull': return !!world && Object.entries(state.settlements).some(([id, s]) => s.buildings.length >= (world.buildingSlots[world.byId[id].type] ?? 99));
        case 'worksWorn': return (state.works?.decisions ?? []).length > 0;
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

// Help: the settings, then a searchable list of short topics (every hint,
// and a few more), each folded until tapped.
export function helpHtml(app) {
  const { hintData: data, hints, prefs, memory } = app;
  const enabled = hints.enabled;
  const pause = !!prefs.pauseOnSighting;
  const f = form(memory, 'help', { q: '' });
  const q = f.q.trim().toLowerCase();
  const topics = [...(data.topics ?? []), ...data.hints].filter((h) => !q || `${h.title} ${h.text}`.toLowerCase().includes(q));
  const items = topics.map((h) => {
    const open = isOpen(memory, 'help', `t:${h.id}`, !!q);
    return `<details class="sec" data-sec="t:${h.id}"${open ? ' open' : ''}><summary>${escapeHtml(h.title)}</summary><div class="sec-body"><p>${escapeHtml(h.text)}</p></div></details>`;
  }).join('');
  const snd = soundPrefs(prefs);
  const pct = (v) => Math.round(v * 100);
  return `
    <div data-part="sound" class="sound-settings">
      <div class="volume"><span>Music</span><input type="range" min="0" max="100" step="5" value="${pct(snd.music)}" data-volume="music" aria-label="Music volume"${snd.musicOn ? '' : ' disabled'}><button type="button" class="mute" data-action="${snd.musicOn ? 'music-off' : 'music-on'}" aria-pressed="${!snd.musicOn}" aria-label="${snd.musicOn ? 'Mute the music' : 'Play the music'}">${snd.musicOn ? 'On' : 'Off'}</button></div>
      <div class="volume"><span>Effects</span><input type="range" min="0" max="100" step="5" value="${pct(snd.sfx)}" data-volume="sfx" aria-label="Effects volume"${snd.sfxOn ? '' : ' disabled'}><button type="button" class="mute" data-action="${snd.sfxOn ? 'sfx-off' : 'sfx-on'}" aria-pressed="${!snd.sfxOn}" aria-label="${snd.sfxOn ? 'Mute the effects' : 'Play the effects'}">${snd.sfxOn ? 'On' : 'Off'}</button></div>
      ${'audioSession' in navigator ? `<div class="actions"><button type="button" class="act" data-action="${prefs.playOnSilent ? 'silent-off' : 'silent-on'}"><span class="act-label">${prefs.playOnSilent ? 'Follow the silent switch' : 'Play sound on silent'}</span><span class="act-sub">${prefs.playOnSilent ? 'Sound plays even with the phone on silent' : 'Sound follows the phone\'s silent switch'}</span></button></div>` : ''}
    </div>
    <div data-part="pauses" class="form-row"><span>Pause for</span><div class="chips">
      <button type="button" class="chip${pause ? ' on' : ''}" aria-pressed="${pause}" data-action="${pause ? 'sighting-pause-off' : 'sighting-pause-on'}">Sightings</button>
      <button type="button" class="chip${prefs.pauseOnBattle ? ' on' : ''}" aria-pressed="${!!prefs.pauseOnBattle}" data-action="${prefs.pauseOnBattle ? 'battle-pause-off' : 'battle-pause-on'}">Our battles</button>
    </div></div>
    <div data-part="power" class="form-row"><span>Device</span><div class="chips">
      <button type="button" class="chip${prefs.haptics === false ? '' : ' on'}" aria-pressed="${prefs.haptics !== false}" data-action="${prefs.haptics === false ? 'haptics-on' : 'haptics-off'}">Vibration</button>
      <button type="button" class="chip${prefs.batterySaver ? ' on' : ''}" aria-pressed="${!!prefs.batterySaver}" data-action="${prefs.batterySaver ? 'saver-off' : 'saver-on'}" title="Fewer frames and travellers; the screen may sleep">Battery saver</button>
      <button type="button" class="chip${prefs.keepAwake ? ' on' : ''}" aria-pressed="${!!prefs.keepAwake}" data-action="${prefs.keepAwake ? 'awake-off' : 'awake-on'}"${prefs.batterySaver || !('wakeLock' in navigator) ? ' disabled' : ''} title="Only while the realm runs, never under Battery saver">Keep screen awake</button>
    </div></div>
    <div data-part="settings" class="actions">
      <button type="button" class="act" data-action="${enabled ? 'hints-off' : 'hints-on'}"><span class="act-label">${enabled ? 'Turn hints off' : 'Turn hints back on'}</span></button>
    </div>
    <div data-part="search" data-form="help"><label class="search">${icon('search')}<input type="search" data-field="q" value="${escapeHtml(f.q)}" placeholder="Search help" aria-label="Search help" autocomplete="off"></label></div>
    <div data-part="topics">${items || '<p class="sub">Nothing matches.</p>'}</div>
  `;
}

// Small per-device settings kept beside the hints.
const PREFS = 'northern-wars.prefs';
export function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS)) ?? {};
  } catch {
    return {};
  }
}
export function savePrefs(p) {
  try { localStorage.setItem(PREFS, JSON.stringify(p)); } catch { /* a nicety */ }
}
