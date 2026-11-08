// Spies between the great powers (v2 step 7): each power builds a network
// in one realm at a time, armies of agents standing in a realm's land add
// to it, and a deep enough network pays for sabotage, theft and
// incitement, at the risk of being caught. The lore events of step 8 read
// these networks (the Kingslayers need a deep one in Temeria).
import { makeRng } from '../../../src/sim/rng.js';
import { say, nameOf, clamp, isPower } from './core.js';
import { companyDef } from './goals.js';
import { damage } from './cities.js';

const S = (table) => table.data.diplomacy.spies;

export function newSpies(table) {
  const out = {};
  for (const p of table.data.game.powers) out[p] = { target: null, nets: {} };
  return out;
}

export const netOf = (state, a, b) => Math.round(state.spies?.[a]?.nets[b] ?? 0);

export function setTarget(state, table, a, b) {
  if (!state.spies[a] || !isPower(table, b) || a === b) return { error: 'No such court to spy on.' };
  state.spies[a].target = b;
  return { ok: true };
}

export function monthlySpies(state, table, opinion) {
  const cfg = S(table);
  for (const [a, sp] of Object.entries(state.spies)) {
    if (!state.realms[a]) continue;
    // The AI spies on the power it likes least.
    if (a !== state.player) {
      const others = table.data.game.powers.filter((p) => p !== a && state.realms[p]);
      sp.target = others.sort((x, y) => opinion(a, x) - opinion(a, y))[0] ?? null;
    }
    for (const b of table.data.game.powers) {
      if (b === a) continue;
      let n = sp.nets[b] ?? 0;
      n += b === sp.target ? cfg.grow : -cfg.fade;
      // Agents standing in their land.
      if (state.armies.some((x) => x.owner === a && state.cities[x.region]?.owner === b && x.companies.every((c) => companyDef(table, c.type).spy))) n += cfg.agents;
      sp.nets[b] = clamp(n, 0, 100);
    }
  }
}

// An operation against `b`: spends network; may be caught.
export function spyOp(state, table, a, b, op) {
  const cfg = S(table);
  const o = cfg.ops[op];
  if (!o) return { error: 'No such operation.' };
  const net = state.spies[a]?.nets[b] ?? 0;
  if (net < o.cost) return { error: `Needs a network of ${o.cost} (${Math.round(net)} now).` };
  state.spies[a].nets[b] = net - o.cost;
  const rng = makeRng(state.rng);
  const caught = rng.next() < Math.max(0.05, cfg.catchBase - net / 400);
  let text = '';
  if (op === 'sabotage') {
    const cities = Object.keys(state.cities).filter((id) => state.cities[id].owner === b && !state.cities[id].holder);
    const id = cities.length ? rng.pick(cities) : null;
    state.rng = rng.seed;
    if (id) damage(state, table, id, 30, 3);
    text = id ? `works burned at ${table.board.regions[id].name}` : 'nothing to burn';
  } else if (op === 'steal') {
    const take = Math.min(o.max, Math.max(0, Math.floor(state.realms[b].treasury * o.share)));
    state.realms[b].treasury -= take;
    state.realms[a].treasury += take;
    text = `${take} crowns lifted`;
  } else if (op === 'incite') {
    state.realms[b].unrest = clamp(state.realms[b].unrest + o.unrest, 0, 100);
    text = 'the people stirred';
  }
  state.rng = rng.seed;
  if (caught) {
    const g = (state.diplomacy.grievances[b] ??= {});
    g[a] = (g[a] ?? 0) + cfg.caught;
    say(state, `${nameOf(table, b)} catches ${nameOf(table, a)}'s spies at work (${text}).`);
  } else if (a === state.player) say(state, `Our spies in ${nameOf(table, b)}: ${text}.`);
  else if (b === state.player) say(state, `Mischief in our realm: ${text}. Whose hand, no one can say.`);
  return { ok: true, caught };
}

export function aiSpies(state, table, a) {
  const cfg = S(table);
  const sp = state.spies[a];
  if (!sp?.target) return;
  const rng = makeRng(state.rng);
  const roll = rng.next();
  const op = rng.pick(Object.keys(cfg.ops));
  state.rng = rng.seed;
  if (roll < cfg.aiOps && netOf(state, a, sp.target) >= cfg.ops[op].cost + 20) spyOp(state, table, a, sp.target, op);
}
