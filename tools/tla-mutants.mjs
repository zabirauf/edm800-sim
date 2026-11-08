// Does the TLA+ conformance check have teeth? Plant one bug at a time in the implementation (patched in memory, the
// source is untouched), re-explore it and let TLC judge it against spec/tla/EDMCore.tla. Every planted bug should
// be reported.
//
//   node tools/tla-mutants.mjs            (needs Java and tla2tools.jar, see scripts/tla-check.sh)
import { spawnSync } from 'node:child_process';
import { mkdtempSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const JAR = process.env.TLA2TOOLS || join(homedir(), '.cache/tlaplus/tla2tools.jar');

const MUTANTS = {
  'lf-exit-manual': { model: 'modes', rule: 'LF-13', what: 'STEP in LeanFind returns to MANUAL instead of AUTO',
    patch: ({ P }) => wrap(P, '_enterNormal', (orig) => function (mode, item) { return orig.call(this, this.state === 'LEANFIND' && mode === 'AUTO' ? 'MANUAL' : mode, item); }) },
  'pgm-exit-auto': { model: 'modes', rule: 'PGM-4', what: 'leaving programming always returns to AUTO',
    patch: ({ P }) => wrap(P, '_pgmExit', (orig) => function () { this.ctx.pgm.prior.mode = 'AUTO'; return orig.call(this); }) },
  'two-min-ignored': { model: 'modes', rule: 'PWR-9', what: 'the 2-minute switch to AUTO does not happen in MANUAL',
    patch: ({ P }) => wrap(P, '_enterNormal', (orig) => function (mode, item) { if (this.state === 'MANUAL' && mode === 'AUTO') return; return orig.call(this, mode, item); }) },
  'usb-in-leanfind': { model: 'modes', rule: 'MODE-1', what: 'a USB drive starts a download from LeanFind',
    patch: ({ P }) => wrap(P, '_usbStart', (orig) => function (src) { if (this.state === 'LEANFIND') { this.state = 'AUTO'; this.vol.mode = 'AUTO'; } return orig.call(this, src); }) },
  'fill-exit-auto': { model: 'modes', rule: 'FUEL-6', what: 'a fuel entry started from programming exits to AUTO',
    patch: ({ P }) => wrap(P, '_exitFuelFill', (orig) => function () { if (this.ctx.fuel.context === 'program') return this._enterNormal('AUTO', this.vol.item); return orig.call(this); }) },
  'ack-also-steps': { model: 'alarms', rule: 'ALM-4', what: 'tapping STEP on an alarm also advances / leaves the mode',
    patch: ({ P }) => wrap(P, '_dispatch', (orig) => function (raw) {
      const e = typeof raw === 'string' ? { type: raw } : raw;
      const ack = e.type === 'STEP_TAP' && this.vol.stepPressAlarm && ['AUTO', 'MANUAL', 'LEANFIND'].includes(this.state);
      orig.call(this, raw);
      if (ack) {
        this.vol.stepPressAlarm = null;
        orig.call(this, raw);
      }
    }) },
  'light-ignores-snooze': { model: 'alarms', rule: 'ALM-8', what: 'the alarm light stays on while the alarm is snoozed',
    patch: ({ P }) => wrap(P, 'getDisplay', (orig) => function () { const d = orig.call(this); if (d.power) d.alarmLight = Object.keys(this.vol.alarmCond || {}).length > 0; return d; }) },
  'priority-reversed': { model: 'alarms', rule: 'ALM-2', what: 'the lowest-priority alarm is shown first',
    patch: ({ ALARM_PRIORITY }) => ALARM_PRIORITY.reverse() },
  'snooze-survives-power': { model: 'alarms', rule: 'PWR-10', what: 'alarm snoozes / OFFs survive a power cycle',
    patch: ({ P }) => wrap(P, '_powerOn', (orig) => function () { const keep = structuredClone(this.vol.alarmSupp); orig.call(this); this.vol.alarmSupp = keep; }) },
  'alarm-in-program': { model: 'alarms', rule: 'ALM-3', what: 'the active alarm flashes in the display during programming',
    patch: ({ P }) => wrap(P, 'getDisplay', (orig) => function () {
      const d = orig.call(this);
      const a = this.vol.alarmActive;
      if (this.state === 'PROGRAM' && a) d.digital = { text: this.vol.alarmCond[a].text, blink: true, flashIndex: null };
      return d;
    }) },
};

function wrap(proto, name, make) {
  const orig = proto[name];
  if (typeof orig !== 'function') throw new Error(`no method ${name}`);
  proto[name] = make(orig);
}

async function child(name, dir) {
  const { EDM } = await import('../src/edm/machine.js');
  const { ALARM_PRIORITY } = await import('../src/edm/constants.js');
  const { MODELS, exploreImplementation, toTla } = await import('./tla-conformance.mjs');
  const m = MUTANTS[name];
  m.patch({ P: EDM.prototype, ALARM_PRIORITY });
  const r = exploreImplementation(MODELS[m.model]);
  writeFileSync(join(dir, `ImplGraph_${m.model}.tla`), toTla(`ImplGraph_${m.model}`, r));
}

function parent(only) {
  const rows = [];
  for (const [name, m] of Object.entries(MUTANTS)) {
    if (only.length && !only.includes(name)) continue;
    const dir = mkdtempSync(join(tmpdir(), `tla-mut-${name}-`));
    for (const f of ['EDMCore.tla', `MC_${m.model}.tla`, `MC_${m.model}.cfg`]) copyFileSync(join(ROOT, 'spec/tla', f), join(dir, f));
    const c = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--child', name, dir], { encoding: 'utf8' });
    if (c.status !== 0) {
      rows.push([name, m.rule, 'harness error', c.stderr.split('\n').find((l) => l.includes('Error')) || c.stderr.slice(0, 200)]);
      continue;
    }
    const t = spawnSync('java', ['-XX:+UseParallelGC', '-cp', JAR, 'tlc2.TLC', '-workers', 'auto', '-cleanup', '-config', `MC_${m.model}.cfg`, `MC_${m.model}.tla`], { cwd: dir, encoding: 'utf8', maxBuffer: 1 << 30 });
    const out = t.stdout + t.stderr;
    if (t.error) throw t.error;
    writeFileSync(join(dir, 'tlc.out'), out);
    const counts = out.match(/"bad states", (\d+), "forbidden steps", (\d+), "missing steps", (\d+)/);
    const inv = out.match(/Invariant (\w+) is violated/);
    const caught = !out.includes('No error has been found');
    const how = [counts && `bad states ${counts[1]}, forbidden steps ${counts[2]}, missing steps ${counts[3]}`, inv && `invariant ${inv[1]} violated`].filter(Boolean).join('; ');
    rows.push([name, m.rule, caught ? 'CAUGHT' : 'MISSED', `${m.what} — ${how || 'no report'}`]);
    if (caught && !process.env.KEEP) rmSync(dir, { recursive: true, force: true });
    else console.error(`kept ${dir} for inspection`);
    console.log(`${caught ? 'CAUGHT' : 'MISSED'}  ${m.rule.padEnd(7)} ${name}: ${m.what} — ${how || 'no report'}`);
  }
  const missed = rows.filter((r) => r[2] !== 'CAUGHT');
  console.log(`\n${rows.length - missed.length}/${rows.length} planted bugs caught`);
  process.exit(missed.length ? 1 : 0);
}

if (process.argv[2] === '--child') await child(process.argv[3], process.argv[4]);
else parent(process.argv.slice(2));
