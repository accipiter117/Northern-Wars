// Spy operations (M31 B). A network deep enough in a realm can act there:
// bribe at 50, stir revolt at 60, sabotage at 70, assassinate at 85. Each
// costs coin, rests the realm's networks for a season, and may be exposed by
// the realm's own watch: exposure fails the operation, costs the network
// depth and the crown trust, and sometimes the agent. Never a crowned ruler.
import { addDispatch, clamp } from './realm.js';
import { creditLimit } from './economy.js';
import { ownerOf, sideName } from './conflict.js';
import { changeTrust } from './diplomacy.js';
import { suzerainOf } from './tiers.js';
import { ourDepth, guardOf, spycraftOf } from './spies.js';

const TEMERIA = 'temeria';
const O = (world) => world.spies?.operations;
const K = (world, kind) => O(world)?.kinds[kind];
export const OPERATIONS = ['bribe', 'stir', 'sabotage', 'assassinate'];

const fieldArmies = (state, rid) => (state.armies ?? []).filter((a) => a.side === rid && a.soldiers > 0);
const ownTowns = (state, world, rid) => (world.foreignByRealm[rid] ?? []).filter((id) => ownerOf(state, world, id) === rid && state.realms[rid]?.settlements[id]);

// What an operation can strike in a realm, as choices for the crown.
export function opTargets(state, world, rid, kind) {
  const realm = state.realms?.[rid];
  if (!realm || realm.fallen) return [];
  const out = [];
  if (kind === 'bribe') {
    out.push({ id: 'court', label: world.realms?.realms[rid]?.governors ? 'An imperial governor' : 'Lords at its court', line: 'Their counsel turns our way: trust and goodwill towards Temeria.' });
    const lord = suzerainOf(state, rid);
    if (realm.vassal && lord && lord !== TEMERIA) out.push({ id: 'vassal', label: `Its crown, against ${sideName(world, lord)}`, line: 'Gold that loosens the bond to its overlord.' });
  }
  if (kind === 'stir' && ownTowns(state, world, rid).length) out.push({ id: 'land', label: 'Its towns and villages', line: 'Hungry men, old grudges and our silver: a rising in two of its towns.' });
  if (kind === 'sabotage') {
    if (fieldArmies(state, rid).some((a) => a.siege)) out.push({ id: 'siege', label: 'Its siege camp\'s stores', line: 'Burned stores and fouled wells set its siege back.' });
    if (world.realms?.realms[rid]?.capital) out.push({ id: 'works', label: 'Its works and granaries', line: 'Fire in the capital\'s yards and granaries.' });
  }
  if (kind === 'assassinate') {
    if (fieldArmies(state, rid).length || (realm.army ?? 0) > 0) out.push({ id: 'commander', label: 'A commander', line: 'Its army loses a captain, and some of its men and its heart besides.' });
    if (spycraftOf(state)?.nets?.[rid]) out.push({ id: 'spymaster', label: 'Its spymaster', line: 'Its networks everywhere lose their master.' });
  }
  return out;
}

// The chance an operation is found out.
export function exposureOf(state, world, rid, kind) {
  const o = O(world);
  const k = K(world, kind);
  const sm = spycraftOf(state)?.spymaster;
  const trait = o.traitRisk[sm?.trait] ?? 1;
  const over = Math.max(0, ourDepth(state, rid) - k.at);
  const depth = Math.max(0.5, 1 - over / 50);
  return clamp(k.risk * (guardOf(state, world, rid) / 40) * trait * depth, 0.02, o.maxRisk);
}

export function canOperate(state, world, rid, kind, target) {
  const k = K(world, kind);
  if (!k) return { ok: false, reason: 'No such work.' };
  if (rid === TEMERIA || !state.realms?.[rid] || state.realms[rid].fallen) return { ok: false, reason: 'There is no court there to work on.' };
  const d = ourDepth(state, rid);
  if (d < k.at) return { ok: false, reason: `Our network there must be ${k.at} deep (it is ${Math.round(d)}).` };
  const rest = (spycraftOf(state)?.cooldown?.[rid] ?? 0) - state.day;
  if (rest > 0) return { ok: false, reason: `Our agents there are lying low (${rest} days).` };
  if (!opTargets(state, world, rid, kind).some((t) => t.id === target)) return { ok: false, reason: 'Nothing of that kind to strike there now.' };
  if (state.treasury - k.coin < -creditLimit(state, world)) return { ok: false, reason: 'The bankers will not lend that much.' };
  return { ok: true };
}

export function operate(state, world, rng, rid, kind, target) {
  const o = O(world);
  const k = K(world, kind);
  const sc = spycraftOf(state);
  state.treasury -= k.coin;
  (sc.cooldown ??= {})[rid] = state.day + o.cooldown;
  const name = sideName(world, rid);
  const nets = sc.nets.temeria;
  if (rng.chance(exposureOf(state, world, rid, kind))) {
    const lost = rng.chance(o.agentLostChance);
    nets[rid] = clamp((nets[rid] ?? 0) - o.depthLoss - (lost ? o.agentLostDepth : 0), 0, 100);
    const ruthless = sc.spymaster?.trait === 'ruthless' ? 1.5 : 1;
    changeTrust(state, world, rid, TEMERIA, -o.trust * ruthless);
    if (state.neighbours[rid]) state.neighbours[rid].relation = clamp(state.neighbours[rid].relation - o.relation, -100, 100);
    sc.last = { realm: rid, kind, target, day: state.day, exposed: true, lost };
    addDispatch(state, `Our people in ${name} were found out before the work was done${lost ? ', and one of them hangs for it' : ''}. ${name} knows whose silver paid for it.`, 'abroad');
    return { exposed: true, lost };
  }
  const text = strike(state, world, rng, rid, kind, target, k);
  sc.last = { realm: rid, kind, target, day: state.day, exposed: false };
  addDispatch(state, text, 'abroad');
  return { exposed: false };
}

function strike(state, world, rng, rid, kind, target, k) {
  const name = sideName(world, rid);
  const realm = state.realms[rid];
  if (kind === 'bribe' && target === 'vassal') {
    realm.vassal.loyalty = clamp(realm.vassal.loyalty - k.loyalty, 0, 100);
    return `Temerian gold has found its way into the treasury of ${name}. Its loyalty to ${sideName(world, suzerainOf(state, rid))} is cooling.`;
  }
  if (kind === 'bribe') {
    changeTrust(state, world, rid, TEMERIA, k.trust);
    if (state.neighbours[rid]) state.neighbours[rid].relation = clamp(state.neighbours[rid].relation + k.relation, -100, 100);
    return `Several voices at the court of ${name} now speak warmly of Temeria. They have been well paid to.`;
  }
  if (kind === 'stir') {
    const towns = ownTowns(state, world, rid);
    const hit = [];
    for (let i = 0; i < k.towns && towns.length; i++) hit.push(towns.splice(Math.floor(rng.next() * towns.length), 1)[0]);
    for (const id of hit) {
      const s = realm.settlements[id];
      s.prosperity = clamp(s.prosperity - k.prosperity, 0, 100);
      s.garrison = Math.round((s.garrison ?? 0) * (1 - k.garrison));
      s.population = Math.round(s.population * (1 - k.people));
    }
    realm.treasury -= k.treasury;
    return `Risings break out in ${hit.map((id) => world.byId[id].name).join(' and ')}, in ${name}. Its garrisons have their hands full, and no one asks where the rebels found their silver.`;
  }
  if (kind === 'sabotage' && target === 'siege') {
    for (const a of fieldArmies(state, rid).filter((x) => x.siege)) {
      const s = a.siege;
      s.food = Math.min(s.foodMax, s.food + s.foodMax * k.siegeFood);
      s.walls = Math.min(s.wallsMax, s.walls + s.wallsMax * k.siegeWalls);
    }
    return `Fire runs through the siege camp of ${name} by night. Its stores are ash, and the besieged take heart.`;
  }
  if (kind === 'sabotage') {
    const cap = world.realms.realms[rid].capital;
    const s = realm.settlements[cap];
    if (s) s.prosperity = clamp(s.prosperity - k.prosperity, 0, 100);
    realm.treasury -= k.treasury;
    return `The granaries and works yards of ${world.byId[cap].name} burn. ${name} counts the cost.`;
  }
  if (kind === 'assassinate' && target === 'spymaster') {
    const row = state.spycraft.nets[rid] ?? {};
    for (const t of Object.keys(row)) row[t] = clamp(row[t] - k.networks, 0, 100);
    return `The spymaster of ${name} is found dead in a locked room. Its agents everywhere wait for orders that do not come.`;
  }
  const armies = fieldArmies(state, rid).sort((a, b) => b.soldiers - a.soldiers);
  if (armies.length) {
    const a = armies[0];
    a.soldiers *= 1 - k.soldiers;
    if (typeof a.morale === 'number') a.morale = Math.max(0, a.morale - k.morale);
  } else realm.army = Math.floor((realm.army ?? 0) * (1 - k.army));
  return `A commander of ${name} dies of a sudden fever in camp. The soldiers say it was no fever.`;
}
