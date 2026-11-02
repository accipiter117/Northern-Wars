// Where the Scoia'tael come from (M32 D): the crown's own young non-humans,
// more under persecution, hunger and grievance, fewer under tolerance and
// good times; pogroms, foreign silver and Dol Blathanna; and the pool making
// the commandos likelier and stronger.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../../src/sim/index.js';
import { townRecruits, monthlyForest, recruitAccount, addRecruits } from '../../src/sim/forest.js';
import { pogrom } from '../../src/sim/culture.js';
import { spawnScoiatael } from '../../src/sim/threats.js';
import { startWar } from '../../src/sim/war.js';
import { makeRng } from '../../src/sim/rng.js';
import { nodeWorld, signLaws } from '../helpers.js';

const world = await nodeWorld();
const fresh = () => createState(world, 1);
const month = (s) => {
  const before = s.scoiatael?.recruits ?? 0;
  monthlyForest(s, world);
  return s.scoiatael.recruits - before * (1 - world.culture.scoiatael.decay);
};
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

test('the young go to the woods: a trickle, more under persecution and hunger, fewer under tolerance', () => {
  const calm = sum(townRecruits(fresh(), world, 'vizima'));
  assert.ok(calm > 0);
  const harsh = signLaws(fresh(), world, 'restrictions', 'inquisition');
  harsh.opinion.elf = 15;
  harsh.settlements.vizima.hunger = 0.4;
  const h = townRecruits(harsh, world, 'vizima');
  assert.ok(sum(h) > calm * 3, `${sum(h)} vs ${calm}`);
  assert.ok(h.persecution > 0 && h.hunger > 0 && h.grievance > 0);
  const kind = signLaws(fresh(), world, 'freedom_of_worship', 'nonhuman_charter');
  kind.settlements.vizima.prosperity = 90;
  const k = townRecruits(kind, world, 'vizima');
  assert.ok(sum(k) < calm * 0.6, `${sum(k)} vs ${calm}`);
  assert.equal(k.persecution, 0);
  assert.equal(sum(townRecruits(fresh(), world, 'tegmond')), 0, 'no non-humans, no recruits');
});

test('a pogrom sends its young at once, and the year\'s account names it', () => {
  const s = fresh();
  pogrom(s, world, makeRng(3), 'vizima');
  const a = recruitAccount(s);
  assert.equal(a.rows[0].cause, 'pogroms');
  assert.ok(a.rows[0].n > 20 && a.pool >= a.rows[0].n);
});

test('foreign silver through a deep network, and elves out of Dol Blathanna', () => {
  const s = fresh();
  s.spycraft.nets.nilfgaard.temeria = 80;
  monthlyForest(s, world);
  assert.ok((s.scoiatael.year.from.spies ?? 0) > 2);
  const shallow = fresh();
  shallow.spycraft.nets.nilfgaard.temeria = 30;
  monthlyForest(shallow, world);
  assert.equal(shallow.scoiatael.year.from.spies ?? 0, 0);
  const peace = shallow.scoiatael.year.from.aedirn;
  assert.ok(peace > 0);
  const war = fresh();
  startWar(war, world, makeRng(1), 'aedirn', 'kaedwen', 'test');
  monthlyForest(war, world);
  assert.ok(war.scoiatael.year.from.aedirn > peace);
  const gone = fresh();
  gone.realms.aedirn.fallen = true;
  monthlyForest(gone, world);
  assert.equal(gone.scoiatael.year.from.aedirn ?? 0, 0);
});

test('the pool makes commandos likelier and their bands larger', () => {
  const spawns = (pool) => {
    let n = 0;
    let men = 0;
    for (let i = 0; i < 300; i++) {
      const s = fresh();
      s.sympathy = 48;
      s.threats.list = [];
      if (pool) addRecruits(s, 'young', pool);
      spawnScoiatael(s, world, makeRng(100 + i));
      const t = s.threats.list.find((x) => x.kind === 'scoiatael');
      if (t) { n += 1; men += t.band?.men ?? t.men; }
    }
    return { n, men: n ? men / n : 0 };
  };
  const none = spawns(0);
  const many = spawns(150);
  assert.ok(many.n > none.n * 1.5, `${many.n} vs ${none.n}`);
  assert.ok(many.men > none.men + 20, `${many.men} vs ${none.men}`);
  // Below the old line, a full forest still strikes.
  const low = (() => { const s = fresh(); s.sympathy = 32; addRecruits(s, 'young', 200); let k = 0; for (let i = 0; i < 200; i++) { s.threats.list = []; spawnScoiatael(s, world, makeRng(i)); if (s.threats.list.length) k++; } return k; })();
  assert.ok(low > 0);
});

test('the account is this year\'s, largest first; last year\'s is kept', () => {
  const s = fresh();
  addRecruits(s, 'hunger', 5);
  addRecruits(s, 'persecution', 12);
  let a = recruitAccount(s);
  assert.deepEqual(a.rows.map((r) => r.cause), ['persecution', 'hunger']);
  assert.match(a.rows[0].label, /laws/);
  s.day += 365;
  assert.equal(recruitAccount(s).total, 0);
  addRecruits(s, 'young', 3);
  assert.equal(s.scoiatael.lastYear.from.persecution, 12);
  a = recruitAccount(s);
  assert.equal(a.total, 3);
  assert.ok(month(s) > 0);
});
