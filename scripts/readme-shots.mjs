// Screenshots for the README (docs/media/), taken with the same reproducible clock and seed as the visual tests.
//   npm run shots        (after npm run build; Apple-device shots need WebKit — see scripts/webkit-deps.sh)
import { chromium, webkit, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scrollToReach } from '../test/visual/reach.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const URL_ = pathToFileURL(join(ROOT, 'dist/edm800-simulator.html')).href;
const OUT = join(ROOT, 'docs/media');
const wrapper = join(homedir(), '.cache/pw-webkit-deps/MiniBrowser');
const WK = process.platform === 'linux' && existsSync(wrapper) ? { executablePath: wrapper } : {};
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { ...devices['iPhone 15'], deviceScaleFactor: 2 };

async function open(bt, ctxOpt, launch) {
  const b = await bt.launch(launch);
  const p = await (await b.newContext(ctxOpt)).newPage();
  await p.addInitScript(() => {
    localStorage.setItem('edm800-disclaimer-ack-v1', '1');
    let s = 20261027;
    Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  });
  await p.clock.install({ time: new Date('2026-10-27T15:00:00Z') });
  await p.goto(URL_);
  await p.clock.pauseAt(new Date('2026-10-27T15:00:10Z'));
  await p.clock.runFor(300);
  const tap = async (sel) => {
    const l = p.locator(sel).first();
    await l.evaluate(scrollToReach);
    if (ctxOpt.hasTouch) await l.tap();
    else await l.click();
    await p.clock.runFor(150);
  };
  return { b, p, tap };
}

// hero: cruise, LeanFind has just found the leanest cylinder; then Explain on the same state
{
  const { b, p, tap } = await open(chromium, DESK, {});
  await tap('[data-setup="cruise"]');
  await p.clock.runFor(3000);
  await tap('#btn-lf');
  await p.clock.runFor(800);
  await p.locator('#btn-lean').dispatchEvent('pointerdown', { pointerId: 3 });
  for (let i = 0; i < 120 && (await p.evaluate(() => window.edmTrainer.edm.getState().leanfind?.phase)) !== 'LEANEST'; i++) await p.clock.runFor(1000);
  await p.locator('#btn-lean').dispatchEvent('pointerup', { pointerId: 3 });
  await p.clock.runFor(2600);
  await p.evaluate(() => {
    scrollTo(0, 0);
    document.querySelector('.panel').scrollTop = 0;
  });
  await p.screenshot({ path: join(OUT, 'hero-leanfind.png') });
  await tap('#btn-explain');
  await p.clock.runFor(300);
  await p.locator('#face .ex-hot[data-key="digital"]').click();
  await p.clock.runFor(800);
  await p.screenshot({ path: join(OUT, 'explain.png') });
  await b.close();
}
// the state-machine view, expanded and zoomed to the live state
{
  const { b, p, tap } = await open(chromium, DESK, {});
  await tap('[data-setup="cruise"]');
  await p.clock.runFor(2000);
  await tap('#tabs [data-tab="statemap"]');
  await p.clock.runFor(500);
  await tap('.sm-expand');
  await p.clock.runFor(400);
  await tap('.sm-now');
  await p.clock.runFor(600);
  await p.screenshot({ path: join(OUT, 'state-machine.png') });
  await b.close();
}
// a phone: the run-up scenario with its step card
{
  const { b, p, tap } = await open(webkit, PHONE, WK);
  await tap('#tabs [data-tab="scenarios"]');
  await tap('[data-scn="runup"]');
  await p.clock.runFor(300);
  await tap('#tabs [data-tab="cockpit"]');
  await p.locator('#btn-lf').dispatchEvent('pointerdown', { pointerId: 4 });
  await p.clock.runFor(3300);
  await p.locator('#btn-lf').dispatchEvent('pointerup', { pointerId: 4 });
  await p.clock.runFor(2500);
  await p.evaluate(() => scrollTo(0, 0));
  await p.clock.runFor(100);
  await p.screenshot({ path: join(OUT, 'phone-scenario.png') });
  await b.close();
}
console.log(`README screenshots written to ${OUT}`);
