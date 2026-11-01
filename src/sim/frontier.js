// Angren (M30 B): a lawless frontier. It has no ruler and no court, sits
// outside the tiers, and makes neither war nor peace. Anyone may fall on
// its free towns without declaring a war (they are hostile to all), so the
// strong take them: the crown by marching an army there, a neighbouring
// realm now and then by sending a column. A town taken there stays a sore:
// outlaws rise and throw out a thin garrison. Its wilds breed more camps
// and lairs than settled country (realms.json frontier.wildness).
import { addDispatch } from './realm.js';
import { TEMERIA, ownerOf, originOf, sideName } from './conflict.js';
import { transferTown } from './lands.js';
import { informed } from './realms.js';

const F = (world) => world.realms?.frontier;

export const lawless = (world, rid) => !!world.realms?.realms[rid]?.lawless;

export function lawlessRealms(world) {
  return Object.keys(world.realms?.realms ?? {}).filter((rid) => lawless(world, rid));
}

// The frontier's own towns (those of its traced land), whoever holds them.
function frontierTowns(world, rid) {
  const base = world.base?.foreign ?? world.foreign;
  return base.filter((t) => originOf(world, t.id) === rid).map((t) => t.id);
}

function garrisonAt(state, world, id) {
  const owner = ownerOf(state, world, id);
  if (owner === TEMERIA) return state.settlements[id]?.garrison ?? 0;
  return state.realms[owner]?.settlements[id]?.garrison ?? 0;
}

function soldiersOf(state, rid) {
  return Object.values(state.realms[rid]?.settlements ?? {}).reduce((a, s) => a + (s.garrison ?? 0), 0) + (state.realms[rid]?.army ?? 0);
}

const near = (world, a, b) => Math.hypot(world.byId[a].x - world.byId[b].x, world.byId[a].y - world.byId[b].y);

// Once a month: strong neighbours take free towns, and outlaws rise in
// towns held by others.
export function monthlyFrontier(state, world, rng) {
  const c = F(world);
  if (!c) return;
  for (const rid of lawlessRealms(world)) {
    if (!state.realms[rid]) continue;
    const towns = frontierTowns(world, rid);
    const free = towns.filter((id) => ownerOf(state, world, id) === rid);
    const fresh = new Set();
    // A neighbouring realm with soldiers to spare takes a free town near it.
    for (const p of Object.keys(state.realms)) {
      if (p === rid || state.realms[p].fallen || lawless(world, p) || !world.diplomacy?.rulers[p]) continue;
      if (!free.length) break;
      const mine = (world.foreignByRealm[p] ?? []).filter((id) => ownerOf(state, world, id) === p && !towns.includes(id));
      let pick = null;
      for (const id of free) {
        const d = Math.min(...mine.map((m) => near(world, m, id)));
        if (d <= c.reach && (!pick || d < pick.d)) pick = { id, d };
      }
      if (!pick) continue;
      const aggression = world.war?.ai.aggression[p] ?? 0.3;
      if (!rng.chance(c.takeChance * aggression)) continue;
      if (soldiersOf(state, p) < garrisonAt(state, world, pick.id) * c.strengthPer) continue;
      transferTown(state, world, pick.id, p, { quiet: true, how: 'siege' });
      const s = state.realms[p].settlements[pick.id];
      if (s) s.garrison = Math.max(s.garrison ?? 0, c.holdWith);
      free.splice(free.indexOf(pick.id), 1);
      fresh.add(pick.id);
      if (informed(state, world, p)) addDispatch(state, `Soldiers of ${sideName(world, p)} take ${world.byId[pick.id].name} in lawless ${sideName(world, rid)}. No one is left to ask for it back.`, 'abroad');
    }
    // Outlaws rise in a town held by others, the thinner its garrison the likelier.
    for (const id of towns) {
      const owner = ownerOf(state, world, id);
      // A column that has just taken a town holds it through its first month.
      if (owner === rid || fresh.has(id)) continue;
      const g = garrisonAt(state, world, id);
      const chance = c.revolt * Math.max(0, 1 - g / c.safeGarrison);
      if (!rng.chance(chance)) continue;
      transferTown(state, world, id, rid, { quiet: true, how: 'revolt' });
      const s = state.realms[rid].settlements[id];
      if (s) s.garrison = c.outlaws;
      const text = `Outlaws rise in ${world.byId[id].name} and throw out the garrison of ${sideName(world, owner)}. The town is Angren's again, which is to say no one's.`;
      if (owner === TEMERIA) addDispatch(state, text, 'military');
      else if (informed(state, world, owner)) addDispatch(state, text, 'abroad');
    }
  }
}
