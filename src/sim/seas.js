// Skellige at sea (M30 E). The isles are bound to Cintra, make no war for
// land of their own, and every raiding season send longships down simple
// sea lanes to burn a coastal town and carry the loot home. The crown can
// hire them against a rival's coast or pay them to spare its own. No full
// naval war yet: the longships are raids, not fleets.
import { addDispatch, clamp } from './realm.js';
import { TEMERIA, ownerOf, sideName, hurtPlace, hostile } from './conflict.js';
import { dateOf } from './calendar.js';
import { treatyBetween, makeTreaty } from './diplomacy.js';
import { informed } from './realms.js';
import { suzerainOf } from './tiers.js';
import { pointInPolygon } from './geometry.js';

const S = (world) => world.war?.seas;

export function seaRealm(state, world) {
  const rid = S(world)?.realm;
  return rid && state.realms?.[rid] && !state.realms[rid].fallen ? rid : null;
}

export function seas(state) {
  return (state.seas ??= { raids: [], nextId: 1, hired: null, paid: 0 });
}

// A town on the sea, as its spaces tell (M20).
export function coastal(world, id) {
  return (world.spaces?.[id] ?? []).some((sp) => sp.kind === 'coast');
}

// Its bond with Cintra (realms.json boundTo): an alliance renewed while both stand.
export function keepBonds(state, world) {
  for (const [rid, def] of Object.entries(world.realms?.realms ?? {})) {
    const to = def.boundTo;
    if (!to || !state.realms?.[rid] || state.realms[rid].fallen || !state.realms[to] || state.realms[to].fallen) continue;
    const t = treatyBetween(state, rid, to, 'alliance');
    if (!t || t.until - state.day < 60) makeTreaty(state, world, 'alliance', rid, to, { years: 10 });
  }
}

// The coastal towns the longships may fall on this season.
export function raidTargets(state, world, rid) {
  const c = S(world);
  const z = seas(state);
  const bound = world.realms.realms[rid]?.boundTo;
  const out = [];
  for (const realm of c.targets) {
    if (realm === bound || realm === rid) continue;
    if (realm !== TEMERIA && (!state.realms[realm] || state.realms[realm].fallen)) continue;
    if (treatyBetween(state, rid, realm, 'alliance')) continue;
    if (realm === TEMERIA && (z.paid > state.day || (state.neighbours[rid]?.relation ?? 0) >= c.spareAbove)) continue;
    // A vassal of the crown is spared while the crown has paid.
    if (realm !== TEMERIA && suzerainOf(state, realm) === TEMERIA && (z.paid > state.day || (state.neighbours[rid]?.relation ?? 0) >= c.spareAbove)) continue;
    const towns = realm === TEMERIA ? Object.keys(state.settlements) : world.foreignByRealm[realm] ?? [];
    for (const id of towns) if (coastal(world, id) && ownerOf(state, world, id) === realm) out.push(id);
  }
  return out;
}

// The way there: from the isles to the lane nearest them, along the lanes
// to the one nearest the target, then in to just off its shore.
export function seaPath(world, to) {
  const c = S(world);
  const lanes = c.lanes;
  const near = (p) => lanes.reduce((b, q, i) => (Math.hypot(q[0] - p[0], q[1] - p[1]) < Math.hypot(lanes[b][0] - p[0], lanes[b][1] - p[1]) ? i : b), 0);
  const t = world.byId[to];
  const a = near(c.home);
  const b = near([t.x, t.y]);
  const step = a <= b ? 1 : -1;
  const pts = [c.home];
  for (let i = a; i !== b + step; i += step) pts.push(lanes[i]);
  // In to the nearest shore by the town that open water reaches from the
  // last lane (not a sliver between two borders), else just off the town.
  const last = pts.at(-1);
  let best = null;
  for (let r = 8; r <= 80 && !best; r += 6) {
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const q = [t.x + Math.cos(a) * r, t.y + Math.sin(a) * r];
      if (onLand(world, q[0], q[1]) || !clearWater(world, last, q)) continue;
      const d = Math.hypot(q[0] - last[0], q[1] - last[1]);
      if (!best || d < best.d) best = { q, d };
    }
  }
  if (best) pts.push(best.q);
  else {
    const d = Math.hypot(last[0] - t.x, last[1] - t.y) || 1;
    pts.push([t.x + ((last[0] - t.x) / d) * 22, t.y + ((last[1] - t.y) / d) * 22]);
  }
  return pts;
}

const landCache = new WeakMap();
function onLand(world, x, y) {
  let shapes = landCache.get(world);
  if (!shapes) {
    const g = world.geography;
    shapes = [g.temeria, ...Object.values(g.neighbours).flatMap((n) => n.shapes), ...Object.values(g.lands ?? {}).flatMap((n) => n.shapes)];
    landCache.set(world, shapes);
  }
  return shapes.some((sh) => pointInPolygon(x, y, sh));
}

function clearWater(world, a, b) {
  for (let k = 1; k < 12; k++) if (onLand(world, a[0] + ((b[0] - a[0]) * k) / 12, a[1] + ((b[1] - a[1]) * k) / 12)) return false;
  return true;
}

// Where a raid's longships are on a given day, for the map.
export function longshipAt(world, r, day) {
  const pts = r.path;
  const out = day < r.land ? (day - r.start) / Math.max(1, r.land - r.start) : day < r.raided ? 1 : 1 - (day - r.raided) / Math.max(1, r.home - r.raided);
  const f = clamp(out, 0, 1);
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const target = f * lens.at(-1);
  let i = 1;
  while (i < lens.length - 1 && lens[i] < target) i++;
  const seg = (target - lens[i - 1]) / ((lens[i] - lens[i - 1]) || 1);
  const p = pts[i - 1];
  const q = pts[i];
  const homeward = day >= r.raided;
  return { x: p[0] + (q[0] - p[0]) * seg, y: p[1] + (q[1] - p[1]) * seg, homeward, heading: Math.atan2((q[1] - p[1]) * (homeward ? -1 : 1), (q[0] - p[0]) * (homeward ? -1 : 1)) };
}

export function monthlySeas(state, world, rng) {
  const c = S(world);
  const rid = seaRealm(state, world);
  if (!c || !rid) return;
  keepBonds(state, world);
  const z = seas(state);
  if (z.hired && z.hired.until <= state.day) z.hired = null;
  if (!c.months.includes(dateOf(state.day).month)) return;
  if (z.raids.some((r) => r.home > state.day)) return;
  const all = raidTargets(state, world, rid);
  if (!all.length) return;
  const hired = z.hired && all.filter((id) => ownerOf(state, world, id) === z.hired.against);
  const pool = hired?.length ? hired : all;
  if (!rng.chance(Math.min(0.95, c.chance * (hired?.length ? 2 : 1)))) return;
  const to = pool[Math.floor(rng.next() * pool.length)];
  const raid = { id: z.nextId++, to, realm: ownerOf(state, world, to), start: state.day, land: state.day + c.sail, raided: state.day + c.sail + 2, home: state.day + c.sail * 2 + 2, path: seaPath(world, to), loot: 0, done: false };
  z.raids.push(raid);
  const text = `Longships out of ${sideName(world, rid)} put to sea, bound south along the coast.`;
  if (raid.realm === TEMERIA) addDispatch(state, `${text} The watch at ${world.byId[to].name} has seen their sails.`, 'military');
  else if (informed(state, world, rid) || informed(state, world, raid.realm)) addDispatch(state, text, 'abroad');
}

// Each day: a raid lands and burns, or comes home with its loot.
export function stepSeasDay(state, world) {
  const c = S(world);
  const z = state.seas;
  if (!c || !z?.raids.length) return;
  const rid = c.realm;
  for (const r of z.raids) {
    if (!r.done && state.day >= r.land) {
      r.done = true;
      if (ownerOf(state, world, r.to) !== r.realm) continue;
      const people = (() => {
        const p = r.realm === TEMERIA ? state.settlements[r.to] : state.realms[r.realm]?.settlements[r.to];
        if (!p) return 0;
        return typeof p.population === 'number' ? p.population : Object.values(p.population).reduce((a, b) => a + b, 0);
      })();
      r.loot = Math.round(c.loot.base + people * c.loot.perPerson);
      hurtPlace(state, world, r.to, { prosperity: c.raid.prosperity, people: c.raid.people, unrest: c.raid.unrest });
      const text = `Skelligers come ashore at ${world.byId[r.to].name} in ${sideName(world, r.realm)}, burn the waterfront and sail off with ${r.loot} crowns' worth of plunder.`;
      if (r.realm === TEMERIA) {
        state.treasury -= Math.min(Math.max(0, state.treasury), Math.round(r.loot / 2));
        addDispatch(state, text, 'military');
      } else addDispatch(state, text, 'abroad');
    }
  }
  for (const r of z.raids) {
    if (state.day >= r.home && state.realms[rid]) state.realms[rid].treasury += r.loot;
  }
  z.raids = z.raids.filter((r) => state.day < r.home);
}

// ---- The crown's dealings with the isles ----

export function canHireLongships(state, world, against) {
  const c = S(world);
  const rid = seaRealm(state, world);
  if (!c || !rid) return { ok: false, reason: 'There are no longships to hire.' };
  if (hostile(state, TEMERIA, rid)) return { ok: false, reason: 'We are at war with the isles.' };
  if ((state.neighbours[rid]?.relation ?? 0) < c.hire.minRelation) return { ok: false, reason: `${sideName(world, rid)} will not sail for us.` };
  if (!against || against === TEMERIA || against === rid || !state.realms[against] || state.realms[against].fallen) return { ok: false, reason: 'Choose a realm with a coast.' };
  if (against === world.realms.realms[rid].boundTo) return { ok: false, reason: `${sideName(world, rid)} will never raid ${sideName(world, against)}.` };
  if (!(world.foreignByRealm[against] ?? []).some((id) => coastal(world, id))) return { ok: false, reason: `${sideName(world, against)} has no coast.` };
  if (state.treasury < c.hire.coin) return { ok: false, reason: 'Not enough in the treasury.' };
  if (seas(state).hired?.until > state.day) return { ok: false, reason: 'Their longships are already in our pay.' };
  return { ok: true, coin: c.hire.coin };
}

export function hireLongships(state, world, against) {
  const c = S(world);
  const rid = seaRealm(state, world);
  state.treasury -= c.hire.coin;
  seas(state).hired = { against, until: state.day + c.hire.months * 30 };
  state.neighbours[rid].relation = clamp(state.neighbours[rid].relation + 5, -100, 100);
  addDispatch(state, `Temerian silver buys the jarls' favour: for the next ${c.hire.months} months Skellige's longships will hunt along the coast of ${sideName(world, against)}.`, 'abroad');
}

export function canPayOffLongships(state, world) {
  const c = S(world);
  const rid = seaRealm(state, world);
  if (!c || !rid) return { ok: false, reason: 'There are no longships to pay.' };
  if (seas(state).paid > state.day) return { ok: false, reason: 'They are already paid to keep away.' };
  if (state.treasury < c.payoff.coin) return { ok: false, reason: 'Not enough in the treasury.' };
  return { ok: true, coin: c.payoff.coin };
}

export function payOffLongships(state, world) {
  const c = S(world);
  state.treasury -= c.payoff.coin;
  seas(state).paid = state.day + c.payoff.months * 30;
  addDispatch(state, `A chest of crowns goes to Kaer Trolde. For ${c.payoff.months} months Skellige's longships will leave Temeria's vassals in peace.`, 'abroad');
}
