// Cessna 177B point-mass performance model (plan v2 §4.13).
// Geometry: wing 174 ft², span 35.5 ft (type data). Oswald e = 0.75 is ASSUMED (typical high-wing single); CD0 and the
// propeller-efficiency scale are fitted to the POH cruise KTAS cells by tools/fit.mjs.

export const KT = 1.68781; // ft/s per knot
export const G = 32.174;
export const RHO0 = 0.0023769; // slug/ft³
export const S_WING = 174;
export const SPAN = 35.5;
export const AR = (SPAN * SPAN) / S_WING;
export const PROP_D = 76 / 12; // ft

/** Propulsive efficiency vs advance ratio J (generic constant-speed shape, scaled by etaMax). */
export function propEfficiency(J, etaMax) {
  const shape = 1 - ((J - 0.85) / 0.95) ** 2;
  return Math.max(0.05, etaMax * Math.min(1, shape));
}

/** Thrust (lbf) from shaft power (HP) at TAS (ft/s) and RPM; static limit 3.4 lbf/HP (ASSUMED). */
export function thrust(bhp, tasFps, rpm, etaMax) {
  if (bhp <= 0) return (bhp * 550) / Math.max(tasFps, 30); // negative: windmilling drag
  const n = Math.max(rpm, 300) / 60;
  const J = tasFps / (n * PROP_D);
  const tProp = (propEfficiency(J, etaMax) * bhp * 550) / Math.max(tasFps, 1);
  return Math.min(tProp, 3.4 * bhp);
}

/** Drag (lbf) at TAS (ft/s), density ratio, weight, flight-path angle, flaps 0..1. */
export function drag(tasFps, sigma, weight, cd0, e, flaps = 0, gamma = 0, onGround = false) {
  const q = 0.5 * RHO0 * sigma * tasFps * tasFps;
  if (q < 1e-3) return 0;
  // ground roll: ground-attitude lift coefficient; in flight: weight-supporting CL, capped near stall
  const cl = onGround ? 0.35 + 0.4 * flaps : Math.min(1.7, (weight * Math.cos(gamma)) / (q * S_WING));
  const cd = cd0 + 0.045 * flaps + (cl * cl) / (Math.PI * e * AR);
  return q * S_WING * cd;
}

/** High-speed level-flight TAS (ft/s) for a given shaft power; null if no level solution. */
export function levelTas(bhp, rpm, sigma, weight, af) {
  const excess = (v) => thrust(bhp, v, rpm, af.etaMax) - drag(v, sigma, weight, af.cd0, af.e);
  let hi = 330;
  let lo = null;
  for (let v = hi; v > 60; v -= 2) {
    if (excess(v) > 0) {
      lo = v;
      break;
    }
    hi = v;
  }
  if (lo == null) return null;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (excess(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Rate of climb (fpm) at an indicated airspeed (kt). */
export function rateOfClimb(bhp, rpm, kias, sigma, weight, af) {
  const v = (kias * KT) / Math.sqrt(sigma);
  const t = thrust(bhp, v, rpm, af.etaMax);
  const d = drag(v, sigma, weight, af.cd0, af.e);
  return (((t - d) * v) / weight) * 60;
}
