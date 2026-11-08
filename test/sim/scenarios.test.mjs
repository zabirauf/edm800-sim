// Every scenario is solvable by a scripted good pilot and produces its EDM signature (plan v2 §6–7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../../src/sim/index.js';
import { SCENARIOS, ScenarioRunner } from '../../src/sim/scenarios.js';
import { Link, makeEdm } from '../../src/sim/pilot.js';

function run(scn, seed = 1, params = {}) {
  const sim = new Simulation({ seed, params });
  const link = new Link(sim, makeEdm());
  const r = new ScenarioRunner(scn, link);
  r.setup();
  r.solve();
  return r;
}

for (const scn of SCENARIOS) {
  test(`scenario ${scn.id}: all objectives completed, no watch-out failures`, () => {
    const r = run(scn);
    assert.equal(r.stepIdx, scn.steps.length, `stopped at step ${r.stepIdx + 1}: "${scn.steps[r.stepIdx]?.[0]}"`);
    assert.deepEqual(r.failures, []);
  });
}
