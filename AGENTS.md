# Agent notes — edm800-sim

JPI EDM-800 trainer: an EDM state machine (`src/edm/`), a Cessna 177B / O-360 engine model (`src/sim/`), and the web
simulator (`web/`, bundled into `dist/edm800-simulator.html`). See `README.md` for the full layout.

## When a rule changes, change the formal spec too

`docs/02-SPEC.md` is the behavioural spec. Its mode and alarm rules are also stated formally in
`spec/tla/EDMCore.tla`, and `npm run tla` checks the implementation against that TLA+ model. The three must stay in
step.

**Covered rules:** power-up/off (§6, PWR-*), AUTO/MANUAL (§7.3–7.4, AUTO-*, MAN-*, MODE-1), alarms (§9, ALM-*),
LeanFind (§10, LF-*), fuel fill (§11, FUEL-*), the programming main menu (§12, PGM-1..4, PGM-10) and USB-port download
(§14, DL-1).

**If you change one of these rules:**
1. Edit the rule in `docs/02-SPEC.md` and tag the revision.
2. Edit the matching clause in `spec/tla/EDMCore.tla`. Each clause cites its rule ID in a comment, so search for it.
3. Change `src/edm/machine.js` and add or adjust unit tests in `test/`.
4. Run `npm run tla`. It must end with 0 bad states, 0 forbidden steps, 0 missing steps, and "No error has been found"
   for all four models.

A rule changed in only one place shows up as mismatches in `npm run tla`. That's the reminder, not something to
silence by editing the generated files.

**Not covered by the TLA+ model:** display formats (§7.2), the analog display (§8), numeric values and ranges,
button-gesture timing (§4, BTN-*), programming sub-screens (PGM-5..9, PGM-11..12, §12.1), the memory box (DL-2) and
the EDM-711 (§13). The unit tests cover these.

## Keep the checking harness honest

- `tools/tla-conformance.mjs` reads machine internals in `alpha()`. If you refactor the state machine's state, update
  `alpha()`.
- Read observable behaviour (display output), not internal bookkeeping.
- Drive inputs through the machine's real code paths; don't copy them into the harness.
- After any harness change, run `node tools/tla-mutants.mjs`: all 10 planted bugs must be caught.

## Commands

| Command | When |
|---|---|
| `npm test` | Unit tests (EDM, engine, Explain, state-machine map), ≈12 s |
| `npm run tla` | TLA+ check (Java 11+, `tla2tools.jar` in `~/.cache/tlaplus/`), ≈4 min |
| `npm run test:visual` | Playwright visual/responsive tests on 9 devices, ≈3 min; `test:visual:update` after an intended UI change |
| `npm run verify` | All of the above; run before a release |
| `npm run build` | Rebuild `dist/edm800-simulator.html` after any change under `src/` or `web/` |

## Don't hand-edit

`src/sim/fitted.js` (from `npm run fit`), `spec/tla/ImplGraph_*.tla` (from `npm run tla`), `dist/*`, and
`test/visual/__screenshots__/` (from `npm run test:visual:update`).
