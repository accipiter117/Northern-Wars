// Life on the map that means something (M22 B): every traveller stands for
// something real and its count follows that source; life at the works
// follows staffing, season and condition; a witcher rides out for each
// contract, fights at the lair, and rides home only if he won.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createState, step, applyAction, describeUnit, worksLife, witcherOnRoad, describeWitcher, partnerTrade, dateOf, wildSites,
} from '../../src/sim/index.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();
const run = (s, days) => step(s, days, world);
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
const count = (s, kind) => s.ambient.units.filter((u) => u.kind === kind).length;
// Day by day for a while, the most of a kind seen on the roads at once.
function most(s, days, kind) {
  let n = 0;
  for (let i = 0; i < days; i++) {
    s = run(s, 1);
    n = Math.max(n, count(s, kind));
  }
  return { s, n };
}

test('patrols ride only for companies on patrol orders, one each; the old garrison riders are gone', () => {
  let s = quiet(createState(world, 1));
  // Garrisons of hundreds, but no company on patrol: no patrols at all.
  let r = most(s, 90, 'patrol');
  assert.equal(r.n, 0, 'no patrol without a patrolling company');
  s = r.s;
  s.treasury = 5000;
  s = act(s, { type: 'recruit', settlement: 'gors_velen', kind: 'lightcav' });
  s = act(s, { type: 'recruit', settlement: 'maribor', kind: 'archers' });
  const [a, b] = s.forces.companies;
  s = act(s, { type: 'company', id: a.id, order: { kind: 'patrol', from: 'gors_velen', to: 'dorian' } });
  s = act(s, { type: 'company', id: b.id, order: { kind: 'patrol', from: 'maribor', to: 'vizima' } });
  r = most(s, 90, 'patrol');
  assert.ok(r.n >= 1 && r.n <= 2, `${r.n} patrols for two patrolling companies`);
  const u = r.s.ambient.units.find((x) => x.kind === 'patrol') ?? null;
  if (u) {
    assert.ok([a.id, b.id].includes(u.company));
    assert.match(describeUnit(world, u, r.s), /^Patrol: the .+ on the road from .+ to .+$/);
  }
});

test('merchants follow the trade deals and the surplus sold at home, and none run without them', () => {
  let s = quiet(createState(world, 3));
  s = run(s, 62);
  // No deals: no merchants either way under the M21 market.
  let r = most(s, 40, 'export');
  assert.equal(r.n, 0);
  assert.equal(count(r.s, 'foreign'), 0);
  s = r.s;
  const p = partnerTrade(s, world, 'redania');
  s = act(s, { type: 'trade', realm: 'redania', sell: { good: p.wants[0], qty: 40 }, buy: { good: p.offers[0], qty: 20 } });
  r = most(s, 60, 'export');
  assert.ok(r.n > 0, 'Temerian merchants out with what we sell');
  const out = r.s.ambient.units.find((u) => u.kind === 'export');
  assert.equal(out.good, p.wants[0]);
  assert.match(describeUnit(world, out, r.s), /^Temerian merchants: 40 loads of .+ a month from .+ to .+ under our deal with Redania, [\d,]+ crowns a month$/);
  // Home sales: merchant caravans carry the good sold, from where it is made.
  s = r.s;
  const sold = Object.entries(s.market.report).filter(([, x]) => x.sold > 0);
  r = most(s, 60, 'caravan');
  if (sold.length) {
    assert.ok(r.n > 0, 'merchant caravans for the home sales');
    const c = r.s.ambient.units.find((u) => u.kind === 'caravan');
    if (c) assert.match(describeUnit(world, c, r.s), /^Merchant caravan: .+ from .+ to .+, sold at home for about [\d,]+ crowns a month$/);
  }
  // Nothing sold at home: no new merchant caravans set out.
  s = r.s;
  for (const x of Object.values(s.market.report)) x.sold = 0;
  s.ambient.units = s.ambient.units.filter((u) => u.kind !== 'caravan');
  const next = run(s, 1);
  assert.equal(count(next, 'caravan'), 0);
});

test('pilgrims make for a real holy place, barges for rivers our towns stand on', () => {
  let s = quiet(createState(world, 2));
  s = run(s, 120);
  const pilgrims = s.ambient.units.filter((u) => u.kind === 'pilgrim');
  assert.ok(pilgrims.length > 0);
  for (const u of pilgrims) {
    const to = u.route.at(-1);
    const b = s.settlements[to]?.buildings ?? [];
    assert.ok(to === 'temple_melitele' || b.includes('cathedral') || b.includes('shrine'), `${to} is holy`);
    assert.match(describeUnit(world, u, s), /^Pilgrims: from .+ to (the Temple of Melitele|the cathedral at .+|the shrine at .+)$/);
  }
  for (const u of s.ambient.units.filter((x) => x.kind === 'barge')) {
    assert.ok(Object.values(world.spaces).some((list) => list.some((sp) => sp.kind === 'river' && sp.name === `the ${u.river}`)), `${u.river} has a town of ours`);
  }
  // None in the depths of winter: the rivers are frozen.
  assert.equal(world.ambient.kinds.barge.winterSpawn, 0);
});

test('life at the works follows the season, the hands and the works\' condition', () => {
  const s = quiet(createState(world, 4));
  const at = (day) => { const t = structuredClone(s); t.day = day; return t; };
  // The first day of a month, from the start of the reign.
  const month = (m) => { let d = s.day; while (dateOf(d).month !== m) d += 1; return d; };
  assert.equal(worksLife(at(month(4)), world, 'carreras').fields.activity, 'plough');
  assert.equal(worksLife(at(month(7)), world, 'carreras').fields.activity, 'tend');
  assert.equal(worksLife(at(month(8)), world, 'carreras').fields.activity, 'harvest');
  assert.equal(worksLife(at(month(1)), world, 'carreras').fields.figures, 0, 'no one in the fields in winter');
  // The mine: full hands, half hands, broken, mended.
  const t = at(month(5));
  const full = worksLife(t, world, 'carreras').mine;
  assert.equal(full.activity, 'dig');
  t.settlements.carreras.staff = { ...(t.settlements.carreras.staff ?? {}), mine: 40 };
  assert.ok(worksLife(t, world, 'carreras').mine.figures < full.figures, 'fewer figures short of hands');
  t.settlements.carreras.cond = { ...t.settlements.carreras.cond, mine: 20 };
  t.settlements.carreras.worn = { mine: { why: 'Burned by bandits' } };
  const broken = worksLife(t, world, 'carreras').mine;
  assert.equal(broken.figures, 0);
  assert.equal(broken.scorched, true);
  t.settlements.carreras.repair = { mine: { until: t.day + 20 } };
  const mended = worksLife(t, world, 'carreras').mine;
  assert.equal(mended.activity, 'build');
  assert.ok(mended.builders > 0);
  // Old flooded workings (a gold mine not yet reopened) are damaged works:
  // no one there.
  const z = worksLife(at(month(5)), world, 'zavada').goldmine;
  if (z) assert.equal(z.figures, 0);
  // The water closes in winter.
  assert.equal(worksLife(at(month(1)), world, 'vizima').harbour.figures, 0);
  assert.ok(worksLife(at(month(6)), world, 'vizima').harbour.figures > 0);
});

test('a witcher rides out for each contract, fights at the lair, and rides home only if he won', () => {
  for (const seed of [3, 4, 5, 6]) {
    let s = quiet(createState(world, seed));
    s.treasury = 5000;
    s.threats.list = [];
    const site = wildSites(world, 'anchor').find((x) => x.terrain === 'marsh');
    s.threats.list.push({ id: 50, kind: 'monsters', terrain: 'marsh', species: 'drowners', x: site.x, y: site.y, near: 'anchor', count: 6, morale: 70, born: s.day, band: null, sighted: true, campSeen: true, alerted: true, rumour: null, level: 40 });
    s.threats.nextId = 51;
    s = act(s, { type: 'witcher', threat: 50 });
    const c = s.threats.contracts[0];
    assert.equal(c.from, 'anchor');
    assert.ok(c.name);
    assert.equal(witcherOnRoad(s, world, c).phase, 'out');
    assert.match(describeWitcher(s, world, c), /^Witcher: .+, riding out from Anchor; the crown's contract on drowners near Anchor, \d+ crowns$/);
    const days = world.forces.threats.monsters.witcher.days;
    s = run(s, Math.floor(days * 0.45));
    assert.equal(witcherOnRoad(s, world, s.threats.contracts[0]).phase, 'fight');
    s = run(s, Math.ceil(days * 0.15));
    const after = s.threats.contracts.find((x) => x.threat === 50);
    if (after) {
      assert.equal(after.won, true);
      assert.ok(!s.threats.list.some((t) => t.id === 50), 'the lair is cleared');
      s = run(s, Math.ceil(days * 0.2));
      assert.equal(witcherOnRoad(s, world, s.threats.contracts[0]).phase, 'home');
      s = run(s, days);
      assert.equal(s.threats.contracts.length, 0, 'home, the contract ends');
    } else {
      // He lost: no rider comes back, and the beasts are still there.
      assert.ok(s.threats.list.some((t) => t.id === 50));
      assert.ok(s.chronicle.some((d) => /has not come back/.test(d.text)));
    }
  }
});
