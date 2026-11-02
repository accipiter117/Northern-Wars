// The five paths (M33 B): the crown's own steps as goals with rewards, the
// rivals' coming on their own and changing their realms, the news by what
// the crown can see, and older reigns with Foltest's path behind them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../../src/sim/index.js';
import { STATE_VERSION } from '../../src/sim/state.js';
import { monthlyPaths, pathsView, pathDone } from '../../src/sim/paths.js';
import { makeTreaty } from '../../src/sim/diplomacy.js';
import { makeRng } from '../../src/sim/rng.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();
const fresh = () => createState(world, 1);
const sure = { ...world, paths: Object.fromEntries(Object.entries(world.paths).map(([k, v]) => [k, k === 'note' ? v : { ...v, steps: v.steps.map((s) => ({ ...s, months: 0, chance: 1 })) }])) };

test('five paths, four or five steps each, all at the start', () => {
  const s = fresh();
  const v = pathsView(s, world);
  assert.deepEqual(v.map((p) => p.rid).sort(), ['aedirn', 'kaedwen', 'nilfgaard', 'redania', 'temeria']);
  for (const p of v) assert.ok(p.total >= 3 && p.total <= 5 && p.step === 0, p.rid);
  assert.equal(v.find((p) => p.mine).steps[0].id, 'dawn');
});

test('Foltest\'s path: the Dawn, then Sodden, Brugge, Mahakam and Cintra, in order, each paid', () => {
  const s = fresh();
  monthlyPaths(s, world, makeRng(1));
  assert.equal(s.paths.temeria.step, 0, 'the Dawn first');
  s.dawn.done = s.day;
  // Brugge before Sodden counts only once Sodden is done.
  s.realms.brugge.suzerain = 'temeria';
  const coin = s.treasury;
  monthlyPaths(s, world, makeRng(1));
  assert.equal(s.paths.temeria.step, 1);
  s.realms.sodden.suzerain = 'temeria';
  monthlyPaths(s, world, makeRng(1));
  assert.equal(s.paths.temeria.step, 3, 'Sodden, then Brugge already held');
  assert.ok(s.treasury > coin + 1500);
  s.realms.mahakam.suzerain = 'temeria';
  makeTreaty(s, world, 'nonaggression', 'temeria', 'cintra');
  monthlyPaths(s, world, makeRng(1));
  assert.ok(pathDone(s, world, 'temeria'));
  assert.ok(s.chronicle.some((c) => /The Lion's house is in order/.test(c.text)));
});

test('a rival\'s steps come on their own and change the realm', () => {
  const s = fresh();
  const army = s.realms.kaedwen.army ?? 0;
  const net = s.spycraft.nets.nilfgaard.cintra;
  const gold = s.realms.nilfgaard.treasury;
  for (let i = 0; i < 6; i++) { s.day += 30; monthlyPaths(s, sure, makeRng(i)); }
  assert.ok(pathDone(s, world, 'kaedwen') && pathDone(s, world, 'nilfgaard') && pathDone(s, world, 'redania') && pathDone(s, world, 'aedirn'));
  assert.ok((s.realms.kaedwen.army ?? 0) >= army + 8000, 'the hardest northern army');
  assert.ok(s.spycraft.nets.nilfgaard.cintra > net, 'agents deep in Cintra');
  assert.ok(s.realms.nilfgaard.treasury > gold);
  assert.ok(['loyal', 'forced'].includes(s.paths.aedirn.elves), 'Dol Blathanna settled one way or the other');
  // Real pace: nothing in the first months.
  const slow = fresh();
  for (let i = 0; i < 3; i++) { slow.day += 30; monthlyPaths(slow, world, makeRng(i)); }
  assert.ok(Object.entries(slow.paths).every(([, p]) => p.step === 0));
});

test('the news is full where the crown has eyes in that court, a rumour elsewhere', () => {
  const s = fresh();
  s.embassies = { ...(s.embassies ?? {}), kaedwen: s.day + 999 };
  s.neighbours.nilfgaard.relation = -60;
  s.spycraft.nets.temeria.nilfgaard = 0;
  s.day += 400;
  monthlyPaths(s, sure, makeRng(2));
  assert.ok(s.chronicle.some((c) => /From Kaedwen: Henselt's men root the Scoia'tael/.test(c.text)));
  assert.ok(s.chronicle.some((c) => /Rumour from Nilfgaard/.test(c.text)) || pathsView(s, world).find((p) => p.rid === 'nilfgaard').seen);
});

test('how Dol Blathanna was settled changes what crosses to the woods', async () => {
  const { monthlyForest } = await import('../../src/sim/forest.js');
  const at = (elves) => { const s = fresh(); s.paths.aedirn.elves = elves; monthlyForest(s, world); return s.scoiatael.year.from.aedirn; };
  assert.ok(at('forced') > at(undefined) && at(undefined) > at('loyal'));
});

test('an older reign has Foltest\'s path behind it; the rivals start afresh', () => {
  const s = createState(world, 1, { dawn: false });
  const old = JSON.parse(serialize(s));
  old.version = 37;
  old.state.version = 37;
  delete old.state.dawn;
  delete old.state.paths;
  const up = deserialize(JSON.stringify(old), world);
  assert.equal(up.version, STATE_VERSION);
  assert.ok(pathDone(up, world, 'temeria'));
  assert.equal(up.paths.nilfgaard.step, 0);
});
