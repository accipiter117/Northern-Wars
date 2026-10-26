// Audiences with rulers in the browser (M17): opened from the rulers'
// portraits, a realm card, a request or a long press on a capital; the
// verdict follows the table as items go on; a counter-offer seals; back
// returns to the four buttons and closing returns to where we were. Keeps
// portrait and landscape screenshots of an audience, the deal table
// mid-negotiation and the web of pacts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../../tools/serve.js';
import { ROOT, nodeWorld } from '../helpers.js';
import { createState, step, serialize } from '../../src/sim/index.js';
import { makeTreaty, remember } from '../../src/sim/diplomacy.js';
import { relationTarget } from '../../src/sim/neighbours.js';

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

async function open(save, vp = { width: 390, height: 844 }) {
  const context = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  if (save) await page.addInitScript((text) => localStorage.setItem('northern-wars.save', text), save);
  await page.goto(`${base}?paused&nohints${save ? '' : '&fresh&seed=3'}`);
  await page.waitForFunction(() => window.northernWars && document.getElementById('loading').hidden);
  return { context, page, errors };
}

const verdict = (page) => page.locator('.verdict b').textContent();

test('an audience from the rulers\' portraits: verdicts live, a counter-offer sealed, back and close', async () => {
  const { context, page, errors } = await open(null);
  await page.click('[data-tab="diplomacy"]');
  await page.waitForSelector('.rulers-row [data-audience="kaedwen"]');
  await page.click('[data-audience="kaedwen"]');
  await page.waitForSelector('#audience:not([hidden]) .aud-big');
  assert.match(await page.textContent('#audience'), /King Henselt[\s\S]*Kaedwen[\s\S]*Ambitious/);
  assert.match(await page.textContent('.aud-mood'), /Wary|Cordial|Cold|Warm|Hostile/);
  assert.ok(await page.locator('.aud-big').count() === 4);
  assert.equal(await page.evaluate(() => window.northernWars.speed), 0, 'the realm waits during an audience');
  // The deal table: ask for iron, offer a little; the verdict follows.
  await page.click('[data-aud-panel="trade"]');
  await page.click('[data-aud-add="them"]');
  await page.locator('[data-aud-item]').filter({ hasText: 'Iron' }).first().click();
  const first = await verdict(page);
  assert.ok(['Close', 'They want more', 'Insulting'].includes(first), first);
  await page.click('[data-aud-add="them"]');
  await page.locator('[data-aud-item]').filter({ hasText: '1,000 crowns' }).first().click();
  assert.equal(await verdict(page), 'Insulting');
  await page.locator('.deal-remove').last().click();
  assert.equal(await verdict(page), first);
  // What would they accept? Then seal it: a deal runs.
  await page.click('[data-aud-counter]');
  assert.equal(await verdict(page), 'Acceptable');
  await page.click('[data-aud-sign]');
  assert.equal(await page.evaluate(() => window.northernWars.state.diplomacy.deals.filter((d) => d.with === 'kaedwen').length), 1);
  assert.match(await page.textContent('.aud-line'), /seals the deal/);
  // Back returns to the four buttons; back again ends the audience.
  await page.goBack();
  await page.waitForSelector('#audience .aud-big');
  await page.goBack();
  await page.waitForSelector('#audience', { state: 'hidden' });
  assert.equal(await page.evaluate(() => window.northernWars.ui.route), 'tab:diplomacy', 'back where we came from');
  // The close button from deep inside ends it in one step.
  await page.click('[data-audience="aedirn"]');
  await page.click('[data-aud-panel="alliance"]');
  await page.click('[data-aud-close]');
  await page.waitForSelector('#audience', { state: 'hidden' });
  assert.ok(await page.isVisible('#sheet'));
  assert.deepEqual(errors, []);
  await context.close();
});

test('treaties, gifts and terms in an audience; the web of pacts', async () => {
  let s = createState(world, 4);
  s = step(s, 20 * 30, world, { ambient: false });
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  s.treasury = 5000;
  if (!s.diplomacy.treaties.some((t) => t.a === 'temeria' || t.b === 'temeria')) makeTreaty(s, world, 'trade', 'temeria', 'aedirn');
  const { context, page, errors } = await open(serialize(s));
  await page.click('[data-tab="diplomacy"]');
  await page.click('[data-audience="mahakam"]');
  // A gift warms them, through the rules.
  await page.click('[data-aud-panel="diplomacy"]');
  const before = await page.evaluate(() => window.northernWars.state.treasury);
  await page.locator('[data-aud-panel], .chip').filter({ hasText: '250 crowns' }).first().click();
  assert.equal(await page.evaluate(() => window.northernWars.state.treasury), before - 250);
  assert.match(await page.textContent('.reasons'), /Gifts from Vizima/);
  // A treaty they accept as it stands is signed at a touch.
  await page.goBack();
  await page.click('[data-aud-panel="alliance"]');
  const na = page.locator('.build').filter({ hasText: 'Non-aggression pact' });
  if (/Acceptable/.test(await na.textContent())) {
    await na.click();
    assert.ok(await page.evaluate(() => window.northernWars.state.diplomacy.treaties.some((t) => t.kind === 'nonaggression' && (t.b === 'mahakam' || t.a === 'mahakam'))));
    assert.match(await page.textContent('.aud-bottom'), /In force[\s\S]*Non-aggression pact/);
  }
  // War: reasons, each with its cost, and terms before war.
  await page.goBack();
  await page.click('[data-aud-panel="war"]');
  assert.match(await page.textContent('.aud-bottom'), /Terms before war[\s\S]*A border claim[\s\S]*No reason given/);
  await page.click('[data-aud-close]');
  // The web of pacts across the North.
  await page.click('[data-sub="pacts"]');
  await page.waitForSelector('svg.web line');
  assert.ok(await page.locator('svg.web line').count() >= 1);
  assert.ok(await page.locator('svg.web image').count() >= 10);
  assert.deepEqual(errors, []);
  await context.close();
});

test('a ruler\'s request waits in the Court inbox and can be bargained over', async () => {
  const s = createState(world, 5);
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [{ id: 90, realm: 'aedirn', kind: 'deal', items: [{ kind: 'treaty', from: 'us', treaty: 'trade' }], day: s.day }];
  s.diplomacy.nextId = 91;
  const { context, page, errors } = await open(serialize(s));
  await page.click('[data-tab="court"]');
  await page.waitForSelector('[data-decision="request:90"]');
  assert.match(await page.textContent('[data-decision="request:90"]'), /Demavend III proposes a deal[\s\S]*proposes a trade pact/);
  await page.click('[data-decision="request:90"] [data-audience]');
  await page.waitForSelector('#audience .deal');
  assert.match(await page.textContent('.deal-list'), /Trade pact/);
  assert.equal(await verdict(page), 'Acceptable');
  await page.click('[data-aud-sign]');
  assert.ok(await page.evaluate(() => window.northernWars.state.diplomacy.treaties.some((t) => t.kind === 'trade')));
  assert.equal(await page.evaluate(() => window.northernWars.state.diplomacy.requests.length), 0, 'the request is answered by the deal');
  assert.deepEqual(errors, []);
  await context.close();
});

test('a long press on a ruler\'s capital offers an audience', async () => {
  const { context, page, errors } = await open(null);
  await page.evaluate(() => { const st = window.northernWars.world.byId.tretogor; window.northernWars.lookAt(st.x, st.y); });
  await page.waitForTimeout(300);
  const p = await page.evaluate(() => window.northernWars.screenOf('tretogor'));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] });
  await page.waitForTimeout(700);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForSelector('.quick-btn');
  await page.locator('.quick-btn').filter({ hasText: 'Audience' }).click();
  await page.waitForSelector('#audience:not([hidden])');
  assert.match(await page.textContent('#audience'), /Vizimir II/);
  assert.deepEqual(errors, []);
  await context.close();
});

// Screenshots for a human: an audience, the deal table mid-negotiation and
// the web of alliances, upright and held flat.
test('screenshots: an audience, the deal table and the web of pacts', async () => {
  let s = createState(world, 1);
  s = step(s, 12 * 365, world, { ambient: false });
  for (const k of ['envoys', 'petitions', 'demands', 'events', 'warDecisions']) s[k] = [];
  s.diplomacy.requests = [];
  // Calanthe warmed by a gift and a deal kept, so her mood has its reasons.
  remember(s, world, 'cintra', 'Gifts from Vizima', 16);
  remember(s, world, 'cintra', 'A deal honoured in full', 5);
  s.neighbours.cintra.relation = relationTarget(s, world, 'cintra');
  s.treasury = 6000;
  for (const vp of [{ name: 'portrait', width: 390, height: 844 }, { name: 'landscape', width: 844, height: 390 }]) {
    const { context, page, errors } = await open(serialize(s), vp);
    await page.click('[data-tab="diplomacy"]');
    await page.click('[data-sub="pacts"]');
    await page.waitForSelector('svg.web');
    if (vp.name === 'portrait') {
      // The sheet raised to its full height, to show the whole web.
      const h = await page.locator('#sheet-head').boundingBox();
      await page.mouse.move(h.x + 80, h.y + 20);
      await page.mouse.down();
      for (let i = 1; i <= 8; i++) await page.mouse.move(h.x + 80, h.y + 20 - (h.y * i) / 8);
      await page.mouse.up();
      await page.waitForTimeout(300);
      await page.evaluate(() => document.querySelector('#sheet-body')?.scrollTo(0, 0));
    }
    await page.screenshot({ path: join(OUT, `${vp.name}-pacts.png`) });
    await page.click('[data-sub="realms"]');
    await page.click('.rulers-row [data-audience="cintra"]');
    await page.waitForSelector('#audience .aud-big');
    await page.screenshot({ path: join(OUT, `${vp.name}-audience.png`) });
    await page.click('[data-aud-panel="trade"]');
    await page.click('[data-aud-add="them"]');
    await page.locator('[data-aud-item]').filter({ hasText: 'Horses' }).first().click();
    await page.click('[data-aud-add="us"]');
    await page.locator('[data-aud-item]').filter({ hasText: /^250 crowns$/ }).first().click();
    await page.evaluate(() => document.querySelector('.aud-bottom')?.scrollTo(0, 0));
    await page.screenshot({ path: join(OUT, `${vp.name}-deal-table.png`) });
    assert.deepEqual(errors, []);
    await context.close();
  }
});
