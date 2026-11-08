// §6 Power-up sequence (PWR-1 … PWR-11), §1 scope, §3 inputs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rig, cruiseFrame, num } from './helpers.mjs';

// ---------------------------------------------------------------- PWR-1 / PWR-2 tank setup

test('PWR-1 POWER_ON with STEP held and ff → TANK_SETUP.MAIN (IN-1 button tracked while off)', () => {
  const r = new Rig();
  r.press('STEP');
  r.powerOn();
  assert.equal(r.path, 'TANK_SETUP.MAIN');
  assert.equal(r.text, 'MAIN=50');
});

test('PWR-1 POWER_ON with STEP held but no ff → SELFTEST.SEGMENTS', () => {
  const r = new Rig({ config: { ff: false } });
  r.press('STEP').powerOn();
  assert.equal(r.path, 'SELFTEST.SEGMENTS');
});

test('PWR-1 POWER_ON without STEP → SELFTEST.SEGMENTS', () => {
  const r = new Rig().powerOn();
  assert.equal(r.path, 'SELFTEST.SEGMENTS');
});

function tankSetup(cfg = {}) {
  const r = new Rig({ config: cfg });
  r.press('STEP').powerOn().advance(100).release('STEP').advance(100);
  return r;
}

test('PWR-2 TANK_SETUP MAIN: tap LF decreases by 1, hold LF increases (repeat)', () => {
  const r = tankSetup();
  r.tap('LF');
  assert.equal(r.text, 'MAIN=49');
  r.hold('LF', 1000); // +1 at 700, +1 at 900
  assert.equal(r.text, 'MAIN=51');
});

test('PWR-2 TANK_SETUP MAIN ×10 acceleration after 3 s of holding (range 0…999)', () => {
  const r = tankSetup();
  // repeats at 700, 900, …, 2900 (12 × +1), then 3100 (+10)
  r.hold('LF', 3050);
  assert.equal(r.text, 'MAIN=62');
  const r2 = tankSetup();
  r2.hold('LF', 3150);
  assert.equal(r2.text, 'MAIN=72');
});

test('PWR-2 TANK_SETUP MAIN lower bound 0 (no wrap below 0)', () => {
  const r = tankSetup();
  r.settings.main = 1;
  r.tap('LF').advance(50);
  assert.equal(r.text, 'MAIN=0');
  r.tap('LF').advance(50);
  assert.equal(r.text, 'MAIN=0');
});

test('PWR-2 TANK_SETUP MAIN upper bound 999', () => {
  const r = tankSetup();
  r.settings.main = 998;
  r.hold('LF', 1000);
  assert.equal(r.text, 'MAIN=999');
});

test('PWR-2 TANK_SETUP: STEP MAIN → AUX? N; LF toggles; AUX? Y → AUX=0; STEP on last → SELFTEST', () => {
  const r = tankSetup();
  r.tap('STEP');
  assert.equal(r.path, 'TANK_SETUP.AUXQ');
  assert.equal(r.text, 'AUX? N');
  r.tap('LF');
  assert.equal(r.text, 'AUX? Y');
  r.tap('STEP');
  assert.equal(r.path, 'TANK_SETUP.AUX');
  assert.equal(r.text, 'AUX=0');
  r.hold('LF', 1000);
  assert.equal(r.text, 'AUX=2');
  r.tap('STEP');
  assert.equal(r.path, 'SELFTEST.SEGMENTS');
  assert.equal(r.settings.auxEnabled, true);
  assert.equal(r.settings.aux, 2);
});

test('PWR-2 TANK_SETUP: with AUX? N, STEP on AUX? is the last item → SELFTEST', () => {
  const r = tankSetup();
  r.tap('STEP').tap('STEP');
  assert.equal(r.path, 'SELFTEST.SEGMENTS');
});

test('PWR-2 TANK_SETUP AUX range 0…250 (lower bound)', () => {
  const r = tankSetup();
  r.tap('STEP').tap('LF').tap('STEP'); // AUX=0
  r.tap('LF');
  assert.equal(r.text, 'AUX=0');
});

test('PWR-2 TANK_SETUP values are the same settings as alarm list MAIN/AUX?/AUX', () => {
  const r = tankSetup();
  r.tap('LF').tap('LF'); // MAIN=48
  r.tap('STEP').tap('LF').tap('STEP').hold('LF', 1350); // AUX? Y, AUX=4 (700,900,1100,1300)
  r.tap('STEP');
  r.until((x) => x.text.startsWith('FILL'), 20000);
  r.tap('STEP');
  r.enterProgram().enterFacLim();
  r.pgmGoto('PROGRAM.FACLIM.MAIN');
  assert.equal(r.text, 'MAIN=48');
  r.tap('STEP');
  assert.equal(r.text, 'AUX? Y');
  r.tap('STEP');
  assert.equal(r.text, 'AUX=4');
});

// ---------------------------------------------------------------- PWR-3 … PWR-6 self-test & startup info

test('PWR-3 SELFTEST.SEGMENTS lasts 3000 ms with all segments lit', () => {
  const r = new Rig().powerOn();
  const d = r.display();
  assert.ok(d.columns.every((c) => c.segs === 13), 'all column segments lit');
  r.advance(2950);
  assert.equal(r.path, 'SELFTEST.SEGMENTS');
  r.advance(100);
  assert.equal(r.path, 'SELFTEST.COLUMNS');
});

test('PWR-4 SELFTEST.COLUMNS lights each column alone, cylinders then T, 300 ms each', () => {
  const r = new Rig().powerOn().advance(3000);
  const ids = ['1', '2', '3', '4', '5', '6', 'T'];
  for (let k = 0; k < ids.length; k++) {
    r.advance(150); // middle of slot k
    assert.equal(r.path, 'SELFTEST.COLUMNS', `slot ${k}`);
    const lit = r.columns.filter((c) => c.segs > 0).map((c) => c.id);
    assert.deepEqual(lit, [ids[k]], `slot ${k} lights only column ${ids[k]}`);
    r.advance(150);
  }
  r.advance(50);
  assert.equal(r.path, 'STARTUP_INFO.DATE', 'no failed probes → startup info');
});

test('PWR-4 SELFTEST.COLUMNS without a T column: only cylinder columns (4 cyl, no TIT/OIL)', () => {
  const r = new Rig({ config: { cylinders: 4, tit: 0, oil: false } }).powerOn().advance(3000);
  r.advance(4 * 300 - 100);
  assert.equal(r.path, 'SELFTEST.COLUMNS');
  r.advance(150);
  assert.equal(r.path, 'STARTUP_INFO.DATE');
});

test('PWR-5 failed probe: OPEN PRB 1500 ms then channel name 1500 ms', () => {
  const r = new Rig({ sensors: cruiseFrame({ failed: ['EGT3'] }) }).powerOn();
  r.advance(3000 + 7 * 300 + 50);
  assert.equal(r.path, 'SELFTEST.PROBES');
  assert.equal(r.text, 'OPEN PRB');
  r.advance(1400);
  assert.equal(r.text, 'OPEN PRB');
  r.advance(100);
  assert.equal(r.text, 'EGT 3');
  r.advance(1400);
  assert.equal(r.text, 'EGT 3');
  r.advance(100);
  assert.equal(r.path, 'STARTUP_INFO.DATE');
});

test('PWR-5 calibration fault shows CAL ERR; channel names for all channel types', () => {
  const cfg = { tit: 2, iat: true, cdt: true, oat: true, oil: true };
  const failed = ['CHT2', 'OIL', 'TIT1', 'TIT2', 'CDT', 'IAT', 'OAT'];
  const r = new Rig({ config: cfg, sensors: cruiseFrame({ failed: [], calErr: [] }) });
  r.sensors({ failed: failed.slice(1), calErr: ['CHT2'] });
  r.powerOn().advance(3000 + 7 * 300 + 50);
  const seen = [];
  while (r.path === 'SELFTEST.PROBES') {
    if (seen[seen.length - 1] !== r.text) seen.push(r.text);
    r.advance(250);
  }
  assert.deepEqual(seen, ['CAL ERR', 'CHT 2', 'OPEN PRB', 'OIL', 'OPEN PRB', 'TIT 1', 'OPEN PRB', 'TIT2',
    'OPEN PRB', 'CDT CRB', 'OPEN PRB', 'IND', 'OPEN PRB', 'OAT']);
});

test('PWR-5 failed channels are deleted from the scan and the analog display', () => {
  const r = new Rig({ sensors: cruiseFrame({ failed: ['OAT', 'OIL', 'EGT2'] }) }).boot();
  const list = r.manualList();
  assert.ok(!list.includes('OAT'));
  assert.ok(!list.includes('OIL'));
  assert.ok(list.includes('EGT2'), 'EGT2 item stays (its CHT works)');
  assert.equal(r.col(2).missing, true);
});

test('PWR-6 STARTUP_INFO: date MM.DD.YY, time HH.MM, FULL nn, aircraft ID, 1500 ms each', () => {
  const r = new Rig({ clockMs: Date.UTC(2001, 10, 12, 13, 26, 0) }).powerOn();
  r.until((x) => x.path === 'STARTUP_INFO.DATE', 10000);
  assert.equal(r.text, '11.12.01');
  r.advance(1400);
  assert.equal(r.text, '11.12.01');
  r.advance(100);
  assert.equal(r.path, 'STARTUP_INFO.TIME');
  assert.equal(r.text, '13.26');
  r.advance(1500);
  assert.equal(r.path, 'STARTUP_INFO.FULL');
  assert.match(r.text, /^FULL\s*0$/);
  r.advance(1500);
  assert.equal(r.path, 'STARTUP_INFO.ID');
  assert.equal(r.text, 'N12345');
  r.advance(1500);
  assert.equal(r.path, 'FUEL_FILL.BANNER');
});

// ---------------------------------------------------------------- PWR-7 / PWR-8

test('PWR-7 ff: FUEL for 1000 ms, then FILL? N flashing until a button is pressed', () => {
  const r = new Rig().powerOn();
  r.until((x) => x.path.startsWith('FUEL_FILL'), 20000);
  assert.equal(r.text, 'FUEL');
  r.advance(950);
  assert.equal(r.text, 'FUEL');
  r.advance(100);
  assert.equal(r.text, 'FILL? N');
  assert.equal(r.blink, true);
  r.advance(60000);
  assert.equal(r.text, 'FILL? N');
  assert.equal(r.blink, true, 'still flashing (no button pressed)');
  r.tap('LF');
  assert.equal(r.text, 'FILL 50');
  assert.equal(r.blink, false);
  r.tap('LF');
  assert.equal(r.text, 'FILL+');
  r.tap('LF');
  assert.equal(r.text, 'FILL? N');
  assert.equal(r.blink, false, 'FILL? N flashes only until a button is pressed');
  r.tap('STEP');
  assert.equal(r.path, 'MANUAL');
});

test('PWR-7 no ff: STARTUP_INFO → MANUAL directly', () => {
  const r = new Rig({ config: { ff: false } }).powerOn();
  r.until((x) => x.path === 'STARTUP_INFO.ID', 20000);
  r.advance(1550);
  assert.equal(r.path, 'MANUAL');
});

test('PWR-8 MANUAL is entered at the first item of the current scan list', () => {
  assert.equal(new Rig().boot().item, 'BAT');
  const f = new Rig();
  f.switchTo('F');
  f.boot();
  assert.equal(f.item, 'RPMMAP', 'switch F: first F item on the 800');
  const f7 = new Rig({ config: { model: 700 } });
  f7.switchTo('F');
  f7.boot();
  assert.equal(f7.item, 'REM', 'switch F on the 700 (no RPMMAP)');
});

// ---------------------------------------------------------------- PWR-9 two-minute auto switch

test('PWR-9 MANUAL → AUTO at 120 000 ms after POWER_ON (boundary)', () => {
  const r = new Rig().boot();
  const t = r.now; // power-on was at 0
  r.advance(119950 - t);
  assert.equal(r.path, 'MANUAL');
  r.advance(100);
  assert.equal(r.path, 'AUTO');
});

test('PWR-9 the auto switch is one-shot', () => {
  const r = new Rig().bootAuto();
  r.tap('STEP');
  assert.equal(r.path, 'MANUAL');
  r.advance(300000);
  assert.equal(r.path, 'MANUAL');
});

test('PWR-9 (rev2) power-up sequence still running at 120 s (FILL? N) ends in AUTO', () => {
  const r = new Rig().bootToFill();
  r.advance(125000 - r.now);
  assert.equal(r.path.startsWith('FUEL_FILL'), true);
  r.tap('STEP');
  assert.equal(r.path, 'AUTO');
});

test('PWR-9 (rev2) TANK_SETUP still running at 120 s → sequence ends in AUTO', () => {
  const r = tankSetup();
  r.advance(121000);
  assert.equal(r.path, 'TANK_SETUP.MAIN');
  r.tap('STEP').tap('STEP'); // → SELFTEST
  r.until((x) => x.text.startsWith('FILL'), 20000);
  r.tap('STEP');
  assert.equal(r.path, 'AUTO');
});

test('PWR-9 in LEANFIND at 120 s: no change', () => {
  const r = new Rig().boot();
  r.tap('LF');
  r.advance(125000 - r.now);
  assert.equal(r.path, 'LEANFIND.ARMED');
});

test('PWR-9 in PROGRAM at 120 s: no change; exit returns to the prior mode (MANUAL)', () => {
  const r = new Rig().boot().enterProgram();
  r.advance(125000 - r.now);
  assert.equal(r.state().state, 'PROGRAM');
  r.pgmGoto('PROGRAM.ITEM.END').tap('STEP');
  assert.equal(r.path, 'MANUAL');
  r.advance(60000);
  assert.equal(r.path, 'MANUAL', 'one-shot already consumed');
});

test('PWR-9 in USB at 120 s: no change', () => {
  const r = new Rig().boot();
  r.send({ type: 'USB_INSERT' });
  r.advance(125000 - r.now);
  assert.equal(r.path, 'USB.MENU');
  r.send({ type: 'USB_REMOVE' });
  assert.equal(r.path, 'MANUAL');
});

// ---------------------------------------------------------------- PWR-10 / PWR-11

test('PWR-10 power-on resets exclusions, alarm OFF/snoozes, view, LOP results', () => {
  const r = new Rig().boot();
  r.gotoItem('OIL').tapBoth(); // exclude OIL
  r.hold('LF', 3100); // view N
  r.sensors({ bat: 16.5 }).advance(100);
  r.hold('STEP', 5100); // BATH OFF for the flight
  r.advance(2000);
  assert.equal(r.state().alarm, null);
  assert.deepEqual(r.state().excluded, ['OIL']);
  assert.equal(r.state().view, 'N');
  r.powerOff().advance(1000).boot();
  r.advance(100);
  assert.deepEqual(r.state().excluded, []);
  assert.equal(r.state().view, 'P');
  assert.equal(r.state().alarm, 'BATH', 'OFF cleared at power-on');
  assert.equal(r.state().lopResults, null);
});

test('PWR-11 POWER_OFF from any state → OFF', () => {
  const mk = () => new Rig();
  const cases = [
    (r) => r.powerOn(),
    (r) => r.powerOn().advance(3500),
    (r) => r.bootToFill(),
    (r) => r.boot(),
    (r) => r.bootAuto(),
    (r) => r.boot().tap('LF'),
    (r) => r.boot().enterProgram(),
    (r) => r.boot().send({ type: 'USB_INSERT' }),
    (r) => r.press('STEP').powerOn(),
  ];
  for (const f of cases) {
    const r = mk();
    f(r);
    r.powerOff();
    assert.equal(r.path, 'OFF');
    assert.equal(r.display().power, false);
    assert.equal(r.text, '');
  }
});

test('PWR-11 settings are non-volatile across POWER_OFF/POWER_ON', () => {
  const r = new Rig().boot().enterProgram().pgmGoto('PROGRAM.ITEM.RATE');
  r.tap('LF'); // RATE 3
  r.pgmGoto('PROGRAM.ITEM.END').tap('STEP');
  r.powerOff().boot().enterProgram().pgmGoto('PROGRAM.ITEM.RATE');
  assert.equal(r.text, 'RATE 3');
});

// ---------------------------------------------------------------- SCOPE / IN

test('SCOPE-1 default model is the EDM-800 (upper window, RPMMAP, NRM)', () => {
  const r = new Rig().boot();
  assert.equal(r.upper, '65 HP');
  assert.ok(r.manualList().includes('RPMMAP'));
});

test('SCOPE-2 model variants are selected by configuration', () => {
  assert.doesNotThrow(() => new Rig({ config: { model: 700 } }).boot());
  assert.doesNotThrow(() => new Rig({ config: { model: 800, primary711: true } }).boot());
  assert.doesNotThrow(() => new Rig({ config: { model: 700, primary711: true } }).boot());
});

test('SCOPE-3 EDM-700: no upper window, no RPMMAP, no HP-? item, no MAP/CYL/HP/EC limits, N/P dash indicator', () => {
  const r = new Rig({ config: { model: 700 } }).boot();
  assert.equal(r.upper, '');
  assert.ok(!r.manualList().includes('RPMMAP'));
  assert.equal(r.display().viewStyle, 'NP');
  r.enterProgram();
  const items = r.pgmList();
  assert.ok(!items.includes('PROGRAM.ITEM.HPQ'));
  r.holdBoth(5100).advance(2100);
  const lim = r.pgmList();
  for (const id of ['MAP', 'CYL', 'RHP', 'EC']) assert.ok(!lim.includes(`PROGRAM.FACLIM.${id}`), id);
  assert.ok(lim.includes('PROGRAM.FACLIM.TIT'));
});

test('SCOPE-3 EDM-700 has no MAP alarm', () => {
  const r = new Rig({ config: { model: 700 } }).boot();
  r.sensors({ map: 50 }).advance(200);
  assert.equal(r.state().alarm, null);
  const r8 = new Rig().boot();
  r8.sensors({ map: 50 }).advance(200);
  assert.equal(r8.state().alarm, 'MAP');
});

test('SCOPE-4 EDM-711 (primary711) changes AUTO scan (see p711 tests)', () => {
  const r = new Rig({ config: { primary711: true } }).bootAuto();
  assert.ok(['CHTHI', 'TIT1', 'OIL'].includes(r.item));
});

test('IN-2 one long TICK advances through all timers in order', () => {
  const r = new Rig({ config: { ff: false } }).powerOn();
  r.advance(3000 + 7 * 300 + 4 * 1500 + 100); // single TICK through self-test and startup info
  assert.equal(r.path, 'MANUAL');
  r.advance(120000 - r.now + 4000 + 100); // single TICK: AUTO at 120 s, then first dwell (4 s)
  assert.equal(r.path, 'AUTO');
  assert.equal(r.item, 'OAT');
});

test('IN-3 POWER_OFF → OFF; POWER_ON from OFF restarts the power-up sequence', () => {
  const r = new Rig().boot().gotoItem('OIL');
  r.powerOff();
  assert.equal(r.path, 'OFF');
  r.powerOn();
  assert.equal(r.path, 'SELFTEST.SEGMENTS');
});

test('IN-4 SENSORS frames are merged into the current frame', () => {
  const r = new Rig().boot();
  r.sensors({ bat: 13.7 });
  assert.equal(r.text, '13.7 BAT');
  r.gotoItem('OIL');
  assert.equal(r.text, '185 OIL', 'previous oil value kept');
});

test('IN-5 SELECT_SWITCH default position is A; ignored without ff', () => {
  const r = new Rig().boot();
  const all = r.manualList();
  assert.ok(all.includes('REM') && all.includes('EGT1'));
  const n = new Rig({ config: { ff: false } }).boot();
  n.switchTo('F');
  const list = n.manualList();
  assert.ok(list.includes('EGT1') && list.includes('BAT'));
});

test('IN-7 AMBIENT input changes display brightness', () => {
  const r = new Rig().boot();
  const b0 = r.display().brightness;
  r.send({ type: 'AMBIENT', level: 0.2 }).advance(60000);
  assert.ok(r.display().brightness < b0);
  assert.ok(Math.abs(r.display().brightness - 0.2) < 0.05);
});

test('PWR-9 in a PROGRAM-context fuel fill at 120 s: no change; exit → MANUAL and stays MANUAL', () => {
  const r = new Rig().boot().enterProgram();
  r.tap('LF').tap('STEP'); // FUEL? Y → fill flow (program context)
  r.advance(125000 - r.now);
  assert.ok(r.path.startsWith('FUEL_FILL'));
  r.tap('STEP');
  assert.equal(r.path, 'MANUAL');
  r.advance(30000);
  assert.equal(r.path, 'MANUAL');
});

test('PWR-5 calibration-fault channels are also deleted from the scan', () => {
  const r = new Rig({ sensors: cruiseFrame({ calErr: ['OIL'] }) }).boot();
  assert.ok(!r.manualList().includes('OIL'));
});
