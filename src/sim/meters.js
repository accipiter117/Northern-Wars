// Three meters in place of Authority and Stability (M22 D).
//  Trust in the Crown (0 to 100, keep high): do the common folk believe the
//    crown will keep them fed and safe.
//  Unrest (0 to 100, keep low): the realm's figure for the towns' anger at
//    the crown (their own unrest underneath), with the great houses'
//    grievances on top.
//  Dread (0 to 100, keep low): fear of what lies beyond the walls.
// Standing, worked out from the three and never shown, is what the lords,
// the rulers abroad and the bankers read as the strength of the reign. Each
// month the biggest causes of each meter's change are kept as its reasons.
import { clamp, addDispatch } from './realm.js';
import { dateOf } from './calendar.js';
import { totalPopulation } from './state.js';
import { foodNeed, realmStock, realmEffect } from './economy.js';
import { lawEffects } from './laws.js';
import { seasonOf } from './calendar.js';
import { TEMERIA, hostile, hasWalls } from './conflict.js';
import { patrolNodes } from './forces.js';

const C = (world) => world.meters;
const METERS = ['trust', 'unrest', 'dread'];

export function defaultMeters() {
  return { month: { trust: {}, unrest: {}, dread: {} }, reasons: { trust: [], unrest: [], dread: [] }, last: { cleared: 0, raids: 0, won: 0 }, trade: 1 };
}

const meters = (state) => (state.meters ??= defaultMeters());

// What the lords, the rulers abroad and the bankers read as the strength of
// the reign: high Trust, low Unrest, low Dread.
export function standing(state, world) {
  const w = C(world)?.standing ?? { trust: 0.5, calm: 0.3, courage: 0.2 };
  return clamp(w.trust * (state.trust ?? 50) + w.calm * (100 - (state.unrest ?? 30)) + w.courage * (100 - (state.dread ?? 20)), 0, 100);
}

// Move a meter by `v` for a reason, kept for the month's reasons. Unrest is
// the towns' anger: moving it moves every town of ours alike.
export function nudge(state, world, meter, v, why) {
  if (!v || !METERS.includes(meter)) return;
  if (meter === 'unrest') {
    for (const s of Object.values(state.settlements)) if (!s.occupier) s.unrest = clamp(s.unrest + v, 0, 100);
    state.unrest = realmUnrest(state, world);
  } else state[meter] = clamp((state[meter] ?? 50) + v, 0, 100);
  const m = meters(state).month[meter];
  m[why] = (m[why] ?? 0) + v;
}

// The realm's Unrest: the towns' unrest, half by the people living under it
// and half by place (as Stability was, inverted), with the great houses'
// grievances on top: their mood feeds Unrest instead of its own meter.
export function realmUnrest(state, world) {
  let people = 0;
  let weighted = 0;
  let sum = 0;
  const all = Object.values(state.settlements).filter((s) => !s.occupier);
  for (const s of all) {
    const pop = totalPopulation(s);
    people += pop;
    weighted += pop * s.unrest;
    sum += s.unrest;
  }
  if (!people) return 0;
  return clamp((weighted / people + sum / all.length) / 2 + noblesUnrest(state, world) + leviesUnrest(state, world), 0, 100);
}

// Men taken from their work for the levies: the families left short-handed
// grumble while they are away (a point for every `levyPer` men under arms).
function leviedMen(state) {
  return (state.armies ?? []).filter((a) => a.side === TEMERIA && a.folk).reduce((v, a) => v + (a.levyMen ?? 0), 0);
}
function leviesUnrest(state, world) {
  const per = C(world)?.unrest.levyPer;
  return per ? Math.floor(leviedMen(state) / per) : 0;
}

function noblesUnrest(state, world) {
  const c = C(world)?.unrest;
  const houses = Object.values(state.houses ?? {});
  if (!c || !houses.length) return 0;
  const loyalty = houses.reduce((a, h) => a + h.loyalty, 0) / houses.length;
  return Math.max(0, 50 - loyalty) * c.nobles + houses.filter((h) => h.rebel).length * c.rebel;
}

export function stepMetersDay(state, world) {
  if (!C(world)) return;
  state.unrest = realmUnrest(state, world);
}

// ---- The month ----

export function monthlyMeters(state, world, rng) {
  const c = C(world);
  if (!c) return;
  const m = meters(state);
  const month = dateOf(state.day).month;
  const season = seasonOf(state.day);
  const live = Object.entries(state.settlements).filter(([, s]) => !s.occupier);
  const people = live.reduce((a, [, s]) => a + totalPopulation(s), 0) || 1;
  const tally = state.threats?.tally ?? { cleared: 0, raids: 0 };
  const cleared = Math.max(0, tally.cleared - (m.last.cleared ?? 0));
  const raids = Math.max(0, tally.raids - (m.last.raids ?? 0));

  // ---- Trust ----
  const t = c.trust;
  nudge(state, world, 'trust', ((t.rest - state.trust) * t.pull), 'Time');
  const hungry = live.reduce((a, [, s]) => a + totalPopulation(s) * (s.hunger ?? 0), 0) / people;
  if (hungry > 0.01) nudge(state, world, 'trust', -hungry * t.hunger, 'Hunger');
  if ((state.labour?.short ?? 0) > 0.05) nudge(state, world, 'trust', -state.labour.short * t.cold, 'Cold hearths');
  if (season === 'winter') {
    const need = live.reduce((a, [, s]) => a + foodNeed(world, s, season), 0) || 1;
    if (realmStock(state).food / need >= t.winterStoresDays) nudge(state, world, 'trust', t.winterStores, 'Full granaries through the winter');
  }
  if (cleared) nudge(state, world, 'trust', cleared * t.cleared, 'Threats cleared');
  if (raids) {
    const answered = (state.forces?.companies ?? []).some((x) => x.task?.threat);
    nudge(state, world, 'trust', -Math.min(t.raidsCap ?? 99, raids * (t.raided + (answered ? 0 : t.raidedUnanswered))), answered ? 'Raids on our villages' : 'Raids left unanswered');
  }
  let mending = 0;
  let ruined = 0;
  for (const [, s] of live) {
    mending += Object.keys(s.repair ?? {}).length;
    // Only what was broken in this reign (old abandoned workings do not count).
    for (const [b, v] of Object.entries(s.cond ?? {})) if (v < 35 && (s.worn?.[b]?.day ?? 0) > 0 && !s.repair?.[b]) ruined += 1;
  }
  if (mending) nudge(state, world, 'trust', Math.min(2, mending * t.repairs), 'Repairs under way');
  if (ruined) nudge(state, world, 'trust', -Math.min(3, ruined * t.ruined), 'Works left in ruins');
  for (const [law, name] of [['tax_towns', 'the towns'], ['tax_peasants', 'the villages']]) {
    const opt = state.laws[law]?.option;
    const v = t.taxes[opt] ?? 0;
    if (v) nudge(state, world, 'trust', v, `${opt === 'heavy' ? 'Heavy' : 'Light'} taxes on ${name}`);
  }
  const levied = (state.armies ?? []).filter((a) => a.side === TEMERIA && a.folk).reduce((v, a) => v + (a.levyMen ?? 0), 0);
  if (levied) nudge(state, world, 'trust', -(levied / people) * t.levies, 'Men taken for the levies');
  const fx = lawEffects(state, world).trust + realmEffect(state, world, 'trust');
  if (fx) nudge(state, world, 'trust', fx, fx > 0 ? 'Laws and works the folk welcome' : 'Laws the folk resent');

  // ---- Dread ----
  const d = c.dread;
  const towns = live.map(([id]) => world.byId[id]);
  const nearTown = (p) => towns.some((st) => Math.hypot(st.x - p.x, st.y - p.y) < d.near);
  let target = d.start;
  const parts = {};
  const add = (why, v) => { if (v) { target += v; parts[why] = (parts[why] ?? 0) + v; } };
  for (const th of state.threats?.list ?? []) {
    if (th.abroad || !(th.sighted || th.campSeen)) continue;
    const p = th.band ?? th;
    if (!nearTown(p)) continue;
    if (th.kind === 'monsters') add('Beasts near our towns', d.monster);
    else if (th.kind === 'scoiatael') add("Scoia'tael in the woods", d.scoiatael);
    else add('Bandit camps near our towns', d.camp);
  }
  add('Plague', live.filter(([, s]) => (s.plague ?? 0) > state.day).length * d.plague);
  add('Enemy armies on our soil', (state.armies ?? []).filter((a) => a.side !== TEMERIA && hostile(state, TEMERIA, a.side) && (state.settlements[a.at] || state.settlements[a.to])).length * d.enemyArmy);
  add('Towns sacked', live.filter(([, s]) => (s.smoulder ?? 0) > state.day || (s.sacked ?? 0) > state.day).length * d.sacked);
  add('Refugees on the roads', (state.conquest?.exodus ?? []).filter((e) => e.until > state.day).length * d.refugees);
  const patrols = state.forces ? patrolNodes(state, world).size : 0;
  if (patrols) add('Patrols on the roads', -Math.min(10, patrols * d.patrol));
  const garrison = live.reduce((a, [, s]) => a + s.garrison, 0);
  add('Garrisons in the towns', -Math.min(10, garrison / d.garrisonPer));
  target = clamp(target, 0, 100);
  state.dread = clamp(state.dread + (target - state.dread) * d.drift, 0, 100);
  // Each cause is credited with its own pull this month.
  for (const [why, v] of Object.entries(parts)) m.month.dread[why] = (m.month.dread[why] ?? 0) + v * d.drift;
  if (cleared) nudge(state, world, 'dread', -cleared * d.cleared, 'Threats cleared');
  nudge(state, world, 'dread', -Math.min(d.decay, state.dread), 'Time');

  // ---- What the meters do ----
  // Low Trust: people drift away, the works go slack, levies slip off.
  if (state.trust < t.lowBelow) {
    const k = (t.lowBelow - state.trust) / t.lowBelow;
    let gone = 0;
    for (const [, s] of live) {
      const n = Math.round(s.population.human * t.lowDrift * k);
      s.population.human -= n;
      gone += n;
      s.prosperity = clamp(s.prosperity - t.lowOutput * 10 * k, 0, 100);
    }
    if (gone > 20) say(state, `The folk lose faith in the crown: ${gone} people leave the realm this month, and the works go slack.`);
    for (const a of state.armies ?? []) {
      if (a.side !== TEMERIA || !a.folk || !a.levyMen) continue;
      const n = Math.round(a.levyMen * t.lowDesert * k);
      a.soldiers = Math.max(0, a.soldiers - n);
      a.levyMen -= n;
    }
  }
  // High Unrest: strikes stop the works in the angriest town; then a house
  // turns against the crown (and from there, revolt, as before).
  const u = c.unrest;
  if (state.unrest > u.highAbove) {
    const [id, s] = live.reduce((best, x) => (!best || x[1].unrest > best[1].unrest ? x : best), null) ?? [];
    if (s) {
      s.strike = state.day + u.strikeDays;
      say(state, `Strike in ${world.byId[id].name}: the workshops stand idle and the guilds will not answer the crown.`);
    }
  }
  if (state.unrest > u.turnAbove) {
    const h = Object.entries(state.houses ?? {}).filter(([, x]) => !x.rebel).sort((a, b) => a[1].loyalty - b[1].loyalty)[0];
    if (h) {
      h[1].grievance = (h[1].grievance ?? 0) + u.turnGrievance;
      say(state, `With the realm in uproar, ${world.houses.houses[h[0]].name} turns its back on Vizima.`);
    }
  }
  // High Dread: villages empty towards walled towns, the roads go quiet,
  // and the folk turn to the Eternal Fire; low Dread, busy roads.
  if (state.dread > d.highAbove) {
    const k = (state.dread - d.highAbove) / (100 - d.highAbove);
    let fled = 0;
    for (const [id, s] of live) {
      if (world.byId[id].type !== 'village') continue;
      const walled = live.filter(([w]) => hasWalls(state, world, w)).map(([w]) => w);
      if (!walled.length) break;
      const to = walled.reduce((b, w) => (!b || Math.hypot(world.byId[w].x - world.byId[id].x, world.byId[w].y - world.byId[id].y) < Math.hypot(world.byId[b].x - world.byId[id].x, world.byId[b].y - world.byId[id].y) ? w : b), null);
      const n = Math.round(s.population.human * d.flee * k * 10) / 10;
      const whole = Math.floor(n);
      if (whole <= 0) continue;
      s.population.human -= whole;
      state.settlements[to].population.human += whole;
      fled += whole;
    }
    if (fled > 10) say(state, `Fear empties the villages: ${fled} people crowd behind the walls of the towns.`);
    for (const [, s] of live) {
      if (!s.faith) continue;
      const shift = d.fire * k;
      s.faith.eternal_fire = clamp(s.faith.eternal_fire + shift, 0, 100);
      for (const f of Object.keys(s.faith)) if (f !== 'eternal_fire') s.faith[f] = Math.max(0, s.faith[f] - shift / Math.max(1, Object.keys(s.faith).length - 1));
    }
    m.trade = 1 - d.tradeCut * k;
  } else m.trade = state.dread < d.lowBelow ? 1 + d.tradeBoost : 1;

  // ---- Reasons: the biggest causes of each meter's change, biggest first ----
  for (const meter of METERS) {
    m.reasons[meter] = Object.entries(m.month[meter]).filter(([, v]) => Math.abs(v) >= 0.05)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 5).map(([why, v]) => ({ why, v: Math.round(v * 10) / 10 }));
    m.month[meter] = {};
  }
  m.reasons.unrest = unrestPressures(state, world).concat(m.reasons.unrest).slice(0, 5);
  m.last = { cleared: tally.cleared, raids: tally.raids };
  void rng;
}

// What keeps Unrest where it is: the pressures on the towns now, biggest
// first (heavy taxes, men taken from their work, harsh laws, persecution,
// overcrowding and refugees, the great houses' grievances).
export function unrestPressures(state, world) {
  const out = [];
  const heavy = ['tax_towns', 'tax_peasants', 'tax_nobles'].filter((l) => state.laws[l]?.option === 'heavy').length;
  if (heavy) out.push({ why: `Heavy taxes on ${heavy === 1 ? 'one estate' : `${heavy} estates`}`, v: heavy * 3 });
  const levied = leviesUnrest(state, world);
  if (levied) out.push({ why: 'Men taken from their work for the levies', v: levied });
  // Laws that set a people or a faith against the crown (through the
  // tension they stir in the towns).
  const HARSH = { nonhumans: ['restricted', 'expulsion'], old_ways: ['suppressed'], mages: ['banished'] };
  const harsh = Object.entries(HARSH).filter(([l, opts]) => opts.includes(state.laws[l]?.option)).length;
  if (harsh) out.push({ why: 'Harsh laws and the persecution of a people', v: harsh * 4 });
  const crowded = Object.values(state.settlements).filter((s) => !s.occupier && (s.crowded ?? 0) > 0).length;
  const refugees = (state.conquest?.exodus ?? []).filter((e) => e.until > state.day).length;
  if (crowded || refugees) out.push({ why: 'Overcrowding and refugees', v: crowded + refugees * 2 });
  const nobles = noblesUnrest(state, world);
  if (nobles >= 1) out.push({ why: "The great houses' grievances", v: Math.round(nobles) });
  // And the angriest towns, by name.
  const angry = Object.entries(state.settlements).filter(([, x]) => !x.occupier && x.unrest >= 35).sort((a, b) => b[1].unrest - a[1].unrest).slice(0, 2);
  for (const [id, x] of angry) out.push({ why: `Anger in ${world.byId[id].name}`, v: Math.round((x.unrest - 30) / 5) });
  return out.sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).map((x) => ({ ...x, pressure: true }));
}

function say(state, text) {
  addDispatch(state, text, 'realm');
}
