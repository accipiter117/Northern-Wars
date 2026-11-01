// Coram Agh Tera (M32 A): a cult, never a faith the crown can grow. It
// spreads quietly where hunger, plague and despair are high, stirs the towns
// it holds, and comes to light as a dark dilemma. It can be rooted out by
// force, by the Fire's inquisition, or by easing the misery that feeds it.
import { addDispatch, clamp } from './realm.js';
import { nudge } from './meters.js';
import { signed } from './book.js';
import { dilemmasOf } from './dilemmas.js';

const K = (world) => world.devotion?.cult;
const say = (state, text) => addDispatch(state, text, 'faith');

export const cultOf = (state) => (state.cult ??= { towns: {}, last: -1e9, found: 0 });
export const cultIn = (state, id) => state.cult?.towns?.[id] ?? 0;

// How miserable a town is: hunger, plague and unrest past half.
export function misery(state, id) {
  const s = state.settlements[id];
  if (!s) return 0;
  const plague = (s.plague ?? 0) > state.day ? 1 : 0;
  return (s.hunger ?? 0) * (s.hunger ?? 0) + plague + Math.max(0, (s.unrest ?? 0) - 50) / 50;
}

export function monthlyCult(state, world) {
  const c = K(world);
  if (!c) return;
  const cult = cultOf(state);
  const slow = signed(state, 'inquisition') ? 0.5 : 1;
  const next = {};
  for (const [id, s] of Object.entries(state.settlements)) {
    if (s.occupier) continue;
    const v = cult.towns[id] ?? 0;
    const grow = c.grow * misery(state, id) * slow;
    const fade = c.fade + (c.prosperityFade * (s.prosperity ?? 0)) / 100;
    next[id] = clamp(v + grow - fade, 0, 100);
  }
  // It seeps along the roads from where it is strong.
  for (const [id, v] of Object.entries(cult.towns)) {
    if (v < c.spreadAt) continue;
    for (const { to } of world.adjacency[id] ?? []) if (next[to] !== undefined) next[to] = clamp(next[to] + c.spread * slow, 0, 100);
  }
  cult.towns = Object.fromEntries(Object.entries(next).filter(([, v]) => v > 0.05).map(([k, v]) => [k, Math.round(v * 10) / 10]));
  for (const [id, v] of Object.entries(cult.towns)) {
    const s = state.settlements[id];
    s.unrest = clamp(s.unrest + v / c.unrestPer / 10, 0, 100);
  }
  surface(state, world, cult);
}

// The strongest cell comes to light, one at a time.
function surface(state, world, cult) {
  const c = K(world);
  const d = dilemmasOf(state);
  if (d.open.some((o) => o.cult) || state.day - cult.last < c.gapDays) return;
  const [id, v] = Object.entries(cult.towns).sort((a, b) => b[1] - a[1])[0] ?? [];
  if (!id || v < c.dilemmaAt) return;
  cult.last = state.day;
  cult.found = (cult.found ?? 0) + 1;
  d.open.push({ id: d.nextId++, cult: id, place: id, finding: cult.found % c.findings.length, day: state.day });
}

export const CULT_CHOICES = ['force', 'inquisition', 'ease', 'ignore'];

export function cultText(state, world, o) {
  const c = K(world);
  const f = c.findings[o.finding ?? 0];
  const name = world.byId[o.place]?.name ?? o.place;
  const inq = signed(state, 'inquisition');
  return {
    kicker: `A matter at ${name}`,
    title: f.title.replaceAll('{place}', name),
    text: f.text.replaceAll('{place}', name),
    choices: [
      { label: 'Send in soldiers and burn the cellar out', hint: `Fear +${c.force.fear}; the cult much weakened there; Unrest +${c.force.unrest} in ${name}` },
      { label: 'Hand it to the Fire\'s inquisitors', hint: inq ? 'The inquisition roots it out there and in the towns nearby; Fear rises, the Fire\'s zeal with it' : 'Without the inquisition signed, the Fire can only do so much' },
      { label: 'Ease the misery that feeds it', hint: `${c.ease.coin} crowns: bread and work in ${name}; Love +${c.ease.love}; the cult loses its hold` },
      { label: 'Let it lie', hint: 'The cult grows' },
    ],
    place: o.place,
    fallback: 3,
  };
}

export function resolveCult(state, world, o, choice, ignored = false) {
  const c = K(world);
  const cult = cultOf(state);
  const id = o.place;
  const name = world.byId[id]?.name ?? id;
  const s = state.settlements[id];
  const cut = (town, by) => { if (cult.towns[town] !== undefined) cult.towns[town] = Math.max(0, cult.towns[town] - by); };
  const kind = CULT_CHOICES[choice];
  if (kind === 'ease' && !ignored && state.treasury - c.ease.coin < -(world.economy.debt?.creditLimit ?? 0)) return false;
  if (kind === 'force') {
    cut(id, c.force.strength);
    nudge(state, world, 'fear', c.force.fear, 'A cult burned out');
    if (s) s.unrest = clamp(s.unrest + c.force.unrest, 0, 100);
    say(state, `Soldiers break into the cult's hiding places at ${name}. Some of the faithful hang; more are never found.`);
  } else if (kind === 'inquisition') {
    const inq = signed(state, 'inquisition');
    const by = inq ? c.inquisition.signed : c.inquisition.strength;
    const here = world.byId[id];
    for (const t of Object.keys(cult.towns)) {
      const there = world.byId[t];
      if (t === id || (inq && Math.hypot(there.x - here.x, there.y - here.y) <= c.inquisition.reach)) cut(t, by);
    }
    nudge(state, world, 'fear', c.inquisition.fear, 'The inquisition hunts a cult');
    if (state.faiths?.fervour?.eternal_fire !== undefined) state.faiths.fervour.eternal_fire = clamp(state.faiths.fervour.eternal_fire + c.inquisition.fervour, 0, 100);
    for (const [g, v] of Object.entries(c.inquisition.opinion)) if (state.opinion?.[g] !== undefined) state.opinion[g] = clamp(state.opinion[g] + v, 0, 100);
    say(state, `The Fire's inquisitors come to ${name}${inq ? ' with the king\'s writ, and go on to the towns around' : ''}. The pyres burn for a week.`);
  } else if (kind === 'ease') {
    state.treasury -= c.ease.coin;
    state.ledger.decrees = (state.ledger.decrees ?? 0) + c.ease.coin;
    cut(id, c.ease.strength);
    if (s) {
      s.hunger = Math.max(0, (s.hunger ?? 0) - c.ease.hunger);
      s.prosperity = clamp(s.prosperity + c.ease.prosperity, 0, 100);
    }
    nudge(state, world, 'love', c.ease.love, 'Bread for the hungry');
    say(state, `Bread carts and work gangs come to ${name} at the crown's cost. The hooded preachers find fewer listeners.`);
  } else {
    cult.towns[id] = clamp((cult.towns[id] ?? 0) + c.ignore.strength, 0, 100);
    say(state, `Nothing is done about the cult at ${name}.${ignored ? ' Vizima sent no word.' : ''} It does not stay hidden for want of trying.`);
  }
  return true;
}
