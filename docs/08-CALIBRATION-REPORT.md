# Calibration Report — Cessna 177B / Lycoming O-360-A1F6D model

Generated from `tools/fit.mjs` (writes `src/sim/fitted.js`) and `tools/report.mjs`; every number below is also asserted
by the automated tests in `test/sim/` (`npm run test:sim`). Sources: research doc `docs/research/o360-cardinal-data.md`
([S#], [N#]).

## 1. Fitted engine parameters (≤5 fitted, physical constants fixed — critique M2)

| Parameter | Value | ±SE | Meaning | Fixed / fitted to |
|---|---|---|---|---|
| η_v level | 0.949 | 0.002 | volumetric efficiency at 2400 RPM | POH Fig 5-7 fuel flows (mass balance) |
| η_v slope | −0.030 /1000 RPM | 0.005 | | POH fuel flows |
| K_i | 641 HP per lb/s | 1.8 | indicated power per unit air at best power | Lycoming Fig 3-42 sea-level lines |
| c_r | 0.142 | 0.007 | residual-gas / back-pressure coefficient (≈1/(γ(CR−1)) = 0.095 physical estimate) | Lycoming altitude method |
| k_POH | 1.076 | 0.003 | POH %BHP labels ÷ Lycoming-chart power (reported, not used in physics) | POH %BHP |
| FAR_peak | 0.067 | fixed | 100LL stoichiometric | — |
| √T exponent | 0.5 | fixed | Lycoming temperature rule (POH ISA±20 columns use it) | — |
| Friction | 22 HP @ 2700, 13 HP @ 2000 + 2.5 HP accessories | fixed | typical FMEP 15–18 psi | — |
| Airframe CD0 / η_prop,max / e | 0.025 / 0.745 / 0.75 | — | e ASSUMED | POH KTAS (fit sheets) + Fig 5-5 ROC |

## 2. Agreement with published data

| Check | Result | Target | Source |
|---|---|---|---|
| POH %BHP, fit sheets 2/6/10 kft (×k_POH) | RMS 0.76, max 1.8 points | ≤1.2 / ≤3 | [S2] Fig 5-7 |
| POH %BHP, **hold-out** sheets 4/8/12 kft | RMS 0.89, max 2.0 points | ≤1.8 | [S2] |
| POH fuel flow, fit / hold-out | RMS 0.16 / 0.21 GPH (max 0.52) | ≤0.25 / ≤0.38 | [S2] |
| All 462 cells incl. ISA±20 (√T check) | RMS 0.90 %BHP, 0.19 GPH | — | [S2] |
| POH true airspeed, fit / hold-out | RMS 0.97 / 1.36 kt; max (cells ≥50 %) 1.3 / 3.9 kt | ≤1.5 / ≤4 | [S2] |
| POH max rate of climb, SL–12 000 ft | worst 51 fpm | ±60 | [S2] Fig 5-5 |
| POH max climb SL→5000 ft | ≈7 min, ≈1.9 gal (test ±15 %) | 7 min, 1.9 gal | [S2] Fig 5-6 |
| Lycoming rated power, 2700 / 28.65 inHg dry SL | 180 ±4 HP | 180 | [S1] Fig 3-42 |
| Lycoming full-throttle MAP vs altitude | worst 0.16 inHg | ±0.3 | [S1] |
| Lycoming full-throttle power vs altitude (normalized) | worst 3.7 % | ±4 % | [S1] |
| Lycoming mixture curve (Fig 3-1) at reference | ±1.5 % | — | [S1] |
| Full-rich take-off flow (MA-4-5) | 17.3 GPH at 2700 (17.0 static at 2651 RPM) | 16–18.5 | [N1] FOCA |
| Full rich at 65 % vs POH lean flow | ×1.1–1.3 | FOCA 1.21 | [N1] |
| Taxi flow 1000–1200 RPM | 1.8–2.6 GPH | FOCA 2.1 | [N1] |
| Static full-throttle RPM (fine pitch) | 2651 RPM, 28.8 inHg | 2600–2675 (McCauley) | [N8] |
| Run-up MAP at 1800 RPM | 16.5 inHg | 16–19.5 | critique m2 |
| Idle (closed throttle) | 673 RPM, 9.2 inHg, 1.0 GPH | 600–800 RPM, 8.5–13 inHg | typical |
| Magneto drop at 1800 / EGT rise | 66 RPM, +50…100°F | ≤150 (POH), 60–110 typical | [S2], Busch |
| Carb heat: rise at 75 % / full-throttle loss / run-up drop | 93°F / −13 ±2.5 % / 44 RPM | 90°F / −13 % / drop | [N2], [S2] |
| Cruise 6000 ft 2400/22 r̄ 1.05 | 66 % true (71 % POH-label), 123 KTAS, 9.4 GPH | POH 72 %, 124, 9.6 | [S2] |
| Cruise EGT / DIF | 1335–1451°F / 116°F | ≈1350–1400 / 120–150 carbureted | JPI p.21 |
| Take-off EGTs (full rich) | 1033–1283°F | 1100–1250 | JPI p.18 |
| Cruise CHT / Vy climb CHT (ISA SL, cowl open) | 340–351°F / 384–438°F | 345–390 / 380–440 | Lycoming 350–435 |
| Oil cruise / climb | 188 / 193°F | 180–200 | Lycoming, JPI |
| Abrupt power cut at cruise speed | CLD −60…−110°F/min | JPI −40…−60 normal, alarm −60 | JPI p.19 |

## 3. Known conflicts between sources (documented, not hidden)

1. **POH vs Lycoming power (k_POH = 1.076).** At the same RPM/MAP the POH %BHP labels are ≈7.6 % above the Lycoming
   chart. The model's engine follows the Lycoming chart (rated 180 HP), the POH's RPM/MAP → fuel-flow and → airspeed
   relations are matched directly, and %BHP is compared through k_POH. (Plan v2 had chosen a dry/indicated MAP offset;
   that required a 27.3 inHg full-throttle MAP at sea level and contradicted the FOCA full-rich mixture, so the
   critique's alternative (b) was implemented — see plan §11.)
2. **Fig 3-39 peak-EGT flows vs POH flows.** Because airflow is fitted to the POH flows (whose %BHP labels are
   optimistic), the model's peak-EGT flow at a given *Lycoming* % power is ≈0.9 GPH above Lycoming's "minimum allowable"
   guideline line (BSFC ≈0.46 vs 0.42). For a pilot the observable relation — RPM/MAP → fuel flow — matches the POH.
3. **POH "10 % more range at peak"** cannot be reproduced from Fig 3-1/3-39 (critique m9) — quoted in debriefs with a
   caveat, not used as a target.

## 4. Assumed values and how they are guarded

Every ASSUMED / TYPICAL / FORUM value carries a range in `src/sim/calibration.js` and is listed (with sliders) in the
simulator's Instructor tab. `test/sim/integration.test.mjs` runs the scenarios that depend on them at **both ends of
each range** and across five random seeds; the false-peak statistics test checks the EGT-noise value against the
Pilot's Guide misapplication ("pausing while leaning finds a peak too soon"). The largest remaining uncertainties are
absolute EGT/CHT levels, CHT time constant and cooling terms, and which cylinder runs leanest on a given Cardinal;
`tools/replay.mjs` is ready to calibrate them against real JPI EDM logs.
