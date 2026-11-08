// Shared helpers: load the built page with a fake clock and a seeded Math.random so every run is identical.
import { test as base, expect } from '@playwright/test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scrollToReach } from './reach.mjs';

export { scrollToReach };

export const PAGE_URL = pathToFileURL(fileURLToPath(new URL('../../dist/edm800-simulator.html', import.meta.url))).href;
export const T0 = new Date('2026-10-27T15:00:00Z');

export const test = base.extend({
  trainer: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      let s = 20261027;
      Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
    });
    // An installed clock still flows in real time, so pause it: from here on simulated time only moves through
    // run(), and how long each action takes cannot change what is on screen. (Pausing before goto made Linux WebKit
    // crash more often at load; the few real-time frames before the pause are in the cold-and-dark state, which
    // looks the same at any moment.)
    await page.clock.install({ time: T0 });
    await page.goto(PAGE_URL);
    await page.clock.pauseAt(new Date(T0.getTime() + 10_000));
    await page.clock.runFor(500);
    await use(new Trainer(page));
    expect(errors, 'no uncaught page errors').toEqual([]);
  },
});
export { expect };

export class Trainer {
  constructor(page) {
    this.page = page;
  }
  /** Advance simulated wall-clock time (the app's animation loop runs at 60 frames per second). */
  async run(ms) {
    await this.page.clock.runFor(ms);
  }
  state() {
    return this.page.evaluate(() => window.edmTrainer.edm.getState());
  }
  async tab(name) {
    await this.page.locator(`#tabs [data-tab="${name}"]`).click();
    await this.run(100);
  }
  /** Tap with a finger on touch devices, click elsewhere. */
  async press(selector) {
    const loc = this.page.locator(selector);
    // like a person: bring the control to the middle of the screen first (the phone step card sits at the bottom);
    // the pinned instrument never needs scrolling
    await loc.evaluate(scrollToReach);
    const touch = await this.page.evaluate(() => navigator.maxTouchPoints > 0);
    if (touch) await loc.tap();
    else await loc.click();
    await this.run(150);
  }
  /** Hold an element down for `ms` of simulated time (pointer events, as a finger or mouse would send). */
  async hold(selector, ms) {
    const loc = this.page.locator(selector);
    await loc.scrollIntoViewIfNeeded();
    await loc.dispatchEvent('pointerdown', { pointerId: 7, isPrimary: true });
    await this.run(ms);
    await loc.dispatchEvent('pointerup', { pointerId: 7, isPrimary: true });
    await this.run(100);
  }
  async setup(kind) {
    await this.tab('cockpit');
    await this.press(`[data-setup="${kind}"]`);
    await this.run(kind === 'cold' ? 500 : 3000);
  }
  async masterOn() {
    await this.press('#btn-master');
  }
  async toTop() {
    await this.page.evaluate(() => {
      window.scrollTo(0, 0);
      document.querySelector('.panel').scrollTop = 0; // the instrument column scrolls on its own in two-column layouts
    });
    await this.run(50);
  }
}
