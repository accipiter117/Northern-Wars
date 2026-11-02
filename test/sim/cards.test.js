// Cards, ledger and reports (M34 D): at most four figures before Details,
// zero figures hidden; expenses in four groups; reports of a kind in a month
// folded into one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cardHead, HEAD_FIGS } from '../../src/ui/card.js';
import { groupedLines, EXPENSE_GROUPS, INCOME_GROUPS, mergeReports, reportShape } from '../../src/ui/menu.js';

test('a card shows at most four figures, hides those at 0, and keeps the rest under Details', () => {
  const figs = [1, 2, 0, 3, 4, 5, 6].map((v, i) => ({ label: `F${i}`, value: v }));
  const html = cardHead({ chips: figs });
  const head = html.split('head-more')[0];
  assert.equal((head.match(/fig-label/g) ?? []).length, HEAD_FIGS);
  assert.match(html, /<summary>Details<\/summary>/);
  assert.ok(!html.includes('F2'), 'the figure at 0 is hidden');
  assert.ok(cardHead({ chips: [{ label: 'Kept', value: 0, keep: true }] }).includes('Kept'));
});

test('expenses in four groups, income in five, and empty groups hidden', () => {
  assert.deepEqual(EXPENSE_GROUPS.map(([, label]) => label), ['Armies', 'Garrisons', 'Upkeep and repairs', 'Court and gifts']);
  assert.deepEqual(INCOME_GROUPS.map(([, label]) => label), ['Taxes', 'Trade and sales', 'Crafts and goods', 'War and tribute']);
  const out = groupedLines({ garrisons: 300, upkeep: 900, court: 1200, armies: 0, companies: 0, construction: 50 }, EXPENSE_GROUPS, {});
  assert.deepEqual(out.map((g) => g.id), ['garrisons', 'upkeep', 'court'], 'no Armies line at 0');
  const crafts = groupedLines({ taxes: 500, crafts: { smithy: 30, inn: 40, mint: 20 } }, INCOME_GROUPS, {});
  const c = crafts.find((g) => g.id === 'crafts');
  assert.equal(c.lines.length, 1, 'the crafts are one line');
  assert.equal(c.v, 90);
});

test('reports alike in a month fold into one; other months and kinds stay apart', () => {
  assert.equal(reportShape('Bandit camp sighted near Tegmond: about 22 men.'), reportShape('Bandit camp sighted near Razwan: about 17 men.'));
  const day = 460700;
  const list = [
    { day, kind: 'military', text: 'Bandit camp sighted near Tegmond: about 22 men.' },
    { day: day - 3, kind: 'military', text: 'Bandit camp sighted near Razwan: about 17 men.' },
    { day: day - 5, kind: 'military', text: 'Bandit camp sighted near Carcano: about 30 men.' },
    { day: day - 6, kind: 'realm', text: 'The ledger for the month: 3,000 crowns in, 2,900 out.' },
    { day: day - 60, kind: 'military', text: 'Bandit camp sighted near Vidort: about 12 men.' },
  ];
  const merged = mergeReports(list);
  assert.equal(merged.length, 3);
  assert.equal(merged[0].like.length, 2);
});
