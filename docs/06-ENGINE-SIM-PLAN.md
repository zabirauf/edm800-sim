# Engine Simulation Plan — Cessna 177B Cardinal / Lycoming O-360-A1F6D

Status: **v2 — implemented** (`src/sim/`, tests in `test/sim/`, results in `08-CALIBRATION-REPORT.md`). Revised after
the independent critique `07-ENGINE-PLAN-CRITIQUE.md` (disposition in §10); changes made during implementation are in §11.
Data: `docs/research/o360-cardinal-data.md` (`R§n`, source tags `[S#]`; critique sources `[N#]` in its addendum).

---

## 1. Goals and principles

1. **Data first.** Every coefficient is fitted to a published/measured table or tied to a stated anchor, and carries
   `{nominal, range, tag}` with tag ∈ OFFICIAL / MEASURED / DERIVED / TYPICAL / FORUM / ASSUMED — all in one file,
   `calibration.js`. The UI's "About this simulation" lists every ASSUMED value.
2. **Physically structured, minimally fitted.** Physical constants that are known are fixed (stoichiometry, √T rule,
   mass balance); only a handful of parameters are fitted, with hold-out validation and range assertions (§4.0).
3. **Teach signatures, not numbers.** Lessons are taught as relative patterns (Normalize, ΔEGT, DIF, rates). Every
   scenario signature must hold across the full range of every ASSUMED parameter and across ≥20 personality seeds.
4. **Deterministic & testable.** Pure model, fixed 50 ms step shared with the EDM; fast-forward is bit-identical to
   stepping; seeded noise; Node-testable headless.
5. **Real data in the loop.** Absolute EGT/CHT levels and cooling dynamics are provisional until replayed against real
   Cardinal EDM logs (§9).

## 2. Aircraft and EDM configuration

| Item | Value | Source |
|---|---|---|
| Airframe | Cessna 177B (1970–78), 2500 lb max, wing 174 ft², span 35.5 ft | R§1.1, R§5.1 [S2]; geometry and drag priors from NASA CR-2337 [S17] |
| Engine | Lycoming O-360-A1F6D, 180 HP @ 2700, 361 in³, CR 8.5:1, 25° BTC, firing order 1-3-2-4 | R§1.2 [S1] |
| Cylinders | #1 right-front, #2 left-front, #3 right-rear, #4 left-rear | R§1.3 |
| Carburetor | Marvel-Schebler MA-4-5 up-draft float, manual mixture, idle cut-off, accelerator pump; riser in the oil sump | R§1.2 |
| Ignition | Bendix D4LN-3021 dual magneto (single drive); each magneto fires one plug per cylinder | R§1.2 |
| Prop | McCauley 2-blade constant speed, 76 in, low pitch 12.1°, high 26.0° | R§1.4 |
| Fuel / electrical | 49 gal usable (60 long range), selector L/R/BOTH/OFF, aux pump; 14 V, 60 A alternator, 12 V 33 Ah battery, OV trip ≈16 V | R§0, R§5.1 |
| EDM-800 install | `cylinders 4, tit 0, oil, oat, crb, ff, busVolts 12` (last column = OIL, no T) | spec ANA-1 |

EDM alarm limits stay JPI defaults; an instructor preset "Cardinal red lines" sets H CHT 500 / H OIL 245.

## 3. Architecture and build order

```
src/sim/calibration.js  constants {nominal, range, tag} + published tables (POH cells, climb, Lycoming, FOCA)
src/sim/atmosphere.js   ISA, OAT dev, humidity → dew point & vapor pressure, dry-air partial pressure
src/sim/o360.js         induction/MAP, carburetor, distribution, combustion/power/fuel, ignition, plugs, knock,
                        prop/governor, EGT/CHT/oil/carb-temp thermal, carb ice
src/sim/airframe.js     177B point-mass: polar + prop efficiency → IAS/TAS/ROC; flight-path modes; go-around
src/sim/systems.js      fuel tanks/selector/aux pump/accelerator pump; electrical (alternator, battery, OV relay)
src/sim/trim.js         steady-state trim solver (used by the fits, tests and scenario initialization)
src/sim/scenarios.js    scenario library
src/sim/index.js        Simulation.step(dt) / fastForward(ms) / sensors() → EDM frame
test/sim/*.test.mjs     calibration, sign/monotonicity, robustness (ranges × seeds), signature, golden traces
tools/replay.mjs        EDM log-replay harness (§9)
```

Build order (critique m20): (1) atmosphere + trim solver + power/MAP/fuel with the fixed constants, fitted to the POH
with hold-out; (2) **vertical slice**: cruise trim → mixture/distribution → EGT → LeanFind through the real EDM;
(3) prop/governor + airframe; (4) thermal; (5) carb heat/ice, ignition/plugs/knock, systems, faults; (6) scenarios +
golden traces; (7) UI integration (after the user's go-ahead). A headless dev harness (knobs + truth readout in the
terminal) exists from phase 2 so lever maps and lean rates are tuned early.

Step order (50 ms): atmosphere → control inputs → induction/MAP solve → carburetor mixture → distribution →
per-cylinder combustion (misfire, knock) → power → prop/RPM → airframe → thermal (EGT probe, CHT, oil, muff, carb
body) → carb ice → plugs → systems → sensor frame (noise, probe faults, K-factor, EDM %HP estimate).

## 4. Model and calibration

Notation: N RPM; MAP inHg; T °R; σ density ratio; per-cylinder mixture `r_i` = FAR_i / FAR_peak; **mean mixture
`r̄`** = airflow-weighted mean FAR / FAR_peak. **All whole-engine fuel anchors are stated on r̄ (critique B1).**

### 4.0 Fitting policy (critique M1, M2)
- **Fixed, not fitted**: FAR_peak = 0.067 (100LL stoichiometric ≈0.066–0.067); temperature exponent x = 0.5 (Lycoming
  √T rule; the POH ISA±20 columns were generated with it, so x is not identifiable); η_v level from the mass balance
  (≈0.86–0.91 at 2700); e and a CD0 prior from NASA CR-2337; η_prop shape from a generic constant-speed map (one scale).
- **POH ↔ Lycoming reconciliation (M1 option a)**: the Lycoming chart is on **dry** absolute MAP; the POH tables and
  the EDM read **indicated (wet) MAP**. Model: `MAP_dry = MAP_ind − p_vapor − δ_inst`, with p_vapor from humidity
  (standard-day value) and a small installation offset δ_inst fitted jointly (expected total ≈0.6–0.7 inHg, ASSUMED
  range 0.3–1.0). Lycoming checks use MAP_dry; POH cells use indicated MAP. The POH "20.5 inHg at 10 000 ft" rows are
  soft targets (±0.4).
- **Fitted (≤5 engine parameters)**: K_i (indicated power constant), η_v(N) slope, FHP f1, f2, δ_inst. Report standard
  errors; assert each value is inside its physical range.
- **Data split**: POH sheets 2000/6000/10 000 ft for fitting; **4000/8000/12 000 ft held out** for validation. RMS is
  reported over the ~155 independent cells (ISA column); the ISA±20 columns check the √T rule only.

### 4.1 Atmosphere and humidity (critique m11)
ISA; OAT = ISA + deviation; RH → dew point and vapor pressure; **dry-air partial pressure** drives airflow and power
(hot humid days cost 1–4 %); the carburetor meters vapor as air → mixture richens slightly with humidity.

### 4.2 Induction and manifold pressure (m1, m4)
- Engine demand: `ṁ_air = η_v(N)·[1 − c_r·(P_exh/MAP − 1)]·(MAP_dry·Vd·N/2)/(R·T_charge)` (residual-gas term for idle).
- Throttle: compressible orifice with butterfly area + idle bypass; `P_up = P_amb + k_ram·q − ΔP_filter` (carb heat:
  alternate-air path, unfiltered, no ram), **k_ram 0.5–0.8** (recovery cannot exceed q ≈0.6–0.7 inHg in cruise).
  Carb ice multiplies the effective area (§4.11). MAP solved by bisection each step.
- Targets: full-throttle MAP = 0.96·P_amb (2700) / 0.97·P_amb (2200) zero ram (R§3.3); idle MAP 10–13 inHg at
  650–750 RPM; run-up MAP at 1800 RPM is an **output check, 17–19.5 inHg** (critique m2).

### 4.3 Power
```
IHP_i = K_i · ṁ_air,i · ηp_ind(r_i) · ign_i · knock_i · (1 − misfire_i)      (per cylinder, √T via ṁ and x = 0.5)
BHP   = Σ IHP_i − FHP(N, T_oil)        FHP = f1·N + f2·N² , ×(1 + cold-oil factor) (critique S2)
```
- `ηp_ind` from Fig 3-1 converted brake→indicated at the chart's reference (65–75 %): `ηp_ind = 1 − (1 − ηp_brake)·BHP/IHP`
  (critique m6).
- Shape checks vs Lycoming (not fitted): 180 ±4 HP at 2700/28.65 inHg dry SL; full-throttle HP-vs-altitude ratio ±3 %
  (R§3.2); ≈1 %/10°F.

### 4.4 Carburetor, distribution and fuel flow (B1, M3, M5, M6, m7, m12, m18)
- **Carburetor characteristic vs airflow** (not a single E(throttle)): full-rich FAR follows idle system → transition →
  main jet → power enrichment, anchored to the **FOCA MA-4-5 measurements [N1]**: full rich at full throttle r̄_FR ≈
  1.31–1.38 (nominal 1.34); full rich at 65 % part throttle r̄ ≈ 1.17–1.23 (≈10 % less rich than at full throttle);
  idle/taxi r̄ ≈ 1.3; taxi flow 1.8–2.6 GPH at 1000–1200 RPM.
- Float-carb law: `r̄ = r̄_FR(airflow) · √(σ_ref/σ_charge) · m(lever) · (1 + humidity term)` → richens with altitude,
  carb heat and humid air; a fixed lever setting gets **leaner when descending** (critique M11a).
- Lever map `m(lever)`: idle cut-off below 3 % travel; usable leaning range over ~60 % of travel (ASSUMED, tuned in the
  dev harness).
- **Fuel flow** `GPH = Σ ṁ_air,i · FAR_peak · r_i / 6.0`.
- **Distribution** `r_i = r̄·(1 + d_i)` with `d_i = d_i0 · g(θ_throttle, N, T_riser)` + wet-fuel term; normalized so
  Σ ṁ_i·d_i = 0 (fuel conserved, GPH independent of the seed). g: spread ×1.3–1.6 at wide-open throttle vs throttle
  retarded ~1 inHg; ×1.5–2 at idle/taxi and with cold oil (the riser runs through the sump) — reproduces the JPI
  "level the columns with the throttle" technique and "EGTs not uniform at low power".
- **Misfire**: per-cylinder logistic probability for lean (50 % at r_i ≈ 0.91, width 0.02) and **rich** (onset
  r_i ≈ 1.5–1.6) misfire; single magneto shifts both thresholds ~0.02–0.03 toward the middle. Misfire drives a
  roughness signal (RPM/MAP jitter), lowers that cylinder's EGT/CHT and power.
- **Fuel anchors on r̄** (all tests):
  - Peak-EGT flow (r̄ = 1.00) = Lycoming Fig 3-39, 50–75 % ±0.3 GPH (R§4.1).
  - POH recommended lean = r̄ ≈ 1.05 → `GPH ≈ 0.333 + 0.1278·%BHP` ±0.4 (R§4.2). Corroborated by FOCA 65 % lean 8.5 GPH
    at φ ≈ 1.07 vs POH 8.6.
  - Full-rich take-off SL ISA: personality parameter **16–18.5 GPH, default 17.3** (FOCA 15.9 static at reduced RPM,
    scaled to 2700; critique arithmetic fix: 0.42·180/6 = 12.6 GPH at peak × 1.34 ≈ 16.9).
  - Full-rich 65 %: ≈1.2 × POH lean flow (FOCA 10.3 vs 8.5); ratio full-rich 65 % / full-rich full-throttle flow
    per unit air 0.85–0.92.
  - Lycoming operating-conditions 10.5 GPH at 75 % = loose check only, r̄ ∈ 1.08–1.18 (m8).
  - POH "10 % more range, −4 kt at peak" is **not** a target (inconsistent with Fig 3-1/3-39; debrief quotes it with a
    caveat, m9).
- **The B1 lesson, built in**: with the EDM on the leanest cylinder, "leanest at peak" ≈ POH recommended lean
  (r̄ ≈ 1.05); "LeanFind 50 ROP" burns ≈ +0.3–0.7 GPH more than the POH table. A computed **tailpipe EGT**
  (flow-weighted mix of the four) in the truth panel reproduces the POH single-probe procedure.

### 4.5 Mixture curves (per cylinder)
Lycoming Fig 3-1 (R§7.1) as the base, **extended to r ≈ 1.8** (critique M6): power falls to ≈85 % at r ≈ 1.6
(ASSUMED), ΔEGT continues at ≈1000°F per unit r on the rich side, ΔCHT continues its trend. Monotone cubic in r,
no clamping inside the table range. Test: single cylinder, d = 0, at the 65–75 % reference → power and ΔCHT match
Fig 3-1 ±1 % / ±5°F.

### 4.6 Ignition, spark plugs, knock (M9, M10, S7)
- Single magneto: indicated efficiency −5…−7 %, EGT +50…+100°F (R§7.4); healthy 1800-RPM drop 60–110 RPM,
  differential < 30 (POH limit 150/50).
- **Plug fouling state** per plug: `dF/dt = a·rich(r)·cold(CHT)·lowRPM − b·hot(EGT, CHT)·lean`; intermittent then
  continuous misfire as F rises. 20 min at 700 RPM full rich on a cold day fouls a plug (fails the mag check: drop
  > 150, that cylinder's EGT falls on that magneto); 1–2 min leaned at 1800–2000 RPM clears it; taxiing leaned does not
  foul.
- **Knock margin** `K = f(T_charge, CHT_i, MAP, r_i, timing, octane, carb heat)`, worst between best power and peak,
  relieved by enrichment, power reduction and cooling. K > 1 → detonation: heat flux ×1.3–2 (rapid CHT rise), EGT
  change 0…−30°F [N5]. Credible causes only: misfuel (low octane), advanced timing, high CHT + leaning above 75 %, carb
  heat at high power.
- **Pre-ignition** (hot-spot fault, or sustained heavy detonation): CHT +1…+3°F/s, that cylinder's EGT **drops**
  100–300°F (default, [N5][N6]); JPI's "EGT > 2000°F" variant selectable; the debrief states that the **rapid single-
  cylinder CHT rise is the primary cue**.
- Magneto faults: timing advanced/retarded, one magneto dead, **D4LN common-drive failure** (both magnetos — engine
  stops), P-lead open ("hot mag": no RPM drop) safety note.

### 4.7 Prop, governor, RPM (m2, m3)
- Governor holds the lever RPM when the blade can absorb the power between the stops; **coarse stop is reached at high
  power, high TAS and low lever RPM** (corrected); fine stop at low power/low speed → fixed-pitch behavior.
- Fine-pitch absorption `P = K_fp·σ·N³·g(J)` with **g(J) going negative (windmilling)**.
- Target: static full-throttle RPM on the fine stop **2600–2675** (McCauley: 25–100 below rated [N8]); run-up MAP is
  an output (§4.2).
- Tests: idle at 130 KIAS holds the lever RPM; idle at 65–70 KIAS falls below it; a dive at cruise power with a low
  RPM setting overspeeds once on the coarse stop.
- Throttle: no hard rate limit; full-travel movements under 2 s are logged for the debrief (A1F6 counterweight
  detuning, R§9) (m13).

### 4.8 EGT (m5, m17)
`EGT_peak_i = E0 + E1·load + E2·(N − 2400) + offset_i + ignition/timing terms`, **load = airflow** (not %power — not
circular). `EGT_i = EGT_peak_i + ΔEGT(r_i) + carb-heat inlet term + misfire/knock/fault terms`. Probe lag τ ≈ 1.5 s.
Noise: seeded, **σ calibrated 4–8°F** so that a 10 s pause near peak yields a false LeanFind peak in 30–60 % of seeds
while leaning at ~10°F/s almost never does (statistical test, Pilot's Guide p.20). Anchors (TYPICAL, tunable ±75°F):
cruise 75 % at r̄ 1.05 ≈ 1350–1400°F; full-rich take-off 1100–1250°F; single-mag rise 50–100°F.

### 4.9 CHT (M7, m14, S3)
```
dCHT_i/dt = (CHT_ss_i − CHT_i)/τ_CHT        τ_CHT 2.5–3.5 min (ASSUMED → −40…−60°F/min abrupt descents)
CHT_ss_i  = T_cool + q_i/h_i
q_i       = c_q · IHP_i^0.8 · f_CHT(r_i) · timing · knock
ṁ_cool    ∝ √(ρ · (k_q·q_dyn + k_s·slipstream(N, power)) ) · A_exit(cowl position, continuous)
h_i       = h0 · (ṁ_cool/ṁ_ref)^0.7 · bias_i(IAS, phase)
```
- Density enters through ṁ_cool (cooling falls ≈7–9 % at 8000 ft at a fixed IAS).
- Cowl flap = exit-area term: large effect at Vy (open vs closed 20–30°F), small in cruise (≤10–15°F) [N9].
- Default personality: **rear cylinders hottest in climb**; greatest cooling shifts front (climb) → rear (descent)
  per JPI p.21; bias selectable. CHT probe type per cylinder (gasket probe reads 20–50°F high, JPI p.21).
- Anchors (TYPICAL/ASSUMED, provisional until log replay): cruise 75 % ISA cowl closed ≈380–400, hottest ≤425 (POH ¾
  green); Vy full-rich climb ISA cowl open 380–410; ISA+20 climb cowl closed ≥450 within ~5 min; abrupt cruise→idle
  descent at 1000 fpm initial CLD −60…−80°F/min; 1 inHg/min reduction keeps CLD −20…−40.
- Test: a trainee can hold the hottest CHT at 425 ±15°F in cruise with continuous cowl flaps.

### 4.10 Oil
Energy balance with vernatherm (bypass below ≈170°F, fully open ≈190°F); friction and oil pressure depend on oil
temperature (cold: pressure up to 115 psi, R§2). Anchors: cruise 180–200°F; hot climb 215–235; warm-up at 1000–1200
RPM from 59°F to 100°F in ~4–6 min (ASSUMED); oil-cooler blockage passes 245 in ~10 min; without the winter kit at
−10°C oil can stay below 140°F in cruise (R§7.5).

### 4.11 Carb heat, carb temperature, carb ice (M8, m10, S6)
- **Heat source = muffler shroud**: `ΔT_heat = ε(ṁ_air)·(T_muff − T_inlet)`, T_muff lags mean EGT/exhaust flow
  (τ ≈ 60–120 s, ASSUMED). Anchor: **90°F rise at 75 % power** (14 CFR 23.1093 [N2]); check: full heat at full throttle
  ≈ −13 ±2 % power (POH; the 90°F rise + lost ram/alternate-air ΔP + richening ≈ 13–14 %). Tests: after 2 min at idle,
  heat gives < 40 % of the cruise rise; heat applied before the power reduction stays effective 1–2 min; run-up heat
  costs 75–100 RPM [S10].
- **CRB** = temperature at the probe (assumed downstream of the venturi, near the throttle plate) = inlet − evaporative
  cooling (∝ fuel) − throttle-expansion cooling (part throttle), capped at 70°F (R§8.1), + heat; carburetor-body
  temperature (sump-mounted, heat soak) as a slow state.
- **Ice: one mechanism** — accretion ∝ moisture flux × f(T_throttle-plate ≤ 0°C) (the zones are not multiplied in
  again; they are used for **validation**: serious-zone conditions must ice, light-zone conditions rarely). Calibrated
  to BEA timescales [N3]: onset takes minutes; once started, a fixed-pitch engine loses ~150 RPM within a few minutes;
  here (constant speed) MAP falls with RPM held. Stochastic shedding (~10 min at moderate power). Instructor "icing
  severity" knob.
- Effects: area loss → MAP drop, RPM held by the governor; richening → EGT drop all cylinders; roughness late. Heat
  with ice: brief further dip and roughness (water), then MAP recovers above the iced value; removing heat returns to
  the pre-ice MAP. Partial heat in very cold air can raise CRB into the 0–21°C icing band (POH p.4-20).

### 4.12 Fuel and electrical (m15, S1)
- Tanks L/R, selector, starvation (FF flickers and drops, EGTs rise as the mixture leans, then collapse; restart on
  BOTH + aux pump). Fuel-flow transducer upstream of the float bowl: small lag + float-valve noise; accelerator-pump
  squirt on rapid throttle opening (EDM FF spike + brief EGT dip); failed pump → lean stumble.
- Battery: Thevenin/Shepherd model — with the alternator off and 20–25 A load, terminal voltage reaches ≤12.0 V within
  minutes. OV relay trips at 16.3–16.5 V after 1–2 s, so the EDM H BAT alarm (> 16.0) appears before the trip; then
  L BAT follows. Test: both alarms actually appear.

### 4.13 Airframe (M2, M11a)
Point-mass with polar `CD0 + CL²/(π·e·AR)` (+ flaps), prop efficiency map × one scale; priors from NASA CR-2337;
fit CD0 and the η_prop scale to the POH cruise KTAS (hold-out sheets), check Fig 5-5 max ROC ±60 fpm and Fig 5-6
time/fuel to climb ±15 %. Flight-path modes: Ground (taxi/run-up), Take-off, Climb at IAS (Vx 65 / Vy 79→70 /
cruise climb 85), Level, Descent at VS or IAS, **Go-around** (full throttle, carb heat cold, mixture as set — a leaned
mixture shows the power shortfall), Glide.

### 4.14 What the EDM sees (m16, critique S5)
The sensor frame carries per-cylinder EGT/CHT (with probe type and noise), OIL, OAT, CRB, BAT, RPM, MAP (indicated),
true fuel flow (EDM applies its K factor), GPS. **%HP**: the sim computes a JPI-like *estimate* from RPM, MAP and fuel
flow (so it reads differently with carb ice, full rich at altitude, misfire) and feeds that as the sensor's `pctHp`;
true BHP appears only in the truth panel. (No change to the validated EDM state machine.) Truth panel: true BHP, GPH,
r̄ and each r_i, tailpipe EGT, misfire %, knock margin, plug fouling, ice %, oil pressure, fuel pressure, IAS/VS/alt.

## 5. Pilot controls (UI phase)

Throttle (unrestricted; fast movements logged), mixture (fine control + keyboard lean/enrich at selectable rates),
prop lever, **carb heat (continuous)**, **cowl flaps (continuous)**, magnetos (OFF/R/L/BOTH/START), primer & starter,
fuel selector, aux pump, master/alternator, flaps, flight-path mode + target IAS/VS, weight. Environment: field
elevation, altimeter, OAT/ISA deviation, RH, wind, fuel grade (misfuel option). Time: pause; fast-forward 30 s /
2 min / 5 min that advances engine **and** EDM identically and **auto-pauses on any alarm or scripted event**, with a
"time compressed" banner (S4). Instructor: personality (distribution pattern, hottest cylinder, full-rich flow, cooling
quality/baffles, probe types), icing severity, all ASSUMED parameters within their ranges.

## 6. Scenario library

Each scenario: initial trimmed state, weather, personality, scripted events, objectives with automatic checks,
expected EDM signature, golden trace, debrief citing POH / Lycoming / Pilot's Guide.

| # | Scenario | Signature / checks |
|---|---|---|
| 1 | Cold start & warm-up (−10°C option with preheat decision) | OIL low alarm until > 90°F; cold-oil pressure; warm-up 1000–1200 RPM |
| 2 | Run-up | Normalize view; mag drops 60–110, EGT +50–100; carb heat 75–100 RPM drop; prop cycle; idle mixture check +25–50 RPM |
| 2b | Fouled plug from rich idle/taxi | dynamic fouling (§4.6): mag check fails, one EGT bar falls; lean burn-off clears it |
| 3 | Take-off & climb SL | full rich, EGT 1100–1250; take-off FF = engine's number (16–18.5) on the roll; cowl open |
| 4 | High-DA take-off (5000 ft, ISA+20) | lean for max power at full-throttle static run-up; full rich = power shortfall |
| 5 | Hot climb, cowl closed | CHT alarm 450; cure: cowl open, enrich, climb faster |
| 6 | Climb without leaning to 9000 ft | richening with altitude, EGTs fall; **rich roughness**; lean for smoothness |
| 7 | Cruise leaning — **EDM vs POH (B1 lesson)** | leanest at peak ≈ POH recommended-lean GPH ±0.4; LeanFind 50 ROP ≈ POH +0.3–0.7 GPH; best power 100 ROP; tailpipe EGT shown in debrief |
| 7b | High-power cruise above 75 % (2500/24 at 2000 ft = 78 %) | EDM %HP gates the decision: no peak-EGT leaning, stay ROP (Lycoming; JPI p.14) |
| 8 | LOP attempt (float carb) | leanest cylinder misfires before the others peak; roughness; Lycoming: not possible |
| 9 | Carb ice (cruise and descent) | MAP loss with RPM held, EGTs fall, CRB in −15…+5°C; heat: dip + roughness, recovery |
| 9b | Carb heat in cruise, then re-lean (+ partial-heat trap below −18°C) | heat richens: EGTs fall; re-lean; partial heat raises CRB into the icing band |
| 10 | Shock cooling | abrupt power cut → CLD < −60 alarm; gradual reduction keeps −20…−40 |
| 10b | **Descent without enriching, then go-around leaned** | fixed lever gets ~10 % leaner by 2000 ft: EGTs rise through peak, leanest misfires; leaned go-around = power shortfall/roughness; procedure: richen in the descent, full rich (or max-power lean > 3000 ft) for the go-around |
| 11 | Fouled plug in flight | one EGT +75–100; mag check isolates; burn-off |
| 12 | Induction leak (one cylinder) | lean/hot at low power, normal at high power |
| 13 | Stuck / burned valve | rough start; EGT loss one cylinder; burned valve: 30–100°F EGT oscillation ≈1/min |
| 14 | Detonation (credible cause: misfuel / advanced timing + high CHT + leaning above 75 %) | rapid CHT rise on one cylinder, EGT ~unchanged; recovery within N s of enriching/reducing power |
| 15 | Pre-ignition | CHT +1…3°F/s on one cylinder, its EGT drops (JPI > 2000°F variant selectable); full rich, reduce power |
| 16 | Magneto: timing, dead mag, hot mag, common-drive failure | asymmetric drop / no drop / all-EGT shift / engine stop |
| 17 | Over-voltage then alternator off | H BAT alarm → OV trip → L BAT within minutes |
| 18 | Oil cooler blockage / cold-weather low oil temp | OIL high → 230 → 245; or oil < 140 in cruise without the winter kit |
| 19 | Fuel: mis-entered fuel; **tank run dry** | REM vs actual; LO FUEL / LO TIME; FF flickers, EGTs rise then collapse; restart BOTH + aux pump |
| 20 | Failed probe | OPEN PRB at self-test, missing column |
| 21 | **Diagnostic "rough engine"** | random cause among carb ice, fouled plug, mag failure, too lean, too rich, induction leak; trainee isolates with EDM + mag switch + carb heat + mixture per POH logic |
| 22 | Heavy rain / induction-filter blockage | MAP loss; carb heat (unfiltered alternate air) restores it |

## 7. Verification (automated, `npm test`)

| Group | Tests |
|---|---|
| Calibration (fit sheets) | POH ISA cells: %BHP RMS ≤1.2 (max 3), GPH RMS ≤0.25 (max 0.5) at r̄ 1.05, KTAS RMS ≤1.5 kt |
| Hold-out | same metrics on the 4000/8000/12 000 ft sheets (≤1.5× the fit RMS) |
| Parameter sanity | each fitted parameter inside its physical range; standard errors reported |
| Lycoming shape | 180 ±4 HP dry SL; full-throttle HP vs altitude ±3 %; full-throttle MAP vs altitude ±0.3 inHg; Fig 3-39 peak flow ±0.3 GPH; Fig 3-1 at reference ±1 % / ±5°F |
| FOCA (measured) | full-rich take-off within the personality range; full-rich 65 % ≈1.2× POH lean; taxi 1.8–2.6 GPH; part-throttle enrichment ratio 0.85–0.92 |
| Airframe | Fig 5-5 ROC ±60 fpm; Fig 5-6 time/fuel ±15 % |
| Signs / monotonicity | ∂MAP/∂throttle > 0; carb heat → MAP↓ with RPM held (governing); r̄ ∝ 1/√σ; ∂EGT/∂r sign each side of peak; CHT peak rich of EGT peak |
| Mechanisms | mag check; carb heat (−13 ±2 %, idle < 40 % of cruise rise, run-up 75–100 RPM); rich & lean roughness; plug fouling/clearing; knock onset & relief; governor/windmill/overspeed; ice under serious vs light zones; battery alarms both appear; throttle-leveling reduces DIF ≥20°F; taxi DIF > cruise DIF |
| Statistics | false-peak rate 30–60 % on a 10 s pause vs ≈0 at 10°F/s, over seeds |
| Robustness | every scenario signature at both ends of every ASSUMED range × ≥20 seeds |
| Conservation / determinism | tank Δ = ∫FF = EDM USD (K = 1); fast-forward bit-identical to 50 ms stepping; 1 h random-control fuzz without NaN |
| Golden traces | per-scenario EDM display/alarm trace regression |
| Log replay (provisional → required) | EGT/CHT/OIL RMS, τ, CLD peaks against real Cardinal EDM logs (§9) |

## 8. Answers to the open questions (after critique)
- Typical/assumed EGT and CHT anchors are acceptable for training **if** labeled, taught as relative patterns,
  instructor-tunable, and the signatures pass across their ranges; replace with log data when available.
- POH vs Lycoming is reconciled explicitly by the dry/indicated MAP offset (§4.0).
- Full-rich flow now has a measured basis (FOCA [N1]).
- Flight-path modes are adequate for engine-management training, with a go-around mode added.
- Carb-ice kinetics are a tunable single mechanism calibrated to BEA timescales; the zones validate it.

## 9. Real data request (critique M4) — needs the user's help
The largest remaining uncertainties (absolute EGT/CHT, cooling time constants, cowl-flap/airspeed effects, DIF, which
cylinder is hottest/leanest, take-off flow, mag-check EGT rise) are all recorded in EDM data files. Plan: obtain
**10+ flights from 3–5 Cardinal 177B owners with JPI EDMs** (run-up, climb, LeanFind, cruise, descent) — e.g. via
Cardinal Flyers Online — and build `tools/replay.mjs` to drive the model with the logged RPM/MAP/FF/altitude/OAT and
compare EGT/CHT/OIL traces. Thermal tests stay "provisional" until then.

## 10. Critique disposition
- **B1 accepted** — all anchors on r̄; tailpipe EGT; scenario 7 rewritten as the EDM-vs-POH lesson (§4.4, §6).
- **M1 accepted (option a)** — dry vs indicated MAP offset; x fixed at 0.5; 180 ±4 check on dry MAP (§4.0, §4.3).
- **M2 accepted** — fixed physical constants, ≤5 fitted parameters, CR-2337 priors, hold-out sheets, SEs (§4.0, §4.13).
- **M3 accepted** — FOCA MA-4-5 data added to research; carb characteristic vs airflow; full-rich flow personality
  16–18.5 (default 17.3); arithmetic fixed (§4.4).
- **M4 accepted** — log request + replay harness; thermal tests provisional (§9).
- **M5 accepted** — throttle/RPM/riser-temperature-dependent distribution (§4.4).
- **M6 accepted** — curves to r 1.8, rich misfire (§4.4, §4.5).
- **M7 accepted** — cooling mass flow with density, exit-area cowl term (continuous), rear-hot-in-climb default (§4.9).
- **M8 accepted** — exhaust-heated carb heat, 90°F at 75 % anchor (§4.11).
- **M9 accepted** — knock margin, credible causes, pre-ignition signature with CHT primary (§4.6, §6 #14–15).
- **M10 accepted** — plug fouling state (§4.6, §6 #2b).
- **M11 accepted** — scenarios 7b, 9b, 10b, 21, 22, cold-weather options in 1/18, tank run dry in 19, go-around mode.
- **m1** k_ram 0.5–0.8, soft 20.5 inHg rows. **m2** static 2600–2675, run-up MAP output 17–19.5. **m3** coarse stop
  corrected, windmilling. **m4** residual-gas term. **m5** load = airflow. **m6** brake→indicated conversion, d = 0
  reference test. **m7** logistic misfire, single-mag shift. **m8** loose check. **m9** not a target, debrief caveat.
  **m10** single ice mechanism, BEA timescales, severity knob, probe location stated. **m11** humidity in power and r.
  **m12** carb characteristic vs airflow + idle-mixture check. **m13** no hard limit, logged. **m14** continuous cowl
  flaps + hold-425 test. **m15** Thevenin battery, OV 16.3–16.5 V with delay, both-alarm test. **m16** JPI-like %HP
  estimate in the sensor layer (EDM unchanged). **m17** σ 4–8°F with a statistical false-peak test. **m18** fuel-
  conserving normalization. **m19** robustness, signs, fast-forward equivalence, mass balance, golden traces, hold-out,
  reference-curve test added. **m20** build order: trim solver, vertical slice, early headless dev harness.
- **S1–S7 accepted**: transducer lag/noise + accelerator pump; cold-oil effects; CHT probe types; fast-forward
  auto-pause + banner; richer truth panel; carb-body temperature and ice shedding; D4LN common-drive failure and
  hot-mag note.

## 11. Implementation notes — where the implementation departs from v2 (and why)

- **M1 reconciliation: option (b), not (a).** With the dry/indicated MAP offset (a) the fit required δ ≈ −1.4 inHg,
  i.e. an indicated full-throttle MAP of ≈27.3 inHg at sea level and a full-rich r̄ of 1.48, contradicting real gauges
  and the FOCA measurement (φ ≈1.38). Implemented instead: the engine follows the Lycoming chart (dry MAP = indicated −
  vapor pressure), airflow is fitted to the POH fuel flows, the airframe is fitted with model power to the POH KTAS and
  ROC, and the POH %BHP labels are compared through a reported scale k_POH = 1.076. Result: full-throttle MAP 28.7 inHg,
  r̄_FR 1.34 (FOCA 1.31–1.38), POH %BHP RMS 0.9 on hold-out sheets.
- **Fitted set:** η_v level & slope, K_i, residual coefficient c_r (fitted using the Lycoming full-throttle-vs-altitude
  data — the physical estimate 0.095 under-predicted the chart's altitude effect), k_POH. Friction fixed (FMEP) plus a
  2.5 HP accessory load (needed for a realistic idle).
- **Test tolerances adjusted with stated reasons:** KTAS worst-case applied to cells ≥ 50 % power (low-power cells sit on
  the flat of the power-required curve); full-throttle power-vs-altitude ±4 % (digitization + accessory load); idle MAP
  8.5–13 inHg; Fig 3-39 peak flow reported as a known conflict (calibration report §3).
- **Carb heat:** muffler wall temperature ∝ (airflow)^0.7 × (mean EGT − OAT), pick-up ε ∝ airflow^−0.2, alternate-air ΔP
  0.3 inHg → 93°F rise at 75 %, −13 % at full throttle, < 40 % of the cruise rise after 2 min at idle; run-up drop ≈45 RPM
  (the UK CAA 75–100 RPM figure is for fixed-pitch props).
- **Mixture & distribution:** default spread ±4–5 % (×1.3 at wide-open throttle keyed on MAP/available MAP, ×1.75 at
  idle/cold oil), lean-misfire 50 % point r 0.93 (float carb: roughness before tailpipe peak), rich misfire partial
  (≤35 %) from r 1.62, extended mixture curve 88 % at r 1.6. Peak-EGT anchors E0 1255 / E1 270 (cruise 1335–1451°F,
  take-off 1033–1283°F).
- **Carb ice:** accretion keyed to the carb-temperature reading in the POH yellow arc (−15…+5°C) with part-throttle
  weighting (throttle-plate icing), condensate from the humidity ratio, ≈3 min to a 2.5 inHg MAP loss in serious
  conditions, occasional self-shedding; zones used for validation.
- **Plug fouling:** the most sensitive plug is on the richest cylinder (#2 lower in the default personality).
- **Governor range** 1600–2700 RPM so the run-up prop cycle drops RPM.
- **EGT noise σ 7.5°F**, calibrated by the false-peak statistics test (pause near peak → false peak in 20–70 % of seeds,
  steady 10°F/s → ≤1/10).
- **Q0 range** narrowed to 365–405 (anchors ±20°F) after robustness tests showed the hot-climb lesson failing outside it.
- **Scenarios:** 26 implemented (adds cold-weather; rough-engine diagnosis lives in the Diagnose tab). "Golden traces"
  are replaced by scripted good-pilot solutions run through the real EDM for every scenario, plus robustness runs
  across ASSUMED ranges and seeds.
- **Log replay:** `tools/replay.mjs` implemented and validated on a synthetic log (EGT RMS ≈9°F, mostly probe noise);
  awaiting real Cardinal EDM data.
