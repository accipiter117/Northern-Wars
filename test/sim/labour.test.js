// Labour through the seasons (M20 C): the kingdom's hands, where they work,
// what the seasons and the royal calls do to them, and the fuel that keeps
// the hearths lit.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createState, step, applyAction, serialize, deserialize, districtOf, handsOf, needOf, splitNow, worksFactor, foodYield,
} from '../../src/sim/index.js';
import { STATE_VERSION } from '../../src/sim/state.js';
import { stepLabourDay, monthlyLabour, fuelMade } from '../../src/sim/labour.js';
import { makeRng } from '../../src/sim/rng.js';
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
// The state on a given month's first day (the reign opens on 1 March).
const onMonth = (seed, month) => {
  const s = quiet(createState(world, seed));
  const days = [0, 31, 61, 92, 122, 153, 184, 214, 245, 275, 306, 337][(month - 3 + 12) % 12];
  return days ? run(s, days) : s;
};

test('villages lend their hands to the nearest town by road, within a day\'s walk', () => {
  const d = districtOf(world);
  let lent = 0;
  for (const st of world.geography.settlements) {
    const head = d[st.id];
    if (st.type !== 'village') assert.equal(head, st.id);
    else if (head !== st.id) {
      lent += 1;
      assert.ok(['town', 'city'].includes(world.byId[head].type), `${st.id} lends to ${head}`);
    }
  }
  assert.ok(lent >= 8, `${lent} villages lend their hands`);
  // Murky Waters, an hour from Vizima, works for the capital.
  assert.equal(d.murky_waters, 'vizima');
  // A town's works are manned from its hinterland: without its villages,
  // Vizima's would go shorter.
  const s = onMonth(1, 6);
  const alone = structuredClone(s);
  for (const id of Object.keys(alone.settlements)) if (d[id] === 'vizima' && id !== 'vizima') alone.settlements[id].occupier = 'redania';
  stepLabourDay(alone, world);
  const hands = (x) => Object.keys(x.settlements).filter((id) => d[id] === 'vizima').reduce((a, id) => a + handsOf(x, world, id), 0);
  assert.ok(hands(alone) < hands(s), 'fewer hands for the capital\'s works without its villages');
  assert.ok(handsOf(s, world, 'vizima') > handsOf(s, world, 'murky_waters'));
});

test('the seasons move the work: fields from spring to harvest, the water shut by ice, shearing in spring', () => {
  const s = onMonth(2, 6);
  assert.ok(needOf(s, world, 'white_orchard', 'fields', 6) > 0);
  assert.equal(needOf(s, world, 'white_orchard', 'fields', 12), 0, 'the fields are idle in winter');
  assert.ok(needOf(s, world, 'cleves', 'stud', 4) > needOf(s, world, 'cleves', 'stud', 8), 'more hands at the shearing');
  // The fields are manned in June, and their hands stand idle in December.
  assert.ok(s.settlements.white_orchard.farmStaff > 60);
  const w = onMonth(2, 12);
  assert.equal(w.labour.report.fields.need, 0);
  assert.ok(w.labour.report.fields.hands > 1000, 'field hands with nothing to do');
  // Ice and storms close the water.
  w.labour.closed = w.day + 20;
  assert.equal(needOf(w, world, 'murky_waters', 'fishery', 12), 0);
});

test('the crown splits its hands by kind of work, and the works go short or full as it does', () => {
  let s = onMonth(3, 6);
  const crafts = s.labour.report.crafts.staffed;
  s = act(s, { type: 'labourShift', kind: 'crafts', step: 10 });
  assert.equal(Object.values(s.labour.split).reduce((a, b) => a + b, 0), 100);
  stepLabourDay(s, world);
  assert.ok(s.labour.report.crafts.staffed > crafts);
  // Starved of hands, a market hall yields less.
  const bare = structuredClone(s);
  bare.labour.split = { fields: 80, woods: 5, mines: 5, pastures: 2, fishing: 3, crafts: 0, repairs: 3, levies: 2 };
  stepLabourDay(bare, world);
  assert.ok(worksFactor(bare.settlements.vizima, 'market') < 0.05);
  assert.ok(worksFactor(s.settlements.vizima, 'market') > 0.9);
  // A split that does not make a hundred is refused.
  assert.ok(applyAction(s, world, { type: 'labour', split: { ...s.labour.split, crafts: 90 } }).error);
  // A works pinned is manned first.
  const pinned = act(bare, { type: 'pin', settlement: 'vizima', building: 'harbour' });
  pinned.labour.split = { fields: 50, woods: 5, mines: 5, pastures: 2, fishing: 1, crafts: 30, repairs: 4, levies: 3 };
  const loose = structuredClone(pinned);
  loose.labour.pins = {};
  stepLabourDay(pinned, world);
  stepLabourDay(loose, world);
  assert.ok(pinned.settlements.vizima.staff.harbour > loose.settlements.vizima.staff.harbour);
});

test('the harvest muster fills the fields for six weeks, at a cost to everything else', () => {
  let s = onMonth(4, 8);
  const unrest = s.settlements.vizima.unrest;
  const mines = s.labour.report.mines.staffed;
  const grown = foodYield(world, 'white_orchard', s.settlements.white_orchard, 8);
  s = act(s, { type: 'call', call: 'harvest' });
  assert.ok(s.settlements.vizima.unrest > unrest);
  assert.ok(splitNow(s, world).fields >= 75);
  stepLabourDay(s, world);
  assert.ok(s.labour.report.mines.staffed < mines * 0.6, 'the mines fall quiet');
  assert.ok(foodYield(world, 'white_orchard', s.settlements.white_orchard, 8) > grown, 'the harvest comes in fuller');
  assert.ok(applyAction(s, world, { type: 'call', call: 'harvest' }).error, 'once at a time');
  s = run(s, 45);
  assert.ok(splitNow(s, world).fields < 75, 'it ends');
  // Out of season it cannot be called.
  assert.match(applyAction(onMonth(4, 4), world, { type: 'call', call: 'harvest' }).error, /Only from/);
});

test('raising the levies fills the garrisons, empties the works and costs the treasury', () => {
  let s = onMonth(5, 6);
  const t0 = s.treasury;
  const g0 = Object.values(s.settlements).reduce((a, x) => a + x.garrison, 0);
  const crafts = s.labour.report.crafts.staffed;
  s = act(s, { type: 'call', call: 'levy' });
  assert.equal(s.treasury, t0 - world.labour.calls.levy.coin);
  stepLabourDay(s, world);
  assert.ok(s.labour.report.crafts.staffed < crafts);
  s = run(s, 60);
  assert.ok(Object.values(s.settlements).reduce((a, x) => a + x.garrison, 0) > g0 * 1.08);
});

test('the winter turn sends the field hands to the woods; winter burns the fuel; cold kills', () => {
  // Called, the field hands cut fuel from first frost.
  const s = onMonth(6, 11);
  const plain = structuredClone(s);
  const turned = act(s, { type: 'call', call: 'winter' });
  stepLabourDay(plain, world);
  stepLabourDay(turned, world);
  assert.ok(splitNow(turned, world).fields === 0 && splitNow(turned, world).woods > plain.labour.split.woods);
  assert.ok(fuelMade(turned, world) > fuelMade(plain, world) * 1.5);
  // Winter burns what is in store.
  const w = onMonth(6, 12);
  const before = w.labour.fuel;
  monthlyLabour(w, world, makeRng(1));
  assert.ok(w.labour.burned > 0 && w.labour.fuel < before + w.labour.made);
  // With the woodpiles empty and no one cutting, the hearths go cold.
  const cold = onMonth(7, 1);
  cold.labour.fuel = 0;
  cold.labour.split = { fields: 50, woods: 0, mines: 10, pastures: 4, fishing: 5, crafts: 25, repairs: 3, levies: 3 };
  stepLabourDay(cold, world);
  const pop = (x) => Object.values(x.settlements).reduce((a, t) => a + Object.values(t.population).reduce((p, q) => p + q, 0), 0);
  const people = pop(cold);
  const unrest = cold.settlements.anchor.unrest;
  monthlyLabour(cold, world, makeRng(2));
  assert.ok(cold.labour.short > 0.5);
  assert.ok(pop(cold) < people, 'the poorest die of cold');
  assert.ok(cold.settlements.anchor.unrest > unrest);
  assert.ok(cold.chronicle.some((d) => /Hearths go cold/.test(d.text)));
});

test('repairs go as fast as the Repairs share of the hands allows', () => {
  const s = onMonth(8, 6);
  const few = s.labour.crews;
  const more = act(s, { type: 'labourShift', kind: 'repairs', step: 10 });
  stepLabourDay(more, world);
  assert.ok(more.labour.crews > few + 2, `${few} crews, then ${more.labour.crews}`);
});

test('a version 17 save gains the kingdom\'s hands', () => {
  const s = createState(world, 9);
  delete s.labour;
  for (const t of Object.values(s.settlements)) {
    delete t.staff;
    delete t.farmStaff;
  }
  s.version = 17;
  const up = deserialize(JSON.stringify({ format: 'northern-wars-save', version: 17, state: s }), world);
  assert.equal(up.version, STATE_VERSION);
  assert.deepEqual(up.labour.split, world.labour.split);
  assert.ok(up.labour.fuel > 0);
  const later = run(up, 40);
  assert.ok(later.labour.report.fields.hands > 0);
  assert.equal(deserialize(serialize(later), world).version, STATE_VERSION);
});

test('the season suggests a setting, and Custom is any split that matches none (M23 B)', async () => {
  const { presetNow, seasonalPrompt, applyAction: act, dateOf: date } = await import('../../src/sim/index.js');
  let s = createState(world, 7);
  assert.equal(presetNow(s, world), 'balanced', 'the kingdom starts at its usual round');
  while (date(s.day).month !== 8) s = step(s, 5, world, { ambient: false });
  assert.equal(seasonalPrompt(s, world).preset, 'harvest');
  s = act(s, world, { type: 'preset', preset: 'harvest' }).state;
  assert.equal(presetNow(s, world), 'harvest');
  assert.equal(seasonalPrompt(s, world), null, 'no prompt once the hands are where the season wants them');
  // After the harvest, back to the usual round; but not from a custom split.
  while (date(s.day).month !== 10) s = step(s, 5, world, { ambient: false });
  assert.equal(seasonalPrompt(s, world).preset, 'balanced');
  s = act(s, world, { type: 'labourShift', kind: 'woods', step: 3 }).state;
  assert.equal(presetNow(s, world), null, 'Custom');
  assert.equal(seasonalPrompt(s, world), null);
  // Winter hands from November.
  while (date(s.day).month !== 11) s = step(s, 5, world, { ambient: false });
  assert.equal(seasonalPrompt(s, world).preset, 'winter');
});
