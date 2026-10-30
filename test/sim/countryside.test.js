// The countryside (M23 D), placed in Node: the same every time; busier where
// people live; never on a road, a river, a lake, a town or a name; abroad
// as well as at home; and nothing drawn from the board's distance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { nodeWorld } from '../helpers.js';

// The map's paths are only stored, never drawn, in Node.
globalThis.Path2D ??= class { addPath() {} moveTo() {} lineTo() {} closePath() {} rect() {} };
const { prepareMap } = await import('../../src/render/mapLayer.js');
const { prepareCountryside, drawCountryside } = await import('../../src/render/countryside.js');
const { pointInPolygon } = await import('../../src/sim/geometry.js');

const world = await nodeWorld();
const prep = prepareMap(world);
const cs = prepareCountryside(world, prep);

function near(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

test('the same countryside every time, within its budget', () => {
  const again = prepareCountryside(world, prep);
  assert.deepEqual(again.marks.map((m) => [m.kind, m.x, m.y]), cs.marks.map((m) => [m.kind, m.x, m.y]));
  assert.ok(cs.marks.length > 3000 && cs.marks.length <= 12000, `${cs.marks.length} marks`);
  const kinds = new Set(cs.marks.map((m) => m.kind));
  for (const k of ['field', 'orchard', 'farmstead', 'windmill', 'copse', 'poi', 'wild']) assert.ok(kinds.has(k), k);
});

test('busier where people live: fields by the towns, wild land far from them', () => {
  const ring = (id, r0, r1) => cs.marks.filter((m) => { const d = Math.hypot(m.x - world.byId[id].x, m.y - world.byId[id].y); return d >= r0 && d < r1; });
  const close = ring('vizima', 0, 80);
  const share = (list, kind) => list.filter((m) => m.kind === kind).length / Math.max(1, list.length);
  assert.ok(share(close, 'field') > 0.4, `fields near Vizima ${share(close, 'field')}`);
  const far = cs.marks.filter((m) => world.geography.settlements.every((st) => Math.hypot(st.x - m.x, st.y - m.y) > 150) && (world.foreign ?? []).every((st) => Math.hypot(st.x - m.x, st.y - m.y) > 150));
  assert.ok(far.length > 50);
  assert.ok(share(far, 'field') < 0.15 && share(far, 'wild') + share(far, 'copse') > 0.6, `far: fields ${share(far, 'field')}`);
  // Windmills only by the bigger places.
  for (const m of cs.marks.filter((x) => x.kind === 'windmill')) {
    assert.ok([...world.geography.settlements, ...(world.foreign ?? [])].some((st) => ['city', 'town'].includes(st.type) && Math.hypot(st.x - m.x, st.y - m.y) < 110), 'a windmill by a town');
  }
});

test('nothing on a road, a river, a lake, a town or a name', () => {
  for (const m of cs.marks) {
    for (const s of prep.roads) assert.ok(near(m.x, m.y, s.a.x, s.a.y, s.b.x, s.b.y) >= 5.5, `${m.kind} on a road`);
    for (const r of prep.rivers) for (let i = 1; i < r.pts.length; i++) assert.ok(near(m.x, m.y, ...r.pts[i - 1], ...r.pts[i]) >= 6, `${m.kind} on the ${r.name}`);
    for (const l of prep.lakes) assert.ok(((m.x - l.x) / (l.rx + 6)) ** 2 + ((m.y - l.y) / (l.ry + 6)) ** 2 >= 1, 'in a lake');
    for (const st of world.geography.settlements) {
      assert.ok(Math.hypot(st.x - m.x, st.y - m.y) >= 17, `${m.kind} on ${st.name}`);
      assert.ok(!(Math.abs(st.x - m.x) < 24 && m.y - st.y > 10 && m.y - st.y < 22), `${m.kind} on the name of ${st.name}`);
    }
    for (const t of prep.terrain) if (t.box && m.x > t.box.x0 && m.x < t.box.x1 && m.y > t.box.y0 && m.y < t.box.y1) assert.ok(!pointInPolygon(m.x, m.y, t.shape), `${m.kind} in ${t.name ?? t.kind}`);
  }
});

test('the foreign realms have their countryside too', () => {
  const abroad = cs.marks.filter((m) => !pointInPolygon(m.x, m.y, world.geography.temeria));
  const home = cs.marks.length - abroad.length;
  assert.ok(abroad.length > 1000 && home > 500, `${abroad.length} abroad, ${home} at home`);
});

test('drawn by the season and the land, thinned under Battery saver, never from the board', () => {
  const calls = { fill: [], n: 0 };
  const ctx = new Proxy({}, {
    get: (o, k) => (k in o ? o[k] : (k === 'fillStyle' || k === 'strokeStyle' ? o[k] : () => { calls.n += 1; })),
    set: (o, k, v) => { o[k] = v; if (k === 'fillStyle') calls.fill.push(v); return true; },
  });
  const v = { x0: world.byId.vizima.x - 120, y0: world.byId.vizima.y - 120, x1: world.byId.vizima.x + 120, y1: world.byId.vizima.y + 120 };
  const look = (o = {}) => ({ season: 'summer', snow: false, burnt: new Set(), bare: new Set(), thin: false, ...o });
  assert.equal(drawCountryside(ctx, cs, 1, v, 0, look()), 0, 'nothing from the board');
  const full = drawCountryside(ctx, cs, 1, v, 2, look());
  const thin = drawCountryside(ctx, cs, 1, v, 2, look({ thin: true }));
  const far = drawCountryside(ctx, cs, 1, v, 1, look());
  assert.ok(full > 50 && thin < full && far < full, `${full} full, ${thin} thin, ${far} from afar`);
  // The fields change colour with the season, and burn round a sacked town.
  calls.fill = [];
  drawCountryside(ctx, cs, 1, v, 2, look({ season: 'spring' }));
  const spring = new Set(calls.fill);
  calls.fill = [];
  drawCountryside(ctx, cs, 1, v, 2, look({ season: 'winter', snow: true }));
  const winter = new Set(calls.fill);
  assert.notDeepEqual([...spring].sort(), [...winter].sort());
  calls.fill = [];
  const towns = new Set(cs.marks.filter((m) => m.x > v.x0 && m.x < v.x1 && m.y > v.y0 && m.y < v.y1).map((m) => m.town));
  drawCountryside(ctx, cs, 1, v, 2, look({ burnt: towns }));
  assert.ok(calls.fill.includes('#5a4836'), 'burnt fields');
});
