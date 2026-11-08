// Non-volatile settings (spec §18) and factory defaults (§12.1, PGM-3).

import { FACTORY_TEMP_LIMITS, FACTORY_711, FACTORY_BAT, FACTORY_MAP, FACTORY_MIN, FACTORY_REM } from './constants.js';

export function factoryLimits(engUnit, busVolts, primary711 = false) {
  return {
    ...FACTORY_TEMP_LIMITS[engUnit],
    ...(primary711 ? FACTORY_711[engUnit] : {}), // P711-6 (rev2)
    ...FACTORY_BAT[busVolts === 24 ? 24 : 12],
    map: FACTORY_MAP,
    minLim: FACTORY_MIN,
    remLim: FACTORY_REM,
  };
}

export function defaultSettings(config, clockMs = Date.UTC(2026, 9, 27, 14, 0, 0)) {
  return {
    // Pilot program (§12)
    rate: 4,
    oatUnit: 'F',
    oatCal: 0,
    egt1: false,
    hpDisplay: true,
    hpc: 125,
    mapCal: 0,
    kf: 29.0,
    accum: false,
    gpsc: 2,
    origTit: false,
    titCal: 0,
    // Long-term memory (PGM-11)
    recordInterval: 6,
    aircraftId: 'N12345',
    clockMs,
    ltm: { records: 0, savedAt: 0, flightFiles: 0, marks: 0 },
    // Alarm list (§12.1)
    engUnit: 'F',
    limits: factoryLimits('F', config.busVolts, config.primary711),
    fuelUnit: 'GAL',
    main: 50,
    auxEnabled: false,
    aux: 0,
    carb: false,
    recrd: true,
    cyl: 6,
    ratedHp: 180,
    ec: 14.9,
    // Fuel state
    rem: 50,
    usd: 0,
  };
}
