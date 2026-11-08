// §15 Derived computations (CALC-1 … CALC-8) and §18 persistence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rig, cruiseFrame } from './helpers.mjs';

test('CALC-1 measured flow = true GPH × transducerK / KF', () => {
  const a = new Rig({ settings: { kf: 30 } }).boot().gotoItem('GPH');
  assert.equal(a.text, `${(12.5 * 29 / 30).toFixed(1)} GPH`); // 12.1
  const b = new Rig({ config: { transducerK: 30 } }).boot().gotoItem('GPH');
  assert.equal(b.text, `${(12.5 * 30 / 29).toFixed(1)} GPH`); // 12.9
});

test('CALC-1 flow converted to the fuel unit for display', () => {
  const r = new Rig({ settings: { fuelUnit: 'LTR' } }).boot().gotoItem('GPH');
  assert.equal(r.text, `${(12.5 * 3.785).toFixed(1)} LPH`);
});

test('CALC-2 REM −= flow·dt and USD += flow·dt', () => {
  const r = new Rig({ sensors: cruiseFrame({ ffGph: 0 }), settings: { rem: 50, usd: 0 } }).boot();
  r.sensors({ ffGph: 36 }).advance(100000); // 1.0 gal
  r.sensors({ ffGph: 0 });
  assert.ok(Math.abs(r.settings.rem - 49) < 0.01, `rem ${r.settings.rem}`);
  assert.ok(Math.abs(r.settings.usd - 1) < 0.01, `usd ${r.settings.usd}`);
  r.gotoItem('REM');
  assert.equal(r.text, '49.0 REM');
  r.gotoItem('USD');
  assert.equal(r.text, '1.0 USD');
});

test('CALC-2 fuel integration uses measured flow (KF) and the fuel unit', () => {
  const r = new Rig({ sensors: cruiseFrame({ ffGph: 0 }), settings: { rem: 50, usd: 0, fuelUnit: 'LTR', kf: 58 } }).boot();
  r.sensors({ ffGph: 36 }).advance(100000); // measured 18 GPH → 0.5 gal → 1.89 L
  r.sensors({ ffGph: 0 });
  assert.ok(Math.abs(r.settings.usd - 0.5 * 3.785) < 0.01, `usd ${r.settings.usd}`);
});

test('CALC-2 REM does not go below 0', () => {
  const r = new Rig({ sensors: cruiseFrame({ ffGph: 0 }), settings: { rem: 0.05 } }).boot();
  r.sensors({ ffGph: 36 }).advance(60000);
  r.sensors({ ffGph: 0 });
  assert.equal(r.settings.rem, 0);
  r.gotoItem('REM');
  assert.equal(r.text, '.0 REM');
});

test('CALC-3 endurance = REM / flow × 60; H.M = floor(h).mm', () => {
  const r = new Rig({ sensors: cruiseFrame({ ffGph: 0 }), settings: { rem: 50 } }).boot().gotoItem('HM');
  r.sensors({ ffGph: 12.5 });
  assert.equal(r.text, '04.00 H.M');
  r.sensors({ ffGph: 9.3 }); // 5.376 h → 5 h 22.6 min
  assert.equal(r.text, '05.22 H.M');
});

test('CALC-4 MPG / REQ / RES with GPS ok (see also §7.2 tests)', () => {
  const r = new Rig({ sensors: cruiseFrame({ ffGph: 0, gps: { status: 'ok', offCourse: false, gs: 120, dist: 60 } }), settings: { rem: 30 } }).boot();
  r.sensors({ ffGph: 10 });
  r.gotoItem('REQ');
  assert.equal(r.text, '5.0 REQ'); // 60/120 × 10
  r.gotoItem('RES');
  assert.equal(r.text, '25.0 RES');
  r.gotoItem('MPG');
  assert.equal(r.text, '12.0 MPG');
});

test('CALC-5 CLD window is 30 s (a cooling step older than 30 s no longer counts)', () => {
  const r = new Rig().boot().gotoItem('CLD');
  r.advance(35000);
  r.sensors({ cht: [330, 360, 340, 355, 345, 352] }); // −20 °F step on cylinder 1
  r.advance(5000);
  const during = Number(r.text.split(' ')[0]);
  assert.ok(during <= -35, `step inside the window: ${r.text}`); // ≈ −40 °/min
  r.advance(31000);
  assert.equal(r.text, '0 CLD');
});

test('CALC-6 DIF = max − min of working EGTs (failed probe ignored)', () => {
  const r = new Rig({ sensors: cruiseFrame({ failed: ['EGT3'] }) }).boot().gotoItem('DIF');
  assert.equal(r.text, '30 DIF'); // 1360 − 1330
});

test('CALC-7 LTM records only when an EGT > 500 °F (FULL after 13 min: hot 1 %, cold 0 %, 500 °F 0 %)', () => {
  const cases = [[1340, 'FULL 1'], [400, 'FULL 0'], [500, 'FULL 0'], [501, 'FULL 1']];
  for (const [egt, exp] of cases) {
    const r = new Rig({ sensors: cruiseFrame({ egt: [egt, 300, 300, 300, 300, 300] }) }).boot();
    r.advance(13 * 60000);
    r.powerOff().powerOn();
    r.until((x) => x.path === 'STARTUP_INFO.FULL', 20000);
    assert.equal(r.text, exp, `EGT ${egt}`);
  }
});

test('CALC-7 FULL = records since save ÷ 12 000 × 100 (60 min at 6 s → 600 records → 5 %)', () => {
  const r = new Rig().boot();
  r.advance(60 * 60000 + 6000);
  r.powerOff().powerOn();
  r.until((x) => x.path === 'STARTUP_INFO.FULL', 20000);
  assert.equal(r.text, 'FULL 5');
});

// ---------------------------------------------------------------- §18 persistence

test('§18 persisted across POWER_OFF: program/limit settings, REM, USD, clock, aircraft ID', () => {
  const r = new Rig({ sensors: cruiseFrame({ ffGph: 0 }), settings: { rem: 33.3, usd: 7.7 } }).boot();
  r.enterProgram().pgmGoto('PROGRAM.ITEM.RATE').tap('LF'); // RATE 3
  r.pgmGoto('PROGRAM.ITEM.EGT1').tap('LF'); // EGT 1?Y
  r.pgmGoto('PROGRAM.ITEM.END').holdBoth(5100).advance(2100);
  r.pgmGoto('PROGRAM.FACLIM.HCHT').tap('LF'); // 445
  r.pgmGoto('PROGRAM.FACLIM.END').tap('STEP');
  r.powerOff().advance(60000);
  r.powerOn();
  r.until((x) => x.path === 'STARTUP_INFO.ID', 20000);
  assert.equal(r.text, 'N12345');
  r.until((x) => x.text === 'FILL? N', 20000);
  r.tap('STEP');
  r.gotoItem('REM');
  assert.equal(r.text, '33.3 REM');
  r.gotoItem('USD');
  assert.equal(r.text, '7.7 USD');
  r.gotoItem('EGT1');
  assert.equal(r.text, '1340 350');
  r.enterProgram().pgmGoto('PROGRAM.ITEM.RATE');
  assert.equal(r.text, 'RATE 3');
  r.pgmGoto('PROGRAM.ITEM.EGT1');
  assert.equal(r.text, 'EGT 1?Y');
  r.pgmGoto('PROGRAM.ITEM.END').holdBoth(5100).advance(2100);
  r.pgmGoto('PROGRAM.FACLIM.HCHT');
  assert.equal(r.text, '445 H CHT');
});

test('§18 clock keeps running while powered off', () => {
  const r = new Rig({ clockMs: Date.UTC(2026, 9, 27, 14, 0, 0) }).boot();
  r.powerOff().advance(3600000);
  r.powerOn();
  r.until((x) => x.path === 'STARTUP_INFO.TIME', 20000);
  assert.equal(r.text, '15.00');
});

test('§18 volatile: mode, exclusions, suppressions, view, LOP results, scan position reset at power-on', () => {
  const r = new Rig().boot().gotoItem('OIL').tapBoth();
  r.hold('LF', 3100);
  r.tap('LF').tap('STEP'); // AUTO
  assert.equal(r.path, 'AUTO');
  r.sensors({ bat: 16.5 }).advance(100);
  r.tap('STEP'); // snooze BATH
  r.powerOff().boot();
  r.advance(100);
  assert.equal(r.path, 'MANUAL');
  assert.equal(r.item, 'BAT');
  assert.deepEqual(r.state().excluded, []);
  assert.equal(r.state().view, 'P');
  assert.equal(r.state().alarm, 'BATH');
  assert.equal(r.state().lopResults, null);
});

test('§18 LOP results do not survive a power cycle (next LF_TAP → ARMED)', () => {
  const r = new Rig({ sensors: cruiseFrame({ egt: [1340, 1360, 1320, 1350, 1330, 1345] }) }).boot();
  r.tap('LF').advance(100).holdBoth(5100).advance(2100);
  let egt = [1340, 1360, 1320, 1350, 1330, 1345].map((v) => v + 15);
  r.sensors({ egt }).advance(100);
  for (let c = 0; c < 6; c++) {
    egt = egt.map((v, i) => (i < c ? v : v + 1));
    r.sensors({ egt }).advance(300);
    egt = egt.map((v, i) => (i === c ? v - 10 : v));
    r.sensors({ egt }).advance(300);
  }
  assert.equal(r.path, 'LEANFIND.LOP_DONE');
  assert.ok(r.state().lopResults);
  r.powerOff().boot();
  r.tap('LF');
  assert.equal(r.path, 'LEANFIND.ARMED');
});

test('§18 LTM new-data pointer persists (SAVE D then power cycle → FULL 0, records after save count)', () => {
  const r = new Rig().boot();
  r.advance(13 * 60000);
  r.tap('STEP');
  r.send({ type: 'USB_INSERT' });
  r.tap('STEP').advance(3100);
  r.send({ type: 'USB_REMOVE' });
  r.advance(13 * 60000);
  r.powerOff().powerOn();
  r.until((x) => x.path === 'STARTUP_INFO.FULL', 20000);
  assert.equal(r.text, 'FULL 1');
});
