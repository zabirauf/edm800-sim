// Record animated GIF demos of the simulator by driving the real UI (same fake clock + seeded randomness as the
// visual tests, so the recording is reproducible).
//
//   node scripts/record-demo.mjs [desktop|iphone|fold|all]     → dist/demo-<variant>.gif
//
// Needs ffmpeg on the PATH, `npm run build` first, and (Linux, no root) `npm run webkit:deps` for the Apple variants.
import { chromium, webkit, devices } from '@playwright/test';
import { mkdtempSync, rmSync, copyFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scrollToReach } from '../test/visual/reach.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PAGE_URL = pathToFileURL(join(ROOT, 'dist/edm800-simulator.html')).href;
const FPS = 5;
const wrapper = join(homedir(), '.cache/pw-webkit-deps/MiniBrowser');
const webkitLaunch = process.platform === 'linux' && existsSync(wrapper) ? { executablePath: wrapper } : {};

const VARIANTS = {
  statemap: { browser: chromium, context: { viewport: { width: 1280, height: 800 } }, width: 1000, story: statemapStory },
  desktop: { browser: chromium, context: { viewport: { width: 1280, height: 800 } }, width: 1000, story: desktopStory },
  iphone: { browser: webkit, launch: webkitLaunch, context: { ...devices['iPhone 15'], deviceScaleFactor: 2 }, scale: 'device', width: 560, story: phoneStory },
  fold: {
    browser: webkit, launch: webkitLaunch,
    context: { ...devices['iPhone 15'], screen: { width: 904, height: 640 }, viewport: { width: 904, height: 576 }, deviceScaleFactor: 2 },
    scale: 'device', width: 960, story: phoneStory,
  },
};

class Recorder {
  constructor(page, dir, touch, scale = 'css') {
    Object.assign(this, { page, dir, touch, scale, n: 0 });
  }
  async init() {
    await this.page.evaluate(() => {
      const cap = document.createElement('div');
      cap.id = 'demo-caption';
      cap.style.cssText = 'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:9999;pointer-events:none;' +
        'background:rgba(8,10,14,.93);color:#fff;border:2px solid #ffb000;border-radius:12px;padding:8px 16px;' +
        'font:600 17px/1.3 system-ui,sans-serif;text-align:center;max-width:92vw;box-shadow:0 4px 18px #000';
      const fin = document.createElement('div');
      fin.id = 'demo-finger';
      fin.style.cssText = 'position:fixed;z-index:9998;pointer-events:none;width:46px;height:46px;border-radius:50%;' +
        'background:rgba(255,176,0,.35);border:3px solid #ffb000;transform:translate(-50%,-50%);display:none';
      document.body.append(cap, fin);
    });
  }
  async caption(text, sub = '') {
    await this.page.evaluate(([t, s]) => {
      const c = document.getElementById('demo-caption');
      c.innerHTML = t + (s ? `<div style="font-weight:400;font-size:13px;color:#ffcf66">${s}</div>` : '');
      c.style.display = t ? 'block' : 'none';
    }, [text, sub]);
  }
  async finger(selector) {
    const b = selector ? await this.page.locator(selector).boundingBox() : null;
    await this.page.evaluate((box) => {
      const f = document.getElementById('demo-finger');
      if (!box) return void (f.style.display = 'none');
      Object.assign(f.style, { left: `${box.x + box.width / 2}px`, top: `${box.y + box.height / 2}px`, display: 'block' });
    }, b);
  }
  /** Open Explain, point at a few parts of the face, close it again. */
  async explainTour(caption, keys, { hold = 2.5 } = {}) {
    await this.caption(caption, 'Explain pauses the simulation on a snapshot');
    await this.tap('#btn-explain');
    await this.still(hold);
    for (const [key, text] of keys) {
      await this.caption(text);
      await this.tap(`#face .ex-hot[data-key="${key}"] >> nth=${/^col/.test(key) ? 1 : 0}`);
      await this.page.clock.runFor(600);
      await this.frame();
      await this.still(hold);
    }
    await this.tap('#ex-close');
  }
  async frame() {
    await this.page.screenshot({ path: join(this.dir, `f${String(this.n++).padStart(5, '0')}.png`), scale: this.scale });
  }
  /** Real-time playback: one frame per 1/FPS s of simulated time. */
  async play(seconds) {
    for (let k = 0; k < seconds * FPS; k++) {
      await this.page.clock.runFor(1000 / FPS);
      await this.frame();
    }
  }
  /** Time-lapse: `speed`× faster than real time, until `until()` is true or `max` seconds pass. */
  async lapse(speed, max, until = async () => false) {
    for (let t = 0; t < max && !(await until()); t += speed / FPS) {
      await this.page.clock.runFor((1000 * speed) / FPS);
      await this.frame();
    }
  }
  async still(seconds) {
    if (!this.n) await this.frame();
    const last = join(this.dir, `f${String(this.n - 1).padStart(5, '0')}.png`);
    for (let k = 0; k < seconds * FPS; k++) copyFileSync(last, join(this.dir, `f${String(this.n++).padStart(5, '0')}.png`));
  }
  async tap(selector, { show = 0.6 } = {}) {
    const loc = this.page.locator(selector);
    await loc.evaluate(scrollToReach);
    await this.finger(selector);
    await this.still(show / 2);
    if (this.touch) await loc.tap();
    else await loc.click();
    await this.page.clock.runFor(150);
    await this.frame();
    await this.finger(null);
  }
  async down(selector) {
    const loc = this.page.locator(selector);
    await loc.scrollIntoViewIfNeeded();
    await this.finger(selector);
    await loc.dispatchEvent('pointerdown', { pointerId: 9, isPrimary: true });
  }
  async up(selector) {
    await this.page.locator(selector).dispatchEvent('pointerup', { pointerId: 9, isPrimary: true });
    await this.finger(null);
  }
  /** Move a lever (range input) smoothly to `value`, the way a hand would. */
  async lever(id, value, seconds = 1) {
    await this.page.locator(id).scrollIntoViewIfNeeded();
    await this.finger(id);
    const from = Number(await this.page.locator(id).inputValue());
    const n = Math.max(1, Math.round(seconds * FPS));
    for (let k = 1; k <= n; k++) {
      await this.setLever(id, from + ((value - from) * k) / n);
      await this.page.clock.runFor(1000 / FPS);
      await this.frame();
    }
    await this.finger(null);
  }
  async setLever(id, v) {
    await this.page.evaluate(([sel, val]) => {
      const el = document.querySelector(sel);
      el.value = String(val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, [id, v]);
  }
  async select(id, value) {
    await this.page.locator(id).scrollIntoViewIfNeeded();
    await this.finger(id);
    await this.still(0.3);
    await this.page.locator(id).selectOption(value);
    await this.page.clock.runFor(100);
    await this.finger(null);
  }
  state() {
    return this.page.evaluate(() => window.edmTrainer.edm.getState());
  }
  engine() {
    return this.page.evaluate(() => {
      const e = window.edmTrainer.sim.engine;
      return { rpm: e.rpm, running: e.running, gph: e.gph };
    });
  }
  async tab(name) {
    await this.tap(`#tabs [data-tab="${name}"]`, { show: 0.4 });
  }
  async top() {
    await this.page.evaluate(() => {
      window.scrollTo(0, 0);
      document.querySelector('.panel').scrollTop = 0;
    });
  }
  /** Fly the throttle to a target RPM like a pilot: small corrections while watching the tach. */
  async throttleToRpm(rpm, max = 20) {
    // small correction, let the engine settle, look at the tach again — no overshoot
    await this.finger('#in-throttle');
    for (let t = 0; t < max; t += 0.6) {
      const e = await this.engine();
      if (Math.abs(e.rpm - rpm) < 15) break;
      const v = Number(await this.page.locator('#in-throttle').inputValue());
      await this.setLever('#in-throttle', Math.min(1, Math.max(0, v + Math.max(-0.04, Math.min(0.04, (rpm - e.rpm) * 0.00012)))));
      for (let k = 0; k < 3; k++) {
        await this.page.clock.runFor(1000 / FPS);
        await this.frame();
      }
    }
    await this.finger(null);
  }
}

async function powerUp(r) {
  await r.caption('Master ON → the EDM runs its power-up self-test');
  await r.tap('#btn-master');
  await r.lapse(1, 25, async () => /^FUEL_FILL\.SEL/.test((await r.state()).path));
  await r.caption('Start-up fuel prompt “FILL? N” — tap STEP to accept');
  await r.still(1);
  await r.tap('#btn-step');
  await r.lapse(1, 6, async () => ['AUTO', 'MANUAL'].includes((await r.state()).state));
}

async function desktopStory(r) {
  await r.caption('JPI EDM-800 trainer · Cessna 177B Cardinal · Lycoming O-360 (180 HP)', 'cold and dark');
  await r.still(2.5);
  await powerUp(r);

  await r.caption('Engine start: mixture rich, throttle cracked, three primes, crank');
  await r.lever('#in-mixture', 1, 0.6);
  await r.lever('#in-throttle', 0.08, 0.6);
  for (let k = 0; k < 3; k++) await r.tap('#btn-prime', { show: 0.3 });
  await r.down('#btn-start');
  await r.lapse(1, 6, async () => (await r.engine()).rpm > 500);
  await r.up('#btn-start');
  await r.caption('Engine running — EGTs light up first, CHTs follow');
  await r.lapse(3, 8);

  await r.tab('scenarios');
  await r.tap('[data-scn="runup"]');
  await r.caption('Scenario: run-up with the EDM — the checklist ticks off as you go');
  await r.still(2);
  await r.caption('Hold LF 3 s → Normalize view (NRM): EGT bars level, so changes stand out');
  await r.down('#btn-lf');
  await r.play(3.4);
  await r.up('#btn-lf');
  await r.play(1);
  await r.tab('cockpit');
  await r.caption('The scenario’s next step floats above the controls on every tab — set 1800 RPM');
  await r.throttleToRpm(1800);
  await r.play(1.5);
  await r.caption('Right magneto: RPM drops, every EGT rises together');
  await r.select('#in-mags', 'R');
  await r.lapse(2, 8);
  await r.select('#in-mags', 'BOTH');
  await r.play(1);
  await r.caption('Left magneto');
  await r.select('#in-mags', 'L');
  await r.lapse(2, 8);
  await r.select('#in-mags', 'BOTH');
  await r.caption('Carb heat: RPM drop confirms it works');
  await r.lever('#in-heat', 1, 0.8);
  await r.lapse(2, 6);
  await r.lever('#in-heat', 0, 0.6);
  await r.play(1);

  await r.top();
  await r.tap('[data-setup="cruise"]');
  await r.caption('Cruise 6000 ft · 2400 RPM / 22 in — automatic scan of every reading', 'fast-forwarded to cruise');
  await r.play(9);

  await r.explainTour('Not sure what you are looking at? Press “Explain”', [
    ['digital', 'Tap any part of the display — the digital window …'],
    ['col2', '… or a column: its EGT, its CHT segment, and what they mean'],
  ]);
  await r.play(1);

  await r.caption('LeanFind: tap LF …');
  await r.tap('#btn-lf');
  await r.play(1.2);
  await r.caption('… then lean slowly and steadily', 'time-lapse 3×');
  await r.down('#btn-lean');
  await r.lapse(3, 90, async () => (await r.state()).leanfind?.phase === 'LEANEST');
  await r.up('#btn-lean');
  await r.caption('First cylinder to peak → “LEANEST”: its EGT and the fuel flow at peak');
  await r.play(3);
  await r.top();
  await r.explainTour('Explain at this moment: which cylinder peaked, what to do next', [['digital', 'The digital window explained for this exact state']], { hold: 3 });

  await r.tab('scenarios');
  await r.tap('[data-scn="overvoltage"]');
  await r.caption('Scenario: voltage regulator fails high');
  await r.still(1.5);
  await r.tab('cockpit');
  await r.caption('Fast-forward stops at the first new alarm');
  await r.tap('[data-ff="120"]');
  await r.top();
  await r.caption('High-voltage alarm: the BAT reading flashes and the ALARM light comes on');
  await r.play(3);
  await r.caption('Tap STEP: alarm acknowledged (it returns in 10 min if still present)');
  await r.tap('#btn-step');
  await r.play(2);

  await r.caption('Hold STEP + LF 5 s → pilot programming menu');
  await r.top();
  await r.finger('#hold-meter');
  await r.page.locator('[data-gesture="holdBoth"]').click();
  await r.play(5.6);
  await r.finger(null);
  await r.caption('Tap STEP to go through the program items');
  for (let k = 0; k < 3; k++) {
    await r.tap('#btn-step', { show: 0.4 });
    await r.play(1);
  }
  await r.tab('menus');
  await r.caption('Menu map: shows where you are in the instrument’s menus');
  await r.still(3);
  await r.caption('dist/edm800-simulator.html — open it in any browser', 'Cockpit · Scenarios · EDM lessons · Diagnose · Faults · Instructor · Reference');
  await r.still(3);
}

async function phoneStory(r, name) {
  await r.caption(name === 'fold' ? 'Foldable iPhone, inner screen (Safari engine)' : 'iPhone 15 (Safari engine)', 'EDM-800 trainer');
  await r.still(1.5);
  await r.tap('[data-setup="cruise"]');
  await r.top();
  await r.caption('Cruise 6000 ft — automatic scan');
  await r.play(4);
  await r.caption('The instrument stays in view while you scroll to the levers');
  for (let k = 0; k < 10; k++) {
    await r.page.evaluate(() => {
      const target = document.querySelector('#in-mixture').getBoundingClientRect().top - innerHeight * 0.55;
      window.scrollBy(0, Math.max(0, target) / 3 + 4);
    });
    await r.page.clock.runFor(1000 / FPS);
    await r.frame();
  }
  await r.caption('LeanFind: tap LF, then hold Lean', 'time-lapse 3×');
  await r.tap('#btn-lf');
  await r.down('#btn-lean');
  await r.lapse(3, 90, async () => (await r.state()).leanfind?.phase === 'LEANEST');
  await r.up('#btn-lean');
  await r.caption('LEANEST: first cylinder to peak');
  await r.play(3);
  await r.explainTour('Press “Explain” for what every part means', [['digital', 'Tap a part: the digital window …'], ['col2', '… or a column']]);
  await r.tab('scenarios');
  await r.tap('[data-scn="overvoltage"]');
  await r.caption('Scenario: voltage regulator fails high');
  await r.still(1.2);
  await r.tab('cockpit');
  await r.tap('[data-ff="120"]');
  await r.top();
  await r.caption('BAT alarm: the reading flashes and the ALARM light comes on');
  await r.play(3);
}

async function statemapStory(r) {
  const p = r.page;
  await r.tap('[data-setup="cruise"]');
  await r.page.clock.runFor(1500);
  await r.tap('#tabs [data-tab="statemap"]');
  await p.clock.runFor(300);
  await r.tap('.sm-expand');
  await p.clock.runFor(600);
  await r.caption('State machine (dev view): every state and transition, found by driving the real EDM', 'overview — the live state’s group is outlined');
  await r.still(3);
  // zoom in smoothly on the live state with the mouse wheel
  const box = await p.locator('.sm-node.cur rect').boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await r.caption('Zoom in: the states appear, then the transition labels', 'mouse wheel / pinch — one transform, nothing is rebuilt');
  for (let k = 0; k < 13; k++) {
    await p.mouse.wheel(0, -90);
    await p.clock.runFor(1000 / FPS);
    await r.frame();
  }
  await r.still(1.5);
  await r.caption('Tap LF on the instrument: the map follows — the transition just taken flashes');
  await r.tap('#btn-lf');
  await r.play(2.5);
  await r.caption('Tap STEP: back to Automatic');
  await r.tap('#btn-step');
  await r.play(2);
  await r.caption('Select a state: what it shows, every way in and out, and the route from where the EDM is now');
  await r.tap('.sm-node.cur rect');
  await r.play(1);
  await r.tap('.sm-details [data-goto="PROGRAM.BANNER"] >> nth=0');
  await r.play(1.2);
  await r.tap('.sm-showroute');
  await r.still(3.5);
  await r.tap('.sm-close');
  await r.caption('Zoom out again for the high-level picture');
  for (let k = 0; k < 24; k++) {
    await p.mouse.wheel(0, 80);
    await p.clock.runFor(1000 / FPS);
    await r.frame();
  }
  await r.still(2.5);
}

async function record(name) {
  const v = VARIANTS[name];
  const dir = mkdtempSync(join(tmpdir(), `edm-demo-${name}-`));
  const browser = await v.browser.launch(v.launch ?? {});
  const context = await browser.newContext(v.context);
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.addInitScript(() => {
    let s = 20261027;
    Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  });
  await page.clock.install({ time: new Date('2026-10-27T15:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-27T15:00:01Z')); // simulated time moves only when the script advances it
  await page.goto(PAGE_URL);
  await page.clock.runFor(500);
  const r = new Recorder(page, dir, !!v.context.hasTouch, v.scale);
  await r.init();
  await v.story(r, name);
  await browser.close();
  const out = join(ROOT, `dist/demo-${name}.gif`);
  const filter = `scale=${v.width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(dir, 'f%05d.png'), '-vf', filter, '-loop', '0', out]);
  rmSync(dir, { recursive: true, force: true });
  console.log(`${out}  ${r.n} frames, ${(r.n / FPS).toFixed(0)} s, ${(statSync(out).size / 1e6).toFixed(1)} MB`);
}

const which = process.argv[2] ?? 'all';
for (const name of which === 'all' ? Object.keys(VARIANTS) : [which]) await record(name);
