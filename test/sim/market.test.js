// Wealth (M21 A and B): trade in five goods with prices that follow the
// realm's balance, deals with partner realms, home sales of what is left,
// taxes by estate, loans from the bank, and what war brings in.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createState, step, applyAction, serialize, deserialize, MARKET_GOODS, marketGoodOf, partnerTrade, homePrice, exportPrice, importPrice,
  estateTaxPreview, enactment, owedOnLoans, ledgerNet, dateOf, MONTHS,
} from '../../src/sim/index.js';
import { STATE_VERSION } from '../../src/sim/state.js';
import { windfall, collectRansoms } from '../../src/sim/economy.js';
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
  // Dilemmas left open would be answered by default, coin and all, outside
  // the month's ledger.
  if (s.dilemmas) s.dilemmas.open = [];
  return s;
};
// Run to the first of the next month, when the ledger is drawn up.
const toMonth = (s) => {
  const d = dateOf(s.day);
  return run(s, MONTHS[d.month - 1].days - d.day + 1);
};
const last = (s) => s.ledger.history.at(-1);

test('every good the realm makes rolls up into one of the five, and each has a balance each month', () => {
  for (const g of ['food', 'timber', 'stone', 'iron', 'wool', 'cloth', 'charcoal', 'spirit', 'salt', 'arms', 'horses']) {
    assert.ok(MARKET_GOODS.includes(marketGoodOf(world, g)?.good), `${g} rolls up`);
  }
  assert.equal(marketGoodOf(world, 'arms').good, 'iron');
  assert.equal(marketGoodOf(world, 'wool').good, 'cloth');
  assert.equal(marketGoodOf(world, 'horses').good, 'luxuries');
  const s = run(quiet(createState(world, 1)), 62);
  for (const g of MARKET_GOODS) {
    const r = s.market.report[g];
    assert.ok(r && Number.isFinite(r.balance) && r.price > 0, `${g}: ${JSON.stringify(r)}`);
    assert.equal(r.balance, r.made - r.used);
  }
  // Temeria starts with timber and stone to spare and too little cloth.
  assert.ok(s.market.report.materials.balance > 0);
  assert.ok(s.market.report.cloth.balance < 0);
});

test('a shortage raises the price at home, a glut lowers it, and a deal cut by war makes its good dearer', () => {
  const s = run(quiet(createState(world, 2)), 150);
  const base = (g) => world.market.goods[g].base;
  assert.ok(homePrice(s, world, 'cloth') > base('cloth'), 'cloth, short, is dear');
  assert.ok(homePrice(s, world, 'materials') < base('materials'), 'timber and stone, in glut, are cheap');
  // A cut supply adds to the price for a while.
  const cut = structuredClone(s);
  cut.market.cut.grain = cut.day + 90;
  const a = run(structuredClone(s), 31);
  const b = run(cut, 31);
  assert.ok(b.market.price.grain > a.market.price.grain);
});

test('a deal sells a good the partner wants and buys one it offers, month by month, and war cuts it', () => {
  let s = run(quiet(createState(world, 3)), 62);
  const p = partnerTrade(s, world, 'redania');
  assert.equal(p.wants.length, 2);
  assert.equal(p.offers.length, 2);
  assert.ok(p.capacity > 50);
  // A good it does not want is refused, and so is too much.
  const other = MARKET_GOODS.find((g) => !p.wants.includes(g));
  assert.match(applyAction(s, world, { type: 'trade', realm: 'redania', sell: { good: other, qty: 20 } }).error, /does not want/);
  assert.match(applyAction(s, world, { type: 'trade', realm: 'redania', sell: { good: p.wants[0], qty: p.capacity + 1 } }).error, /at most/);
  const sell = { good: 'materials', qty: 40 };
  const buy = { good: p.offers[0], qty: 20 };
  assert.ok(p.wants.includes('materials'), `Redania wants ${p.wants}`);
  s = act(s, { type: 'trade', realm: 'redania', sell, buy });
  const theirs = s.realms.redania.treasury;
  s = toMonth(s);
  const h = last(s);
  assert.equal(Math.round(h.income.exports.Redania), Math.round(40 * exportPrice(world, 'materials')));
  assert.equal(Math.round(h.expenses.imports.Redania), Math.round(20 * importPrice(world, buy.good)));
  assert.equal(s.market.report.materials.exported, 40);
  assert.equal(s.market.report[buy.good].imported, 20);
  assert.ok(s.realms.redania.treasury !== theirs);
  // War cuts it, and what it supplied grows dear.
  s = act(s, { type: 'declare', realm: 'redania' });
  s = toMonth(s);
  assert.equal(s.market.deals.redania, undefined);
  assert.ok(s.market.cut[buy.good] > s.day);
  assert.ok(s.chronicle.some((d) => /trade with Redania is cut/.test(d.text)));
});

test('what is left over sells at home for less than abroad, unless the crown holds it back', () => {
  let s = run(quiet(createState(world, 4)), 92);
  assert.ok(world.market.home < 1 && world.market.export.want > 1);
  const sold = toMonth(structuredClone(s));
  assert.ok(sold.market.report.materials.sold > 0, 'surplus timber and stone sold at home');
  assert.ok(last(sold).income.sales > 0);
  // Held back, it stays in store and earns nothing.
  s = act(s, { type: 'hold', good: 'materials', on: true });
  const stock = (x) => Object.values(x.settlements).reduce((a, t) => a + t.stock.timber + t.stock.stone, 0);
  const held = toMonth(s);
  assert.equal(held.market.report.materials.sold, 0);
  assert.ok(stock(held) > stock(sold) + 50, 'kept in the stores');
  assert.ok(last(held).income.sales < last(sold).income.sales);
});

test('each estate pays as the Treasury says under its setting, and heavier taxes anger it', () => {
  let s = run(quiet(createState(world, 5)), 62);
  const pv = estateTaxPreview(s, world);
  for (const e of ['towns', 'peasants', 'nobles']) {
    assert.ok(pv[e].light < pv[e].fair && pv[e].fair < pv[e].heavy, `${e}: ${JSON.stringify(pv[e])}`);
  }
  const burghers = s.opinion.burghers;
  s = act(s, { type: 'law', law: 'tax_towns', option: 'heavy' });
  s = act(s, { type: 'law', law: 'tax_nobles', option: 'heavy' });
  s = run(s, 31);
  assert.equal(enactment(s, world, 'tax_towns'), 1);
  // A month in force: what the towns and lords paid is what was shown.
  const want = estateTaxPreview(s, world);
  const t = toMonth(s);
  const paid = last(t).estates;
  assert.ok(Math.abs(paid.nobles - want.nobles.heavy) <= want.nobles.heavy * 0.05, `nobles ${paid.nobles} vs ${want.nobles.heavy}`);
  assert.ok(Math.abs(paid.towns - want.towns.heavy) <= want.towns.heavy * 0.1, `towns ${paid.towns} vs ${want.towns.heavy}`);
  assert.ok(t.opinion.burghers < burghers, 'the burghers grumble');
  // The old tax laws are gone from the Laws screen's list.
  assert.equal(world.laws.laws.taxation, undefined);
  assert.equal(world.laws.laws.tax_towns.category, 'taxes');
});

test('a loan comes at once and is repaid with interest; a missed payment costs more and costs Love', () => {
  let s = run(quiet(createState(world, 6)), 62);
  const t0 = s.treasury;
  s = act(s, { type: 'loan', sum: 5000 });
  assert.equal(s.treasury, t0 + 5000);
  const loan = s.loans[0];
  const c = world.economy.loans;
  assert.equal(loan.payment, Math.round((5000 * (1 + c.rate * c.months)) / c.months));
  assert.ok(loan.payment * c.months > 5000, 'interest is paid');
  // The cap: more than six months of income is refused.
  assert.match(applyAction(s, world, { type: 'loan', sum: 10000 }).error ?? applyAction(act(s, { type: 'loan', sum: 10000 }), world, { type: 'loan', sum: 10000 }).error, /will not have us owe/);
  s = toMonth(s);
  assert.equal(last(s).expenses.loans, loan.payment);
  assert.equal(s.loans[0].left, c.months - 1);
  assert.equal(last(s).income.borrowed, 5000);
  // An empty treasury misses the next payment.
  s.treasury = -20000;
  const auth = s.love;
  const owed = owedOnLoans(s);
  s = toMonth(s);
  assert.equal(s.loans[0].missed, 1);
  assert.ok(s.loans[0].rate > c.rate);
  assert.ok(owedOnLoans(s) > owed, 'the bank adds the missed payment and more');
  assert.ok(s.love < auth + 1);
  assert.ok(s.chronicle.some((d) => /misses a payment/.test(d.text)));
});

test('loot, ransoms, coin in peace terms and requisitions come in at once and show on the ledger', () => {
  let s = quiet(run(quiet(createState(world, 7)), 62));
  const t0 = s.treasury;
  windfall(s, 'loot', 400);
  windfall(s, 'requisition', 150);
  windfall(s, 'reparations', 1000);
  assert.equal(s.treasury, t0 + 1550);
  // A commander we hold is ransomed by his realm after a month.
  s.captives = [{ id: 1, side: 'redania', by: 'temeria', marshal: null, day: s.day - 40, ransom: 600 }];
  s.realms.redania.treasury = 5000;
  collectRansoms(s, world);
  assert.equal(s.captives.length, 0);
  assert.equal(s.treasury, t0 + 2150);
  const before = s.treasury;
  s = toMonth(s);
  const h = last(s);
  assert.equal(h.income.loot, 400);
  assert.equal(h.income.ransom, 600);
  assert.equal(h.income.reparations, 1000);
  assert.equal(h.income.requisition, 150);
  // Already in the treasury: the month's change is the ledger less them.
  const { net } = ledgerNet(h);
  assert.ok(Math.abs(s.treasury - (before + net - 2150)) < 2, `${s.treasury} vs ${before + net - 2150}`);
  // Tribute written into peace terms arrives month by month.
  s.tributes.push({ from: 'redania', to: 'temeria', monthly: 120, until: s.day + 400 });
  s = toMonth(s);
  assert.equal(last(s).income.tribute, 120);
});

test('a version 19 save gains the estates, the market and its routes abroad as deals', () => {
  const s = createState(world, 8);
  delete s.market;
  delete s.loans;
  delete s.laws.tax_towns;
  delete s.laws.tax_peasants;
  delete s.laws.tax_nobles;
  s.laws.taxation = { option: 'heavy', previous: 'heavy', since: 0 };
  s.laws.noble_privilege = { option: 'exempt', previous: 'exempt', since: 0 };
  s.routes = [{ id: 1, from: 'vizima', to: 'tretogor', since: 0, last: 0, raided: false, closed: null }];
  s.version = 19;
  const up = deserialize(JSON.stringify({ format: 'northern-wars-save', version: 19, state: s }), world);
  assert.equal(up.version, STATE_VERSION);
  assert.equal(up.laws.taxation, undefined);
  assert.equal(up.laws.tax_towns.option, 'fair');
  assert.ok(up.market.deals.redania?.sell, 'the route to Tretogor is now a deal with Redania');
  assert.deepEqual(up.loans, []);
  assert.equal(deserialize(serialize(run(up, 40)), world).version, STATE_VERSION);
});
