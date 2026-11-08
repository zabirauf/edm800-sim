// Fits the O-360 / 177B model to published data (plan v2 §4.0) and writes src/sim/fitted.js.
//
// Engine (Levenberg–Marquardt, 6 parameters): eta0, eta1 (volumetric efficiency level/slope), Ki (indicated HP per lb/s
// air at best power), f1, f2 (friction HP), delta (indicated − dry MAP offset). Data:
//   - POH Fig 5-7 ISA cells on the 2000/6000/10000 ft sheets: %BHP at recommended lean (r̄ 1.05) and GPH.
//   - Lycoming Fig 3-42 sea-level lines (dry MAP, maximum-power mixture r 1.145).
// Hold-out: 4000/8000/12000 ft sheets. FAR_peak (0.067) and the √T exponent are fixed (not fitted).
// Then: throttle-body areas, full-rich carburetor ratio for the take-off flow personality, prop constant, airframe.

import { writeFileSync } from 'node:fs';
import { POH_CRUISE } from '../src/sim/data/poh-cruise.js';
import { LYC_SL_LINES, LYC_FT_ALT, LYC_FT_MAP, FIG_3_39, POH_ROC } from '../src/sim/data/tables.js';
import { steadyPower, engineAirflow, exhaustPressure, orificeFlow, solveMap } from '../src/sim/engineCore.js';
import { isaPressure, isaTempF, cToF, atmosphere } from '../src/sim/atmosphere.js';
import { levelTas, rateOfClimb, KT } from '../src/sim/airframe.js';

const R_POH = 1.05; // POH recommended lean on the mean mixture (critique B1)
const R_BEST = 1.145; // Lycoming chart "maximum power mixture"
const FIT_ALTS = new Set([2000, 6000, 10000]);
// Friction fixed from typical O-360 FMEP (≈15–18 psi): FHP ≈ 22 HP at 2700, 13 HP at 2000 (ASSUMED-typical, critique M2:
// the POH fuel flows assume ~constant BSFC and cannot identify friction).
const F1 = 1.79;
const F2 = 2.354;
// Reconciliation (critique M1 option b): the engine follows the Lycoming chart (dry MAP = indicated − vapor pressure;
// δ = 0 on a dry ISA day); the POH %BHP labels are compared through one scale factor kPOH (≈1.04 expected);
// POH GPH (airflow) and KTAS (airframe) are matched directly.
const NAMES = ['eta0', 'eta1', 'Ki', 'kPOH', 'cr'];
const RANGES = { eta0: [0.8, 0.98], eta1: [-0.1, 0.05], Ki: [500, 800], kPOH: [0.95, 1.1], cr: [0.03, 0.2] };

const cells = POH_CRUISE.filter((c) => c.isaDev === 0);
const fitCells = cells.filter((c) => FIT_ALTS.has(c.alt));
const holdCells = cells.filter((c) => !FIT_ALTS.has(c.alt));
const lycPts = [];
for (const [rpm, { a, b }] of Object.entries(LYC_SL_LINES)) {
  for (let map = 18; map <= 28; map += 1) lycPts.push({ rpm: Number(rpm), mapDry: map, bhp: a + b * (map - 20.27) });
}

// Full-throttle points: dry MAP ≈ 0.96·P_amb (2700) / 0.97·P_amb (2200) and the chart HP at that altitude.
const lycAltPts = [];
for (const N of [2700, 2200]) {
  LYC_FT_ALT.alts.forEach((alt, i) => {
    if (alt === 0) return;
    lycAltPts.push({ rpm: N, alt, mapDry: (N === 2700 ? 0.96 : 0.97) * isaPressure(alt), bhp: LYC_FT_ALT[N][i] });
  });
}
const toP = (v) => ({ ...Object.fromEntries(NAMES.map((n, i) => [n, v[i]])), f1: F1, f2: F2, delta: 0 });
function pohModel(c, p) {
  return steadyPower({ N: c.rpm, mapInd: c.mp, tInletF: cToF(c.oatC), pAmb: isaPressure(c.alt), r: R_POH, p });
}
function residuals(v) {
  const p = toP(v);
  const res = [];
  for (const c of fitCells) {
    const m = pohModel(c, p);
    res.push(((m.bhp / 180) * 100 * p.kPOH - c.pct) / 1.0);
    res.push((m.gph - c.gph) / 0.15);
  }
  for (const L of lycPts) {
    const m = steadyPower({ N: L.rpm, mapInd: L.mapDry + p.delta, tInletF: 59, pAmb: 29.92, r: R_BEST, p });
    res.push((m.bhp - L.bhp) / 2.0);
  }
  // Lycoming altitude effect: full-throttle HP at altitude for the full-throttle MAP there (R§3.2/3.3).
  for (const A of lycAltPts) {
    const m = steadyPower({ N: A.rpm, mapInd: A.mapDry, tInletF: isaTempF(A.alt), pAmb: isaPressure(A.alt), r: R_BEST, p });
    res.push((m.bhp - A.bhp) / 2.0);
  }
  return res;
}

function lm(v0) {
  let v = [...v0];
  let lambda = 1e-2;
  let r = residuals(v);
  let cost = r.reduce((s, x) => s + x * x, 0);
  for (let it = 0; it < 200; it++) {
    const J = r.map(() => new Array(v.length).fill(0));
    for (let j = 0; j < v.length; j++) {
      const h = Math.max(1e-6, Math.abs(v[j]) * 1e-5);
      const vp = [...v];
      vp[j] += h;
      const rp = residuals(vp);
      for (let i = 0; i < r.length; i++) J[i][j] = (rp[i] - r[i]) / h;
    }
    const n = v.length;
    const A = Array.from({ length: n }, () => new Array(n).fill(0));
    const g = new Array(n).fill(0);
    for (let i = 0; i < r.length; i++) {
      for (let a = 0; a < n; a++) {
        g[a] += J[i][a] * r[i];
        for (let b = 0; b < n; b++) A[a][b] += J[i][a] * J[i][b];
      }
    }
    const step = solve(A.map((row, a) => row.map((x, b) => (a === b ? x * (1 + lambda) : x))), g.map((x) => -x));
    const vn = v.map((x, i) => x + step[i]);
    const rn = residuals(vn);
    const cn = rn.reduce((s, x) => s + x * x, 0);
    if (cn < cost) {
      const done = cost - cn < 1e-9 * cost;
      v = vn;
      r = rn;
      cost = cn;
      lambda /= 3;
      if (done) break;
    } else lambda *= 4;
  }
  // standard errors from (JᵀJ)⁻¹ · σ²
  const n = v.length;
  const J = r.map(() => new Array(n).fill(0));
  for (let j = 0; j < n; j++) {
    const h = Math.max(1e-6, Math.abs(v[j]) * 1e-5);
    const vp = [...v];
    vp[j] += h;
    const rp = residuals(vp);
    for (let i = 0; i < r.length; i++) J[i][j] = (rp[i] - r[i]) / h;
  }
  const A = Array.from({ length: n }, (_, a) => Array.from({ length: n }, (_, b) => J.reduce((s, row) => s + row[a] * row[b], 0)));
  const inv = invert(A);
  const s2 = cost / Math.max(1, r.length - n);
  const se = inv.map((row, i) => Math.sqrt(Math.abs(row[i] * s2)));
  return { v, se, cost };
}

function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}
function invert(A) {
  const n = A.length;
  return Array.from({ length: n }, (_, j) => solve(A, Array.from({ length: n }, (_, i) => (i === j ? 1 : 0))))
    .reduce((acc, col, j) => {
      col.forEach((x, i) => (acc[i][j] = x));
      return acc;
    }, Array.from({ length: n }, () => new Array(n).fill(0)));
}

const rms = (xs) => Math.sqrt(xs.reduce((s, x) => s + x * x, 0) / xs.length);
const maxAbs = (xs) => Math.max(...xs.map(Math.abs));

// ------------------------------------------------------------------ engine fit
const fit = lm([0.9, -0.02, 650, 1.0, 0.095]);
const P = toP(fit.v);
console.log('\n== Engine fit');
NAMES.forEach((n, i) => {
  const [lo, hi] = RANGES[n];
  const ok = P[n] >= lo && P[n] <= hi;
  console.log(`  ${n.padEnd(6)} = ${P[n].toFixed(4).padStart(10)} ± ${fit.se[i].toFixed(4)}   range [${lo}, ${hi}] ${ok ? 'ok' : 'OUT OF RANGE'}`);
});
function report(label, set) {
  const dp = set.map((c) => (pohModel(c, P).bhp / 180) * 100 * P.kPOH - c.pct);
  const dg = set.map((c) => pohModel(c, P).gph - c.gph);
  console.log(`  ${label}: n=${set.length}  %BHP RMS ${rms(dp).toFixed(2)} max ${maxAbs(dp).toFixed(2)}  |  GPH RMS ${rms(dg).toFixed(3)} max ${maxAbs(dg).toFixed(2)}`);
  return { pctRms: rms(dp), pctMax: maxAbs(dp), gphRms: rms(dg), gphMax: maxAbs(dg) };
}
const stats = {
  fit: report('fit sheets (2/6/10k) ISA', fitCells),
  holdout: report('hold-out (4/8/12k) ISA ', holdCells),
  allTemps: report('all 462 cells (√T check)', POH_CRUISE),
};
const lycErr = lycPts.map((L) => steadyPower({ N: L.rpm, mapInd: L.mapDry + P.delta, tInletF: 59, pAmb: 29.92, r: R_BEST, p: P }).bhp - L.bhp);
console.log(`  Lycoming SL lines: HP RMS ${rms(lycErr).toFixed(2)} max ${maxAbs(lycErr).toFixed(2)}`);
stats.lycoming = { hpRms: rms(lycErr), hpMax: maxAbs(lycErr) };

// ------------------------------------------------------------------ throttle body
// Full-throttle dry MAP = 0.96·P_amb at 2700 (zero ram) — R§3.3. Solve A_max with r at full rich.
function demandFn(N, pAmb, tF, p) {
  return (mapInd) => {
    let m = engineAirflow(N, mapInd, tF, pAmb, p);
    return engineAirflow(N, mapInd, tF, exhaustPressure(pAmb, m), p);
  };
}
function mapAt(area, N, pAmb, tF) {
  return solveMap(area, pAmb, tF, demandFn(N, pAmb, tF, P));
}
let aLo = 0.005;
let aHi = 0.2;
const targetFT = 0.96 * 29.92 + P.delta;
for (let k = 0; k < 60; k++) {
  const mid = (aLo + aHi) / 2;
  if (mapAt(mid, 2700, 29.92, 59) < targetFT) aLo = mid;
  else aHi = mid;
}
const A_MAX = (aLo + aHi) / 2;
// Idle bypass: closed throttle at 650 RPM → ≈11.5 inHg indicated (ASSUMED typical 10–13).
aLo = 1e-5;
aHi = 0.01;
for (let k = 0; k < 60; k++) {
  const mid = (aLo + aHi) / 2;
  if (mapAt(mid, 650, 29.92, 59) < 11.5) aLo = mid;
  else aHi = mid;
}
const A_IDLE = (aLo + aHi) / 2;
console.log(`\n== Throttle body: A_max ${A_MAX.toFixed(5)} ft², A_idle ${A_IDLE.toFixed(6)} ft²`);
const ftChecks = LYC_FT_MAP.map(([mapDry, alt2700, alt2200]) => {
  const m27 = mapAt(A_MAX, 2700, isaPressure(alt2700), isaTempF(alt2700)) - P.delta;
  const m22 = mapAt(A_MAX, 2200, isaPressure(alt2200), isaTempF(alt2200)) - P.delta;
  return [mapDry, m27, m22];
});
ftChecks.forEach(([md, a, b]) => console.log(`  FT dry MAP target ${md}: model 2700 ${a.toFixed(2)}  2200 ${b.toFixed(2)}`));
stats.ftMapMax = maxAbs(ftChecks.flatMap(([md, a, b]) => [a - md, b - md]));

// Lycoming full-throttle HP vs altitude shape (normalized)
const ftAlt = [2700, 2400, 2200, 2000].map((N) => {
  const hp = LYC_FT_ALT.alts.map((alt) => {
    const pA = isaPressure(alt);
    const m = mapAt(A_MAX, N, pA, isaTempF(alt));
    return steadyPower({ N, mapInd: m, tInletF: isaTempF(alt), pAmb: pA, r: R_BEST, p: P }).bhp;
  });
  const ratioErr = hp.map((h, i) => h / hp[0] - LYC_FT_ALT[N][i] / LYC_FT_ALT[N][0]);
  return { N, hp, maxRatioErr: maxAbs(ratioErr) };
});
ftAlt.forEach((x) => console.log(`  FT HP vs alt ${x.N}: ${x.hp.map((h) => h.toFixed(0)).join(' ')}  max ratio err ${(x.maxRatioErr * 100).toFixed(1)}%`));
stats.ftAltMaxRatioErr = Math.max(...ftAlt.map((x) => x.maxRatioErr));

// Fig 3-39 peak-EGT flow check: find the MAP at 2400 RPM SL that gives each %power at r = 1.0
const rpmFor = (pct) => (pct >= 75 ? 2450 : pct >= 65 ? 2350 : pct >= 55 ? 2250 : 2100); // Lycoming op. conditions
const fig39 = FIG_3_39.map(([pct, gph]) => {
  let lo = 10;
  let hi = 29;
  const N = rpmFor(pct);
  for (let k = 0; k < 50; k++) {
    const mid = (lo + hi) / 2;
    if (steadyPower({ N, mapInd: mid, tInletF: 59, pAmb: 29.92, r: 1.0, p: P }).bhp < (pct / 100) * 180) lo = mid;
    else hi = mid;
  }
  const m = steadyPower({ N, mapInd: lo, tInletF: 59, pAmb: 29.92, r: 1.0, p: P });
  return [pct, gph, m.gph];
});
fig39.forEach(([pct, g, m]) => console.log(`  Fig 3-39 ${pct}%: ${g} GPH, model ${m.toFixed(2)}`));
stats.fig39Max = maxAbs(fig39.filter(([pct]) => pct >= 60).map(([, g, m]) => m - g));
stats.fig39MaxAll = maxAbs(fig39.map(([, g, m]) => m - g));

// ------------------------------------------------------------------ full-rich carburetor ratio (FOCA-based personality)
const wotSL = mapAt(A_MAX, 2700, 29.92, 59);
const mdotWot = steadyPower({ N: 2700, mapInd: wotSL, tInletF: 59, pAmb: 29.92, r: 1.36, p: P }).mdot;
const R_FR_WOT = (17.3 * 6) / 3600 / (0.067 * mdotWot);
console.log(`\n== Carburetor: WOT SL MAP ${wotSL.toFixed(2)} in, airflow ${mdotWot.toFixed(3)} lb/s → r_FR(WOT) for 17.3 GPH = ${R_FR_WOT.toFixed(3)}`);

// ------------------------------------------------------------------ airframe: CD0, etaMax to POH KTAS (fit sheets)
const E_OSWALD = 0.75;
const cellBhp = new Map(POH_CRUISE.map((c) => [c, pohModel(c, P).bhp]));
function ktasErr(af, set) {
  return set.map((c) => {
    const a = atmosphere(c.alt, cToF(c.oatC) - isaTempF(c.alt));
    const v = levelTas(cellBhp.get(c), c.rpm, a.sigma, 2500, af);
    return v == null ? 50 : v / KT - c.ktas;
  });
}
// Joint fit to POH KTAS (fit sheets) and Fig 5-5 ROC (separates CD0 from the prop-efficiency scale, critique M2).
function climbBhp(row) {
  const a = atmosphere(row.alt, 0);
  const tas = (row.kias * KT) / Math.sqrt(a.sigma);
  const q = 0.5 * 0.0023769 * a.sigma * tas * tas;
  const pUp = a.p + (0.65 * q) / 70.726; // ram recovery k_ram 0.65
  const m = solveMap(A_MAX, pUp, a.t, demandFn(2700, a.p, a.t, P));
  const rFr = R_FR_WOT * Math.sqrt(1 / a.sigma);
  const r = row.alt < 3000 ? rFr : R_BEST; // POH: full rich below 3000 ft, leaned for max power above
  return { a, bhp: steadyPower({ N: 2700, mapInd: m, tInletF: a.t, pAmb: a.p, r, p: P }).bhp };
}
function pohRocIsa(row) {
  const isaC = 15 - 2 * (row.alt / 1000);
  const temps = Object.keys(row.roc).map(Number).sort((x, y) => x - y);
  let lo = temps[0];
  for (const t of temps) if (t <= isaC) lo = t;
  const hi = temps.find((t) => t >= isaC) ?? lo;
  return hi === lo ? row.roc[lo] : row.roc[lo] + ((row.roc[hi] - row.roc[lo]) * (isaC - lo)) / (hi - lo);
}
const climbData = POH_ROC.map((row) => ({ row, poh: pohRocIsa(row), ...climbBhp(row) }));
let best = null;
for (let cd0 = 0.018; cd0 <= 0.045; cd0 += 0.0005) {
  for (let em = 0.6; em <= 0.95; em += 0.005) {
    const af = { cd0, etaMax: em, e: E_OSWALD };
    const ek = ktasErr(af, fitCells);
    const er = climbData.map((c) => (rateOfClimb(c.bhp, 2700, c.row.kias, c.a.sigma, 2500, af) - c.poh) / 15);
    const err = Math.sqrt((ek.reduce((s, x) => s + x * x, 0) + er.reduce((s, x) => s + x * x, 0)) / (ek.length + er.length));
    if (!best || err < best.err) best = { cd0, etaMax: em, err };
  }
}
const AF = { cd0: Number(best.cd0.toFixed(4)), etaMax: Number(best.etaMax.toFixed(3)), e: E_OSWALD };
const kf = ktasErr(AF, fitCells);
const kh = ktasErr(AF, holdCells);
// worst-case error only for cells ≥ 50 % power: below that the cells sit on the flat part of the power-required
// curve, where ±2 % power moves speed ±5 kt (ill-conditioned for a max test; RMS still covers every cell)
const kh50 = ktasErr(AF, holdCells.filter((c) => c.pct >= 50));
const kf50 = ktasErr(AF, fitCells.filter((c) => c.pct >= 50));
console.log(`\n== Airframe: CD0 ${AF.cd0}, etaMax ${AF.etaMax}, e ${AF.e}`);
console.log(`  KTAS fit RMS ${rms(kf).toFixed(2)} max ${maxAbs(kf).toFixed(2)} | hold-out RMS ${rms(kh).toFixed(2)} max ${maxAbs(kh).toFixed(2)}`);
stats.ktas = { fitRms: rms(kf), fitMax: maxAbs(kf), holdRms: rms(kh), holdMax: maxAbs(kh), fitMax50: maxAbs(kf50), holdMax50: maxAbs(kh50) };

// ROC check vs Fig 5-5 (ISA column ≈ 0°C … use the column nearest ISA by interpolation on temperature)
const rocRows = climbData.map((c) => ({ alt: c.row.alt, poh: c.poh, bhp: c.bhp, model: rateOfClimb(c.bhp, 2700, c.row.kias, c.a.sigma, 2500, AF) }));
rocRows.forEach((x) => console.log(`  ROC ${x.alt} ft: POH ${x.poh.toFixed(0)} model ${x.model.toFixed(0)} fpm (BHP ${x.bhp.toFixed(0)})`));
stats.rocMax = maxAbs(rocRows.map((x) => x.model - x.poh));

const out = `// Generated by tools/fit.mjs on ${new Date().toISOString().slice(0, 10)} — do not edit by hand. Re-run: node tools/fit.mjs
export const FIT = ${JSON.stringify({
  engine: { ...Object.fromEntries(NAMES.map((n) => [n, Number(P[n].toFixed(5))])), f1: F1, f2: F2, delta: 0 },
  engineSE: Object.fromEntries(NAMES.map((n, i) => [n, Number(fit.se[i].toFixed(5))])),
  throttle: { aMax: A_MAX, aIdle: A_IDLE },
  carb: { rFrWot: Number(R_FR_WOT.toFixed(4)) },
  airframe: AF,
  stats,
}, null, 2)};
`;
writeFileSync(new URL('../src/sim/fitted.js', import.meta.url), out);
console.log('\nwrote src/sim/fitted.js');
