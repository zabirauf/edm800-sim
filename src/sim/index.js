// Simulation = atmosphere + O-360 engine + 177B flight path + systems. Fixed 50 ms step shared with the EDM.
// sensors() produces the EDM-800 sensor frame (4 cylinders, OIL, OAT, CRB, BAT, RPM, MAP, fuel flow, GPS).

import { atmosphere, isaTempF } from './atmosphere.js';
import { defaultParams, PARAMS, PERSONALITIES } from './calibration.js';
import { O360, N_CYL } from './o360.js';
import { Flight } from './flight.js';
import { Systems } from './systems.js';
import { FIT } from './fitted.js';
import { steadyPower } from './engineCore.js';
import { KT } from './airframe.js';

export const DT = 0.05;

export function makeRng(seed = 1) {
  let a = seed >>> 0 || 1;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare = null;
  const gauss = () => {
    if (spare != null) {
      const s = spare;
      spare = null;
      return s;
    }
    let u = 0;
    let v = 0;
    while (u === 0) u = next();
    v = next();
    const mag = Math.sqrt(-2 * Math.log(u));
    spare = mag * Math.sin(2 * Math.PI * v);
    return mag * Math.cos(2 * Math.PI * v);
  };
  return { next, gauss };
}

export const FAULTS = {
  fouledPlug: { label: 'Fouled spark plug (lower plug, right magneto)', cyl: true },
  stuckValve: { label: 'Sticking exhaust valve', cyl: true },
  burnedValve: { label: 'Burned exhaust valve (EGT oscillation ≈1/min)', cyl: true },
  lowCompression: { label: 'Low compression', cyl: true },
  inductionLeak: { label: 'Induction leak (intake gasket)', cyl: true, sev: true },
  preIgnition: { label: 'Pre-ignition hot spot', cyl: true },
  exhaustLeak: { label: 'Exhaust leak blowing on CHT probe', cyl: true },
  magFailL: { label: 'Left magneto failed' },
  magFailR: { label: 'Right magneto failed' },
  magDrive: { label: 'Dual-magneto drive failure (both magnetos)' },
  timingL: { label: 'Left magneto timing advanced', sev: true },
  timingR: { label: 'Right magneto timing retarded', sev: true },
  filterBlock: { label: 'Induction filter blocked (heavy rain / ice)', sev: true },
  accelPump: { label: 'Accelerator pump failed' },
  fuelPump: { label: 'Engine-driven fuel pump failed' },
  alternator: { label: 'Alternator failure' },
  overvoltage: { label: 'Voltage regulator runaway (over-voltage)' },
  oilCooler: { label: 'Oil cooler blocked' },
  lowOil: { label: 'Low oil quantity' },
  ffTransducer: { label: 'Fuel-flow transducer failed' },
};

export class Simulation {
  constructor({ seed = 1, personality = 'default', params = {} } = {}) {
    this.seed = seed;
    this.rng = makeRng(seed);
    this.params = { ...defaultParams(), ...params };
    this.personalityId = personality;
    this.personality = PERSONALITIES[personality];
    this.engine = new O360({ params: this.params, personality: this.personality, rng: this.rng });
    this.flight = new Flight(FIT.airframe);
    this.systems = new Systems();
    this.env = { isaDev: 0, rh: 0.5 };
    this.faults = {};
    this.failedProbes = new Set();
    this.gps = { status: 'ok', offCourse: false, dist: 120 };
    this.ctl = {
      throttle: 0,
      mixture: 1,
      prop: 1,
      carbHeat: 0,
      cowl: 1,
      mags: 'OFF',
      fuelSelector: 'BOTH',
      auxPump: false,
      master: false,
      alternator: true,
    };
    this.time = 0;
    this.ffMeasured = 0;
    this.atm = atmosphere(0, 0, 0.5);
    this.engine.reset(this.atm.t);
  }

  setParam(name, value) {
    const def = PARAMS[name];
    if (!def) throw new Error(`unknown parameter ${name}`);
    const [lo, hi] = def.range ?? [value, value];
    this.params[name] = Math.min(hi, Math.max(lo, value));
  }

  setPersonality(id) {
    this.personalityId = id;
    this.personality = PERSONALITIES[id];
    this.engine.pers = this.personality;
  }

  setFault(id, spec) {
    if (spec) this.faults[id] = { cyl: 0, sev: 1, ...spec };
    else delete this.faults[id];
  }

  prime() {
    this.engine.primed++;
  }

  /** Advance one fixed step. */
  step(dt = DT) {
    const f = this.flight;
    this.atm = atmosphere(f.alt, this.env.isaDev, this.env.rh);
    const atm = this.atm;
    const env = { p: atm.p, t: atm.t, pv: atm.pv, w: atm.w, sigma: atm.sigma, ias: f.ias(atm.sigma), tas: f.tas, onGround: f.onGround };
    this.systems.step(dt, this.ctl, this.engine, this.faults);
    this.engine.step(dt, env, this.ctl, this.systems, this.faults);
    f.step(dt, atm.sigma, this.engine.running ? this.engine.bhp : this.engine.bhp, this.engine.rpm);
    // fuel-flow transducer: upstream of the float bowl — lag + small noise (critique S1)
    const ffTrue = this.engine.gph;
    this.ffMeasured += (ffTrue - this.ffMeasured) * (1 - Math.exp(-dt / 1.0));
    if (this.gps.status === 'ok' && !f.onGround) this.gps.dist = Math.max(0, this.gps.dist - (f.groundSpeedKt(atm.sigma) * dt) / 3600);
    this.time += dt;
  }

  run(seconds) {
    const n = Math.round(seconds / DT);
    for (let i = 0; i < n; i++) this.step(DT);
  }

  /** Quick trim for scenario initialization: hold the current controls and settle (not used during free play). */
  settle(seconds = 900) {
    const p = this.params;
    const saved = { tauCht: p.tauCht, oilC: p.oilC, tauMuff: p.tauMuff };
    p.tauCht = 12;
    p.oilC = 3;
    p.tauMuff = 8;
    const altHold = this.flight.alt;
    for (let t = 0; t < seconds / 10; t += DT) {
      this.step(DT);
      if (this.flight.mode === 'level') this.flight.alt = altHold;
    }
    Object.assign(p, saved);
    for (let t = 0; t < 20; t += DT) this.step(DT);
  }

  /** JPI-like %HP estimate from RPM, MAP and fuel flow (critique m16) — not the true power. */
  pctHpEstimate() {
    const e = this.engine;
    if (!e.running) return 0;
    const atm = this.atm;
    const air = steadyPower({ N: e.rpm, mapInd: e.map, tInletF: atm.t, pAmb: atm.p, r: 1.145, p: this.params }).bhp;
    const pctAir = (air / 180) * 100;
    const pctFf = ((this.ffMeasured * 14.9) / 180) * 100;
    return Math.max(0, Math.min(pctAir, pctFf));
  }

  /** EDM-800 sensor frame (°F, V, inHg, RPM, true GPH). */
  sensors() {
    const e = this.engine;
    const atm = this.atm;
    const jitter = e.running ? e.roughness * 40 * (this.rng.next() - 0.5) : 0;
    const cht = e.cht.map((c, i) => c + (this.personality.gasket[i] ? 35 : 0) + (this.faults.exhaustLeak?.cyl === i ? 130 : 0));
    const egt = e.egtProbe.map((g, i) => g - (this.faults.exhaustLeak && Math.abs(this.faults.exhaustLeak.cyl - i) === 1 ? 30 : 0));
    const pad = (arr, fill) => [...arr, ...Array(6 - arr.length).fill(fill)];
    return {
      egt: pad(egt, atm.t),
      cht: pad(cht, atm.t),
      tit: [atm.t, atm.t],
      oil: e.oil,
      oat: atm.t + (this.flight.tas / KT / 100) ** 2 * 1.8 * 0.8,
      iat: atm.t,
      cdt: atm.t,
      crb: e.crb,
      bat: this.systems.busV,
      rpm: Math.max(0, e.rpm + jitter),
      map: e.map,
      ffGph: this.ffMeasured,
      ffSignal: !this.faults.ffTransducer,
      pctHp: this.pctHpEstimate(),
      gps: { ...this.gps, gs: this.flight.onGround ? 0 : this.flight.groundSpeedKt(atm.sigma) },
      failed: [...this.failedProbes],
      calErr: [],
    };
  }

  /** Values for the truth panel (what the EDM cannot show directly). */
  truth() {
    const e = this.engine;
    const f = this.flight;
    const atm = this.atm;
    const egtMix = e.running
      ? e.egt.reduce((s, g, i) => s + g * (e.mdot / N_CYL) * e.r[i], 0) / Math.max(1e-6, e.r.reduce((s, r) => s + (e.mdot / N_CYL) * r, 0))
      : atm.t;
    return {
      bhp: e.bhp,
      pctTrue: (e.bhp / 180) * 100,
      gph: e.gph,
      rpm: e.rpm,
      map: e.map,
      beta: e.beta,
      rBar: e.rBar,
      r: [...e.r],
      misfire: [...e.misfire],
      roughness: e.roughness,
      tailpipeEgt: egtMix,
      ice: e.ice,
      crb: e.crb,
      heatRise: e.heatRise,
      knock: [...e.knock],
      preign: [...e.preign],
      plugF: e.plugF.map((x) => [...x]),
      oilPressure: e.oilPressure,
      fuelPressure: this.systems.fuelPressure,
      tankL: this.systems.tankL,
      tankR: this.systems.tankR,
      busV: this.systems.busV,
      altOnline: this.systems.altOnline,
      ovTripped: this.systems.ovTripped,
      ias: f.ias(atm.sigma),
      tas: f.tas / KT,
      vs: f.vs,
      alt: f.alt,
      oat: atm.t,
      dewPoint: atm.dewF,
      isaT: isaTempF(f.alt),
      running: e.running,
      fastThrottle: e.fastThrottleEvents,
      damaged: [...e.damaged],
    };
  }
}
