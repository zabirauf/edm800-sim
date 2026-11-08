// Calibration against published data (plan v2 §7). Sources: research doc [S1] Lycoming OM, [S2] 177B POH, [N1] FOCA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIT } from '../../src/sim/fitted.js';
import { PARAMS } from '../../src/sim/calibration.js';
import { POH_CRUISE } from '../../src/sim/data/poh-cruise.js';
import { LYC_FT_MAP, FIG_3_1, FOCA } from '../../src/sim/data/tables.js';
import { MIXTURE_TABLE, brakePowerPct } from '../../src/sim/curves.js';
import { steadyPower } from '../../src/sim/engineCore.js';
import { isaPressure, cToF } from '../../src/sim/atmosphere.js';
import { newSim, start, setRpmGround, leanToRbar, cruise } from './helpers.mjs';

const p = { ...Object.fromEntries(Object.entries(PARAMS).map(([k, d]) => [k, d.v])) };
const rms = (xs) => Math.sqrt(xs.reduce((s, x) => s + x * x, 0) / xs.length);

test('fit statistics: POH %BHP and GPH on fit and hold-out sheets (M2)', () => {
  const s = FIT.stats;
  assert.ok(s.fit.pctRms <= 1.2 && s.fit.pctMax <= 3, `fit %BHP ${s.fit.pctRms}/${s.fit.pctMax}`);
  assert.ok(s.fit.gphRms <= 0.25 && s.fit.gphMax <= 0.5, `fit GPH ${s.fit.gphRms}/${s.fit.gphMax}`);
  assert.ok(s.holdout.pctRms <= 1.5 * 1.2 && s.holdout.gphRms <= 1.5 * 0.25, 'hold-out within 1.5× fit tolerance');
  assert.ok(s.ktas.fitRms <= 1.5 && s.ktas.holdRms <= 1.5 * 1.5, `KTAS RMS ${JSON.stringify(s.ktas)}`);
  // max error only for cells ≥ 50 % power (low-power cells lie on the flat part of the power-required curve)
  assert.ok(s.ktas.fitMax50 <= 4 && s.ktas.holdMax50 <= 4, `KTAS max (≥50 %) ${JSON.stringify(s.ktas)}`);
  assert.ok(s.rocMax <= 60, `ROC max error ${s.rocMax}`);
});

test('fitted parameters lie in physical ranges and kPOH is reported', () => {
  const e = FIT.engine;
  assert.ok(e.eta0 > 0.8 && e.eta0 < 0.98);
  assert.ok(e.Ki > 500 && e.Ki < 800);
  assert.ok(e.cr > 0.03 && e.cr < 0.2);
  assert.ok(e.kPOH > 1.0 && e.kPOH < 1.1, 'POH %BHP labels run above the Lycoming chart (critique M1)');
  assert.ok(FIT.airframe.cd0 > 0.018 && FIT.airframe.cd0 < 0.04);
});

test('POH cell check recomputed from the model (independent of stored stats)', () => {
  const cells = POH_CRUISE.filter((c) => c.isaDev === 0);
  const dp = [];
  const dg = [];
  for (const c of cells) {
    const m = steadyPower({ N: c.rpm, mapInd: c.mp, tInletF: cToF(c.oatC), pAmb: isaPressure(c.alt), r: 1.05, p });
    dp.push((m.bhp / 180) * 100 * FIT.engine.kPOH - c.pct);
    dg.push(m.gph - c.gph);
  }
  assert.ok(rms(dp) <= 1.2, `%BHP RMS ${rms(dp)}`);
  assert.ok(rms(dg) <= 0.25, `GPH RMS ${rms(dg)}`);
});

test('Lycoming: 180 ±4 HP at 2700 RPM / 28.65 inHg dry, SL standard, best-power mixture', () => {
  const m = steadyPower({ N: 2700, mapInd: 28.65, tInletF: 59, pAmb: 29.92, r: 1.145, p });
  assert.ok(Math.abs(m.bhp - 180) <= 4, `BHP ${m.bhp}`);
});

test('Lycoming: full-throttle HP-vs-altitude shape within ±4 % and full-throttle MAP within ±0.3 inHg', () => {
  // ±4 %: chart digitization (±1–2 HP at ~100 HP) plus the constant accessory load
  assert.ok(FIT.stats.ftAltMaxRatioErr <= 0.04, `ratio err ${FIT.stats.ftAltMaxRatioErr}`);
  assert.ok(FIT.stats.ftMapMax <= 0.3, `FT MAP err ${FIT.stats.ftMapMax}`);
  assert.ok(LYC_FT_MAP.length >= 6);
});

test('Lycoming Fig 3-1 brake-power curve reproduced at the reference (single cylinder, d = 0; critique m6)', () => {
  // ratio of BHP at mixture r to BHP at best power, 2400 RPM / 22 inHg SL
  const at = (r) => steadyPower({ N: 2400, mapInd: 22, tInletF: 59, pAmb: 29.92, r, p }).bhp;
  const best = at(1.145);
  for (const row of MIXTURE_TABLE.filter((x) => x[0] >= 0.92 && x[0] <= 1.4)) {
    const ratio = (at(row[0]) / best) * 100;
    assert.ok(Math.abs(ratio - row[2]) <= 1.5, `r ${row[0]}: model ${ratio.toFixed(1)} vs chart ${row[2]}`);
  }
  assert.equal(brakePowerPct(1.0), 96.5);
  assert.ok(FIG_3_1.length > 10);
});

test('FOCA (measured MA-4-5): full-rich take-off flow 16–18.5 GPH at SL static → 2700', () => {
  const s = start(newSim());
  s.ctl.throttle = 1;
  s.run(15);
  const gphStatic = s.engine.gph;
  assert.ok(s.engine.rpm >= 2600 && s.engine.rpm <= 2675, `static RPM ${s.engine.rpm} (McCauley: 25–100 below rated)`);
  s.flight.setMode('takeoff');
  s.run(30);
  assert.ok(s.engine.gph >= 16 && s.engine.gph <= 18.5, `take-off GPH ${s.engine.gph}`);
  assert.ok(gphStatic > FOCA.takeoffStatic.gph - 0.5, 'static flow consistent with FOCA 15.9 at reduced RPM');
});

test('take-off EGTs (full rich, full throttle, SL) lie in ≈1050–1300°F and spread ≤ 250°F (JPI p.18: 1100–1250; Lycoming: ≤200°F spread)', () => {
  const s = start(newSim());
  s.ctl.throttle = 1;
  s.flight.setMode('takeoff');
  s.run(40);
  for (const e of s.engine.egtProbe) assert.ok(e >= 1050 && e <= 1300, `EGT ${e.toFixed(0)}`);
  const sp = Math.max(...s.engine.egtProbe) - Math.min(...s.engine.egtProbe);
  assert.ok(sp <= 250, `spread ${sp.toFixed(0)}`);
});

test('FOCA: taxi flow 1.8–2.6 GPH at 1000–1200 RPM full rich', () => {
  const s = start(newSim());
  setRpmGround(s, 1100);
  assert.ok(s.engine.gph >= 1.8 && s.engine.gph <= 2.6, `taxi GPH ${s.engine.gph}`);
});

test('FOCA: full rich at 65 % part throttle ≈1.15–1.3× the POH recommended-lean flow', () => {
  const s = cruise(newSim(), { alt: 4000, rpm: 2300, map: 22, rBar: null });
  s.ctl.mixture = 1;
  s.run(30);
  const rich = s.engine.gph;
  leanToRbar(s, 1.05);
  const lean = s.engine.gph;
  const ratio = rich / lean;
  assert.ok(ratio >= 1.1 && ratio <= 1.3, `ratio ${ratio.toFixed(2)} (FOCA 10.3/8.5 = 1.21)`);
  assert.ok(Math.abs(s.engine.rBar * 1 - 1.05) < 0.02);
});

test('POH Fig 5-6: max climb SL → 5000 ft takes 7 min ±15 % and 1.9 gal ±15 %', () => {
  const s = start(newSim());
  s.ctl.throttle = 1;
  s.ctl.prop = 1;
  s.ctl.cowl = 1;
  s.settle(120);
  const fuel0 = s.systems.fuelTotal;
  s.flight.setMode('takeoff');
  for (let t = 0; t < 120 && s.flight.onGround; t++) s.run(1);
  const tAir = s.time;
  const f0 = s.systems.fuelTotal;
  let leaned = false;
  while (s.flight.alt < 5000 && s.time - tAir < 900) {
    s.run(1);
    if (!leaned && s.flight.alt > 3000) {
      leanToRbar(s, 1.145, 10); // POH: leaned for maximum power above 3000 ft
      leaned = true;
    }
  }
  const minutes = (s.time - tAir) / 60;
  const gal = f0 - s.systems.fuelTotal;
  assert.ok(minutes >= 7 * 0.85 && minutes <= 7 * 1.15 + 0.5, `minutes ${minutes.toFixed(1)}`);
  assert.ok(gal >= 1.9 * 0.85 - 0.3 && gal <= 1.9 * 1.15, `gallons ${gal.toFixed(2)}`);
  assert.ok(fuel0 > gal);
});

test('Run-up MAP at 1800 RPM on the fine-pitch stop is 16–19.5 inHg (critique m2, output check)', () => {
  const s = start(newSim());
  s.run(120);
  setRpmGround(s, 1800);
  assert.ok(s.engine.map >= 16 && s.engine.map <= 19.5, `MAP ${s.engine.map}`);
});

test('Idle: closed throttle ≈600–800 RPM and MAP 8.5–13 inHg (ASSUMED typical)', () => {
  const s = start(newSim());
  s.ctl.throttle = 0;
  s.run(30);
  assert.ok(s.engine.rpm >= 550 && s.engine.rpm <= 850, `idle RPM ${s.engine.rpm}`);
  assert.ok(s.engine.map >= 8.5 && s.engine.map <= 13, `idle MAP ${s.engine.map}`);
});

test('Cruise sanity: 6000 ft, 2400/22, r̄ 1.05 → POH 72 % (÷kPOH), 124 KTAS ±3, 9.6 GPH ±0.4', () => {
  const s = cruise(newSim(), { alt: 6000, rpm: 2400, map: 22 });
  const t = s.truth();
  assert.ok(Math.abs(t.pctTrue * FIT.engine.kPOH - 72) <= 2.5, `%BHP×k ${(t.pctTrue * FIT.engine.kPOH).toFixed(1)}`);
  assert.ok(Math.abs(t.tas - 124) <= 3, `KTAS ${t.tas.toFixed(1)}`);
  assert.ok(Math.abs(t.gph - 9.6) <= 0.4, `GPH ${t.gph.toFixed(2)}`);
  assert.ok(Math.abs(s.engine.rpm - 2400) < 20);
});
