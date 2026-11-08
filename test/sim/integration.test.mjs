// Simulation + EDM integration: the B1 lesson (EDM vs POH), LeanFind false-peak statistics (Pilot's Guide p.20),
// and robustness of scenario signatures across ASSUMED ranges and seeds (critique m19a).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../../src/sim/index.js';
import { PARAMS } from '../../src/sim/calibration.js';
import { SCENARIO_BY_ID, ScenarioRunner } from '../../src/sim/scenarios.js';
import { Link, makeEdm, setupCruise, bootEdm } from '../../src/sim/pilot.js';

function runScenario(id, seed = 1, params = {}) {
  const sim = new Simulation({ seed, params });
  const r = new ScenarioRunner(SCENARIO_BY_ID[id], new Link(sim, makeEdm()));
  r.setup();
  r.solve();
  return r;
}

test('B1 lesson: leanest cylinder at peak ≈ POH recommended-lean flow (9.6 ±0.4 GPH); LeanFind 50 ROP burns +0.3…0.8 GPH more', () => {
  const r = runScenario('edm-vs-poh');
  assert.ok(Math.abs(r.mem.gphPeak - 9.6) <= 0.4, `leanest at peak ${r.mem.gphPeak.toFixed(2)} GPH`);
  const extra = r.mem.gph50 - r.mem.gphPeak;
  assert.ok(extra >= 0.3 && extra <= 0.8, `LeanFind 50 ROP extra ${extra.toFixed(2)} GPH`);
});

function leanFindTrial(seed, pause) {
  const sim = new Simulation({ seed });
  setupCruise(sim, { alt: 6000, rpm: 2400, map: 22, rBar: 1.15 });
  const link = new Link(sim, makeEdm());
  bootEdm(link, 'AUTO');
  link.tap('LF');
  const leanest = () => sim.engine.r.indexOf(Math.min(...sim.engine.r));
  let paused = !pause;
  for (let i = 0; i < 6000; i++) {
    const k = leanest();
    if (!paused && sim.engine.r[k] < 1.025) {
      link.run(10); // the pilot stops leaning just before peak
      paused = true;
    }
    sim.ctl.mixture -= 0.009 * 0.05; // ≈10°F/s leaning rate
    link.step(0.05);
    if (/LEANEST|ROP_SET/.test(link.edm.getState().path)) {
      const lf = link.edm.ctx.lf;
      return sim.engine.r[Number(lf.lock)] > 1.0 || lf.lock !== String(k); // locked before the true peak / wrong cylinder
    }
  }
  return null;
}

test('LeanFind statistics: a 10 s pause near peak gives a false peak in ~20–70 % of seeds; steady 10°F/s leaning almost never (PG p.20)', () => {
  const n = 10;
  let pauseFalse = 0;
  let steadyFalse = 0;
  for (let s = 1; s <= n; s++) {
    if (leanFindTrial(s, true)) pauseFalse++;
    if (leanFindTrial(200 + s, false)) steadyFalse++;
  }
  assert.ok(pauseFalse >= 2 && pauseFalse <= 7, `pause false peaks ${pauseFalse}/${n}`);
  assert.ok(steadyFalse <= 1, `steady false peaks ${steadyFalse}/${n}`);
});

// Robustness: key signatures hold at both ends of the ASSUMED ranges that drive them, and across seeds.
const ROBUST = [
  ['runup', ['singleMagEff', 'tauEgt']],
  ['carb-ice', ['iceRate', 'heatEps', 'tauMuff']],
  ['hot-climb', ['Q0', 'cowlVy', 'kSlip']],
  ['shock-cooling', ['tauCht', 'Q0']],
  ['lop-attempt', ['rLeanMis', 'egtNoise']],
  ['fouled-plug-runup', ['clearRate']],
];
for (const [id, names] of ROBUST) {
  for (const name of names) {
    for (const end of [0, 1]) {
      const v = PARAMS[name].range[end];
      test(`robustness ${id}: ${name} = ${v} (${end ? 'high' : 'low'} end)`, () => {
        const r = runScenario(id, 3, { [name]: v });
        assert.equal(r.stepIdx, SCENARIO_BY_ID[id].steps.length, `stopped at "${SCENARIO_BY_ID[id].steps[r.stepIdx]?.[0]}"`);
        assert.deepEqual(r.failures, []);
      });
    }
  }
}
for (const id of ['edm-vs-poh', 'carb-ice', 'shock-cooling', 'descent-goaround']) {
  test(`robustness ${id}: seeds 11–15`, () => {
    for (let seed = 11; seed <= 15; seed++) {
      const r = runScenario(id, seed);
      assert.equal(r.stepIdx, SCENARIO_BY_ID[id].steps.length, `seed ${seed} stopped at step ${r.stepIdx + 1}`);
      assert.deepEqual(r.failures, [], `seed ${seed}`);
    }
  });
}
