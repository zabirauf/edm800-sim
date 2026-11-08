// Test helpers for the EDM-800 state machine (spec: docs/02-SPEC.md rev2).
// All expectations in the tests are derived from the spec; these helpers only drive the machine.

import { EDM, defaultSensors } from '../src/edm/machine.js';

export { EDM, defaultSensors };

/** A warm cruise sensor frame (engine running, all probes good, GPS ok). */
export function cruiseFrame(over = {}) {
  return {
    egt: [1340, 1360, 1320, 1350, 1330, 1345],
    cht: [350, 360, 340, 355, 345, 352],
    tit: [1450, 1400],
    oil: 185,
    oat: 59,
    iat: 70,
    cdt: 200,
    crb: 40,
    bat: 14.1,
    rpm: 2400,
    map: 23.1,
    ffGph: 12.5,
    ffSignal: true,
    pctHp: 65,
    gps: { status: 'ok', offCourse: false, gs: 150, dist: 100 },
    failed: [],
    calErr: [],
    ...over,
  };
}

export class Rig {
  constructor({ config = {}, sensors = null, settings = null, clockMs } = {}) {
    this.edm = new EDM({ config, clockMs });
    if (settings) applySettings(this.edm.settings, settings);
    this.edm.send({ type: 'SENSORS', data: sensors ?? cruiseFrame() });
  }

  get settings() { return this.edm.settings; }
  send(ev) { this.edm.send(ev); return this; }
  state() { return this.edm.getState(); }
  display() { return this.edm.getDisplay(); }
  get path() { return this.edm.getState().path; }
  get item() { return this.edm.getState().item; }
  get text() { return this.edm.getDisplay().digital.text; }
  get blink() { return this.edm.getDisplay().digital.blink; }
  get upper() { return this.edm.getDisplay().upper.text; }
  get dot() { return this.edm.getDisplay().dot; }
  get columns() { return this.edm.getDisplay().columns; }
  col(id) { return this.edm.getDisplay().columns.find((c) => c.id === String(id)); }
  get now() { return this.edm.now; }

  sensors(data) { this.edm.send({ type: 'SENSORS', data }); return this; }
  switchTo(position) { this.edm.send({ type: 'SELECT_SWITCH', position }); return this; }
  advance(ms) { if (ms > 0) this.edm.send({ type: 'TICK', ms }); return this; }
  press(b) { this.edm.send({ type: 'PRESS', button: b }); return this; }
  release(b) { this.edm.send({ type: 'RELEASE', button: b }); return this; }
  powerOn() { this.edm.send({ type: 'POWER_ON' }); return this; }
  powerOff() { this.edm.send({ type: 'POWER_OFF' }); return this; }

  /** Tap: press, hold `ms` (< 700), release. */
  tap(b, ms = 100) { return this.press(b).advance(ms).release(b); }
  /** Repeated taps with a small gap between them. */
  taps(b, n, gap = 50) { for (let i = 0; i < n; i++) this.tap(b).advance(gap); return this; }
  /** Hold a single button for `ms`, then release. */
  hold(b, ms) { return this.press(b).advance(ms).release(b); }
  /** Chord: STEP then LF (gap ms later), hold `ms` from the second press, release both. */
  both(ms, gap = 0) {
    this.press('STEP').advance(gap).press('LF').advance(ms);
    return this.release('STEP').release('LF');
  }
  tapBoth(ms = 100) { return this.both(ms); }
  holdBoth(ms = 5100) { return this.both(ms); }

  /** Advance in 50 ms steps until pred() is true; returns elapsed ms or throws. */
  until(pred, maxMs = 60000, step = 50) {
    let t = 0;
    while (!pred(this)) {
      if (t >= maxMs) throw new Error(`until(): condition not met in ${maxMs} ms (path ${this.path}, text "${this.text}")`);
      this.advance(step);
      t += step;
    }
    return t;
  }

  /** POWER_ON and run the power-up sequence to its first interactive point (FILL? N with ff, else MANUAL). */
  bootToFill() {
    this.powerOn();
    this.until((r) => r.path === 'MANUAL' || r.path === 'AUTO' || (r.path.startsWith('FUEL_FILL') && r.text.startsWith('FILL')), 120000);
    return this;
  }

  /** POWER_ON → MANUAL (exits the fuel-fill question with STEP when ff). */
  boot() {
    this.bootToFill();
    if (this.path.startsWith('FUEL_FILL')) this.tap('STEP');
    if (this.path !== 'MANUAL') throw new Error(`boot(): expected MANUAL, got ${this.path}`);
    return this;
  }

  /** POWER_ON → MANUAL → AUTO using the 2-minute power-up timer (PWR-9). */
  bootAuto() {
    this.boot();
    this.until((r) => r.path === 'AUTO', 130000);
    return this;
  }

  /** In MANUAL: tap STEP until `id` is displayed. */
  gotoItem(id, max = 40) {
    for (let i = 0; i < max && this.item !== id; i++) this.tap('STEP').advance(50);
    if (this.item !== id) throw new Error(`gotoItem(${id}): not reached (at ${this.item})`);
    return this;
  }

  /** Collect the MANUAL scan list by tapping STEP around the loop once. */
  manualList(max = 40) {
    const first = this.item;
    const list = [first];
    for (let i = 0; i < max; i++) {
      this.tap('STEP').advance(50);
      if (this.item === first) break;
      list.push(this.item);
    }
    return list;
  }

  /** BOTH_HOLD_5S from AUTO/MANUAL → PROGRAM, past the 2 s banner. */
  enterProgram() {
    this.holdBoth(5100);
    this.until((r) => r.path !== 'PROGRAM.BANNER', 3000);
    return this;
  }

  /** In PROGRAM: tap STEP until path matches `path`. */
  pgmGoto(path, max = 40) {
    for (let i = 0; i < max && this.path !== path; i++) this.tap('STEP').advance(50);
    if (this.path !== path) throw new Error(`pgmGoto(${path}): not reached (at ${this.path})`);
    return this;
  }

  /** Collect the visible program items from the current one to END. */
  pgmList(max = 30) {
    const list = [this.path];
    for (let i = 0; i < max && !this.path.endsWith('.END'); i++) {
      this.tap('STEP').advance(50);
      list.push(this.path);
    }
    return list;
  }

  /** From PROGRAM main list → FACLIM list first item (FAC). */
  enterFacLim() {
    this.pgmGoto('PROGRAM.ITEM.END');
    this.holdBoth(5100);
    this.until((r) => r.path !== 'PROGRAM.FACLIM_BANNER', 3000);
    return this;
  }

  /** Feed sensor frames: fn(tMs) → partial frame, every `step` ms for `durMs`. */
  ramp(durMs, fn, step = 250) {
    for (let t = step; t <= durMs; t += step) {
      this.sensors(fn(t));
      this.advance(step);
    }
    return this;
  }
}

function applySettings(target, over) {
  for (const [k, v] of Object.entries(over)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object') {
      applySettings(target[k], v);
    } else {
      target[k] = v;
    }
  }
}

/** Trailing/leading number parser for program displays such as `MNTH 10`. */
export function num(text) {
  const m = /-?\d+(\.\d+)?|-?\.\d+/.exec(text);
  return m ? Number(m[0]) : NaN;
}

/** Percentage-view EGT segment formula (ANA-3), written from the spec. */
export function pctSegs(v, red) {
  if (v < 0.5 * red) return 0;
  return Math.min(13, Math.max(0, Math.round((v / red - 0.5) / (0.5 / 12)) + 1));
}

/** CHT missing-segment formula (ANA-5). */
export function chtSeg(cht) {
  if (cht < 237.5) return 0;
  return Math.min(13, Math.max(1, Math.round((cht - 250) / 25) + 1));
}

export const SUB = 50; // internal sub-step / timer slack
