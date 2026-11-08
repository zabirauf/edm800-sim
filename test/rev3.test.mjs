// Round 2: spec revision 3 changes (rules marked "(rev3)", §23 Validation disposition D1–D5, S1–S13).
// The rewritten ANA-13 and ANA-9 tests live in analog.test.mjs / leanfind.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rig, cruiseFrame, pctSegs } from './helpers.mjs';

const E0 = [1340, 1360, 1320, 1350, 1330, 1345]; // hottest EGT = cylinder 2
const TIT0 = 1450;

function armed({ config = {}, method = 'R', ff = 14.0, settings = null, sensors = {} } = {}) {
  const r = new Rig({ config, settings, sensors: cruiseFrame({ egt: E0, tit: [TIT0, 0], ffGph: ff, ...sensors }) }).boot();
  r.gotoItem('OIL');
  r.tap('LF');
  if (method === 'L') r.advance(100).holdBoth(5100);
  r.advance(2100);
  assert.equal(r.path, 'LEANFIND.ARMED');
  return r;
}

function activate(r, base = E0) {
  r.sensors({ egt: base.map((v) => v + 15) }).advance(100);
  assert.equal(r.path, 'LEANFIND.ACTIVE');
  return r;
}

function ropSet(r, cyl = 4) {
  activate(r);
  const max = E0.map((v) => v + 40);
  r.sensors({ egt: max, tit: [TIT0 + 30, 0], ffGph: 13.5 }).advance(500);
  r.sensors({ egt: max.map((v, i) => (i === cyl - 1 ? v - 10 : v)) }).advance(50);
  r.sensors({ ffGph: 13.0 }).advance(2050);
  assert.equal(r.path, 'LEANFIND.ROP_SET');
  return { max };
}

const ORDER = [3, 1, 5, 2, 6, 4];

/** LOP: stage k: (A) unpeaked cylinders +1 °F (their new max) at flow atMax[k], peaked ones −5 °F;
 *  (B) ORDER[k] drops 10 °F at flow atDetect[k]. */
function lopRun(r, { atMax, atDetect = atMax, stop = ORDER.length, base = E0 } = {}) {
  activate(r, base);
  let egt = base.map((v) => v + 15);
  const peaked = new Set();
  const peaks = {};
  for (let k = 0; k < stop; k++) {
    const c = ORDER[k];
    egt = egt.map((v, i) => (peaked.has(i + 1) ? v - 5 : v + 1));
    r.sensors({ egt, ffGph: atMax[k] }).advance(500);
    peaks[c] = egt[c - 1];
    egt = egt.map((v, i) => (i === c - 1 ? v - 10 : v));
    r.sensors({ egt, ffGph: atDetect[k] }).advance(500);
    peaked.add(c);
  }
  return { egt, peaks };
}
const FLOWS = [13.5, 13.2, 12.9, 12.6, 12.3, 12.0];

function engC(r) {
  r.enterProgram().enterFacLim().pgmGoto('PROGRAM.FACLIM.ENG');
  r.tap('LF');
  assert.equal(r.text, 'ENG C');
  r.pgmGoto('PROGRAM.FACLIM.END').tap('STEP');
  assert.equal(r.path, 'MANUAL');
  return r;
}

// ================================================================ D1 (ALM-8, P711-5)

test('ALM-8 / P711-5 (rev3 D1) 711 lamps and alarm light are evaluated during SELFTEST.SEGMENTS', () => {
  const r = new Rig({ config: { primary711: true }, sensors: cruiseFrame({ oil: 240 }) }).powerOn().advance(100);
  assert.equal(r.path, 'SELFTEST.SEGMENTS');
  const d = r.display();
  assert.equal(d.allOn, true);
  assert.equal(d.alarmLight, true);
  assert.equal(d.lamps711.oil, 'red');
  assert.equal(d.lamps711.cht, 'off');
});

// ================================================================ D3 / D4 / S3 overlay rule (ANA-7, ANA-8)

test('ANA-8 (rev3) OFF overlay shows no dot over an EGTn item; the item dot returns after OFF', () => {
  const r = new Rig().boot().gotoItem('EGT1');
  r.sensors({ bat: 16.5 }).advance(100);
  r.press('STEP').advance(5050);
  assert.equal(r.text, 'OFF');
  assert.equal(r.dot.index, null);
  r.release('STEP').advance(1500);
  assert.equal(r.text, '1340 350');
  assert.equal(r.dot.index, 0);
});

test('ANA-7 (rev3) OFF overlay: no TIT segment flash over TIT1, no OIL segment flash over OIL; flashes return after', () => {
  const t = new Rig().boot().gotoItem('TIT1');
  t.sensors({ bat: 16.5 }).advance(100);
  t.press('STEP').advance(5050);
  assert.equal(t.text, 'OFF');
  assert.equal(t.col('T').topFlash, false);
  t.release('STEP').advance(1500);
  assert.equal(t.col('T').topFlash, true);
  const o = new Rig().boot().gotoItem('OIL');
  o.sensors({ bat: 16.5 }).advance(100);
  o.press('STEP').advance(5050);
  assert.equal(o.text, 'OFF');
  assert.equal(o.col('T').oilFlash, false);
  o.release('STEP').advance(1500);
  assert.equal(o.col('T').oilFlash, true);
});

test('ANA-8 (rev3) SNAP overlay in LEANFIND ARMED: no dot while SNAP shows; the steady dot returns', () => {
  const r = armed();
  assert.deepEqual(r.dot, { index: 1, blink: false });
  r.tapBoth();
  r.until((x) => x.text === 'SNAP', 6200);
  assert.equal(r.dot.index, null);
  r.until((x) => x.text !== 'SNAP', 3000);
  assert.deepEqual(r.dot, { index: 1, blink: false });
});

test('ANA-8 (rev3) SNAP overlay in ROP_SET and LOP_DONE: no dot', () => {
  const s = armed();
  ropSet(s, 4);
  assert.equal(s.dot.index, 3);
  s.tapBoth();
  s.until((x) => x.text === 'SNAP', 6200);
  assert.equal(s.dot.index, null);
  const l = armed({ method: 'L' });
  lopRun(l, { atMax: FLOWS });
  assert.equal(l.path, 'LEANFIND.LOP_DONE');
  l.tapBoth();
  l.until((x) => x.text === 'SNAP', 6200);
  assert.equal(l.dot.index, null);
});

test('ANA-8 (rev3) BAT alarm overlay in LEANFIND shows no dot (ARMED, ACTIVE, ROP_SET, LOP_DONE)', () => {
  const setups = {
    ARMED: () => armed(),
    ACTIVE: () => activate(armed()),
    ROP_SET: () => { const r = armed(); ropSet(r); return r; },
    LOP_DONE: () => { const r = armed({ method: 'L' }); lopRun(r, { atMax: FLOWS }); return r; },
  };
  for (const [phase, mk] of Object.entries(setups)) {
    const r = mk();
    assert.equal(r.path, `LEANFIND.${phase}`);
    assert.notEqual(r.dot.index, null, `${phase} has a LeanFind dot before the alarm`);
    r.sensors({ bat: 16.5 }).advance(100);
    assert.equal(r.text, '16.5 BAT', phase);
    assert.equal(r.dot.index, null, phase);
  }
});

test('ANA-8 (rev3) CHT alarm overlay in LEANFIND: dot at the alarming cylinder', () => {
  const r = armed();
  r.sensors({ cht: [350, 360, 340, 355, 470, 352] }).advance(100);
  assert.equal(r.text, '470 CHT');
  assert.equal(r.dot.index, 4);
});

test('ANA-8 / ALM-1 (rev3 S11) CHT alarm: text and dot use the hottest cylinder above the limit', () => {
  const r = new Rig().boot().gotoItem('OAT');
  r.sensors({ cht: [460, 475, 340, 455, 470, 352] }).advance(100);
  assert.equal(r.text, '475 CHT');
  assert.equal(r.dot.index, 1);
});

test('ANA-8 (rev3) DIF and CLD alarm overlays over EGT1 put the dot on their own cylinder', () => {
  const d = new Rig().boot().gotoItem('EGT1');
  d.sensors({ egt: [1340, 1360, 1320, 1350, 1330, 1900] }).advance(100);
  assert.equal(d.state().alarm, 'DIF');
  assert.equal(d.dot.index, 5);
  const c = new Rig().boot().gotoItem('EGT1');
  c.advance(35000);
  const base = [350, 360, 340, 355, 345, 352];
  c.ramp(30000, (t) => ({ cht: base.map((v, i) => (i === 2 ? v - (35 * t) / 30000 : v)) }), 500);
  c.advance(100);
  assert.equal(c.state().alarm, 'CLD');
  assert.equal(c.dot.index, 2);
});

test('ANA-7 (rev3) TIT alarm over the OIL item flashes the TIT segment only; OIL alarm over TIT1 the OIL segment only', () => {
  const t = new Rig().boot().gotoItem('OIL');
  t.sensors({ tit: [1700, 0] }).advance(100);
  assert.equal(t.text, '1700 TIT');
  assert.equal(t.col('T').topFlash, true);
  assert.equal(t.col('T').oilFlash, false);
  const o = new Rig().boot().gotoItem('TIT1');
  o.sensors({ oil: 240 }).advance(100);
  assert.equal(o.text, '240 OIL');
  assert.equal(o.col('T').oilFlash, true);
  assert.equal(o.col('T').topFlash, false);
});

test('ANA-7 (rev3) OIL alarm with an OIL-only last column flashes that column', () => {
  const r = new Rig({ config: { tit: 0 } }).boot().gotoItem('OAT');
  assert.equal(r.col('T').topFlash || r.col('T').oilFlash, false);
  r.sensors({ oil: 240 }).advance(100);
  assert.equal(r.text, '240 OIL');
  assert.equal(r.col('T').topFlash || r.col('T').oilFlash, true);
});

test('ANA-7 / ANA-8 (rev3) TIT alarm overlay in LEANFIND: T segment flashes, no dot', () => {
  const r = armed();
  r.sensors({ tit: [1760, 0] }).advance(100); // ≥ 100° over → no LeanFind grace
  assert.equal(r.text, '1760 TIT');
  assert.equal(r.col('T').topFlash, true);
  assert.equal(r.dot.index, null);
});

test('ANA-8 (rev3) AUTO: BAT alarm over an EGTn item shows no dot', () => {
  const r = new Rig().bootAuto();
  r.until((x) => x.item === 'EGT2', 80000);
  r.sensors({ bat: 16.5 }).advance(100);
  assert.equal(r.text, '16.5 BAT');
  assert.equal(r.dot.index, null);
});

// ================================================================ D5 / S2 (ANA-9) — LOP

test('ANA-9 (rev3) pre-ignition flash coexists with the LOP inverted graph (non-peaked and peaked columns)', () => {
  const B = [1950, 1960, 1955, 1965, 1958, 1962];
  const r = new Rig({ sensors: cruiseFrame({ egt: B, tit: [TIT0, 0], ffGph: 14 }) }).boot();
  r.tap('LF').advance(100).holdBoth(5100).advance(2100);
  activate(r, B);
  let egt = B.map((v) => v + 16);
  r.sensors({ egt }).advance(500);
  egt = egt.map((v, i) => (i === 0 ? v - 10 : v)); // cylinder 1 peaked (1956)
  r.sensors({ egt }).advance(500);
  assert.equal(r.col(1).inverted, true);
  egt = egt.map((v, i) => (i === 2 ? 2005 : v)); // non-peaked cylinder 3 → pre-ignition
  r.sensors({ egt }).advance(200);
  assert.equal(r.col(3).segs, 0, 'non-peaked LOP column stays empty');
  assert.equal(r.col(3).flash, true, 'but flashes for pre-ignition');
  assert.equal(r.col(1).flash, false);
  egt = egt.map((v, i) => (i === 3 ? 2020 : v)); // cylinder 4 max 2020 …
  r.sensors({ egt }).advance(300);
  egt = egt.map((v, i) => (i === 3 ? 2008 : v)); // … peaked at 2008 (> 2000)
  r.sensors({ egt }).advance(300);
  assert.equal(r.path, 'LEANFIND.ACTIVE');
  assert.equal(r.col(4).inverted, true);
  assert.equal(r.col(4).segs, 2);
  assert.equal(r.col(4).flash, true);
});

// ================================================================ S4 (ALM-6)

test('ALM-6 (rev3 S4) an alarm appearing while STEP is already held does not capture that press (tap scans)', () => {
  const r = new Rig().boot().gotoItem('OAT');
  r.press('STEP').advance(200);
  r.sensors({ bat: 16.5 }).advance(200);
  assert.equal(r.state().alarm, 'BATH');
  r.release('STEP'); // tap (400 ms)
  assert.equal(r.item, 'DIF', 'the tap went to the scan');
  r.advance(100);
  assert.equal(r.state().alarm, 'BATH', 'the alarm was not acknowledged');
});

test('ALM-6 (rev3 S4) STEP held through alarm onset: backwards scanning continues; no OFF at 5 s', () => {
  const r = new Rig().boot().gotoItem('EGT4');
  r.press('STEP').advance(200);
  r.sensors({ bat: 16.5 }).advance(600); // hold start at 700 ms
  assert.equal(r.item, 'EGT3');
  r.advance(4500); // 5.3 s held
  assert.notEqual(r.text, 'OFF');
  r.release('STEP').advance(100);
  assert.equal(r.state().alarm, 'BATH', 'not turned OFF');
});

test('ALM-6 (rev3 S4) a STEP-first chord while an alarm is displayed is not captured (BOTH_TAP excludes, alarm stays)', () => {
  const r = new Rig().boot().gotoItem('OIL');
  r.sensors({ bat: 16.5 }).advance(100);
  r.press('STEP').advance(100).press('LF').advance(200).release('STEP').release('LF');
  assert.deepEqual(r.state().excluded, ['OIL']);
  r.advance(100);
  assert.equal(r.state().alarm, 'BATH');
});

test('ALM-6 single-button STEP pressed while an alarm is displayed is still routed to the alarm (regression)', () => {
  const r = new Rig().boot().gotoItem('OAT');
  r.sensors({ bat: 16.5 }).advance(100);
  r.tap('STEP');
  assert.equal(r.item, 'OAT');
  r.advance(100);
  assert.equal(r.state().alarm, null);
});

// ================================================================ S5 (ALM-9)

test('ALM-9 (rev3 S5) a TIT alarm hidden by the LeanFind exception does not mask lower alarms', () => {
  const r = armed();
  r.sensors({ tit: [1700, 0], bat: 16.5 }).advance(100);
  assert.equal(r.state().alarm, 'BATH');
  assert.equal(r.text, '16.5 BAT');
  assert.equal(r.display().alarmLight, true);
  r.advance(60000);
  assert.equal(r.state().alarm, 'TIT', 'after 60 s the TIT alarm (higher priority) shows');
  assert.equal(r.text, '1700 TIT');
});

test('ALM-9 (rev3 S5) with only the hidden TIT alarm, nothing is shown and the light stays off', () => {
  const r = armed();
  r.sensors({ tit: [1700, 0] }).advance(1000);
  assert.equal(r.state().alarm, null);
  assert.equal(r.display().alarmLight, false);
});

// ================================================================ S6 (LF-8 / LF-11 flow at peak)

test('LF-8 (rev3 S6) flow at peak = measured flow at the instant of the channel maximum, not at detection', () => {
  const r = armed();
  activate(r);
  const max = E0.map((v) => v + 40);
  r.sensors({ egt: max, tit: [TIT0 + 30, 0], ffGph: 13.6 }).advance(500); // maximum at 13.6
  r.sensors({ egt: max.map((v, i) => (i === 3 ? v - 5 : v)), ffGph: 13.3 }).advance(500);
  r.sensors({ egt: max.map((v, i) => (i === 3 ? v - 10 : v)) }).advance(50); // detected at 13.3
  assert.equal(r.path, 'LEANFIND.LEANEST');
  r.sensors({ ffGph: 13.0 }).advance(2050);
  assert.equal(r.text, `${max[3] - 10} 13.0`);
  r.press('LF').advance(800);
  assert.equal(r.text, `${max[3]} 13.6`);
  r.release('LF');
});

test('LF-8 (rev3 S6) flow at peak is the measured flow (KF ≠ transducer K)', () => {
  const r = armed({ settings: { kf: 30 } }); // measured = true × 29 / 30
  activate(r);
  const max = E0.map((v) => v + 40);
  r.sensors({ egt: max, tit: [TIT0 + 30, 0], ffGph: 13.6 }).advance(500);
  r.sensors({ egt: max.map((v, i) => (i === 3 ? v - 10 : v)), ffGph: 13.3 }).advance(50);
  r.sensors({ ffGph: 13.0 }).advance(2050);
  assert.equal(r.path, 'LEANFIND.ROP_SET');
  assert.equal(r.text, `${max[3] - 10} ${(13.0 * 29 / 30).toFixed(1)}`);
  r.press('LF').advance(800);
  assert.equal(r.text, `${max[3]} ${(13.6 * 29 / 30).toFixed(1)}`);
  r.release('LF');
});

test('LF-8 (rev3 S6) TIT-locked ROP: flow at the TIT maximum', () => {
  const r = armed();
  activate(r);
  const max = E0.map((v) => v + 40);
  r.sensors({ egt: max, tit: [1490, 0], ffGph: 13.6 }).advance(500);
  r.sensors({ tit: [1484, 0], ffGph: 13.4 }).advance(500);
  r.sensors({ tit: [1480, 0] }).advance(50);
  assert.equal(r.path, 'LEANFIND.LEANEST');
  r.sensors({ ffGph: 13.0 }).advance(2050);
  r.press('LF').advance(800);
  assert.equal(r.text, '1490 13.6');
  r.release('LF');
});

test('LF-11 (rev3 S6) GAMI spread = flow at the first cylinder maximum − flow at the last cylinder maximum', () => {
  const r = armed({ method: 'L' });
  // max-instant flows: 13.5 … 12.0 (spread 1.5); detection flows differ non-uniformly (spread would be 1.0)
  const { peaks } = lopRun(r, { atMax: FLOWS, atDetect: [13.0, 13.1, 12.8, 12.5, 12.2, 12.0] });
  assert.equal(r.path, 'LEANFIND.LOP_DONE');
  r.press('LF').advance(800);
  assert.equal(r.text, `${peaks[3]} 1.5`);
  r.release('LF');
});

// ================================================================ S7 (P711-1)

test('P711-1 (rev3 S7) STEP_TAP in AUTO on CHTHI → MANUAL on the EGTn of the hottest-CHT cylinder (EGT-CHT first)', () => {
  const r = new Rig({ config: { primary711: true }, sensors: cruiseFrame({ cht: [350, 360, 340, 375, 345, 352] }) }).bootAuto();
  r.until((x) => x.item === 'CHTHI', 20000);
  assert.equal(r.text, '375 CHT');
  r.tap('STEP');
  assert.equal(r.path, 'MANUAL');
  assert.equal(r.item, 'EGT4');
  assert.equal(r.text, 'EGT-CHT');
  r.advance(1050);
  assert.equal(r.item, 'EGT4');
  assert.equal(r.text, '1350 375');
  r.tap('STEP');
  assert.equal(r.item, 'EGT5');
});

test('P711-1 (rev3) STEP_TAP in AUTO on TIT1 / OIL keeps that item in MANUAL', () => {
  for (const id of ['TIT1', 'OIL']) {
    const r = new Rig({ config: { primary711: true } }).bootAuto();
    r.until((x) => x.item === id, 20000);
    r.tap('STEP').advance(50);
    assert.equal(r.path, 'MANUAL');
    assert.equal(r.item, id);
  }
});

// ================================================================ S8 formats

test('FMT (rev3 S8) GAMI spread below 1.0 has one decimal with a leading zero (0.8)', () => {
  const r = armed({ method: 'L' });
  const { peaks } = lopRun(r, { atMax: [12.8, 12.7, 12.6, 12.5, 12.2, 12.0] });
  r.press('LF').advance(800);
  assert.equal(r.text, `${peaks[3]} 0.8`);
  r.release('LF');
});

test('FMT (rev3 S8) flows below 1.0 show a leading zero (LeanFind egt ff, TIT1 tit ff)', () => {
  const r = armed({ ff: 0.8 });
  assert.equal(r.text, '1360 0.8');
  const t = new Rig({ sensors: cruiseFrame({ ffGph: 0.8 }) }).boot().gotoItem('TIT1');
  assert.equal(t.text, '1450 0.8');
});

test('PWR-6 (rev3 S8) FULL nn is an unpadded integer', () => {
  const r = new Rig().boot();
  r.advance(13 * 60000);
  r.powerOff().powerOn();
  r.until((x) => x.path === 'STARTUP_INFO.FULL', 20000);
  assert.equal(r.text, 'FULL 1');
});

test('PGM-10 (rev3 S8) DUMP nn is an unpadded integer throughout the transfer', () => {
  const r = new Rig().boot().enterProgram().pgmGoto('PROGRAM.ITEM.DUMP');
  r.tap('LF').tap('STEP');
  assert.equal(r.text, 'DUMP 0');
  r.advance(150);
  assert.equal(r.text, 'DUMP 5');
  while (r.path === 'PROGRAM.DUMP_XFER') {
    assert.match(r.text, /^DUMP (0|[1-9]\d*)$/);
    r.advance(50);
  }
});

test('DL-1 (rev3 S8) USB count-down is an unpadded integer', () => {
  const r = new Rig().boot();
  r.send({ type: 'USB_INSERT' });
  r.tap('STEP');
  r.advance(2850);
  assert.equal(r.text, '5');
  const seen = [];
  r.until((x) => { seen.push(x.text); return x.text === 'DONE'; }, 1000);
  for (const s of seen.slice(0, -1)) assert.match(s, /^(0|[1-9]\d*)$/);
});

test('DL-2 (rev3 S8/S11) memory box: DOWNLOAD 1 s, then unpadded nn% over 3 s (NEW) / 6 s (ALL), then DONE', () => {
  const n = new Rig().boot();
  n.send({ type: 'MEMBOX_CONNECT' });
  n.tap('STEP');
  n.advance(950);
  assert.equal(n.text, 'DOWNLOAD');
  n.advance(200); // 150 ms into the 3 s transfer
  assert.equal(n.text, '5%');
  n.advance(1350); // 1500 ms
  assert.equal(n.text, '50%');
  n.advance(1400); // 2900 ms
  assert.notEqual(n.text, 'DONE');
  n.advance(150);
  assert.equal(n.text, 'DONE');
  const a = new Rig().boot();
  a.send({ type: 'MEMBOX_CONNECT' });
  a.tap('LF').tap('STEP');
  a.advance(4000); // 1 s banner + 3 s of 6 s
  assert.equal(a.text, '50%');
  a.advance(2900);
  assert.notEqual(a.text, 'DONE');
  a.advance(150);
  assert.equal(a.text, 'DONE');
});

test('FMT-2 (rev3 S8) excluded TIT1 with ff: the point precedes the flow field (1370 .13.5); without ff before TIT', () => {
  const r = new Rig({ config: { tit: 2 }, sensors: cruiseFrame({ tit: [1370, 1388], ffGph: 13.5 }) }).boot();
  r.gotoItem('TIT1').tapBoth();
  assert.equal(r.text, '1370 .13.5');
  r.gotoItem('TIT2').tapBoth();
  assert.equal(r.text, '1388 .TI2');
  const n = new Rig({ config: { ff: false }, sensors: cruiseFrame({ tit: [1370, 0] }) }).boot().gotoItem('TIT1').tapBoth();
  assert.equal(n.text, '1370 .TIT');
});

test('CALC-3 (rev3 S8) H.M floors both hours and minutes (1.9999 h → 01.59)', () => {
  const r = new Rig({ sensors: cruiseFrame({ ffGph: 0 }), settings: { rem: 19.999 } }).boot().gotoItem('HM');
  r.sensors({ ffGph: 10 });
  assert.equal(r.text, '01.59 H.M');
});

// ================================================================ S9 clamp unless wrap

test('PGM-9 (rev3 S9) CAL_TIT clamps at −975 (no wrap)', () => {
  const r = new Rig({ settings: { titCal: -970 } }).boot().enterProgram().pgmGoto('PROGRAM.ITEM.RATE');
  r.holdBoth(5100).advance(1000).tap('LF').tap('STEP').advance(1000);
  assert.equal(r.text, 'TIT-970');
  r.taps('LF', 8);
  assert.equal(r.text, 'TIT-975');
});

test('PWR-2 (rev3 S9) TANK_SETUP AUX clamps at 250 (no wrap)', () => {
  const r = new Rig({ settings: { auxEnabled: true, aux: 248 } });
  r.press('STEP').powerOn().advance(100).release('STEP').advance(100);
  r.tap('STEP').tap('STEP');
  assert.equal(r.text, 'AUX=248');
  r.hold('LF', 2000);
  assert.equal(r.text, 'AUX=250');
});

// ================================================================ S10 percentage scale in °F

test('ANA-3 (rev3 S10) the percentage scale is computed in °F even with ENG C', () => {
  const r = engC(new Rig({ sensors: cruiseFrame({ egt: [1000, 840, 1000, 1000, 1000, 1000], oil: 120 }) }).boot());
  const red = 900 * 9 / 5 + 32; // TIT limit 900 °C = 1652 °F
  assert.equal(r.col(1).segs, pctSegs(1000, red));
  assert.equal(r.col(1).segs, 4); // °C ratio would give 3
  assert.equal(r.col(2).segs, 1); // °C ratio would give 0
  assert.equal(r.col('T').segs, pctSegs(TIT0, red));
  assert.equal(r.col('T').oilSeg, 2); // OIL 120 °F vs H OIL 110 °C = 230 °F (°C ratio would give 0)
});

test('ANA-3 (rev3 S10) OIL-only column in ENG C uses the H OIL limit converted to °F', () => {
  const r = engC(new Rig({ config: { tit: 0 }, sensors: cruiseFrame({ oil: 120 }) }).boot());
  assert.equal(r.col('T').segs, 2);
});

// ================================================================ S11 pinned behaviours

test('PGM-5 (rev3 S11) OAT calibration is in the displayed unit (°C) and applied after conversion', () => {
  const r = new Rig({ sensors: cruiseFrame({ oat: 59 }) }).boot().enterProgram().pgmGoto('PROGRAM.ITEM.OATU');
  r.tap('LF'); // OAT C
  r.holdBoth(5100);
  assert.equal(r.path, 'PROGRAM.OAT_CAL');
  r.hold('LF', 1150); // +3 (700, 900, 1100)
  assert.equal(r.text, 'OAT+3');
  r.tap('STEP').pgmGoto('PROGRAM.ITEM.END').tap('STEP');
  r.gotoItem('OAT');
  assert.equal(r.text, '18 OAT'); // 59 °F = 15 °C, + 3 °C
});

test('ALM-1 / PGM-7 (rev3 S11) the MAP alarm uses calibrated MAP', () => {
  const up = new Rig({ settings: { mapCal: 1.0 } }).boot().gotoItem('OAT');
  up.sensors({ map: 41.5 }).advance(100);
  assert.equal(up.state().alarm, 'MAP');
  assert.equal(up.text, '42.5 MAP');
  const eq = new Rig({ settings: { mapCal: 0.5 } }).boot().gotoItem('OAT');
  eq.sensors({ map: 41.5 }).advance(100);
  assert.equal(eq.state().alarm, null, 'calibrated 42.0 is not > 42.0');
  const dn = new Rig({ settings: { mapCal: -1.0 } }).boot().gotoItem('OAT');
  dn.sensors({ map: 42.5 }).advance(100);
  assert.equal(dn.state().alarm, null);
});

test('PGM-6 / ANA-11 (rev3 S11) without ff the HPC screen upper window shows RPM', () => {
  const r = new Rig({ config: { ff: false }, sensors: cruiseFrame({ rpm: 2447 }) }).boot().enterProgram();
  r.pgmGoto('PROGRAM.ITEM.HPQ').holdBoth(5100).advance(1000);
  assert.equal(r.path, 'PROGRAM.HPC');
  assert.equal(r.upper, '2450');
  const f = new Rig().boot().enterProgram().pgmGoto('PROGRAM.ITEM.HPQ');
  f.holdBoth(5100).advance(1000);
  assert.equal(f.upper, '65 HP', 'with ff the HPC screen shows %HP');
});

test('PGM-11 (rev3 S11) an LTM date beyond the month length rolls over (04/31 → 05/01)', () => {
  const r = new Rig({ clockMs: Date.UTC(2026, 9, 27, 14, 35, 20) }).boot().enterProgram().pgmGoto('PROGRAM.ITEM.DUMP');
  r.holdBoth(5100);
  r.tap('STEP'); // MNTH 10
  r.taps('LF', 6); // 4
  r.tap('STEP'); // DAY 27
  r.hold('LF', 1350); // +4 → 31
  r.tap('STEP').tap('STEP').tap('STEP'); // YEAR, HOUR, MIN
  assert.equal(r.path, 'PROGRAM.LTM.MIN');
  r.tap('STEP'); // writes the clock
  const d = new Date(r.settings.clockMs);
  assert.equal(d.getUTCMonth() + 1, 5);
  assert.equal(d.getUTCDate(), 1);
  r.pgmGoto('PROGRAM.LTM.END').tap('STEP').tap('STEP');
  r.powerOff().powerOn();
  r.until((x) => x.path === 'STARTUP_INFO.DATE', 20000);
  assert.equal(r.text, '05.01.26');
});

test('LF-14 / LIM-5 (rev3 S11) RECRD? N: SNAP still shows within one record interval and counts a mark; nothing recorded', () => {
  const r = armed({ settings: { recrd: false } });
  const marks0 = r.settings.ltm.marks;
  r.tapBoth();
  const t = r.until((x) => x.text === 'SNAP', 6200);
  assert.ok(t <= 6050, `SNAP after ${t} ms`);
  assert.equal(r.settings.ltm.marks, marks0 + 1);
  r.tap('STEP');
  r.advance(13 * 60000);
  r.powerOff().powerOn();
  r.until((x) => x.path === 'STARTUP_INFO.FULL', 20000);
  assert.equal(r.text, 'FULL 0');
});

test('LF-9 (rev3 S11) in LOP the T column keeps its normal (non-inverted) display', () => {
  const r = armed({ method: 'L' });
  lopRun(r, { atMax: FLOWS, stop: 2 });
  assert.equal(r.col(3).inverted, true);
  const t = r.col('T');
  assert.equal(t.inverted, false);
  assert.equal(t.segs, pctSegs(TIT0, 1650));
});

test('LF-9 (rev3 S11) TIT is ignored for LOP peaks', () => {
  const r = armed({ method: 'L' });
  activate(r);
  r.sensors({ tit: [1480, 0] }).advance(500);
  r.sensors({ tit: [1460, 0] }).advance(500); // TIT 20 °F below its max
  assert.equal(r.path, 'LEANFIND.ACTIVE');
  assert.ok(r.columns.every((c) => !c.inverted), 'no inverted graph yet');
  assert.equal(r.text, '1375 14.0', 'digital still as LF-5 (hottest cylinder)');
  assert.deepEqual(r.dot, { index: 1, blink: true });
  // the cylinders still complete the LOP sequence normally
  let egt = E0.map((v) => v + 15);
  const peaked = new Set();
  for (const c of ORDER) {
    egt = egt.map((v, i) => (peaked.has(i + 1) ? v : v + 1));
    r.sensors({ egt }).advance(300);
    egt = egt.map((v, i) => (i === c - 1 ? v - 10 : v));
    r.sensors({ egt }).advance(300);
    peaked.add(c);
  }
  assert.equal(r.path, 'LEANFIND.LOP_DONE');
  assert.equal(r.dot.index, 3);
});

// ================================================================ S12 display model

test('§17 (rev3 S12) display model fields: power, allOn, viewStyle, columns[].oilFlash', () => {
  const r = new Rig();
  assert.equal(r.display().power, false);
  r.powerOn().advance(100);
  assert.equal(r.display().power, true);
  assert.equal(r.display().allOn, true);
  r.advance(3000);
  assert.equal(r.display().allOn, false);
  r.boot();
  const d = r.display();
  assert.equal(d.viewStyle, 'NRM');
  for (const c of d.columns) {
    for (const k of ['id', 'label', 'segs', 'chtSeg', 'oilSeg', 'inverted', 'flash', 'topFlash', 'oilFlash', 'missing', 'labelFlash']) {
      assert.ok(k in c, `column ${c.id} has ${k}`);
    }
    assert.equal(typeof c.oilFlash, 'boolean');
  }
});

test('ANA-8 (rev3) OFF overlay in LEANFIND: no dot while OFF shows; LeanFind dot returns', () => {
  const r = armed();
  r.sensors({ bat: 16.5 }).advance(100);
  r.press('STEP').advance(5050);
  assert.equal(r.text, 'OFF');
  assert.equal(r.path, 'LEANFIND.ARMED');
  assert.equal(r.dot.index, null);
  r.release('STEP').advance(1500);
  assert.equal(r.text, '1360 14.0');
  assert.deepEqual(r.dot, { index: 1, blink: false });
});

test('ANA-7 (rev3) an OILL (low oil) alarm overlay flashes the OIL segment, not the TIT segment', () => {
  const r = new Rig().boot().gotoItem('TIT1');
  r.sensors({ oil: 80 }).advance(100);
  assert.equal(r.text, '80 OIL');
  assert.equal(r.col('T').oilFlash, true);
  assert.equal(r.col('T').topFlash, false);
});

test('ALM-6 (rev3) a captured STEP press stays with the alarm even if the alarm clears before hold start', () => {
  const r = new Rig().boot().gotoItem('EGT4');
  r.sensors({ bat: 16.5 }).advance(100);
  r.press('STEP').advance(300);
  r.sensors({ bat: 14.0 }).advance(700); // alarm gone; hold start (700 ms) still belongs to the alarm press
  assert.equal(r.item, 'EGT4', 'no backwards scan');
  r.release('STEP');
  assert.equal(r.item, 'EGT4');
});

test('ANA-8 (rev3) CHT alarm in ROP_SET takes the dot; after STEP acknowledges it the flashing locked-cylinder dot returns', () => {
  const r = armed();
  ropSet(r, 4);
  r.sensors({ cht: [350, 360, 340, 355, 470, 352] }).advance(100);
  assert.equal(r.text, '470 CHT');
  assert.equal(r.dot.index, 4);
  r.tap('STEP').advance(100);
  assert.equal(r.path, 'LEANFIND.ROP_SET', 'acknowledge only (ALM-4)');
  assert.deepEqual(r.dot, { index: 3, blink: true });
});
