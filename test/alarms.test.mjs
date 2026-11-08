// §9 Alarms (ALM-1 … ALM-10).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rig, cruiseFrame } from './helpers.mjs';

const CHT0 = [350, 360, 340, 355, 345, 352];

function manualAt(item = 'OAT', opts = {}) {
  const r = new Rig(opts).boot();
  if (item) r.gotoItem(item);
  return r;
}

function expectAlarm(r, id, text, dot) {
  r.advance(100);
  assert.equal(r.state().alarm, id, `alarm id (text "${r.text}")`);
  assert.equal(r.text, text);
  assert.equal(r.blink, true, 'alarm display flashes');
  if (dot !== undefined) assert.equal(r.dot.index, dot);
}

function expectNoAlarm(r) {
  r.advance(100);
  assert.equal(r.state().alarm, null, `unexpected alarm (text "${r.text}")`);
  assert.equal(r.display().alarmLight, false);
}

// ---------------------------------------------------------------- ALM-1 conditions, strict comparisons

test('ALM-1 CHT: any CHT > H CHT (450) → cht CHT + dot; 450 is not an alarm', () => {
  const r = manualAt();
  r.sensors({ cht: [350, 360, 340, 355, 450, 352] });
  expectNoAlarm(r);
  r.sensors({ cht: [350, 360, 340, 355, 451, 352] });
  expectAlarm(r, 'CHT', '451 CHT', 4);
});

test('ALM-1 OILH: OIL > H OIL (230) → t OIL; 230 is not an alarm', () => {
  const r = manualAt();
  r.sensors({ oil: 230 });
  expectNoAlarm(r);
  r.sensors({ oil: 231 });
  expectAlarm(r, 'OILH', '231 OIL');
});

test('ALM-1 TIT: any TIT > TIT limit (1650) → t TIT; 1650 is not an alarm; TIT2 also checked', () => {
  const r = manualAt();
  r.sensors({ tit: [1650, 0] });
  expectNoAlarm(r);
  r.sensors({ tit: [1651, 0] });
  expectAlarm(r, 'TIT', '1651 TIT');
  const r2 = manualAt('OAT', { config: { tit: 2 } });
  r2.sensors({ tit: [1450, 1662] });
  expectAlarm(r2, 'TIT', '1662 TIT');
});

test('ALM-1 OILL: OIL < L OIL (90) → t OIL; 90 is not an alarm', () => {
  const r = manualAt();
  r.sensors({ oil: 90 });
  expectNoAlarm(r);
  r.sensors({ oil: 89 });
  expectAlarm(r, 'OILL', '89 OIL');
});

test('ALM-1 CLD: CLD < CLD limit (−60) → c CLD + dot', () => {
  const r = manualAt();
  r.advance(35000);
  r.ramp(30000, (t) => ({ cht: CHT0.map((v, i) => (i === 2 ? v - (25 * t) / 30000 : v)) }), 500); // −50 °/min
  expectNoAlarm(r);
  const r2 = manualAt();
  r2.advance(35000);
  r2.ramp(30000, (t) => ({ cht: CHT0.map((v, i) => (i === 2 ? v - (35 * t) / 30000 : v)) }), 500); // −70 °/min
  r2.advance(100);
  assert.equal(r2.state().alarm, 'CLD');
  assert.match(r2.text, /^-(6[89]|7[012]) CLD$/);
  assert.equal(r2.dot.index, 2);
  assert.equal(r2.blink, true);
});

test('ALM-1 DIF: DIF > DIF limit (500) → d DIF + dot; 500 is not an alarm', () => {
  const r = manualAt();
  r.sensors({ egt: [1340, 1360, 1320, 1350, 1330, 1820] });
  expectNoAlarm(r);
  r.sensors({ egt: [1340, 1360, 1320, 1350, 1330, 1821] });
  expectAlarm(r, 'DIF', '501 DIF', 5);
});

test('ALM-1 BATH: BAT > 16.0 → v.v BAT; 16.0 is not an alarm', () => {
  const r = manualAt();
  r.sensors({ bat: 16.0 });
  expectNoAlarm(r);
  r.sensors({ bat: 16.1 });
  expectAlarm(r, 'BATH', '16.1 BAT');
});

test('ALM-1 BATL: BAT < 12.0 → v.v BAT; 12.0 is not an alarm', () => {
  const r = manualAt();
  r.sensors({ bat: 12.0 });
  expectNoAlarm(r);
  r.sensors({ bat: 11.9 });
  expectAlarm(r, 'BATL', '11.9 BAT');
});

test('ALM-1 MAP: MAP > 42.0 (800) → m.m MAP; 42.0 is not an alarm', () => {
  const r = manualAt();
  r.sensors({ map: 42.0 });
  expectNoAlarm(r);
  r.sensors({ map: 42.1 });
  expectAlarm(r, 'MAP', '42.1 MAP');
});

test('ALM-1 LOFUEL: REM < REM limit (10) → r REM; 10 is not an alarm', () => {
  const r = manualAt('OAT', { sensors: cruiseFrame({ ffGph: 0 }), settings: { rem: 10 } });
  expectNoAlarm(r);
  const r2 = manualAt('OAT', { sensors: cruiseFrame({ ffGph: 0 }), settings: { rem: 9.5 } });
  expectAlarm(r2, 'LOFUEL', '9.5 REM');
});

test('ALM-1 LOTIME: endurance < MIN limit (45 min) with flow ≥ 0.5 → HH.MM H.M', () => {
  const r = manualAt('OAT', { sensors: cruiseFrame({ ffGph: 0 }), settings: { rem: 15.1 } });
  r.sensors({ ffGph: 20 }); // 45.3 min
  expectNoAlarm(r);
  const r2 = manualAt('OAT', { sensors: cruiseFrame({ ffGph: 0 }), settings: { rem: 14.1 } });
  r2.sensors({ ffGph: 20 }); // 42.3 min
  expectAlarm(r2, 'LOTIME', '00.42 H.M');
  const r3 = manualAt('OAT', { sensors: cruiseFrame({ ffGph: 0 }), settings: { rem: 10.1 } });
  r3.sensors({ ffGph: 0.4 }); // flow below 0.5 → no LOTIME
  expectNoAlarm(r3);
});

test('ALM-1 alarms are evaluated regardless of exclusion and select switch', () => {
  const r = manualAt('OIL');
  r.tapBoth();
  r.switchTo('F').advance(100);
  r.sensors({ oil: 240 });
  expectAlarm(r, 'OILH', '240 OIL');
});

// ---------------------------------------------------------------- ALM-2 priority and masking

test('ALM-2 priority chain CHT > OILH > TIT > DIF > BATH > MAP > LOFUEL > LOTIME, lower ones masked', () => {
  const r = manualAt('OAT', { sensors: cruiseFrame({ ffGph: 0 }), settings: { rem: 9.5 } });
  r.sensors({
    cht: [350, 360, 340, 355, 470, 352], oil: 240, tit: [1700, 0], egt: [1340, 1360, 1320, 1350, 1330, 1900],
    bat: 16.5, map: 45, ffGph: 13,
  });
  const order = ['CHT', 'OILH', 'TIT', 'DIF', 'BATH', 'MAP', 'LOFUEL', 'LOTIME'];
  for (const id of order) {
    r.advance(100);
    assert.equal(r.state().alarm, id);
    r.tap('STEP'); // suppress this one, the next is unmasked
  }
  r.advance(100);
  assert.equal(r.state().alarm, null);
  assert.equal(r.path, 'MANUAL');
  assert.equal(r.item, 'OAT');
});

test('ALM-2 priority chain OILL > CLD > DIF > BATL', () => {
  const r = manualAt();
  r.advance(35000);
  r.sensors({ oil: 80, bat: 11, egt: [1340, 1360, 1320, 1350, 1330, 1900] });
  r.ramp(30000, (t) => ({ cht: CHT0.map((v, i) => (i === 0 ? v - (40 * t) / 30000 : v)) }), 500);
  const order = ['OILL', 'CLD', 'DIF', 'BATL'];
  for (const id of order) {
    r.advance(100);
    assert.equal(r.state().alarm, id);
    r.tap('STEP');
  }
});

test('ALM-2 alarm replaces the digital content and stops when the condition clears', () => {
  const r = manualAt('EGT1');
  r.sensors({ bat: 16.5 }).advance(100);
  assert.equal(r.text, '16.5 BAT');
  r.sensors({ bat: 14.0 }).advance(100);
  assert.equal(r.state().alarm, null);
  assert.equal(r.text, '1340 350');
  assert.equal(r.blink, false);
});

test('ALM-2 alarms are shown in AUTO and in LEANFIND', () => {
  const a = new Rig().bootAuto();
  a.sensors({ oil: 240 }).advance(100);
  assert.equal(a.text, '240 OIL');
  assert.equal(a.blink, true);
  const l = manualAt();
  l.tap('LF').advance(3000);
  l.sensors({ oil: 240 }).advance(100);
  assert.equal(l.path, 'LEANFIND.ARMED');
  assert.equal(l.text, '240 OIL');
  assert.equal(l.blink, true);
});

// ---------------------------------------------------------------- ALM-3

test('ALM-3 alarms are not shown in PROGRAM, self-test, startup info, fuel fill, tank setup, USB', () => {
  const hot = cruiseFrame({ oil: 240 });
  const p = new Rig().boot().enterProgram();
  p.sensors({ oil: 240 }).advance(100);
  assert.equal(p.text, 'FUEL? N');
  assert.equal(p.blink, false);
  assert.equal(p.state().alarm, null);

  const s = new Rig({ sensors: hot }).powerOn().advance(100);
  assert.equal(s.path, 'SELFTEST.SEGMENTS');
  assert.notEqual(s.text, '240 OIL');
  s.until((x) => x.path === 'STARTUP_INFO.DATE', 20000);
  assert.equal(s.text, '10.27.26');
  s.until((x) => x.path.startsWith('FUEL_FILL'), 20000);
  assert.equal(s.text, 'FUEL');
  s.advance(1100);
  assert.equal(s.text, 'FILL? N');

  const t = new Rig({ sensors: hot });
  t.press('STEP').powerOn().advance(200).release('STEP').advance(100);
  assert.equal(t.text, 'MAIN=50');

  const u = new Rig().boot();
  u.send({ type: 'USB_INSERT' });
  u.sensors({ oil: 240 }).advance(100);
  assert.equal(u.text, 'NEW');
});

// ---------------------------------------------------------------- ALM-4 / ALM-7 snooze

test('ALM-4 STEP_TAP while alarm displayed suppresses it; no mode/item change (MANUAL)', () => {
  const r = manualAt('EGT2');
  r.sensors({ bat: 16.5 }).advance(100);
  r.tap('STEP');
  assert.equal(r.path, 'MANUAL');
  assert.equal(r.item, 'EGT2', 'tap did not advance the scan');
  r.advance(100);
  assert.equal(r.state().alarm, null);
  assert.equal(r.text, '1360 360');
});

test('ALM-4 STEP_TAP on an alarm in AUTO stays in AUTO', () => {
  const r = new Rig().bootAuto();
  r.sensors({ bat: 16.5 }).advance(100);
  r.tap('STEP');
  assert.equal(r.path, 'AUTO');
});

test('ALM-4 STEP_TAP on an alarm in LEANFIND stays in LEANFIND', () => {
  const r = manualAt();
  r.tap('LF').advance(2500);
  r.sensors({ bat: 16.5 }).advance(100);
  r.tap('STEP');
  assert.equal(r.path, 'LEANFIND.ARMED');
});

test('ALM-4 / ALM-7 suppression lasts 10 minutes, then the alarm shows again if still active (boundary)', () => {
  const r = manualAt();
  r.sensors({ bat: 16.5 }).advance(100);
  r.press('STEP').advance(100).release('STEP'); // tap recognized at release
  r.advance(599800);
  assert.equal(r.state().alarm, null);
  r.advance(300);
  assert.equal(r.state().alarm, 'BATH');
});

test('ALM-7 after suppression expires with the condition cleared, nothing is shown', () => {
  const r = manualAt();
  r.sensors({ bat: 16.5 }).advance(100);
  r.tap('STEP');
  r.sensors({ bat: 14 });
  r.advance(601000);
  assert.equal(r.state().alarm, null);
});

test('ALM-4 suppression is per alarm id (a different alarm still shows)', () => {
  const r = manualAt();
  r.sensors({ bat: 16.5 }).advance(100);
  r.tap('STEP');
  r.sensors({ oil: 240 }).advance(100);
  assert.equal(r.state().alarm, 'OILH');
});

// ---------------------------------------------------------------- ALM-5 OFF

test('ALM-5 STEP_HOLD_5S while alarm displayed → OFF for 1500 ms, suppressed until power off', () => {
  const r = manualAt('EGT1');
  r.sensors({ bat: 16.5 }).advance(100);
  r.press('STEP').advance(5050);
  assert.equal(r.text, 'OFF');
  r.release('STEP');
  r.advance(1350);
  assert.equal(r.text, 'OFF');
  r.advance(200);
  assert.notEqual(r.text, 'OFF');
  assert.equal(r.text, '1340 350');
  assert.equal(r.item, 'EGT1', 'no backwards scanning');
  r.advance(3600000);
  assert.equal(r.state().alarm, null, 'still suppressed an hour later');
  r.powerOff().boot();
  r.advance(100);
  assert.equal(r.state().alarm, 'BATH');
});

// ---------------------------------------------------------------- ALM-6

test('ALM-6 STEP press with an alarm displayed is routed only to the alarm (no backward scan)', () => {
  const r = manualAt('EGT4');
  r.sensors({ bat: 16.5 }).advance(100);
  r.hold('STEP', 2000);
  assert.equal(r.item, 'EGT4');
  assert.equal(r.path, 'MANUAL');
});

// ---------------------------------------------------------------- ALM-8 remote light

test('ALM-8 alarm light on for an active, un-suppressed alarm; off after snooze', () => {
  const r = manualAt();
  assert.equal(r.display().alarmLight, false);
  r.sensors({ bat: 16.5 }).advance(100);
  assert.equal(r.display().alarmLight, true);
  r.tap('STEP').advance(100);
  assert.equal(r.display().alarmLight, false);
});

test('ALM-8 alarm light during SELFTEST.SEGMENTS (every powered state)', () => {
  const s = new Rig({ sensors: cruiseFrame({ oil: 240 }) }).powerOn().advance(100);
  assert.equal(s.path, 'SELFTEST.SEGMENTS');
  assert.equal(s.display().alarmLight, true);
});

test('ALM-8 alarm light in every powered state (PROGRAM, SELFTEST.COLUMNS, STARTUP_INFO, FUEL_FILL, TANK_SETUP, USB)', () => {
  const hot = cruiseFrame({ oil: 240 });
  const s = new Rig({ sensors: hot }).powerOn().advance(3100);
  assert.equal(s.path, 'SELFTEST.COLUMNS');
  assert.equal(s.display().alarmLight, true, 'SELFTEST.COLUMNS');
  s.until((x) => x.path.startsWith('STARTUP_INFO'), 20000);
  s.advance(100);
  assert.equal(s.display().alarmLight, true, 'STARTUP_INFO');
  s.until((x) => x.text === 'FILL? N', 20000);
  assert.equal(s.display().alarmLight, true, 'FUEL_FILL');

  const p = new Rig().boot().enterProgram();
  p.sensors({ oil: 240 }).advance(100);
  assert.equal(p.display().alarmLight, true, 'PROGRAM');

  const t = new Rig({ sensors: hot });
  t.press('STEP').powerOn().advance(200);
  assert.equal(t.display().alarmLight, true, 'TANK_SETUP');

  const u = new Rig().boot();
  u.send({ type: 'USB_INSERT' });
  u.sensors({ oil: 240 }).advance(100);
  assert.equal(u.display().alarmLight, true, 'USB');
  u.powerOff();
  assert.equal(u.display().alarmLight, false, 'OFF');
});

test('ALM-8 alarm light stays off for an alarm turned OFF (suppressed for the flight)', () => {
  const r = manualAt();
  r.sensors({ bat: 16.5 }).advance(100);
  r.hold('STEP', 5100).advance(2000);
  assert.equal(r.display().alarmLight, false);
});

// ---------------------------------------------------------------- ALM-9 LeanFind TIT exception

test('ALM-9 in LEANFIND a TIT alarm < 100° over is hidden for 60 s (display and light), then shown', () => {
  const r = manualAt();
  r.tap('LF').advance(2500);
  r.sensors({ tit: [1700, 0] });
  r.advance(59800);
  assert.equal(r.state().alarm, null);
  assert.equal(r.display().alarmLight, false, 'light also follows the exception in LEANFIND');
  assert.notEqual(r.text, '1700 TIT');
  r.advance(300);
  assert.equal(r.state().alarm, 'TIT');
  assert.equal(r.text, '1700 TIT');
  assert.equal(r.display().alarmLight, true);
});

test('ALM-9 boundary: TIT exactly 100° over the limit is shown immediately in LEANFIND; 99° is not', () => {
  const r = manualAt();
  r.tap('LF').advance(2500);
  r.sensors({ tit: [1749, 0] }).advance(100);
  assert.equal(r.state().alarm, null);
  r.sensors({ tit: [1750, 0] }).advance(100);
  assert.equal(r.state().alarm, 'TIT');
  assert.equal(r.text, '1750 TIT');
});

test('ALM-9 outside LEANFIND the TIT alarm (and light) are immediate', () => {
  const r = manualAt();
  r.sensors({ tit: [1700, 0] }).advance(100);
  assert.equal(r.state().alarm, 'TIT');
  assert.equal(r.display().alarmLight, true);
});

test('ALM-9 "continuously above the limit" counts time already spent above before entering LEANFIND', () => {
  const r = manualAt();
  r.sensors({ tit: [1700, 0] }).advance(70000);
  r.tap('LF').advance(100);
  assert.equal(r.path, 'LEANFIND.ARMED');
  assert.equal(r.state().alarm, 'TIT');
});

test('ALM-9 dropping below the limit restarts the 60 s grace', () => {
  const r = manualAt();
  r.tap('LF').advance(2500);
  r.sensors({ tit: [1700, 0] }).advance(40000);
  r.sensors({ tit: [1640, 0] }).advance(1000);
  r.sensors({ tit: [1700, 0] }).advance(40000);
  assert.equal(r.state().alarm, null);
});

// ---------------------------------------------------------------- ALM-10

test('ALM-10 no individual EGT alarms (high EGTs with small spread)', () => {
  const r = manualAt();
  r.sensors({ egt: [1990, 1995, 1985, 1990, 1992, 1988], tit: [1600, 0] });
  expectNoAlarm(r);
});

test('ALM-1 option-dependent alarms: no LOFUEL/LOTIME without ff, no TIT without TIT probe, no OIL without OIL probe', () => {
  const nf = manualAt('OAT', { config: { ff: false }, settings: { rem: 2 } });
  expectNoAlarm(nf);
  const nt = manualAt('OAT', { config: { tit: 0 } });
  nt.sensors({ tit: [1800, 1800] });
  expectNoAlarm(nt);
  const no = manualAt('OAT', { config: { oil: false } });
  no.sensors({ oil: 260 });
  expectNoAlarm(no);
  const fo = manualAt('OAT', { sensors: cruiseFrame({ failed: ['OIL'] }) });
  fo.sensors({ oil: 260 });
  expectNoAlarm(fo);
});

// ---------------------------------------------------------------- ALM-6 (rev3.2): only a visible alarm captures STEP
// Found by the TLA+ conformance check (spec/tla, docs/09): STEP used to silence an alarm hidden under OFF / SNAP.

test('ALM-6 (rev3.2) during the OFF confirmation a second alarm is hidden: tapping STEP does not silence it', () => {
  const r = manualAt();
  r.sensors({ oil: 240, bat: 11.5 }).advance(100); // OILH (priority 2) shown, BATL (8) masked
  assert.equal(r.state().alarm, 'OILH');
  r.press('STEP').advance(5100); // hold until OFF: OILH off for the flight
  r.release('STEP');
  assert.equal(r.text, 'OFF');
  const item = r.state().item;
  r.tap('STEP'); // BATL is active underneath but covered by OFF: the tap is an ordinary MANUAL step
  assert.notEqual(r.state().item, item, 'the tap advanced the manual scan');
  assert.ok(r.edm.vol.alarmSupp.BATL == null, 'BATL was not silenced');
  r.advance(1600); // OFF has ended: BATL is shown
  assert.equal(r.state().alarm, 'BATL');
});

test('ALM-6 (rev3.2) while SNAP covers an alarm in LeanFind, tapping STEP leaves LeanFind instead of silencing it', () => {
  const r = manualAt();
  r.tap('LF').advance(100);
  r.sensors({ oil: 240 }).advance(100);
  r.tapBoth(); // request a mark
  r.until((x) => x.text === 'SNAP', 6200);
  assert.equal(r.state().state, 'LEANFIND');
  r.tap('STEP');
  assert.equal(r.state().state, 'AUTO', 'STEP acted as a normal LeanFind STEP');
  assert.ok(r.edm.vol.alarmSupp.OILH == null, 'the hidden OILH alarm was not silenced');
});

test('ALM-6 a visible alarm still captures STEP (silenced for 10 minutes, no mode change)', () => {
  const r = manualAt();
  r.sensors({ oil: 240 }).advance(100);
  r.tap('STEP');
  assert.equal(r.state().state, 'MANUAL');
  assert.ok(r.edm.vol.alarmSupp.OILH > r.edm.now);
});
