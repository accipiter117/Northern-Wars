// The great houses (v2, M49): the lords who hold the crown's provinces for
// it. Each has loyalty, moved by the realm's Love and Fear and by favour
// won when its wants are met; a loyal house sends its retinue, a sullen one
// stirs unrest, and a bitter one rises. A rising is a war: its lands go
// over to it and its host takes the field; retaking its seat brings the
// lord to judgement. Played only while the houses' realm is the player's.
import { makeRng } from '../../../src/sim/rng.js';
import { say, nameOf, controller, clamp, makeWar } from './core.js';
import { enacted, lawDef } from './laws.js';

const H = (table) => table.data.houses;
export const rebelOf = (id) => `house_${id}`;

export function houseDef(table, id) {
  const base = table.world.houses?.houses?.[id] ?? {};
  return { ...base, ...H(table).houses[id], id };
}

// Names and colours for the houses, as realms in their own right when they rise.
export function registerHouses(table) {
  if (!H(table)) return;
  for (const id of Object.keys(H(table).houses)) {
    const d = houseDef(table, id);
    table.data.game.names[rebelOf(id)] ??= d.name ?? id;
    table.colours[rebelOf(id)] ??= d.colours ?? ['#555555', '#efe6cf'];
  }
}

export const housesActive = (state, table) => !!H(table) && state.player === H(table).realm;

export function newHouses(table) {
  if (!H(table)) return {};
  return Object.fromEntries(Object.keys(H(table).houses).map((id) => [id, {
    loyalty: houseDef(table, id).loyalty ?? 50, favour: 0, want: null, rebel: false, fallen: false,
  }]));
}

// The house holding a province for the crown, if any.
export function houseOf(state, table, region) {
  if (!H(table)) return null;
  for (const [id, def] of Object.entries(H(table).houses)) {
    if (def.lands.includes(region) && !state.houses?.[id]?.fallen) return id;
  }
  return null;
}

const landsHeld = (state, table, id) => H(table).houses[id].lands.filter((r) => state.cities[r]?.owner === state.player && !state.cities[r].holder);

export function wantText(table, want) {
  if (!want) return null;
  if (want.kind === 'honours') return `honours from the crown (${H(table).wants.honours.crowns} crowns)`;
  if (want.kind === 'garrison') return 'one of our armies in the house\'s lands, to keep them';
  if (want.kind.startsWith('law:')) return `the law: ${lawDef(table, want.kind.slice(4))?.name.toLowerCase() ?? want.kind.slice(4)}`;
  return want.kind;
}

function meetWant(state, table, id) {
  const h = state.houses[id];
  h.favour += H(table).wants.favour;
  h.loyalty = clamp(h.loyalty + H(table).wants.favour / 2, 0, 100);
  say(state, `${houseDef(table, id).name} is content: ${wantText(table, h.want)}.`);
  h.want = null;
}

// The crown grants a house the honours it asks for.
export function grantHonours(state, table, id) {
  const h = state.houses?.[id];
  if (!h || h.want?.kind !== 'honours') return { error: 'The house asks nothing of the kind.' };
  const cost = H(table).wants.honours.crowns;
  const realm = state.realms[state.player];
  if (realm.treasury < cost) return { error: `Needs ${cost} crowns.` };
  realm.treasury -= cost;
  meetWant(state, table, id);
  return { ok: true };
}

// What the houses do to the crown's month.
export function houseBonus(state, table, rid) {
  if (rid !== state.player || !housesActive(state, table) || !state.houses) return {};
  const out = { production: 0, unrest: 0 };
  for (const [id, h] of Object.entries(state.houses)) {
    if (h.fallen || h.rebel || !landsHeld(state, table, id).length) continue;
    if (h.loyalty >= H(table).loyal) out.production += H(table).retinue;
    if (h.loyalty < H(table).sullen) out.unrest += H(table).unrest;
  }
  return out;
}

function rise(state, table, id) {
  const cfg = H(table);
  const h = state.houses[id];
  const rid = rebelOf(id);
  const def = houseDef(table, id);
  const lands = landsHeld(state, table, id);
  if (!lands.length) return;
  h.rebel = true;
  h.want = null;
  state.realms[rid] = { treasury: 0, production: 0, devotion: 0, renown: 0, love: 50, fear: 20, unrest: 0, tax: 'fair', goals: [] };
  for (const r of lands) Object.assign(state.cities[r], { owner: rid, holder: null, siege: null, focus: 'balanced' });
  const seat = lands.includes(def.seat) ? def.seat : lands[0];
  state.armies.push({ id: state.nextArmy++, owner: rid, region: seat, companies: cfg.rising.host.map((type) => ({ type, str: 100 })), points: 0 });
  makeWar(state, rid, state.player);
  say(state, `${def.lord ?? def.name} rises against the crown. ${lands.map((r) => table.board.regions[r].name).join(' and ')} go over to ${def.name}.`);
}

// The month among the houses.
export function monthlyHouses(state, table) {
  if (!housesActive(state, table)) return;
  const cfg = H(table);
  const realm = state.realms[state.player];
  const rng = makeRng(state.rng);
  const rising = [];
  for (const [id, h] of Object.entries(state.houses ?? {})) {
    if (h.fallen) continue;
    const def = houseDef(table, id);
    if (h.rebel) {
      const seat = cfg.houses[id].lands.includes(def.seat) ? def.seat : cfg.houses[id].lands[0];
      if (controller(state, seat) === state.player && !state.lordJudgement) state.lordJudgement = { house: id };
      continue;
    }
    if (!landsHeld(state, table, id).length) continue;
    h.favour = Math.max(0, h.favour - cfg.loyalty.favourFade);
    const target = clamp(cfg.loyalty.base + (realm.love - 50) * cfg.loyalty.love + (realm.fear - 30) * cfg.loyalty.fear + h.favour, 0, 100);
    h.loyalty = clamp(Math.round((h.loyalty + (target - h.loyalty) * cfg.loyalty.drift) * 10) / 10, 0, 100);
    // Wants: a new one now and then; met, waited on, or given up.
    if (!h.want && rng.chance(cfg.wants.chance)) {
      const options = (def.traits ?? ['loyalist']).flatMap((t) => cfg.wants.byTrait[t] ?? ['honours'])
        .filter((k) => !k.startsWith('law:') || (lawDef(table, k.slice(4)) && !enacted(state, state.player).includes(k.slice(4))));
      if (options.length) {
        h.want = { kind: rng.pick(options), turn: state.turn };
        say(state, `${def.lord ?? def.name} asks for ${wantText(table, h.want)}.`);
      }
    }
    if (h.want) {
      const k = h.want.kind;
      const met = (k === 'garrison' && state.armies.some((a) => a.owner === state.player && cfg.houses[id].lands.includes(a.region)))
        || (k.startsWith('law:') && enacted(state, state.player).includes(k.slice(4)));
      if (met) meetWant(state, table, id);
      else {
        const age = state.turn - h.want.turn;
        if (age >= cfg.wants.lapse) h.want = null;
        else if (age >= cfg.wants.patience) h.loyalty = clamp(h.loyalty - cfg.wants.unmet, 0, 100);
      }
    }
    if (h.loyalty < cfg.rising.below && rng.chance(cfg.rising.chance * (1 - realm.fear * cfg.rising.fearCalm))) rising.push(id);
  }
  state.rng = rng.seed;
  if (rising.length) {
    // The bitter join the first to rise.
    for (const [id, h] of Object.entries(state.houses)) if (!rising.includes(id) && !h.fallen && !h.rebel && h.loyalty < cfg.rising.join) rising.push(id);
    for (const id of rising) rise(state, table, id);
  }
}

// Judgement on a house whose seat has been retaken: its lands come back to
// the crown either way; pardoned, the house keeps them.
export function judgeHouse(state, table, id, verdict) {
  const cfg = H(table);
  const h = state.houses?.[id];
  if (!h?.rebel) return { error: 'No rebel to judge.' };
  const rid = rebelOf(id);
  for (const c of Object.values(state.cities)) {
    if (c.owner === rid) Object.assign(c, { owner: state.player, holder: null, siege: null });
    else if (c.holder === rid) Object.assign(c, { holder: null, siege: null });
  }
  state.armies = state.armies.filter((a) => a.owner !== rid);
  state.wars = state.wars.filter((w) => !w.split('|').includes(rid));
  delete state.realms[rid];
  if (state.laws) delete state.laws[rid];
  h.rebel = false;
  h.want = null;
  const realm = state.realms[state.player];
  const def = houseDef(table, id);
  if (verdict === 'block') {
    h.fallen = true;
    realm.fear = clamp(realm.fear + cfg.judgement.block.fear, 0, 100);
    for (const [o, x] of Object.entries(state.houses)) if (o !== id && !x.fallen) x.loyalty = clamp(x.loyalty + cfg.judgement.block.others, 0, 100);
    say(state, `${def.lord ?? def.name} goes to the block. ${def.name} is no more, and its lands are the crown's.`);
  } else {
    h.loyalty = cfg.judgement.pardon.loyalty;
    h.favour = 0;
    realm.love = clamp(realm.love + cfg.judgement.pardon.love, 0, 100);
    say(state, `${def.lord ?? def.name} is pardoned, and swears again to the crown.`);
  }
  state.lordJudgement = null;
  return { ok: true };
}
