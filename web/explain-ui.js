// Explain panel + numbered hotspots on the instrument face. Press "Explain" (or E): the simulation pauses on a
// snapshot (or keeps running with "Live"), every part of the display is numbered on the face, and the panel says what
// each part shows right now. Tap a part of the face to jump to its explanation, or a section to highlight the part.

import { explainDisplay } from './explain.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function initExplain({ getEdm, getSim, getFace, isPaused, setPaused, releaseAll }) {
  const panel = document.getElementById('explain');
  const body = panel.querySelector('.ex-body');
  const live = panel.querySelector('#ex-live');
  const ui = { open: false, pausedByUs: false, selected: null, sig: '', lastRender: 0 };

  function signature() {
    const edm = getEdm();
    const d = edm.getDisplay();
    const st = edm.getState();
    return [st.path, st.item, d.digital.text, d.dot.index, d.dot.blink, d.view, d.alarmLight, d.upper.text, d.power].join('|');
  }

  function place() {
    const inst = document.querySelector('.instrument');
    const phone = matchMedia('(max-width: 719px)').matches;
    panel.classList.toggle('sheet', phone);
    if (phone) {
      panel.style.left = '0';
      panel.style.top = `${Math.round(inst.getBoundingClientRect().bottom)}px`;
    } else {
      const right = document.querySelector('.panel').getBoundingClientRect().right;
      panel.style.top = '0';
      panel.style.left = `${Math.round(Math.max(right + 8, innerWidth - 600))}px`;
    }
  }

  function render() {
    const ex = explainDisplay({ edm: getEdm(), sim: getSim() });
    const keep = body.scrollTop;
    const noteHtml = (n) => `<li class="ex-note ${n.level}">${esc(n.text)}</li>`;
    body.innerHTML = `
      <p class="ex-headline">${esc(ex.headline)}</p>
      ${ex.parts.map((p) => `
        <section class="ex-part" data-key="${p.key}">
          <h4><span class="ex-n">${p.n}</span>${esc(p.title)}${p.shown ? ` <code class="ex-shown">${esc(p.shown)}</code>` : ''}</h4>
          ${p.subtitle ? `<div class="ex-sub">${esc(p.subtitle)}</div>` : ''}
          ${p.lines.map((l) => `<p>${esc(l)}</p>`).join('')}
          ${p.notes.length ? `<ul class="ex-notes">${p.notes.map(noteHtml).join('')}</ul>` : ''}
          ${(p.columns || []).map((c) => `
            <div class="ex-col" data-key="${c.key}"><b>${esc(c.title)}</b>
              ${c.lines.map((l) => `<div>${esc(l)}</div>`).join('')}
              ${c.notes.length ? `<ul class="ex-notes">${c.notes.map(noteHtml).join('')}</ul>` : ''}
            </div>`).join('')}
        </section>`).join('')}
      <section class="ex-part ex-buttons"><h4>What the buttons do now</h4>
        <div class="ex-sub">${esc(ex.buttons.title)}</div>${ex.buttons.lines.map((l) => `<p>${esc(l)}</p>`).join('')}</section>
      ${ex.behind.length ? `<section class="ex-part ex-behind"><h4>Behind the instrument</h4>${ex.behind.map((l) => `<p>${esc(l)}</p>`).join('')}</section>` : ''}`;
    body.scrollTop = keep;
    body.querySelectorAll('[data-key]').forEach((el) =>
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        select(el.dataset.key, false);
      }),
    );
    drawHotspots(ex);
    if (ui.selected) select(ui.selected, false, true);
    ui.sig = signature();
    ui.lastRender = performance.now();
  }

  function drawHotspots(ex) {
    const face = getFace();
    const svg = face.svg;
    svg.querySelector('.ex-layer')?.remove();
    const regions = face.regions();
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'ex-layer');
    const add = (tag, attrs, parent = g) => {
      const e = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      parent.appendChild(e);
      return e;
    };
    const order = ['bars', ...Object.keys(regions).filter((k) => k !== 'bars')]; // columns drawn over the bar area
    for (const key of order) {
      for (const r of regions[key]) {
        const rect = add('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: 4, class: 'ex-hot', 'data-key': key });
        rect.addEventListener('click', (e) => {
          e.stopPropagation();
          select(key, true);
        });
      }
    }
    for (const p of ex.parts) {
      const r = regions[p.key]?.[0];
      if (!r) continue;
      const bx = Math.max(10, r.x - 4);
      const by = Math.max(10, r.y - 4);
      const badge = add('g', { class: 'ex-badge', 'data-key': p.key });
      add('circle', { cx: bx, cy: by, r: 8.5 }, badge);
      add('text', { x: bx, y: by + 3.6, 'text-anchor': 'middle' }, badge).textContent = String(p.n);
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        select(p.key, true);
      });
    }
    svg.appendChild(g);
    const alarmN = ex.parts.find((p) => p.key === 'alarm')?.n;
    for (const id of ['alarm-light', 'alarm-mini']) document.getElementById(id)?.setAttribute('data-ex-n', alarmN ?? '');
  }

  function select(key, fromFace, quiet = false) {
    ui.selected = key;
    const partKey = /^col\d/.test(key) ? 'bars' : key;
    getFace().svg.querySelectorAll('.ex-hot').forEach((r) => r.classList.toggle('sel', r.dataset.key === key || (key === 'bars' && /^col\d/.test(r.dataset.key))));
    for (const id of ['alarm-light', 'alarm-mini']) document.getElementById(id)?.classList.toggle('ex-sel', key === 'alarm');
    body.querySelectorAll('.ex-part, .ex-col').forEach((s) => s.classList.toggle('sel', s.dataset.key === key || (s.dataset.key === partKey && !/^col/.test(key))));
    if (fromFace && !quiet) {
      const target = body.querySelector(`.ex-col[data-key="${key}"]`) || body.querySelector(`.ex-part[data-key="${partKey}"]`);
      target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function open() {
    if (ui.open) return;
    ui.open = true;
    releaseAll();
    ui.needPin = matchMedia('(max-width: 719px)').matches; // next frame: pin the face to the top, sheet under it
    applyLive();
    panel.hidden = false;
    document.body.classList.add('explaining');
    document.getElementById('btn-explain').setAttribute('aria-pressed', 'true');
    place();
    render();
  }

  function close() {
    if (!ui.open) return;
    ui.open = false;
    panel.hidden = true;
    document.body.classList.remove('explaining');
    document.getElementById('btn-explain').setAttribute('aria-pressed', 'false');
    getFace().svg.querySelector('.ex-layer')?.remove();
    for (const id of ['alarm-light', 'alarm-mini']) document.getElementById(id)?.classList.remove('ex-sel');
    if (ui.pausedByUs && isPaused()) setPaused(false);
    ui.pausedByUs = false;
    ui.selected = null;
  }

  function applyLive() {
    if (live.checked) {
      if (ui.pausedByUs && isPaused()) setPaused(false);
      ui.pausedByUs = false;
    } else if (!isPaused()) {
      setPaused(true);
      ui.pausedByUs = true;
    }
    panel.querySelector('.ex-mode').textContent = live.checked ? 'live — updates every second' : 'snapshot — simulation paused';
  }

  document.getElementById('btn-explain').addEventListener('click', () => (ui.open ? close() : open()));
  panel.querySelector('#ex-close').addEventListener('click', close);
  live.addEventListener('change', () => {
    applyLive();
    render();
  });
  addEventListener('resize', () => ui.open && place());
  addEventListener('scroll', () => ui.open && place(), { passive: true });
  addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, select, textarea') || document.querySelector('dialog[open]')) return;
    if (e.key === 'Escape' && ui.open) close();
    else if (e.key.toLowerCase() === 'e' && !e.repeat && !e.ctrlKey && !e.metaKey) ui.open ? close() : open();
  });

  return {
    /** Call every frame: refreshes when the display changes (buttons pressed while paused) or every second when live. */
    tick() {
      if (!ui.open) return;
      if (ui.needPin) {
        // after the header has settled (the PAUSED notice appears a frame later)
        ui.needPin = false;
        const y = document.querySelector('.instrument').getBoundingClientRect().top;
        if (y > 0) scrollBy(0, y);
      }
      place();
      if (!getFace().svg.querySelector('.ex-layer')) return render(); // the face was rebuilt
      const due = live.checked && performance.now() - ui.lastRender > 1000;
      if (due || signature() !== ui.sig) render();
    },
    open,
    close,
    get isOpen() {
      return ui.open;
    },
  };
}
