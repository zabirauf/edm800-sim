// §7.3 AUTO (AUTO-1 … AUTO-8), §7.4 MANUAL (MAN-1 … MAN-7), MODE-1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rig, cruiseFrame } from './helpers.mjs';

// ---------------------------------------------------------------- AUTO

test('AUTO-1 each item shown RATE (4) seconds, then the next (boundary)', () => {
  const r = new Rig().bootAuto();
  const t0 = r.now;
  assert.equal(r.item, 'BAT');
  r.advance(3950);
  assert.equal(r.item, 'BAT');
  r.advance(100);
  assert.equal(r.item, 'OAT');
  r.advance(4000);
  assert.equal(r.item, 'DIF');
  assert.ok(r.now - t0 <= 8100);
});

test('AUTO-1 RPMMAP is shown for 1 s', () => {
  const r = new Rig().bootAuto();
  r.until((x) => x.item === 'RPMMAP', 20000);
  r.advance(950);
  assert.equal(r.item, 'RPMMAP');
  r.advance(100);
  assert.equal(r.item, 'REM');
});

test('AUTO-1 wraps from the last item to the first', () => {
  const r = new Rig().boot().gotoItem('CLD');
  r.until((x) => x.path === 'AUTO', 130000);
  assert.equal(r.item, 'CLD');
  r.advance(4050);
  assert.equal(r.item, 'BAT');
});

test('AUTO-1 RATE setting controls the dwell (RATE 9)', () => {
  const r = new Rig({ settings: { rate: 9 } }).bootAuto();
  r.advance(8950);
  assert.equal(r.item, 'BAT');
  r.advance(100);
  assert.equal(r.item, 'OAT');
});

test('AUTO-1 excluded items are skipped in AUTO', () => {
  const r = new Rig().boot().gotoItem('OAT').tapBoth();
  r.gotoItem('BAT');
  r.until((x) => x.path === 'AUTO', 130000);
  r.advance(4050);
  assert.equal(r.item, 'DIF');
});

test('AUTO-1 full AUTO cycle visits every included present item in order', () => {
  const r = new Rig().bootAuto();
  const seen = [r.item];
  for (let i = 0; i < 25; i++) {
    const cur = r.item;
    r.until((x) => x.item !== cur, 5000);
    if (r.item === 'BAT') break;
    seen.push(r.item);
  }
  assert.deepEqual(seen, ['BAT', 'OAT', 'DIF', 'RPMMAP', 'REM', 'REQ', 'RES', 'MPG', 'HM', 'GPH', 'USD',
    'EGT1', 'EGT2', 'EGT3', 'EGT4', 'EGT5', 'EGT6', 'TIT1', 'OIL', 'CLD']);
});

test('AUTO-2 RATE 0 → display frozen on the current item', () => {
  const r = new Rig({ settings: { rate: 0 } }).bootAuto();
  assert.equal(r.path, 'AUTO');
  r.advance(60000);
  assert.equal(r.item, 'BAT');
  assert.equal(r.path, 'AUTO');
});

test('AUTO-3 STEP_TAP in AUTO → MANUAL keeping the current item', () => {
  const r = new Rig().bootAuto();
  r.advance(8100); // DIF
  assert.equal(r.item, 'DIF');
  r.tap('STEP');
  assert.equal(r.path, 'MANUAL');
  assert.equal(r.item, 'DIF');
  r.advance(10000);
  assert.equal(r.item, 'DIF', 'MANUAL is frozen');
});

test('AUTO-4 LF_TAP in AUTO → LeanFind', () => {
  const r = new Rig().bootAuto();
  r.tap('LF');
  assert.equal(r.path, 'LEANFIND.ARMED');
});

test('AUTO-5 LF_HOLD_3S in AUTO toggles Percentage/Normalize, stays in AUTO', () => {
  const r = new Rig().bootAuto();
  r.hold('LF', 3100);
  assert.equal(r.state().view, 'N');
  assert.equal(r.path, 'AUTO');
  r.hold('LF', 3100);
  assert.equal(r.state().view, 'P');
});

test('AUTO-6 BOTH_HOLD_5S in AUTO → PROGRAM.BANNER', () => {
  const r = new Rig().bootAuto();
  r.holdBoth(5100);
  assert.equal(r.path, 'PROGRAM.BANNER');
  assert.equal(r.text, 'PROGRAM');
});

test('AUTO-7 entering AUTO via LeanFind+STEP restarts the dwell on the current item', () => {
  const r = new Rig().boot().gotoItem('OIL');
  r.tap('LF').advance(3000).tap('STEP');
  assert.equal(r.path, 'AUTO');
  assert.equal(r.item, 'OIL');
  r.advance(3900);
  assert.equal(r.item, 'OIL');
  r.advance(200);
  assert.equal(r.item, 'CLD');
});

test('AUTO-7 entering AUTO on an excluded item advances immediately to the next included one', () => {
  const r = new Rig().boot().gotoItem('OIL').tapBoth();
  r.tap('LF').tap('STEP');
  r.advance(50);
  assert.equal(r.path, 'AUTO');
  assert.equal(r.item, 'CLD');
});

test('AUTO-7 2-minute timer entry restarts the dwell', () => {
  const r = new Rig().boot().gotoItem('EGT3');
  r.until((x) => x.path === 'AUTO', 130000);
  assert.equal(r.item, 'EGT3');
  r.advance(3900);
  assert.equal(r.item, 'EGT3');
  r.advance(200);
  assert.equal(r.item, 'EGT4');
});

test('AUTO-7 program exit to AUTO restarts the dwell', () => {
  const r = new Rig().bootAuto();
  r.enterProgram(); // AUTO keeps indexing during the 5 s chord
  const item = r.state().item;
  r.pgmGoto('PROGRAM.ITEM.END').tap('STEP');
  assert.equal(r.path, 'AUTO');
  assert.equal(r.item, item);
  r.advance(3900);
  assert.equal(r.item, item);
  r.advance(200);
  assert.notEqual(r.item, item);
});

test('AUTO-8 no included present item → AUTO stays on the current item', () => {
  const r = new Rig().boot();
  const list = r.manualList();
  for (const id of list) {
    r.gotoItem(id).tapBoth();
  }
  assert.equal(r.state().excluded.length, list.length);
  r.gotoItem('EGT2');
  r.tap('LF').tap('STEP');
  assert.equal(r.path, 'AUTO');
  r.advance(20000);
  assert.equal(r.item, 'EGT2');
});

// ---------------------------------------------------------------- MANUAL

test('MAN-1 STEP_TAP → next present item, wraps; excluded items are still shown in MANUAL', () => {
  const r = new Rig().boot().gotoItem('OIL').tapBoth();
  r.gotoItem('CLD');
  r.tap('STEP');
  assert.equal(r.item, 'BAT');
  r.gotoItem('TIT1').tap('STEP');
  assert.equal(r.item, 'OIL', 'excluded OIL still visited in MANUAL');
});

test('MAN-2 STEP hold → previous items rapidly backwards (wraps from first to last)', () => {
  const r = new Rig().boot();
  assert.equal(r.item, 'BAT');
  r.hold('STEP', 800);
  assert.equal(r.item, 'CLD');
  r.hold('STEP', 1300); // 700, 950, 1200 → 3 back from CLD
  assert.equal(r.item, 'EGT6');
});

test('MAN-3 BOTH_TAP toggles include/exclude of the displayed item', () => {
  const r = new Rig().boot().gotoItem('EGT4');
  r.tapBoth();
  assert.deepEqual(r.state().excluded, ['EGT4']);
  r.tapBoth();
  assert.deepEqual(r.state().excluded, []);
  assert.equal(r.path, 'MANUAL');
  assert.equal(r.item, 'EGT4');
});

test('MAN-4 LF_TAP in MANUAL → LeanFind; LF_HOLD_3S toggles the view and stays in MANUAL', () => {
  const r = new Rig().boot();
  r.hold('LF', 3100);
  assert.equal(r.path, 'MANUAL');
  assert.equal(r.state().view, 'N');
  r.tap('LF');
  assert.equal(r.path, 'LEANFIND.ARMED');
});

test('MAN-5 BOTH_HOLD_5S on USD resets fuel used, shows .0 USD, stays in MANUAL', () => {
  const r = new Rig({ sensors: cruiseFrame({ ffGph: 0 }), settings: { usd: 23.4 } }).boot().gotoItem('USD');
  assert.equal(r.text, '23.4 USD');
  r.holdBoth(5100);
  assert.equal(r.path, 'MANUAL');
  assert.equal(r.text, '.0 USD');
  assert.equal(r.settings.usd, 0);
});

test('MAN-5 BOTH_HOLD_5S on other items → PROGRAM', () => {
  const r = new Rig().boot().gotoItem('HM');
  r.holdBoth(5100);
  assert.equal(r.path, 'PROGRAM.BANNER');
});

test('MAN-6 exit MANUAL to AUTO = tap LF then tap STEP', () => {
  const r = new Rig().boot().gotoItem('REM');
  r.tap('LF').tap('STEP');
  assert.equal(r.path, 'AUTO');
  assert.equal(r.item, 'REM');
});

function alarmManual(item) {
  const r = new Rig().boot().gotoItem(item);
  r.sensors({ bat: 16.5 }).advance(100);
  assert.equal(r.state().alarm, 'BATH');
  assert.equal(r.text, '16.5 BAT');
  return r;
}

test('MAN-7 with an alarm displayed BOTH_TAP excludes the underlying scan item', () => {
  const r = alarmManual('OIL');
  r.tapBoth();
  assert.deepEqual(r.state().excluded, ['OIL']);
  assert.equal(r.item, 'OIL');
});

test('MAN-7 with an alarm displayed BOTH_HOLD_5S enters PROGRAM', () => {
  const r = alarmManual('OIL');
  r.holdBoth(5100);
  assert.equal(r.path, 'PROGRAM.BANNER');
});

test('MAN-7 with an alarm displayed BOTH_HOLD_5S on USD resets USD (stays MANUAL)', () => {
  const r = new Rig({ settings: { usd: 5 } }).boot().gotoItem('USD');
  r.sensors({ bat: 16.5 }).advance(100);
  r.holdBoth(5100);
  assert.equal(r.path, 'MANUAL');
  assert.ok(r.settings.usd < 0.01);
});

test('MAN-7 with an alarm displayed LF_TAP enters LeanFind and LF_HOLD_3S toggles view', () => {
  const r = alarmManual('EGT1');
  r.hold('LF', 3100);
  assert.equal(r.state().view, 'N');
  assert.equal(r.path, 'MANUAL');
  r.tap('LF');
  assert.equal(r.path, 'LEANFIND.ARMED');
});

test('MAN-7 the dot follows the visible alarm content (CHT alarm dot at alarming cylinder)', () => {
  const r = new Rig().boot().gotoItem('EGT1');
  assert.equal(r.dot.index, 0);
  r.sensors({ cht: [350, 360, 340, 355, 470, 352] }).advance(100);
  assert.equal(r.state().alarm, 'CHT');
  assert.equal(r.dot.index, 4);
});

test('MAN-7 / ANA-8 a dot-less alarm (BAT) over an EGTn item shows no dot (dot follows the alarm content)', () => {
  const b = new Rig().boot().gotoItem('EGT1');
  assert.equal(b.dot.index, 0);
  b.sensors({ bat: 16.5 }).advance(100);
  assert.equal(b.text, '16.5 BAT');
  assert.equal(b.dot.index, null, 'BAT alarm has no dot');
});

test('MODE-1 STEP_HOLD_5S / STEP_HOLD_START in AUTO without an alarm: no effect', () => {
  const r = new Rig().bootAuto();
  r.hold('STEP', 1000);
  assert.equal(r.path, 'AUTO');
  assert.equal(r.item, 'BAT');
  r.hold('STEP', 5500);
  assert.equal(r.path, 'AUTO');
  assert.notEqual(r.text, 'OFF');
});

test('MODE-1 USB / memory box connection outside AUTO/MANUAL is ignored', () => {
  const lf = new Rig().boot().tap('LF');
  lf.send({ type: 'USB_INSERT' });
  assert.equal(lf.path, 'LEANFIND.ARMED');
  lf.send({ type: 'MEMBOX_CONNECT' });
  assert.equal(lf.path, 'LEANFIND.ARMED');
  lf.tap('STEP');
  assert.equal(lf.path, 'AUTO', 'insertion was ignored, not deferred');

  const p = new Rig().boot().enterProgram();
  p.send({ type: 'USB_INSERT' });
  assert.equal(p.path, 'PROGRAM.ITEM.FUEL');

  const s = new Rig().powerOn();
  s.send({ type: 'USB_INSERT' });
  assert.equal(s.path, 'SELFTEST.SEGMENTS');
  s.send({ type: 'USB_REMOVE' });
  s.bootToFill();
  s.send({ type: 'MEMBOX_CONNECT' });
  assert.ok(s.path.startsWith('FUEL_FILL'));
});

test('AUTO-7 2-minute timer entry on an excluded item advances immediately to the next included one', () => {
  const r = new Rig().boot().gotoItem('OIL').tapBoth();
  r.until((x) => x.path === 'AUTO', 130000);
  r.advance(50);
  assert.equal(r.item, 'CLD');
});
