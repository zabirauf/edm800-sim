// Training content: context help per state, guided lessons, and a diagnosis trainer.
// Page references are to the JPI Pilot's Guide EDM-700/800 Rev W.

const ALARM_HELP =
  'An alarm is flashing: tap STEP → silence it for 10 minutes; hold STEP 5 s until OFF → silenced for the rest of the flight (p.25).';

export const HELP = [
  ['OFF', 'Instrument off', [
    'Turn on the Power switch.',
    'Holding STEP while turning power on opens the tank-capacity setup (MAIN / AUX) — p.46.',
  ]],
  ['TANK_SETUP', 'Initial tank capacity (p.46)', [
    'Tap STEP → next item (MAIN= → AUX? → AUX=). After the last item the self-test starts.',
    'Tap LF → decrease / toggle Y-N. Hold LF → increase (auto-repeat).',
  ]],
  ['SELFTEST', 'Power-up self-test (p.11)', [
    'All segments light for a few seconds — check for dead segments.',
    'Each column is tested in sequence. A bad probe shows OPEN PRB or CAL ERR and the channel name.',
  ]],
  ['STARTUP_INFO', 'Long-term memory info (p.31)', ['Date, time, memory FULL %, then the aircraft ID.']],
  ['FUEL_FILL.BANNER', 'Start-up fuel (p.26)', ['FUEL is shown for one second, then FILL? N flashes until you press a button.']],
  ['FUEL_FILL.SEL', 'Start-up fuel (p.26–27)', [
    'FILL? N + tap STEP → no change to fuel on board.',
    'Tap LF cycles: FILL <main> → FILL <main+aux> (if aux tanks) → FILL+ → FILL? N.',
    'Tap STEP on FILL <n> → fuel remaining set to n; fuel USED resets to 0 (unless ACCUM).',
    'Tap STEP on FILL+ → enter how much you added.',
  ]],
  ['FUEL_FILL.ADD', 'Fuel added (p.27)', [
    'Hold LF → count up (stops at full tanks). Tap LF → count down (negative = fuel removed).',
    'Tap STEP → done.',
  ]],
  ['AUTO', 'Automatic mode (p.7, p.11)', [
    'Parameters are scanned automatically every RATE seconds (default 4).',
    'Tap STEP → Manual mode (freezes on the current parameter).',
    'Tap LF → LeanFind.',
    'Hold LF 3 s → toggle Percentage / Normalize view (NRM).',
    'Hold STEP + LF 5 s → Pilot programming.',
  ]],
  ['MANUAL', 'Manual mode (p.8, p.12)', [
    'Tap STEP → next parameter. Hold STEP → step backwards rapidly.',
    'Tap STEP + LF together → exclude / include this parameter from the Automatic scan (decimal point before the label = excluded).',
    'Tap LF then tap STEP → back to Automatic.',
    'Hold LF 3 s → toggle Percentage / Normalize view.',
    'Hold STEP + LF 5 s → Pilot programming. On USD: resets fuel used to .0 instead.',
  ]],
  ['LEANFIND.ARMED', 'LeanFind armed (p.13)', [
    'Lean the mixture smoothly, about 10°F per second, without pausing.',
    'LeanFind becomes active after a 15°F EGT rise (dot starts blinking).',
    'Before leaning: hold STEP + LF 5 s to toggle LEAN R (rich of peak) / LEAN L (lean of peak).',
    'Tap STEP → cancel, back to Automatic. Tap STEP + LF → SNAP (mark data record).',
  ]],
  ['LEANFIND.ACTIVE', 'LeanFind active (p.14–16)', [
    'Keep leaning without pausing. The display shows the hottest cylinder and LF (or fuel flow).',
    'Rich of peak: the first cylinder to peak is found automatically → LEANEST.',
    'Lean of peak: each cylinder number flashes as it peaks; columns invert (5°F per segment below peak).',
    'Tap STEP → abandon, back to Automatic.',
  ]],
  ['LEANFIND.LEANEST', 'Peak found (p.15)', ['LEANEST shows for 2 s, then the leanest cylinder is locked into the display with SET.']],
  ['LEANFIND.ROP_SET', 'Set the mixture (p.13)', [
    'The flashing column is the first cylinder to peak; its EGT is shown with SET (or fuel flow).',
    'Hold LF → its peak EGT (PK).',
    'Enrich slowly: back to peak = best economy; ~100°F rich of peak = best power.',
    'Tap STEP → Automatic.',
  ]],
  ['LEANFIND.LOP_DONE', 'Lean of peak complete (p.16)', [
    'All cylinders have peaked: the last one to peak flashes. Display = degrees below its peak and fuel flow.',
    'Hold LF → peak EGT of the first (richest) cylinder and the GAMI spread (fuel-flow difference first → last).',
    'Tap STEP → resume scanning. Tap LF → inverted bar graph (review).',
  ]],
  ['LEANFIND.LOP_REVIEW', 'Lean of peak review (p.16)', [
    'Inverted bar graph for fine tuning. Hold LF → richest peak EGT and GAMI spread.',
    'Tap LF again → start a new LeanFind. Tap STEP → Automatic.',
  ]],
  ['PROGRAM.BANNER', 'Pilot programming (p.33)', ['PROGRAM shows for 2 seconds, then the first item.']],
  ['PROGRAM.ITEM.FUEL', 'FUEL? (p.26, p.33)', ['Tap LF → FUEL? Y, then tap STEP → refuel entry (FILL?). Tap STEP with N → next item.']],
  ['PROGRAM.ITEM.RATE', 'Scan rate (p.33)', [
    'Seconds per parameter in Automatic mode. Tap LF → decrease (wraps 0 → 9), hold LF → increase. 0 = no automatic scan.',
    'Hold STEP + LF 5 s → factory-original TIT probe setup (p.38).',
  ]],
  ['PROGRAM.ITEM.OATU', 'OAT units (p.33)', ['Tap LF → °F / °C. Hold STEP + LF 5 s → OAT calibration (±10°). Tap STEP skips calibration.']],
  ['PROGRAM.OAT_CAL', 'OAT calibration (p.34)', ['Tap LF −1°, hold LF +1° (range ±10). Tap STEP → next item.']],
  ['PROGRAM.ITEM.EGT1', 'EGT resolution (p.34)', ['Y = 1° digital EGT resolution; N = 10° (easier to read). Tap LF to toggle.']],
  ['PROGRAM.ITEM.HPQ', '%HP or RPM (p.34–35)', [
    'Y = %HP in the upper window; N = RPM. Tap LF to toggle.',
    'With Y: hold STEP + LF 5 s → HP constant adjustment.',
  ]],
  ['PROGRAM.ADJUST', 'ADJUST', ['Entering an adjustment screen…']],
  ['PROGRAM.HPC', 'HP constant (p.35)', [
    'At 70% power (per AFM), adjust until the upper window reads the correct %HP. Tap LF −1, hold LF +1.',
    'Hold STEP + LF 5 s → MAP calibration. Tap STEP → exit to the next item.',
  ]],
  ['PROGRAM.MAP_CAL', 'MAP calibration (p.35–36)', [
    'Engine off, on the ground. Correct MAP ±3.0 inHg using the field-elevation table (not the Kollsman setting).',
    'Tap LF −0.1, hold LF +0.1. Tap STEP → next item.',
  ]],
  ['PROGRAM.ITEM.KF', 'K factor (p.38–40)', [
    'Fuel-flow transducer calibration (pulses/gal ÷ 1000).',
    'Hold STEP + LF 5 s → digit edit: LF changes the flashing digit, STEP moves to the next digit, hold STEP + LF 5 s saves.',
  ]],
  ['PROGRAM.KF_EDIT', 'K factor digit edit (p.40)', ['Tap LF −1 / hold LF +1 on the flashing digit. Tap STEP → next digit. Hold STEP + LF 5 s → save.']],
  ['PROGRAM.ITEM.ACCUM', 'Accumulate (p.34, p.40)', ['N = USED resets to 0 at each refuel. Y = accumulate a trip total.']],
  ['PROGRAM.ITEM.GPSC', 'GPS-C format (p.46)', ['Fuel data output format for the GPS (0 = none, 1 Garmin/Shadin, 2 Allied B WPT, 3 Arnav/EI, 4 Allied C, 6/7 Garmin 430/530, 8 Allied B DEST).']],
  ['PROGRAM.ITEM.DUMP', 'Memory dump (p.31, p.34)', [
    'Tap LF → DUMP NEW / DUMP ALL. Tap STEP → transfer to the PC.',
    'Hold STEP + LF 5 s → long-term memory setup (record interval, date, time, aircraft ID).',
  ]],
  ['PROGRAM.DUMP_XFER', 'Transferring', ['Data is being sent. Hold STEP + LF 5 s to abort.']],
  ['PROGRAM.SAVE_D', 'Save?', ['If the PC saved the file, tap LF → SAVE D?Y. Tap STEP → exit programming.']],
  ['PROGRAM.ITEM.END', 'END (p.34, p.43)', [
    'END Y + tap STEP → exit programming. Tap LF → END N, then STEP to review the list again.',
    'Hold STEP + LF 5 s → FAC LIM: alarm limits, units, tank capacity.',
  ]],
  ['PROGRAM.ORIG_TIT', 'Factory original TIT probe (p.38)', ['Tap LF → ORIG T-Y to use the factory probe, then STEP → calibration. With N, STEP exits.']],
  ['PROGRAM.CAL_TIT', 'TIT calibration (p.38)', ['Tap LF lowers, hold LF raises the correction (±975). Tap STEP → exit.']],
  ['PROGRAM.LTM', 'Long-term memory setup (p.41)', [
    'TIME = record interval (2–500 s), then month, day, year, hour (Zulu suggested), minute, aircraft ID.',
    'Tap LF −1, hold LF +1, tap STEP → next. On the ID: hold STEP + LF 5 s to edit characters.',
  ]],
  ['PROGRAM.LTM_ID_EDIT', 'Aircraft ID edit (p.41)', ['Tap LF → next character; STEP → next position; hold STEP + LF 5 s → save.']],
  ['PROGRAM.FACLIM_BANNER', 'FAC LIM (p.43)', ['Alarm limits / tank capacity list is starting…']],
  ['PROGRAM.FACLIM', 'Alarm limits & tank capacity (p.43–45)', [
    'Tap STEP → next item. Tap LF → decrease / next choice. Hold LF → increase.',
    'FAC? Y + STEP restores factory alarm limits. ENG F/C changes all engine temperature units.',
    'END Y + STEP exits; END N reviews the list again.',
  ]],
  ['PROGRAM.EC_EDIT', 'Engine constant (p.45)', ['Tap LF −1 / hold LF +1 on the flashing digit; STEP next digit; hold STEP + LF 5 s to save. 14.9 NA/turbo-normalized, 13.75 turbo-boosted.']],
  ['USB.MENU', 'USB download (p.32)', ['Tap LF → NEW / ALL. Tap STEP → copy to the flash drive.']],
  ['USB.XFER', 'Copying…', ['Count-down while data is copied.']],
  ['USB.DONE', 'Done', ['Remove the flash drive to return to normal operation.']],
];

export function helpFor(path, alarm) {
  let best = null;
  for (const entry of HELP) {
    if (path === entry[0] || path.startsWith(entry[0] + '.')) {
      if (!best || entry[0].length > best[0].length) best = entry;
    }
  }
  const out = best ? { title: best[1], lines: [...best[2]] } : { title: path, lines: [] };
  if (alarm) out.lines.unshift(ALARM_HELP);
  return out;
}

// ---------------------------------------------------------------- guided lessons (EDM operation)
// check(ctx) where ctx = { st, disp, edm, sim, mem, app } ; mem is a per-lesson scratch object.
// app.bootTo(mode, phase): phase ∈ 'off' | 'runup' | 'cruise' — sets the Cardinal up and boots the EDM into mode.

export const LESSONS = [
  {
    id: 'startup',
    title: '1. Power-up and start-up fuel',
    setup: (app) => app.coldAircraft({ rem: 18 }),
    steps: [
      ['Turn the EDM on with the Master switch.', (c) => c.st.state !== 'OFF'],
      ['Watch the self-test: all segments light, then each column is tested in sequence.', (c) => /^(STARTUP_INFO|FUEL_FILL)/.test(c.st.path)],
      ['Date, time, memory FULL % and aircraft ID are shown, then FUEL and a flashing FILL? N.', (c) => c.st.path === 'FUEL_FILL.SEL'],
      ['You topped the main tanks. Tap LF once to see FILL 50 (main tank capacity).', (c) => /^FILL \d/.test(c.disp.digital.text)],
      ['Tap STEP to confirm. Fuel remaining is set to 50 and the EDM enters Manual mode.', (c) => c.st.state === 'MANUAL' && c.edm.settings.rem > 49],
      ['Tap STEP until REM (fuel remaining) is displayed.', (c) => c.st.item === 'REM'],
    ],
  },
  {
    id: 'modes',
    title: '2. Manual and Automatic modes',
    setup: (app) => app.bootTo('MANUAL', 'cruise'),
    steps: [
      ['Tap STEP three times — each tap shows the next parameter (Manual mode).', (c) => {
        if (c.mem.last !== c.st.item) { c.mem.n = (c.mem.n || 0) + (c.mem.last ? 1 : 0); c.mem.last = c.st.item; }
        return c.mem.n >= 3;
      }],
      ['Hold STEP: the parameters step backwards rapidly. Release when done.', (c) => c.edm.events.some((e) => e.type === 'STEP_HOLD_REPEAT')],
      ['Return to Automatic: tap LF (LeanFind starts), then tap STEP.', (c) => c.st.state === 'AUTO'],
      ['Watch the automatic scan (4 s per parameter). Tap STEP to freeze on the current parameter.', (c) => c.st.state === 'MANUAL'],
    ],
  },
  {
    id: 'runup',
    title: '3. Run-up with Normalize view',
    setup: (app) => app.bootTo('MANUAL', 'runup'),
    steps: [
      ['Run-up setup is Manual mode + Normalize view. Hold LF for 3 seconds until NRM lights.', (c) => c.st.view === 'N'],
      ['Set 1800 RPM (throttle), then switch the magnetos to R.', (c) => c.sim.ctl.mags === 'L' || c.sim.ctl.mags === 'R'],
      ['All EGTs rise ~50–100°F together. A single much higher or falling column = plug problem. Back to BOTH.', (c) => c.sim.ctl.mags === 'BOTH'],
      ['Before changing power, go back to Percentage view: hold LF 3 seconds (NRM goes out).', (c) => c.st.view === 'P'],
    ],
  },
  {
    id: 'exclude',
    title: '4. Exclude a parameter from the automatic scan',
    setup: (app) => app.bootTo('MANUAL', 'cruise'),
    steps: [
      ['In Manual mode, tap STEP until OIL is displayed.', (c) => c.st.state === 'MANUAL' && c.st.item === 'OIL'],
      ['Tap STEP and LF together (briefly). A decimal point appears: “.OIL” = excluded.', (c) => c.st.excluded.includes('OIL')],
      ['Return to Automatic (tap LF, then tap STEP). OIL is skipped in the scan but still alarms.', (c) => c.st.state === 'AUTO'],
    ],
  },
  {
    id: 'rop',
    title: '5. LeanFind — rich of peak',
    setup: (app) => app.bootTo('AUTO', 'cruise', { rBar: 1.2 }),
    steps: [
      ['Cruise ~65–70 %, about 100°F rich of peak. Tap LF: LEAN R appears.', (c) => c.st.path === 'LEANFIND.ARMED'],
      ['Lean steadily (hold the ↓ key or the Lean button) without pausing until the dot blinks (15°F rise).', (c) => /LEANFIND\.(ACTIVE|LEANEST|ROP_SET)/.test(c.st.path)],
      ['Keep leaning until LEANEST appears and a column flashes.', (c) => /LEANFIND\.(LEANEST|ROP_SET)/.test(c.st.path)],
      ['Hold LF to see the captured peak EGT of that cylinder.', (c) => c.st.path === 'LEANFIND.ROP_SET' && c.edm.g.isHolding('LF')],
      ['Release LF and enrich slowly to peak (≈ POH recommended lean) or ~100°F rich (best power). Tap STEP to resume Automatic.', (c) => c.st.state === 'AUTO'],
    ],
  },
  {
    id: 'lop',
    title: '6. LeanFind — lean of peak (and why a float carb won’t do it)',
    setup: (app) => app.bootTo('AUTO', 'cruise', { rBar: 1.12 }),
    steps: [
      ['Tap LF: LEAN R.', (c) => c.st.path === 'LEANFIND.ARMED'],
      ['Before leaning, hold STEP + LF for 5 seconds until LEAN L.', (c) => c.st.leanfind?.method === 'L'],
      ['Lean steadily. Watch the leanest cylinder start to misfire (rough running) before the others have peaked.', (c) => c.sim.engine.roughness > 0.15],
      ['Enrich back to smooth operation and tap STEP.', (c) => c.st.state === 'AUTO' && c.sim.engine.roughness < 0.05],
    ],
  },
  {
    id: 'alarms',
    title: '7. Alarms: silence and turn off',
    setup: (app) => { app.bootTo('AUTO', 'cruise'); app.setFault('alternator', {}); },
    steps: [
      ['The alternator has failed. Watch the voltage decay until the BAT alarm flashes.', (c) => c.st.alarm === 'BATL'],
      ['Tap STEP to silence the alarm for 10 minutes.', (c) => c.edm.vol.alarmSupp.BATL > c.edm.now],
      ['Now the oil cooler is blocked (fault injected). Wait (or fast-forward) for the OIL alarm.', (c) => { if (!c.mem.f) { c.app.setFault('oilCooler', {}); c.mem.f = 1; } return c.st.alarm === 'OILH'; }],
      ['Hold STEP until OFF appears: the OIL alarm is off for the rest of the flight.', (c) => c.edm.vol.alarmSupp.OILH === Infinity],
      ['Done — clear the faults in the Faults panel.', () => true],
    ],
  },
  {
    id: 'rate',
    title: '8. Pilot programming: change the scan rate',
    setup: (app) => app.bootTo('AUTO', 'cruise'),
    steps: [
      ['Hold STEP + LF together for 5 seconds until PROGRAM appears.', (c) => c.st.state === 'PROGRAM'],
      ['Tap STEP to reach RATE 4.', (c) => c.st.program?.item === 'RATE'],
      ['Tap LF twice → RATE 2 (tap decreases, hold increases).', (c) => c.edm.settings.rate === 2],
      ['Tap STEP until END Y, then tap STEP to exit.', (c) => (c.st.state === 'AUTO' || c.st.state === 'MANUAL') && c.edm.settings.rate === 2],
    ],
  },
  {
    id: 'usd',
    title: '9. Reset fuel USED in flight',
    setup: (app) => { app.bootTo('MANUAL', 'cruise'); app.edm.settings.usd = 23.4; },
    steps: [
      ['Tap STEP until USD (fuel used) is displayed.', (c) => c.st.state === 'MANUAL' && c.st.item === 'USD'],
      ['Hold STEP + LF for 5 seconds until the display shows .0 USD.', (c) => c.edm.settings.usd < 0.1],
    ],
  },
  {
    id: 'addfuel',
    title: '10. Tell the EDM you added fuel',
    setup: (app) => { app.bootTo('AUTO', 'runup'); app.edm.settings.rem = 20; },
    steps: [
      ['Hold STEP + LF 5 s → PROGRAM, then FUEL? N.', (c) => c.st.program?.item === 'FUEL'],
      ['Tap LF → FUEL? Y, then tap STEP → FILL? N.', (c) => c.st.path === 'FUEL_FILL.SEL'],
      ['Tap LF until FILL+, then tap STEP → .0 GAL.', (c) => c.st.path === 'FUEL_FILL.ADD'],
      ['Hold LF to count up to 10 gallons (tap LF counts down).', (c) => c.edm.ctx.fuel?.amount >= 10],
      ['Tap STEP to confirm: REM increases and the EDM returns to Manual mode.', (c) => c.st.state === 'MANUAL' && c.edm.settings.rem >= 29.9],
    ],
  },
  {
    id: 'limits',
    title: '11. Change an alarm limit (FAC LIM)',
    setup: (app) => app.bootTo('AUTO', 'runup'),
    steps: [
      ['Hold STEP + LF 5 s → PROGRAM. Tap STEP until END Y.', (c) => c.st.program?.item === 'END'],
      ['Hold STEP + LF 5 s until FAC LIM appears.', (c) => /PROGRAM\.FAC/.test(c.st.path)],
      ['Tap STEP until 450 H CHT.', (c) => c.st.path === 'PROGRAM.FACLIM.HCHT'],
      ['Tap LF to lower the limit to 420 (5° steps).', (c) => c.edm.settings.limits.hcht === 420],
      ['Tap STEP through the list to END Y, then tap STEP to exit.', (c) => c.st.state === 'AUTO' || c.st.state === 'MANUAL'],
    ],
  },
  {
    id: 'cld',
    title: '12. Descent: watch shock cooling on CLD',
    setup: (app) => app.bootTo('MANUAL', 'cruise', { alt: 8000, rpm: 2500, map: 21 }),
    steps: [
      ['Descent setup is Manual mode + Percentage view. Tap STEP until CLD.', (c) => c.st.state === 'MANUAL' && c.st.item === 'CLD'],
      ['Start a descent (flight path: Descend at VS) and reduce power.', (c) => c.sim.flight.vs < -200],
      ['Watch CLD go negative (°F/min). Keep it slower than −50°F/min; the dot shows the fastest-cooling cylinder.', (c) => (c.edm._derive().cld ?? 0) < -15],
    ],
  },
];

// ---------------------------------------------------------------- diagnosis trainer (Pilot's Guide p.21–25)

export const DIAGNOSIS = [
  { fault: 'fouledPlugInFlight', answer: 'Spark plug not firing (fouled plug)', action: 'Lean to the cruise setting for several minutes to burn it off; have plugs checked (POH p.3-11).', hint: 'one EGT 75–100°F higher; misfires on one magneto' },
  { fault: 'stuckValve', answer: 'Sticking valve', action: 'Have the valve train checked; it usually announces itself with a very rough start.', hint: 'loss of EGT on one cylinder with roughness' },
  { fault: 'burnedValve', answer: 'Burned exhaust valve', action: 'Compression / borescope check (Savvy FEVA).', hint: 'slow 30–100°F EGT oscillation, about one cycle per minute' },
  { fault: 'lowCompression', answer: 'Low compression', action: 'Check compression.', hint: 'lower EGT on one cylinder, worse at low RPM' },
  { fault: 'inductionLeak', answer: 'Induction leak (intake gasket)', action: 'Inspect intake hoses/gaskets.', hint: 'one cylinder lean/hot at low manifold pressure' },
  { fault: 'exhaustLeak', answer: 'Exhaust leak blowing on the CHT probe', action: 'Look for white powder around the cylinder.', hint: 'one CHT very high with a normal EGT' },
  { fault: 'probe', answer: 'Failed EGT probe or harness', action: 'Swap probes to isolate probe vs. harness.', hint: 'missing column and blank digital EGT' },
  { fault: 'filterBlock', answer: 'Blocked induction air (filter / ice)', action: 'Carb heat (alternate air); check the filter.', hint: 'MAP and all EGTs down, RPM held' },
  { fault: 'timingL', answer: 'Magneto timing advanced', action: 'Have the magneto timing checked (detonation risk).', hint: 'lower EGTs, higher CHTs, small or no mag drop on that magneto' },
];
