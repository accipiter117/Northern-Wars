// The smaller crowns as city-states (v2 step 5): envoys bought with renown,
// the right to seal suzerainty by protection, pressure or peace terms,
// rivals courting a vassal away, favours asked and done, vassals rebelling,
// and the suzerain's judgement when a rebel's capital falls.
import { makeRng } from '../../../src/sim/rng.js';
import { say, nameOf, atWar, makeWar, makePeace, controller, clamp, authority, isPower } from './core.js';

const M = (table) => table.data.minors;

export function newMinors(table, realms) {
  const out = {};
  for (const rid of Object.keys(realms)) {
    if (!M(table).crowns[rid]) continue;
    out[rid] = { envoys: {}, suzerain: null, quest: null, rebel: false };
  }
  return out;
}

export const typeOf = (table, rid) => M(table).types[M(table).crowns[rid]];
export const vassalsOf = (state, power) => Object.keys(state.minors).filter((m) => state.minors[m].suzerain === power);
export const envoysPlaced = (state, power) => Object.values(state.minors).reduce((n, m) => n + (m.envoys[power] ?? 0), 0);

export const capitalOf = (table, rid) => Object.values(table.board.regions).find((r) => r.realm === rid && r.capital)?.id;

// Who has the most envoys at a court (none on a tie).
export function leader(state, minor) {
  const e = Object.entries(state.minors[minor].envoys).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  if (!e.length || (e[1] && e[1][1] === e[0][1])) return null;
  return e[0][0];
}

export function sendEnvoy(state, table, power, minor) {
  const m = state.minors[minor];
  const realm = state.realms[power];
  if (!m) return { error: 'No such court.' };
  if (realm.renown < M(table).envoyCost) return { error: `Needs ${M(table).envoyCost} renown.` };
  realm.renown -= M(table).envoyCost;
  m.envoys[power] = (m.envoys[power] ?? 0) + 1;
  return { ok: true };
}

// May armies of `rid` cross this smaller crown's land in peace?
export function passage(state, rid, owner) {
  const m = state.minors[owner];
  return !!m && (m.suzerain === rid || (m.envoys[rid] ?? 0) > 0);
}

// The routes by which a power may seal suzerainty now.
export function sealRoutes(state, table, power, minor) {
  const m = state.minors[minor];
  if (!m || m.suzerain === power || leader(state, minor) !== power || (m.envoys[power] ?? 0) < M(table).sealMin) return [];
  const out = [];
  const cap = capitalOf(table, minor);
  const threatened = Object.keys(state.realms).some((r) => atWar(state, r, minor) && r !== power)
    || state.armies.some((a) => state.cities[a.region]?.owner === minor && atWar(state, a.owner, minor) && a.owner !== power);
  if (threatened) out.push('protection');
  const companies = (rid) => state.armies.filter((a) => a.owner === rid).reduce((n, a) => n + a.companies.length, 0);
  if (companies(power) >= companies(minor) * M(table).pressure.ratio) out.push('pressure');
  if (cap && controller(state, cap) === power) out.push('terms');
  return out;
}

export function seal(state, table, power, minor, route) {
  if (!sealRoutes(state, table, power, minor).includes(route)) return { error: 'That way is not open.' };
  const m = state.minors[minor];
  if (route === 'pressure') {
    if (state.realms[power].treasury < M(table).pressure.gift) return { error: `Needs ${M(table).pressure.gift} crowns as a gift.` };
    state.realms[power].treasury -= M(table).pressure.gift;
  }
  if (route === 'terms') {
    makePeace(state, power, minor);
    for (const [id, c] of Object.entries(state.cities)) if (c.owner === minor && c.holder === power) { c.holder = null; c.siege = null; }
  }
  const was = m.suzerain;
  m.suzerain = power;
  m.rebel = false;
  const how = { protection: 'for our protection', pressure: 'under pressure and gifts', terms: 'by the terms of peace' }[route];
  say(state, `${nameOf(table, minor)} bows to ${nameOf(table, power)}, ${how}${was ? `, leaving ${nameOf(table, was)}` : ''}.`);
  return { ok: true };
}

// A favour done: the gift quest is paid at once.
export function doFavour(state, table, power, minor) {
  const m = state.minors[minor];
  const q = m?.quest;
  if (!q || q.kind !== 'gift') return { error: 'No such favour asked.' };
  if (state.realms[power].treasury < q.n) return { error: `Needs ${q.n} crowns.` };
  state.realms[power].treasury -= q.n;
  reward(state, table, power, minor);
  return { ok: true };
}

function reward(state, table, power, minor) {
  const m = state.minors[minor];
  m.envoys[power] = (m.envoys[power] ?? 0) + M(table).questEnvoys;
  say(state, `${nameOf(table, minor)} thanks ${nameOf(table, power)}: ${M(table).questEnvoys} envoys welcome at its court.`);
  m.quest = null;
}

export function questText(table, minor, q) {
  if (!q) return null;
  const t = M(table).quests[q.kind].text;
  return t.replace('{n}', q.n).replace('{place}', table.board.regions[q.place]?.name ?? '');
}

// The suzerain's yields from its vassals.
export function suzerainBonus(state, table, power) {
  const out = {};
  for (const v of vassalsOf(state, power)) for (const [k, n] of Object.entries(typeOf(table, v).bonus)) out[k] = (out[k] ?? 0) + n;
  return out;
}

// When a power goes to war, its vassals go with it.
export function vassalsFollow(state, power, foe) {
  for (const v of vassalsOf(state, power)) if (v !== foe) makeWar(state, v, foe);
}

// The judgements for a rebel whose capital has fallen.
export function judge(state, table, power, minor, choice) {
  const j = M(table).judgements[choice];
  const m = state.minors[minor];
  if (!j || !m) return { error: 'No such judgement.' };
  const r = state.realms[power];
  r.fear = clamp(r.fear + (j.fear ?? 0), 0, 100);
  r.love = clamp(r.love + (j.love ?? 0), 0, 100);
  r.renown += j.renown ?? 0;
  makePeace(state, power, minor);
  m.rebel = false;
  if (choice === 'annex') {
    for (const [id, c] of Object.entries(state.cities)) {
      if (c.owner !== minor) continue;
      c.owner = power;
      c.holder = null;
      c.siege = null;
      c.integration = table.data.game.cities.integration.start;
    }
    delete state.minors[minor];
    for (const a of state.armies) if (a.owner === minor) a.companies = [];
    state.armies = state.armies.filter((a) => a.companies.length);
  } else {
    m.suzerain = power;
    if (choice === 'depose') m.envoys = { [power]: j.envoys };
    for (const c of Object.values(state.cities)) if (c.owner === minor && c.holder === power) { c.holder = null; c.siege = null; }
  }
  if (state.judgement?.minor === minor) state.judgement = null;
  say(state, `${nameOf(table, power)} judges the rebel king of ${nameOf(table, minor)}: ${j.name.toLowerCase()}.`);
  return { ok: true };
}

// The month at the smaller courts.
export function monthlyMinors(state, table) {
  const cfg = M(table);
  const rng = makeRng(state.rng);
  for (const [minor, m] of Object.entries(state.minors)) {
    if (!state.realms[minor]) continue;
    // A rival with enough envoys courts a vassal away.
    if (m.suzerain && !m.rebel) {
      const mine = m.envoys[m.suzerain] ?? 0;
      const rival = Object.entries(m.envoys).find(([p, n]) => p !== m.suzerain && n >= mine + cfg.courtAway);
      if (rival) {
        say(state, `${nameOf(table, rival[0])} courts ${nameOf(table, minor)} away from ${nameOf(table, m.suzerain)}.`);
        m.suzerain = null;
      }
    }
    // A weak suzerain's vassal may rebel.
    if (m.suzerain && !m.rebel && authority(state.realms[m.suzerain]) < cfg.rebel.below && rng.chance(cfg.rebel.chance)) {
      m.rebel = m.suzerain;
      makeWar(state, minor, m.suzerain);
      say(state, `${nameOf(table, minor)} rises against ${nameOf(table, m.suzerain)}.`);
      m.suzerain = null;
    }
    // A rebel whose capital has fallen to its old suzerain is judged.
    const cap = capitalOf(table, minor);
    if (m.rebel && cap && controller(state, cap) === m.rebel) {
      if (m.rebel === state.player) state.judgement = { minor, by: m.rebel };
      else judge(state, table, m.rebel, minor, 'depose');
    }
    // Favours: asked now and then; garrison and renown ones are checked here.
    if (!m.quest && !m.rebel && rng.chance(cfg.questChance)) {
      const kind = rng.pick(Object.keys(cfg.quests));
      m.quest = { kind, n: kind === 'gift' ? cfg.quests.gift.n : null, place: cap, turn: state.turn };
    } else if (m.quest?.kind === 'garrison') {
      const by = state.armies.find((a) => a.region === m.quest.place && isPower(table, a.owner) && !atWar(state, a.owner, minor));
      if (by) reward(state, table, by.owner, minor);
    }
  }
  state.rng = rng.seed;
}

// The AI's statecraft at the smaller courts: an envoy now and then where it
// has the best chance, a favour paid, a seal when it may.
export function aiMinors(state, table, power) {
  const cfg = M(table);
  const realm = state.realms[power];
  const courts = Object.keys(state.minors).filter((m) => state.realms[m]);
  // Courts on its own borders.
  const near = (minor) => Object.values(table.board.regions).some((r) => r.realm === minor && table.board.adj[r.id].some((l) => state.cities[l.a === r.id ? l.b : l.a].owner === power));
  for (const minor of courts) {
    const routes = sealRoutes(state, table, power, minor);
    const route = routes.find((r) => r !== 'pressure') ?? (routes.includes('pressure') && realm.treasury > cfg.pressure.gift * 2 ? 'pressure' : null);
    if (route) seal(state, table, power, minor, route);
    const q = state.minors[minor]?.quest;
    if (q?.kind === 'gift' && realm.treasury > q.n * 3 && (near(minor) || (state.minors[minor].envoys[power] ?? 0) > 0)) doFavour(state, table, power, minor);
  }
  if ((state.turn + power.length) % cfg.ai.envoyEvery === 0 && realm.renown >= cfg.envoyCost) {
    // Where its envoys stand closest to the lead, among courts it borders.
    const pick = courts.filter((m) => !state.minors[m].suzerain || state.minors[m].suzerain === power)
      .sort((a, b) => (near(b) - near(a)) || ((state.minors[b].envoys[power] ?? 0) - (state.minors[a].envoys[power] ?? 0)))[0];
    if (pick) sendEnvoy(state, table, power, pick);
  }
}
