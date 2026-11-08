// §13 EDM-711 primary (P711-1 … P711-7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rig, cruiseFrame } from './helpers.mjs';

const cfg711 = (over = {}) => ({ primary711: true, ...over });

function autoSequence(r, n = 7) {
  const seq = [r.item];
  for (let i = 0; i < n; i++) {
    const cur = r.item;
    r.until((x) => x.item !== cur, 12000);
    seq.push(r.item);
  }
  return seq;
}

test('P711-1 AUTO scans only CHTHI, TIT1, OIL in that order', () => {
  const r = new Rig({ config: cfg711() }).bootAuto();
  r.advance(4100);
  const seq = autoSequence(r, 6);
  const i = seq.indexOf('CHTHI');
  assert.ok(i >= 0, `sequence ${seq}`);
  assert.deepEqual(seq.slice(i, i + 4), ['CHTHI', 'TIT1', 'OIL', 'CHTHI']);
  assert.ok(seq.every((x) => ['CHTHI', 'TIT1', 'OIL'].includes(x)), `sequence ${seq}`);
});

test('P711-1 AUTO ignores the select switch and exclusions', () => {
  const r = new Rig({ config: cfg711() }).boot();
  r.gotoItem('OIL').tapBoth();
  r.switchTo('F');
  r.until((x) => x.path === 'AUTO', 130000);
  r.advance(4100);
  const seq = autoSequence(r, 6);
  assert.ok(seq.includes('OIL') && seq.includes('TIT1') && seq.includes('CHTHI'), `sequence ${seq}`);
});

test('P711-1 AUTO without TIT: CHTHI, OIL', () => {
  const r = new Rig({ config: cfg711({ tit: 0 }) }).bootAuto();
  r.advance(4100);
  const seq = autoSequence(r, 4);
  assert.ok(seq.every((x) => ['CHTHI', 'OIL'].includes(x)), `sequence ${seq}`);
  assert.ok(seq.includes('CHTHI') && seq.includes('OIL'));
});

test('P711-1 / §7.2 CHTHI: cht CHT with dot at the hottest CHT cylinder', () => {
  const r = new Rig({ config: cfg711() }).bootAuto();
  r.until((x) => x.item === 'CHTHI', 20000);
  assert.equal(r.text, '360 CHT');
  assert.deepEqual(r.dot, { index: 1, blink: false });
});

test('P711-2 MANUAL scans all items (normal list with switch); BOTH_TAP exclusion has no effect', () => {
  const r = new Rig({ config: cfg711() }).boot();
  const list = r.manualList();
  assert.deepEqual(list.slice(0, 4), ['BAT', 'OAT', 'DIF', 'RPMMAP']);
  assert.ok(list.includes('EGT6') && list.includes('CLD') && list.includes('USD'));
  r.gotoItem('OIL').tapBoth();
  assert.deepEqual(r.state().excluded, []);
  assert.equal(r.text, '185 OIL', 'no exclusion marker');
  const f = new Rig({ config: cfg711() });
  f.switchTo('F');
  f.boot();
  assert.ok(!f.manualList().includes('EGT1'));
});

test('P711-3 RATE range 1…9 (wrap), automatic mode cannot be disabled', () => {
  const r = new Rig({ config: cfg711() }).boot().enterProgram().pgmGoto('PROGRAM.ITEM.RATE');
  r.taps('LF', 3);
  assert.equal(r.text, 'RATE 1');
  r.tap('LF');
  assert.equal(r.text, 'RATE 9');
  r.hold('LF', 800);
  assert.equal(r.text, 'RATE 1');
});

test('P711-4 EGTn in MANUAL shows EGT-CHT for 1000 ms first', () => {
  const r = new Rig({ config: cfg711() }).boot().gotoItem('USD');
  r.tap('STEP');
  assert.equal(r.item, 'EGT1');
  assert.equal(r.text, 'EGT-CHT');
  r.advance(950);
  assert.equal(r.text, 'EGT-CHT');
  r.advance(100);
  assert.equal(r.text, '1340 350');
  r.tap('STEP');
  assert.equal(r.text, 'EGT-CHT');
});

test('P711-5 primary lamps: RED > limit, YELLOW > limit − 45 (CHT) / − 25 (OIL) / − 100 (TIT)', () => {
  const r = new Rig({ config: cfg711() }).boot();
  const lamps = () => r.display().lamps711;
  assert.deepEqual(lamps(), { cht: 'off', oil: 'off', tit: 'off' });
  r.sensors({ cht: [350, 360, 340, 355, 415, 352], oil: 205, tit: [1550, 0] });
  assert.deepEqual(lamps(), { cht: 'off', oil: 'off', tit: 'off' }, 'at the yellow threshold');
  r.sensors({ cht: [350, 360, 340, 355, 416, 352], oil: 206, tit: [1551, 0] });
  assert.deepEqual(lamps(), { cht: 'yellow', oil: 'yellow', tit: 'yellow' });
  r.sensors({ cht: [350, 360, 340, 355, 460, 352], oil: 230, tit: [1650, 0] });
  assert.deepEqual(lamps(), { cht: 'yellow', oil: 'yellow', tit: 'yellow' }, 'at the limit');
  r.sensors({ cht: [350, 360, 340, 355, 461, 352], oil: 231, tit: [1651, 0] });
  assert.deepEqual(lamps(), { cht: 'red', oil: 'red', tit: 'red' });
});

test('P711-5 lamps are not extinguished by STEP (tap or hold)', () => {
  const r = new Rig({ config: cfg711() }).boot();
  r.sensors({ cht: [350, 360, 340, 355, 470, 352] }).advance(100);
  r.tap('STEP');
  assert.equal(r.display().lamps711.cht, 'red');
  r.hold('STEP', 5100);
  assert.equal(r.display().lamps711.cht, 'red');
});

test('P711-5 lamps are absent on a non-711 instrument', () => {
  const r = new Rig().boot();
  assert.equal(r.display().lamps711, null);
});

test('P711-6 factory primary limits CHT 460, OIL 230, TIT 1650; displayed but locked in the alarm list', () => {
  const r = new Rig({ config: cfg711() }).boot().enterProgram().enterFacLim();
  for (const [id, text] of [['HCHT', '460 H CHT'], ['TIT', '1650 TIT'], ['HOIL', '230 H OIL']]) {
    r.pgmGoto(`PROGRAM.FACLIM.${id}`);
    assert.equal(r.text, text);
    r.tap('LF').hold('LF', 1500);
    assert.equal(r.text, text, `${id} locked`);
  }
  r.pgmGoto('PROGRAM.FACLIM.LOIL').tap('LF');
  assert.equal(r.text, '85 L OIL', 'L OIL is not locked');
});

test('P711-6 CHT alarm uses the 460 °F primary limit', () => {
  const r = new Rig({ config: cfg711() }).boot().gotoItem('OAT');
  r.sensors({ cht: [350, 360, 340, 355, 460, 352] }).advance(100);
  assert.equal(r.state().alarm, null);
  r.sensors({ cht: [350, 360, 340, 355, 461, 352] }).advance(100);
  assert.equal(r.state().alarm, 'CHT');
});

test('P711-7 STEP tap extinguishes the flashing digital alarm (lamp stays)', () => {
  const r = new Rig({ config: cfg711() }).boot().gotoItem('OAT');
  r.sensors({ oil: 240 }).advance(100);
  assert.equal(r.text, '240 OIL');
  assert.equal(r.blink, true);
  r.tap('STEP').advance(100);
  assert.equal(r.state().alarm, null);
  assert.equal(r.text, '59 OAT');
  assert.equal(r.display().lamps711.oil, 'red');
});

test('P711-7 / C11 STEP hold → OFF works on the 711 digital alarm', () => {
  const r = new Rig({ config: cfg711() }).boot();
  r.sensors({ oil: 240 }).advance(100);
  r.press('STEP').advance(5050);
  assert.equal(r.text, 'OFF');
  r.release('STEP');
});

test('P711-1 on entering AUTO the display goes straight to the primary scan (no non-primary item shown)', () => {
  const r = new Rig({ config: cfg711() }).boot();
  assert.equal(r.item, 'BAT');
  r.until((x) => x.path === 'AUTO', 130000);
  r.advance(50);
  assert.ok(['CHTHI', 'TIT1', 'OIL'].includes(r.item), `AUTO showing ${r.item}`);
});

test('P711-4 EGT-CHT also shown when an EGTn item comes into the display by scanning backwards', () => {
  const r = new Rig({ config: cfg711() }).boot().gotoItem('TIT1');
  r.press('STEP').advance(750);
  assert.equal(r.item, 'EGT6');
  assert.equal(r.text, 'EGT-CHT');
  r.release('STEP');
});
