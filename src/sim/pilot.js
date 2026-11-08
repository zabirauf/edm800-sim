// Scripted pilot actions and the simulation ↔ EDM coupling. Used by scenarios, tests and the UI's set-ups.

import { EDM } from '../edm/machine.js';

export const GOV = (rpm) => (rpm - 1600) / 1100; // prop lever position for a governed RPM (1600–2700)

/** EDM-800 installation for the Cardinal (plan v2 §2). */
export const CARDINAL_EDM_CONFIG = {
  model: 800,
  primary711: false,
  cylinders: 4,
  tit: 0,
  oil: true,
  oat: true,
  iat: false,
  cdt: false,
  crb: true,
  ff: true,
  gps: true,
  usbPort: true,
  busVolts: 12,
  transducerK: 29.0,
};

/** Couples a Simulation and an EDM: every step feeds the sensor frame and advances the EDM clock. */
export class Link {
  constructor(sim, edm) {
    this.sim = sim;
    this.edm = edm;
    this.alarmsSeen = new Set();
    this.lastMaster = !!sim.ctl.master;
  }

  step(dt = 0.05) {
    // the EDM is powered from the aircraft bus: follow the master switch
    const master = !!this.sim.ctl.master;
    if (master !== this.lastMaster) {
      if (master && this.edm.state === 'OFF') this.edm.send({ type: 'POWER_ON' });
      if (!master && this.edm.state !== 'OFF') this.edm.send({ type: 'POWER_OFF' });
      this.lastMaster = master;
    }
    this.sim.step(dt);
    this.edm.send({ type: 'SENSORS', data: this.sim.sensors() });
    this.edm.send({ type: 'TICK', ms: dt * 1000 });
    const a = this.edm.vol.alarmActive;
    if (a) this.alarmsSeen.add(a);
  }

  run(seconds, onStep) {
    const n = Math.round(seconds / 0.05);
    for (let i = 0; i < n; i++) {
      this.step(0.05);
      if (onStep && onStep() === false) return i * 0.05;
    }
    return seconds;
  }

  press(button) {
    this.edm.send({ type: 'PRESS', button });
  }

  release(button) {
    this.edm.send({ type: 'RELEASE', button });
  }

  tap(button) {
    this.press(button);
    this.run(0.15);
    this.release(button);
    this.run(0.1);
  }

  hold(button, seconds) {
    this.press(button);
    this.run(seconds);
    this.release(button);
    this.run(0.1);
  }

  tapBoth() {
    this.press('STEP');
    this.press('LF');
    this.run(0.15);
    this.release('STEP');
    this.release('LF');
    this.run(0.1);
  }

  holdBoth(seconds = 5.2) {
    this.press('STEP');
    this.press('LF');
    this.run(seconds);
    this.release('STEP');
    this.release('LF');
    this.run(0.1);
  }
}

export function makeEdm(settings) {
  return new EDM({ config: CARDINAL_EDM_CONFIG, settings });
}

// ------------------------------------------------------------------ engine-side scripted actions (sim only)

export function startEngine(sim) {
  const c = sim.ctl;
  c.master = true;
  c.mixture = 1;
  c.throttle = 0.08;
  c.mags = 'OFF';
  for (let k = 0; k < 3; k++) sim.prime();
  c.mags = 'START';
  sim.run(4);
  c.mags = 'BOTH';
  sim.run(2);
  return sim.engine.running;
}

export function setRpmGround(sim, rpm, secs = 4) {
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 22; k++) {
    const m = (lo + hi) / 2;
    sim.ctl.throttle = m;
    sim.run(secs);
    if (sim.engine.rpm < rpm) lo = m;
    else hi = m;
  }
  sim.ctl.throttle = (lo + hi) / 2;
  sim.run(10);
}

export function setMap(sim, map, iters = 60) {
  for (let k = 0; k < iters; k++) {
    sim.run(1);
    sim.ctl.throttle = Math.min(1, Math.max(0, sim.ctl.throttle + (map - sim.engine.map) * 0.015));
  }
}

export function leanToRbar(sim, target, iters = 80) {
  for (let k = 0; k < iters; k++) {
    sim.run(0.5);
    sim.ctl.mixture = Math.min(1, Math.max(0.04, sim.ctl.mixture - (sim.engine.rBar - target) * 0.4));
  }
}

/** Level cruise with settled temperatures. rBar null keeps the mixture as set. */
export function setupCruise(sim, { alt = 6000, rpm = 2400, map = 22, rBar = 1.05, cowl = 0 } = {}) {
  startEngine(sim);
  sim.flight.alt = alt;
  sim.flight.setMode('level');
  sim.flight.tas = 200;
  sim.ctl.prop = GOV(rpm);
  sim.ctl.cowl = cowl;
  sim.ctl.throttle = 0.7;
  setMap(sim, map, 40);
  if (rBar) leanToRbar(sim, rBar);
  sim.settle(900);
  setMap(sim, map, 20);
  if (rBar) leanToRbar(sim, rBar, 30);
  sim.run(30);
}

/** Engine running and warm on the ground at ~1000 RPM. */
export function setupGroundWarm(sim, rpm = 1000) {
  startEngine(sim);
  sim.ctl.cowl = 1;
  setRpmGround(sim, rpm, 2);
  sim.settle(600);
  setRpmGround(sim, rpm, 2);
}

/** Bring the EDM through power-up into AUTO or MANUAL quickly (2-minute timer already elapsed). */
export function bootEdm(link, mode = 'AUTO') {
  const edm = link.edm;
  edm.send({ type: 'POWER_OFF' });
  edm.send({ type: 'POWER_ON' });
  for (let i = 0; i < 400 && !/^(FUEL_FILL\.SEL|MANUAL|AUTO)/.test(edm.getState().path); i++) link.step(0.05);
  if (edm.getState().path === 'FUEL_FILL.SEL') link.tap('STEP');
  link.run(122);
  const st = edm.getState().state;
  if (mode === 'MANUAL' && st === 'AUTO') link.tap('STEP');
  if (mode === 'AUTO' && st === 'MANUAL') {
    link.tap('LF');
    link.tap('STEP');
  }
  edm.events.length = 0;
  link.alarmsSeen.clear();
}
