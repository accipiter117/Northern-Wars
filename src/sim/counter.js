// Counter-espionage (M31 C). Foreign networks in Temeria lose agents to the
// crown's watch (the spymaster and the laws); a caught agent is a decision
// for the crown: hang, turn, trade back or follow. Foreign networks also
// work against Temeria at the depths their operations need; what they do
// leaves a clue, and a spymaster may later name who did it.
import { addDispatch, clamp } from './realm.js';
import { nudge } from './meters.js';
import { makeRng } from './rng.js';
import { sideName, atWar } from './conflict.js';
import { changeTrust } from './diplomacy.js';
import { dilemmasOf } from './dilemmas.js';
import { spyOwners, netDepth, guardOf, spycraftOf } from './spies.js';
import { OPERATIONS } from './operations.js';
import { houseDef } from './lords.js';

const TEMERIA = 'temeria';
const C = (world) => world.spies?.counter;
const nets = (state, owner) => (state.spycraft.nets[owner] ??= {});
const bump = (row, key, d) => { row[key] = clamp((row[key] ?? 0) + d, 0, 100); };

// The chance a month that the crown's watch takes one of a network's agents.
export function catchChance(state, world, owner) {
  const c = C(world);
  return Math.min(c.catchMax, c.catchBase * (netDepth(state, owner, TEMERIA) / 50) * (guardOf(state, world, TEMERIA, owner) / 40));
}

const caughtOpen = (state) => (state.dilemmas?.open ?? []).some((o) => o.agent);

function bringIn(state, world, owner, op = null) {
  const d = dilemmasOf(state);
  d.open.push({ id: d.nextId++, agent: owner, realm: owner, op, day: state.day });
  spycraftOf(state).lastCaught = state.day;
  spycraftOf(state).caught = (spycraftOf(state).caught ?? 0) + 1;
}

export function monthlyCounter(state, world, rng) {
  const c = C(world);
  const sc = spycraftOf(state);
  if (!c || !sc) return;
  for (const o of spyOwners(state, world)) {
    if (o === TEMERIA) continue;
    foreignOperation(state, world, rng, o);
    if (caughtOpen(state) || state.day - (sc.lastCaught ?? -1e9) < c.gapDays) continue;
    if (rng.chance(catchChance(state, world, o))) bringIn(state, world, o);
  }
  nameCulprits(state, world, rng, sc);
}

// ---- Foreign work in Temeria ----

function foreignOperation(state, world, rng, owner) {
  const c = C(world);
  const ops = world.spies.operations;
  let p = c.foreignOps.chance * (world.spies.owners[owner]?.spend ?? 0);
  if (atWar(state, owner) && (state.wars ?? []).some((w) => w.sides.some((s) => s.includes(owner)) && w.sides.some((s) => s.includes(TEMERIA)))) p *= c.foreignOps.atWar;
  if (state.nilfgaard?.realm === owner && state.nilfgaard.stage !== 'watching') p *= c.foreignOps.pressure;
  if (!rng.chance(p)) return;
  const d = netDepth(state, owner, TEMERIA);
  const can = OPERATIONS.filter((k) => d >= ops.kinds[k].at && target(state, world, rng, k, true));
  if (!can.length) return;
  const kind = can[can.length - 1];
  const risk = clamp(ops.kinds[kind].risk * (guardOf(state, world, TEMERIA, owner) / 40), 0.02, ops.maxRisk);
  if (rng.chance(risk)) {
    // Caught at it: the agent comes before the crown, unless one already waits.
    bump(nets(state, owner), TEMERIA, -ops.depthLoss);
    if (!caughtOpen(state)) bringIn(state, world, owner, kind);
    return;
  }
  const what = target(state, world, rng, kind, false);
  const sc = spycraftOf(state);
  (sc.clues ??= []).push({ id: (sc.nextId = (sc.nextId ?? 1) + 1), owner, kind, day: state.day, what: what.name, named: false });
  if (sc.clues.length > 12) sc.clues.splice(0, sc.clues.length - 12);
  addDispatch(state, what.text, 'realm');
}

// What a foreign operation strikes in Temeria; with peek, only whether
// there is anything to strike.
function target(state, world, rng, kind, peek) {
  const f = C(world).foreignOps;
  if (kind === 'bribe') {
    const ids = Object.keys(state.houses ?? {}).filter((h) => !state.houses[h].fallen && state.houses[h].loyalty !== undefined);
    if (peek) return ids.length > 0;
    const h = ids[Math.floor(rng.next() * ids.length)];
    state.houses[h].loyalty = clamp(state.houses[h].loyalty - f.loyalty, 0, 100);
    const name = houseDef(state, world, h)?.name ?? h;
    return { name, text: `The loyalty of ${name} to the crown has cooled, and no one at court can say why.` };
  }
  const towns = Object.keys(state.settlements ?? {});
  if (kind === 'stir' || kind === 'sabotage') {
    if (peek) return towns.length > 0;
    const id = towns[Math.floor(rng.next() * towns.length)];
    const s = state.settlements[id];
    if (kind === 'stir') {
      s.unrest = clamp(s.unrest + f.unrest, 0, 100);
      return { name: world.byId[id].name, text: `Agitators no one had seen before stir up ${world.byId[id].name}. They had silver in their purses, and they are gone now.` };
    }
    s.prosperity = clamp(s.prosperity - f.prosperity, 0, 100);
    return { name: world.byId[id].name, text: `Fire breaks out in the workshops and granaries of ${world.byId[id].name}, in three places at once.` };
  }
  const armies = (state.armies ?? []).filter((a) => a.side === TEMERIA && a.soldiers > 0).sort((a, b) => b.soldiers - a.soldiers);
  if (peek) return armies.length > 0;
  const a = armies[0];
  a.soldiers *= 1 - f.soldiers;
  if (typeof a.morale === 'number') a.morale = Math.max(0, a.morale - f.morale);
  return { name: a.name ?? 'the army', text: `A captain of ours is found dead in camp, and the army is shaken. The surgeons say poison.` };
}

// A spymaster traces old work to its source, given time.
function nameCulprits(state, world, rng, sc) {
  const c = C(world);
  if (!sc.spymaster || sc.spymaster.turned) return;
  for (const k of sc.clues ?? []) {
    if (k.named || state.day - k.day > c.clueDays) continue;
    if (!rng.chance(c.nameChance * (sc.spymaster.skill / 50))) continue;
    k.named = true;
    addDispatch(state, `${sc.spymaster.name} has traced the trouble at ${k.what} to agents of ${sideName(world, k.owner)}.`, 'realm');
    return;
  }
}

// ---- The caught agent ----

export const CAUGHT = ['hang', 'turn', 'trade', 'follow'];

function turnChance(state, world) {
  const t = C(world).turn;
  return clamp(t.base + (spycraftOf(state)?.spymaster?.skill ?? 0) * t.perSkill, 0, 0.95);
}

export function caughtText(state, world, o) {
  const c = C(world);
  const name = sideName(world, o.agent);
  const at = o.op ? ` caught in the act (${({ bribe: 'carrying gold to a lord', stir: 'stirring up a town', sabotage: 'with a tinderbox in the granaries', assassinate: 'with poison for a captain' })[o.op]})` : '';
  return {
    kicker: 'Counter-espionage',
    title: `An agent of ${name} is taken`,
    text: `The watch has taken an agent of ${name}${at}. The prisoner waits in the cellars under the palace, and the crown must decide what becomes of them.`,
    choices: [
      { label: 'Hang the spy', hint: `Fear +${c.hang.fear}; their network ${-c.hang.network}; ${name} angered` },
      { label: 'Turn the spy', hint: `${Math.round(turnChance(state, world) * 100)}% they truly turn: our network in ${name} +${c.turn.gain}. Otherwise they play us.` },
      { label: 'Trade the spy back', hint: `${name}'s trust and goodwill rise; their network ${-c.trade.network}` },
      { label: 'Let the spy go, and follow', hint: `Their network ${-c.follow.network}, its depth known for a year; a traitor in their pay unmasked` },
    ],
    place: null,
    fallback: 0,
    realm: o.agent,
  };
}

export function resolveCaught(state, world, o, choice, ignored = false) {
  const c = C(world);
  const owner = o.agent;
  const name = sideName(world, owner);
  const sc = spycraftOf(state);
  const theirs = nets(state, owner);
  const ours = nets(state, TEMERIA);
  const relation = (v) => { if (state.neighbours?.[owner]) state.neighbours[owner].relation = clamp(state.neighbours[owner].relation + v, -100, 100); };
  const say = (t) => addDispatch(state, ignored ? `${t} (Vizima sent no word, so the watch did as it always does.)` : t, 'realm');
  const kind = CAUGHT[choice];
  if (kind === 'hang') {
    nudge(state, world, 'fear', c.hang.fear, 'A spy hanged');
    bump(theirs, TEMERIA, -c.hang.network);
    relation(c.hang.relation);
    changeTrust(state, world, owner, TEMERIA, c.hang.trust);
    say(`The agent of ${name} hangs at the Vizima gate. ${name} protests, loudly and without conviction.`);
  } else if (kind === 'turn') {
    const rng = makeRng(state.rng.game);
    const ok = rng.chance(turnChance(state, world));
    state.rng.game = rng.seed;
    if (ok) {
      bump(ours, owner, c.turn.gain);
      say(`The agent of ${name} now writes two letters each week: one home, and one to us.`);
    } else {
      bump(ours, owner, -c.turn.failLoss);
      bump(theirs, TEMERIA, c.turn.failGain);
      sc.played = { realm: owner, day: state.day };
      say(`The agent of ${name} has gone, and with them the names of some of our own people. We were the ones being played.`);
    }
  } else if (kind === 'trade') {
    bump(theirs, TEMERIA, -c.trade.network);
    relation(c.trade.relation);
    changeTrust(state, world, owner, TEMERIA, c.trade.trust);
    say(`The agent of ${name} is handed back at the border, quietly. ${name} remembers the courtesy.`);
  } else {
    bump(theirs, TEMERIA, -c.follow.network);
    (sc.known ??= {})[owner] = state.day + c.follow.knowDays;
    if (sc.spymaster?.turned === owner) {
      say(`Followed through the city at night, the agent of ${name} leads our watchers to the door of ${sc.spymaster.name}, the crown's own spymaster. The traitor is taken before dawn.`);
      nudge(state, world, 'fear', c.hang.fear, 'A traitor spymaster taken');
      sc.lost = { name: sc.spymaster.name, day: state.day, by: owner, how: 'unmasked' };
      sc.spymaster = null;
      sc.candidatesDay = state.day - world.spies.spymaster.refreshDays;
    } else say(`Our watchers follow the agent of ${name} for a month. Their contacts are known now, and some of them will not be there next spring.`);
  }
  return true;
}

// Clues for the Spies screen: newest first.
export function cluesOf(state) {
  return [...(spycraftOf(state)?.clues ?? [])].reverse();
}
