// Pure physics core of the O-360 model (plan v2 §4.0–4.4). Shared by the runtime engine and the fitting tool.
// Units: pressure inHg, temperature °F, mass flow lb/s, power HP, RPM.

import { INHG_TO_PSF, R_AIR, fToR } from './atmosphere.js';
import { indicatedFactor } from './curves.js';

export const VD_FT3 = 361 / 1728; // displacement per revolution pair (4-stroke: Vd per 2 rev)
export const FAR_PEAK = 0.067; // fixed: 100LL stoichiometric (critique M2)
export const C_RESID = 0.095; // residual-gas coefficient ≈ 1/(γ·(CR−1)) (physical estimate; fitted value in fitted.js)
export const T_REF_R = fToR(59);
export const LB_PER_GAL = 6.0;
export const GC = 32.174;
export const GAMMA = 1.4;
export const K_EXH = 0.6; // exhaust-system back-pressure at reference flow, inHg (ASSUMED)
export const M_REF = 0.33; // reference airflow (≈ 2700 RPM WOT SL), lb/s

export function etaV(N, p) {
  return p.eta0 + p.eta1 * ((N - 2400) / 1000);
}

/** Effective (dry, chart-equivalent) manifold pressure from the indicated MAP (§4.0). */
export function mapEffective(mapInd, p, pvExcess = 0) {
  return mapInd - p.delta - pvExcess;
}

/** Engine air demand (lb/s, all cylinders) — speed-density with residual-gas term and √T rule (x = 0.5). */
export function engineAirflow(N, mapInd, tChargeF, pExh, p, pvExcess = 0) {
  const me = Math.max(0.5, mapEffective(mapInd, p, pvExcess));
  const resid = Math.max(0.3, 1 - (p.cr ?? C_RESID) * (pExh / me - 1));
  const ideal = (me * INHG_TO_PSF * VD_FT3 * (N / 120)) / (R_AIR * T_REF_R);
  return etaV(N, p) * resid * ideal * Math.sqrt(T_REF_R / fToR(tChargeF));
}

export function exhaustPressure(pAmb, mdot) {
  return pAmb + K_EXH * (mdot / M_REF) ** 2;
}

export function pumpingHp(N, mapInd, pExh, p, pvExcess = 0) {
  const me = mapEffective(mapInd, p, pvExcess);
  return ((pExh - me) * INHG_TO_PSF * VD_FT3 * (N / 120)) / 550;
}

export const ACCESSORY_HP = 2.5; // alternator, vacuum pump, oil pump (ASSUMED typical)

export function frictionHp(N, p, coldFactor = 0) {
  const k = N / 1000;
  return (p.f1 * k + p.f2 * k * k) * (1 + coldFactor) + (N > 100 ? ACCESSORY_HP : 0);
}

/**
 * Steady-state brake HP and fuel flow for uniform mixture r (used by the fits and the trim checks).
 * Returns { bhp, ihp, fhp, php, mdot, gph }.
 */
export function steadyPower({ N, mapInd, tInletF, pAmb, r, p, pvExcess = 0 }) {
  let mdot = engineAirflow(N, mapInd, tInletF, pAmb, p, pvExcess);
  let pExh = exhaustPressure(pAmb, mdot);
  mdot = engineAirflow(N, mapInd, tInletF, pExh, p, pvExcess);
  pExh = exhaustPressure(pAmb, mdot);
  const ihp = p.Ki * mdot * indicatedFactor(r);
  const fhp = frictionHp(N, p);
  const php = pumpingHp(N, mapInd, pExh, p, pvExcess);
  return { bhp: ihp - fhp - php, ihp, fhp, php, mdot, gph: fuelGph(mdot, r) };
}

export function fuelGph(mdot, r) {
  return (mdot * FAR_PEAK * r * 3600) / LB_PER_GAL;
}

// ------------------------------------------------------------------ throttle body

/** Butterfly open area fraction for lever position 0..1 (plate angle from closed). */
export function throttleAreaFraction(lever) {
  const phi = Math.max(0, Math.min(1, lever)) * (Math.PI / 2);
  return 1 - Math.cos(phi);
}

/** Compressible orifice mass flow (lb/s). area ft², pressures inHg, temperature °F. */
export function orificeFlow(areaFt2, pUp, tUpF, pDown) {
  if (areaFt2 <= 0 || pUp <= 0) return 0;
  const pr = Math.max(0.528, Math.min(1, pDown / pUp)); // choked below the critical ratio
  const term = Math.pow(pr, 2 / GAMMA) - Math.pow(pr, (GAMMA + 1) / GAMMA);
  const coef = (2 * GAMMA * GC) / ((GAMMA - 1) * R_AIR * fToR(tUpF));
  return areaFt2 * pUp * INHG_TO_PSF * Math.sqrt(coef * Math.max(0, term));
}

/** Solve MAP so that throttle flow equals engine demand (bisection; demand increases, supply decreases with MAP). */
export function solveMap(areaFt2, pUp, tUpF, demandAt) {
  let lo = 0.6;
  let hi = pUp;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    const f = orificeFlow(areaFt2, pUp, tUpF, mid) - demandAt(mid);
    if (f > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
