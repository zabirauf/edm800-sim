// "Explain" — turns what the EDM is showing right now into plain-language explanations of every part of the face:
// digital window, %HP window, bar graph (EGT columns, CHT segment, oil column), dot, NRM, °F/°C, the ALARM light,
// what the buttons do now, and what the simulator knows that the instrument cannot show.
// Pure functions (no DOM) so they can be unit-tested. Page references: JPI Pilot's Guide EDM-700/800 Rev W ("p.");
// Cardinal limits: Cessna 177B POH / Lycoming O-360 operator's manual (see web/reference.js).

import { helpFor } from './training.js';
import { FIT } from '../src/sim/fitted.js';

const CARDINAL = {
  ratedHp: 180,
  chtRed: 500, // POH red line
  chtHighPower: 435, // Lycoming: keep below for high-power cruise
  chtEcon: 400, // Lycoming: keep below for economy cruise
  oilRed: 245,
  oilDesired: 180,
  oilContinuousMin: 140,
  rpmRed: 2700,
  rpmGreenTop: 2500, // SL–8000 ft
  mapGreen: [15, 24],
  crbYellowF: [5, 41], // −15…+5 °C
};

const SEGMENTS = 13;
const ALARM_INFO = {
  CHT: ['High CHT', 'hcht', 'Cylinder head temperature is above the EDM limit; the dot marks the hottest cylinder.',
    'Enrich, reduce power, lower the nose for airspeed, open the cowl flaps. POH red line is 500°F; Lycoming wants < 435°F at high power and < 400°F in economy cruise.'],
  OILH: ['High oil temperature', 'hoil', 'Oil temperature is above the EDM high limit.',
    'POH red line 245°F. Reduce power, increase airspeed, open the cowl flaps, watch oil pressure — and plan to land if it keeps rising.'],
  TIT: ['High TIT', 'tit', 'Turbine inlet temperature is above the limit.', 'Enrich or reduce power (turbocharged engines only).'],
  OILL: ['Low oil temperature', 'loil', 'Oil is colder than the EDM low limit.',
    'Normal right after a cold start. Lycoming: warm up at 1000–1200 RPM until the throttle can be opened without the engine faltering (about 2–3 min above freezing); 140°F is the minimum for continuous operation. The alarm clears once oil is above the EDM low limit.'],
  CLD: ['Shock cooling (CLD)', 'cld', 'A cylinder head is cooling faster than the limit; the dot marks the fastest-cooling cylinder.',
    'Reduce power more gradually, keep some power in the descent, slow down, close the cowl flaps. Lycoming (SI 1094D, quoted on p.19): no more than 50°F per minute.'],
  DIF: ['EGT spread (DIF)', 'dif', 'The spread between the hottest and coolest EGT is above the limit.',
    'Usually a failed probe, a misfiring cylinder (plug, ignition lead) or a valve problem — find the odd column in the bar graph.'],
  BATH: ['High voltage', 'hbat', 'Bus voltage is above the high limit — the voltage regulator is overcharging.',
    'The Cardinal’s over-voltage relay should take the alternator off-line; if it doesn’t, switch the alternator off. Then you are on battery: shed electrical load.'],
  BATL: ['Low voltage', 'lbat', 'Bus voltage is below the low limit — the alternator is not charging.',
    'Check the alternator switch and breaker; reduce electrical load; the battery is discharging, so plan to land.'],
  MAP: ['Overboost (MAP)', 'map', 'Manifold pressure is above the limit.', 'Reduce throttle (turbocharged engines).'],
  LOFUEL: ['Low fuel (REM)', 'remLim', 'Fuel remaining, as calculated by the EDM, is below the limit.',
    'REM is only as good as the last fuel quantity you gave the EDM — cross-check the fuel gauges and plan to land.'],
  LOTIME: ['Low endurance (H.M)', 'minLim', 'Endurance at the current fuel flow is below the limit.',
    'Lean if appropriate and plan a fuel stop.'],
};
const ALARM_ORDER = ['CHT', 'OILH', 'TIT', 'OILL', 'CLD', 'DIF', 'BATH', 'BATL', 'MAP', 'LOFUEL', 'LOTIME'];

const r0 = (v) => (v == null ? '—' : String(Math.round(v)));
const r1 = (v) => (v == null ? '—' : Number(v).toFixed(1));
const note = (level, text) => ({ level, text });
const GAL_FACTOR = { GAL: 1, KGS: 2.72, LTR: 3.785, LBS: 6.0 };

/**
 * Build the explanation for the current instant.
 * @param {{edm: object, sim?: object}} input – a live EDM (src/edm/machine.js) and optionally the engine Simulation
 * @returns {{headline: string, path: string, parts: object[], buttons: object, behind: string[]}}
 */
export function explainDisplay({ edm, sim = null }) {
  const st = edm.getState();
  const disp = edm.getDisplay();
  const ctx = {
    edm, sim, st, disp,
    d: disp.power ? edm._derive() : null,
    cfg: edm.config,
    set: edm.settings,
    unit: edm.settings.engUnit === 'C' ? '°C' : '°F',
    flowUnit: { GAL: 'GPH', KGS: 'KPH', LTR: 'LPH', LBS: 'PPH' }[edm.settings.fuelUnit] || 'GPH',
    fuelUnit: { GAL: 'gal', KGS: 'kg', LTR: 'L', LBS: 'lb' }[edm.settings.fuelUnit] || 'gal',
  };
  ctx.overlay = overlayOf(ctx);
  const parts = [digitalPart(ctx), upperPart(ctx), barsPart(ctx), chtScalePart(ctx), dotPart(ctx), viewPart(ctx), unitsPart(ctx), alarmPart(ctx), legendPart(ctx)];
  parts.forEach((p, i) => (p.n = i + 1));
  const help = helpFor(st.path, st.alarm);
  return { headline: headline(ctx), path: st.path, parts, buttons: { title: help.title, lines: help.lines }, behind: behind(ctx) };
}

// ------------------------------------------------------------------ helpers

function headline({ st, disp, set }) {
  if (!disp.power) return 'The EDM is off (no power).';
  const lf = st.leanfind;
  switch (st.state) {
    case 'AUTO': return set.rate > 0 ? `Automatic mode — the EDM steps through the readings, ${set.rate} s each (RPM/MAP 1 s).` : 'Automatic mode with scan rate 0 — the automatic scan is turned off (Program → RATE).';
    case 'MANUAL': return 'Manual mode — the display stays on one reading until you tap STEP.';
    case 'LEANFIND': return `LeanFind (${lf.method === 'L' ? 'lean of peak' : 'rich of peak'}) — ${{ ARMED: 'armed, waiting for you to start leaning', ACTIVE: 'active, watching for the first cylinder to peak', LEANEST: 'peak found', ROP_SET: 'peak found — set your mixture', LOP_DONE: 'all cylinders have peaked', LOP_REVIEW: 'reviewing the lean-of-peak result' }[lf.phase] || lf.phase}.`;
    case 'PROGRAM': return 'Pilot programming — changing EDM settings (no alarms are shown here).';
    case 'SELFTEST': return 'Power-up self-test.';
    case 'STARTUP_INFO': return 'Start-up information (long-term memory).';
    case 'FUEL_FILL': return 'Start-up fuel question — tell the EDM how much fuel is on board.';
    case 'TANK_SETUP': return 'Tank capacity set-up.';
    case 'USB': return 'Data download.';
    default: return st.state;
  }
}

function overlayOf({ edm, st }) {
  if (!['AUTO', 'MANUAL', 'LEANFIND'].includes(st.state)) return null;
  if (edm.now < edm.vol.offUntil) return { kind: 'OFF' };
  if (edm.now < edm.vol.snapUntil) return { kind: 'SNAP' };
  if (edm.vol.alarmDisplayed) return { kind: 'ALARM', id: edm.vol.alarmDisplayed };
  return null;
}

function limitText(ctx, key) {
  const L = ctx.set.limits;
  const v = L[key];
  if (v == null) return '';
  if (['hbat', 'lbat'].includes(key)) return `${r1(v)} V`;
  if (key === 'map') return `${r1(v)} inHg`;
  if (key === 'remLim') return `${r1(v)} ${ctx.fuelUnit}`;
  if (key === 'minLim') return `${v} min`;
  if (key === 'cld') return `${v}${ctx.unit}/min`;
  return `${v}${ctx.unit}`;
}

function cylName(i) {
  return `cylinder ${i + 1}`;
}

/** Cardinal-specific comments on a CHT value (°F). */
function chtNotes(chtF, who) {
  if (chtF == null) return [];
  if (chtF >= CARDINAL.chtRed) return [note('bad', `${who} CHT ${r0(chtF)}°F is at/above the 500°F red line.`)];
  if (chtF > CARDINAL.chtHighPower) return [note('warn', `${who} CHT ${r0(chtF)}°F is above Lycoming’s 435°F high-power cruise guidance.`)];
  if (chtF > CARDINAL.chtEcon) return [note('info', `${who} CHT ${r0(chtF)}°F: fine for climb / high-power cruise; Lycoming suggests < 400°F for economy cruise.`)];
  return [];
}

// ------------------------------------------------------------------ digital window

const ITEMS = {
  BAT: (c, v) => ({
    name: 'Battery / bus voltage',
    lines: [`${v.value} = electrical bus voltage in volts.`],
    notes: c.d.bat > 13.6 ? [note('ok', 'The alternator is charging — a 14-volt system typically shows about 14 V.')]
      : c.d.bat >= 12.0 ? [note('info', '12–13.6 V: the battery is carrying the load, or the alternator is at idle RPM. If it stays here above about 1000 RPM, the alternator isn’t charging.')]
        : [note('bad', 'Below 12 V the battery is getting flat.')],
  }),
  OAT: (c, v) => ({
    name: 'Outside air temperature',
    lines: [`${v.value} = outside air temperature in ${c.set.oatUnit === 'C' ? '°C' : '°F'} (the OAT unit is set separately from the engine unit, Program → OAT F/C).`],
    notes: [],
  }),
  IAT: (c, v) => ({ name: 'Induction air temperature', lines: [`${v.value} = air temperature leaving the intercooler.`], notes: [] }),
  CDT: (c, v) => ({ name: 'Compressor discharge temperature', lines: [`${v.value} = air temperature entering the intercooler.`], notes: [] }),
  CRB: (c, v) => {
    const f = c.set.engUnit === 'C' ? c.d.crb * 1.8 + 32 : c.d.crb;
    const [lo, hi] = CARDINAL.crbYellowF;
    return {
      name: 'Carburetor air temperature',
      lines: [`${v.value} = temperature of the air in the carburetor throat (${c.unit}).`],
      notes: f >= lo && f <= hi ? [note('warn', 'Inside the Cardinal’s yellow arc (−15…+5°C): carburetor ice can form. Apply carb heat if humidity is high or RPM/MAP drop.')]
        : [note('ok', 'Outside the yellow arc (−15…+5°C icing range).')],
    };
  },
  DIF: (c, v) => ({
    name: 'EGT spread (DIF)',
    lines: [`${v.value} = difference between the hottest and the coolest EGT, ${c.unit}.`, `The dot marks the cylinder furthest from the average (${c.d.difCyl != null ? cylName(c.d.difCyl) : 'none'}).`],
    notes: [note('info', 'Typical at cruise: 120–150°F for a carbureted engine like the Cardinal’s, 70–90°F for fuel injection (p.21). JPI: fine adjustments to throttle, then RPM, then mixture can level the columns (p.19).')],
  }),
  RPMMAP: (c, v) => {
    const notes = [];
    if (c.d.rpm > CARDINAL.rpmRed + 10) notes.push(note('bad', `RPM above the 2700 red line.`));
    else if (c.d.rpm > CARDINAL.rpmGreenTop + 10) notes.push(note('info', 'Above 2500 RPM: normal for take-off and max climb (2700 = full power). For cruise the green arc ends at 2500 below 8000 ft (2700 above).'));
    return {
      name: 'RPM and manifold pressure',
      lines: [`${v.value} = engine RPM (rounded to 10).`, `${v.label} = manifold pressure, inches of mercury.`],
      notes,
    };
  },
  REM: (c, v) => ({
    name: 'Fuel remaining',
    lines: [`${v.value} = fuel remaining, ${c.fuelUnit}, as calculated: the last fuel quantity you gave the EDM (the start-up FILL answer or Program → FUEL) minus the fuel counted by the flow meter since. Answering FILL? N keeps the previous value (p.26–27).`],
    notes: [note('info', 'The EDM does not measure the tanks — REM is only right if the fuel entry was right.')],
  }),
  GPSMSG: (c, v) => ({
    name: 'GPS status',
    lines: [{ 'NO-COM': 'NO-COM = data is arriving from the GPS but the EDM is still working out its format (auto-protocol set-up); check the GPS output setting and wiring (p.47).', 'NO-SIG': 'NO-SIG = the GPS has no usable position signal (p.47).', 'NO-WPT': 'NO-WPT = no active waypoint in the GPS (p.47).' }[v.label] || v.label],
    notes: [],
  }),
  REQ: (c, v) => ({
    name: 'Fuel required to the waypoint',
    lines: [v.value === '---' ? '--- = cannot be calculated (needs fuel flow, ground speed and an on-course GPS waypoint).' : `${v.value} = fuel needed to reach the GPS waypoint at the current ground speed and fuel flow (${c.fuelUnit}).`],
    notes: [],
  }),
  RES: (c, v) => ({
    name: 'Fuel reserve at the waypoint',
    lines: [v.value === '---' ? '--- = cannot be calculated (needs fuel flow, ground speed and an on-course GPS waypoint).' : `${v.value} = fuel left on arrival at the GPS waypoint (REM − REQ), ${c.fuelUnit}.`],
    notes: [],
  }),
  MPG: (c, v) => ({
    name: 'Fuel economy',
    lines: [v.value === '---' ? '--- = needs fuel flow and GPS ground speed.' : `${v.value} = nautical miles per ${c.fuelUnit === 'gal' ? 'gallon' : c.fuelUnit} (GPS ground speed ÷ fuel flow, p.29).`],
    notes: [],
  }),
  HM: (c, v) => ({
    name: 'Endurance',
    lines: [v.value === '---' ? '--- = no fuel flow to calculate from.' : `${v.value} = hours.minutes of fuel left at the current fuel flow (REM ÷ flow).`],
    notes: [],
  }),
  GPH: (c, v) => {
    const notes = [];
    const gph = c.d.flow / (GAL_FACTOR[c.set.fuelUnit] || 1);
    if (v.value !== '---' && gph > 13) notes.push(note('info', 'Full-rich take-off flow is typically about 15–17 GPH (no published figure; Lycoming’s minimum at 100 % power is 14.8 GPH). Full rich for take-off; from fields above 3,000 ft the POH says lean for maximum power.'));
    else if (v.value !== '---' && gph > 6) notes.push(note('info', 'The POH cruise tables show about 8–10 GPH at 65–75 % power, leaned.'));
    return {
      name: 'Fuel flow',
      lines: [v.value === '---' ? '--- = no signal from the fuel-flow transducer.' : `${v.value} = fuel flow, ${c.flowUnit}${v.value === '0.0' ? ' (a flow too low to register shows as 0.0, p.47)' : ''}.`],
      notes,
    };
  },
  USD: (c, v) => ({ name: 'Fuel used', lines: [`${v.value} = fuel used, ${c.fuelUnit}, since the last refuel entry or a manual reset (hold STEP + LF on USD). With ACCUM Y it is a trip total (p.27–28).`], notes: [] }),
  TIT1: (c, v) => ({ name: 'Turbine inlet temperature', lines: [`${v.value} = TIT (turbocharged engines).`], notes: [] }),
  TIT2: (c, v) => ({ name: 'Second TIT', lines: [`${v.value} = TIT of the second turbo.`], notes: [] }),
  OIL: (c, v) => {
    const f = c.set.engUnit === 'C' ? c.d.oil * 1.8 + 32 : c.d.oil;
    const notes = [];
    if (f >= CARDINAL.oilRed) notes.push(note('bad', 'At/above the 245°F red line.'));
    else if (f > c.set.limits.hoil * (c.set.engUnit === 'C' ? 1.8 : 1) + (c.set.engUnit === 'C' ? 32 : 0)) notes.push(note('warn', 'Above the EDM high-oil alarm limit.'));
    else if (f < CARDINAL.oilContinuousMin) notes.push(note('info', 'Still warming up — Lycoming wants at least ~140°F for continuous operation; about 180°F is ideal.'));
    else notes.push(note('ok', 'Normal range (about 180°F is ideal; red line 245°F).'));
    return { name: 'Oil temperature', lines: [`${v.value} = oil temperature, ${c.unit}.`, 'It is also the last (unlabeled) column of the bar graph.'], notes };
  },
  CLD: (c, v) => ({
    name: 'Shock cooling (CLD)',
    lines: [`${v.value} = how fast the fastest-cooling cylinder head is cooling, ${c.unit} per minute (negative = cooling).`, `The dot marks that cylinder${c.d.cldCyl != null ? ` (${cylName(c.d.cldCyl)})` : ''}.`],
    notes: [note('info', `Lycoming (SI 1094D, quoted on p.19): no more than 50°F per minute. The EDM’s alarm is set at ${limitText(c, 'cld')}, which is looser.`)],
  }),
  CHTHI: (c, v) => ({ name: 'Hottest CHT', lines: [`${v.value} = the highest cylinder head temperature; the dot marks the cylinder.`], notes: chtNotes(c.d.chtMax, 'Hottest') }),
};

function egtItem(c, v, i) {
  const egtF = c.d.egtF[i];
  const chtF = c.d.chtF[i];
  const lines = [
    `Cylinder ${i + 1} (the dot is under column ${i + 1}).`,
    egtF == null ? 'EGT: no reading (probe missing or failed).' : `${v.value.trim()} = exhaust gas temperature (EGT) of cylinder ${i + 1}, ${c.unit}${c.set.egt1 ? '' : ' — shown in 10° steps; Program → EGT 1 for 1° resolution'}.`,
    chtF == null ? 'CHT: no reading.' : `${v.label} = cylinder head temperature (CHT) of cylinder ${i + 1}, ${c.unit}.`,
  ];
  const notes = [];
  if (egtF != null) {
    const all = c.d.egtF.filter((x) => x != null);
    if (egtF === Math.max(...all)) notes.push(note('info', `Hottest EGT of the ${all.length} cylinders.`));
    if (egtF === Math.min(...all)) notes.push(note('info', `Coolest EGT of the ${all.length} cylinders.`));
    if (egtF > 2000) notes.push(note('bad', 'Above 2000°F: pre-ignition (p.25) — go full rich and reduce power immediately (p.23).'));
  }
  notes.push(...chtNotes(chtF, `Cylinder ${i + 1}`));
  return { name: `EGT and CHT, cylinder ${i + 1}`, lines, notes };
}

function digitalPart(c) {
  const { st, disp, edm, set } = c;
  const shown = disp.digital.text.trim();
  const part = { key: 'digital', title: 'Digital window', shown: shown || '(blank)', lines: [], notes: [] };
  const add = (...l) => part.lines.push(...l);
  if (!disp.power) {
    add('Dark — the EDM has no power. Switch the master on.');
    return part;
  }
  if (c.overlay) {
    const o = c.overlay;
    if (o.kind === 'OFF') {
      add('OFF = you held STEP until OFF: the alarm that was showing is silenced for the rest of this flight (p.25). The normal display comes back in a moment.');
    } else if (o.kind === 'SNAP') {
      add('SNAP = you marked this moment during LeanFind (tap STEP + LF, or LF): a marked record was written to the long-term memory, so you can find it in the downloaded data (p.30).');
    } else {
      const [name, key, what, todo] = ALARM_INFO[o.id];
      add(`ALARM — ${name}: “${shown}” flashes in place of the normal reading.`, what, `Limit: ${limitText(c, key)} (Program → alarm limits).`);
      part.notes.push(note('bad', todo));
      add('Tap STEP to silence it for 10 minutes; hold STEP until OFF to silence it for the rest of the flight. If several alarms are active, the highest-priority one is shown; silencing it reveals the next (p.25).');
    }
    if (st.state !== 'LEANFIND' && st.item) add(`Underneath, the ${st.state === 'AUTO' ? 'scan' : 'manual display'} is on: ${itemName(c, st.item)}.`);
    return part;
  }
  switch (st.state) {
    case 'AUTO':
    case 'MANUAL': {
      const id = st.item;
      if (!shown) {
        add(`${itemName(c, id)}: no value available (probe or option not working).`);
        break;
      }
      const v = edm._itemText(id, c.d);
      const excluded = st.excluded.includes(id);
      const info = /^EGT\d$/.test(id) ? egtItem(c, v, Number(id.slice(3)) - 1) : ITEMS[id]?.(c, v);
      if (info) {
        part.subtitle = info.name;
        add(...info.lines);
        part.notes.push(...info.notes);
      } else add(`${shown}: ${id}.`);
      if (excluded) add(`The decimal point before “${String(v.label).replace(/^\./, '')}” means this reading is excluded from the automatic scan (tap STEP + LF in Manual mode to include it again, p.11).`);
      if (st.state === 'MANUAL') add('Manual mode: the display stays here. Tap STEP for the next reading; to return to Automatic tap LF, then STEP.');
      else if (set.rate === 0) add('Automatic mode with scan rate 0: the scan is turned off, so the display stays here (Program → RATE). Tap STEP for Manual mode.');
      else add(`Automatic mode: this reading stays for ${id === 'RPMMAP' ? '1 s' : `${set.rate} s`}, then the next one appears. Tap STEP to stop on it (Manual mode).`);
      break;
    }
    case 'LEANFIND':
      leanFindDigital(c, part);
      break;
    case 'SELFTEST': {
      const sub = edm.ctx.seq[edm.ctx.idx].sub;
      if (sub === 'SEGMENTS') add('Every segment of every window is lit — check that none are dead (p.11).');
      else if (sub === 'COLUMNS') add('Each column is lit in turn while the EDM checks its probes and calibration (p.11).');
      else add(`${shown}: a probe problem was found — OPEN PRB = open circuit (probe or wire broken), CAL ERR = calibration error, followed by the channel name (p.11).`);
      break;
    }
    case 'STARTUP_INFO': {
      const sub = edm.ctx.seq[edm.ctx.idx].sub;
      add({ DATE: `${shown} = the EDM’s date.`, TIME: `${shown} = the EDM’s clock time.`, FULL: `${shown} = how full the long-term flight-data memory is (%).`, ID: `${shown} = the aircraft ID stored in the EDM.` }[sub] || shown);
      add('These are shown for about 1.5 s each, then the start-up fuel question (p.31).');
      break;
    }
    default: {
      const h = helpFor(st.path, null);
      part.subtitle = h.title;
      add(...h.lines);
    }
  }
  return part;
}

function itemName(c, id) {
  if (/^EGT\d$/.test(id)) return `EGT/CHT of cylinder ${id.slice(3)}`;
  const v = { lines: [''], value: '', label: '' };
  try {
    return ITEMS[id]?.(c, c.edm._itemText(id, c.d))?.name ?? id;
  } catch {
    return ITEMS[id]?.(c, v)?.name ?? id;
  }
}

function leanFindDigital(c, part) {
  const { st, disp, edm } = c;
  const lf = edm.ctx.lf;
  const shown = disp.digital.text.trim();
  const flowSide = c.cfg.ff ? 'the current fuel flow' : '“LF”';
  const add = (...l) => part.lines.push(...l);
  const lock = lf.lock != null ? (lf.lock === 'T' ? 'TIT' : cylName(Number(lf.lock))) : null;
  switch (lf.phase) {
    case 'ARMED':
      if (/^LEAN/.test(shown)) add(`${shown} = LeanFind armed, ${lf.method === 'L' ? 'lean-of-peak (L)' : 'rich-of-peak (R)'} method. Before leaning starts, holding STEP + LF 5 s switches between LEAN R and LEAN L (p.13, p.16).`);
      else add(`${shown} = EGT of the hottest cylinder (dot) and ${flowSide}.`);
      add('Set-up (p.13): cruise at 65–75 % power, pre-lean to about 50°F rich of peak, wait a minute, then tap LF. Skipping the pre-lean is the main cause of false peaks (p.20).',
        'Now lean smoothly, about 10°F per second, without pausing. LeanFind becomes active after any EGT rises 15°F (p.13).');
      break;
    case 'ACTIVE':
      if (lf.method === 'L' && lf.order.length) {
        add(`${shown} = degrees below its peak for the cylinder that peaked most recently (flashing dot), and ${flowSide}.`, `${lf.order.length} of ${c.cfg.cylinders} cylinders have peaked; keep leaning until the last one peaks (p.16).`);
      } else {
        add(`${shown} = EGT of the hottest cylinder and ${flowSide}.`, 'The flashing dot means LeanFind is active. Keep leaning steadily; when a column starts flashing, a cylinder has peaked (p.13).');
      }
      break;
    case 'LEANEST':
      add(`LEANEST = the first cylinder to peak has been found: ${lock}. Its column, number and dot flash. Shown for 2 s (p.13).`);
      break;
    case 'ROP_SET': {
      const pk = lf.peaks[lf.lock];
      if (edm.g.isHolding('LF')) add(`${shown} = while you hold LF: the peak EGT of ${lock}${c.cfg.ff ? ' and the fuel flow when it peaked (Quick Reference, p.57)' : ' and PK (p.13)'}.`);
      else add(`${shown} = current EGT of ${lock} (the leanest cylinder, locked in) and ${c.cfg.ff ? 'the current fuel flow' : '“SET”'}.`);
      if (pk && !edm.g.isHolding('LF')) {
        const below = pk.peak - c.d.egtF[Number(lf.lock)];
        if (Number.isFinite(below)) add(below > 3 ? `It is ${r0(below)}°F below its ${r0(pk.peak)}°F peak.` : `It is at its ${r0(pk.peak)}°F peak.`);
      }
      add('Now enrich slowly: stop at peak for best economy, or about 100°F rich of peak for best power (p.13). Thermal lag means you are usually ~15°F lean of peak when LEANEST appears. Hold LF to see the peak.');
      break;
    }
    case 'LOP_DONE':
    case 'LOP_REVIEW':
      add(`${shown} = how far the last cylinder to peak is below its peak, and ${c.cfg.ff ? 'the current fuel flow' : 'SET'}. Hold LF for the richest peak EGT and the GAMI spread (fuel-flow difference between the first and last cylinder to peak) (p.16).`);
      break;
    default:
      add(shown);
  }
  if (lf.method === 'L') part.notes.push(note('warn', 'Lean of peak (LEAN L) is for fuel-injected engines with GAMI injectors (p.13). With the Cardinal’s float carburetor, Lycoming says lean of peak is not possible / not recommended — use LEAN R.'));
  if (st.alarm == null && c.st.leanfind?.phase) add('Tap STEP to leave LeanFind (back to Automatic).');
}

// ------------------------------------------------------------------ other parts

function upperPart(c) {
  const { disp, cfg } = c;
  const part = { key: 'upper', title: 'Upper window (%HP)', shown: disp.upper.text || '(blank)', lines: [], notes: [] };
  if (cfg.model !== 800) {
    part.lines.push('Only the EDM-800 has this window.');
    return part;
  }
  if (!disp.power) part.lines.push('Dark — no power.');
  else if (disp.allOn) part.lines.push('Self-test: all segments lit.');
  else if (/HP$/.test(disp.upper.text)) {
    const pct = Number.parseInt(disp.upper.text, 10);
    part.lines.push(`${pct} HP = ${pct} % of rated power — about ${Math.round((pct / 100) * CARDINAL.ratedHp)} of the O-360’s 180 HP.`,
      'The EDM calculates it from engine data; it needs a working fuel-flow signal and a calibrated HP constant (Program → HP-? Y, then hold STEP + LF 5 s, p.34–35).');
    if (pct > 75) part.notes.push(note('warn', 'Above 75 %: don’t lean to peak. Lycoming: at these powers never leaner than 150°F rich of peak; peak EGT only at 75 % power or less (p.14).'));
    else if (pct >= 55) part.notes.push(note('ok', 'Normal cruise range (55–75 %).'));
  } else if (disp.upper.text) {
    part.lines.push(`${disp.upper.text} = engine RPM. The window shows RPM instead of %HP when the %HP display is turned off or there is no fuel-flow signal.`);
  } else part.lines.push('Blank in this state.');
  return part;
}

function barsPart(c) {
  const { disp, edm, d, st } = c;
  const part = { key: 'bars', title: 'Bar graph (columns)', shown: '', lines: [], notes: [], columns: [] };
  if (!disp.power) {
    part.lines.push('Dark — no power.');
    return part;
  }
  if (disp.allOn || st.state === 'SELFTEST') {
    part.lines.push('Self-test: segments and columns are lit to check the display (p.11).');
    return part;
  }
  const titLimF = edm._limitF('tit');
  const inverted = disp.columns.some((col) => col.inverted);
  if (inverted) part.lines.push('Lean-of-peak bar graph: columns hang down from the top. Each segment = 5°F below that cylinder’s own peak; the first cylinder to peak has the longest column, the last the shortest (p.16).');
  else if (disp.view === 'N') part.lines.push('Normalize view (NRM lit): when you selected it, every column was set to half height. Each segment up or down = a 10°F change since then (p.5).', 'Use it at constant power — run-up and level cruise. Change back to Percentage before changing power or starting a descent, or the columns run off the scale.');
  else part.lines.push(`Percentage view: column height = EGT as a percentage of the EDM’s programmed TIT limit (full column = ${r0(titLimF)}°F; that setting also sets the scale — the O-360 itself has no EGT red line, p.43). The first segment starts at 50 % (${r0(titLimF / 2)}°F) and each segment is about ${r0(titLimF / 24)}°F (p.5). Compare columns: taller = hotter exhaust.`);
  part.lines.push('The dark (missing) segment inside a column marks that cylinder’s CHT on the left-hand scale — see “CHT scale”.');

  disp.columns.forEach((col, i) => {
    const isCyl = /^\d$/.test(col.id);
    const lines = [];
    const notes = [];
    if (isCyl) {
      const idx = Number(col.id) - 1;
      const egtF = d.egtF[idx];
      const chtF = d.chtF[idx];
      const lfPeaks = st.state === 'LEANFIND' ? (st.leanfind.phase === 'LOP_DONE' || st.leanfind.phase === 'LOP_REVIEW' ? edm.vol.lopResults?.peaks : edm.ctx.lf.peaks) : null;
      if (col.missing) lines.push('No column: the EGT probe is missing or failed (p.11, p.22).');
      else {
        if (inverted && !lfPeaks?.[String(idx)]) lines.push(`EGT ${r0(egtF)}°F — not peaked yet, so no hanging column.`);
        else lines.push(`EGT ${r0(egtF)}°F → ${col.segs} of ${SEGMENTS} segments${inverted ? ` (${col.segs * 5}°F below its peak)` : ''}.`);
        if (col.chtSeg === 0) lines.push(`CHT ${r0(chtF)}°F — below the 250°F bottom of the CHT scale, so no CHT segment yet.`);
        else {
          const inside = col.inverted ? col.chtSeg > SEGMENTS - col.segs : col.chtSeg <= col.segs;
          lines.push(`CHT ${r0(chtF)}°F → segment ${col.chtSeg} (${inside ? 'the dark gap inside the column' : 'a single lit segment outside the column'}).`);
        }
      }
      if (col.flash && egtF != null && egtF > 2000) notes.push(note('bad', 'Column flashing: EGT above 2000°F — pre-ignition (p.25). Full rich and reduce power immediately (p.23).'));
      else if (col.flash && st.state === 'LEANFIND') lines.push(['LOP_DONE', 'LOP_REVIEW'].includes(st.leanfind.phase) ? 'Column flashing: the last cylinder to peak (p.16).' : 'Column flashing: the first cylinder to peak — LeanFind has locked on it (p.13).');
      if (col.labelFlash) lines.push(st.leanfind?.phase === 'ACTIVE' && st.leanfind.method !== 'L' ? 'Number flashing: hottest cylinder while LeanFind is active.' : 'Number flashing: this cylinder has peaked.');
      notes.push(...chtNotes(chtF, `Cylinder ${idx + 1}`));
      part.columns.push({ key: `col${i}`, label: col.label, title: `Column ${col.label} — cylinder ${col.label}`, lines, notes });
    } else if (c.cfg.tit >= 1) {
      lines.push(`TIT column${col.missing ? ': no reading' : ` — ${col.segs} segments`}.${col.oilSeg ? ` The missing segment ${col.oilSeg} is OIL.` : ''}`);
      part.columns.push({ key: `col${i}`, label: col.label || 'T', title: 'Column T — turbine inlet temperature', lines, notes });
    } else {
      const hoil = edm._limitF('hoil');
      lines.push(col.missing ? 'No oil-temperature reading.' : `Oil ${r0(d.oilF)}°F → ${col.segs} of ${SEGMENTS} segments. Height = oil temperature as a percentage of the EDM’s high-oil alarm limit: full = ${r0(hoil)}°F (the POH red line is 245°F); empty below ${r0(hoil / 2)}°F.`);
      lines.push('Its top segment flashes while the digital window shows OIL.');
      part.columns.push({ key: `col${i}`, label: 'oil', title: 'Last column (no number) — oil temperature', lines, notes });
    }
  });

  // overall pattern
  const egts = d.egtF.map((v, i) => [v, i]).filter(([v]) => v != null);
  if (egts.length >= 2 && !inverted) {
    const hot = egts.reduce((a, b) => (b[0] > a[0] ? b : a));
    const cold = egts.reduce((a, b) => (b[0] < a[0] ? b : a));
    part.notes.push(note('info', `Hottest EGT: ${cylName(hot[1])} (${r0(hot[0])}°F); coolest: ${cylName(cold[1])} (${r0(cold[0])}°F); spread ${r0(hot[0] - cold[0])}°F.`));
  }
  if (d.chtMax != null) part.notes.push(note('info', `Hottest CHT: ${cylName(d.chtMaxCyl)} (${r0(d.chtMax)}°F).`));
  return part;
}

function chtScalePart(c) {
  return {
    key: 'chtscale', title: 'CHT scale (left)', shown: '250 · 350 · 450',
    lines: ['The CHT marks on the left read the dark segment in each column: segment 1 = 250°F, 5 = 350°F, 9 = 450°F — 25°F per segment (p.6).',
      'CHT is always on this absolute scale, whatever the view or mode. If the EGT column is shorter than the CHT segment, the CHT shows as one lit segment floating above it.'],
    notes: c.d?.chtMax != null ? chtNotes(c.d.chtMax, 'Hottest') : [],
  };
}

function dotPart(c) {
  const { disp } = c;
  const part = { key: 'dot', title: 'Dot (under the numbers)', shown: disp.dot.index == null ? 'none' : `under ${disp.columns[disp.dot.index]?.label ?? disp.dot.index + 1}${disp.dot.blink ? ', flashing' : ''}`, lines: [], notes: [] };
  if (!disp.power) part.lines.push('Dark — no power.');
  else if (disp.dot.index == null) part.lines.push('No dot: the digital window is showing something that is not tied to one cylinder.');
  else {
    const n = disp.dot.index + 1;
    const WHY = { DIF: 'the cylinder furthest from the average EGT (DIF)', CLD: 'the fastest-cooling cylinder (CLD)', CHT: 'the cylinder with the hottest CHT', CHTHI: 'the cylinder with the hottest CHT' };
    let why = null;
    if (c.overlay?.kind === 'ALARM') why = WHY[c.overlay.id] ?? null;
    else if (!c.overlay && c.st.state !== 'LEANFIND') why = WHY[c.st.item] ?? null;
    part.lines.push(why ? `Dot under ${n}: ${why}.` : `Dot under ${n}: the numbers in the digital window belong to cylinder ${n}.`);
    if (disp.dot.blink) part.lines.push(c.st.leanfind?.phase === 'ACTIVE' ? 'Flashing: LeanFind is active and tracking this cylinder.' : 'Flashing: LeanFind has locked on this cylinder.');
  }
  return part;
}

function viewPart(c) {
  const { disp } = c;
  const on = disp.view === 'N';
  return {
    key: 'view', title: 'NRM (view indicator)', shown: disp.power ? (on ? 'lit — Normalize' : 'dark — Percentage') : '—',
    lines: disp.power ? [on ? 'NRM lit: Normalize view — the columns show changes (10°F per segment) since you selected it.' : 'NRM dark: Percentage view — the columns show EGT against the red-line limit.', 'Hold LF for 3 s (in Automatic or Manual) to switch views (p.9).'] : ['Dark — no power.'],
    notes: [],
  };
}

function unitsPart(c) {
  return {
    key: 'units', title: '°F / °C', shown: c.disp.power ? c.unit : '—',
    lines: [`${c.unit} is lit: engine temperatures in the digital window are in ${c.unit === '°F' ? 'Fahrenheit' : 'Celsius'} (change in Program → ENG F/C, p.42).`],
    notes: [],
  };
}

function alarmPart(c) {
  const { edm, disp } = c;
  const part = { key: 'alarm', title: 'ALARM light (panel light wired to the EDM)', shown: disp.alarmLight ? 'ON' : 'off', lines: [], notes: [] };
  if (!disp.power) {
    part.lines.push('Off — no power.');
    return part;
  }
  const cond = edm.vol.alarmCond || {};
  if (disp.alarmLight) {
    const id = edm.vol.alarmActive;
    const [name, key, what] = ALARM_INFO[id];
    part.lines.push(`On: ${name} — ${what} (limit ${limitText(c, key)}).`, 'The light stays on while the condition exists and the alarm is not silenced. In programming or self-test the light still works even though the digital window doesn’t show the alarm.');
  } else part.lines.push('Off: no active (un-silenced) alarm.');
  part.lines.push('It is a separate, optional light on the instrument panel, driven by the EDM (p.24) — not part of the EDM face.');
  const silenced = ALARM_ORDER.filter((id) => cond[id] && edm.vol.alarmSupp[id] != null && edm.now < edm.vol.alarmSupp[id]);
  for (const id of silenced) {
    const until = edm.vol.alarmSupp[id];
    part.notes.push(note('warn', `${ALARM_INFO[id][0]} is still present but silenced ${until === Infinity ? 'for the rest of the flight' : `for another ${Math.ceil((until - edm.now) / 60000)} min`}.`));
  }
  const waiting = ALARM_ORDER.filter((id) => cond[id] && id !== edm.vol.alarmActive && !silenced.includes(id));
  if (waiting.length) part.notes.push(note('warn', `Also exceeded but hidden behind the higher-priority alarm: ${waiting.map((id) => ALARM_INFO[id][0]).join(', ')}.`));
  return part;
}

function legendPart() {
  return {
    key: 'legend', title: 'Printed legends', shown: 'EGT · % Limit · TSO · STEP · LF',
    lines: ['“EGT” and “% Limit” label the column scale: the top of a full column is 100 % of the programmed limit (the TIT-limit setting for EGT columns, the high-oil alarm limit for the oil column).', '“TSO”, “STEP” and “LF” are printed on the faceplate — not readings. STEP and LF mark the two buttons below them.'],
    notes: [],
  };
}

function behind(c) {
  const { sim } = c;
  if (!sim || !c.disp.power) return [];
  const t = sim.truth();
  const out = [];
  if (sim.engine.running) out.push(`True power: ${r0(t.pctTrue)} % of 180 HP (${r0(t.bhp)} HP); the POH cruise tables would label this about ${r0(t.pctTrue * FIT.engine.kPOH)} %.`);
  if (t.r && sim.engine.running) {
    const tag = (r) => (r > 1.02 ? 'rich of peak' : r < 0.98 ? 'lean of peak' : 'at peak');
    const leanest = t.r.indexOf(Math.min(...t.r));
    out.push(`Mixture per cylinder: ${t.r.map((r, i) => `#${i + 1} ${tag(r)}`).join(', ')}. Cylinder ${leanest + 1} is the leanest — it will peak first when you lean.`);
  }
  if (t.ice > 0.05) out.push(`Carburetor ice: ${r0(t.ice * 100)} % of the venturi blocked.`);
  if (t.misfire?.some((m) => m > 0.05)) out.push(`Misfiring: ${t.misfire.map((m, i) => (m > 0.05 ? `#${i + 1} ${r0(m * 100)} %` : null)).filter(Boolean).join(', ')}.`);
  if (t.preign?.some(Boolean)) out.push('Pre-ignition is happening.');
  if (t.knock && Math.max(...t.knock) > 1) out.push('Detonation (knock) is happening.');
  if (out.length) out.unshift('A real EDM cannot show these — the simulator knows them:');
  return out;
}
