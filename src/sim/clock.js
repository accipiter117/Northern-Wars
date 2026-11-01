// The Nilfgaard clock (M30 D). The Empire watches (envoys, merchants and
// spies), then presses (raids across the Yaruga, refugees, demands on
// Cintra, petty kings courted), then invades, taking its aims in order:
// Cintra, then Sodden and Brugge, then the road to the Pontar. The North
// reacts as its fear of the Empire grows: leagues against it (M19), calls
// to arms, and petty kings seeking protection (M29 B).
//
// The last stage waits behind a gate. For now the gate opens on a day drawn
// when the reign begins (one to three years in); M33 (Dawn of the Reign)
// will replace gateOpen so the war waits on the player's own path.
import { addDispatch, clamp } from './realm.js';
import { atWar, ownerOf, sideName, hurtPlace } from './conflict.js';
import { raiseRealmArmy } from './war.js';
import { makeVassal, roomFor, distance } from './suzerainty.js';
import { suzerainOf } from './tiers.js';
import { livingRealms } from './lands.js';

const K = (world) => world.war?.clock;
export const STAGES = ['watching', 'pressure', 'war'];
const south = (state, text) => addDispatch(state, `From the south: ${text}`, 'abroad');

// A fresh clock, its gate drawn from the reign's seed so a save resumes it.
export function newClock(world, seed, day) {
  const c = K(world);
  if (!c) return null;
  const span = c.gate.maxDays - c.gate.minDays;
  const warDay = day + c.gate.minDays + (((seed >>> 0) * 2654435761) >>> 0) % (span + 1);
  return { realm: c.realm, stage: 'watching', since: day, pressureDay: day + Math.round((warDay - day) * c.pressureAt), warDay, aim: 0 };
}

export const clockOf = (state) => state.nilfgaard ?? null;
export const clockStage = (state) => state.nilfgaard?.stage ?? null;

// Whether the war may begin. M33 replaces this with the player's path.
export function gateOpen(state, world) {
  const k = clockOf(state);
  return !!k && state.day >= k.warDay;
}

// The Empire makes no war of its own before the clock reaches War.
export function clockHolds(state, rid) {
  const k = clockOf(state);
  return !!k && k.realm === rid && k.stage !== 'war';
}

const empireStands = (state, world) => {
  const rid = K(world)?.realm;
  return rid && state.realms?.[rid] && !state.realms[rid].fallen ? rid : null;
};

// Petty kingdoms near the Empire feel its shadow from Pressure on.
export function clockThreat(state, world, rid) {
  const k = clockOf(state);
  if (!k || k.stage === 'watching' || !empireStands(state, world) || rid === k.realm) return false;
  return distance(world, rid, k.realm) <= K(world).threatReach;
}

// The next town the Empire means to take, or null when all are held.
export function nextAim(state, world) {
  const k = clockOf(state);
  const c = K(world);
  for (const id of c.aims) if (world.byId[id] && ownerOf(state, world, id) !== k.realm) return id;
  return null;
}

// One line for the Steward's report.
export function clockLine(state, world) {
  const k = clockOf(state);
  if (!k || !empireStands(state, world)) return null;
  const aim = nextAim(state, world);
  if (k.stage === 'watching') return 'Imperial envoys and merchants are everywhere south of the Yaruga, and they ask a great many questions.';
  if (k.stage === 'pressure') return 'Nilfgaard presses on the Yaruga: raids, refugees and hard words for Cintra. The North is afraid.';
  return aim ? `Nilfgaard is at war in the North. Its armies march on ${world.byId[aim].name}.` : 'Nilfgaard holds all it set out to take, and looks further north.';
}

function advance(state, world) {
  const k = clockOf(state);
  if (k.stage === 'watching' && state.day >= k.pressureDay) {
    k.stage = 'pressure';
    k.since = state.day;
    south(state, 'Imperial patrols ride along the Yaruga now, and the Emperor\'s envoys speak to Cintra in a harder voice. Nilfgaard has stopped watching.');
  }
  if (k.stage === 'pressure' && gateOpen(state, world)) {
    k.stage = 'war';
    k.since = state.day;
    south(state, 'The Emperor has declared that the North will be brought to order. Black-cloaked regiments cross the Yaruga.');
  }
}

const WATCHING = [
  'An imperial envoy dines with the merchants of Cintra and pays for everything.',
  'Nilfgaardian merchants buy up maps of the river crossings, and no one asks why.',
  'A spy of the Empire is caught in Brugge with letters in cipher. He hangs; the letters are not read.',
  'Imperial engineers survey the southern bank of the Yaruga, so travellers say.',
  'Gold with the Emperor\'s face on it turns up in the taverns of Sodden.',
];

export function monthlyClock(state, world, rng) {
  const c = K(world);
  if (!c) return;
  const rid = empireStands(state, world);
  if (!rid) return;
  state.nilfgaard ??= newClock(world, state.seed ?? 1, state.day);
  const k = state.nilfgaard;
  advance(state, world);
  if (k.stage === 'watching') {
    if (rng.chance(c.watching.chance)) south(state, WATCHING[Math.floor(rng.next() * WATCHING.length)]);
    return;
  }
  // The North's fear of the Empire grows.
  for (const other of livingRealms(state)) {
    if (other === rid || state.realms[other].lawless || suzerainOf(state, other) === rid) continue;
    const row = ((state.conquest ??= {}).fear ??= {})[other] ??= {};
    row[rid] = clamp((row[rid] ?? 0) + (k.stage === 'war' ? c.fear.war : c.fear.monthly), 0, c.fear.max);
  }
  league(state, world, rng, rid);
  if (k.stage === 'pressure') {
    pressure(state, world, rng, rid);
    return;
  }
  // War: march on the next aim, unless already marching or fighting.
  if (atWar(state, rid) || (state.musters ?? []).some((m) => m.realm === rid)) return;
  const aim = nextAim(state, world);
  if (!aim) return;
  const against = ownerOf(state, world, aim);
  if ((state.truces?.[[rid, against].sort().join('|')] ?? 0) > state.day) return;
  const army = raiseRealmArmy(state, world, rid, [against], 'muster');
  if (!army) return;
  const reason = `the Emperor will have ${world.byId[aim].name}`;
  state.musters.push({ realm: rid, against, army: army.id, day: state.day + (world.strategy?.war?.musterDays ?? 30), aim, reason, pact: null });
  state.realms[rid].aim = { town: aim, against, since: state.day, reason };
  south(state, `${Math.round(army.soldiers)} imperial soldiers gather at ${world.byId[army.at].name}. They mean to take ${world.byId[aim].name} from ${sideName(world, against)}.`);
}

function pressure(state, world, rng, rid) {
  const c = K(world);
  // Raids across the Yaruga on a border town of a raided realm.
  if (rng.chance(c.raids.chance)) {
    const towns = c.raided.flatMap((r) => (world.foreignByRealm[r] ?? []).filter((id) => ownerOf(state, world, id) === r));
    const near = towns.sort((a, b) => distance2(world, a, rid) - distance2(world, b, rid)).slice(0, 4);
    if (near.length) {
      const id = near[Math.floor(rng.next() * near.length)];
      hurtPlace(state, world, id, { prosperity: c.raids.prosperity, unrest: c.raids.unrest });
      south(state, `Imperial riders cross the Yaruga by night and burn the farms round ${world.byId[id].name}, in ${sideName(world, ownerOf(state, world, id))}.`);
    }
  }
  // Refugees flee north; Temeria hears their stories.
  if (rng.chance(c.refugees.chance)) {
    const from = c.raided[Math.floor(rng.next() * c.raided.length)];
    for (const id of world.foreignByRealm[from] ?? []) {
      const s = state.realms[from]?.settlements[id];
      if (s) s.population = Math.round(s.population * (1 - c.refugees.people));
    }
    state.sympathy = clamp((state.sympathy ?? 20) + c.refugees.sympathy, 0, 100);
    south(state, `Refugees from ${sideName(world, from)} walk north along the roads with what they can carry, telling of black cloaks on the river.`);
  }
  // Demands on Cintra.
  if (state.realms.cintra && !state.realms.cintra.fallen && rng.chance(c.demands.chance)) {
    const row = (state.diplomacy.trust.cintra ??= {});
    row[rid] = clamp((row[rid] ?? 50) + c.demands.trust, 0, 100);
    south(state, 'The Emperor demands that Cintra open its river forts to imperial garrisons. Queen Calanthe sends the envoy home without his horse.');
  }
  // Petty kings courted, Brugge and Sodden above all.
  if (rng.chance(c.court.chance) && roomFor(state, world, rid)) {
    for (const t of c.court.targets) {
      if (!state.realms[t] || state.realms[t].fallen || suzerainOf(state, t) || distance(world, t, rid) > world.diplomacy.suzerainty.ai.reach) continue;
      if (makeVassal(state, world, t, rid, 'pressure', c.court.loyalty)) south(state, `${sideName(world, t)} takes the Emperor's gold and his word. Nilfgaard has a foot north of the Yaruga.`);
      break;
    }
  }
}

// Fear of the Empire binds the North: a league, and calls to arms when the
// Empire falls on one of its members.
function league(state, world, rng, rid) {
  const c = K(world).league;
  const k = clockOf(state);
  const north = livingRealms(state).filter((r) => r !== rid && !state.realms[r].lawless && suzerainOf(state, r) !== rid && world.diplomacy?.rulers[r]);
  const fear = (r) => state.conquest?.fear?.[r]?.[rid] ?? 0;
  const avg = north.reduce((a, r) => a + fear(r), 0) / Math.max(1, north.length);
  if (!k.league && avg >= c.at) {
    const members = north.filter((r) => fear(r) >= c.member);
    if (members.length >= 2) {
      k.league = { members, since: state.day };
      south(state, `Fear of the Empire binds the North: ${members.map((r) => sideName(world, r)).join(', ')} swear to stand together against Nilfgaard.`);
    }
  } else if (k.league) {
    for (const r of north) if (!k.league.members.includes(r) && fear(r) >= c.member) k.league.members.push(r);
    k.league.members = k.league.members.filter((r) => north.includes(r));
  }
  if (!k.league) return;
  for (const w of state.wars ?? []) {
    const side = w.sides.findIndex((s) => s.includes(rid));
    if (side < 0) continue;
    const foes = w.sides[1 - side];
    if (!foes.some((r) => k.league.members.includes(r))) continue;
    for (const r of k.league.members) {
      if (foes.includes(r) || w.sides[side].includes(r) || atWar(state, r) || !rng.chance(c.join)) continue;
      foes.push(r);
      south(state, `${sideName(world, r)} answers the league's call and marches against Nilfgaard.`);
    }
  }
}

function distance2(world, id, rid) {
  const t = world.byId[id];
  const cap = world.byId[world.realms.realms[rid].capital];
  return (t.x - cap.x) ** 2 + (t.y - cap.y) ** 2;
}

