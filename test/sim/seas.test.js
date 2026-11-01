// Skellige at sea (M30 E): a middle crown of islands under King Bran an
// Craite, bound to Cintra, making no war for land of its own; longships
// raid the coasts in season along simple sea lanes and carry the loot home;
// the crown can hire them against a rival or pay them off; older saves gain
// the isles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, serialize, deserialize, applyAction, tierOf, rulerOf } from '../../src/sim/index.js';
import { monthlySeas, stepSeasDay, raidTargets, seaPath, longshipAt, coastal } from '../../src/sim/seas.js';
import { treatyBetween } from '../../src/sim/diplomacy.js';
import { mayStartWar } from '../../src/sim/blocs.js';
import { pointInPolygon } from '../../src/sim/geometry.js';
import { STATE_VERSION } from '../../src/sim/state.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();
const always = { chance: () => true, next: () => 0, int: () => 0, pick: (l) => l[0] };
const land = [world.geography.temeria, ...Object.values(world.geography.neighbours).flatMap((n) => n.shapes), ...Object.values(world.geography.lands).flatMap((n) => n.shapes)];
const atSea = (x, y) => !land.some((sh) => pointInPolygon(x, y, sh));

test('Skellige is a middle crown of islands, bound to Cintra, that makes no war for land', () => {
  assert.equal(tierOf(world, 'skellige'), 'middle');
  assert.equal(rulerOf(world, 'skellige').name, 'Bran an Craite');
  assert.ok(world.foreignByRealm.skellige.length >= 5);
  assert.ok(world.foreignByRealm.skellige.includes('kaer_trolde'));
  const s = createState(world, 1);
  assert.ok(treatyBetween(s, 'skellige', 'cintra', 'alliance'), 'bound to Cintra');
  assert.ok(!mayStartWar(s, 'skellige'), 'no war of its own');
  // Its islands are not joined by road.
  assert.ok(!world.geography.foreignRoads.some(([a, b]) => world.realmOf[a] === 'skellige' || world.realmOf[b] === 'skellige'));
});

test('the sea lanes keep to the water, from the isles to every coast they raid', () => {
  for (const realm of world.war.seas.targets) {
    for (const id of (world.foreignByRealm[realm] ?? []).filter((x) => coastal(world, x))) {
      const p = seaPath(world, id);
      for (let i = 1; i < p.length; i++) {
        for (let k = 1; k < 20; k++) {
          const x = p[i - 1][0] + ((p[i][0] - p[i - 1][0]) * k) / 20;
          const y = p[i - 1][1] + ((p[i][1] - p[i - 1][1]) * k) / 20;
          assert.ok(atSea(x, y), `${id}: over land at ${Math.round(x)},${Math.round(y)}`);
        }
      }
    }
  }
});

test('longships raid a coastal town in season, never Cintra, and carry the loot home', () => {
  const s = createState(world, 2);
  const targets = raidTargets(s, world, 'skellige');
  assert.ok(targets.length >= 3, `${targets.length} coastal targets`);
  for (const id of targets) {
    assert.ok(coastal(world, id), id);
    assert.notEqual(world.realmOf[id], 'cintra', 'Cintra is spared');
  }
  s.day += 120 - (s.day % 30);
  for (let tries = 0; tries < 12 && !(s.seas?.raids ?? []).length; tries++) {
    s.day += 30;
    monthlySeas(s, world, always);
  }
  const r = s.seas.raids[0];
  assert.ok(r, 'a raid set out');
  // Its path keeps to the water, out of the isles and in to the shore.
  for (const [x, y] of r.path.slice(1, -1)) assert.ok(atSea(x, y), `lane point ${x},${y} at sea`);
  const mid = longshipAt(world, r, Math.round((r.start + r.land) / 2));
  assert.ok(atSea(mid.x, mid.y), 'longships at sea on the way');
  const realm = r.realm;
  const before = s.realms[realm].settlements[r.to].prosperity;
  const purse = s.realms.skellige.treasury;
  for (let d = s.day; d <= r.home; d++) {
    s.day = d;
    stepSeasDay(s, world);
  }
  assert.ok(s.realms[realm].settlements[r.to].prosperity < before, 'the town burned');
  assert.ok(s.realms.skellige.treasury > purse, 'loot carried home');
  assert.equal(s.seas.raids.length, 0);
});

test('the crown can hire the longships against a rival, or pay them to keep away', () => {
  const s = createState(world, 3);
  s.treasury = 10000;
  const hired = applyAction(s, world, { type: 'hireLongships', against: 'kerack' });
  assert.equal(hired.error, undefined, hired.error);
  assert.equal(hired.state.seas.hired.against, 'kerack');
  assert.equal(hired.state.treasury, 10000 - world.war.seas.hire.coin);
  assert.match(applyAction(s, world, { type: 'hireLongships', against: 'cintra' }).error, /never raid/);
  // Hired, they fall on Kerack's coast.
  const t = hired.state;
  t.day += 150 - (t.day % 30);
  for (let tries = 0; tries < 8 && !(t.seas.raids ?? []).length; tries++) {
    t.day += 30;
    monthlySeas(t, world, always);
  }
  assert.equal(t.seas.raids[0]?.realm, 'kerack');
  // Paid off, the crown's coastal vassals are spared even when the isles
  // dislike us (Temeria itself has no sea coast).
  const u = createState(world, 3);
  u.treasury = 10000;
  u.neighbours.skellige.relation = -60;
  u.realms.kerack.suzerain = 'temeria';
  const kerack = (st) => raidTargets(st, world, 'skellige').filter((id) => world.realmOf[id] === 'kerack');
  assert.ok(kerack(u).length, 'our vassal\'s coast is a target');
  const paid = applyAction(u, world, { type: 'payOffLongships' }).state;
  assert.equal(kerack(paid).length, 0, 'spared once paid');
});

test('raids come every season, and an older save gains the isles', () => {
  let s = createState(world, 4);
  const lines = [];
  const n0 = s.chronicle.length;
  s = step(s, 365, world, { ambient: false });
  for (const c of s.chronicle.slice(n0)) if (/Skelligers come ashore/.test(c.text)) lines.push(c.text);
  assert.ok(lines.length >= 1, 'a raid within the year');
  const old = JSON.parse(serialize(s));
  old.version = 33;
  old.state.version = 33;
  delete old.state.realms.skellige;
  delete old.state.neighbours.skellige;
  delete old.state.faiths?.realms?.skellige;
  delete old.state.diplomacy.trust.skellige;
  for (const row of Object.values(old.state.diplomacy.trust)) delete row.skellige;
  delete old.state.conquest?.fear?.skellige;
  old.state.diplomacy.treaties = old.state.diplomacy.treaties.filter((x) => x.a !== 'skellige' && x.b !== 'skellige');
  old.state.wars = [];
  old.state.armies = old.state.armies.filter((a) => a.side !== 'skellige');
  delete old.state.seas;
  const up = deserialize(JSON.stringify(old), world);
  assert.equal(up.version, STATE_VERSION);
  assert.ok(up.realms.skellige);
  assert.ok(treatyBetween(up, 'skellige', 'cintra', 'alliance'));
});
