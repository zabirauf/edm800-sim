// Scenario library (plan v2 §6). Each scenario: weather, set-up, scripted events, sequential objectives checked against
// the simulation and the real EDM state machine, watch-outs (failures), a debrief with references, and a scripted
// "good pilot" solution used by tests to prove the scenario is solvable and shows its EDM signature.
//
// Sources: POH = 1977 177B POH [S2]; LYC = Lycoming O-360 OM / SI 1094D / Flyer [S1][S3][S4]; PG = JPI Pilot's Guide.

import { GOV, setupCruise, setupGroundWarm, startEngine, setRpmGround, setMap, leanToRbar, bootEdm } from './pilot.js';

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const spread = (xs) => Math.max(...xs) - Math.min(...xs);
const cld = (ctx) => ctx.edm._derive().cld ?? 0;
const pathIs = (ctx, re) => re.test(ctx.edm.getState().path);

// Scripted LeanFind used by solutions: tap LF, lean steadily until LEANEST (or limit), return the locked cylinder.
function leanFindRop(ctx, rate = 0.012) {
  const { link, sim } = ctx;
  link.tap('LF');
  for (let i = 0; i < 2400 && !pathIs(ctx, /LEANFIND\.(LEANEST|ROP_SET)/); i++) {
    sim.ctl.mixture = Math.max(0.05, sim.ctl.mixture - rate * 0.05);
    ctx.runner.advance(0.05);
  }
  ctx.runner.advance(2.5);
  return ctx.edm.getState().leanfind?.lock;
}

export const SCENARIOS = [
  {
    id: 'cold-start',
    title: 'Cold start and warm-up',
    category: 'Ground',
    weather: { isaDev: -24, rh: 0.6 },
    brief:
      'Morning departure, OAT about 35°F. Start the engine (master ON, mixture rich, prime 2–3 strokes, throttle cracked, ' +
      'magnetos START), then warm up at 1000–1200 RPM. The EDM will flag low oil temperature until the oil passes 90°F.',
    edmOff: true,
    setup(ctx) {
      ctx.sim.ctl.mixture = 1;
      ctx.edm.send({ type: 'POWER_OFF' });
    },
    steps: [
      ['Master ON (the EDM powers up and runs its self-test).', (c) => c.sim.ctl.master && c.edm.getState().state !== 'OFF'],
      ['Start the engine (prime, then magnetos START → BOTH).', (c) => c.sim.engine.running],
      ['Warm up at 1000–1200 RPM.', (c) => c.sim.engine.rpm >= 950 && c.sim.engine.rpm <= 1250],
      ['Keep warming up until the OIL low alarm clears (oil > 90°F).', (c) => c.sim.engine.oil > 92 && c.edm.vol.alarmActive !== 'OILL'],
    ],
    watch: [{ text: 'Engine run above 2200 RPM on the ground (Lycoming limit)', fail: (c) => c.sim.flight.onGround && c.sim.engine.rpm > 2250 }],
    debrief:
      'Lycoming: warm up at 1000–1200 RPM; the engine is warm enough when the throttle can be opened without faltering ' +
      '(usually 2–3 min above freezing). Do not exceed 2200 RPM on the ground (LYC p.3-3). The EDM low-OIL alarm (90°F) ' +
      'is expected on a cold start (PG p.42).',
    solve(ctx) {
      startEngine(ctx.sim);
      setRpmGround(ctx.sim, 1100, 2);
      ctx.runner.advance(600);
    },
  },
  {
    id: 'runup',
    title: 'Run-up with the EDM',
    category: 'Ground',
    weather: {},
    brief:
      'Engine warm at 1000 RPM. Run-up setup is Manual mode + Normalize view (PG p.18). Set 1800 RPM, check each magneto ' +
      '(drop ≤150 RPM, differential ≤50, POH), watch every EGT rise ~50–100°F on a single magneto, check carb heat (RPM ' +
      'drop) and cycle the prop.',
    setup(ctx) {
      setupGroundWarm(ctx.sim, 1000);
    },
    steps: [
      ['Hold LF 3 s for Normalize view (NRM lit).', (c) => c.edm.vol.view === 'N'],
      ['Set 1800 RPM.', (c) => Math.abs(c.sim.engine.rpm - 1800) < 40],
      ['Select the RIGHT magneto — all EGT columns rise together.', (c) => c.sim.ctl.mags === 'R'],
      ['Back to BOTH, then the LEFT magneto.', (c) => c.sim.ctl.mags === 'L'],
      ['Back to BOTH. Apply full carb heat and note the RPM drop.', (c) => c.sim.ctl.mags === 'BOTH' && c.sim.ctl.carbHeat > 0.9],
      ['Carb heat off; cycle the prop (lever back until RPM drops ≥300, then forward).', (c) => {
        if (c.sim.ctl.prop < 0.3 && c.sim.engine.rpm < 1600) c.mem.cycled = true;
        return c.mem.cycled && c.sim.ctl.prop > 0.95 && c.sim.ctl.carbHeat < 0.1;
      }],
      ['Back to Percentage view before take-off (hold LF 3 s).', (c) => c.edm.vol.view === 'P'],
    ],
    watch: [],
    debrief:
      'POH: magneto drop ≤150 RPM, ≤50 RPM differential at 1800 RPM. A healthy single-magneto check raises all EGTs ' +
      '50–100°F (Busch; PG p.18). A single column falling or going erratic on one magneto points to a fouled plug; all ' +
      'columns behaving the same but a large drop points to the magneto/timing. Carb heat should show an RPM drop.',
    solve(ctx) {
      const { link, sim } = ctx;
      link.hold('LF', 3.3);
      setRpmGround(sim, 1800, 2);
      ctx.runner.advance(1);
      sim.ctl.mags = 'R';
      ctx.runner.advance(8);
      sim.ctl.mags = 'BOTH';
      ctx.runner.advance(4);
      sim.ctl.mags = 'L';
      ctx.runner.advance(8);
      sim.ctl.mags = 'BOTH';
      ctx.runner.advance(2);
      sim.ctl.carbHeat = 1;
      ctx.runner.advance(10);
      sim.ctl.carbHeat = 0;
      sim.ctl.prop = 0;
      ctx.runner.advance(12);
      sim.ctl.prop = 1;
      ctx.runner.advance(8);
      link.hold('LF', 3.3);
      ctx.runner.advance(2);
    },
  },
  {
    id: 'fouled-plug-runup',
    title: 'Fouled plug from a long rich idle',
    category: 'Ground',
    weather: { isaDev: -30 },
    brief:
      'You idled full rich for 25 minutes waiting for a clearance on a cold morning. Do the magneto check at 1800 RPM in ' +
      'Normalize view. If one magneto shows an excessive drop and one EGT column falls, lean aggressively at 1800–2000 RPM ' +
      'for a minute or two to burn the deposits off, then re-check.',
    setup(ctx) {
      setupGroundWarm(ctx.sim, 700);
      ctx.sim.engine.plugF[1][1] = 0.92; // #2 lower plug (right magneto) fouled by the rich idle
    },
    steps: [
      ['Set 1800 RPM and check the RIGHT magneto.', (c) => c.sim.ctl.mags === 'R' && c.sim.engine.rpm < 1700],
      ['Large drop and #2 EGT falling = fouled plug. Back to BOTH.', (c) => c.sim.ctl.mags === 'BOTH'],
      ['Burn off: lean at 1800–2000 RPM until the plug clears.', (c) => c.sim.engine.plugF[1][1] < 0.6],
      ['Re-check the right magneto: drop now within limits.', (c) => {
        if (c.sim.ctl.mags === 'BOTH') c.mem.base = c.sim.engine.rpm;
        return c.sim.ctl.mags === 'R' && c.mem.base - c.sim.engine.rpm < 150 && c.mem.base - c.sim.engine.rpm > 30;
      }],
    ],
    watch: [],
    debrief:
      'POH: long periods of idling at low RPM may cause fouled plugs. Lean for taxi/idle to prevent it. On a magneto check, a ' +
      'fouled plug shows as one EGT bar falling (that cylinder misfires on the affected magneto) and a large drop. The POH ' +
      'remedy is to lean to the cruise setting for several minutes; on the ground, lean at a high run-up RPM and re-check.',
    solve(ctx) {
      const { sim } = ctx;
      setRpmGround(sim, 1800, 2);
      sim.ctl.mags = 'R';
      ctx.runner.advance(8);
      sim.ctl.mags = 'BOTH';
      ctx.runner.advance(3);
      setRpmGround(sim, 1950, 2);
      leanToRbar(sim, 1.0, 40);
      for (let i = 0; i < 60 && sim.engine.plugF[1][1] >= 0.55; i++) ctx.runner.advance(5); // keep leaned until clear
      sim.ctl.mixture = 1;
      setRpmGround(sim, 1800, 2);
      ctx.runner.advance(3);
      sim.ctl.mags = 'R';
      ctx.runner.advance(8);
      sim.ctl.mags = 'BOTH';
    },
  },
  {
    id: 'takeoff-climb',
    title: 'Take-off and climb',
    category: 'Climb',
    weather: {},
    brief:
      'Sea level, standard day. Take-off: full throttle, 2700 RPM, mixture full rich, cowl flaps open, carb heat off. On the ' +
      'roll, check the EDM fuel flow: know your engine’s full-rich number (≈16–18.5 GPH). Climb at Vy (79 KIAS) in ' +
      'Automatic mode, Percentage view; EGTs run 1100–1250°F, CHTs rise. Level at 3000 ft.',
    setup(ctx) {
      setupGroundWarm(ctx.sim, 1000);
      ctx.sim.ctl.prop = 1;
    },
    steps: [
      ['Full throttle, prop full forward, mixture rich: start the take-off roll (flight mode: Take-off).', (c) => c.sim.flight.mode !== 'ground' && c.sim.ctl.throttle > 0.95],
      ['Check take-off fuel flow on the EDM: 16–18.5 GPH.', (c) => c.sim.ffMeasured >= 16 && c.sim.ffMeasured <= 18.5],
      ['Climb at Vy to 3000 ft.', (c) => c.sim.flight.alt >= 3000],
    ],
    watch: [{ text: 'CHT above 450°F (EDM alarm) in the climb', fail: (c) => Math.max(...c.sim.engine.cht) > 450 }],
    debrief:
      'POH take-off: full throttle, 2700 RPM, mixture full rich, cowl flaps open. EGTs in the climb are 100–300°F cooler ' +
      'than cruise because of the rich mixture (PG p.18). The FOCA measurement of this carburetor (MA-4-5) gives ≈16–17 GPH ' +
      'at full throttle; a low full-rich flow on the roll is a red flag (lean take-off mixture → high CHT/detonation risk).',
    solve(ctx) {
      const { sim } = ctx;
      sim.ctl.throttle = 1;
      sim.ctl.cowl = 1;
      sim.flight.setMode('takeoff');
      ctx.runner.advance(25);
      for (let i = 0; i < 120 && sim.flight.alt < 3000; i++) ctx.runner.advance(5);
    },
  },
  {
    id: 'high-da',
    title: 'High-density-altitude take-off',
    category: 'Climb',
    weather: { fieldElev: 5000, isaDev: 36 },
    brief:
      'Field elevation 5000 ft, OAT ≈ 77°F (density altitude ≈ 8000 ft). POH: above 3000 ft, lean for maximum power during a ' +
      'full-throttle static run-up. Full rich here is over-rich: EGTs low, power lost. Lean to about 100–150°F rich of peak ' +
      '(best power) before releasing the brakes.',
    setup(ctx) {
      setupGroundWarm(ctx.sim, 1000);
    },
    steps: [
      ['Full-throttle static run-up (brakes on).', (c) => c.sim.ctl.throttle > 0.95 && c.sim.flight.mode === 'ground'],
      ['Lean for maximum power (best-power mixture, ≈100–150°F ROP).', (c) => c.sim.engine.rBar >= 1.08 && c.sim.engine.rBar <= 1.22],
      ['Take off and climb to 6000 ft.', (c) => c.sim.flight.alt >= 6000],
    ],
    watch: [],
    debrief:
      'POH Fig 5-4 note and SI 1094D: at density altitudes above ~5000 ft, lean during a full-throttle run-up for maximum ' +
      'power (smoothest, highest RPM; with an EDM ≈100–150°F rich of peak). The float carburetor meters by volume, so the ' +
      'mixture gets richer as density falls — full rich at altitude wastes power and can run rough.',
    solve(ctx) {
      const { sim } = ctx;
      sim.ctl.throttle = 1;
      sim.ctl.prop = 1;
      ctx.runner.advance(10);
      leanToRbar(sim, 1.14, 40);
      ctx.runner.advance(2);
      sim.flight.setMode('takeoff');
      for (let i = 0; i < 200 && sim.flight.alt < 6000; i++) ctx.runner.advance(5);
    },
  },
  {
    id: 'hot-climb',
    title: 'Hot-day climb with cowl flaps closed',
    category: 'Climb',
    weather: { isaDev: 42 },
    brief:
      'Hot day (≈100°F). You forgot the cowl flaps after take-off and are climbing slowly over obstacles. Climb at Vy and watch the CHTs. When the EDM CHT alarm ' +
      'flashes, cool the engine: cowl flaps open, mixture richer, lower the nose (climb at 85–90 KIAS).',
    setup(ctx) {
      const { sim } = ctx;
      setupGroundWarm(ctx.sim, 1000);
      sim.ctl.throttle = 1;
      sim.ctl.prop = 1;
      sim.ctl.cowl = 0;
      sim.flight.setMode('takeoff');
      sim.run(30);
    },
    steps: [
      ['Keep climbing at Vy until the CHT alarm appears.', (c) => c.link.alarmsSeen.has('CHT')],
      ['Tap STEP to acknowledge, then open the cowl flaps.', (c) => c.sim.ctl.cowl > 0.9],
      ['Cruise-climb at 85–90 KIAS until the hottest CHT is below 435°F.', (c) => Math.max(...c.sim.engine.cht) < 435],
    ],
    watch: [{ text: 'Any CHT above 500°F (red line)', fail: (c) => Math.max(...c.sim.engine.cht) > 500 }],
    debrief:
      'Lycoming: keep CHT below 435°F in high-power operation; the ways to cool are (1) enrich, (2) cowl flaps, (3) reduce ' +
      'power / climb faster (Flyer p.51). Cowl flaps make the biggest difference at Vy; Cardinals are known for marginal ' +
      'cooling in hot climbs. The rear cylinders usually run hottest in the climb.',
    solve(ctx) {
      const { sim, link } = ctx;
      sim.flight.targetIas = 72;
      for (let i = 0; i < 200 && !link.alarmsSeen.has('CHT'); i++) ctx.runner.advance(5);
      link.tap('STEP');
      sim.ctl.cowl = 1;
      sim.flight.targetIas = 90;
      for (let i = 0; i < 120 && Math.max(...sim.engine.cht) >= 435; i++) ctx.runner.advance(5);
    },
  },
  {
    id: 'climb-no-lean',
    title: 'Climb without leaning',
    category: 'Climb',
    weather: {},
    brief:
      'Climb from 3000 ft to 9000 ft at full throttle, 2600 RPM, mixture still full rich. Watch the EGTs fall as the ' +
      'float carburetor gets richer with altitude, and the engine begin to run rough. Lean for smooth operation.',
    setup(ctx) {
      const { sim } = ctx;
      setupGroundWarm(ctx.sim, 1000);
      sim.flight.alt = 3000;
      sim.flight.setMode('climb');
      sim.flight.targetIas = 85;
      sim.flight.tas = 150;
      sim.ctl.throttle = 1;
      sim.ctl.prop = GOV(2600);
      sim.ctl.cowl = 1;
      sim.settle(300);
    },
    steps: [
      ['Climb through 7500 ft full rich (note the EGTs and roughness).', (c) => c.sim.flight.alt >= 7500],
      ['Lean for smooth operation and power.', (c) => c.sim.engine.roughness < 0.05 && c.sim.engine.rBar < 1.3],
    ],
    watch: [],
    debrief:
      'Lycoming: over-rich roughness is most likely in carbureted engines above 5000 ft; at altitude lean for smoothness, ' +
      'not economy (OM p.3-6). POH: mixture may be leaned above 3000 ft in the climb. The mixture richens because the float ' +
      'carburetor meters by venturi depression: fuel/air ∝ 1/√density.',
    solve(ctx) {
      const { sim } = ctx;
      for (let i = 0; i < 300 && sim.flight.alt < 7500; i++) ctx.runner.advance(5);
      leanToRbar(sim, 1.15, 40);
      ctx.runner.advance(5);
    },
  },
  {
    id: 'edm-vs-poh',
    title: 'Cruise leaning: EDM versus POH',
    category: 'Cruise',
    weather: {},
    brief:
      'Cruise 6000 ft, 2400 RPM / 22 inHg (POH ≈72 %, 9.6 GPH at recommended lean). The POH’s "50°F rich of peak" was set ' +
      'on a single tailpipe probe (≈ the average cylinder). The EDM’s LeanFind uses the FIRST cylinder to peak (the ' +
      'leanest). Run LeanFind, then compare fuel flows: leanest at peak ≈ POH recommended lean; LeanFind 50 ROP burns more.',
    setup(ctx) {
      setupCruise(ctx.sim, { alt: 6000, rpm: 2400, map: 22, rBar: 1.2 });
    },
    steps: [
      ['Tap LF and lean steadily (≈10°F/s) until LEANEST.', (c) => pathIs(c, /LEANFIND\.(LEANEST|ROP_SET)/)],
      ['Enrich slowly until the locked cylinder is back at its peak (SET ≈ PK). Note the fuel flow.', (c) => {
        const lf = c.edm.ctx.lf;
        if (!lf || lf.phase !== 'ROP_SET') return false;
        const k = lf.lock;
        const egt = c.sim.engine.egt[Number(k)];
        const ok = Math.abs(egt - lf.peaks[k].peak) < 12 && c.sim.engine.r[Number(k)] >= 0.995;
        if (ok) c.mem.gphPeak = c.sim.engine.gph;
        return ok;
      }],
      ['Now enrich to 50°F rich of that peak (SET ≈ peak − 50) and compare the fuel flow.', (c) => {
        const lf = c.edm.ctx.lf;
        if (!lf || lf.phase !== 'ROP_SET') return false;
        const k = lf.lock;
        const d = lf.peaks[k].peak - c.sim.engine.egt[Number(k)];
        const ok = d >= 40 && d <= 60 && c.sim.engine.r[Number(k)] > 1;
        if (ok) c.mem.gph50 = c.sim.engine.gph;
        return ok;
      }],
    ],
    watch: [],
    debrief:
      'The POH cruise table is "recommended lean" = 50°F ROP on the Cessna single tailpipe probe (≈ mean mixture). With ' +
      'the EDM, leaning the leanest cylinder to peak puts the average close to that POH setting; "50°F ROP on the EDM" ' +
      'is richer and burns ≈0.3–0.7 GPH more. Lycoming for float carburetors: probe in the leanest cylinder; best economy at ' +
      'peak EGT (≤75 % power); best power ≈100°F ROP (SI 1094D). The truth panel shows the computed tailpipe EGT.',
    solve(ctx) {
      const { sim } = ctx;
      leanFindRop(ctx);
      const lf = ctx.edm.ctx.lf;
      const k = Number(lf.lock);
      for (let i = 0; i < 1500 && !(Math.abs(sim.engine.egt[k] - lf.peaks[lf.lock].peak) < 8 && sim.engine.r[k] >= 1.0); i++) {
        sim.ctl.mixture += 0.0006;
        ctx.runner.advance(0.2);
      }
      ctx.runner.advance(3);
      for (let i = 0; i < 1500 && lf.peaks[lf.lock].peak - sim.engine.egt[k] < 50; i++) {
        sim.ctl.mixture += 0.0006;
        ctx.runner.advance(0.2);
      }
      ctx.runner.advance(3);
    },
  },
  {
    id: 'high-power-cruise',
    title: 'High-power cruise (above 75 %)',
    category: 'Cruise',
    weather: {},
    brief:
      'Low-altitude cruise at 2000 ft, 2500 RPM / 24 inHg — the POH calls this 78 %. Read %HP in the EDM upper window. Above ' +
      '75 % Lycoming does not permit leaning to peak: stay at best power (≈100–150°F ROP, never leaner than 150°F ROP at max ' +
      'cruise). Hold that for 3 minutes.',
    setup(ctx) {
      setupCruise(ctx.sim, { alt: 2000, rpm: 2500, map: 24, rBar: 1.3 });
    },
    steps: [
      ['Lean to best power (≈ r̄ 1.10–1.20) — not to peak.', (c) => c.sim.engine.rBar >= 1.1 && c.sim.engine.rBar <= 1.2],
      ['Hold best power for 3 minutes.', (c) => {
        if (c.sim.engine.rBar >= 1.08 && c.sim.engine.rBar <= 1.22) c.mem.held = (c.mem.held || 0) + 0.25;
        else c.mem.held = 0;
        return c.mem.held >= 180;
      }],
    ],
    watch: [{ text: 'Leaned to peak above 75 % power', fail: (c) => c.sim.engine.rBar < 1.03 }],
    debrief:
      'Lycoming OM p.3-6: at maximum cruise (~75 %) never lean beyond 150°F on the rich side of peak; best economy (peak) ' +
      'only at 75 % and below. JPI (PG p.14) defers to the engine manufacturer. The EDM %HP display makes this decision visible.',
    solve(ctx) {
      leanToRbar(ctx.sim, 1.14, 40);
      ctx.runner.advance(200);
    },
  },
  {
    id: 'lop-attempt',
    title: 'Lean of peak with a float carburetor',
    category: 'Cruise',
    weather: {},
    brief:
      'Try LeanFind in LEAN L (lean-of-peak) mode at 6000 ft / 2400 / 21. Lean slowly and watch what happens to the leanest ' +
      'cylinder before the others reach peak. When the engine runs rough, enrich back to smooth operation.',
    setup(ctx) {
      setupCruise(ctx.sim, { alt: 6000, rpm: 2400, map: 21, rBar: 1.12 });
    },
    steps: [
      ['Tap LF, then hold STEP + LF 5 s for LEAN L.', (c) => c.edm.ctx.lf?.method === 'L'],
      ['Lean until the engine runs rough.', (c) => c.sim.engine.roughness > 0.15],
      ['Enrich back to smooth operation (rich of peak).', (c) => c.sim.engine.roughness < 0.03 && c.sim.engine.rBar > 1.05],
    ],
    watch: [],
    debrief:
      'Lycoming: lean of peak "isn’t possible with float-type carburetors because of the fuel/air distribution problem" and ' +
      'Lycoming does not recommend it (Flyer p.41; SI 1094D). The leanest cylinder starts to miss while the richest is still ' +
      'rich of peak — exactly what the POH means by "roughness may occur before peak EGT".',
    solve(ctx) {
      const { sim, link } = ctx;
      link.tap('LF');
      link.holdBoth(5.3);
      for (let i = 0; i < 3000 && sim.engine.roughness <= 0.15; i++) {
        sim.ctl.mixture -= 0.0004;
        ctx.runner.advance(0.1);
      }
      leanToRbar(sim, 1.12, 30);
      ctx.runner.advance(5);
    },
  },
  {
    id: 'carb-ice',
    title: 'Carburetor ice in cruise',
    category: 'Cruise',
    weather: { isaDev: 4, rh: 0.9 },
    brief:
      'Cruise 3000 ft, 2300 RPM / 21 inHg. OAT ≈52°F, humid (RH 90 %) — the serious-icing zone. Watch MAP, EGTs and the CRB ' +
      '(carb temperature) item. With a constant-speed prop, RPM stays put; MAP falls and all EGTs drop. When you see it, ' +
      'apply FULL carb heat (expect a brief further drop and roughness), then use enough heat to keep CRB out of the ' +
      '−15…+5°C band.',
    setup(ctx) {
      setupCruise(ctx.sim, { alt: 3000, rpm: 2300, map: 21, rBar: 1.05 });
    },
    afterBoot(ctx) {
      ctx.mem.map0 = ctx.sim.engine.map;
    },
    steps: [
      ['Monitor: MAP has dropped by more than 1.5 inHg with RPM unchanged.', (c) => c.mem.map0 - c.sim.engine.map > 1.5],
      ['Apply FULL carb heat.', (c) => c.sim.ctl.carbHeat > 0.9],
      ['Ice cleared: MAP recovered.', (c) => c.sim.engine.ice < 0.05],
    ],
    watch: [{ text: 'Engine stopped from ice', fail: (c) => !c.sim.engine.running }],
    debrief:
      'POH: an unexplained drop in manifold pressure and eventual roughness = carburetor ice; apply full throttle and full ' +
      'carb heat until smooth, then the minimum heat needed and re-lean. UK CAA: carb icing often causes a drop in EGT. With ' +
      'heat, expect an initial further loss (melt water) before recovery (Lycoming Flyer p.48). POH yellow arc −15…+5°C.',
    solve(ctx) {
      const { sim } = ctx;
      for (let i = 0; i < 200 && ctx.mem.map0 - sim.engine.map <= 1.6; i++) ctx.runner.advance(5);
      ctx.runner.advance(1);
      sim.ctl.carbHeat = 1;
      sim.ctl.throttle = 1;
      for (let i = 0; i < 60 && sim.engine.ice >= 0.05; i++) ctx.runner.advance(5);
    },
  },
  {
    id: 'carb-heat-relean',
    title: 'Carb heat in cruise, then re-lean',
    category: 'Cruise',
    weather: {},
    brief:
      'Cruise 4000 ft, 2400 / 22, leaned (r̄ ≈1.05). Apply full carb heat as a precaution: heated air is less dense, so the ' +
      'carburetor delivers a richer mixture — EGTs fall. POH: "readjust the mixture setting". Re-lean so the EGTs return to ' +
      'about where they were.',
    setup(ctx) {
      setupCruise(ctx.sim, { alt: 4000, rpm: 2400, map: 22, rBar: 1.05 });
    },
    afterBoot(ctx) {
      ctx.mem.egt0 = mean(ctx.sim.engine.egtProbe);
    },
    steps: [
      ['Apply full carb heat; watch the EGTs fall.', (c) => c.sim.ctl.carbHeat > 0.9 && mean(c.sim.engine.egtProbe) < c.mem.egt0 - 30],
      ['Re-lean until the average EGT is back within 25°F of the original.', (c) => c.sim.ctl.carbHeat > 0.9 && Math.abs(mean(c.sim.engine.egtProbe) - c.mem.egt0) < 25],
    ],
    watch: [],
    debrief:
      'POH p.4-20: since heated air causes a richer mixture, readjust the mixture after applying carb heat. Partial heat in ' +
      'very cold air (below −18°C) can raise the carburetor temperature into 0–21°C — the worst icing band; use full heat or ' +
      'none in that case.',
    solve(ctx) {
      const { sim } = ctx;
      sim.ctl.carbHeat = 1;
      ctx.runner.advance(40);
      for (let i = 0; i < 400 && mean(sim.engine.egtProbe) < ctx.mem.egt0 - 10; i++) {
        sim.ctl.mixture -= 0.0015;
        ctx.runner.advance(0.5);
      }
      ctx.runner.advance(5);
    },
  },
  {
    id: 'shock-cooling',
    title: 'Descent and shock cooling',
    category: 'Descent',
    weather: {},
    brief:
      'Cruise 8000 ft, 2500 RPM / 21 inHg. Descend to 3000 ft. Descent setup: Manual mode on CLD, Percentage view. Reduce power ' +
      'gradually (about 1 inHg per minute) and keep CLD slower than −50°F/min. Chopping the throttle at cruise speed triggers ' +
      'the EDM CLD alarm (−60°F/min).',
    setup(ctx) {
      setupCruise(ctx.sim, { alt: 8000, rpm: 2500, map: 21, rBar: 1.05 });
    },
    steps: [
      ['Start the descent (Descend at VS, ≈ −500 fpm).', (c) => c.sim.flight.vs < -200],
      ['Reach 3000 ft without a CLD alarm.', (c) => c.sim.flight.alt <= 3000],
    ],
    watch: [{ text: 'CLD alarm (cooling faster than −60°F/min)', fail: (c) => c.link.alarmsSeen.has('CLD') }],
    debrief:
      'Lycoming SI 1094D: do not exceed 50°F/min of CHT change. Flyer: keep power on, descend at no more than high-cruise ' +
      'speed and about 1000 fpm, richen gradually. JPI: −40 to −60°F/min is typical; the greatest cooling shifts to the rear ' +
      'cylinders in the descent.',
    solve(ctx) {
      const { sim } = ctx;
      sim.flight.setMode('descentVs');
      sim.flight.targetVs = -500;
      for (let i = 0; i < 80 && sim.flight.alt > 3000; i++) {
        setMap(sim, Math.max(15, sim.engine.map - 0.6), 30);
        sim.ctl.mixture = Math.min(1, sim.ctl.mixture + 0.01);
        ctx.runner.advance(30);
      }
    },
  },
  {
    id: 'descent-goaround',
    title: 'Descent without enriching, then a go-around',
    category: 'Descent',
    weather: {},
    brief:
      'Cruise 9000 ft, leaned (r̄ ≈1.05). Descend to 1000 ft AGL with partial power. A fixed mixture setting gets about 10 % ' +
      'LEANER as you descend into denser air — EGTs rise through peak and the leanest cylinder may run rough. Richen ' +
      'gradually. At 1500 ft you will be told to GO AROUND: full throttle, carb heat off, mixture FULL RICH.',
    setup(ctx) {
      setupCruise(ctx.sim, { alt: 9000, rpm: 2400, map: 19, rBar: 1.05 });
    },
    events: [{ when: (c) => c.sim.flight.alt < 1500, note: 'GO AROUND! Full throttle, carb heat off, mixture full rich.' }],
    steps: [
      ['Descend (Descend at VS) with ~18 inHg.', (c) => c.sim.flight.alt < 7000],
      ['Richen progressively; reach 1500 ft running smoothly.', (c) => c.sim.flight.alt < 1500 && c.sim.engine.roughness < 0.05],
      ['Go around: full throttle, mixture full rich, climb at Vy.', (c) => c.sim.flight.mode === 'goAround' && c.sim.ctl.throttle > 0.95 && c.sim.engine.rBar > 1.25],
    ],
    watch: [{ text: 'Rough running in the descent (mixture too lean)', fail: (c) => /descent/.test(c.sim.flight.mode) && c.sim.engine.roughness > 0.2 }],
    debrief:
      'Float carburetor: fuel/air ∝ 1/√density, so descending from 9000 ft to 1000 ft leans a fixed setting by ≈12 %. ' +
      'Lycoming Flyer: richen gradually during the descent. POH go-around: full throttle, carb heat cold, mixture rich ' +
      '(lean for max power only above 3000 ft).',
    solve(ctx) {
      const { sim } = ctx;
      sim.flight.setMode('descentVs');
      sim.flight.targetVs = -700;
      for (let i = 0; i < 200 && sim.flight.alt > 1450; i++) {
        setMap(sim, 18, 5);
        if (sim.engine.rBar < 1.1) sim.ctl.mixture = Math.min(1, sim.ctl.mixture + 0.02);
        ctx.runner.advance(5);
      }
      sim.ctl.throttle = 1;
      sim.ctl.mixture = 1;
      sim.ctl.carbHeat = 0;
      sim.ctl.prop = 1;
      sim.flight.setMode('goAround');
      ctx.runner.advance(10);
    },
  },
  {
    id: 'fouled-plug-flight',
    title: 'Fouled plug in flight',
    category: 'Faults',
    weather: {},
    brief:
      'Cruise 4500 ft. Slight roughness and one EGT 75–100°F higher than usual. Use Normalize view and the EDM to find the ' +
      'cylinder; a brief single-magneto check confirms it (that cylinder misfires on one magneto). POH remedy: lean to the ' +
      'cruise setting for several minutes to clear it.',
    setup(ctx) {
      setupCruise(ctx.sim, { alt: 4500, rpm: 2400, map: 22, rBar: 1.15 });
      ctx.sim.engine.plugF[2][1] = 0.8; // #3 lower plug partly fouled (intermittent)
    },
    steps: [
      ['Briefly check the RIGHT magneto (it fires the fouled plug).', (c) => c.sim.ctl.mags === 'R'],
      ['Back to BOTH.', (c) => c.sim.ctl.mags === 'BOTH'],
      ['Lean to the cruise setting and run until the plug clears.', (c) => c.sim.engine.plugF[2][1] < 0.6],
    ],
    watch: [],
    debrief:
      'POH p.3-11: spark-plug fouling shows as slight roughness; switching momentarily to L or R shows an obvious power loss ' +
      'on single ignition; lean to the normal cruise setting for several minutes, then try richer if needed. JPI: one EGT ' +
      'rising 75–100°F in flight = a plug not firing (only one plug burning the charge).',
    solve(ctx) {
      const { sim } = ctx;
      sim.ctl.mags = 'R';
      ctx.runner.advance(4);
      sim.ctl.mags = 'BOTH';
      ctx.runner.advance(2);
      leanToRbar(sim, 1.02, 40);
      ctx.runner.advance(240);
    },
  },
  {
    id: 'induction-leak',
    title: 'Induction leak on one cylinder',
    category: 'Faults',
    weather: {},
    brief:
      'A cracked intake gasket on #4 lets unmetered air in. At high power the effect is small; at low manifold pressure the ' +
      'leak is large and #4 runs lean and hot. Reduce to 15 inHg and compare the columns.',
    setup(ctx) {
      setupCruise(ctx.sim, { alt: 3000, rpm: 2300, map: 23, rBar: 1.12 });
      ctx.sim.setFault('inductionLeak', { cyl: 3, sev: 1 });
      ctx.sim.run(20);
      ctx.mem.r0 = ctx.sim.engine.r[3] / ctx.sim.engine.rBar;
    },
    steps: [['Reduce power to about 15 inHg and observe #4.', (c) => c.sim.engine.map < 16 && c.sim.engine.r[3] / c.sim.engine.rBar < c.mem.r0 - 0.05]],
    watch: [],
    debrief: 'An induction leak leans one cylinder, most at low manifold pressure (PG diagnosis chart; Lycoming).',
    solve(ctx) {
      setMap(ctx.sim, 15, 40);
      ctx.runner.advance(10);
    },
  },
  {
    id: 'burned-valve',
    title: 'Burned exhaust valve',
    category: 'Faults',
    weather: {},
    brief: 'Cruise. Put the EDM in Manual mode on EGT #2 and watch it for two minutes: a slow 30–100°F oscillation of about one cycle per minute is the classic signature of a failing exhaust valve.',
    setup(ctx) {
      setupCruise(ctx.sim, { alt: 5000, rpm: 2400, map: 22, rBar: 1.12 });
      ctx.sim.setFault('burnedValve', { cyl: 1 });
    },
    steps: [
      ['Manual mode on EGT #2.', (c) => c.edm.getState().state === 'MANUAL' && c.edm.vol.item === 'EGT2'],
      ['Watch it for 2 minutes.', (c) => {
        c.mem.hist = c.mem.hist || [];
        c.mem.hist.push(c.sim.engine.egtProbe[1]);
        return c.mem.hist.length > 480 && spread(c.mem.hist.slice(-480)) > 50;
      }],
    ],
    watch: [],
    debrief: 'Savvy FEVA: a slow, rhythmic EGT oscillation of 30–100°F at roughly one cycle per minute indicates a failing exhaust valve (AOPA 2014). JPI: slow rise in EGT with low CHT = burned exhaust valve.',
    solve(ctx) {
      const { link } = ctx;
      link.tap('STEP');
      for (let i = 0; i < 40 && ctx.edm.vol.item !== 'EGT2'; i++) link.tap('STEP');
      ctx.runner.advance(130);
    },
  },
  {
    id: 'detonation',
    title: 'Detonation after a misfuel',
    category: 'Faults',
    weather: { isaDev: 15 },
    brief:
      'The fuel truck put 80-octane in your tanks. At 2500 RPM / 24 inHg leaned near peak, one CHT starts rising rapidly ' +
      'while its EGT barely changes. Detonation: enrich (full rich), reduce power, open the cowl flaps — within 30 seconds.',
    setup(ctx) {
      setupCruise(ctx.sim, { alt: 3000, rpm: 2500, map: 24, rBar: 1.03 });
    },
    afterBoot(ctx) {
      ctx.sim.params.octane = 80; // the misfuel takes effect now
    },
    steps: [
      ['Watch the CHTs.', (c) => Math.max(...c.sim.engine.deton) > 0.2],
      ['Enrich, reduce power and open the cowl flaps.', (c) => c.sim.ctl.mixture > 0.95 && c.sim.engine.map < 20 && c.sim.ctl.cowl > 0.9],
      ['Detonation stopped.', (c) => Math.max(...c.sim.engine.knock) < 1],
    ],
    watch: [{ text: 'Pre-ignition developed', fail: (c) => c.sim.engine.preign.some(Boolean) }],
    debrief:
      'Lycoming Flyer: unless detonation is heavy there is no cockpit evidence; heavy detonation shows as roughness and high ' +
      'CHT. A documented case: dramatic, rapid CHT rise with virtually no EGT change. Causes: low octane, leaning at high ' +
      'power, high charge temperature, carb heat at high power. Cure: enrich, reduce power, cool.',
    solve(ctx) {
      const { sim } = ctx;
      for (let i = 0; i < 120 && Math.max(...sim.engine.deton) <= 0.2; i++) ctx.runner.advance(1);
      sim.ctl.mixture = 1;
      sim.ctl.cowl = 1;
      setMap(sim, 17, 15);
      ctx.runner.advance(60);
    },
  },
  {
    id: 'preignition',
    title: 'Pre-ignition',
    category: 'Faults',
    weather: {},
    brief:
      'High-power cruise. A hot spot develops in #3. The primary cue is a very fast CHT rise on one cylinder (1–3°F per ' +
      'second) — its EGT may DROP rather than spike (JPI also describes an off-scale EGT). Mixture full rich and reduce ' +
      'power immediately.',
    setup(ctx) {
      setupCruise(ctx.sim, { alt: 3000, rpm: 2500, map: 24, rBar: 1.1 });
    },
    events: [{ at: 20, do: (c) => c.sim.setFault('preIgnition', { cyl: 2 }), note: '' }],
    steps: [
      ['Watch for a rapidly rising CHT.', (c) => c.sim.engine.preign[2]],
      ['Full rich and reduce power (≤ 50 %).', (c) => !c.sim.engine.preign[2] && c.sim.ctl.mixture > 0.95],
    ],
    watch: [{ text: 'CHT above 500°F', fail: (c) => c.sim.engine.cht[2] > 500 }],
    debrief:
      'Lycoming Flyer p.20: pre-ignition shows as roughness, backfiring and a sudden increase in CHT; retard the throttle, ' +
      'enrich, open the cowl flaps. Busch: CHT rising ~1°F/s, an engine can be destroyed in about a minute. A documented case ' +
      'showed the affected cylinder’s EGT dropping to the coolest while CHT climbed 310 → 463°F in 60 s.',
    solve(ctx) {
      const { sim } = ctx;
      for (let i = 0; i < 80 && !sim.engine.preign[2]; i++) ctx.runner.advance(1);
      ctx.runner.advance(5);
      sim.ctl.mixture = 1;
      sim.ctl.throttle = 0.25;
      ctx.runner.advance(30);
    },
  },
  {
    id: 'mag-failure',
    title: 'Magneto problem at run-up',
    category: 'Ground',
    weather: {},
    brief: 'Run-up at 1800 RPM. The left magneto has failed. Check each magneto; a dead magneto makes the engine quit or nearly quit on that side — a no-go. Return to BOTH immediately.',
    setup(ctx) {
      setupGroundWarm(ctx.sim, 1000);
      ctx.sim.setFault('magFailL', {});
      setRpmGround(ctx.sim, 1800, 2);
    },
    steps: [
      ['Check the RIGHT magneto.', (c) => c.sim.ctl.mags === 'R'],
      ['Check the LEFT magneto (big drop / quitting).', (c) => c.sim.ctl.mags === 'L' && c.sim.engine.rpm < 1500],
      ['Back to BOTH immediately.', (c) => c.sim.ctl.mags === 'BOTH' && c.mem.leftChecked !== false],
    ],
    watch: [],
    debrief: 'POH: magneto drop ≤150 RPM, ≤50 RPM differential. No drop at all may mean a hot (ungrounded) magneto — a safety hazard. The A1F6D has a single-drive dual magneto: a drive failure loses both.',
    solve(ctx) {
      const { sim } = ctx;
      sim.ctl.mags = 'R';
      ctx.runner.advance(6);
      sim.ctl.mags = 'BOTH';
      ctx.runner.advance(3);
      sim.ctl.mags = 'L';
      ctx.runner.advance(1.5);
      sim.ctl.mags = 'BOTH';
      ctx.runner.advance(2);
    },
  },
  {
    id: 'overvoltage',
    title: 'Over-voltage, then alternator off-line',
    category: 'Faults',
    weather: {},
    brief: 'Cruise. The voltage regulator fails high: watch the BAT reading climb until the EDM high-BAT alarm; the over-voltage relay then takes the alternator off-line, and the battery begins to discharge until the low-BAT alarm.',
    setup(ctx) {
      setupCruise(ctx.sim, { alt: 4000, rpm: 2400, map: 22, rBar: 1.12 });
    },
    events: [{ at: 10, do: (c) => c.sim.setFault('overvoltage', {}), note: '' }],
    steps: [
      ['High-BAT alarm.', (c) => c.link.alarmsSeen.has('BATH')],
      ['Alternator off-line (over-voltage relay).', (c) => c.sim.systems.ovTripped],
      ['Low-BAT alarm follows.', (c) => c.link.alarmsSeen.has('BATL')],
    ],
    watch: [],
    debrief: 'POH: the over-voltage sensor shuts the alternator down at about 16 V and lights the HIGH VOLTAGE lamp; then you are on battery — reduce electrical load and plan to land. EDM factory BAT limits (12 V system): high 16.0, low 12.0.',
    solve(ctx) {
      ctx.runner.advance(15 * 60);
    },
  },
  {
    id: 'oil-cooler',
    title: 'Oil temperature climbing',
    category: 'Faults',
    weather: { isaDev: 20 },
    brief: 'Warm day climb/cruise. The oil cooler is partly blocked: watch OIL climb past the EDM limit (230°F). Red line is 245°F. Reduce power, increase airspeed, open the cowl flaps — and plan to land.',
    setup(ctx) {
      setupCruise(ctx.sim, { alt: 3000, rpm: 2500, map: 24, rBar: 1.15 });
      ctx.sim.setFault('oilCooler', {});
    },
    steps: [
      ['OIL alarm (230°F).', (c) => c.link.alarmsSeen.has('OILH')],
      ['Reduce power below 60 % and open the cowl flaps.', (c) => c.sim.truth().pctTrue < 60 && c.sim.ctl.cowl > 0.9],
    ],
    watch: [{ text: 'Oil above 245°F red line', fail: (c) => c.sim.engine.oil > 245 }],
    debrief: 'POH limits: oil 245°F red line, 60–90 psi green. Rising oil temperature with falling pressure suggests impending failure (POH p.3-11).',
    solve(ctx) {
      const { sim, link } = ctx;
      for (let i = 0; i < 300 && !link.alarmsSeen.has('OILH'); i++) ctx.runner.advance(2);
      sim.ctl.cowl = 1;
      setMap(sim, 17, 20);
      ctx.runner.advance(5);
    },
  },
  {
    id: 'tank-dry',
    title: 'Running a tank dry',
    category: 'Faults',
    weather: {},
    brief: 'Cruise on the LEFT tank, which is almost empty. When the engine coughs: fuel flow flickers, EGTs rise (leaning) then collapse. Fuel selector BOTH, auxiliary pump ON, mixture rich — the windmilling engine restarts.',
    setup(ctx) {
      setupCruise(ctx.sim, { alt: 5000, rpm: 2400, map: 22, rBar: 1.12 });
      ctx.sim.ctl.fuelSelector = 'L';
      ctx.sim.systems.tankL = 0.15;
    },
    steps: [
      ['Engine stops.', (c) => !c.sim.engine.running],
      ['Selector BOTH, aux pump ON, mixture rich: engine running again.', (c) => c.sim.engine.running && c.sim.ctl.fuelSelector === 'BOTH'],
    ],
    watch: [],
    debrief: 'POH: if the engine-driven pump fails, use the auxiliary pump; switch tanks before one runs dry. The EDM REM/H.M values only know what you told it at refuelling — they are not a fuel gauge.',
    solve(ctx) {
      const { sim } = ctx;
      for (let i = 0; i < 120 && sim.engine.running; i++) ctx.runner.advance(1);
      sim.ctl.fuelSelector = 'BOTH';
      sim.ctl.auxPump = true;
      sim.ctl.mixture = 1;
      sim.ctl.mags = 'START';
      ctx.runner.advance(4);
      sim.ctl.mags = 'BOTH';
      ctx.runner.advance(10);
    },
  },
  {
    id: 'failed-probe',
    title: 'Failed probe at power-up',
    category: 'Ground',
    weather: {},
    brief: 'Turn the EDM on. A broken EGT #3 probe lead shows as OPEN PRB / EGT 3 during the self-test, and #3 has no column and a blank EGT reading afterwards.',
    setup(ctx) {
      ctx.sim.ctl.master = false;
      ctx.sim.failedProbes.add('EGT3');
      ctx.edm.send({ type: 'POWER_OFF' });
      ctx.edm.send({ type: 'SENSORS', data: ctx.sim.sensors() });
    },
    steps: [
      ['Master ON and watch the EDM self-test.', (c) => c.edm.getState().path === 'SELFTEST.PROBES'],
      ['Self-test complete.', (c) => /^(FUEL_FILL|MANUAL|AUTO)/.test(c.edm.getState().path)],
    ],
    watch: [],
    debrief: 'PG p.11: a probe problem found at start-up is displayed as OPEN PRB or CAL ERR followed by the channel; the faulty channel is removed from the sequence (missing column / blank digital data). Diagnosis chart: loss of EGT on one cylinder with no digital EGT = failed probe or harness — swap probes to isolate.',
    solve(ctx) {
      ctx.sim.ctl.master = true;
      ctx.runner.advance(30);
    },
    edmOff: true,
  },
  {
    id: 'filter-blocked',
    title: 'Heavy rain: blocked induction filter',
    category: 'Faults',
    weather: { isaDev: 25, rh: 0.75 },
    brief: 'Cruise in very heavy rain; the paper air filter swells and blocks. MAP drops with RPM unchanged. Carb heat opens the unfiltered alternate-air path and restores most of the manifold pressure (POH: carb heat recommended in very heavy rain).',
    setup(ctx) {
      setupCruise(ctx.sim, { alt: 3000, rpm: 2400, map: 22, rBar: 1.12 });
    },
    afterBoot(ctx) {
      ctx.mem.map0 = ctx.sim.engine.map;
    },
    events: [{ at: 15, do: (c) => c.sim.setFault('filterBlock', { sev: 0.9 }), note: '' }],
    steps: [
      ['MAP drops (≥1.5 inHg).', (c) => c.mem.map0 - c.sim.engine.map >= 1.5],
      ['Apply carb heat (alternate air): MAP recovers.', (c) => c.sim.ctl.carbHeat > 0.9 && c.mem.map0 - c.sim.engine.map < 1.2],
    ],
    watch: [],
    debrief: 'Lycoming Flyer and POH: induction blockage (rain-soaked filter, ice) reduces MAP and power; the alternate air (carb heat) bypasses the filter. Re-lean after applying heat.',
    solve(ctx) {
      const { sim } = ctx;
      ctx.runner.advance(30);
      sim.ctl.carbHeat = 1;
      ctx.runner.advance(20);
    },
  },
  {
    id: 'cold-weather',
    title: 'Cold-soaked engine (−10°C)',
    category: 'Ground',
    weather: { isaDev: -45, rh: 0.7 },
    brief: 'OAT ≈ 14°F. Without preheat the oil is thick: high oil pressure, slow warm-up, a long OIL-low alarm. Start, warm up at 1000–1200 RPM until the oil is above 100°F, and cycle the prop at run-up.',
    edmOff: true,
    setup(ctx) {
      ctx.sim.ctl.mixture = 1;
      ctx.edm.send({ type: 'POWER_OFF' });
    },
    steps: [
      ['Master ON (the EDM powers up), then start the engine.', (c) => c.sim.engine.running && c.edm.getState().state !== 'OFF'],
      ['Warm up until the OIL alarm clears.', (c) => c.sim.engine.oil > 92],
    ],
    watch: [{ text: 'Oil pressure above 115 psi (start/warm-up limit)', fail: (c) => c.sim.engine.oilPressure > 115.5 }],
    debrief: 'Lycoming: preheat below about 10°F; oil pressure may read high when cold (max 115 psi for start/warm-up). The 177B winterization kit is for use below −7°C (20°F); without it the oil may not reach 140°F in cruise (POH §7).',
    solve(ctx) {
      startEngine(ctx.sim);
      setRpmGround(ctx.sim, 1100, 2);
      ctx.runner.advance(900);
    },
  },
];

export const SCENARIO_BY_ID = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));

/** Runs a scenario against a Link (sim + EDM): set-up, events, sequential objectives, watch-outs. */
export class ScenarioRunner {
  constructor(scenario, link) {
    this.scn = scenario;
    this.link = link;
    this.sim = link.sim;
    this.edm = link.edm;
    this.t = 0;
    this.stepIdx = 0;
    this.failures = [];
    this.notes = [];
    this.mem = {};
    this.fired = new Set();
    this.evalAcc = 0;
  }

  get ctx() {
    return { sim: this.sim, edm: this.edm, link: this.link, mem: this.mem, runner: this, t: this.t };
  }

  setup() {
    const w = this.scn.weather || {};
    const s = this.sim;
    s.env.isaDev = w.isaDev ?? 0;
    s.env.rh = w.rh ?? 0.5;
    s.flight.fieldElev = w.fieldElev ?? 0;
    s.flight.setMode('ground');
    s.flight.alt = s.flight.fieldElev;
    s.engine.reset(59 - 3.57 * (s.flight.fieldElev / 1000) + s.env.isaDev);
    const iceRate = s.params.iceRate;
    s.params.iceRate = 0; // never ice during set-up
    this.scn.setup(this.ctx);
    if (!this.scn.edmOff) bootEdm(this.link, 'AUTO');
    s.params.iceRate = iceRate;
    s.engine.ice = 0;
    this.scn.afterBoot?.(this.ctx);
    this.link.lastMaster = !!s.ctl.master && this.edm.state !== 'OFF';
    this.t = 0;
    this.stepIdx = 0;
  }

  get done() {
    return this.stepIdx >= this.scn.steps.length;
  }

  /** Call after each link step (app) — evaluates events, objectives and watch-outs. */
  tick(dt) {
    this.t += dt;
    const ctx = this.ctx;
    (this.scn.events || []).forEach((ev, i) => {
      if (this.fired.has(i)) return;
      if ((ev.at != null && this.t >= ev.at) || (ev.when && ev.when(ctx))) {
        this.fired.add(i);
        ev.do?.(ctx);
        if (ev.note) this.notes.push({ t: this.t, text: ev.note });
      }
    });
    this.evalAcc += dt;
    if (this.evalAcc < 0.25) return;
    this.evalAcc = 0;
    while (!this.done && this.scn.steps[this.stepIdx][1](ctx)) this.stepIdx++;
    for (const w of this.scn.watch || []) {
      if (!this.failures.includes(w.text) && w.fail(ctx)) this.failures.push(w.text);
    }
  }

  /** Run the scripted good-pilot solution (tests): helper calls to sim.run() are routed through the EDM link. */
  solve() {
    const sim = this.sim;
    const orig = sim.run;
    sim.run = (seconds) => this.advance(seconds);
    try {
      this.scn.solve(this.ctx);
      this.advance(2);
    } finally {
      sim.run = orig;
    }
  }

  /** Headless advance (tests and scripted solutions). */
  advance(seconds) {
    const n = Math.round(seconds / 0.05);
    for (let i = 0; i < n; i++) {
      this.link.step(0.05);
      this.tick(0.05);
    }
  }
}

export { setupCruise, setupGroundWarm, leanFindRop, GOV, startEngine, setRpmGround, setMap, leanToRbar };
