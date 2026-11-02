// Fewer, clearer screens (M34 C): fourteen sub-screens, and every old
// sub-screen id leads to its new home.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SUBS, canonicalTab, mendSubs, goWhere } from '../../src/ui/router.js';

test('fourteen sub-screens across the five tabs', () => {
  assert.equal(Object.values(SUBS).reduce((a, l) => a + l.length, 0), 14);
  assert.deepEqual(SUBS.diplomacy.map(([id]) => id), ['realms', 'envoys', 'spies']);
});

test('old sub-screen ids lead to their new homes, and their folds open', () => {
  const pairs = {
    'realm:places': 'realm:overview',
    'court:spies': 'diplomacy:spies',
    'treasury:taxes': 'treasury:ledger',
    'treasury:industry': 'treasury:trade',
    'military:garrisons': 'military:forces',
    'diplomacy:pacts': 'diplomacy:envoys',
    'diplomacy:intel': 'diplomacy:spies',
    'court:faith': 'court:faith',
    'court:nonsense': 'court:inbox',
  };
  for (const [from, to] of Object.entries(pairs)) assert.equal(canonicalTab(from), to, from);
  const memory = { expanded: {}, sub: {} };
  assert.equal(goWhere(memory, 'treasury:taxes'), 'treasury:ledger');
  assert.equal(memory.expanded['tab:treasury#taxes'], true);
});

test('saved navigation from before is mended', () => {
  const memory = { sub: { realm: 'places', court: 'spies', treasury: 'taxes', military: 'garrisons', diplomacy: 'intel' } };
  mendSubs(memory);
  assert.deepEqual(memory.sub, { realm: 'overview', court: 'inbox', treasury: 'ledger', military: 'forces', diplomacy: 'spies' });
});
