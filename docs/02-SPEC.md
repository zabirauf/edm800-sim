# EDM-800 Behavioral Specification (for state machine + simulator)

Derived from JPI Pilot's Guide EDM-700/800/711 Rev W (structured extract `01-MANUAL-EXTRACT.md`, kept locally, not in
the repository). Revision 3.2 (ALM-6 clarified by
the TLA+ conformance check, `09-TLA-EVALUATION.md`); the mode/alarm rules are also stated formally in `spec/tla/EDMCore.tla`. Page refs `p.N` are manual page
numbers; `FC` = the "How to Change Modes" flowchart (front matter); `QR` = Quick Reference (p.56–57).

Tags on each rule:
- **[M]** stated by the manual (cited).
- **[I]** interpretation — the manual is silent or vague; the chosen behavior is documented with rationale. All [I]
  items are collected in §20 (Interpretation register).
- **[C]** the manual contradicts itself; resolution documented in §21 (Conflict register).
- **[SIM]** simulator-only simplification (physics/sensors), not instrument logic.

Requirement IDs (e.g. `BTN-3`) are stable and are referenced by tests.

**Revision 2** incorporates the independent review in `03-SPEC-REVIEW.md` (findings R1–R30); changed rules are marked
`(rev2)`. See §22 for the disposition of every finding. **Revision 3** resolves the validation report
`05-VALIDATION-REPORT.md` (deviations D1–D5, spec issues S1–S13); changed rules are marked `(rev3)`, see §23.

---

## 1. Scope and models

- SCOPE-1 Primary target: **EDM-800** with configurable installed options. [M p.1]
- SCOPE-2 Model variants supported by configuration: `model ∈ {800, 700}` and `primary711 ∈ {false,true}`
  (an EDM-700/800 with primary functions is called EDM-711, p.41). [M p.41]
- SCOPE-3 EDM-700 differences: no %HP/RPM upper window, no RPM/MAP parameter, no HP-?/HPC/MAP-cal program items, no
  MAP/CYL/HP/EC alarm-list items; view indicator is a dash at **N** or **P** instead of **NRM**. [M p.4–6, p.43]
- SCOPE-4 EDM-711 (`primary711`) differences: see §13. [M]

## 2. Configuration (installation) — fixed while powered

| Key | Values | Default | Notes |
|---|---|---|---|
| `model` | 800, 700 | 800 | |
| `primary711` | bool | false | |
| `cylinders` | 4, 6 | 6 | number of cylinder columns / EGTn items (the CYL program item does not change this; see LIM-6) (rev2) |
| `oat`, `iat`, `cdt`, `crb`, `oil` | bool | oat=true, iat=false, cdt=false, crb=false, oil=true | CRB is ignored when CDT installed [M p.10] |
| `tit` | 0, 1, 2 | 1 | number of TIT probes |
| `ff` | bool | true | Fuel Flow option (adds select switch, FF params, FF program items) |
| `gps` | bool | true | GPS interface (requires `ff`) |
| `usbPort` | bool | true | optional panel USB port |
| `busVolts` | 12, 24 | 12 | selects BAT factory defaults |
| `transducerK` | number | 29.00 | true K of the installed transducer [SIM] |

Model notes (rev2, R26): p.1 lists OAT and FF as standard on the 800 and OIL standard on the 711; the configuration
still allows them off so instructors can show uninstalled-option behavior. [SIM]

## 3. Inputs (events)

- IN-1 `PRESS(button)`, `RELEASE(button)`; `button ∈ {STEP, LF}`. Physical button state is tracked even when off.
- IN-2 `TICK(ms)` advances time. The machine internally advances in sub-steps of ≤ 50 ms so all timers fire in order.
- IN-3 `POWER_ON`, `POWER_OFF`.
- IN-4 `SENSORS(data)`: raw sensor values in °F / volts / inHg / RPM / true GPH, plus failed-probe set and GPS data.
  GPS status ∈ {`off` (no comms or GPS off: REQ/RES/MPG missing, no message), `nocom` (comms received, auto-protocol in
  progress → `NO-COM`), `nosig` (`NO-SIG`), `nowpt` (`NO-WPT`), `ok`} plus `offCourse` flag, ground speed, distance. (rev2, R17)
- IN-5 `SELECT_SWITCH(T|A|F)` (EGT / ALL / FF) — only meaningful when `ff` installed. Default position `A`.
- IN-6 `USB_INSERT`, `USB_REMOVE` (optional USB port); `MEMBOX_CONNECT`, `MEMBOX_DISCONNECT` (accessory memory box).
- IN-7 `AMBIENT(level 0..1)` light level for auto-dimming.

## 4. Button gestures

Definitions: **tap** = press momentarily; **hold** = press and keep pressed (general definition: five seconds or
longer). [M p.8]

| ID | Gesture | Recognition |
|---|---|---|
| BTN-1 | `STEP_TAP` / `LF_TAP` | single button pressed and released before `T_HOLD_START` (700 ms), no chord [I] |
| BTN-2 | `X_HOLD_START` | single button still held at 700 ms (fires once) [I] |
| BTN-3 | `X_HOLD_REPEAT` | after HOLD_START, every 200 ms while held (LF value repeat) / 250 ms (STEP backwards) [I] |
| BTN-4 | `LF_HOLD_3S` | LF alone held 3000 ms (fires once) [M p.9, QR] [C1] |
| BTN-5 | `STEP_HOLD_5S` | STEP alone held 5000 ms (fires once) [M p.8 general hold] [I] |
| BTN-6 | `X_RELEASE_AFTER_HOLD` | release of a single button after its HOLD_START fired (no tap) |
| BTN-7 | Chord | the second button is pressed while the first is still down and before the first reached `T_HOLD_START`. While in a chord no single-button events are generated until both are released. |
| BTN-8 | `BOTH_TAP` | chord released (first release) less than `T_HOLD_START` (700 ms) after the chord formed; a release between 700 ms and 5000 ms produces nothing (rev2, R11) [I] |
| BTN-9 | `BOTH_HOLD_5S` | chord held 5000 ms measured from the second press (fires once; continuing to hold does nothing more) [M p.9] |
| BTN-10 | If the second button is pressed after the first already reached HOLD_START, it is ignored until both are released. [I] |
| BTN-11 | A button that is already down at `POWER_ON` produces no tap/hold events until released. [I] |

Numeric-value convention in programming: **tap LF = decrease one step; hold LF = increase**, auto-repeating. [M p.43,
p.27, p.38, p.46] Y/N and list items: **tap LF = next alternative**. Every numeric range **clamps** at its limits
unless the rule explicitly says *wrap* (rev3, S9) [I]. Hold-repeat: first increment at HOLD_START,
then every 200 ms; for ranges with more than 100 steps the step becomes ×10 after 3 s of continuous holding. [I]

## 5. Top-level state structure

```
OFF
TANK_SETUP {MAIN, AUX_Q, AUX}                (power on with STEP held, ff only)
SELFTEST {SEGMENTS, COLUMNS, PROBES}
STARTUP_INFO {DATE, TIME, FULL, ID}
FUEL_FILL (context = powerup | program) {BANNER, FILL_N, FILL_MAIN, FILL_FULL, FILL_PLUS, ADD}
AUTO
MANUAL
LEANFIND {ARMED, ACTIVE, LEANEST, ROP_SET, LOP_DONE, LOP_REVIEW}
PROGRAM {BANNER, ITEM(id), OAT_CAL, ADJUST_BANNER, HPC, MAP_CAL, KF_EDIT, ORIG_TIT, CAL_TIT,
         LTM(item), LTM_ID_EDIT, DUMP_XFER, SAVE_D, FACLIM_BANNER, FACLIM(item), EC_EDIT}
USB {MENU, XFER, DONE}   (source = port | box)
```
Overlays that can be shown on top of AUTO / MANUAL / LEANFIND digital display: **alarm**, `OFF` confirmation,
`SNAP`. Analog display, dot and upper window are computed independently of the digital overlay.

## 6. Power-up sequence

- PWR-1 `POWER_ON` with STEP physically held and `ff` installed → `TANK_SETUP.MAIN`. [M p.46, QR]
  Otherwise → `SELFTEST.SEGMENTS`.
- PWR-2 TANK_SETUP items: `MAIN=50` (0…999, step 1), `AUX? N` (N⇔Y), `AUX=0` (0…250, only if AUX? Y). STEP advances;
  tap LF decreases / toggles; hold LF increases. STEP on the last shown item → `SELFTEST`. [M p.46] [I: destination]
  Values written here are the same settings as the alarm-limit list MAIN/AUX?/AUX.
- PWR-3 `SELFTEST.SEGMENTS`: all digits/segments lit for 3000 ms. [M p.11 "a few seconds"] [I: duration]
- PWR-4 `SELFTEST.COLUMNS`: each column (cylinders then T column if any) lit alone in sequence, 300 ms each. [M p.11] [I]
- PWR-5 `SELFTEST.PROBES`: for each failed probe channel, show `OPEN PRB` (or `CAL ERR` for a calibration fault) for
  1500 ms then the channel name for 1500 ms. Channel names: `EGT 1`…`EGT 6`, `CHT 1`…`CHT 6`, `OIL`, `TIT 1`,
  `TIT2`, `CDT CRB` (CDT/carb), `IND` (IAT), `OAT`. Failed channels are deleted from the scan and analog display. [M p.11]
- PWR-6 `STARTUP_INFO` (long-term memory is standard): date `MM.DD.YY` (e.g. `11.12.01`), time `HH.MM` (`13.26`),
  `FULL nn` (percent of memory filled since last save), aircraft ID (e.g. `N12345`), each 1500 ms. [M p.31] [I: durations, date order]
- PWR-7 If `ff`: `FUEL_FILL` with context `powerup`: `FUEL` for 1000 ms, then `FILL? N` **flashing** until any
  button is pressed; then the fuel-fill flow of §11. Exit → `MANUAL`. [M p.26–27]
  If not `ff`: → `MANUAL`.
- PWR-8 `MANUAL` is entered at the first item of the current scan list. [I]
- PWR-9 At 120 000 ms after `POWER_ON`, if the state is `MANUAL` it changes to `AUTO` (one-shot). If at that instant
  the power-up sequence (TANK_SETUP / SELFTEST / STARTUP_INFO / power-up FUEL_FILL) is still running, the sequence
  ends in `AUTO` instead of `MANUAL`. In any other state (LEANFIND, PROGRAM, USB) no change. (rev2, R12) [M p.7, FC] [C2] [I]
- PWR-10 At power-on: all parameters are reset to **included** [M p.12]; alarm snoozes/OFFs cleared [M p.8 "remainder
  of the flight"]; view = Percentage; LOP results cleared. [I for view/LOP]
- PWR-11 `POWER_OFF` from any state → `OFF`. All settings (program values, alarm limits, fuel remaining/used, clock,
  LTM data) are non-volatile. [I] (p.1 "non-volatile" refers to the LTM; the rest is assumed)

## 7. Parameter scan (digital display in AUTO / MANUAL)

### 7.1 Scan list (order) [M p.10, p.29]
| # | id | Switch | Present when |
|---|---|---|---|
| 1 | BAT | T,A | always |
| 2 | OAT | T,A | `oat` and probe ok |
| 3 | IAT | T,A | `iat` and probe ok |
| 4 | CDT | T,A | `cdt` and probe ok |
| 5 | CRB | T,A | `crb` and not `cdt` and probe ok |
| 6 | DIF | T,A | ≥ 2 working EGT probes |
| 7 | RPMMAP | T,A,F | model 800 |
| 8 | REM | F,A | `ff` |
| 9 | GPSMSG | F,A | `ff && gps` and GPS status ∈ {nocom, nosig, nowpt} [I: placed where REQ would be; `off` shows nothing] |
| 10 | REQ | F,A | `ff && gps` and GPS status = ok |
| 11 | RES | F,A | `ff && gps` and GPS status = ok |
| 12 | MPG | F,A | `ff && gps` and GPS status ∈ {ok, nowpt} |
| 13 | HM | F,A | `ff` |
| 14 | GPH | F,A | `ff` |
| 15 | USD | F,A | `ff` |
| 16.. | EGT1..EGTn | T,A | per cylinder, unless both its EGT and CHT probes failed |
| | TIT1 | T,A | `tit ≥ 1` and probe ok |
| | TIT2 | T,A | `tit = 2` and probe ok [I] (rev2, R9: p.10 "Turbine #1, left … Turbine #2, right" is read as the left/right turbochargers of a twin-turbo engine, each its own item; p.29 has no TIT2 row, T,A assumed) |
| | OIL | T,A | `oil` and probe ok |
| | CLD | T,A | ≥ 1 working CHT probe |

- SCAN-1 Without `ff` there is no select switch; all non-FF items are present.
- SCAN-2 With `ff`, an item is present only if the current switch position is in its Switch column. [M p.26, p.29]
- SCAN-3 Uninstalled/failed parameters never appear. [M p.10, p.11]
- SCAN-4 If the list changes (switch moved, probe failed, GPS status changed) and the current item is gone, the display
  moves to the next present item in list order (wrapping). [I]

### 7.2 Digital formats [M p.10, p.29]; `°` values in the engine unit (ENG F/C) except OAT (OAT F/C setting)
| id | Format | Example |
|---|---|---|
| BAT | `v.v BAT` | `14.2 BAT` |
| OAT | `t OAT` (incl. OAT calibration) | `81 OAT` |
| IAT / CDT / CRB | `t IAT` / `t CDT` / `t CRB` | `-22 CRB` |
| DIF | `d DIF`; dot = cylinder whose EGT deviates most from the mean | `80 DIF` |
| RPMMAP | `rpm map` (RPM rounded to 10, MAP 1 decimal incl. MAP calibration) | `2450 23.1` |
| REM / REQ / RES / USD | `fuel LABEL` (fuel format below) | `37.2 REM` |
| REQ/RES off-course | `--- REQ` / `--- RES` when ground track > 70° off course [M p.47] | |
| GPSMSG | `NO-COM` / `NO-SIG` / `NO-WPT` [M p.47] | |
| MPG | `n.n MPG` (label MPG/MPK/MPL/MPP for GAL/KGS/LTR/LBS) | `13.0 MPG` |
| HM | `HH.MM H.M` (no trailing dot); `--- H.M` when no transducer signal or flow below 0.5 [M p.47] [I] | `02.45 H.M` |
| GPH | `r.r GPH` (GPH/KPH/LPH/PPH); `0.0 GPH` when flow < 0.5 unit/h; `--- GPH` no signal [M p.47] | `13.5 GPH` |
| EGTn | `egt cht`, dot under cylinder n; EGT rounded to 10° unless `EGT 1?Y`; failed side blank [M p.6, p.34]. The 10° rounding applies **only** to EGTn items; TIT, DIF and all LeanFind values (egt, peak, Δ) are always 1° (rev2, R10) [I] | `1340 376` |
| TIT1 | with `ff`: `tit ff` (FF 1 decimal) [M p.29]; without: `tit TIT` | `1370 13.5` |
| TIT2 | `tit TI2` [M p.10] | |
| OIL | `t OIL` | `178 OIL` |
| CLD | `c CLD` = most negative CHT rate (°/min) over all cylinders, 0 if none cooling; dot = that cylinder [M p.10] | `-30 CLD` |
| CHTHI (711 auto only) | `cht CHT`, dot = hottest CHT cylinder | `380 CHT` |

- FMT-1 Fuel format: if |v| < 100 → one decimal with the leading `0` suppressed (`.0`, `.5`, `37.2`); else integer. [I] [C17]
- FMT-2 Excluded items show a decimal point before the label: `184 .OIL`; for EGTn the point precedes the CHT field
  (`1340 .376`). [M p.12] [I: EGTn placement] For TIT1 with ff the point precedes the flow field (`1370 .13.5`). (rev3.1)
- FMT-3 Temperatures in °C are converted from raw °F; DIF/CLD in °C use ×5/9. [M p.42–43]

### 7.3 AUTO mode [M p.7–8, p.11]
- AUTO-1 Shows each **included** present item for `RATE` seconds (default 4), then the next included present item
  (wrapping). RPMMAP is shown for 1 s. [M p.10, p.29]
- AUTO-2 `RATE 0` → no indexing (display frozen on the current item). [M p.34, QR]
- AUTO-3 `STEP_TAP` → `MANUAL`, keeping the current item. [M p.8]
- AUTO-4 `LF_TAP` → LeanFind (§10). [M p.9]
- AUTO-5 `LF_HOLD_3S` → toggle Percentage/Normalize view. [M p.9]
- AUTO-6 `BOTH_HOLD_5S` → `PROGRAM.BANNER`. [M p.9]
- AUTO-7 Entering AUTO (from MANUAL via LeanFind+STEP, the 2-min timer, program exit) restarts the dwell timer on the
  current item; if the current item is excluded it advances immediately to the next included one. [I]
- AUTO-8 If no present item is included, the display stays on the current item. [I]

### 7.4 MANUAL mode [M p.8, p.12]
- MAN-1 `STEP_TAP` → next present item (wrap); exclusion is ignored in MANUAL (all present items shown). [M p.12]
- MAN-2 `STEP_HOLD_START` then each `STEP_HOLD_REPEAT` → previous item ("rapidly backwards"). [M p.8] [I: timing]
- MAN-3 `BOTH_TAP` → toggle include/exclude of the displayed item for AUTO (not on 711). [M p.9, p.12]
- MAN-4 `LF_TAP` → LeanFind; `LF_HOLD_3S` → toggle view. [M p.9]
- MAN-5 `BOTH_HOLD_5S` → `PROGRAM.BANNER`, **except** when the displayed item is USD: then fuel used = 0 and the
  display shows `.0 USD` (stay in MANUAL). [M p.28, QR]
- MAN-6 Exit to AUTO = tap LF then tap STEP (via LeanFind). [M p.12, FC]
- MAN-7 While an alarm overlays the digital display, `BOTH_TAP` / `BOTH_HOLD_5S` / LF gestures act on the underlying
  scan item and mode exactly as without the alarm; the dot follows the visible (alarm) content. (rev2, R20) [I]
- MODE-1 `STEP_HOLD_5S` / `STEP_HOLD_START` in AUTO without an alarm displayed: no effect. USB/memory-box connection
  outside AUTO/MANUAL is ignored. (rev2, R29) [I]

## 8. Analog display

- ANA-1 One column per cylinder 1..`cylinders`, plus a last column if TIT or OIL installed: shows TIT1 (label `T`) if
  `tit ≥ 1`, else OIL (label blank — "If the T is absent … the last column displays Oil temperature"). If both TIT and
  OIL, OIL is shown as a missing segment in the T column. Column model carries `id: 'T'` for this column. (rev2, R16) [M p.6]
- ANA-2 Each column has **13 segments** (from the face figure, p.4). [M figure]
- ANA-3 (rev3, S10: computed in °F — sensor °F over the red line converted to °F — whatever the ENG unit) **Percentage view**: lit EGT segments `n = clamp(round((EGT/red − 0.5)/(0.5/12)) + 1, 0, 13)` when EGT ≥
  50 % of red line, else 0. Red line = the TIT alarm limit (it "also sets the maximum scale of the EGT and TIT bar
  graph"; the TIT limit item is always present, rev2 R14). For an OIL-only last column the scale uses the H OIL limit.
  [M p.5, p.43] [I: rounding]
- ANA-4 **Normalize view**: on entry each EGT/TIT column's reference = its current value; `n = clamp(7 + round((v −
  ref)/10°F), 0, 13)` (10°F per segment; 7 = half height). The OIL column is not normalized. Indicator: `NRM` lit
  (800) / dash at N (700). [M p.5] [I: 7]
- ANA-5 **CHT** = missing segment `k = round((CHT°F − 250)/25) + 1`, clamped to 1..13; none if CHT < 237.5°F. If the
  EGT bar is shorter than k, segment k is shown as a single isolated lit segment. CHT is unaffected by view/mode. [M p.6]
- ANA-6 OIL-as-missing-segment in the T column uses the Percentage formula on the OIL value vs H OIL limit. [I]
- ANA-7 The highest lit TIT segment flashes while the digital display shows TIT1 (incl. a TIT alarm); the OIL segment
  flashes while the digital display shows OIL (incl. OIL alarms). Under an overlay the flashes follow the overlay
  content, not the item underneath (rev3, D4). [M p.6] Any TIT alarm (raised by TIT1 or TIT2) flashes the T column's top segment. (rev3.1)
- ANA-8 (rev3: while an overlay — alarm, `OFF`, `SNAP` — is shown, the dot follows the overlay: the alarming cylinder
  for CHT (the hottest exceeding cylinder) / CLD / DIF alarms, otherwise **no dot**; this also applies in LEANFIND)
  Dot under cylinder n when the digital display is EGTn, DIF (deviating cyl), CLD (fastest cooling cyl), CHTHI,
  a CHT alarm (alarming cyl), or LeanFind (§10). [M p.6, p.10] [I for the CHT-alarm dot and DIF = largest deviation
  from the mean] Overlay precedence: `OFF` > `SNAP` > alarm; an overlay's dot is steady (not blinking). (rev3.1)
- ANA-9 Pre-ignition: in AUTO, MANUAL **and LEANFIND** (rev3, S2: the manual has no mode restriction) any column
  whose EGT > 2000°F flashes, in addition to any LeanFind column flash; the digital display is not forced to that
  cylinder. [M p.25] [I: 2000°F trigger]
- ANA-10 A failed EGT probe → missing column; failed CHT probe → no CHT segment. [M p.11]
- ANA-11 Upper window (800 only): `nn HP` if `HP-? Y` and fuel flow is operational (ff installed and signal present),
  else RPM rounded to 10. %HP = round(truePctHP × HPC/125). [M p.6, p.34–35, p.20] [SIM formula]
- ANA-12 °F/°C indicator follows ENG F/C. [M p.5]
- ANA-13 Dimming: display brightness follows ambient light, settling within about 10 s (first-order, time constant
  3.3 s → 95 % in 10 s) ("Allow ten seconds for the display to adjust"). (rev3, S1) [M p.7] [I]

## 9. Alarms [M p.24–25, p.42]

- ALM-1 Conditions (evaluated continuously, regardless of include/exclude and select switch):

| Pri | id | Condition | Display |
|---|---|---|---|
| 1 | CHT | any CHT > H CHT | `cht CHT` + dot at that cylinder |
| 2 | OILH | OIL > H OIL | `t OIL` |
| 3 | TIT | any TIT > TIT limit | `t TIT` |
| 4 | OILL | OIL < L OIL | `t OIL` |
| 5 | CLD | CLD < CLD limit (e.g. −65 < −60) | `c CLD` + dot |
| 6 | DIF | DIF > DIF limit | `d DIF` + dot |
| 7 | BATH | BAT > H BAT | `v.v BAT` |
| 8 | BATL | BAT < L BAT | `v.v BAT` |
| 9 | MAP | MAP > MAP limit (800) | `m.m MAP` |
| 10 | LOFUEL | REM < REM limit (ff) | `r REM` |
| 11 | LOTIME | endurance minutes < MIN limit (ff, flow ≥ 0.5) | `HH.MM H.M` |

- ALM-2 The highest-priority active, un-suppressed alarm is shown **flashing** in the digital display, replacing the
  normal digital content, in AUTO, MANUAL and LEANFIND. Lower ones are masked. When the condition clears the alarm
  display stops. [M p.24–25]
- ALM-3 Alarms are not shown in PROGRAM, self-test, startup info, fuel fill, tank setup or USB states. [I]
- ALM-4 `STEP_TAP` while an alarm is displayed → that alarm id is suppressed for 10 minutes; the tap has no other
  effect (no mode change). [M p.8, p.25] [C3]
- ALM-5 `STEP_HOLD_5S` while an alarm is displayed → `OFF` shown for 1500 ms; that alarm id suppressed until power
  off. [M p.8, p.25]
- ALM-6 If an alarm is displayed when STEP is pressed, that STEP press's **single-button** gestures are routed only to
  ALM-4/5 (MANUAL backwards scanning does not occur). A two-button chord is unaffected (MAN-7). An alarm that appears
  while STEP is already held does not capture that press. (rev3, S4/S11) [I] "Displayed" means visible: while the `OFF`
  or `SNAP` confirmation covers the alarm (§5 precedence OFF > SNAP > alarm) the alarm does not capture STEP, so STEP
  cannot silence an alarm the pilot has not seen. (rev3.2, found by the TLA+ conformance check, docs/09) [I]
- ALM-7 After a 10-minute suppression expires, the alarm shows again if its condition is still active. [I]
- ALM-8 Remote alarm light output = any active, un-suppressed alarm condition while powered, in every state (the
  digital overlay rule ALM-3 does not apply to the light). The LeanFind TIT exception (ALM-9) applies to the light
  only while in LEANFIND. (rev2, R13) [M p.2, p.24] [I]
- ALM-9 LeanFind TIT exception: while in LEANFIND, a TIT alarm is not displayed while TIT exceeds the limit by less
  than 100° and has been continuously above the limit for less than 60 s. While hidden this way it is treated as not
  active (it does not mask lower alarms). (rev3, S5) [M p.16] [I: masking]
- ALM-10 No individual EGT alarms. [M p.24]

## 10. LeanFind [M p.8–9, p.12–16, FC, QR]

Channels considered for activation and for the first peak (ROP only): each working cylinder EGT, plus TIT1 if installed ("the T column
— TIT — is included in the procedure", p.16). LOP completion considers cylinders only. [I]
All LeanFind digital temperatures (egt, peak, Δ) use 1° resolution regardless of `EGT 1?` (rev2, R10).

- LF-1 `LF_TAP` in AUTO/MANUAL → if completed LOP results exist → `LOP_REVIEW`; else → `ARMED` with method **R**
  (default each time; QR shows `LEAN R` first). Records `returnScanItem`. [M p.12, p.16, FC] [I: reset to R]
- LF-2 `ARMED`: shows `LEAN R` / `LEAN L` for 2000 ms after entry or after each toggle, then `egt LF` (no ff) or
  `egt ff` (ff) for the hottest cylinder with a **steady** dot under it. [M p.13–14] [I: post-banner display]
- LF-3 `ARMED` + `BOTH_HOLD_5S` → toggle method R⇄L. [M p.9, p.16]
- LF-4 Activation: each channel's running minimum since entering ARMED is tracked; when any channel rises ≥ 15°F
  above its running minimum → `ACTIVE`. [M p.13–14] [I: running minimum]
- LF-5 `ACTIVE`: dot under the hottest cylinder **flashes** (and its number flashes); digital `egt LF`/`egt ff` of the
  hottest cylinder. The method can no longer change (`BOTH_HOLD_5S` ignored). Per-channel peak (max) tracked. [M p.14–16]
- LF-6 A channel has **peaked** when its EGT ≤ its max − 10°F (`PEAK_DROP`). [I]
- LF-7 ROP: first channel to peak → `LEANEST` (`LEANEST` shown 2000 ms; that column flashes) → `ROP_SET` locked to
  that channel. [M p.13, p.15]
- LF-8 `ROP_SET`: digital `egt SET` (no ff) or `egt ff` (ff, current flow) of the locked channel (live); its column,
  dot and number flash. While LF is held (`LF_HOLD_START` … release) → `peak PK` (no ff) or `peak ffAtPeak` (ff: the
  flow recorded when that channel peaked — QR `I560 I3.5` lies between the activation and SET flows). (rev2, R4)
  If the locked channel is TIT: the T column flashes, no dot, digital `tit SET` / `tit ff`. (rev2, R8) [M p.13, p.15, QR]
  "Flow at peak" = the measured flow at the instant the channel's maximum EGT occurred (not when the 10°F drop was
  detected); the same definition is used for the GAMI spread (LF-11). (rev3, S6) [I] LeanFind flow values are shown as measured with one decimal and a leading zero (`0.3`, `12.4`) — the `0.0` substitution of the GPH item does not apply. If the locked channel is TIT, the T column's whole-column flash is a LeanFind flash and persists under overlays; only its top-segment flash is owned by overlays (ANA-7). (rev3.1)
- LF-9 LOP (`ACTIVE` with method L): each cylinder's number flashes once it has peaked; the bar graph is **inverted**:
  for a peaked channel, segments lit from the top = clamp(round((peak − EGT)/5), 0, 13); non-peaked columns empty.
  Digital before any peak: as LF-5; after ≥1 peak: `Δ LF`/`Δ ff` where Δ = EGT − peak of the most recently peaked
  cylinder, and the **dot flashes under the most recently peaked cylinder** ("the dot of each successive cylinder will
  flash as it peaks"). (rev2, R2) [M p.16] [C18] [I: digital during progress, empty columns] The T column keeps its normal (non-inverted) display in LOP and TIT is ignored for LOP peaks. (rev3.1)
- LF-10 LOP: when all working cylinders have peaked → `LOP_DONE`: inverted graph, last cylinder's column flashes, dot
  at last cylinder, digital `Δ SET` / `Δ ff` with Δ = EGT − peak of the last cylinder. [M p.13 step 9, p.16]
- LF-11 `LOP_DONE`/`LOP_REVIEW` while LF held → `peakFirst spread` where peakFirst = peak EGT of the first (richest)
  cylinder to peak and spread = FF at first peak − FF at last peak (GAMI spread); without ff: `peakFirst PK`. [M p.16, QR] [C4]
- LF-12 `LOP_DONE` stores LOP results. `LF_TAP` in `LOP_DONE` → `LOP_REVIEW`; `LF_TAP` in `LOP_REVIEW` → new
  LeanFind (`ARMED`, results cleared). `LOP_REVIEW` displays exactly like `LOP_DONE` (inverted graph against the stored
  peaks, live Δ of the last cylinder, flow/SET, last column flashing, dot under it). (rev2, R7) [M p.16, FC]
- LF-13 `STEP_TAP` in any LeanFind state (no alarm displayed) → `AUTO` at `returnScanItem`. [M p.8, p.16]
- LF-14 `BOTH_TAP` in any LeanFind state → request a mark; `SNAP` flashes for 2000 ms when the next long-term-memory
  record is written (≤ TIME seconds later; "within the next six seconds", p.30). (rev2, R5) [M p.9, p.30] With `RECRD? N` the request still shows `SNAP` at the next record-interval boundary and counts a mark (`settings.ltm.marks`), but nothing is recorded. (rev3.1)
- LF-15 `LF_TAP` in `ARMED`, `ACTIVE`, `LEANEST` or `ROP_SET` → also requests a mark (QR "Mark data in memory: tap LF
  twice"). (rev2, R6) [C5]
- LF-18 LeanFind event table (rev2, R6). Anything not listed is ignored:

| Event | ARMED | ACTIVE | LEANEST | ROP_SET | LOP_DONE | LOP_REVIEW |
|---|---|---|---|---|---|---|
| STEP_TAP | AUTO | AUTO | AUTO | AUTO | AUTO | AUTO |
| LF_TAP | mark | mark | mark | mark | → LOP_REVIEW | → new ARMED |
| BOTH_TAP | mark | mark | mark | mark | mark | mark |
| LF held (HOLD_START…release) | — | — | — | `peak PK/ffAtPeak` | `peakFirst spread/PK` | `peakFirst spread/PK` |
| BOTH_HOLD_5S | toggle R/L | — | — | — | — | — |
| LF_HOLD_3S | — | — | — | — | — | — |
- LF-16 `LF_HOLD_3S` in LeanFind does not toggle the view. [M p.9 "In Automatic or Manual modes"]
- LF-17 In ARMED/ACTIVE/ROP the analog display uses the current view; LOP inverted graph replaces bars from the
  first LOP peak onward and in LOP_DONE/LOP_REVIEW. [I]

## 11. Fuel fill flow (ff only) [M p.26–28, QR]

- FUEL-1 Entry: power-up (PWR-7) or PROGRAM `FUEL? Y` + STEP. [C16]
- FUEL-2 `FILL? N` —LF→ `FILL <MAIN>` —LF→ `FILL <MAIN+AUX>` (only if AUX? Y) —LF→ `FILL+` —LF→ `FILL? N`.
- FUEL-3 STEP on `FILL? N` → exit, no change. STEP on `FILL <MAIN>` → REM = MAIN. STEP on `FILL <MAIN+AUX>` → REM =
  MAIN+AUX. STEP on `FILL+` → `ADD`.
- FUEL-4 `ADD` shows `amount UNIT` (fuel format, e.g. `.0 GAL`): tap LF −1, hold LF +1 (repeat). Upper limit: REM +
  amount ≤ MAIN + AUX(if AUX? Y) ("count up will stop at full tanks"); lower limit REM + amount ≥ 0. Negative allowed.
  STEP → REM += amount, exit. [M p.27] [I: step 1, lower limit] [C6] Note: the manual's case (b) ("input how much is
  now in the auxiliary tanks") gives REM_old + amount under this rule; training content must not teach case (b).
- FUEL-5 Each confirmed fill (FILL MAIN, FILL MAIN+AUX, or ADD with amount > 0) sets USD = 0 unless `ACCUM? Y`. [M p.27, p.34]
- FUEL-6 Exit (any STEP that leaves the flow): → `MANUAL` in both contexts ("tap the STEP button to complete the
  entry and advance to the Manual mode", p.27; QR "Tap STEP to exit"). (rev2, R1) [M p.27, QR] [C15]

## 12. Pilot programming [M p.33–41, p.43]

- PGM-1 Entry: `BOTH_HOLD_5S` in AUTO or MANUAL (MAN-5 exception). `PROGRAM` shown 2000 ms (inputs ignored), then the
  first visible item. Remembers the prior mode (AUTO/MANUAL). [M p.33]
- PGM-2 Main list (order), visibility by select switch (with ff) and options:

| # | Item | Display | Switch | Present when | LF | Other |
|---|---|---|---|---|---|---|
| 1 | FUEL | `FUEL? N`/`FUEL? Y` | T,F,A | ff | toggle | STEP with Y → FUEL_FILL(program); with N → next |
| 2 | RATE | `RATE 4` | T,A | always | tap −1 / hold +1, wrap 0..9 (711: 1..9) | `BOTH_HOLD_5S` → ORIG_TIT (if tit) |
| 3 | OATU | `OAT F`/`OAT C` | T,A | oat | toggle | `BOTH_HOLD_5S` → OAT_CAL; STEP skips OAT_CAL |
| 4 | EGT1 | `EGT 1?N`/`EGT 1?Y` | T,A | always | toggle | |
| 5 | HPQ | `HP-? Y`/`HP-? N` | T,A | model 800 | toggle | `BOTH_HOLD_5S` (with Y or N, rev2 R15) → ADJUST → HPC |
| 6 | KF | `KF-SET` for 1000 ms, then `29.00=KF` (rev2, R21) | F,A | ff | — | `BOTH_HOLD_5S` → KF_EDIT |
| 7 | ACCUM | `ACCUM?N`/`ACCUM?Y` | F,A | ff | toggle | |
| 8 | GPSC | `GPS-C= 2` | F,A | ff | tap −1 / hold +1, wrap 0..8 | [C7] |
| 9 | DUMP | `DUMP? N`/`DUMP NEW`/`DUMP ALL` | T,F,A | always | N→NEW→ALL→N | STEP with NEW/ALL → DUMP_XFER; `BOTH_HOLD_5S` → LTM list |
| 10 | END | `END Y`/`END N` | T,F,A | always | toggle | STEP: Y → exit, N → first item; `BOTH_HOLD_5S` → FACLIM |

- PGM-3 `STEP_TAP` → next present item. Defaults shown: FUEL? N, RATE 4, OAT F, EGT 1?N, HP-? Y, KF 29.00, ACCUM?N,
  GPS-C 2, DUMP? N, END Y. FUEL? and DUMP? return to N each time they are displayed; END returns to Y. [M p.33–34] [I]
- PGM-4 Exit (END Y + STEP, or SAVE D completion) → prior mode (AUTO/MANUAL) at its scan item. [I]
- PGM-5 `OAT_CAL`: `OAT+0` range −10…+10 (tap −1, hold +1); displayed OAT += value. STEP → next main item (EGT1). [M p.34] The offset is in the displayed OAT unit and is applied after °F→°C conversion. (rev3.1)
- PGM-6 `HPC`: preceded by `ADJUST` for 1000 ms; display `HPC= 125`; range 50…200 (tap −1 / hold +1); the upper window
  shows %HP live. `BOTH_HOLD_5S` → `ADJUST` (1000 ms) → `MAP_CAL`. STEP → next main item after HPQ. [M p.34–36] [C8] [I: range] Without ff the upper window shows RPM (ANA-11). (rev3.1)
- PGM-7 `MAP_CAL`: display `MAP=0.0` (`MAP=1.5`, `MAP=-1.2`) (rev2, R21); range −3.0…+3.0 step 0.1 (tap −, hold +);
  displayed MAP += value. STEP → next main item after HPQ. [M p.34–36] [I: step 0.1] The MAP alarm (ALM-1) uses the calibrated MAP. (rev3.1)
- PGM-8 `KF_EDIT`: four digits `dd.dd`, one digit flashes (starts at first). Tap LF −1, hold LF +1 (wrap 0–9); STEP →
  next digit (wrap). `BOTH_HOLD_5S` → save, back to KF item (`29.00=KF`). [M p.34, p.40] Measured flow = true flow ×
  transducerK / KF; KF = 0 → measured flow 0. [SIM]
- PGM-9 `ORIG_TIT` (from RATE, tit installed): `ORIG TIT` for 1000 ms, then `ORIG T-N`⇔`ORIG T-Y` (LF). STEP: Y →
  `CAL_TIT`; N → next main item after RATE. `CAL_TIT`: `CAL TIT` for 1000 ms, then `TIT+0` range −975…+975 step 1
  (tap lowers, hold raises); displayed TIT1 += value when ORIG T-Y. STEP → next main item after RATE. (rev2, R21)
  [M p.38] [I: exit destination, banners]
- PGM-10 `DUMP_XFER` (serial to PC): display `DUMP nn` progress 0→100 over 6 s (ALL) / 3 s (NEW). `BOTH_HOLD_5S` aborts
  → DUMP item. Completion → `SAVE D?N` (LF toggles Y/N); STEP → if Y, LTM "new data" pointer advances; then exit
  programming (END skipped). [M p.31, p.34, QR] [I: display, durations]
- PGM-11 LTM list (`BOTH_HOLD_5S` on DUMP): `TIME 6` (2…500 s, clamp), `MNTH` 1…12, `DAY` 1…31, `YEAR` 80…79 (two-digit,
  1980–2079), `HOUR` 00…23, `MIN` 00…59 (wrap for calendar/time fields), aircraft ID (`N12345`), `END Y`. Tap −1 /
  hold +1. Leaving MIN writes the clock with seconds = 0. Changing TIME while recording starts a new flight file. On ID:
  `BOTH_HOLD_5S` → `LTM_ID_EDIT` (first char flashes; tap LF next character in `A–Z 0–9 - space`, hold LF repeats;
  STEP next char; `BOTH_HOLD_5S` saves). STEP on LTM `END Y` → main END item. [M p.30, p.41] [I: wrap, exit] A day beyond the month's length rolls over (04/31 → 05/01). (rev3.1)
- PGM-12 `FACLIM` (`BOTH_HOLD_5S` on END): `FAC LIM` for 2000 ms then the alarm list (§12.1). [M p.43]

### 12.1 Alarm limits / tank capacity list [M p.43–45]
Tap STEP = next; tap LF = decrease / next alternative; hold LF = increase (repeat). Not filtered by select switch. [I]

| Item | Display | Range (°F) | Step | Factory default | Present when |
|---|---|---|---|---|---|
| FAC | `FAC? N`/`FAC? Y` | — | — | N | always; STEP with Y restores factory alarm limits |
| ENG | `ENG F`/`ENG C` | — | — | F | always; changing resets alarm limits to factory values for the new unit |
| HBAT | `16.0 H BAT` | 10.0…35.0 | 0.5 | 16.0 (12 V) / 32.0 (24 V) | always |
| LBAT | `12.0 L BAT` | 8.5…30.0 | 0.5 | 12.0 / 24.0 | always |
| DIF | `500 DIF` | 30…990 | 10 | 500 | always |
| HCHT | `450 H CHT` | 90…500 | 5 | 450 | always (locked on 711) |
| CLD | `-60 CLD` | −200…−5 | 5 | −60 | always |
| TIT | `1650 TIT` | 650…2000 | 10 [I] | 1650 | always (rev2 R14; also the bar-graph scale) (locked on 711) |
| HOIL | `230 H OIL` | 40…500 | 5 | 230 | always (rev2 R14) (locked on 711) |
| LOIL | `90 L OIL` | 10…250 | 5 | 90 | always (rev2 R14) |
| MAP | `42.0 MAP` | 25.0…90.0 | 0.5 [I] | 42.0 | model 800 [C9] |
| FUNIT | `FUEL GAL` | GAL→KGS→LTR→LBS | — | GAL | ff |
| MAIN | `MAIN=50` | 0…999 | 1 | 50 | ff |
| AUXQ | `AUX? N` | N⇔Y | — | N | ff |
| AUX | `AUX=0` | 0…250 | 1 | 0 | ff and AUX? Y |
| MIN | `MIN =45` | 0…60 | 1 | 45 | ff |
| REMLIM | `REM =10` | 0…200 | 1 | 10 | ff |
| CARB | `CARB? N` | N⇔Y | — | N | always [C10] |
| RECRD | `RECRD? Y` | Y⇔N | — | Y | always |
| CYL | `CYL=6` | 4…12 | 1 | 6 | model 800 |
| RHP | `HP = 180` | 60…500 | 1 | 180 | model 800 |
| EC | `14.90= EC` | 12.00…16.00 | digit edit | 14.90 | model 800; `BOTH_HOLD_5S` → EC_EDIT (like KF_EDIT, value clamped to range on save) |
| END | `END Y`/`END N` | — | — | Y | STEP: Y → exit programming (PGM-4); N → FAC item |

- LIM-1 °C ranges/defaults: defaults CHT 230, OIL H 110, OIL L 32, TIT 900, CLD −33, DIF 280 [M p.42]; °C ranges are
  the °F ranges converted and rounded, step 1°C. [I]
- LIM-2 Fuel unit change does not convert stored quantities (MAIN, AUX, REM, USD, REM limit). [M p.44] Flow and MPG
  are shown in the new unit: LTR = 3.785×GAL, LBS = 6.0×GAL, KGS = 2.72×GAL. [SIM]
- LIM-3 FAC? Y restores: H/L BAT, DIF, H CHT, CLD, TIT, H/L OIL, MAP, MIN, REM limits (not units, tank capacities,
  CARB, RECRD, CYL, HP, EC). [I]
- LIM-4 The TIT limit is also the full-scale value of the EGT/TIT bar graph (ANA-3). [M p.43]
- LIM-5 RECRD? N → long-term memory does not record (Y also disables real-time serial output — not simulated). [M p.44]
- LIM-6 CYL, rated HP, CARB filter: stored only; they do not change the column count, the RPM shown, or the response
  filtering in the simulator. [SIM] (rev2, R19, R28)
- LIM-7 ENG F/C: the temperature limits reset to factory values for the new unit immediately on the LF toggle. [I] [C22]

## 13. EDM-711 primary [M p.7, p.10, p.12, p.26, p.41–42]
- P711-1 AUTO scans only CHTHI, TIT1 (if installed), OIL (if installed) — in that order — ignoring the select switch
  and exclusions. [C19] `STEP_TAP` in AUTO while CHTHI is shown → MANUAL on the EGTn item of the hottest-CHT
  cylinder (CHTHI is not a MANUAL item). (rev3, S7) [I] If that EGTn item is not present in MANUAL (e.g. select switch on F), SCAN-4 moves to the next present item. (rev3.1)
- P711-2 MANUAL scans all items (normal list with switch). `BOTH_TAP` exclusion has no effect.
- P711-3 RATE range 1…9 (Automatic mode cannot be disabled).
- P711-4 When an EGTn item comes into the display in MANUAL, `EGT-CHT` is shown for 1000 ms first. [I: duration]
- P711-5 Primary lamps CHT, OIL, TIT: RED when value > limit; YELLOW when value > limit − 45 (CHT) / − 25 (OIL) /
  − 100 (TIT) (°F); never extinguished by STEP. [M p.41]
- P711-6 H CHT, TIT, H OIL limits are displayed but cannot be changed in the alarm list. [M p.41] [I: displayed-locked]
  Factory primary limits default to the p.41 example: CHT 460°F, OIL 230°F, TIT 1650°F. (rev2, R27) [I]
- P711-7 STEP tap still extinguishes the flashing digital alarm (ALM-4). [M p.41] [C11]

## 14. Data download [M p.31–33, QR]
- DL-1 `USB_INSERT` (usbPort) while in AUTO or MANUAL → `USB.MENU` showing `NEW`; LF toggles `NEW`⇔`ALL`; STEP → `XFER`
  showing a countdown `nn` from 100 to 0 over 3 s (NEW) / 6 s (ALL) → `DONE`. `USB_REMOVE` from any USB state →
  prior mode. [M p.32] [I: display & durations]
- DL-2 `MEMBOX_CONNECT` while in AUTO or MANUAL → same flow with `DUMPNEW`/`DUMPALL`; transfer shows `DOWNLOAD` for
  1000 ms then progress `nn%` from 0 to 100 (stand-in for "DATA DOWNLOAD MODE", which does not fit the EDM-800
  display — that manual section is copied from the EDM-930, whose figure it shows), then `DONE`;
  `MEMBOX_DISCONNECT` → prior mode. (rev2, R21) [M p.32] [I] Transfer time after the banner: 3 s (NEW) / 6 s (ALL). (rev3.1)
- DL-3 After a successful USB/box download the LTM new-data pointer advances. [I]

## 15. Fuel, LTM, derived computations [SIM unless noted]
- CALC-1 Measured flow (GPH) = true GPH × transducerK / KF; converted to the fuel unit for display.
- CALC-2 REM −= flow·dt; USD += flow·dt (fuel units). REM not below 0.
- CALC-3 Endurance minutes = REM / flow × 60 (flow ≥ 0.5). H.M = floor(h).mm. Minutes are floored too (5.376 h → `05.22`). (rev3.1)
- CALC-4 With GPS ok: MPG = groundspeed / flow; REQ = distance/groundspeed × flow; RES = REM − REQ. [M p.29]
- CALC-5 CLD: per-cylinder CHT rate over a 30 s sliding window, expressed in °/min. [I]
- CALC-6 DIF = max − min of working EGTs. [M p.10]
- CALC-7 LTM records every TIME seconds when RECRD? Y and (any EGT > 500°F or SNAP requested). FULL = records since last
  save ÷ capacity (20 h at 6 s = 12 000 records) × 100. [M p.30–31] [C20]
- CALC-8 Probe noise: the simulator engine adds slow EGT wander (a few °F) so that leaning too slowly or pausing can
  trigger an early "false" peak, as described in Common Misapplications (p.20). [SIM] (rev2, R30)

## 16. Timing constants
| Name | ms | Source |
|---|---|---|
| T_HOLD_START | 700 | [I] |
| T_REPEAT_LF | 200 | [I] |
| T_REPEAT_STEP_BACK | 250 | [I] |
| T_LF_VIEW | 3000 | [M p.9, QR] |
| T_STEP_OFF | 5000 | [M p.8] |
| T_BOTH_HOLD | 5000 | [M p.9] |
| T_AUTO_AFTER_POWER | 120000 | [M p.7] |
| T_ALARM_SNOOZE | 600000 | [M p.8] |
| T_PROGRAM_BANNER, T_LEANEST, T_LEAN_BANNER, T_FACLIM_BANNER, T_SNAP | 2000 | [M p.13, p.33] / [I] |
| T_ADJUST, T_FUEL_BANNER, T_EGTCHT_711, T_RPMMAP_DWELL, T_ITEM_TITLE | 1000 | [M p.26, p.29] / [I] |
| T_OFF_MSG, T_SELFTEST_PROBE_MSG, T_STARTUP_INFO | 1500 | [I] |
| T_SELFTEST_SEGMENTS | 3000 | [I] |
| T_SELFTEST_COLUMN | 300 | [I] |
| LF_RISE_F | 15 °F | [M p.13] |
| LF_PEAK_DROP_F | 10 °F | [I] |
| LF_TIT_GRACE | 100 °F / 60 000 ms | [M p.16] |

## 17. Display model (machine output)
`getDisplay()` returns:
- `digital: { text, blink, flashIndex? }` — `text` uses plain characters (`1` is rendered as the segment "I"); `blink`
  for alarms/`FILL? N`/`SNAP`; `flashIndex` = character position flashing during digit/char edit.
- `upper: { text }` — `73 HP` / `2450` / `''` (700).
- `view: 'P' | 'N'`, `unit: 'F' | 'C'`.
- `columns: [{ id: '1'..'6'|'T', label: '1'..'6'|'T'|'', segs: 0..13, chtSeg: 0..13, oilSeg: 0..13, inverted: bool, flash: bool,
  topFlash: bool, oilFlash: bool, missing: bool, labelFlash: bool }]`.
- `power: bool`, `allOn: bool` (self-test all segments), `viewStyle: 'NRM' | 'NP'` (800 / 700 indicator). (rev3, S12)
- `dot: { index: 0..5 | null, blink: bool }`.
- Observable non-volatile LTM state: `settings.ltm = { records, savedAt, flightFiles, marks }` (PGM-11 new flight
  file, LF-14 marks). (rev3.1)
- `alarmLight: bool`, `lamps711: { cht, oil, tit } ∈ {off, yellow, red}`, `brightness`.

## 18. Persisted vs volatile
Persisted across POWER_OFF: all PGM and LIM settings, REM, USD, clock, aircraft ID, LTM records/pointer.
Volatile: mode, exclusions, alarm suppressions, view, LeanFind/LOP results, scan position.

## 19. Out of scope
Serial/GPS wire protocols and baud rates (documented only), EzPlot/EzTrends PC software, connector wiring, warranty.

## 20. Interpretation register (all [I])
I-1 Gesture thresholds (700 ms hold start, chord rule, repeat rates). I-2 Self-test/startup message durations. I-3
MANUAL starts at the first scan item. I-4 2-minute auto switch is one-shot and only if in MANUAL. I-5 View resets to
Percentage at power-on. I-6 Scan position fix-up when the current item disappears. I-7 AUTO dwell restart & skipping
excluded current item. I-8 Exclusion marker placement for EGTn. I-9 Fuel number format. I-10 `--- H.M` at zero
flow. I-11 Bar-graph formulas (rounding, Normalize reference = 7 of 13, no-TIT red line 1650°F, OIL segment scaling).
I-12 Alarms hidden outside AUTO/MANUAL/LEANFIND. I-13 STEP press routed to alarm when alarm displayed. I-14 Snooze
re-show. I-15 Alarm light semantics. I-16 LeanFind: method resets to R; post-banner ARMED display; running-minimum
activation; 10°F peak drop; TIT included for activation/first peak only; LOP digital during progress; empty columns
before a cylinder peaks. I-17 Fuel ADD step 1, lower limit, USD reset only for positive add. I-18 Sub-procedure exits
return to the main list at the next item; programming exit returns to prior mode. I-19 HPC range 50–200. I-20 Serial
dump display/durations, SAVE D semantics. I-21 LTM wrap rules, clock seconds, ID charset. I-22 Alarm list not filtered
by select switch; °C ranges; FAC? restore scope. I-23 711 locked items displayed; EGT-CHT duration; 711 factory
limits from the p.41 example. I-24 USB/box displays and durations. I-25 CLD 30 s window. I-26 FUEL? / DUMP? / END
reset their displayed value each visit. I-27 After TANK_SETUP, power-up continues with self-test. I-28 (withdrawn in
rev2: HPC is reachable with HP-? Y or N). I-29 TIT setup entered from RATE (p.38 table) rather than during the PROGRAM
banner. I-30 GPSMSG placement; `off` GPS shows no message. I-31 AUTO-8 (all excluded → stay). I-32 PWR-6 date order
MM.DD.YY. I-33 DL-3 pointer advance. I-34 BTN-10/11 ignored/consumed buttons. I-35 LF-17 view during LeanFind.
I-36 BOTH_TAP window 700 ms. I-37 TIT2 as a separate item. I-38 LeanFind values 1° resolution. I-39 LeanFind event table
defaults (LF-18). I-40 TIT/HOIL/LOIL limit items always present. I-41 Item title banners (`KF-SET`, `ORIG TIT`,
`CAL TIT`) 1000 ms. I-42 MAP_CAL step 0.1, TIT limit step 10, MAP limit step 0.5. I-43 Default aircraft ID `N12345`
(manual: initially the EDM serial number, p.30).

## 21. Conflict register (all [C])
- C1 Normalize toggle hold: p.5 "five seconds" vs p.9 diagram, p.9 text and QR "three seconds" → **3 s**.
- C2 Auto after power-up: p.7/FC "two minutes" vs p.11 "a few minutes" → **2 min**.
- C3 STEP tap on alarm: p.8 "delete that alarm … ten minutes", p.25 "disable the alarm digital indication", p.42
  "delete that parameter from the sequence" → **suppress the alarm indication only**; parameter stays in the scan.
- C4 LOP hold-LF peak: p.16 figure "peak temperature of last cylinder" vs p.16 text "richest peak EGT" and QR "peak EGT
  of the first cylinder to peak" → **first (richest) cylinder's peak**.
- C5 Mark data: p.9/p.30 "tap both STEP and LF in LF mode" vs QR "Tap LF twice" → **both supported** (LF-14, LF-15).
- C6 FILL+ semantics: "how much you added" vs case (b) "input how much is now in the auxiliary tanks" → **add**
  semantics (REM += amount).
- C7 GPS-C range: p.34 "0…6" vs p.46 formats 0–8 → **0–8**.
- C8 HP constant default: p.35 step 1 `HPC= I20` vs p.34 table, p.35 step 4 and p.36 `125` → **125**.
- C9 MAP alarm default: p.42 table "32 inches" vs p.43 list `42.0 MAP` → **42.0** (what the list shows).
- C10 CARB: "CARB? N⇔Y" vs "Setting 1-3, 3 being high filter" → **N/Y toggle only**; filter level not simulated.
- C11 711 alarm reset: QR "Reset Alarm (except EDM-711)" vs p.41 "Tapping STEP will extinguish the flashing digital
  display" → **p.41**: STEP extinguishes the digital alarm; lamps stay.
- C12 Default-limits table labels LO FUEL "45 min" and LO TIME "10 gal" are swapped relative to the priority list and
  the examples → **LO FUEL = quantity (REM limit), LO TIME = endurance (MIN limit)**.
- C13 TIT program entry: p.33 "PROGRAM … Hold both buttons for 5 seconds set up the factory original TIT" vs p.38 table
  (hold both on `RATE 4`) → **on RATE** (I-29).
- C14 HP-? select-switch column blank (p.34) while its sub-rows are T,A → **T,A**.
- C15 (rev2) Fuel-fill exit: p.27 flowchart's unlabeled left-pointing exit arrows vs p.27 text "advance to the Manual
  mode" and QR "Tap STEP to exit" → **MANUAL** in both contexts.
- C16 (rev2) `FUEL? N`: p.27 flowchart labels LF "Refuel" going straight to `FILL ?N` vs p.33 table `N⇔Y` and QR "Tap
  LF to see FUEL? Y. Tap STEP" → **table/QR** (LF toggles, STEP with Y enters the fill flow).
- C17 (rev2) Fuel number format: p.29 example `38 USD` (integer < 100) vs p.28 `.0 USD`, `37.2 REM` → **FMT-1**.
- C18 (rev2) LOP progress indicator: p.16 text "the dot … will flash as it peaks" vs figure / p.13 step 9 "cylinder
  number will begin flashing" → **both** flash.
- C19 (rev2) 711 automatic order: p.7 "highest CHT, TIT, OIL" vs p.10 "highest CHT, OIL and … TIT" → **p.7** (matches
  the canonical scan order).
- C20 (rev2) LTM capacity: p.1 "up to 30 hours" vs p.30 "up to 20 hours at 6 s" → **20 h at 6 s**.
- C21 (rev2) Alarm check rate: p.2 "four times a second" vs p.12 "every second" → evaluated every 50 ms sub-step
  (satisfies both).
- C22 (rev2) ENG F/C: p.42 "newer instruments will automatically change the alarms to the factory limits" vs p.43 "You
  must also change the alarm limits" → **automatic reset** (newer instrument).
- C23 (rev2) RPM on the 700: p.1 "RPM opt" for 700/711 vs p.4/p.6 "%HP or RPM (EDM-800 only)" → **800 only**.
- C24 (rev2) CHT scale labels: p.14/p.16/p.24 figures 300/400/500 vs p.4/p.6/p.15 and p.6 text 250/350/450 → **text**.

## 22. Review disposition (rev2)
R1 accepted (FUEL-6). R2 accepted (LF-9). R3 accepted (C16). R4 accepted (LF-8). R5 accepted (LF-14). R6 accepted
(LF-15, LF-18). R7 accepted (LF-12). R8 accepted (LF-8). R9 accepted as [I] with the twin-turbo reading (§7.1).
R10 accepted (§7.2, §10). R11 accepted (BTN-8). R12 accepted with the "sequence ends in AUTO" variant (PWR-9).
R13 accepted (ALM-8). R14 accepted (§12.1, ANA-3). R15 accepted (PGM-2). R16 accepted (ANA-1). R17 accepted (IN-4).
R18 accepted as a note (FUEL-4). R19 accepted (LIM-6, §2). R20 accepted (MAN-7). R21 accepted (KF-SET, ORIG/CAL TIT
banners, MAP=, DOWNLOAD, H.M pinned; FILL strings pinned to the QR forms `FILL? N`, `FILL 75`, `FILL+`). R22 accepted
(C17). R23 accepted (retagged [I]). R24 accepted (§20 I-30…I-43). R25 accepted (C19–C24). R26 noted (§2 model notes).
R27 accepted (P711-6 defaults; OFF via STEP hold works on the digital alarm only, C11). R28 noted (LIM-5, LIM-6).
R29 accepted (MODE-1, LIM-7, PGM-8 KF=0, SCAN-4 / I-6; select-switch change in PROGRAM leaves the current item until
the next STEP). R30 accepted as SIM (CALC-8).

## 23. Validation disposition (rev3)
- D1 (ALM-8 light dark during the all-segments self-test) — implementation fixed; 711 lamps likewise.
- D2 / S1 (ANA-13) — spec reworded to "settles within ≈10 s" (code unchanged).
- D3, D4 / S3 (overlay vs dot / segment flash) — one rule adopted (ANA-7, ANA-8): overlays own the dot and the TIT/OIL
  segment flash; implementation fixed.
- D5 / S2 (ANA-9 scope) — spec extended to LEANFIND; the LOP inverted graph no longer clears a pre-ignition flash.
- S4 — ALM-6 limited to single-button gestures. S5 — hidden TIT does not mask (ALM-9). S6 — flow at the EGT maximum
  (LF-8); implementation changed accordingly. S7 — P711-1 CHTHI → EGTn of the hottest-CHT cylinder; implementation changed.
- S8 formats pinned: GAMI spread / flows use one decimal with a leading zero (`0.8`, FMT `fmt1`); `FULL nn`, `DUMP nn`,
  USB count-down and `nn%` are unpadded integers; for TIT1 with ff the exclusion point precedes the flow field
  (`1370 .13.5`, same rule as EGTn); H.M = floor(hours).floor(minutes), e.g. 5.376 h → `05.22`.
- S9 — clamp unless stated wrap (§4). S10 — percentage scale computed in °F (ANA-3).
- S11 pinned: OAT calibration is in the displayed OAT unit (°F or °C) and applies after conversion; the MAP alarm uses
  calibrated MAP; with no ff the HPC screen's upper window shows RPM (ANA-11 applies); an LTM date beyond the month's
  length rolls over (e.g. 04/31 → 05/01); the memory-box transfer takes 3 s (NEW) / 6 s (ALL) after the 1 s
  `DOWNLOAD` banner; with `RECRD? N` a SNAP request still shows `SNAP` at the next record-interval boundary and counts a
  mark, but nothing is recorded; CHT alarm dot = hottest cylinder above the limit; in LOP the T column keeps its normal
  (non-inverted) display and TIT is ignored for LOP peaks; an alarm appearing while STEP is held does not capture the
  press (ALM-6).
- S12 — §17 completed; §2 table repaired. S13 — `npm test` runs `node --test test/*.test.mjs`.
- rev3.1 (validation round 2, N1–N9; documentation only, no behavior change): §23 pins folded into FMT-2, CALC-3,
  PGM-5/6/7/11, DL-2, LF-8/9/14; §10 preamble "first peak (ROP only)"; overlay precedence `OFF` > `SNAP` > alarm and
  steady overlay dot (ANA-8); TIT2-raised alarm flashes the T top segment (ANA-7); TIT-locked ROP_SET column flash
  persists under overlays (LF-8); 711 S7 + switch F (P711-1); LTM counters observable (§17); LeanFind flows shown
  as measured (LF-8).
