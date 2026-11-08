// EDM-800 trainer: the EDM state machine + the calibrated Cessna 177B / Lycoming O-360 simulation + the UI.
// Simulation and EDM share one fixed 50 ms step (Link); fast-forward advances both and stops on alarms/events.

import { EDM } from '../src/edm/machine.js';
import { defaultSettings } from '../src/edm/settings.js';
import { Simulation, FAULTS } from '../src/sim/index.js';
import { PARAMS, PERSONALITIES } from '../src/sim/calibration.js';
import { FIT } from '../src/sim/fitted.js';
import { MODES } from '../src/sim/flight.js';
import { Link, CARDINAL_EDM_CONFIG, setupCruise, setupGroundWarm, bootEdm } from '../src/sim/pilot.js';
import { SCENARIOS, ScenarioRunner } from '../src/sim/scenarios.js';
import { POH_CRUISE } from '../src/sim/data/poh-cruise.js';
import { Face } from './face.js';
import { initExplain } from './explain-ui.js';
import { createStateMapView } from './statemap-ui.js';
import { helpFor, LESSONS, DIAGNOSIS } from './training.js';
import { REFERENCE_HTML } from './reference.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const STORE = 'edm800-cardinal-trainer-v2';
const HOLD_TARGET = { STEP: 5000, LF: 3000, BOTH: 5000 };
const STEP_MS = 50;
const fmt = (v, d = 0) => (v == null || Number.isNaN(v) ? '—' : Number(v).toFixed(d));
const fToC = (f) => ((f - 32) * 5) / 9;

const app = {
  config: { ...CARDINAL_EDM_CONFIG },
  edm: null,
  sim: null,
  link: null,
  face: null,
  sources: { STEP: new Set(), LF: new Set() },
  pressedAt: { STEP: 0, LF: 0 },
  leanDir: 0,
  thrDir: 0,
  paused: false,
  acc: 0,
  wallNow: 0,
  runner: null,
  lesson: null,
  lessonStep: 0,
  lessonMem: {},
  done: new Set(),
  mystery: null,
  ffBanner: '',
  ffUntil: 0,
};

// ------------------------------------------------------------------ persistence (EDM non-volatile memory)

function loadStored() {
  try {
    return JSON.parse(localStorage.getItem(STORE) || 'null');
  } catch {
    return null;
  }
}
function saveStored() {
  try {
    localStorage.setItem(STORE, JSON.stringify({ config: app.config, settings: app.edm.settings, done: [...app.done] }));
  } catch {
    /* storage unavailable */
  }
}

// ------------------------------------------------------------------ construction

function makeEdmFor(config, settings) {
  const s = settings ?? defaultSettings(config, Date.now());
  return new EDM({ config: { ...CARDINAL_EDM_CONFIG, ...config, cylinders: 4, tit: 0 }, settings: s });
}

function newSim() {
  const sim = new Simulation({ seed: (Math.random() * 1e9) | 0, personality: $('#in-personality')?.value || 'default' });
  for (const [k, v] of Object.entries(app.paramOverrides || {})) sim.setParam(k, v);
  return sim;
}

function relink(sim, edm) {
  app.sim = sim;
  app.edm = edm;
  app.link = new Link(sim, edm);
  app.edm.send({ type: 'SENSORS', data: sim.sensors() });
}

// ------------------------------------------------------------------ buttons (EDM STEP / LF)

function press(button, source) {
  const set = app.sources[button];
  const was = set.size > 0;
  set.add(source);
  if (!was) {
    app.pressedAt[button] = app.wallNow;
    app.edm.send({ type: 'PRESS', button });
  }
}
function release(button, source) {
  const set = app.sources[button];
  if (!set.has(source)) return;
  set.delete(source);
  if (set.size === 0) app.edm.send({ type: 'RELEASE', button });
}
function releaseAll() {
  for (const b of ['STEP', 'LF']) {
    if (app.sources[b].size) {
      app.sources[b].clear();
      app.edm.send({ type: 'RELEASE', button: b });
    }
  }
}
function bindHwButton(el, button) {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try {
      el.setPointerCapture(e.pointerId); // keep the press if the finger slides off; can throw for a stale pointer id
    } catch {
      /* the press still counts */
    }
    press(button, `ptr${e.pointerId}`);
  });
  const up = (e) => release(button, `ptr${e.pointerId}`);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('lostpointercapture', up);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
function gesture(kind) {
  const [buttons, ms] = { tapBoth: [['STEP', 'LF'], 150], holdBoth: [['STEP', 'LF'], 5300], holdLF: [['LF'], 3200], holdStep: [['STEP'], 5300] }[kind];
  for (const b of buttons) press(b, 'helper');
  setTimeout(() => buttons.forEach((b) => release(b, 'helper')), ms);
}
function bindKeyboard() {
  const keyMap = { s: ['STEP'], l: ['LF'], b: ['STEP', 'LF'] };
  window.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea') || document.querySelector('dialog[open]')) return;
    const k = e.key.toLowerCase();
    if (keyMap[k]) {
      if (!e.repeat) keyMap[k].forEach((b) => press(b, `key-${k}`));
      e.preventDefault();
    } else if (e.key === 'ArrowDown') app.leanDir = -1;
    else if (e.key === 'ArrowUp') app.leanDir = 1;
    else if (e.key === 'PageUp') app.thrDir = 1;
    else if (e.key === 'PageDown') app.thrDir = -1;
    else if (k === 'p' && !e.repeat) togglePause();
    else return;
    e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (keyMap[k]) keyMap[k].forEach((b) => release(b, `key-${k}`));
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') app.leanDir = 0;
    if (e.key === 'PageUp' || e.key === 'PageDown') app.thrDir = 0;
  });
  window.addEventListener('blur', () => {
    releaseAll();
    app.leanDir = 0;
    app.thrDir = 0;
  });
}

// ------------------------------------------------------------------ power / set-ups (also used by lessons, scenarios)

function setMaster(on) {
  const s = app.sim;
  if (on === s.ctl.master) return;
  s.ctl.master = on;
  if (on) {
    const hold = $('#chk-step-at-power').checked;
    if (hold) app.edm.send({ type: 'PRESS', button: 'STEP' });
    app.edm.send({ type: 'POWER_ON' });
    if (hold) {
      app.edm.send({ type: 'RELEASE', button: 'STEP' });
      $('#chk-step-at-power').checked = false;
    }
  } else {
    releaseAll();
    app.edm.send({ type: 'POWER_OFF' });
  }
}

function coldAircraft({ rem } = {}) {
  endScenario();
  const sim = newSim();
  applyEnvironment(sim);
  sim.engine.reset(sim.atm.t);
  app.edm.send({ type: 'POWER_OFF' });
  relink(sim, app.edm);
  if (rem != null) app.edm.settings.rem = rem;
  syncControlsUi();
}

function bootTo(mode = 'AUTO', phase = 'cruise', opts = {}) {
  endScenario();
  const sim = newSim();
  if (phase === 'runup') setupGroundWarm(sim, 1000);
  else if (phase === 'cruise') setupCruise(sim, { alt: 6000, rpm: 2400, map: 22, rBar: 1.08, ...opts });
  relink(sim, app.edm);
  bootEdm(app.link, mode);
  syncControlsUi();
}

function applyEnvironment(sim) {
  sim.env.isaDev = Number($('#in-isa').value) || 0;
  sim.env.rh = (Number($('#in-rh').value) || 0) / 100;
  sim.flight.wind = Number($('#in-wind').value) || 0;
  const fe = Number($('#in-field').value) || 0;
  if (sim.flight.onGround) {
    sim.flight.fieldElev = fe;
    sim.flight.alt = fe;
  }
}

function setFault(id, spec) {
  app.sim.setFault(id, spec);
  syncFaultUi();
}

// ------------------------------------------------------------------ time: pause, fast-forward

function togglePause() {
  app.paused = !app.paused;
  $('#btn-pause').textContent = app.paused ? 'Resume' : 'Pause';
}

function stepOnce() {
  app.link.step(STEP_MS / 1000);
  app.runner?.tick(STEP_MS / 1000);
}

function fastForward(seconds) {
  releaseAll();
  const seen = new Set();
  const a0 = app.edm.vol.alarmActive;
  if (a0) seen.add(a0);
  const step0 = app.runner?.stepIdx;
  const notes0 = app.runner?.notes.length;
  let t = 0;
  let reason = '';
  while (t < seconds) {
    stepOnce();
    t += STEP_MS / 1000;
    const a = app.edm.vol.alarmActive;
    if (a && !seen.has(a)) {
      reason = `stopped: ${a} alarm`;
      break;
    }
    if (app.runner && (app.runner.stepIdx !== step0 || app.runner.notes.length !== notes0)) {
      reason = 'stopped: scenario event';
      break;
    }
    if (!app.sim.engine.running && app.sim.ctl.mags !== 'OFF' && app.sim.ctl.master && app.sim.flight.mode !== 'ground') {
      reason = 'stopped: engine stopped';
      break;
    }
  }
  app.ffBanner = `⏩ time compressed +${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')} ${reason}`;
  app.ffUntil = app.wallNow + 4000;
}

// ------------------------------------------------------------------ cockpit controls

function buildCockpitUi() {
  const mode = $('#in-mode');
  mode.innerHTML = Object.entries(MODES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  mode.addEventListener('change', () => {
    const f = app.sim.flight;
    if (mode.value === 'descentIas') f.targetIas = Number($('#in-ias').value);
    f.setMode(mode.value);
    if (mode.value === 'climb' || mode.value === 'descentIas') f.targetIas = Number($('#in-ias').value);
    if (mode.value === 'descentVs') f.targetVs = Number($('#in-vs').value);
  });
  $('#in-ias').addEventListener('change', (e) => (app.sim.flight.targetIas = Number(e.target.value)));
  $('#in-vs').addEventListener('change', (e) => (app.sim.flight.targetVs = Number(e.target.value)));
  $('#in-flaps').addEventListener('change', (e) => (app.sim.flight.flaps = Number(e.target.value)));
  const lever = (id, key) => $(id).addEventListener('input', (e) => (app.sim.ctl[key] = Number(e.target.value)));
  lever('#in-throttle', 'throttle');
  lever('#in-prop', 'prop');
  lever('#in-mixture', 'mixture');
  lever('#in-heat', 'carbHeat');
  lever('#in-cowl', 'cowl');
  $('#in-mags').addEventListener('change', (e) => (app.sim.ctl.mags = e.target.value));
  $('#in-fuel').addEventListener('change', (e) => (app.sim.ctl.fuelSelector = e.target.value));
  $('#chk-alt').addEventListener('change', (e) => (app.sim.ctl.alternator = e.target.checked));
  $('#chk-aux').addEventListener('change', (e) => (app.sim.ctl.auxPump = e.target.checked));
  const start = $('#btn-start');
  start.addEventListener('pointerdown', () => {
    app.sim.ctl.mags = 'START';
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) {
    start.addEventListener(ev, () => {
      if (app.sim.ctl.mags === 'START') app.sim.ctl.mags = 'BOTH';
      $('#in-mags').value = 'BOTH';
    });
  }
  $('#btn-prime').addEventListener('click', () => app.sim.prime());
  $('#btn-cutoff').addEventListener('click', () => (app.sim.ctl.mixture = 0));
  const hold = (btn, dir) => {
    btn.addEventListener('pointerdown', () => (app.leanDir = dir));
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, () => (app.leanDir = 0));
  };
  hold($('#btn-lean'), -1);
  hold($('#btn-enrich'), 1);
  for (const id of ['#in-isa', '#in-rh', '#in-wind', '#in-field']) $(id).addEventListener('change', () => applyEnvironment(app.sim));
  $('#btn-pause').addEventListener('click', togglePause);
  $$('[data-ff]').forEach((b) => b.addEventListener('click', () => fastForward(Number(b.dataset.ff))));
  $$('[data-setup]').forEach((b) =>
    b.addEventListener('click', () => {
      const k = b.dataset.setup;
      if (k === 'cold') coldAircraft();
      else bootTo('AUTO', k);
    }),
  );
}

function syncControlsUi() {
  const c = app.sim.ctl;
  const f = app.sim.flight;
  $('#in-throttle').value = c.throttle;
  $('#in-prop').value = c.prop;
  $('#in-mixture').value = c.mixture;
  $('#in-heat').value = c.carbHeat;
  $('#in-cowl').value = c.cowl;
  $('#in-mags').value = c.mags === 'START' ? 'BOTH' : c.mags;
  $('#in-fuel').value = c.fuelSelector;
  $('#chk-alt').checked = c.alternator;
  $('#chk-aux').checked = c.auxPump;
  $('#in-mode').value = f.mode;
  $('#in-flaps').value = String(f.flaps);
  $('#in-octane').value = String(app.sim.params.octane);
}

// ------------------------------------------------------------------ faults, probes, GPS

const PROBES = ['EGT1', 'EGT2', 'EGT3', 'EGT4', 'CHT1', 'CHT2', 'CHT3', 'CHT4', 'OIL', 'OAT', 'CRB'];

function buildFaultUi() {
  const fl = $('#fault-list');
  fl.innerHTML = Object.entries(FAULTS)
    .map(([id, f]) => {
      const cyl = f.cyl ? `<select data-cyl="${id}">${[0, 1, 2, 3].map((i) => `<option value="${i}">Cyl ${i + 1}</option>`).join('')}</select>` : '<span></span>';
      const sev = f.sev ? `<input type="range" data-sev="${id}" min="0.2" max="1" step="0.1" value="1" title="severity">` : '<span></span>';
      return `<div class="fault-row"><input type="checkbox" data-fault="${id}"><span>${f.label}</span>${cyl}${sev}</div>`;
    })
    .join('');
  const apply = (id) => {
    const cb = fl.querySelector(`[data-fault="${id}"]`);
    const cyl = fl.querySelector(`[data-cyl="${id}"]`);
    const sev = fl.querySelector(`[data-sev="${id}"]`);
    setFault(id, cb.checked ? { cyl: cyl ? Number(cyl.value) : 0, sev: sev ? Number(sev.value) : 1 } : null);
  };
  fl.querySelectorAll('[data-fault]').forEach((cb) => cb.addEventListener('change', () => apply(cb.dataset.fault)));
  fl.querySelectorAll('[data-cyl],[data-sev]').forEach((el) =>
    el.addEventListener('change', () => {
      const id = el.dataset.cyl || el.dataset.sev;
      if (app.sim.faults[id]) apply(id);
    }),
  );
  $('#probe-list').innerHTML = PROBES.map((p) => `<label class="check"><input type="checkbox" data-probe="${p}">${p}</label>`).join('');
  $$('[data-probe]').forEach((cb) =>
    cb.addEventListener('change', () => {
      if (cb.checked) app.sim.failedProbes.add(cb.dataset.probe);
      else app.sim.failedProbes.delete(cb.dataset.probe);
    }),
  );
  $('#in-octane').addEventListener('change', (e) => (app.sim.params.octane = Number(e.target.value)));
  $('#btn-fill-tanks').addEventListener('click', () => {
    app.sim.systems.tankL = 24.5;
    app.sim.systems.tankR = 24.5;
  });
  $('#in-gps').addEventListener('change', (e) => (app.sim.gps.status = e.target.value));
  $('#chk-offcourse').addEventListener('change', (e) => (app.sim.gps.offCourse = e.target.checked));
  $('#in-dist').addEventListener('change', (e) => (app.sim.gps.dist = Number(e.target.value)));
}

function syncFaultUi() {
  $$('[data-fault]').forEach((cb) => {
    const f = app.sim.faults[cb.dataset.fault];
    cb.checked = !!f;
    const cyl = document.querySelector(`[data-cyl="${cb.dataset.fault}"]`);
    if (cyl && f) cyl.value = String(f.cyl);
  });
  $$('[data-probe]').forEach((cb) => (cb.checked = app.sim.failedProbes.has(cb.dataset.probe)));
  $('#in-gps').value = app.sim.gps.status;
  $('#in-dist').value = Math.round(app.sim.gps.dist);
}

// ------------------------------------------------------------------ instructor: personality, parameters, about

function buildInstructorUi() {
  const sel = $('#in-personality');
  sel.innerHTML = Object.entries(PERSONALITIES).map(([k, p]) => `<option value="${k}">${p.label}</option>`).join('');
  sel.addEventListener('change', () => app.sim.setPersonality(sel.value));
  app.paramOverrides = {};
  const list = $('#param-list');
  list.innerHTML = Object.entries(PARAMS)
    .filter(([, d]) => d.range)
    .map(([k, d]) => {
      const [lo, hi] = d.range;
      const step = (hi - lo) / 100;
      return `<div class="param-row"><span class="pname">${k}</span><input type="range" data-param="${k}" min="${lo}" max="${hi}" step="${step}" value="${d.v}">
        <span class="pval mono" id="pv-${k}">${+d.v.toPrecision(4)}</span><span class="tag tag-${d.tag}">${d.tag}</span><span class="pnote">${d.note}</span></div>`;
    })
    .join('');
  list.querySelectorAll('[data-param]').forEach((el) =>
    el.addEventListener('input', () => {
      const k = el.dataset.param;
      app.paramOverrides[k] = Number(el.value);
      app.sim.setParam(k, Number(el.value));
      $(`#pv-${k}`).textContent = String(+Number(el.value).toPrecision(4));
    }),
  );
  const st = FIT.stats;
  const assumed = Object.entries(PARAMS).filter(([, d]) => ['ASSUMED', 'TYPICAL', 'FORUM'].includes(d.tag));
  $('#about').innerHTML = `
    <p>The engine is a physics-structured model of the Lycoming O-360-A1F6D in a Cessna 177B, <b>calibrated to published
    data</b>: the 177B POH cruise table (all 462 cells; fitted on the 2000/6000/10 000 ft sheets, validated on the
    4000/8000/12 000 ft sheets), POH climb tables, the Lycoming O-360 sea-level/altitude power chart, Lycoming fuel-flow
    and mixture curves, and a measured Swiss FOCA test of the same MA-4-5 carburetor.</p>
    <table class="calib"><tr><th>Check</th><th>Result</th></tr>
      <tr><td>POH %BHP (hold-out sheets, RMS)</td><td>${fmt(st.holdout.pctRms, 2)} points</td></tr>
      <tr><td>POH fuel flow (hold-out, RMS)</td><td>${fmt(st.holdout.gphRms, 2)} GPH</td></tr>
      <tr><td>POH true airspeed (hold-out, RMS)</td><td>${fmt(st.ktas.holdRms, 2)} kt</td></tr>
      <tr><td>POH max rate of climb (worst)</td><td>${fmt(st.rocMax, 0)} fpm</td></tr>
      <tr><td>Lycoming full-throttle power vs altitude (worst)</td><td>${fmt(st.ftAltMaxRatioErr * 100, 1)} %</td></tr>
      <tr><td>POH %BHP labels vs Lycoming-chart power</td><td>×${fmt(FIT.engine.kPOH, 3)} (POH optimistic)</td></tr></table>
    <p>Values that could not be sourced are tagged ASSUMED / TYPICAL / FORUM and can be changed above. They are taught as
    relative patterns (Normalize view, DIF, CLD, ΔEGT), not absolute numbers:</p>
    <ul class="assumed">${assumed.map(([k, d]) => `<li><b>${k}</b> (${d.tag}): ${d.note}</li>`).join('')}</ul>
    <p>Biggest open items: absolute EGT/CHT levels, cooling time constants, cowl-flap/airspeed effects and which cylinder
    runs leanest on a given Cardinal — real JPI EDM logs from Cardinal owners would replace these assumptions.</p>`;
}

// ------------------------------------------------------------------ installation

function syncInstallForm() {
  for (const el of $('#install-form').elements) {
    if (!el.name) continue;
    const v = app.config[el.name];
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = String(v);
  }
}
function bindInstallForm() {
  $('#install-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const cfg = { ...app.config };
    for (const el of e.target.elements) {
      if (!el.name) continue;
      if (el.type === 'checkbox') cfg[el.name] = el.checked;
      else cfg[el.name] = Number(el.value);
    }
    if (!cfg.ff) cfg.gps = false;
    app.config = cfg;
    releaseAll();
    const edm = makeEdmFor(cfg, app.edm.settings);
    relink(app.sim, edm);
    if (app.sim.ctl.master) app.edm.send({ type: 'POWER_ON' });
    app.face = new Face($('#face'));
    saveStored();
  });
}

// ------------------------------------------------------------------ scenarios

function buildScenarioList() {
  const groups = {};
  for (const s of SCENARIOS) (groups[s.category] ||= []).push(s);
  $('#scenario-list').innerHTML = Object.entries(groups)
    .map(([cat, list]) => `<h4>${cat}</h4>${list.map((s) => `<button data-scn="${s.id}" class="${app.done.has('scn:' + s.id) ? 'done' : ''}">${s.title}</button>`).join('')}`)
    .join('');
  $$('[data-scn]').forEach((b) => b.addEventListener('click', () => startScenario(b.dataset.scn)));
}

function startScenario(id) {
  const scn = SCENARIOS.find((s) => s.id === id);
  releaseAll();
  app.lesson = null;
  const sim = newSim();
  relink(sim, app.edm);
  app.runner = new ScenarioRunner(scn, app.link);
  app.runner.setup();
  syncControlsUi();
  syncFaultUi();
  $('#scenario-list').hidden = true;
  $('#scenario-active').hidden = false;
  $('#scn-title').textContent = scn.title;
  $('#scn-brief').textContent = scn.brief;
  $('#scn-debrief').hidden = true;
  app.scnShown = -1;
}

function endScenario() {
  app.runner = null;
  $('#scenario-active').hidden = true;
  $('#scenario-list').hidden = false;
}

function renderScenario() {
  const r = app.runner;
  if (!r) return;
  const key = `${r.stepIdx}|${r.failures.length}|${r.notes.length}`;
  if (key === app.scnShown) return;
  app.scnShown = key;
  $('#scn-steps').innerHTML = r.scn.steps
    .map(([text], i) => `<li class="${i < r.stepIdx ? 'ok' : i === r.stepIdx ? 'current' : ''}">${text}</li>`)
    .join('');
  $('#scn-notes').innerHTML = r.notes.map((n) => `<div class="scn-note">${n.text}</div>`).join('');
  $('#scn-fail').innerHTML = r.failures.map((f) => `<div class="bad">⚠ ${f}</div>`).join('');
  if (r.done) {
    $('#scn-debrief').hidden = false;
    $('#scn-debrief').innerHTML = `<h4>${r.failures.length ? 'Completed with watch-outs' : 'Well done'}</h4><p>${r.scn.debrief}</p>`;
    app.done.add('scn:' + r.scn.id);
    saveStored();
  }
}

// ------------------------------------------------------------------ floating "next step" card

/** While a scenario or lesson runs, show its current step on every other tab (no switching back and forth). */
function renderCoach() {
  const el = $('#coach');
  const activeTab = $('#tabs button.active')?.dataset.tab;
  let src = null;
  if (app.runner) {
    const r = app.runner;
    src = {
      kind: 'Scenario', tab: 'scenarios', title: r.scn.title, steps: r.scn.steps.map(([t]) => t), idx: r.stepIdx,
      note: [...r.notes].reverse().find((n) => r.t - n.t < 45)?.text, warns: r.failures,
    };
  } else if (app.lesson) {
    src = { kind: 'Lesson', tab: 'lessons', title: app.lesson.title, steps: app.lesson.steps.map(([t]) => t), idx: app.lessonStep, warns: [] };
  }
  const show = !!src && activeTab !== src.tab && !document.body.classList.contains('explaining');
  el.hidden = !show;
  document.body.classList.toggle('has-coach', show);
  if (!src) {
    app.coachKey = null;
    return;
  }
  const n = src.steps.length;
  const done = src.idx >= n;
  const key = `${src.kind}|${src.title}|${src.idx}`;
  if (app.coachKey?.startsWith(`${src.kind}|${src.title}|`) && app.coachKey !== key) {
    el.classList.remove('advanced');
    void el.offsetWidth; // restart the flash animation
    el.classList.add('advanced');
  }
  app.coachKey = key;
  if (!show) return;
  el.dataset.tab = src.tab;
  el.classList.toggle('done', done);
  el.classList.toggle('collapsed', !!app.coachCollapsed);
  el.querySelector('.coach-kind').textContent = src.kind;
  // collapsed: the one-line bar shows the step itself instead of the title
  const stepText = done ? `${src.kind} complete` : src.steps[src.idx];
  el.querySelector('.coach-title').textContent = app.coachCollapsed ? stepText : src.title;
  el.querySelector('.coach-progress').textContent = done ? '✓ complete' : `step ${src.idx + 1} of ${n}`;
  el.querySelector('.coach-step').textContent = done
    ? `${src.kind} complete${src.kind === 'Scenario' ? ' — open it for the debrief.' : '.'}`
    : src.steps[src.idx];
  const note = el.querySelector('.coach-note');
  note.hidden = !src.note;
  note.textContent = src.note || '';
  const warn = el.querySelector('.coach-warn');
  warn.hidden = !src.warns.length;
  warn.textContent = src.warns.length ? `⚠ ${src.warns.at(-1)}${src.warns.length > 1 ? ` (+${src.warns.length - 1} more)` : ''}` : '';
}

function bindCoach() {
  const el = $('#coach');
  el.querySelector('.coach-open').addEventListener('click', () => {
    $(`#tabs [data-tab="${el.dataset.tab}"]`).click();
    if (matchMedia('(max-width: 719px)').matches) {
      // phones: bring the steps just below the pinned instrument
      const pinned = $('.instrument').getBoundingClientRect().height;
      scrollTo(0, $('.side').getBoundingClientRect().top + scrollY - pinned - 8);
    }
  });
  el.querySelector('.coach-toggle').addEventListener('click', () => {
    app.coachCollapsed = !app.coachCollapsed;
    el.querySelector('.coach-toggle').setAttribute('aria-expanded', String(!app.coachCollapsed));
    el.querySelector('.coach-toggle').textContent = app.coachCollapsed ? '▴' : '▾';
    renderCoach();
  });
}

// ------------------------------------------------------------------ EDM lessons

function buildLessonList() {
  $('#lesson-list').innerHTML = LESSONS.map((l) => `<button data-lesson="${l.id}" class="${app.done.has(l.id) ? 'done' : ''}">${l.title}</button>`).join('');
  $$('[data-lesson]').forEach((b) => b.addEventListener('click', () => startLesson(LESSONS.find((l) => l.id === b.dataset.lesson))));
}
function startLesson(lesson) {
  endScenario();
  app.lesson = lesson;
  app.lessonStep = 0;
  app.lessonMem = {};
  lesson.setup?.(lessonApi);
  syncControlsUi();
  $('#lesson-list').hidden = true;
  $('#lesson-active').hidden = false;
  $('#lesson-title').textContent = lesson.title;
  renderLesson();
}
function renderLesson() {
  const l = app.lesson;
  if (!l) return;
  $('#lesson-steps').innerHTML =
    l.steps.map(([text], i) => `<li class="${i < app.lessonStep ? 'ok' : i === app.lessonStep ? 'current' : ''}">${text}</li>`).join('') +
    (app.lessonStep >= l.steps.length ? '<p class="lesson-done">Lesson complete.</p>' : '');
}
function checkLesson() {
  const l = app.lesson;
  if (!l || app.lessonStep >= l.steps.length) return;
  const ctx = { st: app.edm.getState(), disp: app.edm.getDisplay(), edm: app.edm, sim: app.sim, mem: app.lessonMem, app: lessonApi };
  let advanced = false;
  while (app.lessonStep < l.steps.length && l.steps[app.lessonStep][1](ctx)) {
    app.lessonStep++;
    advanced = true;
    ctx.st = app.edm.getState();
  }
  if (advanced) {
    if (app.lessonStep >= l.steps.length) {
      app.done.add(l.id);
      saveStored();
    }
    renderLesson();
  }
}
const lessonApi = {
  get edm() {
    return app.edm;
  },
  get sim() {
    return app.sim;
  },
  bootTo,
  coldAircraft,
  setFault,
};

// ------------------------------------------------------------------ diagnosis trainer

function newMystery() {
  const pick = DIAGNOSIS[Math.floor(Math.random() * DIAGNOSIS.length)];
  const cyl = Math.floor(Math.random() * 4);
  bootTo('AUTO', 'cruise', { rBar: 1.1 });
  if (pick.fault === 'probe') app.sim.failedProbes.add(`EGT${cyl + 1}`);
  else if (pick.fault === 'fouledPlugInFlight') app.sim.setFault('fouledPlug', { cyl });
  else app.sim.setFault(pick.fault, { cyl, sev: pick.fault === 'filterBlock' ? 0.8 : 1 });
  if (pick.fault === 'lowCompression' || pick.fault === 'inductionLeak') app.sim.ctl.throttle *= 0.75;
  app.mystery = { ...pick, cyl };
  $('#mystery-result').innerHTML = '';
  $('#mystery-choices').innerHTML = '';
  for (const c of [...DIAGNOSIS].sort(() => Math.random() - 0.5)) {
    const b = document.createElement('button');
    b.textContent = c.answer;
    b.addEventListener('click', () => {
      const ok = c.fault === app.mystery.fault;
      const cylText = ['probe', 'fouledPlugInFlight', 'stuckValve', 'burnedValve', 'lowCompression', 'inductionLeak', 'exhaustLeak'].includes(app.mystery.fault)
        ? ` on cylinder ${app.mystery.cyl + 1}` : '';
      $('#mystery-result').innerHTML =
        `<p class="${ok ? 'good' : 'bad'}">${ok ? 'Correct!' : 'Not quite.'} The problem was: <b>${app.mystery.answer}</b>${cylText}.</p>` +
        `<p>EDM signature: ${app.mystery.hint}.</p><p>Action: ${app.mystery.action}</p>`;
    });
    $('#mystery-choices').appendChild(b);
  }
  syncFaultUi();
}

// ------------------------------------------------------------------ menu map (EDM)

function renderMenuMap() {
  const e = app.edm;
  const path = e.getState().path;
  const vis = (id) => {
    const it = e._pgmMainItems().find((x) => x.id === id);
    return it ? e._pgmVisible(it) : false;
  };
  const lim = new Set(e._limItems());
  const n = (key, label, how = '', children = [], hidden = false) => ({ key, label, how, children, hidden });
  const limAll = [['FAC', 'FAC? N'], ['ENG', 'ENG F'], ['HBAT', '16.0 H BAT'], ['LBAT', '12.0 L BAT'], ['DIF', '500 DIF'], ['HCHT', '450 H CHT'], ['CLD', '-60 CLD'],
    ['TIT', '1650 TIT'], ['HOIL', '230 H OIL'], ['LOIL', '90 L OIL'], ['MAP', '42.0 MAP'], ['FUNIT', 'FUEL GAL'], ['MAIN', 'MAIN=50'], ['AUXQ', 'AUX? N'],
    ['AUX', 'AUX=0'], ['MIN', 'MIN =45'], ['REMLIM', 'REM =10'], ['CARB', 'CARB? N'], ['RECRD', 'RECRD? Y'], ['CYL', 'CYL=6'], ['RHP', 'HP = 180'], ['EC', '14.90= EC'], ['END', 'END Y']];
  const ltm = ['TIME', 'MNTH', 'DAY', 'YEAR', 'HOUR', 'MIN', 'ID', 'END'].map((k) => n(`PROGRAM.LTM.${k}`, k === 'ID' ? 'N12345' : k === 'END' ? 'END Y' : k));
  const nodes = [
    n('OFF', 'Power off', 'Master switch'),
    n('TANK_SETUP.MAIN', 'MAIN= / AUX? / AUX=', 'hold STEP at power-on'),
    n('SELFTEST.SEGMENTS', 'Self-test → date, time, FULL, ID'),
    n('FUEL_FILL.SEL', 'FUEL → FILL? N', 'start-up fuel', [n('FUEL_FILL.ADD', '.0 GAL (FILL+)', 'STEP on FILL+')]),
    n('MANUAL', 'MANUAL — tap STEP to index', 'tap STEP'),
    n('AUTO', 'AUTO — automatic scan', 'tap LF, tap STEP; 2 min after power-up'),
    n('LEANFIND.ARMED', 'LEAN R / LEAN L', 'tap LF', [
      n('LEANFIND.ACTIVE', 'dot flashes (15°F rise)', 'lean'), n('LEANFIND.LEANEST', 'LEANEST', 'first peak'),
      n('LEANFIND.ROP_SET', 'nnnn SET', 'hold LF → peak'), n('LEANFIND.LOP_DONE', 'inverted graph', 'LOP: all peaked'),
      n('LEANFIND.LOP_REVIEW', 'inverted graph review', 'tap LF')]),
    n('PROGRAM.BANNER', 'PROGRAM', 'hold STEP + LF 5 s', [
      n('PROGRAM.ITEM.FUEL', 'FUEL? N', '', [], !vis('FUEL')),
      n('PROGRAM.ITEM.RATE', 'RATE 4', '', [], !vis('RATE')),
      n('PROGRAM.ITEM.OATU', 'OAT F', '', [n('PROGRAM.OAT_CAL', 'OAT±n', 'hold both')], !vis('OATU')),
      n('PROGRAM.ITEM.EGT1', 'EGT 1?N', '', [], !vis('EGT1')),
      n('PROGRAM.ITEM.HPQ', 'HP-? Y', '', [n('PROGRAM.HPC', 'HPC= 125', 'hold both', [n('PROGRAM.MAP_CAL', 'MAP=0.0', 'hold both')])], !vis('HPQ')),
      n('PROGRAM.ITEM.KF', 'KF-SET 29.00=KF', '', [n('PROGRAM.KF_EDIT', 'digit edit', 'hold both')], !vis('KF')),
      n('PROGRAM.ITEM.ACCUM', 'ACCUM?N', '', [], !vis('ACCUM')),
      n('PROGRAM.ITEM.GPSC', 'GPS-C= 2', '', [], !vis('GPSC')),
      n('PROGRAM.ITEM.DUMP', 'DUMP? N', '', [n('PROGRAM.DUMP_XFER', 'DUMP nn → SAVE D?N', 'NEW/ALL + STEP'), n('PROGRAM.LTM.TIME', 'Long-term memory setup', 'hold both', ltm)], !vis('DUMP')),
      n('PROGRAM.ITEM.END', 'END Y', '', [n('PROGRAM.FACLIM_BANNER', 'FAC LIM', 'hold both', limAll.map(([k, l]) => n(`PROGRAM.FACLIM.${k}`, l, '', [], !lim.has(k))))], !vis('END')),
    ]),
    n('USB.MENU', 'NEW / ALL → DONE', 'USB drive / memory box'),
  ];
  const render = (list) => `<ul>${list.map((nd) => `<li><span class="node ${nd.hidden ? 'hidden' : ''} ${nd.key === path ? 'current' : ''}">${nd.label}</span>${nd.how ? `<span class="how">${nd.how}</span>` : ''}${nd.children.length ? render(nd.children) : ''}</li>`).join('')}</ul>`;
  $('#menu-map').innerHTML = render(nodes);
}

// ------------------------------------------------------------------ POH lookup (what the book says for this RPM/MAP/altitude)

function pohLookup(alt, rpm, map) {
  const cells = POH_CRUISE.filter((c) => c.isaDev === 0);
  const alts = [...new Set(cells.map((c) => c.alt))];
  const a = alts.reduce((b, x) => (Math.abs(x - alt) < Math.abs(b - alt) ? x : b), alts[0]);
  const rpms = [...new Set(cells.filter((c) => c.alt === a).map((c) => c.rpm))];
  const r = rpms.reduce((b, x) => (Math.abs(x - rpm) < Math.abs(b - rpm) ? x : b), rpms[0]);
  const row = cells.filter((c) => c.alt === a && c.rpm === r).sort((x, y) => x.mp - y.mp);
  if (!row.length || Math.abs(alt - a) > 1200 || Math.abs(rpm - r) > 60) return null;
  if (map < row[0].mp - 0.5 || map > row[row.length - 1].mp + 0.5) return null;
  let lo = row[0];
  let hi = row[row.length - 1];
  for (let i = 0; i < row.length - 1; i++) if (map >= row[i].mp && map <= row[i + 1].mp) [lo, hi] = [row[i], row[i + 1]];
  const t = hi.mp === lo.mp ? 0 : Math.min(1, Math.max(0, (map - lo.mp) / (hi.mp - lo.mp)));
  const lerp = (k) => lo[k] + (hi[k] - lo[k]) * t;
  return { alt: a, rpm: r, pct: lerp('pct'), ktas: lerp('ktas'), gph: lerp('gph') };
}

// ------------------------------------------------------------------ rendering

let lastSlow = 0;

function gauge(label, value, unit, cls = '') {
  return `<div class="gauge ${cls}"><div class="glabel">${label}</div><div class="gval mono">${value}<span class="gunit">${unit}</span></div></div>`;
}

function renderGauges() {
  const t = app.sim.truth();
  const s = app.sim;
  const crbC = fToC(s.engine.crb);
  const crbCls = crbC >= -15 && crbC <= 5 && s.engine.running ? 'yellow' : '';
  const oilCls = s.engine.oil > 245 ? 'red' : '';
  $('#gauges').innerHTML = [
    gauge('TACH', fmt(t.rpm, 0), 'rpm'),
    gauge('MAP', fmt(t.map, 1), 'inHg'),
    gauge('OIL P', fmt(t.oilPressure, 0), 'psi', t.oilPressure < 25 && t.running ? 'red' : ''),
    gauge('OIL T', fmt(s.engine.oil, 0), '°F', oilCls),
    gauge('CARB AIR', fmt(crbC, 0), '°C', crbCls),
    gauge('FUEL P', fmt(t.fuelPressure, 1), 'psi'),
    gauge('FUEL L/R gal', `${fmt(t.tankL, 1)}/${fmt(t.tankR, 1)}`, '', t.tankL + t.tankR < 8 ? 'yellow' : ''),
    gauge('BUS', fmt(t.busV, 1), 'V', t.ovTripped || !t.altOnline ? 'yellow' : ''),
    gauge('IAS', fmt(t.ias, 0), 'kt'),
    gauge('ALT', fmt(t.alt, 0), 'ft'),
    gauge('VS', fmt(t.vs, 0), 'fpm'),
    gauge('OAT', `${fmt(t.oat, 0)}°F`, `/${fmt(fToC(t.oat), 0)}°C`),
    gauge('ENGINE', t.running ? (t.roughness > 0.15 ? 'ROUGH' : 'smooth') : 'off', '', t.roughness > 0.15 ? 'red' : ''),
  ].join('');
}

function renderTruth() {
  const t = app.sim.truth();
  const s = app.sim;
  const poh = s.flight.onGround ? null : pohLookup(t.alt, t.rpm, t.map);
  const rTag = (r) => (r > 1.02 ? 'ROP' : r < 0.98 ? 'LOP' : 'peak');
  $('#truth').innerHTML = `
    <table class="truth-t"><caption>Truth panel — what the EDM cannot show directly</caption>
      <tr><th>True power</th><td>${fmt(t.bhp, 0)} HP · ${fmt(t.pctTrue, 0)} % <span class="muted">(POH label ≈ ${fmt(t.pctTrue * FIT.engine.kPOH, 0)} %)</span></td>
          <th>True fuel flow</th><td>${fmt(t.gph, 1)} GPH</td></tr>
      <tr><th>POH says (ISA, rec. lean)</th><td colspan="3">${poh ? `${poh.alt} ft · ${poh.rpm} RPM · ${fmt(poh.pct, 0)} % · ${fmt(poh.ktas, 0)} KTAS · ${fmt(poh.gph, 1)} GPH` : '—'}</td></tr>
      <tr><th>Mean mixture r̄</th><td>${fmt(t.rBar, 3)} (${rTag(t.rBar)})</td><th>Tailpipe EGT</th><td>${fmt(t.tailpipeEgt, 0)} °F <span class="muted">(Cessna single probe)</span></td></tr>
      <tr><th>Per cylinder r</th><td colspan="3">${t.r.map((r, i) => `#${i + 1} ${fmt(r, 3)} ${rTag(r)}${t.misfire[i] > 0.05 ? ` <b class="bad">miss ${fmt(t.misfire[i] * 100, 0)}%</b>` : ''}`).join(' · ')}</td></tr>
      <tr><th>Carb ice</th><td>${fmt(t.ice * 100, 0)} %</td><th>Carb heat rise</th><td>${fmt(t.heatRise, 0)} °F</td></tr>
      <tr><th>Knock margin (max)</th><td class="${Math.max(...t.knock) > 1 ? 'bad' : ''}">${fmt(Math.max(...t.knock), 2)}${t.preign.some(Boolean) ? ' <b class="bad">PRE-IGNITION</b>' : ''}</td>
          <th>Plug fouling (max)</th><td>${fmt(Math.max(...t.plugF.flat()) * 100, 0)} %</td></tr>
      <tr><th>KTAS</th><td>${fmt(t.tas, 0)}</td><th>Dew point</th><td>${fmt(t.dewPoint, 0)} °F</td></tr>
    </table>`;
}

function render() {
  const disp = app.edm.getDisplay();
  const st = app.edm.getState();
  // before the EDM is first powered there are no columns yet: draw the dark face for the installed configuration
  app.face.render(disp.columns.length ? disp : { ...disp, columns: app.edm._columnLabels() });
  $('#btn-master').setAttribute('aria-pressed', String(app.sim.ctl.master));
  $('#alarm-light').classList.toggle('on', disp.alarmLight);
  $('#alarm-mini').classList.toggle('on', disp.alarmLight);
  $('#btn-step').classList.toggle('down', app.sources.STEP.size > 0);
  $('#btn-lf').classList.toggle('down', app.sources.LF.size > 0);
  const sDown = app.sources.STEP.size > 0;
  const lDown = app.sources.LF.size > 0;
  const meter = $('#hold-meter');
  if (sDown || lDown) {
    const kind = sDown && lDown ? 'BOTH' : sDown ? 'STEP' : 'LF';
    const since = kind === 'BOTH' ? Math.max(app.pressedAt.STEP, app.pressedAt.LF) : app.pressedAt[kind];
    const held = app.wallNow - since;
    meter.querySelector('.bar').style.width = `${Math.min(100, (held / HOLD_TARGET[kind]) * 100)}%`;
    meter.querySelector('.txt').textContent = `${kind === 'BOTH' ? 'STEP+LF' : kind} held ${(held / 1000).toFixed(1)} s`;
  } else {
    meter.querySelector('.bar').style.width = '0';
    meter.querySelector('.txt').textContent = 'tap < 0.7 s · hold ≥ 0.7 s';
  }
  if (app.wallNow - lastSlow < 200) return;
  lastSlow = app.wallNow;
  $('#st-path').textContent = st.path;
  $('#st-mode').textContent = st.state === 'OFF' ? '—' : ['AUTO', 'MANUAL'].includes(st.state) ? st.state : `${st.state} (from ${st.mode})`;
  $('#st-view').textContent = st.view === 'N' ? 'Normalize' : 'Percentage';
  const ev = app.edm.events[app.edm.events.length - 1];
  $('#st-gesture').textContent = ev ? ev.type : '—';
  const help = helpFor(st.path, st.alarm);
  $('#help-title').textContent = help.title;
  $('#help-lines').innerHTML = help.lines.map((x) => `<li>${x}</li>`).join('');
  $('#switch-block').hidden = !app.config.ff;
  $$('#select-switch button').forEach((b) => b.classList.toggle('active', b.dataset.pos === app.edm.switchPos));
  $('#lamps711-block').hidden = !app.config.primary711;
  if (disp.lamps711) for (const k of ['cht', 'oil', 'tit']) $(`#lamp-${k}`).className = `lamp ${disp.lamps711[k]}`;
  $('#btn-usb').textContent = app.edm.usbInserted ? 'Remove USB drive' : 'Insert USB drive';
  $('#btn-membox').textContent = app.edm.memboxConnected ? 'Disconnect memory box' : 'Connect memory box';
  const c = app.sim.ctl;
  const eng = app.sim.engine;
  $('#v-throttle').textContent = `${Math.round(c.throttle * 100)}% · ${fmt(eng.map, 1)} inHg`;
  $('#v-prop').textContent = `${Math.round(1600 + 1100 * c.prop)} rpm set · tach ${Math.round(eng.rpm)}`;
  $('#v-mixture').textContent = c.mixture < 0.03 ? 'CUT-OFF' : `${Math.round(c.mixture * 100)}% · ${fmt(eng.gph, 1)} GPH`;
  $('#v-heat').textContent = c.carbHeat < 0.02 ? 'cold' : `${Math.round(c.carbHeat * 100)}%`;
  $('#v-cowl').textContent = c.cowl > 0.98 ? 'open' : c.cowl < 0.02 ? 'closed' : `${Math.round(c.cowl * 100)}%`;
  $('#v-prime').textContent = String(app.sim.engine.primed);
  for (const [id, key] of [['#in-throttle', 'throttle'], ['#in-mixture', 'mixture'], ['#in-prop', 'prop'], ['#in-heat', 'carbHeat'], ['#in-cowl', 'cowl']]) {
    if (document.activeElement !== $(id)) $(id).value = c[key];
  }
  if (document.activeElement !== $('#in-mode')) $('#in-mode').value = app.sim.flight.mode;
  $('#v-tanks').textContent = `L ${fmt(app.sim.systems.tankL, 1)} / R ${fmt(app.sim.systems.tankR, 1)} gal`;
  $('#clock').textContent = new Date(app.edm.settings.clockMs).toISOString().slice(0, 16).replace('T', ' ') + 'Z';
  const banner = $('#time-banner');
  banner.hidden = !(app.paused || app.wallNow < app.ffUntil);
  banner.textContent = app.paused ? '⏸ PAUSED' : app.ffBanner;
  renderGauges();
  if (!$('#tab-cockpit').hidden) renderTruth();
  if (!$('#tab-menus').hidden) renderMenuMap();
  renderScenario();
  renderCoach();
}

// ------------------------------------------------------------------ main loop

let lastFrame = performance.now();
let lastSave = 0;

function frame(now) {
  const dt = Math.min(250, now - lastFrame);
  lastFrame = now;
  app.wallNow = now;
  const c = app.sim.ctl;
  if (!app.paused) {
    if (app.leanDir) c.mixture = Math.min(1, Math.max(0.03, c.mixture + app.leanDir * Number($('#lean-rate').value) * (dt / 1000)));
    if (app.thrDir) c.throttle = Math.min(1, Math.max(0, c.throttle + app.thrDir * 0.15 * (dt / 1000)));
    app.acc += dt;
    while (app.acc >= STEP_MS) {
      app.acc -= STEP_MS;
      stepOnce();
    }
  }
  checkLesson();
  render();
  app.explain?.tick();
  app.stateMap?.tick();
  if (now - lastSave > 5000) {
    lastSave = now;
    saveStored();
  }
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ disclaimer

const DISCLAIMER_KEY = 'edm800-disclaimer-ack-v1';

/** Not approved for training: a permanent banner, and a notice that must be acknowledged on the first visit. */
function initDisclaimer() {
  const dlg = $('#disclaimer');
  const acknowledged = () => {
    try {
      return localStorage.getItem(DISCLAIMER_KEY) === '1';
    } catch {
      return false;
    }
  };
  $('#btn-disclaimer').addEventListener('click', () => dlg.showModal());
  $('#btn-disclaimer-ok').addEventListener('click', () => {
    try {
      localStorage.setItem(DISCLAIMER_KEY, '1');
    } catch {
      /* storage unavailable: the notice shows again next time */
    }
    dlg.close();
  });
  dlg.addEventListener('cancel', (e) => {
    if (!acknowledged()) e.preventDefault(); // the first time it has to be acknowledged, not escaped
  });
  if (!acknowledged()) dlg.showModal();
}

// ------------------------------------------------------------------ init

function init() {
  initDisclaimer();
  const stored = loadStored();
  (stored?.done || []).forEach((d) => app.done.add(d));
  app.config = { ...CARDINAL_EDM_CONFIG, ...(stored?.config || {}), cylinders: 4, tit: 0 };
  buildInstructorUi();
  const sim = newSim();
  sim.engine.reset(sim.atm.t);
  relink(sim, makeEdmFor(app.config, stored?.settings ?? null));
  app.face = new Face($('#face'));
  bindHwButton($('#btn-step'), 'STEP');
  bindHwButton($('#btn-lf'), 'LF');
  bindKeyboard();
  $$('.gesture-helpers [data-gesture]').forEach((b) => b.addEventListener('click', () => gesture(b.dataset.gesture)));
  $('#btn-master').addEventListener('click', () => setMaster(!app.sim.ctl.master));
  $$('#select-switch button').forEach((b) => b.addEventListener('click', () => app.edm.send({ type: 'SELECT_SWITCH', position: b.dataset.pos })));
  $('#btn-usb').addEventListener('click', () => app.edm.send({ type: app.edm.usbInserted ? 'USB_REMOVE' : 'USB_INSERT' }));
  $('#btn-membox').addEventListener('click', () => app.edm.send({ type: app.edm.memboxConnected ? 'MEMBOX_DISCONNECT' : 'MEMBOX_CONNECT' }));
  $('#btn-reset-settings').addEventListener('click', () => {
    if (!confirm('Restore all EDM settings (alarm limits, program values, fuel) to factory defaults?')) return;
    releaseAll();
    relink(app.sim, makeEdmFor(app.config, null));
    if (app.sim.ctl.master) app.edm.send({ type: 'POWER_ON' });
    saveStored();
  });
  app.stateMap = createStateMapView({
    host: $('#tab-statemap'),
    getEdm: () => app.edm,
    getConfig: () => app.config,
    // where an expanded map goes: beside the instrument column, or under the pinned face on phones
    getAnchors: () => {
      const phone = matchMedia('(max-width: 719px)').matches;
      return phone ? { phone, top: Math.round($('.instrument').getBoundingClientRect().bottom) } : { phone, left: Math.round($('.panel').getBoundingClientRect().right + 8) };
    },
    pin: () => {
      const y = $('.instrument').getBoundingClientRect().top;
      if (y > 0) scrollBy(0, y);
    },
  });
  $$('#tabs button').forEach((b) =>
    b.addEventListener('click', () => {
      $$('#tabs button').forEach((x) => x.classList.toggle('active', x === b));
      $$('.tab').forEach((t) => (t.hidden = t.id !== `tab-${b.dataset.tab}`));
      if (b.dataset.tab === 'statemap') app.stateMap.show();
      else app.stateMap.hide();
      renderCoach();
    }),
  );
  if (location.hash === '#statemachine') {
    $('#tabs [data-tab="statemap"]').click();
    requestAnimationFrame(() => app.stateMap.expand(true));
  }
  bindCoach();
  buildCockpitUi();
  buildFaultUi();
  bindInstallForm();
  syncInstallForm();
  buildScenarioList();
  buildLessonList();
  $('#btn-scn-restart').addEventListener('click', () => app.runner && startScenario(app.runner.scn.id));
  $('#btn-scn-close').addEventListener('click', () => {
    endScenario();
    buildScenarioList();
  });
  $('#btn-lesson-restart').addEventListener('click', () => app.lesson && startLesson(app.lesson));
  $('#btn-lesson-close').addEventListener('click', () => {
    app.lesson = null;
    $('#lesson-active').hidden = true;
    $('#lesson-list').hidden = false;
    buildLessonList();
  });
  $('#btn-mystery').addEventListener('click', newMystery);
  $('#tab-reference').innerHTML = REFERENCE_HTML;
  syncControlsUi();
  syncFaultUi();
  app.explain = initExplain({
    getEdm: () => app.edm,
    getSim: () => app.sim,
    getFace: () => app.face,
    isPaused: () => app.paused,
    setPaused: (p) => p !== app.paused && togglePause(),
    releaseAll,
  });
  window.edmTrainer = app; // handy for instructors and debugging
  requestAnimationFrame(frame);
}

init();
