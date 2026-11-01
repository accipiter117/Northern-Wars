// The great powers' spies at work on each other (M31 D). Each month each
// power may set its agents to work in a rival's court: one at war with it,
// one it distrusts, and for the Empire once its clock presses, anywhere in
// the North. It uses the deepest work its network allows, by the crown's
// own table, and may be found out by the target's watch. Temeria hears of
// it where it has eyes, and learns who paid where its networks reach.
import { addDispatch, clamp } from './realm.js';
import { sideName, enemiesOf } from './conflict.js';
import { changeTrust } from './diplomacy.js';
import { suzerainOf } from './tiers.js';
import { informed } from './realms.js';
import { spyOwners, netDepth, guardOf, spycraftOf, aiSpend, knowsPlans } from './spies.js';
import { OPERATIONS, strike } from './operations.js';

const TEMERIA = 'temeria';
const OPS = (world) => world.spies?.operations;
const AI = (world) => world.spies?.operations?.ai;

// Whom a power would work against, and how much it wants to.
export function aiTargets(state, world, owner) {
  const c = AI(world);
  const foes = new Set(enemiesOf(state, owner));
  const pressing = state.nilfgaard?.realm === owner && state.nilfgaard.stage !== 'watching';
  const out = [];
  for (const t of Object.keys(state.realms ?? {})) {
    const r = state.realms[t];
    if (t === owner || r.fallen || r.lawless || suzerainOf(state, t) === owner) continue;
    if (netDepth(state, owner, t) < OPS(world).kinds.bribe.at) continue;
    if ((spycraftOf(state).aiCool?.[`${owner}|${t}`] ?? 0) > state.day) continue;
    const trust = state.diplomacy?.trust?.[owner]?.[t] ?? world.diplomacy?.trust?.start ?? 50;
    let w = 0;
    if (foes.has(t)) w = c.atWar;
    else if (trust < c.rivalTrust) w = 1;
    else if (pressing) w = c.empireNorth;
    if (w > 0) out.push({ realm: t, weight: w });
  }
  return out;
}

// The work a power would do there: the deepest its network allows.
function choose(state, world, owner, t, war) {
  const d = netDepth(state, owner, t);
  const realm = state.realms[t];
  const armies = (state.armies ?? []).filter((a) => a.side === t && a.soldiers > 0);
  for (const kind of [...OPERATIONS].reverse()) {
    if (d < OPS(world).kinds[kind].at) continue;
    // Knives only in war: in peace a court is bribed, stirred or burned.
    if (kind === 'assassinate' && !war) continue;
    if (kind === 'assassinate') {
      if (armies.length || (realm.army ?? 0) > 0) return { kind, target: 'commander' };
      if (state.spycraft.nets[t]) return { kind, target: 'spymaster' };
      continue;
    }
    if (kind === 'sabotage') return { kind, target: armies.some((a) => a.siege) ? 'siege' : 'works' };
    if (kind === 'stir') return { kind, target: 'land' };
    const lord = suzerainOf(state, t);
    return { kind, target: realm.vassal && lord && lord !== owner ? 'vassal' : 'court' };
  }
  return null;
}

export function monthlySpyAI(state, world, rng) {
  const c = AI(world);
  const sc = spycraftOf(state);
  if (!c || !sc) return;
  for (const owner of spyOwners(state, world)) {
    if (owner === TEMERIA) continue;
    const targets = aiTargets(state, world, owner);
    if (!targets.length) continue;
    const war = targets.some((x) => x.weight >= c.atWar);
    if (!rng.chance(c.chance * aiSpend(state, world, owner) * (war ? c.atWar : 1))) continue;
    const total = targets.reduce((a, x) => a + x.weight, 0);
    let roll = rng.next() * total;
    const pick = targets.find((x) => (roll -= x.weight) <= 0) ?? targets[targets.length - 1];
    const op = choose(state, world, owner, pick.realm, pick.weight >= c.atWar);
    if (op) work(state, world, rng, owner, pick.realm, op);
  }
}

function work(state, world, rng, owner, t, { kind, target }) {
  const o = OPS(world);
  const k = o.kinds[kind];
  const sc = spycraftOf(state);
  (sc.aiCool ??= {})[`${owner}|${t}`] = state.day + AI(world).cooldown;
  const log = ((sc.aiLog ??= {})[owner] ??= { done: 0, exposed: 0 });
  const by = sideName(world, owner);
  const at = sideName(world, t);
  const hears = informed(state, world, t);
  const risk = clamp(k.risk * (guardOf(state, world, t) / 40), 0.02, o.maxRisk);
  if (rng.chance(risk)) {
    log.exposed++;
    const row = state.spycraft.nets[owner];
    row[t] = clamp((row[t] ?? 0) - o.depthLoss, 0, 100);
    changeTrust(state, world, t, owner, -o.trust);
    if (hears) addDispatch(state, `Agents of ${by} are taken in ${at}, caught at their work. ${at} will not soon forget it.`, 'abroad');
    return;
  }
  log.done++;
  log[kind] = (log[kind] ?? 0) + 1;
  const text = strike(state, world, rng, t, kind, target, k, owner);
  if (!hears) return;
  const who = knowsPlans(state, world, owner) || knowsPlans(state, world, t)
    ? `Our people say the silver came from ${by}.`
    : 'No one says whose silver paid for it.';
  addDispatch(state, `${text.replace(', and no one asks where the rebels found their silver.', '.')} ${who}`, 'abroad');
}
