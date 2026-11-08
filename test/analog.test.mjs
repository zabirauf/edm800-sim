// §8 Analog display (ANA-1 … ANA-13).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rig, cruiseFrame, pctSegs, chtSeg } from './helpers.mjs';

test('ANA-1 one column per cylinder plus T column (TIT installed), label T, id T', () => {
  const r = new Rig().boot();
  assert.deepEqual(r.columns.map((c) => c.id), ['1', '2', '3', '4', '5', '6', 'T']);
  assert.deepEqual(r.columns.map((c) => c.label), ['1', '2', '3', '4', '5', '6', 'T']);
});

test('ANA-1 OIL only (no TIT): last column id T with blank label shows OIL', () => {
  const r = new Rig({ config: { tit: 0, oil: true } }).boot();
  const t = r.col('T');
  assert.ok(t);
  assert.equal(t.label, '');
  assert.equal(t.segs, pctSegs(185, 230));
});

test('ANA-1 neither TIT nor OIL: no last column; 4 cylinders → 4 columns', () => {
  const r = new Rig({ config: { tit: 0, oil: false, cylinders: 4 } }).boot();
  assert.deepEqual(r.columns.map((c) => c.id), ['1', '2', '3', '4']);
});

test('ANA-1 / ANA-6 TIT and OIL: OIL shown as a missing segment in the T column (Percentage vs H OIL)', () => {
  const r = new Rig({ sensors: cruiseFrame({ oil: 185 }) }).boot();
  assert.equal(r.col('T').oilSeg, pctSegs(185, 230)); // 8
  assert.equal(r.col('T').oilSeg, 8);
  r.sensors({ oil: 225 });
  assert.equal(r.col('T').oilSeg, pctSegs(225, 230));
});

test('ANA-2 columns have 13 segments (full scale 13)', () => {
  const r = new Rig({ sensors: cruiseFrame({ egt: [1650, 1700, 1320, 1350, 1330, 1345] }) }).boot();
  assert.equal(r.col(1).segs, 13);
  assert.equal(r.col(2).segs, 13);
});

test('ANA-3 Percentage view: segment formula against the TIT limit (red line 1650)', () => {
  const egt = [1340, 1360, 1320, 1350, 1330, 1345];
  const r = new Rig({ sensors: cruiseFrame({ egt }) }).boot();
  egt.forEach((v, i) => assert.equal(r.col(i + 1).segs, pctSegs(v, 1650), `cyl ${i + 1}`));
  assert.equal(r.col(1).segs, 8); // (1340/1650 − .5)/(.5/12) = 7.49 → 7 + 1
  assert.equal(r.col('T').segs, pctSegs(1450, 1650)); // TIT column
  assert.equal(r.col('T').segs, 10);
});

test('ANA-3 boundary: EGT at exactly 50 % of red line lights 1 segment, below lights 0', () => {
  const r = new Rig({ sensors: cruiseFrame({ egt: [825, 824, 1650, 1000, 1100, 1200] }) }).boot();
  assert.equal(r.col(1).segs, 1);
  assert.equal(r.col(2).segs, 0);
  assert.equal(r.col(3).segs, 13);
  assert.equal(r.col(4).segs, pctSegs(1000, 1650));
});

test('ANA-3 / LIM-4 the TIT limit sets the bar-graph full scale', () => {
  const r = new Rig({ settings: { limits: { tit: 1500 } } }).boot();
  assert.equal(r.col(1).segs, pctSegs(1340, 1500));
  assert.notEqual(pctSegs(1340, 1500), pctSegs(1340, 1650));
  assert.equal(r.col(1).segs, 10); // (1340/1500 − .5)/(.5/12) = 9.44 → 9 + 1
});

test('ANA-3 OIL-only last column scale uses the H OIL limit', () => {
  const r = new Rig({ config: { tit: 0 }, sensors: cruiseFrame({ oil: 115 }) }).boot();
  assert.equal(r.col('T').segs, 1); // exactly 50 % of 230
  r.sensors({ oil: 114 });
  assert.equal(r.col('T').segs, 0);
  r.sensors({ oil: 230 });
  assert.equal(r.col('T').segs, 13);
});

test('ANA-4 Normalize view: reference = value on entry → 7 segments; 10 °F per segment; clamp 0..13', () => {
  const egt = [1340, 1360, 1320, 1350, 1330, 1345];
  const r = new Rig({ sensors: cruiseFrame({ egt }) }).boot();
  r.hold('LF', 3100);
  assert.equal(r.state().view, 'N');
  assert.equal(r.display().view, 'N');
  for (let i = 1; i <= 6; i++) assert.equal(r.col(i).segs, 7, `cyl ${i}`);
  assert.equal(r.col('T').segs, 7, 'TIT normalized');
  r.sensors({ egt: [1370, 1280, 1390, 1374, 1330, 1345], tit: [1470, 1400] });
  assert.equal(r.col(1).segs, 10); // +30
  assert.equal(r.col(2).segs, 0); // −80 → −1 → 0
  assert.equal(r.col(3).segs, 13); // +70 → 14 → 13
  assert.equal(r.col(4).segs, 9); // +24 → 2
  assert.equal(r.col(5).segs, 7);
  assert.equal(r.col('T').segs, 9); // TIT +20
});

test('ANA-4 OIL column is not normalized (OIL-only last column and OIL segment)', () => {
  const r = new Rig({ config: { tit: 0 } }).boot();
  r.hold('LF', 3100);
  assert.equal(r.col('T').segs, pctSegs(185, 230));
  const t = new Rig().boot();
  t.hold('LF', 3100);
  assert.equal(t.col('T').oilSeg, pctSegs(185, 230));
});

test('ANA-4 reference recaptured on each entry into Normalize', () => {
  const r = new Rig().boot();
  r.hold('LF', 3100); // N
  r.sensors({ egt: [1400, 1360, 1320, 1350, 1330, 1345] });
  assert.equal(r.col(1).segs, 13);
  r.hold('LF', 3100); // P
  r.hold('LF', 3100); // N again → new reference 1400
  assert.equal(r.col(1).segs, 7);
});

test('ANA-4 view indicator: NRM style on the 800, N/P dash style on the 700', () => {
  assert.equal(new Rig().boot().display().viewStyle, 'NRM');
  const s = new Rig({ config: { model: 700 } }).boot();
  s.hold('LF', 3100);
  assert.equal(s.display().view, 'N');
  assert.equal(s.display().viewStyle, 'NP');
});

test('ANA-5 CHT missing segment k = round((CHT−250)/25)+1, 1..13; none below 237.5', () => {
  const cht = [350, 237.5, 237.4, 250, 600, 455];
  const r = new Rig({ sensors: cruiseFrame({ cht }) }).boot();
  assert.equal(r.col(1).chtSeg, 5);
  assert.equal(r.col(2).chtSeg, 1);
  assert.equal(r.col(3).chtSeg, 0);
  assert.equal(r.col(4).chtSeg, 1);
  assert.equal(r.col(5).chtSeg, 13);
  assert.equal(r.col(6).chtSeg, chtSeg(455));
});

test('ANA-5 isolated CHT segment: EGT bar shorter than k → chtSeg still k (shown as isolated lit segment)', () => {
  const r = new Rig({ sensors: cruiseFrame({ egt: [900, 1360, 1320, 1350, 1330, 1345], cht: [400, 360, 340, 355, 345, 352] }) }).boot();
  const c = r.col(1);
  assert.equal(c.segs, pctSegs(900, 1650));
  assert.equal(c.segs, 2);
  assert.equal(c.chtSeg, 7);
  assert.ok(c.segs < c.chtSeg);
});

test('ANA-5 CHT segment is unaffected by view and mode', () => {
  const r = new Rig().boot();
  const before = r.columns.map((c) => c.chtSeg);
  r.hold('LF', 3100);
  assert.deepEqual(r.columns.map((c) => c.chtSeg), before);
  r.tap('LF'); // LeanFind
  assert.deepEqual(r.columns.map((c) => c.chtSeg), before);
});

test('ANA-7 highest TIT segment flashes while the digital display shows TIT1', () => {
  const r = new Rig().boot();
  assert.equal(r.col('T').topFlash, false);
  r.gotoItem('TIT1');
  assert.equal(r.col('T').topFlash, true);
  r.tap('STEP');
  assert.equal(r.item, 'OIL');
  assert.equal(r.col('T').topFlash, false);
  assert.equal(r.col('T').oilFlash, true, 'OIL segment flashes while OIL displayed');
  r.tap('STEP');
  assert.equal(r.col('T').oilFlash, false);
});

test('ANA-7 OIL-only last column flashes while OIL is displayed', () => {
  const r = new Rig({ config: { tit: 0 } }).boot().gotoItem('OIL');
  const c = r.col('T');
  assert.ok(c.topFlash || c.oilFlash);
});

test('ANA-8 dot under cylinder for EGTn, DIF, CLD; none for other items', () => {
  const r = new Rig().boot();
  assert.equal(r.dot.index, null, 'BAT');
  r.gotoItem('OAT');
  assert.equal(r.dot.index, null);
  r.gotoItem('EGT5');
  assert.equal(r.dot.index, 4);
  r.gotoItem('OIL');
  assert.equal(r.dot.index, null);
  r.gotoItem('DIF');
  assert.equal(r.dot.index, 2);
});

test('ANA-9 pre-ignition: column with EGT > 2000 °F flashes in AUTO/MANUAL; digital not forced', () => {
  const r = new Rig().boot().gotoItem('OAT');
  r.sensors({ egt: [1950, 2001, 1960, 2000, 1970, 1980] }).advance(100); // DIF 51: no alarm
  assert.equal(r.col(2).flash, true);
  assert.equal(r.col(4).flash, false, '2000 is not > 2000');
  assert.equal(r.col(1).flash, false);
  assert.equal(r.item, 'OAT');
  r.tap('LF').tap('STEP');
  assert.equal(r.path, 'AUTO');
  assert.equal(r.col(2).flash, true);
});

test('ANA-10 failed EGT → missing column; failed CHT → no CHT segment', () => {
  const r = new Rig({ sensors: cruiseFrame({ failed: ['EGT2', 'CHT3'] }) }).boot();
  assert.equal(r.col(2).missing, true);
  assert.equal(r.col(3).missing, false);
  assert.equal(r.col(3).chtSeg, 0);
  assert.equal(r.col(2).chtSeg, chtSeg(360));
});

test('ANA-11 upper window: nn HP with HP-? Y and fuel flow operational', () => {
  const r = new Rig({ sensors: cruiseFrame({ pctHp: 65, rpm: 2447 }) }).boot();
  assert.equal(r.upper, '65 HP');
  r.settings.hpc = 150;
  assert.equal(r.upper, '78 HP'); // round(65 × 150/125)
  r.sensors({ ffSignal: false });
  assert.equal(r.upper, '2450', 'no FF signal → RPM rounded to 10');
  r.sensors({ ffSignal: true });
  r.settings.hpDisplay = false;
  assert.equal(r.upper, '2450', 'HP-? N → RPM');
});

test('ANA-11 upper window without ff shows RPM; 700 has no upper window', () => {
  const n = new Rig({ config: { ff: false }, sensors: cruiseFrame({ rpm: 2412 }) }).boot();
  assert.equal(n.upper, '2410');
  const s = new Rig({ config: { model: 700 } }).boot();
  assert.equal(s.upper, '');
});

test('ANA-12 °F/°C indicator follows ENG F/C', () => {
  const r = new Rig().boot();
  assert.equal(r.display().unit, 'F');
  r.settings.engUnit = 'C';
  assert.equal(r.display().unit, 'C');
});

test('ANA-13 (rev3) brightness follows ambient light first-order (τ ≈ 3.3 s), settling within about 10 s', () => {
  const r = new Rig().boot();
  r.send({ type: 'AMBIENT', level: 1 }).advance(60000);
  assert.ok(Math.abs(r.display().brightness - 1) < 0.01);
  r.send({ type: 'AMBIENT', level: 0 }).advance(1000);
  const b1 = r.display().brightness;
  assert.ok(b1 > 0.6, `not instantaneous: after 1 s expected ≈0.74, got ${b1.toFixed(3)}`);
  r.advance(2300); // 3.3 s = one time constant
  const b33 = r.display().brightness;
  assert.ok(Math.abs(b33 - Math.exp(-1)) < 0.04, `after 3.3 s expected ≈0.37, got ${b33.toFixed(3)}`);
  r.advance(6700); // 10 s total → 95 % settled
  const b10 = r.display().brightness;
  assert.ok(b10 >= 0.03 && b10 <= 0.07, `after 10 s expected ≈0.05 (95 % settled), got ${b10.toFixed(3)}`);
  r.send({ type: 'AMBIENT', level: 0.8 }).advance(10000);
  const up = r.display().brightness;
  assert.ok(Math.abs(up - 0.8) <= 0.06, `rising step also settles within ≈10 s, got ${up.toFixed(3)}`);
});

test('ANA-7 / MAN-7 TIT/OIL segment flash follows the visible digital content (not under a BAT alarm overlay)', () => {
  const r = new Rig().boot().gotoItem('TIT1');
  assert.equal(r.col('T').topFlash, true);
  r.sensors({ bat: 16.5 }).advance(100);
  assert.equal(r.text, '16.5 BAT');
  assert.equal(r.col('T').topFlash, false, 'digital shows BAT, not TIT1');
  const o = new Rig().boot().gotoItem('OIL');
  o.sensors({ bat: 16.5 }).advance(100);
  assert.equal(o.col('T').oilFlash, false, 'digital shows BAT, not OIL');
});

test('ANA-7 a TIT alarm (digital shows TIT) flashes the top TIT segment', () => {
  const r = new Rig().boot().gotoItem('OAT');
  r.sensors({ tit: [1700, 0] }).advance(100);
  assert.equal(r.text, '1700 TIT');
  assert.equal(r.col('T').topFlash, true);
});
