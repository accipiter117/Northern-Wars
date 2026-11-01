// The Nilfgaard clock in the browser (M30 D): a "From the south" line in the
// Steward's report, and an imperial army crossing the Yaruga at War with
// fresh regiments behind it. Portrait screenshots.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../tools/serve.js';
import { ROOT, nodeWorld } from '../helpers.js';
import { createState, step, serialize } from '../../src/sim/index.js';

const OUT = join(ROOT, 'test-results');
const server = await startServer(0);
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });
const world = await nodeWorld();

async function open(save) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((sv) => localStorage.setItem('northern-wars.save', sv), save);
  await page.goto(`${base}?paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  return { context, page, errors };
}

const quiet = (s) => {
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  if (s.dilemmas) s.dilemmas.open = [];
  return s;
};

test('the Steward reports from the south', async () => {
  const s = quiet(step(createState(world, 2), 40, world, { ambient: false }));
  const { context, page, errors } = await open(serialize(s));
  await page.click('[data-tab="court"]');
  await page.waitForSelector('[data-part="south"]');
  assert.match(await page.textContent('[data-part="south"]'), /From the south\. Imperial envoys/);
  await page.evaluate(() => document.querySelector('[data-part="south"]').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, 'portrait-from-the-south.png') });
  assert.deepEqual(errors, []);
  await context.close();
});

test('an imperial army crosses the Yaruga, fresh regiments behind it', async () => {
  // Run a reign until the Empire's army is on the march into Cintra.
  let s = createState(world, 1);
  let army = null;
  for (let m = 0; m < 30 && !army; m++) {
    s = step(s, 30, world, { ambient: false });
    army = (s.armies ?? []).find((a) => a.side === 'nilfgaard' && world.byId[a.at] && world.realmOf[a.target ?? ''] === 'cintra');
  }
  assert.ok(army, 'an imperial army marches on Cintra');
  assert.equal(s.nilfgaard.stage, 'war');
  assert.ok((s.empire?.arrived ?? 0) > 0, 'regiments have come up from the south');
  quiet(s);
  // Spies in both courts, so the crown sees the armies on the map.
  s.spies.nilfgaard = s.day + 200;
  s.spies.cintra = s.day + 200;
  const { context, page, errors } = await open(serialize(s));
  const at = world.byId[army.at];
  await page.evaluate(([x, y]) => { const nw = window.northernWars; nw.zoomTo(1.1); nw.lookAt(x, y - 60); }, [at.x, at.y]);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: join(OUT, 'portrait-imperial-army.png') });
  assert.deepEqual(errors, []);
  await context.close();
});

test.after(async () => {
  await browser.close();
  server.close();
});
