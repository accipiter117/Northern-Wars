// Battles you can watch (M19). When two hostile armies meet they fight over
// several days: a skirmish where archers and crossbows count most, the
// melee where men-at-arms and knights decide it and levies break first,
// then rout and pursuit, where horse cut down the fleeing. Each round both
// sides lose men and spirit by their strength, troops, ground and weather,
// and a side breaks when its spirit or its numbers run out.
//
// Each battle draws its fortune once, from the same odds as before (strength
// cubed against strength cubed), so over many battles the stronger side wins
// as often as the old single roll said; what the commanders do with their
// reserves, and when they sound the retreat, moves those odds within it.
import { addDispatch, clamp } from './realm.js';
import { seasonOf } from './calendar.js';
import { groundAt } from './combat.js';
import { informed } from './realms.js';
import { TEMERIA, sideName, warBetween, sideIndex, hostile } from './conflict.js';
import {
  armyStrength, armyPosition, refuge, routeTo, halt, glory, nearestPlaceName, disbandArmy,
} from './armies.js';

const B = (world) => world.war.battles;
const KINDS = ['missile', 'heavy', 'levy', 'cav'];

export function battlesOn(world) {
  return !!world.war?.battles;
}

// ---- What an army is made of ----

export function makeupOf(state, world, a) {
  const b = B(world);
  if (a.side !== TEMERIA) return { ...(b.realmMix[a.side] ?? b.standard) };
  const out = { missile: 0, heavy: 0, levy: 0, cav: 0 };
  let named = 0;
  for (const u of a.units ?? []) {
    const c = state.forces?.companies.find((x) => x.id === u.id);
    const kind = b.companyKind[c?.type] ?? 'levy';
    out[kind] += u.men;
    named += u.men;
  }
  // Hired companies fight as men-at-arms; the levy as levies.
  const hired = Math.min(a.soldiers, (a.companies ?? 0) * world.war.raise.company);
  out.heavy += hired;
  out.levy += Math.max(0, a.raised - named - hired);
  const total = KINDS.reduce((s, k) => s + out[k], 0) || 1;
  for (const k of KINDS) out[k] /= total;
  return out;
}

// How well a mix of troops fights in a phase, against a standard army's.
function phaseWeight(world, mix, phase, mods) {
  const w = B(world).weights[phase];
  if (!w) return 1;
  const std = B(world).standard;
  const of = (m) => KINDS.reduce((s, k) => s + m[k] * w[k] * (mods?.[k] ?? 1), 0);
  return of(mix) / of(std);
}

// ---- Starting a battle ----

export function startBattle(state, world, rng, a, b, where) {
  const bt = B(world);
  const season = seasonOf(state.day);
  const w = bt.weather[season] ?? {};
  const weather = rng.chance(w.rain ?? 0) ? 'rain' : rng.chance(w.snow ?? 0) ? 'snow' : 'clear';
  // Fortune, drawn once: logistic with scale a third, so that the stronger
  // side wins with odds strength cubed against strength cubed.
  const u = clamp(rng.next(), 1e-6, 1 - 1e-6);
  const luck = Math.log(u / (1 - u)) / 3;
  const fight = {
    id: (state.nextBattleId = (state.nextBattleId ?? 0) + 1),
    armies: [[a.id], [b.id]], sides: [a.side, b.side], x: Math.round(where.x), y: Math.round(where.y),
    place: nearestPlaceName(world, where), day: state.day, round: 0, phase: 'skirmish', luck, weather, ground: groundAt(world, where.x, where.y),
    spirit: [100, 100], start: [a.soldiers, b.soldiers], lost: [0, 0],
    reserve: [a.soldiers * bt.reserve, b.soldiers * bt.reserve], committed: [false, false],
    defending: [!a.to && !a.path.length, !b.to && !b.path.length],
    mix: [makeupOf(state, world, a), makeupOf(state, world, b)],
    events: [], over: null,
  };
  (state.fights ??= []).push(fight);
  for (const x of [a, b]) {
    x.battle = fight.id;
    x.siege = null;
    x.raiding = null;
    halt(x);
  }
  if (weather === 'rain') note(fight, state, 'Rain on the bowstrings: the archers can barely draw.');
  if (weather === 'snow') note(fight, state, 'Snow drives across the field.');
  const text = `Battle is joined near ${fight.place}: ${a.name} (${sideName(world, a.side)}) against ${b.name} (${sideName(world, b.side)}).`;
  if (a.side === TEMERIA || b.side === TEMERIA) addDispatch(state, text, 'military');
  return fight;
}

function note(f, state, text) {
  f.events.push({ day: state.day, round: f.round, text });
}

export function fightArmies(state, f, i) {
  return f.armies[i].map((id) => state.armies.find((x) => x.id === id)).filter(Boolean);
}

// Men in the line, and in reserve, on each side.
export function lineOf(state, f, i) {
  const men = fightArmies(state, f, i).reduce((s, a) => s + a.soldiers, 0);
  return Math.max(0, men - f.reserve[i]);
}

// A side's strength in the line this round: the armies' strength (stance,
// marshal, morale, arms, quality) for the men in the line, by the phase's
// weight for its troops, the ground and the weather.
function strengthNow(state, world, f, i) {
  const bt = B(world);
  const armies = fightArmies(state, f, i);
  const men = armies.reduce((s, a) => s + a.soldiers, 0);
  if (!men) return 0;
  const full = armies.reduce((s, a) => s + armyStrength(state, world, a, f.defending[i]), 0);
  const line = Math.max(0, men - f.reserve[i]) / men;
  const g = bt.ground[f.ground] ?? {};
  const mods = { ...g };
  if (f.weather === 'rain') mods.missile = (mods.missile ?? 1) * bt.rain.missile;
  let v = full * line * phaseWeight(world, f.mix[i], f.phase === 'rout' ? 'melee' : f.phase, mods);
  if (f.defending[i] && g.defender) v *= g.defender;
  if (f.weather === 'snow') v *= bt.snow.all;
  for (const m of f.mods?.[i] ?? []) v *= m;
  return v;
}

// The odds as the crown's captains reckon them: the strengths in the line
// and the spirit left on each side (they cannot know the day's fortune).
export function battleOdds(state, world, f, i = 0) {
  const s0 = strengthNow(state, world, f, i) * Math.sqrt(Math.max(1, f.spirit[i]));
  const s1 = strengthNow(state, world, f, 1 - i) * Math.sqrt(Math.max(1, f.spirit[1 - i]));
  if (!s0 && !s1) return 0.5;
  return s0 ** 3 / (s0 ** 3 + s1 ** 3);
}

// Before a battle: the odds of one army against another, as the old roll
// would have had them.
export function meetingOdds(state, world, a, b) {
  const sa = armyStrength(state, world, a, !a.to && !a.path.length);
  const sb = armyStrength(state, world, b, !b.to && !b.path.length);
  return sa ** 3 / (sa ** 3 + sb ** 3);
}

// ---- Orders: commit the reserve, sound the retreat ----

export function canBattleOrder(state, world, id, order) {
  const f = (state.fights ?? []).find((x) => x.id === id && !x.over);
  if (!f) return { ok: false, reason: 'The battle is over.' };
  const i = f.sides.indexOf(TEMERIA);
  if (i < 0) return { ok: false, reason: 'Not our battle.' };
  if (order === 'commit') {
    if (f.committed[i] || f.reserve[i] < 1) return { ok: false, reason: 'The reserve is already in the fight.' };
    if (f.phase === 'skirmish') return { ok: false, reason: 'Only once the lines close.' };
    return { ok: true };
  }
  if (order === 'retreat') return { ok: true };
  return { ok: false, reason: 'Unknown order.' };
}

export function battleOrder(state, world, id, order) {
  const f = state.fights.find((x) => x.id === id);
  const i = f.sides.indexOf(TEMERIA);
  if (order === 'commit') commit(state, world, f, i);
  else f.retreat = i;
}

function commit(state, world, f, i) {
  f.committed[i] = true;
  f.reserve[i] = 0;
  note(f, state, `${sideName(world, f.sides[i])} commits its reserve.`);
}

// ---- The day ----

export function stepBattlesDay(state, world, rng) {
  for (const f of [...(state.fights ?? [])]) {
    if (f.over) continue;
    // An army gone (melted away, or its war ended) ends the battle.
    if (!fightArmies(state, f, 0).length || !fightArmies(state, f, 1).length || !hostile(state, f.sides[0], f.sides[1])) {
      end(state, world, rng, f, null);
      continue;
    }
    round(state, world, rng, f);
  }
  // Finished battles stay a few days for the map to show the rout.
  state.fights = (state.fights ?? []).filter((f) => !f.over || state.day - f.over.day < 3);
}

function round(state, world, rng, f) {
  const bt = B(world);
  f.round += 1;
  if (f.phase === 'skirmish' && f.round > bt.skirmishRounds) {
    f.phase = 'melee';
    events(state, world, rng, f, 'close');
  }
  reinforce(state, world, f);
  if (f.phase === 'melee') aiOrders(state, world, f);
  if (f.retreat !== undefined && f.retreat !== null) return withdraw(state, world, rng, f, f.retreat);
  const s = [strengthNow(state, world, f, 0), strengthNow(state, world, f, 1)];
  // Fortune favours one side for the whole battle.
  const fortune = [Math.exp(f.luck / 2), Math.exp(-f.luck / 2)];
  const e = [s[0] * fortune[0], s[1] * fortune[1]];
  const m = bt.morale[f.phase];
  const c = bt.casualties[f.phase];
  for (const i of [0, 1]) {
    const ratio = e[1 - i] / Math.max(1, e[i]);
    f.spirit[i] -= m * ratio * (1 + bt.morale.noise * gauss(rng));
    const line = lineOf(state, f, i);
    const dead = line * c * Math.sqrt(ratio) * Math.max(0.2, 1 + bt.casualties.noise * gauss(rng));
    kill(state, f, i, dead);
  }
  if (f.phase === 'melee') events(state, world, rng, f, 'melee');
  else events(state, world, rng, f, 'skirmish');
  // A side breaks when its spirit is spent, or too few are left standing.
  const broken = [0, 1].filter((i) => f.spirit[i] <= 0 || lineOf(state, f, i) + f.reserve[i] <= f.start[i] * bt.breakMen);
  if (broken.length || f.round >= bt.maxRounds) {
    const loser = broken.length === 1 ? broken[0] : (f.spirit[0] - f.spirit[1] <= 0 ? 0 : 1);
    return rout(state, world, rng, f, loser);
  }
}

function gauss(rng) {
  let u = 0;
  let v = 0;
  while (!u) u = rng.next();
  while (!v) v = rng.next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Men lost from a side, shared among its armies by their size.
function kill(state, f, i, dead) {
  const armies = fightArmies(state, f, i);
  const men = armies.reduce((s, a) => s + a.soldiers, 0);
  if (!men) return;
  const d = Math.min(dead, men);
  for (const a of armies) {
    const share = (d * a.soldiers) / men;
    a.soldiers -= share;
    for (const u of a.units ?? []) u.men = Math.max(0, u.men - (share * u.men) / Math.max(1, a.raised));
  }
  f.lost[i] += d;
  f.reserve[i] = Math.min(f.reserve[i], Math.max(0, men - d));
}

// Captains, foreign and our own marshals alike unless the crown has given
// the order itself, commit their reserve when the lines close if bold, or
// when the day turns against them; a cautious captain losing badly sounds
// the retreat.
function aiOrders(state, world, f) {
  const bt = B(world);
  for (const i of [0, 1]) {
    const lead = fightArmies(state, f, i)[0];
    const bold = lead?.stance === 'bold';
    if (!f.committed[i] && f.reserve[i] > 0 && (bold || f.spirit[i] < bt.commitAt)) commit(state, world, f, i);
    if (!bold && f.spirit[i] < bt.aiRetreatAt && battleOdds(state, world, f, i) < 0.25 && f.retreat == null) f.retreat = i;
  }
}

// Another army of either side within reach marches to the sound of the guns.
function reinforce(state, world, f) {
  const r = B(world).events.reinforce.range;
  for (const a of state.armies) {
    if (a.battle || (a.routed ?? 0) > state.day) continue;
    const i = f.sides.indexOf(a.side);
    if (i < 0 || !hostile(state, a.side, f.sides[1 - i])) continue;
    const p = armyPosition(world, a);
    if (Math.hypot(p.x - f.x, p.y - f.y) > r) continue;
    f.armies[i].push(a.id);
    f.start[i] += a.soldiers;
    a.battle = f.id;
    a.siege = null;
    a.raiding = null;
    halt(a);
    note(f, state, `${a.name} marches to the sound of the fighting and joins the battle.`);
  }
}

// One short line for each turn of the battle worth telling.
function events(state, world, rng, f, when) {
  const ev = B(world).events;
  const name = (i) => sideName(world, f.sides[i]);
  for (const i of [0, 1]) {
    const me = f.mix[i];
    const them = f.mix[1 - i];
    if (when === 'skirmish' && f.round === 1 && me.missile >= ev.volley.missileAt && them.cav >= ev.volley.cavAt && f.weather !== 'rain' && rng.chance(ev.volley.chance)) {
      f.spirit[1 - i] -= ev.volley.morale;
      note(f, state, `A volley from ${name(i)}'s archers breaks a charge of ${name(1 - i)}'s horse.`);
    }
    if (when === 'close' && me.cav >= ev.charge.cavAt && f.ground !== 'forest' && f.ground !== 'marsh' && rng.chance(ev.charge.chance)) {
      f.spirit[1 - i] -= ev.charge.morale;
      note(f, state, `${name(i)}'s horse charge home as the lines close.`);
    }
    if (when === 'melee') {
      const lead = fightArmies(state, f, i)[0];
      const skill = lead?.marshal ? world.war.marshals[lead.marshal]?.skill ?? 1 : 1;
      if (skill >= ev.flank.skillAt && !f.flanked?.[i] && rng.chance(ev.flank.chance)) {
        (f.flanked ??= [false, false])[i] = true;
        f.spirit[1 - i] -= ev.flank.morale;
        note(f, state, `${world.war.marshals[lead.marshal].short ?? world.war.marshals[lead.marshal].name} turns ${name(1 - i)}'s flank.`);
      }
      if (me.levy >= ev.levies.levyAt && f.spirit[i] < ev.levies.below && !f.leviesRan?.[i] && rng.chance(ev.levies.chance)) {
        (f.leviesRan ??= [false, false])[i] = true;
        f.spirit[i] -= ev.levies.morale;
        note(f, state, `The levies of ${name(i)} break and run.`);
      }
      if (rng.chance(ev.commander.chance) && !f.commander?.[i]) {
        (f.commander ??= [null, null])[i] = rng.chance(0.3) ? 'killed' : 'wounded';
        const killed = f.commander[i] === 'killed';
        f.spirit[i] -= killed ? ev.commander.killed : ev.commander.wounded;
        const who = lead?.marshal ? world.war.marshals[lead.marshal].short ?? world.war.marshals[lead.marshal].name : `${name(i)}'s commander`;
        note(f, state, `${who} is ${killed ? 'killed' : 'wounded'} in the press.`);
        if (killed && lead) lead.marshal = null;
      }
    }
  }
}

// ---- Endings ----

// One side breaks: the other's horse ride the fleeing down for a day or two.
function rout(state, world, rng, f, loser) {
  const bt = B(world);
  const winner = 1 - loser;
  f.phase = 'rout';
  const cav = f.mix[winner].cav;
  const share = bt.pursuit.base + bt.pursuit.cavalry * cav;
  const men = fightArmies(state, f, loser).reduce((s, a) => s + a.soldiers, 0);
  kill(state, f, loser, men * share);
  kill(state, f, winner, fightArmies(state, f, winner).reduce((s, a) => s + a.soldiers, 0) * bt.pursuit.winner);
  note(f, state, `${sideName(world, f.sides[loser])} breaks; ${cav >= 0.1 ? `${sideName(world, f.sides[winner])}'s horse ride the fleeing down` : 'the victors pursue them from the field'}.`);
  // A commander caught in the rout is held for ransom.
  const lead = fightArmies(state, f, loser)[0];
  if (lead && rng.chance(bt.events.commander.captured) && f.commander?.[loser] !== 'killed') {
    const marshal = lead.marshal;
    (state.captives ??= []).push({ side: f.sides[loser], by: f.sides[winner], marshal, day: state.day, ransom: ransomOf(world, f.sides[loser], marshal) });
    note(f, state, `${marshal ? world.war.marshals[marshal].short ?? world.war.marshals[marshal].name : `${sideName(world, f.sides[loser])}'s commander`} is taken prisoner.`);
    if (marshal) lead.marshal = null;
  }
  end(state, world, rng, f, winner);
}

export function ransomOf(world, side, marshal) {
  const r = B(world).ransom;
  return Math.round(marshal ? (world.war.marshals[marshal]?.skill ?? 1) * r.perSkill : r.foreign);
}

// A side sounds the retreat: it gives up the field, losing what the
// withdrawal costs in the phase it is in and to the enemy's horse.
function withdraw(state, world, rng, f, i) {
  const r = B(world).retreat;
  const men = fightArmies(state, f, i).reduce((s, a) => s + a.soldiers, 0);
  kill(state, f, i, men * (r[f.phase] ?? r.melee) * (1 + f.mix[1 - i].cav * r.cavalry));
  note(f, state, `${sideName(world, f.sides[i])} sounds the retreat and leaves the field in good order.`);
  f.withdrew = i;
  end(state, world, rng, f, 1 - i);
}

function end(state, world, rng, f, winner) {
  const bt = world.war.battle;
  f.over = { day: state.day, winner };
  for (const i of [0, 1]) for (const a of fightArmies(state, f, i)) a.battle = null;
  if (winner === null) return;
  const loser = 1 - winner;
  const wins = fightArmies(state, f, winner);
  const loses = fightArmies(state, f, loser);
  const orderly = f.withdrew === loser;
  for (const a of wins) {
    a.morale = clamp(a.morale + bt.moraleWin, 0, 100);
    a.wins = (a.wins ?? 0) + 1;
    a.fought = state.day;
  }
  for (const a of loses) {
    a.morale = clamp(a.morale - (orderly ? B(world).retreat.morale : bt.moraleLoss), 0, 100);
    a.fought = state.day;
    a.retreating = true;
    a.routed = state.day + bt.routedDays;
    if (!routeTo(world, a, refuge(state, world, a))) halt(a);
  }
  const war = warBetween(state, f.sides[winner], f.sides[loser]);
  const [dw, dl] = [f.lost[winner], f.lost[loser]];
  if (war) {
    war.points[sideIndex(war, f.sides[winner])] += clamp(Math.round((dl + dw) / 80) * (orderly ? 0.5 : 1), 1, 15);
    war.lost[sideIndex(war, f.sides[winner])] += dw;
    war.lost[sideIndex(war, f.sides[loser])] += dl;
  }
  state.battles.push({ day: state.day, x: f.x, y: f.y, winner: f.sides[winner], loser: f.sides[loser], dead: [Math.round(dw), Math.round(dl)], rounds: f.round, events: f.events.map((e) => e.text) });
  if (state.battles.length > 30) state.battles.shift();
  // The Chronicle's report: the sides, the dead and the main turns of it.
  const names = [sideName(world, f.sides[winner]), sideName(world, f.sides[loser])];
  const turns = f.events.slice(0, 4).map((e) => e.text).join(' ');
  const text = `The battle near ${f.place} (${f.round} days): ${names[0]} ${orderly ? 'holds the field as' : 'routs'} ${names[1]}${orderly ? ' withdraws' : ''}. ${Math.round(dl)} of ${names[1]} fell or fled, ${Math.round(dw)} of ${names[0]}. ${turns}`.trim();
  const ours = f.sides.includes(TEMERIA);
  if (ours) {
    glory(state, world, f.sides[winner] === TEMERIA ? 'battleWon' : 'battleLost', (f.sides[winner] === TEMERIA ? wins : loses)[0]);
    addDispatch(state, text, 'military');
  } else if (informed(state, world, f.sides[0]) || informed(state, world, f.sides[1])) addDispatch(state, text, 'abroad');
  for (const a of [...loses]) if (a.soldiers < world.war.minArmy) disbandArmy(state, world, a, true);
}
