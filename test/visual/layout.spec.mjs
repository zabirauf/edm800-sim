// Responsive-layout and touch checks, run on every device project (no stored images needed).
import { test, expect } from './fixtures.mjs';

const TABS = ['cockpit', 'scenarios', 'lessons', 'diagnose', 'faults', 'instructor', 'menus', 'install', 'reference'];

test('the instrument face is drawn (dark) before the EDM is first powered', async ({ trainer, page }) => {
  expect(await page.locator('#face rect.bar').count()).toBeGreaterThan(40);
  await expect(page.locator('#face')).toBeVisible();
});

test('no tab makes the page scroll sideways', async ({ trainer, page }) => {
  await trainer.setup('cruise');
  for (const tab of TABS) {
    await trainer.tab(tab);
    const { scrollW, width } = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, width: innerWidth }));
    expect(scrollW, `tab ${tab}: page width ${scrollW} > viewport ${width}`).toBeLessThanOrEqual(width + 1);
  }
});

test('the instrument stays in view while the mixture lever is operated', async ({ trainer, page }) => {
  await trainer.setup('cruise');
  await page.locator('#in-mixture').evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await trainer.run(100);
  const r = await page.evaluate(() => {
    const vis = (el) => {
      const b = el.getBoundingClientRect();
      const h = Math.max(0, Math.min(b.bottom, innerHeight) - Math.max(b.top, 0));
      return h / b.height;
    };
    return { face: vis(document.querySelector('#face')), mixture: vis(document.querySelector('#in-mixture')), faceH: document.querySelector('#face').getBoundingClientRect().height };
  });
  expect(r.mixture, 'mixture lever on screen').toBe(1);
  expect(r.face, 'face on screen with the mixture lever').toBeGreaterThan(0.9);
  expect(r.faceH, 'face large enough to read').toBeGreaterThanOrEqual(220);
});

test('STEP and LF are large, unobstructed touch targets', async ({ trainer, page }) => {
  await trainer.setup('cruise');
  for (const id of ['#btn-step', '#btn-lf']) {
    const box = await page.locator(id).boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(48);
    expect(box.height).toBeGreaterThanOrEqual(48);
    const hit = await page.evaluate(([sel, x, y]) => document.querySelector(sel).contains(document.elementFromPoint(x, y)), [id, box.x + box.width / 2, box.y + box.height / 2]);
    expect(hit, `${id} is the element under its own centre`).toBe(true);
  }
});

test('touch screens: text fields ≥16 px (no iOS zoom-on-focus), buttons ≥36 px, no long-press callout on hold buttons', async ({ trainer, page }) => {
  const coarse = await page.evaluate(() => matchMedia('(pointer: coarse), (hover: none)').matches);
  test.skip(!coarse, 'not a touch screen (or the emulator does not report one)');
  const r = await page.evaluate(() => {
    const shown = (e) => e.offsetParent !== null;
    const fields = [...document.querySelectorAll('input:not([type=range]):not([type=checkbox]), select')].filter(shown);
    const small = fields.filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).map((e) => e.id);
    const btns = [...document.querySelectorAll('#tab-cockpit button, .gesture-helpers button')].filter(shown);
    const short = btns.filter((b) => b.getBoundingClientRect().height < 36).map((b) => b.textContent.trim());
    const callout = ['#btn-step', '#btn-lf', '#btn-start', '#btn-lean', '#btn-enrich'].filter((s) => getComputedStyle(document.querySelector(s)).webkitTouchCallout === 'default');
    return { small, short, callout };
  });
  expect(r.small, 'text fields under 16 px').toEqual([]);
  expect(r.short, 'buttons under 36 px tall').toEqual([]);
  expect(r.callout, 'hold buttons that would show the iOS callout').toEqual([]);
});

test('a finger tap on LF arms LeanFind; holding Lean leans the engine to the first peak', async ({ trainer, page }) => {
  await trainer.setup('cruise');
  await trainer.press('#btn-lf');
  expect((await trainer.state()).state).toBe('LEANFIND');
  const gph0 = await page.evaluate(() => window.edmTrainer.sim.engine.gph);
  await page.locator('#btn-lean').dispatchEvent('pointerdown', { pointerId: 3 });
  let phase = '';
  for (let s = 0; s < 120 && phase !== 'LEANEST'; s++) {
    await trainer.run(1000);
    phase = (await trainer.state()).leanfind?.phase;
  }
  await page.locator('#btn-lean').dispatchEvent('pointerup', { pointerId: 3 });
  expect(phase).toBe('LEANEST');
  expect(await page.evaluate(() => window.edmTrainer.sim.engine.gph)).toBeLessThan(gph0);
});

test('two fingers on STEP and LF for 5 s open pilot programming (multi-touch)', async ({ trainer, page, browserName, isMobile }) => {
  test.skip(browserName !== 'chromium' || !isMobile, 'raw multi-touch input needs the Chromium DevTools protocol');
  await trainer.setup('cruise');
  const cdp = await page.context().newCDPSession(page);
  const centre = async (sel) => {
    const b = await page.locator(sel).boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const step = await centre('#btn-step');
  const lf = await centre('#btn-lf');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...step, id: 1 }, { ...lf, id: 2 }] });
  await trainer.run(5300);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await trainer.run(200);
  expect((await trainer.state()).state).toBe('PROGRAM');
});

test('Explain: numbered parts on the face, panel beside/below it, face and STEP/LF uncovered, live updates on STEP', async ({ trainer, page }) => {
  await trainer.setup('cruise');
  await trainer.press('#btn-explain');
  await trainer.run(300);
  expect(await page.locator('#face .ex-badge').count()).toBe(8);
  expect(await page.evaluate(() => window.edmTrainer.paused), 'snapshot pauses the simulation').toBe(true);
  const geo = await page.evaluate(() => {
    const ex = document.getElementById('explain').getBoundingClientRect();
    const covered = (sel) => {
      const b = document.querySelector(sel).getBoundingClientRect();
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return !!hit?.closest('#explain');
    };
    const face = document.querySelector('#face').getBoundingClientRect();
    return {
      ex: { w: ex.width, h: ex.height, top: ex.top, bottom: ex.bottom }, vw: innerWidth, vh: innerHeight,
      faceVisible: face.top >= -1 && face.bottom <= innerHeight + 1,
      faceCovered: covered('#face'), stepCovered: covered('#btn-step'), lfCovered: covered('#btn-lf'),
      scrollW: document.documentElement.scrollWidth,
    };
  });
  expect(geo.scrollW).toBeLessThanOrEqual(geo.vw + 1);
  expect(geo.faceVisible, 'face fully on screen').toBe(true);
  expect(geo.faceCovered, 'face not under the panel').toBe(false);
  expect(geo.stepCovered || geo.lfCovered, 'STEP/LF not under the panel').toBe(false);
  expect(geo.ex.w).toBeGreaterThanOrEqual(Math.min(300, geo.vw));
  expect(geo.ex.h, 'panel tall enough to read').toBeGreaterThanOrEqual(150);
  expect(geo.ex.bottom).toBeLessThanOrEqual(geo.vh + 1);

  await trainer.press('#face .ex-hot[data-key="col2"] >> nth=1');
  await expect(page.locator('.ex-col.sel')).toHaveAttribute('data-key', 'col2');
  await trainer.press('#face .ex-hot[data-key="digital"]');
  await expect(page.locator('.ex-part.sel')).toHaveAttribute('data-key', 'digital');

  await trainer.press('#btn-step'); // while paused: AUTO → MANUAL, the panel follows
  await expect(page.locator('.ex-headline')).toContainText('Manual mode');

  await trainer.press('#ex-close');
  expect(await page.evaluate(() => window.edmTrainer.paused), 'closing resumes').toBe(false);
  expect(await page.locator('#face .ex-layer').count()).toBe(0);
});

test('scenario step card: shown on other tabs, follows the steps, never covers the instrument, Open returns', async ({ trainer, page }) => {
  await trainer.tab('scenarios');
  await trainer.press('[data-scn="runup"]');
  await trainer.run(300);
  await expect(page.locator('#coach'), 'hidden on the scenario tab itself').toBeHidden();
  await trainer.tab('cockpit');
  await expect(page.locator('#coach')).toBeVisible();
  await expect(page.locator('.coach-progress')).toHaveText('step 1 of 7');
  await expect(page.locator('.coach-step')).toContainText('Hold LF 3 s');
  const geo = await page.evaluate(() => {
    const coveredBy = (sel) => {
      const b = document.querySelector(sel).getBoundingClientRect();
      return !!document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)?.closest('#coach');
    };
    return { face: coveredBy('#face'), step: coveredBy('#btn-step'), lf: coveredBy('#btn-lf'), scrollW: document.documentElement.scrollWidth, vw: innerWidth };
  });
  expect(geo.face || geo.step || geo.lf, 'card covers the face or STEP/LF').toBe(false);
  expect(geo.scrollW).toBeLessThanOrEqual(geo.vw + 1);

  await trainer.hold('#btn-lf', 3300); // step 1: Normalize view
  await expect(page.locator('.coach-progress')).toHaveText('step 2 of 7');
  await expect(page.locator('.coach-step')).toContainText('1800 RPM');

  await trainer.press('#coach .coach-toggle');
  await expect(page.locator('#coach .coach-body')).toBeHidden();
  await trainer.press('#coach .coach-toggle');
  await trainer.press('#coach .coach-open');
  await expect(page.locator('#tabs button.active')).toHaveAttribute('data-tab', 'scenarios');
  await expect(page.locator('#coach')).toBeHidden();
});

test('lesson step card: an EDM lesson shows its current step on other tabs', async ({ trainer, page }) => {
  await trainer.tab('lessons');
  await trainer.press('[data-lesson] >> nth=0');
  await trainer.run(300);
  await trainer.tab('reference');
  await expect(page.locator('#coach')).toBeVisible();
  await expect(page.locator('.coach-kind')).toHaveText('Lesson');
  await expect(page.locator('.coach-progress')).toContainText(/step 1 of \d+|complete/);
});

test('state machine view: maps the machine, highlights the live state, zooms without rebuilding, follows STEP', async ({ trainer, page }) => {
  await trainer.setup('cruise');
  await trainer.tab('statemap');
  await trainer.run(200); // exploration runs in animation-frame slices
  await expect(page.locator('.sm-progress')).toBeHidden();
  expect(await page.locator('.sm-node').count()).toBe(76);
  await expect(page.locator('.sm-node.cur')).toHaveAttribute('data-id', 'AUTO');
  await expect(page.locator('.sm-group.top.cur')).toHaveAttribute('data-group', 'AUTO');
  const count = () => page.evaluate(() => document.querySelectorAll('#tab-statemap *').length);
  const n0 = await count();
  expect(await page.locator('.sm-svg').getAttribute('class')).toContain('sm-lod0');
  for (let i = 0; i < 10 && (await page.locator('.sm-svg').getAttribute('class')).includes('sm-lod0'); i++) {
    await trainer.press('.sm-zoom-in');
    await trainer.run(100);
  }
  expect(await page.locator('.sm-svg').getAttribute('class')).not.toContain('sm-lod0');
  expect(await count(), 'zooming does not add or remove elements').toBe(n0);
  await trainer.press('#btn-step'); // AUTO → MANUAL: the map follows
  await trainer.run(300);
  await expect(page.locator('.sm-node.cur')).toHaveAttribute('data-id', 'MANUAL');
  await trainer.press('.sm-now');
  await trainer.run(400);
  const geo = await page.evaluate(() => {
    const vp = document.querySelector('.sm-viewport').getBoundingClientRect();
    const n = document.querySelector('.sm-node.cur rect').getBoundingClientRect();
    return { inView: n.left >= vp.left - 1 && n.right <= vp.right + 1 && n.top >= vp.top - 1 && n.bottom <= vp.bottom + 1, scrollW: document.documentElement.scrollWidth, vw: innerWidth };
  });
  expect(geo.inView, '"Now" brings the current state into view').toBe(true);
  expect(geo.scrollW).toBeLessThanOrEqual(geo.vw + 1);
  await page.locator('.sm-node.cur rect').click();
  await expect(page.locator('.sm-details')).toBeVisible();
  await expect(page.locator('.sm-details')).toContainText('the EDM is here');
});
