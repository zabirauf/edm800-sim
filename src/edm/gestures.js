// Button gesture recognizer (spec §4). Pure: feed press/release/advance, collect semantic events.
//
// Semantic events emitted:
//   STEP_TAP, LF_TAP, BOTH_TAP,
//   STEP_HOLD_START, LF_HOLD_START, STEP_HOLD_REPEAT, LF_HOLD_REPEAT ({heldMs}),
//   LF_HOLD_3S, STEP_HOLD_5S, BOTH_HOLD_5S,
//   STEP_RELEASE_HOLD, LF_RELEASE_HOLD

import { T } from './constants.js';

export class GestureRecognizer {
  constructor() {
    this.down = { STEP: false, LF: false };
    this.reset();
  }

  reset() {
    this.mode = 'idle'; // idle | single | chord | locked
    this.btn = null;
    this.t0 = 0;
    this.holdStarted = false;
    this.nextRepeat = 0;
    this.fired3 = false;
    this.fired5 = false;
    this.chordT0 = 0;
    this.chordFired = false;
  }

  /** Mark buttons currently down as "consumed" (BTN-11): no events until all are released. */
  lockHeldButtons() {
    if (this.down.STEP || this.down.LF) {
      this.reset();
      this.mode = 'locked';
    }
  }

  press(button, now) {
    const out = [];
    if (this.down[button]) return out;
    this.down[button] = true;
    if (this.mode === 'idle') {
      this.mode = 'single';
      this.btn = button;
      this.t0 = now;
      this.holdStarted = false;
      this.fired3 = false;
      this.fired5 = false;
    } else if (this.mode === 'single' && button !== this.btn) {
      if (!this.holdStarted) {
        this.mode = 'chord';
        this.chordT0 = now;
        this.chordFired = false;
      }
      // BTN-10: otherwise ignored; handled on release (mode becomes locked).
    }
    return out;
  }

  release(button, now) {
    const out = [];
    if (!this.down[button]) return out;
    this.down[button] = false;
    const anyDown = this.down.STEP || this.down.LF;
    if (this.mode === 'single') {
      if (button === this.btn) {
        out.push(this.holdStarted ? `${button}_RELEASE_HOLD` : `${button}_TAP`);
        if (anyDown) this.mode = 'locked';
        else this.reset();
      }
      // release of the ignored second button: nothing
    } else if (this.mode === 'chord') {
      // BTN-8 (rev2): a chord counts as a tap only if released within T_HOLD_START.
      if (!this.chordFired && now - this.chordT0 < T.HOLD_START) out.push('BOTH_TAP');
      this.mode = anyDown ? 'locked' : 'idle';
      if (!anyDown) this.reset();
    } else if (this.mode === 'locked') {
      if (!anyDown) this.reset();
    }
    return out;
  }

  /** Called once per internal sub-step with the current time. */
  advance(now) {
    const out = [];
    if (this.mode === 'single') {
      const b = this.btn;
      const held = now - this.t0;
      if (!this.holdStarted && held >= T.HOLD_START) {
        this.holdStarted = true;
        out.push(`${b}_HOLD_START`);
        this.nextRepeat = this.t0 + T.HOLD_START + (b === 'LF' ? T.REPEAT_LF : T.REPEAT_STEP_BACK);
      }
      if (this.holdStarted) {
        const interval = b === 'LF' ? T.REPEAT_LF : T.REPEAT_STEP_BACK;
        while (now >= this.nextRepeat) {
          out.push({ type: `${b}_HOLD_REPEAT`, heldMs: this.nextRepeat - this.t0 });
          this.nextRepeat += interval;
        }
      }
      if (b === 'LF' && !this.fired3 && held >= T.LF_VIEW) {
        this.fired3 = true;
        out.push('LF_HOLD_3S');
      }
      if (b === 'STEP' && !this.fired5 && held >= T.STEP_OFF) {
        this.fired5 = true;
        out.push('STEP_HOLD_5S');
      }
    } else if (this.mode === 'chord') {
      if (!this.chordFired && now - this.chordT0 >= T.BOTH_HOLD) {
        this.chordFired = true;
        out.push('BOTH_HOLD_5S');
      }
    }
    return out;
  }

  isDown(button) {
    return this.down[button];
  }

  /** True while the single held button is `button` and its hold has started. */
  isHolding(button) {
    return this.mode === 'single' && this.btn === button && this.holdStarted && this.down[button];
  }
}
