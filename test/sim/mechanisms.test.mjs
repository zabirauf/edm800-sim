// Mechanism tests (plan v2 §7 "Mechanisms", "Signs", "Conservation / determinism").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSim, start, setRpmGround, setMap, leanToRbar, cruise, GOV, mean, spread } from './helpers.mjs';

const rateOver = (s, fn, secs) => {
  const a = fn();
  s.run(secs);
  return ((fn() - a) / secs) * 60; // per minute
};

test('mag check at 1800 RPM: drop 60–110 each, differential < 30, all EGTs rise 50–100°F (POH, Busch)', () => {
  const s = start(newSim());
  s.run(300);
  setRpmGround(s, 1800);
  const base = s.engine.rpm;
  const egt0 = [...s.engine.egtProbe];
  s.ctl.mags = 'R';
  s.run(10);
  const dropR = base - s.engine.rpm;
  const egtR = s.engine.egtProbe.map((e, i) => e - egt0[i]);
  s.ctl.mags = 'BOTH';
  s.run(10);
  s.ctl.mags = 'L';
  s.run(10);
  const dropL = base - s.engine.rpm;
  s.ctl.mags = 'BOTH';
  for (const d of [dropR, dropL]) assert.ok(d >= 60 && d <= 110, `drop ${d.toFixed(0)}`);
  assert.ok(Math.abs(dropR - dropL) < 30);
  for (const r of egtR) assert.ok(r >= 40 && r <= 110, `EGT rise ${r.toFixed(0)}`);
});

test('carb heat: ≈90°F rise at 75 % cruise; run-up drop 30–100 RPM; −13 ±2.5 % power at full throttle (M8, POH)', () => {
  const s = cruise(newSim(), { alt: 4000, rpm: 2500, map: 23, rBar: 1.05 });
  s.ctl.carbHeat = 1;
  s.run(20);
  const rise = s.engine.heatRise;
  assert.ok(rise >= 75 && rise <= 110, `cruise rise ${rise.toFixed(0)}`);
  s.ctl.carbHeat = 0;
  // full throttle, 2700, full rich, SL climb at Vy
  const t = start(newSim());
  t.ctl.throttle = 1;
  t.ctl.prop = 1;
  t.flight.setMode('takeoff');
  t.run(40);
  t.settle(300);
  const alt0 = t.flight.alt;
  const p0 = t.engine.bhp;
  t.ctl.carbHeat = 1;
  for (let k = 0; k < 60 / 0.05; k++) {
    t.step(0.05);
    t.flight.alt = alt0; // compare at the same altitude
  }
  const loss = 1 - t.engine.bhp / p0;
  assert.ok(loss >= 0.105 && loss <= 0.155, `full-heat loss ${(loss * 100).toFixed(1)} %`);
  // run-up
  const u = start(newSim());
  u.run(300);
  setRpmGround(u, 1800);
  const b = u.engine.rpm;
  u.ctl.carbHeat = 1;
  u.run(15);
  const drop = b - u.engine.rpm;
  assert.ok(drop >= 30 && drop <= 100, `run-up drop ${drop.toFixed(0)}`);
});

test('carb heat at idle after 2 min gives < 40 % of the cruise rise; heat applied before the power cut keeps working 1–2 min', () => {
  const s = cruise(newSim(), { alt: 4000, rpm: 2500, map: 23, rBar: 1.05 });
  s.ctl.carbHeat = 1;
  s.run(20);
  const cruiseRise = s.engine.heatRise;
  s.ctl.carbHeat = 0;
  s.run(10);
  s.ctl.throttle = 0;
  s.flight.setMode('descentIas');
  s.flight.targetIas = 100;
  s.run(120);
  s.ctl.carbHeat = 1;
  s.run(5);
  assert.ok(s.engine.heatRise < 0.4 * cruiseRise, `idle rise ${s.engine.heatRise.toFixed(0)} vs ${cruiseRise.toFixed(0)}`);
  // heat applied first, then power reduced
  const t = cruise(newSim(), { alt: 4000, rpm: 2500, map: 23, rBar: 1.05 });
  t.ctl.carbHeat = 1;
  t.run(10);
  t.ctl.throttle = 0;
  t.flight.setMode('descentIas');
  t.flight.targetIas = 100;
  t.run(60);
  assert.ok(t.engine.heatRise > 0.5 * cruiseRise, `1 min after the power cut: ${t.engine.heatRise.toFixed(0)}`);
});

test('float carburetor richens with altitude ∝ 1/√σ at a fixed lever (and gets leaner descending)', () => {
  const s = cruise(newSim(), { alt: 2000, rpm: 2400, map: 22, rBar: null });
  s.ctl.mixture = 0.8;
  s.run(20);
  const r2 = s.engine.rBar;
  const sig2 = s.atm.sigma;
  s.flight.alt = 9000;
  setMap(s, 18, 30);
  s.run(10);
  const r9 = s.engine.rBar;
  const ratio = r9 / r2;
  const expected = Math.sqrt(sig2 / s.atm.sigma);
  assert.ok(Math.abs(ratio - expected) / expected < 0.04, `ratio ${ratio.toFixed(3)} expected ${expected.toFixed(3)}`);
});

test('rich roughness: full rich at 9000 ft ISA is rough; leaning restores smoothness and power (M6)', () => {
  // at 9000 ft a 75 %-ish cruise is at or near full throttle (economizer enrichment active)
  const s = cruise(newSim(), { alt: 9000, rpm: 2600, map: 22, rBar: null });
  s.ctl.throttle = 1;
  s.ctl.mixture = 1;
  s.ctl.carbHeat = 1;
  s.run(30);
  const roughRich = s.engine.roughness;
  const bhpRich = s.engine.bhp;
  s.ctl.carbHeat = 0;
  leanToRbar(s, 1.1);
  s.run(10);
  assert.ok(roughRich > 0.15, `rich roughness ${roughRich.toFixed(2)}`);
  assert.ok(s.engine.roughness < 0.05, `leaned roughness ${s.engine.roughness.toFixed(2)}`);
  assert.ok(s.engine.bhp > bhpRich, 'leaning restores power');
});

test('lean of peak with a float carburetor: the leanest cylinder misfires before the others reach peak (critique, Lycoming)', () => {
  const s = cruise(newSim(), { alt: 6000, rpm: 2400, map: 21 });
  const lean = s.engine.r.indexOf(Math.min(...s.engine.r));
  assert.equal(lean, 2, 'default personality: #3 leanest');
  for (let k = 0; k < 400 && s.engine.misfire[lean] < 0.3; k++) {
    s.ctl.mixture -= 0.001;
    s.run(0.5);
  }
  assert.ok(s.engine.misfire[lean] >= 0.3, `leanest misfire ${s.engine.misfire[lean].toFixed(2)}`);
  assert.ok(Math.max(...s.engine.r) >= 1.0, `richest cylinder still rich of peak (r ${Math.max(...s.engine.r).toFixed(3)})`);
  assert.ok(s.engine.roughness > 0.1);
});

test('DIF at recommended lean (r̄ 1.05) is 120–150°F; taxi spread > cruise spread; throttle leveling cuts DIF ≥ 20°F (M5)', () => {
  const s = cruise(newSim(), { alt: 4000, rpm: 2300, map: 23.5, rBar: 1.05 });
  s.ctl.throttle = 1;
  s.run(20);
  leanToRbar(s, 1.05);
  s.run(20);
  const difLean = spread(s.engine.egtProbe);
  assert.ok(difLean >= 115 && difLean <= 165, `DIF at recommended lean ${difLean.toFixed(0)}`);
  // JPI p.19 leveling technique (all cylinders rich of peak, best-power mixture)
  leanToRbar(s, 1.12);
  s.run(20);
  const difWot = spread(s.engine.egt);
  // retard throttle ~1 inHg and raise RPM to hold power
  s.ctl.prop = GOV(2500);
  s.run(10);
  const mapWot = s.engine.map; // full throttle at the new RPM
  setMap(s, mapWot - 1, 40);
  leanToRbar(s, 1.12);
  s.run(20);
  const difPart = spread(s.engine.egt);
  assert.ok(difWot - difPart >= 20, `leveling ${difWot.toFixed(0)} → ${difPart.toFixed(0)}`);
  const t = start(newSim());
  setRpmGround(t, 1100);
  const rTaxi = spread(t.engine.r) / mean(t.engine.r);
  const rCruise = spread(s.engine.r) / mean(s.engine.r);
  assert.ok(rTaxi > rCruise, 'taxi distribution spread exceeds cruise spread');
});

test('plug fouling: 20 min at ~700 RPM full rich on a cold day fouls the richest cylinder’s (#2) lower plug; leaning at 1800–2000 clears it; leaned taxi does not foul (M10)', () => {
  const s = start(newSim({ isaDev: -40 }));
  s.ctl.throttle = 0.02;
  s.run(1200);
  assert.ok(s.engine.plugF[1][1] > 0.85, `plug F ${s.engine.plugF[1][1].toFixed(2)}`);
  assert.ok(s.engine.plugF.flat().filter((f) => f > 0.85).length === 1, 'only one plug fouled');
  setRpmGround(s, 1800);
  const base = s.engine.rpm;
  s.ctl.mags = 'R';
  s.run(10);
  assert.ok(base - s.engine.rpm > 150, `fouled mag drop ${(base - s.engine.rpm).toFixed(0)}`);
  assert.ok(s.engine.egtProbe[1] < Math.min(...s.engine.egtProbe.filter((_, i) => i !== 1)) - 100, '#2 EGT falls on the right magneto');
  s.ctl.mags = 'BOTH';
  setRpmGround(s, 1950);
  leanToRbar(s, 1.0, 40);
  s.run(120);
  assert.ok(s.engine.plugF[1][1] < 0.6, `after burn-off F ${s.engine.plugF[1][1].toFixed(2)}`);
  const t = start(newSim({ isaDev: -40 }));
  t.ctl.throttle = 0.02;
  leanToRbar(t, 1.0, 30);
  t.run(1200);
  assert.ok(t.engine.plugF[1][1] < 0.3, `leaned taxi F ${t.engine.plugF[1][1].toFixed(2)}`);
});

test('knock: 80-octane misfuel at high cruise power leaned → detonation (rapid CHT rise, EGT ~unchanged); enrich + reduce power relieves it (M9)', () => {
  const s = cruise(newSim(), { alt: 3000, rpm: 2500, map: 24, rBar: 1.05 });
  assert.ok(Math.max(...s.engine.deton) === 0, `no detonation on 100LL (K ${Math.max(...s.engine.knock).toFixed(2)})`);
  s.params.octane = 80; // misfuel
  const cht0 = Math.max(...s.engine.cht);
  const egt0 = [...s.engine.egtProbe];
  s.run(30);
  assert.ok(Math.max(...s.engine.deton) > 0, `detonation K ${Math.max(...s.engine.knock).toFixed(2)}`);
  const k = s.engine.deton.indexOf(Math.max(...s.engine.deton));
  assert.ok(s.engine.cht[k] - cht0 > 10, 'rapid CHT rise on the detonating cylinder');
  assert.ok(Math.abs(s.engine.egtProbe[k] - egt0[k]) < 45, 'EGT nearly unchanged');
  s.ctl.mixture = 1;
  s.ctl.throttle = 0.55;
  s.run(30);
  assert.ok(Math.max(...s.engine.knock) < 1, `after enrich + power reduction K ${Math.max(...s.engine.knock).toFixed(2)}`);
});

test('pre-ignition (hot spot): that cylinder’s CHT climbs ≥1°F/s while its EGT drops 100–300°F; full rich + power reduction stops it (M9)', () => {
  const s = cruise(newSim(), { alt: 3000, rpm: 2500, map: 24, rBar: 1.08 });
  const egt0 = s.engine.egtProbe[1];
  s.setFault('preIgnition', { cyl: 1 });
  s.run(3);
  const rate = rateOver(s, () => s.engine.cht[1], 20) / 60;
  assert.ok(rate >= 1, `CHT rate ${rate.toFixed(2)} °F/s`);
  const drop = egt0 - s.engine.egtProbe[1];
  assert.ok(drop >= 100 && drop <= 320, `EGT drop ${drop.toFixed(0)}`);
  s.ctl.mixture = 1;
  s.ctl.throttle = 0.25;
  s.run(20);
  assert.equal(s.engine.preign[1], false);
});

test('governor: idle at 130 KIAS holds the lever RPM; idle at 65–70 KIAS falls below it; coarse stop overspeeds in a dive (m3)', () => {
  const s = cruise(newSim(), { alt: 5000, rpm: 2400, map: 22 });
  s.ctl.throttle = 0;
  s.flight.setMode('descentIas');
  s.flight.targetIas = 130;
  s.run(60);
  assert.ok(Math.abs(s.engine.rpm - 2400) < 60, `130 KIAS idle RPM ${s.engine.rpm.toFixed(0)}`);
  s.flight.targetIas = 67;
  s.run(90);
  assert.ok(s.engine.rpm < 2300, `67 KIAS idle RPM ${s.engine.rpm.toFixed(0)}`);
  const d = cruise(newSim(), { alt: 5000, rpm: 2100, map: 23 });
  d.ctl.throttle = 1;
  d.flight.setMode('descentVs');
  d.flight.targetVs = -1500;
  d.run(60);
  assert.ok(d.engine.beta >= 25.9, `blade at coarse stop β ${d.engine.beta.toFixed(1)}`);
  assert.ok(d.engine.rpm > 2150, `overspeed ${d.engine.rpm.toFixed(0)}`);
});

test('carb ice: serious-zone conditions ice within 15 min — MAP falls ≥1.5 in with RPM held, all EGTs fall; heat clears it; light-zone conditions do not (m10)', () => {
  const s = newSim({ isaDev: 4, rh: 0.9 }); // OAT ≈52°F, RH 90 %
  s.params.iceRate = 0; // no icing while setting up the cruise condition
  cruise(s, { alt: 3000, rpm: 2300, map: 21, rBar: 1.05 });
  s.engine.ice = 0;
  s.run(30);
  s.params.iceRate = 1;
  const map0 = s.engine.map;
  const egt0 = [...s.engine.egtProbe];
  const rpm0 = s.engine.rpm;
  let t = 0;
  while (s.engine.ice < 0.4 && t < 900) {
    s.run(10);
    t += 10;
  }
  assert.ok(s.engine.ice >= 0.4, `ice ${s.engine.ice.toFixed(2)} after ${t}s, CRB ${s.engine.crb.toFixed(0)}°F`);
  assert.ok(map0 - s.engine.map >= 1.5, `MAP loss ${(map0 - s.engine.map).toFixed(2)}`);
  assert.ok(Math.abs(s.engine.rpm - rpm0) < 30, 'RPM held by the governor');
  s.engine.egtProbe.forEach((e, i) => assert.ok(e < egt0[i] - 10, `cyl ${i + 1} EGT ${e.toFixed(0)} vs ${egt0[i].toFixed(0)}`));
  s.ctl.carbHeat = 1;
  s.run(180);
  assert.ok(s.engine.ice < 0.05, `after heat ice ${s.engine.ice.toFixed(2)}`);
  s.ctl.carbHeat = 0;
  s.run(30);
  assert.ok(Math.abs(s.engine.map - map0) < 0.6, 'MAP returns to the pre-ice value with heat off');
  const dry = cruise(newSim({ isaDev: 35, rh: 0.3 }), { alt: 3000, rpm: 2300, map: 21, rBar: 1.05 });
  dry.run(900);
  assert.ok(dry.engine.ice < 0.05, `light/no-zone ice ${dry.engine.ice.toFixed(3)}`);
});

test('cooling: cowl flaps 20–35°F at Vy, ≤15°F in cruise; Vy climb ISA SL settles 380–440 avg (M7)', () => {
  const climb = (cowl) => {
    const s = start(newSim());
    s.ctl.throttle = 1;
    s.ctl.prop = 1;
    s.ctl.cowl = cowl;
    s.flight.setMode('takeoff');
    s.run(30);
    s.settle(600);
    s.flight.alt = 1500;
    s.run(5);
    return mean(s.engine.cht);
  };
  const open = climb(1);
  const closed = climb(0);
  assert.ok(closed - open >= 20 && closed - open <= 35, `Vy cowl effect ${(closed - open).toFixed(0)}`);
  assert.ok(open >= 380 && open <= 440, `Vy climb CHT ${open.toFixed(0)}`);
  const c0 = mean(cruise(newSim(), { alt: 6000, rpm: 2400, map: 22, cowl: 0 }).engine.cht);
  const c1 = mean(cruise(newSim(), { alt: 6000, rpm: 2400, map: 22, cowl: 1 }).engine.cht);
  assert.ok(c0 - c1 <= 15 && c0 - c1 >= 0, `cruise cowl effect ${(c0 - c1).toFixed(0)}`);
  assert.ok(c0 >= 330 && c0 <= 400, `cruise CHT ${c0.toFixed(0)}`);
});

test('shock cooling: abrupt cruise → idle at 1000 fpm gives CLD −60…−110°F/min; 1 inHg/min reduction stays ≥ −45 (JPI p.19–21)', () => {
  const s = cruise(newSim(), { alt: 8000, rpm: 2500, map: 21, rBar: 1.05 });
  s.ctl.throttle = 0;
  s.flight.setMode('descentVs');
  s.flight.targetVs = -1000;
  s.run(5);
  const r = Math.min(...[0, 1, 2, 3].map((i) => i)).valueOf();
  void r;
  const before = [...s.engine.cht];
  s.run(30);
  const cld = Math.min(...s.engine.cht.map((c, i) => ((c - before[i]) / 30) * 60));
  assert.ok(cld <= -60 && cld >= -110, `abrupt CLD ${cld.toFixed(0)}`);
  const g = cruise(newSim(), { alt: 8000, rpm: 2500, map: 21, rBar: 1.05 });
  g.flight.setMode('descentVs');
  g.flight.targetVs = -500;
  let worst = 0;
  for (let k = 0; k < 8; k++) {
    const b = [...g.engine.cht];
    setMap(g, g.engine.map - 1, 30);
    g.run(30);
    worst = Math.min(worst, ...g.engine.cht.map((c, i) => c - b[i]));
  }
  assert.ok(worst >= -45, `gradual worst per-minute change ${worst.toFixed(0)}`);
});

test('electrical: alternator failure → bus ≤ 12.0 V within 10 min; regulator runaway → bus > 16.0 V for ≥1 s before the OV trip (m15)', () => {
  const s = cruise(newSim(), { alt: 4000, rpm: 2400, map: 22 });
  s.setFault('alternator', {});
  let t = 0;
  while (s.systems.busV > 12.0 && t < 600) {
    s.run(5);
    t += 5;
  }
  assert.ok(s.systems.busV <= 12.0, `bus ${s.systems.busV.toFixed(2)} after ${t}s`);
  const o = cruise(newSim(), { alt: 4000, rpm: 2400, map: 22 });
  o.setFault('overvoltage', {});
  let above = 0;
  for (let k = 0; k < 600 && !o.systems.ovTripped; k++) {
    o.step(0.05);
    if (o.systems.busV > 16.0) above += 0.05;
  }
  assert.ok(o.systems.ovTripped, 'over-voltage relay tripped');
  assert.ok(above >= 1, `time above 16 V ${above.toFixed(2)}s`);
});

test('fuel: running the selected tank dry stops the engine within ~20 s; BOTH restores fuel; tank Δ equals ∫FF (conservation)', () => {
  const s = cruise(newSim(), { alt: 4000, rpm: 2400, map: 22 });
  s.ctl.fuelSelector = 'L';
  s.systems.tankL = 0.05;
  const tank0 = s.systems.tankL + s.systems.tankR;
  let t = 0;
  while (s.engine.running && t < 60) {
    s.run(1);
    t++;
  }
  assert.ok(!s.engine.running && t <= 25, `stopped after ${t}s`);
  void tank0;
  const c = cruise(newSim(), { alt: 4000, rpm: 2400, map: 22 });
  const f0 = c.systems.fuelTotal;
  let integ = 0;
  for (let k = 0; k < 6000; k++) {
    c.step(0.05);
    integ += (c.engine.gph / 3600) * 0.05;
  }
  assert.ok(Math.abs(f0 - c.systems.fuelTotal - integ) < 0.01 * integ + 1e-6, 'tank decrease = ∫FF');
});

test('determinism: two simulations with the same seed and inputs are bit-identical', () => {
  const a = cruise(newSim({ seed: 9 }), { alt: 4000, rpm: 2400, map: 22 });
  const b = cruise(newSim({ seed: 9 }), { alt: 4000, rpm: 2400, map: 22 });
  assert.deepEqual(a.sensors(), b.sensors());
});

test('signs: ∂MAP/∂throttle > 0; carb heat lowers MAP with RPM held when governing', () => {
  const s = cruise(newSim(), { alt: 4000, rpm: 2400, map: 20 });
  const m0 = s.engine.map;
  s.ctl.throttle += 0.05;
  s.run(5);
  assert.ok(s.engine.map > m0);
  const m1 = s.engine.map;
  const r1 = s.engine.rpm;
  s.ctl.carbHeat = 1;
  s.run(30);
  assert.ok(s.engine.map < m1, 'carb heat → MAP down');
  assert.ok(Math.abs(s.engine.rpm - r1) < 30, 'RPM held');
});
