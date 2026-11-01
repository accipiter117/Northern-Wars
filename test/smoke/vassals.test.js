// Vassal kings in the browser (M29 C): a vassal king's card, the Judgement
// card for a rebel vassal king, and vassals' lands tinted on the map.
// Portrait screenshots.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../tools/serve.js';
import { ROOT, nodeWorld } from '../helpers.js';
import { createState, step, serialize } from '../../src/sim/index.js';
import { makeVassal } from '../../src/sim/suzerainty.js';

const OUT = join(ROOT, 'test-results');
const server = await startServer(0);
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });
const world = await nodeWorld();

test.after(async () => {
  await browser.close();
  server.close();
});

async function open(s) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((sv) => localStorage.setItem('northern-wars.save', sv), serialize(s));
  await page.goto(`${base}?paused&nohints`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  return { context, page, errors };
}

function realm() {
  const s = step(createState(world, 3), 30, world, { ambient: false });
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  if (s.dilemmas) s.dilemmas.open = [];
  s.treasury = 20000;
  makeVassal(s, world, 'brugge', 'temeria', 'protection', 62);
  makeVassal(s, world, 'sodden', 'temeria', 'pressure', 30);
  s.realms.brugge.vassal.want = { kind: 'honours', since: s.day };
  return s;
}

test('a vassal king\'s card: what he gives, what he wants, the crown\'s hand', async () => {
  const { context, page, errors } = await open(realm());
  await page.click('[data-tab="diplomacy"]');
  await page.click('[data-part="vassals"] [data-realm="brugge"]');
  await page.waitForSelector('[data-give="tribute"]');
  assert.match(await page.textContent('[data-give="tribute"]'), /Tribute about \d+ crowns a month|Pays no tribute/);
  assert.match(await page.textContent('[data-give="retinue"]'), /men when called|no men/);
  assert.match(await page.textContent('[data-part="wants"]'), /Wants honours/);
  assert.equal(await page.locator('[data-vassal-action]').count(), 6);
  await page.screenshot({ path: join(OUT, 'portrait-vassal-card.png') });
  await page.click('[data-vassal-action="honours"]');
  await page.waitForFunction(() => window.northernWars.state.realms.brugge.vassal.want === null);
  assert.deepEqual(errors, []);
  await context.close();
});

test('the Judgement card for a rebel vassal king, four choices with their effects', async () => {
  const s = realm();
  s.vassalJudgements = [{ id: 1, realm: 'sodden', day: s.day }];
  s.nextVassalJudgementId = 1;
  s.realms.sodden.vassal.captive = true;
  const { context, page, errors } = await open(s);
  await page.click('[data-tab="court"]');
  await page.click('[data-sub="inbox"]');
  const card = page.locator('[data-decision="vassalJudgement:1"]');
  await card.waitFor();
  assert.equal(await card.locator('.choices button').count(), 4);
  assert.match(await card.textContent(), /Depose him[\s\S]*Annex Sodden[\s\S]*Pardon him[\s\S]*Execute him[\s\S]*trust in Temeria falls/);
  await card.evaluate((el) => { el.scrollIntoView({ block: 'start' }); let p = el.parentElement; while (p && p.scrollHeight <= p.clientHeight) p = p.parentElement; p?.scrollBy(0, -70); });
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(OUT, 'portrait-vassal-judgement.png') });
  await card.locator('.choices button').first().click();
  await page.waitForFunction(() => !(window.northernWars.state.vassalJudgements ?? []).length);
  assert.equal(await page.evaluate(() => window.northernWars.state.realms.sodden.suzerain), 'temeria');
  // Vassals' lands tinted on the map.
  await page.click('#sheet-close').catch(() => {});
  await page.evaluate(() => { const nw = window.northernWars; const b = nw.world.byId[nw.world.realms.realms.brugge.capital]; nw.zoomTo(1.2); nw.lookAt(b.x, b.y); });
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUT, 'portrait-vassal-map.png') });
  assert.deepEqual(errors, []);
  await context.close();
});
