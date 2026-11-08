// §10 LeanFind (LF-1 … LF-18).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rig, cruiseFrame } from './helpers.mjs';

const E0 = [1340, 1360, 1320, 1350, 1330, 1345]; // hottest = cylinder 2
const TIT0 = 1450;

/** MANUAL on OIL (the return item), tap LF → ARMED; optionally toggle to LEAN L; skip the banner. */
function armed({ config = {}, method = 'R', skipBanner = true, ff = 14.0 } = {}) {
  const r = new Rig({ config, sensors: cruiseFrame({ egt: E0, tit: [TIT0, 0], ffGph: ff }) }).boot();
  r.gotoItem('OIL');
  r.tap('LF');
  assert.equal(r.path, 'LEANFIND.ARMED');
  if (method === 'L') r.advance(100).holdBoth(5100);
  if (skipBanner) r.advance(2100);
  return r;
}

/** All cylinders +15 °F → ACTIVE (LF-4). */
function activate(r) {
  r.sensors({ egt: E0.map((v) => v + 15) }).advance(100);
  assert.equal(r.path, 'LEANFIND.ACTIVE');
  return r;
}

/** ROP: activate, rise to a common max at 13.5 GPH, then cylinder `cyl` drops 10 °F → LEANEST. */
function ropLeanest(r, cyl = 4) {
  activate(r);
  const max = E0.map((v) => v + 40);
  r.sensors({ egt: max, tit: [TIT0 + 30, 0], ffGph: 13.5 }).advance(500);
  r.sensors({ egt: max.map((v, i) => (i === cyl - 1 ? v - 9 : v)) }).advance(500);
  assert.equal(r.path, 'LEANFIND.ACTIVE', '9 °F below max is not yet a peak');
  r.sensors({ egt: max.map((v, i) => (i === cyl - 1 ? v - 10 : v)) }).advance(50);
  assert.equal(r.path, 'LEANFIND.LEANEST');
  return { max };
}

function ropSet(r, cyl = 4) {
  const { max } = ropLeanest(r, cyl);
  r.sensors({ ffGph: 13.0 });
  r.advance(2050);
  assert.equal(r.path, 'LEANFIND.ROP_SET');
  return { max };
}

const ORDER = [3, 1, 5, 2, 6, 4];
const FLOWS = [13.5, 13.2, 12.9, 12.6, 12.3, 12.0];

/**
 * LOP: each stage k: (A) not-yet-peaked cylinders rise 1 °F (new max) at flow FLOWS[k], already-peaked ones fall
 * 5 °F; (B) cylinder ORDER[k] drops 10 °F → peaked. `stop` = number of stages to run.
 */
function lopRun(r, stop = ORDER.length, onStage = null) {
  activate(r);
  let egt = E0.map((v) => v + 15);
  const peaked = new Set();
  const peaks = {};
  for (let k = 0; k < stop; k++) {
    const c = ORDER[k];
    egt = egt.map((v, i) => (peaked.has(i + 1) ? v - 5 : v + 1));
    r.sensors({ egt, ffGph: FLOWS[k] }).advance(500);
    peaks[c] = egt[c - 1];
    egt = egt.map((v, i) => (i === c - 1 ? v - 10 : v));
    r.sensors({ egt }).advance(500);
    peaked.add(c);
    if (onStage) onStage(k, { egt: [...egt], peaks: { ...peaks } });
  }
  return { egt, peaks };
}

// ---------------------------------------------------------------- LF-1 / LF-2 / LF-3

test('LF-1 LF_TAP → ARMED with method R; STEP returns to AUTO at the recorded scan item', () => {
  const r = armed();
  assert.equal(r.state().leanfind.method, 'R');
  r.tap('STEP');
  assert.equal(r.path, 'AUTO');
  assert.equal(r.item, 'OIL');
});

test('LF-1 method resets to R on each new LeanFind', () => {
  const r = armed({ method: 'L' });
  assert.equal(r.state().leanfind.method, 'L');
  r.tap('STEP');
  r.tap('LF');
  assert.equal(r.state().leanfind.method, 'R');
});

test('LF-2 ARMED shows LEAN R for 2000 ms, then egt ff of the hottest cylinder with a steady dot', () => {
  const r = armed({ skipBanner: false });
  assert.equal(r.text, 'LEAN R');
  r.advance(1950);
  assert.equal(r.text, 'LEAN R');
  r.advance(100);
  assert.equal(r.text, '1360 14.0');
  assert.deepEqual(r.dot, { index: 1, blink: false });
});

test('LF-2 ARMED without ff shows egt LF', () => {
  const r = armed({ config: { ff: false } });
  assert.equal(r.text, '1360 LF');
  assert.deepEqual(r.dot, { index: 1, blink: false });
});

test('LF-2 / LF-3 BOTH_HOLD_5S in ARMED toggles R⇄L; LEAN L shown 2000 ms after the toggle', () => {
  const r = armed();
  r.holdBoth(5100);
  assert.equal(r.state().leanfind.method, 'L');
  assert.equal(r.text, 'LEAN L');
  r.advance(1800); // toggle fired at 5000 ms of the 5100 ms hold → 1900 ms after the toggle
  assert.equal(r.text, 'LEAN L');
  r.advance(200);
  assert.equal(r.text, '1360 14.0');
  r.holdBoth(5100);
  assert.equal(r.state().leanfind.method, 'R');
  assert.equal(r.text, 'LEAN R');
  assert.equal(r.path, 'LEANFIND.ARMED');
});

// ---------------------------------------------------------------- LF-4 activation

test('LF-4 activation on a 15 °F rise above the running minimum (14 °F does not activate)', () => {
  const r = armed();
  const e = [...E0];
  e[0] = 1330; // new running minimum for cylinder 1
  r.sensors({ egt: [...e] }).advance(500);
  e[0] = 1344; // +14 above min (and +4 above the entry value)
  r.sensors({ egt: [...e] }).advance(500);
  assert.equal(r.path, 'LEANFIND.ARMED');
  e[0] = 1345; // +15 above min
  r.sensors({ egt: [...e] }).advance(50);
  assert.equal(r.path, 'LEANFIND.ACTIVE');
});

test('LF-4 rises below 15 °F on several cylinders do not add up', () => {
  const r = armed();
  r.sensors({ egt: E0.map((v) => v + 14) }).advance(1000);
  assert.equal(r.path, 'LEANFIND.ARMED');
});

test('LF-4 TIT1 is a LeanFind channel for activation', () => {
  const r = armed();
  r.sensors({ tit: [TIT0 + 15, 0] }).advance(100);
  assert.equal(r.path, 'LEANFIND.ACTIVE');
});

test('LF-4 activation can also occur during the LEAN R banner', () => {
  const r = armed({ skipBanner: false });
  r.advance(500);
  r.sensors({ egt: E0.map((v) => v + 15) }).advance(100);
  assert.equal(r.path, 'LEANFIND.ACTIVE');
});

// ---------------------------------------------------------------- LF-5 ACTIVE

test('LF-5 ACTIVE: flashing dot and number under the hottest cylinder; digital egt ff', () => {
  const r = activate(armed());
  assert.equal(r.text, '1375 14.0');
  assert.deepEqual(r.dot, { index: 1, blink: true });
  assert.equal(r.col(2).labelFlash, true);
  assert.equal(r.col(1).labelFlash, false);
  r.sensors({ egt: [1340, 1360, 1320, 1390, 1330, 1345].map((v) => v + 15) }).advance(100);
  assert.equal(r.dot.index, 3, 'dot follows the hottest cylinder');
  assert.equal(r.text, '1405 14.0');
});

test('LF-5 ACTIVE: the method can no longer change (BOTH_HOLD_5S ignored)', () => {
  const r = activate(armed());
  r.holdBoth(5100);
  assert.equal(r.state().leanfind.method, 'R');
  assert.equal(r.path, 'LEANFIND.ACTIVE');
});

test('LF-5 ACTIVE without ff: egt LF', () => {
  const r = activate(armed({ config: { ff: false } }));
  assert.equal(r.text, '1375 LF');
});

// ---------------------------------------------------------------- LF-6 / LF-7 / LF-8 ROP

test('LF-6 / LF-7 ROP: first channel to drop 10 °F below its max → LEANEST for 2000 ms, column flashes', () => {
  const r = armed();
  ropLeanest(r, 4);
  assert.equal(r.text, 'LEANEST');
  assert.equal(r.col(4).flash, true);
  assert.equal(r.col(2).flash, false);
  r.advance(1900);
  assert.equal(r.path, 'LEANFIND.LEANEST');
  r.advance(150);
  assert.equal(r.path, 'LEANFIND.ROP_SET');
});

test('LF-8 ROP_SET: live egt ff of the locked cylinder; column, dot and number flash', () => {
  const r = armed();
  const { max } = ropSet(r, 4);
  assert.equal(r.text, `${max[3] - 10} 13.0`);
  assert.equal(r.col(4).flash, true);
  assert.equal(r.col(4).labelFlash, true);
  assert.deepEqual(r.dot, { index: 3, blink: true });
  r.sensors({ egt: max.map((v, i) => (i === 3 ? v - 3 : v + 20)) }).advance(100); // enriching; others hotter
  assert.equal(r.text, `${max[3] - 3} 13.0`, 'locked to cylinder 4 even if others are hotter');
  assert.equal(r.dot.index, 3);
});

test('LF-8 ROP_SET: holding LF shows peak and the flow at peak; release returns to live', () => {
  const r = armed();
  const { max } = ropSet(r, 4);
  r.press('LF').advance(800);
  assert.equal(r.text, `${max[3]} 13.5`);
  r.advance(3000); // past 3 s: no view toggle in LeanFind (LF-16)
  assert.equal(r.text, `${max[3]} 13.5`);
  r.release('LF').advance(50);
  assert.equal(r.text, `${max[3] - 10} 13.0`);
  assert.equal(r.state().view, 'P');
});

test('LF-8 ROP without ff: egt SET, hold LF → peak PK', () => {
  const r = armed({ config: { ff: false } });
  const { max } = ropSet(r, 2);
  assert.equal(r.text, `${max[1] - 10} SET`);
  r.press('LF').advance(800);
  assert.equal(r.text, `${max[1]} PK`);
  r.release('LF');
});

test('LF-8 (rev2) ROP with TIT peaking first: T column flashes, no dot, digital tit ff; hold → peak', () => {
  const r = armed();
  activate(r);
  const max = E0.map((v) => v + 40);
  r.sensors({ egt: max, tit: [1490, 0], ffGph: 13.5 }).advance(500);
  r.sensors({ tit: [1480, 0] }).advance(50);
  assert.equal(r.path, 'LEANFIND.LEANEST');
  assert.equal(r.col('T').flash, true);
  r.sensors({ ffGph: 13.0 }).advance(2050);
  assert.equal(r.path, 'LEANFIND.ROP_SET');
  assert.equal(r.text, '1480 13.0');
  assert.equal(r.col('T').flash, true);
  assert.equal(r.dot.index, null);
  r.press('LF').advance(800);
  assert.equal(r.text, '1490 13.5');
  r.release('LF');
});

test('LF-8 / §10 LeanFind values use 1° resolution even with EGT 1?N', () => {
  const r = armed();
  r.sensors({ egt: [1341, 1363, 1322, 1351, 1333, 1347] }).advance(100);
  assert.equal(r.text, '1363 14.0');
});

// ---------------------------------------------------------------- LF-9 / LF-10 / LF-11 LOP

test('LF-9 LOP before any peak: display as ACTIVE (hottest egt ff, flashing dot), normal bars', () => {
  const r = activate(armed({ method: 'L' }));
  assert.equal(r.text, '1375 14.0');
  assert.deepEqual(r.dot, { index: 1, blink: true });
  assert.equal(r.col(1).inverted, false);
});

test('LF-9 LOP after the first peak: inverted bar for peaked cylinder, others empty, Δ ff, dot at that cylinder', () => {
  const r = armed({ method: 'L' });
  lopRun(r, 1); // cylinder 3 peaked
  assert.equal(r.path, 'LEANFIND.ACTIVE');
  const c3 = r.col(3);
  assert.equal(c3.inverted, true);
  assert.equal(c3.segs, 2); // 10 °F below peak / 5
  assert.equal(c3.labelFlash, true);
  for (const id of [1, 2, 4, 5, 6]) {
    assert.equal(r.col(id).segs, 0, `col ${id} empty`);
    assert.equal(r.col(id).labelFlash, false, `col ${id} number`);
  }
  assert.equal(r.text, '-10 13.5');
  assert.deepEqual(r.dot, { index: 2, blink: true });
});

test('LF-9 LOP progress: numbers of all peaked cylinders flash; dot and Δ follow the most recent peak', () => {
  const r = armed({ method: 'L' });
  lopRun(r, 3, (k, { egt, peaks }) => {
    const c = ORDER[k];
    assert.equal(r.dot.index, c - 1, `stage ${k}`);
    assert.equal(r.dot.blink, true);
    assert.equal(r.text, `${egt[c - 1] - peaks[c]} ${FLOWS[k].toFixed(1)}`);
    for (const p of ORDER.slice(0, k + 1)) assert.equal(r.col(p).labelFlash, true, `stage ${k} col ${p}`);
  });
  // cylinder 3 is now 10 + 2×5 = 20 °F below its peak → 4 inverted segments
  assert.equal(r.col(3).segs, 4);
  assert.equal(r.col(1).segs, 3);
  assert.equal(r.col(5).segs, 2);
  assert.equal(r.col(2).segs, 0);
});

test('LF-9 inverted segment count clamps at 13', () => {
  const r = armed({ method: 'L' });
  const { egt, peaks } = lopRun(r, 1);
  r.sensors({ egt: egt.map((v, i) => (i === 2 ? peaks[3] - 100 : v)) }).advance(100);
  assert.equal(r.col(3).segs, 13);
});

test('LF-9 LOP without ff: Δ LF', () => {
  const r = armed({ method: 'L', config: { ff: false } });
  lopRun(r, 1);
  assert.equal(r.text, '-10 LF');
});

test('LF-10 LOP: all cylinders peaked → LOP_DONE; inverted graph; last column flashes; dot; Δ ff', () => {
  const r = armed({ method: 'L' });
  lopRun(r);
  assert.equal(r.path, 'LEANFIND.LOP_DONE');
  assert.deepEqual(r.columns.slice(0, 6).map((c) => c.segs), [6, 4, 7, 2, 5, 3]); // 30,20,35,10,25,15 °F below peak
  assert.ok(r.columns.slice(0, 6).every((c) => c.inverted));
  assert.equal(r.col(4).flash, true);
  assert.equal(r.col(3).flash, false);
  assert.equal(r.dot.index, 3);
  assert.equal(r.text, '-10 12.0');
});

test('LF-10 LOP_DONE without ff: Δ SET', () => {
  const r = armed({ method: 'L', config: { ff: false } });
  lopRun(r);
  assert.equal(r.path, 'LEANFIND.LOP_DONE');
  assert.equal(r.text, '-10 SET');
});

test('LF-10 LOP completion considers cylinders only (TIT not required to peak)', () => {
  const r = armed({ method: 'L' });
  lopRun(r); // TIT never peaks
  assert.equal(r.path, 'LEANFIND.LOP_DONE');
});

test('LF-11 LOP_DONE hold LF → peak of the first cylinder to peak and GAMI spread (FF first − FF last)', () => {
  const r = armed({ method: 'L' });
  const { peaks } = lopRun(r);
  r.press('LF').advance(800);
  assert.equal(r.text, `${peaks[3]} 1.5`);
  r.release('LF').advance(50);
  assert.equal(r.text, '-10 12.0');
});

test('LF-11 LOP_DONE hold LF without ff → peakFirst PK', () => {
  const r = armed({ method: 'L', config: { ff: false } });
  const { peaks } = lopRun(r);
  r.press('LF').advance(800);
  assert.equal(r.text, `${peaks[3]} PK`);
  r.release('LF');
});

// ---------------------------------------------------------------- LF-12 results / review

test('LF-12 LOP_DONE stores results; LF_TAP → LOP_REVIEW (same display, live Δ); LF_TAP → new ARMED', () => {
  const r = armed({ method: 'L' });
  const { egt, peaks } = lopRun(r);
  assert.ok(r.state().lopResults);
  const doneCols = r.columns.map((c) => c.segs);
  r.tap('LF');
  assert.equal(r.path, 'LEANFIND.LOP_REVIEW');
  assert.equal(r.text, '-10 12.0');
  assert.deepEqual(r.columns.map((c) => c.segs), doneCols);
  assert.equal(r.col(4).flash, true);
  assert.equal(r.dot.index, 3);
  r.sensors({ egt: egt.map((v, i) => (i === 3 ? peaks[4] - 4 : v)), ffGph: 12.4 }).advance(100);
  assert.equal(r.text, '-4 12.4', 'live Δ of the last cylinder and live flow');
  r.press('LF').advance(800);
  assert.equal(r.text, `${peaks[3]} 1.5`);
  r.release('LF');
  r.tap('LF');
  assert.equal(r.path, 'LEANFIND.ARMED');
  assert.equal(r.state().lopResults, null);
});

test('LF-12 / LF-1 after STEP from LOP_DONE, the next LF_TAP goes to LOP_REVIEW', () => {
  const r = armed({ method: 'L' });
  lopRun(r);
  r.tap('STEP');
  assert.equal(r.path, 'AUTO');
  r.tap('LF');
  assert.equal(r.path, 'LEANFIND.LOP_REVIEW');
  assert.equal(r.text, '-10 12.0');
});

// ---------------------------------------------------------------- LF-13 STEP exits

test('LF-13 STEP_TAP in every LeanFind state → AUTO at the return scan item', () => {
  const setups = {
    ARMED: () => armed(),
    ACTIVE: () => activate(armed()),
    LEANEST: () => { const r = armed(); ropLeanest(r); return r; },
    ROP_SET: () => { const r = armed(); ropSet(r); return r; },
    LOP_DONE: () => { const r = armed({ method: 'L' }); lopRun(r); return r; },
    LOP_REVIEW: () => { const r = armed({ method: 'L' }); lopRun(r); r.tap('LF'); return r; },
  };
  for (const [phase, mk] of Object.entries(setups)) {
    const r = mk();
    assert.equal(r.path, `LEANFIND.${phase}`);
    r.tap('STEP');
    assert.equal(r.path, 'AUTO', phase);
    assert.equal(r.item, 'OIL', phase);
  }
});

// ---------------------------------------------------------------- LF-14 / LF-15 marks (SNAP)

function expectSnap(r, label) {
  const t = r.until((x) => x.text === 'SNAP', 6200);
  assert.ok(t <= 6050, `${label}: SNAP within one record interval (6 s), took ${t}`);
  assert.equal(r.blink, true, 'SNAP flashes');
  const d = r.until((x) => x.text !== 'SNAP', 3000);
  assert.ok(d >= 1950 && d <= 2050, `${label}: SNAP lasts 2000 ms, got ${d}`);
}

test('LF-14 BOTH_TAP in ARMED requests a mark: SNAP flashes for 2000 ms within 6 s; state unchanged', () => {
  const r = armed();
  r.tapBoth();
  assert.equal(r.path, 'LEANFIND.ARMED');
  expectSnap(r, 'ARMED');
  assert.equal(r.path, 'LEANFIND.ARMED');
});

test('LF-14 BOTH_TAP marks in ACTIVE, ROP_SET, LOP_DONE and LOP_REVIEW', () => {
  const a = activate(armed());
  a.tapBoth();
  assert.equal(a.path, 'LEANFIND.ACTIVE');
  expectSnap(a, 'ACTIVE');
  const s = armed();
  ropSet(s);
  s.tapBoth();
  expectSnap(s, 'ROP_SET');
  assert.equal(s.path, 'LEANFIND.ROP_SET');
  const d = armed({ method: 'L' });
  lopRun(d);
  d.tapBoth();
  assert.equal(d.path, 'LEANFIND.LOP_DONE');
  expectSnap(d, 'LOP_DONE');
  d.tap('LF');
  d.tapBoth();
  assert.equal(d.path, 'LEANFIND.LOP_REVIEW');
  expectSnap(d, 'LOP_REVIEW');
});

test('LF-14 SNAP is written even with a cold engine (SNAP request forces a record)', () => {
  const r = new Rig({ sensors: cruiseFrame({ egt: [300, 310, 305, 300, 302, 301], tit: [300, 0] }) }).boot();
  r.tap('LF').advance(2100);
  r.tapBoth();
  expectSnap(r, 'cold');
});

test('LF-15 LF_TAP in ARMED / ACTIVE / ROP_SET marks data (SNAP) and keeps the state', () => {
  const r = armed();
  r.tap('LF');
  assert.equal(r.path, 'LEANFIND.ARMED');
  expectSnap(r, 'ARMED');
  const a = activate(armed());
  a.tap('LF');
  assert.equal(a.path, 'LEANFIND.ACTIVE');
  expectSnap(a, 'ACTIVE');
  const s = armed();
  ropSet(s);
  s.tap('LF');
  assert.equal(s.path, 'LEANFIND.ROP_SET');
  expectSnap(s, 'ROP_SET');
});

test('LF-15 LF_TAP in LEANEST marks data and does not leave LEANEST early', () => {
  const r = armed();
  ropLeanest(r);
  r.tap('LF');
  assert.equal(r.path, 'LEANFIND.LEANEST');
  r.until((x) => x.text === 'SNAP', 6200);
});

// ---------------------------------------------------------------- LF-16 / LF-17

test('LF-16 LF_HOLD_3S in LeanFind does not toggle the view', () => {
  const r = armed();
  r.hold('LF', 3500);
  assert.equal(r.state().view, 'P');
  assert.equal(r.path, 'LEANFIND.ARMED');
});

test('LF-17 ARMED/ACTIVE/ROP analog bars use the current view (Normalize)', () => {
  const r = new Rig({ sensors: cruiseFrame({ egt: E0, tit: [TIT0, 0], ffGph: 14 }) }).boot();
  r.hold('LF', 3100); // N, refs = E0
  r.tap('LF').advance(2100);
  assert.equal(r.path, 'LEANFIND.ARMED');
  for (let i = 1; i <= 6; i++) assert.equal(r.col(i).segs, 7);
  activate(r); // +15 → 7 + round(1.5) = 9 (round half up) — accept 8 or 9
  assert.ok([8, 9].includes(r.col(1).segs));
  r.sensors({ egt: E0.map((v) => v + 30) }).advance(100);
  assert.equal(r.col(1).segs, 10);
  assert.equal(r.col(1).inverted, false);
});

test('LF-17 Percentage view in LeanFind ARMED', () => {
  const r = armed();
  assert.equal(r.col(1).segs, 8);
});

// ---------------------------------------------------------------- LF-18 event table (ignored events)

test('LF-18 ARMED: LF held does not show a peak; LF_HOLD_3S ignored', () => {
  const r = armed();
  r.press('LF').advance(1000);
  assert.equal(r.text, '1360 14.0');
  r.release('LF');
});

test('LF-18 ACTIVE / LEANEST: LF held shows nothing special; BOTH_HOLD_5S ignored (no PROGRAM)', () => {
  const a = activate(armed());
  a.press('LF').advance(1000);
  assert.equal(a.text, '1375 14.0');
  a.release('LF');
  a.holdBoth(5100);
  assert.equal(a.path, 'LEANFIND.ACTIVE');
  const l = armed();
  ropLeanest(l);
  l.press('LF').advance(800);
  assert.equal(l.text, 'LEANEST');
  l.release('LF');
});

test('LF-18 ROP_SET / LOP_DONE / LOP_REVIEW: BOTH_HOLD_5S ignored (no method change, no PROGRAM)', () => {
  const s = armed();
  ropSet(s);
  s.holdBoth(5100);
  assert.equal(s.path, 'LEANFIND.ROP_SET');
  const d = armed({ method: 'L' });
  lopRun(d);
  d.holdBoth(5100);
  assert.equal(d.path, 'LEANFIND.LOP_DONE');
  d.tap('LF');
  d.holdBoth(5100);
  assert.equal(d.path, 'LEANFIND.LOP_REVIEW');
});

test('LF-18 LOP_DONE: LF_TAP goes to LOP_REVIEW (not a mark)', () => {
  const d = armed({ method: 'L' });
  lopRun(d);
  d.tap('LF');
  assert.equal(d.path, 'LEANFIND.LOP_REVIEW');
});

test('LF-12 LF_TAP in LOP_REVIEW starts a new LeanFind: LEAN R banner, method R', () => {
  const r = armed({ method: 'L' });
  lopRun(r);
  r.tap('LF').tap('LF');
  assert.equal(r.path, 'LEANFIND.ARMED');
  assert.equal(r.state().leanfind.method, 'R');
  assert.equal(r.text, 'LEAN R');
  for (let i = 1; i <= 6; i++) assert.equal(r.col(i).inverted, false);
});

test('LF-14 BOTH_TAP in LEANEST requests a mark', () => {
  const r = armed();
  ropLeanest(r);
  r.tapBoth();
  assert.ok(['LEANFIND.LEANEST', 'LEANFIND.ROP_SET'].includes(r.path));
  r.until((x) => x.text === 'SNAP', 6200);
});

test('ANA-9 (rev3) pre-ignition flashing also applies in LEANFIND (ARMED)', () => {
  const r = armed();
  r.sensors({ egt: [1950, 1990, 1960, 1980, 1970, 1985] }).advance(100); // DIF 40, no alarm
  assert.equal(r.col(2).flash, false);
  r.sensors({ egt: [1950, 2001, 1960, 1980, 1970, 1985] }).advance(100);
  assert.equal(r.col(2).flash, true);
  assert.equal(r.col(4).flash, false);
  assert.equal(r.text, '2001 14.0', 'digital not forced beyond the normal hottest-cylinder display');
});

test('ANA-9 (rev3) pre-ignition flash coexists with the ROP_SET locked-column flash', () => {
  const r = armed();
  const { max } = ropSet(r, 4);
  r.settings.limits.dif = 990; // keep the DIF alarm out of this scenario (spread 641 °F)
  r.sensors({ egt: max.map((v, i) => (i === 3 ? v - 10 : i === 1 ? 2001 : v)) }).advance(100);
  assert.equal(r.path, 'LEANFIND.ROP_SET');
  assert.equal(r.col(4).flash, true, 'locked column still flashes');
  assert.equal(r.col(2).flash, true, 'pre-ignition column flashes too');
  assert.equal(r.text, `${max[3] - 10} 13.0`, 'digital stays on the locked cylinder');
});

test('LF-8 ROP_SET: peak display starts at LF_HOLD_START (700 ms), not before; hold release is not a mark', () => {
  const r = armed();
  const { max } = ropSet(r, 4);
  r.press('LF').advance(650);
  assert.equal(r.text, `${max[3] - 10} 13.0`);
  r.advance(100);
  assert.equal(r.text, `${max[3]} 13.5`);
  r.release('LF');
  r.advance(7000);
  assert.ok(r.text !== 'SNAP', 'no mark after a hold');
  assert.equal(r.path, 'LEANFIND.ROP_SET');
});

test('LF-11 / LF-18 LF hold-release in LOP_DONE does not act as LF_TAP (stays in LOP_DONE)', () => {
  const r = armed({ method: 'L' });
  lopRun(r);
  r.hold('LF', 1000);
  assert.equal(r.path, 'LEANFIND.LOP_DONE');
});

test('LF-5 / LF-6 per-channel peak (max) is tracked from activation: a drop during ARMED is not a peak', () => {
  const r = armed();
  const e = [...E0];
  e[2] = E0[2] - 15; // cylinder 3 cools by 15 °F while ARMED
  r.sensors({ egt: [...e] }).advance(500);
  e[0] = E0[0] + 15; // cylinder 1 rises 15 °F → ACTIVE
  r.sensors({ egt: [...e] }).advance(500);
  assert.equal(r.path, 'LEANFIND.ACTIVE');
  r.advance(1000);
  assert.equal(r.path, 'LEANFIND.ACTIVE', 'cylinder 3 has not dropped 10 °F below its max since activation');
});

test('LF-10 LOP completion counts working cylinders only (failed EGT3)', () => {
  const r = new Rig({ sensors: cruiseFrame({ egt: E0, tit: [TIT0, 0], ffGph: 14, failed: ['EGT3'] }) }).boot();
  r.tap('LF').advance(100).holdBoth(5100).advance(2100);
  let egt = E0.map((v) => v + 15);
  r.sensors({ egt }).advance(100);
  assert.equal(r.path, 'LEANFIND.ACTIVE');
  for (const c of [1, 2, 4, 5, 6]) {
    egt = egt.map((v, i) => v + (i === c - 1 ? 0 : 1));
    r.sensors({ egt }).advance(300);
    egt = egt.map((v, i) => (i === c - 1 ? v - 10 : v));
    r.sensors({ egt }).advance(300);
  }
  assert.equal(r.path, 'LEANFIND.LOP_DONE');
  assert.equal(r.dot.index, 5);
});
