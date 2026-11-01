// The map south of the Yaruga (M30 A): the bounds run further south, the
// Empire's northern provinces are whole, Ebbing is traced below Cintra and
// west of Nazair, the heartland is a dark band at the edge with roads that
// leave the map, and an older save's fog grows to fit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { nodeWorld } from '../helpers.js';
import { createState, step, serialize, deserialize } from '../../src/sim/index.js';
import { pointInPolygon } from '../../src/sim/geometry.js';
import { STATE_VERSION } from '../../src/sim/state.js';

const world = await nodeWorld();
const g = world.geography;
// The Empire's provinces are part of one realm since M30 C.
const land = (id) => g.lands[id] ?? g.neighbours[id] ?? g.neighbours.nilfgaard.provinces[id];
const maxY = (id) => Math.max(...land(id).shapes.flat().map(([, y]) => y));
const near = (a, b) => a.shapes.some((p) => b.shapes.some((q) => p.some(([x, y]) => q.some(([u, v]) => Math.hypot(x - u, y - v) < 2))));

test('the map runs about 450 further south, to the Empire\'s heartland', () => {
  assert.deepEqual(g.bounds, [-600, -650, 1700, 1950]);
  const band = g.lands.heartland;
  assert.ok(band.heartland, 'the heartland is marked as the dark band');
  assert.equal(maxY('heartland'), 1950, 'it runs to the southern edge');
  // The provinces reach the band rather than being cut off by the old edge.
  for (const id of ['nazair', 'mag_turga', 'metinna', 'ebbing']) {
    assert.ok(maxY(id) > 1700, `${id} is whole`);
    assert.ok(near(land(id), band), `${id} meets the heartland`);
  }
  // Toussaint closes above Metinna instead of at a straight edge.
  assert.ok(near(land('toussaint'), land('metinna')));
  for (const [id, n] of Object.entries(g.lands)) {
    for (const [x, y] of n.shapes.flat()) assert.ok(x >= g.bounds[0] && x <= g.bounds[2] && y >= g.bounds[1] && y <= g.bounds[3], `${id} out of bounds at ${x},${y}`);
  }
});

test('Ebbing lies below Cintra and west of Nazair, with a capital and towns', () => {
  const e = land('ebbing');
  assert.equal(e.name, 'Ebbing');
  assert.ok(near(e, g.neighbours.cintra), 'it borders Cintra');
  assert.ok(near(e, land('nazair')), 'it borders Nazair');
  const towns = [...world.distantTowns, ...world.foreign].filter((t) => e.shapes.some((sh) => pointInPolygon(t.x, t.y, sh)));
  assert.ok(towns.length >= 3 && towns.length <= 5, `${towns.length} towns`);
  assert.equal(towns.filter((t) => t.type === 'city').length, 1, 'one capital city');
  for (const t of towns) assert.ok(e.shapes.some((sh) => pointInPolygon(t.x, t.y, sh)), t.id);
  // West of Nazair: every Ebbing town stands west of Nazair's capital.
  const nazair = world.byId.nazair_city;
  for (const t of towns) assert.ok(t.x < nazair.x, t.id);
  // Its own roads, and a road on to Cintra.
  const roads = [...g.distantRoads, ...g.foreignRoads].filter(([a, b]) => towns.some((t) => t.id === a || t.id === b));
  assert.ok(roads.length >= towns.length - 1);
  assert.ok(roads.some(([a, b]) => [a, b].some((id) => world.byId[id]?.realm === 'cintra')), 'a road to Cintra');
});

test('the roads south leave the map for the City of the Golden Towers', () => {
  assert.equal(g.roadEndLabel, 'To the City of the Golden Towers');
  assert.ok(g.roadEnds.length >= 2);
  for (const e of g.roadEnds) {
    assert.ok(e.y > g.bounds[3] - 30, `${e.id} at the edge`);
    assert.ok(g.lands.heartland.shapes.some((sh) => pointInPolygon(e.x, e.y, sh)), `${e.id} in the heartland`);
    assert.ok(g.distantRoads.some(([a, b]) => a === e.id || b === e.id), `${e.id} is joined by a road`);
  }
  // Nothing in the heartland is simulated: no town stands in it.
  for (const t of [...world.foreign, ...world.distantTowns]) assert.ok(!g.lands.heartland.shapes.some((sh) => pointInPolygon(t.x, t.y, sh)), t.id);
});

test('the fog covers the new ground, and an older save\'s fog grows to fit', () => {
  const grid = world.grid;
  assert.equal(grid.y0 + grid.rows * grid.cell >= 1950, true, 'the fog reaches the southern edge');
  const s = step(createState(world, 2), 20, world, { ambient: true });
  const old = JSON.parse(serialize(s));
  // As a version 29 save made on the smaller map would have it.
  const oldRows = Math.ceil((1500 - grid.y0) / grid.cell);
  old.version = 29;
  old.state.version = 29;
  old.state.ambient.intel.explored = old.state.ambient.intel.explored.slice(0, Math.ceil((grid.cols * oldRows) / 30));
  const up = deserialize(JSON.stringify(old), world);
  assert.equal(up.version, STATE_VERSION);
  assert.equal(up.ambient.intel.explored.length, Math.ceil((grid.cols * grid.rows) / 30));
  // Everything it had explored is still explored.
  assert.deepEqual(up.ambient.intel.explored.slice(0, 10), s.ambient.intel.explored.slice(0, 10));
  assert.ok(step(up, 30, world, { ambient: true }));
});
