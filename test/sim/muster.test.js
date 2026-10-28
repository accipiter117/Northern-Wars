// Hands and armies (M21 C and D): one-tap presets and a town's focus that
// change output as previewed; armies mustered from the people, the lords'
// retinues by loyalty, mercenaries for a season, pay, and what an unpaid
// army does.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createState, step, applyAction, serialize, deserialize, labourPreview, monthlyOutput, houseRetinue, mercenaryOffer, armyPay, totalPopulation, dateOf, MONTHS,
} from '../../src/sim/index.js';
import { STATE_VERSION } from '../../src/sim/state.js';
import { musterPreview } from '../../src/sim/armies.js';
import { stepLabourDay } from '../../src/sim/labour.js';
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
const toMonth = (s) => {
  const d = dateOf(s.day);
  return run(s, MONTHS[d.month - 1].days - d.day + 1);
};
const raise = (over = {}) => ({ type: 'raise', muster: 'vizima', levy: 'half', nobles: false, mercs: [], units: [], marshal: 'vestibor', stance: 'cautious', ...over });

test('a preset sets the hands at a stroke, and the realm makes what the preview said', () => {
  const s = run(quiet(createState(world, 1)), 92);
  for (const [id, p] of Object.entries(world.labour.presets)) {
    if (id === 'note') continue;
    assert.equal(Object.values(p.split).reduce((a, b) => a + b, 0), 100, id);
  }
  const preview = labourPreview(s, world, { split: world.labour.presets.harvest.split }, monthlyOutput);
  assert.ok(preview.grain > 0, `more grain in June: ${JSON.stringify(preview)}`);
  assert.ok(preview.crowns < 0, 'and less from the workshops');
  const before = monthlyOutput(s, world);
  const t = act(s, { type: 'preset', preset: 'harvest' });
  assert.deepEqual(t.labour.split, world.labour.presets.harvest.split);
  stepLabourDay(t, world);
  const after = monthlyOutput(t, world);
  for (const k of Object.keys(preview)) assert.ok(Math.abs(after[k] - before[k] - preview[k]) <= 1, `${k}: ${after[k] - before[k]} vs ${preview[k]}`);
});

test('a town\'s focus pulls its villages\' hands to one work, as previewed, and only there', () => {
  const s = run(quiet(createState(world, 2)), 92);
  assert.match(applyAction(s, world, { type: 'focus', settlement: 'murky_waters', focus: 'food' }).error, /town or city/);
  const preview = labourPreview(s, world, { focus: { id: 'maribor', focus: 'food' } }, monthlyOutput);
  const t = act(s, { type: 'focus', settlement: 'maribor', focus: 'food' });
  assert.equal(t.labour.focus.maribor, 'food');
  stepLabourDay(t, world);
  // More hands in Maribor's fields, the same anywhere outside its district.
  assert.ok(t.settlements.maribor.farmStaff > s.settlements.maribor.farmStaff, `${t.settlements.maribor.farmStaff} vs ${s.settlements.maribor.farmStaff}`);
  assert.ok(Math.abs(t.settlements.gors_velen.farmStaff - s.settlements.gors_velen.farmStaff) < 3, 'barely a change elsewhere');
  assert.ok(Number.isFinite(preview.grain));
  // Cleared, it is gone.
  assert.equal(act(t, { type: 'focus', settlement: 'maribor', focus: null }).labour.focus.maribor, undefined);
});

test('the levy is a share of each place\'s people, more from the cities, and leaves the works', () => {
  const s = run(quiet(createState(world, 3)), 40);
  const m = world.war.raise.muster;
  const all = musterPreview(s, world, { muster: 'vizima', levy: 'all' });
  const viz = totalPopulation(s.settlements.vizima);
  assert.equal(all.levy.vizima, Math.floor(viz * m.share.city));
  assert.ok(all.levy.vizima >= 1200 && all.levy.vizima <= 1800, `Vizima sends ${all.levy.vizima}`);
  for (const [id, n] of Object.entries(all.levy)) {
    const type = world.byId[id].type;
    if (type === 'town') assert.ok(n >= 100 && n <= 600, `${id}: ${n}`);
    if (type === 'village') assert.ok(n >= 3 && n <= 90, `${id}: ${n}`);
  }
  const half = musterPreview(s, world, { muster: 'vizima', levy: 'half' });
  assert.ok(Math.abs(half.levyMen - all.levyMen / 2) < Object.keys(all.levy).length);
  // Raised: garrisons stay, hands go; stood down, the hands come back.
  const g = s.settlements.vizima.garrison;
  let t = act(s, raise({ levy: 'half' }));
  const a = t.armies.find((x) => x.side === 'temeria');
  assert.equal(t.settlements.vizima.garrison, g, 'the garrison stays at home');
  assert.ok(a.gatherUntil > t.day, 'the levies take days to gather');
  assert.match(applyAction(t, world, { type: 'army', army: a.id, order: 'siege', target: 'tretogor' }).error ?? 'refused', /gathering|war/);
  const hands = s.labour.report.fields.hands + s.labour.report.crafts.hands;
  t = run(t, 1);
  const away = t.labour.report.fields.hands + t.labour.report.crafts.hands;
  assert.ok(away < hands - half.levyMen * 0.5, `${hands} hands, ${away} with the army away`);
  t = act(t, { type: 'disband', army: a.id });
  t = run(t, 1);
  assert.ok(t.labour.report.fields.hands + t.labour.report.crafts.hands > away + half.levyMen * 0.5, 'home again');
});

test('the lords send men by the size of their lands and their loyalty', () => {
  const s = run(quiet(createState(world, 4)), 40);
  const h = 'dravnik';
  s.houses[h].loyalty = 70;
  const full = houseRetinue(s, world, h);
  assert.ok(full.men > 50 && !full.refuse);
  s.houses[h].loyalty = 40;
  const half = houseRetinue(s, world, h);
  assert.ok(Math.abs(half.men - full.men / 2) <= Object.keys(full.from).length, `${half.men} of ${full.men}`);
  s.houses[h].loyalty = 20;
  assert.equal(houseRetinue(s, world, h).refuse, true);
  const p = musterPreview(s, world, { muster: 'vizima', levy: 'none', nobles: true });
  assert.ok(p.refuse.includes(h));
  assert.equal(p.retinues[h], undefined);
});

test('mercenaries are hired for a season at their price, and leave when it is out', () => {
  let s = run(quiet(createState(world, 5)), 40);
  const mc = world.war.raise.mercenaries.companies;
  assert.equal(mercenaryOffer(s, world, 'kovir').ok, true);
  assert.equal(mercenaryOffer(s, world, 'greybanner').ok, false, 'the free company only while a war is fresh');
  const t0 = s.treasury;
  s = act(s, raise({ levy: 'third', mercs: ['kovir'] }));
  const a = s.armies.find((x) => x.side === 'temeria');
  assert.equal(s.treasury, t0 - mc.kovir.coin);
  assert.equal(a.mercs[0].men, mc.kovir.men);
  assert.ok(armyPay(s, world, a) >= mc.kovir.monthly);
  assert.equal(mercenaryOffer(s, world, 'kovir').ok, false, 'already in our pay');
  s = toMonth(s);
  assert.ok(Math.abs(s.ledger.history.at(-1).expenses.armies - armyPay(s, world, s.armies.find((x) => x.side === 'temeria'))) < 60);
  s = run(s, world.war.raise.mercenaries.season + 35);
  const b = s.armies.find((x) => x.side === 'temeria');
  assert.equal(b.mercs.length, 0);
  assert.ok(s.chronicle.some((d) => /served its season/.test(d.text)));
});

test('an army the treasury cannot pay loses heart, then men', () => {
  let s = run(quiet(createState(world, 6)), 40);
  s = act(s, raise({ levy: 'half' }));
  const id = s.armies.find((x) => x.side === 'temeria').id;
  const men = s.armies.find((x) => x.id === id).soldiers;
  s.treasury = -9000;
  s = toMonth(s);
  let a = s.armies.find((x) => x.id === id);
  assert.ok(a.morale < 80, 'it grumbles first');
  for (let i = 0; i < 4; i++) {
    s.treasury = -9000;
    s = toMonth(s);
  }
  a = s.armies.find((x) => x.id === id);
  assert.ok(a.soldiers < men * 0.95, `${a.soldiers} of ${men}`);
  assert.ok(s.chronicle.some((d) => /desert/.test(d.text)));
});

test('foreign realms muster from their people by the same shares', () => {
  const s = run(quiet(createState(world, 7)), 40);
  const m = world.war.raise.muster;
  let expect = 0;
  for (const [id, p] of Object.entries(s.realms.redania.settlements)) expect += Math.floor(p.population * (m.share[world.byId[id].type] ?? 0) * world.war.ai.muster.call);
  const garrisons = Object.values(s.realms.redania.settlements).reduce((a, p) => a + p.garrison, 0);
  const t = act(s, { type: 'declare', realm: 'redania' });
  const u = run(t, 62);
  const army = u.armies.find((a) => a.side === 'redania');
  assert.ok(army, 'Redania musters');
  assert.ok(army.raised >= expect * 0.9, `${army.raised} against ${expect}`);
  assert.ok(Object.values(u.realms.redania.settlements).reduce((a, p) => a + p.garrison, 0) >= garrisons * 0.8, 'its garrisons stay');
});

test('a version 20 save gains the focus, and its armies become levies of the people', () => {
  let s = run(quiet(createState(world, 8)), 40);
  s = act(s, raise({ levy: 'half' }));
  const a = s.armies.find((x) => x.side === 'temeria');
  delete a.folk;
  delete a.levyMen;
  delete a.mercs;
  a.levy = { vizima: 400 };
  s.settlements.vizima.garrison -= 400;
  const g = s.settlements.vizima.garrison;
  delete s.labour.focus;
  s.version = 20;
  const up = deserialize(JSON.stringify({ format: 'northern-wars-save', version: 20, state: s }), world);
  assert.equal(up.version, STATE_VERSION);
  assert.deepEqual(up.labour.focus, {});
  const b = up.armies.find((x) => x.side === 'temeria');
  assert.equal(b.folk, true);
  assert.ok(b.levyMen > 0);
  assert.equal(up.settlements.vizima.garrison, g + 400, 'the garrison gets its men back');
  assert.equal(deserialize(serialize(run(up, 40)), world).version, STATE_VERSION);
});
