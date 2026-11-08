// Helpers for driving the engine/airframe simulation in tests.
import { Simulation } from '../../src/sim/index.js';

import { GOV } from '../../src/sim/pilot.js';

export { GOV };

export function newSim(opts = {}) {
  const s = new Simulation({ seed: opts.seed ?? 1, personality: opts.personality ?? 'default', params: opts.params });
  if (opts.isaDev != null) s.env.isaDev = opts.isaDev;
  if (opts.rh != null) s.env.rh = opts.rh;
  if (opts.fieldElev != null) {
    s.flight.fieldElev = opts.fieldElev;
    s.flight.alt = opts.fieldElev;
  }
  s.engine.reset(s.atm.t);
  return s;
}

export function start(s) {
  const c = s.ctl;
  c.master = true;
  c.mixture = 1;
  c.throttle = 0.08;
  s.prime();
  s.prime();
  s.prime();
  c.mags = 'START';
  s.run(4);
  c.mags = 'BOTH';
  s.run(2);
  if (!s.engine.running) throw new Error('engine did not start');
  return s;
}

/** Throttle to a target RPM on the fine-pitch stop (ground). */
export function setRpmGround(s, rpm, secs = 4) {
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 22; k++) {
    const m = (lo + hi) / 2;
    s.ctl.throttle = m;
    s.run(secs);
    if (s.engine.rpm < rpm) lo = m;
    else hi = m;
  }
  s.ctl.throttle = (lo + hi) / 2;
  s.run(10);
}

/** Set MAP by throttle (governed RPM or not). */
export function setMap(s, map, iters = 60) {
  for (let k = 0; k < iters; k++) {
    s.run(1);
    s.ctl.throttle = Math.min(1, Math.max(0, s.ctl.throttle + (map - s.engine.map) * 0.015));
  }
}

/** Lean so the mean mixture r̄ reaches a target. */
export function leanToRbar(s, target, iters = 80) {
  for (let k = 0; k < iters; k++) {
    s.run(0.5);
    s.ctl.mixture = Math.min(1, Math.max(0.04, s.ctl.mixture - (s.engine.rBar - target) * 0.4));
  }
}

/** Put the airplane in level cruise at altitude/RPM/MAP with thermal states settled. */
export function cruise(s, { alt = 6000, rpm = 2400, map = 22, rBar = 1.05, cowl = 0 } = {}) {
  start(s);
  s.flight.alt = alt;
  s.flight.setMode('level');
  s.flight.tas = 200;
  s.ctl.prop = GOV(rpm);
  s.ctl.cowl = cowl;
  s.ctl.throttle = 0.7;
  setMap(s, map, 40);
  if (rBar) leanToRbar(s, rBar);
  s.settle(900);
  setMap(s, map, 20);
  if (rBar) leanToRbar(s, rBar, 30);
  s.run(30);
  return s;
}

export const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
export const spread = (xs) => Math.max(...xs) - Math.min(...xs);
