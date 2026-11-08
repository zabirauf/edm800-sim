// §11 Fuel fill flow (FUEL-1 … FUEL-6), both contexts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rig, cruiseFrame } from './helpers.mjs';

const still = () => cruiseFrame({ ffGph: 0 }); // no fuel burn so REM/USD stay put

/** Power-up context: stop at the flashing FILL? N. */
function powerupFill(settings = {}) {
  return new Rig({ sensors: still(), settings }).bootToFill();
}

/** Program context: MANUAL or AUTO → PROGRAM → FUEL? Y → STEP. */
function programFill(settings = {}, { auto = false } = {}) {
  const r = new Rig({ sensors: still(), settings });
  if (auto) r.bootAuto(); else r.boot();
  r.enterProgram();
  assert.equal(r.text, 'FUEL? N');
  r.tap('LF');
  assert.equal(r.text, 'FUEL? Y');
  r.tap('STEP');
  assert.ok(r.path.startsWith('FUEL_FILL'), r.path);
  r.until((x) => x.text === 'FILL? N', 1100);
  return r;
}

test('FUEL-1 entry from power-up (PWR-7) and from PROGRAM FUEL? Y + STEP', () => {
  const p = powerupFill();
  assert.equal(p.text, 'FILL? N');
  const q = programFill();
  assert.equal(q.text, 'FILL? N');
});

test('FUEL-1 PROGRAM FUEL? N + STEP → next item (RATE), no fill flow', () => {
  const r = new Rig().boot().enterProgram();
  r.tap('STEP');
  assert.equal(r.path, 'PROGRAM.ITEM.RATE');
});

test('FUEL-2 LF cycle without AUX: FILL? N → FILL <MAIN> → FILL+ → FILL? N', () => {
  const r = powerupFill();
  const seen = [r.text];
  for (let i = 0; i < 3; i++) { r.tap('LF'); seen.push(r.text); }
  assert.deepEqual(seen, ['FILL? N', 'FILL 50', 'FILL+', 'FILL? N']);
});

test('FUEL-2 LF cycle with AUX? Y: FILL? N → FILL <MAIN> → FILL <MAIN+AUX> → FILL+ → FILL? N', () => {
  const r = programFill({ main: 75, auxEnabled: true, aux: 45 });
  const seen = [r.text];
  for (let i = 0; i < 4; i++) { r.tap('LF'); seen.push(r.text); }
  assert.deepEqual(seen, ['FILL? N', 'FILL 75', 'FILL 120', 'FILL+', 'FILL? N']);
});

test('FUEL-3 STEP on FILL? N → exit with no change', () => {
  const r = powerupFill({ rem: 20, usd: 30 });
  r.tap('STEP');
  assert.equal(r.path, 'MANUAL');
  assert.equal(r.settings.rem, 20);
  assert.equal(r.settings.usd, 30);
});

test('FUEL-3 STEP on FILL <MAIN> → REM = MAIN', () => {
  const r = powerupFill({ rem: 20 });
  r.tap('LF').tap('STEP');
  assert.equal(r.path, 'MANUAL');
  assert.equal(r.settings.rem, 50);
  r.gotoItem('REM');
  assert.equal(r.text, '50.0 REM');
});

test('FUEL-3 STEP on FILL <MAIN+AUX> → REM = MAIN + AUX', () => {
  const r = programFill({ rem: 20, main: 75, auxEnabled: true, aux: 45 });
  r.tap('LF').tap('LF').tap('STEP');
  assert.equal(r.settings.rem, 120);
});

test('FUEL-3 / FUEL-4 STEP on FILL+ → ADD showing .0 GAL', () => {
  const r = powerupFill({ rem: 20 });
  r.tap('LF').tap('LF');
  assert.equal(r.text, 'FILL+');
  r.tap('STEP');
  assert.equal(r.path, 'FUEL_FILL.ADD');
  assert.equal(r.text, '.0 GAL');
});

function addScreen(settings) {
  const r = powerupFill(settings);
  r.tap('LF');
  if (settings.auxEnabled) r.tap('LF');
  r.tap('LF').tap('STEP');
  assert.equal(r.path, 'FUEL_FILL.ADD');
  return r;
}

test('FUEL-4 ADD: tap LF −1 (negative allowed), hold LF +1 repeating; STEP → REM += amount, MANUAL', () => {
  const r = addScreen({ rem: 20 });
  r.tap('LF');
  assert.equal(r.text, '-1.0 GAL');
  r.hold('LF', 1600); // +1 at 700, 900, 1100, 1300, 1500
  assert.equal(r.text, '4.0 GAL');
  r.tap('STEP');
  assert.equal(r.path, 'MANUAL');
  assert.equal(r.settings.rem, 24);
});

test('FUEL-4 ADD upper limit: REM + amount ≤ MAIN (count up stops at full tanks)', () => {
  const r = addScreen({ rem: 45 });
  r.hold('LF', 2600); // 10 increments requested
  assert.equal(r.text, '5.0 GAL');
  r.tap('STEP');
  assert.equal(r.settings.rem, 50);
});

test('FUEL-4 ADD upper limit includes AUX when AUX? Y', () => {
  const r = addScreen({ rem: 70, main: 50, auxEnabled: true, aux: 25 });
  r.hold('LF', 2600);
  assert.equal(r.text, '5.0 GAL');
});

test('FUEL-4 ADD lower limit: REM + amount ≥ 0', () => {
  const r = addScreen({ rem: 2 });
  r.taps('LF', 4);
  assert.equal(r.text, '-2.0 GAL');
  r.tap('STEP');
  assert.equal(r.settings.rem, 0);
});

test('FUEL-4 ADD shows the configured fuel unit', () => {
  const r = addScreen({ rem: 20, fuelUnit: 'LTR' });
  assert.equal(r.text, '.0 LTR');
});

test('FUEL-5 confirmed FILL MAIN resets USD', () => {
  const r = powerupFill({ rem: 20, usd: 30 });
  r.tap('LF').tap('STEP');
  assert.equal(r.settings.usd, 0);
});

test('FUEL-5 confirmed FILL MAIN+AUX resets USD', () => {
  const r = programFill({ rem: 20, usd: 30, auxEnabled: true, aux: 10 });
  r.tap('LF').tap('LF').tap('STEP');
  assert.equal(r.settings.usd, 0);
});

test('FUEL-5 ADD with amount > 0 resets USD; amount ≤ 0 does not', () => {
  const a = addScreen({ rem: 20, usd: 30 });
  a.hold('LF', 800).tap('STEP');
  assert.equal(a.settings.usd, 0);
  const b = addScreen({ rem: 20, usd: 30 });
  b.tap('LF').tap('STEP');
  assert.equal(b.settings.usd, 30);
  const c = addScreen({ rem: 20, usd: 30 });
  c.tap('STEP');
  assert.equal(c.settings.usd, 30);
});

test('FUEL-5 ACCUM? Y: fills do not reset USD', () => {
  const r = powerupFill({ rem: 20, usd: 30, accum: true });
  r.tap('LF').tap('STEP');
  assert.equal(r.settings.rem, 50);
  assert.equal(r.settings.usd, 30);
});

test('FUEL-6 (rev2) exit from the power-up fill flow → MANUAL', () => {
  const r = powerupFill();
  r.tap('LF').tap('STEP');
  assert.equal(r.path, 'MANUAL');
});

test('FUEL-6 (rev2) exit from the program fill flow → MANUAL even when programming was entered from AUTO', () => {
  for (const sel of [0, 1, 2]) {
    const r = programFill({ rem: 20 }, { auto: true });
    r.taps('LF', sel);
    r.tap('STEP');
    if (r.path === 'FUEL_FILL.ADD') r.tap('STEP');
    assert.equal(r.path, 'MANUAL', `selection ${sel}`);
  }
});
