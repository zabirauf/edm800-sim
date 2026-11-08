// §14 Data download (DL-1 … DL-3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rig } from './helpers.mjs';

test('DL-1 / IN-6 USB_INSERT in MANUAL → USB.MENU NEW; LF toggles NEW⇄ALL', () => {
  const r = new Rig().boot();
  r.send({ type: 'USB_INSERT' });
  assert.equal(r.path, 'USB.MENU');
  assert.equal(r.text, 'NEW');
  r.tap('LF');
  assert.equal(r.text, 'ALL');
  r.tap('LF');
  assert.equal(r.text, 'NEW');
});

test('DL-1 NEW transfer: countdown 100 → 0 over 3 s, then DONE', () => {
  const r = new Rig().boot();
  r.send({ type: 'USB_INSERT' });
  r.tap('STEP');
  assert.equal(r.path, 'USB.XFER');
  assert.equal(r.text, '100');
  r.advance(1500);
  assert.equal(r.text, '50');
  r.advance(1450);
  assert.equal(r.path, 'USB.XFER');
  r.advance(100);
  assert.equal(r.path, 'USB.DONE');
  assert.equal(r.text, 'DONE');
});

test('DL-1 ALL transfer takes 6 s', () => {
  const r = new Rig().boot();
  r.send({ type: 'USB_INSERT' });
  r.tap('LF').tap('STEP');
  r.advance(3000);
  assert.equal(r.text, '50');
  r.advance(3100);
  assert.equal(r.text, 'DONE');
});

test('DL-1 / IN-6 USB_REMOVE from any USB state → prior mode (MANUAL at its item / AUTO)', () => {
  for (const stage of ['MENU', 'XFER', 'DONE']) {
    const r = new Rig().boot().gotoItem('OIL');
    r.send({ type: 'USB_INSERT' });
    if (stage !== 'MENU') r.tap('STEP');
    if (stage === 'DONE') r.advance(3100);
    assert.equal(r.path, `USB.${stage}`);
    r.send({ type: 'USB_REMOVE' });
    assert.equal(r.path, 'MANUAL', stage);
    assert.equal(r.item, 'OIL');
  }
  const a = new Rig().bootAuto();
  a.send({ type: 'USB_INSERT' });
  assert.equal(a.path, 'USB.MENU');
  a.send({ type: 'USB_REMOVE' });
  assert.equal(a.path, 'AUTO');
});

test('DL-1 USB_INSERT ignored without the optional USB port', () => {
  const r = new Rig({ config: { usbPort: false } }).boot();
  r.send({ type: 'USB_INSERT' });
  assert.equal(r.path, 'MANUAL');
});

test('DL-2 / IN-6 MEMBOX_CONNECT → DUMPNEW/DUMPALL; STEP → DOWNLOAD 1000 ms → nn% 0…100 → DONE; disconnect → prior mode', () => {
  const r = new Rig({ config: { usbPort: false } }).boot().gotoItem('EGT2');
  r.send({ type: 'MEMBOX_CONNECT' });
  assert.equal(r.path, 'USB.MENU');
  assert.equal(r.text, 'DUMPNEW');
  r.tap('LF');
  assert.equal(r.text, 'DUMPALL');
  r.tap('LF');
  assert.equal(r.text, 'DUMPNEW');
  r.tap('STEP');
  assert.equal(r.text, 'DOWNLOAD');
  r.advance(950);
  assert.equal(r.text, 'DOWNLOAD');
  r.advance(100);
  assert.match(r.text, /^\d{1,3}%$/);
  let last = -1;
  const seen = [];
  r.until((x) => {
    if (x.text.endsWith('%')) {
      const v = Number(x.text.slice(0, -1));
      assert.ok(v >= last, 'progress is monotonic');
      last = v;
      seen.push(v);
    }
    return x.text === 'DONE';
  }, 15000);
  assert.ok(seen[0] <= 5 && last >= 95, `progress ${seen[0]} → ${last}`);
  r.send({ type: 'MEMBOX_DISCONNECT' });
  assert.equal(r.path, 'MANUAL');
  assert.equal(r.item, 'EGT2');
});

test('DL-3 successful USB download advances the LTM new-data pointer (FULL 0 next power-up)', () => {
  const r = new Rig().boot();
  r.advance(13 * 60000);
  r.tap('STEP'); // AUTO → MANUAL
  r.send({ type: 'USB_INSERT' });
  r.tap('STEP').advance(3100);
  assert.equal(r.text, 'DONE');
  r.send({ type: 'USB_REMOVE' });
  r.powerOff().powerOn();
  r.until((x) => x.path === 'STARTUP_INFO.FULL', 20000);
  assert.equal(r.text, 'FULL 0');
});

test('DL-3 aborted download (removed during transfer) does not advance the pointer', () => {
  const r = new Rig().boot();
  r.advance(13 * 60000);
  r.tap('STEP');
  r.send({ type: 'USB_INSERT' });
  r.tap('STEP').advance(1000);
  r.send({ type: 'USB_REMOVE' });
  r.powerOff().powerOn();
  r.until((x) => x.path === 'STARTUP_INFO.FULL', 20000);
  assert.equal(r.text, 'FULL 1');
});

test('DL-3 successful memory-box download advances the pointer', () => {
  const r = new Rig().boot();
  r.advance(13 * 60000);
  r.tap('STEP');
  r.send({ type: 'MEMBOX_CONNECT' });
  r.tap('STEP');
  r.until((x) => x.text === 'DONE', 15000);
  r.send({ type: 'MEMBOX_DISCONNECT' });
  r.powerOff().powerOn();
  r.until((x) => x.path === 'STARTUP_INFO.FULL', 20000);
  assert.equal(r.text, 'FULL 0');
});
