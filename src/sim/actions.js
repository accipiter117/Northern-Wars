// Things the crown can order. Each action is checked, then applied to a copy
// of the state, so the UI can ask "could I?" before it asks "do it".
import { realmStock, creditLimit } from './economy.js';
import { addDispatch } from './realm.js';
import { canDecree, decree } from './laws.js';
import { canSetStance, setStance, resolveEnvoy } from './neighbours.js';
import { resolvePetition } from './petitions.js';
import { canHouseAction, houseAction, resolveDemand } from './houses.js';
import { canSetGarrison, resolveEvent } from './military.js';
import { canRecruit, recruit, canOrderCompany, orderCompany, disbandCompany } from './forces.js';
import { witcherCost } from './threats.js';
import { canOpenEmbassy, openEmbassy, closeEmbassy, canSendSpy, sendSpy } from './realms.js';
import { makeRng } from './rng.js';
import { depositAt, canProspect, startProspect } from './gold.js';
import { canOpenRoute, openRoute, closeRoute } from './trade.js';
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
  if (b.needsWater && !world.waterOf?.[settlementId]) return { ok: false, reason: 'Only on a river, a lake or the sea.', hidden: true };
  if (b.needsRoad && world.adjacency[settlementId].length < b.needsRoad) return { ok: false, reason: 'Only at a crossroads.', hidden: true };
  if (b.produces && !b.produces.includes(s.production)) return { ok: false, reason: 'Only where the land supplies it.', hidden: true };
  if (b.needsDwarves && (s.population.dwarf ?? 0) < b.needsDwarves) return { ok: false, reason: `Needs a dwarven quarter (${b.needsDwarves} dwarves).` };
  if (b.needsDeposit && !depositAt(state, world, settlementId)) return { ok: false, reason: 'Only on a known gold deposit.', hidden: true };
  if (b.sites && !b.sites.includes(settlementId)) return { ok: false, reason: 'Only where the land suits it.', hidden: true };
  if (b.terrain && !b.terrain.includes(world.terrainOf[settlementId])) return { ok: false, reason: 'Only where the land suits it.', hidden: true };
  if (b.wild && !b.wild.some((k) => world.wildOf[settlementId]?.[k]) && !b.orProduces?.includes(s.production)) return { ok: false, reason: 'Only near wild country.', hidden: true };
  if (s.buildings.includes(buildingId)) return { ok: false, reason: 'Already built.', hidden: true };
  if (b.requires && !s.buildings.includes(b.requires)) return { ok: false, reason: `Needs a ${world.buildings[b.requires].name.toLowerCase()} first.` };
  if (s.buildings.length >= slotsOf(world, settlementId)) return { ok: false, reason: `No room: a ${type} holds ${slotsOf(world, settlementId)} buildings.` };
  if (s.construction) return { ok: false, reason: 'Workers are busy on another project.' };
  const stock = realmStock(state);
  for (const m of MATERIALS) {
    if ((b.cost[m] ?? 0) > stock[m]) return { ok: false, reason: `The realm lacks ${m}.` };
  }
  const limit = creditLimit(state, world);
  if (state.treasury - (b.cost.coin ?? 0) < -limit) return { ok: false, reason: 'The bankers will not lend that much.' };
  return { ok: true, borrow: state.treasury - (b.cost.coin ?? 0) < 0 };
}

// How many buildings a kind of place can hold: cities most, villages least.
export function slotsOf(world, id) {
  return world.buildingSlots?.[world.byId[id].type] ?? 99;
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
  if (action.type === 'recruit') {
    const check = canRecruit(state, world, action.settlement, action.kind);
    if (!check.ok) return { state, error: check.reason };
    const next = structuredClone(state);
    recruit(next, world, action.settlement, action.kind);
    return { state: next };
  }
  if (action.type === 'company') {
    const c = state.forces?.companies.find((x) => x.id === action.id);
    if (action.disband) {
      if (!c) return { state, error: 'No such company.' };
      if (c.army) return { state, error: 'It marches with an army.' };
      const next = structuredClone(state);
      disbandCompany(next, world, next.forces.companies.find((x) => x.id === action.id));
      return { state: next };
    }
    const check = canOrderCompany(state, world, c, action.order);
    if (!check.ok) return { state, error: check.reason };
    const next = structuredClone(state);
    orderCompany(next, world, next.forces.companies.find((x) => x.id === action.id), action.order);
    return { state: next };
  }
  if (action.type === 'witcher') {
    const t = state.threats?.list.find((x) => x.id === action.threat);
    if (!t || t.kind !== 'monsters') return { state, error: 'No such lair.' };
    if (!t.sighted) return { state, error: 'No witcher takes a contract on a rumour.' };
    if (t.abroad) return { state, error: 'It lies over the border: no Temerian contract runs there.' };
    if (state.threats.contracts.some((c) => c.threat === t.id)) return { state, error: 'A witcher is already on the trail.' };
    const cost = witcherCost(state, world, t);
    if (state.treasury - cost < -creditLimit(state, world)) return { state, error: 'The bankers will not lend that much.' };
    const next = structuredClone(state);
    next.treasury -= cost;
    next.ledger.decrees = (next.ledger.decrees ?? 0) + cost;
    next.threats.contracts.push({ threat: t.id, until: next.day + world.forces.threats.monsters.witcher.days, cost });
    addDispatch(next, `A witcher takes the crown's contract on the beasts near ${world.byId[t.near].name}, for ${cost} crowns.`, 'military');
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
  if (action.type === 'route') {
    if (action.close) {
      if (!state.routes.some((r) => r.id === action.id)) return { state, error: 'No such route.' };
      const next = structuredClone(state);
      closeRoute(next, world, action.id);
      return { state: next };
    }
    const check = canOpenRoute(state, world, action.from, action.to);
    if (!check.ok) return { state, error: check.reason };
    const next = structuredClone(state);
    openRoute(next, world, action.from, action.to);
    return { state: next };
  }
  if (action.type === 'prospect') {
    const check = canProspect(state, world, action.settlement);
    if (!check.ok) return { state, error: check.reason };
    const next = structuredClone(state);
    startProspect(next, world, action.settlement);
    return { state: next };
  }
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
