// Screenshot comparisons of the main instrument states (every device) and of each tab (three representative
// devices). Baselines live in test/visual/__screenshots__/<device>/. Re-record with `npm run test:visual:update`.
import { test, expect } from './fixtures.mjs';

const shot = (page, name, opts = {}) => expect(page).toHaveScreenshot(`${name}.png`, opts);

test('01 cold and dark', async ({ trainer, page }) => {
  await shot(page, '01-cold-dark');
});

test('02 power-on self-test', async ({ trainer, page }) => {
  await trainer.masterOn();
  await trainer.run(600);
  await trainer.toTop();
  expect((await trainer.state()).state).toBe('SELFTEST');
  await shot(page, '02-self-test');
});

test('03 cruise, automatic scan', async ({ trainer, page }) => {
  await trainer.setup('cruise');
  await trainer.toTop();
  await shot(page, '03-cruise');
  await page.locator('#in-mixture').evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await trainer.run(100);
  await shot(page, '04-cruise-levers');
});

test('05 LeanFind at the first peak', async ({ trainer, page }) => {
  await trainer.setup('cruise');
  await trainer.press('#btn-lf');
  await page.locator('#btn-lean').dispatchEvent('pointerdown', { pointerId: 3 });
  for (let s = 0; s < 120 && (await trainer.state()).leanfind?.phase !== 'LEANEST'; s++) await trainer.run(1000);
  await page.locator('#btn-lean').dispatchEvent('pointerup', { pointerId: 3 });
  await trainer.run(300);
  await trainer.toTop();
  await shot(page, '05-leanfind-leanest');
});

test('06 pilot programming menu', async ({ trainer, page }) => {
  await trainer.setup('cruise');
  await trainer.press('[data-gesture="holdBoth"]');
  await trainer.run(5600);
  expect((await trainer.state()).state).toBe('PROGRAM');
  await trainer.toTop();
  await shot(page, '06-program');
});

test('07 alarm: over-voltage scenario', async ({ trainer, page }) => {
  await trainer.tab('scenarios');
  await trainer.press('[data-scn="overvoltage"]');
  await trainer.run(500);
  await trainer.tab('cockpit');
  await trainer.press('[data-ff="120"]');
  await trainer.run(500);
  expect((await trainer.state()).alarm).toBeTruthy();
  await expect(page.locator('#alarm-light')).toHaveClass(/on/);
  await trainer.toTop();
  await shot(page, '07-alarm');
});

test('08 Explain panel (cruise, column 3 selected)', async ({ trainer, page }) => {
  await trainer.setup('cruise');
  await trainer.press('#btn-explain');
  await trainer.run(300);
  await trainer.press('#face .ex-hot[data-key="col2"] >> nth=1');
  await trainer.run(1000);
  await shot(page, '08-explain');
});

test('09 scenario step card on the cockpit tab', async ({ trainer, page }) => {
  await trainer.tab('scenarios');
  await trainer.press('[data-scn="runup"]');
  await trainer.run(300);
  await trainer.tab('cockpit');
  await trainer.hold('#btn-lf', 3300);
  await trainer.run(2000); // let the "step done" flash finish
  await trainer.toTop();
  await shot(page, '09-step-card');
});

test('10 state machine overview', async ({ trainer, page }) => {
  await trainer.setup('cruise');
  await trainer.tab('statemap');
  await trainer.run(500);
  await trainer.toTop();
  await shot(page, '10-statemap-overview');
});

test('11 state machine detail with a route', async ({ trainer, page }, info) => {
  test.skip(!['desktop', 'iphone-15', 'iphone-fold-inner'].includes(info.project.name), 'detail compared on three devices');
  await trainer.setup('cruise');
  await trainer.tab('statemap');
  await trainer.run(500);
  await trainer.press('.sm-now');
  await trainer.run(500);
  await page.locator('.sm-node.cur rect').click(); // the current state is centred by "Now"
  await trainer.run(200);
  await page.locator('.sm-details [data-goto="LEANFIND.ARMED"]').first().click(); // follow a link in its details
  await trainer.run(500);
  await trainer.press('.sm-showroute');
  await trainer.run(300);
  await shot(page, '11-statemap-detail');
});

const TAB_DEVICES = ['desktop', 'iphone-15', 'iphone-fold-inner'];
for (const tab of ['scenarios', 'lessons', 'diagnose', 'faults', 'instructor', 'menus', 'install', 'reference']) {
  test(`tab: ${tab}`, async ({ trainer, page }, info) => {
    test.skip(!TAB_DEVICES.includes(info.project.name), 'tabs are compared on three representative devices');
    await trainer.setup('cruise');
    await trainer.tab(tab);
    await expect(page.locator('.side')).toHaveScreenshot(`tab-${tab}.png`);
  });
}
