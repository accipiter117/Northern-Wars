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
  const marts = month((s) => { s.settlements.vizima.buildings.push('quarter'); s.settlements.maribor.buildings.push('market', 'guildhall'); });
  assert.ok(last(marts).income.taxes > last(base).income.taxes + 40, `${last(marts).income.taxes} vs ${last(base).income.taxes}`);
  // Tax a head, at the same fortunes: a city above a town above a village.
  const rate = world.economy.taxes.perPersonMonth;
  assert.ok(rate.city > rate.town && rate.town > rate.village);
  // The idle crown's taxes start no higher than before the rebalance (514).
  assert.ok(last(base).income.taxes <= 514, `${last(base).income.taxes}`);
});

test('industries stand only where the land suits them', () => {
  const s = createState(world, 1);
  const ok = (id, b) => canBuild(s, world, id, b).ok;
  assert.ok(ok('la_valette', 'tollbridge') && ok('white_bridge', 'tollbridge'));
  assert.ok(!ok('vizima', 'tollbridge'));
  assert.ok(ok('gors_velen', 'shipyard') && !ok('maribor', 'shipyard'));
  assert.ok(ok('anchor', 'saltpans') && !ok('cleves', 'saltpans'));
  assert.ok(ok('cleves', 'stud') && !ok('windley', 'stud'));
  assert.ok(ok('temple_melitele', 'hostel'));
  assert.ok(ok('vizima', 'quarter') && !ok('ellander', 'quarter'));
  assert.ok(ok('findetann', 'charcoal') && !ok('windley', 'charcoal'));
  assert.ok(ok('vorune', 'silvermine') && !ok('windley', 'silvermine'));
  assert.ok(ok('murky_waters', 'fishery') && !ok('windley', 'fishery'));
  assert.ok(!ok('vizima', 'weaponsmith'), 'arms need a smithy first');
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
  assert.ok(s.industry.flows.some((f) => f.good === 'wool' && f.from === 'white_orchard' && f.to === 'white_bridge'));
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
  assert.ok(home.routes[0].goods.cloth > 0 && home.routes[0].premium > 0);
  assert.ok(abroad.routes[0].premium > home.routes[0].premium);
  assert.ok(last(abroad).income.routes['vizima>oxenfurt'] > abroad.routes[0].last);
});

test('toll bridges earn from real crossings', () => {
  const crossings = bridgeCrossings(world);
  assert.ok(crossings.la_valette.has('la_valette|oxenfurt'), 'Devil\'s Ford carries the Oxenfurt road');
  assert.ok(crossings.white_bridge.size > 0);
  // A bridge earns from Redania's trade and local carts; a crown route over
  // the river adds its own caravans.
  const bare = month((x) => { x.settlements.la_valette.buildings.push('tollbridge'); });
  assert.ok(last(bare).income.tolls > 20);
  const busy = month((x) => {
    x.settlements.la_valette.buildings.push('tollbridge');
    x.neighbours.redania.relation = 45;
    x.routes = [{ id: 1, from: 'vizima', to: 'oxenfurt', since: x.day, last: 0, raided: false, closed: null }];
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

test('a fully developed Vizima alone earns 600 or more a month', () => {
  const s = month((x) => {
    x.settlements.vizima.buildings = ['market', 'guildhall', 'quarter', 'workshop', 'brewery', 'inn', 'alchemist', 'fishery', 'harbour', 'smithy', 'bank', 'paving'];
  }, 1);
  const p = s.ledger.places.vizima;
  assert.ok(p.in - p.out >= 600, `Vizima earned ${p.in} and cost ${p.out}`);
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
  assert.ok(last(s).expenses.interest >= 40 && last(s).expenses.interest <= 60, `${last(s).expenses.interest}`);
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

test('the idle crown earns no more than before', () => {
  let s = quiet(createState(world, 1));
  let income = 0;
  for (let m = 0; m < 12; m++) {
    s = run(s, 30);
    if (last(s)) income += ledgerNet(last(s)).in;
  }
  // Before M12 the untended crown took in about 1,091 a month in its first year.
  assert.ok(income / s.ledger.history.length <= 1091 * 1.02, `idle income ${income / s.ledger.history.length}`);
});

test('the steward stays solvent over ten years, and earns far more by the end', () => {
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
  assert.ok(yearIn[9] >= yearIn[0] * 2.5, `year 1 ${yearIn[0]}, year 10 ${yearIn[9]}`);
  assert.ok(s.forces.companies.length >= 4, `${s.forces.companies.length} companies`);
  const net = s.ledger.history.reduce((a, h) => a + ledgerNet(h).net, 0) / s.ledger.history.length;
  assert.ok(net > 300, `monthly surplus ${net}`);
  const pop = Object.values(s.settlements).reduce((a, x) => a + totalPopulation(x), 0);
  assert.ok(pop > 54000);
});

test('a version 10 save gains the new ledger and industry', () => {
  const s = run(createState(world, 9), 40);
  const m = s.ledger.history.at(-1);
  m.income.crafts = 25;
  delete m.income.goods;
  delete s.ledger.places;
  delete s.industry;
  s.version = 10;
  const loaded = deserialize(JSON.stringify({ format: 'northern-wars-save', version: 10, state: s }), world);
  assert.equal(loaded.version, STATE_VERSION);
  assert.deepEqual(loaded.ledger.history.at(-1).income.crafts, { crafts: 25 });
  assert.deepEqual(loaded.ledger.places, {});
  assert.deepEqual(loaded.industry, { made: {}, flows: [] });
  assert.equal(ledgerNet(loaded.ledger.history.at(-1)).in, ledgerNet({ ...m, income: { ...m.income, crafts: 25 } }).in);
  assert.ok(deserialize(serialize(run(loaded, 40)), world));
});
