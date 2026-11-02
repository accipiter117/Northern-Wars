// The opening (M33 D): the Dawn's first year spares the country round the
// capital new camps and lairs, the realm's overview says what to do next,
// and an older reign moves straight to the Road to War.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../../src/sim/index.js';
import { monthlyThreatsSpawn } from '../../src/sim/threats.js';
import { roadBoxes } from '../../src/sim/road.js';
import { makeRng } from '../../src/sim/rng.js';
import { nodeWorld } from '../helpers.js';

const world = await nodeWorld();
const near = (id) => {
  const v = world.byId.vizima;
  return Math.hypot(world.byId[id].x - v.x, world.byId[id].y - v.y) <= world.dawn.opening.reach;
};

function rough(s) {
  for (const t of Object.values(s.settlements)) { t.prosperity = 5; t.unrest = 90; t.garrison = 0; }
  s.threats.list = s.threats.list.filter((t) => t.quest);
  return s;
}
const spawnedNear = (s) => {
  for (let i = 0; i < 24; i++) monthlyThreatsSpawn(s, world, makeRng(i));
  return s.threats.list.filter((t) => !t.quest && !t.abroad && near(t.near)).length;
};

test('in the Dawn\'s first year no new camp or lair springs up near Vizima', () => {
  const early = rough(createState(world, 1));
  assert.equal(spawnedNear(early), 0);
  // A year on, the country round the capital breeds its own again.
  const later = rough(createState(world, 1));
  later.day += world.dawn.opening.days + 1;
  assert.ok(spawnedNear(later) > 0);
  // A plain reign was never sheltered.
  assert.ok(spawnedNear(rough(createState(world, 1, { dawn: false }))) > 0);
});

test('an older reign moves straight to the Road to War: only Emhyr\'s path and the pretext wait', () => {
  const s = createState(world, 1, { dawn: false });
  s.spycraft.nets.nilfgaard.cintra = 20;
  s.day += 400;
  const old = JSON.parse(serialize(s));
  old.version = 37;
  old.state.version = 37;
  for (const k of ['dawn', 'paths', 'road']) delete old.state[k];
  const up = deserialize(JSON.stringify(old), world);
  const ticked = Object.fromEntries(roadBoxes(up, world).map((b) => [b.id, b.done]));
  assert.deepEqual(ticked, { foltest: true, emhyr: false, agents: true, pretext: false, year: true });
});
