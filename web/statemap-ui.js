// "State machine" dev view: the whole EDM state machine as a zoomable map, with the live state highlighted.
//
// The graph is discovered by exploring the real machine (src/edm/explore.js) in small time slices, laid out by
// web/statemap.js, and drawn once as SVG. Pan/zoom only changes one transform; detail is switched by CSS classes
// (overview → states → labels), so zooming never rebuilds the DOM.

import { createExplorer, variantKey } from '../src/edm/explore.js';
import { buildStateMap, routeBetween, describeRoute, GROUP_NAMES, topOf } from './statemap.js';
import { helpFor } from './training.js';

const NS = 'http://www.w3.org/2000/svg';
const LOD = [0.42, 0.85]; // zoom thresholds: overview | states | full labels
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function el(tag, attrs = {}, parent = null, text = null) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

/** Point where the segment from rect a's centre towards (tx, ty) leaves the rect. */
function border(r, tx, ty) {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (!dx && !dy) return [cx, cy];
  const s = Math.min(Math.abs(r.w / 2 / (dx || 1e-9)), Math.abs(r.h / 2 / (dy || 1e-9)));
  return [cx + dx * s, cy + dy * s];
}

function edgePath(a, b, bend) {
  const ac = [a.x + a.w / 2, a.y + a.h / 2];
  const bc = [b.x + b.w / 2, b.y + b.h / 2];
  // control point offset perpendicular to the line (separates A→B from B→A)
  const mx = (ac[0] + bc[0]) / 2;
  const my = (ac[1] + bc[1]) / 2;
  const len = Math.hypot(bc[0] - ac[0], bc[1] - ac[1]) || 1;
  const nx = -(bc[1] - ac[1]) / len;
  const ny = (bc[0] - ac[0]) / len;
  const cx = mx + nx * bend;
  const cy = my + ny * bend;
  const p0 = border(a, cx, cy);
  const p1 = border(b, cx, cy);
  // label nearer the source: arrows converge on busy targets, their sources are spread out
  const t = 0.36;
  const lx = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * cx + t * t * p1[0];
  const ly = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * cy + t * t * p1[1];
  return { d: `M${p0[0].toFixed(1)},${p0[1].toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${p1[0].toFixed(1)},${p1[1].toFixed(1)}`, lx, ly };
}

export function createStateMapView({ host, getEdm, getConfig, getAnchors }) {
  host.innerHTML = `
    <div class="sm-toolbar">
      <button class="sm-zoom-out" title="Zoom out (−)">−</button>
      <button class="sm-zoom-in" title="Zoom in (+)">+</button>
      <button class="sm-fit" title="Whole machine">Fit</button>
      <button class="sm-now" title="Zoom to the current state">Now</button>
      <label class="check small"><input type="checkbox" class="sm-follow" checked> Follow</label>
      <label class="check small"><input type="checkbox" class="sm-power"> Power-off<span class="sm-wide"> arrows</span></label>
      <button class="sm-expand" title="Expand (Esc to restore)">Expand</button>
      <span class="sm-status small"></span>
    </div>
    <div class="sm-viewport">
      <svg class="sm-svg sm-lod0" aria-label="EDM state machine map"><defs>
        <marker id="sm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="sm-arrowhead"/></marker>
        <marker id="sm-arrow-hot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="sm-arrowhead hot"/></marker>
      </defs><g class="sm-world"></g></svg>
      <div class="sm-progress">Mapping the state machine by exploring it…</div>
      <div class="sm-zoomhint small"></div>
      <aside class="sm-details" hidden></aside>
    </div>
    <p class="sm-legend small muted">Every state and transition was found by driving the real EDM state machine: from each state the explorer tried
    every button gesture, timer, power/USB event and (in LeanFind) leaning. Zoom out for the overview, in for every state and label.
    <span class="sm-key cur">current</span> <span class="sm-key trail">just left</span> <span class="sm-key sel">selected</span> <span class="sm-key route">route</span></p>`;
  const $ = (s) => host.querySelector(s);
  const svg = $('.sm-svg');
  const world = $('.sm-world');
  const viewport = $('.sm-viewport');
  const details = $('.sm-details');
  const ui = {
    map: null, configKey: null, explorer: null, k: 0.3, tx: 0, ty: 0, raf: 0, cur: null, trail: [], selected: null,
    route: [], nodeEls: new Map(), groupEls: new Map(), edgeEls: new Map(), anim: null, visible: false, expanded: false,
  };

  // ------------------------------------------------------------------ exploration (time-sliced)
  function ensureMap() {
    const key = JSON.stringify(getConfig());
    if (ui.configKey === key && (ui.map || ui.explorer)) return;
    ui.configKey = key;
    ui.map = null;
    world.innerHTML = '';
    $('.sm-progress').hidden = false;
    ui.explorer = createExplorer({ config: getConfig() });
    const slice = () => {
      if (!ui.explorer) return;
      const done = ui.explorer.step(14);
      $('.sm-progress').textContent = `Mapping the state machine by exploring it… ${Math.round(ui.explorer.progress * 100)} %`;
      if (!done) return void requestAnimationFrame(slice);
      const res = ui.explorer.result();
      ui.explorer = null;
      ui.map = buildStateMap(res);
      ui.exploreMs = res.ms;
      draw();
      $('.sm-progress').hidden = true;
      fit(false);
      ui.cur = null;
      update(true);
    };
    requestAnimationFrame(slice);
  }

  // ------------------------------------------------------------------ drawing (once per map)
  function draw() {
    const m = ui.map;
    world.innerHTML = '';
    ui.nodeEls.clear();
    ui.groupEls.clear();
    ui.edgeEls.clear();
    const gGroups = el('g', { class: 'sm-groups' }, world);
    const gAgg = el('g', { class: 'sm-agg' }, world);
    const gEdges = el('g', { class: 'sm-edges' }, world);
    const gNodes = el('g', { class: 'sm-nodes' }, world);
    const gLabels = el('g', { class: 'sm-labels' }, world);
    const gAggLabels = el('g', { class: 'sm-agg-labels' }, world);

    const groups = [...m.groups.values()].sort((a, b) => (a.top === b.top ? 0 : a.top ? -1 : 1));
    for (const g of groups) {
      const ge = el('g', { class: `sm-group ${g.top ? 'top' : 'sub'}`, 'data-group': g.id }, gGroups);
      el('rect', { x: g.x, y: g.y, width: g.w, height: g.h, rx: 14 }, ge);
      el('text', { x: g.x + 14, y: g.y + 20, class: 'sm-gtitle' }, ge, g.name);
      if (g.top) {
        const n = [...m.nodes.values()].filter((x) => x.top === g.id).length;
        // overview title: constant on-screen size, but never wider than its box
        ge.style.setProperty('--fit', (g.w / (g.name.length * 0.62)).toFixed(1));
        const big = el('text', { x: g.x + g.w / 2, y: g.y + g.h / 2, class: 'sm-gbig', 'text-anchor': 'middle' }, ge);
        el('tspan', { x: g.x + g.w / 2, dy: '0' }, big, g.name);
        if (n > 1) el('tspan', { x: g.x + g.w / 2, dy: '1.25em', class: 'sm-gcount' }, big, `${n} states`);
      }
      ui.groupEls.set(g.id, ge);
    }
    // group-level edges (overview)
    const groupRect = (id) => m.groups.get(id);
    for (const e of m.groupEdges) {
      const rev = m.groupEdges.some((o) => o.from === e.to && o.to === e.from);
      const { d, lx, ly } = edgePath(groupRect(e.from), groupRect(e.to), rev ? 40 : 0);
      el('path', { d, class: `sm-agg-edge k-${e.kind}`, 'marker-end': 'url(#sm-arrow)', 'data-from': e.from, 'data-to': e.to }, gAgg);
      el('text', { x: lx, y: ly, class: 'sm-agg-label', 'text-anchor': 'middle', 'data-from': e.from, 'data-to': e.to }, gAggLabels, e.label);
    }
    // state-level edges
    const rectOf = (id) => (id.startsWith('group:') ? m.groups.get(id.slice(6)) : m.nodes.get(id));
    for (const e of m.edges) {
      const a = rectOf(e.from);
      const b = rectOf(e.to);
      const rev = m.edges.some((o) => o.from === e.to && o.to === e.from);
      const { d, lx, ly } = edgePath(a, b, rev ? 22 : 8);
      const cls = `sm-edge k-${e.kind}${e.fromGroup ? ' from-group' : ''}${e.powerOff ? ' poweroff' : ''}`;
      const from = e.fromGroup ? e.items.map((t) => t.from).join(' ') : e.from;
      const pe = el('path', { d, class: cls, 'marker-end': 'url(#sm-arrow)', 'data-from': from, 'data-to': e.to }, gEdges);
      const text = (e.fromGroup ? 'any state: ' : '') + e.label;
      const lab = el('text', { x: lx, y: ly, class: `sm-elabel${e.powerOff ? ' poweroff' : ''}`, 'text-anchor': 'middle', 'data-edge': e.id }, gLabels, text.length > 46 ? `${text.slice(0, 44)}…` : text);
      el('title', {}, lab, text);
      ui.edgeEls.set(e.id, { path: pe, label: lab, edge: e });
    }
    ui.byTransition = new Map(m.transitions.map((t) => [`${t.from}→${t.to}`, t.drawn]));
    for (const n of m.nodes.values()) {
      const ge = el('g', { class: `sm-node${n.id.includes('.ITEM.') ? ' item' : ''}`, 'data-id': n.id }, gNodes);
      el('rect', { x: n.x, y: n.y, width: n.w, height: n.h, rx: 8 }, ge);
      el('text', { x: n.x + 10, y: n.y + 19, class: 'sm-nname' }, ge, n.name);
      if (n.samples[0]) el('text', { x: n.x + 10, y: n.y + 38, class: 'sm-sample' }, ge, n.samples[0].slice(0, 18));
      ui.nodeEls.set(n.id, ge);
    }
    applyPowerToggle();
  }

  function applyPowerToggle() {
    svg.classList.toggle('sm-show-power', $('.sm-power').checked);
  }

  // ------------------------------------------------------------------ pan / zoom
  function lod() {
    return ui.k < LOD[0] ? 0 : ui.k < LOD[1] ? 1 : 2;
  }
  function apply() {
    ui.raf = 0;
    world.setAttribute('transform', `translate(${ui.tx.toFixed(1)} ${ui.ty.toFixed(1)}) scale(${ui.k.toFixed(4)})`);
    svg.style.setProperty('--k', ui.k.toFixed(4)); // overview text and line widths stay the same size on screen
    const l = lod();
    if (svg.dataset.lod !== String(l)) {
      svg.dataset.lod = String(l);
      svg.classList.remove('sm-lod0', 'sm-lod1', 'sm-lod2');
      svg.classList.add(`sm-lod${l}`);
      $('.sm-zoomhint').textContent = ['Overview — zoom in for every state', 'States — zoom in for labels', 'Full detail'][l];
    }
  }
  function schedule() {
    if (!ui.raf) ui.raf = requestAnimationFrame(apply);
  }
  function zoomAt(f, px, py) {
    const k = Math.min(3, Math.max(0.08, ui.k * f));
    const r = k / ui.k;
    ui.tx = px - (px - ui.tx) * r;
    ui.ty = py - (py - ui.ty) * r;
    ui.k = k;
    schedule();
  }
  function size() {
    const r = svg.getBoundingClientRect();
    return { w: r.width || 600, h: r.height || 400 };
  }
  function animateTo(k, tx, ty, ms = 260) {
    const from = { k: ui.k, tx: ui.tx, ty: ui.ty };
    const t0 = performance.now();
    cancelAnimationFrame(ui.anim);
    const stepAnim = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      ui.k = from.k + (k - from.k) * e;
      ui.tx = from.tx + (tx - from.tx) * e;
      ui.ty = from.ty + (ty - from.ty) * e;
      apply();
      if (t < 1) ui.anim = requestAnimationFrame(stepAnim);
    };
    if (ms <= 0) {
      Object.assign(ui, { k, tx, ty });
      apply();
    } else ui.anim = requestAnimationFrame(stepAnim);
  }
  function fitRect(r, animate = true, maxK = 3) {
    const { w, h } = size();
    const pad = 24;
    const k = Math.min(maxK, (w - 2 * pad) / r.w, (h - 2 * pad) / r.h);
    animateTo(k, w / 2 - (r.x + r.w / 2) * k, h / 2 - (r.y + r.h / 2) * k, animate ? 260 : 0);
  }
  function fit(animate = true) {
    if (ui.map) fitRect(ui.map.bounds, animate);
  }
  function centerOn(id, k = Math.max(ui.k, LOD[1] + 0.05)) {
    const n = ui.map?.nodes.get(id);
    if (!n) return;
    const { w, h } = size();
    // with the details panel open beside the map, centre in the part that is still visible
    const side = !details.hidden && w > 700 ? details.getBoundingClientRect().width + 16 : 0;
    const low = !details.hidden && w <= 700 ? details.getBoundingClientRect().height + 8 : 0;
    animateTo(k, (w - side) / 2 - (n.x + n.w / 2) * k, (h - low) / 2 - (n.y + n.h / 2) * k);
  }
  function nodeVisible(id) {
    const n = ui.map.nodes.get(id);
    const { w, h } = size();
    const x = n.x * ui.k + ui.tx;
    const y = n.y * ui.k + ui.ty;
    return x > 0 && y > 0 && x + n.w * ui.k < w && y + n.h * ui.k < h;
  }

  // pointer: drag to pan, two fingers to pinch, wheel / trackpad pinch to zoom, tap to select
  const ptrs = new Map();
  let gesture = null;
  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = svg.getBoundingClientRect();
    if (ptrs.size === 1) gesture = { kind: 'pan', x: e.clientX, y: e.clientY, tx: ui.tx, ty: ui.ty, moved: 0, target: e.target };
    else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      gesture = { kind: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), k: ui.k, tx: ui.tx, ty: ui.ty, mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top, moved: 99 };
    }
  });
  svg.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId) || !gesture) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesture.kind === 'pan' && ptrs.size === 1) {
      gesture.moved = Math.max(gesture.moved, Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y));
      ui.tx = gesture.tx + e.clientX - gesture.x;
      ui.ty = gesture.ty + e.clientY - gesture.y;
      schedule();
    } else if (gesture.kind === 'pinch' && ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      const f = Math.hypot(a.x - b.x, a.y - b.y) / gesture.d;
      const k = Math.min(3, Math.max(0.08, gesture.k * f));
      const r = k / gesture.k;
      ui.k = k;
      ui.tx = gesture.mx - (gesture.mx - gesture.tx) * r;
      ui.ty = gesture.my - (gesture.my - gesture.ty) * r;
      schedule();
    }
  });
  const end = (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (gesture?.kind === 'pan' && gesture.moved < 6 && e.type === 'pointerup') clickAt(gesture.target);
    if (ptrs.size === 0) gesture = null;
    else if (ptrs.size === 1) {
      const [p] = [...ptrs.values()];
      gesture = { kind: 'pan', x: p.x, y: p.y, tx: ui.tx, ty: ui.ty, moved: 99 };
    }
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  svg.addEventListener('pointerover', (e) => {
    const n = e.target.closest?.('.sm-node');
    const g = e.target.closest?.('.sm-group.top');
    const hover = n?.dataset.id ?? null;
    const hoverGroup = g?.dataset.group ?? null;
    if (hover === ui.hover && hoverGroup === ui.hoverGroup) return;
    ui.hover = hover;
    ui.hoverGroup = hoverGroup;
    focus();
  });

  /** Fade every arrow except those touching the current, selected or hovered state (keeps busy areas readable). */
  function focus() {
    const ids = [ui.cur, ui.selected, ui.hover].filter(Boolean);
    svg.classList.toggle('sm-focusing', ids.length > 0);
    for (const { path, label, edge } of ui.edgeEls.values()) {
      const rel = ids.some((id) => edge.to === id || edge.items.some((t) => t.from === id));
      path.classList.toggle('rel', rel);
      label.classList.toggle('rel', rel);
      path.classList.toggle('hl', !!ui.hover && (edge.to === ui.hover || edge.items.some((t) => t.from === ui.hover)));
    }
    // overview: arrows of the current or hovered group
    const groupsOn = [ui.cur && topOf(ui.cur), ui.hoverGroup].filter(Boolean);
    svg.querySelectorAll('.sm-agg-edge, .sm-agg-label').forEach((x) => x.classList.toggle('rel', groupsOn.includes(x.dataset.from) || groupsOn.includes(x.dataset.to)));
  }

  function clickAt(target) {
    const n = target.closest?.('.sm-node');
    if (n && lod() > 0) return select(n.dataset.id);
    const g = target.closest?.('.sm-group');
    if (g) {
      const box = ui.map.groups.get(g.dataset.group);
      if (lod() === 0 || !n) fitRect(box, true, 1.2);
      return;
    }
    select(null);
  }

  // ------------------------------------------------------------------ selection, details, routes
  function select(id) {
    ui.selected = id;
    ui.nodeEls.forEach((e, k) => e.classList.toggle('sel', k === id));
    showRoute([]);
    focus();
    if (!id) {
      details.hidden = true;
      return;
    }
    const m = ui.map;
    const n = m.nodes.get(id);
    const out = m.transitions.filter((t) => t.from === id && t.action !== 'power off');
    const inn = m.transitions.filter((t) => t.to === id && t.action !== 'power off');
    const help = helpFor(id, null);
    const link = (p) => `<a href="#" data-goto="${esc(p)}">${esc(GROUP_NAMES[topOf(p)] && p.includes('.') ? `${GROUP_NAMES[topOf(p)]} › ${m.nodes.get(p)?.name ?? p}` : (GROUP_NAMES[p] ?? m.nodes.get(p)?.name ?? p))}</a>`;
    const cond = (t) => (t.when ? ` <span class="muted">(${esc(t.when)})</span>` : '');
    const outLi = (t) => `<li><b>${esc(t.label)}</b>${cond(t)} → ${link(t.to)}</li>`;
    const inLi = (t) => `<li>from ${link(t.from)} on <b>${esc(t.label)}</b>${cond(t)}</li>`;
    const route = ui.cur && ui.cur !== id ? routeBetween(m, ui.cur, id, variantKey(getEdm())) : null;
    details.innerHTML = `
      <button class="sm-close ghost small" title="Close">✕</button>
      <h4>${esc(GROUP_NAMES[n.top] ?? n.top)}${n.id.includes('.') ? ` › ${esc(n.name)}` : ''}</h4>
      <div class="sm-path mono small">${esc(n.id)}${n.id === ui.cur ? ' <span class="sm-here">← the EDM is here</span>' : ''}</div>
      ${n.samples.length ? `<div class="sm-samples">${n.samples.map((s) => `<code>${esc(s)}</code>`).join(' ')}</div>` : ''}
      <div class="sm-help"><b>${esc(help.title)}</b><ul>${help.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>
      ${out.length ? `<h5>Leaves on</h5><ul>${out.map(outLi).join('')}</ul>` : ''}
      ${inn.length ? `<h5>Arrives from</h5><ul>${inn.map(inLi).join('')}</ul>` : ''}
      ${n.stays.length ? `<h5>Stays here on</h5><p class="small">${n.stays.map(esc).join(' · ')}</p>` : ''}
      ${id !== 'OFF' ? '<p class="small muted">Power off → Off from every state.</p>' : ''}
      ${route ? `<h5>From the current state</h5><ol class="sm-route">${describeRoute(route).map((s) => `<li>${esc(s)}</li>`).join('')}</ol><button class="sm-showroute small">Show route on the map</button>` : ''}`;
    details.hidden = false;
    details.querySelector('.sm-close').addEventListener('click', () => select(null));
    details.querySelectorAll('[data-goto]').forEach((a) => a.addEventListener('click', (ev) => {
      ev.preventDefault();
      select(a.dataset.goto);
      centerOn(a.dataset.goto);
    }));
    details.querySelector('.sm-showroute')?.addEventListener('click', () => showRoute(route));
  }
  function showRoute(route) {
    svg.querySelectorAll('.route').forEach((x) => x.classList.remove('route'));
    ui.route = route;
    for (const t of route) {
      if (t.drawn) ui.edgeEls.get(t.drawn)?.path.classList.add('route');
      ui.nodeEls.get(t.to)?.classList.add('route');
    }
  }

  // ------------------------------------------------------------------ live state
  function update(force = false) {
    if (!ui.map || !ui.visible) return;
    const edm = getEdm();
    const st = edm.getState();
    const path = st.path;
    const last = edm.events.at(-1)?.type;
    $('.sm-status').innerHTML = `Now: <b>${esc(GROUP_NAMES[topOf(path)] ?? path)}${path.includes('.') ? ` › ${esc(ui.map.nodes.get(path)?.name ?? path)}` : ''}</b>${st.alarm ? ` · <span class="bad">alarm ${esc(st.alarm)}</span>` : ''}${last ? ` · last input ${esc(last.replace(/_/g, ' ').toLowerCase())}` : ''}`;
    if (path === ui.cur && !force) return;
    const prev = ui.cur;
    ui.cur = path;
    if (prev && prev !== path) ui.trail = [prev, ...ui.trail.filter((p) => p !== prev && p !== path)].slice(0, 3);
    ui.nodeEls.forEach((e, k) => {
      e.classList.toggle('cur', k === path);
      e.classList.toggle('trail', ui.trail.includes(k));
    });
    ui.groupEls.forEach((e, k) => e.classList.toggle('cur', path === k || path.startsWith(`${k}.`)));
    focus();
    if (prev && prev !== path) {
      const taken = ui.edgeEls.get(ui.byTransition.get(`${prev}→${path}`));
      if (taken) {
        taken.path.classList.add('taken');
        taken.path.setAttribute('marker-end', 'url(#sm-arrow-hot)');
        setTimeout(() => {
          taken.path.classList.remove('taken');
          taken.path.setAttribute('marker-end', 'url(#sm-arrow)');
        }, 1800);
      }
      const agg = svg.querySelector(`.sm-agg-edge[data-from="${CSS.escape(topOf(prev))}"][data-to="${CSS.escape(topOf(path))}"]`);
      if (agg) {
        agg.classList.add('taken');
        setTimeout(() => agg.classList.remove('taken'), 1800);
      }
    }
    if (!ui.map.nodes.has(path)) $('.sm-status').innerHTML += ' <span class="warn">(state not in the map)</span>';
    else if ($('.sm-follow').checked && lod() > 0 && !nodeVisible(path)) centerOn(path, ui.k);
    if (ui.selected) select(ui.selected); // refresh "from the current state"
  }

  // ------------------------------------------------------------------ toolbar, expand
  const mid = () => {
    const { w, h } = size();
    return [w / 2, h / 2];
  };
  $('.sm-zoom-in').addEventListener('click', () => zoomAt(1.5, ...mid()));
  $('.sm-zoom-out').addEventListener('click', () => zoomAt(1 / 1.5, ...mid()));
  $('.sm-fit').addEventListener('click', () => fit());
  $('.sm-now').addEventListener('click', () => ui.cur && centerOn(ui.cur, Math.max(1.0, ui.k)));
  $('.sm-power').addEventListener('change', applyPowerToggle);
  $('.sm-expand').addEventListener('click', () => setExpanded(!ui.expanded));
  addEventListener('keydown', (e) => {
    if (!ui.visible || e.target.closest?.('input, select, textarea')) return;
    if (e.key === 'Escape' && ui.expanded) setExpanded(false);
    else if (e.key === '+' || e.key === '=') zoomAt(1.25, ...mid());
    else if (e.key === '-') zoomAt(0.8, ...mid());
  });
  addEventListener('resize', () => ui.expanded && place());

  function place() {
    const a = getAnchors();
    if (a.phone) Object.assign(host.style, { top: `${a.top}px`, left: '0px' });
    else Object.assign(host.style, { top: '0px', left: `${a.left}px` });
  }
  function setExpanded(on) {
    ui.expanded = on;
    host.classList.toggle('sm-expanded', on);
    $('.sm-expand').textContent = on ? 'Restore' : 'Expand';
    if (on) place();
    else Object.assign(host.style, { top: '', left: '' });
    requestAnimationFrame(() => (ui.cur ? centerOn(ui.cur, ui.k) : fit(false)));
  }

  return {
    show() {
      ui.visible = true;
      ensureMap();
      // phones: the inline map would be a strip below the gauges — use the space under the pinned instrument
      if (getAnchors().phone && !ui.expanded) setExpanded(true);
      requestAnimationFrame(() => update(true));
    },
    hide() {
      ui.visible = false;
      if (ui.expanded) setExpanded(false);
    },
    /** call from the app's render loop */
    tick() {
      if (ui.visible) {
        update();
        if (ui.expanded) place();
      }
    },
    expand: setExpanded,
    get map() {
      return ui.map;
    },
    get zoom() {
      return { k: ui.k, lod: lod() };
    },
  };
}
