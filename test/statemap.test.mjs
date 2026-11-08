// The state-machine map is discovered by exploring the real machine. These tests check that it is complete (every
// reachable state is in it), correct (documented transitions and timer values), and that its routes really work.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exploreStateMachine, cruiseSensors, applyAction } from '../src/edm/explore.js';
import { EDM } from '../src/edm/machine.js';
import { T } from '../src/edm/constants.js';
import { CARDINAL_EDM_CONFIG } from '../src/sim/pilot.js';
import { buildStateMap, routeBetween } from '../web/statemap.js';

const X = exploreStateMachine({ config: CARDINAL_EDM_CONFIG });
const MAP = buildStateMap(X);
const has = (from, to, action) => X.edges.some((e) => e.from === from && e.to === to && (action == null || e.action === action));
const edge = (from, to, action) => X.edges.find((e) => e.from === from && e.to === to && (action == null || e.action === action));

test('map: every state of the Cardinal installation is found; options it lacks are not', () => {
  const withAux = new EDM({ config: CARDINAL_EDM_CONFIG });
  withAux.settings.auxEnabled = true; // AUX= appears once AUX? is set to Y
  const lim = withAux._limItems();
  const expected = [
    'OFF', 'TANK_SETUP.MAIN', 'TANK_SETUP.AUXQ', 'TANK_SETUP.AUX', 'SELFTEST.SEGMENTS', 'SELFTEST.COLUMNS',
    'STARTUP_INFO.DATE', 'STARTUP_INFO.TIME', 'STARTUP_INFO.FULL', 'STARTUP_INFO.ID', 'FUEL_FILL.BANNER', 'FUEL_FILL.SEL', 'FUEL_FILL.ADD',
    'MANUAL', 'AUTO', 'LEANFIND.ARMED', 'LEANFIND.ACTIVE', 'LEANFIND.LEANEST', 'LEANFIND.ROP_SET', 'LEANFIND.LOP_DONE', 'LEANFIND.LOP_REVIEW',
    'PROGRAM.BANNER', ...['FUEL', 'RATE', 'OATU', 'EGT1', 'HPQ', 'KF', 'ACCUM', 'GPSC', 'DUMP', 'END'].map((i) => `PROGRAM.ITEM.${i}`),
    ...['OAT_CAL', 'ADJUST', 'HPC', 'MAP_CAL', 'KF_EDIT', 'DUMP_XFER', 'SAVE_D', 'LTM_ID_EDIT', 'FACLIM_BANNER', 'EC_EDIT'].map((s) => `PROGRAM.${s}`),
    ...['TIME', 'MNTH', 'DAY', 'YEAR', 'HOUR', 'MIN', 'ID', 'END'].map((s) => `PROGRAM.LTM.${s}`),
    ...lim.map((s) => `PROGRAM.FACLIM.${s}`),
    'USB.MENU', 'USB.XFER', 'USB.DONE',
  ];
  for (const p of expected) assert.ok(X.nodes.has(p), `missing ${p}`);
  assert.equal(X.nodes.size, expected.length, `unexpected extra states: ${[...X.nodes.keys()].filter((p) => !expected.includes(p))}`);
  for (const p of ['PROGRAM.ORIG_TIT', 'PROGRAM.CAL_TIT', 'SELFTEST.PROBES']) assert.ok(!X.nodes.has(p), `${p} should not exist without that option/fault`);
});

test('map: the documented statechart transitions are all there (docs/04, spec)', () => {
  const T_ = [
    ['OFF', 'SELFTEST.SEGMENTS', 'power on'], ['OFF', 'TANK_SETUP.MAIN', 'power on, STEP held'],
    ['AUTO', 'MANUAL', 'tap STEP'], ['MANUAL', 'AUTO', 'timer'],
    ['AUTO', 'LEANFIND.ARMED', 'tap LF'], ['MANUAL', 'LEANFIND.ARMED', 'tap LF'],
    ['LEANFIND.ARMED', 'AUTO', 'tap STEP'], ['LEANFIND.ACTIVE', 'AUTO', 'tap STEP'], ['LEANFIND.ROP_SET', 'AUTO', 'tap STEP'],
    ['LEANFIND.ARMED', 'LEANFIND.ACTIVE', null], ['LEANFIND.ACTIVE', 'LEANFIND.LEANEST', null], ['LEANFIND.LEANEST', 'LEANFIND.ROP_SET', 'timer'],
    ['LEANFIND.ACTIVE', 'LEANFIND.LOP_DONE', null], ['LEANFIND.LOP_DONE', 'LEANFIND.LOP_REVIEW', 'tap LF'], ['LEANFIND.LOP_REVIEW', 'LEANFIND.ARMED', 'tap LF'],
    ['AUTO', 'PROGRAM.BANNER', 'hold STEP+LF 5 s'], ['MANUAL', 'PROGRAM.BANNER', 'hold STEP+LF 5 s'],
    ['PROGRAM.BANNER', 'PROGRAM.ITEM.FUEL', 'timer'], ['PROGRAM.ITEM.FUEL', 'FUEL_FILL.SEL', 'tap STEP'], ['PROGRAM.ITEM.FUEL', 'PROGRAM.ITEM.RATE', 'tap STEP'],
    ['PROGRAM.ITEM.HPQ', 'PROGRAM.ADJUST', 'hold STEP+LF 5 s'], ['PROGRAM.ADJUST', 'PROGRAM.HPC', 'timer'], ['PROGRAM.HPC', 'PROGRAM.ADJUST', 'hold STEP+LF 5 s'],
    ['PROGRAM.ADJUST', 'PROGRAM.MAP_CAL', 'timer'], ['PROGRAM.ITEM.KF', 'PROGRAM.KF_EDIT', 'hold STEP+LF 5 s'], ['PROGRAM.KF_EDIT', 'PROGRAM.ITEM.KF', 'hold STEP+LF 5 s'],
    ['PROGRAM.ITEM.DUMP', 'PROGRAM.LTM.TIME', 'hold STEP+LF 5 s'], ['PROGRAM.ITEM.END', 'PROGRAM.FACLIM_BANNER', 'hold STEP+LF 5 s'],
    ['PROGRAM.ITEM.END', 'AUTO', 'tap STEP'], ['PROGRAM.ITEM.END', 'MANUAL', 'tap STEP'],
    ['AUTO', 'USB.MENU', 'insert USB drive'], ['MANUAL', 'USB.MENU', 'insert USB drive'], ['USB.MENU', 'AUTO', 'remove USB drive'], ['USB.MENU', 'MANUAL', 'remove USB drive'],
    ['FUEL_FILL.SEL', 'MANUAL', 'tap STEP'],
  ];
  for (const [f, t, a] of T_) assert.ok(has(f, t, a ?? undefined), `${f} --${a}--> ${t}`);
});

test('map: timer transitions carry the machine’s own durations, measured from entering the state', () => {
  assert.equal(edge('SELFTEST.SEGMENTS', 'SELFTEST.COLUMNS', 'timer').ms, T.SELFTEST_SEGMENTS);
  assert.equal(edge('LEANFIND.LEANEST', 'LEANFIND.ROP_SET', 'timer').ms, T.LEANEST);
  assert.equal(edge('PROGRAM.BANNER', 'PROGRAM.ITEM.FUEL', 'timer').ms, T.PROGRAM_BANNER);
  assert.equal(edge('PROGRAM.ADJUST', 'PROGRAM.HPC', 'timer').ms, T.ADJUST);
  assert.equal(edge('FUEL_FILL.BANNER', 'FUEL_FILL.SEL', 'timer').ms, T.FUEL_BANNER);
  assert.equal(edge('STARTUP_INFO.DATE', 'STARTUP_INFO.TIME', 'timer').ms, T.STARTUP_INFO);
  assert.ok(edge('MANUAL', 'AUTO', 'timer').ms <= T.AUTO_AFTER_POWER);
  assert.equal(MAP.transitions.find((t) => t.from === 'MANUAL' && t.to === 'AUTO').label, '2 min after power-up');
});

test('map: time passing during a button hold is not reported as a button transition', () => {
  // a button edge that goes exactly where the state's own timer goes would be the timer, not the button
  for (const tm of X.edges.filter((x) => x.action === 'timer')) {
    const fake = X.edges.filter((x) => x.kind === 'button' && x.from === tm.from && x.to === tm.to);
    assert.deepEqual(fake.map((x) => x.action), [], `${tm.from} → ${tm.to}`);
  }
});

test('map: conditional branches are labelled with what decides them', () => {
  const lab = (f, t) => MAP.transitions.find((x) => x.from === f && x.to === t && x.action === 'tap STEP').when;
  assert.match(lab('PROGRAM.ITEM.FUEL', 'FUEL_FILL.SEL'), /FUEL\? Y/);
  assert.match(lab('PROGRAM.ITEM.FUEL', 'PROGRAM.ITEM.RATE'), /FUEL\? N/);
  assert.match(lab('PROGRAM.ITEM.END', 'AUTO'), /END Y.*Automatic/);
  assert.match(MAP.transitions.find((x) => x.from === 'AUTO' && x.to === 'LEANFIND.LOP_REVIEW').when, /lean-of-peak result stored/);
  assert.match(MAP.transitions.find((x) => x.from === 'PROGRAM.ADJUST' && x.to === 'PROGRAM.MAP_CAL').when, /MAP cal/);
});

test('map: complete — a long random walk on a real EDM never visits a state missing from the map', () => {
  let seed = 7;
  const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const e = new EDM({ config: CARDINAL_EDM_CONFIG });
  e.send({ type: 'SENSORS', data: cruiseSensors() });
  const labels = ['tap STEP', 'tap LF', 'tap STEP+LF', 'hold STEP', 'hold LF', 'hold LF 3 s', 'hold STEP+LF 5 s', 'hold STEP 5 s', 'timer', 'insert USB drive', 'remove USB drive', 'connect memory box'];
  const visited = new Set();
  for (let k = 0; k < 3000; k++) {
    if (e.state === 'OFF') applyAction(e, rnd() < 0.2 ? 'power on, STEP held' : 'power on');
    else if (e.state === 'LEANFIND' && e.ctx.lf.phase === 'ARMED' && rnd() < 0.5) applyAction(e, 'lean: an EGT rises 15°F');
    else if (e.state === 'LEANFIND' && e.ctx.lf.phase === 'ACTIVE' && rnd() < 0.5) applyAction(e, rnd() < 0.5 ? 'keep leaning: first cylinder peaks' : 'keep leaning: every cylinder peaks');
    else if (rnd() < 0.01) applyAction(e, 'power off');
    else applyAction(e, labels[Math.floor(rnd() * labels.length)]);
    if (e.state === 'LEANFIND') e.send({ type: 'SENSORS', data: cruiseSensors() }); // reset the leaning ramps now and then
    visited.add(e._path());
  }
  const missing = [...visited].filter((p) => !X.nodes.has(p));
  assert.deepEqual(missing, []);
  assert.ok(visited.size >= 30, `walk covered ${visited.size} states`);
});

test('map: a route the map suggests, replayed on a real EDM, arrives where it says', () => {
  for (const target of ['PROGRAM.FACLIM.HCHT', 'PROGRAM.MAP_CAL', 'LEANFIND.LOP_REVIEW', 'USB.DONE', 'PROGRAM.LTM_ID_EDIT', 'FUEL_FILL.ADD', 'PROGRAM.FACLIM.AUX']) {
    const e = new EDM({ config: CARDINAL_EDM_CONFIG });
    e.send({ type: 'SENSORS', data: cruiseSensors() });
    const route = routeBetween(MAP, 'OFF', target);
    assert.ok(route, `no route to ${target}`);
    for (const step of route) applyAction(e, step.action);
    assert.equal(e._path(), target, `route to ${target}: ${route.map((r) => r.action).join(' > ')}`);
  }
});

test('map: layout — no two states overlap, every state sits inside its group, the explorer is deterministic', () => {
  const ns = [...MAP.nodes.values()];
  for (let i = 0; i < ns.length; i++) {
    for (let j = i + 1; j < ns.length; j++) {
      const a = ns[i];
      const b = ns[j];
      assert.ok(!(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h), `${a.id} overlaps ${b.id}`);
    }
  }
  for (const n of ns) {
    const g = MAP.groups.get(n.group);
    assert.ok(n.x >= g.x && n.y >= g.y && n.x + n.w <= g.x + g.w && n.y + n.h <= g.y + g.h, `${n.id} outside ${g.id}`);
  }
  const Y = exploreStateMachine({ config: CARDINAL_EDM_CONFIG });
  assert.deepEqual([...Y.nodes.keys()].sort(), [...X.nodes.keys()].sort());
  assert.deepEqual(Y.edges.map((e) => `${e.from}>${e.action}>${e.to}`).sort(), X.edges.map((e) => `${e.from}>${e.action}>${e.to}`).sort());
});

test('map: a route can start from a live machine whose exact context the explorer never explored', async () => {
  const { variantKey } = await import('../src/edm/explore.js');
  const e = new EDM({ config: CARDINAL_EDM_CONFIG });
  e.send({ type: 'SENSORS', data: { ...cruiseSensors(), bat: 13.1, oat: 12 } }); // different readings than the explorer used
  applyAction(e, 'power on');
  for (let k = 0; k < 12 && e._path() !== 'MANUAL'; k++) applyAction(e, e._path() === 'FUEL_FILL.SEL' ? 'tap STEP' : 'timer');
  for (let k = 0; k < 9; k++) applyAction(e, 'tap STEP'); // walk the manual scan to some item
  const route = routeBetween(MAP, e._path(), 'PROGRAM.BANNER', variantKey(e));
  assert.ok(route && route.length, 'route found');
  route.forEach((s) => applyAction(e, s.action));
  assert.equal(e._path(), 'PROGRAM.BANNER');
});
