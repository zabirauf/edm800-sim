// §7.1 scan list (SCAN-1 … SCAN-4), §7.2 digital formats, FMT-1 … FMT-3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rig, cruiseFrame } from './helpers.mjs';

const EGTS6 = ['EGT1', 'EGT2', 'EGT3', 'EGT4', 'EGT5', 'EGT6'];
const FULL_A = ['BAT', 'OAT', 'DIF', 'RPMMAP', 'REM', 'REQ', 'RES', 'MPG', 'HM', 'GPH', 'USD', ...EGTS6, 'TIT1', 'OIL', 'CLD'];

function listFor({ config = {}, sensors = {}, pos = null, settings = null } = {}) {
  const r = new Rig({ config, sensors: cruiseFrame(sensors), settings });
  if (pos) r.switchTo(pos);
  r.boot();
  return r.manualList();
}

// ---------------------------------------------------------------- §7.1 order / presence

test('SCAN §7.1 default 800 scan list order (switch A, GPS ok)', () => {
  assert.deepEqual(listFor(), FULL_A);
});

test('SCAN-2 select switch T shows only T items', () => {
  assert.deepEqual(listFor({ pos: 'T' }), ['BAT', 'OAT', 'DIF', 'RPMMAP', ...EGTS6, 'TIT1', 'OIL', 'CLD']);
});

test('SCAN-2 select switch F shows only F items', () => {
  assert.deepEqual(listFor({ pos: 'F' }), ['RPMMAP', 'REM', 'REQ', 'RES', 'MPG', 'HM', 'GPH', 'USD']);
});

test('SCAN-2 select switch F on the 700 (no RPMMAP)', () => {
  assert.deepEqual(listFor({ pos: 'F', config: { model: 700 } }), ['REM', 'REQ', 'RES', 'MPG', 'HM', 'GPH', 'USD']);
});

test('SCAN-1 without ff: no select switch; all non-FF items present regardless of switch', () => {
  const exp = ['BAT', 'OAT', 'DIF', 'RPMMAP', ...EGTS6, 'TIT1', 'OIL', 'CLD'];
  assert.deepEqual(listFor({ config: { ff: false } }), exp);
  assert.deepEqual(listFor({ config: { ff: false }, pos: 'F' }), exp);
});

test('§7.1 GPS status off: no GPSMSG/REQ/RES/MPG', () => {
  const l = listFor({ sensors: { gps: { status: 'off', offCourse: false, gs: 0, dist: 0 } } });
  assert.deepEqual(l.slice(4, 8), ['REM', 'HM', 'GPH', 'USD']);
});

test('§7.1 GPS status nocom / nosig: GPSMSG after REM, no REQ/RES/MPG', () => {
  for (const status of ['nocom', 'nosig']) {
    const l = listFor({ sensors: { gps: { status, offCourse: false, gs: 0, dist: 0 } } });
    assert.deepEqual(l.slice(4, 9), ['REM', 'GPSMSG', 'HM', 'GPH', 'USD'], status);
  }
});

test('§7.1 GPS status nowpt: GPSMSG and MPG, no REQ/RES', () => {
  const l = listFor({ sensors: { gps: { status: 'nowpt', offCourse: false, gs: 150, dist: 0 } } });
  assert.deepEqual(l.slice(4, 10), ['REM', 'GPSMSG', 'MPG', 'HM', 'GPH', 'USD']);
});

test('§7.1 gps not installed: no GPS items even with status ok', () => {
  const l = listFor({ config: { gps: false } });
  assert.deepEqual(l.slice(4, 8), ['REM', 'HM', 'GPH', 'USD']);
});

test('§7.1 IAT / CDT / CRB options; CDT installed suppresses CRB', () => {
  assert.deepEqual(listFor({ config: { iat: true, crb: true } }).slice(0, 5), ['BAT', 'OAT', 'IAT', 'CRB', 'DIF']);
  assert.deepEqual(listFor({ config: { iat: true, cdt: true, crb: true } }).slice(0, 5), ['BAT', 'OAT', 'IAT', 'CDT', 'DIF']);
});

test('§7.1 no OAT option → no OAT item', () => {
  assert.ok(!listFor({ config: { oat: false } }).includes('OAT'));
});

test('§7.1 tit=2 → TIT1 and TIT2 items; tit=0 → none', () => {
  const l2 = listFor({ config: { tit: 2 } });
  assert.deepEqual(l2.slice(-5), ['EGT6', 'TIT1', 'TIT2', 'OIL', 'CLD']);
  const l0 = listFor({ config: { tit: 0 } });
  assert.ok(!l0.includes('TIT1') && !l0.includes('TIT2'));
});

test('§7.1 no OIL option → no OIL item; 4 cylinders → EGT1..EGT4', () => {
  const l = listFor({ config: { oil: false, cylinders: 4 } });
  assert.ok(!l.includes('OIL'));
  assert.deepEqual(l.filter((x) => x.startsWith('EGT')), ['EGT1', 'EGT2', 'EGT3', 'EGT4']);
});

test('SCAN-3 failed probes: EGTn absent only if both EGT and CHT failed; DIF needs ≥2 EGTs; CLD needs ≥1 CHT', () => {
  const l = listFor({ sensors: { failed: ['EGT3', 'CHT3', 'EGT4', 'TIT1'] } });
  assert.ok(!l.includes('EGT3'));
  assert.ok(l.includes('EGT4'));
  assert.ok(!l.includes('TIT1'));
  const one = listFor({ sensors: { failed: ['EGT1', 'EGT2', 'EGT3', 'EGT4', 'EGT5'] } });
  assert.ok(!one.includes('DIF'), 'only one working EGT');
  const two = listFor({ sensors: { failed: ['EGT1', 'EGT2', 'EGT3', 'EGT4'] } });
  assert.ok(two.includes('DIF'));
  const noCht = listFor({ sensors: { failed: ['CHT1', 'CHT2', 'CHT3', 'CHT4', 'CHT5', 'CHT6'] } });
  assert.ok(!noCht.includes('CLD'));
  assert.ok(noCht.includes('EGT1'));
});

test('SCAN-3 failed IAT/CDT/CRB/OAT/OIL probes never appear', () => {
  const l = listFor({ config: { iat: true, cdt: true }, sensors: { failed: ['IAT', 'CDT', 'OAT', 'OIL'] } });
  for (const id of ['IAT', 'CDT', 'OAT', 'OIL']) assert.ok(!l.includes(id), id);
});

// ---------------------------------------------------------------- SCAN-4 fix-up

test('SCAN-4 current item disappears (probe fails) → next present item', () => {
  const r = new Rig().boot().gotoItem('OAT');
  r.sensors({ failed: ['OAT'] }).advance(100);
  assert.equal(r.item, 'DIF');
});

test('SCAN-4 switch moved and current item gone → next present item in list order (wrapping)', () => {
  const r = new Rig().boot().gotoItem('EGT3');
  r.switchTo('F').advance(100);
  assert.equal(r.item, 'RPMMAP');
  const r2 = new Rig().boot().gotoItem('USD');
  r2.switchTo('T').advance(100);
  assert.equal(r2.item, 'EGT1');
});

test('SCAN-4 GPS status change removes REQ → next present (MPG with nowpt)', () => {
  const r = new Rig().boot().gotoItem('REQ');
  r.sensors({ gps: { status: 'nowpt', offCourse: false, gs: 150, dist: 0 } }).advance(100);
  assert.equal(r.item, 'MPG');
});

test('SCAN-4 fix-up also applies in AUTO', () => {
  const r = new Rig().bootAuto();
  r.until((x) => x.item === 'OAT', 10000);
  r.sensors({ failed: ['OAT'] }).advance(100);
  assert.equal(r.item, 'DIF');
});

// ---------------------------------------------------------------- §7.2 formats

test('§7.2 BAT: v.v BAT', () => {
  const r = new Rig().boot();
  r.sensors({ bat: 14.16 });
  assert.equal(r.text, '14.2 BAT');
  r.sensors({ bat: 9 });
  assert.equal(r.text, '9.0 BAT');
});

test('§7.2 OAT: t OAT in OAT unit; °C conversion', () => {
  const r = new Rig({ sensors: cruiseFrame({ oat: 81 }) }).boot().gotoItem('OAT');
  assert.equal(r.text, '81 OAT');
  r.settings.oatUnit = 'C';
  assert.equal(r.text, '27 OAT');
});

test('§7.2 IAT / CDT / CRB formats', () => {
  const r = new Rig({ config: { iat: true, crb: true }, sensors: cruiseFrame({ iat: 95, crb: -22 }) }).boot();
  r.gotoItem('IAT');
  assert.equal(r.text, '95 IAT');
  r.gotoItem('CRB');
  assert.equal(r.text, '-22 CRB');
  const c = new Rig({ config: { cdt: true }, sensors: cruiseFrame({ cdt: 210 }) }).boot().gotoItem('CDT');
  assert.equal(c.text, '210 CDT');
});

test('§7.2 DIF: d DIF with dot at the cylinder deviating most from the mean (CALC-6 max−min)', () => {
  const r = new Rig().boot().gotoItem('DIF');
  // egt 1340 1360 1320 1350 1330 1345: max−min = 40; mean 1340.8 → cyl 3 (1320) deviates most
  assert.equal(r.text, '40 DIF');
  assert.equal(r.dot.index, 2);
});

test('§7.2 RPMMAP: RPM rounded to 10, MAP one decimal', () => {
  const r = new Rig({ sensors: cruiseFrame({ rpm: 2447, map: 23.14 }) }).boot().gotoItem('RPMMAP');
  assert.equal(r.text, '2450 23.1');
});

test('§7.2 REM/REQ/RES/USD use the fuel format with labels', () => {
  const r = new Rig({ sensors: cruiseFrame({ ffGph: 0 }), settings: { rem: 37.2, usd: 12.34 } }).boot();
  r.gotoItem('REM');
  assert.equal(r.text, '37.2 REM');
  r.gotoItem('USD');
  assert.equal(r.text, '12.3 USD');
});

test('§7.2 / CALC-4 REQ and RES with GPS ok', () => {
  const r = new Rig({ sensors: cruiseFrame({ ffGph: 0, gps: { status: 'ok', offCourse: false, gs: 150, dist: 100 } }), settings: { rem: 50 } }).boot();
  r.sensors({ ffGph: 12.5 });
  r.gotoItem('REQ');
  assert.equal(r.text, '8.3 REQ'); // 100/150 × 12.5
  r.tap('STEP');
  assert.equal(r.item, 'RES');
  assert.equal(r.text, '41.7 RES'); // 50 − 8.33
});

test('§7.2 REQ/RES off course → --- REQ / --- RES', () => {
  const r = new Rig({ sensors: cruiseFrame({ gps: { status: 'ok', offCourse: true, gs: 150, dist: 100 } }) }).boot();
  r.gotoItem('REQ');
  assert.equal(r.text, '--- REQ');
  r.tap('STEP');
  assert.equal(r.text, '--- RES');
});

test('§7.2 GPSMSG texts NO-COM / NO-SIG / NO-WPT', () => {
  const exp = { nocom: 'NO-COM', nosig: 'NO-SIG', nowpt: 'NO-WPT' };
  for (const [status, text] of Object.entries(exp)) {
    const r = new Rig({ sensors: cruiseFrame({ gps: { status, offCourse: false, gs: 150, dist: 50 } }) }).boot();
    r.gotoItem('GPSMSG');
    assert.equal(r.text, text);
  }
});

test('§7.2 / CALC-4 MPG = groundspeed / flow; label per fuel unit', () => {
  const r = new Rig({ sensors: cruiseFrame({ gps: { status: 'ok', offCourse: false, gs: 162.5, dist: 100 } }) }).boot();
  r.gotoItem('MPG');
  assert.equal(r.text, '13.0 MPG');
  r.settings.fuelUnit = 'LTR';
  assert.equal(r.text, `${(162.5 / (12.5 * 3.785)).toFixed(1)} MPL`);
  r.settings.fuelUnit = 'KGS';
  assert.match(r.text, / MPK$/);
  r.settings.fuelUnit = 'LBS';
  assert.match(r.text, / MPP$/);
});

test('§7.2 / CALC-3 HM: HH.MM H.M endurance at current flow', () => {
  const r = new Rig({ sensors: cruiseFrame({ ffGph: 0 }), settings: { rem: 34.4 } }).boot().gotoItem('HM');
  assert.equal(r.text, '--- H.M', 'flow 0 → ---');
  r.sensors({ ffGph: 12.5 });
  assert.equal(r.text, '02.45 H.M'); // 34.4/12.5 = 2.752 h
  r.sensors({ ffGph: 0.4 });
  assert.equal(r.text, '--- H.M', 'flow below 0.5');
  r.sensors({ ffGph: 12.5, ffSignal: false });
  assert.equal(r.text, '--- H.M', 'no transducer signal');
});

test('§7.2 GPH: r.r GPH; 0.0 below 0.5; --- without signal; unit labels', () => {
  const r = new Rig().boot().gotoItem('GPH');
  assert.equal(r.text, '12.5 GPH');
  r.sensors({ ffGph: 0.4 });
  assert.equal(r.text, '0.0 GPH');
  r.sensors({ ffGph: 12.5, ffSignal: false });
  assert.equal(r.text, '--- GPH');
  r.sensors({ ffSignal: true });
  r.settings.fuelUnit = 'LTR';
  assert.equal(r.text, '47.3 LPH');
  r.settings.fuelUnit = 'LBS';
  assert.equal(r.text, '75.0 PPH');
  r.settings.fuelUnit = 'KGS';
  assert.equal(r.text, '34.0 KPH');
});

test('§7.2 EGTn: egt cht, EGT rounded to 10°, dot under cylinder n', () => {
  const r = new Rig({ sensors: cruiseFrame({ egt: [1343, 1360, 1320, 1350, 1330, 1345], cht: [376, 360, 340, 355, 345, 352] }) }).boot();
  r.gotoItem('EGT1');
  assert.equal(r.text, '1340 376');
  assert.deepEqual(r.dot, { index: 0, blink: false });
  r.tap('STEP');
  assert.equal(r.dot.index, 1);
});

test('§7.2 EGTn with EGT 1?Y shows 1° resolution', () => {
  const r = new Rig({ sensors: cruiseFrame({ egt: [1343, 1360, 1320, 1350, 1330, 1345] }), settings: { egt1: true } }).boot();
  r.gotoItem('EGT1');
  assert.equal(r.text, '1343 350');
});

test('§7.2 EGTn failed side blank', () => {
  const r = new Rig({ sensors: cruiseFrame({ failed: ['EGT2', 'CHT3'] }) }).boot();
  r.gotoItem('EGT2');
  assert.equal(r.text.trim(), '360');
  assert.ok(!r.text.includes('1360'));
  r.gotoItem('EGT3');
  assert.equal(r.text.trim(), '1320');
});

test('§7.2 (rev2 R10) TIT and DIF are 1° even with EGT 1?N', () => {
  const r = new Rig({ sensors: cruiseFrame({ tit: [1373, 1400], egt: [1343, 1361, 1320, 1350, 1330, 1345] }) }).boot();
  r.gotoItem('DIF');
  assert.equal(r.text, '41 DIF');
  r.gotoItem('TIT1');
  assert.equal(r.text, '1373 12.5');
});

test('§7.2 TIT1 with ff: tit ff (one decimal); without ff: tit TIT; TIT2: tit TI2', () => {
  const r = new Rig({ config: { tit: 2 }, sensors: cruiseFrame({ tit: [1370, 1388], ffGph: 13.5 }) }).boot();
  r.gotoItem('TIT1');
  assert.equal(r.text, '1370 13.5');
  r.tap('STEP');
  assert.equal(r.text, '1388 TI2');
  const n = new Rig({ config: { ff: false }, sensors: cruiseFrame({ tit: [1370, 0] }) }).boot().gotoItem('TIT1');
  assert.equal(n.text, '1370 TIT');
});

test('§7.2 OIL: t OIL', () => {
  const r = new Rig({ sensors: cruiseFrame({ oil: 178 }) }).boot().gotoItem('OIL');
  assert.equal(r.text, '178 OIL');
});

test('§7.2 CLD: 0 when no cylinder is cooling', () => {
  const r = new Rig().boot();
  r.advance(35000).gotoItem('CLD');
  assert.equal(r.text, '0 CLD');
});

test('§7.2 / CALC-5 CLD: most negative CHT rate in °/min over 30 s, dot at that cylinder', () => {
  const r = new Rig().boot().gotoItem('CLD');
  r.advance(35000); // steady history
  const base = [350, 360, 340, 355, 345, 352];
  // cylinder 2 drops 15 °F over 30 s (−30 °/min); cylinder 5 drops 5 °F (−10 °/min)
  r.ramp(30000, (t) => ({ cht: base.map((v, i) => (i === 1 ? v - (15 * t) / 30000 : i === 4 ? v - (5 * t) / 30000 : v)) }), 500);
  const v = Number(r.text.split(' ')[0]);
  assert.ok(Math.abs(v - -30) <= 2, `CLD ${r.text}`);
  assert.match(r.text, / CLD$/);
  assert.equal(r.dot.index, 1);
});

// ---------------------------------------------------------------- FMT-1 … FMT-3

test('FMT-1 fuel format: |v|<100 one decimal, leading 0 suppressed; ≥100 integer', () => {
  const cases = [[0, '.0'], [0.5, '.5'], [37.2, '37.2'], [99.4, '99.4'], [150.4, '150'], [100, '100'], [512.6, '513']];
  for (const [rem, s] of cases) {
    const r = new Rig({ sensors: cruiseFrame({ ffGph: 0 }), settings: { rem } }).boot().gotoItem('REM');
    assert.equal(r.text, `${s} REM`, `REM ${rem}`);
  }
});

test('FMT-1 negative fuel values (RES < 0) keep one decimal with leading 0 suppressed', () => {
  const r = new Rig({ sensors: cruiseFrame({ ffGph: 0, gps: { status: 'ok', offCourse: false, gs: 150, dist: 100 } }), settings: { rem: 5 } }).boot();
  r.sensors({ ffGph: 12.5 });
  r.gotoItem('RES');
  assert.equal(r.text, '-3.3 RES'); // 5 − 8.33
  r.sensors({ ffGph: 8.25 }); // REQ 5.5 → RES −0.5
  assert.equal(r.text, '-.5 RES');
});

test('FMT-2 excluded items show a decimal point before the label; EGTn before the CHT field', () => {
  const r = new Rig({ sensors: cruiseFrame({ oil: 184 }) }).boot();
  r.gotoItem('OIL').tapBoth();
  assert.equal(r.text, '184 .OIL');
  r.gotoItem('EGT1').tapBoth();
  assert.equal(r.text, '1340 .350');
  r.gotoItem('BAT').tapBoth();
  assert.equal(r.text, '14.1 .BAT');
});

function engC(r) {
  r.enterProgram().enterFacLim().pgmGoto('PROGRAM.FACLIM.ENG');
  r.tap('LF');
  assert.equal(r.text, 'ENG C');
  r.pgmGoto('PROGRAM.FACLIM.END').tap('STEP');
  return r;
}

test('FMT-3 °C display: temperatures converted from °F, DIF ×5/9; OAT follows its own unit', () => {
  const r = engC(new Rig().boot());
  assert.equal(r.path, 'MANUAL');
  r.gotoItem('OAT');
  assert.equal(r.text, '59 OAT', 'OAT stays in the OAT F/C setting');
  r.gotoItem('DIF');
  assert.equal(r.text, '22 DIF'); // 40 × 5/9
  r.gotoItem('EGT1');
  assert.equal(r.text, '730 177'); // 1340 °F → 726.7 → 730; 350 °F → 176.7
  r.gotoItem('TIT1');
  assert.equal(r.text, '788 12.5'); // 1450 °F → 787.8
  r.gotoItem('OIL');
  assert.equal(r.text, '85 OIL');
  assert.equal(r.display().unit, 'C');
});

test('FMT-3 °C CLD uses ×5/9 of the °F/min rate', () => {
  const r = engC(new Rig().boot());
  r.gotoItem('CLD').advance(35000);
  const base = [350, 360, 340, 355, 345, 352];
  r.ramp(30000, (t) => ({ cht: base.map((v, i) => (i === 0 ? v - (27 * t) / 30000 : v)) }), 500); // −54 °F/min
  const v = Number(r.text.split(' ')[0]);
  assert.ok(Math.abs(v - -30) <= 2, `CLD ${r.text}`); // −54 × 5/9 = −30
});
