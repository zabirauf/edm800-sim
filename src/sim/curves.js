// Mixture curves per cylinder as functions of r = FAR / FAR_peak (r = 1 at peak EGT, r > 1 rich).
// Base: Lycoming Fig 3-1 (FIG_3_1 in data/tables.js) with the r ↔ ΔEGT mapping from the plan (§4.4–4.5):
//  - lean of peak, power ∝ fuel: r = power/96.5 for the Fig 3-1 LOP rows;
//  - rich of peak, ≈1000°F per unit r beyond the rounded peak (r̄ 1.05 ≈ 50 ROP, 1.10 ≈ 100 ROP);
//  - extended to r = 1.8 (critique M6, ASSUMED): power ≈88 % at r 1.6 (with POH 13 % full-heat loss as a check).

/** Fritsch–Carlson monotone cubic interpolator over sorted xs. Clamps outside the range. */
export function monotoneCubic(xs, ys) {
  const n = xs.length;
  const d = [];
  const m = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1]
    );
  };
}

// r, ΔEGT (°F vs peak), brake power (% of best power), ΔCHT (°F vs CHT peak)
export const MIXTURE_TABLE = [
  [0.7, -240, 72.5, -95], // below Fig 3-1 range: power ∝ fuel, ASSUMED trend
  [0.8, -160, 82.9, -78],
  [0.88, -95, 85.0, -64],
  [0.922, -64, 89.0, -53], // Fig 3-1 LOP rows (r = power/96.5)
  [0.949, -45, 91.6, -42],
  [0.968, -26, 93.4, -32],
  [0.982, -10, 94.8, -22],
  [1.0, 0, 96.5, -11], // peak EGT
  [1.03, -25, 98.0, 0], // CHT peak ≈ 25 ROP
  [1.05, -50, 98.9, -3],
  [1.087, -83, 99.6, -9],
  [1.115, -110, 99.9, -14],
  [1.145, -140, 100.0, -20], // centre of the best-power range
  [1.275, -270, 98.4, -44],
  [1.335, -330, 97.0, -53],
  [1.395, -390, 95.0, -58], // Fig 3-1 "full rich take-off"
  [1.6, -600, 88.0, -80], // extension (critique M6), ASSUMED
  [1.8, -800, 78.0, -100],
];
// The 0.88 row keeps the LOP power curve monotone (85 % at 0.88 ≈ 0.88·96.5).
MIXTURE_TABLE[2][2] = 0.88 * 96.5;

const R = MIXTURE_TABLE.map((row) => row[0]);
const egtFn = monotoneCubic(R, MIXTURE_TABLE.map((row) => row[1]));
const powFn = monotoneCubic(R, MIXTURE_TABLE.map((row) => row[2]));
const chtFn = monotoneCubic(R, MIXTURE_TABLE.map((row) => row[3]));

/** ΔEGT (°F) relative to the cylinder's peak EGT. */
export const dEgt = (r) => egtFn(r);
/** Brake power as % of best power (Fig 3-1 is a brake-power chart). */
export const brakePowerPct = (r) => powFn(r);
/** ΔCHT (°F) relative to the CHT peak. */
export const dCht = (r) => chtFn(r);

/** Indicated-power factor: Fig 3-1 brake % converted at the chart's reference (BHP/IHP ≈ 0.85; critique m6). */
export const indicatedFactor = (r) => 1 - (1 - brakePowerPct(r) / 100) * 0.85;

/** Smooth logistic. */
export const logistic = (x) => 1 / (1 + Math.exp(-x));
