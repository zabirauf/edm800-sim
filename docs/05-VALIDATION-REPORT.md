# EDM-800 State Machine — Validation Report

Validator: independent test suite derived from `docs/02-SPEC.md`. Implementation under test: `src/edm/*.js`
(unmodified by the validator). Date: 2026-10-27.

> **Current status — Round 2 (spec rev3): 479 tests, 479 pass, 0 fail (`npm test`). See §5.**
> Sections 1–4 are the Round 1 (spec rev2) report, kept for traceability; its five deviations D1–D5 are all
> resolved in Round 2.

## 1. Summary (Round 1, spec rev2)

| | |
|---|---|
| Command | `node --test test/` (also `npm test`, or explicitly `node --test test/*.test.mjs`) |
| Runtime | Node v22.11.0, built-in `node:test` only, no dependencies |
| Tests | **428** |
| Pass | **423** |
| Fail | **5** (all are implementation deviations from the spec; see §3) |
| Duration | ≈ 3 s for the whole suite (simulated time ≈ several hours) |

Test files (`test/`):

| File | Tests | Fail | Area |
|---|---|---|---|
| `gestures.test.mjs` | 25 | 0 | §4 BTN-1…11, value-entry convention |
| `power.test.mjs` | 43 | 0 | §6 PWR-1…11, §1 SCOPE, §3 IN |
| `scan.test.mjs` | 44 | 0 | §7.1 list/filters, SCAN-1…4, §7.2 formats, FMT-1…3 |
| `modes.test.mjs` | 32 | 1 | §7.3 AUTO-1…8, §7.4 MAN-1…7, MODE-1 |
| `analog.test.mjs` | 27 | 2 | §8 ANA-1…13 |
| `alarms.test.mjs` | 36 | 1 | §9 ALM-1…10 |
| `leanfind.test.mjs` | 50 | 1 | §10 LF-1…18 (ROP, LOP, TIT-first lock, SNAP, event table) |
| `fuel.test.mjs` | 19 | 0 | §11 FUEL-1…6 (power-up and program contexts) |
| `program.test.mjs` | 55 | 0 | §12 PGM-1…12 (every item and sub-screen) |
| `limits.test.mjs` | 56 | 0 | §12.1 every alarm-list item, LIM-1…7, ×10 acceleration threshold |
| `p711.test.mjs` | 16 | 0 | §13 P711-1…7 |
| `download.test.mjs` | 9 | 0 | §14 DL-1…3, IN-6 |
| `calc.test.mjs` | 16 | 0 | §15 CALC-1…7, §18 persistence |

Support files:
- `test/helpers.mjs` — `Rig` wrapper: `boot()` (→ MANUAL), `bootAuto()` (→ AUTO via the 2-minute timer),
  `bootToFill()`, `tap/hold/taps`, `tapBoth/holdBoth/both(ms, gap)`, `advance`, `until(pred)`, `gotoItem`,
  `manualList`, `enterProgram`, `pgmGoto`, `pgmList`, `enterFacLim`, `ramp(dur, fn)` for scripted sensor frames,
  `cruiseFrame()`, and the spec formulas `pctSegs` (ANA-3) and `chtSeg` (ANA-5) written from the spec text.
- `test/index.js` (Round 1 only; **removed in Round 2** when `npm test` became `node --test test/*.test.mjs`) —
  on Node ≥ 21 `node --test <dir>` resolves the directory as a module path (`test/` → `test/index.js`) instead of
  scanning it, so the then-current `npm test` script failed with "Cannot find module".

Method notes:
- Expected values were derived from the spec text; the code was read only for API details (event/field names,
  state paths) and to diagnose failures after the expectation was written. Test-side mistakes found during
  development (e.g. a DIF alarm accidentally triggered by a pre-ignition frame, AUTO still indexing during the 5 s
  chord, off-by-one-sub-step boundaries) were fixed in the tests; every remaining failure is a spec deviation.
- Timer assertions allow the documented one-sub-step (50 ms) slack: each boundary is checked just before (≥ 50 ms
  early) and just after the deadline.
- Setup sometimes pre-loads non-volatile settings (e.g. `rem`, `usd`, `kf`, `rate`) through the constructor's
  settings object to model "a previous flight"; behaviour under test is always driven through events.
- LeanFind tests script EGT/flow frames. Where the spec's "flow recorded when that channel peaked" is ambiguous
  (time of the maximum vs. time the 10 °F drop is detected) the scripts hold the flow constant across both instants
  so the tests do not depend on that choice (see §4, S6).

## 2. Coverage matrix

All 140 requirement IDs in the spec (SCOPE, IN, BTN, PWR, SCAN, AUTO, MAN, MODE, ANA, ALM, LF, FUEL, PGM, LIM, P711,
DL, CALC, FMT) have at least one test except **CALC-8** (see 2.3). Tests marked ✗ fail (none in Round 2).

### 2.1 Requirement ID → tests

(Regenerated from the Round 2 run: 479 tests, none failing. Round 1 failures are listed in §3.)

| ID | Tests (✗ = failing) |
|---|---|
| BTN-1 | BTN-1 STEP press released before 700 ms is a tap (MANUAL advances one item)<br>BTN-1 boundary: STEP released after 700 ms is not a tap (no forward step)<br>BTN-1 LF tap < 700 ms enters LeanFind; LF released after 700 ms does not<br>BTN-1 boundary: release at 699 ms is still a tap |
| BTN-2 | BTN-2 STEP_HOLD_START fires once at 700 ms (MANUAL steps back exactly once) |
| BTN-3 | BTN-3 STEP hold repeat every 250 ms after hold start<br>BTN-3 LF hold repeat every 200 ms after hold start (RATE increments) |
| BTN-4 | BTN-4 LF_HOLD_3S fires at 3000 ms (view toggles), not at 2950 ms<br>BTN-4 LF_HOLD_3S fires once (holding 9 s toggles only once)<br>BTN-4 boundary: LF released at 2999 ms does not toggle the view |
| BTN-5 | BTN-5 STEP_HOLD_5S fires at 5000 ms (alarm OFF), not before |
| BTN-6 | BTN-6 release after hold start produces no tap |
| BTN-7 | BTN-7 chord: no single-button events while in a chord (no STEP tap, no LF tap)<br>BTN-7 chord can form up to just before the first button reaches hold start<br>BTN-7 / BTN-8 chord with LF pressed first behaves the same (BOTH_TAP, BOTH_HOLD_5S) |
| BTN-8 | BTN-8 BOTH_TAP: chord released < 700 ms after forming toggles exclusion in MANUAL<br>BTN-8 boundary: chord released between 700 ms and 5 s produces nothing<br>BTN-7 / BTN-8 chord with LF pressed first behaves the same (BOTH_TAP, BOTH_HOLD_5S)<br>BTN-8 BOTH_TAP is decided at the first release; the button still held produces no events afterwards |
| BTN-9 | BTN-9 BOTH_HOLD_5S measured from the second press<br>BTN-9 continuing to hold after BOTH_HOLD_5S does nothing more |
| BTN-10 | BTN-10 second button pressed after first reached hold start is ignored<br>BTN-10 the first button keeps its own hold events while the late second button is ignored |
| BTN-11 | BTN-11 button already down at POWER_ON produces no tap on release (TANK_SETUP stays on MAIN)<br>BTN-11 LF held through POWER_ON gives no tap/hold events after release |
| SCOPE-1 | SCOPE-1 default model is the EDM-800 (upper window, RPMMAP, NRM) |
| SCOPE-2 | SCOPE-2 model variants are selected by configuration |
| SCOPE-3 | SCOPE-3 EDM-700: no upper window, no RPMMAP, no HP-? item, no MAP/CYL/HP/EC limits, N/P dash indicator<br>SCOPE-3 EDM-700 has no MAP alarm |
| SCOPE-4 | SCOPE-4 EDM-711 (primary711) changes AUTO scan (see p711 tests) |
| LIM-1 | LIM-1 / LIM-7 ENG C: temperature limits reset immediately to °C factory values<br>LIM-1 °C limits step 1 °C and use converted ranges (H CHT 32…260)<br>LIM-1 °C alarms compare against °C limits (CHT > 230 °C) |
| LIM-2 | LIM-2 fuel unit change does not convert stored quantities; flow shown in new unit |
| LIM-3 | LIM-3 FAC? Y restores alarm limits only (not units, tanks, CARB, RECRD, CYL, HP, EC) |
| LIM-4 | ANA-3 / LIM-4 the TIT limit sets the bar-graph full scale |
| LIM-5 | LIM-5 RECRD? N → long-term memory does not record (FULL stays 0)<br>LF-14 / LIM-5 (rev3 S11) RECRD? N: SNAP still shows within one record interval and counts a mark; nothing recorded |
| LIM-6 | LIM-6 CYL and rated HP are stored only (column count and upper window unchanged) |
| LIM-7 | LIM-1 / LIM-7 ENG C: temperature limits reset immediately to °C factory values<br>LIM-7 ENG toggled back to F resets limits to °F factory values |
| IN-1 | PWR-1 POWER_ON with STEP held and ff → TANK_SETUP.MAIN (IN-1 button tracked while off) |
| IN-2 | IN-2 one long TICK advances through all timers in order |
| IN-3 | IN-3 POWER_OFF → OFF; POWER_ON from OFF restarts the power-up sequence |
| IN-4 | IN-4 SENSORS frames are merged into the current frame |
| IN-5 | IN-5 SELECT_SWITCH default position is A; ignored without ff |
| IN-6 | DL-1 / IN-6 USB_INSERT in MANUAL → USB.MENU NEW; LF toggles NEW⇄ALL<br>DL-1 / IN-6 USB_REMOVE from any USB state → prior mode (MANUAL at its item / AUTO)<br>DL-2 / IN-6 MEMBOX_CONNECT → DUMPNEW/DUMPALL; STEP → DOWNLOAD 1000 ms → nn% 0…100 → DONE; disconnect → prior mode |
| IN-7 | IN-7 AMBIENT input changes display brightness |
| PWR-1 | PWR-1 POWER_ON with STEP held and ff → TANK_SETUP.MAIN (IN-1 button tracked while off)<br>PWR-1 POWER_ON with STEP held but no ff → SELFTEST.SEGMENTS<br>PWR-1 POWER_ON without STEP → SELFTEST.SEGMENTS |
| PWR-2 | PWR-2 TANK_SETUP MAIN: tap LF decreases by 1, hold LF increases (repeat)<br>PWR-2 TANK_SETUP MAIN ×10 acceleration after 3 s of holding (range 0…999)<br>PWR-2 TANK_SETUP MAIN lower bound 0 (no wrap below 0)<br>PWR-2 TANK_SETUP MAIN upper bound 999<br>PWR-2 TANK_SETUP: STEP MAIN → AUX? N; LF toggles; AUX? Y → AUX=0; STEP on last → SELFTEST<br>PWR-2 TANK_SETUP: with AUX? N, STEP on AUX? is the last item → SELFTEST<br>PWR-2 TANK_SETUP AUX range 0…250 (lower bound)<br>PWR-2 TANK_SETUP values are the same settings as alarm list MAIN/AUX?/AUX<br>PWR-2 (rev3 S9) TANK_SETUP AUX clamps at 250 (no wrap) |
| PWR-3 | PWR-3 SELFTEST.SEGMENTS lasts 3000 ms with all segments lit |
| PWR-4 | PWR-4 SELFTEST.COLUMNS lights each column alone, cylinders then T, 300 ms each<br>PWR-4 SELFTEST.COLUMNS without a T column: only cylinder columns (4 cyl, no TIT/OIL) |
| PWR-5 | PWR-5 failed probe: OPEN PRB 1500 ms then channel name 1500 ms<br>PWR-5 calibration fault shows CAL ERR; channel names for all channel types<br>PWR-5 failed channels are deleted from the scan and the analog display<br>PWR-5 calibration-fault channels are also deleted from the scan |
| PWR-6 | PWR-6 STARTUP_INFO: date MM.DD.YY, time HH.MM, FULL nn, aircraft ID, 1500 ms each<br>PWR-6 (rev3 S8) FULL nn is an unpadded integer |
| PWR-7 | FUEL-1 entry from power-up (PWR-7) and from PROGRAM FUEL? Y + STEP<br>PWR-7 ff: FUEL for 1000 ms, then FILL? N flashing until a button is pressed<br>PWR-7 no ff: STARTUP_INFO → MANUAL directly |
| PWR-8 | PWR-8 MANUAL is entered at the first item of the current scan list |
| PWR-9 | PWR-9 MANUAL → AUTO at 120 000 ms after POWER_ON (boundary)<br>PWR-9 the auto switch is one-shot<br>PWR-9 (rev2) power-up sequence still running at 120 s (FILL? N) ends in AUTO<br>PWR-9 (rev2) TANK_SETUP still running at 120 s → sequence ends in AUTO<br>PWR-9 in LEANFIND at 120 s: no change<br>PWR-9 in PROGRAM at 120 s: no change; exit returns to the prior mode (MANUAL)<br>PWR-9 in USB at 120 s: no change<br>PWR-9 in a PROGRAM-context fuel fill at 120 s: no change; exit → MANUAL and stays MANUAL |
| PWR-10 | PWR-10 power-on resets exclusions, alarm OFF/snoozes, view, LOP results |
| PWR-11 | PWR-11 POWER_OFF from any state → OFF<br>PWR-11 settings are non-volatile across POWER_OFF/POWER_ON |
| SCAN-1 | SCAN-1 without ff: no select switch; all non-FF items present regardless of switch |
| SCAN-2 | SCAN-2 select switch T shows only T items<br>SCAN-2 select switch F shows only F items<br>SCAN-2 select switch F on the 700 (no RPMMAP) |
| SCAN-3 | SCAN-3 failed probes: EGTn absent only if both EGT and CHT failed; DIF needs ≥2 EGTs; CLD needs ≥1 CHT<br>SCAN-3 failed IAT/CDT/CRB/OAT/OIL probes never appear |
| SCAN-4 | SCAN-4 current item disappears (probe fails) → next present item<br>SCAN-4 switch moved and current item gone → next present item in list order (wrapping)<br>SCAN-4 GPS status change removes REQ → next present (MPG with nowpt)<br>SCAN-4 fix-up also applies in AUTO |
| FMT-1 | FMT-1 fuel format: \|v\|<100 one decimal, leading 0 suppressed; ≥100 integer<br>FMT-1 negative fuel values (RES < 0) keep one decimal with leading 0 suppressed |
| FMT-2 | FMT-2 (rev3 S8) excluded TIT1 with ff: the point precedes the flow field (1370 .13.5); without ff before TIT<br>FMT-2 excluded items show a decimal point before the label; EGTn before the CHT field |
| FMT-3 | FMT-3 °C display: temperatures converted from °F, DIF ×5/9; OAT follows its own unit<br>FMT-3 °C CLD uses ×5/9 of the °F/min rate |
| AUTO-1 | AUTO-1 each item shown RATE (4) seconds, then the next (boundary)<br>AUTO-1 RPMMAP is shown for 1 s<br>AUTO-1 wraps from the last item to the first<br>AUTO-1 RATE setting controls the dwell (RATE 9)<br>AUTO-1 excluded items are skipped in AUTO<br>AUTO-1 full AUTO cycle visits every included present item in order |
| AUTO-2 | AUTO-2 RATE 0 → display frozen on the current item |
| AUTO-3 | AUTO-3 STEP_TAP in AUTO → MANUAL keeping the current item |
| AUTO-4 | AUTO-4 LF_TAP in AUTO → LeanFind |
| AUTO-5 | AUTO-5 LF_HOLD_3S in AUTO toggles Percentage/Normalize, stays in AUTO |
| AUTO-6 | AUTO-6 BOTH_HOLD_5S in AUTO → PROGRAM.BANNER |
| AUTO-7 | AUTO-7 entering AUTO via LeanFind+STEP restarts the dwell on the current item<br>AUTO-7 entering AUTO on an excluded item advances immediately to the next included one<br>AUTO-7 2-minute timer entry restarts the dwell<br>AUTO-7 program exit to AUTO restarts the dwell<br>AUTO-7 2-minute timer entry on an excluded item advances immediately to the next included one |
| AUTO-8 | AUTO-8 no included present item → AUTO stays on the current item |
| MAN-1 | MAN-1 STEP_TAP → next present item, wraps; excluded items are still shown in MANUAL |
| MAN-2 | MAN-2 STEP hold → previous items rapidly backwards (wraps from first to last) |
| MAN-3 | MAN-3 BOTH_TAP toggles include/exclude of the displayed item |
| MAN-4 | MAN-4 LF_TAP in MANUAL → LeanFind; LF_HOLD_3S toggles the view and stays in MANUAL |
| MAN-5 | MAN-5 BOTH_HOLD_5S on USD resets fuel used, shows .0 USD, stays in MANUAL<br>MAN-5 BOTH_HOLD_5S on other items → PROGRAM |
| MAN-6 | MAN-6 exit MANUAL to AUTO = tap LF then tap STEP |
| MAN-7 | ANA-7 / MAN-7 TIT/OIL segment flash follows the visible digital content (not under a BAT alarm overlay)<br>MAN-7 with an alarm displayed BOTH_TAP excludes the underlying scan item<br>MAN-7 with an alarm displayed BOTH_HOLD_5S enters PROGRAM<br>MAN-7 with an alarm displayed BOTH_HOLD_5S on USD resets USD (stays MANUAL)<br>MAN-7 with an alarm displayed LF_TAP enters LeanFind and LF_HOLD_3S toggles view<br>MAN-7 the dot follows the visible alarm content (CHT alarm dot at alarming cylinder)<br>MAN-7 / ANA-8 a dot-less alarm (BAT) over an EGTn item shows no dot (dot follows the alarm content) |
| MODE-1 | MODE-1 STEP_HOLD_5S / STEP_HOLD_START in AUTO without an alarm: no effect<br>MODE-1 USB / memory box connection outside AUTO/MANUAL is ignored |
| ANA-1 | ANA-1 one column per cylinder plus T column (TIT installed), label T, id T<br>ANA-1 OIL only (no TIT): last column id T with blank label shows OIL<br>ANA-1 neither TIT nor OIL: no last column; 4 cylinders → 4 columns<br>ANA-1 / ANA-6 TIT and OIL: OIL shown as a missing segment in the T column (Percentage vs H OIL) |
| ANA-2 | ANA-2 columns have 13 segments (full scale 13) |
| ANA-3 | ANA-3 Percentage view: segment formula against the TIT limit (red line 1650)<br>ANA-3 boundary: EGT at exactly 50 % of red line lights 1 segment, below lights 0<br>ANA-3 / LIM-4 the TIT limit sets the bar-graph full scale<br>ANA-3 OIL-only last column scale uses the H OIL limit<br>ANA-3 (rev3 S10) the percentage scale is computed in °F even with ENG C<br>ANA-3 (rev3 S10) OIL-only column in ENG C uses the H OIL limit converted to °F |
| ANA-4 | ANA-4 Normalize view: reference = value on entry → 7 segments; 10 °F per segment; clamp 0..13<br>ANA-4 OIL column is not normalized (OIL-only last column and OIL segment)<br>ANA-4 reference recaptured on each entry into Normalize<br>ANA-4 view indicator: NRM style on the 800, N/P dash style on the 700 |
| ANA-5 | ANA-5 CHT missing segment k = round((CHT−250)/25)+1, 1..13; none below 237.5<br>ANA-5 isolated CHT segment: EGT bar shorter than k → chtSeg still k (shown as isolated lit segment)<br>ANA-5 CHT segment is unaffected by view and mode |
| ANA-6 | ANA-1 / ANA-6 TIT and OIL: OIL shown as a missing segment in the T column (Percentage vs H OIL) |
| ANA-7 | ANA-7 highest TIT segment flashes while the digital display shows TIT1<br>ANA-7 OIL-only last column flashes while OIL is displayed<br>ANA-7 / MAN-7 TIT/OIL segment flash follows the visible digital content (not under a BAT alarm overlay)<br>ANA-7 a TIT alarm (digital shows TIT) flashes the top TIT segment<br>ANA-7 (rev3) OFF overlay: no TIT segment flash over TIT1, no OIL segment flash over OIL; flashes return after<br>ANA-7 (rev3) TIT alarm over the OIL item flashes the TIT segment only; OIL alarm over TIT1 the OIL segment only<br>ANA-7 (rev3) OIL alarm with an OIL-only last column flashes that column<br>ANA-7 / ANA-8 (rev3) TIT alarm overlay in LEANFIND: T segment flashes, no dot<br>ANA-7 (rev3) an OILL (low oil) alarm overlay flashes the OIL segment, not the TIT segment |
| ANA-8 | ANA-8 dot under cylinder for EGTn, DIF, CLD; none for other items<br>MAN-7 / ANA-8 a dot-less alarm (BAT) over an EGTn item shows no dot (dot follows the alarm content)<br>ANA-8 (rev3) OFF overlay shows no dot over an EGTn item; the item dot returns after OFF<br>ANA-8 (rev3) SNAP overlay in LEANFIND ARMED: no dot while SNAP shows; the steady dot returns<br>ANA-8 (rev3) SNAP overlay in ROP_SET and LOP_DONE: no dot<br>ANA-8 (rev3) BAT alarm overlay in LEANFIND shows no dot (ARMED, ACTIVE, ROP_SET, LOP_DONE)<br>ANA-8 (rev3) CHT alarm overlay in LEANFIND: dot at the alarming cylinder<br>ANA-8 / ALM-1 (rev3 S11) CHT alarm: text and dot use the hottest cylinder above the limit<br>ANA-8 (rev3) DIF and CLD alarm overlays over EGT1 put the dot on their own cylinder<br>ANA-7 / ANA-8 (rev3) TIT alarm overlay in LEANFIND: T segment flashes, no dot<br>ANA-8 (rev3) AUTO: BAT alarm over an EGTn item shows no dot<br>ANA-8 (rev3) OFF overlay in LEANFIND: no dot while OFF shows; LeanFind dot returns<br>ANA-8 (rev3) CHT alarm in ROP_SET takes the dot; after STEP acknowledges it the flashing locked-cylinder dot returns |
| ANA-9 | ANA-9 pre-ignition: column with EGT > 2000 °F flashes in AUTO/MANUAL; digital not forced<br>ANA-9 (rev3) pre-ignition flashing also applies in LEANFIND (ARMED)<br>ANA-9 (rev3) pre-ignition flash coexists with the ROP_SET locked-column flash<br>ANA-9 (rev3) pre-ignition flash coexists with the LOP inverted graph (non-peaked and peaked columns) |
| ANA-10 | ANA-10 failed EGT → missing column; failed CHT → no CHT segment |
| ANA-11 | ANA-11 upper window: nn HP with HP-? Y and fuel flow operational<br>ANA-11 upper window without ff shows RPM; 700 has no upper window<br>PGM-6 / ANA-11 (rev3 S11) without ff the HPC screen upper window shows RPM |
| ANA-12 | ANA-12 °F/°C indicator follows ENG F/C |
| ANA-13 | ANA-13 (rev3) brightness follows ambient light first-order (τ ≈ 3.3 s), settling within about 10 s |
| ALM-1 | ALM-1 CHT: any CHT > H CHT (450) → cht CHT + dot; 450 is not an alarm<br>ALM-1 OILH: OIL > H OIL (230) → t OIL; 230 is not an alarm<br>ALM-1 TIT: any TIT > TIT limit (1650) → t TIT; 1650 is not an alarm; TIT2 also checked<br>ALM-1 OILL: OIL < L OIL (90) → t OIL; 90 is not an alarm<br>ALM-1 CLD: CLD < CLD limit (−60) → c CLD + dot<br>ALM-1 DIF: DIF > DIF limit (500) → d DIF + dot; 500 is not an alarm<br>ALM-1 BATH: BAT > 16.0 → v.v BAT; 16.0 is not an alarm<br>ALM-1 BATL: BAT < 12.0 → v.v BAT; 12.0 is not an alarm<br>ALM-1 MAP: MAP > 42.0 (800) → m.m MAP; 42.0 is not an alarm<br>ALM-1 LOFUEL: REM < REM limit (10) → r REM; 10 is not an alarm<br>ALM-1 LOTIME: endurance < MIN limit (45 min) with flow ≥ 0.5 → HH.MM H.M<br>ALM-1 alarms are evaluated regardless of exclusion and select switch<br>ALM-1 option-dependent alarms: no LOFUEL/LOTIME without ff, no TIT without TIT probe, no OIL without OIL probe<br>ANA-8 / ALM-1 (rev3 S11) CHT alarm: text and dot use the hottest cylinder above the limit<br>ALM-1 / PGM-7 (rev3 S11) the MAP alarm uses calibrated MAP |
| ALM-2 | ALM-2 priority chain CHT > OILH > TIT > DIF > BATH > MAP > LOFUEL > LOTIME, lower ones masked<br>ALM-2 priority chain OILL > CLD > DIF > BATL<br>ALM-2 alarm replaces the digital content and stops when the condition clears<br>ALM-2 alarms are shown in AUTO and in LEANFIND |
| ALM-3 | ALM-3 alarms are not shown in PROGRAM, self-test, startup info, fuel fill, tank setup, USB |
| ALM-4 | ALM-4 STEP_TAP while alarm displayed suppresses it; no mode/item change (MANUAL)<br>ALM-4 STEP_TAP on an alarm in AUTO stays in AUTO<br>ALM-4 STEP_TAP on an alarm in LEANFIND stays in LEANFIND<br>ALM-4 / ALM-7 suppression lasts 10 minutes, then the alarm shows again if still active (boundary)<br>ALM-4 suppression is per alarm id (a different alarm still shows) |
| ALM-5 | ALM-5 STEP_HOLD_5S while alarm displayed → OFF for 1500 ms, suppressed until power off |
| ALM-6 | ALM-6 STEP press with an alarm displayed is routed only to the alarm (no backward scan)<br>ALM-6 (rev3 S4) an alarm appearing while STEP is already held does not capture that press (tap scans)<br>ALM-6 (rev3 S4) STEP held through alarm onset: backwards scanning continues; no OFF at 5 s<br>ALM-6 (rev3 S4) a STEP-first chord while an alarm is displayed is not captured (BOTH_TAP excludes, alarm stays)<br>ALM-6 single-button STEP pressed while an alarm is displayed is still routed to the alarm (regression)<br>ALM-6 (rev3) a captured STEP press stays with the alarm even if the alarm clears before hold start |
| ALM-7 | ALM-4 / ALM-7 suppression lasts 10 minutes, then the alarm shows again if still active (boundary)<br>ALM-7 after suppression expires with the condition cleared, nothing is shown |
| ALM-8 | ALM-8 alarm light on for an active, un-suppressed alarm; off after snooze<br>ALM-8 alarm light during SELFTEST.SEGMENTS (every powered state)<br>ALM-8 alarm light in every powered state (PROGRAM, SELFTEST.COLUMNS, STARTUP_INFO, FUEL_FILL, TANK_SETUP, USB)<br>ALM-8 alarm light stays off for an alarm turned OFF (suppressed for the flight)<br>ALM-8 / P711-5 (rev3 D1) 711 lamps and alarm light are evaluated during SELFTEST.SEGMENTS |
| ALM-9 | ALM-9 in LEANFIND a TIT alarm < 100° over is hidden for 60 s (display and light), then shown<br>ALM-9 boundary: TIT exactly 100° over the limit is shown immediately in LEANFIND; 99° is not<br>ALM-9 outside LEANFIND the TIT alarm (and light) are immediate<br>ALM-9 "continuously above the limit" counts time already spent above before entering LEANFIND<br>ALM-9 dropping below the limit restarts the 60 s grace<br>ALM-9 (rev3 S5) a TIT alarm hidden by the LeanFind exception does not mask lower alarms<br>ALM-9 (rev3 S5) with only the hidden TIT alarm, nothing is shown and the light stays off |
| ALM-10 | ALM-10 no individual EGT alarms (high EGTs with small spread) |
| LF-1 | LF-1 LF_TAP → ARMED with method R; STEP returns to AUTO at the recorded scan item<br>LF-1 method resets to R on each new LeanFind<br>LF-12 / LF-1 after STEP from LOP_DONE, the next LF_TAP goes to LOP_REVIEW |
| LF-2 | LF-2 ARMED shows LEAN R for 2000 ms, then egt ff of the hottest cylinder with a steady dot<br>LF-2 ARMED without ff shows egt LF<br>LF-2 / LF-3 BOTH_HOLD_5S in ARMED toggles R⇄L; LEAN L shown 2000 ms after the toggle |
| LF-3 | LF-2 / LF-3 BOTH_HOLD_5S in ARMED toggles R⇄L; LEAN L shown 2000 ms after the toggle |
| LF-4 | LF-4 activation on a 15 °F rise above the running minimum (14 °F does not activate)<br>LF-4 rises below 15 °F on several cylinders do not add up<br>LF-4 TIT1 is a LeanFind channel for activation<br>LF-4 activation can also occur during the LEAN R banner |
| LF-5 | LF-5 ACTIVE: flashing dot and number under the hottest cylinder; digital egt ff<br>LF-5 ACTIVE: the method can no longer change (BOTH_HOLD_5S ignored)<br>LF-5 ACTIVE without ff: egt LF<br>LF-5 / LF-6 per-channel peak (max) is tracked from activation: a drop during ARMED is not a peak |
| LF-6 | LF-6 / LF-7 ROP: first channel to drop 10 °F below its max → LEANEST for 2000 ms, column flashes<br>LF-5 / LF-6 per-channel peak (max) is tracked from activation: a drop during ARMED is not a peak |
| LF-7 | LF-6 / LF-7 ROP: first channel to drop 10 °F below its max → LEANEST for 2000 ms, column flashes |
| LF-8 | LF-8 ROP_SET: live egt ff of the locked cylinder; column, dot and number flash<br>LF-8 ROP_SET: holding LF shows peak and the flow at peak; release returns to live<br>LF-8 ROP without ff: egt SET, hold LF → peak PK<br>LF-8 (rev2) ROP with TIT peaking first: T column flashes, no dot, digital tit ff; hold → peak<br>LF-8 / §10 LeanFind values use 1° resolution even with EGT 1?N<br>LF-8 ROP_SET: peak display starts at LF_HOLD_START (700 ms), not before; hold release is not a mark<br>LF-8 (rev3 S6) flow at peak = measured flow at the instant of the channel maximum, not at detection<br>LF-8 (rev3 S6) flow at peak is the measured flow (KF ≠ transducer K)<br>LF-8 (rev3 S6) TIT-locked ROP: flow at the TIT maximum |
| LF-9 | LF-9 LOP before any peak: display as ACTIVE (hottest egt ff, flashing dot), normal bars<br>LF-9 LOP after the first peak: inverted bar for peaked cylinder, others empty, Δ ff, dot at that cylinder<br>LF-9 LOP progress: numbers of all peaked cylinders flash; dot and Δ follow the most recent peak<br>LF-9 inverted segment count clamps at 13<br>LF-9 LOP without ff: Δ LF<br>LF-9 (rev3 S11) in LOP the T column keeps its normal (non-inverted) display<br>LF-9 (rev3 S11) TIT is ignored for LOP peaks |
| LF-10 | LF-10 LOP: all cylinders peaked → LOP_DONE; inverted graph; last column flashes; dot; Δ ff<br>LF-10 LOP_DONE without ff: Δ SET<br>LF-10 LOP completion considers cylinders only (TIT not required to peak)<br>LF-10 LOP completion counts working cylinders only (failed EGT3) |
| LF-11 | LF-11 LOP_DONE hold LF → peak of the first cylinder to peak and GAMI spread (FF first − FF last)<br>LF-11 LOP_DONE hold LF without ff → peakFirst PK<br>LF-11 / LF-18 LF hold-release in LOP_DONE does not act as LF_TAP (stays in LOP_DONE)<br>LF-11 (rev3 S6) GAMI spread = flow at the first cylinder maximum − flow at the last cylinder maximum |
| LF-12 | LF-12 LOP_DONE stores results; LF_TAP → LOP_REVIEW (same display, live Δ); LF_TAP → new ARMED<br>LF-12 / LF-1 after STEP from LOP_DONE, the next LF_TAP goes to LOP_REVIEW<br>LF-12 LF_TAP in LOP_REVIEW starts a new LeanFind: LEAN R banner, method R |
| LF-13 | LF-13 STEP_TAP in every LeanFind state → AUTO at the return scan item |
| LF-14 | LF-14 BOTH_TAP in ARMED requests a mark: SNAP flashes for 2000 ms within 6 s; state unchanged<br>LF-14 BOTH_TAP marks in ACTIVE, ROP_SET, LOP_DONE and LOP_REVIEW<br>LF-14 SNAP is written even with a cold engine (SNAP request forces a record)<br>LF-14 BOTH_TAP in LEANEST requests a mark<br>LF-14 / LIM-5 (rev3 S11) RECRD? N: SNAP still shows within one record interval and counts a mark; nothing recorded |
| LF-15 | LF-15 LF_TAP in ARMED / ACTIVE / ROP_SET marks data (SNAP) and keeps the state<br>LF-15 LF_TAP in LEANEST marks data and does not leave LEANEST early |
| LF-16 | LF-16 LF_HOLD_3S in LeanFind does not toggle the view |
| LF-17 | LF-17 ARMED/ACTIVE/ROP analog bars use the current view (Normalize)<br>LF-17 Percentage view in LeanFind ARMED |
| LF-18 | LF-18 ARMED: LF held does not show a peak; LF_HOLD_3S ignored<br>LF-18 ACTIVE / LEANEST: LF held shows nothing special; BOTH_HOLD_5S ignored (no PROGRAM)<br>LF-18 ROP_SET / LOP_DONE / LOP_REVIEW: BOTH_HOLD_5S ignored (no method change, no PROGRAM)<br>LF-18 LOP_DONE: LF_TAP goes to LOP_REVIEW (not a mark)<br>LF-11 / LF-18 LF hold-release in LOP_DONE does not act as LF_TAP (stays in LOP_DONE) |
| FUEL-1 | FUEL-1 entry from power-up (PWR-7) and from PROGRAM FUEL? Y + STEP<br>FUEL-1 PROGRAM FUEL? N + STEP → next item (RATE), no fill flow |
| FUEL-2 | FUEL-2 LF cycle without AUX: FILL? N → FILL <MAIN> → FILL+ → FILL? N<br>FUEL-2 LF cycle with AUX? Y: FILL? N → FILL <MAIN> → FILL <MAIN+AUX> → FILL+ → FILL? N |
| FUEL-3 | FUEL-3 STEP on FILL? N → exit with no change<br>FUEL-3 STEP on FILL <MAIN> → REM = MAIN<br>FUEL-3 STEP on FILL <MAIN+AUX> → REM = MAIN + AUX<br>FUEL-3 / FUEL-4 STEP on FILL+ → ADD showing .0 GAL |
| FUEL-4 | FUEL-3 / FUEL-4 STEP on FILL+ → ADD showing .0 GAL<br>FUEL-4 ADD: tap LF −1 (negative allowed), hold LF +1 repeating; STEP → REM += amount, MANUAL<br>FUEL-4 ADD upper limit: REM + amount ≤ MAIN (count up stops at full tanks)<br>FUEL-4 ADD upper limit includes AUX when AUX? Y<br>FUEL-4 ADD lower limit: REM + amount ≥ 0<br>FUEL-4 ADD shows the configured fuel unit |
| FUEL-5 | FUEL-5 confirmed FILL MAIN resets USD<br>FUEL-5 confirmed FILL MAIN+AUX resets USD<br>FUEL-5 ADD with amount > 0 resets USD; amount ≤ 0 does not<br>FUEL-5 ACCUM? Y: fills do not reset USD |
| FUEL-6 | FUEL-6 (rev2) exit from the power-up fill flow → MANUAL<br>FUEL-6 (rev2) exit from the program fill flow → MANUAL even when programming was entered from AUTO |
| PGM-1 | PGM-1 BOTH_HOLD_5S → PROGRAM shown 2000 ms, then the first visible item (FUEL? N)<br>PGM-1 inputs are ignored during the PROGRAM banner<br>PGM-1 / PGM-4 remembers the prior mode: AUTO → PROGRAM → exit → AUTO |
| PGM-2 | PGM-2 / PGM-3 main list (switch A, ff, 800) with default displays<br>PGM-2 select switch T filters the program list<br>PGM-2 select switch F filters the program list<br>PGM-2 options: no ff, no OAT, 700<br>PGM-2 FUEL: LF toggles N⇄Y<br>PGM-2 RATE: tap −1 / hold +1, wraps 0..9<br>PGM-2 OATU: LF toggles OAT F⇄C and the OAT item follows<br>PGM-2 EGT1: LF toggles EGT 1?N⇄Y and EGTn resolution follows<br>PGM-2 HPQ: LF toggles HP-? Y⇄N; upper window follows<br>PGM-2 / rev2 R21 KF item: KF-SET for 1000 ms, then 29.00=KF<br>PGM-2 ACCUM: LF toggles ACCUM?N⇄Y<br>PGM-2 GPSC: tap −1 / hold +1, wraps 0..8 (C7)<br>PGM-2 DUMP: LF cycles N → NEW → ALL → N<br>PGM-2 DUMP? N + STEP → END<br>PGM-2 END: LF toggles; END N + STEP → first item<br>PGM-2 / rev2 R29 select-switch change in PROGRAM leaves the current item until the next STEP |
| PGM-3 | PGM-2 / PGM-3 main list (switch A, ff, 800) with default displays<br>PGM-3 FUEL? returns to N each time it is displayed<br>PGM-3 DUMP? returns to N each time it is displayed; END returns to Y |
| PGM-4 | PGM-1 / PGM-4 remembers the prior mode: AUTO → PROGRAM → exit → AUTO<br>PGM-4 exit (END Y + STEP) → prior mode MANUAL at its scan item |
| PGM-5 | PGM-5 STEP on OATU skips OAT_CAL; BOTH_HOLD_5S → OAT_CAL OAT+0<br>PGM-5 OAT_CAL range −10…+10 (tap −1, hold +1), STEP → EGT1, displayed OAT += value<br>PGM-5 OAT_CAL lower bound −10<br>PGM-5 (rev3 S11) OAT calibration is in the displayed unit (°C) and applied after conversion |
| PGM-6 | PGM-6 HPQ BOTH_HOLD_5S → ADJUST 1000 ms → HPC= 125; reachable with HP-? N too (rev2 R15)<br>PGM-6 HPC: tap −1, hold +1; upper window shows %HP live<br>PGM-6 HPC ×10 acceleration after 3 s of holding (range 50…200 > 100 steps)<br>PGM-6 HPC range clamps at 200 and 50<br>PGM-6 HPC STEP → next main item after HPQ (KF)<br>PGM-6 / PGM-7 HPC BOTH_HOLD_5S → ADJUST (1000 ms) → MAP_CAL MAP=0.0<br>PGM-6 / ANA-11 (rev3 S11) without ff the HPC screen upper window shows RPM |
| PGM-7 | PGM-6 / PGM-7 HPC BOTH_HOLD_5S → ADJUST (1000 ms) → MAP_CAL MAP=0.0<br>PGM-7 MAP_CAL ±0.1 steps, range −3.0…+3.0, formats MAP=1.5 / MAP=-1.2; displayed MAP += value<br>ALM-1 / PGM-7 (rev3 S11) the MAP alarm uses calibrated MAP |
| PGM-8 | PGM-8 KF_EDIT: 29.00, first digit flashes; tap −1, hold +1 (wrap 0–9); STEP → next digit (wrap)<br>PGM-8 KF_EDIT BOTH_HOLD_5S saves and returns to the KF item; flow = true × K / KF<br>PGM-8 KF = 0 → measured flow 0 |
| PGM-9 | PGM-9 RATE BOTH_HOLD_5S → ORIG TIT (1000 ms) → ORIG T-N ⇔ ORIG T-Y; N + STEP → next after RATE<br>PGM-9 ORIG T-Y + STEP → CAL TIT (1000 ms) → TIT+0; tap −1 / hold +1; STEP → next after RATE; TIT1 += value<br>PGM-9 CAL_TIT ×10 acceleration after 3 s (range −975…+975)<br>PGM-9 CAL_TIT range clamps at ±975<br>PGM-9 without TIT installed: BOTH_HOLD_5S on RATE does nothing<br>PGM-9 the TIT calibration offset applies only with ORIG T-Y<br>PGM-9 (rev3 S9) CAL_TIT clamps at −975 (no wrap) |
| PGM-10 | PGM-10 DUMP NEW + STEP → DUMP nn progress over 3 s → SAVE D?N<br>PGM-10 DUMP ALL takes 6 s<br>PGM-10 BOTH_HOLD_5S aborts the transfer → DUMP item<br>PGM-10 SAVE D: LF toggles Y/N; STEP exits programming (END skipped) to the prior mode<br>PGM-10 / CALC-7 SAVE D?Y advances the new-data pointer (FULL resets); SAVE D?N does not<br>PGM-10 (rev3 S8) DUMP nn is an unpadded integer throughout the transfer |
| PGM-11 | PGM-11 LTM list order and initial values (TIME 6, date/time from clock, ID, END Y)<br>PGM-11 TIME 2…500 clamps; tap −1 / hold +1 with ×10 acceleration<br>PGM-11 changing TIME while recording starts a new flight file<br>PGM-11 calendar/time fields wrap (MNTH 12→1, DAY 31→1, YEAR 79→80, HOUR 23→0, MIN 59→0 and reverse)<br>PGM-11 leaving MIN writes the clock with seconds = 0<br>PGM-11 aircraft ID edit: BOTH_HOLD_5S → first char flashes; tap LF next char; STEP next char; BOTH_HOLD_5S saves<br>PGM-11 ID charset order A–Z 0–9 - space (wraps)<br>PGM-11 TIME setting controls the record interval (SNAP latency ≤ TIME)<br>PGM-11 (rev3 S11) an LTM date beyond the month length rolls over (04/31 → 05/01) |
| PGM-12 | PGM-12 END BOTH_HOLD_5S → FAC LIM for 2000 ms → alarm list (FAC? N) |
| P711-1 | P711-1 AUTO scans only CHTHI, TIT1, OIL in that order<br>P711-1 AUTO ignores the select switch and exclusions<br>P711-1 AUTO without TIT: CHTHI, OIL<br>P711-1 / §7.2 CHTHI: cht CHT with dot at the hottest CHT cylinder<br>P711-1 on entering AUTO the display goes straight to the primary scan (no non-primary item shown)<br>P711-1 (rev3 S7) STEP_TAP in AUTO on CHTHI → MANUAL on the EGTn of the hottest-CHT cylinder (EGT-CHT first)<br>P711-1 (rev3) STEP_TAP in AUTO on TIT1 / OIL keeps that item in MANUAL |
| P711-2 | P711-2 MANUAL scans all items (normal list with switch); BOTH_TAP exclusion has no effect |
| P711-3 | P711-3 RATE range 1…9 (wrap), automatic mode cannot be disabled |
| P711-4 | P711-4 EGTn in MANUAL shows EGT-CHT for 1000 ms first<br>P711-4 EGT-CHT also shown when an EGTn item comes into the display by scanning backwards |
| P711-5 | P711-5 primary lamps: RED > limit, YELLOW > limit − 45 (CHT) / − 25 (OIL) / − 100 (TIT)<br>P711-5 lamps are not extinguished by STEP (tap or hold)<br>P711-5 lamps are absent on a non-711 instrument<br>ALM-8 / P711-5 (rev3 D1) 711 lamps and alarm light are evaluated during SELFTEST.SEGMENTS |
| P711-6 | P711-6 factory primary limits CHT 460, OIL 230, TIT 1650; displayed but locked in the alarm list<br>P711-6 CHT alarm uses the 460 °F primary limit |
| P711-7 | P711-7 STEP tap extinguishes the flashing digital alarm (lamp stays)<br>P711-7 / C11 STEP hold → OFF works on the 711 digital alarm |
| DL-1 | DL-1 / IN-6 USB_INSERT in MANUAL → USB.MENU NEW; LF toggles NEW⇄ALL<br>DL-1 NEW transfer: countdown 100 → 0 over 3 s, then DONE<br>DL-1 ALL transfer takes 6 s<br>DL-1 / IN-6 USB_REMOVE from any USB state → prior mode (MANUAL at its item / AUTO)<br>DL-1 USB_INSERT ignored without the optional USB port<br>DL-1 (rev3 S8) USB count-down is an unpadded integer |
| DL-2 | DL-2 / IN-6 MEMBOX_CONNECT → DUMPNEW/DUMPALL; STEP → DOWNLOAD 1000 ms → nn% 0…100 → DONE; disconnect → prior mode<br>DL-2 (rev3 S8/S11) memory box: DOWNLOAD 1 s, then unpadded nn% over 3 s (NEW) / 6 s (ALL), then DONE |
| DL-3 | DL-3 successful USB download advances the LTM new-data pointer (FULL 0 next power-up)<br>DL-3 aborted download (removed during transfer) does not advance the pointer<br>DL-3 successful memory-box download advances the pointer |
| CALC-1 | CALC-1 measured flow = true GPH × transducerK / KF<br>CALC-1 flow converted to the fuel unit for display |
| CALC-2 | CALC-2 REM −= flow·dt and USD += flow·dt<br>CALC-2 fuel integration uses measured flow (KF) and the fuel unit<br>CALC-2 REM does not go below 0 |
| CALC-3 | CALC-3 endurance = REM / flow × 60; H.M = floor(h).mm<br>CALC-3 (rev3 S8) H.M floors both hours and minutes (1.9999 h → 01.59)<br>§7.2 / CALC-3 HM: HH.MM H.M endurance at current flow |
| CALC-4 | CALC-4 MPG / REQ / RES with GPS ok (see also §7.2 tests)<br>§7.2 / CALC-4 REQ and RES with GPS ok<br>§7.2 / CALC-4 MPG = groundspeed / flow; label per fuel unit |
| CALC-5 | CALC-5 CLD window is 30 s (a cooling step older than 30 s no longer counts)<br>§7.2 / CALC-5 CLD: most negative CHT rate in °/min over 30 s, dot at that cylinder |
| CALC-6 | CALC-6 DIF = max − min of working EGTs (failed probe ignored)<br>§7.2 DIF: d DIF with dot at the cylinder deviating most from the mean (CALC-6 max−min) |
| CALC-7 | CALC-7 LTM records only when an EGT > 500 °F (FULL after 13 min: hot 1 %, cold 0 %, 500 °F 0 %)<br>CALC-7 FULL = records since save ÷ 12 000 × 100 (60 min at 6 s → 600 records → 5 %)<br>PGM-10 / CALC-7 SAVE D?Y advances the new-data pointer (FULL resets); SAVE D?N does not |
| CALC-8 | **not tested** (see 2.3) |

### 2.2 Spec sections without rule IDs

| Spec section | Tests |
|---|---|
| §7.1 scan table (order, presence, every option) | `SCAN §7.1 default 800 scan list order`, `§7.1 GPS status off/nocom/nosig/nowpt`, `§7.1 gps not installed`, `§7.1 IAT / CDT / CRB options; CDT installed suppresses CRB`, `§7.1 no OAT option`, `§7.1 tit=2 → TIT1 and TIT2; tit=0 → none`, `§7.1 no OIL option; 4 cylinders`, plus SCAN-1…4 tests |
| §7.2 every format row (BAT, OAT, IAT/CDT/CRB, DIF, RPMMAP, REM/REQ/RES/USD, off-course, GPSMSG, MPG + unit labels, HM, GPH + unit labels, EGTn incl. EGT 1?Y and failed side, TIT1 with/without ff, TIT2, OIL, CLD, CHTHI) | 20 `§7.2 …` tests in `scan.test.mjs`; CHTHI in `P711-1 / §7.2 CHTHI …` |
| §12.1 every alarm-list item (display, default, step, tap/hold, clamp at both ends, presence rules, 24 V defaults, EC digit edit + clamp, FAC?, ENG, FUNIT cycle, CARB/RECRD/AUX? toggles, END Y/N) | 37 `§12.1 …` tests in `limits.test.mjs` (two per numeric item: `tap = −step / hold = +step` and `range … clamps at both ends`) |
| §4 numeric convention and ×10 acceleration (> 100 steps only) | `BTN (convention) …`, `PWR-2 … ×10 acceleration`, `PGM-6 HPC ×10`, `PGM-9 CAL_TIT ×10`, `PGM-11 TIME … ×10`, `§12.1 AUX … ×10`, `§4 ×10 acceleration … TIT`, `§4 no ×10 … MIN`, `§4 hold-repeat acceleration for DIF/HOIL/LBAT (no ×10) and MAP/REMLIM/RHP (×10)` |
| §17 display model (digital/blink/flashIndex, upper, view/viewStyle, unit, columns fields, dot, alarmLight, lamps711, brightness) | exercised throughout; `flashIndex` in PGM-8 / PGM-11 / §12.1 EC tests |
| §18 persisted vs volatile | `§18 persisted across POWER_OFF …`, `§18 clock keeps running while powered off`, `§18 volatile: …`, `§18 LOP results do not survive a power cycle`, `§18 LTM new-data pointer persists`, `PWR-10 …`, `PWR-11 settings are non-volatile …` |

Conflict-register resolutions (§21) are covered by: C1 → BTN-4, AUTO-5, MAN-4; C2 → PWR-9; C3 → ALM-4 (item stays
in scan); C4 → LF-11; C5 → LF-14, LF-15; C6 → FUEL-4; C7 → PGM-2 GPSC; C8 → PGM-6 (`HPC= 125`); C9 → §12.1 list
(`42.0 MAP`), ALM-1 MAP; C10 → §12.1 CARB toggle; C11 → P711-7 (both tests); C12 → ALM-1 LOFUEL / LOTIME; C13 →
PGM-9; C14 → PGM-2 switch T/F lists; C15 → FUEL-6; C16 → FUEL-1, PGM-2 FUEL; C17 → FMT-1; C18 → LF-9 progress test;
C19 → P711-1; C20 → CALC-7 (`FULL 5` after 600 records); C21 → every ALM-1 test (alarm visible ≤ 100 ms after the
frame); C22 → LIM-7; C23 → SCOPE-3, ANA-11; C24 → ANA-5 (250 °F → segment 1).

### 2.3 Not tested / only partially testable

| ID | Reason |
|---|---|
| CALC-8 | Probe-noise "EGT wander" is a [SIM] property of `src/sim/engine.js`, not of the instrument state machine in `src/edm/`; the machine only consumes the frames it is given. Out of scope for this suite. |
| PGM-11 (new flight file on TIME change) | No observable display output is defined for it (§17). Tested through the documented-readable `edm.settings.ltm.flightFiles` counter only. |
| ANA-5 (isolated CHT segment rendering) | The display model carries `segs` and `chtSeg` only; whether segment k is drawn "missing" or "isolated lit" is a renderer decision. The test checks that `chtSeg = k` is reported when `segs < k`. |
| ANA-13 | Tested; the value is a simulator display property (see deviation D2). |
| IN-6 | Covered by the DL tests (named `DL-x / IN-6 …`). |

## 3. Deviations (failing tests)

### D1 — ALM-8: alarm light off during the self-test segment phase
- Rule: ALM-8 "Remote alarm light output = any active, un-suppressed alarm condition while powered, **in every
  state** (the digital overlay rule ALM-3 does not apply to the light)."
- Test: `ALM-8 alarm light during SELFTEST.SEGMENTS (every powered state)`.
- Observed: OIL 240 °F (> H OIL 230) at POWER_ON; during `SELFTEST.SEGMENTS` (first 3 s) `alarmLight === false`;
  it turns on at `SELFTEST.COLUMNS`. Expected `true` throughout.
- Diagnosis: implementation bug. `getDisplay()` in `src/edm/machine.js` returns early for the segment test
  (≈ L1760–1768, `dsp.allOn = true … return dsp;`) before `dsp.alarmLight = !!this.vol.alarmActive` (≈ L1868).
  The same early return leaves `lamps711` null for a 711 during those 3 s. Fix: compute `alarmLight`/`lamps711`
  before the early return.

### D2 — ANA-13: dimming time constant is 3.3 s, not 10 s
- Rule: ANA-13 "Dimming: display brightness follows ambient light with a **10 s time constant**."
- Test: `ANA-13 brightness follows ambient light with a 10 s time constant`.
- Observed: brightness 1 → ambient 0; after 10 s brightness = 0.050. Expected ≈ e⁻¹ = 0.37 (first-order lag with
  τ = 10 s).
- Diagnosis: `T.DIM_TAU = 3333` (`src/edm/constants.js` L45, used in `_update()` `machine.js` L229), i.e. τ = 10/3 s
  so the display is ~95 % settled after 10 s. The implementation follows the manual ("Allow ten seconds to adjust",
  p.7) rather than the spec's wording. Either set `DIM_TAU = 10000` or change the spec to "settles within ≈10 s"
  (recommended — see S1). Low training impact.

### D3 — MAN-7 / ANA-8: a dot-less alarm leaves the underlying item's dot visible
- Rule: MAN-7 "… the dot follows the visible (alarm) content."; ANA-8 lists the displays that carry a dot (EGTn,
  DIF, CLD, CHTHI, CHT alarm, LeanFind) — a BAT alarm is not one of them.
- Test: `MAN-7 / ANA-8 a dot-less alarm (BAT) over an EGTn item shows no dot (dot follows the alarm content)`.
- Observed: MANUAL on EGT1, BAT 16.5 V → digital `16.5 BAT` flashing but `dot = {index: 0}` (EGT1's dot).
  Expected `index: null`. A pilot would read the BAT alarm as belonging to cylinder 1. Same in AUTO.
- Diagnosis: implementation bug in the alarm overlay of `getDisplay()` (`machine.js` ≈ L1859):
  `if (a.dot != null) dsp.dot = …` only replaces the dot when the alarm has one and never clears the scan item's
  dot. Fix: `dsp.dot = a.dot != null ? { index: a.dot, blink: false } : { index: null, blink: false }`.

### D4 — ANA-7 (+ MAN-7): TIT/OIL segment keeps flashing under an unrelated alarm
- Rule: ANA-7 "The highest lit TIT segment flashes **while the digital display shows TIT1**; the OIL segment
  flashes **while the digital display shows OIL**." (and MAN-7: indications follow the visible alarm content).
- Test: `ANA-7 / MAN-7 TIT/OIL segment flash follows the visible digital content (not under a BAT alarm overlay)`.
- Observed: MANUAL on TIT1 with a BAT alarm displayed → T column `topFlash === true`; on OIL with a BAT alarm →
  `oilFlash === true`. Expected `false` (the digital display shows `16.5 BAT`).
- Diagnosis: implementation bug. `getDisplay()` passes the scan item (`digitalItem = this.vol.item`) to
  `_columns(d, digitalItem)` before overlays are applied; the alarm overlay only adds flashes for TIT/OIL alarms
  and never removes the scan-item flashes. Fix: when an alarm overlay is shown, derive column flashes from the
  alarm's item (and consider OFF/SNAP overlays likewise). The positive case (TIT alarm flashes the T segment) passes.

### D5 — ANA-9: pre-ignition column flashing also active in LEANFIND
- Rule: ANA-9 "Pre-ignition: **in AUTO/MANUAL** any column whose EGT > 2000 °F flashes …".
- Test: `ANA-9 pre-ignition flashing applies in AUTO/MANUAL only (not in LEANFIND)`.
- Observed: in `LEANFIND.ARMED`, EGT2 = 2001 °F → column 2 `flash === true`. Expected `false`.
- Diagnosis: `_columns()` (`machine.js` L1487) gates the flash with `NORMAL_STATES` (AUTO, MANUAL **and
  LEANFIND**). In LeanFind a flashing column means "leanest / locked cylinder" (LF-7/LF-8), so the two meanings
  collide. The manual (p.25) does not restrict pre-ignition indication by mode, so this may be a spec-scoping
  question rather than a code bug — see S2. Until the spec is changed, the code deviates from it.

## 4. Spec issues found while testing

S1. **ANA-13 wording vs manual.** Manual p.7: "Allow ten seconds to adjust"; spec: "10 s time constant". These are
different behaviours (63 % vs ~95 % after 10 s). Recommend rewording to "settles within ≈10 s" (matches the code).

S2. **ANA-9 mode scope.** Spec limits pre-ignition flashing to AUTO/MANUAL; manual p.25 has no mode restriction;
LeanFind already uses column flashing for LEANEST/ROP_SET. The spec should state explicitly whether pre-ignition
overrides, coexists with, or is suppressed by LeanFind column flashing.

S3. **Alarm overlay vs analog indications (D3/D4).** MAN-7 only says "the dot follows the visible (alarm) content";
it does not say what happens to ANA-7 segment flashes, or to the dot/flash under the OFF and SNAP overlays and in
LEANFIND (where the dot has LeanFind meaning). Recommend one rule: "while an overlay is shown, the dot and
TIT/OIL segment flash follow the overlay content; overlays without a cylinder show no dot".

S4. **ALM-6 vs MAN-7 for a STEP-first chord.** ALM-6: "If an alarm is displayed when STEP is pressed, that STEP
press is routed only to ALM-4/5". MAN-7: BOTH_TAP / BOTH_HOLD_5S act on the underlying item while an alarm is shown.
A chord that starts with STEP satisfies both. The implementation (and these tests) follow MAN-7; ALM-6 should say
"single-button STEP gestures".

S5. **ALM-9 and masking.** While a TIT alarm is hidden by the LeanFind exception, is it "active, un-suppressed" for
ALM-2 masking (so lower alarms such as BAT stay masked) or not? Unspecified; not tested.

S6. **LF-8 / LF-11 "flow recorded when that channel peaked".** Ambiguous between the instant of the maximum EGT
and the instant the 10 °F drop is detected (PEAK_DROP). With real leaning the flow differs between the two, which
changes `peak ffAtPeak` and the GAMI spread. Pin one.

S7. **EDM-711 AUTO → MANUAL on CHTHI.** AUTO-3 says STEP keeps the current item, but CHTHI is not in the MANUAL
list (P711-2), so the SCAN-4 fix-up immediately replaces it with TIT1 (observed: `360 CHT` for one sub-step, then
TIT1). Unspecified which is intended; not counted as a deviation.

S8. **Number formats not pinned:** LOP GAMI spread below 1.0 (`.8` vs `0.8`); `DUMP nn` / `FULL nn` / USB `nn`
zero-padding (implementation: no padding, e.g. `FULL 0`); where the exclusion point goes for `TIT1` with ff
(right field is FF, not a label, FMT-2); `CALC-3` "floor(h).mm" — whether minutes are floored (implementation
floors: 5.376 h → `05.22`).

S9. **Clamp vs wrap is stated for some ranges only.** TANK_SETUP MAIN/AUX (PWR-2), OAT_CAL (PGM-5), HPC (PGM-6),
MAP_CAL (PGM-7), CAL_TIT (PGM-9), FUEL ADD, and all §12.1 numeric items list a range without saying "clamp".
Tests assume clamp (the natural reading, and what the implementation does); the spec should say so (as it does
for TIME).

S10. **Units of the percentage formula in °C (ANA-3).** EGT/red-line is a ratio of absolute temperatures, so the
result differs between °F/°F and °C/°C (e.g. 1340/1650 = 0.812 vs 726.7/900 = 0.807), which can change a segment
near a boundary. Unspecified.

S11. **Other unspecified cases met while testing (not tested):** OAT calibration unit when `OAT C` (PGM-5);
whether the MAP alarm uses calibrated MAP (PGM-7); %HP in the HPC upper window without ff (PGM-6 vs ANA-11);
LTM `DAY` 31 in a 30-day month (PGM-11); memory-box transfer duration (DL-2 says "same flow" but gives no time);
`SNAP` with `RECRD? N` (no record is ever written, LF-14); which cylinder gets the dot when several CHTs exceed the
limit (ALM-1); T-column behaviour in LOP and a TIT peak during LOP (LF-9, I-16); an alarm appearing while STEP is
already held (ALM-6).

S12. **Document consistency.** §17's column model lists no `oilFlash`, while `04-STATE-MACHINE.md` (and the code)
use `oilFlash` for ANA-7's OIL segment; §17 also omits `power`, `allOn` and `viewStyle` that the 700 N/P indicator
(SCOPE-3/ANA-4) relies on. In §2 the "Model notes" paragraph is placed inside the configuration table, splitting
it (`usbPort`, `busVolts`, `transducerK` render as a headerless second table).

S13. **Tooling.** `package.json` `"test": "node --test test/"` does not work on Node ≥ 21 without an index module
(see §1); `test/index.js` was added for that reason.

---

## 5. Round 2 (spec revision 3)

### 5.1 Summary

| | |
|---|---|
| Spec | `docs/02-SPEC.md` revision 3 (rules marked `(rev3)`, §23 disposition of D1–D5 / S1–S13) |
| Command | `npm test` (= `node --test test/*.test.mjs`; `test/index.js` removed) |
| Tests | **479** (Round 1: 428; 1 net new from rewriting the two rev2-encoded tests, 50 in `test/rev3.test.mjs`) |
| Pass | **479** |
| Fail | **0** |
| Duration | ≈ 1 s |

| File | Tests | Fail |
|---|---|---|
| `alarms.test.mjs` | 36 | 0 |
| `analog.test.mjs` | 27 | 0 |
| `calc.test.mjs` | 16 | 0 |
| `download.test.mjs` | 9 | 0 |
| `fuel.test.mjs` | 19 | 0 |
| `gestures.test.mjs` | 25 | 0 |
| `leanfind.test.mjs` | 51 | 0 |
| `limits.test.mjs` | 56 | 0 |
| `modes.test.mjs` | 32 | 0 |
| `p711.test.mjs` | 16 | 0 |
| `power.test.mjs` | 43 | 0 |
| `program.test.mjs` | 55 | 0 |
| `rev3.test.mjs` | 50 | 0 |
| `scan.test.mjs` | 44 | 0 |

All Round 1 tests other than the two below were re-run unchanged against the modified implementation and pass, so
none of the rev3 code changes caused a regression in previously validated behaviour.
The coverage claim of §2 still holds: every requirement ID has at least one named test except CALC-8 ([SIM] engine
noise, outside `src/edm/`).

### 5.2 Round 1 tests updated for rev3 rules

| Old test (rev2 rule) | Rev3 rule | New test(s) |
|---|---|---|
| `ANA-13 brightness follows ambient light with a 10 s time constant` | ANA-13: first-order, τ ≈ 3.3 s, ≈95 % settled in 10 s | `ANA-13 (rev3) brightness follows ambient light first-order (τ ≈ 3.3 s), settling within about 10 s` — after 1 s > 0.6; at 3.3 s ≈ e⁻¹ ± 0.04; at 10 s 0.03…0.07; rising step also settles in 10 s |
| `ANA-9 pre-ignition flashing applies in AUTO/MANUAL only (not in LEANFIND)` | ANA-9: AUTO, MANUAL **and LEANFIND**, coexisting with LeanFind column flashes | `ANA-9 (rev3) pre-ignition flashing also applies in LEANFIND (ARMED)`, `ANA-9 (rev3) pre-ignition flash coexists with the ROP_SET locked-column flash`, `ANA-9 (rev3) pre-ignition flash coexists with the LOP inverted graph (non-peaked and peaked columns)` |

### 5.3 Round 1 deviations — disposition verified

| Dev. | Resolution | Verification |
|---|---|---|
| D1 ALM-8 light in SELFTEST.SEGMENTS | code fixed | Round 1 test `ALM-8 alarm light during SELFTEST.SEGMENTS …` now passes; new `ALM-8 / P711-5 (rev3 D1) 711 lamps and alarm light are evaluated during SELFTEST.SEGMENTS` |
| D2 ANA-13 time constant | spec reworded | rewritten ANA-13 test passes (implementation unchanged, τ = 3.33 s) |
| D3 dot under a dot-less overlay | ANA-8 rev3 + code fixed | Round 1 `MAN-7 / ANA-8 a dot-less alarm (BAT) …` now passes; extended to OFF, SNAP, LEANFIND and AUTO (§5.4) |
| D4 TIT/OIL segment flash under overlay | ANA-7 rev3 + code fixed | Round 1 `ANA-7 / MAN-7 TIT/OIL segment flash follows …` now passes; extended to OFF, cross TIT/OIL alarms, OILL, OIL-only column, LEANFIND |
| D5 ANA-9 scope | spec extended to LEANFIND | rewritten ANA-9 tests pass, incl. the LOP inverted graph |

### 5.4 Coverage added for rev3 (all in `test/rev3.test.mjs` unless noted)

| Rev3 item | Rule(s) | Tests |
|---|---|---|
| D1 | ALM-8, P711-5 | `ALM-8 / P711-5 (rev3 D1) 711 lamps and alarm light are evaluated during SELFTEST.SEGMENTS` |
| D3 / D4 / S3 overlay rule | ANA-7, ANA-8, MAN-7 | `ANA-8 (rev3) OFF overlay shows no dot over an EGTn item; the item dot returns after OFF`<br>`ANA-7 (rev3) OFF overlay: no TIT segment flash over TIT1, no OIL segment flash over OIL; flashes return after`<br>`ANA-8 (rev3) SNAP overlay in LEANFIND ARMED: no dot while SNAP shows; the steady dot returns`<br>`ANA-8 (rev3) SNAP overlay in ROP_SET and LOP_DONE: no dot`<br>`ANA-8 (rev3) BAT alarm overlay in LEANFIND shows no dot (ARMED, ACTIVE, ROP_SET, LOP_DONE)`<br>`ANA-8 (rev3) CHT alarm overlay in LEANFIND: dot at the alarming cylinder`<br>`ANA-8 (rev3) OFF overlay in LEANFIND: no dot while OFF shows; LeanFind dot returns`<br>`ANA-8 (rev3) CHT alarm in ROP_SET takes the dot; after STEP acknowledges it the flashing locked-cylinder dot returns`<br>`ANA-8 (rev3) DIF and CLD alarm overlays over EGT1 put the dot on their own cylinder`<br>`ANA-8 (rev3) AUTO: BAT alarm over an EGTn item shows no dot`<br>`ANA-7 (rev3) TIT alarm over the OIL item flashes the TIT segment only; OIL alarm over TIT1 the OIL segment only`<br>`ANA-7 (rev3) an OILL (low oil) alarm overlay flashes the OIL segment, not the TIT segment`<br>`ANA-7 (rev3) OIL alarm with an OIL-only last column flashes that column`<br>`ANA-7 / ANA-8 (rev3) TIT alarm overlay in LEANFIND: T segment flashes, no dot` |
| D5 / S2 | ANA-9 | see §5.2 (two in `leanfind.test.mjs`, the LOP case in `rev3.test.mjs`) |
| S4 | ALM-6 | `ALM-6 (rev3 S4) an alarm appearing while STEP is already held does not capture that press (tap scans)`<br>`ALM-6 (rev3 S4) STEP held through alarm onset: backwards scanning continues; no OFF at 5 s`<br>`ALM-6 (rev3 S4) a STEP-first chord while an alarm is displayed is not captured (BOTH_TAP excludes, alarm stays)`<br>`ALM-6 single-button STEP pressed while an alarm is displayed is still routed to the alarm (regression)`<br>`ALM-6 (rev3) a captured STEP press stays with the alarm even if the alarm clears before hold start` |
| S5 | ALM-9 | `ALM-9 (rev3 S5) a TIT alarm hidden by the LeanFind exception does not mask lower alarms`<br>`ALM-9 (rev3 S5) with only the hidden TIT alarm, nothing is shown and the light stays off` |
| S6 | LF-8, LF-11 | `LF-8 (rev3 S6) flow at peak = measured flow at the instant of the channel maximum, not at detection`<br>`LF-8 (rev3 S6) flow at peak is the measured flow (KF ≠ transducer K)`<br>`LF-8 (rev3 S6) TIT-locked ROP: flow at the TIT maximum`<br>`LF-11 (rev3 S6) GAMI spread = flow at the first cylinder maximum − flow at the last cylinder maximum` (detection-instant flows chosen so the alternative reading would give 1.0 instead of 1.5) |
| S7 | P711-1 | `P711-1 (rev3 S7) STEP_TAP in AUTO on CHTHI → MANUAL on the EGTn of the hottest-CHT cylinder (EGT-CHT first)`<br>`P711-1 (rev3) STEP_TAP in AUTO on TIT1 / OIL keeps that item in MANUAL` |
| S8 formats | FMT, LF-11, PWR-6, PGM-10, DL-1, DL-2, FMT-2, CALC-3 | `FMT (rev3 S8) GAMI spread below 1.0 has one decimal with a leading zero (0.8)`<br>`FMT (rev3 S8) flows below 1.0 show a leading zero (LeanFind egt ff, TIT1 tit ff)`<br>`PWR-6 (rev3 S8) FULL nn is an unpadded integer`<br>`PGM-10 (rev3 S8) DUMP nn is an unpadded integer throughout the transfer`<br>`DL-1 (rev3 S8) USB count-down is an unpadded integer`<br>`DL-2 (rev3 S8/S11) memory box: DOWNLOAD 1 s, then unpadded nn% over 3 s (NEW) / 6 s (ALL), then DONE`<br>`FMT-2 (rev3 S8) excluded TIT1 with ff: the point precedes the flow field (1370 .13.5); without ff before TIT`<br>`CALC-3 (rev3 S8) H.M floors both hours and minutes (1.9999 h → 01.59)` (+ Round 1 `CALC-3 … 05.22`) |
| S9 clamp unless wrap | §4 | `PGM-9 (rev3 S9) CAL_TIT clamps at −975 (no wrap)`, `PWR-2 (rev3 S9) TANK_SETUP AUX clamps at 250 (no wrap)`; Round 1 clamp tests already covered every §12.1 numeric item at both ends, TANK MAIN, OAT_CAL, HPC, MAP_CAL, CAL_TIT max, FUEL ADD, TIME; explicit wraps (RATE, GPS-C, KF digits, calendar fields) tested as wraps |
| S10 | ANA-3 | `ANA-3 (rev3 S10) the percentage scale is computed in °F even with ENG C` (values chosen where a °C ratio gives a different count: EGT 1000 °F → 4 not 3, 840 °F → 1 not 0, OIL segment 120 °F → 2 not 0)<br>`ANA-3 (rev3 S10) OIL-only column in ENG C uses the H OIL limit converted to °F` |
| S11 | PGM-5, PGM-7/ALM-1, PGM-6/ANA-11, PGM-11, DL-2, LF-14/LIM-5, ANA-8, LF-9, ALM-6 | `PGM-5 (rev3 S11) OAT calibration is in the displayed unit (°C) and applied after conversion` (59 °F, OAT C, +3 → `18 OAT`; before-conversion would give 17)<br>`ALM-1 / PGM-7 (rev3 S11) the MAP alarm uses calibrated MAP` (incl. calibrated = limit → no alarm)<br>`PGM-6 / ANA-11 (rev3 S11) without ff the HPC screen upper window shows RPM`<br>`PGM-11 (rev3 S11) an LTM date beyond the month length rolls over (04/31 → 05/01)` (clock and next startup `05.01.26`)<br>`DL-2 (rev3 S8/S11) memory box …`<br>`LF-14 / LIM-5 (rev3 S11) RECRD? N: SNAP still shows within one record interval and counts a mark; nothing recorded`<br>`ANA-8 / ALM-1 (rev3 S11) CHT alarm: text and dot use the hottest cylinder above the limit`<br>`LF-9 (rev3 S11) in LOP the T column keeps its normal (non-inverted) display`<br>`LF-9 (rev3 S11) TIT is ignored for LOP peaks`<br>ALM-6 tests above |
| S12 | §17 | `§17 (rev3 S12) display model fields: power, allOn, viewStyle, columns[].oilFlash` |
| S13 | tooling | suite runs with `npm test`; no shim |

### 5.5 Remaining deviations

**None.** All 479 tests pass against the rev3 implementation.

One Round 2 test-side error was found and fixed: the first draft of the ANA-9 ROP_SET coexistence scenario
raised a DIF alarm (2001 − 1360 = 641 °F > 500), so the overlay hid the digital value; the test now raises the
DIF limit for that scenario.

### 5.6 New spec issues (rev3)

N1. **§23 pins are not folded into the rule bodies.** Several resolutions exist only in §23, while tests and
training material cite rule IDs: FMT-2 (exclusion point for TIT1 with ff), CALC-3 ("floor(h).mm" — minutes floored),
PGM-5 (OAT-cal unit, applied after conversion), PGM-6/ANA-11 (no-ff HPC upper window), PGM-7/ALM-1 (MAP alarm on
calibrated MAP), PGM-11 (date roll-over), DL-2 (box 3 s / 6 s), LF-14/LIM-5 (SNAP with `RECRD? N`), LF-9 (T column
and TIT in LOP), §4 / LF-8 (flows with a leading zero). Recommend moving each pin into its rule.

N2. **§10 preamble vs §23 S11.** The preamble still says TIT1 is considered "for activation and first peak", and
LF-11's "peakFirst" is a LOP first peak; §23 says TIT is ignored for LOP peaks. Recommend "first peak (ROP only)".

N3. **Overlay precedence.** §5 lists three overlays (alarm, `OFF`, `SNAP`) and ANA-7/ANA-8 now give them ownership
of the dot and segment flashes, but nothing says which overlay wins when two apply (a `SNAP` falling due while an
alarm is displayed, or a new alarm during the 1.5 s `OFF`). Not tested.

N4. **Overlay dot blink state.** ANA-8 rev3 fixes the overlay dot's position (alarming cylinder) but not whether it
is steady or flashing, e.g. a CHT alarm in ACTIVE/ROP_SET where the LeanFind dot underneath flashes. Tests assert
the index only.

N5. **TIT2 alarms and ANA-7.** With `tit = 2`, if the TIT alarm is raised by TIT2, should the T column (which shows
TIT1) flash ("incl. a TIT alarm")? Unspecified; not tested.

N6. **TIT-locked ROP_SET under an overlay.** The T-column flash there is a LeanFind column flash (LF-8) but also
"the TIT segment" that overlays now own (ANA-7). Which rule wins under `SNAP` or a non-TIT alarm is unspecified.

N7. **P711-1 S7 with the select switch on F.** The target EGTn item is not a MANUAL item for switch F (SCAN-2);
presumably SCAN-4 then moves to the next present item. Unspecified; not tested.

N8. **Unobservable outcomes.** "Counts a mark" (S11, `RECRD? N`) and "starts a new flight file" (PGM-11) have no
§17 output; the tests read `edm.settings.ltm.marks` / `.flightFiles`, which are implementation names.

N9. **LeanFind flow below 0.5 GPH.** The GPH item shows `0.0` below 0.5 (§7.2); whether `egt ff` / `tit ff` /
`ffAtPeak` do the same is unspecified (tests use 0.8).
