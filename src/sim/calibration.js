// Every model constant with {v: nominal, range, tag, note}. Tags: OFFICIAL / MEASURED / DERIVED / TYPICAL / FORUM /
// ASSUMED / FITTED. Fitted values come from tools/fit.mjs (src/sim/fitted.js). Instructors may override any value
// inside its range (Simulation.setParam). The UI's "About this simulation" lists the ASSUMED ones.

import { FIT } from './fitted.js';

export const PARAMS = {
  // --- engine core (fitted / fixed) ---
  eta0: { v: FIT.engine.eta0, tag: 'FITTED', note: 'volumetric efficiency level (POH GPH)' },
  eta1: { v: FIT.engine.eta1, tag: 'FITTED', note: 'volumetric efficiency slope per 1000 RPM' },
  Ki: { v: FIT.engine.Ki, tag: 'FITTED', note: 'indicated HP per lb/s air at best power (Lycoming chart)' },
  cr: { v: FIT.engine.cr, tag: 'FITTED', note: 'residual-gas / back-pressure coefficient (Lycoming altitude method)' },
  f1: { v: FIT.engine.f1, tag: 'TYPICAL', note: 'friction HP per 1000 RPM (FMEP 15–18 psi)' },
  f2: { v: FIT.engine.f2, tag: 'TYPICAL', note: 'friction HP per (1000 RPM)²' },
  delta: { v: 0, tag: 'DERIVED', note: 'dry ISA: indicated = dry MAP; humidity handled via vapor pressure' },
  kPOH: { v: FIT.engine.kPOH, tag: 'FITTED', note: 'POH %BHP labels ÷ Lycoming-chart power (reported, not used in physics)' },
  aMax: { v: FIT.throttle.aMax, tag: 'FITTED', note: 'throttle full-open area (full-throttle MAP = 0.96·P)' },
  aIdle: { v: FIT.throttle.aIdle * 0.7, tag: 'FITTED', note: 'idle bypass area: fitted for MAP ≈11.5 in at 650 RPM, scaled so closed-throttle idle settles ≈650–700 RPM with the prop' },
  kRam: { v: 0.65, range: [0.5, 0.8], tag: 'ASSUMED', note: 'ram recovery fraction of dynamic pressure (critique m1)' },

  // --- carburetor / mixture ---
  rFrWot: { v: FIT.carb.rFrWot, range: [1.25, 1.45], tag: 'MEASURED', note: 'full-rich r̄ at full throttle (FOCA φ 1.31–1.38); sets take-off flow ≈17.3 GPH' },
  rFrPart: { v: 1.2, range: [1.15, 1.25], tag: 'MEASURED', note: 'full-rich r̄ at part throttle (FOCA 65 % full rich φ 1.23)' },
  rFrIdle: { v: 1.36, range: [1.25, 1.45], tag: 'MEASURED', note: 'idle/taxi full-rich r̄ (FOCA φ 1.34–1.35)' },
  leverMin: { v: 0.55, range: [0.5, 0.65], tag: 'ASSUMED', note: 'metering factor at the lean end of the lever' },
  spreadWot: { v: 1.3, range: [1.2, 1.45], tag: 'ASSUMED', note: 'distribution spread multiplier at wide-open throttle (critique M5)' },
  spreadLow: { v: 1.75, range: [1.5, 2.0], tag: 'ASSUMED', note: 'distribution spread multiplier at idle/taxi or cold oil' },
  rLeanMis: { v: 0.93, range: [0.9, 0.95], tag: 'ASSUMED', note: 'lean misfire 50 % point (float carb: roughness before tailpipe peak, POH)' },
  rRichMis: { v: 1.62, range: [1.55, 1.7], tag: 'ASSUMED', note: 'rich misfire onset (over-rich roughness at altitude / with carb heat)' },

  // --- ignition / plugs / knock ---
  singleMagEff: { v: 0.91, range: [0.89, 0.93], tag: 'TYPICAL', note: 'indicated efficiency on one plug (mag drop 60–110 RPM)' },
  singleMagEgt: { v: 75, range: [50, 100], tag: 'TYPICAL', note: 'EGT rise with one plug (Busch/JPI 50–100°F)' },
  foulRate: { v: 4.5e-4, range: [2.5e-4, 8e-4], tag: 'ASSUMED', note: 'plug fouling rate (rich, cold, low RPM): ~20 min of rich cold idle fouls the most sensitive plug' },
  clearRate: { v: 0.012, range: [0.006, 0.02], tag: 'ASSUMED', note: 'plug clearing rate (lean, hot)' },
  octane: { v: 100, range: [80, 100], tag: 'OFFICIAL', note: 'fuel grade (100LL minimum; 80 = misfuel scenario)' },

  // --- EGT ---
  E0: { v: 1255, range: [1180, 1330], tag: 'TYPICAL', note: 'peak-EGT base (anchored: cruise ≈1350–1400 at r̄ 1.05, take-off 1100–1250)' },
  E1: { v: 270, range: [200, 340], tag: 'ASSUMED', note: 'peak-EGT rise per unit airflow fraction' },
  E2: { v: -6, range: [-12, 0], tag: 'ASSUMED', note: 'peak-EGT change per 100 RPM above 2400 at equal airflow' },
  tauEgt: { v: 1.5, range: [1, 3], tag: 'TYPICAL', note: 'EGT probe time constant, s' },
  egtNoise: { v: 7.5, range: [4, 8], tag: 'ASSUMED', note: 'EGT wander σ, °F (critique m17)' },

  // --- CHT / cooling ---
  tauCht: { v: 200, range: [150, 240], tag: 'ASSUMED', note: 'cylinder-head time constant, s (−40…−80°F/min abrupt descents)' },
  Q0: { v: 385, range: [365, 405], tag: 'ASSUMED', note: 'CHT rise scale, °F (anchors: Vy climb ISA ≈390–420, 75 % cruise ≈345–390)' },
  kSlip: { v: 0.8, range: [0.5, 1.0], tag: 'ASSUMED', note: 'prop-slipstream share of cooling pressure' },
  cowlVy: { v: 0.08, range: [0.06, 0.1], tag: 'FORUM', note: 'cowl-flap effect at Vy (20–30°F), small in cruise (≤10–15°F)' },
  rearBias: { v: 0.08, range: [0.0, 0.12], tag: 'FORUM', note: 'rear cylinders run hotter in climb (#3/#4)' },

  // --- oil ---
  oilC: { v: 35, range: [25, 45], tag: 'ASSUMED', note: 'oil+engine heat capacity, HP·s/°F' },
  oilKc: { v: 0.124, range: [0.1, 0.15], tag: 'ASSUMED', note: 'oil-cooler conductance (full open), HP/°F' },
  oilKcase: { v: 0.03, range: [0.02, 0.04], tag: 'ASSUMED', note: 'case conductance, HP/°F' },

  // --- carb heat / ice ---
  heatEps: { v: 0.122, range: [0.1, 0.15], tag: 'OFFICIAL', note: 'muff effectiveness at 75 % (anchor: 90°F rise, 14 CFR 23.1093)' },
  tauMuff: { v: 45, range: [35, 90], tag: 'ASSUMED', note: 'muffler shroud temperature lag, s (heat at idle fades within ~2 min)' },
  iceRate: { v: 1.0, range: [0.3, 3], tag: 'ASSUMED', note: 'icing severity knob (BEA timescales at 1.0)' },

  // --- prop ---
  cpA0: { v: 0.0036, range: [0.0033, 0.004], tag: 'ASSUMED', note: 'prop power-coefficient slope at J = 0 (static RPM 2600–2675)' },
  cpA1: { v: 0.0081, range: [0.007, 0.009], tag: 'ASSUMED', note: 'prop power-coefficient slope growth with J' },
};

export function defaultParams() {
  return Object.fromEntries(Object.entries(PARAMS).map(([k, d]) => [k, d.v]));
}

// Engine personality: fuel distribution d_i0 (r_i = r̄·(1 + d_i)), peak-EGT offsets, CHT probe type.
// Which cylinder is leanest on this engine is unknown (research gap 4); default "#3 leanest/hottest" (FORUM lead [N7]).
export const PERSONALITIES = {
  default: { label: '#3 lean / hot (owner reports)', d0: [0.03, 0.04, -0.045, -0.025], egtOff: [5, -15, 15, -5], gasket: [false, false, false, false], foulCyl: 1 },
  frontLean: { label: '#1 lean', d0: [-0.05, 0.035, 0.02, -0.005], egtOff: [10, -10, 0, -5], gasket: [false, false, false, false], foulCyl: 1 },
  rearLean: { label: '#4 lean, gasket probe on #2', d0: [0.035, 0.02, 0.0, -0.055], egtOff: [-5, 5, -5, 10], gasket: [false, true, false, false], foulCyl: 0 },
  even: { label: 'well balanced (small spread)', d0: [0.015, -0.01, -0.015, 0.01], egtOff: [5, -5, 5, -5], gasket: [false, false, false, false], foulCyl: 0 },
};
