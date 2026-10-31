// Raising a new house (M27 E). A fallen house's lands (stripped, exiled or
// beheaded) are held by the crown until the king raises a new house to hold
// them from a loyal commander: a captain of one of the crown's armies, a
// captain of a standing company that has won its fights, or a loyal younger
// son of another house. The crown can also raise a house by granting a
// conquered town. A new house starts grateful (high loyalty, little
// ambition) under its own banner; the gratitude fades over some years.
import { addDispatch } from './realm.js';
import { crownArmies } from './armies.js';
import { houseDef } from './lords.js';

const say = (state, text) => addDispatch(state, text, 'nobles');
const N = (world) => world.houses.newHouses;

// A raised house's description lives in the state; the world learns of it
// so every lookup by id (names, banners, traits) finds it.
export function registerHouses(world, state) {
  if (!world.houses) return;
  for (const [id, h] of Object.entries(state?.houses ?? {})) if (h.def) world.houses.houses[id] = h.def;
  for (const f of state?.fallenHouses ?? []) if (f.def && !world.houses.houses[f.house]) world.houses.houses[f.house] = f.def;
}

// A small, steady hash so a candidate keeps the same traits and colours.
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function traitsFor(world, name) {
  const pool = N(world).traits;
  const h = hash(name);
  const a = pool[h % pool.length];
  const rest = pool.filter((t) => t !== a && !(N(world).clash ?? []).some(([x, y]) => (x === a && y === t) || (y === a && x === t)));
  return [a, rest[(h >>> 8) % rest.length]];
}

function coloursFor(world, name, taken) {
  const { fields, charges } = N(world);
  const h = hash(name);
  for (let i = 0; i < fields.length; i++) {
    const field = fields[(h + i) % fields.length];
    if (taken.has(field)) continue;
    return [field, charges[(h >>> 4) % charges.length]];
  }
  return [fields[h % fields.length], charges[0]];
}

const lady = (world, first) => (N(world).ladies ?? []).includes(first);

// Who could be raised to hold these lands, now.
export function candidatesFor(state, world) {
  const out = [];
  const seen = new Set();
  const add = (c) => {
    if (seen.has(c.surname) || Object.values(world.houses.houses).some((d) => d.name === `House ${c.surname}`)) return;
    seen.add(c.surname);
    out.push(c);
  };
  // The captains of the crown's armies in the field.
  for (const a of crownArmies(state)) {
    if (!a.captain || a.lordOf) continue;
    const [first, ...last] = a.captain.replace(/^Captain /, '').split(' ');
    add({ key: `army:${a.id}`, first, surname: last.join(' '), deed: `Captain of ${a.name}${a.wins ? `, victor in ${a.wins} battle${a.wins === 1 ? '' : 's'}` : ''}.` });
  }
  // Captains of standing companies that have won their fights.
  const captains = world.war.captains ?? [];
  for (const c of state.forces?.companies ?? []) {
    if (!(c.wins > 0)) continue;
    const name = captains[c.id % Math.max(1, captains.length)];
    if (!name) continue;
    const [first, ...last] = name.replace(/^Captain /, '').split(' ');
    add({ key: `company:${c.id}`, first, surname: last.join(' '), deed: `Captain of ${c.name}, ${c.wins} fight${c.wins === 1 ? '' : 's'} won for the crown.` });
  }
  // A loyal younger son of another house.
  for (const [hid, h] of Object.entries(state.houses)) {
    if (h.rebel || h.captive || h.loyalty < N(world).sonLoyalty) continue;
    const def = houseDef(state, world, hid);
    const surname = def.name.replace(/^House /, '');
    const first = N(world).sons[hash(hid) % N(world).sons.length];
    add({ key: `son:${hid}`, first, surname: `${surname}-${world.byId[def.seat]?.name ?? 'Minor'}`, deed: `A younger son of ${def.name}, whose house has kept faith with the crown.` });
  }
  for (const c of out) {
    c.lord = `${lady(world, c.first) ? 'Lady' : 'Lord'} ${c.first} ${c.surname}`;
    c.name = `House ${c.surname}`;
    c.traits = traitsFor(world, c.name);
  }
  return out.slice(0, N(world).most);
}

// Lands waiting for a new house: after a house falls, or offered by the
// crown from a conquered town.
export function openRaising(state, world, lands, seat, from = null) {
  const r = { id: (state.nextRaisingId = (state.nextRaisingId ?? 0) + 1), lands: [...lands], seat, from, day: state.day };
  (state.raisings ??= []).push(r);
  return r;
}

export function canOfferTown(state, world, id) {
  const s = state.settlements[id];
  if (!s || s.occupier || s.holder !== 'crown' || !s.conquered) return { ok: false, reason: 'Only a conquered town the crown holds.' };
  if ((state.raisings ?? []).some((r) => r.lands.includes(id))) return { ok: false, reason: 'Already offered.' };
  if (!candidatesFor(state, world).length) return { ok: false, reason: 'No loyal commander to raise yet.' };
  return { ok: true };
}

export function raiseHouse(state, world, raisingId, key) {
  const i = (state.raisings ?? []).findIndex((r) => r.id === raisingId);
  if (i < 0) return { error: 'Those lands are already held.' };
  const r = state.raisings[i];
  const c = candidatesFor(state, world).find((x) => x.key === key);
  if (!c) return { error: 'No such candidate.' };
  const lands = r.lands.filter((id) => state.settlements[id]?.holder === 'crown' && !state.settlements[id].occupier);
  if (!lands.length) {
    state.raisings.splice(i, 1);
    return { error: 'Those lands are no longer the crown\'s to give.' };
  }
  const n = N(world);
  const id = `house${(state.nextHouseId = (state.nextHouseId ?? 0) + 1)}`;
  const taken = new Set(Object.values(world.houses.houses).map((d) => d.colours?.[0]));
  const seat = lands.includes(r.seat) ? r.seat : lands[0];
  const def = {
    name: c.name, lord: c.lord, seat, holdings: lands, traits: c.traits, loyalty: n.loyalty, ambition: n.ambition,
    colours: coloursFor(world, c.name, taken), raised: state.day, from: c.deed,
  };
  state.houses[id] = { loyalty: n.loyalty, favour: 0, grievance: 0, ambition: n.ambition, office: false, exemptUntil: null, rebel: null, lastAction: {}, gratitude: n.gratitude, def, wantAfter: state.day + n.quietDays };
  for (const sid of lands) state.settlements[sid].holder = id;
  world.houses.houses[id] = def;
  state.raisings.splice(i, 1);
  // A captain raised from an army hands it to the next captain.
  if (key.startsWith('army:')) {
    const a = crownArmies(state).find((x) => x.id === Number(key.slice(5)));
    if (a) a.captain = null;
  }
  say(state, `In the great hall at Vizima, ${c.lord} kneels and rises lord of ${lands.map((x) => world.byId[x].name).join(', ')}. ${def.name} raises its banner over ${world.byId[seat].name} for the first time.`);
  return { id };
}

// A new house's gratitude fades over the years (the loyalty it lends falls
// by a share each month).
export function monthlyGratitude(state, world) {
  for (const h of Object.values(state.houses)) if (h.gratitude) h.gratitude = h.gratitude * N(world).gratitudeFade < 0.5 ? 0 : h.gratitude * N(world).gratitudeFade;
}
