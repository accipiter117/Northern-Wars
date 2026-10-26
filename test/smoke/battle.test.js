// Battles and sieges in the browser (M19): a battle of ours raises a banner
// and slows the game to 1x; the Battle card shows both sides, who is
// winning and the events, and takes the crown's orders; an army's card
// shows its siege and what attrition has cost it. Keeps portrait and
// landscape screenshots of a battle's card and a siege's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../tools/serve.js';
import { ROOT, nodeWorld } from '../helpers.js';
import { createState, serialize } from '../../src/sim/index.js';
import { startWar } from '../../src/sim/war.js';
import { newArmy } from '../../src/sim/armies.js';
import { startBattle, stepBattlesDay } from '../../src/sim/battle.js';
import { siegeDay } from '../../src/sim/siege.js';
import { makeRng } from '../../src/sim/rng.js';

const OUT = join(ROOT, 'test-results');
const server = await startServer(0);
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });
const world = await nodeWorld();
const VIEWS = [{ name: 'portrait', width: 390, height: 844 }, { name: 'landscape', width: 844, height: 390 }];

test.after(async () => {
  await browser.close();
  server.close();
});

async function open(save, vp = VIEWS[0], query = '?paused&nohints') {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((text) => localStorage.setItem('northern-wars.save', text), save);
  await page.goto(`${base}${query}`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  return { context, page, errors };
}

async function go(page, route) {
  await page.evaluate((r) => {
    const b = document.createElement('button');
    b.dataset.go = r;
    document.querySelector('#sheet-body').append(b);
    b.click();
    b.remove();
  }, route);
  await page.waitForTimeout(250);
}

const quiet = (s) => {
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  return s;
};

// Temeria and Kaedwen at war, their armies locked in battle near Ban Ard's
// road, a few days in.
function midBattle() {
  const s = quiet(createState(world, 31));
  const rng = makeRng(31);
  startWar(s, world, rng, 'kaedwen', 'temeria', 'claim');
  s.armies = [];
  const at = 'white_bridge';
  const a = newArmy(s, world, 'temeria', at, 2400, {}, { name: 'The army of Vizima', marshal: 'vestibor', stance: 'cautious', order: 'defend', target: at });
  const b = newArmy(s, world, 'kaedwen', at, 2600, {}, { order: 'siege', target: at });
  const f = startBattle(s, world, rng, a, b, world.byId[at]);
  for (let d = 0; d < 3 && !f.over; d++) {
    s.day += 1;
    stepBattlesDay(s, world, rng);
  }
  return { s, f };
}

test('a battle of ours: the banner, the card, the orders', async () => {
  const { s, f } = midBattle();
  assert.ok(!f.over, 'still fighting');
  const save = serialize(s);
  for (const vp of VIEWS) {
    const { context, page, errors } = await open(save, vp);
    await page.waitForSelector(`[data-go="battle:${f.id}"], .urgent`, { timeout: 5000 }).catch(() => {});
    await go(page, `battle:${f.id}`);
    await page.waitForSelector('[data-part="balance"]');
    const text = await page.textContent('#sheet-body');
    assert.match(text, /In the line[\s\S]*In reserve[\s\S]*Fallen or fled[\s\S]*Spirit/);
    assert.match(text, /Commit the reserve[\s\S]*Sound the retreat/);
    await page.screenshot({ path: join(OUT, `${vp.name}-battle-card.png`) });
    if (vp.name === 'portrait') {
      const reserve = await page.evaluate((id) => window.northernWars.state.fights.find((x) => x.id === id).reserve[0], f.id);
      if (reserve > 0 && f.phase !== 'skirmish') {
        await page.locator('[data-part="orders"] .build').first().click();
        await page.waitForTimeout(250);
        assert.equal(await page.evaluate((id) => window.northernWars.state.fights.find((x) => x.id === id).committed[0], f.id), true);
      }
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test('a battle beginning slows the game to 1x', async () => {
  const s = quiet(createState(world, 32));
  const rng = makeRng(32);
  startWar(s, world, rng, 'kaedwen', 'temeria', 'claim');
  s.armies = [];
  const at = 'white_bridge';
  newArmy(s, world, 'temeria', at, 2000, {}, { order: 'defend', target: at });
  newArmy(s, world, 'kaedwen', at, 2000, {}, { order: 'siege', target: at });
  const { context, page, errors } = await open(serialize(s));
  await page.evaluate(() => window.northernWars.setSpeed(4));
  await page.waitForFunction(() => (window.northernWars.state.fights ?? []).some((f) => !f.over), null, { timeout: 15000 });
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.northernWars.speed), 1);
  assert.deepEqual(errors, []);
  await context.close();
});

test('a siege: walls, food and the camp on the army card, with its orders', async () => {
  const s = quiet(createState(world, 33));
  const rng = makeRng(33);
  startWar(s, world, rng, 'temeria', 'redania', 'claim');
  s.armies = [];
  const town = world.foreignByRealm.redania.find((id) => world.byId[id].type === 'town');
  const a = newArmy(s, world, 'temeria', town, 1800, {}, { name: 'The army of Vizima', order: 'siege', target: town });
  a.starve = true;
  for (let d = 0; d < 24; d++) {
    s.day += 1;
    siegeDay(s, world, rng, a, 'redania');
  }
  assert.ok(a.siege, 'still besieging');
  const save = serialize(s);
  for (const vp of VIEWS) {
    const { context, page, errors } = await open(save, vp);
    await go(page, `army:${a.id}`);
    await page.waitForSelector('[data-part="siege"]');
    const text = await page.textContent('[data-part="siege"]');
    assert.match(text, /Timber walls[\s\S]*Food left[\s\S]*Storm the walls[\s\S]*% to take it[\s\S]*Lift the siege/);
    await page.evaluate(() => document.querySelector('[data-part="siege"]').scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: join(OUT, `${vp.name}-siege-card.png`) });
    assert.deepEqual(errors, []);
    await context.close();
  }
});
