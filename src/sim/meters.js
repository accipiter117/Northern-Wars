// The crown's hold on the realm (M24 B), as the kings of the North held it.
//  Love (0 to 100): the people's affection for the crown. It builds slowly
//    and lasts: full granaries, alms, feasts, light taxes, threats cleared,
//    victories, repairs and a royal progress raise it; hunger, cold, raids
//    left unanswered, defeats, sacked towns, heavy levies and broken
//    promises lower it.
//  Fear (0 to 100): the people's fear of the crown. It rises quickly with
//    hangings, gibbets, crushed revolts, the king's riders, hostages and
//    harsh laws; it fades of itself unless renewed, and collapses after a
//    defeat on our soil, a revolt that succeeds or garrisons withdrawn.
//  Authority, derived and never set: the higher of Love and Fear plus a
//    quarter of the lower. A loved king and a feared king can both rule;
//    one who is neither cannot. It decides how much tax is gathered, how
//    many answer the muster, whether lords obey, whether a troubled town
//    riots, and deposition.
//  Unrest: anger at the crown, the realm view of the towns' unrest and the
//    lords' mood. 30 to 50 is the grumbling of a grim land and costs
//    nothing; strikes, riots and revolt follow high Unrest only when
//    Authority is low.
// Each month the biggest causes of each meter's change are kept as its
// reasons.
import { clamp, addDispatch } from './realm.js';
import { seasonOf } from './calendar.js';
import { totalPopulation } from './state.js';
import { foodNeed, realmStock, realmEffect } from './economy.js';
import { signed, lawDef } from './book.js';
import { destroyThreat, threatName } from './threats.js';
import { lawEffects } from './laws.js';
import { TEMERIA, hasWalls } from './conflict.js';
import { sendFigure } from './figures.js';

const C = (world) => world.meters;
const METERS = ['love', 'fear', 'unrest'];

export function defaultMeters() {
  return {
    month: { love: {}, fear: {}, unrest: {} }, reasons: { love: [], fear: [], unrest: [] },
    last: { cleared: 0, raids: 0 }, trade: 1, hanged: {}, gibbets: {}, acted: {}, feastUntil: 0, progress: null,
  };
}

const meters = (state) => {
  const m = (state.meters ??= defaultMeters());
  m.hanged ??= {};
  m.gibbets ??= {};
  m.acted ??= {};
  return m;
};

// Authority: the higher of Love and Fear, and a quarter of the lower.
export function authority(state, world) {
  const share = C(world)?.authority?.lowerShare ?? 0.25;
  const l = state.love ?? 50;
  const f = state.fear ?? 0;
  return clamp(Math.max(l, f) + Math.min(l, f) * share, 0, 100);
}

// How much of the tax due is gathered: all of it from Authority `taxAt`,
// down to `taxFloor` of it with none.
export function taxCollected(state, world) {
  const a = C(world)?.authority;
  if (!a) return 1;
  return a.taxFloor + (1 - a.taxFloor) * Math.min(1, authority(state, world) / a.taxAt);
}

// How many answer the muster, against the full call: fewer under a weak
// crown, and in a war a loved crown gets volunteers on top.
export function musterAnswer(state, world, atWar = false) {
  const a = C(world)?.authority;
  if (!a) return 1;
  const f = C(world).flavour;
  let k = a.levyFloor + (1 - a.levyFloor) * Math.min(1, authority(state, world) / a.levyAt);
  if (atWar && (state.love ?? 0) > f.lovedAbove) k *= 1 + f.volunteers * ((state.love - f.lovedAbove) / (100 - f.lovedAbove));
  return k;
}

// The quiet sabotage of a crown feared but not loved: the works give a
// little less.
export function sabotage(state, world) {
  const f = C(world)?.flavour;
  if (!f) return 0;
  return (state.fear ?? 0) > f.fearedAbove && (state.love ?? 50) < f.sabotageLoveBelow ? f.sabotage : 0;
}

// What Love and Fear do to a town's settled mood: a loved crown's towns
// are calmer, a feared crown's quieter. Points off its unrest target.
export function crownCalm(state, world) {
  const f = C(world)?.flavour;
  if (!f) return 0;
  const love = state.love ?? 0;
  const fear = state.fear ?? 0;
  return (love > f.lovedAbove ? (love - f.lovedAbove) * f.loveCalm * 2 : 0) + (fear > f.fearedAbove ? (fear - f.fearedAbove) * f.fearCalm * 2 : 0);
}

// Whether a troubled town riots: only when Authority is low.
export function canRiot(state, world) {
  const a = C(world)?.authority;
  return !a || authority(state, world) < a.riotBelow;
}

// Move a meter by `v` for a reason, kept for the month's reasons. Unrest is
// the towns' anger: moving it moves every town of ours alike.
export function nudge(state, world, meter, v, why) {
  if (!v || !METERS.includes(meter)) return;
  if (meter === 'unrest') {
    for (const s of Object.values(state.settlements)) if (!s.occupier) s.unrest = clamp(s.unrest + v, 0, 100);
    state.unrest = realmUnrest(state, world);
  } else state[meter] = clamp((state[meter] ?? 0) + v, 0, 100);
  const m = meters(state).month[meter];
  m[why] = (m[why] ?? 0) + v;
}

// Fear collapses (a lost battle on our soil, a revolt that succeeds,
// garrisons withdrawn), and the anger it held down breaks out.
export function fearCollapse(state, world, amount, why) {
  const was = state.fear ?? 0;
  nudge(state, world, 'fear', -Math.min(was, amount), why);
  const lost = was - state.fear;
  const jump = lost * (C(world)?.fear.collapseUnrest ?? 0);
  if (jump >= 1) nudge(state, world, 'unrest', jump, 'Fear of the crown broken');
}

// The realm's Unrest: the towns' unrest, half by the people living under it
// and half by place, with the great houses' grievances and the levies on top.
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

function noblesUnrest(state, world) {
  const c = C(world)?.unrest;
  const houses = Object.values(state.houses ?? {});
  if (!c || !houses.length) return 0;
  const loyalty = houses.reduce((a, h) => a + h.loyalty, 0) / houses.length;
  return Math.max(0, 50 - loyalty) * c.nobles + houses.filter((h) => h.rebel).length * c.rebel;
}

// Men taken from their work for the levies: a point for every `levyPer`.
function leviedMen(state) {
  return (state.armies ?? []).filter((a) => a.side === TEMERIA && a.folk).reduce((v, a) => v + (a.levyMen ?? 0), 0);
}
function leviesUnrest(state, world) {
  const per = C(world)?.unrest.levyPer;
  return per ? Math.floor(leviedMen(state) / per) : 0;
}

// Beasts and bandit camps seen near a town of ours raise its anger (what
// Dread carried before M24 B); gibbets at its crossroads and patrols on
// its roads calm it. Points on its unrest target.
export function threatUnrest(state, world, id) {
  const u = C(world)?.unrest;
  const st = world.byId[id];
  if (!u || !st) return 0;
  let v = 0;
  for (const th of state.threats?.list ?? []) {
    if (th.abroad || !(th.sighted || th.campSeen)) continue;
    const p = th.band ?? th;
    if (Math.hypot(p.x - st.x, p.y - st.y) > u.near) continue;
    v += th.kind === 'monsters' ? u.beast : u.camp;
  }
  v = Math.min(u.threatCap, v);
  const m = state.meters;
  if (v && (m?.gibbets?.[id] ?? 0) > state.day) v *= C(world).acts.gibbets.roads;
  return v;
}

export function stepMetersDay(state, world) {
  if (!C(world)) return;
  state.unrest = realmUnrest(state, world);
  stepProgress(state, world);
}

// ---- The crown's own acts ----

const ACT_NAMES = {
  hang: 'Hang the ringleaders', gibbets: 'Gibbets at the crossroads', feast: 'A feast and a tournament', progress: 'A royal progress',
  pardon: 'A royal pardon', granaries: 'Open the granaries', mage: 'Summon the court mage', witchhunt: 'A witch hunt',
};
// Acts aimed at one town of ours.
const AT_TOWN = ['hang', 'gibbets', 'pardon', 'granaries', 'mage', 'witchhunt'];

// What the court mage would deal with at a town (M26): plague there, or
// the nearest beast lair within reach.
function mageTarget(state, world, id) {
  const s = state.settlements[id];
  if ((s.plague ?? 0) > state.day) return { plague: true };
  const at = world.byId[id];
  const r = C(world).acts.mage.radius;
  const t = (state.threats?.list ?? []).filter((x) => x.kind === 'monsters' && !x.abroad && Math.hypot(x.x - at.x, x.y - at.y) <= r)
    .sort((a, b) => Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(b.x - at.x, b.y - at.y))[0];
  return t ? { threat: t } : null;
}

// The Scoia'tael within the inquisition's reach of a town (M26).
function huntedElves(state, world, id) {
  const at = world.byId[id];
  const r = C(world).acts.witchhunt.radius;
  return (state.threats?.list ?? []).filter((x) => x.kind === 'scoiatael' && !x.abroad && Math.hypot((x.band?.x ?? x.x) - at.x, (x.band?.y ?? x.y) - at.y) <= r);
}
export { ACT_NAMES };

export function canAct(state, world, kind, id = null) {
  const a = C(world)?.acts?.[kind];
  if (!a) return { ok: false, reason: 'Unknown act.' };
  const m = meters(state);
  // Some acts are unlocked by the Book of Laws (M26).
  if (a.needs && !signed(state, a.needs)) return { ok: false, reason: `Needs the law ${lawDef(world, a.needs)?.law.name ?? a.needs}.`, locked: true };
  if (a.coin && state.treasury < a.coin) return { ok: false, reason: `Needs ${a.coin} crowns.` };
  if (AT_TOWN.includes(kind)) {
    const s = state.settlements[id];
    if (!s || s.occupier) return { ok: false, reason: 'Choose a place of ours.' };
  }
  if (kind === 'mage' && !mageTarget(state, world, id)) return { ok: false, reason: 'Neither plague nor a beast\'s lair there for the mage.' };
  if (kind === 'witchhunt' && !huntedElves(state, world, id).length) return { ok: false, reason: 'No Scoia\'tael within reach of it.' };
  if (kind === 'granaries' && !(state.settlements[id].hunger > 0)) return { ok: false, reason: 'No one goes hungry there.' };
  if (kind === 'hang' || kind === 'gibbets') {
    // m.hanged holds the day its gibbet comes down, `days` after the hanging.
    if (kind === 'hang' && id in m.hanged && m.hanged[id] - a.days + a.cooldown > state.day) return { ok: false, reason: 'The last hanging there is too fresh.' };
    if (kind === 'gibbets' && (m.gibbets[id] ?? 0) > state.day) return { ok: false, reason: 'The gibbets there still stand.' };
    return { ok: true };
  }
  const last = m.acted[kind] ?? -Infinity;
  if (state.day - last < a.cooldown) return { ok: false, reason: `Not again for ${a.cooldown - (state.day - last)} days.` };
  if (kind === 'progress' && m.progress) return { ok: false, reason: 'The king is already on progress.' };
  return { ok: true };
}

// How long an act rests, and how much of that rest is left (M26 D), for
// the ring round its button.
export function actRest(state, world, kind, id = null) {
  const a = C(world)?.acts?.[kind];
  const m = state.meters;
  if (!a || !m) return { left: 0, total: 0 };
  if (kind === 'hang') return { left: id in (m.hanged ?? {}) ? Math.max(0, m.hanged[id] - a.days + a.cooldown - state.day) : 0, total: a.cooldown };
  if (kind === 'gibbets') return { left: Math.max(0, (m.gibbets?.[id] ?? 0) - state.day), total: a.days };
  return { left: Math.max(0, (m.acted?.[kind] ?? -Infinity) + (a.cooldown ?? 0) - state.day), total: a.cooldown ?? 0 };
}

export function doAct(state, world, kind, id = null) {
  const a = C(world).acts[kind];
  const m = meters(state);
  if (a.coin) state.treasury -= a.coin;
  const name = id ? world.byId[id].name : '';
  if (kind === 'hang') {
    // The day the gibbet goes up; it stands for `days`.
    m.hanged[id] = state.day + a.days;
    nudge(state, world, 'fear', a.fear, 'Hangings');
    nudge(state, world, 'love', a.love, 'Hangings');
    const s = state.settlements[id];
    s.unrest = clamp(s.unrest + a.unrest, 0, 100);
    state.unrest = realmUnrest(state, world);
    say(state, `The ringleaders are hanged in the square at ${name}. The town is quiet, and watches the crown.`);
  } else if (kind === 'gibbets') {
    m.gibbets[id] = state.day + a.days;
    nudge(state, world, 'fear', a.fear, 'Gibbets at the crossroads');
    say(state, `Gibbets go up at the crossroads round ${name}, and the crows gather. The roads are quieter.`);
  } else if (kind === 'feast') {
    m.acted.feast = state.day;
    m.feastUntil = state.day + a.days;
    nudge(state, world, 'love', a.love, 'A feast and a tournament');
    if (state.opinion?.nobles !== undefined) state.opinion.nobles = clamp(state.opinion.nobles + a.nobles, 0, 100);
    say(state, 'Vizima feasts: tables in the squares, a tournament in the lists, and the king\'s health drunk in every tavern.');
  } else if (kind === 'pardon') {
    m.acted.pardon = state.day;
    const s = state.settlements[id];
    s.unrest = clamp(s.unrest + a.unrest, 0, 100);
    state.unrest = realmUnrest(state, world);
    nudge(state, world, 'love', a.love, 'Royal pardons');
    say(state, `The king pardons the petty offenders of ${name}. The gaol empties, and the town toasts his mercy.`);
  } else if (kind === 'granaries') {
    m.acted.granaries = state.day;
    const s = state.settlements[id];
    s.stock.food += foodNeed(world, s, seasonOf(state.day)) * a.days;
    s.hunger = 0;
    say(state, `The royal granaries at ${name} are thrown open. No one there goes hungry this month.`);
  } else if (kind === 'mage') {
    m.acted.mage = state.day;
    const t = mageTarget(state, world, id);
    for (const [g, v] of Object.entries(a.opinion ?? {})) if (state.opinion?.[g] !== undefined) state.opinion[g] = clamp(state.opinion[g] + v, 0, 100);
    if (t.plague) {
      const s = state.settlements[id];
      s.plague = 0;
      s.quarantine = 0;
      say(state, `The court mage walks the sickhouses of ${name}. By morning the fever has broken.`);
    } else {
      const what = threatName(world, t.threat).toLowerCase();
      destroyThreat(state, world, t.threat);
      say(state, `The court mage rides out from ${name}; the ${what} trouble the roads no more.`);
    }
  } else if (kind === 'witchhunt') {
    m.acted.witchhunt = state.day;
    const gone = huntedElves(state, world, id);
    for (const t of gone) destroyThreat(state, world, t);
    nudge(state, world, 'fear', a.fear, 'Witch hunts');
    for (const [g, v] of Object.entries(a.opinion ?? {})) if (state.opinion?.[g] !== undefined) state.opinion[g] = clamp(state.opinion[g] + v, 0, 100);
    say(state, `The inquisition scours the forests round ${name}: ${gone.length} Scoia'tael hideout${gone.length === 1 ? '' : 's'} burned, and every elf in the district questioned.`);
  } else if (kind === 'progress') {
    m.acted.progress = state.day;
    // The greatest towns of ours, nearest first from Vizima.
    const cap = world.kingdom.capital;
    const towns = Object.keys(state.settlements).filter((x) => x !== cap && !state.settlements[x].occupier && ['city', 'town'].includes(world.byId[x].type))
      .sort((x, y) => totalPopulation(state.settlements[y]) - totalPopulation(state.settlements[x])).slice(0, a.towns);
    const step = Math.max(1, Math.floor(a.days / (towns.length + 1)));
    m.progress = { start: state.day, end: state.day + a.days, towns, step, visited: [] };
    const from = cap;
    // The first stretch of road; each next one sets off as a town is reached.
    if (towns[0]) sendFigure(state, world, { kind: 'progress', from, to: towns[0], days: step, name: 'The king', about: 'on a royal progress' });
    say(state, `The king sets out on a royal progress through ${towns.map((t) => world.byId[t].name).join(', ')}. For a month the court travels with him.`);
  }
}

// While the king is on progress he is away from court (no decrees), and
// each town he reaches loves him a little more and calms.
function stepProgress(state, world) {
  const m = state.meters;
  const p = m?.progress;
  if (!p) return;
  const a = C(world).acts.progress;
  const due = Math.min(p.towns.length, Math.floor((state.day - p.start) / p.step));
  while (p.visited.length < due) {
    const t = p.towns[p.visited.length];
    p.visited.push(t);
    const s = state.settlements[t];
    if (s && !s.occupier) {
      s.unrest = clamp(s.unrest + a.unrest, 0, 100);
      nudge(state, world, 'love', a.love, 'A royal progress');
    }
    // The next stretch of road, as the train sets off again.
    const next = p.towns[p.visited.length];
    if (next) sendFigure(state, world, { kind: 'progress', from: t, to: next, days: p.step, name: 'The king', about: 'on a royal progress' });
  }
  if (state.day >= p.end) {
    m.progress = null;
    sendFigure(state, world, { kind: 'progress', from: p.towns.at(-1) ?? world.kingdom.capital, to: world.kingdom.capital, days: p.step, name: 'The king', about: 'home from his progress' });
    say(state, 'The king is home from his progress, and the court is his again.');
  }
}

// The king away from court: on progress, or on pilgrimage (M26 C).
export function onProgress(state) {
  return !!state.meters?.progress || (state.faiths?.pilgrimage?.until ?? 0) > state.day;
}

// ---- The month ----

export function monthlyMeters(state, world, rng) {
  const c = C(world);
  if (!c) return;
  const m = meters(state);
  const season = seasonOf(state.day);
  const live = Object.entries(state.settlements).filter(([, s]) => !s.occupier);
  const people = live.reduce((a, [, s]) => a + totalPopulation(s), 0) || 1;
  const tally = state.threats?.tally ?? { cleared: 0, raids: 0 };
  const cleared = Math.max(0, tally.cleared - (m.last.cleared ?? 0));
  const raids = Math.max(0, tally.raids - (m.last.raids ?? 0));

  // ---- Love ----
  const t = c.love;
  nudge(state, world, 'love', (t.rest - state.love) * t.pull, 'Time');
  const hungry = live.reduce((a, [, s]) => a + totalPopulation(s) * (s.hunger ?? 0), 0) / people;
  if (hungry > 0.01) nudge(state, world, 'love', -hungry * t.hunger, 'Hunger');
  if ((state.labour?.short ?? 0) > 0.05) nudge(state, world, 'love', -state.labour.short * t.cold, 'Cold hearths');
  if (season === 'winter') {
    const need = live.reduce((a, [, s]) => a + foodNeed(world, s, season), 0) || 1;
    if (realmStock(state).food / need >= t.winterStoresDays) nudge(state, world, 'love', t.winterStores, 'Full granaries through the winter');
  }
  if (cleared) nudge(state, world, 'love', cleared * t.cleared, 'Threats cleared');
  if (raids) {
    const answered = (state.forces?.companies ?? []).some((x) => x.task?.threat);
    nudge(state, world, 'love', -Math.min(t.raidsCap ?? 99, raids * (t.raided + (answered ? 0 : t.raidedUnanswered))), answered ? 'Raids on our villages' : 'Raids left unanswered');
  }
  let mending = 0;
  let ruined = 0;
  for (const [, s] of live) {
    mending += Object.keys(s.repair ?? {}).length;
    for (const [b, v] of Object.entries(s.cond ?? {})) if (v < 35 && (s.worn?.[b]?.day ?? 0) > 0 && !s.repair?.[b]) ruined += 1;
  }
  if (mending) nudge(state, world, 'love', Math.min(2, mending * t.repairs), 'Repairs under way');
  if (ruined) nudge(state, world, 'love', -Math.min(3, ruined * t.ruined), 'Works left in ruins');
  for (const [law, name] of [['tax_towns', 'the towns'], ['tax_peasants', 'the villages']]) {
    const opt = state.laws[law]?.option;
    const v = t.taxes[opt] ?? 0;
    if (v) nudge(state, world, 'love', v, `${opt === 'heavy' ? 'Heavy' : 'Light'} taxes on ${name}`);
  }
  const levied = leviedMen(state);
  if (levied) nudge(state, world, 'love', -(levied / people) * t.levies, 'Men taken for the levies');
  const fx = lawEffects(state, world).love + realmEffect(state, world, 'love');
  if (fx) nudge(state, world, 'love', fx, fx > 0 ? 'Alms, laws and works the folk welcome' : 'Laws the folk resent');

  // ---- Fear ----
  const f = c.fear;
  // It fades of itself unless renewed.
  nudge(state, world, 'fear', -state.fear * f.fade, 'Fading with time');
  const fearLaws = lawEffects(state, world).fear + realmEffect(state, world, 'fear');
  if (fearLaws) nudge(state, world, 'fear', fearLaws, 'Harsh laws and the king\'s riders');
  const standing = Object.values(m.gibbets).filter((until) => until > state.day).length;
  if (standing) nudge(state, world, 'fear', standing * c.acts.gibbets.monthly, 'Gibbets at the crossroads');
  for (const [id, until] of Object.entries(m.gibbets)) if (until <= state.day) delete m.gibbets[id];
  for (const [id, until] of Object.entries(m.hanged)) if (until <= state.day) delete m.hanged[id];

  // ---- What the meters do ----
  // Little Love: people drift away, and the towns sour.
  if (state.love < t.lowBelow) {
    const k = (t.lowBelow - state.love) / t.lowBelow;
    let gone = 0;
    for (const [, s] of live) {
      const n = Math.round(s.population.human * t.lowDrift * k);
      s.population.human -= n;
      gone += n;
    }
    if (gone > 20) say(state, `The folk have no love for the crown: ${gone} people leave the realm this month.`);
  }
  // A crown its lords think soft: their grievances grow a little when Fear is low.
  const fl = c.flavour;
  if (state.fear < fl.softFearBelow) {
    for (const h of Object.values(state.houses ?? {})) if (!h.rebel) h.grievance = (h.grievance ?? 0) + fl.softGrievance;
  }
  // High Unrest under a weak crown: strikes stop the works in the angriest
  // town; then a house turns against the crown; villages empty toward the
  // walled towns and the roads go quiet. Under a strong crown, nothing.
  const u = c.unrest;
  const weak = canRiot(state, world);
  if (state.unrest > u.highAbove && weak) {
    const [id, s] = live.reduce((best, x) => (!best || x[1].unrest > best[1].unrest ? x : best), null) ?? [];
    if (s) {
      s.strike = state.day + u.strikeDays;
      say(state, `Strike in ${world.byId[id].name}: the workshops stand idle and the guilds will not answer the crown.`);
    }
    const k = (state.unrest - u.highAbove) / (100 - u.highAbove);
    let fled = 0;
    const walled = live.filter(([w]) => hasWalls(state, world, w)).map(([w]) => w);
    for (const [vid, s2] of live) {
      if (world.byId[vid].type !== 'village' || !walled.length) continue;
      const to = walled.reduce((b, w) => (!b || Math.hypot(world.byId[w].x - world.byId[vid].x, world.byId[w].y - world.byId[vid].y) < Math.hypot(world.byId[b].x - world.byId[vid].x, world.byId[b].y - world.byId[vid].y) ? w : b), null);
      const whole = Math.floor(s2.population.human * u.flee * k);
      if (whole <= 0) continue;
      s2.population.human -= whole;
      state.settlements[to].population.human += whole;
      fled += whole;
    }
    if (fled > 10) say(state, `The countryside is in uproar: ${fled} people crowd behind the walls of the towns.`);
    // The folk turn to the Eternal Fire: what it gains the other faiths lose
    // in proportion, so the whole still makes a hundred.
    for (const [, s2] of live) {
      if (!s2.faith) continue;
      const rest = Object.keys(s2.faith).filter((g) => g !== 'eternal_fire');
      const others = rest.reduce((a, g) => a + s2.faith[g], 0);
      const take = Math.min(u.fire * k, others);
      if (take <= 0) continue;
      s2.faith.eternal_fire += take;
      for (const g of rest) s2.faith[g] *= (others - take) / others;
    }
    m.trade = 1 - u.tradeCut * k;
  } else m.trade = state.unrest < u.calmBelow ? 1 + u.tradeBoost : 1;
  if (state.unrest > u.turnAbove && weak) {
    const h = Object.entries(state.houses ?? {}).filter(([, x]) => !x.rebel).sort((a, b) => a[1].loyalty - b[1].loyalty)[0];
    if (h) {
      h[1].grievance = (h[1].grievance ?? 0) + u.turnGrievance;
      say(state, `With the realm in uproar and the crown too weak to stop it, ${world.houses.houses[h[0]].name} turns its back on Vizima.`);
    }
  }

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
// overcrowding and refugees, beasts and bandits near the towns, the great
// houses' grievances).
export function unrestPressures(state, world) {
  const out = [];
  const heavy = ['tax_towns', 'tax_peasants', 'tax_nobles'].filter((l) => state.laws[l]?.option === 'heavy').length;
  if (heavy) out.push({ why: `Heavy taxes on ${heavy === 1 ? 'one estate' : `${heavy} estates`}`, v: heavy * 3 });
  const levied = leviesUnrest(state, world);
  if (levied) out.push({ why: 'Men taken from their work for the levies', v: levied });
  const HARSH = { nonhumans: ['restricted', 'expulsion'], old_ways: ['suppressed'], mages: ['banished'] };
  const harsh = Object.entries(HARSH).filter(([l, opts]) => opts.includes(state.laws[l]?.option)).length;
  if (harsh) out.push({ why: 'Harsh laws and the persecution of a people', v: harsh * 4 });
  const crowded = Object.values(state.settlements).filter((s) => !s.occupier && (s.crowded ?? 0) > 0).length;
  const refugees = (state.conquest?.exodus ?? []).filter((e) => e.until > state.day).length;
  if (crowded || refugees) out.push({ why: 'Overcrowding and refugees', v: crowded + refugees * 2 });
  const threats = Object.keys(state.settlements).filter((id) => !state.settlements[id].occupier).reduce((a, id) => a + threatUnrest(state, world, id), 0);
  if (threats >= 1) out.push({ why: 'Beasts and bandits near the towns', v: Math.round(threats / Math.max(1, Object.keys(state.settlements).length) * 10) / 10 || 1 });
  const nobles = noblesUnrest(state, world);
  if (nobles >= 1) out.push({ why: "The great houses' grievances", v: Math.round(nobles) });
  const angry = Object.entries(state.settlements).filter(([, x]) => !x.occupier && x.unrest >= 35).sort((a, b) => b[1].unrest - a[1].unrest).slice(0, 2);
  for (const [id, x] of angry) out.push({ why: `Anger in ${world.byId[id].name}`, v: Math.round((x.unrest - 30) / 5) });
  return out.sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).map((x) => ({ ...x, pressure: true }));
}

function say(state, text) {
  addDispatch(state, text, 'realm');
}

