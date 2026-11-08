// §12 Pilot programming (PGM-1 … PGM-12).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rig, cruiseFrame, num } from './helpers.mjs';

const pgm = (opts = {}) => new Rig(opts).boot().enterProgram();
const P = (id) => `PROGRAM.ITEM.${id}`;

// ---------------------------------------------------------------- PGM-1

test('PGM-1 BOTH_HOLD_5S → PROGRAM shown 2000 ms, then the first visible item (FUEL? N)', () => {
  const r = new Rig().boot();
  r.press('STEP').press('LF').advance(5000); // fires at 5000
  r.release('STEP').release('LF');
  assert.equal(r.path, 'PROGRAM.BANNER');
  assert.equal(r.text, 'PROGRAM');
  r.advance(1950);
  assert.equal(r.text, 'PROGRAM');
  r.advance(100);
  assert.equal(r.path, P('FUEL'));
  assert.equal(r.text, 'FUEL? N');
});

test('PGM-1 inputs are ignored during the PROGRAM banner', () => {
  const r = new Rig().boot();
  r.holdBoth(5100);
  r.tap('STEP').advance(100).tap('LF');
  assert.equal(r.path, 'PROGRAM.BANNER');
  r.advance(2000);
  assert.equal(r.path, P('FUEL'));
  assert.equal(r.text, 'FUEL? N');
});

test('PGM-1 / PGM-4 remembers the prior mode: AUTO → PROGRAM → exit → AUTO', () => {
  const r = new Rig().bootAuto().enterProgram();
  r.pgmGoto(P('END')).tap('STEP');
  assert.equal(r.path, 'AUTO');
});

test('PGM-4 exit (END Y + STEP) → prior mode MANUAL at its scan item', () => {
  const r = new Rig().boot().gotoItem('EGT3').enterProgram();
  r.pgmGoto(P('END'));
  assert.equal(r.text, 'END Y');
  r.tap('STEP');
  assert.equal(r.path, 'MANUAL');
  assert.equal(r.item, 'EGT3');
});

// ---------------------------------------------------------------- PGM-2 / PGM-3 list & defaults

test('PGM-2 / PGM-3 main list (switch A, ff, 800) with default displays', () => {
  const r = pgm();
  const seen = [];
  for (let i = 0; i < 10; i++) {
    if (r.path === P('KF')) r.advance(1100); // past KF-SET
    seen.push([r.path.split('.').pop(), r.text]);
    if (r.path === P('END')) break;
    r.tap('STEP');
  }
  assert.deepEqual(seen, [
    ['FUEL', 'FUEL? N'], ['RATE', 'RATE 4'], ['OATU', 'OAT F'], ['EGT1', 'EGT 1?N'], ['HPQ', 'HP-? Y'],
    ['KF', '29.00=KF'], ['ACCUM', 'ACCUM?N'], ['GPSC', 'GPS-C= 2'], ['DUMP', 'DUMP? N'], ['END', 'END Y'],
  ]);
});

test('PGM-2 select switch T filters the program list', () => {
  const r = new Rig();
  r.switchTo('T');
  r.boot().enterProgram();
  assert.deepEqual(r.pgmList().map((p) => p.split('.').pop()), ['FUEL', 'RATE', 'OATU', 'EGT1', 'HPQ', 'DUMP', 'END']);
});

test('PGM-2 select switch F filters the program list', () => {
  const r = new Rig();
  r.switchTo('F');
  r.boot().enterProgram();
  assert.deepEqual(r.pgmList().map((p) => p.split('.').pop()), ['FUEL', 'KF', 'ACCUM', 'GPSC', 'DUMP', 'END']);
});

test('PGM-2 options: no ff, no OAT, 700', () => {
  const nf = pgm({ config: { ff: false } });
  assert.deepEqual(nf.pgmList().map((p) => p.split('.').pop()), ['RATE', 'OATU', 'EGT1', 'HPQ', 'DUMP', 'END']);
  const no = pgm({ config: { oat: false } });
  assert.ok(!no.pgmList().includes(P('OATU')));
  const s7 = pgm({ config: { model: 700 } });
  assert.deepEqual(s7.pgmList().map((p) => p.split('.').pop()), ['FUEL', 'RATE', 'OATU', 'EGT1', 'KF', 'ACCUM', 'GPSC', 'DUMP', 'END']);
});

test('PGM-3 FUEL? returns to N each time it is displayed', () => {
  const r = pgm({ sensors: cruiseFrame({ ffGph: 0 }) });
  r.tap('LF').tap('STEP'); // FUEL? Y → fill flow
  r.until((x) => x.text === 'FILL? N', 1100);
  r.tap('STEP'); // exit (MANUAL)
  r.enterProgram();
  assert.equal(r.text, 'FUEL? N');
});

test('PGM-3 DUMP? returns to N each time it is displayed; END returns to Y', () => {
  const r = pgm().pgmGoto(P('DUMP'));
  r.tap('LF');
  assert.equal(r.text, 'DUMP NEW');
  r.holdBoth(5100); // → LTM list
  r.pgmGoto('PROGRAM.LTM.END').tap('STEP'); // → main END
  assert.equal(r.path, P('END'));
  r.tap('LF');
  assert.equal(r.text, 'END N');
  r.tap('STEP'); // END N → first item
  assert.equal(r.path, P('FUEL'));
  r.pgmGoto(P('DUMP'));
  assert.equal(r.text, 'DUMP? N');
  r.tap('STEP');
  assert.equal(r.text, 'END Y');
});

// ---------------------------------------------------------------- item behaviors

test('PGM-2 FUEL: LF toggles N⇄Y', () => {
  const r = pgm();
  r.tap('LF');
  assert.equal(r.text, 'FUEL? Y');
  r.tap('LF');
  assert.equal(r.text, 'FUEL? N');
});

test('PGM-2 RATE: tap −1 / hold +1, wraps 0..9', () => {
  const r = pgm().pgmGoto(P('RATE'));
  r.taps('LF', 4);
  assert.equal(r.text, 'RATE 0');
  r.tap('LF');
  assert.equal(r.text, 'RATE 9', 'wrap below 0');
  r.hold('LF', 800);
  assert.equal(r.text, 'RATE 0', 'wrap above 9');
  r.pgmGoto(P('END')).tap('STEP');
  assert.equal(r.settings.rate, 0);
});

test('PGM-2 OATU: LF toggles OAT F⇄C and the OAT item follows', () => {
  const r = new Rig({ sensors: cruiseFrame({ oat: 95 }) }).boot().enterProgram().pgmGoto(P('OATU'));
  r.tap('LF');
  assert.equal(r.text, 'OAT C');
  r.pgmGoto(P('END')).tap('STEP');
  r.gotoItem('OAT');
  assert.equal(r.text, '35 OAT');
});

test('PGM-2 EGT1: LF toggles EGT 1?N⇄Y and EGTn resolution follows', () => {
  const r = new Rig({ sensors: cruiseFrame({ egt: [1343, 1360, 1320, 1350, 1330, 1345] }) }).boot().enterProgram();
  r.pgmGoto(P('EGT1')).tap('LF');
  assert.equal(r.text, 'EGT 1?Y');
  r.pgmGoto(P('END')).tap('STEP');
  r.gotoItem('EGT1');
  assert.equal(r.text, '1343 350');
});

test('PGM-2 HPQ: LF toggles HP-? Y⇄N; upper window follows', () => {
  const r = pgm().pgmGoto(P('HPQ'));
  r.tap('LF');
  assert.equal(r.text, 'HP-? N');
  r.pgmGoto(P('END')).tap('STEP');
  assert.equal(r.upper, '2400');
});

test('PGM-2 / rev2 R21 KF item: KF-SET for 1000 ms, then 29.00=KF', () => {
  const r = pgm().pgmGoto(P('KF'));
  assert.equal(r.text, 'KF-SET');
  r.advance(900);
  assert.equal(r.text, 'KF-SET');
  r.advance(150);
  assert.equal(r.text, '29.00=KF');
});

test('PGM-2 ACCUM: LF toggles ACCUM?N⇄Y', () => {
  const r = pgm().pgmGoto(P('ACCUM'));
  r.tap('LF');
  assert.equal(r.text, 'ACCUM?Y');
  r.tap('LF');
  assert.equal(r.text, 'ACCUM?N');
});

test('PGM-2 GPSC: tap −1 / hold +1, wraps 0..8 (C7)', () => {
  const r = pgm().pgmGoto(P('GPSC'));
  r.taps('LF', 2);
  assert.equal(r.text, 'GPS-C= 0');
  r.tap('LF');
  assert.equal(r.text, 'GPS-C= 8');
  r.hold('LF', 800);
  assert.equal(r.text, 'GPS-C= 0');
});

test('PGM-2 DUMP: LF cycles N → NEW → ALL → N', () => {
  const r = pgm().pgmGoto(P('DUMP'));
  const seen = [r.text];
  for (let i = 0; i < 3; i++) { r.tap('LF'); seen.push(r.text); }
  assert.deepEqual(seen, ['DUMP? N', 'DUMP NEW', 'DUMP ALL', 'DUMP? N']);
});

test('PGM-2 DUMP? N + STEP → END', () => {
  const r = pgm().pgmGoto(P('DUMP'));
  r.tap('STEP');
  assert.equal(r.path, P('END'));
});

test('PGM-2 END: LF toggles; END N + STEP → first item', () => {
  const r = pgm().pgmGoto(P('END'));
  r.tap('LF');
  assert.equal(r.text, 'END N');
  r.tap('STEP');
  assert.equal(r.path, P('FUEL'));
});

// ---------------------------------------------------------------- PGM-5 OAT_CAL

test('PGM-5 STEP on OATU skips OAT_CAL; BOTH_HOLD_5S → OAT_CAL OAT+0', () => {
  const r = pgm().pgmGoto(P('OATU'));
  r.tap('STEP');
  assert.equal(r.path, P('EGT1'));
  const c = pgm().pgmGoto(P('OATU'));
  c.holdBoth(5100);
  assert.equal(c.path, 'PROGRAM.OAT_CAL');
  assert.equal(c.text, 'OAT+0');
});

test('PGM-5 OAT_CAL range −10…+10 (tap −1, hold +1), STEP → EGT1, displayed OAT += value', () => {
  const r = new Rig({ sensors: cruiseFrame({ oat: 81 }) }).boot().enterProgram().pgmGoto(P('OATU'));
  r.holdBoth(5100);
  r.tap('LF');
  assert.equal(r.text, 'OAT-1');
  r.hold('LF', 1000); // +2
  assert.equal(r.text, 'OAT+1');
  r.hold('LF', 3000); // many increments → clamp +10
  assert.equal(r.text, 'OAT+10');
  r.taps('LF', 7);
  assert.equal(r.text, 'OAT+3');
  r.tap('STEP');
  assert.equal(r.path, P('EGT1'));
  r.pgmGoto(P('END')).tap('STEP');
  r.gotoItem('OAT');
  assert.equal(r.text, '84 OAT');
});

test('PGM-5 OAT_CAL lower bound −10', () => {
  const r = pgm().pgmGoto(P('OATU'));
  r.holdBoth(5100);
  r.taps('LF', 12);
  assert.equal(r.text, 'OAT-10');
});

// ---------------------------------------------------------------- PGM-6 / PGM-7 HPC, MAP_CAL

test('PGM-6 HPQ BOTH_HOLD_5S → ADJUST 1000 ms → HPC= 125; reachable with HP-? N too (rev2 R15)', () => {
  for (const toggle of [false, true]) {
    const r = pgm().pgmGoto(P('HPQ'));
    if (toggle) r.tap('LF');
    r.holdBoth(5100);
    assert.equal(r.text, 'ADJUST');
    r.advance(850);
    assert.equal(r.text, 'ADJUST');
    r.advance(100);
    assert.equal(r.path, 'PROGRAM.HPC');
    assert.equal(r.text, 'HPC= 125');
  }
});

function hpc(opts) {
  const r = pgm(opts).pgmGoto(P('HPQ'));
  r.holdBoth(5100).advance(1000);
  assert.equal(r.path, 'PROGRAM.HPC');
  return r;
}

test('PGM-6 HPC: tap −1, hold +1; upper window shows %HP live', () => {
  const r = hpc();
  assert.equal(r.upper, '65 HP');
  r.tap('LF');
  assert.equal(r.text, 'HPC= 124');
  assert.equal(r.upper, '64 HP'); // round(65 × 124/125)
  r.hold('LF', 1000);
  assert.equal(r.text, 'HPC= 126');
});

test('PGM-6 HPC ×10 acceleration after 3 s of holding (range 50…200 > 100 steps)', () => {
  const r = hpc();
  r.hold('LF', 3150); // 12 × +1 (700…2900) then +10 at 3100
  assert.equal(r.text, 'HPC= 147');
});

test('PGM-6 HPC range clamps at 200 and 50', () => {
  const r = hpc();
  r.hold('LF', 8000);
  assert.equal(r.text, 'HPC= 200');
  const s = hpc();
  s.settings.hpc = 51;
  s.taps('LF', 3);
  assert.equal(s.text, 'HPC= 50');
});

test('PGM-6 HPC STEP → next main item after HPQ (KF)', () => {
  const r = hpc();
  r.tap('STEP');
  assert.equal(r.path, P('KF'));
  const n = hpc({ config: { ff: false } });
  n.tap('STEP');
  assert.equal(n.path, P('DUMP'));
});

test('PGM-6 / PGM-7 HPC BOTH_HOLD_5S → ADJUST (1000 ms) → MAP_CAL MAP=0.0', () => {
  const r = hpc();
  r.holdBoth(5100);
  assert.equal(r.text, 'ADJUST');
  r.advance(950);
  assert.equal(r.path, 'PROGRAM.MAP_CAL');
  assert.equal(r.text, 'MAP=0.0');
});

test('PGM-7 MAP_CAL ±0.1 steps, range −3.0…+3.0, formats MAP=1.5 / MAP=-1.2; displayed MAP += value', () => {
  const r = new Rig({ sensors: cruiseFrame({ map: 23.1 }) }).boot().enterProgram().pgmGoto(P('HPQ'));
  r.holdBoth(5100).advance(1000).holdBoth(5100).advance(1000);
  assert.equal(r.path, 'PROGRAM.MAP_CAL');
  r.taps('LF', 12);
  assert.equal(r.text, 'MAP=-1.2');
  r.taps('LF', 25);
  assert.equal(r.text, 'MAP=-3.0', 'clamped at −3.0');
  r.hold('LF', 14000);
  assert.equal(r.text, 'MAP=3.0', 'clamped at +3.0');
  r.taps('LF', 15);
  assert.equal(r.text, 'MAP=1.5');
  r.tap('STEP');
  assert.equal(r.path, P('KF'));
  r.pgmGoto(P('END')).tap('STEP');
  r.gotoItem('RPMMAP');
  assert.equal(r.text, '2400 24.6');
});

// ---------------------------------------------------------------- PGM-8 KF_EDIT

function kfEdit() {
  const r = pgm().pgmGoto(P('KF'));
  r.advance(1100).holdBoth(5100);
  assert.equal(r.path, 'PROGRAM.KF_EDIT');
  return r;
}

test('PGM-8 KF_EDIT: 29.00, first digit flashes; tap −1, hold +1 (wrap 0–9); STEP → next digit (wrap)', () => {
  const r = kfEdit();
  assert.match(r.text, /^29\.00/);
  assert.equal(r.display().digital.flashIndex, 0);
  r.tap('LF');
  assert.match(r.text, /^19\.00/);
  r.tap('STEP');
  assert.equal(r.display().digital.flashIndex, 1);
  r.hold('LF', 800); // 9 → 0
  assert.match(r.text, /^10\.00/);
  r.tap('STEP');
  assert.equal(r.display().digital.flashIndex, 3);
  r.tap('LF'); // 0 → 9
  assert.match(r.text, /^10\.90/);
  r.tap('STEP').tap('STEP');
  assert.equal(r.display().digital.flashIndex, 0, 'wraps to the first digit');
});

test('PGM-8 KF_EDIT BOTH_HOLD_5S saves and returns to the KF item; flow = true × K / KF', () => {
  const r = kfEdit();
  r.tap('STEP').hold('LF', 800); // 29.00 → 20.00
  r.holdBoth(5100);
  assert.equal(r.path, P('KF'));
  r.advance(1100);
  assert.equal(r.text, '20.00=KF');
  r.pgmGoto(P('END')).tap('STEP');
  r.gotoItem('GPH');
  assert.equal(r.text, `${(12.5 * 29 / 20).toFixed(1)} GPH`); // 18.1
});

test('PGM-8 KF = 0 → measured flow 0', () => {
  const r = new Rig({ settings: { kf: 0 } }).boot().gotoItem('GPH');
  assert.equal(r.text, '0.0 GPH');
});

// ---------------------------------------------------------------- PGM-9 ORIG_TIT / CAL_TIT

function origTit(opts) {
  const r = pgm(opts).pgmGoto(P('RATE'));
  r.holdBoth(5100);
  return r;
}

test('PGM-9 RATE BOTH_HOLD_5S → ORIG TIT (1000 ms) → ORIG T-N ⇔ ORIG T-Y; N + STEP → next after RATE', () => {
  const r = origTit();
  assert.equal(r.path, 'PROGRAM.ORIG_TIT');
  assert.equal(r.text, 'ORIG TIT');
  r.advance(1000);
  assert.equal(r.text, 'ORIG T-N');
  r.tap('LF');
  assert.equal(r.text, 'ORIG T-Y');
  r.tap('LF');
  assert.equal(r.text, 'ORIG T-N');
  r.tap('STEP');
  assert.equal(r.path, P('OATU'));
});

test('PGM-9 ORIG T-Y + STEP → CAL TIT (1000 ms) → TIT+0; tap −1 / hold +1; STEP → next after RATE; TIT1 += value', () => {
  const r = origTit({ sensors: cruiseFrame({ tit: [1450, 0] }) });
  r.advance(1000).tap('LF').tap('STEP');
  assert.equal(r.path, 'PROGRAM.CAL_TIT');
  assert.equal(r.text, 'CAL TIT');
  r.advance(1000);
  assert.equal(r.text, 'TIT+0');
  r.taps('LF', 3);
  assert.equal(r.text, 'TIT-3');
  r.hold('LF', 1000);
  assert.equal(r.text, 'TIT-1');
  r.tap('STEP');
  assert.equal(r.path, P('OATU'));
  r.pgmGoto(P('END')).tap('STEP');
  r.gotoItem('TIT1');
  assert.equal(r.text, '1449 12.5');
});

test('PGM-9 CAL_TIT ×10 acceleration after 3 s (range −975…+975)', () => {
  const r = origTit();
  r.advance(1000).tap('LF').tap('STEP').advance(1000);
  r.hold('LF', 3150);
  assert.equal(r.text, 'TIT+22');
});

test('PGM-9 CAL_TIT range clamps at ±975', () => {
  const r = origTit();
  r.advance(1000).tap('LF').tap('STEP').advance(1000);
  r.settings.titCal = 970;
  r.hold('LF', 2000);
  assert.equal(r.text, 'TIT+975');
});

test('PGM-9 without TIT installed: BOTH_HOLD_5S on RATE does nothing', () => {
  const r = origTit({ config: { tit: 0 } });
  r.advance(1000);
  assert.equal(r.path, P('RATE'));
});

// ---------------------------------------------------------------- PGM-10 DUMP_XFER / SAVE D

test('PGM-10 DUMP NEW + STEP → DUMP nn progress over 3 s → SAVE D?N', () => {
  const r = pgm().pgmGoto(P('DUMP'));
  r.tap('LF').tap('STEP');
  assert.equal(r.path, 'PROGRAM.DUMP_XFER');
  r.advance(1500);
  assert.equal(r.text, 'DUMP 50');
  r.advance(1550);
  assert.equal(r.path, 'PROGRAM.SAVE_D');
  assert.equal(r.text, 'SAVE D?N');
});

test('PGM-10 DUMP ALL takes 6 s', () => {
  const r = pgm().pgmGoto(P('DUMP'));
  r.tap('LF').tap('LF').tap('STEP');
  r.advance(3000);
  assert.equal(r.text, 'DUMP 50');
  r.advance(2900);
  assert.equal(r.path, 'PROGRAM.DUMP_XFER');
  r.advance(200);
  assert.equal(r.path, 'PROGRAM.SAVE_D');
});

test('PGM-10 BOTH_HOLD_5S aborts the transfer → DUMP item', () => {
  const r = pgm().pgmGoto(P('DUMP'));
  r.tap('LF').tap('LF').tap('STEP');
  r.press('STEP').press('LF').advance(5100).release('STEP').release('LF'); // 5 s < 6 s transfer
  assert.equal(r.path, P('DUMP'));
});

test('PGM-10 SAVE D: LF toggles Y/N; STEP exits programming (END skipped) to the prior mode', () => {
  const r = new Rig().boot().gotoItem('OIL').enterProgram().pgmGoto(P('DUMP'));
  r.tap('LF').tap('STEP').advance(3100);
  r.tap('LF');
  assert.equal(r.text, 'SAVE D?Y');
  r.tap('LF');
  assert.equal(r.text, 'SAVE D?N');
  r.tap('STEP');
  assert.equal(r.path, 'MANUAL');
  assert.equal(r.item, 'OIL');
});

test('PGM-10 / CALC-7 SAVE D?Y advances the new-data pointer (FULL resets); SAVE D?N does not', () => {
  for (const save of [true, false]) {
    const r = new Rig().boot();
    r.advance(13 * 60000); // ≥120 records at 6 s → FULL 1
    r.enterProgram().pgmGoto(P('DUMP'));
    r.tap('LF').tap('STEP').advance(3100);
    if (save) r.tap('LF');
    r.tap('STEP');
    r.powerOff().powerOn();
    r.until((x) => x.path === 'STARTUP_INFO.FULL', 20000);
    assert.equal(r.text, save ? 'FULL 0' : 'FULL 1', `save=${save}`);
  }
});

// ---------------------------------------------------------------- PGM-11 LTM list

function ltm(opts) {
  const r = pgm(opts).pgmGoto(P('DUMP'));
  r.holdBoth(5100);
  assert.equal(r.path, 'PROGRAM.LTM.TIME');
  return r;
}

test('PGM-11 LTM list order and initial values (TIME 6, date/time from clock, ID, END Y)', () => {
  const r = ltm({ clockMs: Date.UTC(2026, 9, 27, 14, 35, 20) });
  const seen = [];
  for (let i = 0; i < 8; i++) {
    seen.push([r.path.split('.').pop(), r.text]);
    if (r.path === 'PROGRAM.LTM.END') break;
    r.tap('STEP');
  }
  assert.deepEqual(seen.map((s) => s[0]), ['TIME', 'MNTH', 'DAY', 'YEAR', 'HOUR', 'MIN', 'ID', 'END']);
  assert.equal(seen[0][1], 'TIME 6');
  assert.deepEqual(seen.slice(1, 6).map((s) => num(s[1])), [10, 27, 26, 14, 35]);
  assert.equal(seen[6][1], 'N12345');
  assert.equal(seen[7][1], 'END Y');
  r.tap('STEP');
  assert.equal(r.path, P('END'), 'STEP on LTM END Y → main END');
});

test('PGM-11 TIME 2…500 clamps; tap −1 / hold +1 with ×10 acceleration', () => {
  const r = ltm();
  r.taps('LF', 6);
  assert.equal(r.text, 'TIME 2');
  r.hold('LF', 3150); // 2 + 12 + 10
  assert.equal(r.text, 'TIME 24');
  const m = ltm({ settings: { recordInterval: 499 } });
  m.hold('LF', 1000);
  assert.equal(m.text, 'TIME 500');
});

test('PGM-11 changing TIME while recording starts a new flight file', () => {
  const r = new Rig().boot();
  r.advance(30000); // hot engine → recording
  const before = r.settings.ltm.flightFiles;
  r.enterProgram().pgmGoto(P('DUMP')).holdBoth(5100);
  r.tap('LF').tap('STEP'); // TIME 5, leave TIME
  assert.equal(r.settings.recordInterval, 5);
  assert.equal(r.settings.ltm.flightFiles, before + 1);
});

test('PGM-11 calendar/time fields wrap (MNTH 12→1, DAY 31→1, YEAR 79→80, HOUR 23→0, MIN 59→0 and reverse)', () => {
  const r = ltm({ clockMs: Date.UTC(2079, 11, 31, 23, 59, 0) });
  r.tap('STEP'); // MNTH 12
  assert.equal(num(r.text), 12);
  r.hold('LF', 800);
  assert.equal(num(r.text), 1);
  r.tap('LF');
  assert.equal(num(r.text), 12);
  r.tap('STEP'); // DAY 31
  assert.equal(num(r.text), 31);
  r.hold('LF', 800);
  assert.equal(num(r.text), 1);
  r.tap('LF');
  assert.equal(num(r.text), 31);
  r.tap('STEP'); // YEAR 79
  assert.equal(num(r.text), 79);
  r.hold('LF', 800);
  assert.equal(num(r.text), 80);
  r.tap('LF');
  assert.equal(num(r.text), 79);
  r.tap('STEP'); // HOUR 23
  assert.equal(num(r.text), 23);
  r.hold('LF', 800);
  assert.equal(num(r.text), 0);
  r.tap('LF');
  assert.equal(num(r.text), 23);
  r.tap('STEP'); // MIN 59
  assert.equal(num(r.text), 59);
  r.hold('LF', 800);
  assert.equal(num(r.text), 0);
  r.tap('LF');
  assert.equal(num(r.text), 59);
});

test('PGM-11 leaving MIN writes the clock with seconds = 0', () => {
  const r = ltm({ clockMs: Date.UTC(2026, 9, 27, 14, 35, 20) });
  r.tap('STEP').tap('STEP').tap('STEP').tap('STEP'); // HOUR
  r.hold('LF', 800); // 15
  r.tap('STEP'); // MIN 35
  r.taps('LF', 5); // 30
  r.tap('STEP'); // leave MIN → clock written
  const d = new Date(r.settings.clockMs);
  assert.equal(d.getUTCHours(), 15);
  assert.equal(d.getUTCMinutes(), 30);
  assert.ok(d.getUTCSeconds() < 2, 'seconds reset to 0 (plus elapsed sub-steps)');
  r.pgmGoto('PROGRAM.LTM.END').tap('STEP').tap('STEP'); // main END Y → exit
  r.powerOff().powerOn();
  r.until((x) => x.path === 'STARTUP_INFO.TIME', 20000);
  assert.equal(r.text, '15.30');
});

test('PGM-11 aircraft ID edit: BOTH_HOLD_5S → first char flashes; tap LF next char; STEP next char; BOTH_HOLD_5S saves', () => {
  const r = ltm();
  r.pgmGoto('PROGRAM.LTM.ID');
  r.holdBoth(5100);
  assert.equal(r.path, 'PROGRAM.LTM_ID_EDIT');
  assert.equal(r.display().digital.flashIndex, 0);
  r.tap('LF'); // N → O
  assert.equal(r.text, 'O12345');
  r.tap('STEP');
  assert.equal(r.display().digital.flashIndex, 1);
  r.tap('LF'); // 1 → 2
  assert.equal(r.text, 'O22345');
  r.hold('LF', 1000); // 2 → 3 → 4
  assert.equal(r.text, 'O42345');
  r.holdBoth(5100);
  assert.equal(r.path, 'PROGRAM.LTM.ID');
  assert.equal(r.text, 'O42345');
  assert.equal(r.settings.aircraftId, 'O42345');
});

test('PGM-11 ID charset order A–Z 0–9 - space (wraps)', () => {
  const r = ltm({ settings: { aircraftId: 'Z9-   ' } });
  r.pgmGoto('PROGRAM.LTM.ID').holdBoth(5100);
  r.tap('LF'); // Z → 0
  assert.equal(r.text[0], '0');
  r.tap('STEP').tap('LF'); // 9 → -
  assert.equal(r.text[1], '-');
  r.tap('STEP').tap('LF'); // - → space
  assert.equal(r.text[2], ' ');
  r.tap('STEP').tap('LF'); // space → A
  assert.equal(r.text[3], 'A');
});

test('PGM-11 TIME setting controls the record interval (SNAP latency ≤ TIME)', () => {
  const r = ltm();
  r.taps('LF', 4); // TIME 2
  r.pgmGoto('PROGRAM.LTM.END').tap('STEP').tap('STEP'); // exit
  r.tap('LF').advance(2100);
  r.tapBoth();
  const t = r.until((x) => x.text === 'SNAP', 3000);
  assert.ok(t <= 2050, `SNAP after ${t} ms`);
});

// ---------------------------------------------------------------- PGM-12

test('PGM-12 END BOTH_HOLD_5S → FAC LIM for 2000 ms → alarm list (FAC? N)', () => {
  const r = pgm().pgmGoto(P('END'));
  r.press('STEP').press('LF').advance(5000).release('STEP').release('LF');
  assert.equal(r.path, 'PROGRAM.FACLIM_BANNER');
  assert.equal(r.text, 'FAC LIM');
  r.advance(1950);
  assert.equal(r.text, 'FAC LIM');
  r.advance(100);
  assert.equal(r.path, 'PROGRAM.FACLIM.FAC');
  assert.equal(r.text, 'FAC? N');
});

test('PGM-2 / rev2 R29 select-switch change in PROGRAM leaves the current item until the next STEP', () => {
  const r = pgm().pgmGoto(P('RATE'));
  r.switchTo('F').advance(200);
  assert.equal(r.path, P('RATE'));
  assert.equal(r.text, 'RATE 4');
  r.tap('STEP');
  assert.equal(r.path, P('KF'), 'next F item after RATE');
});

test('PGM-9 the TIT calibration offset applies only with ORIG T-Y', () => {
  const r = origTit({ sensors: cruiseFrame({ tit: [1450, 0] }) });
  r.advance(1000).tap('LF').tap('STEP').advance(1000); // ORIG T-Y → CAL TIT
  r.taps('LF', 5); // TIT-5
  r.tap('STEP');
  r.pgmGoto(P('END')).tap('STEP');
  r.gotoItem('TIT1');
  assert.equal(r.text, '1445 12.5');
  r.enterProgram().pgmGoto(P('RATE')).holdBoth(5100).advance(1000);
  assert.equal(r.text, 'ORIG T-Y', 'stored setting shown');
  r.tap('LF').tap('STEP'); // ORIG T-N → next after RATE
  r.pgmGoto(P('END')).tap('STEP');
  r.gotoItem('TIT1');
  assert.equal(r.text, '1450 12.5');
});
