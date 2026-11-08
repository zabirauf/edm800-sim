// Display formatting helpers (spec §7.2).

export const toC = (f) => ((f - 32) * 5) / 9;
export const toF = (c) => (c * 9) / 5 + 32;
export const dToC = (d) => (d * 5) / 9;
export const dToF = (d) => (d * 9) / 5;

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Round to an integer, avoiding "-0". */
export function int(v) {
  const r = Math.round(v);
  return r === 0 ? 0 : r;
}

/** EGT digital value: 1° or 10° resolution (EGT 1?Y / N). */
export function fmtEgt(v, oneDegree) {
  if (v == null) return '';
  return String(oneDegree ? int(v) : int(Math.round(v / 10) * 10));
}

/** FMT-1: |v| < 100 → one decimal, leading zero suppressed; otherwise integer. */
export function fmtFuel(v) {
  if (Math.abs(v) >= 100) return String(int(v));
  let s = (Math.round(v * 10) / 10).toFixed(1);
  if (s === '-0.0') s = '0.0';
  if (s.startsWith('0.')) s = s.slice(1);
  else if (s.startsWith('-0.')) s = '-' + s.slice(2);
  return s;
}

export function fmt1(v) {
  let s = (Math.round(v * 10) / 10).toFixed(1);
  if (s === '-0.0') s = '0.0';
  return s;
}

export function fmtSigned(v, decimals = 0) {
  const s = decimals ? Math.abs(v).toFixed(decimals) : String(Math.abs(int(v)));
  const neg = decimals ? Math.round(v * 10 ** decimals) < 0 : int(v) < 0;
  return (neg ? '-' : '+') + s;
}

export function fmtHM(hours) {
  const totalMin = Math.floor(hours * 60);
  const h = Math.min(99, Math.floor(totalMin / 60));
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}.${String(m).padStart(2, '0')}`;
}

export const pad2 = (n) => String(n).padStart(2, '0');
