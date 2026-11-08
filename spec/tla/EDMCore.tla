------------------------------- MODULE EDMCore -------------------------------
(***************************************************************************)
(* The JPI EDM-800 mode logic of docs/02-SPEC.md (rev3.1) as a TLA+ state  *)
(* machine. Written from the specification (rule IDs in comments), not     *)
(* from the code, so it can judge the implementation independently.        *)
(*                                                                          *)
(* Abstraction                                                              *)
(*  - Inputs are gesture-level (STEP_TAP, LF_HOLD_3S, BOTH_HOLD_5S, ...).   *)
(*    Button-timing recognition (BTN-1..11) lies below this level.          *)
(*  - Untimed. Each timer is a discrete input: Timer = time passes until    *)
(*    the next short timer fires (self-test, banners, LEANEST, transfers);  *)
(*    TwoMin = the one-shot 2-minute switch (PWR-9); Expire(a) = a 10-minute*)
(*    alarm snooze runs out (ALM-7); Record / OffEnds / SnapEnds = an LTM    *)
(*    record is written (shows a pending SNAP), the OFF / SNAP overlay ends. *)
(*    Timing facts the spec guarantees are                                  *)
(*    encoded as enabling conditions (e.g. the 11 s power-up sequence never *)
(*    meets the 2-minute timer).                                            *)
(*  - Display text and numeric values are not modelled. The scan item only  *)
(*    matters for MAN-5 (STEP+LF on USD), which becomes nondeterminism.     *)
(*  - Programming sub-screens (OAT_CAL, ADJUST/HPC/MAP_CAL, KF_EDIT, LTM,   *)
(*    FACLIM) are outside this model: entering one is "out of scope".       *)
(*  - One state variable, st, a record. Succ(s, in) is the set of possible  *)
(*    next states, so the same definition drives model checking and judges  *)
(*    recorded implementation steps (MC_*.tla).                            *)
(***************************************************************************)
EXTENDS Naturals, Sequences, FiniteSets, TLC

CONSTANTS
  AlarmPri,   \* alarm ids in priority order (ALM-1), e.g. <<"OILH", "BATL">>
  Items,      \* the visible pilot-programming main list, in order (PGM-2)
  Inputs,     \* names of the inputs used in this run (subset of AllInputs)
  FF          \* fuel-flow option installed

None == "-"
Alarms == {AlarmPri[i] : i \in 1..Len(AlarmPri)}
Modes == {"OFF", "TANK", "POWERUP", "FILL", "MANUAL", "AUTO", "LF", "PGM", "USB"}
Scan == {"MANUAL", "AUTO"}
Normal == {"MANUAL", "AUTO", "LF"}                     \* where alarms are displayed (ALM-2, ALM-3)
PowerUp == <<"SEGMENTS", "COLUMNS", "DATE", "TIME", "FULL", "ID">>   \* PWR-3..6 (no failed probes)
SubScreenItems == {"OATU", "HPQ", "KF", "DUMP", "END"} \* BOTH_HOLD_5S on these leaves this model

ButtonIn == {"StepTap", "LfTap", "BothTap", "StepHold5", "LfHold3", "BothHold5"}
EnvIn == {"Timer", "TwoMin", "PowerOn", "PowerOnStep", "PowerOff", "UsbIn", "UsbOut", "Rise", "PeakFirst", "PeakAll",
          "Record", "OffEnds", "SnapEnds"}
AlarmIn == {"Raise", "Clear", "Expire"}
AllInputs == ButtonIn \cup EnvIn \cup AlarmIn
Events == {[g |-> n, a |-> None] : n \in Inputs \ AlarmIn} \cup {[g |-> n, a |-> x] : n \in Inputs \cap AlarmIn, x \in Alarms}

(***************************************************************************)
(* Alarms: the highest-priority active, un-suppressed alarm (ALM-2).       *)
(***************************************************************************)
Active(s) ==
  LET live == {i \in 1..Len(AlarmPri) : AlarmPri[i] \in s.cond \ (s.snoozed \cup s.off)}
  IN IF live = {} THEN None ELSE AlarmPri[CHOOSE i \in live : \A j \in live : i <= j]

(* Fields that do not matter in the current mode get fixed values, so equal behaviour means equal states. *)
Norm(s) ==
  LET m == s.mode IN
  [s EXCEPT
    !.sub     = IF m \in {"OFF", "MANUAL", "AUTO"} THEN None ELSE s.sub,
    !.ret     = IF m \in {"PGM", "USB"} THEN s.ret ELSE None,
    !.method  = IF m = "LF" /\ s.sub \in {"ARMED", "ACTIVE"} THEN s.method ELSE None,
    !.fillCtx = IF m = "FILL" THEN s.fillCtx ELSE None,
    !.fillSel = IF m = "FILL" /\ s.sub = "SEL" THEN s.fillSel ELSE None,
    !.fuelQ   = IF m = "PGM" /\ s.sub = "FUEL" THEN s.fuelQ ELSE None,
    !.dumpQ   = IF m = "PGM" /\ s.sub = "DUMP" THEN s.dumpQ ELSE None,
    !.endQ    = IF m = "PGM" /\ s.sub = "END" THEN s.endQ ELSE None,
    !.fired   = IF m = "OFF" THEN FALSE ELSE s.fired,      \* PWR-10: volatile state is reset at power-on
    !.lop     = IF m = "OFF" THEN FALSE ELSE s.lop,
    !.view    = IF m = "OFF" THEN "P" ELSE s.view,
    !.snoozed = IF m = "OFF" THEN {} ELSE s.snoozed,
    !.off     = IF m = "OFF" THEN {} ELSE s.off,
    !.mark    = IF m = "OFF" THEN FALSE ELSE s.mark,
    !.ovlOff  = IF m = "OFF" THEN FALSE ELSE s.ovlOff,
    !.ovlSnap = IF m = "OFF" THEN FALSE ELSE s.ovlSnap]

(* The displayed alarm (ALM-2/3) and the remote alarm light (ALM-8) are part of the state, so that       *)
(* implementation snapshots are checked for them too. The digital overlays take precedence OFF > SNAP >   *)
(* alarm (section 5, ALM-5, LF-14): while OFF or SNAP is shown the alarm is not displayed; the light is.  *)
Fix(s) ==
  LET n == Norm(s) IN
  [n EXCEPT !.shown = IF n.mode \in Normal /\ ~n.ovlOff /\ ~n.ovlSnap THEN Active(n) ELSE None,
            !.light = n.mode # "OFF" /\ Active(n) # None]

(***************************************************************************)
(* Helpers                                                                  *)
(***************************************************************************)
Toggle(v, a, b) == IF v = a THEN b ELSE a
StartSelfTest(s) == [s EXCEPT !.mode = "POWERUP", !.sub = PowerUp[1]]
Fresh(s) == [s EXCEPT !.fired = FALSE, !.lop = FALSE, !.view = "P", !.snoozed = {}, !.off = {},   \* PWR-10
                      !.mark = FALSE, !.ovlOff = FALSE, !.ovlSnap = FALSE]
EndPowerUp(s) == [s EXCEPT !.mode = IF s.fired THEN "AUTO" ELSE "MANUAL", !.sub = None]        \* PWR-7, PWR-8, PWR-9
ExitFill(s) == IF s.fillCtx = "powerup" THEN EndPowerUp(s)
               ELSE [s EXCEPT !.mode = "MANUAL", !.sub = None]                                \* FUEL-6
EnterLF(s) == IF s.lop THEN [s EXCEPT !.mode = "LF", !.sub = "LOP_REVIEW"]                   \* LF-1
              ELSE [s EXCEPT !.mode = "LF", !.sub = "ARMED", !.method = "R"]
EnterPgm(s) == [s EXCEPT !.mode = "PGM", !.sub = "BANNER", !.ret = s.mode]                  \* PGM-1
GotoItem(s, it) == [s EXCEPT !.mode = "PGM", !.sub = it, !.fuelQ = "N", !.dumpQ = "N", !.endQ = "Y"]  \* PGM-3 defaults
Leave(s) == [s EXCEPT !.mode = s.ret, !.sub = None]                                        \* PGM-4, DL-1
NextItem(it) == LET i == CHOOSE k \in 1..Len(Items) : Items[k] = it
                IN IF i = Len(Items) THEN Items[1] ELSE Items[i + 1]
NextSel(s) == CASE s.fillSel = "N"    -> "MAIN"                                            \* FUEL-2
                [] s.fillSel = "MAIN" -> (IF s.auxY THEN "FULL" ELSE "PLUS")
                [] s.fillSel = "FULL" -> "PLUS"
                [] s.fillSel = "PLUS" -> "N"

(***************************************************************************)
(* Buttons. Anything a mode does not list is ignored ({s}).                *)
(***************************************************************************)
TankBtn(s, g) ==                                                                            \* PWR-2
  CASE g = "StepTap" ->
         {(CASE s.sub = "MAIN" -> [s EXCEPT !.sub = "AUXQ"]
             [] s.sub = "AUXQ" -> (IF s.auxY THEN [s EXCEPT !.sub = "AUX"] ELSE StartSelfTest(s))
             [] s.sub = "AUX"  -> StartSelfTest(s))}
    [] g = "LfTap" /\ s.sub = "AUXQ" -> {[s EXCEPT !.auxY = ~s.auxY]}
    [] OTHER -> {s}

FillBtn(s, g) ==                                                                            \* FUEL-2..4
  CASE s.sub = "SEL" /\ g = "LfTap"   -> {[s EXCEPT !.fillSel = NextSel(s)]}
    [] s.sub = "SEL" /\ g = "StepTap" -> {(IF s.fillSel = "PLUS" THEN [s EXCEPT !.sub = "ADD"] ELSE ExitFill(s))}
    [] s.sub = "ADD" /\ g = "StepTap" -> {ExitFill(s)}
    [] OTHER -> {s}

ManualBtn(s, g) ==
  CASE g = "LfTap"     -> {EnterLF(s)}                                                      \* MAN-4
    [] g = "LfHold3"   -> {[s EXCEPT !.view = Toggle(s.view, "P", "N")]}                     \* MAN-4
    [] g = "BothHold5" -> {EnterPgm(s), s}                                                  \* MAN-5: stays on USD
    [] OTHER           -> {s}                                 \* MAN-1..3: the scan item is not modelled

AutoBtn(s, g) ==
  CASE g = "StepTap"   -> {[s EXCEPT !.mode = "MANUAL"]}                                    \* AUTO-3
    [] g = "LfTap"     -> {EnterLF(s)}                                                      \* AUTO-4
    [] g = "LfHold3"   -> {[s EXCEPT !.view = Toggle(s.view, "P", "N")]}                     \* AUTO-5
    [] g = "BothHold5" -> {EnterPgm(s)}                                                     \* AUTO-6
    [] OTHER           -> {s}                                                               \* MODE-1

LfBtn(s, g) ==                                                                              \* LF-18 table
  CASE g = "StepTap" -> {[s EXCEPT !.mode = "AUTO", !.sub = None]}                          \* LF-13
    [] g = "LfTap" /\ s.sub = "LOP_DONE"   -> {[s EXCEPT !.sub = "LOP_REVIEW"]}             \* LF-12
    [] g = "LfTap" /\ s.sub = "LOP_REVIEW" -> {[s EXCEPT !.sub = "ARMED", !.method = "R", !.lop = FALSE]}
    [] g = "BothHold5" /\ s.sub = "ARMED"  -> {[s EXCEPT !.method = Toggle(s.method, "R", "L")]}  \* LF-3
    [] g = "BothTap" \/ (g = "LfTap" /\ s.sub \in {"ARMED", "ACTIVE", "LEANEST", "ROP_SET"})
                       -> {[s EXCEPT !.mark = TRUE]}             \* LF-14, LF-15: request a mark (SNAP later)
    [] OTHER -> {s}                              \* LF held, LF_HOLD_3S (LF-16)

ItemStep(s) ==
  CASE s.sub = "FUEL" /\ s.fuelQ = "Y" -> [s EXCEPT !.mode = "FILL", !.sub = "SEL", !.fillCtx = "program", !.fillSel = "N"]  \* FUEL-1
    [] s.sub = "DUMP" /\ s.dumpQ # "N" -> [s EXCEPT !.sub = "DUMP_XFER"]                    \* PGM-10
    [] s.sub = "END" -> (IF s.endQ = "Y" THEN Leave(s) ELSE GotoItem(s, Items[1]))           \* PGM-2, PGM-4
    [] OTHER -> GotoItem(s, NextItem(s.sub))                                                \* PGM-3

ItemLf(s) ==
  CASE s.sub = "FUEL" -> [s EXCEPT !.fuelQ = Toggle(s.fuelQ, "N", "Y")]
    [] s.sub = "DUMP" -> [s EXCEPT !.dumpQ = (CASE s.dumpQ = "N" -> "NEW" [] s.dumpQ = "NEW" -> "ALL" [] OTHER -> "N")]
    [] s.sub = "END"  -> [s EXCEPT !.endQ = Toggle(s.endQ, "Y", "N")]
    [] OTHER -> s                                                                           \* values are not modelled

PgmBtn(s, g) ==
  CASE s.sub = "BANNER" -> {s}                                                              \* PGM-1: inputs ignored
    [] s.sub = "DUMP_XFER" -> (IF g = "BothHold5" THEN {GotoItem(s, "DUMP")} ELSE {s})      \* PGM-10: abort
    [] s.sub = "SAVE_D" -> (IF g = "StepTap" THEN {Leave(s)} ELSE {s})                      \* PGM-10
    [] g = "StepTap" -> {ItemStep(s)}
    [] g = "LfTap" -> {ItemLf(s)}
    [] g = "BothHold5" /\ s.sub \in SubScreenItems -> {}                                   \* out of scope
    [] OTHER -> {s}

UsbBtn(s, g) == IF s.sub = "MENU" /\ g = "StepTap" THEN {[s EXCEPT !.sub = "XFER"]} ELSE {s}  \* DL-1

ButtonSucc(s, g) ==
  IF g \in {"StepTap", "StepHold5"} /\ s.shown # None
  THEN (IF g = "StepTap" THEN {[s EXCEPT !.snoozed = s.snoozed \cup {s.shown}]}           \* ALM-4, ALM-6
        ELSE {[s EXCEPT !.off = s.off \cup {s.shown}, !.ovlOff = TRUE]})                    \* ALM-5: OFF shown
  ELSE CASE s.mode = "TANK"   -> TankBtn(s, g)
         [] s.mode = "FILL"   -> FillBtn(s, g)
         [] s.mode = "MANUAL" -> ManualBtn(s, g)
         [] s.mode = "AUTO"   -> AutoBtn(s, g)
         [] s.mode = "LF"     -> LfBtn(s, g)
         [] s.mode = "PGM"    -> PgmBtn(s, g)
         [] s.mode = "USB"    -> UsbBtn(s, g)
         [] OTHER             -> {s}                                                        \* OFF, POWERUP

(***************************************************************************)
(* Environment: time, power, the USB drive, the engine, alarm conditions.  *)
(* {} = the input cannot happen in this state.                             *)
(***************************************************************************)
TimerStep(s) ==
  CASE s.mode = "POWERUP" ->
         (LET i == CHOOSE k \in 1..Len(PowerUp) : PowerUp[k] = s.sub IN
          IF i < Len(PowerUp) THEN [s EXCEPT !.sub = PowerUp[i + 1]]
          ELSE IF FF THEN [s EXCEPT !.mode = "FILL", !.sub = "BANNER", !.fillCtx = "powerup"]  \* PWR-7
          ELSE EndPowerUp(s))
    [] s.mode = "FILL" /\ s.sub = "BANNER"   -> [s EXCEPT !.sub = "SEL", !.fillSel = "N"]    \* PWR-7
    [] s.mode = "LF" /\ s.sub = "LEANEST"    -> [s EXCEPT !.sub = "ROP_SET"]                 \* LF-7
    [] s.mode = "PGM" /\ s.sub = "BANNER"    -> GotoItem(s, Items[1])                        \* PGM-1
    [] s.mode = "PGM" /\ s.sub = "DUMP_XFER" -> [s EXCEPT !.sub = "SAVE_D"]                  \* PGM-10
    [] s.mode = "USB" /\ s.sub = "XFER"      -> [s EXCEPT !.sub = "DONE"]                    \* DL-1
    [] OTHER -> s                                                    \* no short timer pending

TwoMinStep(s) ==                                                                            \* PWR-9
  IF s.mode = "MANUAL" THEN [s EXCEPT !.mode = "AUTO", !.fired = TRUE]
  ELSE [s EXCEPT !.fired = TRUE]               \* power-up sequence then ends in AUTO; elsewhere no change

UsbInStep(s) ==                                                                             \* DL-1, MODE-1
  IF s.mode \in Scan THEN [s EXCEPT !.usbIn = TRUE, !.mode = "USB", !.sub = "MENU", !.ret = s.mode]
  ELSE [s EXCEPT !.usbIn = TRUE]
UsbOutStep(s) ==
  IF s.mode = "USB" THEN [s EXCEPT !.usbIn = FALSE, !.mode = s.ret, !.sub = None]
  ELSE [s EXCEPT !.usbIn = FALSE]

EnvSucc(s, ev) ==
  LET g == ev.g IN
  CASE g = "PowerOn"     -> (IF s.mode = "OFF" THEN {Fresh(StartSelfTest(s))} ELSE {})                \* PWR-1
    [] g = "PowerOnStep" -> (IF s.mode = "OFF" /\ FF
                             THEN {Fresh([s EXCEPT !.mode = "TANK", !.sub = "MAIN"])} ELSE {})          \* PWR-1
    [] g = "PowerOff"    -> (IF s.mode # "OFF" THEN {[s EXCEPT !.mode = "OFF"]} ELSE {})               \* PWR-11
    [] g = "Timer"       -> {TimerStep(s)}
    [] g = "TwoMin"      -> (IF s.mode \notin {"OFF", "POWERUP"} /\ ~s.fired THEN {TwoMinStep(s)} ELSE {})
    [] g = "UsbIn"       -> (IF ~s.usbIn THEN {UsbInStep(s)} ELSE {})
    [] g = "UsbOut"      -> (IF s.usbIn THEN {UsbOutStep(s)} ELSE {})
    [] g = "Rise"        -> (IF s.mode = "LF" /\ s.sub = "ARMED"
                             THEN {[s EXCEPT !.sub = "ACTIVE"]} ELSE {})                                \* LF-4
    [] g = "PeakFirst"   -> (IF s.mode = "LF" /\ s.sub = "ACTIVE" /\ s.method = "R"
                             THEN {[s EXCEPT !.sub = "LEANEST"]} ELSE {})                               \* LF-7
    [] g = "PeakAll"     -> (IF s.mode = "LF" /\ s.sub = "ACTIVE" /\ s.method = "L"
                             THEN {[s EXCEPT !.sub = "LOP_DONE", !.lop = TRUE]} ELSE {})                \* LF-10, LF-12
    [] g = "Raise"       -> (IF ev.a \notin s.cond THEN {[s EXCEPT !.cond = s.cond \cup {ev.a}]} ELSE {})
    [] g = "Clear"       -> (IF ev.a \in s.cond THEN {[s EXCEPT !.cond = s.cond \ {ev.a}]} ELSE {})
    [] g = "Expire"      -> (IF ev.a \in s.snoozed
                             THEN {[s EXCEPT !.snoozed = s.snoozed \ {ev.a}]} ELSE {})                  \* ALM-7
    [] g = "Record"      -> (IF s.mode # "OFF" /\ s.mark                                                \* LF-14: the next
                             THEN {[s EXCEPT !.mark = FALSE, !.ovlSnap = TRUE]} ELSE {})                \* record shows SNAP
    [] g = "OffEnds"     -> (IF s.ovlOff THEN {[s EXCEPT !.ovlOff = FALSE]} ELSE {})                   \* after 1500 ms
    [] g = "SnapEnds"    -> (IF s.ovlSnap THEN {[s EXCEPT !.ovlSnap = FALSE]} ELSE {})                 \* after 2000 ms

(***************************************************************************)
(* The machine                                                              *)
(***************************************************************************)
Succ(s, ev) == {Fix(t) : t \in (IF ev.g \in ButtonIn THEN ButtonSucc(s, ev.g) ELSE EnvSucc(s, ev))}

(* Inputs whose effect lies outside this model (programming sub-screens) *)
OutOfScope(s, ev) == s.mode = "PGM" /\ s.sub \in SubScreenItems /\ ev.g = "BothHold5"

OffState == Fix([mode |-> "OFF", sub |-> None, ret |-> None, method |-> None, lop |-> FALSE, view |-> "P",
                 fired |-> FALSE, auxY |-> FALSE, fillCtx |-> None, fillSel |-> None, fuelQ |-> None,
                 dumpQ |-> None, endQ |-> None, usbIn |-> FALSE, cond |-> {}, snoozed |-> {}, off |-> {},
                 mark |-> FALSE, ovlOff |-> FALSE, ovlSnap |-> FALSE, shown |-> None, light |-> FALSE])

VARIABLE st
Init == st = OffState
Next == \E ev \in Events : \E t \in Succ(st, ev) : st' = t
Spec == Init /\ [][Next]_st

(***************************************************************************)
(* Properties                                                               *)
(***************************************************************************)
TypeOK ==
  /\ st.mode \in Modes
  /\ st.cond \subseteq Alarms /\ st.snoozed \subseteq Alarms /\ st.off \subseteq Alarms
  /\ st.shown \in Alarms \cup {None}
  /\ st.light \in BOOLEAN /\ st.lop \in BOOLEAN /\ st.fired \in BOOLEAN /\ st.usbIn \in BOOLEAN
  /\ st.mark \in BOOLEAN /\ st.ovlOff \in BOOLEAN /\ st.ovlSnap \in BOOLEAN

ReturnModeKnown == st.mode \in {"PGM", "USB"} => st.ret \in Scan          \* PGM-4, DL-1 always have a place to return
AlarmOnlyWhereShown == st.shown # None => st.mode \in Normal              \* ALM-3
LopResultsOnlyFromLop == st.mode = "LF" /\ st.sub = "LOP_DONE" => st.lop    \* LF-12

(* A pilot who keeps tapping STEP, waits, unplugs the USB drive and powers on, always gets back to the scan  *)
(* (AUTO or MANUAL) - checked from every state the implementation reached (MC_escape.tla).                  *)
PilotIn == {"StepTap", "Timer", "UsbOut", "PowerOn", "Record", "OffEnds", "SnapEnds"}   \* waiting includes overlays ending
PilotNext == \E ev \in Events : ev.g \in PilotIn /\ \E t \in Succ(st, ev) : st' = t
BackToScan == <>(st.mode \in Scan)
=============================================================================
