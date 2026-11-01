// A rich crown at peace (M24 C): upkeep that follows the hands, conquered
// towns that never cost the crown, the Steward's report, the warning for
// work under half manned, a Balanced split that leaves no crowd idle, and
// the model crowns' months.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createState, step, ledgerNet, stewardReport, halfStaffed, pressureLine, foodYield, foodNeed, foodCapacity, applyAction,
} from '../../src/sim/index.js';
import { upkeepFactor } from '../../src/sim/works.js';
import { conquestYield } from '../../src/sim/conquest.js';
import { stepLabourDay } from '../../src/sim/labour.js';
import { nodeWorld } from '../helpers.js';
import { makeCrowns } from '../../tools/crowns.mjs';

const world = await nodeWorld();
const run = (s, days) => step(s, days, world, { ambient: false });
const quiet = (s) => {
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  return s;
};
const fns = { foodYield, foodNeed, foodCapacity };

test('a works costs as it is manned, down to a small floor; one being mended costs only its repair', () => {
  const s = quiet(createState(world, 1)).settlements.vizima;
  const b = s.buildings.find((x) => world.buildings[x].upkeep > 0);
  s.staff = { [b]: 100 };
  const full = upkeepFactor(world, s, b);
  s.staff[b] = 50;
  assert.ok(Math.abs(upkeepFactor(world, s, b) - full / 2) < 1e-9, 'half manned, half the keep');
  s.staff[b] = 0;
  assert.ok(upkeepFactor(world, s, b) <= full * 0.1 + 1e-9, 'idle, only the watchmen');
  s.staff[b] = 100;
  s.repair = { [b]: { kind: 'patch', daysLeft: 10 } };
  assert.equal(upkeepFactor(world, s, b), 0, 'mending costs only the repair');
});

test('a conquered town yields about a quarter at first, all of it once settled and mended; a sacked one almost nothing', () => {
  const c = world.conquest.integration;
  const town = { buildings: ['market', 'smithy'], cond: { market: 70, smithy: 70 }, integration: c.start };
  const first = conquestYield(world, town);
  assert.ok(first > 0.2 && first < 0.35, `at first ${first}`);
  const settled = conquestYield(world, { ...town, integration: 100, cond: {} });
  assert.equal(settled, 1);
  const sacked = conquestYield(world, { ...town, integration: c.start + world.conquest.capture.sack.integration, cond: { market: 30, smithy: 20 } });
  assert.ok(sacked < 0.07, `sacked ${sacked}`);
  // A crown town has no integration and yields in full.
  assert.equal(conquestYield(world, { buildings: [] }), 1);
});

test('a conquered town pays its garrison and works from its own takings and never costs the crown', () => {
  const s = quiet(createState(world, 2));
  // Ellander, newly taken: barely accepting the crown, a heavy garrison.
  const t = s.settlements.ellander;
  t.integration = 30;
  t.holder = 'crown';
  t.garrison = 4000;
  const after = run(s, 31);
  const p = after.ledger.places.ellander;
  assert.ok(p.in > 0, 'it yields something');
  assert.ok(p.out <= p.in + 1, `costs ${p.out} against takings ${p.in}`);
  // The same town as an old crown town pays its full garrison.
  const old = quiet(createState(world, 2));
  old.settlements.ellander.garrison = 4000;
  const o = run(old, 31).ledger.places.ellander;
  assert.ok(o.out > o.in, 'an old crown town can cost more than it brings');
});

test('the Steward\'s report: in, out, net and the three costs that weigh most', () => {
  const s = run(quiet(createState(world, 3)), 62);
  const r = stewardReport(s, world);
  const last = s.ledger.history.at(-1);
  const n = ledgerNet(last);
  assert.equal(r.net, Math.round(n.net));
  assert.equal(r.in, Math.round(n.in));
  assert.equal(r.costs.length, 3);
  assert.ok(r.costs[0].v >= r.costs[1].v && r.costs[1].v >= r.costs[2].v);
  assert.ok(r.costs.every((c) => !['construction', 'decrees'].includes(c.key)));
  assert.equal(stewardReport(createState(world, 3), world), null, 'nothing before the first accounts');
});

test('the pressure strip warns first of work under half manned', () => {
  const s = run(quiet(createState(world, 4)), 92);
  assert.deepEqual(halfStaffed(s, world), []);
  assert.doesNotMatch(pressureLine(s, world, fns), /under half manned/);
  s.labour.split = { ...s.labour.split, mines: 1, crafts: s.labour.split.crafts + s.labour.split.mines - 1 };
  stepLabourDay(s, world);
  const h = halfStaffed(s, world);
  assert.equal(h[0].kind, 'mines');
  assert.match(pressureLine(s, world, fns), /^Mines and quarries under half manned \(\d+%\)/);
});

test('Balanced mans the crafts, mines, pastures and woods and leaves no crowd idle, summer or winter', () => {
  let s = quiet(createState(world, 5));
  for (let m = 0; m < 12; m++) {
    s = run(s, 30);
    const r = s.labour.report;
    const idle = Object.values(r).reduce((a, x) => a + x.idle, 0);
    assert.ok(idle < 1000, `month ${m}: ${idle} idle`);
    for (const k of ['crafts', 'mines', 'woods']) assert.ok(r[k].staffed >= r[k].need * 0.9, `month ${m}: ${k} ${r[k].staffed} of ${r[k].need}`);
  }
});

test('a large army in the field for a season costs most of a year of peace', () => {
  const s = run(quiet(createState(world, 1)), 60);
  const out = applyAction(s, world, { type: 'raise', muster: 'vizima', levy: 'all', nobles: true });
  assert.equal(out.error, undefined);
  const a = out.state.armies.at(-1);
  // Pay a month, campaigning abroad, for three months.
  const r = world.war.raise;
  const season = ((a.levyMen ?? 0) * r.pay.levy + (a.retinueMen ?? 0) * r.pay.retinue) * r.pay.field * 3;
  assert.ok(season > 10000 && season < 18000, `a season ${Math.round(season)}`);
});

test('the steward makes about 1,500 a month at peace; the careless crown a little; the idle one slides', () => {
  const crowns = makeCrowns(world);
  const play = (who, months) => {
    let s = createState(world, 3);
    const nets = [];
    for (let m = 0; m < months; m++) {
      if (who === 'idle') s = crowns.answer(s, false);
      else s = crowns[who](s, m, false);
      s = run(s, 30);
      const last = s.ledger.history.at(-1);
      nets.push(last ? ledgerNet(last).net : 0);
    }
    return nets;
  };
  const year = (nets, y) => nets.slice(12 * (y - 1), 12 * y).reduce((a, b) => a + b, 0) / 12;
  const steward = play('steward', 36);
  const careless = play('careless', 36);
  const idle = play('idle', 60);
  assert.ok(year(steward, 3) > 1250, `steward year 3 ${year(steward, 3)}`);
  // Since M27 the lords' dues are a real line even from a careless crown's
  // lukewarm houses, so it clears a little more than it once did.
  assert.ok(Math.abs(year(careless, 3)) < 1000, `careless year 3 ${year(careless, 3)}`);
  // The idle crown slides from a full chest into the red and stays near it.
  // Since M29 vassals and blocs move the dice enough that its fifth year
  // hovers either side of nothing, so the test asks for the slide itself.
  assert.ok(year(idle, 5) < year(idle, 1) - 1000, `idle year 1 ${year(idle, 1)}, year 5 ${year(idle, 5)}`);
  assert.ok(year(idle, 5) < 250, `idle year 5 ${year(idle, 5)}`);
  assert.ok(year(steward, 3) > year(careless, 3) + 700);
});
