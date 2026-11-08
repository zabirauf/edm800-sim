# Critique of the Engine Simulation Plan (v1): Cessna 177B / O-360-A1F6D

Reviews: `06-ENGINE-SIM-PLAN.md` (v1). Data basis: `research/o360-cardinal-data.md` (cited `R§n`, with its `[S#]` tags).
Reviewer stance: an A&P/IA who flies an EDM-equipped carbureted Lycoming, plus a simulation engineer. Date: 2026-10-27.
New sources brought in are tagged `[N#]` and listed at the end. Numbers marked *calc* are my own arithmetic; the method is shown.

| Severity | Count |
|---|---|
| BLOCKER | 1 |
| MAJOR | 11 |
| MINOR | 20 |
| SUGGESTION | 7 |

---

## BLOCKER

### B1. "ROP" has two references, and the plan mixes them (§4.4, §4.5, §4.8, §6 #7, §7)
- **Problem.** All the mixture anchors are whole-engine numbers: r(50 ROP) ≈ 1.05, peak-EGT flow from Fig 3-39, and the POH "recommended lean" GPH. The POH's "50°F ROP" and "peak" are read on the Cessna Economy Mixture Indicator, which is a **single tailpipe thermocouple** (mixed exhaust, about the mean mixture) (R§1.5, R§5.5). The EDM's LeanFind uses the **first cylinder to peak**, which is the leanest. The plan never says whether `r` is the mean or a cylinder. Scenario 7 then checks "LeanFind ROP → GPH matches POH". With the plan's own d_i ≈ ±5%, that check is wrong by the size of the distribution spread.
- **Evidence (calc, plan's numbers).** Take d = (−5, −2, +2, +5)%. With the leanest cylinder at its peak, the mean is r̄ ≈ 1.05, which is the POH recommended-lean flow. With LeanFind set to "50 ROP" on the leanest cylinder, r̄ ≈ 1.10, which is about 5% more fuel (+0.4–0.5 GPH at 65–75%).
  - Read this way, the sources agree with each other:
    - Lycoming SI 1094D for float carburetors puts the probe in the **leanest** cylinder and calls peak "best economy" (R§6).
    - That setting matches the POH recommended-lean flows.
    - The POH warning that "roughness may occur before peak EGT" (tailpipe) is the leanest cylinder misfiring while the mean is still ROP (R§5.5, R§7.3).
- **Change.**
  - Define every fuel anchor on the airflow-weighted **mean** mixture r̄: Fig 3-39 ≈ r̄ 1.00, POH tables ≈ r̄ 1.05, full rich = r̄_FR.
  - Add a computed "tailpipe EGT" (flow-weighted mix of the four EGTs) so the POH procedure can be reproduced in the truth panel.
  - Rewrite the scenario 7 checks:
    - Leanest at peak (LeanFind SET at peak) → GPH = POH ±0.4.
    - LeanFind at 50 ROP → POH +0.3…0.7 GPH.
  - The debrief should teach this difference explicitly. It is the most useful EDM lesson for a carbureted engine.

---

## MAJOR

### M1. The power targets cannot all be met, and the fuel anchors use different power scales (§4.3, §4.4, §7)
- **Problem.** At the same RPM and MAP, the POH %BHP runs about 2–3 points (≈4% of value) **above** the Lycoming chart (R§3.5: 78 vs 75.0, 65 vs 61.8, 75 vs 72.9, 57 vs 54.6). The direction is also odd: the POH is at "recommended lean" (ηp ≈ 0.988), so it should sit *below* the chart, which is at maximum-power mixture.
  - A linear-in-MAP model fitted to the POH extrapolates to ≈186–187 HP at 2700 RPM / 28.65 inHg / SL. That fails the plan's own 180 ±4 check.
  - The fuel anchors mix scales. Fig 3-39 is on the Lycoming "% rated" scale; the POH GPH-vs-%BHP is on Cessna's. Moving 4% of power moves r̄(POH lean) from 1.05 to ≈1.09, about 40–50°F of EGT.
- **Evidence.** The gap is close to a constant number of HP: ≈5 HP ≈ b(N) · 0.6–0.7 inHg, with b ≈ 8 HP/inHg (R§3.1). That shape suggests a MAP-reference offset rather than an efficiency difference.
- **Change.** Choose one reconciliation, document it, and state every fuel anchor on the chosen scale.
  - **(a)** An installed MAP indication offset δ ≈ 0.6–0.7 inHg (ASSUMED): EDM/gauge MAP = chart MAP − δ. Fit it jointly, run the Lycoming checks on chart MAP, and fit the POH cells on indicated MAP.
  - **(b)** One factor k_POH ≈ 1.04 applied to the POH %BHP targets only.
  - Caveat for (a): it makes the POH row "20.5 inHg at 10,000 ft, 2700 RPM" need more ram than exists (see m1). Make that row a soft target.
  - Also: the POH ISA±20 columns were generated with the √T rule. For example, at 2000 ft, 2500/23 reads 77/74/71, which is ±3.6% (calc). So the exponent x is not identifiable. Fix x = 0.5 (Lycoming) and remove it from the fit.

### M2. The fit is not identifiable as posed, and there is no hold-out (§4.3, §4.4, §4.13, §7)
- **Problem.**
  - Power depends on K_i·η_v(N), so K_i and the level of η_v are collinear.
  - GPH depends on η_v·FAR_peak, and FAR_peak is free.
  - The fit can therefore return physically wrong η_v/FAR pairs. Those then mis-scale carb heat, idle and altitude behavior, which are exactly the extrapolations the physical structure is meant to get right.
  - Mass-balance check (calc): 180 BHP × BSFC 0.42 / FAR 0.067 ≈ 0.313 lb/s of air. The ideal swept-volume flow at 2700 RPM / 28.65 inHg is 0.344–0.364 lb/s (charge at 59°F or 30°F), so **η_v ≈ 0.86–0.91**. The plan's range of 0.80–0.88 is at or below the low edge.
  - On the airframe side, CD0 and the η_prop scale are collinear in level cruise (P·η = D·V), and e is weakly identified from cruise cells.
  - The "462 cells" are about 155 independent cells times a deterministic √T rule, so an RMS over all of them overstates validation.
- **Change.**
  - Fix the constants that are known physically:
    - FAR_peak = 0.067 ±0.002 (100LL stoichiometric is about 0.066–0.067).
    - x = 0.5.
    - The η_v level from the mass balance.
    - e and CD0 priors from **NASA CR-2337 Cardinal flight-test data** [S17]. It is already in the research file but unused.
    - η_prop shape from a generic constant-speed-prop map, with one fitted scale factor.
  - Fit at most about 5 engine parameters.
  - Hold out the 4000, 8000 and 12,000 ft sheets for validation.
  - Report parameter standard errors, and assert that each fitted value lies in a physical range.

### M3. Measured MA-4-5 data exists. Use it for r_FR, E(throttle) and the idle/taxi flows (§4.4, §7)
- **Problem.**
  - The 17.5 GPH full-rich anchor is derived, and its arithmetic is off: 0.42 × 180 / 6.0 = **12.6** GPH, not 13.1; × 1.34 gives 16.9.
  - E(throttle), full-rich flow at part throttle, and idle/taxi flow have no anchor at all.
- **Evidence.** The Swiss FOCA made a ground emissions measurement on an O-360-A3A (180 HP) with an **MA-4-5** carburetor, 100LL fuel, DA 915 ft, three runs [N1].
  - Fuel flow (kg/s → GPH at 6.0 lb/gal):
    - Take-off: 0.012 → **15.9**
    - Climb (85%): 13.5
    - Cruise 65%, full rich: **10.3**
    - Cruise 65%, lean: **8.5**
    - Approach (45%): 7.1
    - Taxi: **2.1**
  - CO emission indices: 1132 / 933 / 818 / 293 / 1069 / 1058 g/kg. Converted to φ (C7H13, water-gas K = 3.5, calc, ±0.05): **1.38** / 1.28 / **1.23** / **1.07** / 1.35 / 1.34.
  - The test used a fixed-pitch prop, so "take-off" is a static full-throttle run at reduced RPM. The RPM was not reported (ASSUMED ~2300–2450). Scaling by airflow to 2700 RPM gives ≈17–18.5 GPH.
  - Implications:
    - r_FR at full throttle ≈ 1.31–1.38, which supports 1.34.
    - Full rich at 65% part throttle is only r ≈ 1.17–1.23, so **E falls about 10% from full throttle to cruise throttle**.
    - Idle and taxi run at r ≈ 1.3.
    - "Cruise lean" at 8.5 GPH and φ ≈ 1.07 matches POH 8.6 GPH at 65%, which supports r̄(POH) ≈ 1.05.
- **Change.**
  - Add [N1] to the research file (tag: SIBLING, measured).
  - Replace the BSFC-based derivation with it.
  - Add tests:
    - Full-rich flow ratio at 65% throttle vs. full throttle: 0.85–0.92.
    - Taxi at 1000–1200 RPM: 1.8–2.6 GPH.
    - Full-rich flow at 65% ≈ 1.2 × POH lean flow.
  - Make full-rich take-off flow a personality parameter, range 16–18.5, default ≈17.3. Teach it as a "know your engine's number" check on the take-off roll.

### M4. No real EDM data is in the loop. Get Cardinal EDM logs now (§1.5, §4.8–4.10, §7)
- **Problem.** These all rest on TYPICAL or ASSUMED values:
  - absolute EGT and CHT levels
  - τ_CHT
  - cowl-flap and airspeed effects
  - DIF
  - which cylinder is hottest or leanest
  - take-off flow
  - the EGT rise on a mag check

  Every one of them is recorded directly in EDM data files (per-cylinder EGT/CHT, OIL, CRB, FF, BAT, at 1–6 s intervals). The research hit login walls (gaps 4 and 5), but owners can export their files.
- **Evidence.** A 177B owner (search-level only [N7]) reports #2 and #4 spiking to about 420°F in climb. A reply says "#3 is typically the hottest" and that fixed-gear Cardinals of 1968–74 have chronic baffling problems. The cylinder ranking clearly varies by airplane.
- **Change.**
  - Ask 3–5 Cardinal Flyers members for 10 or more flights each, covering run-up, climb, LeanFind, cruise and descent.
  - Build a log-replay harness: drive the model with the logged RPM, MAP, FF, altitude, OAT and IAS proxies, then compare EGT/CHT/OIL traces (RMS, time constants, CLD peaks).
  - Mark the thermal tests "provisional" until this is done.

### M5. Distribution is a fixed fraction, but on a carbureted engine it depends on throttle angle, RPM, power and induction temperature (§4.4)
- **Problem.** With constant d_i:
  - The JPI technique for carbureted engines (adjust the throttle slightly to level the columns) does nothing.
  - The sim cannot show "EGTs not uniform at low power".
  - Cold-engine spread is tied to OAT only.
- **Evidence.**
  - Pilot's Guide p.18, cruise: "Uneven EGTs/CHTs (carbureted): fine-adjust throttle, RPM, then mixture to level the columns." p.20: "EGTs not uniform at low power — Normal" (`01-MANUAL-EXTRACT`).
  - Lycoming Flyer: spread is worse below freezing [S4 p.41].
  - The induction riser runs through the oil sump, which aids vaporization (R§1.2). So spread depends on sump/oil temperature, not only OAT.
- **Change.**
  - Use d_i = d_i0 · g(θ_throttle, N, T_riser), plus a wet-fuel term.
  - Suggested starting values (ASSUMED, tunable):
    - Spread ×1.3–1.6 at wide-open throttle compared with throttle retarded by about 1 inHg.
    - Spread ×1.5–2 at idle or taxi and with cold oil.
  - Tests:
    - At 75% wide-open-throttle cruise, retarding the throttle 1 inHg and raising RPM to hold power cuts DIF by at least 20°F.
    - Taxi DIF is greater than cruise DIF.

### M6. Rich-side roughness is not modeled, so scenario 6 and carb heat at altitude cannot show it (§4.4, §4.5, §6 #6)
- **Problem.** Only lean misfire is modeled. The Fig 3-1 table stops at full rich at SL (−390°F).
  - At 9000 ft, full rich is r ≈ 1.34/√0.762 ≈ **1.54**. With full carb heat it is ≈ **1.66** (calc).
  - Both are off the table, and monotone cubic interpolation will clamp or extrapolate arbitrarily.
  - The scenario says "lean for smoothness", but in the model nothing is ever rough on the rich side.
- **Evidence.** Lycoming: over-rich roughness is "most likely … in carbureted engines at altitude above 5,000 ft", and is also caused by carb heat (R§6, R§8.2). The POH says to lean above 3000 ft for smoothness (R§5.3).
- **Change.**
  - Extend the power, ΔEGT and ΔCHT curves to r ≈ 1.8:
    - power falls to about 85% at r ≈ 1.6 (ASSUMED)
    - ΔEGT keeps falling at about 1000°F per unit of r
  - Add a rich partial-misfire function with onset at r ≈ 1.5–1.6 (tunable).
  - Tests:
    - Full rich at 9000 ft ISA → roughness flag.
    - Leaning restores smoothness and power.
    - Full carb heat at altitude with full rich → rough.

### M7. The CHT cooling model is mis-scaled (§4.9)
- **Problem.**
  - **Cowl flaps.** A closed-cowl factor of h × 0.8 makes CHT − T_cool 25% higher. At cruise (ΔT ≈ 325°F) that is **≈65°F**, against the plan's own 20–30°F anchor (calc). Hitting 20–30°F needs a factor of 0.91–0.94.
    - The cowl-flap effect should also depend on airspeed. One RV-7 owner reports 15–20°F in a summer max-performance climb and nearly no effect above Vy [N9, forum].
  - **Density.** h ∝ (Δp)^0.5 with Δp = ½ρ·IAS² ignores density. Cooling mass flow is ∝ √(ρ·Δp), so at a fixed IAS it scales as √σ. With fin h ∝ ṁ^0.6–0.8, the result is h × 0.91–0.93 at 8000 ft. That under-predicts climb CHT at altitude by about 25–30°F (calc).
  - **Front/rear bias.** The plan's "front cylinders hotter in climb" inverts the JPI note. JPI says the cylinder with the *greatest cooling* moves from front (climb) to rear (descent). In climb the front cylinders get the most air, and field reports on Lycoming four-cylinder engines put the rear cylinders (#3/#4) hottest [N7, R§7.3].
- **Change.**
  - Use ṁ_cool ∝ √(ρ·(k_q·q + k_s·slipstream(N, P)) · A_exit(cowl)), with h ∝ ṁ^0.7.
  - Make the cowl effect an exit-area term, so it is large at Vy and small at cruise.
  - Calibrate to these targets:
    - cowl open vs. closed: 20–30°F at Vy
    - cowl open vs. closed: ≤10–15°F at cruise
  - Make the default personality rear-hot in climb, keep the descent shift as written, and leave the bias selectable.

### M8. Carb-heat temperature rise is a constant; it must depend on exhaust heat (§4.11)
- **Problem.** A constant ΔT_heat (sized to the 13% loss) makes heat at idle as effective as heat at cruise. That contradicts the POH "apply full heat before closing the throttle" and hides the descent icing trap.
- **Evidence.**
  - The heat source is a muffler shroud. Certification sizes it at 75% power:
    - 14 CFR 23.1093(a)(1): a **90°F rise at 75% MCP in 30°F dry air** for venturi carburetors [N2].
    - CS-23: 50°C [N3].
  - Cross-check (calc), adding up the losses from a 90°F rise:
    - √(519/609) = 0.923, so −7.7%
    - loss of ram plus alternate-air ΔP of about 0.7–1 inHg: −4% to −5%
    - richening: −1.5%
    - total ≈ −13% to −14%. That matches the POH's 13%, so the official anchor and the POH value are consistent.
- **Change.**
  - Model ΔT_heat = ε(ṁ_air)·(T_muff − T_inlet), where T_muff lags mean EGT and exhaust flow (τ ≈ 60–120 s, ASSUMED).
  - Use the 90°F rise at 75% as the anchor and 13 ±2% at full throttle as the check.
  - Tests:
    - After 2 min at idle, applying heat gives less than about 40% of the cruise rise.
    - Heat applied before the power reduction stays effective for 1–2 min.
    - At run-up (1800 RPM), heat costs 75–100 RPM [S10].

### M9. Detonation and pre-ignition have no causal model, and the planned signatures partly contradict the evidence (§4.6, §4.8, §6 #14–15)
- **Problem.**
  - Neither condition has an onset criterion, so the cures (enrich, reduce power, open cowl) cannot be shown to work. They would have to be scripted.
  - The scenario 14 setup ("ISA+25, full power, leaned") is not a credible way to detonate an 8.5:1 O-360 on 100LL. Lycoming's listed causes are low-octane fuel, high CHT and charge temperature, leaning at high power, and carb heat at high power (R§9).
- **Evidence.**
  - **Detonation.** JPI says EGT decreases. A documented case says "dramatic, rapid rise in CHT … virtually no change in EGT" [N5].
  - **Pre-ignition.** JPI says off-scale EGT above 2000°F. In the same case, the pre-igniting cylinder's EGT **dropped** to the coolest of six while CHT went 310 → 384°F in 30 s and 463°F at 60 s [N5]. Busch reports CHT rising at about 1°F/s and an engine destroyed in about a minute [N6].
  - A trainee taught to wait for an off-scale EGT could miss the real cue, which is a rapid single-cylinder CHT rise.
- **Change.**
  - Add a knock-margin index K = f(charge T, CHT_i, MAP, r_i, timing, octane, carb heat). Knock is worst near best-power-to-peak mixture and is relieved by enrichment.
  - When K > 1 (detonation): q_i × 1.3–2, EGT change 0 to −30°F.
  - Pre-ignition (from a hot-spot fault or sustained heavy detonation):
    - CHT rises at +1–3°F/s.
    - The affected cylinder's EGT falls by 100–300°F. This is the default.
    - Offer the JPI "EGT > 2000°F" as a selectable variant, and have the debrief say which cue is primary.
  - Rebuild scenario 14 around a credible cause: misfuel with low octane, or advanced timing plus high CHT plus best-economy leaning above 75%.
  - Checks: the rate of CHT rise, and recovery within N seconds of enriching or reducing power.

### M10. Spark-plug fouling has no state, so taxi leaning and burn-off can't be taught or checked (§4.6, §6 #2b, #11)
- **Problem.** Fouling is a static fault. The "lean-and-burn-off" procedure in scenarios 2b and 11, and the rich-idle fouling the user asked about, need the fouling to build up and clear over time.
- **Evidence.** The POH warns that long idling at low RPM may foul plugs (R§5.6). The POH fouled-plug procedure is to lean to the cruise setting for several minutes, then try richer if that fails (R§9). Lead fouling builds at low plug temperature with a rich mixture.
- **Change.**
  - Give each plug a fouling state F: dF/dt = a·rich(r)·cold(CHT)·lowRPM − b·hot(EGT, CHT)·lean.
  - The plug misfires intermittently and then continuously as F passes a threshold.
  - Tests:
    - 20 min at 700 RPM full rich on a cold day → one plug fails the mag check (drop over 150 RPM, its EGT bar falls on that magneto).
    - 1–2 min leaned at 1800–2000 RPM clears it.
    - Taxiing leaned produces no fouling.

### M11. Scenarios a Cardinal/EDM pilot must practice are missing (§6)
Listed in priority order, each with its signature:
- **(a) Descent mixture and go-around.**
  - Leaving the 9000 ft cruise setting into the descent makes r ∝ √σ about **10% leaner** by 2000 ft (calc). EGTs rise through peak and the leanest cylinder misfires.
  - A go-around with the mixture still leaned gives a power shortfall and roughness.
  - Procedure: richen gradually in the descent [S4 p.51]. For the go-around: full throttle, carb heat cold, and full rich (or lean for max power above 3000 ft) (R§5.7).
  - This needs a go-around flight-path mode.
- **(b) Taxi leaning and idle plug fouling.** Needs M10.
- **(c) High-power cruise above 75%** (e.g., 2500/24 at 2000 ft = 78%).
  - The EDM %HP display gates the procedure: no peak-EGT leaning, and stay rich per Lycoming (R§6; JPI caution p.14).
- **(d) Diagnostic "rough engine".** The cause is drawn at random from: carb ice, fouled plug, magneto failure, too lean, too rich, induction leak. The trainee isolates it using the EDM, a mag switch, carb heat and the mixture, following the POH rough-running logic (R§5.7, R§9).
- **(e) Carb heat in cruise, then re-lean.** Heat richens the mixture and EGT shifts (POH, R§5.7). Includes the partial-heat trap below −18°C (POH p.4-20).
- **(f) Cold-weather operations.**
  - −10°C start with a preheat decision.
  - High oil pressure and slow prop cycling at run-up.
  - Oil below 140°F in cruise without the 177B winter kit (R§7.5).
  - Partial-heat trap.
- **(g) Heavy rain or induction-filter blockage.** MAP loss; carb heat (unfiltered alternate air) restores it (R§5.7, R§9).
- **(h) Tank run dry.** The EDM fuel flow flickers and drops, EGTs rise (leaning) and then collapse, and the restart uses BOTH plus the aux pump.

---

## MINOR

### m1. The ram target exceeds dynamic pressure (§4.2)
- **Problem.** The plan targets "cruise ram recovery 0.5–1 inHg".
- **Evidence (calc).** Total q is 0.60 inHg at 130 KTAS / 10,000 ft and 0.69 inHg at 120 KTAS / SL. Recovery cannot exceed q, and a filtered up-draft inlet typically recovers 50–80% of it.
- **Change.** Set k_ram = 0.5–0.8. Treat the POH "20.5 inHg" rows as soft targets (±0.4).

### m2. The fine-pitch constant K_fp is over-constrained (§4.7)
- **Problem.** The plan asks for static RPM 2550–2650 *and* run-up MAP 20–22 inHg at 1800 RPM. With P ∝ N³, static 2600–2675 implies ≈52–55 HP at 1800, which is **≈17.7–18.3 inHg** on the extrapolated Lycoming lines (a ≈ 70.4, b ≈ 6.39) (calc).
- **Evidence.** McCauley practice is for the low-pitch stop to give static RPM 25–100 below rated [N8, search-level].
- **Change.** Target static RPM 2600–2675. Make run-up MAP an output check of 17–19.5 inHg.

### m3. The governor coarse-stop condition is wrong, and windmilling is missing (§4.7)
- **Problem.**
  - The coarse stop is reached at **high power**, high TAS and low lever RPM, because the blade must go coarse to absorb the power. At low power the blade moves toward the fine stop. The plan's "(… low power)" has the cause reversed.
  - g(J) must go negative (windmilling), or idle descents get the wrong RPM and MAP.
- **Change.** Correct the coarse-stop condition and let g(J) go negative.
- **Tests.**
  - Idle at 130 KIAS holds the lever RPM.
  - Idle at 65–70 KIAS falls below the lever RPM.
  - A dive at cruise power with a low RPM setting overspeeds once at the coarse stop.

### m4. η_v has no residual-gas (MAP/P_exh) term (§4.2)
- **Problem.** Idle MAP and low-power airflow/GPH will be off. The power equation carries a back-pressure term, but the airflow equation does not.
- **Change.** Use η_v(N)·[1 − c·(P_exh/MAP − 1)] in both the airflow and power equations. Check idle MAP at 10–13 inHg.

### m5. EGT_peak uses %power as its load, which is circular (§4.8)
- **Problem.** %power depends on r and on ignition.
  - Leaning past best power lowers the E1·%power term, which distorts the Fig 3-1 shape by about −9°F at peak.
  - Single mag (−6% power) offsets the +50–100°F rise by about −16°F (calc).
- **Change.** Use airflow (ṁ_air, or MAP·N) as the load variable.

### m6. Fig 3-1 power is brake %; the plan applies it to indicated power (§4.3, §4.5, §7)
- **Problem.** Applying it to indicated power is physically fine, but it needs a conversion at the chart's reference condition.
- **Change.**
  - Convert with ηp_ind = 1 − (1 − ηp_brake)·BHP/IHP at 65–75% power.
  - Run the "±1% / ±5°F" mixture-curve test single-cylinder, with d = 0, at that reference. Otherwise it is either tautological or contaminated by distribution.

### m7. Lean misfire is a hard threshold (§4.4)
- **Problem.** A step at r_misfire makes the misfire flicker on and off. Real lean roughness is progressive.
- **Change.**
  - Use a per-cycle misfire probability p(r_i), logistic, 50% at r_misfire, width about 0.02. Drive roughness amplitude and the EGT/CHT reductions in proportion to p.
  - On a single mag, shift the threshold 0.02–0.03 richer. This also reproduces the POH remark that "a smooth drop off past normal is usually a sign of a too lean or too rich mixture" (R§5.6).

### m8. The Lycoming 10.5 GPH at 75% is not a clean "100 ROP" anchor (§4.4)
- **Problem.** Against Fig 3-39, 10.5/9.6 = 1.094 at 75%, but 9.5/8.2 = **1.16** at 65% (R§3.6, R§4.1). The operating-conditions table is "best-power-ish", not a constant ROP setting.
- **Change.** Use it only as a loose check: r̄ between 1.08 and 1.18.

### m9. The POH claim "≈10% more range, −4 kt at peak" conflicts with Fig 3-1 and Fig 3-39 (§4.4)
- **Problem.** The claim can't be reproduced from the other anchors.
- **Evidence (calc).**
  - Fig 3-39 vs. the POH gives only −5% fuel at 65%.
  - Fig 3-1 from 50 ROP to peak gives −2.3% power, which is about −1 kt.
  - With ±5% distribution the model gives about +4% range and −1 to −1.5 kt.
  - The Lycoming Flyer says peak costs "two or three mph" (R§6).
- **Change.** Do not make it a test target. Quote it in the debrief with this caveat.

### m10. The carb-ice kinetics double-count and are uncalibrated (§4.11)
- **Problem.**
  - The P_ice zones already include the carburetor cooling, so multiplying by w(CRB) counts it twice.
  - The zone categories are qualitative. The BEA notes that the risk-zone "criteria … are not defined objectively" [N3].
- **Evidence.** BEA bench and flight observations [N3]:
  - Onset needs several minutes.
  - About 150 RPM is lost within a few minutes once ice starts (fixed-pitch prop).
  - Heat clears the ice "almost instantaneously" with a brief dip.
  - Ice can shed by itself after about 10 min at 2000 RPM.
  - Carburetor-body temperature matters. On the O-360 the carburetor sits on the oil sump.
- **Change.**
  - Use one mechanism: accretion ∝ moisture flux × f(T_throttle ≤ 0°C). Keep the zones for validation only.
  - Calibrate to the BEA timescales and expose an "icing severity" instructor knob.
  - State the CRB probe location assumption (downstream of the venturi, near the throttle plate).

### m11. The humid-air effect is unused (§4.1, §4.3, §4.4)
- **Problem.** The research cites the Lycoming Flyer "Wet Air Effect" (R sources, [S4 p.64]), but the plan uses humidity only for icing.
- **Evidence.** Water vapor displaces air, costing about 1–4% power on hot humid days, and the carburetor meters vapor as if it were air, which richens the mixture.
- **Change.** Use the dry-air partial pressure in both the power equation and r.

### m12. The carburetor characteristic is a single E(throttle) term (§4.4)
- **Problem.** The idle system and its transition to the main system are not modeled.
- **Change.**
  - Model full-rich FAR against airflow (idle → transition → main → enrichment), anchored to M3.
  - Add the idle-mixture check: pulling to idle cut-off at a 650–750 RPM warm idle gives a **25–50 RPM rise** before the engine stops [N4] (verify against the Lycoming OM text).

### m13. The throttle rate limit contradicts itself (§5 vs §4.7)
- **Problem.** §5 rate-limits the throttle to "≥2–3 s full travel"; §4.7 says no guard is enforced.
- **Change.** Do not hard-limit. Detect a full-travel movement in under 2 s and log it for the debrief (A1F6 counterweight detuning).

### m14. Cowl flaps are open/closed only (§5)
- **Problem.** The POH says to set the cowl flaps "to keep CHT at approximately three-fourths of the normal operating range", which is ≈425°F (R§2, R§7.6). Binary flaps can't do that.
- **Change.** Make the cowl flaps continuous (or 3-position).
- **Test.** The trainee can hold the hottest CHT at 425 ±15°F in cruise using the cowl flaps.

### m15. The electrical failure timing and alarm sequence are off (§4.12)
- **Problem.**
  - With the alternator off and a 20–25 A load, a 33 Ah battery's terminal voltage drops to ≤12.0 V within minutes (internal resistance plus surface charge), not 20–40 min.
  - If the over-voltage relay trips at ≤16.0 V with no delay, the EDM H BAT alarm (>16.0) may never show.
- **Change.** Use a Thevenin/Shepherd battery model. Set the OV trip at 16.3–16.5 V with a 1–2 s delay (ASSUMED). Add a test that both alarms actually appear.

### m16. The EDM %HP is fed true BHP (spec ANA-11 [SIM])
- **Problem.** Once the engine is calibrated, this makes the EDM a perfect dynamometer. A real EDM-800 calculates %HP from RPM, MAP and FF plus the HP constant, so it reads differently with carb ice, full rich at altitude, and LOP.
- **Change.** Compute %HP from the sensor values (a JPI-like formula). Show true BHP only in the truth panel.

### m17. EGT noise is too low to reproduce the false-peak misapplication (§4.8)
- **Problem.** With σ = 3°F and a 6 s correlation time, the Pilot's Guide p.20 problem ("peak found too soon" when stopping or leaning slowly) almost never happens. Carbureted EGTs are noisier.
- **Change.** Calibrate σ to about 4–8°F (ASSUMED). Target: a 10 s pause near peak gives a false peak 30–60% of the time, and leaning at 10°F/s almost never does. Test it statistically across seeds.

### m18. Distribution does not conserve fuel and air (§4.4)
- **Problem.** If the d_i are not normalized, GPH changes with the personality seed.
- **Change.** Normalize so Σ ṁ_i·d_i = 0. Allow a separate air-distribution term as well.

### m19. Tests are missing (§7)
Add:
- **(a) Robustness.** Run every signature test at both ends of every ASSUMED range and over at least 20 seeds (property-based), so no lesson depends on a guessed value.
- **(b) Sign and monotonicity.**
  - ∂MAP/∂throttle > 0
  - carb heat → MAP down, RPM unchanged when governing
  - r ∝ 1/√σ
  - ∂EGT/∂r has the correct sign on each side of peak
- **(c) Fast-forward equivalence.** Fast-forward must be bit-identical to stepping at 50 ms.
- **(d) Fuel mass balance.** Tank decrease = ∫FF = EDM USED (with K-factor 1).
- **(e) Golden traces.** Store an EDM display/alarm golden trace per scenario for regression.
- **(f) Hold-out sheets.** See M2.
- **(g) Mixture-curve test at its reference.** See m6.

### m20. The implementation order has hidden couplings (§8)
- **Problem.**
  - The Phase-1 POH fit already needs ηp(r) and the mean-mixture definition (Phase 2).
  - The ROC tests need the airframe (Phase 3).
  - The UI comes last, so ergonomics (lean rate per keypress, lever map) are found late.
- **Change.**
  - Build a steady-state trim solver first; the 462-cell fits need it.
  - Then build a thin vertical slice: cruise trim → mixture → EGT → LeanFind through the EDM.
  - Add a minimal dev UI (knobs plus truth panel) by Phase 2.

---

## SUGGESTION

- **S1. Fuel-flow transducer.** The transducer sits upstream of the float bowl. Add a small lag and float-valve flow noise. Add the accelerator-pump squirt on rapid throttle opening, which shows as an EDM FF spike and a brief EGT dip. A failed pump gives a lean stumble.
- **S2. Cold-oil effects.** Make friction, oil pressure (up to 115 psi cold, R§2), idle RPM and prop-cycle response depend on oil temperature.
- **S3. CHT probe type in the personality.** A gasket probe reads 20–50°F above a bayonet probe (JPI p.21).
- **S4. Fast-forward.** Auto-pause on any alarm or scripted event so the trainee doesn't skip the signature. Show a "time compressed" banner.
- **S5. Truth panel.** Add tailpipe EGT, per-cylinder misfire %, knock margin and plug fouling state. Debrief plots should overlay the POH and Lycoming reference points.
- **S6. Ice model details.** Add carburetor-body temperature (heat soak from the sump-mounted carburetor) and stochastic ice shedding (BEA [N3]).
- **S7. Advanced emergency.** Add a D4LN dual-magneto common-drive failure (A1F6D), which loses both magnetos. Add a P-lead-open ("hot mag") safety note to the run-up debrief.

---

## Q5: ASSUMED values ranked by training impact

| Rank | Value | Why it matters | Handling |
|---|---|---|---|
| 1 | d_i spread and leanest/hottest cylinder | LeanFind result, DIF, LOP scenario, B1 offsets | Real logs (M4); presets plus seed; property tests (m19a) |
| 2 | Absolute EGT (E0, E1) | What the trainee learns is "normal" | Anchor at JPI 1350 / take-off 1100–1250; tunable ±75°F; teach relative values (Normalize, Δ) |
| 3 | CHT h0, τ, cowl and airspeed terms | CHT alarm, CLD, hot-climb lessons | Logs; M7 model; tunable "cooling quality" (baffle condition) |
| 4 | Full-rich flow / r_FR / E | Take-off FF check, climb EGT | M3 (measured); tunable 16–18.5 GPH |
| 5 | Carb-heat rise and ice kinetics | Ice recognition and timing | 90°F at 75% anchor (M8); BEA timescales; severity knob |
| 6 | Lean and rich misfire thresholds | Roughness lessons | Logistic, tunable (m7, M6) |
| 7 | Static RPM / K_fp | Run-up realism | McCauley 25–100 RPM below rated (m2) |
| 8 | Oil warm-up, vernatherm, battery | Secondary alarms | Typical values; tunable |
| 9 | Lever-travel map | User experience only | ASSUMED; tune by user testing |

Every ASSUMED parameter should carry {nominal, range, tag}. The UI's "about this simulation" note should list them.

## Answers to the plan's §9 questions

- **Absolute EGT/CHT on typical anchors: acceptable?** Yes for training, if four conditions hold:
  - the values are labeled as such
  - the lessons are taught as relative patterns
  - the values are instructor-tunable
  - the signatures pass across their ranges (m19a)

  Replace them with log data when it is available (M4).
- **POH vs. Lycoming disagreement.** It must be reconciled explicitly; see M1.
- **Full-rich flow.** It now has a measured basis (M3). The lever map is a user-interface choice.
- **Flight-path modes vs. stick flying.** Adequate. IAS-hold climb and VS/IAS descent are the right controls for CHT and shock-cooling training. Add a go-around mode (M11a).
- **Carb-ice kinetics.** Acceptable as tunable parameters calibrated to the BEA observations (m10).

## Overall assessment

The architecture is right for the job, and it is unusually well sourced. The physical structure gets the qualitative signatures right without special cases:
- speed-density airflow with a throttle-orifice MAP solve
- float-carburetor 1/√σ richening
- separate governed and fine-pitch regimes
- per-cylinder mixture curves
- first-order thermal models

That covers MAP drop with constant RPM for ice and carb heat, RPM drop at run-up, richening with altitude and carb heat, and the mag-check EGT rise.

The weaknesses are in calibration semantics and a few missing mechanisms:
- **Mixture reference.** The anchors silently mix the tailpipe/mean mixture with the EDM's leanest cylinder (B1).
- **Power scale.** The POH and Lycoming power scales are combined without reconciliation (M1).
- **Identifiability.** Several fitted parameters are not identifiable (M2).
- **Missing mechanisms.** Rich roughness, power-dependent carb heat, a causal detonation model, plug-fouling dynamics, and throttle-dependent distribution are absent. Each one is needed for a lesson the plan promises.
- **Cooling scaling.** The CHT cooling model's scaling contradicts its own anchors.

Fix B1, M1 and M2 before writing code. Fold in the FOCA measurement (M3) and start collecting real Cardinal EDM logs (M4) now. With those done, v2 should give a simulator whose EDM pictures an experienced Cardinal/EDM pilot would recognize and that does not teach anything wrong.

## What's good

- **Data first, with provenance.** One `calibration.js` holds every constant, each with a provenance tag, and gaps are stated honestly.
- **Physical structure.** It extrapolates sensibly to carb heat, ice, altitude and faults.
- **Correct constant-speed-prop signatures.** Ice and carb heat give a MAP drop with RPM held. The run-up happens on the fine-pitch stop, so mag and carb-heat checks show as RPM drops.
- **Float-carburetor physics.** The mixture richens with altitude and carb heat by the correct law.
- **Lean misfire before peak.** This makes the "LOP with a float carburetor" lesson honest.
- **Tests through the real EDM state machine.** The model is deterministic and seeded.
- **Fast-forward advances the EDM too.** The placeholder's `thermalSpeed` cheat is dropped.
- **Scenario library.** It is broad and tied to POH, Lycoming and JPI debriefs, with instructor-selectable engine personalities.

---

## New sources

- **[N1]** Swiss FOCA, *Engine Exhaust Emissions Measurement — Piston Engines*, Lycoming O-360-A3A with MA-4-5 carburetor, ground-based, fixed-pitch prop, 18 Oct 2005: https://www.bazl.admin.ch/dam/de/sd-web/ehcjwBxPuGxo/p002foca_lyc_o-360.pdf. Fuel flows and EI CO by mode. φ values are my derivation (C7H13, water-gas K = 3.5).
- **[N2]** 14 CFR §23.1093(a)(1) (2001 ed.): preheater giving a 90°F rise at 75% MCP in 30°F air, venturi carburetors: https://www.gpo.gov/fdsys/pkg/CFR-2001-title14-vol1/pdf/CFR-2001-title14-vol1-sec23-1093.pdf. The 177B's CAR 3 basis likely has an equivalent requirement; verify.
- **[N3]** BEA, *Piston engine induction icing study — synthesis* (EN, Dec 2023): https://bea.aero/fileadmin//user_upload/Synthese_etude_givrage_EN_041223.pdf. Covers: zones "not defined objectively"; CS-23 float-carburetor heat rise of 50°C at 75%; bench/flight icing timescales; heat clears ice almost instantly; self-shedding after about 10 min; carburetor-body temperature.
- **[N4]** Kitplanes, "Carburetor Maintenance" (idle-mixture rise 25–50 RPM, warm idle 650–750): https://www.kitplanes.com/carburetor-maintenance/. AvWeb, same 25–50 RPM window: https://www.avweb.com/news/maint/182900-1.html. Both search-level; verify against the Lycoming OM idle-adjustment text.
- **[N5]** M. Cook, "An Engine Near Miss", *Aviation Safety*/Flying, 2004: https://www.flyingmag.com/?p=12553. Detonation: rapid CHT rise, virtually no EGT change. Pre-ignition: EGT dropped to coolest, CHT 310 → 384 → 463°F at 30/60 s.
- **[N6]** M. Busch, "How to destroy your engine in one minute", AOPA, 13 Apr 2015: https://www.aopa.org/news-and-media/all-news/2015/april/13/how-to-destroy-your-engine-in-one-minute. CHT rising at about 1°F/s; advanced timing gives lower EGT and higher CHT.
- **[N7]** General Aviation News, "What is fueling high engine temps?" (1972 177B owner, #2/#4 at about 420°F in climb; reply: "#3 is typically the hottest", Cardinal baffling), 14 Sep 2017: https://www.generalaviationnews.com/2017/09/14/what-is-fueling-high-engine-temps. FORUM/TYPICAL, search-level only (HTTP 403).
- **[N8]** McCauley guidance as quoted on Van's Air Force (static RPM against the low-pitch stop should be 25–100 below rated; the governor is not in control): https://vansairforce.net/threads/check-your-cs-prop-%E2%80%9Clow-pitch%E2%80%9D-stops.224013/page-2 and https://vansairforce.net/community/threads/hartzell-propeller-low-pitch-setting.92389/latest. Search-level; exact post not opened (HTTP 403).
- **[N9]** Van's Air Force, "Anti-Splat Aero cowl flap" (RV-7 owner: 15–20°F cooler in a summer max-performance climb, nearly no effect above Vy): https://vansairforce.net/threads/anti-splat-aero-cowl-flap.175091/. FORUM, search-level.
