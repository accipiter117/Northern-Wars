// The board of the North (M20 D and E). Zoomed out, the map becomes a simple
// board of the North's realms: each a name over its land and a marker with
// its armies (in hundreds, only where the crown can see) and a few pips for
// the state of its works; thin routes join neighbours. The crown gives a few
// orders a month from here (march, trade, envoy); at the turn of the month
// the crown's orders and the rulers' own moves go out together, and armies
// march and fight in real time as before.
import { canTrade, makeDeal, dealPreview } from './market.js';
import { addDispatch, clamp } from './realm.js';
import { sendFigure, courtOf } from './figures.js';
import { pointInPolygon, distanceToPolygon } from './geometry.js';
import { TEMERIA, ownerOf, hostile, sideName, placesHeldBy, placeOf, warBetween } from './conflict.js';
import { informed } from './realms.js';
import { worksSummary } from './works.js';
import { weighDeal, canSign, signDeal, counterOffer, itemProblem } from './deals.js';
import { treatyBetween } from './diplomacy.js';
import { canOrder, orderArmy } from './armies.js';
import { roadPath } from './world.js';
import { dateOf, MONTHS } from './calendar.js';

export const ORDERS_A_MONTH = 3;
const say = (state, text) => addDispatch(state, text, 'abroad');

// ---- The realms on the board ----

// Every realm still standing, Temeria first.
export function boardRealms(state, world) {
  const out = [TEMERIA];
  for (const rid of Object.keys(world.geography.neighbours)) {
    if (!state.realms?.[rid] || state.realms[rid].fallen) continue;
    if (!placesHeldBy(state, world, rid).length) continue;
    out.push(rid);
  }
  return out;
}

const shapeCache = new WeakMap();
// A realm's traced outlines, and where its name and marker stand: its
// capital if it holds it, else the middle of its largest outline.
export function realmGeometry(world, rid) {
  let cache = shapeCache.get(world);
  if (!cache) shapeCache.set(world, (cache = {}));
  if (cache[rid]) return cache[rid];
  const shapes = rid === TEMERIA ? [world.geography.temeria] : world.geography.neighbours[rid]?.shapes ?? [];
  let best = null;
  for (const sh of shapes) {
    let area = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0, j = sh.length - 1; i < sh.length; j = i++) {
      const f = sh[j][0] * sh[i][1] - sh[i][0] * sh[j][1];
      area += f;
      cx += (sh[j][0] + sh[i][0]) * f;
      cy += (sh[j][1] + sh[i][1]) * f;
    }
    area /= 2;
    if (!area) continue;
    const c = { x: cx / (6 * area), y: cy / (6 * area), area: Math.abs(area) };
    if (!best || c.area > best.area) best = c;
  }
  const capital = rid === TEMERIA ? world.kingdom.capital : world.realms?.realms[rid]?.capital;
  cache[rid] = { shapes, centre: best ?? { x: 0, y: 0 }, capital };
  return cache[rid];
}

// Where a realm's marker stands now: on its capital, or failing that the
// first town it holds, or the middle of its land.
export function markerAt(state, world, rid) {
  const g = realmGeometry(world, rid);
  if (g.capital && ownerOf(state, world, g.capital) === rid) return { x: world.byId[g.capital].x, y: world.byId[g.capital].y };
  const held = placesHeldBy(state, world, rid);
  if (held.length) return { x: world.byId[held[0]].x, y: world.byId[held[0]].y };
  return { x: g.centre.x, y: g.centre.y };
}

// Which realm's land a point of the map lies in, by the traced outlines.
export function realmAtPoint(world, x, y) {
  if (pointInPolygon(x, y, world.geography.temeria)) return TEMERIA;
  for (const [rid, n] of Object.entries(world.geography.neighbours)) if (n.shapes.some((sh) => pointInPolygon(x, y, sh))) return rid;
  return null;
}

const linkCache = new WeakMap();
// Thin routes between neighbours: realms whose outlines touch, or whose
// towns a road joins across the border.
export function boardLinks(world) {
  const cached = linkCache.get(world);
  if (cached && cached.version === world.landsVersion) return cached.links;
  const realms = [TEMERIA, ...Object.keys(world.geography.neighbours)];
  const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const set = new Set();
  // Shared borders: a point of one outline within a few units of the other.
  for (let i = 0; i < realms.length; i++) {
    for (let j = i + 1; j < realms.length; j++) {
      const A = realmGeometry(world, realms[i]).shapes;
      const B = realmGeometry(world, realms[j]).shapes;
      const touch = A.some((sa) => sa.some(([x, y], k) => k % 2 === 0 && B.some((sb) => distanceToPolygon(x, y, sb) < 6)));
      if (touch) set.add(key(realms[i], realms[j]));
    }
  }
  // Roads that cross from one realm's towns to another's.
  const realmOfTown = (id) => world.realmOf?.[id] ?? (world.geography.settlements.some((s) => s.id === id) ? TEMERIA : null);
  for (const [a, b] of [...(world.geography.foreignRoads ?? []), ...(world.geography.roads ?? [])]) {
    const ra = realmOfTown(a);
    const rb = realmOfTown(b);
    if (ra && rb && ra !== rb) set.add(key(ra, rb));
  }
  const links = [...set].map((k) => k.split('|'));
  linkCache.set(world, { version: world.landsVersion, links });
  return links;
}

export function neighboursOnBoard(world, rid) {
  return boardLinks(world).filter(([a, b]) => a === rid || b === rid).map(([a, b]) => (a === rid ? b : a));
}

// ---- What the crown knows of a realm ----

// Whether the crown can see a realm's armies: its own always; others
// through an embassy, a spy, a friend or a road open to its merchants.
export function seesRealm(state, world, rid) {
  return rid === TEMERIA || informed(state, world, rid);
}

// The men under a realm's banners: its garrisons, its standing army and its
// armies in the field (the crown's own: garrisons, companies and armies).
export function realmMen(state, world, rid) {
  const field = (state.armies ?? []).filter((a) => a.side === rid).reduce((s, a) => s + a.soldiers, 0);
  const held = (places) => Object.values(places ?? {}).reduce((s, t) => s + (t.garrison ?? 0), 0);
  if (rid === TEMERIA) return field + held(state.settlements) + (state.forces?.companies ?? []).reduce((s, c) => s + (c.army ? 0 : c.men), 0);
  return field + held(state.realms[rid]?.settlements) + (state.realms[rid]?.army ?? 0);
}

// A realm's works at a glance: how many, their mean condition, how many
// worn and ruined.
export function realmWorks(state, world, rid) {
  let n = 0;
  let sum = 0;
  let worn = 0;
  let ruined = 0;
  for (const id of placesHeldBy(state, world, rid)) {
    const p = placeOf(state, world, id);
    if (!p?.buildings) continue;
    const w = worksSummary(p);
    n += w.n;
    sum += w.mean * w.n;
    worn += w.worn;
    ruined += w.ruined;
  }
  return { n, mean: n ? sum / n : 100, worn, ruined };
}

// The board's view of one realm, for its marker and its card.
export function boardRealm(state, world, rid) {
  const towns = placesHeldBy(state, world, rid);
  const seen = seesRealm(state, world, rid);
  return {
    id: rid,
    name: rid === TEMERIA ? world.kingdom.name : sideName(world, rid),
    at: markerAt(state, world, rid),
    towns: towns.length,
    men: seen ? realmMen(state, world, rid) : null,
    works: realmWorks(state, world, rid),
    seen,
    war: rid !== TEMERIA && hostile(state, TEMERIA, rid),
  };
}

// Armies marching from one realm into another, for the dashed lines.
export function marches(state, world) {
  const out = [];
  for (const a of state.armies ?? []) {
    if (!a.target || a.battle) continue;
    const to = ownerOf(state, world, a.target);
    const from = ownerOf(state, world, a.at);
    if (!to || to === from || a.at === a.target) continue;
    const seen = a.side === TEMERIA || seesRealm(state, world, a.side);
    if (!seen) continue;
    out.push({ army: a.id, side: a.side, from: from ?? a.side, to, men: a.soldiers });
  }
  return out;
}

// ---- Orders (Part E) ----

function orders(state) {
  state.orders ??= { list: [], last: [], theirs: [], envoys: [] };
  return state.orders;
}

export const TRADE_GIVE = ['grain', 'timber', 'stone', 'iron', 'cloth', 'spirit'];

export function canGiveOrder(state, world, o) {
  const list = orders(state).list;
  if (list.length >= ORDERS_A_MONTH) return { ok: false, reason: `Three orders a month: ${ORDERS_A_MONTH} are set.` };
  if (!o?.realm || o.realm === TEMERIA || !state.realms?.[o.realm] || state.realms[o.realm].fallen) return { ok: false, reason: 'Choose a realm of the North.' };
  if (list.some((x) => x.kind === o.kind && x.realm === o.realm)) return { ok: false, reason: 'Already ordered this month.' };
  if (o.kind === 'march') {
    const a = (state.armies ?? []).find((x) => x.id === o.army && x.side === TEMERIA);
    if (!a) return { ok: false, reason: 'Raise an army first (Military).' };
    if (a.battle) return { ok: false, reason: 'That army is fighting.' };
    if (!hostile(state, TEMERIA, o.realm) && !treatyBetween(state, TEMERIA, o.realm, 'access')) return { ok: false, reason: `We are not at war with ${sideName(world, o.realm)}, nor have leave to cross it.` };
    if (!marchTarget(state, world, a, o.realm)) return { ok: false, reason: 'No road leads into it.' };
    return { ok: true };
  }
  if (o.kind === 'trade') {
    // Since M21, a trade order proposes a deal in the five goods.
    if (world.market) return canTrade(state, world, o.realm, o.sell ?? null, o.buy ?? null);
    if (hostile(state, TEMERIA, o.realm)) return { ok: false, reason: 'No trade with an enemy.' };
    if (!(world.neighbours.realms[o.realm]?.trade > 0)) return { ok: false, reason: `${sideName(world, o.realm)} does not trade with Temeria.` };
    if (!TRADE_GIVE.includes(o.give) || !world.diplomacy?.goods?.[o.take] || o.give === o.take) return { ok: false, reason: 'Choose what to send and what to ask for.' };
    const problem = itemProblem(state, world, o.realm, tradeItems(world, o)[0]);
    if (problem) return { ok: false, reason: problem };
    return { ok: true };
  }
  if (o.kind === 'envoy') return { ok: true };
  return { ok: false, reason: 'Unknown order.' };
}

export function giveOrder(state, world, o) {
  const trade = o.kind !== 'trade' ? {} : world.market ? { sell: o.sell ?? null, buy: o.buy ?? null } : { give: o.give, take: o.take };
  const clean = { kind: o.kind, realm: o.realm, ...(o.kind === 'march' ? { army: o.army } : {}), ...trade, day: state.day };
  orders(state).list.push(clean);
  // An envoy rides out at once and reaches the court as the month turns,
  // when the orders are carried out (M23 C).
  if (o.kind === 'envoy') {
    const d = dateOf(state.day);
    sendFigure(state, world, { kind: 'envoy', from: world.kingdom.capital, to: courtOf(world, o.realm), days: Math.max(1, MONTHS[d.month - 1].days - d.day + 1), about: `to ${sideName(world, o.realm)}` });
  }
}

export function cancelOrder(state, i) {
  orders(state).list.splice(i, 1);
}

// The goods each way of a trade order: a month's worth of each, for six months.
export function tradeItems(world, o) {
  const g = world.diplomacy.goods;
  return [
    { kind: 'goods', from: 'us', good: o.give, qty: g[o.give].unit, months: 6 },
    { kind: 'goods', from: 'them', good: o.take, qty: g[o.take].unit, months: 6 },
  ];
}

// Where a march goes: the nearest town of that realm by road.
export function marchTarget(state, world, a, rid) {
  let best = null;
  for (const id of placesHeldBy(state, world, rid)) {
    const path = roadPath(world, a.to ?? a.at, id, true);
    if (!path) continue;
    let d = 0;
    for (let i = 1; i < path.length; i++) d += Math.hypot(world.byId[path[i]].x - world.byId[path[i - 1]].x, world.byId[path[i]].y - world.byId[path[i - 1]].y);
    if (!best || d < best.d) best = { id, d };
  }
  return best?.id ?? null;
}

// The turn of the month: the crown's orders go out, together with the
// rulers' own moves (which the month's strategy has just made).
export function resolveOrders(state, world) {
  const o = orders(state);
  const done = [];
  for (const x of o.list) {
    if (x.kind === 'march') {
      const a = (state.armies ?? []).find((v) => v.id === x.army && v.side === TEMERIA);
      const target = a && marchTarget(state, world, a, x.realm);
      if (!a || !target) { done.push({ ...x, ok: false, text: `The march into ${sideName(world, x.realm)} could not be made.` }); continue; }
      const hostileNow = hostile(state, TEMERIA, x.realm);
      const check = hostileNow ? canOrder(state, world, a, 'siege', target) : { ok: !!treatyBetween(state, TEMERIA, x.realm, 'access') };
      if (!check.ok) { done.push({ ...x, ok: false, text: `${a.name} could not march into ${sideName(world, x.realm)}: ${check.reason ?? 'no leave to cross'}` }); continue; }
      if (hostileNow) orderArmy(state, world, a, 'siege', target);
      else { a.order = 'defend'; a.target = target; }
      done.push({ ...x, ok: true, text: `${a.name} marches into ${sideName(world, x.realm)}, on ${world.byId[target].name}.` });
    } else if (x.kind === 'trade' && world.market) {
      const check = canTrade(state, world, x.realm, x.sell ?? null, x.buy ?? null);
      if (check.ok) {
        makeDeal(state, world, x.realm, x.sell ?? null, x.buy ?? null);
        const p = dealPreview(state, world, x.realm, x.sell ?? null, x.buy ?? null);
        done.push({ ...x, ok: true, text: `Our trade with ${sideName(world, x.realm)} is agreed: ${p.lines.join(' ')}` });
      } else done.push({ ...x, ok: false, text: `${sideName(world, x.realm)} will not trade on those terms. ${check.reason}` });
    } else if (x.kind === 'trade') {
      let items = tradeItems(world, x);
      let c = canSign(state, world, x.realm, items);
      if (!c.ok) {
        // A ruler close to agreeing names what would make it do.
        const counter = counterOffer(state, world, x.realm, items);
        if (counter.items && canSign(state, world, x.realm, counter.items).ok) {
          items = counter.items;
          c = { ok: true };
        }
      }
      if (c.ok) {
        signDeal(state, world, x.realm, items);
        done.push({ ...x, ok: true, text: `${sideName(world, x.realm)} takes our ${world.diplomacy.goods[x.give].name.toLowerCase()} for their ${world.diplomacy.goods[x.take].name.toLowerCase()}, month by month.` });
      } else done.push({ ...x, ok: false, text: `${sideName(world, x.realm)} will not trade on those terms. ${weighDeal(state, world, x.realm, items).line ?? ''}`.trim() });
    } else if (x.kind === 'envoy') {
      // The envoy reaches the court: the ruler is a little warmer, and an
      // audience waits to be held.
      const n = state.neighbours?.[x.realm];
      if (n) n.relation = clamp(n.relation + 3, -100, 100);
      o.envoys = [...(o.envoys ?? []).filter((e) => e.realm !== x.realm), { realm: x.realm, day: state.day }];
      done.push({ ...x, ok: true, text: `Our envoy has reached the court of ${sideName(world, x.realm)}. An audience waits.` });
    }
  }
  for (const d of done) say(state, d.text);
  o.last = done;
  o.list = [];
}

// What the rulers did at the turn of the month, for the board: armies set
// marching into another realm, and wars declared.
export function noteTheirMoves(state, world, before) {
  const o = orders(state);
  const moves = [];
  for (const m of marches(state, world)) {
    if (m.side === TEMERIA || before.has(m.army)) continue;
    moves.push({ realm: m.side, text: `${sideName(world, m.side)} marches on ${sideName(world, m.to)}.` });
  }
  for (const w of state.wars ?? []) {
    if (w.since !== state.day && w.since !== state.day - 1) continue;
    moves.push({ realm: w.sides[0][0], text: `${sideName(world, w.sides[0][0])} declares war on ${sideName(world, w.sides[1][0])}.` });
  }
  o.theirs = moves.slice(0, 8);
}

export function marchingNow(state, world) {
  return new Set(marches(state, world).map((m) => m.army));
}

// The month the orders are for, in words.
export function ordersMonth(state) {
  const d = dateOf(state.day);
  return d;
}

export function envoysWaiting(state, world) {
  return (state.orders?.envoys ?? []).filter((e) => state.day - e.day <= (world.diplomacy?.requests?.expireDays ?? 20) && state.realms?.[e.realm]);
}

export function warWithText(state, world, rid) {
  return warBetween(state, TEMERIA, rid) ? `At war with ${sideName(world, rid)}.` : '';
}
