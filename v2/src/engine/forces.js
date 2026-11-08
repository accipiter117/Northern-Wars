// Fleets and commanders: sea lanes between the coastal provinces, fleets
// built at ports and sailing armies from one to another, battles at sea;
// and the kings and marshals who lead armies, each with a skill, wounded
// when beaten. Pure; the landing itself (a battle or a siege) is game.js's.
import { makeRng } from '../../../src/sim/rng.js';
import { say, nameOf, controller, atWar, payCost, isPower } from './core.js';

const F = (table) => table.data.forces;

// ---- The sea ----

export function buildSea(world, board, data) {
  const coastal = Object.values(board.regions)
    .filter((r) => r.members.some((m) => (world.spaces?.[m] ?? []).some((s) => s.kind === 'coast')))
    .map((r) => r.id);
  const lanes = {};
  for (const a of coastal) lanes[a] = [];
  for (const a of coastal) {
    for (const b of coastal) {
      if (a >= b) continue;
      const ra = board.regions[a];
      const rb = board.regions[b];
      const d = Math.hypot(ra.x - rb.x, ra.y - rb.y);
      if (d > data.sea.lane) continue;
      const cost = Math.max(1, Math.ceil(d / data.sea.perPoint));
      lanes[a].push({ to: b, cost });
      lanes[b].push({ to: a, cost });
    }
  }
  return { coastal: new Set(coastal), lanes };
}

export const isCoastal = (table, id) => table.sea.coastal.has(id);

export function fleetPoints(table, winter) {
  const p = F(table).sea.points;
  return winter ? Math.floor(p / 2) : p;
}

// Ports a fleet can reach this month, with their cost.
export function seaReach(table, fleet) {
  const best = { [fleet.region]: 0 };
  const queue = [fleet.region];
  while (queue.length) {
    queue.sort((x, y) => best[x] - best[y]);
    const at = queue.shift();
    for (const l of table.sea.lanes[at] ?? []) {
      const c = best[at] + l.cost;
      if (c > fleet.points || (best[l.to] !== undefined && best[l.to] <= c)) continue;
      best[l.to] = c;
      queue.push(l.to);
    }
  }
  delete best[fleet.region];
  return best;
}

// ---- Fleets ----

export function newFleets(state, table) {
  const out = [];
  for (const [rid, n] of Object.entries(F(table).fleet.start)) {
    if (!state.realms[rid]) continue;
    const ports = [...table.sea.coastal].filter((id) => state.cities[id].owner === rid)
      .sort((a, b) => table.board.regions[b].capital - table.board.regions[a].capital);
    for (let i = 0; i < n && ports.length; i++) out.push({ id: i + 1 + out.length, owner: rid, region: ports[i % ports.length], points: 0 });
  }
  return out;
}

export const fleetsAt = (state, region, rid = null) => (state.fleets ?? []).filter((f) => f.region === region && (!rid || f.owner === rid));

// May `rid` build a fleet at this port: its own, or its vassal's.
export function mayBuildFleet(state, table, rid, region) {
  const c = state.cities[region];
  if (!c || !isCoastal(table, region) || c.holder) return false;
  return c.owner === rid || state.minors?.[c.owner]?.suzerain === rid;
}

export function buildFleet(state, table, rid, region, { crowns = false } = {}) {
  if (!mayBuildFleet(state, table, rid, region)) return { error: 'Only at a port of ours, or of a vassal.' };
  const paid = payCost(state, table, rid, F(table).fleet.cost, crowns);
  if (paid.error) return paid;
  state.nextFleet = (state.nextFleet ?? 100) + 1;
  state.fleets.push({ id: state.nextFleet, owner: rid, region, points: 0 });
  say(state, `${nameOf(table, rid)} launches a fleet at ${table.board.regions[region].name}.`);
  return { ok: true, fleet: state.nextFleet };
}

// A fight at sea in a port: odds by numbers; the loser's ships are sunk.
export function seaBattle(state, table, attacker, region) {
  const foes = fleetsAt(state, region).filter((f) => atWar(state, f.owner, attacker.owner));
  if (!foes.length) return true;
  const ours = fleetsAt(state, attacker.region, attacker.owner).length;
  const rng = makeRng(state.rng);
  const won = rng.next() < ours / (ours + foes.length);
  state.rng = rng.seed;
  const place = table.board.regions[region].name;
  if (won) {
    state.fleets = state.fleets.filter((f) => !foes.includes(f));
    say(state, `Off ${place}, ${nameOf(table, attacker.owner)}'s ships sink ${nameOf(table, foes[0].owner)}'s.`);
  } else {
    state.fleets = state.fleets.filter((f) => f !== attacker);
    say(state, `Off ${place}, ${nameOf(table, foes[0].owner)}'s ships sink ${nameOf(table, attacker.owner)}'s.`);
  }
  return won;
}

// ---- Commanders ----

export function newCommanders(table) {
  const out = {};
  for (const [rid, list] of Object.entries(F(table).commanders)) {
    for (const c of list) if (!c.from) out[c.id] = { owner: rid, army: null, wounded: null };
  }
  return out;
}

export const commanderDef = (table, id) => {
  for (const list of Object.values(F(table).commanders)) {
    const c = list.find((x) => x.id === id);
    if (c) return c;
  }
  return null;
};

export const commanderOf = (state, armyId) => Object.keys(state.commanders ?? {}).find((id) => state.commanders[id].army === armyId) ?? null;

// The skill an army's commander brings to its battles.
export function armyBonus(state, table, armyId) {
  const id = commanderOf(state, armyId);
  return id ? { ...commanderDef(table, id).skill } : {};
}

// Give a commander an army: from court to any army of ours on our own land,
// or from one army to another in the same place.
export function assignCommander(state, table, cid, armyId) {
  const c = state.commanders?.[cid];
  const army = state.armies.find((a) => a.id === armyId);
  if (!c || !army || c.owner !== army.owner) return { error: 'Not ours to command.' };
  if (c.wounded) return { error: 'Still recovering from wounds.' };
  if (c.army) {
    const from = state.armies.find((a) => a.id === c.army);
    if (from && from.region !== army.region) return { error: 'Only to an army in the same place.' };
  } else if (controller(state, army.region) !== army.owner) return { error: 'From court, only to an army on our own land.' };
  const other = commanderOf(state, armyId);
  if (other) state.commanders[other].army = c.army ?? null;
  c.army = armyId;
  return { ok: true };
}

export function recallCommander(state, cid) {
  const c = state.commanders?.[cid];
  if (!c) return { error: 'No such commander.' };
  c.army = null;
  return { ok: true };
}

// The losers' commanders are wounded and out of the field a while.
export function woundCommanders(state, table, armyIds) {
  for (const [id, c] of Object.entries(state.commanders ?? {})) {
    if (!armyIds.includes(c.army)) continue;
    c.army = null;
    c.wounded = state.turn + F(table).wounded;
    say(state, `${commanderDef(table, id).name} is wounded, and carried from the field.`);
  }
}

// The month: the wounded recover, new commanders come with the chapter,
// commanders whose army is gone return to court, and the AI's lead its
// largest army.
export function monthlyCommanders(state, table, chapterIndex, chapterIdOf) {
  const cs = (state.commanders ??= {});
  for (const [rid, list] of Object.entries(F(table).commanders)) {
    for (const def of list) {
      if (cs[def.id] || !def.from || chapterIdOf(def.from) > chapterIndex || !state.realms[rid]) continue;
      cs[def.id] = { owner: rid, army: null, wounded: null };
      if (rid === state.player) say(state, `${def.name} comes to court, ready to command.`);
    }
  }
  for (const c of Object.values(cs)) {
    if (c.wounded !== null && c.wounded <= state.turn) c.wounded = null;
    if (c.army && !state.armies.some((a) => a.id === c.army)) c.army = null;
  }
  for (const [id, c] of Object.entries(cs)) {
    if (c.owner === state.player || c.army || c.wounded || !isPower(table, c.owner)) continue;
    const armies = state.armies.filter((a) => a.owner === c.owner && !commanderOf(state, a.id) && controller(state, a.region) === c.owner)
      .sort((a, b) => b.companies.length - a.companies.length);
    if (armies[0]) cs[id].army = armies[0].id;
  }
}
