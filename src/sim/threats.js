// Threats on the map. The monthly threat levels (military.js) no longer roll
// dice for raids; they decide where bandit camps and monster lairs appear and
// how they grow. Camps send raiding bands to the roads and villages near them;
// lairs send their beasts out to hunt. Scoia'tael commandos come out of the
// woods when the elves are angry, strike, and vanish; hostile neighbours send
// raiding parties over the border. Each is a thing on the map with a place
// and a strength: seen clearly where the crown has eyes, and only rumoured
// beyond.
import { addDispatch, clamp } from './realm.js';
import { seasonOf } from './calendar.js';
import { nearestOnSegment, roadPath } from './world.js';
import { distanceToPolygon, pointInPolygon } from './geometry.js';
import { threatLevel, patrolledSet, localStrength } from './military.js';
import { visionOf } from './vision.js';
import { TEMERIA, ownerOf, hostile, atWar, sideName } from './conflict.js';
import { totalPopulation } from './state.js';
import { threatStrength, speciesOf, winChance, groundAt, companyStrength } from './combat.js';
import { companiesAt, stationedStrength } from './forces.js';

const F = (world) => world.forces;
const T = (world) => world.forces.threats;
const say = (state, text) => addDispatch(state, text, 'military');
const round = Math.round;

export function defaultThreats() {
  return { list: [], nextId: 1, alerts: [], blocked: {}, robbed: {}, contracts: [], tally: { raids: 0, dead: 0, roadDays: 0, cleared: 0 } };
}

const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// A running count of what threats have cost the realm, for the balance tools.
function tally(state) {
  return (state.threats.tally ??= { raids: 0, dead: 0, roadDays: 0, cleared: 0 });
}

// ---- Where threats may appear ----

const siteCache = new WeakMap();
// For each settlement, a spot inside each kind of wild country within reach:
// a point a little way into the zone from its nearest edge.
export function wildSites(world, id) {
  let cache = siteCache.get(world);
  if (!cache) siteCache.set(world, (cache = {}));
  if (cache[id]) return cache[id];
  const st = world.byId[id];
  const reach = world.military.wildReach + 30;
  const out = [];
  // Temeria's towns breed threats in Temeria's wilds; a foreign town in its
  // own realm's (or the unclaimed mountains').
  const realm = world.realmOf[id];
  const ours = (z) => (realm ? z.realm === realm || z.realm === 'wilds' : !z.realm);
  for (const [kind, zones] of Object.entries(world.geography.terrain)) {
    for (const z of zones) {
      if (!ours(z)) continue;
      if (distanceToPolygon(st.x, st.y, z.shape) > reach) continue;
      // The nearest point of the zone, then a step towards its middle.
      let best = null;
      const pts = z.shape;
      for (let i = 0; i < pts.length; i++) {
        const a = { x: pts[i][0], y: pts[i][1] };
        const b = { x: pts[(i + 1) % pts.length][0], y: pts[(i + 1) % pts.length][1] };
        const q = nearestOnSegment(st, a, b);
        const d = near(q, st);
        if (!best || d < best.d) best = { ...q, d };
      }
      const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
      const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
      const len = Math.hypot(cx - best.x, cy - best.y) || 1;
      let p = { x: best.x + ((cx - best.x) / len) * 22, y: best.y + ((cy - best.y) / len) * 22 };
      if (pointInPolygon(st.x, st.y, z.shape)) p = { x: st.x + ((cx - st.x) / (Math.hypot(cx - st.x, cy - st.y) || 1)) * 40, y: st.y + ((cy - st.y) / (Math.hypot(cx - st.x, cy - st.y) || 1)) * 40 };
      out.push({ terrain: kind, x: p.x, y: p.y });
    }
  }
  cache[id] = out;
  return out;
}

// A threat's position on the map: its band when out, else its camp.
export function threatPos(t) {
  return t.band ? { x: t.band.x, y: t.band.y } : { x: t.x, y: t.y };
}

export function isCamp(t) {
  return t.kind === 'bandits' || t.kind === 'monsters';
}

export function threatName(world, t) {
  if (t.kind === 'monsters') return speciesOf(world, t).name;
  if (t.kind === 'raiders') return `${sideName(world, t.realm)} raiders`;
  return T(world)[t.kind].name;
}

// What to call a threat in a fight: the band out on the road, or the camp
// or lair itself.
export function foeName(world, t) {
  if (t.kind === 'monsters') return speciesOf(world, t).name;
  if (t.kind === 'bandits') return t.band ? 'Bandits' : 'The bandit camp';
  if (t.kind === 'raiders') return `${sideName(world, t.realm)} raiders`;
  return "Scoia'tael";
}

export function threatSize(t) {
  const body = t.band ?? t;
  return t.kind === 'monsters' ? body.count : round(body.men);
}

// The nearest Temerian settlement to a point.
export function nearestPlace(world, p, filter = () => true) {
  let best = null;
  for (const st of world.geography.settlements) {
    if (!filter(st.id)) continue;
    const d = near(st, p);
    if (!best || d < best.d) best = { id: st.id, d };
  }
  return best;
}

function newThreat(state, kind, fields) {
  const t = { id: state.threats.nextId++, kind, born: state.day, morale: 70, band: null, sighted: false, alerted: false, rumour: null, ...fields };
  state.threats.list.push(t);
  return t;
}

function spawnCamp(state, world, rng, id, kind, level) {
  const cfg = T(world)[kind];
  const sites = wildSites(world, id).filter((s) => cfg.terrain.includes(s.terrain));
  if (!sites.length) return null;
  const site = rng.pick(sites);
  // Scatter a little so camps by the same wood do not sit on one spot.
  const p = { x: site.x + (rng.next() - 0.5) * 24, y: site.y + (rng.next() - 0.5) * 24 };
  if (state.threats.list.some((t) => t.kind === kind && near(t, p) < cfg.spacing)) return null;
  if (kind === 'bandits') {
    const [lo, hi] = cfg.start;
    return newThreat(state, kind, { terrain: site.terrain, x: p.x, y: p.y, near: id, men: lo + rng.int(hi - lo + 1), level });
  }
  const list = F(world).species[site.terrain] ?? [];
  if (!list.length) return null;
  let roll = rng.next() * list.reduce((a, s) => a + s.weight, 0);
  const sp = list.find((s) => (roll -= s.weight) < 0) ?? list[0];
  return newThreat(state, kind, { terrain: site.terrain, species: sp.id, x: p.x, y: p.y, near: id, count: sp.count[0] + rng.int(sp.count[1] - sp.count[0] + 1), level });
}

// ---- The month ----

export function monthlyThreatsSpawn(state, world, rng) {
  const f = F(world);
  if (!f || !state.threats) return;
  const patrolled = patrolledSet(state, world);
  const levels = {};
  for (const [id, s] of Object.entries(state.settlements)) {
    if (s.occupier) continue;
    levels[id] = { bandits: threatLevel(state, world, id, 'bandits', patrolled), monsters: threatLevel(state, world, id, 'monsters', patrolled) };
  }
  // New camps and lairs where the country breeds them.
  for (const kind of ['bandits', 'monsters']) {
    const cfg = T(world)[kind];
    for (const [id, lv] of Object.entries(levels)) {
      if (state.threats.list.filter((t) => t.kind === kind && !t.abroad).length >= cfg.max) break;
      const level = lv[kind];
      if (level < cfg.spawnAt) continue;
      if (!rng.chance(cfg.spawnChance * (level - cfg.spawnAt + 10) / 50)) continue;
      const t = spawnCamp(state, world, rng, id, kind, level);
      if (t) t.level = level;
    }
  }
  // Camps grow while the country round them is poor and wild, and wither
  // where the crown keeps order.
  for (const t of [...state.threats.list]) {
    if (!isCamp(t) || t.abroad) continue;
    const lv = levels[t.near]?.[t.kind] ?? 0;
    t.level = lv;
    const cfg = T(world)[t.kind];
    if (t.kind === 'bandits') {
      const cap = cfg.capBase + cfg.capPerLevel * lv;
      if (lv < cfg.fadeBelow) t.men -= t.men * cfg.fade;
      else t.men = Math.min(cap, t.men + t.men * cfg.growth * (lv / 50));
      if (t.men < 8 && !t.band) disperse(state, world, t, 'The bandit camp near {place} has broken up: too few left, and too little to rob.');
    } else {
      const sp = speciesOf(world, t);
      if (lv < cfg.fadeBelow) {
        if (rng.chance(cfg.fade * 3)) t.count = Math.max(0, t.count - 1);
      } else if ((state.day - t.born) % (cfg.growthMonths * 30) < 30) t.count = Math.min(round(sp.count[1] * 1.5), t.count + 1);
      if (t.count <= 0 && !t.band) disperse(state, world, t, 'The beasts near {place} are gone: hunted out, or moved on.');
    }
  }
  // Camps send out bands; lairs send out their beasts.
  for (const t of state.threats.list) {
    if (!isCamp(t) || t.band || t.abroad) continue;
    const cfg = T(world)[t.kind];
    const ready = t.kind === 'bandits' ? t.men >= cfg.bandAt : t.count >= 1;
    if (ready && rng.chance(cfg.bandChance * (0.5 + (t.level ?? 30) / 100))) sendBand(state, world, rng, t);
  }
  spawnScoiatael(state, world, rng);
  spawnRaiders(state, world, rng);
  monthlyAbroad(state, world, rng);
}

// ---- Abroad ----

// How wild and lawless the country round a foreign town is, by the same
// measure as Temeria's: its wild country, and how poor the town is. A strong
// garrison keeps the roads round it quieter.
export function abroadLevel(state, world, id, kind) {
  const t = world.military.threats[kind];
  const s = state.realms?.[world.realmOf[id]]?.settlements[id];
  if (!s) return 0;
  let v = t.base;
  for (const [terrain, add] of Object.entries(t.wild)) if (world.wildOf[id]?.[terrain]) v += add;
  if (kind === 'bandits') v += Math.max(0, 50 - s.prosperity) * t.perPovertyPoint;
  v -= Math.min(15, s.garrison / T(world).abroad.garrisonPerPoint);
  return clamp(v, 0, 100);
}

// The neighbouring realms have wilds of their own: camps and lairs breed in
// their forests, marshes and hills by the same rules as Temeria's, weigh on
// the towns near them, and are burned out by that realm's soldiers in time.
// The crown sees them where its eyes reach, but they are not its to hunt.
function monthlyAbroad(state, world, rng) {
  const cfg = T(world).abroad;
  if (!cfg || !state.realms) return;
  for (const t of [...state.threats.list]) {
    if (!t.abroad) continue;
    const realm = state.realms[t.abroad];
    const s = realm?.settlements[t.near];
    if (!s || ownerOf(state, world, t.near) !== t.abroad) {
      state.threats.list = state.threats.list.filter((x) => x !== t);
      continue;
    }
    const lv = abroadLevel(state, world, t.near, t.kind);
    t.level = lv;
    const c = T(world)[t.kind];
    if (t.kind === 'bandits') {
      if (lv < c.fadeBelow) t.men -= t.men * c.fade;
      else t.men = Math.min(c.capBase + c.capPerLevel * lv, t.men + t.men * c.growth * (lv / 50));
    } else if (lv >= c.fadeBelow && (state.day - t.born) % (c.growthMonths * 30) < 30) {
      t.count = Math.min(round(speciesOf(world, t).count[1] * 1.5), t.count + 1);
    }
    // Their soldiers ride out in time, sooner from a strong garrison.
    if ((t.kind === 'bandits' && t.men < 8) || (t.kind === 'monsters' && t.count <= 0) || rng.chance(cfg.clear * (0.5 + s.garrison / 400))) {
      state.threats.list = state.threats.list.filter((x) => x !== t);
      if (t.sighted) say(state, `${threatName(world, t)} near ${world.byId[t.near].name} ${t.kind === 'bandits' ? 'have been burned out' : 'have been hunted down'} by the soldiers of ${sideName(world, t.abroad)}.`);
      continue;
    }
    s.prosperity = clamp(s.prosperity - cfg.toll * (t.kind === 'bandits' ? 1 : 0.6), 0, 100);
  }
  for (const kind of ['bandits', 'monsters']) {
    const c = T(world)[kind];
    for (const id of world.foreign.map((st) => st.id)) {
      if (state.threats.list.filter((t) => t.abroad).length >= cfg.max) return;
      const rid = world.realmOf[id];
      if (!state.realms[rid]?.settlements[id] || ownerOf(state, world, id) !== rid) continue;
      const level = abroadLevel(state, world, id, kind);
      if (level < c.spawnAt) continue;
      if (!rng.chance(c.spawnChance * cfg.chance * (level - c.spawnAt + 10) / 50)) continue;
      const t = spawnCamp(state, world, rng, id, kind, level);
      if (t) t.abroad = rid;
    }
  }
}

// A raiding band leaves camp for a road near it, lurks there robbing what
// passes, and may fall on a weak village before it goes home.
function sendBand(state, world, rng, t) {
  const cfg = T(world)[t.kind];
  const seg = pickRoad(state, world, rng, t, cfg.reach);
  if (!seg) return;
  const [lo, hi] = cfg.lurk;
  const body = t.kind === 'bandits' ? { men: t.men * cfg.bandShare } : { count: Math.max(1, Math.ceil(t.count * 0.6)) };
  if (t.kind === 'bandits') t.men -= body.men;
  else t.count -= body.count;
  t.band = { ...body, x: t.x, y: t.y, way: [seg.point], phase: 'out', seg: seg.key, lurk: lo + rng.int(hi - lo + 1), until: 0, raid: null };
}

// The roads near a threat, the busiest and nearest first.
function pickRoad(state, world, rng, t, reach) {
  const options = [];
  for (const [a, list] of Object.entries(world.adjacency)) {
    for (const e of list) {
      if (a > e.to) continue;
      const A = world.byId[a];
      const B = world.byId[e.to];
      const q = nearestOnSegment(t, A, B);
      const d = near(q, t);
      if (d > reach) continue;
      const busy = Math.sqrt(totalPopulation(state.settlements[a]) + totalPopulation(state.settlements[e.to]));
      options.push({ key: `${a}|${e.to}`, point: { x: q.x, y: q.y }, w: busy / (d + 40) });
    }
  }
  if (!options.length) return null;
  let roll = rng.next() * options.reduce((s, o) => s + o.w, 0);
  return options.find((o) => (roll -= o.w) < 0) ?? options[0];
}

// A village near the band weak enough to fall on, if any.
function pickVillage(state, world, t, body) {
  const strength = threatStrength(world, { ...t, band: body });
  let best = null;
  for (const st of world.geography.settlements) {
    const s = state.settlements[st.id];
    if (s.occupier || !['village', 'town'].includes(st.type)) continue;
    if ((s.raided ?? 0) > state.day) continue;
    const d = near(st, body);
    if (d > T(world)[t.kind].reach) continue;
    const defence = localStrength(state, world, st.id) + stationedStrength(state, world, st.id, t);
    if (defence > strength * 0.9) continue;
    if (!best || d < best.d) best = { id: st.id, d };
  }
  return best?.id ?? null;
}

function spawnScoiatael(state, world, rng) {
  const cfg = T(world).scoiatael;
  if (state.sympathy <= cfg.above) return;
  if (state.threats.list.filter((t) => t.kind === 'scoiatael').length >= cfg.max) return;
  if (!rng.chance(cfg.chance * (state.sympathy - cfg.above) / (100 - cfg.above))) return;
  // The woods near Brokilon, or near the elves of the realm.
  const places = world.geography.settlements.filter((st) => world.forestNear[st.id] && !state.settlements[st.id].occupier);
  if (!places.length) return;
  let roll = rng.next() * places.reduce((a, st) => a + 1 + (state.settlements[st.id].population.elf ?? 0) / 20, 0);
  const st = places.find((p) => (roll -= 1 + (state.settlements[p.id].population.elf ?? 0) / 20) < 0) ?? places[0];
  const site = wildSites(world, st.id).find((s) => s.terrain === 'forest') ?? { x: st.x + 30, y: st.y + 30, terrain: 'forest' };
  const [lo, hi] = cfg.men;
  const t = newThreat(state, 'scoiatael', { terrain: 'forest', x: site.x, y: site.y, near: st.id, men: lo + rng.int(hi - lo + 1), morale: 85 });
  const seg = pickRoad(state, world, rng, t, 140);
  if (!seg) {
    state.threats.list = state.threats.list.filter((x) => x !== t);
    return;
  }
  const [l0, l1] = cfg.lurk;
  t.band = { men: t.men, x: t.x, y: t.y, way: [seg.point], phase: 'out', seg: seg.key, lurk: l0 + rng.int(l1 - l0 + 1), until: 0, raid: null };
  t.men = 0;
  t.vanish = state.day + cfg.life;
}

// Hostile neighbours send raiding parties over the border; at war, more.
function spawnRaiders(state, world, rng) {
  const cfg = T(world).raiders;
  for (const [rid, n] of Object.entries(state.neighbours ?? {})) {
    const war = atWar(state, rid) && hostile(state, rid, TEMERIA);
    const chance = war ? cfg.warChance : n.relation <= cfg.below ? cfg.chance * Math.min(1, (cfg.below - n.relation + 10) / 50) : 0;
    if (!chance || !rng.chance(chance)) continue;
    if (state.threats.list.some((t) => t.kind === 'raiders' && t.realm === rid)) continue;
    // A border crossing: one of their towns with a road to one of ours.
    const crossings = [];
    for (const fid of world.foreignByRealm[rid] ?? []) {
      if (ownerOf(state, world, fid) !== rid) continue;
      for (const e of world.fullAdjacency[fid] ?? []) {
        if (state.settlements[e.to] && ownerOf(state, world, e.to) === TEMERIA) crossings.push({ from: fid, to: e.to });
      }
    }
    if (!crossings.length) continue;
    const c = rng.pick(crossings);
    const from = world.byId[c.from];
    const path = roadPath(world, c.from, c.to, true);
    if (!path) continue;
    const [lo, hi] = cfg.men;
    const men = lo + rng.int(hi - lo + 1);
    const [l0, l1] = cfg.lurk;
    const t = newThreat(state, 'raiders', { realm: rid, terrain: 'open', x: from.x, y: from.y, near: c.to, men: 0, morale: 75, home: c.from });
    t.band = { men, x: from.x, y: from.y, way: path.slice(1).map((id) => ({ x: world.byId[id].x, y: world.byId[id].y })), phase: 'raid', raid: c.to, lurk: l0 + rng.int(l1 - l0 + 1), until: 0 };
  }
}

function disperse(state, world, t, text) {
  state.threats.list = state.threats.list.filter((x) => x !== t);
  if (text && (t.sighted || t.alerted)) say(state, text.replace('{place}', world.byId[t.near]?.name ?? 'the border'));
}

// A threat beaten in the field: a camp or lair is broken for good (and the
// country round it is quiet for a while); a band is scattered and its camp
// weakened; a commando or raiding party is gone.
export function destroyThreat(state, world, t, partOnly = false) {
  if (partOnly && t.band) {
    t.band = null;
    return;
  }
  tally(state).cleared += 1;
  const s = state.settlements[t.near];
  if (s && isCamp(t)) s.cleared = { ...(s.cleared ?? {}), [t.kind]: state.day + 120 };
  state.threats.list = state.threats.list.filter((x) => x !== t);
}

// ---- The day ----

function walk(world, mob, speed) {
  let left = speed;
  while (left > 0 && mob.way.length) {
    const w = mob.way[0];
    const d = Math.hypot(w.x - mob.x, w.y - mob.y);
    if (d <= left) {
      mob.x = w.x;
      mob.y = w.y;
      mob.way.shift();
      left -= d;
    } else {
      mob.x += ((w.x - mob.x) / d) * left;
      mob.y += ((w.y - mob.y) / d) * left;
      left = 0;
    }
  }
  return !mob.way.length;
}

export function stepThreatsDay(state, world, rng) {
  if (!state.threats || !F(world)) return;
  const cfgs = T(world);
  for (const t of [...state.threats.list]) {
    if (!state.threats.list.includes(t)) continue;
    const b = t.band;
    if (!b) continue;
    const cfg = cfgs[t.kind];
    const ground = groundAt(world, b.x, b.y);
    const speed = cfg.speed * (F(world).ground.speed[ground] ?? 1) * (F(world).seasonSpeed[seasonOf(state.day)] ?? 1);
    const arrived = walk(world, b, speed);
    if (b.phase === 'out' && arrived) {
      b.phase = 'lurk';
      b.until = state.day + b.lurk;
    } else if (b.phase === 'lurk') {
      // Holding the road: carts turn back, caravans are stripped.
      state.threats.blocked[b.seg] = (state.threats.blocked[b.seg] ?? 0) + 1;
      tally(state).roadDays += 1;
      for (const id of b.seg.split('|')) state.threats.robbed[id] = (state.threats.robbed[id] ?? 0) + 1;
      if (state.day >= b.until) {
        const village = t.kind === 'scoiatael' ? null : pickVillage(state, world, t, b);
        if (village) {
          b.phase = 'raid';
          b.raid = village;
          b.way = [{ x: world.byId[village].x, y: world.byId[village].y }];
        } else goHome(world, t);
      }
    } else if (b.phase === 'raid' && arrived) {
      raidVillage(state, world, rng, t, b.raid);
      if (state.threats.list.includes(t) && t.band) goHome(world, t);
    } else if (b.phase === 'home' && arrived) {
      if (t.kind === 'bandits') t.men += b.men;
      else if (t.kind === 'monsters') t.count += b.count;
      if (!isCamp(t)) state.threats.list = state.threats.list.filter((x) => x !== t);
      else t.band = null;
    }
    if (t.kind === 'scoiatael' && t.vanish <= state.day && state.threats.list.includes(t)) {
      if (t.sighted) say(state, `The Scoia'tael near ${world.byId[t.near]?.name ?? 'the woods'} have melted back into the forest.`);
      state.threats.list = state.threats.list.filter((x) => x !== t);
    }
  }
  witcherContracts(state, world, rng);
  updateSight(state, world);
}

function goHome(world, t) {
  const b = t.band;
  b.phase = 'home';
  if (t.kind === 'raiders') {
    const h = world.byId[t.home];
    b.way = [{ x: h.x, y: h.y }];
  } else if (t.kind === 'scoiatael') b.way = [{ x: t.x, y: t.y }];
  else b.way = [{ x: t.x, y: t.y }];
}

// A band falls on a village: the garrison and any company stationed there
// stand against it; if they fail, the village is plundered.
function raidVillage(state, world, rng, t, id) {
  const s = state.settlements[id];
  if (!s || s.occupier) return;
  const b = t.band;
  const attack = threatStrength(world, t, groundAt(world, b.x, b.y));
  const defence = localStrength(state, world, id) + stationedStrength(state, world, id, t);
  const name = world.byId[id].name;
  const who = t.kind === 'monsters' ? speciesOf(world, t).name : t.kind === 'raiders' ? `${sideName(world, t.realm)} raiders` : t.kind === 'scoiatael' ? "Scoia'tael" : 'Bandits';
  if (rng.next() < winChance(world, defence, attack)) {
    // Beaten off at the gate.
    if (t.kind === 'monsters') b.count = Math.max(0, b.count - Math.ceil(b.count * 0.5));
    else b.men *= 0.6;
    for (const c of companiesAt(state, id)) c.xp = Math.min(F(world).xp.max, (c.xp ?? 0) + F(world).xp.win / 2);
    say(state, `${who} came for ${name} and were beaten off by its defenders.`);
    if ((b.count ?? 1) <= 0 || (b.men ?? 1) < 5) {
      if (isCamp(t)) t.band = null;
      else state.threats.list = state.threats.list.filter((x) => x !== t);
    }
    return;
  }
  const l = F(world).raids[t.kind];
  s.prosperity = clamp(s.prosperity - l.prosperity, 0, 100);
  s.unrest = clamp(s.unrest + l.unrest, 0, 100);
  s.stock.food *= 1 - l.food;
  for (const g of ['timber', 'stone', 'iron']) s.stock[g] *= 1 - l.goods;
  let dead = 0;
  for (const p of Object.keys(s.population)) {
    const n = round(s.population[p] * l.people);
    s.population[p] -= n;
    dead += n;
  }
  // The garrison fought and lost men.
  s.garrison = Math.max(0, round(s.garrison * 0.85));
  s.raided = state.day + l.raidedDays;
  s.raidKind = t.kind === 'monsters' ? 'monsters' : 'bandits';
  if (t.kind === 'bandits') b.men += b.men * l.loot * 0.2;
  tally(state).raids += 1;
  tally(state).dead += dead;
  const text = {
    bandits: `Bandits fell on ${name}: barns emptied, a carter hanged from his own shafts${dead ? `, ${dead} dead` : ''}. The defenders were too few to stop them.`,
    monsters: `${who} came out of the wilds by night at ${name}. ${dead || 'Several'} villagers taken; the rest bar their doors at dusk.`,
    scoiatael: `Scoia'tael struck ${name}: a granary burned, ${dead || 'several'} dead, arrows in the doors.`,
    raiders: `${who} crossed the border and plundered ${name}${dead ? `: ${dead} dead` : ''}.`,
  }[t.kind];
  say(state, text);
}

// ---- Witchers ----

export function witcherCost(state, world, t) {
  const w = T(world).monsters.witcher;
  const bounty = state.laws.bounties?.option === 'witchers' ? w.bounty : 1;
  return round((w.base + w.perStrength * threatStrength(world, t)) * bounty);
}

function witcherContracts(state, world, rng) {
  const w = T(world).monsters.witcher;
  for (const c of [...state.threats.contracts]) {
    if (c.until > state.day) continue;
    state.threats.contracts = state.threats.contracts.filter((x) => x !== c);
    const t = state.threats.list.find((x) => x.id === c.threat);
    if (!t) continue;
    const name = speciesOf(world, t).name;
    if (rng.chance(w.success)) {
      destroyThreat(state, world, t);
      say(state, `The witcher came back from the wilds near ${world.byId[t.near].name} with a trophy and a bill. ${name}: dealt with.`);
    } else {
      say(state, `The witcher sent after ${name.toLowerCase()} near ${world.byId[t.near].name} has not come back.`);
    }
  }
}

// ---- Sight ----

// What the crown truly sees for the rules of the game: its towns, watchtowers,
// patrolled roads, companies and armies, friends and spies; never the
// cosmetic traffic.
export function crownVision(state, world) {
  return visionOf(state, world);
}

export function sees(world, vision, x, y) {
  for (const c of vision.circles) if ((x - c.x) ** 2 + (y - c.y) ** 2 <= c.r * c.r) return true;
  for (const rid of vision.realms) {
    if (world.geography.neighbours[rid].shapes.some((sh) => pointInPolygon(x, y, sh))) return true;
  }
  return false;
}

// A stable scatter for a rumour, so its marker does not jump about.
function jitter(id, k) {
  const v = Math.sin(id * 12.9898 + k * 78.233) * 43758.5453;
  return (v - Math.floor(v)) - 0.5;
}

export function updateSight(state, world) {
  const s = F(world).sight;
  const vision = crownVision(state, world);
  for (const t of state.threats.list) {
    const p = threatPos(t);
    const seen = sees(world, vision, p.x, p.y);
    t.sighted = seen;
    // A camp or lair can be in sight while its band is away, and the other way round.
    t.campSeen = isCamp(t) && (seen && !t.band ? true : sees(world, vision, t.x, t.y));
    if (seen) {
      t.rumour = null;
      t.lastSeen = state.day;
      if (!t.alerted && t.abroad) t.alerted = true;
      if (!t.alerted) {
        t.alerted = true;
        const place = nearestPlace(world, p);
        const text = `${threatName(world, t)} sighted near ${world.byId[place.id].name}: about ${threatSize(t)} ${t.kind === 'monsters' ? (threatSize(t) === 1 ? '' : 'of them') : 'men'}.`.replace(/: about 1 \./, '.').replace(/ {2}/g, ' ');
        state.threats.alerts.push({ id: t.id, day: state.day, text });
        if (state.threats.alerts.length > 20) state.threats.alerts.shift();
        say(state, text);
      }
      continue;
    }
    // Word travels: within reach of our towns, folk talk of something out
    // there, the more exactly the nearer our eyes come.
    const town = nearestPlace(world, p, (id) => ownerOf(state, world, id) === TEMERIA);
    if (!town || town.d > s.rumourReach) {
      t.rumour = null;
      continue;
    }
    let edge = Infinity;
    for (const c of vision.circles) edge = Math.min(edge, Math.hypot(c.x - p.x, c.y - p.y) - c.r);
    const r = clamp(edge * 0.6, s.rumourMin, s.rumourMax);
    t.rumour = { x: p.x + jitter(t.id, 1) * r, y: p.y + jitter(t.id, 2) * r, r };
  }
}

// Threats the crown can see, nearest first to a point.
export function sightedThreats(state, p = null) {
  const list = (state.threats?.list ?? []).filter((t) => t.sighted);
  if (p) list.sort((a, b) => near(threatPos(a), p) - near(threatPos(b), p));
  return list;
}

export { companyStrength };
