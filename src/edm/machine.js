// JPI EDM-800 instrument state machine. Behavior follows docs/02-SPEC.md; rule IDs are cited inline.
//
// Usage:
//   const edm = new EDM({ config, settings, clockMs });
//   edm.send({ type: 'POWER_ON' }); edm.send({ type: 'TICK', ms: 100 });
//   edm.send({ type: 'PRESS', button: 'STEP' }); edm.send({ type: 'RELEASE', button: 'STEP' });
//   edm.getState(); edm.getDisplay();

import {
  T, LF_RISE_F, LF_PEAK_DROP_F, LF_TIT_GRACE_F, SEGMENTS, NORM_REF_SEG, PREIGNITION_F, MIN_FLOW,
  LTM_CAPACITY, TEMP_RANGES, ALARM_PRIORITY, SCAN_ORDER, SWITCH_TAGS, FUEL_UNITS, FUEL_UNIT_FACTOR, FLOW_LABEL,
  MILEAGE_LABEL, ID_CHARSET, DEFAULT_CONFIG,
} from './constants.js';
import { GestureRecognizer } from './gestures.js';
import { defaultSettings, factoryLimits } from './settings.js';
import { toC, toF, dToC, clamp, int, fmtEgt, fmtFuel, fmt1, fmtSigned, fmtHM, pad2 } from './format.js';

const NORMAL_STATES = new Set(['AUTO', 'MANUAL', 'LEANFIND']);
const round10 = (v) => int(Math.round(v / 10) * 10);
const yn = (b) => (b ? 'Y' : 'N');

export function defaultSensors() {
  return {
    egt: [70, 70, 70, 70, 70, 70],
    cht: [70, 70, 70, 70, 70, 70],
    tit: [70, 70],
    oil: 70,
    oat: 59,
    iat: 70,
    cdt: 70,
    crb: 60,
    bat: 12.6,
    rpm: 0,
    map: 29.9,
    ffGph: 0,
    ffSignal: true,
    pctHp: 0,
    gps: { status: 'ok', offCourse: false, gs: 0, dist: 0 }, // status: off|nocom|nosig|nowpt|ok (IN-4)
    failed: [], // channel ids: EGT1..6, CHT1..6, OIL, TIT1, TIT2, OAT, IAT, CDT, CRB
    calErr: [],
  };
}

export class EDM {
  constructor({ config = {}, settings = null, clockMs } = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.settings = settings ? structuredClone(settings) : defaultSettings(this.config, clockMs);
    this.g = new GestureRecognizer();
    this.now = 0;
    this.state = 'OFF';
    this.ctx = {};
    this.switchPos = 'A';
    this.sensors = defaultSensors();
    this.ambient = 1;
    this.brightness = 1;
    this.usbInserted = false;
    this.memboxConnected = false;
    this.vol = this._freshVolatile();
    this.events = []; // semantic gesture log (for debugging / UI)
  }

  _freshVolatile() {
    return {
      powerOnAt: this.now,
      autoTimerFired: false,
      mode: 'MANUAL',
      item: 'BAT',
      autoNextAt: Infinity,
      excluded: new Set(),
      view: 'P',
      normRef: {},
      alarmSupp: {},
      alarmDisplayed: null,
      stepPressAlarm: null,
      offUntil: 0,
      snapUntil: 0,
      snapPending: false,
      autoPending: false,
      alarmActive: null,
      egtChtUntil: 0,
      titOverSince: null,
      lopResults: null,
      cldHist: [],
      lastCldSample: -Infinity,
      lastRecordAt: -Infinity,
      recording: false,
    };
  }

  // ------------------------------------------------------------------ public API

  send(ev) {
    switch (ev.type) {
      case 'TICK':
        this._tick(ev.ms);
        break;
      case 'PRESS':
        if (ev.button === 'STEP' && !this.g.isDown('LF')) this.vol.stepPressAlarm = this._visibleAlarm();
        this.g.press(ev.button, this.now);
        break;
      case 'RELEASE': {
        const evs = this.g.release(ev.button, this.now);
        for (const e of evs) this._dispatch(e);
        if (ev.button === 'STEP') this.vol.stepPressAlarm = null;
        break;
      }
      case 'POWER_ON':
        this._powerOn();
        break;
      case 'POWER_OFF':
        this.state = 'OFF';
        this.ctx = {};
        break;
      case 'SENSORS':
        this.sensors = { ...this.sensors, ...ev.data };
        break;
      case 'SELECT_SWITCH':
        if (['T', 'A', 'F'].includes(ev.position)) this.switchPos = ev.position;
        break;
      case 'USB_INSERT':
        this.usbInserted = true;
        if (this.config.usbPort) this._usbStart('port');
        break;
      case 'USB_REMOVE':
        this.usbInserted = false;
        if (this.state === 'USB' && this.ctx.usb.source === 'port') this._usbEnd();
        break;
      case 'MEMBOX_CONNECT':
        this.memboxConnected = true;
        this._usbStart('box');
        break;
      case 'MEMBOX_DISCONNECT':
        this.memboxConnected = false;
        if (this.state === 'USB' && this.ctx.usb.source === 'box') this._usbEnd();
        break;
      case 'AMBIENT':
        this.ambient = clamp(ev.level, 0, 1);
        break;
      default:
        throw new Error(`Unknown event ${ev.type}`);
    }
  }

  getState() {
    const s = { state: this.state, path: this._path(), mode: this.vol.mode, item: this.vol.item, view: this.vol.view };
    s.alarm = NORMAL_STATES.has(this.state) ? this._shownAlarm() : null;
    s.excluded = [...this.vol.excluded];
    if (this.state === 'LEANFIND') {
      const lf = this.ctx.lf;
      s.leanfind = { phase: lf.phase, method: lf.method, lock: lf.lock, order: [...lf.order] };
    }
    if (this.state === 'PROGRAM') s.program = { sub: this.ctx.pgm.sub, item: this._pgmItemId() };
    s.lopResults = this.vol.lopResults ? structuredClone(this.vol.lopResults) : null;
    return s;
  }

  // ------------------------------------------------------------------ time

  _tick(ms) {
    let remaining = ms;
    while (remaining > 0) {
      const dt = Math.min(T.SUBSTEP, remaining);
      remaining -= dt;
      this.now += dt;
      this.settings.clockMs += dt;
      if (this.state === 'OFF') continue;
      for (const e of this.g.advance(this.now)) this._dispatch(e);
      this._update(dt);
    }
  }

  _powerOn() {
    if (this.state !== 'OFF') return;
    const stepHeld = this.g.isDown('STEP');
    this.g.lockHeldButtons(); // BTN-11
    this.vol = this._freshVolatile(); // PWR-10
    this.vol.powerOnAt = this.now;
    if (stepHeld && this.config.ff) {
      this.state = 'TANK_SETUP'; // PWR-1
      this.ctx = { tank: { item: 'MAIN' } };
    } else {
      this._startSelfTest();
    }
  }

  _startSelfTest() {
    const steps = [{ state: 'SELFTEST', sub: 'SEGMENTS', dur: T.SELFTEST_SEGMENTS }];
    this._columnLabels().forEach((col, i) =>
      steps.push({ state: 'SELFTEST', sub: 'COLUMNS', col: i, dur: T.SELFTEST_COLUMN }),
    );
    const names = { OIL: 'OIL', TIT1: 'TIT 1', TIT2: 'TIT2', CDT: 'CDT CRB', CRB: 'CDT CRB', IAT: 'IND', OAT: 'OAT' };
    for (const ch of this._installedChannels()) {
      const open = (this.sensors.failed || []).includes(ch);
      const cal = (this.sensors.calErr || []).includes(ch);
      if (!open && !cal) continue;
      const m = /^(EGT|CHT)(\d)$/.exec(ch);
      const name = m ? `${m[1]} ${m[2]}` : names[ch];
      steps.push({ state: 'SELFTEST', sub: 'PROBES', text: open ? 'OPEN PRB' : 'CAL ERR', dur: T.SELFTEST_PROBE_MSG });
      steps.push({ state: 'SELFTEST', sub: 'PROBES', text: name, dur: T.SELFTEST_PROBE_MSG });
    }
    const dt = new Date(this.settings.clockMs);
    const full = int((((this.settings.ltm.records - this.settings.ltm.savedAt) / LTM_CAPACITY) * 100));
    steps.push({ state: 'STARTUP_INFO', sub: 'DATE', dur: T.STARTUP_INFO,
      text: `${pad2(dt.getUTCMonth() + 1)}.${pad2(dt.getUTCDate())}.${pad2(dt.getUTCFullYear() % 100)}` });
    steps.push({ state: 'STARTUP_INFO', sub: 'TIME', dur: T.STARTUP_INFO,
      text: `${pad2(dt.getUTCHours())}.${pad2(dt.getUTCMinutes())}` });
    steps.push({ state: 'STARTUP_INFO', sub: 'FULL', dur: T.STARTUP_INFO, text: `FULL ${clamp(full, 0, 100)}` });
    steps.push({ state: 'STARTUP_INFO', sub: 'ID', dur: T.STARTUP_INFO, text: this.settings.aircraftId });
    this.ctx = { seq: steps, idx: 0, until: this.now + steps[0].dur };
    this.state = steps[0].state;
  }

  _inPowerUpSequence() {
    return ['TANK_SETUP', 'SELFTEST', 'STARTUP_INFO'].includes(this.state) ||
      (this.state === 'FUEL_FILL' && this.ctx.fuel.context === 'powerup');
  }

  /** End of the power-up sequence: MANUAL, or AUTO if the 2-minute timer already expired (PWR-8/9). */
  _endPowerUp() {
    this._enterNormal(this.vol.autoPending ? 'AUTO' : 'MANUAL', null);
    this.vol.autoPending = false;
  }

  _update(dt) {
    const d = this._derive();
    this._updateDerivedHistory(d, dt);

    // Brightness (ANA-13)
    this.brightness += (this.ambient - this.brightness) * (1 - Math.exp(-dt / T.DIM_TAU));

    // 2-minute automatic mode (PWR-9)
    if (!this.vol.autoTimerFired && this.now - this.vol.powerOnAt >= T.AUTO_AFTER_POWER) {
      this.vol.autoTimerFired = true;
      if (this.state === 'MANUAL') this._enterNormal('AUTO', this.vol.item);
      else if (this._inPowerUpSequence()) this.vol.autoPending = true; // PWR-9 (rev2)
    }

    switch (this.state) {
      case 'SELFTEST':
      case 'STARTUP_INFO':
        if (this.now >= this.ctx.until) {
          this.ctx.idx++;
          const step = this.ctx.seq[this.ctx.idx];
          if (step) {
            this.state = step.state;
            this.ctx.until = this.now + step.dur;
          } else if (this.config.ff) {
            this._enterFuelFill('powerup'); // PWR-7
          } else {
            this._endPowerUp(); // PWR-8
          }
        }
        break;
      case 'FUEL_FILL':
        if (this.ctx.fuel.sub === 'BANNER' && this.now >= this.ctx.fuel.until) this.ctx.fuel.sub = 'SEL';
        break;
      case 'AUTO':
        this._fixScanItem(d);
        if (this._autoEnabled() && this.now >= this.vol.autoNextAt) {
          const list = this._autoItems(d);
          if (list.length) this.vol.item = this._nextIn(list, this.vol.item, 1);
          this.vol.autoNextAt = this.now + this._dwell(this.vol.item);
        }
        break;
      case 'MANUAL':
        this._fixScanItem(d);
        break;
      case 'LEANFIND':
        this._updateLeanFind(d);
        break;
      case 'PROGRAM':
        this._updateProgram();
        break;
      case 'USB':
        this._updateUsb();
        break;
      default:
        break;
    }

    this._updateAlarms(d);
  }

  // ------------------------------------------------------------------ derived values

  _installedChannels() {
    const c = this.config;
    const ch = [];
    for (let i = 1; i <= c.cylinders; i++) ch.push(`EGT${i}`);
    for (let i = 1; i <= c.cylinders; i++) ch.push(`CHT${i}`);
    if (c.oil) ch.push('OIL');
    if (c.tit >= 1) ch.push('TIT1');
    if (c.tit >= 2) ch.push('TIT2');
    if (c.cdt) ch.push('CDT');
    if (c.crb && !c.cdt) ch.push('CRB');
    if (c.iat) ch.push('IAT');
    if (c.oat) ch.push('OAT');
    return ch;
  }

  _ok(ch) {
    return !(this.sensors.failed || []).includes(ch) && !(this.sensors.calErr || []).includes(ch);
  }

  _derive() {
    const c = this.config;
    const st = this.settings;
    const s = this.sensors;
    const eng = (f) => (f == null ? null : st.engUnit === 'C' ? toC(f) : f);
    const n = c.cylinders;
    const egtF = [];
    const chtF = [];
    for (let i = 0; i < n; i++) {
      egtF.push(this._ok(`EGT${i + 1}`) ? s.egt[i] : null);
      chtF.push(this._ok(`CHT${i + 1}`) ? s.cht[i] : null);
    }
    const titF = [null, null];
    if (c.tit >= 1 && this._ok('TIT1')) titF[0] = s.tit[0] + (st.origTit ? st.titCal * (st.engUnit === 'C' ? 9 / 5 : 1) : 0);
    if (c.tit >= 2 && this._ok('TIT2')) titF[1] = s.tit[1];
    const oilF = c.oil && this._ok('OIL') ? s.oil : null;

    const egt = egtF.map(eng);
    const cht = chtF.map(eng);
    const working = egt.map((v, i) => [v, i]).filter(([v]) => v != null);
    let dif = null;
    let difCyl = null;
    if (working.length >= 2) {
      const vals = working.map(([v]) => v);
      dif = Math.max(...vals) - Math.min(...vals);
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      let best = -1;
      for (const [v, i] of working) {
        if (Math.abs(v - mean) > best) {
          best = Math.abs(v - mean);
          difCyl = i;
        }
      }
    }
    let chtMax = null;
    let chtMaxCyl = null;
    cht.forEach((v, i) => {
      if (v != null && (chtMax == null || v > chtMax)) {
        chtMax = v;
        chtMaxCyl = i;
      }
    });
    let hotCyl = null;
    egtF.forEach((v, i) => {
      if (v != null && (hotCyl == null || v > egtF[hotCyl])) hotCyl = i;
    });

    // Fuel (CALC-1)
    const flowSignal = c.ff && s.ffSignal !== false;
    const flowGal = flowSignal && st.kf > 0 ? (s.ffGph * c.transducerK) / st.kf : 0; // PGM-8
    const flow = flowGal * FUEL_UNIT_FACTOR[st.fuelUnit];

    // Shock cooling (CALC-5)
    let cld = null;
    let cldCyl = null;
    const hist = this.vol.cldHist;
    if (hist.length >= 2) {
      const cur = hist[hist.length - 1];
      const old = hist[0];
      const mins = (cur.t - old.t) / 60000;
      if (mins >= 5 / 60) {
        cld = 0;
        for (let i = 0; i < n; i++) {
          if (cur.cht[i] == null || old.cht[i] == null) continue;
          let rate = (cur.cht[i] - old.cht[i]) / mins;
          if (st.engUnit === 'C') rate = dToC(rate);
          if (rate < cld) {
            cld = rate;
            cldCyl = i;
          }
        }
      }
    }
    if (cld == null && cht.some((v) => v != null)) cld = 0;

    const oatBase = c.oat && this._ok('OAT') ? (st.oatUnit === 'C' ? toC(s.oat) : s.oat) : null;
    return {
      egtF, chtF, titF, oilF, egt, cht,
      tit: titF.map(eng),
      oil: eng(oilF),
      oat: oatBase == null ? null : oatBase + st.oatCal,
      iat: c.iat && this._ok('IAT') ? eng(s.iat) : null,
      cdt: c.cdt && this._ok('CDT') ? eng(s.cdt) : null,
      crb: c.crb && !c.cdt && this._ok('CRB') ? eng(s.crb) : null,
      bat: s.bat,
      rpm: s.rpm,
      map: s.map + st.mapCal,
      flowSignal,
      flow,
      flowValid: flowSignal && flow >= MIN_FLOW,
      rem: st.rem,
      usd: st.usd,
      dif, difCyl, chtMax, chtMaxCyl, hotCyl, cld, cldCyl,
      pctHp: int((s.pctHp || 0) * (st.hpc / 125)),
      gps: c.ff && c.gps ? s.gps : { status: 'off' },
    };
  }

  _updateDerivedHistory(d, dt) {
    // CHT history for shock cooling, sampled each second over a 30 s window.
    if (this.now - this.vol.lastCldSample >= T.CLD_SAMPLE) {
      this.vol.lastCldSample = this.now;
      this.vol.cldHist.push({ t: this.now, cht: [...d.chtF] });
      while (this.vol.cldHist.length && this.now - this.vol.cldHist[0].t > T.CLD_WINDOW) this.vol.cldHist.shift();
    }
    // Fuel integration (CALC-2)
    if (d.flowSignal && d.flow > 0) {
      const used = (d.flow * dt) / 3600000;
      this.settings.rem = Math.max(0, this.settings.rem - used);
      this.settings.usd += used;
    }
    // Long-term memory recording (CALC-7)
    const st = this.settings;
    const hot = d.egtF.some((v) => v != null && v > 500);
    if (st.recrd && hot) this.vol.recording = true;
    const want = st.recrd && this.vol.recording;
    if ((want || this.vol.snapPending) && this.now - this.vol.lastRecordAt >= st.recordInterval * 1000) {
      this.vol.lastRecordAt = this.now;
      if (want) st.ltm.records = Math.min(st.ltm.records + 1, st.ltm.savedAt + LTM_CAPACITY);
      if (this.vol.snapPending) {
        // LF-14 (rev2): SNAP appears when the marked record is written
        this.vol.snapPending = false;
        this.vol.snapUntil = this.now + T.SNAP;
        st.ltm.marks++;
      }
    }
    // TIT over-limit timer for the LeanFind exception (ALM-9)
    const titLimF = st.engUnit === 'C' ? toF(st.limits.tit) : st.limits.tit;
    const titMaxF = Math.max(...d.titF.filter((v) => v != null), -Infinity);
    if (titMaxF > titLimF) {
      if (this.vol.titOverSince == null) this.vol.titOverSince = this.now;
    } else this.vol.titOverSince = null;
  }

  // ------------------------------------------------------------------ dispatch

  _dispatch(raw) {
    const e = typeof raw === 'string' ? { type: raw } : raw;
    if (this.state === 'OFF') return;
    this.events.push({ t: this.now, ...e });
    if (this.events.length > 200) this.events.shift();

    // Alarm acknowledgement routing (ALM-4/5/6)
    if (NORMAL_STATES.has(this.state) && this.vol.stepPressAlarm && e.type.startsWith('STEP_')) {
      const id = this.vol.stepPressAlarm;
      if (e.type === 'STEP_TAP') this.vol.alarmSupp[id] = this.now + T.ALARM_SNOOZE;
      if (e.type === 'STEP_HOLD_5S') {
        this.vol.alarmSupp[id] = Infinity;
        this.vol.offUntil = this.now + T.OFF_MSG;
      }
      return;
    }

    switch (this.state) {
      case 'TANK_SETUP':
        return this._onTankSetup(e);
      case 'FUEL_FILL':
        return this._onFuelFill(e);
      case 'AUTO':
        return this._onAuto(e);
      case 'MANUAL':
        return this._onManual(e);
      case 'LEANFIND':
        return this._onLeanFind(e);
      case 'PROGRAM':
        return this._onProgram(e);
      case 'USB':
        return this._onUsb(e);
      default:
        return undefined; // SELFTEST / STARTUP_INFO ignore buttons
    }
  }

  // ------------------------------------------------------------------ scan list

  _present(id, d) {
    const c = this.config;
    const gps = d.gps.status;
    switch (id) {
      case 'BAT': return true;
      case 'OAT': return d.oat != null;
      case 'IAT': return d.iat != null;
      case 'CDT': return d.cdt != null;
      case 'CRB': return d.crb != null;
      case 'DIF': return d.egt.filter((v) => v != null).length >= 2;
      case 'RPMMAP': return c.model === 800;
      case 'REM': case 'HM': case 'GPH': case 'USD': return c.ff;
      case 'GPSMSG': return ['nocom', 'nosig', 'nowpt'].includes(gps);
      case 'REQ': case 'RES': return gps === 'ok';
      case 'MPG': return gps === 'ok' || gps === 'nowpt';
      case 'TIT1': return d.tit[0] != null;
      case 'TIT2': return d.tit[1] != null;
      case 'OIL': return d.oil != null;
      case 'CLD': return d.cht.some((v) => v != null);
      case 'CHTHI': return false; // only in the 711 automatic list
      default: {
        const m = /^EGT(\d)$/.exec(id);
        if (m) {
          const i = Number(m[1]) - 1;
          return i < c.cylinders && (d.egt[i] != null || d.cht[i] != null);
        }
        return false;
      }
    }
  }

  _switchAllows(id) {
    if (!this.config.ff) return true; // SCAN-1
    return SWITCH_TAGS[id].includes(this.switchPos); // SCAN-2
  }

  _manualItems(d) {
    return SCAN_ORDER.filter((id) => this._present(id, d) && this._switchAllows(id));
  }

  _autoItems(d) {
    if (this.config.primary711) {
      // P711-1
      const out = [];
      if (d.cht.some((v) => v != null)) out.push('CHTHI');
      if (d.tit[0] != null) out.push('TIT1');
      if (d.oil != null) out.push('OIL');
      return out;
    }
    return this._manualItems(d).filter((id) => !this.vol.excluded.has(id));
  }

  _nextIn(list, cur, dir) {
    if (!list.length) return cur;
    const order = SCAN_ORDER;
    let idx = order.indexOf(cur);
    if (idx < 0) idx = 0;
    for (let k = 1; k <= order.length; k++) {
      const id = order[(idx + dir * k + order.length * 2) % order.length];
      if (list.includes(id)) return id;
    }
    return cur;
  }

  _fixScanItem(d) {
    // SCAN-4 / AUTO-7
    const list = this.state === 'AUTO' ? this._autoItems(d) : this._manualItems(d);
    if (!list.length || list.includes(this.vol.item)) return;
    this._setItem(this._nextIn(list, this.vol.item, 1));
    if (this.state === 'AUTO') this.vol.autoNextAt = this.now + this._dwell(this.vol.item);
  }

  _setItem(id) {
    if (id !== this.vol.item && this.config.primary711 && this.state === 'MANUAL' && /^EGT\d$/.test(id)) {
      this.vol.egtChtUntil = this.now + T.EGTCHT_711; // P711-4
    }
    this.vol.item = id;
  }

  _dwell(id) {
    return id === 'RPMMAP' ? T.RPMMAP_DWELL : this.settings.rate * 1000;
  }

  _autoEnabled() {
    return this.settings.rate > 0; // AUTO-2
  }

  _enterNormal(mode, item) {
    const d = this._derive();
    this.state = mode;
    this.ctx = {};
    this.vol.mode = mode;
    if (item) this.vol.item = item;
    else this.vol.item = this._manualItems(d)[0] ?? 'BAT'; // PWR-8
    if (mode === 'AUTO') {
      this.vol.autoNextAt = this.now + this._dwell(this.vol.item); // AUTO-7
      this._fixScanItem(d);
    } else {
      this._fixScanItem(d);
    }
  }

  _toggleView() {
    // AUTO-5 / MAN-4 / ANA-4
    if (this.vol.view === 'P') {
      const s = this.sensors;
      this.vol.normRef = {};
      for (let i = 0; i < this.config.cylinders; i++) this.vol.normRef[i] = s.egt[i];
      this.vol.normRef.T = s.tit[0];
      this.vol.view = 'N';
    } else {
      this.vol.view = 'P';
    }
  }

  // ------------------------------------------------------------------ AUTO / MANUAL

  _onAuto(e) {
    switch (e.type) {
      case 'STEP_TAP': // AUTO-3
        this.state = 'MANUAL';
        this.vol.mode = 'MANUAL';
        if (this.vol.item === 'CHTHI') {
          // P711-1 (rev3): CHTHI is not a MANUAL item; show the hottest-CHT cylinder's EGT/CHT
          const cyl = this._derive().chtMaxCyl;
          if (cyl != null) this._setItem(`EGT${cyl + 1}`);
        }
        return;
      case 'LF_TAP': // AUTO-4
        return this._enterLeanFind();
      case 'LF_HOLD_3S': // AUTO-5
        return this._toggleView();
      case 'BOTH_HOLD_5S': // AUTO-6
        return this._enterProgram();
      default:
    }
  }

  _onManual(e) {
    const d = this._derive();
    switch (e.type) {
      case 'STEP_TAP': // MAN-1
        return this._setItem(this._nextIn(this._manualItems(d), this.vol.item, 1));
      case 'STEP_HOLD_START':
      case 'STEP_HOLD_REPEAT': // MAN-2
        return this._setItem(this._nextIn(this._manualItems(d), this.vol.item, -1));
      case 'BOTH_TAP': // MAN-3, P711-2
        if (this.config.primary711) return;
        if (this.vol.excluded.has(this.vol.item)) this.vol.excluded.delete(this.vol.item);
        else this.vol.excluded.add(this.vol.item);
        return;
      case 'LF_TAP':
        return this._enterLeanFind();
      case 'LF_HOLD_3S':
        return this._toggleView();
      case 'BOTH_HOLD_5S': // MAN-5
        if (this.vol.item === 'USD') {
          this.settings.usd = 0;
          return;
        }
        return this._enterProgram();
      default:
    }
  }

  // ------------------------------------------------------------------ LeanFind (§10)

  _lfChannels() {
    // Cylinder channels '0'..'n-1' plus 'T' (TIT1) when installed and working.
    const s = this.sensors;
    const out = {};
    for (let i = 0; i < this.config.cylinders; i++) if (this._ok(`EGT${i + 1}`)) out[String(i)] = s.egt[i];
    if (this.config.tit >= 1 && this._ok('TIT1')) out.T = this._derive().titF[0];
    return out;
  }

  _enterLeanFind() {
    const returnItem = this.vol.item;
    if (this.vol.lopResults) {
      // LF-1
      this.state = 'LEANFIND';
      this.ctx = { lf: { phase: 'LOP_REVIEW', method: 'L', returnItem, lock: null, order: [...this.vol.lopResults.order] } };
      return;
    }
    this._armLeanFind(returnItem);
  }

  _armLeanFind(returnItem) {
    this.vol.lopResults = null;
    const ch = this._lfChannels();
    this.state = 'LEANFIND';
    this.ctx = {
      lf: {
        phase: 'ARMED',
        method: 'R',
        bannerUntil: this.now + T.LEAN_BANNER,
        mins: { ...ch },
        maxs: {},
        peaks: {},
        flowAtMax: {},
        order: [],
        lock: null,
        leanestUntil: 0,
        returnItem,
      },
    };
  }

  _snap() {
    // LF-14: request a mark; recording begins if it had not ("or snap is requested", p.30)
    this.vol.snapPending = true;
    if (this.settings.recrd) this.vol.recording = true;
  }

  _onLeanFind(e) {
    const lf = this.ctx.lf;
    switch (e.type) {
      case 'STEP_TAP': // LF-13
        return this._enterNormal('AUTO', lf.returnItem);
      case 'BOTH_TAP':
        return this._snap();
      case 'LF_TAP':
        if (['ARMED', 'ACTIVE', 'LEANEST', 'ROP_SET'].includes(lf.phase)) return this._snap(); // LF-15 (rev2)
        if (lf.phase === 'LOP_DONE') {
          lf.phase = 'LOP_REVIEW'; // LF-12
          return;
        }
        if (lf.phase === 'LOP_REVIEW') return this._armLeanFind(lf.returnItem);
        return;
      case 'BOTH_HOLD_5S':
        if (lf.phase === 'ARMED') {
          lf.method = lf.method === 'R' ? 'L' : 'R'; // LF-3
          lf.bannerUntil = this.now + T.LEAN_BANNER;
        }
        return;
      default:
    }
  }

  _updateLeanFind() {
    const lf = this.ctx.lf;
    const ch = this._lfChannels();
    if (lf.phase === 'ARMED') {
      for (const [k, v] of Object.entries(ch)) {
        if (lf.mins[k] == null || v < lf.mins[k]) lf.mins[k] = v;
      }
      const rose = Object.entries(ch).some(([k, v]) => v - lf.mins[k] >= LF_RISE_F); // LF-4
      if (rose) {
        lf.phase = 'ACTIVE';
        lf.maxs = { ...ch };
        const flow = this._derive().flow;
        lf.flowAtMax = Object.fromEntries(Object.keys(ch).map((k) => [k, flow]));
      }
      return;
    }
    if (lf.phase === 'ACTIVE') {
      const flow = this._derive().flow;
      for (const [k, v] of Object.entries(ch)) {
        if (lf.maxs[k] == null || v > lf.maxs[k]) {
          lf.maxs[k] = v;
          lf.flowAtMax[k] = flow; // LF-8 / LF-11 (rev3): flow at the instant of maximum EGT
        }
        if (!lf.peaks[k] && v <= lf.maxs[k] - LF_PEAK_DROP_F) {
          // LF-6
          if (lf.method === 'L' && k === 'T') continue; // LOP considers cylinders only
          lf.peaks[k] = { peak: lf.maxs[k], t: this.now, flow: lf.flowAtMax[k] ?? flow };
          lf.order.push(k);
          if (lf.method === 'R') {
            lf.lock = k; // LF-7
            lf.phase = 'LEANEST';
            lf.leanestUntil = this.now + T.LEANEST;
            return;
          }
        }
      }
      if (lf.method === 'L') {
        const cyls = Object.keys(ch).filter((k) => k !== 'T');
        if (cyls.length && cyls.every((k) => lf.peaks[k])) {
          // LF-10
          lf.phase = 'LOP_DONE';
          const first = lf.order.find((k) => k !== 'T');
          const last = [...lf.order].reverse().find((k) => k !== 'T');
          lf.lock = last;
          this.vol.lopResults = {
            peaks: Object.fromEntries(Object.entries(lf.peaks).filter(([k]) => k !== 'T')),
            order: lf.order.filter((k) => k !== 'T'),
            first,
            last,
            spread: lf.peaks[first].flow - lf.peaks[last].flow,
          };
        }
      }
      return;
    }
    if (lf.phase === 'LEANEST' && this.now >= lf.leanestUntil) lf.phase = 'ROP_SET';
  }

  // ------------------------------------------------------------------ fuel fill (§11) and tank setup

  _fillOptions() {
    const o = ['N', 'MAIN'];
    if (this.settings.auxEnabled) o.push('FULL');
    o.push('PLUS');
    return o;
  }

  _enterFuelFill(context) {
    this.state = 'FUEL_FILL';
    this.ctx = {
      fuel: {
        context,
        sub: context === 'powerup' ? 'BANNER' : 'SEL',
        until: this.now + T.FUEL_BANNER,
        sel: 'N',
        amount: 0,
        blink: context === 'powerup',
      },
    };
  }

  _capacity() {
    const st = this.settings;
    return st.main + (st.auxEnabled ? st.aux : 0);
  }

  _onFuelFill(e) {
    const f = this.ctx.fuel;
    const st = this.settings;
    if (f.sub === 'BANNER') return;
    if (['STEP_TAP', 'LF_TAP', 'LF_HOLD_START', 'BOTH_TAP'].includes(e.type)) f.blink = false;
    if (f.sub === 'SEL') {
      if (e.type === 'LF_TAP') {
        const o = this._fillOptions();
        f.sel = o[(o.indexOf(f.sel) + 1) % o.length]; // FUEL-2
      } else if (e.type === 'STEP_TAP') {
        // FUEL-3
        if (f.sel === 'N') return this._exitFuelFill();
        if (f.sel === 'MAIN' || f.sel === 'FULL') {
          st.rem = f.sel === 'MAIN' ? st.main : this._capacity();
          if (!st.accum) st.usd = 0; // FUEL-5
          return this._exitFuelFill();
        }
        f.sub = 'ADD';
        f.amount = 0;
      }
      return;
    }
    if (f.sub === 'ADD') {
      // FUEL-4
      const lo = -st.rem;
      const hi = Math.max(0, this._capacity() - st.rem);
      if (e.type === 'LF_TAP') f.amount = Math.max(lo, f.amount - 1);
      else if (e.type === 'LF_HOLD_START' || e.type === 'LF_HOLD_REPEAT') f.amount = Math.min(hi, f.amount + 1);
      else if (e.type === 'STEP_TAP') {
        st.rem = Math.max(0, st.rem + f.amount);
        if (f.amount > 0 && !st.accum) st.usd = 0;
        return this._exitFuelFill();
      }
    }
  }

  _exitFuelFill() {
    // FUEL-6 (rev2): both contexts advance to MANUAL
    if (this.ctx.fuel.context === 'powerup') return this._endPowerUp();
    const prior = this.ctx.fuel.prior.pgm.prior;
    this._enterNormal('MANUAL', prior.item);
  }

  _tankItems() {
    return this.settings.auxEnabled ? ['MAIN', 'AUXQ', 'AUX'] : ['MAIN', 'AUXQ'];
  }

  _onTankSetup(e) {
    const t = this.ctx.tank;
    const st = this.settings;
    if (e.type === 'STEP_TAP') {
      const items = this._tankItems();
      const i = items.indexOf(t.item);
      if (i + 1 < items.length) t.item = items[i + 1];
      else this._startSelfTest(); // PWR-2
      return;
    }
    if (t.item === 'AUXQ' && e.type === 'LF_TAP') st.auxEnabled = !st.auxEnabled;
    if (t.item === 'MAIN') this._numInput(e, () => st.main, (v) => (st.main = v), { min: 0, max: 999, step: 1 });
    if (t.item === 'AUX') this._numInput(e, () => st.aux, (v) => (st.aux = v), { min: 0, max: 250, step: 1 });
  }

  // Generic numeric LF handling: tap = decrease, hold = increase (repeat, ×10 after 3 s on wide ranges).
  _numInput(e, get, set, { min, max, step, wrap = false, locked = false }) {
    if (locked) return false;
    let dir = 0;
    if (e.type === 'LF_TAP') dir = -1;
    else if (e.type === 'LF_HOLD_START' || e.type === 'LF_HOLD_REPEAT') dir = 1;
    if (!dir) return false;
    const wide = (max - min) / step > 100;
    const mult = dir > 0 && wide && (e.heldMs || 0) >= T.ACCEL_AFTER ? 10 : 1;
    const decimals = (String(step).split('.')[1] || '').length;
    let v = get() + dir * step * mult;
    v = Number(v.toFixed(decimals));
    if (wrap) {
      if (v > max) v = min;
      if (v < min) v = max;
    } else v = clamp(v, min, max);
    set(v);
    return true;
  }

  // ------------------------------------------------------------------ PROGRAM (§12)

  _enterProgram() {
    // PGM-1
    this.state = 'PROGRAM';
    this.ctx = {
      pgm: {
        sub: 'BANNER',
        until: this.now + T.PROGRAM_BANNER,
        item: null,
        prior: { mode: this.vol.mode, item: this.vol.item },
        fuelQ: 'N',
        dumpSel: 'N',
        endSel: 'Y',
      },
    };
  }

  _pgmMainItems() {
    const c = this.config;
    return [
      { id: 'FUEL', sw: 'TFA', present: c.ff },
      { id: 'RATE', sw: 'TA', present: true },
      { id: 'OATU', sw: 'TA', present: c.oat },
      { id: 'EGT1', sw: 'TA', present: true },
      { id: 'HPQ', sw: 'TA', present: c.model === 800 },
      { id: 'KF', sw: 'FA', present: c.ff },
      { id: 'ACCUM', sw: 'FA', present: c.ff },
      { id: 'GPSC', sw: 'FA', present: c.ff },
      { id: 'DUMP', sw: 'TFA', present: true },
      { id: 'END', sw: 'TFA', present: true },
    ];
  }

  _pgmVisible(it) {
    return it.present && (!this.config.ff || it.sw.includes(this.switchPos));
  }

  _pgmNextVisible(fromId) {
    const items = this._pgmMainItems();
    const i = items.findIndex((it) => it.id === fromId);
    for (let k = i + 1; k < items.length; k++) if (this._pgmVisible(items[k])) return items[k].id;
    return 'END';
  }

  _pgmFirstVisible() {
    return this._pgmMainItems().find((it) => this._pgmVisible(it)).id;
  }

  _pgmGoto(id) {
    const p = this.ctx.pgm;
    p.sub = 'ITEM';
    p.item = id;
    p.titleUntil = id === 'KF' ? this.now + T.ITEM_TITLE : 0; // KF-SET (rev2)
    if (id === 'FUEL') p.fuelQ = 'N'; // PGM-3 / I-26
    if (id === 'DUMP') p.dumpSel = 'N';
    if (id === 'END') p.endSel = 'Y';
  }

  _pgmExit() {
    // PGM-4
    const prior = this.ctx.pgm.prior;
    this._enterNormal(prior.mode, prior.item);
  }

  _pgmItemId() {
    const p = this.ctx.pgm;
    if (p.sub === 'ITEM') return p.item;
    if (p.sub === 'LTM') return p.ltmItem;
    if (p.sub === 'FACLIM') return p.limItem;
    return null;
  }

  _updateProgram() {
    const p = this.ctx.pgm;
    if (p.sub === 'BANNER' && this.now >= p.until) this._pgmGoto(this._pgmFirstVisible());
    else if (p.sub === 'ADJUST' && this.now >= p.until) p.sub = p.adjustNext;
    else if (p.sub === 'FACLIM_BANNER' && this.now >= p.until) {
      p.sub = 'FACLIM';
      p.limItem = 'FAC';
      p.facSel = 'N';
      p.limEnd = 'Y';
    } else if (p.sub === 'DUMP_XFER') {
      p.progress = clamp(((this.now - p.xferStart) / p.xferDur) * 100, 0, 100);
      if (p.progress >= 100) {
        p.sub = 'SAVE_D';
        p.saveD = 'N';
      }
    }
  }

  _onProgram(e) {
    const p = this.ctx.pgm;
    const st = this.settings;
    const c = this.config;
    switch (p.sub) {
      case 'BANNER':
      case 'ADJUST':
      case 'FACLIM_BANNER':
        return;
      case 'ITEM':
        return this._onPgmItem(e);
      case 'OAT_CAL': // PGM-5
        if (e.type === 'STEP_TAP') return this._pgmGoto(this._pgmNextVisible('OATU'));
        this._numInput(e, () => st.oatCal, (v) => (st.oatCal = v), { min: -10, max: 10, step: 1 });
        return;
      case 'HPC': // PGM-6
        if (e.type === 'STEP_TAP') return this._pgmGoto(this._pgmNextVisible('HPQ'));
        if (e.type === 'BOTH_HOLD_5S') {
          p.sub = 'ADJUST';
          p.until = this.now + T.ADJUST;
          p.adjustNext = 'MAP_CAL';
          return;
        }
        this._numInput(e, () => st.hpc, (v) => (st.hpc = v), { min: 50, max: 200, step: 1 });
        return;
      case 'MAP_CAL': // PGM-7
        if (e.type === 'STEP_TAP') return this._pgmGoto(this._pgmNextVisible('HPQ'));
        this._numInput(e, () => st.mapCal, (v) => (st.mapCal = v), { min: -3, max: 3, step: 0.1 });
        return;
      case 'KF_EDIT':
      case 'EC_EDIT':
        return this._onDigitEdit(e);
      case 'ORIG_TIT': // PGM-9
        if (e.type === 'LF_TAP') st.origTit = !st.origTit;
        else if (e.type === 'STEP_TAP') {
          if (st.origTit) {
            p.sub = 'CAL_TIT';
            p.titleUntil = this.now + T.ITEM_TITLE;
          } else this._pgmGoto(this._pgmNextVisible('RATE'));
        }
        return;
      case 'CAL_TIT':
        if (e.type === 'STEP_TAP') return this._pgmGoto(this._pgmNextVisible('RATE'));
        this._numInput(e, () => st.titCal, (v) => (st.titCal = v), { min: -975, max: 975, step: 1 });
        return;
      case 'DUMP_XFER': // PGM-10
        if (e.type === 'BOTH_HOLD_5S') this._pgmGoto('DUMP');
        return;
      case 'SAVE_D':
        if (e.type === 'LF_TAP') p.saveD = p.saveD === 'N' ? 'Y' : 'N';
        else if (e.type === 'STEP_TAP') {
          if (p.saveD === 'Y') st.ltm.savedAt = st.ltm.records;
          this._pgmExit();
        }
        return;
      case 'LTM':
      case 'LTM_ID_EDIT':
        return this._onLtm(e);
      case 'FACLIM':
        return this._onFacLim(e);
      default:
        void c;
    }
  }

  _onPgmItem(e) {
    const p = this.ctx.pgm;
    const st = this.settings;
    const c = this.config;
    const next = () => this._pgmGoto(this._pgmNextVisible(p.item));
    switch (p.item) {
      case 'FUEL':
        if (e.type === 'LF_TAP') p.fuelQ = p.fuelQ === 'N' ? 'Y' : 'N';
        else if (e.type === 'STEP_TAP') {
          if (p.fuelQ === 'Y') {
            const prior = this.ctx;
            this._enterFuelFill('program');
            this.ctx.fuel.prior = prior;
          } else next();
        }
        return;
      case 'RATE':
        if (e.type === 'STEP_TAP') return next();
        if (e.type === 'BOTH_HOLD_5S' && c.tit >= 1) {
          p.sub = 'ORIG_TIT'; // PGM-9
          p.titleUntil = this.now + T.ITEM_TITLE;
          return;
        }
        this._numInput(e, () => st.rate, (v) => (st.rate = v), { min: c.primary711 ? 1 : 0, max: 9, step: 1, wrap: true });
        return;
      case 'OATU':
        if (e.type === 'LF_TAP') st.oatUnit = st.oatUnit === 'F' ? 'C' : 'F';
        else if (e.type === 'BOTH_HOLD_5S') p.sub = 'OAT_CAL';
        else if (e.type === 'STEP_TAP') next();
        return;
      case 'EGT1':
        if (e.type === 'LF_TAP') st.egt1 = !st.egt1;
        else if (e.type === 'STEP_TAP') next();
        return;
      case 'HPQ':
        if (e.type === 'LF_TAP') st.hpDisplay = !st.hpDisplay;
        else if (e.type === 'STEP_TAP') next();
        else if (e.type === 'BOTH_HOLD_5S') {
          // PGM-2 (rev2): reachable with Y or N
          p.sub = 'ADJUST';
          p.until = this.now + T.ADJUST;
          p.adjustNext = 'HPC';
        }
        return;
      case 'KF':
        if (e.type === 'STEP_TAP') next();
        else if (e.type === 'BOTH_HOLD_5S') {
          p.sub = 'KF_EDIT'; // PGM-8
          p.edit = { target: 'KF', digits: this._toDigits(st.kf), idx: 0 };
        }
        return;
      case 'ACCUM':
        if (e.type === 'LF_TAP') st.accum = !st.accum;
        else if (e.type === 'STEP_TAP') next();
        return;
      case 'GPSC':
        if (e.type === 'STEP_TAP') return next();
        this._numInput(e, () => st.gpsc, (v) => (st.gpsc = v), { min: 0, max: 8, step: 1, wrap: true });
        return;
      case 'DUMP':
        if (e.type === 'LF_TAP') {
          const o = ['N', 'NEW', 'ALL'];
          p.dumpSel = o[(o.indexOf(p.dumpSel) + 1) % 3];
        } else if (e.type === 'STEP_TAP') {
          if (p.dumpSel === 'N') return next();
          p.sub = 'DUMP_XFER';
          p.xferStart = this.now;
          p.xferDur = p.dumpSel === 'ALL' ? T.DUMP_ALL : T.DUMP_NEW;
          p.progress = 0;
        } else if (e.type === 'BOTH_HOLD_5S') {
          this._enterLtm(); // PGM-11
        }
        return;
      case 'END':
        if (e.type === 'LF_TAP') p.endSel = p.endSel === 'Y' ? 'N' : 'Y';
        else if (e.type === 'STEP_TAP') {
          if (p.endSel === 'Y') this._pgmExit();
          else this._pgmGoto(this._pgmFirstVisible());
        } else if (e.type === 'BOTH_HOLD_5S') {
          p.sub = 'FACLIM_BANNER'; // PGM-12
          p.until = this.now + T.FACLIM_BANNER;
        }
        return;
      default:
    }
  }

  _toDigits(v) {
    const s = (Math.round(v * 100) / 100).toFixed(2).padStart(5, '0');
    return [Number(s[0]), Number(s[1]), Number(s[3]), Number(s[4])];
  }

  _onDigitEdit(e) {
    const p = this.ctx.pgm;
    const ed = p.edit;
    if (e.type === 'LF_TAP') ed.digits[ed.idx] = (ed.digits[ed.idx] + 9) % 10;
    else if (e.type === 'LF_HOLD_START' || e.type === 'LF_HOLD_REPEAT') ed.digits[ed.idx] = (ed.digits[ed.idx] + 1) % 10;
    else if (e.type === 'STEP_TAP') ed.idx = (ed.idx + 1) % 4;
    else if (e.type === 'BOTH_HOLD_5S') {
      const v = ed.digits[0] * 10 + ed.digits[1] + ed.digits[2] / 10 + ed.digits[3] / 100;
      if (ed.target === 'KF') {
        this.settings.kf = Number(v.toFixed(2));
        p.sub = 'ITEM';
        p.item = 'KF';
        p.titleUntil = 0;
      } else {
        this.settings.ec = Number(clamp(v, 12, 16).toFixed(2));
        p.sub = 'FACLIM';
        p.limItem = 'EC';
      }
    }
  }

  // Long-term memory settings (PGM-11)
  _enterLtm() {
    const p = this.ctx.pgm;
    const dt = new Date(this.settings.clockMs);
    p.sub = 'LTM';
    p.ltmItem = 'TIME';
    p.ltm = {
      TIME: this.settings.recordInterval,
      MNTH: dt.getUTCMonth() + 1,
      DAY: dt.getUTCDate(),
      YEAR: dt.getUTCFullYear(),
      HOUR: dt.getUTCHours(),
      MIN: dt.getUTCMinutes(),
    };
  }

  _onLtm(e) {
    const p = this.ctx.pgm;
    const st = this.settings;
    const order = ['TIME', 'MNTH', 'DAY', 'YEAR', 'HOUR', 'MIN', 'ID', 'END'];
    if (p.sub === 'LTM_ID_EDIT') {
      const ed = p.idEdit;
      const step = (k) => {
        const i = ID_CHARSET.indexOf(ed.chars[ed.idx]);
        ed.chars[ed.idx] = ID_CHARSET[(i + k + ID_CHARSET.length) % ID_CHARSET.length];
      };
      if (e.type === 'LF_TAP' || e.type === 'LF_HOLD_START' || e.type === 'LF_HOLD_REPEAT') step(1);
      else if (e.type === 'STEP_TAP') ed.idx = (ed.idx + 1) % ed.chars.length;
      else if (e.type === 'BOTH_HOLD_5S') {
        st.aircraftId = ed.chars.join('');
        p.sub = 'LTM';
      }
      return;
    }
    const it = p.ltmItem;
    if (e.type === 'STEP_TAP') {
      if (it === 'TIME' && p.ltm.TIME !== st.recordInterval) {
        st.recordInterval = p.ltm.TIME;
        if (this.vol.recording) st.ltm.flightFiles++;
      }
      if (it === 'MIN') {
        const l = p.ltm;
        st.clockMs = Date.UTC(l.YEAR, l.MNTH - 1, l.DAY, l.HOUR, l.MIN, 0);
      }
      if (it === 'END') {
        this._pgmGoto('END');
        return;
      }
      p.ltmItem = order[order.indexOf(it) + 1];
      return;
    }
    if (it === 'ID') {
      if (e.type === 'BOTH_HOLD_5S') {
        p.sub = 'LTM_ID_EDIT';
        p.idEdit = { chars: st.aircraftId.padEnd(6, ' ').slice(0, 6).split(''), idx: 0 };
      }
      return;
    }
    const ranges = {
      TIME: { min: 2, max: 500, step: 1 },
      MNTH: { min: 1, max: 12, step: 1, wrap: true },
      DAY: { min: 1, max: 31, step: 1, wrap: true },
      YEAR: { min: 1980, max: 2079, step: 1, wrap: true },
      HOUR: { min: 0, max: 23, step: 1, wrap: true },
      MIN: { min: 0, max: 59, step: 1, wrap: true },
    };
    if (ranges[it]) this._numInput(e, () => p.ltm[it], (v) => (p.ltm[it] = v), ranges[it]);
  }

  // Alarm-limit list (§12.1)
  _limItems() {
    const c = this.config;
    const st = this.settings;
    const items = ['FAC', 'ENG', 'HBAT', 'LBAT', 'DIF', 'HCHT', 'CLD', 'TIT', 'HOIL', 'LOIL']; // rev2 R14
    if (c.model === 800) items.push('MAP');
    if (c.ff) {
      items.push('FUNIT', 'MAIN', 'AUXQ');
      if (st.auxEnabled) items.push('AUX');
      items.push('MIN', 'REMLIM');
    }
    items.push('CARB', 'RECRD');
    if (c.model === 800) items.push('CYL', 'RHP', 'EC');
    items.push('END');
    return items;
  }

  _restoreFactoryLimits() {
    this.settings.limits = factoryLimits(this.settings.engUnit, this.config.busVolts, this.config.primary711); // LIM-3
  }

  _onFacLim(e) {
    const p = this.ctx.pgm;
    const st = this.settings;
    const L = st.limits;
    const c = this.config;
    const it = p.limItem;
    if (e.type === 'STEP_TAP') {
      if (it === 'FAC' && p.facSel === 'Y') {
        this._restoreFactoryLimits();
        p.facSel = 'N';
      }
      if (it === 'END') {
        if (p.limEnd === 'Y') return this._pgmExit();
        p.limItem = 'FAC';
        p.facSel = 'N';
        return;
      }
      const items = this._limItems();
      p.limItem = items[items.indexOf(it) + 1];
      if (p.limItem === 'END') p.limEnd = 'Y';
      return;
    }
    const R = TEMP_RANGES[st.engUnit];
    const locked711 = c.primary711; // P711-6
    switch (it) {
      case 'FAC':
        if (e.type === 'LF_TAP') p.facSel = p.facSel === 'N' ? 'Y' : 'N';
        return;
      case 'ENG':
        if (e.type === 'LF_TAP') {
          st.engUnit = st.engUnit === 'F' ? 'C' : 'F';
          const keep = { hbat: L.hbat, lbat: L.lbat, map: L.map, minLim: L.minLim, remLim: L.remLim };
          st.limits = { ...factoryLimits(st.engUnit, c.busVolts, c.primary711), ...keep }; // LIM-7
          // newer instruments reset temperature limits to factory values in the new unit
        }
        return;
      case 'HBAT':
        return void this._numInput(e, () => L.hbat, (v) => (L.hbat = v), { min: 10, max: 35, step: 0.5 });
      case 'LBAT':
        return void this._numInput(e, () => L.lbat, (v) => (L.lbat = v), { min: 8.5, max: 30, step: 0.5 });
      case 'DIF':
        return void this._numInput(e, () => L.dif, (v) => (L.dif = v), R.dif);
      case 'HCHT':
        return void this._numInput(e, () => L.hcht, (v) => (L.hcht = v), { ...R.hcht, locked: locked711 });
      case 'CLD':
        return void this._numInput(e, () => L.cld, (v) => (L.cld = v), R.cld);
      case 'TIT':
        return void this._numInput(e, () => L.tit, (v) => (L.tit = v), { ...R.tit, locked: locked711 });
      case 'HOIL':
        return void this._numInput(e, () => L.hoil, (v) => (L.hoil = v), { ...R.hoil, locked: locked711 });
      case 'LOIL':
        return void this._numInput(e, () => L.loil, (v) => (L.loil = v), R.loil);
      case 'MAP':
        return void this._numInput(e, () => L.map, (v) => (L.map = v), { min: 25, max: 90, step: 0.5 });
      case 'FUNIT':
        if (e.type === 'LF_TAP') st.fuelUnit = FUEL_UNITS[(FUEL_UNITS.indexOf(st.fuelUnit) + 1) % 4];
        return;
      case 'MAIN':
        return void this._numInput(e, () => st.main, (v) => (st.main = v), { min: 0, max: 999, step: 1 });
      case 'AUXQ':
        if (e.type === 'LF_TAP') st.auxEnabled = !st.auxEnabled;
        return;
      case 'AUX':
        return void this._numInput(e, () => st.aux, (v) => (st.aux = v), { min: 0, max: 250, step: 1 });
      case 'MIN':
        return void this._numInput(e, () => L.minLim, (v) => (L.minLim = v), { min: 0, max: 60, step: 1 });
      case 'REMLIM':
        return void this._numInput(e, () => L.remLim, (v) => (L.remLim = v), { min: 0, max: 200, step: 1 });
      case 'CARB':
        if (e.type === 'LF_TAP') st.carb = !st.carb;
        return;
      case 'RECRD':
        if (e.type === 'LF_TAP') st.recrd = !st.recrd;
        return;
      case 'CYL':
        return void this._numInput(e, () => st.cyl, (v) => (st.cyl = v), { min: 4, max: 12, step: 1 });
      case 'RHP':
        return void this._numInput(e, () => st.ratedHp, (v) => (st.ratedHp = v), { min: 60, max: 500, step: 1 });
      case 'EC':
        if (e.type === 'BOTH_HOLD_5S') {
          p.sub = 'EC_EDIT';
          p.edit = { target: 'EC', digits: this._toDigits(st.ec), idx: 0 };
        }
        return;
      case 'END':
        if (e.type === 'LF_TAP') p.limEnd = p.limEnd === 'Y' ? 'N' : 'Y';
        return;
      default:
    }
  }

  // ------------------------------------------------------------------ USB / memory box (§14)

  _usbStart(source) {
    if (this.state !== 'AUTO' && this.state !== 'MANUAL') return;
    this.state = 'USB';
    this.ctx = { usb: { source, sub: 'MENU', sel: 'NEW', progress: 0, prior: { mode: this.vol.mode, item: this.vol.item } } };
  }

  _usbEnd() {
    const prior = this.ctx.usb.prior;
    this._enterNormal(prior.mode, prior.item);
  }

  _onUsb(e) {
    const u = this.ctx.usb;
    if (u.sub !== 'MENU') return;
    if (e.type === 'LF_TAP') u.sel = u.sel === 'NEW' ? 'ALL' : 'NEW';
    else if (e.type === 'STEP_TAP') {
      u.sub = 'XFER';
      u.start = this.now + (u.source === 'box' ? T.DOWNLOAD_BANNER : 0); // DL-2: DOWNLOAD banner first
      u.dur = u.sel === 'ALL' ? T.DUMP_ALL : T.DUMP_NEW;
    }
  }

  _updateUsb() {
    const u = this.ctx.usb;
    if (u.sub !== 'XFER') return;
    u.progress = clamp(((this.now - u.start) / u.dur) * 100, 0, 100);
    if (u.progress >= 100) {
      u.sub = 'DONE';
      this.settings.ltm.savedAt = this.settings.ltm.records; // DL-3
    }
  }

  // ------------------------------------------------------------------ alarms (§9)

  _alarmConditions(d) {
    const L = this.settings.limits;
    const c = this.config;
    const out = {};
    if (d.chtMax != null && d.chtMax > L.hcht) out.CHT = { text: `${int(d.chtMax)} CHT`, dot: d.chtMaxCyl };
    if (d.oil != null && d.oil > L.hoil) out.OILH = { text: `${int(d.oil)} OIL`, item: 'OIL' };
    const tits = d.tit.filter((v) => v != null);
    if (tits.length && Math.max(...tits) > L.tit) out.TIT = { text: `${int(Math.max(...tits))} TIT`, item: 'TIT1' };
    if (d.oil != null && d.oil < L.loil) out.OILL = { text: `${int(d.oil)} OIL`, item: 'OIL' };
    if (d.cld != null && d.cld < L.cld) out.CLD = { text: `${int(d.cld)} CLD`, dot: d.cldCyl };
    if (d.dif != null && d.dif > L.dif) out.DIF = { text: `${int(d.dif)} DIF`, dot: d.difCyl };
    if (d.bat > L.hbat) out.BATH = { text: `${fmt1(d.bat)} BAT` };
    if (d.bat < L.lbat) out.BATL = { text: `${fmt1(d.bat)} BAT` };
    if (c.model === 800 && d.map > L.map) out.MAP = { text: `${fmt1(d.map)} MAP` };
    if (c.ff && d.rem < L.remLim) out.LOFUEL = { text: `${fmtFuel(d.rem)} REM` };
    if (c.ff && d.flowValid) {
      const mins = (d.rem / d.flow) * 60;
      if (mins < L.minLim) out.LOTIME = { text: `${fmtHM(d.rem / d.flow)} H.M` };
    }
    return out;
  }

  _updateAlarms(d) {
    const cond = this._alarmConditions(d);
    // ALM-9: LeanFind TIT exception
    if (this.state === 'LEANFIND' && cond.TIT) {
      const titLimF = this.settings.engUnit === 'C' ? toF(this.settings.limits.tit) : this.settings.limits.tit;
      const overF = Math.max(...d.titF.filter((v) => v != null)) - titLimF;
      const since = this.vol.titOverSince ?? this.now;
      if (overF < LF_TIT_GRACE_F && this.now - since < T.LF_TIT_GRACE_MS) delete cond.TIT;
    }
    this.vol.alarmCond = cond;
    this.vol.alarmActive = null;
    for (const id of ALARM_PRIORITY) {
      if (!cond[id]) continue;
      const supp = this.vol.alarmSupp[id];
      if (supp != null && this.now < supp) continue; // ALM-4/5/7
      this.vol.alarmActive = id;
      break;
    }
    // ALM-2/3: the digital overlay only in AUTO/MANUAL/LEANFIND; ALM-8: the light in every powered state
    this.vol.alarmDisplayed = NORMAL_STATES.has(this.state) ? this.vol.alarmActive : null;
  }

  /** The alarm the pilot can actually see: none while the OFF / SNAP confirmation covers it (ALM-6, §5 precedence).
   *  Found by the TLA+ conformance check (spec/tla): STEP used to silence an alarm hidden under OFF/SNAP. */
  _visibleAlarm() {
    if (this.now < this.vol.offUntil || this.now < this.vol.snapUntil) return null;
    return this._shownAlarm();
  }

  _shownAlarm() {
    return NORMAL_STATES.has(this.state) ? this.vol.alarmDisplayed : null;
  }

  // ------------------------------------------------------------------ display output (§17)

  _path() {
    switch (this.state) {
      case 'OFF':
      case 'AUTO':
      case 'MANUAL':
        return this.state;
      case 'TANK_SETUP':
        return `TANK_SETUP.${this.ctx.tank.item}`;
      case 'SELFTEST':
      case 'STARTUP_INFO':
        return `${this.state}.${this.ctx.seq[this.ctx.idx].sub}`;
      case 'FUEL_FILL':
        return `FUEL_FILL.${this.ctx.fuel.sub}`;
      case 'LEANFIND':
        return `LEANFIND.${this.ctx.lf.phase}`;
      case 'USB':
        return `USB.${this.ctx.usb.sub}`;
      case 'PROGRAM': {
        const p = this.ctx.pgm;
        if (p.sub === 'ITEM') return `PROGRAM.ITEM.${p.item}`;
        if (p.sub === 'LTM') return `PROGRAM.LTM.${p.ltmItem}`;
        if (p.sub === 'FACLIM') return `PROGRAM.FACLIM.${p.limItem}`;
        return `PROGRAM.${p.sub}`;
      }
      default:
        return this.state;
    }
  }

  _columnLabels() {
    // [{id,label}] for each analog column (ANA-1)
    const c = this.config;
    const cols = [];
    for (let i = 1; i <= c.cylinders; i++) cols.push({ id: String(i), label: String(i) });
    if (c.tit >= 1 || c.oil) cols.push({ id: 'T', label: c.tit >= 1 ? 'T' : '' });
    return cols;
  }

  _pctSegs(vF, redF) {
    // ANA-3
    if (vF == null || vF < 0.5 * redF) return 0;
    return clamp(Math.round((vF / redF - 0.5) / (0.5 / 12)) + 1, 1, SEGMENTS);
  }

  _normSegs(vF, refF) {
    // ANA-4
    if (vF == null) return 0;
    return clamp(NORM_REF_SEG + Math.round((vF - (refF ?? vF)) / 10), 0, SEGMENTS);
  }

  _chtSeg(chtF) {
    // ANA-5
    if (chtF == null || chtF < 237.5) return 0;
    return clamp(Math.round((chtF - 250) / 25) + 1, 1, SEGMENTS);
  }

  _limitF(key) {
    const v = this.settings.limits[key];
    return this.settings.engUnit === 'C' ? toF(v) : v;
  }

  _columns(d, digitalItem) {
    const c = this.config;
    const cols = [];
    const redF = this._limitF('tit'); // ANA-3: the TIT limit is the bar-graph full scale
    const normal = this.vol.view === 'N';
    for (let i = 0; i < c.cylinders; i++) {
      const egtF = d.egtF[i];
      cols.push({
        id: String(i + 1),
        label: String(i + 1),
        segs: normal ? this._normSegs(egtF, this.vol.normRef[i]) : this._pctSegs(egtF, redF),
        chtSeg: this._chtSeg(d.chtF[i]),
        oilSeg: 0,
        inverted: false,
        flash: NORMAL_STATES.has(this.state) && egtF != null && egtF > PREIGNITION_F, // ANA-9
        topFlash: false,
        oilFlash: false,
        missing: egtF == null, // ANA-10
        labelFlash: false,
      });
    }
    if (c.tit >= 1 || c.oil) {
      const hoilF = this._limitF('hoil');
      const col = { id: 'T', label: c.tit >= 1 ? 'T' : '', chtSeg: 0, oilSeg: 0, inverted: false, flash: false, topFlash: false, oilFlash: false, labelFlash: false };
      if (c.tit >= 1) {
        col.segs = normal ? this._normSegs(d.titF[0], this.vol.normRef.T) : this._pctSegs(d.titF[0], redF);
        col.missing = d.titF[0] == null;
        col.topFlash = digitalItem === 'TIT1'; // ANA-7
        if (c.oil) {
          col.oilSeg = this._pctSegs(d.oilF, hoilF); // ANA-6
          col.oilFlash = digitalItem === 'OIL';
        }
      } else {
        col.segs = this._pctSegs(d.oilF, hoilF);
        col.missing = d.oilF == null;
        col.topFlash = digitalItem === 'OIL';
      }
      cols.push(col);
    }
    return cols;
  }

  _itemText(id, d) {
    // §7.2 — returns { value, label, dot }
    const st = this.settings;
    const unit = st.fuelUnit;
    const fv = d.flowValid;
    switch (id) {
      case 'BAT': return { value: fmt1(d.bat), label: 'BAT' };
      case 'OAT': return { value: String(int(d.oat)), label: 'OAT' };
      case 'IAT': return { value: String(int(d.iat)), label: 'IAT' };
      case 'CDT': return { value: String(int(d.cdt)), label: 'CDT' };
      case 'CRB': return { value: String(int(d.crb)), label: 'CRB' };
      case 'DIF': return { value: String(int(d.dif)), label: 'DIF', dot: d.difCyl };
      case 'RPMMAP': return { value: String(round10(d.rpm)), label: fmt1(d.map) };
      case 'REM': return { value: fmtFuel(d.rem), label: 'REM' };
      case 'GPSMSG': return { value: '', label: { nocom: 'NO-COM', nosig: 'NO-SIG', nowpt: 'NO-WPT' }[d.gps.status] };
      case 'REQ':
      case 'RES': {
        const ok = fv && !d.gps.offCourse && d.gps.gs >= 1;
        if (!ok) return { value: '---', label: id };
        const req = (d.gps.dist / d.gps.gs) * d.flow;
        return { value: fmtFuel(id === 'REQ' ? req : d.rem - req), label: id };
      }
      case 'MPG':
        return { value: fv ? fmt1(d.gps.gs / d.flow) : '---', label: MILEAGE_LABEL[unit] };
      case 'HM':
        return { value: fv ? fmtHM(d.rem / d.flow) : '---', label: 'H.M' };
      case 'GPH':
        if (!d.flowSignal) return { value: '---', label: FLOW_LABEL[unit] };
        return { value: d.flow < MIN_FLOW ? '0.0' : fmt1(d.flow), label: FLOW_LABEL[unit] };
      case 'USD': return { value: fmtFuel(d.usd), label: 'USD' };
      case 'TIT1':
        if (this.config.ff) return { value: String(int(d.tit[0])), label: d.flowSignal ? fmt1(d.flow) : '---' };
        return { value: String(int(d.tit[0])), label: 'TIT' };
      case 'TIT2': return { value: String(int(d.tit[1])), label: 'TI2' };
      case 'OIL': return { value: String(int(d.oil)), label: 'OIL' };
      case 'CLD': return { value: String(int(d.cld ?? 0)), label: 'CLD', dot: d.cldCyl };
      case 'CHTHI': return { value: String(int(d.chtMax)), label: 'CHT', dot: d.chtMaxCyl };
      default: {
        const i = Number(id.slice(3)) - 1;
        const egt = d.egt[i] == null ? '    ' : fmtEgt(d.egt[i], st.egt1);
        const cht = d.cht[i] == null ? '' : String(int(d.cht[i]));
        return { value: egt, label: cht, dot: i };
      }
    }
  }

  _joinText({ value, label }, excluded = false) {
    const lbl = (excluded ? '.' : '') + label;
    return value === '' ? lbl : `${value} ${lbl}`;
  }

  _lfRight(d, word) {
    return this.config.ff ? (d.flowSignal ? fmt1(d.flow) : '---') : word;
  }

  _lfDisplay(d, dsp) {
    const lf = this.ctx.lf;
    const st = this.settings;
    // LeanFind values always use 1° resolution (rev2, R10)
    const deg = (f) => String(int(st.engUnit === 'C' ? toC(f) : f));
    const delta = (dF) => String(int(st.engUnit === 'C' ? dToC(dF) : dF));
    const egtAt = (k) => (k === 'T' ? d.titF[0] : d.egtF[Number(k)]);
    const holding = this.g.isHolding('LF');
    const hot = d.hotCyl;
    const cols = dsp.columns;
    const review = lf.phase === 'LOP_DONE' || lf.phase === 'LOP_REVIEW';
    const lopInverted = review || (lf.method === 'L' && lf.order.length > 0);
    const peaks = review ? this.vol.lopResults.peaks : lf.peaks;
    const colOf = (k) => (k === 'T' ? cols.findIndex((c) => c.id === 'T') : Number(k));

    if (lopInverted) {
      // LF-9 / LF-10 inverted bar graph (5°F per segment below peak)
      for (let i = 0; i < this.config.cylinders; i++) {
        const pk = peaks[String(i)];
        cols[i].inverted = true;
        cols[i].segs = pk && d.egtF[i] != null ? clamp(Math.round((pk.peak - d.egtF[i]) / 5), 0, SEGMENTS) : 0;
        if (lf.phase === 'ACTIVE' && pk) cols[i].labelFlash = true; // C18: number flashes once peaked
      }
    }

    switch (lf.phase) {
      case 'ARMED':
        if (this.now < lf.bannerUntil) dsp.digital.text = `LEAN ${lf.method}`; // LF-2
        else if (hot != null) {
          dsp.digital.text = `${deg(d.egtF[hot])} ${this._lfRight(d, 'LF')}`;
          dsp.dot = { index: hot, blink: false };
        }
        return;
      case 'ACTIVE':
        if (lf.method === 'L' && lf.order.length) {
          // LF-9 (rev2): Δ and flashing dot of the most recently peaked cylinder
          const k = lf.order[lf.order.length - 1];
          dsp.digital.text = `${delta(egtAt(k) - lf.peaks[k].peak)} ${this._lfRight(d, 'LF')}`;
          dsp.dot = { index: Number(k), blink: true };
        } else if (hot != null) {
          dsp.digital.text = `${deg(d.egtF[hot])} ${this._lfRight(d, 'LF')}`; // LF-5
          dsp.dot = { index: hot, blink: true };
          if (cols[hot]) cols[hot].labelFlash = true;
        }
        return;
      case 'LEANEST':
      case 'ROP_SET': {
        const k = lf.lock;
        const ci = colOf(k);
        if (cols[ci]) {
          cols[ci].flash = true;
          cols[ci].labelFlash = true;
        }
        dsp.dot = k === 'T' ? { index: null, blink: false } : { index: Number(k), blink: true };
        if (lf.phase === 'LEANEST') {
          dsp.digital.text = 'LEANEST';
          return;
        }
        const pk = lf.peaks[k];
        if (holding) {
          // LF-8 (rev2): peak EGT with PK, or the fuel flow recorded at the peak
          const right = this.config.ff ? (d.flowSignal ? fmt1(pk.flow) : '---') : 'PK';
          dsp.digital.text = `${deg(pk.peak)} ${right}`;
        } else dsp.digital.text = `${deg(egtAt(k))} ${this._lfRight(d, 'SET')}`;
        return;
      }
      case 'LOP_DONE':
      case 'LOP_REVIEW': {
        // LF-10 / LF-11 / LF-12: identical display in DONE and REVIEW
        const r = this.vol.lopResults;
        const last = Number(r.last);
        if (cols[last]) cols[last].flash = true;
        dsp.dot = { index: last, blink: true };
        if (holding) {
          const right = this.config.ff ? fmt1(r.spread) : 'PK';
          dsp.digital.text = `${deg(r.peaks[r.first].peak)} ${right}`;
        } else {
          dsp.digital.text = `${delta(d.egtF[last] - r.peaks[r.last].peak)} ${this._lfRight(d, 'SET')}`;
        }
        return;
      }
      default:
    }
  }

  _programText(d) {
    const p = this.ctx.pgm;
    const st = this.settings;
    const L = st.limits;
    switch (p.sub) {
      case 'BANNER': return { text: 'PROGRAM' };
      case 'ADJUST': return { text: 'ADJUST' };
      case 'FACLIM_BANNER': return { text: 'FAC LIM' };
      case 'OAT_CAL': return { text: `OAT${fmtSigned(st.oatCal)}` };
      case 'HPC': return { text: `HPC= ${st.hpc}` };
      case 'MAP_CAL': return { text: `MAP=${fmt1(st.mapCal)}` };
      case 'ORIG_TIT': return { text: this.now < p.titleUntil ? 'ORIG TIT' : `ORIG T-${yn(st.origTit)}` };
      case 'CAL_TIT': return { text: this.now < p.titleUntil ? 'CAL TIT' : `TIT${fmtSigned(st.titCal)}` };
      case 'DUMP_XFER': return { text: `DUMP ${int(p.progress)}` };
      case 'SAVE_D': return { text: `SAVE D?${p.saveD}` };
      case 'KF_EDIT':
      case 'EC_EDIT': {
        const g = p.edit.digits;
        const num = `${g[0]}${g[1]}.${g[2]}${g[3]}`;
        const flashIndex = [0, 1, 3, 4][p.edit.idx];
        return { text: p.sub === 'KF_EDIT' ? `${num}=KF` : `${num}= EC`, flashIndex };
      }
      case 'LTM_ID_EDIT':
        return { text: p.idEdit.chars.join(''), flashIndex: p.idEdit.idx };
      case 'LTM': {
        const l = p.ltm;
        switch (p.ltmItem) {
          case 'TIME': return { text: `TIME ${l.TIME}` };
          case 'MNTH': return { text: `MNTH ${l.MNTH}` };
          case 'DAY': return { text: `DAY ${l.DAY}` };
          case 'YEAR': return { text: `YEAR ${pad2(l.YEAR % 100)}` };
          case 'HOUR': return { text: `HOUR ${pad2(l.HOUR)}` };
          case 'MIN': return { text: `MIN ${pad2(l.MIN)}` };
          case 'ID': return { text: st.aircraftId };
          default: return { text: 'END Y' };
        }
      }
      case 'FACLIM':
        switch (p.limItem) {
          case 'FAC': return { text: `FAC? ${p.facSel}` };
          case 'ENG': return { text: `ENG ${st.engUnit}` };
          case 'HBAT': return { text: `${fmt1(L.hbat)} H BAT` };
          case 'LBAT': return { text: `${fmt1(L.lbat)} L BAT` };
          case 'DIF': return { text: `${L.dif} DIF` };
          case 'HCHT': return { text: `${L.hcht} H CHT` };
          case 'CLD': return { text: `${L.cld} CLD` };
          case 'TIT': return { text: `${L.tit} TIT` };
          case 'HOIL': return { text: `${L.hoil} H OIL` };
          case 'LOIL': return { text: `${L.loil} L OIL` };
          case 'MAP': return { text: `${fmt1(L.map)} MAP` };
          case 'FUNIT': return { text: `FUEL ${st.fuelUnit}` };
          case 'MAIN': return { text: `MAIN=${st.main}` };
          case 'AUXQ': return { text: `AUX? ${yn(st.auxEnabled)}` };
          case 'AUX': return { text: `AUX=${st.aux}` };
          case 'MIN': return { text: `MIN =${L.minLim}` };
          case 'REMLIM': return { text: `REM =${L.remLim}` };
          case 'CARB': return { text: `CARB? ${yn(st.carb)}` };
          case 'RECRD': return { text: `RECRD? ${yn(st.recrd)}` };
          case 'CYL': return { text: `CYL=${st.cyl}` };
          case 'RHP': return { text: `HP = ${st.ratedHp}` };
          case 'EC': return { text: `${st.ec.toFixed(2)}= EC` };
          case 'END': return { text: `END ${p.limEnd}` };
          default: return { text: '' };
        }
      case 'ITEM':
        switch (p.item) {
          case 'FUEL': return { text: `FUEL? ${p.fuelQ}` };
          case 'RATE': return { text: `RATE ${st.rate}` };
          case 'OATU': return { text: `OAT ${st.oatUnit}` };
          case 'EGT1': return { text: `EGT 1?${yn(st.egt1)}` };
          case 'HPQ': return { text: `HP-? ${yn(st.hpDisplay)}` };
          case 'KF': return { text: this.now < p.titleUntil ? 'KF-SET' : `${st.kf.toFixed(2)}=KF` };
          case 'ACCUM': return { text: `ACCUM?${yn(st.accum)}` };
          case 'GPSC': return { text: `GPS-C= ${st.gpsc}` };
          case 'DUMP': return { text: p.dumpSel === 'N' ? 'DUMP? N' : `DUMP ${p.dumpSel}` };
          case 'END': return { text: `END ${p.endSel}` };
          default: return { text: '' };
        }
      default:
        void d;
        return { text: '' };
    }
  }

  _lamps711(d) {
    // P711-5: red above the limit, yellow within the warning band below it; never extinguished by STEP
    const L = this.settings.limits;
    const lamp = (v, lim, band) => (v == null ? 'off' : v > lim ? 'red' : v > lim - band ? 'yellow' : 'off');
    const tits = d.tit.filter((v) => v != null);
    const k = this.settings.engUnit === 'C' ? 5 / 9 : 1;
    return {
      cht: lamp(d.chtMax, L.hcht, 45 * k),
      oil: lamp(d.oil, L.hoil, 25 * k),
      tit: lamp(tits.length ? Math.max(...tits) : null, L.tit, 100 * k),
    };
  }

  getDisplay() {
    const c = this.config;
    const st = this.settings;
    const dsp = {
      power: this.state !== 'OFF',
      allOn: false,
      digital: { text: '', blink: false, flashIndex: null },
      upper: { text: '' },
      view: this.vol.view,
      viewStyle: c.model === 800 ? 'NRM' : 'NP',
      unit: st.engUnit,
      columns: [],
      dot: { index: null, blink: false },
      alarmLight: false,
      lamps711: null,
      brightness: this.brightness,
    };
    if (this.state === 'OFF') return dsp;
    const d = this._derive();
    dsp.alarmLight = !!this.vol.alarmActive; // ALM-8 (rev2): every powered state
    if (c.primary711) dsp.lamps711 = this._lamps711(d); // P711-5

    if (this.state === 'SELFTEST' && this.ctx.seq[this.ctx.idx].sub === 'SEGMENTS') {
      dsp.allOn = true;
      dsp.digital.text = '8888 888';
      dsp.upper.text = c.model === 800 ? '88' : '';
      dsp.columns = this._columnLabels().map(({ id, label }) => ({
        id, label, segs: SEGMENTS, chtSeg: 0, oilSeg: 0, inverted: false, flash: false, topFlash: false, oilFlash: false,
        missing: false, labelFlash: false,
      }));
      return dsp;
    }

    // Upper window (ANA-11)
    if (c.model === 800) {
      const hp = st.hpDisplay && c.ff && d.flowSignal;
      dsp.upper.text = hp ? `${d.pctHp} HP` : String(round10(d.rpm));
    }

    // Digital content per state
    let digitalItem = null;
    switch (this.state) {
      case 'SELFTEST':
      case 'STARTUP_INFO': {
        const step = this.ctx.seq[this.ctx.idx];
        dsp.digital.text = step.text ?? '';
        break;
      }
      case 'TANK_SETUP': {
        const t = this.ctx.tank.item;
        dsp.digital.text = t === 'MAIN' ? `MAIN=${st.main}` : t === 'AUXQ' ? `AUX? ${yn(st.auxEnabled)}` : `AUX=${st.aux}`;
        break;
      }
      case 'FUEL_FILL': {
        const f = this.ctx.fuel;
        if (f.sub === 'BANNER') dsp.digital.text = 'FUEL';
        else if (f.sub === 'ADD') dsp.digital.text = `${fmtFuel(f.amount)} ${st.fuelUnit}`;
        else {
          dsp.digital.text = { N: 'FILL? N', MAIN: `FILL ${int(st.main)}`, FULL: `FILL ${int(this._capacity())}`, PLUS: 'FILL+' }[f.sel];
          dsp.digital.blink = f.blink && f.sel === 'N';
        }
        break;
      }
      case 'AUTO':
      case 'MANUAL': {
        const id = this.vol.item;
        digitalItem = id;
        if (c.primary711 && this.state === 'MANUAL' && this.now < this.vol.egtChtUntil && /^EGT\d$/.test(id)) {
          dsp.digital.text = 'EGT-CHT';
        } else if (this._present(id, d) || id === 'CHTHI') {
          const t = this._itemText(id, d);
          dsp.digital.text = this._joinText(t, this.vol.excluded.has(id) && !c.primary711);
          if (t.dot != null) dsp.dot = { index: t.dot, blink: false };
        }
        break;
      }
      case 'PROGRAM': {
        const t = this._programText(d);
        dsp.digital.text = t.text;
        dsp.digital.flashIndex = t.flashIndex ?? null;
        if (this.ctx.pgm.sub === 'HPC' && c.ff) dsp.upper.text = `${d.pctHp} HP`;
        break;
      }
      case 'USB': {
        const u = this.ctx.usb;
        const box = u.source === 'box';
        if (u.sub === 'MENU') dsp.digital.text = box ? `DUMP${u.sel}` : u.sel;
        else if (u.sub === 'XFER') {
          if (box) dsp.digital.text = this.now < u.start ? 'DOWNLOAD' : `${int(u.progress)}%`;
          else dsp.digital.text = String(int(100 - u.progress));
        }
        else dsp.digital.text = 'DONE';
        break;
      }
      default:
        break;
    }

    // Analog columns
    if (this.state === 'SELFTEST' && this.ctx.seq[this.ctx.idx].sub === 'COLUMNS') {
      const col = this.ctx.seq[this.ctx.idx].col;
      dsp.columns = this._columnLabels().map(({ id, label }, i) => ({
        id, label, segs: i === col ? SEGMENTS : 0, chtSeg: 0, oilSeg: 0, inverted: false, flash: false, topFlash: false,
        oilFlash: false, missing: false, labelFlash: false,
      }));
    } else {
      dsp.columns = this._columns(d, digitalItem);
    }

    if (this.state === 'LEANFIND') this._lfDisplay(d, dsp);

    // Overlays (ALM-2, ALM-5, LF-14)
    if (NORMAL_STATES.has(this.state)) {
      // MAN-7 / ANA-8 (rev3): while an overlay is shown, the dot and the TIT/OIL segment flash follow the overlay
      // content; overlays without a cylinder show no dot. Column/number flashes (LeanFind, pre-ignition) are kept.
      const alarm = this.vol.alarmDisplayed;
      let overlay = null;
      if (this.now < this.vol.offUntil) overlay = { text: 'OFF', blink: false };
      else if (this.now < this.vol.snapUntil) overlay = { text: 'SNAP', blink: true };
      else if (alarm) overlay = { ...this.vol.alarmCond[alarm], blink: true };
      if (overlay) {
        dsp.digital = { text: overlay.text, blink: overlay.blink, flashIndex: null };
        dsp.dot = overlay.dot != null ? { index: overlay.dot, blink: false } : { index: null, blink: false };
        const T_ = dsp.columns.find((col) => col.id === 'T');
        if (T_) {
          T_.topFlash = overlay.item === (c.tit >= 1 ? 'TIT1' : 'OIL');
          T_.oilFlash = c.tit >= 1 && overlay.item === 'OIL';
        }
      }
    }

    return dsp;
  }
}
