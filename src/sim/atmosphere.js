// International Standard Atmosphere + humidity helpers. Pressures in inHg, temperatures in °F unless noted.

export const P0_INHG = 29.92;
export const T0_F = 59;
export const R_AIR = 53.35; // ft·lbf/(lb·°R)
export const INHG_TO_PSF = 70.726;

export const fToR = (f) => f + 459.67;
export const fToC = (f) => ((f - 32) * 5) / 9;
export const cToF = (c) => (c * 9) / 5 + 32;

/** ISA static pressure (inHg) at pressure altitude (ft). */
export function isaPressure(altFt) {
  return P0_INHG * Math.pow(1 - 6.8756e-6 * altFt, 5.2559);
}

/** ISA temperature (°F) at altitude (ft); the POH uses 15°C − 2°C/1000 ft. */
export function isaTempF(altFt) {
  return cToF(15 - 2 * (altFt / 1000));
}

/** Saturation vapor pressure over water (Magnus, inHg) at °F. */
export function satVaporPressure(tF) {
  const c = fToC(tF);
  const hPa = 6.1094 * Math.exp((17.625 * c) / (c + 243.04));
  return hPa * 0.02953;
}

/** Dew point (°F) from temperature (°F) and relative humidity (0..1). */
export function dewPointF(tF, rh) {
  const c = fToC(tF);
  const g = Math.log(Math.max(1e-6, rh)) + (17.625 * c) / (243.04 + c);
  return cToF((243.04 * g) / (17.625 - g));
}

/** Humidity ratio (lb water / lb dry air) for vapor pressure pv and total pressure p (same units). */
export function humidityRatio(pv, p) {
  return (0.622 * pv) / Math.max(1e-6, p - pv);
}

/** Atmosphere state at a pressure altitude with ISA deviation (°F) and relative humidity (0..1). */
export function atmosphere(altFt, isaDevF = 0, rh = 0.5) {
  const p = isaPressure(altFt);
  const t = isaTempF(altFt) + isaDevF;
  const pv = Math.min(p * 0.2, rh * satVaporPressure(t));
  const pDry = p - pv;
  const sigma = (p / P0_INHG) * (fToR(T0_F) / fToR(t)); // density ratio (total air)
  return { altFt, p, t, rh, pv, pDry, sigma, dewF: dewPointF(t, rh), w: humidityRatio(pv, p) };
}
