// Conquest in the browser (M19): the capture choice waits at court with the
// game paused; an occupied town can be stripped but not built in; a
// conquered town shows how far it has taken to the crown; a rising asks to
// be crushed or treated with. Keeps portrait and landscape screenshots of
// the capture choice, a revolt, a conquered town's card, and the map before
// and after an annexation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../tools/serve.js';
import { ROOT, nodeWorld } from '../helpers.js';
import { createState, serialize } from '../../src/sim/index.js';
import { startWar, applyPeace } from '../../src/sim/war.js';
import { setOwner, recordCapture } from '../../src/sim/conflict.js';
import { onCapture, monthlyConquest } from '../../src/sim/conquest.js';
import { syncWorld } from '../../src/sim/lands.js';
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

async function open(save, vp = VIEWS[0]) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((text) => localStorage.setItem('northern-wars.save', text), save);
  await page.goto(`${base}?paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  return { context, page, errors };
}

// A card opened as a tap on a row would open it.
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

// Temeria at war with Cidaris, its army in Bremervoord, the crown asked
// what to do with the town.
function taken() {
  const s = quiet(createState(world, 4));
  const rng = makeRng(4);
  const war = startWar(s, world, rng, 'temeria', 'cidaris', 'claim');
  s.armies = s.armies.filter((a) => a.side === 'temeria');
  setOwner(s, world, 'bremervoord', 'temeria');
  recordCapture(war, 'bremervoord', 'cidaris', 'temeria', s.day);
  onCapture(s, world, rng, { side: 'temeria', soldiers: 3000 }, 'bremervoord', 'cidaris', 'storm');
  return { s, war };
}

async function frame(page, id, zoom = 2.2) {
  await page.evaluate(([x, y]) => window.northernWars.lookAt(x, y), [world.byId[id].x, world.byId[id].y]);
  await page.waitForTimeout(400);
}

test('the capture choice waits at court; an occupied town can be stripped, not built in', async () => {
  const { s } = taken();
  const save = serialize(s);
  syncWorld(world, createState(world, 1));
  for (const vp of VIEWS) {
    const { context, page, errors } = await open(save, vp);
    await page.click('[data-tab="court"]');
    await page.waitForSelector('[data-decision^="conquestDecision:"]');
    const card = page.locator('[data-decision^="conquestDecision:"]').first();
    assert.match(await card.textContent(), /What of Bremervoord\?[\s\S]*Spare it[\s\S]*Sack it[\s\S]*Drive out/);
    await card.evaluate((el) => {
      el.scrollIntoView({ block: 'start' });
      const body = el.closest('#sheet-body');
      if (body) body.scrollTop -= 90;
    });
    await page.screenshot({ path: join(OUT, `${vp.name}-capture-choice.png`) });
    if (vp.name === 'portrait') {
      // The occupied town's card offers requisition, and no building.
      await go(page, 'foreign:bremervoord');
      await page.waitForSelector('[data-part="occupied"]');
      assert.match(await page.textContent('[data-part="occupied"]'), /Requisition grain and coin/);
      await page.click('[data-tab="court"]');
      await page.locator('[data-decision^="conquestDecision:"] [data-choice="0"]').first().click();
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => window.northernWars.state.conquest.decisions.length), 0);
      assert.equal(await page.evaluate(() => window.northernWars.state.realms.cidaris.settlements.bremervoord.treated), 'spared');
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test('a conquered town: its integration on its card; a rising waits at court; the map before and after', async () => {
  const { s, war } = taken();
  s.conquest.decisions = [];
  const before = serialize(s);
  applyPeace(s, world, war, { towns: 'keep' });
  s.conquest.decisions = [];
  const t = s.settlements.bremervoord;
  t.integration = 22;
  const calm = serialize(s);
  t.integration = 5;
  t.unrest = 92;
  t.garrison = 5;
  const rng = makeRng(7);
  for (let m = 0; m < 60 && !s.conquest.revolts.length; m++) monthlyConquest(s, world, rng);
  assert.ok(s.conquest.revolts.length, 'it rose');
  s.conquest.decisions = s.conquest.decisions.filter((d) => d.kind === 'revolt');
  const risen = serialize(s);
  syncWorld(world, createState(world, 1));
  for (const vp of VIEWS) {
    // The map while Bremervoord is only occupied, then once it is ours.
    {
      const { context, page, errors } = await open(before, vp);
      await frame(page, 'bremervoord');
      await page.screenshot({ path: join(OUT, `${vp.name}-map-occupied.png`) });
      assert.deepEqual(errors, []);
      await context.close();
    }
    {
      const { context, page, errors } = await open(calm, vp);
      await frame(page, 'bremervoord');
      await page.screenshot({ path: join(OUT, `${vp.name}-map-annexed.png`) });
      await go(page, 'town:bremervoord');
      await page.waitForSelector('[data-part="integration"]');
      assert.match(await page.textContent('[data-part="integration"]'), /Integration: Cidarians/);
      await page.evaluate(() => document.querySelector('[data-part="integration"]').scrollIntoView({ block: 'start' }));
      await page.screenshot({ path: join(OUT, `${vp.name}-conquered-town.png`) });
      assert.deepEqual(errors, []);
      await context.close();
    }
    {
      const { context, page, errors } = await open(risen, vp);
      await page.click('[data-tab="court"]');
      await page.waitForSelector('[data-decision^="conquestDecision:"]');
      assert.match(await page.textContent('[data-decision^="conquestDecision:"]'), /rises against the crown[\s\S]*Crush them[\s\S]*Treat with them/);
      await page.screenshot({ path: join(OUT, `${vp.name}-revolt.png`) });
      if (vp.name === 'portrait') {
        await page.locator('[data-decision^="conquestDecision:"] [data-choice="1"]').first().click();
        await page.waitForTimeout(300);
        assert.equal(await page.evaluate(() => window.northernWars.state.conquest.revolts.length), 0);
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
  }
});
