// Things the crown can order. Each action is checked, then applied to a copy
// of the state, so the UI can ask "could I?" before it asks "do it".
import { realmStock } from './economy.js';
import { addDispatch } from './realm.js';
import { canDecree, decree } from './laws.js';

const MATERIALS = ['timber', 'stone', 'iron'];

// Why a building can or cannot be raised here, in words fit for a button.
export function canBuild(state, world, settlementId, buildingId) {
  const b = world.buildings[buildingId];
  const s = state.settlements[settlementId];
  const type = world.byId[settlementId]?.type;
  if (!b || !s) return { ok: false, reason: 'Unknown building.' };
  if (!b.types.includes(type)) return { ok: false, reason: `Not for a ${type}.`, hidden: true };
  if (b.needs && s.production !== b.needs) return { ok: false, reason: `Only where ${b.needs} is worked.`, hidden: true };
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
  return { state, error: `Unknown action ${action.type}.` };
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
  addDispatch(state, `Work begins on a ${b.name.toLowerCase()} at ${world.byId[id].name}.`);
}
