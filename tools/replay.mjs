// EDM log-replay harness (plan v2 §9, critique M4).
//
// Drives the O-360 model with the operating point recorded in a JPI EDM data export (RPM, MAP, fuel flow, and
// optionally altitude/IAS/OAT) and compares the model's EGT/CHT/OIL against the recorded ones. This is how the
// ASSUMED thermal values (E0/E1, Q0, tauCht, cooling terms, distribution) get replaced by real Cardinal data.
//
// Usage:  node tools/replay.mjs flight.csv [--interval 6] [--json report.json]
// CSV columns (case-insensitive; EzTrends/EzPlot exports use these names): E1..E4, C1..C4, OIL, OAT, CRB, FF, RPM,
// MAP, and optionally ALT (ft), IAS (kt), TIME (s since start). Rows are assumed `--interval` seconds apart when TIME
// is absent.

import { readFileSync, writeFileSync } from 'node:fs';
import { Simulation } from '../src/sim/index.js';
import { GOV, startEngine } from '../src/sim/pilot.js';
import { KT } from '../src/sim/airframe.js';

export function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));
  const header = lines[0].split(',').map((h) => h.trim().toUpperCase());
  return lines.slice(1).map((l) => {
    const cells = l.split(',');
    const row = {};
    header.forEach((h, i) => {
      const v = Number(cells[i]);
      if (!Number.isNaN(v)) row[h] = v;
    });
    return row;
  });
}

/** Replay rows; returns per-channel RMS / bias and the paired traces. */
export function replay(rows, { interval = 6, seed = 1, params = {}, isaDev = 0 } = {}) {
  const sim = new Simulation({ seed, params });
  sim.env.isaDev = isaDev;
  startEngine(sim);
  const f = sim.flight;
  f.setMode('level');
  const out = [];
  // converge on the first logged operating point, then settle the temperatures there
  const follow = (row, seconds) => {
    if (row.ALT != null) f.alt = row.ALT;
    if (row.OAT != null) sim.env.isaDev = row.OAT - (59 - 3.57 * (f.alt / 1000));
    if (row.RPM != null) sim.ctl.prop = Math.min(1, Math.max(0, GOV(row.RPM)));
    for (let k = 0; k < Math.round(seconds / 0.05); k++) {
      if (row.MAP != null) sim.ctl.throttle = Math.min(1, Math.max(0, sim.ctl.throttle + (row.MAP - sim.engine.map) * 0.004));
      if (row.FF != null && row.FF > 1) sim.ctl.mixture = Math.min(1, Math.max(0.05, sim.ctl.mixture + (row.FF - sim.engine.gph) * 0.0015));
      if (row.IAS != null) f.tas = (row.IAS * KT) / Math.sqrt(sim.atm.sigma);
      sim.step(0.05);
      if (row.ALT != null) f.alt = row.ALT;
    }
  };
  if (rows.length) {
    follow(rows[0], 120);
    sim.settle(600);
    follow(rows[0], 30);
  }
  let tPrev = rows[0]?.TIME ?? 0;
  for (const row of rows) {
    const dt = row.TIME != null ? Math.max(0.5, row.TIME - tPrev) : interval;
    tPrev = row.TIME ?? tPrev + dt;
    if (row.ALT != null) f.alt = row.ALT;
    if (row.OAT != null) sim.env.isaDev = row.OAT - (59 - 3.57 * (f.alt / 1000));
    if (row.RPM != null) sim.ctl.prop = Math.min(1, Math.max(0, GOV(row.RPM)));
    const steps = Math.round(dt / 0.05);
    for (let k = 0; k < steps; k++) {
      // follow the logged operating point: throttle → MAP, mixture → fuel flow
      if (row.MAP != null) sim.ctl.throttle = Math.min(1, Math.max(0, sim.ctl.throttle + (row.MAP - sim.engine.map) * 0.004));
      if (row.FF != null && row.FF > 1) sim.ctl.mixture = Math.min(1, Math.max(0.05, sim.ctl.mixture + (row.FF - sim.engine.gph) * 0.0015));
      if (row.IAS != null) f.tas = (row.IAS * KT) / Math.sqrt(sim.atm.sigma);
      sim.step(0.05);
      if (row.ALT != null) f.alt = row.ALT;
    }
    out.push({
      log: { egt: [row.E1, row.E2, row.E3, row.E4], cht: [row.C1, row.C2, row.C3, row.C4], oil: row.OIL },
      model: { egt: [...sim.engine.egtProbe], cht: [...sim.engine.cht], oil: sim.engine.oil, map: sim.engine.map, gph: sim.engine.gph },
    });
  }
  const stat = (get) => {
    const d = out.flatMap((o) => get(o)).filter(([a, b]) => a != null && b != null).map(([a, b]) => b - a);
    if (!d.length) return null;
    const bias = d.reduce((s, x) => s + x, 0) / d.length;
    const rms = Math.sqrt(d.reduce((s, x) => s + x * x, 0) / d.length);
    return { n: d.length, bias, rms };
  };
  return {
    egt: stat((o) => o.log.egt.map((v, i) => [v, o.model.egt[i]])),
    cht: stat((o) => o.log.cht.map((v, i) => [v, o.model.cht[i]])),
    oil: stat((o) => [[o.log.oil, o.model.oil]]),
    traces: out,
  };
}

if (process.argv[1] && process.argv[1].endsWith('replay.mjs')) {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node tools/replay.mjs flight.csv [--interval 6] [--json report.json]');
    process.exit(1);
  }
  const arg = (name, dflt) => {
    const i = process.argv.indexOf(name);
    return i > 0 ? process.argv[i + 1] : dflt;
  };
  const rows = parseCsv(readFileSync(file, 'utf8'));
  const rep = replay(rows, { interval: Number(arg('--interval', 6)) });
  for (const k of ['egt', 'cht', 'oil']) {
    const s = rep[k];
    console.log(`${k.toUpperCase().padEnd(4)} ${s ? `n=${s.n} bias ${s.bias.toFixed(1)}°F rms ${s.rms.toFixed(1)}°F` : 'no data'}`);
  }
  const json = arg('--json', null);
  if (json) writeFileSync(json, JSON.stringify(rep, null, 2));
}
