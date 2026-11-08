// Implementation side of the TLA+ conformance check (spec/tla/).
//
// Explores the real EDM state machine (src/edm/machine.js) at the abstraction level of spec/tla/EDMCore.tla:
// every input the spec knows is applied to every implementation state reached, and each result is mapped to the
// spec's state record by alpha(). The observed graph is written as a TLA+ module (ImplGraph_<model>.tla) so that
// TLC can judge it with the spec's own Succ(): every implementation step must be allowed by the spec (soundness),
// every spec step must be taken by the implementation (completeness), and every implementation state must satisfy the
// spec's state invariants (shown alarm, alarm light, normalisation).
//
//   node tools/tla-conformance.mjs [modes|alarms]      → spec/tla/ImplGraph_<model>.tla
//
// Inputs are injected at gesture level (as the spec's are): STEP_TAP etc. go straight to the machine's dispatcher with
// the press bookkeeping the gesture recogniser would do (ALM-6). Timers are driven as the spec's abstraction says:
// "Timer" lets time pass until the next short timer, the 2-minute switch and 10-minute snoozes only happen through
// their own inputs (TwoMin, Expire) — their deadlines are kept away otherwise.
import { writeFileSync } from 'node:fs';
import { EDM } from '../src/edm/machine.js';
import { cruiseSensors, clone, variantKey } from '../src/edm/explore.js';
import { CARDINAL_EDM_CONFIG } from '../src/sim/pilot.js';

export const MODELS = {
  // full mode logic, no alarm conditions
  modes: {
    alarms: [],
    inputs: ['StepTap', 'LfTap', 'BothTap', 'StepHold5', 'LfHold3', 'BothHold5', 'Timer', 'TwoMin', 'PowerOn', 'PowerOnStep',
      'PowerOff', 'UsbIn', 'UsbOut', 'Rise', 'PeakFirst', 'PeakAll', 'Record', 'OffEnds', 'SnapEnds'],
  },
  // alarm display, priority, acknowledgement and light, across the main modes
  alarms: {
    alarms: ['OILH', 'BATL'],
    inputs: ['StepTap', 'LfTap', 'StepHold5', 'BothHold5', 'Timer', 'TwoMin', 'PowerOn', 'PowerOff', 'Raise', 'Clear', 'Expire',
      'Record', 'OffEnds', 'SnapEnds'],
  },
};
export const ITEMS = ['FUEL', 'RATE', 'OATU', 'EGT1', 'HPQ', 'KF', 'ACCUM', 'GPSC', 'DUMP', 'END'];
const NONE = '-';
const ALARM_IN = new Set(['Raise', 'Clear', 'Expire']);
const SUBSCREEN_ITEMS = new Set(['OATU', 'HPQ', 'KF', 'DUMP', 'END']);
const GESTURE = { StepTap: 'STEP_TAP', LfTap: 'LF_TAP', BothTap: 'BOTH_TAP', StepHold5: 'STEP_HOLD_5S', LfHold3: 'LF_HOLD_3S', BothHold5: 'BOTH_HOLD_5S' };
const TICK = 50;

// ------------------------------------------------------------------ abstraction function

/** The implementation's state as the spec's record (normalised like EDMCore!Norm), or null if outside the model. */
export function alpha(e, model) {
  const modeled = new Set(model.alarms);
  const st = e.state;
  let mode;
  let sub = NONE;
  let ret = NONE;
  let method = NONE;
  let fillCtx = NONE;
  let fillSel = NONE;
  let fuelQ = NONE;
  let dumpQ = NONE;
  let endQ = NONE;
  switch (st) {
    case 'OFF': mode = 'OFF'; break;
    case 'TANK_SETUP': mode = 'TANK'; sub = e.ctx.tank.item; break;
    case 'SELFTEST':
    case 'STARTUP_INFO': mode = 'POWERUP'; sub = e.ctx.seq[e.ctx.idx].sub; break;
    case 'FUEL_FILL': mode = 'FILL'; sub = e.ctx.fuel.sub; fillCtx = e.ctx.fuel.context; if (sub === 'SEL') fillSel = e.ctx.fuel.sel; break;
    case 'MANUAL': mode = 'MANUAL'; break;
    case 'AUTO': mode = 'AUTO'; break;
    case 'LEANFIND': mode = 'LF'; sub = e.ctx.lf.phase; if (sub === 'ARMED' || sub === 'ACTIVE') method = e.ctx.lf.method; break;
    case 'PROGRAM': {
      const p = e.ctx.pgm;
      mode = 'PGM';
      ret = p.prior.mode;
      if (p.sub === 'BANNER' || p.sub === 'DUMP_XFER' || p.sub === 'SAVE_D') sub = p.sub;
      else if (p.sub === 'ITEM' && ITEMS.includes(p.item)) sub = p.item;
      else return null; // a programming sub-screen: outside this model
      if (sub === 'FUEL') fuelQ = p.fuelQ;
      if (sub === 'DUMP') dumpQ = p.dumpSel;
      if (sub === 'END') endQ = p.endSel;
      break;
    }
    case 'USB': mode = 'USB'; sub = e.ctx.usb.sub; ret = e.ctx.usb.prior.mode; break;
    default: return null;
  }
  const off = mode === 'OFF';
  const cond = Object.keys(e._alarmConditions(e._derive())).filter((a) => modeled.has(a)).sort();
  const supp = e.vol.alarmSupp;
  const snoozed = off ? [] : model.alarms.filter((a) => supp[a] != null && supp[a] !== Infinity && e.now < supp[a]);
  const offSet = off ? [] : model.alarms.filter((a) => supp[a] === Infinity);
  const disp = e.getDisplay();
  // The alarm a pilot can SEE: the digital window flashing an alarm's text (ALM-2), in any mode, unfiltered — the
  // spec (Fix) judges where that may happen (ALM-3). Read from the display output, not internals: internal leftovers
  // nobody can see are not behaviour.
  const conds = off ? {} : e._alarmConditions(e._derive());
  const on = disp.power && disp.digital.blink ? Object.keys(conds).filter((a) => conds[a].text === disp.digital.text) : [];
  if (on.some((a) => !modeled.has(a))) throw new Error(`unmodelled alarm ${on} is displayed`);
  const shownImpl = on[0] ?? null;
  return {
    mode, sub, ret, method,
    lop: off ? false : !!e.vol.lopResults,
    view: off ? 'P' : e.vol.view,
    fired: off ? false : !!e.vol.autoTimerFired,
    auxY: !!e.settings.auxEnabled,
    fillCtx, fillSel, fuelQ, dumpQ, endQ,
    usbIn: !!e.usbInserted,
    cond, snoozed, off: offSet,
    mark: off ? false : !!e.vol.snapPending,
    ovlOff: off ? false : e.now < e.vol.offUntil,
    ovlSnap: off ? false : e.now < e.vol.snapUntil,
    shown: shownImpl || NONE,
    light: !!disp.alarmLight,
  };
}

// ------------------------------------------------------------------ inputs

function tick(e, ms = TICK) {
  for (let t = 0; t < ms; t += TICK) e.send({ type: 'TICK', ms: TICK });
}
const key = (a) => JSON.stringify(a);

/** Keep the 2-minute switch, snoozes, the OFF/SNAP overlays and the next LTM record from happening on their own:
 *  each is a separate input in the spec (TwoMin, Expire, OffEnds, SnapEnds, Record). */
function holdLongTimers(e) {
  if (e.state === 'OFF') return;
  if (!e.vol.autoTimerFired) e.vol.powerOnAt = e.now;
  if (e.vol.offUntil > e.now) e.vol.offUntil = Math.max(e.vol.offUntil, e.now + 600000);
  if (e.vol.snapUntil > e.now) e.vol.snapUntil = Math.max(e.vol.snapUntil, e.now + 600000);
  e.vol.lastRecordAt = e.now; // the next LTM record (which shows a pending SNAP) is its own input
  for (const [a, until] of Object.entries(e.vol.alarmSupp)) if (until !== Infinity && until > e.now) e.vol.alarmSupp[a] = Math.max(until, e.now + 600000);
}

function setSensors(e, f) {
  const s = structuredClone(e.sensors);
  f(s);
  e.send({ type: 'SENSORS', data: s });
}

/** Apply one spec input to a live machine. Returns false when the spec says the input cannot happen here. */
export function applyInput(e, ev, model) {
  const a0 = alpha(e, model);
  const g = ev.g;
  if (g !== 'TwoMin') holdLongTimers(e);
  if (GESTURE[g]) {
    const step = g === 'StepTap' || g === 'StepHold5';
    // the machine's own PRESS bookkeeping (which alarm captures STEP, ALM-6) — not a copy of it in the harness
    if (step) e.send({ type: 'PRESS', button: 'STEP' });
    e._dispatch({ type: GESTURE[g] });
    if (step) {
      // release without letting the recogniser emit a second gesture
      e.g.down.STEP = false;
      e.g.reset();
      e.vol.stepPressAlarm = null;
    }
    tick(e);
    return true;
  }
  switch (g) {
    case 'PowerOn':
      if (a0.mode !== 'OFF') return false;
      e.send({ type: 'POWER_ON' });
      tick(e);
      return true;
    case 'PowerOnStep':
      if (a0.mode !== 'OFF') return false;
      e.send({ type: 'PRESS', button: 'STEP' });
      e.send({ type: 'POWER_ON' });
      e.send({ type: 'RELEASE', button: 'STEP' });
      tick(e);
      return true;
    case 'PowerOff':
      if (a0.mode === 'OFF') return false;
      e.send({ type: 'POWER_OFF' });
      return true;
    case 'Timer': {
      // time passes until the next short timer changes the state (at most 6 s)
      const k0 = key(a0);
      for (let t = 0; t < 6000; t += TICK) {
        holdLongTimers(e);
        tick(e);
        if (key(alpha(e, model)) !== k0) break;
      }
      return true;
    }
    case 'TwoMin':
      if (a0.mode === 'OFF' || a0.mode === 'POWERUP' || a0.fired) return false;
      e.vol.powerOnAt = e.now - 120000;
      tick(e);
      return true;
    case 'UsbIn':
      if (a0.usbIn) return false;
      e.send({ type: 'USB_INSERT' });
      tick(e);
      return true;
    case 'UsbOut':
      if (!a0.usbIn) return false;
      e.send({ type: 'USB_REMOVE' });
      tick(e);
      return true;
    case 'Rise':
      if (!(a0.mode === 'LF' && a0.sub === 'ARMED')) return false;
      // drop, then rise 20°F: activation is measured from the running minimum (LF-4)
      setSensors(e, (s) => s.egt = s.egt.map((v, i) => (i < 4 ? cruiseSensors().egt[i] - 20 : v)));
      tick(e, 300);
      setSensors(e, (s) => s.egt = s.egt.map((v, i) => (i < 4 ? cruiseSensors().egt[i] : v)));
      tick(e, 300);
      return true;
    case 'PeakFirst':
    case 'PeakAll': {
      if (!(a0.mode === 'LF' && a0.sub === 'ACTIVE' && a0.method === (g === 'PeakFirst' ? 'R' : 'L'))) return false;
      for (const i of g === 'PeakFirst' ? [2] : [2, 3, 0, 1]) {
        setSensors(e, (s) => (s.egt[i] += 6));
        tick(e, 300);
        setSensors(e, (s) => (s.egt[i] -= 16)); // 10°F below its maximum → peaked (LF-6)
        tick(e, 300);
      }
      return true;
    }
    case 'Raise':
    case 'Clear': {
      const on = g === 'Raise';
      if (a0.cond.includes(ev.a) === on) return false;
      setSensors(e, (s) => {
        if (ev.a === 'OILH') s.oil = on ? 240 : 188;
        if (ev.a === 'BATL') s.bat = on ? 11.5 : 14.2;
      });
      tick(e);
      return true;
    }
    case 'Expire':
      if (!a0.snoozed.includes(ev.a)) return false;
      e.vol.alarmSupp[ev.a] = e.now;
      tick(e);
      return true;
    case 'Record':
      if (a0.mode === 'OFF' || !a0.mark) return false;
      e.vol.lastRecordAt = e.now - e.settings.recordInterval * 1000; // the record-interval boundary is now
      tick(e);
      return true;
    case 'OffEnds':
      if (!a0.ovlOff) return false;
      e.vol.offUntil = e.now;
      tick(e);
      return true;
    case 'SnapEnds':
      if (!a0.ovlSnap) return false;
      e.vol.snapUntil = e.now;
      tick(e);
      return true;
    default:
      throw new Error(`unknown input ${g}`);
  }
}

/** The spec's Events, in a fixed order. */
export function eventList(model) {
  const out = [];
  for (const g of model.inputs) {
    if (ALARM_IN.has(g)) model.alarms.forEach((a) => out.push({ g, a }));
    else out.push({ g, a: NONE });
  }
  return out;
}

// ------------------------------------------------------------------ exploration

/**
 * Explore the implementation. Several concrete variants per abstract state are explored (different scan items,
 * values...), so nondeterministic spec branches (e.g. MAN-5 on USD) can be matched.
 */
export function exploreImplementation(model, { variantsPerState = 4, scanVariants = 20 } = {}) {
  const events = eventList(model);
  const root = new EDM({ config: CARDINAL_EDM_CONFIG, clockMs: Date.UTC(2026, 9, 27, 15, 0, 0) });
  root.send({ type: 'SENSORS', data: cruiseSensors() });
  const index = new Map(); // abstract key → id
  const states = [];
  const next = []; // next[id][evIdx] = Set of ids
  const explored = new Set();
  const variants = new Map();
  const seen = new Set();
  const outOfScope = [];
  const id = (a) => {
    const k = key(a);
    if (!index.has(k)) {
      index.set(k, states.length);
      states.push(a);
      next.push(events.map(() => new Set()));
    }
    return index.get(k);
  };
  const queue = [root];
  seen.add(`${key(alpha(root, model))}|${variantKey(root)}`); // OFF
  while (queue.length) {
    const e = queue.shift();
    const a = alpha(e, model);
    const from = id(a);
    explored.add(from);
    events.forEach((ev, ei) => {
      const c = clone(e);
      if (!applyInput(c, ev, model)) return;
      const b = alpha(c, model);
      if (b == null) {
        outOfScope.push([a, ev]);
        return;
      }
      const to = id(b);
      next[from][ei].add(to);
      // concrete variety that matters: in the scan modes the reading on display (MAN-5 depends on USD), elsewhere the
      // masked display and context
      // plus volatile data the abstraction normalises away while OFF (snoozes, LOP results, view, 2-min flag): a stale
      // value there only shows after the next power-on, so those OFF states must be explored separately (PWR-10)
      const hidden = b.mode === 'OFF' ? JSON.stringify([c.vol.alarmSupp, !!c.vol.lopResults, c.vol.view, c.vol.autoTimerFired, !!c.vol.snapPending]) : '';
      const ck = `${key(b)}|${b.mode === 'MANUAL' || b.mode === 'AUTO' ? `item=${c.vol.item}` : variantKey(c)}|${hidden}`;
      if (seen.has(ck)) return;
      const cap = b.mode === 'MANUAL' || b.mode === 'AUTO' ? scanVariants : variantsPerState;
      const n = variants.get(to) || 0;
      if (n >= cap) return;
      variants.set(to, n + 1);
      seen.add(ck);
      queue.push(c);
    });
  }
  return { events, states, next, explored, outOfScope };
}

// ------------------------------------------------------------------ TLA+ output

const tlaVal = (v) => (typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : Array.isArray(v) ? `{${v.map((x) => `"${x}"`).join(', ')}}` : `"${v}"`);
const FIELDS = ['mode', 'sub', 'ret', 'method', 'lop', 'view', 'fired', 'auxY', 'fillCtx', 'fillSel', 'fuelQ', 'dumpQ', 'endQ', 'usbIn',
  'cond', 'snoozed', 'off', 'mark', 'ovlOff', 'ovlSnap', 'shown', 'light'];
const tlaRec = (a) => `[${FIELDS.map((f) => `${f} |-> ${tlaVal(a[f])}`).join(', ')}]`;

export function toTla(name, r) {
  const lines = [];
  lines.push(`---- MODULE ${name} ----`);
  lines.push('\\* Generated by tools/tla-conformance.mjs from the JavaScript implementation — do not edit.');
  lines.push('\\* ImplState[i]: an abstract state the implementation reached; ImplNext[i][e]: indices of the states input');
  lines.push('\\* EvList[e] led to from it (union over the explored concrete variants); ImplExplored: states whose inputs were all tried.');
  lines.push('EXTENDS Sequences');
  lines.push(`EvList == <<${r.events.map((e) => `[g |-> "${e.g}", a |-> "${e.a}"]`).join(', ')}>>`);
  lines.push('ImplState == <<');
  lines.push(r.states.map((a) => `  ${tlaRec(a)}`).join(',\n'));
  lines.push('>>');
  lines.push(`ImplExplored == {${[...r.explored].map((i) => i + 1).join(', ')}}`);
  lines.push('ImplNext == <<');
  lines.push(r.next.map((row) => `  <<${row.map((s) => `{${[...s].map((i) => i + 1).join(', ')}}`).join(', ')}>>`).join(',\n'));
  lines.push('>>');
  lines.push('====');
  return lines.join('\n') + '\n';
}

if (process.argv[1] && process.argv[1].endsWith('tla-conformance.mjs')) {
  const which = process.argv[2] ? [process.argv[2]] : Object.keys(MODELS);
  for (const m of which) {
    const t0 = Date.now();
    const r = exploreImplementation(MODELS[m]);
    const name = `ImplGraph_${m}`;
    const file = new URL(`../spec/tla/${name}.tla`, import.meta.url);
    writeFileSync(file, toTla(name, r));
    const steps = r.next.reduce((n, row) => n + row.reduce((k, s) => k + s.size, 0), 0);
    console.log(`${m}: ${r.states.length} abstract states, ${steps} steps, ${r.outOfScope.length} out-of-scope inputs, ${((Date.now() - t0) / 1000).toFixed(1)} s → spec/tla/${name}.tla`);
  }
}
