// What the interface remembers between screens, sessions and saves: which
// tab and sub-tab was last open, the navigation stacks, how far each screen
// was scrolled, which sections were opened, and every half-filled form. It
// lives beside the save in this browser and never touches the game's state.
const KEY = 'northern-wars.ui';
const VERSION = 1;

export const TABS = ['realm', 'court', 'treasury', 'military', 'diplomacy'];

function fresh() {
  return {
    version: VERSION,
    active: 'realm',
    open: false,
    snap: 'half',
    stacks: Object.fromEntries([...TABS, 'map'].map((t) => [t, t === 'map' ? [] : [`tab:${t}`]])),
    sub: { realm: 'labour', court: 'inbox', treasury: 'ledger', military: 'forces', diplomacy: 'realms', town: 'overview' },
    scroll: {},
    expanded: {},
    forms: {},
  };
}

export function loadMemory() {
  try {
    const m = JSON.parse(localStorage.getItem(KEY));
    if (m && m.version === VERSION) {
      const base = fresh();
      return { ...base, ...m, stacks: { ...base.stacks, ...m.stacks }, sub: { ...base.sub, ...m.sub } };
    }
  } catch { /* fall through to a fresh memory */ }
  return fresh();
}

export function saveMemory(m) {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch { /* a nicety, not the game */ }
}

export function clearMemory() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}

export function resetMemory(m) {
  Object.assign(m, fresh());
}

// A form's remembered fields, made on first use from its defaults.
export function form(m, key, defaults = {}) {
  m.forms[key] ??= { ...defaults };
  for (const [k, v] of Object.entries(defaults)) if (!(k in m.forms[key])) m.forms[key][k] = v;
  return m.forms[key];
}

// Where a screen's scroll is remembered: each sub-tab of a tab, and each tab
// of a town card, keeps its own.
export function scrollKey(m, route) {
  if (route.startsWith('tab:')) return `${route}/${m.sub[route.slice(4)]}`;
  if (route.startsWith('town:')) return `${route}/${m.sub.town}`;
  return route;
}

export function isOpen(m, route, section, byDefault = false) {
  const k = `${route}#${section}`;
  return k in m.expanded ? m.expanded[k] : byDefault;
}

export function setOpen(m, route, section, open) {
  m.expanded[`${route}#${section}`] = open;
}
