// The "Explain" feature: every explanation must agree with what the instrument is actually showing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/index.js';
import { makeEdm, Link, setupCruise, bootEdm } from '../src/sim/pilot.js';
import { explainDisplay } from '../web/explain.js';

function cruise({ seed = 3, mode = 'AUTO', rBar = 1.08 } = {}) {
  const sim = new Simulation({ seed });
  setupCruise(sim, { alt: 6000, rpm: 2400, map: 22, rBar });
  const edm = makeEdm();
  const link = new Link(sim, edm);
  bootEdm(link, mode);
  return { sim, edm, link, ex: () => explainDisplay({ edm, sim }) };
}
const part = (ex, key) => ex.parts.find((p) => p.key === key);
const text = (p) => [p.shown, p.subtitle, ...p.lines, ...p.notes.map((n) => n.text), ...(p.columns || []).flatMap((c) => [...c.lines, ...c.notes.map((n) => n.text)])].join(' \n ');

test('explain: off — every part says the instrument is dark', () => {
  const sim = new Simulation({ seed: 1 });
  const edm = makeEdm();
  const ex = explainDisplay({ edm, sim });
  assert.match(ex.headline, /off/);
  assert.match(text(part(ex, 'digital')), /no power/);
  assert.equal(part(ex, 'alarm').shown, 'off');
  assert.deepEqual(ex.behind, []);
});

test('explain: every part is numbered 1..n and has a title and at least one line', () => {
  const { ex } = cruise();
  const e = ex();
  e.parts.forEach((p, i) => {
    assert.equal(p.n, i + 1);
    assert.ok(p.title && p.lines.length, p.key);
  });
  assert.deepEqual(e.parts.map((p) => p.key), ['digital', 'upper', 'bars', 'chtscale', 'dot', 'view', 'units', 'alarm', 'legend']);
});

test('explain: every installed scan item has its own explanation that quotes the displayed value', () => {
  const { edm, link, ex } = cruise({ mode: 'MANUAL' });
  const seen = new Set();
  for (let k = 0; k < 30 && !seen.has(edm.vol.item); k++) {
    seen.add(edm.vol.item);
    const e = ex();
    const d = part(e, 'digital');
    const shown = edm.getDisplay().digital.text.trim();
    assert.equal(d.shown, shown);
    assert.ok(d.subtitle, `${edm.vol.item} has a named explanation`);
    const value = shown.split(' ')[0];
    assert.ok(text(d).includes(value), `${edm.vol.item}: explanation mentions ${value}`);
    assert.match(text(d), /Manual mode/);
    link.tap('STEP');
  }
  for (const id of ['BAT', 'OAT', 'CRB', 'DIF', 'RPMMAP', 'REM', 'GPH', 'USD', 'HM', 'EGT1', 'EGT4', 'OIL', 'CLD']) assert.ok(seen.has(id), `${id} visited`);
});

test('explain: EGT/CHT item — names the cylinder, matches the dot, and both numbers', () => {
  const { edm, link, ex } = cruise({ mode: 'MANUAL' });
  while (edm.vol.item !== 'EGT3') link.tap('STEP');
  const e = ex();
  const [egt, cht] = edm.getDisplay().digital.text.trim().split(/\s+/);
  const d = text(part(e, 'digital'));
  assert.match(d, /cylinder 3/);
  assert.ok(d.includes(`${egt} = exhaust gas temperature`), d);
  assert.ok(d.includes(`${cht} = cylinder head temperature`), d);
  assert.equal(part(e, 'dot').shown, 'under 3');
  assert.match(text(part(e, 'dot')), /cylinder 3/);
});

test('explain: bar graph — segment counts and CHT segment positions match the display columns', () => {
  const { edm, ex } = cruise();
  const e = ex();
  const cols = edm.getDisplay().columns;
  const bars = part(e, 'bars');
  assert.equal(bars.columns.length, cols.length);
  cols.forEach((col, i) => {
    const t = bars.columns[i].lines.join(' ');
    assert.ok(t.includes(`${col.segs} of 13 segments`), `${col.id}: ${t}`);
    if (/^\d$/.test(col.id) && col.chtSeg) {
      assert.ok(t.includes(`segment ${col.chtSeg} (`), t);
      assert.match(t, col.chtSeg <= col.segs ? /dark gap inside/ : /single lit segment outside/);
    }
  });
  assert.match(bars.columns.at(-1).title, /oil/i);
  assert.match(bars.lines[0], /Percentage view/);
  assert.match(bars.lines[0], /1650°F/);
});

test('explain: Normalize view — NRM lit, 10°F per segment', () => {
  const { link, ex } = cruise();
  link.hold('LF', 3.2);
  const e = ex();
  assert.match(part(e, 'view').shown, /Normalize/);
  assert.match(part(e, 'bars').lines[0], /10°F/);
});

test('explain: excluded item — the decimal point is explained', () => {
  const { edm, link, ex } = cruise({ mode: 'MANUAL' });
  while (edm.vol.item !== 'OIL') link.tap('STEP');
  link.tapBoth();
  assert.match(edm.getDisplay().digital.text, /\.OIL/);
  assert.match(text(part(ex(), 'digital')), /excluded from the automatic scan/);
});

test('explain: %HP window — percentage converted to horsepower, >75 % warns about leaning to peak', () => {
  const { edm, ex } = cruise();
  const up = part(ex(), 'upper');
  const pct = Number.parseInt(edm.getDisplay().upper.text, 10);
  assert.ok(up.lines[0].startsWith(`${pct} HP = ${pct} % of rated power`));
  assert.ok(up.lines[0].includes(`about ${Math.round((pct / 100) * 180)} of`));
  const hi = cruise({ seed: 4 });
  hi.sim.ctl.throttle = 1;
  hi.sim.ctl.prop = 1;
  hi.link.run(20);
  const pHi = Number.parseInt(hi.edm.getDisplay().upper.text, 10);
  if (pHi > 75) assert.ok(part(hi.ex(), 'upper').notes.some((n) => /75 %/.test(n.text)));
});

test('explain: LeanFind — armed, active, LEANEST and SET are each explained with the locked cylinder', () => {
  const { sim, edm, link, ex } = cruise({ rBar: 1.12 });
  link.tap('LF');
  assert.match(text(part(ex(), 'digital')), /LeanFind armed, rich-of-peak/);
  assert.match(text(part(ex(), 'digital')), /pre-lean to about 50°F rich of peak/);
  const phases = new Set();
  let leanestText = '';
  for (let t = 0; t < 120 && edm.getState().leanfind?.phase !== 'ROP_SET'; t += 0.5) {
    sim.ctl.mixture = Math.max(0.05, sim.ctl.mixture - 0.0045);
    link.run(0.5);
    const ph = edm.getState().leanfind?.phase;
    phases.add(ph);
    if (ph === 'ACTIVE') assert.match(text(part(ex(), 'digital')), /hottest cylinder/);
    if (ph === 'LEANEST') leanestText = text(part(ex(), 'digital'));
  }
  assert.ok(phases.has('ACTIVE') && phases.has('LEANEST'), [...phases].join());
  const lock = Number(edm.ctx.lf.lock) + 1;
  assert.match(leanestText, new RegExp(`LEANEST = the first cylinder to peak has been found: cylinder ${lock}`));
  link.run(2.5);
  assert.equal(edm.getState().leanfind.phase, 'ROP_SET');
  const set = text(part(ex(), 'digital'));
  assert.match(set, new RegExp(`current EGT of cylinder ${lock}`));
  assert.match(set, /100°F rich of peak/);
  assert.match(text(part(ex(), 'dot')), /locked/);
  // while LF is held the window shows the peak
  link.press('LF');
  link.run(1);
  assert.match(text(part(ex(), 'digital')), /while you hold LF: the peak EGT/);
  link.release('LF');
});

test('explain: alarm — overlay, light, limit and the silencing rules; then silenced and still present', () => {
  const { sim, edm, link, ex } = cruise();
  sim.setFault('overvoltage', {});
  link.run(60, () => !edm.vol.alarmDisplayed);
  assert.equal(edm.vol.alarmDisplayed, 'BATH');
  let e = ex();
  const d = text(part(e, 'digital'));
  assert.match(d, /ALARM — High voltage/);
  assert.match(d, /16\.0 V/);
  assert.match(d, /Tap STEP to silence it for 10 minutes/);
  assert.equal(part(e, 'alarm').shown, 'ON');
  link.tap('STEP');
  e = ex();
  assert.equal(part(e, 'alarm').shown, 'off');
  assert.ok(part(e, 'alarm').notes.some((n) => /still present but silenced for another 10 min/.test(n.text)));
});

test('explain: holding STEP until OFF is explained as silenced for the rest of the flight', () => {
  const { edm, link, ex } = cruise();
  edm.settings.limits.hbat = 14.0; // a condition that persists: the normal 14.2 V bus is now "high"
  link.run(10, () => !edm.vol.alarmDisplayed);
  assert.equal(edm.vol.alarmDisplayed, 'BATH');
  link.press('STEP');
  link.run(5.2);
  link.release('STEP');
  link.run(0.1);
  const d = part(ex(), 'digital');
  assert.equal(d.shown, 'OFF');
  assert.match(text(d), /rest of this flight/);
  assert.ok(part(ex(), 'alarm').notes.some((n) => /rest of the flight/.test(n.text)));
});

test('explain: power-up — self-test segments, then the fuel question', () => {
  const sim = new Simulation({ seed: 2 });
  setupCruise(sim, { alt: 6000, rpm: 2400, map: 22, rBar: 1.08 });
  const edm = makeEdm();
  const link = new Link(sim, edm);
  sim.ctl.master = false;
  link.step();
  sim.ctl.master = true;
  link.run(0.5);
  let e = explainDisplay({ edm, sim });
  assert.match(e.headline, /self-test/);
  assert.match(text(part(e, 'digital')), /Every segment/);
  link.run(20, () => !/^FUEL_FILL\.SEL/.test(edm.getState().path));
  e = explainDisplay({ edm, sim });
  assert.equal(part(e, 'digital').shown, 'FILL? N');
  assert.match(e.buttons.title, /fuel/i);
});

test('explain: programming mode uses the per-item help', () => {
  const { link, edm, ex } = cruise();
  link.holdBoth();
  link.run(2.5);
  assert.equal(edm.getState().state, 'PROGRAM');
  const e = ex();
  assert.match(e.headline, /programming/);
  assert.ok(part(e, 'digital').lines.length > 0);
});

test('explain: behind the instrument — names the truly leanest cylinder and true power', () => {
  const { sim, ex } = cruise();
  const b = ex().behind.join(' ');
  const r = sim.truth().r;
  assert.match(b, new RegExp(`Cylinder ${r.indexOf(Math.min(...r)) + 1} is the leanest`));
  assert.match(b, /True power: \d+ % of 180 HP/);
});

test('explain: LEAN L warns that lean of peak is not for the carbureted O-360', () => {
  const { link, edm, ex } = cruise();
  link.tap('LF');
  link.holdBoth(5.2);
  assert.equal(edm.ctx.lf.method, 'L');
  assert.ok(part(ex(), 'digital').notes.some((n) => n.level === 'warn' && /float carburetor/.test(n.text)));
});

test('explain: during a DIF alarm the dot is explained as the most deviating cylinder, not as its EGT', () => {
  const { edm, link, ex } = cruise();
  edm.settings.limits.dif = 30;
  link.run(5, () => edm.vol.alarmDisplayed !== 'DIF');
  assert.equal(edm.vol.alarmDisplayed, 'DIF');
  assert.match(text(part(ex(), 'dot')), /furthest from the average/);
});

test('explain: RPM/MAP is described as a 1 s item in the automatic scan', () => {
  const { edm, link, ex } = cruise();
  link.run(60, () => edm.vol.item !== 'RPMMAP');
  assert.equal(edm.vol.item, 'RPMMAP');
  assert.match(text(part(ex(), 'digital')), /stays for 1 s/);
});

test('explain: a CHT above 435°F gets a Lycoming warning; a pre-ignition column is flagged', () => {
  const { sim, edm, ex } = cruise();
  const s = sim.sensors();
  s.cht[1] = 452;
  s.egt[2] = 2100;
  edm.send({ type: 'SENSORS', data: s });
  const bars = part(ex(), 'bars');
  assert.ok(bars.columns[1].notes.some((n) => n.level === 'warn' && /435°F/.test(n.text)));
  assert.ok(bars.columns[2].notes.some((n) => n.level === 'bad' && /pre-ignition/.test(n.text)));
});
