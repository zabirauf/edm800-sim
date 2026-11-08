// State-space explorer: discovers the EDM state machine's graph by driving the real machine.
//
// Starting from OFF, every reachable state is cloned and every input is tried — button gestures (taps, holds, both-
// button chords), timers, power, USB/memory box and, in LeanFind, leaning the mixture — and the resulting state path
// (`getState().path`) is recorded. The graph is therefore exactly what the implementation does, not a hand-drawn
// approximation. Pure JS, no DOM: used by the "State machine" dev view and by tests.

import { EDM, defaultSensors } from './machine.js';
import { GestureRecognizer } from './gestures.js';

const TICK = 50;

/** A frame from a running engine in cruise, so every scan item has a value and LeanFind can work. */
export function cruiseSensors() {
  const s = defaultSensors();
  return {
    ...s,
    egt: [1340, 1310, 1420, 1370, 0, 0], cht: [342, 340, 351, 350, 0, 0], tit: [0, 0],
    oil: 188, oat: 40, iat: 60, cdt: 60, crb: 30, bat: 14.2, rpm: 2400, map: 22, ffGph: 9.6, ffSignal: true, pctHp: 66,
    gps: { status: 'ok', offCourse: false, gs: 120, dist: 60 },
  };
}

/** Input actions: [label, kind, fn(edm)]. kind: 'button' | 'time' | 'power' | 'data' | 'engine'. */
function press(e, b) {
  e.send({ type: 'PRESS', button: b });
}
function release(e, b) {
  e.send({ type: 'RELEASE', button: b });
}
/** Remember when the machine entered its current state (so timer labels measure from entry). */
function mark(e) {
  const p = e._path();
  if (p !== e.__path) {
    e.__path = p;
    e.__enteredAt = e.now;
  }
}
function ticks(e, ms) {
  for (let t = 0; t < ms; t += TICK) {
    e.send({ type: 'TICK', ms: TICK });
    mark(e);
  }
}
function hold(e, buttons, ms) {
  buttons.forEach((b) => press(e, b));
  ticks(e, ms);
  buttons.forEach((b) => release(e, b));
  ticks(e, 100);
}

// [label, kind, duration ms (button actions), fn]
const ACTIONS = [
  ['tap STEP', 'button', 250, (e) => hold(e, ['STEP'], 150)],
  ['tap LF', 'button', 250, (e) => hold(e, ['LF'], 150)],
  ['tap STEP+LF', 'button', 250, (e) => hold(e, ['STEP', 'LF'], 150)],
  ['hold STEP', 'button', 1600, (e) => hold(e, ['STEP'], 1500)],
  ['hold STEP 5 s', 'button', 5300, (e) => hold(e, ['STEP'], 5200)],
  ['hold LF', 'button', 1300, (e) => hold(e, ['LF'], 1200)],
  ['hold LF 3 s', 'button', 3300, (e) => hold(e, ['LF'], 3200)],
  ['hold STEP+LF 5 s', 'button', 5300, (e) => hold(e, ['STEP', 'LF'], 5200)],
  ['power off', 'power', 0, (e) => e.send({ type: 'POWER_OFF' })],
  ['insert USB drive', 'data', 0, (e) => e.send({ type: 'USB_INSERT' })],
  ['remove USB drive', 'data', 0, (e) => e.send({ type: 'USB_REMOVE' })],
  ['connect memory box', 'data', 0, (e) => e.send({ type: 'MEMBOX_CONNECT' })],
];
const OFF_ACTIONS = [
  ['power on', 'power', 0, (e) => e.send({ type: 'POWER_ON' })],
  ['power on, STEP held', 'power', 0, (e) => {
    press(e, 'STEP');
    e.send({ type: 'POWER_ON' });
    release(e, 'STEP');
  }],
];
/** LeanFind inputs come from the engine, not the buttons. */
const LEAN_ACTIONS = {
  ARMED: [['lean: an EGT rises 15°F', 'engine', 0, (e) => rampEgt(e, [0, 1, 2, 3], +1, 40)]],
  ACTIVE: [
    ['keep leaning: first cylinder peaks', 'engine', 0, (e) => peakCylinders(e, [2])],
    ['keep leaning: every cylinder peaks', 'engine', 0, (e) => peakCylinders(e, [2, 3, 0, 1])],
  ],
};

function rampEgt(e, cyls, step, n) {
  const path0 = e._path();
  for (let k = 0; k < n && e._path() === path0; k++) {
    const s = structuredClone(e.sensors);
    cyls.forEach((i) => (s.egt[i] += step));
    e.send({ type: 'SENSORS', data: s });
    ticks(e, 250);
  }
}
function peakCylinders(e, order) {
  // each listed cylinder rises a little more, then falls 12°F past its peak (≈ 10°F drop detection)
  const path0 = e._path();
  for (const i of order) {
    rampEgt(e, [i], +1, 4);
    for (let k = 0; k < 16 && e._path() === path0; k++) {
      const s = structuredClone(e.sensors);
      s.egt[i] -= 1;
      e.send({ type: 'SENSORS', data: s });
      ticks(e, 250);
    }
  }
  ticks(e, 300);
}

/** Wait until the path changes by itself (banners, self-test, the 2-minute switch to Automatic). */
function waitForTimer(e, maxMs = 130000) {
  const p0 = e._path();
  const entered = e.__enteredAt ?? e.now;
  let t = 0;
  while (t < maxMs && e._path() === p0) {
    e.send({ type: 'TICK', ms: TICK });
    t += TICK;
  }
  if (e._path() === p0) return null;
  const total = e.now - entered;
  mark(e);
  return total;
}

function clone(e) {
  const c = Object.create(EDM.prototype);
  for (const [k, v] of Object.entries(e)) c[k] = structuredClone(v);
  Object.setPrototypeOf(c.g, GestureRecognizer.prototype);
  c.events = [];
  return c;
}

/** Group key: the path, the digital text with numbers masked (Y/N toggles and scan items stay distinct), and the
 *  hidden context that changes where an input leads (LeanFind method, the mode to return to, LOP results). */
function hiddenOf(e) {
  return {
    method: e.state === 'LEANFIND' ? e.ctx.lf.method : '',
    returnTo: ['PROGRAM', 'USB'].includes(e.state) ? e.vol.mode : '',
    lop: e.vol.lopResults ? 'lop' : '',
    next: e.state === 'PROGRAM' && e.ctx.pgm.sub === 'ADJUST' ? e.ctx.pgm.adjustNext : '',
  };
}
/** The state's own context with numbers and timestamps masked: keeps where-to-go-next facts (e.g. which screen
 *  the ADJUST banner leads to, where a fuel entry returns) without exploding on values. */
function contextKey(e) {
  // 'prior' (the scan item to return to after a download) is dropped: it multiplies variants without changing where
  // anything leads (the return mode is kept in hiddenOf)
  return JSON.stringify(e.ctx, (k, v) => (k === 'prior' ? undefined : typeof v === 'number' ? '#' : v instanceof Set ? [...v] : v));
}
export { variantKey, clone };
function variantKey(e) {
  const txt = e.getDisplay().digital.text.replace(/\d/g, '#');
  return `${e._path()}|${txt}|${Object.values(hiddenOf(e)).join(',')}|${contextKey(e)}`;
}

/**
 * Incremental explorer: call step(budgetMs) until it returns true (lets a browser explore without freezing).
 * @param {{config?: object, maxVariants?: number}} opts
 */
export function createExplorer({ config = {}, maxVariants = 8 } = {}) {
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const root = new EDM({ config, clockMs: Date.UTC(2026, 9, 27, 15, 0, 0) });
  root.send({ type: 'SENSORS', data: cruiseSensors() });
  mark(root);
  const nodes = new Map();
  const edgeMap = new Map();
  const variantsPerPath = new Map();
  const seen = new Set([variantKey(root)]);
  const queue = [root];
  const variants = new Map([[variantKey(root), { path: root._path(), text: root.getDisplay().digital.text.trim() }]]);
  const vedges = new Map(); // exact transitions between context-keyed variants (for routes)
  const longWaitDone = new Set();
  let explored = 0;
  let spent = 0;
  const node = (e) => {
    const p = e._path();
    if (!nodes.has(p)) nodes.set(p, { path: p, samples: [], selfLoops: new Map(), order: nodes.size });
    const n = nodes.get(p);
    const txt = e.getDisplay().digital.text.trim();
    if (txt && n.samples.length < 4 && !n.samples.includes(txt)) n.samples.push(txt);
    return n;
  };
  const addEdge = (from, to, action, kind, whenText, ms, hidden) => {
    const k = `${from}→${to}→${action}`;
    if (!edgeMap.has(k)) edgeMap.set(k, { from, to, action, kind, when: new Set(), hidden: [], ms: ms ?? null });
    const ed = edgeMap.get(k);
    if (whenText) ed.when.add(whenText);
    if (hidden && !ed.hidden.some((h) => JSON.stringify(h) === JSON.stringify(hidden))) ed.hidden.push(hidden);
    if (ms != null) ed.ms = Math.min(ed.ms ?? ms, ms);
  };
  node(root);

  function visit(e) {
    const from = e._path();
    const fromText = e.getDisplay().digital.text.trim();
    const fromHidden = hiddenOf(e);
    const top = e.state;
    const acts = top === 'OFF' ? OFF_ACTIONS : [...ACTIONS, ...(top === 'LEANFIND' ? LEAN_ACTIONS[e.ctx.lf.phase] || [] : [])];
    // where the machine would be if the same time just passed with no input (to tell button effects from timers)
    const idle = new Map();
    const idlePath = (ms) => {
      if (!idle.has(ms)) {
        const c = clone(e);
        ticks(c, ms);
        idle.set(ms, c._path());
      }
      return idle.get(ms);
    };
    const tries = [];
    for (const [label, kind, dur, fn] of acts) {
      const c = clone(e);
      fn(c);
      mark(c);
      const to = c._path();
      if (to !== from && dur > 0 && idlePath(dur) === to) continue; // the timer did it, not the button
      tries.push([label, kind, c, null]);
    }
    if (top !== 'OFF') {
      // every timer is a few seconds except Manual's one-shot switch to Automatic 2 min after power-up
      const w = clone(e);
      const long = from === 'MANUAL' && !longWaitDone.has(from);
      longWaitDone.add(from);
      const ms = waitForTimer(w, long ? 130000 : 6000);
      if (ms != null) tries.push(['timer', 'time', w, ms]);
    }
    const fromKey = variantKey(e);
    if (!variants.has(fromKey)) variants.set(fromKey, { path: from, text: fromText });
    variants.get(fromKey).explored = true;
    for (const [label, kind, c, wait] of tries) {
      const to = c._path();
      node(c);
      const toKey = variantKey(c);
      if (!variants.has(toKey)) variants.set(toKey, { path: to, text: c.getDisplay().digital.text.trim() });
      if (toKey !== fromKey) {
        const vk = `${fromKey}→${label}`;
        if (!vedges.has(vk)) vedges.set(vk, { from: fromKey, to: toKey, action: label, kind });
      }
      if (to === from) {
        const n = nodes.get(from);
        n.selfLoops.set(label, (n.selfLoops.get(label) || 0) + 1);
      } else addEdge(from, to, label, kind, fromText, wait, fromHidden);
      const key = toKey;
      if (seen.has(key)) continue;
      const nv = variantsPerPath.get(to) || 0;
      if (nv >= maxVariants) continue;
      variantsPerPath.set(to, nv + 1);
      seen.add(key);
      queue.push(c);
    }
  }

  return {
    /** Explore for up to budgetMs; returns true when finished. */
    step(budgetMs = Infinity) {
      const t0 = now();
      while (queue.length && now() - t0 < budgetMs) {
        visit(queue.shift());
        explored++;
      }
      spent += now() - t0;
      return queue.length === 0;
    },
    get progress() {
      return explored / (explored + queue.length);
    },
    result() {
      return { nodes, edges: [...edgeMap.values()], ms: spent, explored, variants, vedges: [...vedges.values()] };
    },
  };
}

/** Explore synchronously. Returns {nodes: Map(path → {path, samples, selfLoops, order}), edges, ms, variants}. */
export function exploreStateMachine(opts = {}) {
  const x = createExplorer(opts);
  x.step(Infinity);
  return x.result();
}

/** Apply one explorer input (by its label, or 'timer') to a live machine — used to replay routes in tests. */
export function applyAction(e, label) {
  if (label === 'timer') return waitForTimer(e);
  const all = [...ACTIONS, ...OFF_ACTIONS, ...Object.values(LEAN_ACTIONS).flat()];
  const a = all.find(([l]) => l === label);
  if (!a) throw new Error(`unknown action ${label}`);
  a[3](e);
  return true;
}
