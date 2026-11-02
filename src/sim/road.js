// The Road to War (M33 C). The First Northern War waits behind five boxes:
// Foltest's path done, Emhyr's path done, the Empire's network in Cintra
// deep enough to strike, a pretext, and the year 1263. While the crown
// dawdles the rivals' paths still run and the Empire's host keeps growing.
// When all five are ticked the war begins on its own: the Empire falls on
// Cintra, Skellige stands with her, Sodden and Brugge are drawn in, and the
// Call of the North goes out to the four crowns (the crown's own answer is
// a decision; the others rally late, in time for Sodden). The Nilfgaard
// clock (M30 D) takes it from there.
import { addDispatch, clamp } from './realm.js';
import { dateOf } from './calendar.js';
import { TEMERIA, sideName } from './conflict.js';
import { startWar } from './war.js';
import { suzerainOf } from './tiers.js';
import { changeTrust } from './diplomacy.js';
import { pathDone } from './paths.js';
import { openDilemma } from './dilemmas.js';

const R = (world) => world.war?.clock?.road;
const roadOf = (state) => (state.road ??= { pretext: null, began: null, calls: {} });

// The five boxes, each with whether it is ticked and what moves it.
export function roadBoxes(state, world) {
  const r = R(world);
  if (!r) return [];
  const net = Math.round(state.spycraft?.nets?.[r.empire]?.[r.cintra] ?? 0);
  const road = state.road ?? {};
  return [
    { id: 'foltest', name: "Foltest's path is complete", done: pathDone(state, world, TEMERIA), what: "The Lion's House in Order: the Dawn, Sodden, Brugge, Mahakam and an understanding with Cintra." },
    { id: 'emhyr', name: "Emhyr's path is complete", done: pathDone(state, world, r.empire), what: 'The Emperor binds his governors, makes Toussaint sure, sends agents into Cintra and masses his host. It runs on its own.' },
    { id: 'agents', name: `The Empire's network in Cintra is deep enough to strike (${net} of ${r.agents})`, done: net >= r.agents, what: 'Imperial agents in Calanthe\'s court. The crown\'s own network in Cintra slows them.' },
    { id: 'pretext', name: 'A pretext', done: !!road.pretext, what: road.pretext ? road.pretext.text : 'Once Emhyr\'s path is done and his agents are in place, a pretext comes of itself: a spurned envoy, a border incident on the Yaruga.' },
    { id: 'year', name: `The year is ${r.year} or later`, done: dateOf(state.day).year >= r.year, what: `It is ${dateOf(state.day).year}.` },
  ];
}

export const roadOpen = (state, world) => {
  const boxes = roadBoxes(state, world);
  return boxes.length > 0 && boxes.every((b) => b.done);
};

const PRETEXTS = [
  'Queen Calanthe spurns an imperial envoy before her whole court, and sends him home without his horse.',
  'A border incident on the Yaruga boils over: an imperial patrol is cut down on the Cintran bank, and the Emperor calls it murder.',
];

// Each month: the crown's spies slow the Empire's in Cintra, and once the
// Emperor is ready, a pretext comes.
export function monthlyRoad(state, world, rng) {
  const r = R(world);
  if (!r || state.nilfgaard?.stage === 'war') return;
  const road = roadOf(state);
  const nets = state.spycraft?.nets;
  if (nets?.[r.empire]?.[r.cintra] !== undefined) {
    const ours = nets[TEMERIA]?.[r.cintra] ?? 0;
    if (ours > r.slowFrom) nets[r.empire][r.cintra] = clamp(nets[r.empire][r.cintra] - (ours - r.slowFrom) * r.slowPer, 0, 100);
  }
  const boxes = roadBoxes(state, world);
  const ready = boxes.find((b) => b.id === 'emhyr').done && boxes.find((b) => b.id === 'agents').done;
  if (!road.pretext && ready && rng.chance(r.pretext)) {
    road.pretext = { day: state.day, text: PRETEXTS[Math.floor(rng.next() * PRETEXTS.length)] };
    addDispatch(state, `From the south: ${road.pretext.text} Nilfgaard has its pretext.`, 'abroad');
  }
  // The other crowns answer the Call late, in time for Sodden.
  for (const [rid, c] of Object.entries(road.calls)) {
    if (c.joined || c.aside || state.day < c.day) continue;
    joinCoalition(state, world, rid);
  }
}

function theWar(state, world) {
  const r = R(world);
  return (state.wars ?? []).find((w) => w.cause === 'invasion' && w.sides[0].includes(r.empire)) ?? null;
}

function joinCoalition(state, world, rid) {
  const road = roadOf(state);
  const w = theWar(state, world);
  const c = (road.calls[rid] ??= {});
  if (!w || w.sides.some((s) => s.includes(rid)) || !state.realms[rid] || state.realms[rid].fallen) {
    c.joined = state.day;
    return;
  }
  w.sides[1].push(rid);
  c.joined = state.day;
  addDispatch(state, `${sideName(world, rid)} answers the Call of the North and marches south against Nilfgaard.`, 'abroad');
}

// The war begins (from the clock, once roadOpen).
export function beginFirstWar(state, world, rng) {
  const r = R(world);
  const road = roadOf(state);
  road.began = state.day;
  if (!state.realms?.[r.cintra] || state.realms[r.cintra].fallen) return;
  const w = startWar(state, world, rng, r.empire, r.cintra, 'invasion');
  // Skellige stands with Cintra; Sodden and Brugge are drawn in, on their
  // suzerain's side.
  for (const rid of r.with) if (state.realms[rid] && !state.realms[rid].fallen && !w.sides[1].includes(rid)) w.sides[1].push(rid);
  for (const rid of r.drawn) {
    if (!state.realms[rid] || state.realms[rid].fallen || w.sides.some((s) => s.includes(rid))) continue;
    w.sides[suzerainOf(state, rid) === r.empire ? 0 : 1].push(rid);
  }
  addDispatch(state, 'The Dawn is over. Black-cloaked regiments cross the Yaruga and fall on Cintra; Skellige\'s longships put out to stand with Calanthe. The First Northern War has begun.', 'abroad');
  // The Call of the North: the crown's answer is a decision; the others
  // rally late.
  for (const [rid, late] of Object.entries(r.rally)) {
    if (!state.realms[rid] || state.realms[rid].fallen) continue;
    if (rng.chance(r.rallyChance)) road.calls[rid] = { day: state.day + late };
    else {
      road.calls[rid] = { aside: state.day };
      standAside(state, world, rid);
    }
  }
  openDilemma(state, world, 'call_of_the_north', null);
}

// Standing aside costs a crown its neighbours' trust, and the Empire's
// shadow grows over it.
function standAside(state, world, rid) {
  const r = R(world);
  for (const other of Object.keys(r.rally).concat([TEMERIA, r.cintra])) {
    if (other === rid || !state.diplomacy) continue;
    changeTrust(state, world, other, rid, -r.asideTrust);
  }
  const row = ((state.conquest ??= {}).fear ??= {})[rid] ??= {};
  row[r.empire] = clamp((row[r.empire] ?? 0) + r.asideFear, 0, 100);
  addDispatch(state, `${sideName(world, rid)} will not answer the Call of the North. The North remembers.`, 'abroad');
}

// The crown's answer to the Call (a dilemma's `call` effect).
export function answerCall(state, world, how) {
  const road = roadOf(state);
  if (how === 'join') {
    const w = theWar(state, world);
    if (w && !w.sides.some((x) => x.includes(TEMERIA))) w.sides[1].push(TEMERIA);
    road.calls[TEMERIA] = { joined: state.day };
    addDispatch(state, 'Foltest answers the Call of the North. Temeria marches south to stand with Cintra.', 'realm');
  } else {
    road.calls[TEMERIA] = { aside: state.day };
    standAside(state, world, TEMERIA);
  }
}

// For the tracker: the boxes, and the war once begun.
export function roadView(state, world) {
  const boxes = roadBoxes(state, world);
  if (!boxes.length) return null;
  const road = state.road ?? {};
  return {
    boxes, ticked: boxes.filter((b) => b.done).length, began: road.began ?? null,
    calls: Object.entries(road.calls ?? {}).map(([rid, c]) => ({ rid, joined: c.joined ?? null, aside: c.aside ?? null, due: c.day ?? null })),
  };
}
