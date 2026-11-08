// Small helpers every part of the v2 engine shares: names, the log, war and
// who controls a region. Kept apart so the modules can use them without
// importing each other.

export const nameOf = (table, rid) => table.data.game.names[rid] ?? rid;

export function say(state, text) {
  state.log.push({ turn: state.turn, text });
  if (state.log.length > 80) state.log.shift();
}

export const pair = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
export const atWar = (state, a, b) => a !== b && state.wars.includes(pair(a, b));

export function makeWar(state, a, b) {
  if (a === b || atWar(state, a, b)) return false;
  state.wars.push(pair(a, b));
  return true;
}

export function makePeace(state, a, b) {
  state.wars = state.wars.filter((w) => w !== pair(a, b));
}

// Who controls a region now: its holder if occupied, else its owner.
export const controller = (state, id) => state.cities[id].holder ?? state.cities[id].owner;

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const authority = (realm) => Math.max(realm.love, realm.fear);

// The great powers in play, and whether a realm is one.
export const isPower = (table, rid) => table.data.game.powers.includes(rid);

export const regionsOf = (state, rid) => Object.keys(state.cities).filter((id) => controller(state, id) === rid);
