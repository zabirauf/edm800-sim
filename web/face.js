// SVG renderer for the EDM face: bar graph, labels, dot index, 14-segment digital and upper windows.

const SVG_NS = 'http://www.w3.org/2000/svg';

// 14-segment glyphs. Segments: a top, b upper-right, c lower-right, d bottom, e lower-left, f upper-left,
// g mid-left, h mid-right, i upper-center, j lower-center, k diag upper-left, l diag upper-right,
// m diag lower-left, n diag lower-right.
const GLYPHS = {
  '0': 'abcdeflm', '1': 'bc', '2': 'abdegh', '3': 'abcdh', '4': 'bcfgh', '5': 'acdfgh', '6': 'acdefgh',
  '7': 'abc', '8': 'abcdefgh', '9': 'abcdfgh',
  A: 'abcefgh', B: 'abcdhij', C: 'adef', D: 'abcdij', E: 'adefg', F: 'aefg', G: 'acdefh', H: 'bcefgh',
  I: 'adij', J: 'bcde', K: 'efgln', L: 'def', M: 'bcefkl', N: 'bcefkn', O: 'abcdef', P: 'abefgh',
  Q: 'abcdefn', R: 'abefghn', S: 'acdfgh', T: 'aij', U: 'bcdef', V: 'eflm', W: 'bcefmn', X: 'klmn',
  Y: 'jkl', Z: 'adlm', '-': 'gh', '=': 'dgh', '+': 'ghij', '?': 'abhj', '%': 'cfghlm', '/': 'lm',
  '*': 'ghijklmn', ' ': '', '_': 'd',
};

const SEG_LINES = {
  a: [3, 2, 19, 2], b: [20, 3.5, 20, 16.5], c: [20, 19.5, 20, 32.5], d: [3, 34, 19, 34],
  e: [2, 19.5, 2, 32.5], f: [2, 3.5, 2, 16.5], g: [3.5, 18, 10, 18], h: [12, 18, 18.5, 18],
  i: [11, 4, 11, 16], j: [11, 20, 11, 32], k: [4.5, 4.5, 9.5, 15.5], l: [17.5, 4.5, 12.5, 15.5],
  m: [9.5, 20.5, 4.5, 31.5], n: [12.5, 20.5, 17.5, 31.5],
};

function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

/** Parse display text into cells: each cell is {ch, dp}. '.' attaches to the previous cell. */
export function textToCells(text) {
  const cells = [];
  for (const ch of text) {
    if (ch === '.') {
      const prev = cells[cells.length - 1];
      if (prev && !prev.dp) prev.dp = true;
      else cells.push({ ch: ' ', dp: true });
    } else cells.push({ ch: ch.toUpperCase(), dp: false });
  }
  return cells;
}

class SegmentDisplay {
  constructor(parent, { x, y, cells, scale = 1, skew = -8 }) {
    this.g = el('g', { transform: `translate(${x},${y}) scale(${scale})` }, parent);
    this.cells = [];
    for (let i = 0; i < cells; i++) {
      const cg = el('g', { transform: `translate(${i * 25},0) skewX(${skew})` }, this.g);
      const segs = {};
      for (const [name, [x1, y1, x2, y2]] of Object.entries(SEG_LINES)) {
        segs[name] = el('line', { x1, y1, x2, y2, class: 'seg' }, cg);
      }
      const dp = el('circle', { cx: 23.5, cy: 34, r: 1.9, class: 'seg dp' }, cg);
      this.cells.push({ g: cg, segs, dp });
    }
    this.n = cells;
    this.last = null;
  }

  set(text, { blink = false, flashIndex = null, allOn = false } = {}) {
    const key = `${text}|${blink}|${flashIndex}|${allOn}`;
    if (key === this.last) return;
    this.last = key;
    const parsed = textToCells(text);
    // flashIndex counts raw characters (dots included); map it to a cell index.
    const flashCell = flashIndex != null ? textToCells(text.slice(0, flashIndex + 1)).length - 1 : null;
    // center the text in the available cells
    const start = Math.max(0, Math.floor((this.n - parsed.length) / 2));
    for (let i = 0; i < this.n; i++) {
      const c = this.cells[i];
      const cell = parsed[i - start];
      const on = allOn ? 'abcdefghijklmn' : cell ? GLYPHS[cell.ch] ?? '' : '';
      for (const [name, line] of Object.entries(c.segs)) line.classList.toggle('on', on.includes(name));
      c.dp.classList.toggle('on', allOn || !!(cell && cell.dp));
      const flashing = blink || (flashCell != null && i - start === flashCell);
      c.g.classList.toggle('blink', !!flashing);
    }
  }
}

export class Face {
  constructor(svg) {
    this.svg = svg;
    this.layoutKey = null;
  }

  /** Areas of the face (viewBox units) for the Explain overlay: key → array of {x, y, w, h}. */
  regions() {
    if (!this.colX) return {};
    const cx = this.colX;
    const left = cx[0] - 13;
    const width = cx[cx.length - 1] - cx[0] + 26;
    const r = {
      digital: [{ x: 66, y: 280, w: 268, h: 52 }],
      upper: [{ x: 152, y: 46, w: 92, h: 32 }],
      bars: [{ x: left, y: 128, w: width, h: 136 }],
      dot: [{ x: left, y: 111, w: width, h: 15 }],
      chtscale: [{ x: 48, y: 138, w: 42, h: 126 }],
      view: this.nrm ? [{ x: cx[0] - 22, y: 76, w: 40, h: 16 }] : [{ x: cx[0] - 10, y: 62, w: 156, h: 20 }],
      units: [{ x: 294, y: 79, w: 28, h: 31 }],
      legend: [{ x: 304, y: 115, w: 64, h: 62 }, { x: 58, y: 116, w: 34, h: 16 }],
    };
    cx.forEach((x, i) => (r[`col${i}`] = [{ x: x - 12, y: 92, w: 24, h: 18 }, { x: x - 12, y: 128, w: 24, h: 136 }]));
    return r;
  }

  _build(display) {
    const svg = this.svg;
    svg.innerHTML = '';
    el('rect', { x: 0, y: 0, width: 400, height: 400, rx: 18, class: 'bezel' }, svg);
    for (const [cx, cy] of [[22, 22], [378, 22], [22, 378], [378, 378]]) {
      el('circle', { cx, cy, r: 8, class: 'screw' }, svg);
      el('line', { x1: cx - 5, y1: cy - 5, x2: cx + 5, y2: cy + 5, class: 'screw-slot' }, svg);
    }
    el('circle', { cx: 200, cy: 200, r: 182, class: 'face-ring' }, svg);
    this.faceG = el('g', { class: 'face' }, svg);
    const f = this.faceG;
    el('circle', { cx: 200, cy: 200, r: 175, class: 'face-bg' }, f);

    const labels = display.columns.map((c) => c.label);
    const n = labels.length;
    const pitch = 26;
    const x0 = 200 - ((n - 1) * pitch) / 2;
    this.colX = labels.map((_, i) => x0 + i * pitch);

    // Upper window (%HP / RPM)
    this.upper = new SegmentDisplay(f, { x: 158, y: 52, cells: 4, scale: 0.62 });
    this.hpLabel = el('text', { x: 224, y: 62, class: 'lbl small' }, f);
    this.hpLabel.textContent = 'HP';

    // View indicator
    if (display.viewStyle === 'NRM') {
      this.nrm = el('text', { x: x0 - 18, y: 88, class: 'lbl ind' }, f);
      this.nrm.textContent = 'NRM';
    } else {
      this.nLbl = el('text', { x: x0 - 6, y: 74, class: 'lbl small' }, f);
      this.nLbl.textContent = 'N';
      this.nDash = el('line', { x1: x0 - 7, y1: 78, x2: x0 + 3, y2: 78, class: 'ind-dash' }, f);
      this.pLbl = el('text', { x: x0 + 140, y: 74, class: 'lbl small' }, f);
      this.pLbl.textContent = 'P';
      this.pDash = el('line', { x1: x0 + 139, y1: 78, x2: x0 + 149, y2: 78, class: 'ind-dash' }, f);
    }
    this.unitF = el('text', { x: 300, y: 92, class: 'lbl ind' }, f);
    this.unitF.textContent = '°F';
    this.unitC = el('text', { x: 300, y: 106, class: 'lbl ind' }, f);
    this.unitC.textContent = '°C';

    // Column labels & dots
    this.colLabels = labels.map((l, i) => {
      const t = el('text', { x: this.colX[i], y: 104, class: 'lbl collbl', 'text-anchor': 'middle' }, f);
      t.textContent = l;
      return t;
    });
    this.dots = labels.map((l, i) =>
      l === 'T' ? null : el('circle', { cx: this.colX[i], cy: 118, r: 4, class: 'dot' }, f),
    );
    const tso = el('text', { x: 64, y: 128, class: 'lbl small' }, f);
    tso.textContent = 'TSO';
    const egtL = el('text', { x: 312, y: 128, class: 'lbl small' }, f);
    egtL.textContent = 'EGT';
    const pl = el('text', { x: 312, y: 170, class: 'lbl small' }, f);
    pl.textContent = '% Limit';

    // CHT scale
    const segY = (k) => 256 - (k - 1) * 9; // k = 1..13
    this.segY = segY;
    const chtL = el('text', { x: 54, y: 150, class: 'lbl small' }, f);
    chtL.textContent = 'CHT';
    for (const [k, txt] of [[9, '450'], [5, '350'], [1, '250']]) {
      const t = el('text', { x: 54, y: segY(k) + 4, class: 'lbl tiny' }, f);
      t.textContent = txt;
      el('line', { x1: 78, y1: segY(k) + 1, x2: 86, y2: segY(k) + 1, class: 'tick' }, f);
    }

    // Bar segments
    this.colSegs = labels.map((_, i) => {
      const g = el('g', {}, f);
      const segs = [];
      for (let k = 1; k <= 13; k++) {
        segs.push(el('rect', { x: this.colX[i] - 8, y: segY(k) - 2, width: 16, height: 5.2, rx: 1, class: 'bar' }, g));
      }
      return { g, segs };
    });

    // Digital window
    el('rect', { x: 66, y: 280, width: 268, height: 52, rx: 6, class: 'digital-bg' }, f);
    this.digital = new SegmentDisplay(f, { x: 78, y: 287, cells: 10, scale: 1.0 });
    const stepL = el('text', { x: 110, y: 350, class: 'lbl small' }, f);
    stepL.textContent = 'STEP';
    const lfL = el('text', { x: 276, y: 350, class: 'lbl small' }, f);
    lfL.textContent = 'LF';
    const brand = el('text', { x: 200, y: 352, class: 'lbl brand', 'text-anchor': 'middle' }, f);
    brand.textContent = display.viewStyle === 'NRM' ? 'EDM  JPI  800' : 'EDM  JPI  700';
  }

  render(display) {
    const key = `${display.columns.map((c) => c.label).join('')}|${display.viewStyle}`;
    if (display.columns.length && key !== this.layoutKey) {
      this._build(display);
      this.layoutKey = key;
    }
    if (!this.faceG) {
      if (!display.power) return;
      return;
    }
    this.faceG.classList.toggle('off', !display.power);
    this.faceG.style.setProperty('--bright', String(0.45 + 0.55 * (display.brightness ?? 1)));
    if (!display.power) {
      this.digital.set('');
      this.upper.set('');
      for (const c of this.colSegs) for (const s of c.segs) s.setAttribute('class', 'bar');
      for (const d of this.dots) d?.classList.remove('on', 'blink');
      return;
    }
    const all = display.allOn;
    this.digital.set(display.digital.text, {
      blink: display.digital.blink,
      flashIndex: display.digital.flashIndex,
      allOn: all,
    });
    this.upper.set(display.upper.text.replace(/\s*HP$/, ''), { allOn: all });
    this.hpLabel.classList.toggle('on', all || /HP$/.test(display.upper.text));
    if (this.nrm) this.nrm.classList.toggle('on', all || display.view === 'N');
    if (this.nDash) {
      this.nDash.classList.toggle('on', all || display.view === 'N');
      this.pDash.classList.toggle('on', all || display.view === 'P');
    }
    this.unitF.classList.toggle('on', all || display.unit === 'F');
    this.unitC.classList.toggle('on', all || display.unit === 'C');

    display.columns.forEach((col, i) => {
      const cs = this.colSegs[i];
      if (!cs) return;
      cs.g.classList.toggle('blink', !!col.flash);
      this.colLabels[i].classList.toggle('blink', !!col.labelFlash);
      for (let k = 1; k <= 13; k++) {
        let on;
        if (col.missing) on = false;
        else if (col.inverted) on = k > 13 - col.segs;
        else on = k <= col.segs;
        let cls = 'bar';
        if (!col.inverted && !col.missing && col.chtSeg === k) {
          // CHT: missing segment inside the bar, isolated lit segment above it (ANA-5)
          on = !(k <= col.segs);
        }
        if (col.inverted && col.chtSeg === k) on = !on;
        if (col.oilSeg && col.oilSeg === k && !col.missing) {
          on = !(k <= col.segs);
          if (col.oilFlash) cls += ' blink';
        }
        if (on) cls += ' on';
        if (col.topFlash && !col.inverted && k === Math.min(col.segs, 13) && col.segs > 0) cls += ' blink';
        cs.segs[k - 1].setAttribute('class', cls);
      }
    });
    this.dots.forEach((d, i) => {
      if (!d) return;
      const on = all || display.dot.index === i;
      d.classList.toggle('on', on);
      d.classList.toggle('blink', !all && on && display.dot.blink);
    });
  }
}
