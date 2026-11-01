// The Nilfgaardian Empire (M30 C): one great power over four northern
// provinces, each under an imperial governor, fed by fresh regiments from a
// heartland that is never simulated. It follows every common rule
// (battles, sieges, conquest, fear, audiences, deals, peace); what is its
// own is here: reinforcements on a schedule, faster at war, and the vassals
// it starts with (Toussaint).
import { addDispatch } from './realm.js';
import { atWar, sideName } from './conflict.js';
import { informed } from './realms.js';

const E = (world) => world.war?.empire;

// The realm the Empire is in this world, if it stands.
export function empireOf(state, world) {
  const rid = E(world)?.realm;
  return rid && state.realms?.[rid] && !state.realms[rid].fallen ? rid : null;
}

// Each province and its governor, as the realm card shows them.
export function governors(world, rid) {
  const g = world.realms?.realms[rid]?.governors ?? {};
  const provinces = world.geography.neighbours[rid]?.provinces ?? {};
  return Object.entries(provinces).map(([id, p]) => ({ id, name: p.name, governor: g[id] ?? null }));
}

// Where fresh regiments come in: the Empire's town nearest a road end.
export function arrivalTown(state, world, rid) {
  const ends = world.geography.roadEnds ?? [];
  let best = null;
  for (const id of world.foreignByRealm[rid] ?? []) {
    const t = world.byId[id];
    for (const e of ends) {
      const d = Math.hypot(t.x - e.x, t.y - e.y);
      if (!best || d < best.d) best = { id, d };
    }
  }
  return best?.id ?? world.realms?.realms[rid]?.capital ?? null;
}

// Days between regiments: quicker at war, and quicker again once the
// Nilfgaard clock (M30 D) has reached War.
export function reinforcementGap(state, world) {
  const c = E(world);
  const rid = c.realm;
  let gap = atWar(state, rid) ? c.war : c.peace;
  if (state.nilfgaard?.stage === 'war') gap = Math.round(c.war * c.quicken);
  return gap;
}

export function stepEmpireDay(state, world) {
  const c = E(world);
  const rid = empireOf(state, world);
  if (!c || !rid) return;
  const e = (state.empire ??= { next: state.day + reinforcementGap(state, world), arrived: 0 });
  if (state.day < e.next) return;
  e.next = state.day + reinforcementGap(state, world);
  const realm = state.realms[rid];
  const room = c.cap - (realm.army ?? 0);
  if (room <= 0) return;
  const men = Math.min(c.men, room);
  realm.army = (realm.army ?? 0) + men;
  e.arrived += men;
  e.last = { day: state.day, men, at: arrivalTown(state, world, rid) };
  // Word of them reaches Vizima at war, and through an embassy or spy, no
  // more than once a season.
  if (e.last.at && (atWar(state, rid) || informed(state, world, rid)) && state.day - (e.told ?? -1e9) >= 90) {
    e.told = state.day;
    addDispatch(state, `Fresh imperial regiments march up from the south into ${world.byId[e.last.at].name}. ${sideName(world, rid)} never runs short of men.`, 'abroad');
  }
}

// Vassals a realm starts with (realms.json startsVassalOf): Toussaint to the
// Empire. Set quietly, as the reign begins.
export function startingVassals(state, world) {
  for (const [rid, def] of Object.entries(world.realms?.realms ?? {})) {
    const lord = def.startsVassalOf;
    if (!lord || !state.realms?.[rid] || !state.realms[lord] || state.realms[rid].suzerain) continue;
    const s = world.diplomacy?.suzerainty;
    state.realms[rid].suzerain = lord;
    state.realms[rid].vassal = { since: state.day, route: 'start', loyalty: def.startLoyalty ?? 70, ambition: s?.ambition ?? 30, from: null };
  }
}
