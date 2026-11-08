# Evaluation: TLA+ for the EDM state-machine specification

Question: can TLA+ make the state-machine specification (`docs/02-SPEC.md`) more formal, and can it be used to check
the implementation (`src/edm/machine.js`)?

**Answer: yes, for the mode and alarm logic, and it paid off on the first real run.**
- **Real behaviour bug found:** STEP could silence an alarm the pilot hadn't seen yet, hidden under the `OFF`/`SNAP`
  confirmation. It is now fixed and has regression tests.
- **Gap in the first formal model found:** the `OFF`/`SNAP` overlays were missing.
- **Gaps in the checking harness found and fixed.**
- **Final result:** after the fixes, the implementation and the formal spec agree exactly on two models (6 196 and
  18 884 states), and a liveness property holds.
- **Not a fit:** display text, numbers and millisecond timing.

## What the existing verification gave — and didn't

| Before | What TLA+ adds |
|---|---|
| `docs/02-SPEC.md`: prose rules with IDs, interpretation `[I]` and conflict `[C]` registers | A `Succ(state, input)` function must answer every state/input pair. Writing it surfaced the overlay rule that the first model had left out. |
| 598 hand-written unit tests; each checks chosen sequences | Exhaustive: every interleaving of inputs within the model, e.g. an alarm raised, snoozed, covered by SNAP, then STEP, in every mode. That's how the bug was found; no unit test had that sequence. |
| The state-machine map (`src/edm/explore.js`) discovers what the code does | It can't say whether the code is right. Here the code is judged against an independent spec, in both directions. |
| — | Global properties: invariants over all reachable states, and liveness. |

## What was built (`spec/tla/`, `tools/`)

### `EDMCore.tla` — the formal spec (272 lines)

Written from `docs/02-SPEC.md`, not the code; every clause cites its rule ID.

- **State:** one record holding:
  - mode and sub-state; the mode to return to;
  - LeanFind method and stored lean-of-peak results;
  - view; whether the 2-minute switch has fired;
  - AUX tank setting; fuel-fill context/selection; FUEL?/DUMP?/END toggles; USB drive present;
  - alarm conditions, snoozed alarms, alarms off for the flight;
  - pending data mark and the `OFF`/`SNAP` overlays;
  - the **displayed alarm** and the **alarm light** (ALM-2/3/8 and the overlay precedence OFF > SNAP > alarm).
- **Inputs:**
  - gestures: `StepTap`, `LfTap`, `BothTap`, `StepHold5`, `LfHold3`, `BothHold5`;
  - time: `Timer`, `TwoMin`, `Expire(a)`, `Record`, `OffEnds`, `SnapEnds`;
  - power: `PowerOn`, `PowerOnStep`, `PowerOff`;
  - USB: `UsbIn`, `UsbOut`;
  - engine: `Rise`, `PeakFirst`, `PeakAll`;
  - alarm conditions: `Raise(a)`, `Clear(a)`.
- **Behaviour:** `Succ(s, input)` is the set of allowed next states. The same definition drives model checking and
  judges implementation steps.
- **Properties:**
  - type correctness;
  - programming and USB always have a mode to return to;
  - an alarm is displayed only in Manual/Automatic/LeanFind (ALM-3);
  - lean-of-peak results exist only after a lean-of-peak search (LF-12);
  - liveness `BackToScan`: from every reachable state, a pilot who keeps tapping STEP and waiting (and unplugs or powers
    on if needed) gets back to Manual or Automatic.

**Abstraction choices** (each documented in the module header):
- **Gesture level.** Button-timing recognition (BTN-*) is covered by the unit tests.
- **Untimed.** Each timer is an input. Timing guarantees from the spec become enabling conditions; for example, the
  2-minute switch can't fire during the 11-second self-test.
- **Not modelled:** display text, values and the scan item. MAN-5 (STEP+LF on USD) becomes nondeterminism.
- **Out of scope:** the programming sub-screens.

### `tools/tla-conformance.mjs` — the implementation, observed (359 lines)

- **Abstraction function:** `alpha(edm)` maps the real machine to the spec's record. The displayed alarm is read from
  the **display output**, not from internals.
- **Exploration:**
  - every spec input is applied to every implementation state reached;
  - several concrete variants are kept per abstract state: every scan item, and off states that differ in hidden data;
  - gestures go through the machine's own press handling.
- **Output:** `ImplGraph_<model>.tla` for TLC.

### `MC_*.tla` — TLC as the judge

| Check | Catches |
|---|---|
| Every implementation state equals `Fix(state)` | Wrong displayed alarm or light; inconsistent state |
| Every implementation step ∈ `Succ` (soundness) | The code does something the spec forbids |
| Every `Succ` step taken by the implementation (completeness) | The code lacks something the spec requires, or the spec is wrong |
| Model-check the spec with invariant `st ∈ ImplReached` | A spec-reachable state the code never reaches, with the input trace |
| `MC_escape_*`: `BackToScan` under weak fairness | A trap the pilot can't get out of |

Run with `npm run tla` (needs Java 11+ and `tla2tools.jar` v1.7.4).

## Results

### Final run (fixed implementation)

| Model | Spec states = implementation states | Steps checked | Mismatches | Invariants | Liveness | Time (explore + TLC) |
|---|---|---|---|---|---|---|
| `modes` (all mode logic, no alarms) | 6 196 | 63 256 | 0 | hold | holds | 43 s + 4 s |
| `alarms` (OILH + BATL, priority, snooze, OFF, expiry, overlays) | 18 884 | 190 068 | 0 | hold | holds | 134 s + 6 s |

"Spec states = implementation states" means the spec and the code reach exactly the same set of abstract states.

### What the process found

1. **Implementation bug: STEP silenced an alarm the pilot hadn't seen.**
   - **The rule:** ALM-6 says STEP is captured for alarm acknowledgement "if an alarm is displayed".
   - **The bug:** the code checked an internal "alarm to display" field that ignores the `OFF` and `SNAP` confirmations
     covering the display.
   - **The scenario:** hold STEP to switch off alarm A. For the 1.5 s that `OFF` shows, alarm B becomes active
     underneath, and a STEP tap snoozed B, unseen. During a LeanFind mark (`SNAP`), STEP silenced the hidden alarm
     instead of leaving LeanFind.
   - **Fix:** `_visibleAlarm()` in `machine.js`; ALM-6 clarified in the spec (rev3.2); three regression tests in
     `test/alarms.test.mjs`. Two of them fail on the old code.
2. **Gap in the first formal model: the OFF/SNAP overlays.** The prose spec defines the precedence (OFF > SNAP > alarm),
   but my first TLA+ model left it out. It surfaced only once the harness read the displayed alarm from the real display
   rather than from internals.
3. **Harness weaknesses**, all found by planting bugs or reading mismatches, all fixed:
   - Manual-mode exploration never reached the USD reading, so the MAN-5 branch was untested. Variants are now told
     apart by scan item.
   - The abstraction blanks data while the instrument is off, so "off with a stale snooze" and "off without" were
     explored as one state and a planted PWR-10 bug was missed. Off states are now told apart by that data.
   - The harness filtered the displayed alarm by mode, which hid a planted ALM-3 bug. It now reads the display output.
   - The harness copied the press bookkeeping instead of calling it, so it kept the old behaviour after the fix. Presses
     now go through the machine.
   - Timing artifacts: an LTM record that was already due showed `SNAP` instantly. The recording boundary is now its own
     input.

### Does the check have teeth? (`tools/tla-mutants.mjs`)

Ten bugs were planted one at a time (patched in memory) and judged by TLC:
- **Mode logic:** LeanFind exit to the wrong mode, programming exit to the wrong mode, the 2-minute switch ignored, USB
  accepted in LeanFind, program fuel-fill exiting to the wrong mode.
- **Alarms:** acknowledging an alarm also moving the display on, the alarm light ignoring snoozes, reversed priority,
  snoozes surviving power-off, an alarm shown during programming.

With the first harness, 8 of 10 were caught; the two misses led to the two harness fixes about hidden off-state data
and the mode-filtered alarm. With the final harness, **all 10 are caught**:

| Rule | Planted bug | TLC report |
|---|---|---|
| LF-13 | STEP in LeanFind returns to Manual instead of Automatic | 512 forbidden / 512 missing steps |
| PGM-4 | leaving programming always returns to Automatic | 256 / 256 |
| PWR-9 | the 2-minute switch to Automatic doesn't happen in Manual | 64 / 64 |
| MODE-1 | a USB drive starts a download from LeanFind | 256 / 256 |
| FUEL-6 | a fuel entry started from programming exits to Automatic | 448 / 448 |
| ALM-4 | tapping STEP on an alarm also moves the display on or leaves the mode | 132 / 132 |
| ALM-8 | the alarm light stays on while the alarm is snoozed | 9 072 bad states |
| ALM-2 | the lowest-priority alarm is shown first | 16 bad states, 166 / 166 steps |
| PWR-10 | alarm snoozes survive a power cycle | 3 forbidden steps |
| ALM-3 | the active alarm flashes during programming | 4 080 bad states |

## Cost and fit

- **Size:**
  - spec 272 lines;
  - harness 359 lines plus 97 for planted bugs;
  - generated graphs 2.9 MB and 9.2 MB (regenerated by `npm run tla`, not edited).
- **Run time:** about 3–4 minutes for everything; most of it is exploring the JS implementation. TLC itself takes
  seconds.
- **Maintenance:**
  - a rule change means editing the matching `Succ` clause;
  - `alpha()` reads the machine's state, so refactors of `machine.js` must keep it in step (any slip shows up
    immediately as mismatches).
- **The lesson worth keeping:** a conformance check is only as good as its harness.
  - Abstract by what is observable.
  - Exercise the real code paths.
  - Make sure exploration covers the hidden state the abstraction drops.
  - Prove the check has teeth by planting bugs.
- **Where TLA+ adds little here:** display formats, analog bar maths, fuel arithmetic, millisecond gesture timing. The
  unit tests and the explorer cover these better.
- **Alternatives:**
  - **Quint** (same semantics, TypeScript-like syntax) would ease maintenance for JS developers.
  - **fast-check model-based testing** keeps everything in JS but samples instead of exhausting, and has no temporal
    properties.

## Recommendation

Keep it:
- treat `EDMCore.tla` as the normative statement of the mode/alarm rules (§5, §6, §7.3–7.4, §9, §10, §11, §12 main
  list, §14);
- run `npm run tla` before releases or in CI;
- re-run `tools/tla-mutants.mjs` after harness changes.

Grow the alarm model only with representative alarms: each one multiplies the state space by about 8.
