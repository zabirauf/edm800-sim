// Prints the calibration figures used in docs/08-CALIBRATION-REPORT.md.
import { FIT } from '../src/sim/fitted.js';
import { Simulation } from '../src/sim/index.js';
import { setupCruise, setupGroundWarm, startEngine, setRpmGround, leanToRbar, setMap, GOV } from '../src/sim/pilot.js';
const f = (v, d = 1) => Number(v).toFixed(d);
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const out = {};
out.fit = FIT;
{ const s = new Simulation(); startEngine(s); s.ctl.throttle = 1; s.run(15); out.staticRpm = s.engine.rpm; out.staticMap = s.engine.map; out.staticGph = s.engine.gph;
  s.flight.setMode('takeoff'); s.run(40); out.toGph = s.engine.gph; out.toEgt = s.engine.egtProbe.map((x) => f(x, 0)); }
{ const s = new Simulation(); setupGroundWarm(s, 1000); setRpmGround(s, 1800, 2); const b = s.engine.rpm; out.runupMap = s.engine.map; s.ctl.mags = 'R'; s.run(10); out.magDrop = b - s.engine.rpm; s.ctl.mags = 'BOTH'; s.run(8); s.ctl.carbHeat = 1; s.run(15); out.heatDropRunup = b - s.engine.rpm; }
{ const s = new Simulation(); startEngine(s); s.ctl.throttle = 0; s.run(30); out.idle = [s.engine.rpm, s.engine.map, s.engine.gph]; }
{ const s = new Simulation(); setupCruise(s, { alt: 6000, rpm: 2400, map: 22, rBar: 1.05 }); const t = s.truth(); out.cruise = { pct: t.pctTrue, pohLabel: t.pctTrue * FIT.engine.kPOH, ktas: t.tas, gph: t.gph, egt: s.engine.egtProbe.map((x) => f(x, 0)), cht: s.engine.cht.map((x) => f(x, 0)), oil: s.engine.oil, dif: Math.max(...s.engine.egtProbe) - Math.min(...s.engine.egtProbe), crb: s.engine.crb };
  s.ctl.carbHeat = 1; s.run(20); out.heatRise75 = s.engine.heatRise; }
{ const s = new Simulation(); startEngine(s); s.ctl.throttle = 1; s.ctl.cowl = 1; s.flight.setMode('takeoff'); s.run(30); s.settle(600); s.flight.alt = 1500; s.run(5); out.vyCht = s.engine.cht.map((x) => f(x, 0)); out.vyOil = s.engine.oil; }
console.log(JSON.stringify(out, (k, v) => (typeof v === 'number' ? Number(v.toFixed(3)) : v), 1));
