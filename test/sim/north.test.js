// The North retraced from the atlas (M15 B): every town where it should be,
// nothing at sea, every town reachable by road, roads clear of the
// mountains, Temeria untouched, the wilds abroad breeding their own threats,
// and old saves carried over with nothing lost.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { nodeWorld } from '../helpers.js';
import { createState, step, serialize, deserialize, ownerOf } from '../../src/sim/index.js';
import { pointInPolygon } from '../../src/sim/geometry.js';
import { buildNorth, MODELLED } from '../../tools/north.mjs';
import { STATE_VERSION } from '../../src/sim/state.js';
import { canOrderCompany, bestCompanyFor } from '../../src/sim/forces.js';

const world = await nodeWorld();
const g = world.geography;
const north = JSON.parse(await readFile(new URL('../../data/north-geography.json', import.meta.url), 'utf8'));
const shapesOf = (id) => g.neighbours[id]?.shapes ?? g.lands[id]?.shapes;
const land = [g.temeria, ...Object.values(g.neighbours).flatMap((n) => n.shapes), ...Object.values(g.lands).flatMap((n) => n.shapes)];
const onLand = (x, y) => land.some((sh) => pointInPolygon(x, y, sh));

test('the geography is built from the atlas and the build is current', async () => {
  const { geography } = await buildNorth();
  assert.deepEqual(JSON.parse(JSON.stringify(geography)), JSON.parse(JSON.stringify(g)), 'data/geography.json is out of date: run node tools/north.mjs');
  assert.equal(Object.keys(g.neighbours).length + Object.keys(g.lands).length, Object.keys(north.realms).length);
  assert.deepEqual(Object.keys(g.neighbours).sort(), [...MODELLED].sort());
  for (const id of ['kovir', 'poviss', 'hengfors', 'lyria_rivia', 'dol_blathanna', 'angren', 'nazair', 'mag_turga', 'toussaint', 'tir_tochair', 'metinna', 'korath', 'skellige']) assert.ok(g.lands[id], id);
  // Every traced town is on the map, in a realm or a land beyond.
  assert.equal(world.foreign.length + world.distantTowns.length, north.towns.length);
  for (const t of north.towns) assert.ok([...world.foreign, ...world.distantTowns].some((s) => s.name === t.name), t.name);
  // The invented towns are gone.
  for (const name of ['Saltmarsh', 'Palmyra', 'Lowmarsh', 'Fordham', 'Riverwatch', 'Ardwind', 'Hollowmere', 'Deepdelve']) {
    assert.ok(![...world.foreign, ...world.distantTowns].some((s) => s.name === name), name);
  }
  // Every river of the atlas, and its lakes.
  for (const name of Object.keys(north.rivers)) if (north.rivers[name].realm !== 'temeria') assert.ok(g.rivers[name], name);
  for (const l of north.lakes) assert.ok(g.lakes.some((x) => x.name === l.name), l.name);
});

test('every town lies inside its own realm, and nothing lies in the sea', () => {
  for (const s of world.foreign) assert.ok(shapesOf(s.realm).some((sh) => pointInPolygon(s.x, s.y, sh)), `${s.id} outside ${s.realm}`);
  for (const s of world.distantTowns) assert.ok(shapesOf(s.land).some((sh) => pointInPolygon(s.x, s.y, sh)), `${s.id} outside ${s.land}`);
  for (const [kind, zones] of Object.entries(g.terrain)) {
    for (const z of zones) for (const [x, y] of z.shape) assert.ok(onLand(x, y), `${kind} ${z.name} at sea at ${x},${y}`);
  }
  for (const l of g.lakes) assert.ok(onLand(l.x, l.y), l.name);
});

test('every town is reachable by road, and roads go round the mountains', () => {
  // From Vizima, over every road the realms share.
  const seen = new Set(['vizima']);
  const queue = ['vizima'];
  while (queue.length) for (const e of world.fullAdjacency[queue.shift()]) if (!seen.has(e.to)) { seen.add(e.to); queue.push(e.to); }
  for (const s of world.foreign) assert.ok(seen.has(s.id), `${s.id} has no road`);
  // The lands beyond, by their own roads and the roads to them.
  const links = {};
  for (const [a, b] of [...g.roads, ...g.foreignRoads, ...g.distantRoads]) {
    (links[a] ??= []).push(b);
    (links[b] ??= []).push(a);
  }
  const all = new Set(['vizima']);
  const q2 = ['vizima'];
  while (q2.length) for (const n of links[q2.shift()] ?? []) if (!all.has(n)) { all.add(n); q2.push(n); }
  for (const s of world.distantTowns) assert.ok(all.has(s.id), `${s.id} has no road`);
  // No road runs more than a short pass through mountains, unless the atlas
  // puts one of its towns up in the range itself (Loc Muinne, Pomerol).
  const peaks = g.terrain.mountains.filter((z) => z.realm).map((z) => z.shape);
  const byId = { ...world.byId, ...Object.fromEntries(world.distantTowns.map((t) => [t.id, t])) };
  const high = (t) => peaks.some((sh) => pointInPolygon(t.x, t.y, sh));
  for (const [a, b] of [...g.foreignRoads, ...g.distantRoads]) {
    const A = byId[a];
    const B = byId[b];
    if (high(A) || high(B)) continue;
    let inside = 0;
    for (let i = 1; i < 20; i++) if (peaks.some((sh) => pointInPolygon(A.x + ((B.x - A.x) * i) / 20, A.y + ((B.y - A.y) * i) / 20, sh))) inside++;
    assert.ok(inside / 19 <= 0.4, `${a} to ${b} climbs through the mountains`);
  }
});

test('Temeria itself is unchanged', async () => {
  // A snapshot of Temeria from before M15 (CI checks out without history).
  const old = JSON.parse(await readFile(new URL('../fixtures/temeria-before-m15.json', import.meta.url), 'utf8'));
  assert.deepEqual(g.temeria, old.temeria);
  assert.deepEqual(g.settlements, old.settlements);
  assert.deepEqual(g.roads, old.roads);
  const home = (t) => Object.fromEntries(Object.entries(t).map(([k, zs]) => [k, zs.filter((z) => !z.realm)]));
  assert.deepEqual(home(g.terrain), home(old.terrain));
  for (const name of ['Ismena', 'Embla', 'Ina']) assert.deepEqual(g.rivers[name], old.rivers[name]);
  // Foreign country never counts as Temeria's own wild country.
  for (const zs of Object.values(g.terrain)) for (const z of zs) if (z.realm) assert.notEqual(z.realm, 'temeria');
});

test('the wilds abroad breed their own camps and lairs, which are not the crown\'s to hunt', () => {
  let s = createState(world, 6);
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  // Poor towns abroad: their wild country breeds trouble.
  for (const realm of Object.values(s.realms)) for (const t of Object.values(realm.settlements)) t.prosperity = 15;
  s = step(s, 240, world, { ambient: false });
  const abroad = s.threats.list.filter((t) => t.abroad);
  assert.ok(abroad.length > 0, 'camps and lairs appear abroad');
  for (const t of abroad) {
    assert.equal(world.realmOf[t.near], t.abroad);
    assert.ok(['forest', 'marsh', 'hills', 'mountains'].includes(t.terrain));
    // In wild country abroad, not in Temeria.
    assert.ok(!pointInPolygon(t.x, t.y, g.temeria), `${t.id} in Temeria`);
  }
  // No company or witcher of ours crosses the border after them.
  const t = abroad[0];
  t.sighted = true;
  const c = { id: 99, army: null, task: null, routed: -1 };
  assert.match(canOrderCompany(s, world, c, { kind: 'hunt', threat: t.id }).reason, /over the border/);
  assert.equal(bestCompanyFor(s, world, t), null);
});

test('an old save carries over to the new North with nothing lost', () => {
  // A save from before the atlas: towns that no longer exist hold armies,
  // sieges, owners, routes and memories.
  const s = createState(world, 8);
  s.version = 12;
  s.realms.mahakam.settlements = {
    carbon: { population: 9000, prosperity: 65, garrison: 400, buildings: ['market'], construction: null },
    stonegate: { population: 2200, prosperity: 48, garrison: 120, buildings: ['walls', 'smithy'], construction: null, owner: 'temeria' },
    deepdelve: { population: 2000, prosperity: 40, garrison: 100, buildings: [], construction: { building: 'granary', daysLeft: 20, days: 40 } },
  };
  s.realms.sodden.settlements = { sodden_keep: { population: 2500, prosperity: 50, garrison: 150, buildings: ['walls'], construction: null }, fordham: { population: 300, prosperity: 30, garrison: 8, buildings: ['fields'], construction: null } };
  s.routes = [{ id: 1, from: 'vizima', to: 'stonegate', since: s.day, last: 30, raided: false, closed: null }];
  s.nextRouteId = 2;
  s.armies.push({ id: 77, side: 'temeria', name: 'The army of Carreras', soldiers: 800, raised: 800, morale: 80, levy: {}, companies: 0, marshal: null, stance: 'bold', order: 'siege', target: 'deepdelve', home: 'carreras', at: 'stonegate', to: 'deepdelve', along: 12, path: ['stonegate', 'deepdelve'], dest: 'deepdelve', speed: 0, siege: null, raiding: null, raidTarget: null, raids: 0, retreating: false, fought: -1, units: [], quality: 1 });
  s.ambient.intel.seen.stonegate = { day: s.day - 10, population: 2200, garrison: 120, buildings: ['walls'], construction: null, prosperity: 48, owner: 'temeria' };
  s.ledger.history = [{ ...structuredClone(s.ledger.history.at(-1) ?? { month: 3, year: 1262, income: {}, expenses: {}, treasury: 0 }), income: { routes: { 'vizima>stonegate': 30 } } }];
  const text = JSON.stringify({ format: 'northern-wars-save', version: 12, state: s });
  const up = deserialize(text, world);
  assert.equal(up.version, STATE_VERSION);
  // Stonegate and Deepdelve are both now Mount Carbon's country: what they
  // had is carried there.
  // Held by the crown with no war left to settle it, Mount Carbon is now
  // Temerian (M19), and Mahakam, with no other town, has fallen.
  const carbon = up.settlements.carbon;
  assert.ok(carbon.buildings.includes('walls') && carbon.buildings.includes('smithy') && carbon.buildings.includes('market'));
  assert.equal(ownerOf(up, world, 'carbon'), 'temeria');
  assert.equal(carbon.origin, 'mahakam');
  assert.ok(up.realms.mahakam.fallen);
  assert.ok(!up.realms.mahakam.settlements.stonegate && !up.realms.mahakam.settlements.deepdelve);
  // Sodden's seat keeps its id at Kagen; Fordham's fields go to Riedbrune.
  assert.equal(world.byId.sodden_keep.name, 'Kagen');
  assert.ok(up.realms.sodden.settlements.sodden_keep.buildings.includes('walls'));
  assert.ok(up.realms.sodden.settlements.riedbrune.buildings.includes('fields'));
  // Every new town has its place in its realm.
  for (const st of world.foreign) assert.ok(up.realms[st.realm].settlements[st.id], st.id);
  assert.ok(!world.foreign.some((st) => st.id === 'carbon'));
  // Routes, armies, memories and the ledger follow the towns.
  assert.equal(up.routes[0].to, 'carbon');
  const a = up.armies.find((x) => x.id === 77);
  assert.equal(a.at, 'carbon');
  assert.equal(a.target, world.northIds.renamed.deepdelve);
  assert.deepEqual(a.path, []);
  assert.ok(up.ambient.intel.seen.carbon);
  assert.equal(up.ledger.history.at(-1).income.routes['vizima>carbon'], 30);
  // Nothing anywhere still names a town that is gone.
  const gone = Object.keys(world.northIds.renamed);
  const json = JSON.stringify(up);
  for (const id of gone) assert.ok(!json.includes(`"${id}"`), `${id} still named`);
  // And the upgraded reign plays on.
  const later = step(up, 40, world, { ambient: true });
  assert.ok(later.day > up.day);
  assert.ok(deserialize(serialize(later), world));
});
