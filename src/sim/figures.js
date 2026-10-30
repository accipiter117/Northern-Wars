// Figures on the road (M23 C): the people who carry the crown's business
// across the map, each set going by a real act and gone when it is done.
//   envoy      an envoy ordered to a foreign court, riding there by the
//              month's end; a foreign envoy riding to Vizima
//   spy        an agent slipping into a foreign realm
//   courier    a petition carried from a town to Vizima
//   lord       a lord summoned to court, or bringing his levies
//   commander  a marshal riding to take command of an army he was given
//   progress   the king and his train on a royal progress (M24 B)
// (Witchers on contract have been on the road since M22 B.)
// Each has a start and an end day and goes by the straight way from one
// place to another; the renderer moves it, the long press names it. Pure
// data, kept in the save, and nothing in the rules reads it back.
import { TEMERIA } from './conflict.js';

const CAP = 40;

const F = (world) => world.war?.figures ?? { speed: 45, minDays: 2, maxDays: 30 };

function dist(world, a, b) {
  const p = world.byId[a];
  const q = world.byId[b];
  return p && q ? Math.hypot(q.x - p.x, q.y - p.y) : 0;
}

// The days a rider needs from one place to another.
export function rideDays(world, from, to) {
  const f = F(world);
  return Math.max(f.minDays, Math.min(f.maxDays, Math.ceil(dist(world, from, to) / f.speed)));
}

// A foreign realm's court, where an envoy or a spy is going.
export function courtOf(world, rid) {
  return world.realms?.realms?.[rid]?.capital ?? world.neighbours?.realms?.[rid]?.gateway ?? null;
}

export function sendFigure(state, world, { kind, side = TEMERIA, from, to, days, about = '', name = '' }) {
  if (!world.byId[from] || !world.byId[to] || from === to) return null;
  const list = (state.figures ??= []);
  state.nextFigureId ??= 1;
  const f = { id: state.nextFigureId++, kind, side, from, to, start: state.day, end: state.day + Math.max(1, days ?? rideDays(world, from, to)), about, name };
  list.push(f);
  if (list.length > CAP) list.splice(0, list.length - CAP);
  return f;
}

export function stepFiguresDay(state) {
  if (state.figures?.length) state.figures = state.figures.filter((f) => f.end > state.day);
}

// Where a figure is on a given (fractional) day, and which way it faces.
export function figurePosition(world, f, day) {
  const p = world.byId[f.from];
  const q = world.byId[f.to];
  const t = Math.max(0, Math.min(1, (day - f.start) / Math.max(1, f.end - f.start)));
  return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, angle: Math.atan2(q.y - p.y, q.x - p.x), t };
}

const WORDS = {
  envoy: (w, f) => (f.side === TEMERIA ? `Envoy of the crown, riding from ${w.byId[f.from].name} to ${w.byId[f.to].name}` : `An envoy riding to Vizima from ${w.byId[f.from].name}`),
  spy: (w, f) => `Our agent, slipping into ${w.byId[f.to].name} unseen`,
  courier: (w, f) => `Courier from ${w.byId[f.from].name}, bringing a petition to Vizima`,
  lord: (w, f) => `${f.name || 'A lord'}, riding from ${w.byId[f.from].name} to ${w.byId[f.to].name}`,
  commander: (w, f) => `${f.name || 'A marshal'}, riding to ${w.byId[f.to].name} to take command`,
  levy: (w, f) => `${f.name || 'Levies'} on the road from ${w.byId[f.from].name} to the muster at ${w.byId[f.to].name}`,
  escort: (w, f) => `${f.name || 'An escort'}, riding from ${w.byId[f.from].name} to ${w.byId[f.to].name}`,
  progress: (w, f) => `The king and his train, ${f.about || 'on a royal progress'}, riding from ${w.byId[f.from].name} to ${w.byId[f.to].name}`,
};

// One line for a long press: who it is, where it is going and why, and how
// long until it arrives.
export function describeFigure(state, world, f) {
  const who = (WORDS[f.kind] ?? ((w, x) => `A rider to ${w.byId[x.to].name}`))(world, f);
  const left = Math.max(0, f.end - state.day);
  return `${who}${f.about ? `: ${f.about}` : ''}. ${left <= 1 ? 'Arrives tomorrow' : `${left} days to go`}.`;
}
