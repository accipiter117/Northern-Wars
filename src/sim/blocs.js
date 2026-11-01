// Blocs (M29 D): a great power and its vassals stand together. A treaty
// with a suzerain covers its vassals; a war with a suzerain draws its
// vassals in, each answering by its loyalty; a vassal makes neither war nor
// peace on its own.
import { TEMERIA, sideName } from './conflict.js';
import { suzerainOf } from './tiers.js';
import { addDispatch, clamp } from './realm.js';

const B = (world) => world.diplomacy?.blocs;

// The head of a realm's bloc: its suzerain, or itself.
export function blocHead(state, rid) {
  return suzerainOf(state, rid) ?? rid;
}

// A vassal of a suzerain draws its sword beside it, by its loyalty.
export function drawInVassals(state, world, rng, war) {
  const c = B(world);
  if (!c) return;
  for (let side = 0; side < 2; side++) {
    for (const lead of [...war.sides[side]]) {
      for (const rid of Object.keys(state.realms ?? {})) {
        const realm = state.realms[rid];
        if (realm.fallen || suzerainOf(state, rid) !== lead || war.sides.flat().includes(rid)) continue;
        const v = realm.vassal;
        const loyalty = v?.loyalty ?? 50;
        if (loyalty >= c.joinAbove || rng.chance(clamp((loyalty - c.refuseBelow) / (c.joinAbove - c.refuseBelow), 0, 1))) {
          war.sides[side].push(rid);
          if (lead === TEMERIA || war.sides[1 - side].includes(TEMERIA)) addDispatch(state, `${sideName(world, rid)} marches beside its suzerain, ${sideName(world, lead)}.`, 'abroad');
        } else if (v) {
          v.loyalty = clamp(v.loyalty + c.refusedLoyalty, 0, 100);
          if (lead === TEMERIA) addDispatch(state, `${sideName(world, rid)} does not answer Temeria's call to arms.`, 'abroad');
        }
      }
    }
  }
}

// Whether a pact binds two realms, bloc to bloc: a treaty with a suzerain
// covers its vassals.
export function blocBound(state, a, b, pactBetween) {
  return !!(pactBetween(a, b) || pactBetween(blocHead(state, a), b) || pactBetween(a, blocHead(state, b)) || pactBetween(blocHead(state, a), blocHead(state, b)));
}

// A vassal starts no war of its own.
// Nor does the Empire before its clock reaches War (M30 D): it watches and presses.
// A sea power raids instead (M30 E).
export const mayStartWar = (state, rid) => !suzerainOf(state, rid) && !state.realms?.[rid]?.seaPower && !(state.nilfgaard?.realm === rid && state.nilfgaard.stage !== 'war');

// The save from before M29: every protectorate treaty becomes suzerainty.
export function upgradeVassals(state, world) {
  for (const t of state.diplomacy?.treaties ?? []) {
    if (t.kind !== 'protectorate') continue;
    const realm = state.realms?.[t.b];
    if (!realm || realm.suzerain) continue;
    const rel = t.a === TEMERIA ? (state.neighbours?.[t.b]?.relation ?? 0) : 20;
    realm.suzerain = t.a;
    realm.vassal = { since: t.since ?? state.day, route: 'protection', loyalty: clamp(50 + rel / 2, 15, 90), ambition: 20 };
  }
}
