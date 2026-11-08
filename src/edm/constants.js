// Timing and behavioral constants. Section numbers refer to docs/02-SPEC.md (§16).

export const T = {
  SUBSTEP: 50, // internal time resolution of TICK processing (IN-2)

  // Gestures (§4)
  HOLD_START: 700,
  REPEAT_LF: 200,
  REPEAT_STEP_BACK: 250,
  LF_VIEW: 3000,
  STEP_OFF: 5000,
  BOTH_HOLD: 5000,
  ACCEL_AFTER: 3000, // hold-repeat becomes x10 for wide ranges

  // Modes / alarms
  AUTO_AFTER_POWER: 120000,
  ALARM_SNOOZE: 600000,

  // Banners and messages
  PROGRAM_BANNER: 2000,
  LEANEST: 2000,
  LEAN_BANNER: 2000,
  FACLIM_BANNER: 2000,
  SNAP: 2000,
  ADJUST: 1000,
  FUEL_BANNER: 1000,
  EGTCHT_711: 1000,
  RPMMAP_DWELL: 1000,
  ITEM_TITLE: 1000,
  DOWNLOAD_BANNER: 1000,
  OFF_MSG: 1500,
  SELFTEST_PROBE_MSG: 1500,
  STARTUP_INFO: 1500,
  SELFTEST_SEGMENTS: 3000,
  SELFTEST_COLUMN: 300,

  // Downloads
  DUMP_ALL: 6000,
  DUMP_NEW: 3000,

  // Derived values
  CLD_WINDOW: 30000,
  CLD_SAMPLE: 1000,
  LF_TIT_GRACE_MS: 60000,
  DIM_TAU: 3333,
};

export const LF_RISE_F = 15;
export const LF_PEAK_DROP_F = 10;
export const LF_TIT_GRACE_F = 100;

export const SEGMENTS = 13;
export const NORM_REF_SEG = 7;
export const PREIGNITION_F = 2000;
export const MIN_FLOW = 0.5; // below this the flow "is too low to register" (0.0 GPH)

export const LTM_CAPACITY = 12000; // 20 h at 6 s

export const FACTORY_TEMP_LIMITS = {
  F: { hcht: 450, hoil: 230, loil: 90, tit: 1650, cld: -60, dif: 500 },
  C: { hcht: 230, hoil: 110, loil: 32, tit: 900, cld: -33, dif: 280 },
};
export const FACTORY_BAT = { 12: { hbat: 16.0, lbat: 12.0 }, 24: { hbat: 32.0, lbat: 24.0 } };
export const FACTORY_711 = { F: { hcht: 460, hoil: 230, tit: 1650 }, C: { hcht: 238, hoil: 110, tit: 900 } };
export const FACTORY_MAP = 42.0;
export const FACTORY_MIN = 45;
export const FACTORY_REM = 10;

// Alarm-list numeric ranges (§12.1). °C ranges are the °F ranges converted (LIM-1).
export const TEMP_RANGES = {
  F: {
    dif: { min: 30, max: 990, step: 10 },
    hcht: { min: 90, max: 500, step: 5 },
    cld: { min: -200, max: -5, step: 5 },
    tit: { min: 650, max: 2000, step: 10 },
    hoil: { min: 40, max: 500, step: 5 },
    loil: { min: 10, max: 250, step: 5 },
  },
  C: {
    dif: { min: 17, max: 550, step: 1 },
    hcht: { min: 32, max: 260, step: 1 },
    cld: { min: -111, max: -3, step: 1 },
    tit: { min: 343, max: 1093, step: 1 },
    hoil: { min: 4, max: 260, step: 1 },
    loil: { min: -12, max: 121, step: 1 },
  },
};

// Alarm priority order, highest first (ALM-1).
export const ALARM_PRIORITY = ['CHT', 'OILH', 'TIT', 'OILL', 'CLD', 'DIF', 'BATH', 'BATL', 'MAP', 'LOFUEL', 'LOTIME'];

// Canonical scan order (§7.1). CHTHI is only used by the EDM-711 automatic scan.
export const SCAN_ORDER = [
  'BAT', 'OAT', 'IAT', 'CDT', 'CRB', 'DIF', 'RPMMAP', 'REM', 'GPSMSG', 'REQ', 'RES', 'MPG', 'HM', 'GPH', 'USD',
  'EGT1', 'EGT2', 'EGT3', 'EGT4', 'EGT5', 'EGT6', 'CHTHI', 'TIT1', 'TIT2', 'OIL', 'CLD',
];

export const SWITCH_TAGS = {
  BAT: 'TA', OAT: 'TA', IAT: 'TA', CDT: 'TA', CRB: 'TA', DIF: 'TA', RPMMAP: 'TAF', REM: 'FA', GPSMSG: 'FA',
  REQ: 'FA', RES: 'FA', MPG: 'FA', HM: 'FA', GPH: 'FA', USD: 'FA', EGT1: 'TA', EGT2: 'TA', EGT3: 'TA',
  EGT4: 'TA', EGT5: 'TA', EGT6: 'TA', CHTHI: 'TA', TIT1: 'TA', TIT2: 'TA', OIL: 'TA', CLD: 'TA',
};

export const FUEL_UNITS = ['GAL', 'KGS', 'LTR', 'LBS'];
export const FUEL_UNIT_FACTOR = { GAL: 1, KGS: 2.72, LTR: 3.785, LBS: 6.0 };
export const FLOW_LABEL = { GAL: 'GPH', KGS: 'KPH', LTR: 'LPH', LBS: 'PPH' };
export const MILEAGE_LABEL = { GAL: 'MPG', KGS: 'MPK', LTR: 'MPL', LBS: 'MPP' };

export const ID_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789- ';

export const DEFAULT_CONFIG = {
  model: 800,
  primary711: false,
  cylinders: 6,
  oat: true,
  iat: false,
  cdt: false,
  crb: false,
  oil: true,
  tit: 1,
  ff: true,
  gps: true,
  usbPort: true,
  busVolts: 12,
  transducerK: 29.0,
};
