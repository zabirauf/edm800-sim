# Review of 02-SPEC.md against PG-EDM-800 Rev W

Reviewer: independent audit. Page refs are manual pages (`p.N`; PDF page = N+4). `FC` = front "How to Change Modes"
flowchart (PDF p.3). `QR` = Quick Reference p.56–57. I checked every claim below against the PDF images, not just
`manual.txt`. Figures I looked at in detail (300 dpi): p.4 face, p.14, p.15, p.16 LeanFind figures, the p.27 fuel
flowchart, and the p.33–34 programming table.

Severity: **HIGH** = wrong or missing behavior a pilot would notice. **MED** = ambiguity, an internal gap, or a
questionable interpretation. **LOW** = cosmetic, tagging, or bookkeeping.

---

## Findings

### HIGH

1. **HIGH: FUEL-6 / I-18. The fuel-fill exit in program context goes to the wrong place.**
   - Manual, p.27, right after the flowchart (which covers both the Program and Power-up entries): "Then tap the STEP
     button to complete the entry and advance to the Manual mode."
   - QR p.57 "Filled Tanks", step 6: "Tap STEP to exit." "Added or Removed Fuel", step 7: "Tap STEP to exit."
   - Compare the QR "Change Indexing Rate" procedure, which says explicitly "Tap STEP until you see END Y, then tap
     STEP to exit".
   - The spec instead returns to the next PROGRAM item (`RATE`). A pilot doing the in-flight refuel procedure would
     be left inside the programming list.
   - The only support for the spec's reading is that the flowchart's left-pointing exit arrows have no labels.
   - Change: in both contexts, STEP on FILL?N (Exit), FILL MAIN, FILL MAIN+AUX or ADD (Done) should leave the
     fuel flow and go to MANUAL. An acceptable alternative is the mode that was active before programming. Record
     the flowchart ambiguity as a new [C] entry.

2. **HIGH: LF-9 / LF-5 (LOP progress). The dot behavior is missing.**
   - Manual, p.16 text: "As you continue to lean past peak the dot of the each successive cylinder will flash as it
     peaks." The p.16 figure shows the dot under the last cylinder to peak.
   - The spec keeps the dot under the hottest cylinder (LF-5) during LOP progress, but LF-9 shows the Δ of the most
     recently peaked cylinder. The dot and the digital value then point at different cylinders.
   - Change: in LOP ACTIVE after the first peak, put the dot under the most recently peaked cylinder and make it
     flash. Also keep that cylinder's number flashing, as LF-9 already says (p.13 step 9, p.16 figure).
   - Add a [C] entry: the text says the dot flashes, while the figure and step 9 say the cylinder number flashes.
     The resolution is to do both.

### MED

3. **MED: PGM-2 FUEL row / FUEL-1. Missed conflict over what LF does on `FUEL? N`.**
   - The p.27 flowchart box `FUEL ?N` labels LF "Refuel", and that arrow goes directly to `FILL ?N`. STEP is
     labelled "Pgm".
   - The p.33 table (`N⇔Y`) and QR p.57 ("Tap LF to see FUEL? Y. Tap STEP") say LF toggles to Y and STEP then enters
     the fill flow.
   - The spec follows the table and QR silently.
   - Change: add a [C] entry. Keeping the QR/table behavior is reasonable, because the QR is the step-by-step source.

4. **MED: LF-8. Holding LF in ROP_SET probably shows fuel flow at peak, not current flow.**
   - In the p.13 step table, the flow is `13.8` at activation and `12.4` at LEANEST/SET. QR p.57 then says "Hold LF
     and see `1560 13.5`, the peak EGT of the first cylinder to peak and fuel flow."
   - 13.5 lies between the activation and post-peak flows, which is consistent with the flow recorded at the peak.
     Current flow would read about 12.4.
   - The LOP hold display (GAMI spread) already requires recording the flow at each peak.
   - Change: `peak ffAtPeak`. If you keep current flow, tag it [I] and add it to §20.

5. **MED: LF-14. SNAP timing is wrong.**
   - Manual, p.30: "You will see the word SNAP within the next six seconds, indicating a data record has been marked."
     So SNAP appears when the next LTM record is written. The p.9 text only says the display "will flash SNAP".
   - The spec shows SNAP immediately for 2000 ms.
   - Change: set a mark-pending flag and show flashing `SNAP` when the next record is written (at most `TIME`
     seconds later), then hold it for T_SNAP. Record this as a [C] or [I] entry.

6. **MED: §10 overall. The LeanFind event table is incomplete, and an implementer cannot resolve it.**
   - These cases are undefined:
     - (a) `LF_TAP` in ACTIVE, LEANEST, ROP_SET, and LOP ACTIVE.
     - (b) LF hold in ARMED and in ACTIVE before any peak. p.9 says hold shows peak EGT only "after peak EGT is
       found".
     - (c) LF hold in LOP ACTIVE after at least one peak.
     - (d) `BOTH_HOLD_5S` in ACTIVE, ROP_SET, LOP_DONE and LOP_REVIEW. Should it enter PROGRAM or be ignored?
       PGM-1 lists AUTO/MANUAL only.
     - (e) LF-15 limits "tap LF = mark" to ARMED. The QR "Tap LF twice" reading (C5) gives no reason to limit it to
       ARMED.
   - Change: add an explicit event × LeanFind-state table. Suggested defaults:
     - LF_TAP in any non-LOP state marks a record (consistent with C5).
     - LF hold before a peak does nothing.
     - BOTH_HOLD_5S outside ARMED is ignored.

7. **MED: LF-12 / §5. `LOP_REVIEW` is reachable but its display is never defined.**
   - The spec does not say whether the digital shows a live Δ, `SET`, flow or nothing, where the dot is, or whether
     the last column flashes.
   - Manual, p.16: "if you Tap LF you will return to the inverted bar graph, which can be used for fine tuning".
     That implies live Δ values against the stored peaks.
   - Change: define LOP_REVIEW = the LOP_DONE display (inverted graph against stored peaks, live Δ of the last
     cylinder, flow), or state the differences.

8. **MED: LeanFind channels (§10 preamble, LF-7, §17). TIT can be locked as the ROP channel, but its display is
   undefined.**
   - The spec includes TIT1 in first-peak detection. If TIT peaks first, LEANEST/ROP_SET lock onto TIT, but
     `dot.index` is 0..5 and has no T position, and the digital `egt SET` for TIT is not defined.
   - Change: define it. For example, the T column flashes, there is no dot, and the digital shows `tit SET` /
     `tit ff`. Alternatively, use TIT only for activation. Basis: p.16 "lean by reference to the first cylinder or TIT
     to reach peak".

9. **MED: §7.2 TIT1/TIT2 and SCAN TIT2 row. Treating TIT2 as `tit TI2` [M p.10] is not established.**
   - The p.10 comments read "Turbine #1, left … Turbine #2, right". This parallels p.29 "Turbine #1, left and fuel
     flow right" (`1370 13.5`). The p.29 FF table has no TIT2 row at all.
   - The better-supported reading: without FF, one TIT item shows `tit1 tit2`. With FF, the right side becomes flow,
     and it is unstated whether TIT2 appears separately.
   - Change: retag as [C]/[I] and pick one reading explicitly. At minimum, remove the T,A switch claim for TIT2,
     because p.29 does not list it.

10. **MED: EGT resolution (7.2 EGTn, §10). It is unspecified whether `EGT 1?N` rounding applies to LeanFind values,
    TIT or DIF.**
    - The LeanFind examples are 1° values: `1545 SET`, `1545 12.4` (p.13), `-5 7.3` (p.16), `-15 SET`.
    - A 10° rounding would make the LOP Δ values `-5` and `-15` impossible.
    - Change: state that LeanFind digital values (egt, peak and Δ) always use 1° resolution, and say how TIT and DIF
      are rounded.

11. **MED: BTN-8. "BOTH_TAP = chord released before 5000 ms" is cited [M p.9], but p.9 gives no threshold.**
    - A tap is "pressing a button momentarily" (p.8).
    - With a 5 s window, a pilot who aborts program entry at 4 s toggles exclusion (MAN-3), and an aborted LEAN R→L
      hold at 4 s produces SNAP.
    - BTN-1 also uses 700 ms for a single-button tap, so the two definitions are inconsistent.
    - Change: BOTH_TAP only if the chord is released before T_HOLD_START. A release between 700 ms and 5 s does
      nothing. Tag it [I].

12. **MED: PWR-9 / I-4. The 2-minute AUTO timer from POWER_ON can expire before MANUAL is reached.**
    - `FILL? N` flashes "until any button is pressed" (p.26). If the pilot waits more than 120 s at the fuel prompt or
      in TANK_SETUP, the one-shot misses and the unit never auto-indexes.
    - Change: start T_AUTO_AFTER_POWER on the first entry into MANUAL from the power-up sequence. Otherwise, if the
      timer has already expired at that point, enter AUTO directly. Keep FC "two minutes after power up" as the
      citation.

13. **MED: ALM-8 combined with ALM-3. The remote alarm light goes off in PROGRAM, FUEL_FILL, USB and similar states
    while the condition persists.**
    - Manual, p.2: "constantly 'red line' checking … regardless of the current display status". p.24: the external
      light "too will be activated".
    - Change: `alarmLight` = any active, un-suppressed alarm, independent of mode or overlay. Keep ALM-3 for the
      digital display only.

14. **MED: §12.1 TIT row and ANA-3. The TIT limit should be present without a TIT probe.**
    - Manual, p.43: `1650 TIT` "Also sets the maximum scale of the EGT and TIT bar graph". The row carries no TIT
      option marking; only the FF rows are shaded, and the 800-only rows are marked.
    - Hiding the item when `tit=0` forces an invented fixed 1650°F red line (I-11), and non-turbo users cannot set
      their EGT scale.
    - The same applies to HOIL/LOIL: their "present when oil" condition is an interpretation, not stated on p.43.
    - Change: make TIT always present. Tag the presence conditions as [I].

15. **MED: I-28 / PGM-2 HPQ. "BOTH_HOLD_5S only when Y" has no basis in the manual.**
    - The p.34 HP-? comment is unconditional: "Hold STEP and LF for 5 seconds to adjust the horsepower constant".
      p.35 only advises switching to Y so that %HP is visible while you adjust.
    - Requiring Y also blocks MAP calibration for pilots who chose RPM display.
    - Change: allow HPC/MAP_CAL entry from either value. During HPC the upper window shows %HP anyway (PGM-6).

16. **MED: ANA-1 / §17 `label`. The T label must be absent for an OIL-only last column.**
    - Manual, p.6: "If the T is absent and the Oil temperature option is installed, the last column displays Oil
      temperature."
    - Change: in the column model, the last column's label is `'T'` only if `tit ≥ 1`. For OIL-only it is blank.

17. **MED: 7.1 GPSMSG / IN-4. The GPS states are incomplete, and `nocom` is mislabeled.**
    - Manual, p.47 distinguishes:
      - "REQ, RES, & MPG are all missing" with no message: no comms, or the GPS is off.
      - `NO-COM`: comms are received and auto-protocol setup is in progress.
    - The spec has no status for "off / no data", and its `nocom` maps to the NO-COM message.
    - Change: enumerate GPS status as {off, protocol (NO-COM), nosig (NO-SIG), nowpt (NO-WPT), ok}, plus an
      off-course flag. `off` shows no message and hides REQ/RES/MPG.

18. **MED: C6 / FUEL-4. The resolution silently breaks the manual's case (b).**
    - Manual, p.27, case (b): "topped the main tanks but have some fuel remaining in the auxiliary tanks, input how
      much is now in the auxiliary tanks". That implies REM = MAIN + amount, not REM += amount.
    - Under the spec, a pilot following case (b) gets a wrong total.
    - Change: keep the add semantics (the QR "Added or Removed Fuel" supports it), but state in C6 that the case (b)
      procedure produces REM_old + amount. Trainer content must not teach case (b) as written.

19. **MED: §2 `cylinders` vs §12.1 `CYL`. There are two sources of truth for the cylinder count.**
    - The config allows `cylinders ∈ {4,6}`, but its note says "(1–6)". The program item `CYL=4…12` (p.45 allows 8
      for 4-cylinder dual-mag/LASAR and 12 for 6-cylinder LASAR) has no defined effect.
    - Change: state whether CYL drives the number of analog columns, scan EGTn items and DIF/CLD, or only the HP
      calculation (SIM). Define the mapping for 8 and 12. Fix the "(1–6)" note.

20. **MED: Alarm overlay vs other actions (MAN-3, MAN-5, ANA-8). The target is ambiguous.**
    - While an alarm replaces the digital display, it is undefined whether `BOTH_TAP` toggles exclusion of the
      hidden scan item, and whether `BOTH_HOLD_5S` resets USD when the underlying item is USD.
    - It is also undefined whose dot is shown: the alarm's or the scan item's.
    - Change: specify, for example, that BOTH_TAP and BOTH_HOLD act on the underlying scan item, and that the dot
      follows the visible (alarm) content.

### LOW

21. **LOW: Display strings that are missing or don't match the manual.**
    - PGM-2 KF: the item is called `KF-SET` (p.34 STEP column; p.40 "advance to the KF-SET screen 29.00=KF"). The
      spec never shows `KF-SET`.
    - The p.38 STEP column shows the `ORIG TIT` and `CAL TIT` labels.
    - PGM-7 shows `MAP+0.0`, which appears nowhere in the manual. The manual has `MAP=0` (p.35 step 5, p.36 C) and
      `MAP□0` with an unrendered glyph (p.34).
    - DL-2 omits `DATA DOWNLOAD MODE`, which the manual shows during box transfer (p.32 step 5).
    - The FILL strings `FILL ?75` / `Fill ?+` (p.27 flowchart) vs `FILL 75` / `FILL+` (QR) are left unformatted as
      `FILL <MAIN>`.
    - H.M has a trailing dot in p.29 (`02.45 H.M.`) but not on p.42.
    - Change: pin exact strings.

22. **LOW: FMT-1 conflicts with the p.29 example `38 USD`, an integer below 100.**
    - Under FMT-1 that value would show as `38.0 USD`. Meanwhile p.28 shows `.0 USD`.
    - Change: add a [C] entry and keep FMT-1 if desired.

23. **LOW: Interpretations tagged [M].**
    - §12.1 step sizes for TIT (10) and MAP (0.5) are not in the manual. p.43 only gives steps for BAT, DIF, CHT,
      CLD and OIL.
    - Presence conditions for the HOIL, LOIL and TIT alarm items.
    - The dot on a CHT alarm (ALM-1, ANA-8).
    - The DIF dot defined as "deviates most from the mean" (p.10 only says "most widely deviating").
    - ANA-9 pre-ignition trigger "EGT > 2000°F". p.25 describes a "sudden red line" with the column flashing; 2000°F
      is what the digital shows. It is also unstated whether the digital display jumps to that cylinder.
    - PWR-11 cites p.1 "non-volatile", but that refers to LTM only.
    - Change: retag as [I].

24. **LOW: §20 is incomplete.**
    - Inline [I] items with no register entry: GPSMSG placement, AUTO-8, PWR-6 date order, PWR-11 item list, DL-3,
      BTN-10/11, LF-17.

25. **LOW: Missed minor self-contradictions to register.**
    - 711 auto order: p.7 "highest CHT, TIT, OIL" vs p.10 "highest CHT, OIL and … TIT". The spec uses p.10.
    - LTM capacity: p.1 "up to 30 hours" vs p.30 "up to 20 hours at a 6 second interval". CALC-7 uses 20 h.
    - Alarm check rate: p.2 "four times a second" vs p.12 "every second".
    - ENG F/C: p.42 "newer instruments will automatically change the alarms to the factory limits" vs p.43 "You must
      also change the alarm limits".
    - Upper RPM window: p.1 matrix "RPM opt" for 700/711 vs p.4/p.6 "(EDM-800 only)". SCOPE-3 denies RPM/MAP on the
      700.
    - CHT scale labels: the p.14, p.16 and p.24 figures show 300/400/500, while p.4, p.6, p.15 and the p.6 text show
      250/350/450. ANA-5 correctly follows the text.

26. **LOW: §2 model rules.**
    - Per p.1, OAT and FF are standard on the 800, and OIL is standard on the 711. The config allows them off.
    - Change: validate per model or default-lock them.

27. **LOW: P711.** p.41 gives example factory limits of CHT 460°F, OIL 230°F and TIT 1650°F. The spec gives no
    711-specific defaults; using the 450 non-primary default is inconsistent with the 711 example. It also does not
    say whether STEP hold → `OFF` works on the 711; QR p.56 says "Reset Alarm (except EDM-711)".

28. **LOW: Dropped settings effects.**
    - `RECRD? Y` also disables real-time serial output: "Y—only data recording. N—only real-time data output" (p.44).
    - `CARB? Y` selects a slower response filter (p.45), and C10 drops this.
    - The aircraft ID default is the EDM serial number (p.30). Its length is implied by `N-----` / `N123456`
      (7 characters, p.41).
    - Change: note these, even as SIM-light (for example, extra display smoothing when CARB? Y).

29. **LOW: Edge cases to pin down.**
    - PWR-7: is the first press on the flashing `FILL? N` acted on? The flowchart implies yes.
    - USB_INSERT and MEMBOX_CONNECT outside AUTO/MANUAL.
    - The select switch moving while PROGRAM shows an item that becomes hidden.
    - ENG F/C: does the reset happen on toggle or on leaving the item?
    - Guarding KF=00.00 in CALC-1.
    - Behavior of STEP hold in AUTO.

30. **LOW: SIM realism for training (p.20 Misapplications).**
    - "Leaning too slowly" or "stopping while leaning" gives a false or early peak, or "peak not found".
    - The pure threshold peak detector (LF-6) won't reproduce these for clean sensor data.
    - Change: consider noise or a time-window rule if the trainer is meant to teach these errors.

---

## Verified OK

- **Mode flowchart (FC):** AUTO⇄MANUAL, LF→LeanFind from both modes, STEP→AUTO from LeanFind, hold both = R/L
  toggle, the LEANEST hold/release loop, and the LOP "LF returns to inverted graph, tap LF again" note (LF-1, LF-12).
- **Button semantics:** tap/hold, LF 3 s view toggle (C1), both-hold 5 s to PROGRAM, both-tap exclusion and SNAP,
  STEP hold → backwards scan and alarm OFF.
- **Scan list (p.10, p.29):** order, select-switch columns (including RPM MAP T,A,F, the 1 s dwell, and BAT on T,A
  only), CRB suppressed by CDT, GPS-dependent REQ/RES/MPG, and the `--- REQ/RES` off-course and NO-SIG/NO-WPT rules
  (aside from finding 17).
- **Digital formats and examples:** BAT, OAT, IAT, CDT, CRB, DIF, RPM MAP, REM, REQ, RES, MPG/MPK/MPL/MPP, H.M,
  GPH/KPH/LPH/PPH, USD, `egt cht`, TIT+FF, OIL, CLD, the exclusion decimal point `184 .OIL`, `0.0 GPH`,
  `--- GPH` / `--- H.M`.
- **Analog display:** 13 segments per column, confirmed at 300 dpi from p.4. The CHT ticks at segments 1/5/9 =
  250/350/450 give 25°F per segment. The example column's missing segment 3 = 300°F, and the T column's missing
  segment = OIL.
  - Percentage scale: 1 segment = 50%, full = 100% of the TIT limit.
  - Normalize: 10°F per segment from half height. LOP inverted graph: 5°F per segment from the top.
  - Isolated CHT segment rule, and the TIT/OIL top-segment flash.
- **Alarms:** priority order and display strings match p.25 and the p.42 examples (with C12 correctly un-swapping
  LO FUEL and LO TIME). 10-minute tap and OFF-for-flight, no individual EGT alarms, the LeanFind TIT 100°/60 s grace.
- **LeanFind ROP:** 15°F activation, flashing dot and number, LEANEST 2 s then `SET`/flow, locked cylinder, hold LF →
  `PK`, default LEAN R each time, method locked once active.
- **LeanFind LOP:** last-peak Δ `SET`/flow, GAMI spread on hold, first-cylinder peak (C4).
- **Fuel-fill LF chain (p.27 flowchart):** FILL?N → MAIN → MAIN+AUX (only with AUX? Y, per the QR "2 or 3 times") →
  FILL+ → FILL?N. The `.0 GAL` screen uses tap −/hold +, count up stops at full, negatives allowed. USD reset at
  refuel unless ACCUM, and the USD manual reset via both-hold on USD.
- **Power-up:** tank setup by holding STEP at power-on (items, ranges, LF convention), self-test messages and
  channel names (`OPEN PRB`, `CAL ERR`, `EGT 1`…, `TIT2`, `CDT CRB`, `IND`, `OAT`), startup date/time/FULL/ID,
  `FUEL` 1 s then flashing `FILL? N`, reset to included at power-on.
- **Pilot programming list (p.33–34):** order, switch columns, defaults, OAT cal ±10 with skip behavior, EGT 1?
  resolution, HP-? / HPC (C8 = 125) / MAP cal ±3.0 with ADJUST, KF digit edit, ACCUM, GPS-C 0–8 (C7, matches p.46),
  DUMP N→NEW→ALL with END skipped after a dump, SAVE D?N/Y, END Y/N.
- **LTM programming (p.41):** TIME 2–500, MNTH, DAY, YEAR 80→79, HOUR, MIN zeroing seconds, ID edit, END. Factory
  TIT (p.38): from RATE (C13 acceptable), ORIG T-N/Y, CAL TIT ±975 with tap-lower/hold-raise.
- **Alarm limit list (p.43–44):** entry path (END + both-hold → `FAC LIM`), item order, display strings, ranges,
  stated steps, °F/°C defaults (p.42), BAT 12/24 V defaults, MAP 42.0 (C9), FUEL unit cycle without conversion,
  MAIN/AUX?/AUX/MIN/REM, CARB?/RECRD?, CYL/HP/EC (800 only), END → review.
- **EDM-711:** auto scan of primaries only with the switch disabled, manual scans all, no exclusion, RATE 1–9,
  `EGT-CHT` pre-display, R/Y lamp thresholds 45/25/100°F, STEP clears the digital alarm only (C11), primary limits
  locked.
- **Download:** serial DUMP via the PC with abort by both-hold. USB port `NEW`/`ALL` with countdown and `DONE`.
  Memory box `DUMPNEW`/`DUMPALL` with 0–100% and `DONE` (aside from finding 21).
- **Conflict register:** C1–C5 and C7–C14 resolutions are reasonable and correctly cited. C6 is acceptable with the
  caveat in finding 18.
