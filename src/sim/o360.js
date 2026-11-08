// Lycoming O-360-A1F6D dynamic model (plan v2 §4). Stepped at a fixed dt (50 ms) by Simulation.
// Physics core (airflow, MAP, power, fuel) lives in engineCore.js and is calibrated by tools/fit.mjs.

import {
  engineAirflow, exhaustPressure, pumpingHp, frictionHp, throttleAreaFraction, solveMap, FAR_PEAK, M_REF,
  LB_PER_GAL,
} from './engineCore.js';
import { dEgt, dCht, indicatedFactor, logistic } from './curves.js';
import { fToR, humidityRatio, satVaporPressure } from './atmosphere.js';
import { RHO0, PROP_D } from './airframe.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clamp01 = (v) => clamp(v, 0, 1);
const relax = (x, target, dt, tau) => x + (target - x) * (1 - Math.exp(-dt / Math.max(1e-6, tau)));

export const N_CYL = 4;
const I_ROT = 3.0; // slug·ft², engine + prop (ASSUMED)
const GOV_MIN = 1600; // governor range: lever full aft ≈1600 RPM (prop cycle at run-up), full forward 2700
const GOV_MAX = 2700;
const BETA_FINE = 12.1;
const BETA_COARSE = 26.0;

export class O360 {
  constructor({ params, personality, rng }) {
    this.p = params;
    this.pers = personality;
    this.rng = rng;
    this.reset(59);
  }

  /** Cold, stopped engine at ambient temperature. */
  reset(ambF) {
    this.running = false;
    this.rpm = 0;
    this.beta = BETA_FINE;
    this.map = 29.92;
    this.mdot = 0;
    this.pExh = 29.92;
    this.rBar = 1;
    this.r = Array(N_CYL).fill(1);
    this.misfire = Array(N_CYL).fill(0);
    this.ihpCyl = Array(N_CYL).fill(0);
    this.bhp = 0;
    this.ihp = 0;
    this.fhp = 0;
    this.gph = 0;
    this.egt = Array(N_CYL).fill(ambF); // true gas temperature
    this.egtProbe = Array(N_CYL).fill(ambF);
    this.wander = Array(N_CYL).fill(0);
    this.cht = Array(N_CYL).fill(ambF);
    this.oil = ambF;
    this.oilPressure = 0;
    this.muff = ambF;
    this.carbBody = ambF;
    this.crb = ambF;
    this.tPlate = ambF;
    this.heatRise = 0;
    this.ice = 0;
    this.water = 0;
    this.plugF = Array.from({ length: N_CYL }, () => [0, 0]);
    this.knock = Array(N_CYL).fill(0);
    this.deton = Array(N_CYL).fill(0);
    this.preign = Array(N_CYL).fill(false);
    this.preignTimer = Array(N_CYL).fill(0);
    this.damaged = Array(N_CYL).fill(false);
    this.roughness = 0;
    this.squirt = 0;
    this.stumble = 0;
    this.lastThrottle = 0;
    this.bowl = 1;
    this.primed = 0;
    this.crankTime = 0;
    this.t = 0;
    this.fastThrottleEvents = 0;
    this.thrHist = [];
    this.fastFlag = false;
    this.propHp = 0;
    this.J = 0;
    this.coolFlow = 0;
  }

  /**
   * One step. env: {p, t (OAT °F), pv, w, sigma, ias, tas (ft/s), onGround}; ctl: controls; sys: {fuelSupply,
   * starterPower, oilQty}; faults: map id → {cyl, sev}.
   */
  step(dt, env, ctl, sys, faults) {
    const p = this.p;
    this.t += dt;
    const F = faults;

    // ---------------- start / stop logic
    const magsOn = ctl.mags !== 'OFF';
    const cutoff = ctl.mixture < 0.03;
    const cranking = ctl.mags === 'START' && sys.starterPower;
    const bothMagsDead = (F.magFailL && F.magFailR) || F.magDrive;
    if (cranking) this.crankTime += dt;
    else this.crankTime = 0;
    if (!this.running && cranking && !cutoff && sys.fuelSupply && !bothMagsDead && this.bowl > 0.3) {
      const warm = this.cht.some((c) => c > 120);
      const needPrime = !warm && env.t < 70;
      const flooded = this.primed > 6;
      const catchTime = flooded ? 6 : needPrime && this.primed < 2 ? 99 : warm ? 1.0 : 2.0;
      if (this.crankTime > catchTime) {
        this.running = true;
        this.primed = 0;
      }
    }
    const fuelStarved = this.bowl < 0.05;
    if (this.running && (!magsOn || cutoff || fuelStarved || bothMagsDead || this.ice > 0.97 || (this.rpm < 350 && !cranking))) {
      this.running = false;
    }

    // ---------------- air path (§4.2)
    const q = 0.5 * RHO0 * env.sigma * env.tas * env.tas; // psf
    const heat = clamp01(ctl.carbHeat);
    const filterLoss = (F.filterBlock ? 2.5 * F.filterBlock.sev : 0) * (1 - heat); // alternate air bypasses the filter
    const pUp = env.p + ((p.kRam * q) / 70.726) * (1 - heat) - filterLoss - 0.3 * heat; // alternate-air path ΔP
    const a0 = this.mdot / M_REF;
    // carb heat: exhaust-heated muffler shroud (§4.11, critique M8). Wall temperature follows exhaust heat flux;
    // heat pick-up per lb of air falls with airflow. Anchor: 90°F rise at 75 % (14 CFR 23.1093, heatEps).
    const egtMean = this.egt.reduce((s, x) => s + x, 0) / N_CYL;
    const flux = Math.pow(clamp(a0 / 0.6, 0, 1.45), 0.7); // exhaust heat flux falls with airflow
    const muffTarget = this.running ? env.t + 0.55 * Math.max(0, egtMean - env.t) * flux : env.t;
    this.muff = relax(this.muff, muffTarget, dt, p.tauMuff);
    const eps = Math.min(0.4, p.heatEps * Math.pow(0.6 / Math.max(a0, 0.05), 0.2));
    this.heatRise = heat * eps * Math.max(0, this.muff - env.t);
    const ramRise = (env.tas / 1.68781 / 100) ** 2 * 1.8; // °F, adiabatic ram rise (≈3°F at 130 KTAS)
    const tInlet = env.t + ramRise + this.heatRise;
    const pvExcess = env.pv; // dry-air partial pressure drives airflow (critique m11)
    const areaFrac = throttleAreaFraction(ctl.throttle);
    const area = (p.aIdle + p.aMax * areaFrac) * (1 - 0.85 * this.ice);
    const nAir = this.running ? this.rpm : cranking ? Math.max(this.rpm, 150) : this.rpm;
    const demand = (mapInd) => (nAir > 50 ? engineAirflow(nAir, mapInd, tInlet, this.pExh, p, pvExcess) : 0);
    this.map = nAir > 50 ? solveMap(area, pUp, tInlet, demand) : pUp;
    this.mdot = demand(this.map);
    this.pExh = exhaustPressure(env.p, this.mdot);
    const a = this.mdot / M_REF; // airflow fraction (EGT load, critique m5)

    // ---------------- carburetor & mixture (§4.4)
    const thr = clamp01(ctl.throttle);
    const dThr = (thr - this.lastThrottle) / dt;
    // A1F6 counterweights: full-range throttle movement in under 2 s is logged for the debrief (critique m13)
    this.thrHist.push([this.t, thr]);
    while (this.thrHist.length && this.t - this.thrHist[0][0] > 2) this.thrHist.shift();
    const span = Math.max(...this.thrHist.map((x) => x[1])) - Math.min(...this.thrHist.map((x) => x[1]));
    if (span > 0.8 && !this.fastFlag) {
      this.fastThrottleEvents++;
      this.fastFlag = true;
    }
    if (span < 0.3) this.fastFlag = false;
    if (dThr > 0.8 && this.running) {
      if (F.accelPump) this.stumble = Math.min(1, this.stumble + dThr * dt * 2);
      else this.squirt = Math.min(1, this.squirt + dThr * dt * 1.5);
    }
    this.lastThrottle = thr;
    this.squirt = relax(this.squirt, 0, dt, 0.6);
    this.stumble = relax(this.stumble, 0, dt, 0.8);
    const wIdle = clamp01((0.12 - a) / 0.08);
    const wEnrich = clamp01((thr - 0.82) / 0.15);
    let rFr = p.rFrPart + wEnrich * (p.rFrWot - p.rFrPart);
    rFr = wIdle * p.rFrIdle + (1 - wIdle) * rFr;
    const sigmaCarb = (pUp / 29.92) * (fToR(59) / fToR(tInlet));
    const lever = clamp01(ctl.mixture);
    const meter = lever < 0.03 ? 0 : p.leverMin + ((1 - p.leverMin) * (lever - 0.03)) / 0.97;
    const bowlFactor = clamp01(this.bowl / 0.3);
    this.rBar =
      rFr * Math.sqrt(1 / sigmaCarb) * (1 + env.w) * meter * (1 + 0.3 * this.ice) * (1 + 0.12 * this.squirt) *
      (1 - 0.3 * this.stumble) * bowlFactor;
    // distribution (critique M5, m18)
    // spread grows near wide-open throttle (plate fully open): key on MAP relative to the available MAP
    const wWot = clamp01((this.map / pUp - 0.92) / 0.05);
    const lowPow = clamp01((0.35 - a) / 0.25);
    const cold = clamp01((140 - this.oil) / 80);
    const g =
      (1 + (p.spreadWot - 1) * wWot) * (1 + (p.spreadLow - 1) * Math.max(lowPow, cold)) * (1 - 0.2 * heat) *
      (1 + 0.3 * clamp01((32 - env.t) / 30));
    const d0 = this.pers.d0;
    const mean = d0.reduce((s, x) => s + x, 0) / N_CYL;
    for (let i = 0; i < N_CYL; i++) {
      let ri = this.rBar * (1 + (d0[i] - mean) * g);
      if (F.inductionLeak && F.inductionLeak.cyl === i) ri *= 1 - 0.6 * F.inductionLeak.sev * clamp01(1 - this.map / pUp);
      this.r[i] = ri;
    }

    // ---------------- ignition, plugs, knock, misfire (§4.6)
    const magL = (ctl.mags === 'L' || ctl.mags === 'BOTH' || ctl.mags === 'START') && !F.magFailL && !F.magDrive;
    const magR = (ctl.mags === 'R' || ctl.mags === 'BOTH') && !F.magFailR && !F.magDrive;
    const timing = (magL && F.timingL ? F.timingL.sev : 0) * (magR && !magL ? 0 : 1) + (magR && F.timingR ? F.timingR.sev : 0) * (magL && !magR ? 0 : 1);
    const timingAdv = magL && magR ? timing / 2 : timing; // + advanced, − retarded (×5°)
    this.roughness = 0;
    let ihp = 0;
    const effs = [];
    const egtSingle = [];
    for (let i = 0; i < N_CYL; i++) {
      const ri = this.r[i];
      const active = [magL, magR];
      let cnt = 0;
      let noFire = 1;
      for (let j = 0; j < 2; j++) {
        if (!active[j]) continue;
        const Fp = this.plugF[i][j] + (F.fouledPlug && F.fouledPlug.cyl === i && j === 1 ? 1 : 0);
        const fire = Fp < 0.6 ? 1 : Fp < 0.85 ? 1 - (Fp - 0.6) / 0.25 : 0;
        cnt += fire;
        noFire *= 1 - fire;
      }
      if (!magL && !magR) noFire = 1;
      const eff = cnt >= 2 ? 1 : p.singleMagEff + (1 - p.singleMagEff) * Math.max(0, cnt - 1);
      const single = cnt >= 1 ? clamp01(2 - cnt) : 0;
      const shift = single * 0.025;
      const lean = logistic((p.rLeanMis + shift - ri) / 0.008);
      const rich = 0.35 * logistic((ri - (p.rRichMis - shift)) / 0.03); // over-rich roughness is partial (M6)
      let fault = 0;
      if (F.stuckValve && F.stuckValve.cyl === i) fault = this.cht[i] < 200 ? 0.85 : 0.25 * (0.5 + 0.5 * Math.sin(this.t * 0.7));
      if (this.damaged[i]) fault = 1;
      const mis = 1 - (1 - lean) * (1 - rich) * (1 - noFire) * (1 - fault);
      this.misfire[i] = this.running ? mis : 0;
      // knock margin (critique M9)
      const mixK = ri < 0.95 ? 0.85 + (ri - 0.92) * 5 : ri <= 1.12 ? 1 : Math.max(0.55, 1 - (ri - 1.12) * 2);
      const K =
        Math.pow(fToR(tInlet) / 520, 2) * Math.pow(this.cht[i] / 430, 2) * Math.pow(Math.max(0, this.map) / 28.5, 1.3) *
        mixK * (1 + 0.3 * Math.max(0, timingAdv)) * Math.pow(100 / p.octane, 3.5) * (1 + 0.3 * heat * wEnrich) * 0.9;
      this.knock[i] = this.running ? K : 0;
      const s = clamp01((K - 1) / 0.3);
      this.deton[i] = this.running ? s : 0;
      if (s > 0.7) this.preignTimer[i] += dt;
      else this.preignTimer[i] = Math.max(0, this.preignTimer[i] - dt);
      const hotSpot = F.preIgnition && F.preIgnition.cyl === i;
      const powerFrac = this.bhp / 180;
      if (this.running && (hotSpot || this.preignTimer[i] > 30) && powerFrac > 0.45) this.preign[i] = true;
      if (this.preign[i] && (!this.running || powerFrac < 0.45 || (ri > 1.25 && !hotSpot) || (hotSpot && powerFrac < 0.5))) {
        this.preign[i] = false;
      }
      let pw = 1;
      if (F.lowCompression && F.lowCompression.cyl === i) pw *= 0.85;
      if (timingAdv < 0) pw *= 1 + 0.04 * timingAdv;
      if (this.preign[i]) pw *= 0.8;
      const ihpI = this.running ? p.Ki * (this.mdot / N_CYL) * indicatedFactor(ri) * eff * (1 - this.misfire[i]) * (1 - 0.02 * s) * pw : 0;
      this.ihpCyl[i] = ihpI;
      ihp += ihpI;
      effs.push(eff);
      egtSingle.push(single);
      this.roughness += this.misfire[i] * 0.6 + (this.preign[i] ? 0.4 : 0) + s * 0.2;
    }
    this.water = relax(this.water, 0, dt, 20);
    this.roughness = clamp01(this.roughness + clamp01((this.ice - 0.6) / 0.3) * 0.6 + this.water * 3 + (F.magDrive ? 1 : 0));

    // ---------------- power, fuel (§4.3)
    this.ihp = ihp;
    const coldOil = clamp01((100 - this.oil) / 80) * 0.5;
    this.fhp = nAir > 30 ? frictionHp(nAir, p, coldOil) : 0;
    const php = nAir > 50 ? pumpingHp(nAir, this.map, this.pExh, p, pvExcess) : 0;
    this.bhp = ihp - this.fhp - php - (this.water > 0 ? this.water * 40 : 0);
    let gph = 0;
    if (this.running) {
      for (let i = 0; i < N_CYL; i++) gph += ((this.mdot / N_CYL) * FAR_PEAK * this.r[i] * 3600) / LB_PER_GAL;
      gph += this.squirt * 4;
    }
    this.gph = gph;
    // float bowl
    const bowlGal = 0.04;
    const fill = sys.fuelSupply ? 0.6 : 0;
    this.bowl = clamp01(this.bowl + (fill - gph / 3600 / bowlGal) * dt);
    if (sys.fuelSupply && this.bowl > 0.999) this.bowl = 1;

    // ---------------- prop, governor, RPM (§4.7)
    const n = Math.max(nAir, 1) / 60;
    const V = env.tas;
    const J = V / (n * PROP_D);
    const phi = (Math.atan(J / (Math.PI * 0.79)) * 180) / Math.PI;
    const govSet = GOV_MIN + (GOV_MAX - GOV_MIN) * clamp01(ctl.prop);
    const oilPressOk = this.oilPressure > 10;
    let dBeta = oilPressOk ? clamp(((this.rpm - govSet) / 100) * 8, -15, 15) : -10;
    if (!oilPressOk && this.rpm > govSet + 50) dBeta = -10; // no oil: counterweights / spring → fine pitch
    this.beta = clamp(this.beta + dBeta * dt, BETA_FINE, BETA_COARSE);
    const cp = (p.cpA0 + p.cpA1 * J) * (this.beta - phi);
    const rho = RHO0 * env.sigma;
    const nRps = this.rpm / 60;
    this.propHp = (cp * rho * nRps ** 3 * PROP_D ** 5) / 550;
    this.J = J;
    const starterHp = cranking && !this.running ? 3.5 * clamp01((250 - this.rpm) / 250) + 1.5 : 0;
    const engineHp = this.running ? this.bhp : -(this.rpm > 30 ? this.fhp + Math.max(0, php) : 0) + starterHp;
    const omega = Math.max((this.rpm * 2 * Math.PI) / 60, 5);
    const domega = ((engineHp - this.propHp) * 550) / (I_ROT * omega);
    this.rpm = Math.max(0, this.rpm + (domega * dt * 60) / (2 * Math.PI));
    if (!this.running && !cranking && V < 40 && this.rpm < 120) this.rpm = Math.max(0, this.rpm - 200 * dt);

    // ---------------- EGT (§4.8)
    const pers = this.pers;
    for (let i = 0; i < N_CYL; i++) {
      let target = env.t;
      if (this.running && this.misfire[i] < 0.999) {
        const peak = p.E0 + p.E1 * a + (p.E2 * (this.rpm - 2400)) / 100 + pers.egtOff[i];
        target = peak + dEgt(this.r[i]) + p.singleMagEgt * egtSingle[i] - 40 * Math.max(0, timingAdv) + 60 * Math.max(0, -timingAdv);
        target += 0.3 * this.heatRise - 20 * this.deton[i];
        if (this.preign[i]) target += F.preIgnition?.jpi ? 750 : -200;
        if (F.burnedValve && F.burnedValve.cyl === i) target += 65 * Math.sin((2 * Math.PI * this.t) / 60) - 30;
        if (F.lowCompression && F.lowCompression.cyl === i) target -= 40 * clamp01((2400 - this.rpm) / 800) + 10;
        target -= (target - env.t) * 0.45 * this.misfire[i];
        target = Math.max(env.t, target);
      }
      this.egt[i] = relax(this.egt[i], target, dt, this.running ? 0.4 : 40);
      // seeded Ornstein–Uhlenbeck wander (critique m17)
      const tauW = 6;
      this.wander[i] += -(this.wander[i] / tauW) * dt + p.egtNoise * Math.sqrt((2 * dt) / tauW) * this.rng.gauss();
      const wanderScale = this.running ? 1 : 0;
      this.egtProbe[i] = relax(this.egtProbe[i], this.egt[i] + this.wander[i] * wanderScale, dt, p.tauEgt);
    }

    // ---------------- cooling air, CHT (§4.9)
    const ias = env.ias;
    const slipKt2 = (95 * 95 * Math.max(0, this.bhp)) / 180; // prop slipstream (ASSUMED scale)
    const mCool = Math.sqrt(env.sigma) * Math.sqrt(ias * ias + p.kSlip * slipKt2);
    const mRef = 112.5;
    const cowlOpen = clamp01(ctl.cowl);
    const cowlF = 1 - p.cowlVy * clamp((140 - ias) / 61, 0.25, 1) * (1 - cowlOpen);
    const hBase = Math.pow(Math.max(mCool, 4) / mRef, 0.7) * cowlF;
    this.coolFlow = mCool / mRef;
    const tCool = env.t + ramRise;
    for (let i = 0; i < N_CYL; i++) {
      const rear = i >= 2;
      const bias = rear ? 1 - p.rearBias * clamp01((110 - ias) / 40) + 0.04 * clamp01((ias - 120) / 40) : 1;
      const h = hBase * bias;
      let target = tCool;
      if (this.running) {
        let qi = Math.pow(Math.max(this.ihpCyl[i], 0) / 45, 0.8) * (1 + dCht(this.r[i]) / 330);
        qi *= 1 + 0.8 * this.deton[i];
        if (this.preign[i]) qi *= 2.4;
        if (timingAdv > 0) qi *= 1 + 0.08 * timingAdv;
        target = tCool + (p.Q0 * qi) / h;
      }
      this.cht[i] = relax(this.cht[i], target, dt, p.tauCht);
      if (this.cht[i] > 600) this.damaged[i] = true;
    }

    // ---------------- oil (§4.10)
    const vern = clamp01((this.oil - 170) / 25);
    const block = F.oilCooler ? 0.3 : 1;
    const hOil = Math.pow(Math.max(mCool, 4) / mRef, 0.7) * (0.85 + 0.15 * cowlOpen);
    const qIn = this.running ? 0.5 * this.fhp + 0.04 * Math.max(0, this.ihp) : 0;
    const qOut = (p.oilKcase + p.oilKc * vern * block) * hOil * (this.oil - tCool) + (this.running ? 0 : 0.02 * (this.oil - env.t));
    this.oil += ((qIn - qOut) / p.oilC) * dt;
    const pBase = this.rpm > 300 ? 25 + 60 * clamp01((this.rpm - 600) / 1800) : 0;
    this.oilPressure = Math.min(115, pBase * (1 + 0.5 * clamp01((160 - this.oil) / 120)) * (sys.oilQty < 4 ? 0.5 : 1));

    // ---------------- carb temperature & ice (§4.11, critique m10)
    const evap = this.running ? 25 * Math.min(1.4, this.rBar / 1.3) : 0;
    const thrCool = this.running ? 30 * clamp01(1 - this.map / pUp) : 0;
    this.crb = tInlet - Math.min(70, evap + thrCool);
    this.carbBody = relax(this.carbBody, this.crb + 0.15 * (this.oil - this.crb), dt, 120);
    this.tPlate = this.crb + 0.1 * (this.carbBody - this.crb); // small heat soak from the sump-mounted carburetor
    if (this.running) {
      const wSat = humidityRatio(satVaporPressure(this.tPlate), Math.max(this.map, 5));
      const condensate = Math.max(0, env.w - wSat);
      // freezing band on the carb-temperature reading: POH yellow arc −15…+5°C (5…41°F) at the probe
      const c = this.tPlate;
      const fz = c < 5 ? clamp01((c + 5) / 10) * 0.5 : c <= 32 ? 1 : c <= 41 ? 1 - (0.7 * (c - 32)) / 9 : 0;
      // throttle-plate icing dominates at part throttle; near wide-open throttle only light (fuel-evaporation) icing
      const partThrottle = 0.15 + 0.85 * clamp01((0.97 - this.map / pUp) / 0.1);
      const accretion = p.iceRate * 4 * this.mdot * condensate * fz * partThrottle;
      let melt = 0;
      if (this.tPlate > 34) melt = Math.min(this.ice, ((this.tPlate - 34) / 1200) * (1 + 2 * heat) * dt);
      this.ice = clamp01(this.ice + accretion * dt - melt);
      this.water = Math.min(0.15, this.water + melt * 1.5);
      if (this.ice > 0.3 && this.rng.next() < 0.0006 * dt) this.ice *= 0.6; // occasional self-shedding (BEA: ~10 min)
    } else if (this.tPlate > 34) this.ice = Math.max(0, this.ice - 0.002 * dt);

    // ---------------- plug fouling (critique M10)
    for (let i = 0; i < N_CYL; i++) {
      const ri = this.r[i];
      const richF = clamp01((ri - 1.1) / 0.2);
      const coldF = clamp01((420 - this.cht[i]) / 170);
      const lowRpm = clamp01((1300 - this.rpm) / 500);
      const hot = clamp01((this.egt[i] - 1150) / 200) * clamp01((this.cht[i] - 250) / 120);
      const leanF = clamp01((1.2 - ri) / 0.15);
      for (let j = 0; j < 2; j++) {
        const sens = i === this.pers.foulCyl && j === 1 ? 2.0 : 1; // the richest cylinder's lower plug fouls first (ASSUMED)
        const dF = this.running ? p.foulRate * richF * coldF * lowRpm * sens - p.clearRate * hot * leanF : 0;
        this.plugF[i][j] = clamp01(this.plugF[i][j] + dF * dt);
      }
    }
  }
}
