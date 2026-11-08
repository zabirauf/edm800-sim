// §4 Button gestures (BTN-1 … BTN-11), observed through their effects on the machine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rig, num } from './helpers.mjs';

const manualOn = (id) => {
  const r = new Rig().boot();
  if (id) r.gotoItem(id);
  return r;
};

test('BTN-1 STEP press released before 700 ms is a tap (MANUAL advances one item)', () => {
  const r = manualOn();
  assert.equal(r.item, 'BAT');
  r.hold('STEP', 650);
  assert.equal(r.item, 'OAT');
});

test('BTN-1 boundary: STEP released after 700 ms is not a tap (no forward step)', () => {
  const r = manualOn('DIF');
  r.hold('STEP', 750); // HOLD_START fired → backwards once (MAN-2), never forward
  assert.equal(r.item, 'OAT');
});

test('BTN-1 LF tap < 700 ms enters LeanFind; LF released after 700 ms does not', () => {
  const a = manualOn();
  a.hold('LF', 650);
  assert.equal(a.path, 'LEANFIND.ARMED');
  const b = manualOn();
  b.hold('LF', 750);
  assert.equal(b.path, 'MANUAL');
});

test('BTN-2 STEP_HOLD_START fires once at 700 ms (MANUAL steps back exactly once)', () => {
  const r = manualOn('DIF');
  r.press('STEP').advance(650);
  assert.equal(r.item, 'DIF', 'no hold start yet at 650 ms');
  r.advance(100); // 750 ms
  assert.equal(r.item, 'OAT', 'one step back at hold start');
  r.release('STEP');
  assert.equal(r.item, 'OAT');
});

test('BTN-3 STEP hold repeat every 250 ms after hold start', () => {
  const r = manualOn('EGT4'); // list: BAT OAT DIF RPMMAP REM REQ RES MPG HM GPH USD EGT1..6 TIT1 OIL CLD
  r.press('STEP').advance(800); // hold start at 700 → EGT3
  assert.equal(r.item, 'EGT3');
  r.advance(100); // 900: next repeat at 950 not yet
  assert.equal(r.item, 'EGT3');
  r.advance(100); // 1000 ≥ 950 → EGT2
  assert.equal(r.item, 'EGT2');
  r.advance(250); // 1250 ≥ 1200 → EGT1
  assert.equal(r.item, 'EGT1');
  r.release('STEP');
});

test('BTN-3 LF hold repeat every 200 ms after hold start (RATE increments)', () => {
  const r = manualOn().enterProgram().pgmGoto('PROGRAM.ITEM.RATE');
  assert.equal(r.text, 'RATE 4');
  r.press('LF').advance(650);
  assert.equal(r.text, 'RATE 4');
  r.advance(100); // 750: hold start (+1)
  assert.equal(r.text, 'RATE 5');
  r.advance(100); // 850: next repeat at 900 not yet
  assert.equal(r.text, 'RATE 5');
  r.advance(100); // 950 ≥ 900
  assert.equal(r.text, 'RATE 6');
  r.advance(200); // 1150 ≥ 1100
  assert.equal(r.text, 'RATE 7');
  r.release('LF');
  r.advance(500);
  assert.equal(r.text, 'RATE 7', 'no further change after release (no tap on release)');
});

test('BTN-4 LF_HOLD_3S fires at 3000 ms (view toggles), not at 2950 ms', () => {
  const r = manualOn();
  r.press('LF').advance(2950);
  assert.equal(r.state().view, 'P');
  r.advance(100);
  assert.equal(r.state().view, 'N');
  r.release('LF');
});

test('BTN-4 LF_HOLD_3S fires once (holding 9 s toggles only once)', () => {
  const r = manualOn();
  r.hold('LF', 9000);
  assert.equal(r.state().view, 'N');
  assert.equal(r.path, 'MANUAL');
});

test('BTN-5 STEP_HOLD_5S fires at 5000 ms (alarm OFF), not before', () => {
  const r = new Rig().boot();
  r.sensors({ bat: 16.5 }).advance(200); // BATH alarm displayed
  assert.equal(r.state().alarm, 'BATH');
  r.press('STEP').advance(4950);
  assert.notEqual(r.text, 'OFF');
  r.advance(100);
  assert.equal(r.text, 'OFF');
  r.release('STEP');
});

test('BTN-6 release after hold start produces no tap', () => {
  const r = manualOn('DIF');
  r.hold('STEP', 800); // back 1 (OAT) then release: no forward tap
  assert.equal(r.item, 'OAT');
  const a = new Rig().bootAuto();
  a.hold('STEP', 1000); // in AUTO a STEP tap would go to MANUAL
  assert.equal(a.path, 'AUTO');
});

test('BTN-7 chord: no single-button events while in a chord (no STEP tap, no LF tap)', () => {
  const r = manualOn();
  r.press('STEP').advance(300).press('LF').advance(1500); // chord formed at 300 ms, released 1.5 s later
  r.release('LF').advance(100).release('STEP');
  assert.equal(r.path, 'MANUAL');
  assert.equal(r.item, 'BAT', 'no STEP tap');
  assert.deepEqual(r.state().excluded, [], 'released after 700 ms → no BOTH_TAP');
});

test('BTN-7 chord can form up to just before the first button reaches hold start', () => {
  const r = manualOn();
  r.press('STEP').advance(650).press('LF').advance(5100); // 5 s from second press
  assert.equal(r.path, 'PROGRAM.BANNER');
  r.release('STEP').release('LF');
});

test('BTN-8 BOTH_TAP: chord released < 700 ms after forming toggles exclusion in MANUAL', () => {
  const r = manualOn('OIL');
  r.press('STEP').advance(200).press('LF').advance(650).release('STEP').release('LF');
  assert.deepEqual(r.state().excluded, ['OIL']);
});

test('BTN-8 boundary: chord released between 700 ms and 5 s produces nothing', () => {
  const r = manualOn('OIL');
  r.press('STEP').press('LF').advance(750).release('STEP').release('LF');
  assert.deepEqual(r.state().excluded, []);
  r.press('STEP').press('LF').advance(4900).release('STEP').release('LF');
  assert.deepEqual(r.state().excluded, []);
  assert.equal(r.path, 'MANUAL');
  assert.equal(r.item, 'OIL');
});

test('BTN-9 BOTH_HOLD_5S measured from the second press', () => {
  const r = manualOn();
  r.press('STEP').advance(500).press('LF').advance(4950); // 5450 from first press, 4950 from second
  assert.equal(r.path, 'MANUAL');
  r.advance(100);
  assert.equal(r.path, 'PROGRAM.BANNER');
  r.release('STEP').release('LF');
});

test('BTN-9 continuing to hold after BOTH_HOLD_5S does nothing more', () => {
  const r = manualOn();
  r.press('STEP').press('LF').advance(15000); // 10 s past program entry; banner over
  assert.equal(r.path, 'PROGRAM.ITEM.FUEL');
  assert.equal(r.text, 'FUEL? N');
  r.release('STEP').release('LF').advance(100);
  assert.equal(r.path, 'PROGRAM.ITEM.FUEL');
  assert.equal(r.text, 'FUEL? N');
});

test('BTN-10 second button pressed after first reached hold start is ignored', () => {
  const r = manualOn('EGT4');
  r.press('STEP').advance(800); // hold started → EGT3
  r.press('LF').advance(6000); // would be BOTH_HOLD_5S if not ignored
  assert.notEqual(r.state().state, 'PROGRAM');
  r.release('STEP').advance(100).release('LF').advance(100);
  assert.equal(r.path, 'MANUAL', 'LF release is not an LF tap (no LeanFind)');
  assert.deepEqual(r.state().excluded, []);
});

test('BTN-11 button already down at POWER_ON produces no tap on release (TANK_SETUP stays on MAIN)', () => {
  const r = new Rig();
  r.press('STEP').powerOn();
  assert.equal(r.path, 'TANK_SETUP.MAIN');
  r.advance(100).release('STEP').advance(100);
  assert.equal(r.path, 'TANK_SETUP.MAIN');
  assert.equal(r.text, 'MAIN=50');
});

test('BTN-11 LF held through POWER_ON gives no tap/hold events after release', () => {
  const r = new Rig();
  r.press('LF').powerOn().advance(4000); // would be LF_HOLD_3S if counted
  r.release('LF');
  r.until((x) => x.text.startsWith('FILL'), 20000);
  assert.equal(r.text, 'FILL? N');
  assert.equal(r.blink, true, 'still flashing: the held LF was not a button press for FILL? N');
  r.tap('STEP');
  assert.equal(r.state().view, 'P');
  assert.equal(r.path, 'MANUAL');
});

test('BTN (convention) tap LF = decrease, hold LF = increase in programming', () => {
  const r = manualOn().enterProgram().pgmGoto('PROGRAM.ITEM.RATE');
  r.tap('LF');
  assert.equal(num(r.text), 3);
  r.hold('LF', 800); // one increment at hold start
  assert.equal(num(r.text), 4);
});

test('BTN-1 boundary: release at 699 ms is still a tap', () => {
  const r = manualOn();
  r.hold('STEP', 699);
  assert.equal(r.item, 'OAT');
});

test('BTN-4 boundary: LF released at 2999 ms does not toggle the view', () => {
  const r = manualOn();
  r.hold('LF', 2999);
  assert.equal(r.state().view, 'P');
  assert.equal(r.path, 'MANUAL');
});

test('BTN-7 / BTN-8 chord with LF pressed first behaves the same (BOTH_TAP, BOTH_HOLD_5S)', () => {
  const r = manualOn('OIL');
  r.press('LF').advance(200).press('STEP').advance(300).release('LF').release('STEP');
  assert.deepEqual(r.state().excluded, ['OIL']);
  assert.equal(r.path, 'MANUAL');
  r.press('LF').advance(100).press('STEP').advance(5100).release('LF').release('STEP');
  assert.equal(r.path, 'PROGRAM.BANNER');
});

test('BTN-8 BOTH_TAP is decided at the first release; the button still held produces no events afterwards', () => {
  const r = manualOn('OIL');
  r.press('STEP').press('LF').advance(400).release('STEP'); // first release < 700 ms → BOTH_TAP
  assert.deepEqual(r.state().excluded, ['OIL']);
  r.advance(4000).release('LF'); // LF kept down 4 s: no LF_HOLD_3S, no LF tap
  assert.equal(r.state().view, 'P');
  assert.equal(r.path, 'MANUAL');
  assert.equal(r.item, 'OIL');
});

test('BTN-10 the first button keeps its own hold events while the late second button is ignored', () => {
  const r = manualOn();
  r.press('LF').advance(800).press('STEP'); // LF hold already started → STEP ignored
  r.advance(2500); // LF held 3.3 s
  assert.equal(r.state().view, 'N', 'LF_HOLD_3S still fires');
  r.release('STEP').advance(100).release('LF').advance(100);
  assert.equal(r.item, 'BAT', 'ignored STEP produced no tap');
  assert.equal(r.path, 'MANUAL');
});
