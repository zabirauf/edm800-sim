// Flight-path dynamics of the 177B (plan v2 §4.13): point mass with the fitted polar; the pilot chooses a flight-path
// mode instead of flying the stick (adequate for engine-management training, critique Q).

import { KT, G, thrust, drag } from './airframe.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const MODES = {
  ground: 'On ground (brakes / run-up)',
  takeoff: 'Take-off roll → climb at Vy',
  climb: 'Climb at target IAS',
  level: 'Level flight',
  descentVs: 'Descend at target VS',
  descentIas: 'Descend at target IAS',
  goAround: 'Go-around (climb at Vy)',
};

export class Flight {
  constructor(airframe) {
    this.af = airframe;
    this.mode = 'ground';
    this.fieldElev = 0;
    this.alt = 0;
    this.tas = 0; // ft/s
    this.gamma = 0;
    this.vs = 0; // fpm
    this.targetIas = 79;
    this.targetVs = -500;
    this.flaps = 0;
    this.weight = 2500;
    this.wind = 0; // headwind component, kt
    this.onGround = true;
  }

  vy() {
    return 79 - 0.9 * (this.alt / 1000); // POH Fig 5-5: 79 KIAS SL → 70 at 10 000 ft
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === 'ground') {
      this.tas = 0;
      this.alt = this.fieldElev;
      this.onGround = true;
    }
    if (mode === 'goAround') this.targetIas = this.vy();
  }

  ias(sigma) {
    return (this.tas / KT) * Math.sqrt(sigma);
  }

  step(dt, sigma, bhp, rpm) {
    const af = this.af;
    const W = this.weight;
    const m = W / G;
    const T = thrust(bhp, Math.max(this.tas, 1), rpm, af.etaMax);
    if (this.mode === 'ground') {
      this.tas = 0;
      this.gamma = 0;
      this.vs = 0;
      this.alt = this.fieldElev;
      this.onGround = true;
      return;
    }
    if (this.mode === 'takeoff' && this.onGround) {
      const D = drag(this.tas, sigma, W, af.cd0, af.e, this.flaps, 0, true);
      const q = 0.5 * 0.0023769 * sigma * this.tas * this.tas;
      const lift = q * 174 * (0.35 + 0.4 * this.flaps);
      const roll = 0.04 * Math.max(0, W - lift);
      this.tas = Math.max(0, this.tas + ((T - D - roll) / m) * dt);
      if (this.ias(sigma) >= 55) {
        this.onGround = false;
        this.mode = 'climb';
        this.targetIas = this.vy();
      }
      this.alt = this.fieldElev;
      this.vs = 0;
      return;
    }
    this.onGround = false;
    const D = drag(Math.max(this.tas, 40), sigma, W, af.cd0, af.e, this.flaps, this.gamma);
    const excess = (T - D) / W;
    let sinG;
    if (this.mode === 'level') sinG = 0;
    else if (this.mode === 'descentVs') sinG = clamp(this.targetVs / 60 / Math.max(this.tas, 60), -0.25, 0.25);
    else {
      // IAS-hold modes (climb, descentIas, goAround): pitch to hold the target airspeed
      const tgt = this.mode === 'goAround' ? this.vy() : this.targetIas;
      const err = (this.ias(sigma) - tgt) * KT;
      const raw = excess + (0.15 * err) / G;
      // climb modes never command a descent (accelerate in level flight first); descent mode never climbs
      sinG = this.mode === 'descentIas' ? clamp(raw, -0.25, 0) : clamp(raw, 0, 0.3);
    }
    this.gamma = Math.asin(sinG);
    this.tas = clamp(this.tas + G * (excess - sinG) * dt, 50, 330);
    this.vs = this.tas * sinG * 60;
    this.alt += this.tas * sinG * dt;
    if (this.alt <= this.fieldElev && this.vs < 0) {
      this.alt = this.fieldElev;
      this.mode = 'level';
    }
  }

  groundSpeedKt(sigma) {
    return this.tas / KT - this.wind;
  }
}
