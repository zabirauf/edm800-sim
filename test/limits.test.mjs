// §12.1 Alarm limits / tank capacity list and LIM-1 … LIM-7.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rig, cruiseFrame, num } from './helpers.mjs';

const L = (id) => `PROGRAM.FACLIM.${id}`;

function facLim(opts = {}, pos = null) {
  const r = new Rig(opts);
  if (pos) r.switchTo(pos);
  r.boot().enterProgram().enterFacLim();
  assert.equal(r.path, L('FAC'));
  return r;
}

/** Walk the list from FAC to END collecting [id, text]. */
function walk(r) {
  const out = [];
  for (let i = 0; i < 40; i++) {
    out.push([r.path.split('.').pop(), r.text]);
    if (r.path === L('END')) break;
    r.tap('STEP');
  }
  return out;
}

const exit = (r) => { r.pgmGoto(L('END')); r.tap('STEP'); return r; };

// ---------------------------------------------------------------- list, displays, defaults

test('§12.1 list order and factory-default displays (800, ff, 12 V)', () => {
  assert.deepEqual(walk(facLim()), [
    ['FAC', 'FAC? N'], ['ENG', 'ENG F'], ['HBAT', '16.0 H BAT'], ['LBAT', '12.0 L BAT'], ['DIF', '500 DIF'],
    ['HCHT', '450 H CHT'], ['CLD', '-60 CLD'], ['TIT', '1650 TIT'], ['HOIL', '230 H OIL'], ['LOIL', '90 L OIL'],
    ['MAP', '42.0 MAP'], ['FUNIT', 'FUEL GAL'], ['MAIN', 'MAIN=50'], ['AUXQ', 'AUX? N'], ['MIN', 'MIN =45'],
    ['REMLIM', 'REM =10'], ['CARB', 'CARB? N'], ['RECRD', 'RECRD? Y'], ['CYL', 'CYL=6'], ['RHP', 'HP = 180'],
    ['EC', '14.90= EC'], ['END', 'END Y'],
  ]);
});

test('§12.1 24 V bus: BAT factory defaults 32.0 / 24.0', () => {
  const w = walk(facLim({ config: { busVolts: 24 } }));
  assert.deepEqual(w[2], ['HBAT', '32.0 H BAT']);
  assert.deepEqual(w[3], ['LBAT', '24.0 L BAT']);
});

test('§12.1 without ff: no FUNIT/MAIN/AUXQ/AUX/MIN/REMLIM; TIT/HOIL/LOIL always present (rev2 R14)', () => {
  const ids = walk(facLim({ config: { ff: false, tit: 0, oil: false } })).map((x) => x[0]);
  for (const id of ['FUNIT', 'MAIN', 'AUXQ', 'AUX', 'MIN', 'REMLIM']) assert.ok(!ids.includes(id), id);
  for (const id of ['TIT', 'HOIL', 'LOIL', 'CARB', 'RECRD']) assert.ok(ids.includes(id), id);
});

test('§12.1 AUX item present only with AUX? Y', () => {
  const r = facLim().pgmGoto(L('AUXQ'));
  r.tap('LF');
  assert.equal(r.text, 'AUX? Y');
  r.tap('STEP');
  assert.equal(r.path, L('AUX'));
  assert.equal(r.text, 'AUX=0');
  r.tap('STEP');
  assert.equal(r.path, L('MIN'));
});

test('§12.1 alarm list is not filtered by the select switch (I-22)', () => {
  for (const pos of ['T', 'F']) {
    const ids = walk(facLim({}, pos)).map((x) => x[0]);
    for (const id of ['HBAT', 'HCHT', 'TIT', 'FUNIT', 'MAIN', 'REMLIM', 'CYL']) assert.ok(ids.includes(id), `${pos}:${id}`);
  }
});

// ---------------------------------------------------------------- numeric items: step, tap/hold, clamp

const NUMERIC = [
  // id, default text, after-tap text, after one hold-increment text, min text, max text
  { id: 'HBAT', tap: '15.5 H BAT', inc: '16.5 H BAT', min: '10.0 H BAT', max: '35.0 H BAT', minV: 10.0, maxV: 35.0 },
  { id: 'LBAT', tap: '11.5 L BAT', inc: '12.5 L BAT', min: '8.5 L BAT', max: '30.0 L BAT', minV: 8.5, maxV: 30.0 },
  { id: 'DIF', tap: '490 DIF', inc: '510 DIF', min: '30 DIF', max: '990 DIF', minV: 30, maxV: 990 },
  { id: 'HCHT', tap: '445 H CHT', inc: '455 H CHT', min: '90 H CHT', max: '500 H CHT', minV: 90, maxV: 500 },
  { id: 'CLD', tap: '-65 CLD', inc: '-55 CLD', min: '-200 CLD', max: '-5 CLD', minV: -200, maxV: -5 },
  { id: 'TIT', tap: '1640 TIT', inc: '1660 TIT', min: '650 TIT', max: '2000 TIT', minV: 650, maxV: 2000 },
  { id: 'HOIL', tap: '225 H OIL', inc: '235 H OIL', min: '40 H OIL', max: '500 H OIL', minV: 40, maxV: 500 },
  { id: 'LOIL', tap: '85 L OIL', inc: '95 L OIL', min: '10 L OIL', max: '250 L OIL', minV: 10, maxV: 250 },
  { id: 'MAP', tap: '41.5 MAP', inc: '42.5 MAP', min: '25.0 MAP', max: '90.0 MAP', minV: 25, maxV: 90 },
  { id: 'MAIN', tap: 'MAIN=49', inc: 'MAIN=51', min: 'MAIN=0', max: 'MAIN=999', minV: 0, maxV: 999 },
  { id: 'MIN', tap: 'MIN =44', inc: 'MIN =46', min: 'MIN =0', max: 'MIN =60', minV: 0, maxV: 60 },
  { id: 'REMLIM', tap: 'REM =9', inc: 'REM =11', min: 'REM =0', max: 'REM =200', minV: 0, maxV: 200 },
  { id: 'CYL', tap: 'CYL=5', inc: 'CYL=7', min: 'CYL=4', max: 'CYL=12', minV: 4, maxV: 12 },
  { id: 'RHP', tap: 'HP = 179', inc: 'HP = 181', min: 'HP = 60', max: 'HP = 500', minV: 60, maxV: 500 },
];

for (const n of NUMERIC) {
  test(`§12.1 ${n.id}: tap LF = −step, hold LF = +step`, () => {
    const r = facLim().pgmGoto(L(n.id));
    r.tap('LF');
    assert.equal(r.text, n.tap);
    r.hold('LF', 1000); // +2 steps (700, 900)
    assert.equal(r.text, n.inc);
  });

  test(`§12.1 ${n.id}: range ${n.minV}…${n.maxV} clamps at both ends`, () => {
    const lo = facLim().pgmGoto(L(n.id));
    lo.press('LF').release('LF');
    // drive to the minimum with many taps (fast: 50 ms each)
    for (let i = 0; i < 1100 && lo.text !== n.min; i++) lo.tap('LF', 50);
    assert.equal(lo.text, n.min);
    lo.tap('LF', 50).tap('LF', 50);
    assert.equal(lo.text, n.min, 'no wrap below the minimum');
    const hi = facLim().pgmGoto(L(n.id));
    hi.hold('LF', 60000);
    assert.equal(hi.text, n.max, 'no wrap above the maximum');
  });
}

test('§12.1 AUX range 0…250 (×10 acceleration on a >100-step range)', () => {
  const r = facLim().pgmGoto(L('AUXQ'));
  r.tap('LF').tap('STEP');
  r.hold('LF', 3150);
  assert.equal(r.text, 'AUX=22');
  r.hold('LF', 30000);
  assert.equal(r.text, 'AUX=250');
});

test('§4 ×10 acceleration on wide alarm ranges: TIT (step 10 → 100 after 3 s)', () => {
  const r = facLim().pgmGoto(L('TIT'));
  r.hold('LF', 3150); // 12 × 10 + 1 × 100
  assert.equal(r.text, '1870 TIT');
});

test('§4 no ×10 acceleration on ranges ≤ 100 steps (MIN 0…60)', () => {
  const r = facLim().pgmGoto(L('MIN'));
  r.settings.limits.minLim = 0;
  r.tap('STEP');
  r.pgmGoto(L('END'));
  r.tap('LF').tap('STEP'); // END N → FAC
  r.pgmGoto(L('MIN'));
  assert.equal(r.text, 'MIN =0');
  r.hold('LF', 3350); // 700…3300 → 14 × +1
  assert.equal(r.text, 'MIN =14');
});

test('§12.1 Y/N and list items: FAC, AUXQ, CARB, RECRD toggle; FUNIT cycles GAL→KGS→LTR→LBS→GAL', () => {
  const r = facLim();
  r.tap('LF');
  assert.equal(r.text, 'FAC? Y');
  r.tap('LF');
  assert.equal(r.text, 'FAC? N');
  r.pgmGoto(L('FUNIT'));
  const units = [r.text];
  for (let i = 0; i < 4; i++) { r.tap('LF'); units.push(r.text); }
  assert.deepEqual(units, ['FUEL GAL', 'FUEL KGS', 'FUEL LTR', 'FUEL LBS', 'FUEL GAL']);
  r.pgmGoto(L('CARB')).tap('LF');
  assert.equal(r.text, 'CARB? Y');
  r.pgmGoto(L('RECRD')).tap('LF');
  assert.equal(r.text, 'RECRD? N');
});

test('§12.1 EC: BOTH_HOLD_5S → EC_EDIT digit edit; value clamped to 12.00…16.00 on save', () => {
  const r = facLim().pgmGoto(L('EC'));
  r.holdBoth(5100);
  assert.equal(r.path, 'PROGRAM.EC_EDIT');
  assert.equal(r.display().digital.flashIndex, 0);
  r.hold('LF', 800); // 1 → 2: 24.90
  assert.match(r.text, /^24\.90/);
  r.holdBoth(5100);
  assert.equal(r.path, L('EC'));
  assert.equal(r.text, '16.00= EC');
  r.holdBoth(5100);
  r.taps('LF', 2); // 1 → 0 → 9: 96.00 → clamp... first digit
  r.tap('STEP').taps('LF', 6); // 6 → 0 … second digit 0
  r.holdBoth(5100);
  assert.equal(r.text, '16.00= EC');
  r.holdBoth(5100);
  r.tap('LF'); // 1 → 0 : 06.00 → clamp 12.00
  r.holdBoth(5100);
  assert.equal(r.text, '12.00= EC');
});

test('§12.1 EC digit edit within range is saved exactly', () => {
  const r = facLim().pgmGoto(L('EC'));
  r.holdBoth(5100);
  r.tap('STEP'); // second digit 4
  r.tap('LF'); // 3 → 13.90
  r.holdBoth(5100);
  assert.equal(r.text, '13.90= EC');
});

test('§12.1 END: Y + STEP exits programming to the prior mode; N + STEP → FAC', () => {
  const r = facLim().pgmGoto(L('END'));
  r.tap('LF');
  assert.equal(r.text, 'END N');
  r.tap('STEP');
  assert.equal(r.path, L('FAC'));
  r.pgmGoto(L('END'));
  assert.equal(r.text, 'END Y');
  r.tap('STEP');
  assert.equal(r.path, 'MANUAL');
});

test('§12.1 FAC? Y + STEP restores factory alarm limits', () => {
  const r = facLim().pgmGoto(L('HBAT'));
  r.tap('LF'); // 15.5
  r.pgmGoto(L('END')).tap('LF').tap('STEP'); // END N → FAC
  r.tap('LF').tap('STEP'); // FAC? Y
  r.pgmGoto(L('HBAT'));
  assert.equal(r.text, '16.0 H BAT');
});

test('§12.1 changed limits take effect for alarms (H BAT 15.0)', () => {
  const r = facLim().pgmGoto(L('HBAT'));
  r.taps('LF', 2); // 15.0
  exit(r);
  r.sensors({ bat: 15.1 }).advance(100);
  assert.equal(r.state().alarm, 'BATH');
});

// ---------------------------------------------------------------- LIM-1 … LIM-7

function toC(r) {
  r.pgmGoto(L('ENG')).tap('LF');
  assert.equal(r.text, 'ENG C');
  return r;
}

test('LIM-1 / LIM-7 ENG C: temperature limits reset immediately to °C factory values', () => {
  const r = facLim().pgmGoto(L('HCHT'));
  r.tap('LF'); // 445 (to prove the reset)
  r.pgmGoto(L('END')).tap('LF').tap('STEP'); // → FAC
  toC(r);
  const w = new Map(walk(r));
  assert.equal(w.get('DIF'), '280 DIF');
  assert.equal(w.get('HCHT'), '230 H CHT');
  assert.equal(w.get('CLD'), '-33 CLD');
  assert.equal(w.get('TIT'), '900 TIT');
  assert.equal(w.get('HOIL'), '110 H OIL');
  assert.equal(w.get('LOIL'), '32 L OIL');
});

test('LIM-1 °C limits step 1 °C and use converted ranges (H CHT 32…260)', () => {
  const r = toC(facLim()).pgmGoto(L('HCHT'));
  r.tap('LF');
  assert.equal(r.text, '229 H CHT');
  r.hold('LF', 10000);
  assert.equal(r.text, '260 H CHT');
  const t = toC(facLim()).pgmGoto(L('TIT'));
  t.hold('LF', 30000);
  assert.equal(t.text, '1093 TIT');
  const d = toC(facLim()).pgmGoto(L('DIF'));
  d.hold('LF', 60000);
  assert.equal(d.text, '550 DIF'); // 990 °F difference × 5/9
});

test('LIM-1 °C alarms compare against °C limits (CHT > 230 °C)', () => {
  const r = facLim();
  toC(r);
  exit(r);
  r.sensors({ cht: [350, 360, 340, 355, 440, 352] }).advance(100); // 440 °F = 226.7 °C
  assert.equal(r.state().alarm, null);
  r.sensors({ cht: [350, 360, 340, 355, 448, 352] }).advance(100); // 231.1 °C
  assert.equal(r.state().alarm, 'CHT');
  assert.equal(r.text, '231 CHT');
});

test('LIM-2 fuel unit change does not convert stored quantities; flow shown in new unit', () => {
  const r = facLim({ sensors: cruiseFrame({ ffGph: 0 }), settings: { rem: 50, main: 50 } });
  r.pgmGoto(L('FUNIT')).tap('LF').tap('LF'); // LTR
  assert.equal(r.text, 'FUEL LTR');
  r.tap('STEP');
  assert.equal(r.text, 'MAIN=50');
  exit(r);
  r.gotoItem('REM');
  assert.equal(r.text, '50.0 REM');
  r.sensors({ ffGph: 10 });
  r.gotoItem('GPH');
  assert.equal(r.text, '37.9 LPH');
});

test('LIM-3 FAC? Y restores alarm limits only (not units, tanks, CARB, RECRD, CYL, HP, EC)', () => {
  const r = facLim();
  r.pgmGoto(L('DIF')).tap('LF');
  r.pgmGoto(L('MAP')).tap('LF');
  r.pgmGoto(L('FUNIT')).tap('LF'); // KGS
  r.pgmGoto(L('MAIN')).tap('LF'); // 49
  r.pgmGoto(L('MIN')).tap('LF'); // 44
  r.pgmGoto(L('REMLIM')).tap('LF'); // 9
  r.pgmGoto(L('CARB')).tap('LF'); // Y
  r.pgmGoto(L('RECRD')).tap('LF'); // N
  r.pgmGoto(L('CYL')).tap('LF'); // 5
  r.pgmGoto(L('RHP')).tap('LF'); // 179
  r.pgmGoto(L('END')).tap('LF').tap('STEP');
  r.tap('LF').tap('STEP'); // FAC? Y
  const w = new Map(walk(r));
  assert.equal(w.get('DIF'), '500 DIF');
  assert.equal(w.get('MAP'), '42.0 MAP');
  assert.equal(w.get('MIN'), 'MIN =45');
  assert.equal(w.get('REMLIM'), 'REM =10');
  assert.equal(w.get('FUNIT'), 'FUEL KGS');
  assert.equal(w.get('MAIN'), 'MAIN=49');
  assert.equal(w.get('CARB'), 'CARB? Y');
  assert.equal(w.get('RECRD'), 'RECRD? N');
  assert.equal(w.get('CYL'), 'CYL=5');
  assert.equal(w.get('RHP'), 'HP = 179');
});

test('LIM-5 RECRD? N → long-term memory does not record (FULL stays 0)', () => {
  for (const recrd of [true, false]) {
    const r = new Rig({ settings: { recrd } }).boot();
    r.advance(13 * 60000);
    r.powerOff().powerOn();
    r.until((x) => x.path === 'STARTUP_INFO.FULL', 20000);
    assert.equal(r.text, recrd ? 'FULL 1' : 'FULL 0');
  }
});

test('LIM-6 CYL and rated HP are stored only (column count and upper window unchanged)', () => {
  const r = facLim();
  r.pgmGoto(L('CYL')).taps('LF', 2); // CYL=4
  r.pgmGoto(L('RHP')).hold('LF', 3000);
  exit(r);
  assert.equal(r.columns.length, 7);
  assert.equal(r.upper, '65 HP');
  assert.equal(r.manualList().filter((x) => x.startsWith('EGT')).length, 6);
});

// ×10 acceleration applies only to ranges with more than 100 steps (§4)
const ACCEL = [
  // id, ranges: steps; hold 3150 → 12 increments of 1 step, then the 3100 ms increment is ×10 if > 100 steps
  { id: 'DIF', steps: 96, start: 500, step: 10, fmt: (v) => `${v} DIF` },
  { id: 'HOIL', steps: 92, start: 230, step: 5, fmt: (v) => `${v} H OIL` },
  { id: 'LBAT', steps: 43, start: 12.0, step: 0.5, fmt: (v) => `${v.toFixed(1)} L BAT` },
  { id: 'MAP', steps: 130, start: 42.0, step: 0.5, fmt: (v) => `${v.toFixed(1)} MAP` },
  { id: 'REMLIM', steps: 200, start: 10, step: 1, fmt: (v) => `REM =${v}` },
  { id: 'RHP', steps: 440, start: 180, step: 1, fmt: (v) => `HP = ${v}` },
];
for (const a of ACCEL) {
  test(`§4 hold-repeat acceleration for ${a.id} (${a.steps} steps → ${a.steps > 100 ? '×10' : 'no ×10'} after 3 s)`, () => {
    const r = facLim().pgmGoto(L(a.id));
    r.hold('LF', 3150);
    const exp = a.start + 12 * a.step + (a.steps > 100 ? 10 : 1) * a.step;
    assert.equal(r.text, a.fmt(exp));
  });
}

test('LIM-7 ENG toggled back to F resets limits to °F factory values', () => {
  const r = facLim().pgmGoto(L('ENG'));
  r.tap('LF').tap('LF');
  assert.equal(r.text, 'ENG F');
  r.tap('STEP').tap('STEP').tap('STEP');
  assert.equal(r.text, '500 DIF');
  r.tap('STEP');
  assert.equal(r.text, '450 H CHT');
});
