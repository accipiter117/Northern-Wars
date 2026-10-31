// The king's judgement on a rebel lord (M27 D): pardon, a fine and a
// hostage, stripping his lands and titles, exile, or the block. Because he
// rose against his king, stripping, exile and execution carry none of the
// tyranny penalties they carry in peacetime: Fear rises, the other lords
// fall into line, and the realm does not hold it against the crown. A lord
// who never rose can still be executed, at a heavy price (houses.js).
import { addDispatch, clamp } from './realm.js';
import { nudge } from './meters.js';
import { houseDef, pronoun } from './lords.js';
import { totalPopulation } from './state.js';
import { openRaising } from './newhouses.js';

const say = (state, text) => addDispatch(state, text, 'nobles');
const J = (world) => world.houses.judgement;

export const JUDGEMENTS = ['pardon', 'fine', 'strip', 'exile', 'execute'];

export function judgementsOf(state) {
  return state.judgements ?? [];
}

// The lord's crimes in one line.
export function crimesOf(state, world, j) {
  const def = houseDef(state, world, j.house);
  const how = { seat: 'held his seat against the crown until it fell', captured: 'was taken on the field at the head of his rebel host', terms: 'sued for mercy after his host was broken' }[j.how] ?? 'rose against his king';
  const p = pronoun(def);
  const line = how.replaceAll('his ', `${p.his} `);
  return `${def.lord} raised ${def.name} against the crown${j.months ? ` for ${j.months} month${j.months === 1 ? '' : 's'}` : ''}, and ${line}.`;
}

// What each choice will do, in one line, before it is confirmed.
export function judgementEffects(state, world, j) {
  const c = J(world);
  const fine = fineOf(state, world, j.house);
  const def = houseDef(state, world, j.house);
  const p = pronoun(def);
  return {
    pardon: `Pardon: ${p.he} returns very loyal and grateful. Love +${c.pardon.love}; the other lords see a soft crown (their ambition +${c.pardon.othersAmbition}).`,
    fine: `Fine and hostage: ${fine} crowns at once and ${p.his} heir held at court. ${p.he[0].toUpperCase()}${p.he.slice(1)} keeps ${p.his} lands; no rising while the hostage is held.`,
    strip: `Strip lands and titles: the house loses all its holdings and its seat; the lands pass to the crown until a new house is raised. No penalty for punishing a traitor.`,
    exile: `Exile: as stripping, and ${p.he} leaves the realm. ${p.he[0].toUpperCase()}${p.he.slice(1)} may one day fund trouble from a rival court.`,
    execute: `Execute: beheaded at ${world.byId[def.seat]?.name ?? 'the seat'}. Fear +${c.execute.fear}; every other house falls into line (loyalty up, ambition down). No Love lost for a traitor.`,
  };
}

export function fineOf(state, world, hid) {
  const c = J(world).fine;
  const people = Object.values(state.settlements).filter((s) => s.holder === hid).reduce((a, s) => a + totalPopulation(s), 0);
  return Math.round((c.base + people * c.perPerson) / 50) * 50;
}

// The house's lands go to the crown, and the house is gone from the realm
// (its name kept for the chronicle). Part E raises a new house to hold them.
export function fallHouse(state, world, hid, how) {
  const def = houseDef(state, world, hid);
  const lands = Object.keys(state.settlements).filter((id) => state.settlements[id].holder === hid);
  for (const id of lands) state.settlements[id].holder = 'crown';
  delete state.houses[hid];
  state.demands = state.demands.filter((d) => d.house !== hid && d.rival !== hid);
  (state.fallenHouses ??= []).push({ house: hid, name: def.name, lord: def.lord, how, day: state.day, lands, seat: def.seat, ...(def.raised !== undefined ? { def } : {}) });
  // The lands wait for a new house (M27 E).
  if (lands.length) openRaising(state, world, lands, def.seat, hid);
  return lands;
}

export function judge(state, world, id, choice) {
  const i = judgementsOf(state).findIndex((x) => x.id === id);
  if (i < 0) return false;
  const j = state.judgements[i];
  const kind = JUDGEMENTS[choice];
  if (!kind) return false;
  state.judgements.splice(i, 1);
  const c = J(world);
  const hid = j.house;
  const h = state.houses[hid];
  const def = houseDef(state, world, hid);
  const p = pronoun(def);
  const others = () => Object.entries(state.houses).filter(([oid]) => oid !== hid).map(([, o]) => o);
  if (h) h.captive = null;
  if (kind === 'pardon') {
    Object.assign(h, { loyalty: c.pardon.loyalty, grievance: 0, favour: c.pardon.favour, ambition: c.pardon.ambition });
    nudge(state, world, 'love', c.pardon.love, 'A rebel pardoned');
    for (const o of others()) o.ambition = clamp(o.ambition + c.pardon.othersAmbition, 0, 100);
    say(state, `The king pardons ${def.lord}. ${p.he[0].toUpperCase()}${p.he.slice(1)} kneels in tears at Vizima and swears ${p.his} house to the crown for ever. The other lords mutter that the crown is soft.`);
  } else if (kind === 'fine') {
    const fine = fineOf(state, world, hid);
    state.treasury += fine;
    Object.assign(h, { loyalty: c.fine.loyalty, grievance: 0, favour: c.fine.favour, ambition: c.fine.ambition, hostageUntil: state.day + c.fine.hostageDays });
    say(state, `${def.name} pays ${fine} crowns for its treason, and ${def.lord}'s heir comes to Vizima as a hostage for its good behaviour.`);
  } else {
    // Strip, exile or execute: the house falls, with impunity.
    fallHouse(state, world, hid, kind);
    nudge(state, world, 'fear', c[kind].fear, kind === 'execute' ? 'A traitor beheaded' : 'A traitor brought down');
    for (const o of others()) {
      o.favour += c[kind].othersFavour;
      o.ambition = clamp(o.ambition - c[kind].othersAmbition, 0, 100);
    }
    const seat = world.byId[def.seat]?.name ?? 'his seat';
    if (kind === 'strip') say(state, `${def.name} is stripped of its lands and titles. ${def.lord} lives on at court, a landless ${def.lord.startsWith('Lady') ? 'woman' : 'man'}. The other lords fall into line.`);
    if (kind === 'exile') {
      (state.exiles ??= []).push({ house: hid, name: def.name, lord: def.lord, day: state.day, lands: state.fallenHouses.at(-1).lands, troubled: 0 });
      say(state, `${def.lord} is stripped of lands and titles and sent into exile. ${p.he[0].toUpperCase()}${p.he.slice(1)} crosses the border with a handful of retainers. The other lords fall into line.`);
    }
    if (kind === 'execute') {
      state.scaffold = { place: def.seat, until: state.day + c.execute.scaffoldDays };
      say(state, `${def.lord} is beheaded at ${seat} before the assembled lords. ${p.his[0].toUpperCase()}${p.his.slice(1)} heir, a child, is sent to a monastery. Every great house in Temeria falls into line.`);
    }
  }
  return true;
}

// An exiled lord may, in time, pay agitators in his old lands from a rival
// court (a light echo of the M19 claimants).
export function monthlyExiles(state, world, rng) {
  const c = J(world).exile;
  for (const e of state.exiles ?? []) {
    if (state.day - e.day < c.afterDays || e.troubled >= c.most || !rng.chance(c.chance)) continue;
    e.troubled += 1;
    const court = Object.entries(state.neighbours ?? {}).filter(([rid]) => rid !== 'brokilon' && rid !== 'mahakam').sort((a, b) => a[1].relation - b[1].relation)[0]?.[0];
    for (const id of e.lands) if (state.settlements[id]) state.settlements[id].unrest = clamp(state.settlements[id].unrest + c.unrest, 0, 100);
    if (court) state.neighbours[court].relation = clamp(state.neighbours[court].relation - c.relation, -100, 100);
    const where = court ? world.geography.neighbours[court]?.name ?? court : 'abroad';
    say(state, `From exile in ${where}, ${e.lord} pays agitators in the old lands of ${e.name}. They grow restless.`);
  }
}
