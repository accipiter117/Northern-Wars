// The faiths as powers in the realm (M26 C). Each faith has a realm-wide
// Devotion (0 to 100) from how many follow it and how fervent they are, with
// five levels at 20, 40, 60, 80 and 100 that bring perks, and a power at
// level 3 (another at 5). The crown develops a faith with acts that cost coin
// and rest between uses; several faiths can rise at once, and rivals clash
// where both are strong. Per-town faith shares stay underneath and still
// matter locally. Numbers in data/devotion.json.
import { addDispatch, clamp } from './realm.js';
import { nudge } from './meters.js';
import { dateOf } from './calendar.js';
import { bookEffect, crownFaith, signed } from './book.js';
import { creditLimit } from './economy.js';
import { destroyThreat, threatName } from './threats.js';
import { nonhumanShare, realmFaith } from './culture.js';
import { atWar, TEMERIA } from './conflict.js';

const D = (world) => world.devotion;
const say = (state, text) => addDispatch(state, text, 'faith');
const FAITHS = (world) => Object.keys(D(world)?.faiths ?? {});

export function defaultFaiths(state, world) {
  const out = { devotion: {}, fervour: {}, acted: {}, lands: [], preachers: [], blessing: 0, belleteyn: 0, pilgrimage: null, festivals: {}, realms: {}, clashes: 0 };
  if (!D(world)) return out;
  const share = realmFaith(state);
  for (const f of FAITHS(world)) {
    out.devotion[f] = Math.round((share[f] ?? 0) * D(world).shareWeight * 10) / 10;
    out.fervour[f] = 0;
  }
  for (const [rid, lean] of Object.entries(D(world).realms?.lean ?? {})) {
    out.realms[rid] = Object.fromEntries(Object.entries(lean).map(([f, v]) => [f, Math.round(v * D(world).shareWeight + (D(world).realms.fervour?.[rid]?.[f] ?? 0))]));
  }
  return out;
}

export function faithsOf(state, world) {
  return (state.faiths ??= defaultFaiths(state, world));
}

export function faithLevel(state, world, f) {
  const d = state.faiths?.devotion?.[f] ?? 0;
  return (D(world)?.levels ?? []).filter((at) => d >= at).length;
}

// Every perk a faith has reached, in order.
export function perksOf(state, world, f) {
  const lv = faithLevel(state, world, f);
  return (D(world)?.faiths[f]?.perks ?? []).filter((p) => p.level <= lv);
}

// The sum of one effect over every faith's perks reached, and the blessings
// now running. Per-kind effects (unrest by kind of place) come back whole.
export function faithEffects(state, world) {
  const out = {};
  if (!D(world) || !state.faiths) return out;
  for (const f of FAITHS(world)) {
    for (const p of perksOf(state, world, f)) {
      for (const [k, v] of Object.entries(p.effects)) {
        if (typeof v === 'number') out[k] = (out[k] ?? 0) + v;
        else {
          out[k] ??= {};
          for (const [t, x] of Object.entries(v)) out[k][t] = (out[k][t] ?? 0) + x;
        }
      }
    }
  }
  const pw = D(world).faiths.melitele?.powers?.blessing;
  if (pw && (state.faiths.blessing ?? 0) > state.day) out.foodYield = (out.foodYield ?? 0) + pw.foodYield;
  const bt = D(world).faiths.old_ways?.powers?.belleteyn;
  if (bt && (state.faiths.belleteyn ?? 0) > state.day) out.growth = (out.growth ?? 0) + bt.growth;
  const fr = D(world).faiths.freya?.powers?.freya;
  if (fr && (state.faiths.freya ?? 0) > state.day) out.growth = (out.growth ?? 0) + fr.growth;
  return out;
}

export function faithEffect(state, world, key) {
  const v = faithEffects(state, world)[key];
  return typeof v === 'number' ? v : 0;
}

// ---- The month ----

export function monthlyFaiths(state, world, rng) {
  if (!D(world)) return;
  const F = faithsOf(state, world);
  const cfg = D(world);
  const share = realmFaith(state);
  const crown = crownFaith(state);
  // Grants of land keep a faith's fervour up; preachers turn their town.
  for (const g of F.lands) F.fervour[g.faith] = (F.fervour[g.faith] ?? 0) + cfg.acts.land.fervour;
  // Lebioda's faithful turn from a crown at war (M32 A).
  if (cfg.lebioda && F.fervour.lebioda !== undefined && atWar(state, TEMERIA)) F.fervour.lebioda = Math.max(0, F.fervour.lebioda - cfg.lebioda.warFade);
  greatSun(state, world);
  F.preachers = F.preachers.filter((p) => p.until > state.day);
  for (const p of F.preachers) shiftTown(state, p.town, p.faith, cfg.acts.preachers.share * 3);
  for (const f of FAITHS(world)) {
    F.fervour[f] = clamp((F.fervour[f] ?? 0) * (1 - cfg.fervourFade), 0, 100);
    const target = clamp((share[f] ?? 0) * cfg.shareWeight + F.fervour[f], 0, 100);
    const speed = cfg.drift * (f === crown ? 1 + bookEffect(state, world, 'faithGrowth') : 1);
    const before = faithLevel(state, world, f);
    F.devotion[f] = clamp((F.devotion[f] ?? 0) + (target - (F.devotion[f] ?? 0)) * speed, 0, 100);
    const after = faithLevel(state, world, f);
    // When a power first opens, for the badge on the Court tab.
    for (const [k, pw] of Object.entries(cfg.faiths[f].powers ?? {})) if (after >= pw.level && F.unlocked?.[`${k}:${f}`] === undefined) (F.unlocked ??= {})[`${k}:${f}`] = state.day;
    if (after > before) {
      const perk = cfg.faiths[f].perks.find((p) => p.level === after);
      say(state, `${cfg.faiths[f].name} grows in the realm (level ${after} of 5). ${perk ? perk.text : ''}`.trim());
    }
  }
  // As the Fire rises, the non-humans and the mages' friends feel it.
  const fire = F.devotion.eternal_fire ?? 0;
  if (fire > 40) for (const g of ['elf', 'dwarf', 'halfling']) if (state.opinion?.[g] !== undefined) state.opinion[g] = clamp(state.opinion[g] - (fire - 40) / 40, 0, 100);
  realmsMonth(state, world);
  clashes(state, world, rng);
}

function shiftTown(state, id, f, pts) {
  const s = state.settlements[id];
  if (!s?.faith || s.faith[f] === undefined) return;
  const others = Object.keys(s.faith).filter((k) => k !== f);
  const take = Math.min(pts, others.reduce((a, k) => a + s.faith[k], 0));
  const pool = others.reduce((a, k) => a + s.faith[k], 0) || 1;
  for (const k of others) s.faith[k] -= (take * s.faith[k]) / pool;
  s.faith[f] += take;
}

// The Great Sun spreads north with the Empire (M32 A): with its agents,
// once their network in Temeria runs deep, and faster where its armies
// stand near.
function greatSun(state, world) {
  const g = D(world).greatSun;
  if (!g || !D(world).faiths.great_sun) return;
  const depth = state.spycraft?.nets?.nilfgaard?.temeria ?? 0;
  const agents = Math.max(0, depth - g.agentsFrom) * g.perAgent;
  const armies = (state.armies ?? []).filter((a) => a.side === 'nilfgaard' && a.soldiers > 0);
  for (const [id, s] of Object.entries(state.settlements)) {
    if (!s.faith || s.faith.great_sun === undefined) continue;
    let pts = agents;
    const t = world.byId[id];
    if (armies.some((a) => { const p = armyAt(world, a); return p && Math.hypot(p.x - t.x, p.y - t.y) <= g.armyReach; })) pts += g.perArmy;
    if (pts > 0) shiftTown(state, id, 'great_sun', pts);
  }
}

const armyAt = (world, a) => (a.x !== undefined ? a : world.byId[a.at] ?? null);

// A realm's lean, with the Great Sun carried in by the Empire's agents and
// its overlordship (M32 A), taken evenly from the rest.
export function realmLean(state, world, rid) {
  const cfg = D(world);
  const lean = { ...(cfg.realms?.lean?.[rid] ?? {}) };
  const g = cfg.greatSun;
  if (!g || rid === 'nilfgaard' || !Object.keys(lean).length) return lean;
  let add = (state.spycraft?.nets?.nilfgaard?.[rid] ?? 0) * g.networkLean;
  if (state.realms?.[rid]?.suzerain === 'nilfgaard') add += g.vassalLean;
  add = Math.min(add, 60 - (lean.great_sun ?? 0));
  if (add <= 0) return lean;
  const rest = Object.entries(lean).filter(([f]) => f !== 'great_sun');
  const total = rest.reduce((a, [, v]) => a + v, 0) || 1;
  for (const [f, v] of rest) lean[f] = v - (add * v) / total;
  lean.great_sun = (lean.great_sun ?? 0) + add;
  return lean;
}

// The AI realms (M26 C) keep their own Devotion by the same drift, toward
// their lean.
function realmsMonth(state, world) {
  const cfg = D(world);
  const F = state.faiths;
  for (const rid of Object.keys(cfg.realms?.lean ?? {})) {
    if (!state.realms?.[rid] || state.realms[rid].fallen) continue;
    const row = (F.realms[rid] ??= {});
    for (const [f, v] of Object.entries(realmLean(state, world, rid))) {
      const target = clamp(v * cfg.shareWeight + (cfg.realms.fervour?.[rid]?.[f] ?? 0), 0, 100);
      row[f] = clamp((row[f] ?? 0) + (target - (row[f] ?? 0)) * cfg.drift, 0, 100);
    }
  }
}

// ---- Clashes ----

// Where two rival faiths are both strong, now and then they come to blows:
// a grove burned, a shrine desecrated, a riot, a brawl at a festival.
function clashes(state, world, rng) {
  const c = D(world).clashes;
  const F = state.faiths;
  const calm = Math.max(0, 1 + bookEffect(state, world, 'clashes'));
  const inquisition = signed(state, 'inquisition');
  for (const pair of c.pairs) {
    const da = F.devotion[pair.a] ?? 0;
    const db = pair.b === 'nonhumans' ? 100 : F.devotion[pair.b] ?? 0;
    if (da < c.clashAbove || db < c.clashAbove) continue;
    for (const [id, s] of Object.entries(state.settlements)) {
      if (s.occupier || !s.faith) continue;
      const here = pair.b === 'nonhumans' ? nonhumanShare(s) >= c.nonhumanShare : (s.faith[pair.b] ?? 0) >= c.localShare;
      if (!here || (s.faith[pair.a] ?? 0) < c.localShare) continue;
      if (!rng.chance(pair.chance * calm)) continue;
      clash(state, world, rng, id, pair, inquisition);
    }
  }
}

function clash(state, world, rng, id, pair, inquisition) {
  const c = D(world).clashes;
  const F = state.faiths;
  const s = state.settlements[id];
  const kinds = c.kinds[pair.b] ?? ['the faithful come to blows'];
  const what = kinds[Math.floor(rng.next() * kinds.length)];
  const unrest = c.unrest[0] + rng.next() * (c.unrest[1] - c.unrest[0]);
  s.unrest = clamp(s.unrest + unrest, 0, 100);
  // Who comes off best: the stronger, or the Fire under the inquisition.
  const da = F.devotion[pair.a] ?? 0;
  const db = pair.b === 'nonhumans' ? 50 : F.devotion[pair.b] ?? 0;
  const aWins = inquisition || rng.chance(da / Math.max(1, da + db));
  const [win, lose] = aWins ? [pair.a, pair.b] : [pair.b, pair.a];
  if (F.devotion[win] !== undefined) F.devotion[win] = clamp(F.devotion[win] + c.winner, 0, 100);
  if (F.devotion[lose] !== undefined) F.devotion[lose] = clamp(F.devotion[lose] + c.loser, 0, 100);
  if (inquisition && aWins) {
    const losers = lose === 'nonhumans' ? ['elf', 'dwarf', 'halfling'] : [lose];
    for (const g of losers) if (state.opinion?.[g] !== undefined) state.opinion[g] = clamp(state.opinion[g] - c.inquisitionAnger, 0, 100);
    s.unrest = clamp(s.unrest + c.inquisitionAnger / 2, 0, 100);
  }
  F.clashes = (F.clashes ?? 0) + 1;
  F.lastClash = { town: id, day: state.day, a: pair.a, b: pair.b, win };
  const name = world.byId[id].name;
  say(state, `Clash of faiths at ${name}: ${what}. ${aWins ? `${D(world).faiths[pair.a].name} carries the day` : `${pair.b === 'nonhumans' ? 'The non-humans hold their ground' : `${D(world).faiths[pair.b].name} holds its ground`}`}, and the town seethes.`);
}

// ---- The crown's acts for a faith ----

const left = (F, key, cooldown, day) => Math.max(0, (F.acted[key] ?? -Infinity) + cooldown - day);

// Days before an act or power can be used again (0: ready).
export function faithRest(state, world, kind, f) {
  const F = state.faiths;
  if (!F || !D(world)) return 0;
  const a = D(world).acts[kind] ?? D(world).faiths[f]?.powers?.[kind];
  if (!a?.cooldown) return 0;
  return left(F, `${kind}:${f}`, a.cooldown, state.day);
}

const near = (world, id, t, r) => Math.hypot((t.band?.x ?? t.x) - world.byId[id].x, (t.band?.y ?? t.y) - world.byId[id].y) <= r;

// The day each power became, or becomes, ready: the later of its opening
// and the end of its rest. Null while it is not open.
export function powerReadyAt(state, world, kind, f) {
  const pw = D(world)?.faiths[f]?.powers?.[kind];
  if (!pw || faithLevel(state, world, f) < pw.level) return null;
  const F = state.faiths;
  return Math.max(F.unlocked?.[`${kind}:${f}`] ?? 0, (F.acted[`${kind}:${f}`] ?? -Infinity) + pw.cooldown);
}

// Whether the crown can do an act for a faith now. `town` is the place it is
// done (a temple endowed, preachers invited, a lair quieted), `works` a
// works given as church land.
export function canFaithAct(state, world, kind, f, town = null, works = null) {
  const cfg = D(world);
  if (!cfg?.faiths[f]) return { ok: false, reason: 'Unknown faith.' };
  const F = faithsOf(state, world);
  const power = cfg.faiths[f].powers?.[kind];
  const a = cfg.acts[kind] ?? power;
  if (!a) return { ok: false, reason: 'Unknown act.' };
  if (power && faithLevel(state, world, f) < power.level) return { ok: false, reason: `Needs ${cfg.faiths[f].name} at level ${power.level}.`, locked: true };
  const rest = faithRest(state, world, kind, f);
  if (rest > 0) return { ok: false, reason: `Not again for ${rest} days.`, rest };
  if (a.coin && state.treasury - a.coin < -creditLimit(state, world)) return { ok: false, reason: `Needs ${a.coin} crowns.` };
  const month = dateOf(state.day).month;
  const ours = (id) => state.settlements[id] && !state.settlements[id].occupier;
  if (['endow', 'preachers', 'purge', 'healers', 'circle', 'land', 'order'].includes(kind) && !ours(town)) return { ok: false, reason: 'Choose a place of ours.' };
  if (kind === 'oath' && !(state.armies ?? []).some((x) => x.side === TEMERIA && x.soldiers > 0)) return { ok: false, reason: 'The crown has no army in the field.' };
  if (kind === 'festival') {
    const fest = cfg.faiths[f].festival;
    if (!fest.months.includes(month)) return { ok: false, reason: `Only in its season (${monthsText(fest.months)}).` };
    if (F.festivals[f] === dateOf(state.day).year) return { ok: false, reason: 'Already held this year.' };
  }
  if (kind === 'belleteyn' && !a.months.includes(month)) return { ok: false, reason: `Only in spring (${monthsText(a.months)}).` };
  if (kind === 'pilgrimage' && (F.pilgrimage?.until ?? 0) > state.day) return { ok: false, reason: 'The king is already on pilgrimage.' };
  if (kind === 'purge' && !state.threats.list.some((t) => t.kind === 'scoiatael' && !t.abroad && near(world, town, t, a.radius))) return { ok: false, reason: 'No Scoia\'tael within reach of it.' };
  if (kind === 'circle' && !state.threats.list.some((t) => t.kind === 'monsters' && !t.abroad && near(world, town, t, a.radius))) return { ok: false, reason: 'No beast lair within reach of it.' };
  if (kind === 'healers' && !((state.settlements[town].plague ?? 0) > state.day)) return { ok: false, reason: 'No plague there.' };
  if (kind === 'land') {
    if (!state.settlements[town].buildings.includes(works)) return { ok: false, reason: 'Choose a works of that town.' };
    if (F.lands.some((g) => g.town === town && g.works === works)) return { ok: false, reason: 'Already the church\'s.' };
  }
  return { ok: true };
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthsText = (ms) => ms.map((m) => MONTH_NAMES[m - 1]).join(' and ');

export function doFaithAct(state, world, kind, f, town = null, works = null) {
  const cfg = D(world);
  const F = faithsOf(state, world);
  const fa = cfg.faiths[f];
  const a = cfg.acts[kind] ?? fa.powers[kind];
  if (a.coin) state.treasury -= a.coin;
  if (a.cooldown) F.acted[`${kind}:${f}`] = state.day;
  const name = town ? world.byId[town].name : '';
  const fervour = (v) => { F.fervour[f] = clamp((F.fervour[f] ?? 0) + v, 0, 100); };
  if (kind === 'endow') {
    fervour(a.fervour);
    shiftTown(state, town, f, a.share);
    say(state, `The crown endows a temple of ${fa.name} at ${name}. The faithful fill it on the first day.`);
  } else if (kind === 'land') {
    F.lands.push({ town, works, faith: f, since: state.day });
    say(state, `The ${world.buildings[works].name.toLowerCase()} at ${name} is granted to ${fa.name}: its takings go to the faith now.`);
  } else if (kind === 'preachers') {
    fervour(a.fervour);
    F.preachers.push({ town, faith: f, until: state.day + a.days });
    say(state, `Preachers of ${fa.name} come to ${name} at the crown's invitation, and will stay the season.`);
  } else if (kind === 'festival') {
    F.festivals[f] = dateOf(state.day).year;
    fervour(a.fervour);
    nudge(state, world, 'love', a.love, 'Festivals of the faiths');
    say(state, `The crown keeps ${fa.festival.name} with ${fa.name}'s faithful: bonfires, processions and bread for all.`);
  } else if (kind === 'pilgrimage') {
    fervour(a.fervour);
    nudge(state, world, 'love', a.love, 'A royal pilgrimage');
    F.pilgrimage = { faith: f, place: fa.holy.place, until: state.day + a.days };
    say(state, `The king sets out on pilgrimage to ${fa.holy.name}. For a month the court waits on his return.`);
  } else if (kind === 'purge') {
    const gone = state.threats.list.filter((t) => t.kind === 'scoiatael' && !t.abroad && near(world, town, t, a.radius));
    for (const t of gone) destroyThreat(state, world, t);
    nudge(state, world, 'fear', a.fear, 'The Fire\'s purges');
    // Lebioda's faithful turn from the burnings (M32 A).
    if (cfg.lebioda && F.fervour.lebioda !== undefined) F.fervour.lebioda = Math.max(0, F.fervour.lebioda - cfg.lebioda.purge);
    for (const [g, v] of Object.entries(a.opinion ?? {})) if (state.opinion?.[g] !== undefined) state.opinion[g] = clamp(state.opinion[g] + v, 0, 100);
    F.pyre = { town, until: state.day + 10 };
    say(state, `The Fire's zealots purge the woods round ${name}: ${gone.length} Scoia'tael hideout${gone.length === 1 ? '' : 's'} burned, and pyres in the square.`);
  } else if (kind === 'blessing') {
    F.blessing = state.day + a.days;
    say(state, 'Melitele\'s priestesses bless the fields of the realm. The grain stands thick this season.');
  } else if (kind === 'healers') {
    const s = state.settlements[town];
    s.plague = 0;
    s.quarantine = 0;
    say(state, `Melitele's healers march into ${name}. Within a week the fever has broken.`);
  } else if (kind === 'belleteyn') {
    F.belleteyn = state.day + a.days;
    nudge(state, world, 'love', a.love, 'Belleteyn');
    say(state, 'The realm keeps Belleteyn: fires on the hills, dancing till dawn, and many a child expected by winter.');
  } else if (kind === 'order') {
    const s = state.settlements[town];
    s.unrest = clamp(s.unrest - a.unrest, 0, 100);
    nudge(state, world, 'fear', a.fear, 'Imperial order');
    say(state, `Sun-priests preach obedience in ${name}, and the watch enforces it. The streets are very quiet.`);
  } else if (kind === 'oath') {
    for (const x of state.armies ?? []) if (x.side === TEMERIA && typeof x.morale === 'number') x.morale = Math.min(100, x.morale + a.morale);
    say(state, 'Before Kreve\'s altar the crown\'s soldiers swear their oaths again. They march the straighter for it.');
  } else if (kind === 'alms') {
    nudge(state, world, 'love', a.love, 'Alms for the poor');
    for (const s of Object.values(state.settlements)) if (!s.occupier) s.unrest = clamp(s.unrest - a.unrest, 0, 100);
    say(state, 'In the Prophet\'s name the crown gives bread and copper in every market square. Even the beggars bless the king.');
  } else if (kind === 'freya') {
    F.freya = state.day + a.days;
    say(state, 'Freya\'s priestesses bless the marriage beds of the realm. The midwives will be busy come winter.');
  } else if (kind === 'circle') {
    const t = state.threats.list.filter((x) => x.kind === 'monsters' && !x.abroad && near(world, town, x, a.radius))[0];
    const what = threatName(world, t).toLowerCase();
    destroyThreat(state, world, t);
    say(state, `The druids gather in a circle in the woods near ${name}. The ${what} trouble no one any more.`);
  }
}

export function revokeLand(state, world, town, works) {
  const F = faithsOf(state, world);
  const i = F.lands.findIndex((g) => g.town === town && g.works === works);
  if (i < 0) return false;
  const [g] = F.lands.splice(i, 1);
  const r = D(world).acts.land.revoke;
  F.fervour[g.faith] = clamp((F.fervour[g.faith] ?? 0) + r.fervour, 0, 100);
  if (state.opinion?.[g.faith] !== undefined) state.opinion[g.faith] = clamp(state.opinion[g.faith] + r.opinion, 0, 100);
  say(state, `The crown takes back the ${world.buildings[works].name.toLowerCase()} at ${world.byId[town].name} from ${D(world).faiths[g.faith].name}. The priests preach against it.`);
  return true;
}

// Whether a works' takings go to a faith (church land).
export function churchLand(state, town, works) {
  return !!state.faiths?.lands?.some((g) => g.town === town && g.works === works);
}

export function onPilgrimage(state) {
  return (state.faiths?.pilgrimage?.until ?? 0) > state.day;
}

// The share of a town's people following the faith a perk favours there.
export function followers(state, id, f) {
  return (state.settlements[id]?.faith?.[f] ?? 0) / 100;
}

