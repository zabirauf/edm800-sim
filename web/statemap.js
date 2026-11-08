// State-machine map: turns the explorer's result (src/edm/explore.js) into a laid-out, grouped graph for the
// "State machine" dev view — named groups, node boxes with sample displays, merged and labelled transitions,
// group-level edges for the zoomed-out overview, and shortest input routes between states. Pure (no DOM).

export const GROUP_NAMES = {
  OFF: 'Off', TANK_SETUP: 'Tank set-up', SELFTEST: 'Self-test', STARTUP_INFO: 'Start-up info', FUEL_FILL: 'Start-up fuel',
  MANUAL: 'Manual mode', AUTO: 'Automatic mode', LEANFIND: 'LeanFind', PROGRAM: 'Pilot programming', USB: 'Data download',
  'PROGRAM.LTM': 'Long-term memory set-up', 'PROGRAM.FACLIM': 'Alarm limits (FAC LIM)',
};
const NODE_NAMES = {
  OFF: 'Off', MANUAL: 'Manual', AUTO: 'Automatic', ROP_SET: 'ROP SET', LOP_DONE: 'LOP done', LOP_REVIEW: 'LOP review',
  OAT_CAL: 'OAT cal', HPC: 'HP constant', MAP_CAL: 'MAP cal', KF_EDIT: 'K-factor edit', DUMP_XFER: 'Dump', SAVE_D: 'Save D?',
  LTM_ID_EDIT: 'ID edit', FACLIM_BANNER: 'FAC LIM', EC_EDIT: 'EC edit', ORIG_TIT: 'Orig TIT?', CAL_TIT: 'TIT cal', ADJUST: 'Adjust',
};

// Top-level arrangement: columns of entries (an entry is a group id or a row of group ids), and the grid inside each
// group (rows of cells; a cell is a path, null, or {group}). Power-up then normal operation flow down the left column,
// pilot programming is on the right.
const TOP_COLUMNS = [
  ['OFF', 'TANK_SETUP', 'SELFTEST', 'STARTUP_INFO', 'FUEL_FILL', ['MANUAL', 'AUTO'], 'LEANFIND', 'USB'],
  ['PROGRAM'],
];
const GRID = {
  OFF: [['OFF']],
  TANK_SETUP: [['TANK_SETUP.MAIN', 'TANK_SETUP.AUXQ', 'TANK_SETUP.AUX']],
  SELFTEST: [['SELFTEST.SEGMENTS', 'SELFTEST.COLUMNS', 'SELFTEST.PROBES']],
  STARTUP_INFO: [['STARTUP_INFO.DATE', 'STARTUP_INFO.TIME', 'STARTUP_INFO.FULL', 'STARTUP_INFO.ID']],
  FUEL_FILL: [['FUEL_FILL.BANNER', 'FUEL_FILL.SEL', 'FUEL_FILL.ADD']],
  MANUAL: [['MANUAL']],
  AUTO: [['AUTO']],
  LEANFIND: [['LEANFIND.ARMED', 'LEANFIND.ACTIVE', 'LEANFIND.LEANEST', 'LEANFIND.ROP_SET'], [null, null, 'LEANFIND.LOP_DONE', 'LEANFIND.LOP_REVIEW']],
  USB: [['USB.MENU', 'USB.XFER', 'USB.DONE']],
  PROGRAM: [
    ['PROGRAM.BANNER'],
    ['PROGRAM.ITEM.FUEL'],
    ['PROGRAM.ITEM.RATE', 'PROGRAM.ORIG_TIT', 'PROGRAM.CAL_TIT'],
    ['PROGRAM.ITEM.OATU', 'PROGRAM.OAT_CAL'],
    ['PROGRAM.ITEM.EGT1'],
    ['PROGRAM.ITEM.HPQ', 'PROGRAM.ADJUST', 'PROGRAM.HPC', 'PROGRAM.MAP_CAL'],
    ['PROGRAM.ITEM.KF', 'PROGRAM.KF_EDIT'],
    ['PROGRAM.ITEM.ACCUM'],
    ['PROGRAM.ITEM.GPSC'],
    ['PROGRAM.ITEM.DUMP', 'PROGRAM.DUMP_XFER', 'PROGRAM.SAVE_D', { group: 'PROGRAM.LTM' }, 'PROGRAM.LTM_ID_EDIT'],
    ['PROGRAM.ITEM.END', 'PROGRAM.FACLIM_BANNER', { group: 'PROGRAM.FACLIM' }, 'PROGRAM.EC_EDIT'],
  ],
};
const COLUMN_MAJOR = { 'PROGRAM.LTM': 4, 'PROGRAM.FACLIM': 8 }; // group → rows (filled down, then across)

export const SIZE = { w: 168, h: 50, gapX: 46, gapY: 24, pad: 16, title: 28, groupGapX: 230, groupGapY: 210, minTopW: 380, minTopH: 150 };

const shortAction = (a) => a.replace('STEP+LF', 'both').replace('hold ', 'hold ').replace('insert USB drive', 'USB in')
  .replace('remove USB drive', 'USB out').replace('connect memory box', 'memory box');

export function groupOf(path) {
  if (path.startsWith('PROGRAM.LTM.')) return 'PROGRAM.LTM';
  if (path.startsWith('PROGRAM.FACLIM.')) return 'PROGRAM.FACLIM';
  return path.split('.')[0];
}
export function topOf(path) {
  return path.split('.')[0];
}
export function nodeName(path) {
  const last = path.split('.').at(-1);
  return NODE_NAMES[last] ?? NODE_NAMES[path] ?? last;
}

function timerLabel(e) {
  if (e.from === 'MANUAL' && e.to === 'AUTO') return '2 min after power-up';
  const s = Math.round(e.ms / 100) / 10;
  return `after ${s} s`;
}

/** Describe what distinguishes an edge from siblings that share (from, action) but go elsewhere: for each sibling pick
 *  the first feature whose values don't overlap, then describe the chosen features with this edge's values. */
function conditionFor(edge, siblings) {
  const feats = {
    text: (e) => [...e.when],
    method: (e) => e.hidden.map((h) => h.method),
    returnTo: (e) => e.hidden.map((h) => h.returnTo),
    lop: (e) => e.hidden.map((h) => h.lop),
    next: (e) => e.hidden.map((h) => h.next),
  };
  const chosen = new Set();
  for (const s of siblings) {
    for (const [k, f] of Object.entries(feats)) {
      const mine = new Set(f(edge));
      if (mine.size && !f(s).some((v) => mine.has(v))) {
        chosen.add(k);
        break;
      }
    }
  }
  const out = [];
  for (const k of Object.keys(feats)) {
    if (!chosen.has(k)) continue;
    const vals = [...new Set(feats[k](edge))];
    if (k === 'text') out.push(`on ${vals.slice(0, 2).join(' / ')}`);
    if (k === 'method') out.push(vals[0] === 'L' ? 'LEAN L' : 'LEAN R');
    if (k === 'returnTo') out.push(`entered from ${vals[0] === 'AUTO' ? 'Automatic' : 'Manual'}`);
    if (k === 'lop') out.push(vals[0] ? 'lean-of-peak result stored' : 'no lean-of-peak result');
    if (k === 'next') out.push(`on the way to ${NODE_NAMES[vals[0]] ?? vals[0]}`);
  }
  return out.join(', ');
}

/**
 * Build the map.
 * @param {{nodes: Map, edges: object[]}} explored – result of exploreStateMachine()
 */
export function buildStateMap(explored) {
  const nodes = new Map();
  for (const [path, n] of explored.nodes) {
    nodes.set(path, {
      id: path, group: groupOf(path), top: topOf(path), name: nodeName(path), samples: n.samples,
      stays: [...n.selfLoops.keys()].filter((a) => a !== 'power off'), x: 0, y: 0, w: SIZE.w, h: SIZE.h,
    });
  }

  // transitions: label each (from, action) branch, then merge parallel edges into one drawn edge
  const byFromAction = new Map();
  for (const e of explored.edges) {
    const k = `${e.from}|${e.action}`;
    if (!byFromAction.has(k)) byFromAction.set(k, []);
    byFromAction.get(k).push(e);
  }
  const transitions = explored.edges.map((e) => {
    const sib = byFromAction.get(`${e.from}|${e.action}`).filter((s) => s !== e);
    const label = e.action === 'timer' ? timerLabel(e) : e.action;
    return { from: e.from, to: e.to, action: e.action, kind: e.kind, label, when: sib.length ? conditionFor(e, sib) : '' };
  });
  // exits shared by several states of a group are drawn once, from the group's border (statechart style)
  const members = new Map();
  for (const n of nodes.values()) {
    if (!members.has(n.top)) members.set(n.top, []);
    members.get(n.top).push(n.id);
  }
  const shared = new Map();
  for (const t of transitions) {
    const g = topOf(t.from);
    if (topOf(t.to) === g || (members.get(g) || []).length < 2) continue;
    const k = `${g}|${t.label}|${t.when}|${t.to}`;
    if (!shared.has(k)) shared.set(k, []);
    shared.get(k).push(t);
  }
  const fromOf = new Map(); // transition → drawn source (a state, or a group when shared)
  for (const [k, ts] of shared) if (ts.length >= 2) ts.forEach((t) => fromOf.set(t, `group:${k.split('|')[0]}`));
  const drawn = new Map();
  for (const t of transitions) {
    const src = fromOf.get(t) ?? t.from;
    const k = `${src}→${t.to}`;
    if (!drawn.has(k)) drawn.set(k, { id: k, from: src, to: t.to, items: [], powerOff: false, fromGroup: src.startsWith('group:') });
    const d = drawn.get(k);
    if (!d.items.some((x) => x.label === t.label && x.when === t.when)) d.items.push(t);
    t.drawn = k;
  }
  const edges = [...drawn.values()].map((d) => {
    d.powerOff = d.to === 'OFF' && d.items.every((t) => t.action === 'power off');
    d.kind = d.items.every((t) => t.kind === 'time') ? 'time' : d.items.every((t) => t.kind === 'engine') ? 'engine' : d.items.every((t) => t.kind === 'button') ? 'button' : 'other';
    d.label = d.items.map((t) => (t.kind === 'button' ? shortAction(t.label) : t.label) + (t.when ? ` (${t.when})` : '')).join(' · ');
    return d;
  });

  // group-level edges for the overview
  const agg = new Map();
  for (const e of edges) {
    const a = topOf(e.from.replace(/^group:/, ''));
    const b = topOf(e.to);
    if (a === b || e.powerOff) continue;
    const k = `${a}→${b}`;
    if (!agg.has(k)) agg.set(k, { id: k, from: a, to: b, actions: new Set() });
    e.items.forEach((t) => agg.get(k).actions.add(t.kind === 'button' ? shortAction(t.label) : t.label));
    agg.get(k).kinds = new Set([...(agg.get(k).kinds || []), ...e.items.map((t) => t.kind)]);
  }
  const groupEdges = [...agg.values()].map((g) => ({
    ...g, kind: g.kinds.size === 1 ? [...g.kinds][0] : 'other', label: [...g.actions].slice(0, 3).join(' · ') + (g.actions.size > 3 ? ' …' : ''),
  }));

  const groups = layout(nodes);
  return { nodes, edges, groupEdges, groups, transitions, bounds: boundsOf(groups), exact: { variants: explored.variants, vedges: explored.vedges } };
}

// ------------------------------------------------------------------ layout

function layout(nodes) {
  const { w, h, gapX, gapY, pad, title, groupGapX, groupGapY } = SIZE;
  const groups = new Map();
  const placed = new Set();
  const present = (p) => p && nodes.has(p);

  // size + place a group's grid at (ox, oy); returns the group box
  function placeGroup(id, ox, oy) {
    let rows = GRID[id];
    if (COLUMN_MAJOR[id]) {
      const members = [...nodes.values()].filter((n) => n.group === id).map((n) => n.id);
      const nr = COLUMN_MAJOR[id];
      rows = Array.from({ length: Math.min(nr, members.length) }, (_, r) => members.filter((_, i) => i % nr === r));
    }
    rows = (rows || []).map((r) => r.filter((c) => c == null || typeof c === 'object' || present(c) || c === null))
      .filter((r) => r.some((c) => c != null && (typeof c === 'object' || present(c))));
    // unknown members of this group (not in the grid) go in extra rows so nothing is lost
    const listed = new Set(rows.flat().filter((c) => typeof c === 'string'));
    const extra = [...nodes.values()].filter((n) => n.group === id && !listed.has(n.id) && !COLUMN_MAJOR[id]).map((n) => n.id);
    for (let i = 0; i < extra.length; i += 3) rows.push(extra.slice(i, i + 3));

    // column x positions depend on the widest cell per column; nested groups are laid out first to know their size
    const nested = new Map();
    const colW = [];
    const rowH = [];
    rows.forEach((r, ri) => {
      rowH[ri] = h;
      r.forEach((c, ci) => {
        let cw = w;
        if (c && typeof c === 'object') {
          const g = placeGroup(c.group, 0, 0);
          nested.set(c.group, g);
          cw = g.w;
          rowH[ri] = Math.max(rowH[ri], g.h);
        }
        colW[ci] = Math.max(colW[ci] || 0, cw);
      });
    });
    const colX = [];
    let x = pad;
    colW.forEach((cw, ci) => {
      colX[ci] = x;
      x += cw + gapX;
    });
    const rowY = [];
    let y = title + pad / 2;
    rowH.forEach((rh, ri) => {
      rowY[ri] = y;
      y += rh + gapY;
    });
    const isTop = !id.includes('.');
    const box = { id, name: GROUP_NAMES[id] ?? id, x: ox, y: oy, w: Math.max(x - gapX + pad, w + 2 * pad, isTop ? SIZE.minTopW : 0), h: Math.max(y - gapY + pad, isTop ? SIZE.minTopH : 0), members: [], children: [] };
    rows.forEach((r, ri) => r.forEach((c, ci) => {
      if (c == null) return;
      if (typeof c === 'object') {
        const g = nested.get(c.group);
        shiftGroup(g, ox + colX[ci] - g.x, oy + rowY[ri] - g.y);
        box.children.push(g);
        return;
      }
      const n = nodes.get(c);
      n.x = ox + colX[ci];
      n.y = oy + rowY[ri];
      box.members.push(n.id);
      placed.add(n.id);
    }));
    groups.set(id, box);
    return box;
  }
  function shiftGroup(g, dx, dy) {
    g.x += dx;
    g.y += dy;
    for (const m of g.members) {
      nodes.get(m).x += dx;
      nodes.get(m).y += dy;
    }
    g.children.forEach((c) => shiftGroup(c, dx, dy));
  }

  const tops = new Set([...nodes.values()].map((n) => n.top));
  const columns = TOP_COLUMNS.map((c) => c.map((e) => (Array.isArray(e) ? e.filter((g) => tops.has(g)) : tops.has(e) ? [e] : [])).filter((e) => e.length));
  const unknownTops = [...tops].filter((t) => !TOP_COLUMNS.flat(2).includes(t));
  if (unknownTops.length) columns.push(unknownTops.map((t) => [t]));
  let x = 0;
  for (const c of columns) {
    let y = 0;
    let cw = 0;
    for (const entry of c) {
      let ex = x;
      let rh = 0;
      for (const id of entry) {
        const g = placeGroup(id, ex, y);
        ex += g.w + groupGapX;
        rh = Math.max(rh, g.h);
      }
      cw = Math.max(cw, ex - groupGapX - x);
      y += rh + groupGapY;
    }
    x += cw + groupGapX * 1.4;
  }
  for (const n of nodes.values()) if (!placed.has(n.id)) throw new Error(`state ${n.id} was not placed`);
  for (const g of groups.values()) g.top = !g.id.includes('.');
  return groups;
}

function boundsOf(groups) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const g of groups.values()) {
    x0 = Math.min(x0, g.x);
    y0 = Math.min(y0, g.y);
    x1 = Math.max(x1, g.x + g.w);
    y1 = Math.max(y1, g.y + g.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// ------------------------------------------------------------------ routes

/**
 * Shortest list of inputs from one state to another, planned on the explorer's exact (context-aware) transitions, so
 * it includes the in-place steps that matter (e.g. "tap LF" to make FUEL? Y before "tap STEP"). `fromKey` is the
 * live machine's variantKey(); if the explorer never saw that exact variant, any variant of `fromPath` is used.
 * Returns [{action, label, kind, to (path), text (display after the step)}] or null.
 */
export function routeBetween(map, fromPath, toPath, fromKey = null) {
  if (fromPath === toPath) return [];
  const { variants, vedges } = map.exact;
  const out = new Map();
  for (const e of vedges) {
    if (!out.has(e.from)) out.set(e.from, []);
    out.get(e.from).push(e);
  }
  // start from the live machine's exact variant if the explorer explored it, else from every explored variant of the state
  const starts = fromKey && variants.get(fromKey)?.explored ? [fromKey] : [...variants].filter(([, v]) => v.path === fromPath && v.explored).map(([k]) => k);
  // cheapest route (Dijkstra): waiting for a banner beats holding a button through it; power-cycling is a last resort
  const timed = new Set(vedges.filter((e) => e.action === 'timer').map((e) => e.from));
  const cost = (e) => (e.action === 'timer' ? 0.5 : e.action === 'power off' ? 10 : timed.has(e.from) ? 3 : 1);
  const dist = new Map(starts.map((k) => [k, 0]));
  const prev = new Map(starts.map((k) => [k, null]));
  const open = [...starts];
  const done = new Set();
  while (open.length) {
    open.sort((a, b) => dist.get(a) - dist.get(b));
    const cur = open.shift();
    if (done.has(cur)) continue;
    done.add(cur);
    if (variants.get(cur).path === toPath && prev.get(cur)) {
      const route = [];
      for (let x = prev.get(cur); x; x = prev.get(x.from)) route.unshift(x);
      return route.map((x) => {
        const v = variants.get(x.to);
        const t = map.transitions.find((tr) => tr.action === x.action && tr.to === v.path && tr.from === variants.get(x.from).path);
        return { action: x.action, kind: x.kind, label: t?.label ?? x.action, to: v.path, text: v.text, from: variants.get(x.from).path, drawn: t?.drawn };
      });
    }
    for (const e of out.get(cur) || []) {
      const d = dist.get(cur) + cost(e);
      if (d < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, d);
        prev.set(e.to, e);
        open.push(e.to);
      }
    }
  }
  return null;
}

/** Route as readable steps, repeats collapsed: "hold STEP+LF 5 s → wait (after 2 s) → tap LF (FUEL? Y) → tap STEP". */
export function describeRoute(route) {
  const steps = route.map((t) => (t.action === 'timer' ? `wait (${t.label})` : t.label) + (t.from === t.to && t.text ? ` (${t.text})` : ''));
  const out = [];
  for (const s of steps) {
    const last = out.at(-1);
    if (last && last.s === s) last.n++;
    else out.push({ s, n: 1 });
  }
  return out.map(({ s, n }) => (n > 1 ? `${s} ×${n}` : s));
}
