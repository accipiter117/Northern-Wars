// Spaces, condition and repair (M20 A and B): every place starts with the
// works its land gives it; nothing new is built; works yield by the lower of
// their condition and staffing; raids, sieges and sacks knock them down; the
// crown rebuilds, patches or leaves them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createState, step, applyAction, canBuild, serialize, deserialize, spacesOf, worksFactor, repairOptions, canRepairWorks, buildingEffects,
} from '../../src/sim/index.js';
import { STATE_VERSION } from '../../src/sim/state.js';
import { monthlyWorks, startingWorks, damageWorks } from '../../src/sim/works.js';
import { startWar } from '../../src/sim/war.js';
import { newArmy } from '../../src/sim/armies.js';
import { siegeDay } from '../../src/sim/siege.js';
import { onCapture, resolveConquestDecision } from '../../src/sim/conquest.js';
import { makeRng } from '../../src/sim/rng.js';
import { setOwner, recordCapture } from '../../src/sim/conflict.js';
import { proposeSpaces } from '../../tools/spaces.mjs';
import { nodeWorld, ROOT } from '../helpers.js';

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

test('spaces come from the traced geography and match the atlas', () => {
  const geo = JSON.parse(readFileSync(join(ROOT, 'data/geography.json'), 'utf8'));
  const gold = JSON.parse(readFileSync(join(ROOT, 'data/gold.json'), 'utf8'));
  const p = proposeSpaces(geo, gold);
  const has = (id, kind, name) => p[id].some((x) => x.kind === kind && (!name || x.name.includes(name)));
  assert.ok(has('vizima', 'lake', 'Lake Vizima') && has('vizima', 'river', 'Ismena'));
  assert.ok(has('petrelsteyn', 'forest', 'Jay Forest') && has('petrelsteyn', 'hills', 'Tukaj Hills'));
  assert.ok(has('gors_velen', 'marsh', 'Velen marshes'));
  assert.ok(has('houtborg', 'mountain', 'Mahakam foothills'));
  assert.ok(has('white_bridge', 'river', 'Pontar') && has('la_valette', 'river', 'Pontar'));
  assert.ok(has('mayena', 'river', 'Ina') && has('armeria', 'river', 'Ina'));
  assert.ok(has('red_fort', 'river', 'Yaruga'));
  // Temeria has no sea coast in the traced map, by design.
  for (const st of geo.settlements) assert.ok(!has(st.id, 'coast'), `${st.id} on the coast`);
  // And the game's own spaces are the tool's, with the hand-written touches.
  assert.ok(world.spaces.maribor.some((x) => x.kind === 'river' && x.works.includes('mill')));
  assert.ok(world.spaces.vizima.find((x) => x.kind === 'square').works.includes('mint'));
  // Most places have one to three spaces of land; cities up to four.
  for (const st of geo.settlements) {
    const land = world.spaces[st.id].filter((x) => !['square', 'defences', 'seam'].includes(x.kind)).length;
    assert.ok(land >= 1 && land <= (st.type === 'city' ? 4 : 3), `${st.id} has ${land}`);
  }
});

test('every place starts fully built, and nothing can be newly built', () => {
  const s = createState(world, 1);
  for (const [id, t] of Object.entries(s.settlements)) {
    assert.ok(t.buildings.length > 0, `${id} stands empty`);
    for (const sp of world.spaces[id]) for (const b of sp.works) assert.ok(t.buildings.includes(b), `${id} lacks its ${b}`);
  }
  // Foreign realms the same way, by their land.
  assert.ok(s.realms.cidaris.settlements.bremervoord.buildings.includes('harbour'));
  assert.ok(s.realms.kaedwen.settlements.ban_ard.buildings.includes('mine'));
  // No new building anywhere.
  for (const b of Object.keys(world.buildings)) assert.equal(canBuild(s, world, 'windley', b).ok, false);
  assert.ok(applyAction(s, world, { type: 'build', settlement: 'windley', building: 'stud' }).error);
  // Known gold seams lie flooded until the crown reopens them.
  assert.equal(worksFactor(s.settlements.carreras, 'goldmine'), 0);
});

test('a works yields by the lower of its condition and its staffing', () => {
  const s = createState(world, 1);
  const t = s.settlements.vizima;
  assert.equal(worksFactor(t, 'market'), 1);
  t.cond = { market: 40 };
  assert.equal(worksFactor(t, 'market'), 0.4);
  t.staff = { market: 30 };
  assert.equal(worksFactor(t, 'market'), 0.3);
  t.staff = { market: 80 };
  assert.equal(worksFactor(t, 'market'), 0.4);
  const whole = buildingEffects(world, createState(world, 1).settlements.vizima).trade;
  assert.ok(Math.abs(buildingEffects(world, t).trade - (whole - world.buildings.market.effects.trade * 0.6)) < 1e-9);
  // In the ledger: a half-ruined brewery earns about half.
  const month = (cond) => {
    const x = quiet(createState(world, 2));
    x.settlements.ellander.cond = { brewery: cond };
    return run(x, 31).ledger.history.at(-1).income.crafts.brewery;
  };
  assert.ok(month(50) < month(100) - 3);
});

test('raids, sieges and sacks knock works down, and say why', () => {
  // Raiders on an undefended wild village.
  let s = createState(world, 3);
  s.settlements.anchor.prosperity = 5;
  s.settlements.anchor.unrest = 90;
  let hit = false;
  for (let i = 0; i < 60 && !hit; i++) {
    s.settlements.anchor.garrison = 0;
    s = run(s, 30);
    hit = Object.values(s.settlements.anchor.worn ?? {}).some((w) => /bandits|monsters|raiders|Scoia/.test(w.why));
  }
  assert.ok(hit, 'a raid left its mark on the works');
  // A siege brings the walls down, and they stay down.
  s = quiet(createState(world, 4));
  const rng = makeRng(4);
  startWar(s, world, rng, 'temeria', 'redania', 'claim');
  s.armies = [];
  const a = newArmy(s, world, 'temeria', 'drakenborg', 4000, {}, { order: 'siege', target: 'drakenborg' });
  a.starve = true;
  for (let d = 0; d < 30 && (d === 0 || a.siege); d++) {
    s.day += 1;
    siegeDay(s, world, rng, a, 'redania');
  }
  assert.ok(s.realms.redania.settlements.drakenborg.cond.walls < 90);
  // A sack burns the best of the town.
  const t = quiet(createState(world, 12));
  const war = startWar(t, world, makeRng(1), 'temeria', 'cidaris', 'claim');
  setOwner(t, world, 'cidaris_city', 'temeria');
  recordCapture(war, 'cidaris_city', 'cidaris', 'temeria', t.day);
  onCapture(t, world, makeRng(2), { side: 'temeria', soldiers: 3000 }, 'cidaris_city', 'cidaris', 'storm');
  const d = t.conquest.decisions.find((x) => x.kind === 'capture');
  resolveConquestDecision(t, world, d.id, d.options.indexOf('sack'));
  const rec = t.realms.cidaris.settlements.cidaris_city;
  const burned = rec.buildings.filter((b) => (rec.cond?.[b] ?? 100) < 30);
  assert.ok(burned.length >= 3, `${burned.length} burned`);
  assert.ok(burned.every((b) => /sack/.test(rec.worn[b].why)));
});

test('each repair costs and returns what it says', () => {
  let s = quiet(createState(world, 5));
  s.treasury = 20000;
  s.settlements.vizima.cond = { brewery: 40, market: 40 };
  const o = repairOptions(s, world, 'vizima', 'brewery');
  assert.ok(o.rebuild.coin > o.patch.coin && o.rebuild.days > o.patch.days && o.rebuild.hands > o.patch.hands);
  // Rebuild: paid at once, nothing yielded meanwhile, whole when done.
  const t0 = s.treasury;
  s = act(s, { type: 'repair', settlement: 'vizima', building: 'brewery', kind: 'rebuild' });
  assert.equal(s.treasury, t0 - o.rebuild.coin);
  assert.equal(worksFactor(s.settlements.vizima, 'brewery'), 0);
  s = run(s, o.rebuild.days + 1);
  assert.ok(worksFactor(s.settlements.vizima, 'brewery') >= 0.99);
  // Patch: cheaper, about half way back, marked as patched.
  const p = repairOptions(s, world, 'vizima', 'market').patch;
  const t1 = s.treasury;
  s = act(s, { type: 'repair', settlement: 'vizima', building: 'market', kind: 'patch' });
  assert.equal(s.treasury, t1 - p.coin);
  s = run(s, p.days + 1);
  assert.ok(Math.abs(s.settlements.vizima.cond.market - p.to) <= 1.5, `${s.settlements.vizima.cond.market} vs ${p.to}`);
  assert.ok(s.settlements.vizima.patched.market);
  // Leave it: nothing spent, unrest up, and remembered. (Asked one by one,
  // as before M28's standing order.)
  s = act(s, { type: 'repairOrder', mode: 'ask' });
  damageWorks(s, world, 'ellander', 'brewery', 50, 'Gutted by fire');
  const ask = s.works.decisions.find((x) => x.town === 'ellander' && x.works === 'brewery');
  assert.ok(ask, 'the damage raised a repair question');
  const unrest = s.settlements.ellander.unrest;
  const t2 = s.treasury;
  s = act(s, { type: 'worksDecision', id: ask.id, choice: 2 });
  assert.equal(s.treasury, t2);
  assert.ok(s.settlements.ellander.unrest > unrest && s.settlements.ellander.grudge > 0);
  assert.ok(!s.works.decisions.some((x) => x.id === ask.id));
  // A works already being mended cannot be ordered twice.
  s.settlements.ellander.cond.brewery = 30;
  s = act(s, { type: 'repair', settlement: 'ellander', building: 'brewery', kind: 'rebuild' });
  assert.match(canRepairWorks(s, world, 'ellander', 'brewery', 'patch').reason, /Already/);
});

test('a patch can give way again under the strain of winter', () => {
  const s = createState(world, 6);
  s.day += 300; // January
  s.settlements.vizima.cond = { market: 70 };
  s.settlements.vizima.patched = { market: true };
  const rng = makeRng(6);
  let failed = false;
  for (let i = 0; i < 80 && !failed; i++) {
    monthlyWorks(s, world, rng);
    failed = /gave way/.test(s.settlements.vizima.worn?.market?.why ?? '');
  }
  assert.ok(failed);
  assert.ok(s.settlements.vizima.cond.market < 55);
  assert.ok(!s.settlements.vizima.patched?.market);
});

test('works wear with the years, faster when the crown cannot pay its bills', () => {
  const s = createState(world, 7);
  const rng = makeRng(7);
  for (let m = 0; m < 12; m++) monthlyWorks(s, world, rng);
  const paid = s.settlements.windley.cond.fields;
  assert.ok(paid < 96 && paid > 85, `${paid}`);
  const t = createState(world, 7);
  t.unpaid = true;
  for (let m = 0; m < 12; m++) monthlyWorks(t, world, makeRng(7));
  assert.ok(t.settlements.windley.cond.fields < paid - 20);
  assert.match(t.settlements.windley.worn.fields.why, /want of upkeep/);
});

test('a version 16 save carries its buildings into spaces', () => {
  const s = createState(world, 8);
  // As M19 left it: built by the crown, half built, burned in a sack.
  for (const t of Object.values(s.settlements)) {
    t.buildings = [];
    delete t.cond;
    delete t.worn;
  }
  s.settlements.white_orchard.buildings = ['pasture', 'granary'];
  s.settlements.white_orchard.construction = { building: 'mill', daysLeft: 10, days: 40 };
  s.settlements.maribor.buildings = ['walls'];
  s.settlements.maribor.damaged = ['market'];
  for (const r of Object.values(s.realms)) for (const t of Object.values(r.settlements)) t.buildings = [];
  delete s.works;
  s.version = 16;
  const up = deserialize(JSON.stringify({ format: 'northern-wars-save', version: 16, state: s }), world);
  assert.equal(up.version, STATE_VERSION);
  const wo = up.settlements.white_orchard;
  // The pasture took the open ground in place of the fields; the mill is finished.
  assert.ok(wo.buildings.includes('pasture') && !wo.buildings.includes('fields'));
  assert.ok(wo.buildings.includes('mill') && wo.buildings.includes('granary'));
  assert.equal(wo.construction, null);
  // Maribor's burned market stands again, as a ruin to mend.
  assert.ok(up.settlements.maribor.buildings.includes('market'));
  assert.ok(up.settlements.maribor.cond.market < 30 && !up.settlements.maribor.damaged);
  // Every place has the rest of what its land gives, foreign ones too.
  assert.deepEqual(up.settlements.vizima.buildings, startingWorks(world, 'vizima').buildings);
  assert.ok(up.realms.cidaris.settlements.bremervoord.buildings.includes('harbour'));
  assert.ok(spacesOf(up, world, 'white_orchard').some((x) => x.works.some((w) => w.b === 'pasture')));
  assert.ok(Number.isFinite(run(up, 40).treasury));
  assert.equal(deserialize(serialize(up), world).version, STATE_VERSION);
});
