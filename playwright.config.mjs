// Visual / responsive tests for the built simulator (dist/edm800-simulator.html).
//
//   npm run test:visual            build, then compare against the stored screenshots
//   npm run test:visual:update     build, then re-record the screenshots (after an intended UI change)
//   npm run test:visual:report     open the HTML report (side-by-side / slider diff of any failures)
//
// Apple devices run in WebKit (Safari's engine), Android and desktop in Chromium. On Linux without root,
// `npm run webkit:deps` once makes WebKit runnable (see scripts/webkit-deps.sh).
import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const wrapper = join(homedir(), '.cache/pw-webkit-deps/MiniBrowser');
const webkitLaunch = process.platform === 'linux' && existsSync(wrapper) ? { executablePath: wrapper } : {};
const apple = (device, extra = {}) => ({ ...device, ...extra, launchOptions: webkitLaunch });

// Foldable iPhone, inner screen: leaked spec 7.76" 2713×1920 (4:3) → ≈904×640 pt at 3×; Safari bars take ≈64 pt.
const foldInner = (w, h) => apple(devices['iPhone 15'], { screen: { width: w, height: h }, viewport: { width: w, height: h - 64 }, deviceScaleFactor: 3 });

export default defineConfig({
  testDir: 'test/visual',
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  timeout: 90_000,
  fullyParallel: true,
  workers: 4,
  retries: 1, // WebKit on Linux occasionally crashes a page; a retry is reported as "flaky", not hidden
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.003, animations: 'disabled', caret: 'hide', scale: 'css' },
  },
  // trace recording occasionally crashes Linux WebKit pages, so record a trace only when a test is retried
  use: { trace: 'on-first-retry' },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
    { name: 'iphone-se', use: apple(devices['iPhone SE']) },
    { name: 'iphone-15', use: apple(devices['iPhone 15']) },
    { name: 'iphone-15-pro-max-landscape', use: apple(devices['iPhone 15 Pro Max landscape']) },
    { name: 'pixel-7', use: devices['Pixel 7'] },
    { name: 'ipad-mini', use: apple(devices['iPad Mini']) },
    { name: 'ipad-pro-11-landscape', use: apple(devices['iPad Pro 11 landscape']) },
    { name: 'iphone-fold-inner', use: foldInner(904, 640) },
    { name: 'iphone-fold-inner-portrait', use: foldInner(640, 904) },
  ],
});
