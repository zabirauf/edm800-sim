// Fuel and electrical systems of the 177B (plan v2 §4.12).

const relax = (x, target, dt, tau) => x + (target - x) * (1 - Math.exp(-dt / Math.max(1e-6, tau)));

export class Systems {
  constructor() {
    // Fuel: 49 gal usable standard (24.5 per tank) [S2]
    this.tankL = 24.5;
    this.tankR = 24.5;
    this.capacityPerTank = 24.5;
    this.fuelPressure = 0;
    // Electrical: 14 V system, 60 A alternator, 12 V 33 Ah battery, over-voltage trip ≈16 V [S2]
    this.soc = 0.95;
    this.surface = 0.15; // surface charge, V
    this.busV = 12.6;
    this.altOnline = false;
    this.ovTripped = false;
    this.ovTimer = 0;
    this.regRunaway = 0;
    this.loadA = 18;
    this.pol = 0;
    this.oilQty = 8;
  }

  /** ctl: {fuelSelector 'L'|'R'|'BOTH'|'OFF', auxPump, master, alternator, mags}; eng: O360. */
  step(dt, ctl, eng, faults) {
    // ---------------- fuel
    const sel = ctl.fuelSelector;
    const avail = (sel === 'L' && this.tankL > 0.05) || (sel === 'R' && this.tankR > 0.05) || (sel === 'BOTH' && this.tankL + this.tankR > 0.1);
    const pumpOk = (eng.running && !faults.fuelPump) || (ctl.auxPump && ctl.master);
    // High-wing: gravity feed is adequate in flight (R§9); the pump matters for pressure indication and start.
    this.fuelSupply = avail;
    this.fuelPressure = avail ? (pumpOk ? 3.5 + (ctl.auxPump && ctl.master ? 1.5 : 0) : 0.6) : 0;
    const usedGal = (eng.gph / 3600) * dt;
    if (sel === 'L') this.tankL = Math.max(0, this.tankL - usedGal);
    else if (sel === 'R') this.tankR = Math.max(0, this.tankR - usedGal);
    else if (sel === 'BOTH') {
      const both = this.tankL > 0 && this.tankR > 0;
      if (both) {
        this.tankL = Math.max(0, this.tankL - usedGal / 2);
        this.tankR = Math.max(0, this.tankR - usedGal / 2);
      } else if (this.tankL > 0) this.tankL = Math.max(0, this.tankL - usedGal);
      else this.tankR = Math.max(0, this.tankR - usedGal);
    }

    // ---------------- electrical (Thevenin battery, critique m15)
    const master = ctl.master;
    if (faults.overvoltage && this.altOnline) this.regRunaway = Math.min(3.5, this.regRunaway + 0.25 * dt);
    else if (!faults.overvoltage) this.regRunaway = 0;
    const altCan = master && ctl.alternator && !faults.alternator && !this.ovTripped && eng.rpm > 600;
    this.altOnline = altCan;
    const load = master ? this.loadA + (ctl.mags === 'START' ? 150 : 0) + (ctl.auxPump ? 3 : 0) : 0;
    if (this.altOnline) {
      const reg = (eng.rpm > 1000 ? 14.2 : 13.4) + this.regRunaway;
      this.busV = relax(this.busV, reg, dt, 1.5);
      if (this.busV > 14 && this.soc < 1) this.soc = Math.min(1, this.soc + (20 / 3600 / 33) * dt);
      this.surface = relax(this.surface, 0.25, dt, 120);
      this.pol = relax(this.pol, 0, dt, 60);
      if (this.busV > 16.4) this.ovTimer += dt;
      else this.ovTimer = 0;
      if (this.ovTimer > 1.5) this.ovTripped = true; // over-voltage relay trips the alternator off-line
    } else {
      const ocv = 11.9 + 0.75 * this.soc;
      this.surface = relax(this.surface, 0, dt, 180);
      // internal resistance 15 mΩ + slow polarization (≈20 mΩ, τ 2 min): cranks at ≈10 V, a 18 A load reaches
      // ≤12.0 V within minutes of the alternator going off-line
      this.pol = relax(this.pol, master ? Math.min(load, 40) * 0.02 : 0, dt, 120);
      const target = master ? ocv + this.surface - load * 0.015 - this.pol : ocv + this.surface;
      this.busV = relax(this.busV, target, dt, 1.0);
      if (master) this.soc = Math.max(0, this.soc - (load / 3600 / 33) * dt);
    }
    this.starterPower = master && ctl.mags === 'START' && this.busV > 9.5 && this.soc > 0.15;
    this.oilQty = faults.lowOil ? 4 : 8;
    this.fuelTotal = this.tankL + this.tankR;
  }
}
