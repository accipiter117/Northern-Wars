// Things the crown can order. Each action is checked, then applied to a copy
// of the state, so the UI can ask "could I?" before it asks "do it".
import { realmStock } from './economy.js';
import { addDispatch } from './realm.js';
import { canDecree, decree } from './laws.js';
import { canSetStance, setStance, resolveEnvoy } from './neighbours.js';
import { resolvePetition } from './petitions.js';
import { canHouseAction, houseAction, resolveDemand } from './houses.js';
import { canSetGarrison, canAddPatrol, addPatrol, resolveEvent } from './military.js';
import { canOpenEmbassy, openEmbassy, closeEmbassy, canSendSpy, sendSpy } from './realms.js';
import { makeRng } from './rng.js';
import { canRaise, raiseArmy, canOrder, orderArmy, disbandArmy } from './armies.js';
import { canDeclare, declareWar, canMakePeace, offerPeace, withdraw, resolveWarDecision } from './war.js';
import { TEMERIA, sideIndex } from './conflict.js';
import { addDispatch as note } from './realm.js';

const say = (state, text) => addDispatch(state, text, 'treasury');

const MATERIALS = ['timber', 'stone', 'iron'];

// Why a building can or cannot be raised here, in words fit for a button.
export function canBuild(state, world, settlementId, buildingId) {
  const b = world.buildings[buildingId];
  const s = state.settlements[settlementId];
  const type = world.byId[settlementId]?.type;
  if (!b || !s) return { ok: false, reason: 'Unknown building.' };
  if (s.occupier) return { ok: false, reason: 'The enemy holds it.' };
  if (!b.types.includes(type)) return { ok: false, reason: `Not for a ${type}.`, hidden: true };
  if (b.needs && s.production !== b.needs) return { ok: false, reason: `Only where ${b.needs} is worked.`, hidden: true };
  if (b.needsBorder && !world.borderland[settlementId]) return { ok: false, reason: 'Only near a border.', hidden: true };
  if (s.buildings.includes(buildingId)) return { ok: false, reason: 'Already built.', hidden: true };
  if (s.construction) return { ok: false, reason: 'Workers are busy on another project.' };
  const stock = realmStock(state);
  for (const m of MATERIALS) {
    if ((b.cost[m] ?? 0) > stock[m]) return { ok: false, reason: `The realm lacks ${m}.` };
  }
  const limit = world.economy.debt.creditLimit;
  if (state.treasury - (b.cost.coin ?? 0) < -limit) return { ok: false, reason: 'The bankers will not lend that much.' };
  return { ok: true, borrow: state.treasury - (b.cost.coin ?? 0) < 0 };
}

export function applyAction(state, world, action) {
  if (action.type === 'build') {
    const check = canBuild(state, world, action.settlement, action.building);
    if (!check.ok) return { state, error: check.reason };
    const next = structuredClone(state);
    startBuilding(next, world, action.settlement, action.building);
    return { state: next };
  }
  if (action.type === 'law') {
    const check = canDecree(state, world, action.law, action.option);
    if (!check.ok) return { state, error: check.reason };
    const next = structuredClone(state);
    decree(next, world, action.law, action.option);
    return { state: next };
  }
  if (action.type === 'stance') {
    const check = canSetStance(state, world, action.realm, action.stance);
    if (!check.ok) return { state, error: check.reason };
    const next = structuredClone(state);
    setStance(next, world, action.realm, action.stance);
    return { state: next };
  }
  if (action.type === 'envoy') {
    const next = structuredClone(state);
    if (!resolveEnvoy(next, world, action.id, action.choice)) return { state, error: 'That envoy has gone.' };
    return { state: next };
  }
  if (action.type === 'petition') {
    const next = structuredClone(state);
    if (!resolvePetition(next, world, action.id, action.choice)) return { state, error: 'That petition has been settled.' };
    return { state: next };
  }
  if (action.type === 'house') {
    const check = canHouseAction(state, world, action.house, action.kind, action.settlement);
    if (!check.ok) return { state, error: check.reason };
    const next = structuredClone(state);
    houseAction(next, world, action.house, action.kind, action.settlement);
    return { state: next };
  }
  if (action.type === 'demand') {
    const next = structuredClone(state);
    if (!resolveDemand(next, world, action.id, action.choice)) return { state, error: 'That demand has been settled.' };
    return { state: next };
  }
  if (action.type === 'garrison') {
    const check = canSetGarrison(state, world, action.settlement, action.level);
    if (!check.ok) return { state, error: check.reason };
    const next = structuredClone(state);
    next.garrisonLevel[action.settlement] = action.level;
    note(next, `${world.byId[action.settlement].name} is to be held with a ${world.military.garrisonLevels[action.level].name.toLowerCase()} garrison.`, 'military');
    return { state: next };
  }
  if (action.type === 'patrol') {
    const check = canAddPatrol(state, world, action.from, action.to);
    if (!check.ok) return { state, error: check.reason };
    const next = structuredClone(state);
    addPatrol(next, world, action.from, action.to);
    return { state: next };
  }
  if (action.type === 'unpatrol') {
    if (!state.patrols.some((p) => p.id === action.id)) return { state, error: 'No such patrol.' };
    const next = structuredClone(state);
    next.patrols = next.patrols.filter((p) => p.id !== action.id);
    return { state: next };
  }
  if (action.type === 'embassy') {
    if (action.close) {
      if (!state.embassies[action.realm]) return { state, error: 'We keep no embassy there.' };
      const next = structuredClone(state);
      closeEmbassy(next, world, action.realm);
      return { state: next };
    }
    const check = canOpenEmbassy(state, world, action.realm);
    if (!check.ok) return { state, error: check.reason };
    const next = structuredClone(state);
    openEmbassy(next, world, action.realm);
    return { state: next };
  }
  if (action.type === 'spy') {
    const check = canSendSpy(state, world, action.realm);
    if (!check.ok) return { state, error: check.reason };
    const next = structuredClone(state);
    // Whether the agent is caught is the game's own dice, so a save resumes it.
    const rng = makeRng(next.rng.game);
    sendSpy(next, world, rng, action.realm);
    next.rng.game = rng.seed;
    return { state: next };
  }
  if (action.type === 'event') {
    const next = structuredClone(state);
    if (!resolveEvent(next, world, action.id, action.choice)) return { state, error: 'That has been settled.' };
    return { state: next };
  }
  if (['declare', 'raise', 'army', 'disband', 'peace', 'withdraw', 'warDecision'].includes(action.type)) return warAction(state, world, action);
  return { state, error: `Unknown action ${action.type}.` };
}

// The crown's war: declaring it, raising and ordering armies, and ending it.
function warAction(state, world, action) {
  const next = structuredClone(state);
  const army = next.armies.find((a) => a.id === action.army);
  if (action.type === 'declare') {
    const check = canDeclare(state, world, action.realm);
    if (!check.ok) return { state, error: check.reason };
    const rng = makeRng(next.rng.game);
    declareWar(next, world, rng, action.realm);
    next.rng.game = rng.seed;
  } else if (action.type === 'raise') {
    const check = canRaise(state, world, action);
    if (!check.ok) return { state, error: check.reason };
    raiseArmy(next, world, action);
  } else if (action.type === 'army') {
    const check = canOrder(next, world, army, action.order, action.target);
    if (!check.ok) return { state, error: check.reason };
    orderArmy(next, world, army, action.order, action.target, action.stance);
  } else if (action.type === 'disband') {
    if (!army || army.side !== TEMERIA) return { state, error: 'No such army.' };
    disbandArmy(next, world, army);
  } else if (action.type === 'peace') {
    const check = canMakePeace(state, world, action.war, action.terms);
    if (!check.ok) return { state, error: check.reason };
    offerPeace(next, world, action.war, action.terms);
  } else if (action.type === 'withdraw') {
    const war = state.wars.find((w) => w.id === action.war);
    if (!war || sideIndex(war, TEMERIA) < 0 || war.sides[sideIndex(war, TEMERIA)][0] === TEMERIA) return { state, error: 'We lead this war; make peace instead.' };
    withdraw(next, world, action.war);
  } else if (action.type === 'warDecision') {
    if (!resolveWarDecision(next, world, action.id, action.choice)) return { state, error: 'That has been settled.' };
  }
  return { state: next };
}

function startBuilding(state, world, id, buildingId) {
  const b = world.buildings[buildingId];
  state.treasury -= b.cost.coin ?? 0;
  state.ledger.construction += b.cost.coin ?? 0;
  // Materials come from the settlement's own store first, then from the rest
  // of the realm in proportion to what each holds.
  for (const m of MATERIALS) {
    let left = b.cost[m] ?? 0;
    const own = state.settlements[id].stock;
    const fromOwn = Math.min(own[m], left);
    own[m] -= fromOwn;
    left -= fromOwn;
    if (left <= 0) continue;
    const total = Object.values(state.settlements).reduce((a, s) => a + s.stock[m], 0);
    for (const s of Object.values(state.settlements)) s.stock[m] -= (left * s.stock[m]) / total;
  }
  state.settlements[id].construction = { building: buildingId, daysLeft: b.days, days: b.days };
  say(state, `Work begins on a ${b.name.toLowerCase()} at ${world.byId[id].name}.`);
}
