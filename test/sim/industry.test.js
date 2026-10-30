import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createState, step, ledgerNet, totalPopulation, canBuild, tollsAt, bridgeCrossings, serialize, deserialize, lodgeCut, saltStorage,
} from '../../src/sim/index.js';
import { STATE_VERSION } from '../../src/sim/state.js';
import { nodeWorld } from '../helpers.js';
import { makeCrowns } from '../../tools/crowns.mjs';

const world = await nodeWorld();
const run = (s, days) => step(s, days, world, { ambient: false });
const quiet = (s) => {
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  return s;
};
const last = (s) => s.ledger.history.at(-1);
// A month of accounts, from the first of the next month.
const month = (mutate, seed = 3) => {
  const s = quiet(createState(world, seed));
  mutate(s);
  return run(s, 31);
};

test('taxes rise with development: richer places and market halls pay more, cities most a head', () => {
  const base = month(() => {});
  const richer = month((s) => { s.settlements.vizima.prosperity += 20; });
  assert.ok(richer.ledger.places.vizima.in > base.ledger.places.vizima.in + 20);
  // Since M20 the cities start with their market halls, guildhalls and
  // merchants' quarters; without them they pay less.
  const civic = ['market', 'guildhall', 'quarter', 'mint'];
  const bare = month((s) => { for (const id of ['vizima', 'maribor']) s.settlements[id].buildings = s.settlements[id].buildings.filter((b) => !civic.includes(b)); });
  assert.ok(last(base).income.taxes > last(bare).income.taxes + 40, `${last(base).income.taxes} vs ${last(bare).income.taxes}`);
  // Tax a head, at the same fortunes: a city above a town above a village.
  const rate = world.economy.taxes.perPersonMonth;
  assert.ok(rate.city > rate.town && rate.town > rate.village);
  // A kingdom already built (M20) taxes more than the bare one of M12 did
  // (514), and the head tax rose by two fifths in M24 C, but not wildly so.
  assert.ok(last(base).income.taxes <= 1000, `${last(base).income.taxes}`);
});

test('industries stand only where the land gives them (M20)', () => {
  const s = createState(world, 1);
  const has = (id, b) => s.settlements[id].buildings.includes(b);
  assert.ok(has('la_valette', 'tollbridge') && has('white_bridge', 'tollbridge'));
  assert.ok(!has('vizima', 'tollbridge'));
  // Temeria has no sea coast: no salt pans or shipyard of its own.
  assert.ok(!Object.values(s.settlements).some((x) => x.buildings.includes('saltpans') || x.buildings.includes('shipyard')));
  assert.ok(has('cleves', 'stud') && !has('windley', 'stud'));
  assert.ok(has('temple_melitele', 'hostel'));
  assert.ok(has('vizima', 'quarter') && !has('ellander', 'quarter'));
  assert.ok(has('vorune', 'silvermine') && !has('windley', 'silvermine'));
  assert.ok(has('murky_waters', 'fishery') && !has('windley', 'fishery'));
  assert.ok(has('carreras', 'weaponsmith') && has('carreras', 'smithy'), 'arms beside a smithy');
  // And nothing more can be built anywhere.
  assert.ok(!canBuild(s, world, 'windley', 'stud').ok && canBuild(s, world, 'windley', 'stud').hidden);
});

test('each chain\'s goods flow and sell', () => {
  const plain = month(() => {});
  const s = month((x) => {
    x.settlements.white_orchard.buildings.push('pasture');
    x.settlements.white_bridge.buildings.push('weavers', 'smithy', 'weaponsmith');
    x.settlements.findetann.buildings.push('charcoal');
    x.settlements.ellander.buildings.push('distillery');
    x.settlements.anchor.buildings.push('saltpans');
    x.settlements.cleves.buildings.push('stud');
    // With the crown's stables and armouries full, everything goes to market.
    x.forces.stores = { arms: 60, horses: 60 };
  });
  const goods = last(s).income.goods;
  for (const g of ['cloth', 'spirit', 'arms', 'salt', 'horses']) assert.ok(goods[g] > 20, `${g} sold for ${goods[g]}`);
  // Wool and charcoal were worked into cloth and arms, not sold raw.
  assert.ok(s.industry.made.wool > 0 && s.industry.made.charcoal > 0);
  assert.ok(!goods.wool || goods.wool < s.industry.made.wool * 0.6);
  // The suppliers are credited their share on their own accounts.
  assert.ok(s.ledger.places.white_orchard.in > plain.ledger.places.white_orchard.in + 15);
  // Carts are ready to carry the flows.
  // (Since M20 Maribor's weavers may take it before White Bridge's.)
  assert.ok(s.industry.flows.some((f) => f.good === 'wool' && f.from === 'white_orchard' && ['white_bridge', 'maribor'].includes(f.to)));
  assert.ok(s.industry.flows.some((f) => f.good === 'charcoal' && f.from === 'findetann'));
  // Grain went into the stills.
  assert.ok(s.settlements.ellander.stock.food < plain.settlements.ellander.stock.food);
  // Salt keeps the realm's food longer.
  assert.ok(saltStorage(s, world) > 0);
});

test('crown routes carry finished goods at a premium, dearest abroad', () => {
  const routeTo = (to) => month((x) => {
    x.neighbours.redania.relation = 45;
    x.settlements.white_orchard.buildings.push('pasture');
    x.settlements.white_bridge.buildings.push('weavers');
    x.routes = [{ id: 1, from: 'vizima', to, since: x.day, last: 0, raided: false, closed: null }];
    x.nextRouteId = 2;
  });
  const home = routeTo('maribor');
  const abroad = routeTo('oxenfurt');
  assert.ok(Object.values(home.routes[0].goods).some((q) => q > 0) && home.routes[0].premium > 0);
  assert.ok(abroad.routes[0].premium > home.routes[0].premium);
  assert.ok(last(abroad).income.routes['vizima>oxenfurt'] > abroad.routes[0].last);
});

test('toll bridges earn from real crossings', () => {
  const crossings = bridgeCrossings(world);
  assert.ok(crossings.la_valette.has('la_valette|rinde'), 'Devil\'s Ford carries the road to Rinde in Redania');
  assert.ok(crossings.white_bridge.size > 0);
  // A bridge earns from Redania's trade and local carts; a crown route over
  // the river adds its own caravans.
  const bare = month((x) => { x.settlements.la_valette.buildings.push('tollbridge'); });
  assert.ok(last(bare).income.tolls > 20);
  const busy = month((x) => {
    x.settlements.la_valette.buildings.push('tollbridge');
    x.neighbours.redania.relation = 45;
    x.routes = [{ id: 1, from: 'vizima', to: 'rinde', since: x.day, last: 0, raided: false, closed: null }];
  });
  const t = tollsAt(busy, world, 'la_valette');
  assert.equal(t.routes, 1);
  assert.ok(last(busy).income.tolls > last(bare).income.tolls + 5);
  // A route that never crosses the Pontar pays the bridge nothing.
  const dry = month((x) => {
    x.settlements.la_valette.buildings.push('tollbridge');
    x.routes = [{ id: 1, from: 'vizima', to: 'maribor', since: x.day, last: 0, raided: false, closed: null }];
  });
  assert.equal(tollsAt(dry, world, 'la_valette').routes, 0);
  // With Redania at war and no routes, the crossing falls quiet.
  const war = structuredClone(bare);
  war.neighbours.redania.relation = -100;
  assert.ok(tollsAt(war, world, 'la_valette').value < tollsAt(bare, world, 'la_valette').value);
});

test('the direct earners pay their own lines', () => {
  const s = month((x) => {
    x.settlements.vorune.buildings.push('silvermine');
    x.settlements.vizima.buildings.push('quarter');
    x.settlements.temple_melitele.buildings.push('hostel');
    x.settlements.gors_velen.buildings.push('shipyard');
    x.settlements.white_bridge.buildings.push('alchemist');
    x.settlements.burdorff.buildings.push('lodge');
  });
  const i = last(s).income;
  for (const k of ['silver', 'rents', 'donations', 'contracts']) assert.ok(i[k] > 20, `${k} ${i[k]}`);
  assert.ok(i.crafts.alchemist > 20 && i.crafts.lodge > 10);
  // Hunters thin out the beasts near their lodge.
  assert.ok(lodgeCut(s, world, 'burdorff') > 0 && lodgeCut(s, world, 'vizima') === 0);
});

test('a fully developed Vizima alone earns 500 or more a month', () => {
  const s = month((x) => {
    x.settlements.vizima.buildings = ['market', 'guildhall', 'quarter', 'workshop', 'brewery', 'inn', 'alchemist', 'fishery', 'harbour', 'smithy', 'bank', 'paving'];
  }, 1);
  const p = s.ledger.places.vizima;
  assert.ok(p.in - p.out >= 500, `Vizima earned ${p.in} and cost ${p.out}`);
});

test('studs and weaponsmiths stock the crown\'s stables and armouries before the market', () => {
  const s = month((x) => {
    x.settlements.cleves.buildings.push('stud');
    x.settlements.white_bridge.buildings.push('smithy', 'weaponsmith');
    x.settlements.findetann.buildings.push('charcoal');
    x.forces.stores = { arms: 0, horses: 0 };
  });
  assert.ok(s.forces.stores.horses > 5, `horses ${s.forces.stores.horses}`);
  assert.ok(s.forces.stores.arms > 5, `arms ${s.forces.stores.arms}`);
});

test('debt costs about one per cent a month', () => {
  const s = month((x) => { x.treasury = -5000; });
  // On what is still owed when the month closes.
  const owed = -(last(s).treasury - ledgerNet(last(s)).net);
  assert.ok(Math.abs(last(s).expenses.interest - owed * 0.01) <= owed * 0.003, `${last(s).expenses.interest} on ${owed}`);
});

test('every line of the ledger adds up, and every place keeps its account', () => {
  const s = month((x) => {
    x.settlements.white_orchard.buildings.push('pasture');
    x.settlements.white_bridge.buildings.push('weavers', 'brewery');
    x.settlements.la_valette.buildings.push('tollbridge');
  });
  const h = last(s);
  const { in: i, out: o } = ledgerNet(h);
  const places = Object.values(s.ledger.places);
  const placeIn = places.reduce((a, p) => a + p.in, 0);
  // Places earn all but the realm-wide lines (foreign trade, conquests and
  // tribute); rounding aside, the books agree.
  assert.ok(Math.abs(placeIn - (i - h.income.foreign - h.income.conquests - h.income.tribute)) < places.length, `${placeIn} vs ${i}`);
  assert.ok(o > 0);
  assert.ok(s.ledger.places.vizima.in > s.ledger.places.windley.in);
});

test('the idle crown declines: its works wear out and its income falls (M20)', () => {
  let s = quiet(createState(world, 1));
  const yearIn = [];
  for (let m = 0; m < 120; m++) {
    s = quiet(run(s, 30));
    if ((m + 1) % 12 === 0) yearIn.push(s.ledger.history.reduce((a, h) => a + ledgerNet(h).in, 0) / s.ledger.history.length);
  }
  const all = Object.values(s.settlements).flatMap((x) => x.buildings.map((b) => x.cond?.[b] ?? 100));
  const mean = all.reduce((a, b) => a + b, 0) / all.length;
  assert.ok(mean < 50, `works at ${mean}`);
  assert.ok(yearIn[9] < yearIn[0] * 0.8, `year 1 ${yearIn[0]}, year 10 ${yearIn[9]}`);
});

test('the steward stays solvent over ten years, keeps its works and its income', () => {
  const { steward } = makeCrowns(world);
  // Seed 3 keeps the peace; in seed 2 a neighbour takes six towns in a war,
  // which tests the war, not the economy.
  let s = createState(world, 3);
  let low = Infinity;
  const yearIn = [];
  for (let m = 0; m < 120; m++) {
    s = steward(s, m, false);
    s = run(s, 30);
    low = Math.min(low, s.treasury);
    assert.ok(!s.unpaid, `unpaid in month ${m}`);
    if ((m + 1) % 12 === 0) yearIn.push(s.ledger.history.reduce((a, h) => a + ledgerNet(h).in, 0) / s.ledger.history.length);
  }
  assert.ok(low > -world.economy.debt.creditLimit / 2, `lowest treasury ${low}`);
  assert.ok(s.treasury > 0);
  // Within a fifth of where it began: the gold seams, worked harder since
  // M24 C, run out over the decade.
  assert.ok(yearIn[9] >= yearIn[0] * 0.8, `year 1 ${yearIn[0]}, year 10 ${yearIn[9]}`);
  const all = Object.values(s.settlements).flatMap((x) => x.buildings.map((b) => x.cond?.[b] ?? 100));
  assert.ok(all.reduce((a, b) => a + b, 0) / all.length >= 75, 'the steward keeps its works');
  assert.ok(s.forces.companies.length >= 4, `${s.forces.companies.length} companies`);
  // A surplus before the courtiers a full treasury draws (M24 C): by year
  // ten the steward's hoard of 50,000 or more is meant to level off, so the
  // hoard's charge is left out of the measure.
  const u = world.economy.upkeep;
  const hoard = (h) => Math.max(0, h.treasury - u.hoardFree) * u.hoardPerMonth;
  const net = s.ledger.history.reduce((a, h) => a + ledgerNet(h).net + hoard(h), 0) / s.ledger.history.length;
  assert.ok(net > 0, `monthly surplus before the hoard ${net}`);
  const pop = Object.values(s.settlements).reduce((a, x) => a + totalPopulation(x), 0);
  assert.ok(pop > 54000);
});
