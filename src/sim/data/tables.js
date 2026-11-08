// Published / measured reference data used for calibration and tests.
// Source tags refer to docs/research/o360-cardinal-data.md ([S#]) and its addendum ([N#]).

// Lycoming Fig 3-42 sea-level lines (DERIVED digitization R§3.1): BHP = a + b·(MAP_dry − 20.27), standard temp 59°F,
// "maximum power mixture". Valid MAP 18 … full throttle (≈28.65 at 2700, ≈29.1 at 2000).
export const LYC_SL_LINES = {
  2700: { a: 108.2, b: 8.48 },
  2600: { a: 105.6, b: 8.04 },
  2400: { a: 97.0, b: 7.78 },
  2200: { a: 88.8, b: 7.19 },
  2000: { a: 79.6, b: 6.79 },
};

// Full-throttle BHP vs pressure altitude, standard temperature (R§3.2, DERIVED).
export const LYC_FT_ALT = {
  alts: [0, 2000, 4000, 6000, 8000, 10000, 12000, 14000],
  2700: [180, 169, 157, 146, 135, 125, 116, 106],
  2400: [164, 154, 143, 133, 124, 115, 107, 99],
  2200: [152, 143, 134, 125, 116, 108, 100, 93],
  2000: [141, 133, 124, 116, 108, 100, 93, 86],
};

// Full-throttle (zero-ram, dry) MAP vs altitude (R§3.3, DERIVED): [MAP, alt@2700, alt@2200].
export const LYC_FT_MAP = [
  [28, 815, 1067], [26, 2746, 3068], [24, 4929, 5224], [22, 7284, 7612], [20, 9883, 10074], [18, 12281, 12596],
];

// Lycoming Fig 3-39 "minimum allowable fuel flow" (≈ peak EGT, best economy) vs % rated power (R§4.1, DERIVED).
export const FIG_3_39 = [
  [45, 5.65], [50, 6.3], [55, 6.9], [60, 7.6], [65, 8.2], [70, 8.8], [72.5, 9.1], [75, 9.6],
];

// Lycoming Fig 3-1 representative mixture curve (R§7.1, DERIVED): ΔEGT vs peak (°F, negative = below peak;
// side 'L' lean of peak / 'R' rich of peak), power % of best power, ΔCHT vs CHT peak (°F).
export const FIG_3_1 = [
  { side: 'L', dEgt: -64, power: 89.0, dCht: -53 },
  { side: 'L', dEgt: -45, power: 91.6, dCht: -42 },
  { side: 'L', dEgt: -26, power: 93.4, dCht: -32 },
  { side: 'L', dEgt: -10, power: 94.8, dCht: -22 },
  { side: 'R', dEgt: 0, power: 96.5, dCht: -11 },
  { side: 'R', dEgt: -25, power: 98.0, dCht: 0 },
  { side: 'R', dEgt: -45, power: 98.8, dCht: -2 },
  { side: 'R', dEgt: -83, power: 99.6, dCht: -9 },
  { side: 'R', dEgt: -110, power: 99.9, dCht: -14 },
  { side: 'R', dEgt: -140, power: 100.0, dCht: -20 },
  { side: 'R', dEgt: -270, power: 98.4, dCht: -44 },
  { side: 'R', dEgt: -330, power: 97.0, dCht: -53 },
  { side: 'R', dEgt: -390, power: 95.0, dCht: -58 },
];

// 177B POH Fig 5-5 maximum rate of climb, 2500 lb, flaps up, full throttle 2700 (R§5.3, OFFICIAL).
export const POH_ROC = [
  { alt: 0, kias: 79, roc: { '-20': 970, 0: 895, 20: 820, 40: 745 } },
  { alt: 2000, kias: 77, roc: { '-20': 850, 0: 780, 20: 705, 40: 635 } },
  { alt: 4000, kias: 76, roc: { '-20': 730, 0: 660, 20: 590, 40: 525 } },
  { alt: 6000, kias: 74, roc: { '-20': 610, 0: 545, 20: 480, 40: 410 } },
  { alt: 8000, kias: 72, roc: { '-20': 495, 0: 430, 20: 365, 40: 300 } },
  { alt: 10000, kias: 70, roc: { '-20': 375, 0: 315, 20: 255 } },
  { alt: 12000, kias: 68, roc: { '-20': 260, 0: 200, 20: 140 } },
];

// POH Fig 5-6 max-climb time/fuel from SL, ISA (R§5.3): [alt, minutes, gallons].
export const POH_MAX_CLIMB = [[5000, 7, 1.9], [10000, 19, 4.5]];

// Swiss FOCA emissions test, O-360-A3A with MA-4-5 carburetor, fixed-pitch prop, ground, DA 915 ft [N1] (MEASURED,
// SIBLING). Flows in GPH (6.0 lb/gal); phi derived from CO emission index by the critique (±0.05).
export const FOCA = {
  takeoffStatic: { gph: 15.9, phi: 1.38 },
  climb85: { gph: 13.5, phi: 1.28 },
  cruise65Rich: { gph: 10.3, phi: 1.23 },
  cruise65Lean: { gph: 8.5, phi: 1.07 },
  approach45: { gph: 7.1, phi: 1.35 },
  taxi: { gph: 2.1, phi: 1.34 },
};
