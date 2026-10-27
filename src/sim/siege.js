// Sieges you can watch (M19). An army camps round a town: its siege works
// wear the walls down day by day (timber round towns, stone round cities and
// castles, none round a village), the defenders eat through their stores,
// sickness and desertion thin the camp, the garrison sallies out, and a
// relief army may come. Starving or broken, the defenders offer to march out
// on terms and leave the town intact; or the besiegers storm the walls at
// odds the crown is shown.
import { addDispatch, clamp } from './realm.js';
import { informed } from './realms.js';
import { foodNeed } from './economy.js';
import { seasonOf } from './calendar.js';
import { TEMERIA, placeOf, peopleAt, hasWalls, sideName, hostile, warBetween, sideIndex } from './conflict.js';
import { armyStrength, armyPosition, placeDefence, capture } from './armies.js';
import { damagePlace, outside } from './works.js';

const S = (world) => world.war.sieges;

export function siegesOn(world) {
  return !!world.war?.sieges;
}

// The walls of a place, out of 100: none round a village, timber round a
// town, stone round a city or a castle, and more where walls were built.
export function wallsOf(state, world, id) {
  const s = S(world);
  const type = world.byId[id].type;
  return Math.min(100, (s.walls[type] ?? 0) + (hasWalls(state, world, id) ? s.walls.built : 0));
}

// Days of food behind the walls: a crown town's own stores against what its
// people and garrison eat; abroad, by its kind and fortunes.
function foodDays(state, world, id) {
  const home = state.settlements[id];
  if (home) {
    const need = foodNeed(world, home, seasonOf(state.day));
    return need > 0 ? Math.round(home.stock.food / need) : 90;
  }
  const p = placeOf(state, world, id);
  return Math.round((S(world).food[world.byId[id].type] ?? 60) * (0.5 + p.prosperity / 100));
}

function newSiege(state, world, a) {
  const walls = wallsOf(state, world, a.at);
  const food = foodDays(state, world, a.at);
  return { at: a.at, days: 0, walls, wallsMax: walls, food, foodMax: Math.max(1, food), sick: 0, sallies: 0, terms: null, refused: 0, hold: !!a.starve, progress: 0, events: [] };
}

function note(state, sg, text) {
  sg.events.push({ day: state.day, text });
  if (sg.events.length > 8) sg.events.shift();
}

// The defenders' strength on the walls: the garrison, the townsfolk and any
// companies, behind what is left of the walls.
export function defenceNow(state, world, a) {
  const sg = a.siege;
  const base = placeDefence(state, world, a.at, false);
  const walls = sg ? sg.walls : wallsOf(state, world, a.at);
  return base * (1 + (walls / 100) * (S(world).storm.walls - 1 + world.war.battle.wallsDefence - 1));
}

// What a storm would bring: the odds, and the men it would likely cost.
export function stormOdds(state, world, a) {
  const st = S(world).storm;
  const mine = armyStrength(state, world, a);
  const theirs = defenceNow(state, world, a);
  const odds = mine ** 3 / (mine ** 3 + theirs ** 3);
  const walls = (a.siege?.walls ?? wallsOf(state, world, a.at)) / 100;
  const loss = Math.min(a.soldiers * 0.5, theirs * ((st.loss[0] + st.loss[1]) / 2) * (1 + walls));
  return { odds, loss: Math.round(loss), failLoss: Math.round(Math.min(a.soldiers * 0.6, loss * st.fail)) };
}

// ---- The day ----

export function siegeDay(state, world, rng, a, owner) {
  const sg = S(world);
  const p = placeOf(state, world, a.at);
  const name = world.byId[a.at].name;
  const fresh = !a.siege;
  if (fresh) {
    // A siege broken off and taken up again carries on where it was.
    a.siege = a.lastSiege?.at === a.at ? { ...a.lastSiege } : newSiege(state, world, a);
    if (p.garrison >= 5 && a.siege.days === 0) {
      const text = `${a.name} (${sideName(world, a.side)}) lays siege to ${name}: ${a.siege.wallsMax ? `${a.siege.wallsMax >= 80 ? 'stone' : 'timber'} walls` : 'no walls to speak of'}, food for about ${a.siege.food} days.`;
      if (a.side === TEMERIA || owner === TEMERIA) addDispatch(state, text, 'military');
      else if (informed(state, world, a.side) || informed(state, world, owner)) addDispatch(state, text, 'abroad');
    }
  }
  const s = a.siege;
  if (placeDefence(state, world, a.at) < 5) return capture(state, world, rng, a, a.at, owner, 'open');
  s.days += 1;
  // A village or any place without walls falls to an army that holds it a
  // day unopposed.
  if (!s.wallsMax && s.days > 1 && armyStrength(state, world, a) >= placeDefence(state, world, a.at)) {
    a.soldiers -= Math.min(a.soldiers * 0.15, p.garrison * 0.5);
    return capture(state, world, rng, a, a.at, owner, 'open');
  }
  // Siege works wear the walls down.
  if (s.walls > 0) {
    const before = s.walls;
    // Stone holds out longer than timber.
    s.walls = Math.max(0, s.walls - sg.wear * Math.sqrt(a.soldiers / sg.wearMen) * (s.wallsMax >= 80 ? sg.stoneWear : 1));
    if (before > 0 && s.walls === 0) note(state, s, `The walls of ${name} are breached.`);
    // The town's own walls stand as the siege leaves them (M20).
    if (p.buildings?.includes('walls') && s.wallsMax > 0) (p.cond ??= {}).walls = Math.min(p.cond.walls ?? 100, Math.round((100 * s.walls) / s.wallsMax));
  }
  // The camp lives off the fields round the walls.
  const sw = world.works?.siege;
  if (sw && rng.chance(sw.chance)) damagePlace(state, world, rng, a.at, { count: 1, amount: sw.amount, why: 'Trampled by the siege camp', pick: outside });
  // The stores run down; then the garrison starves.
  const relief = reliefNear(state, world, a);
  if (relief && !s.reliefSeen) {
    s.reliefSeen = relief.id;
    note(state, s, `${relief.name} is marching to relieve ${name}.`);
  }
  s.food -= 1;
  if (s.food <= 0) {
    p.garrison = Math.max(0, p.garrison - Math.max(1, p.garrison * sg.starving));
    if (!s.starving) note(state, s, `${name}'s stores are empty. The garrison starves.`);
    s.starving = true;
  }
  // The camp sickens with time, and men slip away when unpaid.
  const sick = sg.sickness * (1 + s.days / sg.sicknessRise);
  const unpaid = a.side === TEMERIA ? state.unpaid : (state.realms[a.side]?.treasury ?? 0) < 0;
  const gone = a.soldiers * (sick + (unpaid ? sg.desertion : 0));
  a.soldiers -= gone;
  s.sick += gone;
  // The garrison sallies out against a thin camp.
  if (p.garrison >= a.soldiers * sg.sally.share && rng.chance(sg.sally.chance)) {
    const hurt = a.soldiers * sg.sally.attackers;
    a.soldiers -= hurt;
    p.garrison = Math.max(0, p.garrison - p.garrison * sg.sally.defenders);
    s.sallies += 1;
    note(state, s, `The garrison of ${name} sallies out and burns part of the siege works; ${Math.round(hurt)} besiegers fall.`);
    s.walls = Math.min(s.wallsMax, s.walls + 3);
  }
  s.progress = Math.round(100 * (1 - Math.max(0, s.food) / s.foodMax));
  // Starving or broken, the defenders offer terms.
  if (!s.terms && s.starving && state.day >= s.refused && p.garrison > 0) {
    s.terms = { day: state.day };
    note(state, s, `${name} offers to surrender on terms: the garrison marches out, the town is spared.`);
    if (a.side === TEMERIA) {
      const war = warBetween(state, TEMERIA, owner);
      if (war) state.warDecisions.push({ id: state.nextWarDecisionId++, kind: 'terms', war: war.id, army: a.id, town: a.at, realm: owner, day: state.day });
    } else {
      return capture(state, world, rng, a, a.at, owner, 'terms');
    }
  }
  if (p.garrison < 1) return capture(state, world, rng, a, a.at, owner, 'starved');
  // A captain storms when the odds are good enough for his stance; the
  // crown's marshals likewise, unless told to starve them out.
  if (!s.hold) {
    const o = stormOdds(state, world, a);
    const at = a.stance === 'bold' ? sg.storm.boldAt : sg.storm.cautiousAt;
    if (o.odds >= at) return storm(state, world, rng, a, owner);
  }
  a.lastSiege = { ...s, events: [...s.events] };
}

function reliefNear(state, world, a) {
  const at = world.byId[a.at];
  for (const b of state.armies) {
    if (!hostile(state, a.side, b.side) || b.battle) continue;
    const p = armyPosition(world, b);
    if (Math.hypot(p.x - at.x, p.y - at.y) <= S(world).relief) return b;
  }
  return null;
}

// Storming the walls: taken at the shown odds, or thrown back bloodily.
export function storm(state, world, rng, a, owner) {
  const st = S(world).storm;
  const o = stormOdds(state, world, a);
  const p = placeOf(state, world, a.at);
  const name = world.byId[a.at].name;
  const war = warBetween(state, a.side, owner);
  if (rng.next() < o.odds) {
    const dead = Math.min(a.soldiers * 0.4, o.loss * (st.loss[0] + rng.next() * (st.loss[1] - st.loss[0])) / ((st.loss[0] + st.loss[1]) / 2));
    a.soldiers -= dead;
    if (war) {
      war.lost[sideIndex(war, a.side)] += dead;
      war.lost[sideIndex(war, owner)] += p.garrison;
    }
    return capture(state, world, rng, a, a.at, owner, 'storm');
  }
  a.soldiers -= o.failLoss;
  a.morale = clamp(a.morale - 20, 0, 100);
  if (war) war.lost[sideIndex(war, a.side)] += o.failLoss;
  if (a.siege) {
    a.siege.hold = true;
    note(state, a.siege, `The storm of ${name} is thrown back from the walls: ${o.failLoss} fall.`);
  }
  const text = `${a.name} (${sideName(world, a.side)}) storms ${name} and is thrown back, ${o.failLoss} men lost.`;
  if (a.side === TEMERIA || owner === TEMERIA) addDispatch(state, text, 'military');
  return null;
}

// ---- The crown's orders at a siege ----

export function canSiegeOrder(state, world, a, order) {
  if (!a || a.side !== TEMERIA || !a.siege) return { ok: false, reason: 'Not besieging anything.' };
  if (order === 'storm' || order === 'starve' || order === 'lift') return { ok: true };
  return { ok: false, reason: 'Unknown order.' };
}

export function siegeOrder(state, world, rng, a, order) {
  const owner = state.settlements[a.at]?.occupier ?? (state.realms[world.realmOf[a.at]]?.settlements[a.at]?.owner ?? world.realmOf[a.at]);
  if (order === 'storm') return storm(state, world, rng, a, owner);
  if (order === 'starve') {
    a.siege.hold = true;
    a.starve = true;
    addDispatch(state, `${a.name} settles in to starve ${world.byId[a.at].name} out.`, 'military');
  }
  return null;
}

// Terms offered to the crown's besiegers: accepted, the garrison marches
// out and the town is taken intact; refused, the siege goes on.
export function answerTerms(state, world, rng, d, accept) {
  const a = state.armies.find((x) => x.id === d.army);
  if (!a?.siege || a.at !== d.town) return;
  if (accept) capture(state, world, rng, a, a.at, d.realm, 'terms');
  else {
    a.siege.terms = null;
    a.siege.refused = state.day + 30;
    addDispatch(state, `The crown refuses ${world.byId[d.town].name}'s terms. The siege goes on.`, 'military');
  }
}
