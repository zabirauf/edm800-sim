# Lycoming O-360-A1F6(D) / Cessna 177B Cardinal: engine data for the EDM-800 simulator

Research compiled 2026-10-27. Every value has a source tag `[S#]` (list at the end). Provenance labels:

- **OFFICIAL**: Lycoming or Cessna publication, FAA, or a national CAA.
- **SIBLING**: official, but for a related engine or airframe (another O-360 dash number, the 177RG, and so on).
- **TYPICAL**: instrument-maker or magazine/expert "normal" value. Not a limit.
- **FORUM**: owner report. Anecdotal.
- **DERIVED**: calculated or digitized by me from a sourced chart or table. The method is stated.

**Main caveats** (details in §10):

- **[S2] is a retyped POH.** It is a 1977 Cessna 177B POH (s/n 17702629) that a flying club retyped as a Word document, not a scan. Its values match Cessna's style and cross-check internally, but it contains some transcription typos. Each one I found is flagged.
- **The Lycoming charts were digitized by me.** I read the Lycoming curves off an 18 MB scanned operator's manual [S1] using pixel analysis at 300 dpi. Accuracy is about ±1–2 HP, ±0.1–0.2 GPH and ±0.1 inHg.

---

## 0. Quick reference: the numbers that matter most for the sim

| Item | Value | Source |
|---|---|---|
| Engine | Lycoming O-360-A1F6D (1975–78 177B); O-360-A1F6 (1970–74 177B). Same performance curves. | [S1 §1 p.1-1][S5] |
| Rating | 180 BHP @ 2700 RPM, takeoff and continuous. 361 in³, CR 8.5:1, 25° BTC, firing order 1-3-2-4. | [S1 p.2-1][S2 §2] |
| Prop | McCauley 2-blade constant speed, 76 in (min 75 in). Low pitch 12.1°, high 26.0° at the 30 in station. | [S2 §1, §2] |
| Tach | Green 2100–2500 (SL–8000 ft, inner arc); 2100–2700 (above 8000 ft, outer arc). Yellow 1700–1900 (avoid continuous operation below 10 inHg). Red 2700. | [S2 Fig 2-3, §7] |
| MAP | Green 15–24 inHg. No red line. | [S2 Fig 2-3] |
| CHT | Red line 500°F. Green 200–500°F (POH). Lycoming: keep below 435°F in high-performance cruise and below 400°F in economy cruise. In-flight minimum 150°F. | [S2][S1 p.3-6][S4 p.52] |
| Oil temperature | Red line 245°F. Green 100–245°F. Desired about 180°F inlet. No lower than 140°F in continuous operation. | [S2 §7][S1 p.3-11] |
| Oil pressure | 25 psi minimum (idle, red). 60–90 psi green. 100 psi maximum (red). | [S2 Fig 2-3] |
| Fuel pressure | 2–8 psi (POH). Lycoming carburetor inlet: 0.5 min / 3.0 desired / 8.0 max. | [S2][S1 p.3-10] |
| Carb air temperature gauge | −30 to +30°C. Yellow arc −15 to +5°C. | [S2 §7] |
| Fuel flow at 100% power | ≥14.8 GPH ("minimum allowable"). | [S1 Fig 3-39] DERIVED digitization |
| Fuel flow at 75% / 65% | Lycoming operating-conditions table: 10.5 / 9.5 GPH (2450 / 2350 RPM). POH "recommended lean" (50°F ROP): about 9.9 / 8.6 GPH. | [S1 p.3-12][S2 §5] DERIVED fit |
| Mixture landmarks | POH recommended lean = 50°F ROP. Best economy = peak EGT (about 10% more range, about 4 kt slower). Lycoming best power (float carburetor) = 100°F ROP. Max-power cruise: never leaner than 150°F ROP. | [S2 Fig 4-4][S3][S1 p.3-6] |
| Run-up | 1800 RPM. Mag drop ≤150 RPM, differential ≤50 RPM. Carburetor heat: "check for RPM drop". | [S2 §4] |
| Full carburetor heat at full throttle | About 13% power loss. | [S2 §7 p.7-14] |
| Shock cooling | ≤50°F per minute CHT change. | [S3][S4] |
| Electrical | 14 V system, 60 A alternator, 12 V 33 Ah battery. Over-voltage trip at about 16 V. | [S2 §3, §7] |

---

## 1. Identification: models, engine, prop, carburetor, ignition, layout

### 1.1 Cardinal fixed-gear models and engines (OFFICIAL / Cardinal Flyers)

| Model | Model years | Serial numbers | Engine | Prop | Source |
|---|---|---|---|---|---|
| 177 | 1968 | 17700001–17701164 | O-320-E2D, 150 hp | McCauley fixed pitch | [S5a] |
| 177A | 1969 | 17701165–17701370 | O-360-A2F, 180 hp | McCauley fixed pitch | [S5b] |
| 177B | 1970–1974 | 17701371–17702123 | O-360-A1F6, 180 hp | McCauley constant speed | [S5c] |
| 177B | 1975–1978 | 17702124–17702752 | O-360-A1F6D, 180 hp | McCauley constant speed | [S5d] |

- **Model years.** The 177B began in **1970**, not 1971 [S5c]. The 1970 prototype was s/n 17700002 [S17].
- **Type certificates.** The airframe is on FAA TCDS **A13CE** (177 and 177B). **A20CE** is the 177RG, so it does not apply to the 177B [S8].
- **Engine certificate.** The engine is on FAA Type Certificate **E-286**. The Lycoming manual lists it as "FAA Type Certificate 286" [S1 p.2-1]. I could not retrieve the TCDS PDFs themselves; see §10.
- **A1F6 vs. A1F6D.** Lycoming states that "all information pertinent to the O-360-A1F6 will apply to the O-360-A1F6D" and that "performance curves and specifications for the basic model will apply" [S1 p.1-1].
  - The **"D"** means dual magnetos in a single housing.
  - The **"6"** means a crankshaft with pendulum (dynamic) counterweights [S1 p.1-1, 1-3].

### 1.2 Engine specification: O-360-A series (OFFICIAL [S1 p.2-1, p.1-1..1-4, p.2-8])

| Item | Value |
|---|---|
| Type | 4-cylinder, horizontally opposed, direct drive, air cooled, wet sump. Carbureted, normally aspirated. |
| Rated power | 180 HP @ 2700 RPM |
| Bore × stroke | 5.125 × 4.375 in |
| Displacement | 361.0 in³ |
| Compression ratio | 8.5:1 |
| Firing order | 1-3-2-4 |
| Spark timing | 25° BTC |
| Propeller drive | 1:1. Clockwise rotation viewed from the rear. |
| Dry weight | A1F6D: 295 lb. A1F6: 298 lb. |
| Carburetor | Marvel-Schebler **MA-4-5**: single-barrel float type, manual mixture, idle cut-off. The POH calls it "up-draft, float-type, fixed jet carburetor mounted on the bottom of the engine… enclosed accelerator pump… idle cut-off… manual mixture control" [S2 §7 p.7-14]. |
| Induction | "Center zone" induction. The riser is integral with the oil sump and submerged in oil, which aids fuel vaporization and cools the sump oil. Individual intake pipes run to each cylinder [S1 p.1-2]. |
| Magnetos | A1F6D: one Bendix **D4LN-3021** dual magneto. A1F6: S4LN-1227 (left) and S4LN-1209 (right) [S1 Table 1]. Two plugs per cylinder. |
| Plug wiring (177B) | The right magneto fires the lower right and upper left plugs. The left magneto fires the lower left and upper right plugs [S2 §7 p.7-13]. So each magneto fires one plug in every cylinder. |
| Minimum fuel grade | O-360-A: **100/100LL** [S1 p.3-10]. The POH approves 100LL (blue) and 100, formerly 100/130 (green) [S2 §1]. |
| Oil | Sump 8 US qt [S1 p.3-11]. The 177B holds 8 qt in the sump plus 1 qt in the filter, 9 qt total. Do not operate on less than 6 qt. Fill to 7 qt for flights under 3 h [S2 §1, §7, §8]. Lycoming's engine minimum safe quantity is 2 qt [S1]. |
| Max oil consumption | 0.80 qt/h at rated power, 0.45 at 75%, 0.39 at 65% [S1 p.3-12] |

### 1.3 Cylinder numbering (OFFICIAL [S1 p.1-1])

Lycoming's definition: "cylinders are numbered from front to rear, odd numbers on the right." Left and right are taken with the observer facing the rear of the engine, which is the same as the pilot's view.

```
            PROPELLER (front)
   LEFT (pilot's left)     RIGHT (pilot's right)
        #2  (front)          #1  (front)
        #4  (rear)           #3  (rear)
            FIREWALL (rear)
   Firing order 1-3-2-4 (one cylinder fires every 180° of crank rotation)
```

### 1.4 Propeller (177B, OFFICIAL [S2 §1 p.1-3, §2 p.2-3, §7])

- **Make and model.** McCauley two-blade, constant speed, governor regulated, hydraulically actuated (oil pressure drives toward high pitch). The 1977 POH gives the model as **B2D34C211/82PCA-6** in §1 and **B2D34C211/82PCE-6** in §2. One of these is a transcription error.
- **Diameter and pitch.** Diameter 76 in maximum, 75 in minimum. Blade angle at the 30 in station: low 12.1°, high 26.0°.
- **Limitation.** "Avoid continuous operations between 1700 and 1900 RPM with less than 10 inches manifold pressure."
- **Earlier props (SIBLING).** Hartzell's 177B replacement-prop sheet lists original 177B props as McCauley "C202" (76 in), "C206" (78 in) and "C208" (76 in), which vary by year [S6]. The Hartzell replacement, HC-C2YR-1BFP/F7694-1.5 (76.5 in), carries the placard "Continuous operation is prohibited between 2000–2300 RPM with less than 8 inches manifold pressure" [S6]. That applies only to the Hartzell prop.

### 1.5 Instruments and exhaust as delivered (177B, OFFICIAL [S2 §7 p.7-11/12])

- **Gauges.** Oil pressure (electric transducer), oil temperature (electrical resistance), CHT (electrical-resistance sensor on one cylinder; which cylinder is not stated), mechanical tachometer, MAP, and fuel pressure.
- **Optional EGT.** The Cessna "Economy Mixture Indicator" uses a **single thermocouple in the engine tailpipe**. Each cylinder's exhaust "passes through riser assemblies to a muffler and tailpipe."
- **Optional carb air temperature gauge.**
- **Shared voltage effect.** "As electrical system voltage to the instrument cluster drops, all gage readings will drop proportionally" [S2 §3 p.3-12]. This is a classic low-voltage symptom for the sim's factory gauges, not for the EDM.

---

## 2. Limits and instrument markings: 177B POH vs. Lycoming

| Parameter | 177B POH marking / limit [S2 Fig 2-3, §2, §7] | Lycoming O-360-A limit [S1 p.3-6..3-12] | Notes |
|---|---|---|---|
| RPM | Red 2700. Green 2100–2500 (SL–8000 ft) and 2100–2700 (≥8000 ft). Yellow 1700–1900. | Rated 2700. Ground: warm up at 1000–1200, do not exceed 2200 on the ground. Full-throttle ground run ≤3 min. | POH: "2500 to 2700 RPM may be used at any altitude during hot day conditions." Cruise at 2500 allows 75% up to 8000 ft standard; 2700 allows 75% up to 10,000 ft [S2 p.4-14, 7-11]. |
| MAP | Green 15–24 inHg. No red line. | — (normally aspirated) | Cruise: "15–24 inches Hg, 2100–2700 RPM (no more than 75% power)" [S2 §4]. |
| Max power | 180 BHP, takeoff and continuous | 180 HP @ 2700 | |
| CHT | Red 500°F (260°C). Green 200–500°F. | Max 500°F at the bayonet. Service life: 150–400°F continuous; <435°F high-performance cruise; <400°F economy cruise. | Cowl flaps "to keep CHT at approximately three-fourths of the normal operating range (green arc)" [S2 p.4-14, 7-14]. DERIVED: 200 + 0.75 × 300 = **≈425°F**. |
| Oil temperature | Red 245°F (118°C). Green 100–245°F (38–118°C). | Max inlet 245°F. Desired inlet 180°F above 30°F ambient (170°F for 0–70°F ambient, 160°F below 10°F ambient). Not below 140°F in continuous operation. | Figure 2-3 in the retyped POH prints the green arc as "100°–125°F". The §7 text gives 100–245°F, so 125 is a typo. SI 1094D: 165–220°F for maximum service life [S3]. |
| Oil pressure | Red minimum 25 psi (idle). Green 60–90. Red maximum 100. | Normal 55–95 psi. Idle 25. Start/warm-up/taxi/takeoff max 115. | The POH governs the gauge. If minimum pressure is not shown within 30 s of start (about twice that in very cold weather), shut down [S2 p.4-10][S1 p.3-2]. |
| Fuel pressure | Red 2 / green 2–8 / red 8 psi. | Carburetor inlet: max 8.0, desired 3.0, min 0.5 psi. | Electric auxiliary pump if pressure is below 2 psi [S2 §4, §7]. |
| Carb air temperature | Yellow −15°C to +5°C ("keep needle out of yellow arc during possible carburetor icing conditions") | — | Gauge range −30 to +30°C in 5° marks [S2 §7]. |
| EGT | No limit. Leaning aid only. | No EGT limit for normally aspirated engines. TIT limit 1650°F applies to turbo engines only. | — |
| Fuel | 100LL / 100 | Minimum 100/100LL | |

---

## 3. Lycoming power chart, O-360-A, 180 HP, CR 8.5:1

Source: [S1] **Figure 3-42**, "Sea Level and Altitude Performance – O-360-A1A, … -A1F6, …", Curve No. 13358, p.3-56. The A1F6 is named explicitly. Chart notes: "Zero ram"; "Abs. **dry** manifold pressure"; "Maximum power mixture unless otherwise noted". Figure 3-17 (p.3-32) covers other O-360-A/-C models and was not used.

### 3.1 Sea-level power at standard temperature: BHP vs. RPM and MAP (DERIVED digitization)

The chart draws straight lines for 2700, 2600, 2400, 2200 and 2000 RPM only. Columns marked † are linear interpolations between adjacent lines and are not on the chart. The lines end on the full-throttle boundary: 2700 RPM ends at 180 HP at about 28.65 inHg, and 2000 RPM ends at about 140 HP at about 29.1 inHg.

Line equations (MAP in inHg): BHP = a + b × (MAP − 20.27)

| RPM | 2700 | 2600 | 2400 | 2200 | 2000 |
|---|---|---|---|---|---|
| a | 108.2 | 105.6 | 97.0 | 88.8 | 79.6 |
| b | 8.48 | 8.04 | 7.78 | 7.19 | 6.79 |

| MAP (inHg) | 2700 | 2600 | 2500† | 2400 | 2300† | 2200 | 2100† | 2000 |
|---|---|---|---|---|---|---|---|---|
| 18 | 89 | 87 | 83 | 79 | 76 | 72 | 68 | 64 |
| 19 | 97 | 95 | 91 | 87 | 83 | 80 | 75 | 71 |
| 20 | 106 | 103 | 99 | 95 | 91 | 87 | 82 | 78 |
| 21 | 114 | 111 | 107 | 103 | 98 | 94 | 89 | 85 |
| 22 | 123 | 120 | 115 | 110 | 106 | 101 | 96 | 91 |
| 23 | 131 | 128 | 123 | 118 | 113 | 108 | 103 | 98 |
| 24 | 140 | 136 | 131 | 126 | 121 | 116 | 110 | 105 |
| 25 | 148 | 144 | 139 | 134 | 128 | 123 | 117 | 112 |
| 26 | 157 | 152 | 147 | 142 | 136 | 130 | 124 | 119 |
| 27 | 165 | 160 | 155 | 149 | 143 | 137 | 131 | 125 |
| 28 | 174 | 168 | 162 | 157 | 151 | 144 | 138 | 132 |

The chart's x-axis covers about 18–29.5 inHg. Values below 18 inHg would be extrapolations and are not given.

### 3.2 Full-throttle BHP vs. pressure altitude at standard temperature (DERIVED digitization)

| Press. alt (ft) | 2700 | 2600 | 2500† | 2400 | 2300† | 2200 | 2100† | 2000 |
|---|---|---|---|---|---|---|---|---|
| 0 | 180 | 175 | 169 | 164 | 158 | 152 | 147 | 141 |
| 2000 | 169 | 164 | 159 | 154 | 148 | 143 | 138 | 133 |
| 4000 | 157 | 152 | 148 | 143 | 138 | 134 | 129 | 124 |
| 6000 | 146 | 141 | 137 | 133 | 129 | 125 | 120 | 116 |
| 8000 | 135 | 131 | 128 | 124 | 120 | 116 | 112 | 108 |
| 10000 | 125 | 121 | 118 | 115 | 111 | 108 | 104 | 100 |
| 12000 | 116 | 112 | 110 | 107 | 103 | 100 | 97 | 93 |
| 14000 | 106 | 104 | 101 | 99 | 96 | 93 | 90 | 86 |

### 3.3 Full-throttle manifold pressure vs. altitude, zero ram (DERIVED from the chart's MAP isobars)

| Full-throttle MAP (inHg, dry) | Altitude at 2700 RPM (ft) | Altitude at 2200 RPM (ft) | ISA static pressure at the 2700 altitude (inHg) |
|---|---|---|---|
| 28 | 815 | 1,067 | 29.05 |
| 26 | 2,746 | 3,068 | 27.07 |
| 24 | 4,929 | 5,224 | 24.96 |
| 22 | 7,284 | 7,612 | 22.84 |
| 20 | 9,883 | 10,074 | 20.67 |
| 18 | 12,281 | 12,596 | 18.82 |
| 16 | 15,360 | 15,607 | 16.64 |
| 14 | 18,639 | 18,845 | 14.55 |

- **Rule of thumb (DERIVED).** Full-throttle MAP ≈ **0.96 × ambient static pressure at 2700 RPM** (a loss of about 1.0 inHg at low altitude), and about **0.97 × at 2200 RPM** (a loss of about 0.7 inHg). The loss falls with altitude.
- **Ram air.** The POH lists 20.5 inHg at 10,000 ft for 2700–2100 RPM. The zero-ram chart allows only about 19.9 inHg there. That implies roughly 0.5–1 inHg of ram recovery in cruise (DERIVED).

### 3.4 Altitude and temperature method (OFFICIAL text on [S1 Fig 3-42])

The chart's instructions:

1. Locate **A** on the full-throttle altitude curve for the given RPM and MAP. This is the altitude at which that MAP is full throttle.
2. Locate **B** on the sea-level curve for the RPM and MAP, and transfer it to **C** on the altitude chart's sea-level axis.
3. Connect A and C with a straight line, and read the HP at the given altitude, **D**.
4. Correct for inlet-air temperature: `HP_actual = HP_D × sqrt((460 + T_s) / (460 + T))`, where T is in °F and T_s is the standard altitude temperature. The chart adds: "Approximately 1% correction for each 10°F variation from T_s."

The chart's altitude axis is not linear in feet; it appears to be linear in pressure. I interpolated it from the printed 1000-ft ticks. Standard temperature: the POH climb table uses 15°C at SL, falling 2°C per 1000 ft (13, 11, 9 … −9°C at 12,000 ft) [S2 Fig 5-6].

### 3.5 Cross-check against the 177B POH (DERIVED)

Applying the method above at standard temperature gives % power **2–5 points lower** than the POH's printed %BHP for the same RPM and MAP:

| Condition | Lycoming chart | POH |
|---|---|---|
| 2000 ft, 2500 RPM, 24 inHg | 75.0% | 78% |
| 6000 ft, 2300 RPM, 21 inHg | 61.8% | 65% |
| 8000 ft, 2700 RPM, 21 inHg | 72.9% | 75% |
| 12,000 ft, 2500 RPM, 17 inHg | 54.6% | 57% |

Likely reasons, not verified: the Lycoming chart uses "dry", zero-ram MAP while the POH uses indicated MAP, and the POH reflects Cessna's installed flight-test calibration.

**Recommendation for the sim:** treat the POH table (§5) as the truth for the 177B installation, and use the Lycoming chart for shape and off-table interpolation.

### 3.6 Lycoming "operating conditions" points, O-360-A and -C series (OFFICIAL [S1 p.3-12])

| Operation | RPM | HP | Fuel (GPH) | Max oil (qt/h) | Max CHT |
|---|---|---|---|---|---|
| Normal rated | 2700 | 180 | — | 0.80 | 500°F |
| Performance cruise (75%) | 2450 | 135 | 10.5 | 0.45 | 500°F |
| Economy cruise (65%) | 2350 | 117 | 9.5 | 0.39 | 500°F |

For comparison, the O-360-A1P/-A4D/-A4P/-C4P/-F/-G series (SIBLING) lists 9.7 GPH at 75% and 8.3 GPH at 65% [S1 p.3-12].

---

## 4. Fuel consumption

### 4.1 Lycoming "Fuel Flow vs. Percent Rated Power", O-360 180 HP series (OFFICIAL [S1 Fig 3-39, p.3-53]; values DERIVED by digitization)

Curve No. 13357 is labeled "**Minimum allowable fuel flow**" for O-360-A, -C, -F and -G and the HO-360-C1A (CR 8.5:1, 25° BTC). It is the leanest the engine may be run at each power. It is not a full-rich curve.

| % rated power | 45 | 50 | 55 | 60 | 65 | 70 | 72.5 | 75 | 77 | 78 | 80 | 82 | 85 | 90 | 95 | 100 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| GPH (min allowable) | 5.65 | 6.3 | 6.9 | 7.6 | 8.2 | 8.8 | 9.1 | 9.6 | 10.2 | 10.8 | 11.6 | 12.0 | 12.5 | 13.2 | 13.9 | 14.8 |

- **Shape.** The curve is a straight line (about 0.13 GPH per %) up to about 75%. It then steps up by about 2 GPH between 75% and 80%, where the manual stops permitting best-economy leaning. Above 80% it is a second straight line (about 0.16 GPH per %).
- **BSFC (DERIVED, 6.0 lb/gal).** About 0.42 lb/hp-h at 50–75% (best-economy region). About 0.49 lb/hp-h at 100%.

### 4.2 POH "recommended lean" fuel flow, 177B (DERIVED fit to all 157 standard-temperature cells of [S2 Fig 5-7])

`GPH ≈ 0.333 + 0.1278 × %BHP`, with a maximum residual of 0.37 GPH. The 462 cells across all three temperature columns give essentially the same fit: 0.366 + 0.1273 × %BHP.

| %BHP | 45 | 50 | 55 | 60 | 65 | 70 | 75 | 80 |
|---|---|---|---|---|---|---|---|---|
| GPH (POH recommended lean ≈ 50°F ROP) | 6.1 | 6.7 | 7.4 | 8.0 | 8.6 | 9.3 | 9.9 | 10.6 |
| BSFC, lb/hp-h (6.0 lb/gal) | 0.45 | 0.45 | 0.45 | 0.44 | 0.44 | 0.44 | 0.44 | 0.44 |

- **Peak EGT (best economy).** The POH states it gives "approximately 10 percent greater range… accompanied by approximately 4 knots decrease in speed" [S2 p.4-14/15]. That is consistent with §4.1, where about 8.2 GPH at 65% is 5% below the POH's 8.6.

### 4.3 Full-rich takeoff and climb fuel flow

- **No official figure.** I found no official full-rich takeoff GPH for the 177B or the MA-4-5. The Lycoming *minimum* at 100% is 14.8 GPH [S1 Fig 3-39].
- **Average climb fuel flows (DERIVED from POH Fig 5-6 cumulative time and fuel).** Rounding to 1 min and 0.1 gal gives about ±10–15% error.

| Climb segment (ISA, 2500 lb) | Setting | Fuel / time | Average GPH |
|---|---|---|---|
| SL → 5000 ft | Max climb: full throttle, 2700 RPM, full rich below 3000 ft, then leaned for max power | 1.9 gal / 7 min | **≈16.3** |
| 5000 → 10,000 ft | Same | 2.6 gal / 12 min | ≈13.0 |
| SL → 5000 ft | Normal climb: 24 inHg / full throttle, 2500 RPM, 80 KIAS | 2.0 gal / 10 min | **≈12.0** |
| 5000 → 9000 ft | Same | 1.8 gal / 10 min | ≈10.8 |

- **Start, taxi and takeoff allowance.** 1.4 gal [S2 Fig 5-6].
- **FORUM / SIBLING data.** These are for other carburetors or airframes. They are relayed specs or owner readings, not verified for the 177B.
  - A forum user relayed a Marvel-Schebler spec for carburetor 10-4164-1 of 16.75 GPH at full throttle and 0.8 GPH at idle. An RV owner with that carburetor saw 13–13.2 GPH at takeoff. A Mooney owner (carbureted O-360) saw about 19 GPH [S20, search-result level, not opened].
  - The 177B's exact MA-4-5 part number was not found.

---

## 5. Cessna 177B POH performance and procedures (1977 POH [S2])

### 5.1 Headline performance [S2 §1 p.1-1]

| Item | Value |
|---|---|
| Max speed, SL | 139 kt |
| Cruise, 75% at 10,000 ft | 130 KTAS |
| Rate of climb, SL | 840 fpm |
| Service ceiling | 14,600 ft |
| Takeoff ground roll / over 50 ft | 750 / 1400 ft |
| Max weight | 2500 lb |
| Power loading | 13.9 lb/hp |
| Fuel, standard tanks | 50 gal total / 49 usable / 1 unusable |
| Fuel, long-range tanks | 61 gal total / 60 usable |
| Reduced-fill marker | 43 gal usable [S2 §7] |
| Oil | 9 qt |

### 5.2 Cruise performance table (OFFICIAL [S2 Fig 5-7])

The full table is reproduced in **Appendix A**. Conditions: 2500 lb, **recommended lean mixture**, cowl flaps closed. The POH note says: "For best fuel economy at 75% power or less, operate at the leanest mixture that results in smooth engine operation or at peak EGT if an EGT indicator is installed."

Fig 4-3 summary (standard conditions, zero wind) [S2 p.4-14]:

| Altitude | 75%: KTAS / NMPG | 65%: KTAS / NMPG | 55%: KTAS / NMPG |
|---|---|---|---|
| Sea level | 120 / 11.9 | 112 / 13.0 | 103 / 14.1 |
| 5000 ft | 125 / 12.4 | 117 / 13.6 | 106 / 14.5 |
| 10,000 ft | 130 / 12.9 | 121 / 14.1 | 109 / 14.9 |

### 5.3 Climb (OFFICIAL [S2 §4, Fig 5-5, Fig 5-6])

- **Speeds.**
  - Vy: 79 KIAS at SL, falling to 70 KIAS at 10,000 ft.
  - Vx: 65 KIAS.
  - Normal climb: 75–85 KIAS, flaps up, "24 inches Hg or full throttle and 2500–2700 RPM."
  - Max-performance climb: full throttle, 2700 RPM, cowl flaps full open.
- **Mixture in climb.** Full rich below 3000 ft. It "may be leaned above 3000 feet" (normal climb, for smoothness) or is "leaned above 3000 feet for maximum power" (max climb).

Maximum rate of climb, fpm, 2500 lb (Fig 5-5):

| Press. alt | KIAS | −20°C | 0°C | 20°C | 40°C |
|---|---|---|---|---|---|
| SL | 79 | 970 | 895 | 820 | 745 |
| 2000 | 77 | 850 | 780 | 705 | 635 |
| 4000 | 76 | 730 | 660 | 590 | 525 |
| 6000 | 74 | 610 | 545 | 480 | 410 |
| 8000 | 72 | 495 | 430 | 365 | 300 |
| 10,000 | 70 | 375 | 315 | 255 | — |
| 12,000 | 68 | 260 | 200 | 140 | — |

Time, fuel and distance to climb from SL at ISA (Fig 5-6):

| Altitude (ft) | 1000 | 2000 | 3000 | 4000 | 5000 | 6000 | 7000 | 8000 | 9000 | 10,000 | 11,000 | 12,000 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Max climb: ROC (fpm) | 790 | 740 | 685 | 635 | 585 | 535 | 485 | 430 | 380 | 330 | 280 | 230 |
| Max climb: cumulative min / gal | 1 / 0.3 | 3 / 0.7 | 4 / 1.1 | 6 / 1.5 | 7 / 1.9 | 9 / 2.3 | 11 / 2.8 | 13 / 3.3 | 16 / 3.8 | 19 / 4.5 | 22 / 5.2 | 26* / 6.0 |
| Normal climb (80 KIAS, 2500 RPM, 24 inHg or full throttle): ROC (fpm) | 510 | 510 | 510 | 510 | 510 | 485 | 430 | 375 | 320 | 265 | 210 | 155 |
| Normal climb: cumulative min / gal | 2 / 0.4 | 4 / 0.8 | 6 / 1.2 | 8 / 1.6 | 10 / 2.0 | 12 / 2.4 | 14 / 2.8 | 17 / 3.3 | 20 / 3.8 | 23* / 4.4 | 27 / 5.2 | 33 / 6.2 |

\* The retyped POH prints "16" (max climb, 12,000 ft) and "13" (normal climb, 10,000 ft). Both are typos; the monotonic sequence implies about 26 and about 23.

Normal-climb ROC is constant at 510 fpm up to 5000 ft (DERIVED interpretation). That is where 24 inHg stops being available at full throttle, consistent with §3.3. Fuel and time increase 10% per 10°C above standard.

**Cross-check (SIBLING, older model).** NASA CR-2337 quotes the Cardinal handbook (1970 model) as 712 fpm at 2500 ft (Vy 90 mph) and 457 fpm at 7500 ft (85.5 mph) [S17].

### 5.4 Takeoff [S2 §4]

- **Power.** "FULL THROTTLE AND 2700 RPM." Carburetor heat off. Cowl flaps open (set before start).
- **Mixture.** Full rich. "Prior to takeoff from fields above 3,000 feet elevation, the mixture should be leaned to give maximum power" in a full-throttle static run-up (Fig 5-4 note).
- **Lycoming SI 1094D.** For a governed prop without fuel flow or EGT: "set throttle at full power and lean mixture at maximum RPM with smooth operation of the engine as a deciding factor" (5000 ft density altitude and above) [S3].

### 5.5 POH leaning procedure (OFFICIAL [S2 p.4-14/15, Fig 4-4])

- **Recommended lean (the basis of the POH cruise data).** "Lean the mixture until the engine becomes rough. Enrich the mixture to obtain smooth engine operation; then further enrich the mixture an equal amount."
- **With the Cessna EGT indicator (Fig 4-4).**
  - "Recommended lean" = **50°F rich of peak EGT**.
  - "Best economy" = **peak EGT**.
  - Usable "at 75% power or less."
  - Method: lean to peak as a reference, then enrich by the increment.
- **Roughness before peak.** "When leaning … engine roughness may occur before peak EGT is reached. In this case, use the EGT corresponding to the onset of roughness as the reference point instead of peak EGT."
- **Re-lean after any change.** "Any change in altitude, power or carburetor heat will require a change in the lean mixture setting and recheck of the EGT setting."
- **EGT indicator behavior** [S2 §7]: "EGT varies with fuel-to-air ratio, power, and RPM. However, the difference between peak EGT and the EGT at the cruise mixture setting is essentially constant."
- **Descent.** "Mixture – RICH or lean for smooth operation; Carburetor Heat – AS REQUIRED to prevent carburetor icing; Cowl Flaps – CLOSED."
- **Before landing.** Mixture rich, carburetor heat ON ("apply full heat before closing throttle"), prop high RPM.

### 5.6 Run-up and ground operations (OFFICIAL [S2 §4][S1 p.3-3..3-5])

- **177B magneto check.** At **1800 RPM**: "RPM drop should not exceed **150 RPM** on either magneto or show greater than **50 RPM** differential." Sequence: R, back to BOTH, then L, back to BOTH.
  - "A smooth drop off past normal is usually a sign of a too lean or too rich mixture."
  - "An absence of RPM drop may be an indication of faulty grounding of one side of the ignition system or … magneto timing … set in advance."
- **Rest of the run-up.**
  - Prop: cycle from high to low RPM and back to high.
  - Carburetor heat: "CHECK for RPM drop". No numeric value is given in the 177B POH.
  - Alternator check: load briefly; the ammeter should stay within a needle width.
- **Lycoming general magneto check (for comparison).** With a controllable prop at minimum pitch, set **50–65% power** by MAP. Maximum drop **175 RPM**, maximum differential **50 RPM**. If the drop exceeds 175 RPM with smooth running, lean to peak RPM and re-check. "Magneto checks at low power settings will only indicate fuel/air distribution quality."
- **Typical carburetor-heat check (TYPICAL, generic light aircraft).** "Typically 75–100 rpm or 3–5 inches of manifold pressure." Hold heat for at least 15 s. A power increase above the original value after heat is removed indicates ice was present [S10 p.8].
- **Warm-up.**
  - Lycoming: 1000–1200 RPM; the engine is warm enough when "the throttle can be opened without the engine faltering" [S1].
  - Lycoming Flyer: "usually warm enough for pre-flight ground check in above-freezing temperatures after **2 to 3 minutes** running at 1000 to 1200 RPM"; longer below freezing [S4 p.62].
  - Post-maintenance ground test: "operate the engine at 1000 RPM until the oil temperature has stabilized or reached **140°F**" [S4 p.82].
- **Prolonged ground running.** "Since the engine is closely cowled … precautions should be taken to avoid overheating during prolonged engine operation on the ground. Also, long periods of idling at low RPM may cause fouled spark plugs" [S2 p.4-11].
- **Carburetor heat on the ground.** "Pushed full in during all ground operations unless absolutely necessary for smooth engine operation" (heated air is unfiltered) [S2 p.4-10].

### 5.7 Carburetor-heat procedures [S2]

- **Carburetor icing (emergency).** "An unexplained drop in manifold pressure and eventual engine roughness may result from the formation of carburetor ice."
  - Apply full throttle and full carburetor heat until the engine runs smoothly, then remove heat and readjust the throttle.
  - If continued heat is needed in cruise, "use the minimum amount of heat necessary … and lean the mixture for smoothest engine operation."
- **Cruise.** "Upon regaining the original manifold pressure indication (with heat off), use the minimum amount of heat (by trial and error)… Since heated air causes a richer mixture, readjust the mixture setting."
- **Heavy rain.** "Use of carburetor heat is recommended during flight in very heavy rain."
- **Below −18°C.** "Avoid using partial carburetor heat. Partial heat may increase the carburetor air temperature to the 0° to 21°C range, where icing is critical" [S2 p.4-20].
- **Power cost.** "Use of full carburetor heat at full throttle will result in a power loss of approximately **13%**" [S2 §7 p.7-14].
- **Go-around.** Full throttle, carburetor heat cold, flaps to 20°. At field elevations above 3000 ft, lean for maximum power.

---

## 6. Lycoming leaning guidance (OFFICIAL)

| Rule | Source |
|---|---|
| Full rich for rated takeoff, climb and maximum cruise powers above about 75%. At altitude, lean "only enough to obtain smooth operation – not for economy". Over-rich roughness "most likely … in carbureted engines at altitude above 5,000 feet." | [S1 p.3-6] |
| Always return the mixture (slowly) to full rich before increasing power. Make mixture changes slowly. | [S1 p.3-6][S3 A.2–3] |
| **Maximum-power cruise (about 75%): never lean beyond 150°F on the rich side of peak EGT.** **Best-economy cruise (about 75% power and below): operate at peak EGT.** | [S1 p.3-6] |
| Float-type carburetor: "EGT offers little improvement in leaning … because of imperfect mixture distribution. However, if the EGT probe is installed, lean the mixture to **100°F on the rich side of peak EGT for best power**. For best economy cruise, operate at **peak EGT**." The probe "must be installed in the **leanest cylinder**." | [S3 B.4–5] |
| No EGT gauge (carbureted): lean until roughness, then enrich until smooth and power is regained. | [S1 p.3-8] |
| For maximum service life in continuous cruise: **≤65% power, CHT ≤400°F, oil 165–220°F.** | [S3 B.7][S4] |
| CHT: below 435°F in high-performance cruise and below 400°F in economy cruise. If CHT reaches its maximum before peak EGT, CHT governs. | [S1 p.3-6][S4 p.41] |
| **Shock cooling:** "maximum recommended temperature change should not exceed **50°F per minute**." | [S3 A.4][S4 p.51, p.54] |
| **"TEXTRON LYCOMING DOES NOT RECOMMEND OPERATING ON THE LEAN SIDE OF PEAK EGT."** | [S3 p.6] |
| Lean of peak "isn't possible with float-type carburetors because of the fuel/air distribution problem. In any case, leaning past the peak is not recommended." Lycoming allows leaning to peak EGT at 75% and below on direct-drive normally aspirated engines. | [S4 p.41] |
| Float-carbureted engines "tend to operate smoother at **+25° to +50°F** on the rich side of peak EGT"; peak is "frequently a vague point" with a carburetor. Peak EGT costs "two or three miles per hour." Best power is "in the range of plus 100°F on the rich side of peak." | [S4 p.41–42] |
| Descent: keep power on and the mixture leaned. "If an EGT gage is installed with a normally aspirated engine, keep it peaked." Descend at no more than high-cruise speed and about 1000 fpm. Richen gradually during the descent. | [S4 p.51, p.54] |
| During let-down it may be necessary to lean carbureted engines for smooth operation. | [S1 p.3-6] |

- **Expert view (TYPICAL, not Lycoming).** Deakin's "red box" (to avoid) for normally aspirated engines:

  | Power | Red box |
  |---|---|
  | ≤60% | none |
  | ~65% | 100°F ROP to peak |
  | ~70% | 125°F ROP to 25°F LOP |
  | ~75% | 180°F ROP to 40°F LOP |
  | ~80% | 200°F ROP to 60°F LOP |

  He also notes that full rich at SL and full power sits about 250–300°F ROP. This is written for fuel-injected engines [S15].

---

## 7. Quantitative EGT and CHT behavior

### 7.1 Shape of EGT, CHT and power vs. mixture (OFFICIAL chart, values DERIVED)

Source: [S1 **Figure 3-1**, p.3-7, "Representative effect of fuel/air ratio on CHT, power and specific fuel consumption at constant RPM and MAP in cruise range operation"]. SI 1094D p.6 carries a matching "representative diagram" [S3]. It is generic: no engine or power level is specified.

The x-axis is mixture. EGT is read on the chart's right-hand "E.G.T. temp change, °F" scale. CHT is read on the left-hand °C scale and converted to °F relative to peak CHT. Power is "percent of best power". Accuracy is about ±1% and about ±10°F.

| Mixture point | EGT vs. peak | Power (% of best) | CHT vs. peak CHT |
|---|---|---|---|
| Lean (about 64°F LOP) | −64°F | ~89 | ≈ −53°F |
| ~45°F LOP | −45°F | ~91.6 | ≈ −42°F |
| ~26°F LOP | −26°F | ~93.4 | ≈ −32°F |
| ~10°F LOP | −10°F | ~94.8 | ≈ −22°F |
| **Peak EGT** | 0 | **~96.5** | ≈ −11°F |
| ~20–30°F ROP | −20 to −30°F | ~98 | **0 (CHT peak)** |
| ~45°F ROP | −45°F | ~98.8 | ≈ −2°F |
| ~85°F ROP | −83°F | ~99.6 | ≈ −9°F |
| ~110°F ROP | −110°F | ~99.9 | ≈ −14°F |
| **~105–175°F ROP (the chart's shaded "max power range")** | | **100 (flat top, centered about 140°F ROP)** | ≈ −15 to −27°F |
| ~220°F ROP | | ~99.4 | ≈ −34°F |
| ~270°F ROP | | ~98.4 | ≈ −44°F |
| ~330°F ROP | | ~97.0 | ≈ −53°F |
| ~380–395°F ROP ("full rich take-off" column) | | ~95 | ≈ −58°F |

- **Best-economy range.** The chart's shaded "best economy range" spans from roughly 60–80°F lean of peak to just rich of peak.
- **SFC.** The SFC minimum lies inside the best-economy range. SFC rises steeply toward full rich.
- **On the ROP side, EGT is almost linear in mixture** in this chart: about 1.1°F of EGT per chart unit, from peak to full rich.

### 7.2 Absolute EGT and CHT levels

No Lycoming or Cessna document gives absolute EGT values for the O-360. Available values:

| Item | Value | Source / label |
|---|---|---|
| Typical cruise EGT, engines under 200 HP | **~1350°F**. EGT is about 200°F lower at full throttle. | JPI EDM Pilot's Guide p.21 [S14] TYPICAL |
| EGT gauge scale | Commonly 25°F per mark; ranges such as 1200–1700°F | Lycoming Flyer [S4 p.41] TYPICAL |
| Typical CHT, normally aspirated | ~350°F at OAT 60°F | JPI [S14] TYPICAL |
| Normal CHT in climb and cruise, year-round | **350–435°F** | Lycoming Flyer "More on CHT" [S4 p.52] OFFICIAL-typical |
| CHT minimum in flight / maximum | 150°F / 500°F | [S4 p.52] OFFICIAL |
| CHT target (expert) | Lycoming guideline about 420°F, comfortable target about 400°F, floor about 350°F (to avoid valve sticking from lead deposits). Redline 500°F is "emergency" only. | Mike Busch, AOPA [S12] TYPICAL |
| Typical oil temperature | ~200°F (JPI). Stable 180–200°F is typical (Kitplanes). Desired inlet 180°F (Lycoming). | [S14][S18][S1] |
| Oil cooler | 177B: a bypass valve routes cold oil directly to the filter; hot oil goes to the cooler on the lower right firewall [S2 §7]. Thermostat "opens 180°F" (JPI) [S14]; vernatherm "extends at 180° or so" (Kitplanes) [S18]. | TYPICAL |
| Cardinal cruise CHT | Cowl flaps to about 3/4 of green, which works out to about 425°F (DERIVED from [S2]). No published Cardinal monitor data was found (see gaps). | |

### 7.3 EGT and CHT spreads on a carbureted 4-cylinder

| Item | Value | Source |
|---|---|---|
| EGT variation between cylinders | "typical … average 100°F with fuel injection, and as much as **200°F with a float-type carburetor**". Worse in below-freezing OAT with a float carburetor. | Lycoming Flyer [S4 p.41] OFFICIAL-typical |
| EGT span (DIF) | **120–150°F carbureted**; 70–90°F injected | JPI [S14] TYPICAL |
| CHT variation | Up to **150°F** with a float carburetor; 100°F injected | Lycoming Flyer [S4 p.52] |
| CHT span | 50–70°F (100°F with gasket probes) | JPI [S14] TYPICAL |
| Leaning to roughness | "Indicates that the leanest cylinder has become so lean, it is beginning to miss. This is typical of an engine with a float-type carburetor." | [S4 p.41] |
| Which cylinder runs lean or hot | **No Lycoming or Cessna statement found** for the O-360-A1F6D in the Cardinal. Owner reports conflict: #3 hottest or leanest on some O-360s and O-320s; #4 highest takeoff EGT and CHT on a PA-28 O-360; #1 30–50°F hotter in ROP cruise. | FORUM [S16][S19] |
| Hot cylinder: mixture or cooling? | If the cylinder runs hot both ROP and LOP, the cause is cooling airflow (baffles). If it swaps from hottest to coolest when going LOP, it is running lean. | Busch [S12] TYPICAL |

### 7.4 Single-magneto behavior

| Item | Value | Source |
|---|---|---|
| EGT rise on a single magneto (healthy) | **50–100°F**, all cylinders rising. Odd/even differences are normal. "Exact amount … not critical." | Busch, AOPA [S11] TYPICAL |
| | "Uniform ~50°F rise of all EGTs" | JPI [S14] TYPICAL |
| RPM drop limits (177B) | ≤150 RPM, ≤50 RPM differential at 1800 RPM | [S2] OFFICIAL |
| Retarded timing | Larger RPM drop, all EGTs higher than usual, smooth running | [S11] |
| Advanced timing | Lower EGTs and higher CHTs (detonation risk); also no RPM drop | [S11][S2] |
| Bad plug vs. bad magneto | A bad plug affects one EGT bar; a bad magneto affects all bars. | [S11] |

### 7.5 Warm-up and oil temperature

- Warm up at 1000–1200 RPM [S1]. It is "usually warm enough for pre-flight ground check … after 2 to 3 minutes" above freezing [S4 p.62].
- The engine is ready when it accelerates smoothly [S2 p.4-11][S1].
- **No official oil-temperature-vs-time warm-up curve was found** (gap).
- Oil must not stay below 140°F in continuous operation [S1]. A winterization kit is advised below about 40–45°F OAT [S4 p.50]. The 177B kit (nose-cap baffles plus breather insulation) is for use below **−7°C (20°F)** [S2 §7].

### 7.6 Cooling: airspeed, cowl flaps, descent

- **Cowl flaps** [S2].
  - Open for start, takeoff and climb (full open for max climb).
  - Closed in cruise per the cruise tables, adjusted to hold CHT at about 3/4 of green.
  - "During extended let-downs, it may be necessary to completely close the cowl flaps."
- **Shock-cooling limits.** Lycoming ≤50°F per minute [S3]. Descend at no more than high-cruise speed and about 1000 fpm, with power kept on and the mixture lean [S4 p.51, p.54].
- **JPI typical observed cooling rates** [S14]: −40°F/min tightly cowled; −55°F/min Bonanza; keep slower than −60°F/min.
  - The cylinder with the greatest shock cooling shifts from the front in climb to the rear in descent.
- **No sourced quantitative CHT-vs-airspeed or CHT-vs-cowl-flap-position data** was found for the 177B (gap). Lycoming Flyer lists the ways to cool CHT, in order: enrich, cowl flaps, reduce power [S4 p.51].
- **Climb CHT.** The only value found is FORUM: one 177B owner reportedly said Cardinals "aren't known for great cooling" and that peaks around 400°F in hard climbs on hot days are normal. This came from a search snippet of a Pilots of America thread that I could not open; it is unverified.

---

## 8. Carburetor icing

### 8.1 Conditions

| Statement | Source |
|---|---|
| Relative humidity ≥50% and OAT **20–90°F**: ice can form. Mixture temperature "may drop as much as **70°F** below the temperature of the incoming air." | Lycoming OM [S1 p.3-8] OFFICIAL |
| RH 50–60% is moist enough. OAT 20–90°F, **most likely 30–60°F**. Carburetor cools by **60–70°F**. Forms more readily at low power and while taxiing. | Lycoming Flyer [S4 p.48] |
| Temperature inside the carburetor "as much as **35°C** less than the ambient". Most risk at **0–10°C with high RH**. Serious icing at descent power has been seen above 25°C OAT with RH as low as 30%. | UK CAA SSL 14 [S10 p.2, p.5] OFFICIAL |
| FAA chart: "carburetor icing possible" at 20–100°F and RH 50–100%. "**High** carburetor icing potential" at about **20–70°F (−7 to 21°C) with RH ≥80%**. | FAA PHAK Fig 7-12 [S9] OFFICIAL |
| 177B carburetor air temperature gauge yellow arc **−15 to +5°C** = "most conducive to icing in the carburetor". | [S2 §7] OFFICIAL |
| Partial heat in OAT below −18°C can raise the carburetor temperature into **0–21°C**, "where icing is critical". | [S2 p.4-20] OFFICIAL |

**UK CAA icing-probability chart** [S10 p.5]. The chart plots air temperature against dew point with relative-humidity lines. I digitized it (DERIVED, about ±2–3°C). In the table, "depression" is dew-point depression below saturation at a given OAT.

| Zone (chart legend) | Approx. OAT extent | Depression at OAT +5°C | Depression at +10°C | Depression at +15°C | Depression at +20°C |
|---|---|---|---|---|---|
| Serious icing, any power | ~0 to +16°C | 0–5°C | 0–8°C | 0–7°C | — |
| Moderate icing at cruise power / serious icing at descent power | ~−2 to +26°C | 5–6°C | 8–10°C | 7–13°C | 0–14°C |
| Serious icing, descent power | ~−8 to +32°C | 6–10°C | 10–13°C | 13–16°C | 14–18°C |
| Light icing, cruise or descent power | ~−15 to +37°C | 10–13°C | 13–16°C | 16–18°C | 18–21°C |

FAA SAIB CE-09-35 contains a similar glide/cruise-power chart. The only copy I found (caa.lk) failed TLS verification, so I did not use it (gap).

### 8.2 Symptoms and the effect of carburetor heat

| Effect | Value | Source |
|---|---|---|
| Ice symptom with a constant-speed prop | **MAP drop** with RPM held by the governor. Roughness later. | [S1 p.3-8][S2][S10 p.7] |
| EGT with carburetor ice | "Carburettor icing will often cause a **drop in EGT**, due to the restriction of air flow enriching the mixture" | [S10 p.7] |
| | JPI: "decrease in EGT all cylinders = less induction airflow / carb ice" | [S14] |
| Applying full heat with ice present | "A slight additional drop in manifold pressure, which is normal, and this drop will be regained as the ice is melted" | [S1 p.3-9] |
| | Initial further power loss "perhaps as much as **15%**" and possible roughness. The heated air richens the mixture and melted ice passes through as water. Clearing time **30 s to several minutes**. | [S4 p.48] |
| | Hold heat "at least 15 seconds" | [S10] |
| Power loss, full heat at full throttle | **≈13%** (177B) | [S2 p.7-14] |
| Richening from heat | Heated air causes a richer mixture: re-lean in cruise [S2]. "Over-rich fuel/air mixture produced by the additional carburetor heat" can cause roughness in climb; lean only for smoothness [S1 p.3-9]. | OFFICIAL |
| Run-up carburetor-heat check | 177B POH: "check for RPM drop" (no number). Generic typical: 75–100 RPM or 3–5 inHg MAP. | [S2][S10] |
| Size of the EGT change from carburetor heat | **Not found** in any official source (gap). | |
| Takeoff and climb | Do not use carburetor heat for takeoff or climb with a Lycoming (detonation risk) [S4 p.48]. Full cold for takeoff and climb at ≥80% power [S1]. | OFFICIAL |

---

## 9. Fault signatures

The JPI diagnosis chart is in the Pilot's Guide p.22–24 (local extract `docs/01-MANUAL-EXTRACT.md` §4, not in the repository). The table below adds Lycoming and Cessna engine-side corroboration.

| Fault | Signature | Source / label |
|---|---|---|
| **Detonation** | "Unless detonation is heavy, there is no cockpit evidence." Heavy detonation: roughness and **high CHT**. Caused by leaning at high power, high charge temperature, low octane, carburetor heat at high power. | Lycoming Flyer [S4 p.19–20][S1 p.3-9] OFFICIAL |
| | Rapid CHT rise in one cylinder. Detonation lowers EGT and raises CHT. A falling or flat peak EGT on leaning can indicate low-octane detonation. | JPI [S14] TYPICAL |
| **Pre-ignition** | "Engine roughness, backfiring, and by a **sudden increase in cylinder head temperature**." Causes: deposits or hot spots, cracked valve or piston, broken plug insulator, excessive leaning at high power. Fix: retard throttle, enrich, open cowl flaps. | [S4 p.20] OFFICIAL |
| | Sudden off-scale EGT (analog red line, digital >2000°F) in the affected cylinder | JPI [S14] |
| **Fouled plug in flight** | "Slight engine roughness." Verify by switching momentarily to L or R: "an obvious power loss in single ignition operation." Lean to cruise setting for several minutes to clear; try richer if that fails. | 177B POH [S2 p.3-11] OFFICIAL |
| | EGT of the affected cylinder rises 75–100°F in flight (only one plug firing) | JPI [S14] TYPICAL |
| | On a magneto check, the affected cylinder's EGT bar falls or goes erratic while the others rise | Busch [S11]; one owner's report of a cylinder "going cold" on one mag with about 350 RPM drop (FORUM, search-level) |
| **Magneto failure** | "Sudden engine roughness or misfiring." The faulty mag is identified by switching. Affects all cylinders (all EGTs rise about 50–100°F on the remaining mag). | [S2 p.3-11][S11] |
| **Sticking valve** | "Will almost always provide a warning by running **very rough at start-up**." It may smooth out after a few seconds once warm. Recurrence in flight is possible. Almost always an exhaust valve. | Lycoming Flyer [S4 p.54] OFFICIAL |
| | Loss of EGT in one cylinder with a rough engine | JPI [S14] |
| **Burned or failing exhaust valve** | "Slow, rhythmic EGT oscillation" of **30–100°F**, "on the general order of one cycle per minute" (Savvy FEVA) | AOPA 2014 [S13] TYPICAL |
| | Slow EGT rise with low CHT | JPI [S14] |
| **Carburetor ice** | MAP drop (constant-speed prop), EGT drop on all cylinders, eventual roughness. See §8. | [S1][S10][S14] |
| **Induction or air-filter blockage** | Loss of MAP and power. Carburetor heat (alternate air) or leaning may restore some. Can happen in heavy rain with a swollen paper filter. | [S4 p.46–47][S2] |
| **Low oil pressure** | With normal oil temperature: suspect the gauge, relief valve or line (an orifice limits leakage). With rising oil temperature: impending engine failure. | [S2 p.3-11/12] |
| **High voltage** | The over-voltage sensor shuts down the alternator at about 16 V and lights the HIGH VOLTAGE lamp. | [S2 p.3-7, p.3-12] |
| **Engine-driven fuel pump failure** | Fuel pressure below 2 psi: turn on the auxiliary pump. Gravity feed is normally adequate in flight. | [S2 §4, §7] |
| **Rapid throttle movement** | Full-range throttle movements must take at least 2–3 s, or counterweights can detune (the A1F6 has pendulum counterweights). | [S1 p.3-5] |

---

## 10. Confidence and gaps

**High confidence (OFFICIAL, read directly):**

- Engine identity and specifications, carburetor and magneto models, firing order and cylinder numbering [S1].
- 177B limits, instrument markings, run-up and leaning procedures, fuel and oil capacity, climb and cruise tables [S2]. Caveat: [S2] is a retyped copy.
- Lycoming leaning rules, CHT and oil guidance, 50°F/min shock-cooling limit [S1][S3][S4].

**Medium confidence (DERIVED by digitizing official charts):**

- Power tables (§3), full-throttle MAP vs. altitude, fuel-flow curve (§4.1), mixture-curve table (§7.1), carburetor-ice chart extents (§8.1).
- Resolution is about ±1–2 HP, ±0.15 GPH and ±1% power. The carburetor-ice chart is a schematic: about ±2–3°C.
- The interpolated 2500/2300/2100 RPM columns are **not on the chart**.

**Known issues in [S2], the retyped POH:**

- **Cruise-table temperature headers.** Each sheet prints "−13 / 7 / 27°C" (correct only for 4000 ft). The correct ISA values are given in Appendix A.
- **KTAS and time typos.** Corrected and marked with `*`: KTAS 180→128, 1258→125, 18→118, 108→118; climb times 16→26 and 13→23.
- **Oil temperature green arc.** Printed as "100–125°F" in Fig 2-3; §7 gives 100–245°F.
- **Prop suffix.** "82PCA-6" in §1 vs. "82PCE-6" in §2.
- **Engine model.** §1 prints "O-360-AAF6D" (typo for A1F6D). §2 says "Engine Serial Number: O-360-A1F6D".
- **Sheet 4 (8000 ft).** The 2100 RPM / 20 inHg row is missing.
- **Model year.** The POH is the 1977 edition. Earlier 177B years (1970–74, O-360-A1F6, different prop part numbers, possibly different tables and markings) were **not** checked against their own POHs.

**Not found (gaps):**

1. FAA TCDS **A13CE** (177/177B) and **E-286** (O-360) PDFs could not be retrieved. Cardinal Flyers hosts them behind a membership login; the FAA DRS link could not be fetched. The A13CE assignment is confirmed by the NZ CAA AD schedule [S8].
2. The exact Marvel-Schebler MA-4-5 part number for the A1F6D and its full-throttle flow specification. **No official full-rich takeoff fuel flow** exists. About 16 GPH average in max climb is DERIVED from the POH.
3. **Lycoming part-throttle fuel consumption chart with separate best-power and best-economy curves for the O-360-A.** The 60297-12 manual has such charts only for other models (O-360-C2B/-C2D, HO-360-B, IO-360). For the O-360-A it has only Fig 3-39, "minimum allowable fuel flow". An older edition may contain one.
4. **Absolute EGT values** for the O-360 in the Cardinal: only JPI's "~1350°F" and generic ranges. Per-cylinder EGT and CHT data from Cardinal engine monitors (Cardinal Flyers forum, Beechtalk, POA) were **not accessible**: login walls and HTTP 403. The hottest/leanest-cylinder ranking for the A1F6D is unknown.
5. Quantitative **CHT vs. airspeed** and **CHT vs. cowl-flap position**, descent cooling rates specific to the Cardinal, and an oil-temperature warm-up time curve.
6. The **size of the EGT drop from carburetor heat**, and the typical RPM or MAP drop on the 177B's carburetor-heat check (only the generic UK CAA "75–100 RPM or 3–5 inHg").
7. FAA SAIB CE-09-35 chart (the copy failed TLS verification). The FAA PHAK and UK CAA charts were used instead.
8. The 177B static full-throttle RPM on the ground (governed vs. low-pitch-stop-limited) and the idle RPM specification.
9. Voltage-regulator setpoint (normal charging bus voltage). Only "14-volt system" and the ~16 V over-voltage trip were found.
10. GAMI/APS test-cell data (ICP, BSFC vs. ROP/LOP). Only Lycoming's representative chart and Deakin's text were used. Deakin's carbureted-engine sidebar was not retrievable.

---

## Appendix A: 177B cruise performance, full table (OFFICIAL [S2 Fig 5-7])

Conditions: 2500 lb, recommended lean mixture (≈50°F ROP), cowl flaps closed. "—" means the POH shows no value. `*` marks a corrected transcription typo (see §10). ISA temperatures in the headings are computed (15°C − 2°C per 1000 ft); the retyped headers are wrong except at 4000 ft.

**2000 ft pressure altitude** (ISA +11°C; columns ISA−20 = −9°C, ISA+20 = +31°C) [S2 Fig 5-7 sheet 1 of 6, p.5-14]

| RPM | MP | %BHP (ISA−20) | KTAS | GPH | %BHP (ISA) | KTAS | GPH | %BHP (ISA+20) | KTAS | GPH |
|---|---|---|---|---|---|---|---|---|---|---|
| 2500 | 24 | — | — | — | 78 | 124 | 10.5 | 76 | 125 | 10.1 |
| 2500 | 23 | 77 | 120 | 10.3 | 74 | 121 | 9.9 | 71 | 122 | 9.5 |
| 2500 | 22 | 72 | 117 | 9.6 | 70 | 118 | 9.2 | 67 | 118 | 8.9 |
| 2500 | 21 | 68 | 114 | 8.9 | 65 | 114 | 8.6 | 63 | 114 | 8.3 |
| 2400 | 24 | — | — | — | 76 | 123 | 10.3 | 74 | 124 | 9.9 |
| 2400 | 23 | 75 | 119 | 10.0 | 72 | 120 | 9.6 | 70 | 120 | 9.3 |
| 2400 | 22 | 70 | 116 | 9.4 | 68 | 117 | 9.0 | 66 | 117 | 8.7 |
| 2400 | 21 | 66 | 113 | 8.7 | 64 | 113 | 8.4 | 62 | 113 | 8.1 |
| 2300 | 24 | 77 | 121 | 10.3 | 74 | 121 | 9.9 | 72 | 122 | 9.5 |
| 2300 | 23 | 73 | 118 | 9.7 | 70 | 118 | 9.3 | 68 | 118 | 9.0 |
| 2300 | 22 | 68 | 115 | 9.0 | 66 | 115 | 8.7 | 64 | 115 | 8.4 |
| 2300 | 21 | 64 | 111 | 8.4 | 62 | 111 | 8.2 | 60 | 111 | 7.9 |
| 2200 | 24 | 74 | 119 | 9.9 | 71 | 119 | 9.5 | 69 | 120 | 9.2 |
| 2200 | 23 | 70 | 116 | 9.3 | 67 | 116 | 8.9 | 65 | 116 | 8.6 |
| 2200 | 22 | 66 | 113 | 8.7 | 63 | 113 | 8.4 | 61 | 112 | 8.1 |
| 2200 | 21 | 61 | 109 | 8.1 | 59 | 109 | 7.9 | 57 | 108 | 7.6 |
| 2100 | 24 | 71 | 117 | 9.4 | 68 | 117 | 9.0 | 66 | 117 | 8.7 |
| 2100 | 23 | 67 | 114 | 8.8 | 65 | 114 | 8.5 | 62 | 113 | 8.2 |
| 2100 | 22 | 63 | 110 | 8.3 | 61 | 110 | 8.0 | 59 | 110 | 7.8 |
| 2100 | 21 | 59 | 106 | 7.8 | 57 | 106 | 7.5 | 55 | 106 | 7.3 |
| 2100 | 20 | 55 | 102 | 7.3 | 53 | 102 | 7.1 | 51 | 101 | 6.9 |
| 2100 | 19 | 51 | 98 | 6.9 | 49 | 97 | 6.7 | 47 | 96 | 6.6 |
| 2100 | 18 | 47 | 93 | 6.5 | 45 | 92 | 6.3 | 44 | 90 | 6.2 |
**4000 ft pressure altitude** (ISA +7°C; columns ISA−20 = −13°C, ISA+20 = +27°C) [S2 Fig 5-7 sheet 2 of 6, p.5-15]

| RPM | MP | %BHP (ISA−20) | KTAS | GPH | %BHP (ISA) | KTAS | GPH | %BHP (ISA+20) | KTAS | GPH |
|---|---|---|---|---|---|---|---|---|---|---|
| 2500 | 23 | — | — | — | 76 | 125 | 10.2 | 73 | 125 | 9.8 |
| 2500 | 22 | 74 | 121 | 9.9 | 72 | 121 | 9.5 | 69 | 122 | 9.2 |
| 2500 | 21 | 70 | 118 | 9.2 | 67 | 118 | 8.9 | 65 | 118 | 8.6 |
| 2500 | 20 | 65 | 114 | 8.6 | 63 | 114 | 8.3 | 61 | 113 | 8.0 |
| 2400 | 24 | — | — | — | 79 | 127 | 10.6 | 76 | 127 | 10.2 |
| 2400 | 23 | 77 | 123 | 10.3 | 74 | 123 | 9.9 | 72 | 124 | 9.6 |
| 2400 | 22 | 72 | 120 | 9.7 | 70 | 120 | 9.3 | 68 | 120 | 8.9 |
| 2400 | 21 | 68 | 116 | 9.0 | 66 | 116 | 8.7 | 63 | 116 | 8.4 |
| 2300 | 24 | — | — | — | 76 | 125 | 10.2 | 74 | 125 | 9.8 |
| 2300 | 23 | 75 | 121 | 10.0 | 72 | 122 | 9.6 | 70 | 122 | 9.2 |
| 2300 | 22 | 70 | 118 | 9.3 | 68 | 118 | 9.0 | 66 | 118 | 8.7 |
| 2300 | 21 | 66 | 115 | 8.7 | 64 | 114 | 8.4 | 62 | 114 | 8.1 |
| 2200 | 24 | 76 | 122 | 10.2 | 73 | 123 | 9.8 | 71 | 123 | 9.4 |
| 2200 | 23 | 72 | 119 | 9.6 | 69 | 120 | 9.2 | 67 | 120 | 8.9 |
| 2200 | 22 | 68 | 116 | 9.0 | 65 | 116 | 8.6 | 63 | 116 | 8.3 |
| 2200 | 21 | 64 | 112 | 8.4 | 61 | 112 | 8.1 | 59 | 112 | 7.8 |
| 2100 | 24 | 73 | 120 | 9.7 | 70 | 121 | 9.3 | 68 | 121 | 9.0 |
| 2100 | 23 | 69 | 117 | 9.1 | 67 | 117 | 8.8 | 64 | 117 | 8.5 |
| 2100 | 22 | 65 | 114 | 8.6 | 63 | 113 | 8.3 | 61 | 113 | 8.0 |
| 2100 | 21 | 61 | 110 | 8.0 | 59 | 110 | 7.8 | 57 | 109 | 7.5 |
| 2100 | 20 | 57 | 106 | 7.5 | 55 | 105 | 7.3 | 53 | 104 | 7.1 |
| 2100 | 19 | 53 | 101 | 7.1 | 51 | 101 | 6.9 | 49 | 99 | 6.7 |
| 2100 | 18 | 49 | 96 | 6.7 | 47 | 95 | 6.5 | 45 | 93 | 6.4 |
| 2100 | 17 | 45 | 91 | 6.3 | 43 | 89 | 6.2 | 42 | 86 | 6.0 |

**6000 ft pressure altitude** (ISA +3°C; columns ISA−20 = −17°C, ISA+20 = +23°C) [S2 Fig 5-7 sheet 3 of 6, p.5-16]

| RPM | MP | %BHP (ISA−20) | KTAS | GPH | %BHP (ISA) | KTAS | GPH | %BHP (ISA+20) | KTAS | GPH |
|---|---|---|---|---|---|---|---|---|---|---|
| 2500 | 23 | — | — | — | 78 | 128 | 10.5 | 75 | 129 | 10.1 |
| 2500 | 22 | 76 | 125 | 10.3 | 74 | 125 | 9.8 | 71 | 125* | 9.5 |
| 2500 | 21 | 72 | 121 | 9.5 | 69 | 121 | 9.2 | 67 | 121 | 8.8 |
| 2500 | 20 | 67 | 117 | 8.9 | 65 | 117 | 8.5 | 63 | 117 | 8.3 |
| 2400 | 23 | — | — | — | 76 | 127 | 10.2 | 74 | 127 | 9.8 |
| 2400 | 22 | 75 | 123 | 10.0 | 72 | 124 | 9.6 | 69 | 124 | 9.2 |
| 2400 | 21 | 70 | 120 | 9.3 | 67 | 120 | 8.9 | 65 | 120 | 8.6 |
| 2400 | 20 | 65 | 116 | 8.6 | 63 | 116 | 8.3 | 61 | 115 | 8.1 |
| 2300 | 23 | 77 | 125 | 10.3 | 74 | 125 | 9.9 | 71 | 125 | 9.5 |
| 2300 | 22 | 72 | 122 | 9.6 | 70 | 122 | 9.2 | 67 | 122 | 8.9 |
| 2300 | 21 | 68 | 118 | 9.0 | 65 | 118 | 8.6 | 63 | 118 | 8.4 |
| 2300 | 20 | 64 | 114 | 8.4 | 61 | 114 | 8.1 | 59 | 113 | 7.8 |
| 2200 | 23 | 74 | 123 | 9.9 | 71 | 123 | 9.5 | 69 | 123 | 9.1 |
| 2200 | 22 | 70 | 120 | 9.3 | 67 | 120 | 8.9 | 65 | 119 | 8.6 |
| 2200 | 21 | 66 | 116 | 8.7 | 63 | 116 | 8.3 | 61 | 115 | 8.1 |
| 2200 | 20 | 61 | 112 | 8.1 | 59 | 111 | 7.8 | 57 | 111 | 7.6 |
| 2100 | 23 | 71 | 121 | 9.4 | 68 | 121 | 9.1 | 66 | 121 | 8.7 |
| 2100 | 22 | 67 | 117 | 8.8 | 65 | 117 | 8.5 | 62 | 117 | 8.2 |
| 2100 | 21 | 63 | 113 | 8.3 | 61 | 113 | 8.0 | 59 | 113 | 7.8 |
| 2100 | 20 | 59 | 109 | 7.8 | 57 | 109 | 7.5 | 55 | 108 | 7.3 |
| 2100 | 19 | 55 | 105 | 7.3 | 53 | 104 | 7.1 | 51 | 103 | 6.9 |
| 2100 | 18 | 51 | 100 | 6.8 | 49 | 99 | 6.7 | 47 | 97 | 6.5 |
| 2100 | 17 | 46 | 94 | 6.5 | 45 | 92 | 6.3 | 43 | 90 | 6.2 |

**8000 ft pressure altitude** (ISA −1°C; columns ISA−20 = −21°C, ISA+20 = +19°C) [S2 Fig 5-7 sheet 4 of 6, p.5-17]

| RPM | MP | %BHP (ISA−20) | KTAS | GPH | %BHP (ISA) | KTAS | GPH | %BHP (ISA+20) | KTAS | GPH |
|---|---|---|---|---|---|---|---|---|---|---|
| 2700 | 21 | — | — | — | 75 | 128 | 10.0 | 72 | 128 | 9.6 |
| 2700 | 20 | 73 | 124 | 9.7 | 70 | 124 | 9.3 | 68 | 124 | 9.0 |
| 2700 | 19 | 68 | 120 | 9.0 | 66 | 120 | 8.7 | 63 | 119 | 8.4 |
| 2700 | 18 | 63 | 115 | 8.3 | 61 | 115 | 8.0 | 59 | 114 | 7.8 |
| 2600 | 22 | — | — | — | 78 | 130 | 10.4 | 75 | 130 | 10.0 |
| 2600 | 21 | 76 | 126 | 10.2 | 73 | 127 | 9.7 | 70 | 127 | 9.4 |
| 2600 | 20 | 71 | 122 | 9.4 | 68 | 122 | 9.0 | 66 | 122 | 8.7 |
| 2600 | 19 | 66 | 118 | 8.7 | 64 | 118 | 8.4 | 62 | 117 | 8.1 |
| 2500 | 22 | 79 | 128 | 10.6 | 76 | 129 | 10.1 | 73 | 129 | 9.8 |
| 2500 | 21 | 74 | 125 | 9.9 | 71 | 125 | 9.5 | 69 | 125 | 9.1 |
| 2500 | 20 | 69 | 121 | 9.2 | 67 | 121 | 8.8 | 64 | 120 | 8.5 |
| 2500 | 19 | 64 | 117 | 8.5 | 62 | 116 | 8.2 | 60 | 116 | 7.9 |
| 2400 | 22 | 77 | 127 | 10.3 | 74 | 127 | 9.9 | 71 | 127 | 9.5 |
| 2400 | 21 | 72 | 123 | 9.6 | 69 | 123 | 9.2 | 67 | 123 | 8.9 |
| 2400 | 20 | 67 | 119 | 8.9 | 65 | 119 | 8.6 | 63 | 119 | 8.3 |
| 2400 | 19 | 63 | 115 | 8.3 | 61 | 114 | 8.0 | 58 | 114 | 7.7 |
| 2300 | 22 | 74 | 125 | 9.9 | 72 | 125 | 9.5 | 69 | 125 | 9.2 |
| 2300 | 21 | 70 | 121 | 9.3 | 67 | 121 | 8.9 | 65 | 121 | 8.6 |
| 2300 | 20 | 65 | 117 | 8.6 | 63 | 117 | 8.3 | 61 | 117 | 8.0 |
| 2300 | 19 | 61 | 113 | 8.0 | 59 | 112 | 7.8 | 57 | 112 | 7.5 |
| 2200 | 22 | 72 | 123 | 9.6 | 69 | 123 | 9.2 | 67 | 123 | 8.8 |
| 2200 | 21 | 68 | 120 | 8.9 | 65 | 119 | 8.6 | 63 | 119 | 8.3 |
| 2200 | 20 | 63 | 115 | 8.4 | 61 | 115 | 8.1 | 59 | 115 | 7.8 |
| 2200 | 19 | 59 | 111 | 7.8 | 57 | 110 | 7.6 | 55 | 109 | 7.3 |
| 2100 | 22 | 69 | 121 | 9.2 | 67 | 121 | 8.8 | 64 | 120 | 8.5 |
| 2100 | 21 | 65 | 117 | 8.6 | 63 | 117 | 8.3 | 60 | 116 | 8.0 |
| 2100 | 19 | 57 | 108 | 7.5 | 55 | 108 | 7.3 | 53 | 106 | 7.1 |
| 2100 | 18 | 52 | 103 | 7.1 | 51 | 102 | 6.8 | 49 | 100 | 6.7 |
| 2100 | 17 | 48 | 98 | 6.6 | 47 | 96 | 6.5 | 45 | 93 | 6.3 |

**10000 ft pressure altitude** (ISA −5°C; columns ISA−20 = −25°C, ISA+20 = +15°C) [S2 Fig 5-7 sheet 5 of 6, p.5-18]

| RPM | MP | %BHP (ISA−20) | KTAS | GPH | %BHP (ISA) | KTAS | GPH | %BHP (ISA+20) | KTAS | GPH |
|---|---|---|---|---|---|---|---|---|---|---|
| 2700 | 20.5 | 77 | 130 | 10.4 | 75 | 130 | 10.0 | 72 | 130 | 9.6 |
| 2700 | 20 | 75 | 128 | 10.0 | 72 | 128* | 9.6 | 70 | 128 | 9.3 |
| 2700 | 19 | 70 | 124 | 9.3 | 68 | 123 | 8.9 | 65 | 123 | 8.6 |
| 2700 | 18 | 65 | 119 | 8.6 | 63 | 118 | 8.3 | 61 | 118 | 8.0 |
| 2600 | 20.5 | 75 | 128 | 10.1 | 73 | 128 | 9.7 | 70 | 128 | 9.3 |
| 2600 | 20 | 73 | 126 | 9.7 | 70 | 126 | 9.3 | 68 | 126 | 9.0 |
| 2600 | 19 | 68 | 122 | 9.0 | 66 | 121 | 8.7 | 63 | 121 | 8.4 |
| 2600 | 18 | 63 | 117 | 8.4 | 61 | 116 | 8.1 | 59 | 116 | 7.8 |
| 2500 | 20.5 | 74 | 127 | 9.8 | 71 | 127 | 9.4 | 68 | 126 | 9.1 |
| 2500 | 20 | 71 | 125 | 9.5 | 69 | 124 | 9.1 | 66 | 124 | 8.7 |
| 2500 | 19 | 66 | 120 | 8.8 | 64 | 120 | 8.4 | 62 | 119 | 8.2 |
| 2500 | 18 | 62 | 115 | 8.1 | 59 | 115 | 7.9 | 57 | 114 | 7.6 |
| 2400 | 20.5 | 72 | 125 | 9.5 | 69 | 125 | 9.1 | 67 | 124 | 8.8 |
| 2400 | 20 | 69 | 123 | 9.2 | 67 | 123 | 8.8 | 64 | 122 | 8.5 |
| 2400 | 19 | 65 | 118 | 8.5 | 62 | 118 | 8.2 | 60 | 117 | 8.0 |
| 2400 | 18 | 60 | 114 | 7.9 | 58 | 113 | 7.7 | 56 | 112 | 7.4 |
| 2300 | 20.5 | 70 | 123 | 9.2 | 67 | 123 | 8.8 | 65 | 122 | 8.5 |
| 2300 | 20 | 67 | 121 | 8.9 | 65 | 121 | 8.6 | 63 | 120 | 8.3 |
| 2300 | 19 | 63 | 116 | 8.3 | 60 | 116 | 8.0 | 58 | 115 | 7.7 |
| 2300 | 18 | 58 | 112 | 7.7 | 56 | 111 | 7.5 | 54 | 109 | 7.2 |
| 2200 | 20.5 | 68 | 121 | 8.9 | 65 | 121 | 8.6 | 63 | 120 | 8.3 |
| 2200 | 20 | 65 | 119 | 8.6 | 63 | 119 | 8.3 | 61 | 118 | 8.0 |
| 2200 | 19 | 61 | 115 | 8.1 | 59 | 114 | 7.8 | 57 | 113 | 7.5 |
| 2200 | 18 | 57 | 110 | 7.5 | 55 | 109 | 7.3 | 53 | 107 | 7.1 |
| 2100 | 20.5 | 65 | 119 | 8.6 | 63 | 118 | 8.3 | 60 | 118 | 8.0 |
| 2100 | 20 | 63 | 116 | 8.3 | 61 | 116 | 8.0 | 58 | 115 | 7.7 |
| 2100 | 19 | 59 | 112 | 7.8 | 56 | 111 | 7.5 | 55 | 110 | 7.3 |
| 2100 | 18 | 54 | 107 | 7.3 | 52 | 106 | 7.0 | 51 | 104 | 6.8 |
| 2100 | 17 | 50 | 101 | 6.8 | 48 | 99 | 6.6 | 47 | 97 | 6.5 |
| 2100 | 16 | 46 | 94 | 6.4 | 44 | 91 | 6.2 | 43 | 88 | 6.1 |

**12000 ft pressure altitude** (ISA −9°C; columns ISA−20 = −29°C, ISA+20 = +11°C) [S2 Fig 5-7 sheet 6 of 6, p.5-19]

| RPM | MP | %BHP (ISA−20) | KTAS | GPH | %BHP (ISA) | KTAS | GPH | %BHP (ISA+20) | KTAS | GPH |
|---|---|---|---|---|---|---|---|---|---|---|
| 2700 | 19 | 72 | 127 | 9.6 | 69 | 127 | 9.2 | 67 | 127 | 8.9 |
| 2700 | 18 | 67 | 123 | 8.9 | 65 | 122 | 8.5 | 62 | 122 | 8.2 |
| 2700 | 17 | 62 | 117 | 8.2 | 60 | 117 | 7.9 | 58 | 115 | 7.7 |
| 2700 | 16 | 57 | 112 | 7.6 | 55 | 110 | 7.3 | 53 | 108 | 7.1 |
| 2600 | 19 | 70 | 126 | 9.3 | 68 | 125 | 8.9 | 65 | 125 | 8.6 |
| 2600 | 18 | 65 | 121 | 8.6 | 63 | 120 | 8.3 | 61 | 119 | 8.0 |
| 2600 | 17 | 60 | 115 | 8.0 | 58 | 114 | 7.7 | 56 | 113 | 7.4 |
| 2600 | 16 | 55 | 109 | 7.4 | 53 | 108 | 7.1 | 51 | 106 | 6.9 |
| 2500 | 19 | 68 | 124 | 9.1 | 66 | 123 | 8.7 | 64 | 123 | 8.4 |
| 2500 | 18 | 64 | 119 | 8.4 | 61 | 118 | 8.1 | 59 | 117 | 7.8 |
| 2500 | 17 | 59 | 114 | 7.8 | 57 | 112 | 7.5 | 55 | 111 | 7.3 |
| 2500 | 16 | 54 | 108 | 7.2 | 52 | 106 | 7.0 | 50 | 104 | 6.8 |
| 2400 | 19 | 67 | 122 | 8.8 | 64 | 121 | 8.5 | 62 | 121 | 8.2 |
| 2400 | 18 | 62 | 117 | 8.2 | 60 | 116 | 7.9 | 58 | 115 | 7.6 |
| 2400 | 17 | 57 | 112 | 7.6 | 55 | 110 | 7.3 | 53 | 109 | 7.1 |
| 2400 | 16 | 53 | 106 | 7.1 | 51 | 104 | 6.8 | 49 | 102 | 6.7 |
| 2300 | 19 | 65 | 120 | 8.5 | 62 | 119 | 8.2 | 60 | 118* | 7.9 |
| 2300 | 18 | 60 | 115 | 7.9 | 58 | 114 | 7.7 | 56 | 113 | 7.4 |
| 2300 | 17 | 56 | 110 | 7.4 | 53 | 108 | 7.2 | 52 | 106 | 7.0 |
| 2300 | 16 | 51 | 103 | 6.9 | 49 | 101 | 6.7 | 47 | 98 | 6.5 |
| 2200 | 19 | 63 | 118* | 8.3 | 61 | 118 | 8.0 | 59 | 116 | 7.8 |
| 2200 | 18 | 59 | 113 | 7.8 | 56 | 112 | 7.5 | 54 | 111 | 7.3 |
| 2200 | 17 | 54 | 108 | 7.2 | 52 | 106 | 7.0 | 50 | 104 | 6.8 |
| 2200 | 16 | 50 | 101 | 6.7 | 48 | 99 | 6.6 | 46 | 95 | 6.4 |
| 2100 | 19 | 61 | 116 | 8.0 | 58 | 115 | 7.7 | 56 | 113 | 7.5 |
| 2100 | 18 | 56 | 111 | 7.5 | 54 | 109 | 7.2 | 52 | 107 | 7.0 |
| 2100 | 17 | 52 | 105 | 7.0 | 50 | 103 | 6.8 | 48 | 100 | 6.6 |
| 2100 | 16 | 48 | 98 | 6.6 | 46 | 95 | 6.4 | 44 | 91 | 6.2 |

---

## Appendix B: how the derived numbers were made

- **[S1] charts.** Rendered at 300 dpi with `pdftoppm`.
  - Grid lines were found by row and column darkness.
  - Curves were traced by scanning pixel columns and excluding grid rows, then converted with linear interpolation between labelled grid lines.
  - Fig 3-42's straight lines were fitted at three or more MAP stations and checked at a fourth (residual ≤0.5 HP).
  - Altitude-chart lines were fitted in chart-x coordinates, because the altitude axis is non-linear, and checked at 9,500 and 18,500 ft (≤0.3 HP).
- **§3.5 comparison.** Implements the chart's four-step A–B–C–D method with the digitized curves.
- **§4.2 fit.** Ordinary least squares over every POH cruise cell that has both %BHP and GPH.
- **§8.1 carburetor-ice zones.** Classified by legend colour on the 300 dpi render of SSL 14 p.5. The chart is schematic: its 100% RH line does not lie exactly on dew point = temperature, so depressions are measured from the zone's saturated edge.

---

## Sources

- **[S1]** Lycoming *Operator's Manual, O, HO, IO, AIO, HIO & TIO-360 Series*, P/N **60297-12**, 8th ed. Oct 2005, revisions through Dec 2009. Copy hosted by EAA Chapter 245: https://chapters.eaa.org/eaa245/-/media/3B5A3308519148D58C389A05AEEC001F.ashx
  - §1 Description (p.1-1..1-4, Table 1: magnetos and carburetors).
  - §2 Specifications (p.2-1; weights p.2-8).
  - §3 Operating Instructions:
    - Ground running and magneto check, p.3-3..3-5.
    - Throttle-rate note, p.3-5.
    - Leaning rules, p.3-6..3-8.
    - **Fig 3-1** representative mixture curve, p.3-7.
    - Carburetor heat, p.3-8..3-9.
    - Fuel grades and pressures, p.3-10.
    - Oil grades, sump and temperatures, p.3-11.
    - Oil pressure and operating-conditions table, p.3-12.
    - **Fig 3-39** fuel flow vs. % rated power, O-360 180 HP (Curve 13357), p.3-53.
    - **Fig 3-42** sea-level and altitude performance, O-360-A1F6 et al. (Curve 13358), p.3-56.
- **[S2]** *Pilot's Operating Handbook, Cardinal, 1977 Cessna 177B*, s/n 17702629 (N110PF), retyped by the Flying Club of Kansas City. Internet Archive item `manualzilla-id-6004364`: https://archive.org/details/manualzilla-id-6004364 (PDF: https://archive.org/download/manualzilla-id-6004364/6004364.pdf).
  - §1 General (performance specifications, engine, prop, fuel, oil).
  - §2 Limitations (power plant limits, Fig 2-3 instrument markings).
  - §3 Emergency (carburetor icing, plug fouling, magneto malfunction, low oil pressure, over-voltage).
  - §4 Normal procedures (checklists, magneto check, cruise and leaning, Fig 4-3 and 4-4, cold weather).
  - §5 Performance (Fig 5-5 ROC, Fig 5-6 time/fuel/distance, Fig 5-7 cruise sheets 1–6).
  - §7 Systems (engine instruments, oil, ignition, induction, carburetor, cooling, prop, fuel, electrical).
  - §8 (oil).
- **[S3]** Lycoming **Service Instruction 1094D**, *Fuel Mixture Leaning Procedures*, 25 Mar 1994 (current revision per Lycoming's site): https://www.lycoming.com/sites/default/files/attachments/Fuel%2520Mixture%2520Leaning%2520Procedures.pdf. Index page: https://www.lycoming.com/node/126708
- **[S4]** *Lycoming Flyer Key Reprints*, 4-cylinder compilation (Operations section), hosted by PCE: https://pceonline.com/wp-content/uploads/2023/11/FLYER-KEY-REPRINTS-4-CYL-KEY-MAINTENANCE-AND-PERFORMANCE-ARTICLES.pdf. Flyer page numbers:
  - "Detonation and Preignition" (p.19)
  - "The EGT and Fuel Management" (p.40–41)
  - "Induction Icing" (p.47–48)
  - "Cold-weather Operations" (p.48–50)
  - "Importance of the CHT" and "More on CHT" (p.51–52)
  - "Avoid Sudden Cooling" (p.53–54)
  - "Sticking Valves" (p.54–55)
  - "Wet Air Effect" (p.64)
  - "Thieves of Aircraft Engine Power" (p.62: proper warm-up is 2–3 min at 1000–1200 RPM above freezing) and maintenance ground-test guidance (p.82: 1000 RPM until oil temperature stabilizes or reaches 140°F).
- **[S5]** Cardinal Flyers Online specification pages (owner organization; "not intended for flight planning"):
  - [S5a] 177: https://www.cardinalflyers.com/prep/specs/177.php
  - [S5b] 177A: https://www.cardinalflyers.com/prep/specs/177a.php
  - [S5c] 177B 1970–74: https://www.cardinalflyers.com/prep/specs/177b.php
  - [S5d] 177B 1975–78: https://www.cardinalflyers.com/prep/specs/177b2.php
- **[S6]** Hartzell "Top Prop" sheet, *Cessna 177B Cardinal with O-360-A1F6(D) 180HP*: https://hartzellprop.com/wp-content/uploads/CESSNA-177B-2-blade.pdf. Covers the replaced McCauley C202, C206 and C208 props, the Hartzell HC-C2YR-1BFP/F7694-1.5, and its placard.
- **[S7]** (not used)
- **[S8]** NZ CAA airworthiness directive schedule, Cessna 177 series. Lists FAA TC **A13CE** for 177 and 177B and **A20CE** for 177RG: https://avsec.govt.nz/assets/aircraft/airworthiness-directives/aeroplanes/CESS177.pdf
- **[S9]** FAA *Pilot's Handbook of Aeronautical Knowledge* (FAA-H-8083-25), Fig 7-12, carburetor icing probability chart, as reproduced in a FAASafety.gov handout: https://www.faasafety.gov/files/events/SO/SO15/2025/SO15140577/PilotsHandbookOfAeronauticalKnowledgePHAKfig7-12.pdf
- **[S10]** UK CAA *Safety Sense Leaflet 14: Piston Engine Icing*, June 2023: https://caa.co.uk/publication/download/12659
  - p.2: carburetor cooling up to 35°C.
  - p.5: atmospheric conditions and icing-probability chart.
  - p.7: symptoms, including the EGT drop and MAP drop with a constant-speed prop.
  - p.8: procedures and run-up carburetor-heat check.
- **[S11]** Mike Busch, "Mag Check", AOPA, 26 Mar 2018: https://www.aopa.org/news-and-media/all-news/2018/march/26/mag-check. EGT rise 50–100°F on a single mag; plug vs. magneto vs. timing signatures.
- **[S12]** Mike Busch, "Savvy Maintenance: Hot heads", *AOPA Pilot*, Oct 2021: https://www.aopa.org/news-and-media/all-news/2021/october/pilot/savvy-maintenance-hot-heads. CHT targets and floor; hot-cylinder diagnosis (ROP vs. LOP test); timing.
- **[S13]** D. Hirschman, "P&E/A&P: Early warning of valve trouble", AOPA, 7 Aug 2014: https://www.aopa.org/news-and-media/all-news/2014/august/07/pe_aande. Savvy FEVA: 30–100°F EGT oscillation at about 1 cycle/min.
- **[S14]** J.P. Instruments *EDM-700/800 Pilot's Guide* Rev W. Local copy: `edm800-sim/source/PG-EDM-800-Rev-W.pdf`; extract in `docs/01-MANUAL-EXTRACT.md` §4, p.21–25. Typical normal parameters and the engine diagnosis chart.
- **[S15]** John Deakin, "Pelican's Perch #65: Where Should I Run My Engine? (Part 3 – Cruise)", AVweb: https://avweb.com/features/pelicans-perch-65where-should-i-run-my-enginepart-3-cruise/. Red-box boundaries; written for fuel-injected engines.
- **[S16]** PiperOwner forum, "High O-360 CHT's" (2022–23): https://www.piperowner.org/talk/discussion/156134/high-o-360-chts. FORUM: per-cylinder CHT anecdotes for a PA-28 O-360.
- **[S17]** D. L. Kohlman, *Flight Test Data for a Cessna Cardinal*, NASA CR-2337, Jan 1974: https://ntrs.nasa.gov/api/citations/19740006639/downloads/19740006639.pdf. Table III: handbook vs. flight-test ROC; airplane s/n 17700002.
- **[S18]** Kitplanes, "A Verna-What?": https://www.kitplanes.com/a-verna-what/. Vernatherm behavior; typical stable oil temperature 180–200°F.
- **[S19]** Search-result-level FORUM leads, not opened, used only as unverified hints:
  - Pilots of America "High CHT #3, O-360": https://pilotsofamerica.com/community/threads/high-cht-3-o-360.144165/ (HTTP 403)
  - Backcountry Pilot "hot cylinder – 320 Lyc": https://backcountrypilot.org/forum/hot-cylinder-320-lyc-2826
  - Mooneyspace "Carbureted O-360 engine CHT/EGT temps on climb out?": https://mooneyspace.com/topic/14729-carbureted-o-360-engine-chtegt-temps-on-climb-out/ (HTTP 403)
- **[S20]** Search-result-level FORUM leads on carburetor full-throttle flow, not opened:
  - Van's Air Force "MA4-5 10-4164-1 carburetor": https://vansairforce.net/threads/ma4-5-10-4164-1-carburetor.226536/
  - Mooneyspace "Carburetor STC": https://mooneyspace.com/topic/46235-carburetor-stc/page/2/

---

## Addendum (from the plan critique, `docs/07-ENGINE-PLAN-CRITIQUE.md`)

Sources found by the critique agent. Tags as above; φ values marked *calc* are the critic's derivation.

| Tag | Source | Key data | Label |
|---|---|---|---|
| [N1] | Swiss FOCA, *Engine Exhaust Emissions Measurement — Piston Engines*, Lycoming O-360-A3A with **MA-4-5** carburetor, ground test, fixed-pitch prop, 18 Oct 2005 — https://www.bazl.admin.ch/dam/de/sd-web/ehcjwBxPuGxo/p002foca_lyc_o-360.pdf | Fuel flow: take-off (static full throttle, RPM not reported) **15.9 GPH**; climb 85 % 13.5; cruise 65 % full rich **10.3**; cruise 65 % lean **8.5**; approach 45 % 7.1; taxi **2.1**. φ from CO emission index (*calc*, ±0.05): 1.38 / 1.28 / 1.23 / 1.07 / 1.35 / 1.34 | SIBLING, measured |
| [N2] | 14 CFR §23.1093(a)(1) | Carburetor preheater: **90°F rise at 75 % MCP in 30°F dry air** (venturi carburetors). 177B CAR 3 basis likely equivalent (verify) | OFFICIAL (regulation) |
| [N3] | BEA, *Piston engine induction icing study — synthesis*, Dec 2023 — https://bea.aero/fileadmin//user_upload/Synthese_etude_givrage_EN_041223.pdf | Risk-zone criteria "not defined objectively"; CS-23 heat rise 50°C at 75 %; icing onset takes minutes, ~150 RPM lost within a few minutes once started (fixed pitch); heat clears ice almost instantly with a brief dip; self-shedding after ~10 min possible; carburetor-body temperature matters | OFFICIAL (investigation study) |
| [N4] | Kitplanes "Carburetor Maintenance"; AvWeb maintenance article | Idle mixture check: warm idle 650–750 RPM; pulling to idle cut-off gives a **25–50 RPM rise** before the engine stops | TYPICAL, search-level |
| [N5] | M. Cook, "An Engine Near Miss", 2004 (flyingmag.com) | Detonation: rapid CHT rise, virtually no EGT change. Pre-ignition: that cylinder's EGT **dropped** to the coolest while CHT went 310 → 384 → 463°F at 30 / 60 s | TYPICAL (documented case) |
| [N6] | M. Busch, "How to destroy your engine in one minute", AOPA, 13 Apr 2015 | Pre-ignition CHT rise ≈1°F/s; engine destroyed in about a minute; advanced timing → lower EGT, higher CHT | TYPICAL |
| [N7] | General Aviation News, "What is fueling high engine temps?", 14 Sep 2017 | 1972 177B owner: #2/#4 ≈420°F in climb; reply: "#3 is typically the hottest"; Cardinal baffling issues | FORUM, search-level |
| [N8] | McCauley guidance quoted on Van's Air Force | Static RPM against the low-pitch stop should be **25–100 RPM below rated** | TYPICAL, search-level |
| [N9] | Van's Air Force, "Anti-Splat Aero cowl flap" | RV-7: cowl flap 15–20°F cooler in a summer max-performance climb, almost no effect above Vy | FORUM, search-level |
