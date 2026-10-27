// The board of the North (M20 D and E): one camera with two levels, what the
// board shows of each realm, and the three orders a month that go out at its
// turn together with the rulers' own.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createState, step, applyAction, serialize, deserialize, boardRealms, boardRealm, boardLinks, realmGeometry, realmAtPoint, marches,
} from '../../src/sim/index.js';
import { STATE_VERSION } from '../../src/sim/state.js';
import { boardness, BOARD } from '../../src/render/board.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();
const run = (s, days) => step(s, days, world, { ambient: false });
const act = (s, a) => {
  const out = applyAction(s, world, a);
  assert.equal(out.error, undefined, `${a.type}: ${out.error}`);
  return out.state;
};
const quiet = (s) => {
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  return s;
};
test('the map turns into the board at about two thirds of the opening zoom, with a cross-fade', () => {
  const cam = (rel) => ({ scale: rel * 2, cover: 2 });
  assert.equal(boardness(cam(1)), 0, 'the opening zoom is the kingdom view');
  assert.equal(boardness(cam(BOARD.full)), 0);
  assert.equal(boardness(cam(BOARD.board)), 1);
  assert.equal(boardness(cam(0.3)), 1);
  const half = boardness(cam(0.66));
  assert.ok(half > 0.4 && half < 0.6, `two thirds of the opening zoom is halfway through the fade (${half})`);
  // The fade runs smoothly one way.
  let last = -1;
  for (let r = 0.8; r >= 0.5; r -= 0.01) {
    const b = boardness(cam(r));
    assert.ok(b >= last);
    last = b;
  }
});

test('the board: every realm standing, with its land, a marker, its men where seen and its works', () => {
  const s = createState(world, 3);
  const realms = boardRealms(s, world);
  assert.equal(realms[0], 'temeria');
  assert.ok(realms.includes('redania') && realms.includes('cintra'));
  for (const rid of realms) {
    const g = realmGeometry(world, rid);
    assert.ok(g.shapes.length > 0, `${rid} has land`);
    const v = boardRealm(s, world, rid);
    assert.ok(v.towns > 0);
    if (v.works.n) assert.ok(v.works.mean > 60, `${rid} starts with its works standing`);
    assert.equal(realmAtPoint(world, g.centre.x, g.centre.y) !== null, true);
    if (v.seen) assert.ok(v.men > 0, `${rid}: men under arms`);
    else assert.equal(v.men, null, `${rid}: unseen, its strength is not shown`);
  }
  // Temeria's men count its garrisons.
  const garrisons = Object.values(s.settlements).reduce((a, t) => a + t.garrison, 0);
  assert.ok(boardRealm(s, world, 'temeria').men >= garrisons);
  // Routes join neighbours: shared borders and the foreign roads.
  const links = boardLinks(world).map((l) => [...l].sort().join('-'));
  assert.ok(links.includes('redania-temeria'));
  assert.ok(links.includes('cintra-sodden') || links.includes('brugge-cintra'));
  // Works pips go red as they wear.
  const worn = structuredClone(s);
  for (const t of Object.values(worn.settlements)) for (const b of t.buildings) t.cond = { ...(t.cond ?? {}), [b]: 30 };
  assert.ok(boardRealm(worn, world, 'temeria').works.worn > boardRealm(s, world, 'temeria').works.worn);
});

test('three orders a month: march, trade and envoy, shown as set and refused past three', () => {
  let s = quiet(createState(world, 4));
  s = act(s, { type: 'order', order: { kind: 'envoy', realm: 'redania' } });
  s = act(s, { type: 'order', order: { kind: 'trade', realm: 'redania', give: 'grain', take: 'iron' } });
  assert.match(applyAction(s, world, { type: 'order', order: { kind: 'envoy', realm: 'redania' } }).error, /Already ordered/);
  assert.match(applyAction(s, world, { type: 'order', order: { kind: 'march', realm: 'redania', army: 1 } }).error, /Raise an army/);
  s = act(s, { type: 'order', order: { kind: 'envoy', realm: 'cintra' } });
  assert.equal(s.orders.list.length, 3);
  assert.match(applyAction(s, world, { type: 'order', order: { kind: 'envoy', realm: 'kaedwen' } }).error, /Three orders a month/);
  // An order withdrawn frees its place.
  s = act(s, { type: 'cancelOrder', index: 2 });
  assert.equal(s.orders.list.length, 2);
  assert.ok(applyAction(s, world, { type: 'order', order: { kind: 'trade', realm: 'cintra', give: 'iron', take: 'iron' } }).error);
});

test('at the turn of the month the crown\'s orders and the rulers\' moves resolve together', () => {
  let s = quiet(createState(world, 5));
  s = act(s, { type: 'declare', realm: 'cidaris' });
  s = act(s, { type: 'raise', muster: 'gors_velen', levy: 'half', nobles: false, companies: 3, marshal: 'captain', stance: 'bold' });
  const army = s.armies.find((a) => a.side === 'temeria');
  s = act(s, { type: 'order', order: { kind: 'march', realm: 'cidaris', army: army.id } });
  s = act(s, { type: 'order', order: { kind: 'envoy', realm: 'redania' } });
  s = act(s, { type: 'order', order: { kind: 'trade', realm: 'redania', give: 'grain', take: 'iron' } });
  // Nothing goes out before the turn.
  const before = run(s, 1);
  assert.equal(before.orders.list.length, 3);
  assert.equal(before.armies.find((a) => a.id === army.id).target ?? null, s.armies.find((a) => a.id === army.id).target ?? null);
  const relation = s.neighbours.redania.relation;
  // The first of April: all three resolve.
  const after = run(s, 31);
  assert.equal(after.orders.list.length, 0);
  assert.equal(after.orders.last.length, 3);
  const marched = after.orders.last.find((o) => o.kind === 'march');
  assert.ok(marched.ok, marched.text);
  const a = after.armies.find((x) => x.id === army.id);
  assert.ok(a && after.realms.cidaris.settlements[a.target], 'the army marches on a town of Cidaris');
  assert.ok(marches(after, world).some((m) => m.army === army.id && m.to === 'cidaris'), 'a dashed line on the board');
  assert.ok(after.orders.envoys.some((e) => e.realm === 'redania'), 'an audience waits');
  assert.ok(after.neighbours.redania.relation >= relation);
  assert.ok(after.orders.last.find((o) => o.kind === 'trade').text.length > 0);
  for (const o of after.orders.last) assert.ok(after.chronicle.some((d) => d.text === o.text), `told: ${o.text}`);
  // The rulers' moves of the same turn are noted for the board.
  assert.ok(Array.isArray(after.orders.theirs));
  // The envoy can be recalled.
  const recalled = act(after, { type: 'envoyAway', id: 'redania' });
  assert.equal(recalled.orders.envoys.length, 0);
});

test('a version 18 save gains the board\'s orders', () => {
  const s = createState(world, 6);
  delete s.orders;
  s.version = 18;
  const up = deserialize(JSON.stringify({ format: 'northern-wars-save', version: 18, state: s }), world);
  assert.equal(up.version, STATE_VERSION);
  assert.deepEqual(up.orders.list, []);
  assert.equal(deserialize(serialize(run(up, 40)), world).version, STATE_VERSION);
});
