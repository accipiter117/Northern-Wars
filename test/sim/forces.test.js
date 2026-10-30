import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createState, step, applyAction, serialize, deserialize, winChance, resolve, oddsWord, huntOdds, wildSites, threatLevel, crownVision, sees,
} from '../../src/sim/index.js';
import { companyStrength as _cs } from '../../src/sim/combat.js';
import { STATE_VERSION } from '../../src/sim/state.js';
import { makeRng } from '../../src/sim/rng.js';
import { updateSight } from '../../src/sim/threats.js';
import { stepAmbientDay, unitPosition } from '../../src/sim/ambient.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();
const run = (s, days) => step(s, days, world, { ambient: false });
const quiet = (s) => {
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  return s;
};
const act = (s, a) => {
  const out = applyAction(s, world, a);
  assert.equal(out.error, undefined, `${a.type}: ${out.error}`);
  return out.state;
};
// A camp or lair placed by hand, for the tests that need one now.
function place(s, fields) {
  const t = { id: s.threats.nextId++, morale: 70, born: s.day, band: null, sighted: false, alerted: true, rumour: null, ...fields };
  s.threats.list.push(t);
  return t;
}

test('threats appear and grow where the country is poor, restless and wild, and not where it is quiet', () => {
  let rough = quiet(createState(world, 4));
  for (const id of ['anchor', 'dorian', 'tegmond', 'acorn_bay', 'napeys', 'vorune']) {
    rough.settlements[id].prosperity = 10;
    rough.settlements[id].unrest = 80;
  }
  rough = run(rough, 120);
  // Temeria's own camps (the neighbours' wilds breed their own, abroad).
  const camps = rough.threats.list.filter((t) => t.kind === 'bandits' && !t.abroad);
  assert.ok(camps.length > 0, 'bandit camps appear near the poor wild villages');
  for (const c of camps) assert.ok(threatLevel(rough, world, c.near, 'bandits') >= world.forces.threats.bandits.fadeBelow);
  // In wild country only: every camp stands in forest, marsh or hills.
  for (const c of camps) assert.ok(world.forces.threats.bandits.terrain.includes(c.terrain));
  // Left alone, a camp grows.
  const t = rough.threats.list.find((x) => x.kind === 'bandits' && !x.abroad);
  const men = t.men;
  for (let i = 0; i < 6; i++) {
    for (const id of ['anchor', 'dorian', 'tegmond', 'acorn_bay', 'napeys', 'vorune']) rough.settlements[id].prosperity = 10;
    rough = run(rough, 30);
  }
  const later = rough.threats.list.find((x) => x.id === t.id);
  assert.ok(!later || later.men + (later.band?.men ?? 0) > men, 'the camp grew');
  // A quiet, prosperous realm breeds no bandits.
  let calm = quiet(createState(world, 4));
  for (const st of Object.values(calm.settlements)) {
    st.prosperity = 95;
    st.unrest = 0;
  }
  calm.laws.bounties = { option: 'witchers', previous: 'none', since: calm.day - 999 };
  for (let i = 0; i < 4; i++) {
    for (const st of Object.values(calm.settlements)) {
      st.prosperity = 95;
      st.unrest = 0;
    }
    calm = run(calm, 30);
  }
  // At most a stray camp in the deepest woods (Gors Velen sits between
  // forest and marsh, wild enough for one now and then), and far fewer than
  // the poor and restless realm breeds.
  const calmCamps = calm.threats.list.filter((x) => x.kind === 'bandits' && !x.abroad);
  assert.ok(calmCamps.length <= 1, `${calmCamps.length} camps in a calm realm`);
  // And the country breeds them far less: the realm's mean bandit level.
  const mean = (x) => Object.keys(x.settlements).reduce((a, id) => a + threatLevel(x, world, id, 'bandits'), 0) / Object.keys(x.settlements).length;
  assert.ok(mean(calm) < mean(rough) - 5, `calm ${mean(calm).toFixed(1)} against rough ${mean(rough).toFixed(1)}`);
});

test('a band holding a road robs the crown route over it, and stops the caravans on the map', () => {
  let s = quiet(createState(world, 2));
  // The route underneath (since M21 opened by deals, not by hand).
  s = applyAction(s, { ...world, market: null }, { type: 'route', from: 'vizima', to: 'maribor' }).state;
  assert.equal(s.routes.length, 1);
  s.threats.list = [];
  const plain = run(structuredClone(s), 62);
  // A band camped on the road between Vizima and White Orchard for the month.
  const a = world.byId.vizima;
  const b = world.byId.white_orchard;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const held = structuredClone(s);
  const t = place(held, { kind: 'bandits', terrain: 'forest', x: mid.x + 30, y: mid.y, near: 'white_orchard', men: 10 });
  t.band = { men: 50, x: mid.x, y: mid.y, way: [], phase: 'lurk', seg: 'vizima|white_orchard', lurk: 99, until: held.day + 99, raid: null };
  const robbed = run(held, 62);
  const route = robbed.routes[0];
  assert.ok(route.raided, 'the route was robbed');
  assert.ok(robbed.ledger.history.at(-1).income.routes['vizima>maribor'] < plain.ledger.history.at(-1).income.routes['vizima>maribor'] * 0.5);
  assert.ok(robbed.ledger.history.at(-1).income.trade < plain.ledger.history.at(-1).income.trade);
  // On the map, a caravan reaching the band stops where it is.
  const c = structuredClone(held);
  c.ambient.units = [{ id: 1, kind: 'caravan', route: ['white_orchard', 'vizima'], pos: 0, speed: 0 }];
  const len = Math.hypot(a.x - b.x, a.y - b.y);
  c.ambient.units[0].pos = len / 2 - 5;
  const rng = makeRng(1);
  stepAmbientDay(c, world, rng);
  const u = c.ambient.units.find((x) => x.id === 1);
  assert.ok(u.held, 'the caravan is held up');
  const p = unitPosition(world, u, u.pos);
  assert.ok(Math.hypot(p.x - mid.x, p.y - mid.y) < 20);
});

test('a company sent to hunt clears a bandit camp; witchers and troops clear a lair', () => {
  let s = quiet(createState(world, 3));
  s.treasury = 6000;
  s.threats.list = [];
  const site = wildSites(world, 'anchor').find((x) => x.terrain === 'marsh');
  const camp = place(s, { kind: 'bandits', terrain: 'marsh', x: site.x, y: site.y, near: 'anchor', men: 25 });
  const lair = place(s, { kind: 'monsters', terrain: 'marsh', species: 'drowners', x: site.x - 20, y: site.y + 20, near: 'anchor', count: 4 });
  s = act(s, { type: 'recruit', settlement: 'gors_velen', kind: 'menatarms' });
  s = act(s, { type: 'recruit', settlement: 'gors_velen', kind: 'archers' });
  s = run(s, 1);
  assert.ok(s.threats.list.find((t) => t.id === camp.id).campSeen);
  s = act(s, { type: 'company', id: 1, order: { kind: 'hunt', threat: camp.id } });
  s = act(s, { type: 'company', id: 2, order: { kind: 'hunt', threat: lair.id } });
  s = run(s, 40);
  assert.ok(!s.threats.list.some((t) => t.id === camp.id), 'the camp is broken');
  assert.ok(!s.threats.list.some((t) => t.id === lair.id), 'the lair is cleared');
  assert.ok(s.chronicle.some((d) => /^Fight near/.test(d.text)));
  assert.ok(s.battles.some((b) => b.skirmish));
  // Done, they go home and take up their old orders.
  s = run(s, 30);
  for (const c of s.forces.companies) {
    assert.equal(c.order.kind, 'station');
    assert.equal(c.node, 'gors_velen');
  }
  // A witcher clears a lair with no soldier lost.
  let w = quiet(createState(world, 3));
  w.treasury = 5000;
  w.threats.list = [];
  const beast = place(w, { kind: 'monsters', terrain: 'marsh', species: 'drowners', x: site.x, y: site.y, near: 'anchor', count: 6, sighted: true });
  w = act(w, { type: 'witcher', threat: beast.id });
  w = run(w, world.forces.threats.monsters.witcher.days + 2);
  assert.ok(w.chronicle.some((d) => /witcher/.test(d.text)));
});

test('the odds shown before a hunt match outcomes over many fights', () => {
  const rng = makeRng(7);
  for (const [a, b] of [[300, 100], [150, 100], [100, 100], [80, 120], [40, 150]]) {
    const p = winChance(world, a, b);
    let wins = 0;
    const n = 3000;
    for (let i = 0; i < n; i++) if (resolve(world, rng, a, b).aWins) wins++;
    assert.ok(Math.abs(wins / n - p) < 0.03, `${a} v ${b}: odds ${p.toFixed(2)}, won ${(wins / n).toFixed(2)}`);
  }
  // The words run from Overwhelming to Hopeless as the odds fall.
  const words = [[300, 100], [150, 100], [100, 100], [70, 100], [30, 100]].map(([a, b]) => oddsWord(world, winChance(world, a, b)));
  assert.deepEqual(words, ['Overwhelming', 'Favourable', 'Even', 'Risky', 'Hopeless']);
  // And troops suit some foes better: knights against beasts do worse than archers.
  const s = createState(world, 1);
  const lair = { kind: 'monsters', terrain: 'forest', species: 'wolves', x: 600, y: 300, count: 12, morale: 70 };
  const knights = { type: 'knights', men: 50, morale: 70, xp: 0 };
  const archers = { type: 'archers', men: 100, morale: 70, xp: 0 };
  const bandits = { kind: 'bandits', terrain: 'open', x: 600, y: 300, men: 100, morale: 70 };
  assert.ok(huntOdds(s, world, [knights], lair).mine / huntOdds(s, world, [knights], bandits).mine < huntOdds(s, world, [archers], lair).mine / huntOdds(s, world, [archers], bandits).mine);
});

test('unpaid companies lose heart, then men desert', () => {
  let s = quiet(createState(world, 1));
  s = act(s, { type: 'recruit', settlement: 'maribor', kind: 'menatarms' });
  const men = s.forces.companies[0].men;
  s.treasury = -world.economy.debt.creditLimit * 2;
  s = run(s, 125);
  const c = s.forces.companies[0];
  assert.ok(s.unpaid);
  assert.ok(!c || c.men < men, 'men deserted');
  assert.ok(!c || c.morale < world.forces.morale.start);
  assert.ok(s.chronicle.some((d) => /deserted/.test(d.text)));
});

test('sight and rumour follow the crown\'s eyes', () => {
  const s = quiet(createState(world, 1));
  s.threats.list = [];
  // Deep in Jay Forest, far from any town: only a rumour.
  const t = place(s, { kind: 'bandits', terrain: 'forest', x: 360, y: 470, near: 'dorian', men: 40 });
  updateSight(s, world);
  assert.equal(t.sighted, false);
  assert.ok(t.rumour, 'folk talk of something in the woods');
  const far = t.rumour.r;
  assert.ok(Math.hypot(t.rumour.x - t.x, t.rumour.y - t.y) <= far, 'the rumour ring covers the camp');
  assert.ok(!sees(world, crownVision(s, world), t.x, t.y));
  // A company riding near firms the rumour up, then sees it.
  const scout = { id: 99, type: 'lightcav', name: 'Scouts', home: 'dorian', station: 'dorian', men: 60, max: 60, wounded: 0, morale: 70, xp: 0, order: { kind: 'station' }, task: null, x: 360, y: 380, node: null, way: [], army: null, wins: 0, fought: -1, routed: 0 };
  s.forces.companies.push(scout);
  updateSight(s, world);
  assert.ok(t.sighted || t.rumour.r < far, 'nearer eyes, a firmer rumour');
  scout.y = 450;
  updateSight(s, world);
  assert.equal(t.sighted, true);
  assert.equal(t.rumour, null);
  assert.ok(s.threats.alerts.length === 0 || s.threats.alerts.at(-1).id === t.id || t.alerted);
});

test('a company standing ready answers a threat sighted near its station, then comes home', () => {
  let s = quiet(createState(world, 5));
  s.threats.list = [];
  s = act(s, { type: 'recruit', settlement: 'gors_velen', kind: 'menatarms' });
  s = act(s, { type: 'company', id: 1, order: { kind: 'respond', radius: 150 } });
  const site = wildSites(world, 'anchor').find((x) => x.terrain === 'marsh');
  place(s, { kind: 'bandits', terrain: 'marsh', x: site.x, y: site.y, near: 'anchor', men: 20 });
  s = run(s, 3);
  assert.ok(s.forces.companies[0].task, 'it rode out');
  s = run(s, 60);
  assert.equal(s.threats.list.filter((t) => t.kind === 'bandits' && t.near === 'anchor' && t.men > 0 && !t.band).length, 0);
  assert.equal(s.forces.companies[0].order.kind, 'respond');
  assert.equal(s.forces.companies[0].node, 'gors_velen');
});

test('Scoia\'tael come out of the woods when sympathy is high; hostile neighbours send raiders', () => {
  let s = quiet(createState(world, 6));
  let commandos = 0;
  let raiders = 0;
  // Four years: commandos come and go within a month or two, so a short
  // window can miss them.
  for (let m = 0; m < 48; m++) {
    s.sympathy = 90;
    s.neighbours.kaedwen.relation = -90;
    s = run(s, 30);
    commandos = Math.max(commandos, s.threats.list.filter((t) => t.kind === 'scoiatael').length);
    raiders = Math.max(raiders, s.threats.list.filter((t) => t.kind === 'raiders').length);
  }
  assert.ok(commandos > 0);
  assert.ok(raiders > 0);
});

test('a field army takes standing companies along, fights better for them, and sends them home', () => {
  let s = quiet(createState(world, 7));
  s.treasury = 6000;
  s = act(s, { type: 'recruit', settlement: 'vizima', kind: 'menatarms' });
  s = act(s, { type: 'recruit', settlement: 'vizima', kind: 'archers' });
  const ids = s.forces.companies.map((c) => c.id);
  s = act(s, { type: 'raise', muster: 'vizima', levy: 'third', nobles: false, companies: 0, marshal: 'vestibor', stance: 'cautious', units: ids });
  const a = s.armies.find((x) => x.side === 'temeria');
  assert.equal(a.units.length, 2);
  // Since M22 C the standing companies march as companies of their own,
  // each worth more a man than the levy beside them.
  const standing = a.bands.filter((b) => b.source === 'standing');
  assert.deepEqual(standing.map((b) => b.company).sort(), [...ids].sort());
  const worth = (b) => _cs(world, { ...b, morale: 80 }, 'soldiers') / b.men;
  const levy = a.bands.find((b) => b.source === 'levy' && b.type === 'militia');
  assert.ok(worth(standing.find((b) => b.type === 'menatarms')) > worth(levy));
  for (const c of s.forces.companies) assert.equal(c.army, a.id);
  s = act(s, { type: 'disband', army: a.id });
  for (const c of s.forces.companies) {
    assert.equal(c.army, null);
    assert.ok(c.men > 0);
  }
});

test('a version 11 save turns patrols into companies and keeps its armies', () => {
  const s = run(createState(world, 9), 40);
  delete s.forces;
  delete s.threats;
  s.patrols = [{ id: 1, from: 'gors_velen', to: 'dorian' }, { id: 2, from: 'mayena', to: 'brenna' }];
  s.nextPatrolId = 3;
  s.armies.push({ id: 1, side: 'temeria', name: 'Old army', soldiers: 500, raised: 500, morale: 80, levy: {}, companies: 0, marshal: null, stance: 'cautious', order: 'defend', target: 'vizima', home: 'vizima', at: 'vizima', to: null, along: 0, path: [], dest: 'vizima', speed: 0, siege: null, raiding: null, raidTarget: null, raids: 0, retreating: false, fought: -1 });
  s.version = 11;
  const up = deserialize(JSON.stringify({ format: 'northern-wars-save', version: 11, state: s }), world);
  assert.equal(up.version, STATE_VERSION);
  assert.equal(up.patrols, undefined);
  assert.equal(up.forces.companies.length, 2);
  assert.equal(up.forces.companies[0].order.kind, 'patrol');
  assert.equal(up.forces.companies[0].type, 'lightcav');
  // A patrol out of a lord's castle is kept by the crown at Vizima.
  assert.equal(up.forces.companies[1].station, 'vizima');
  assert.deepEqual(up.armies[0].units, []);
  assert.deepEqual(up.threats.list, []);
  assert.ok(deserialize(serialize(run(up, 60)), world));
});
