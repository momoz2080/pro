'use strict';
/* Two touch gestures:
   - doubleTap: two quick taps anywhere on the app (double-click with a mouse), except on buttons and on words you have typed
   - twoFingerTap: two fingers touching down and lifting together, without moving */

const Gestures = (() => {
  const INTERACTIVE = 'button, a, select, input[type="search"], label, summary, dialog, .menu, .no-gesture, [contenteditable="true"]';
  const interactive = (t) => {
    if (!t || !t.closest) return false;
    if (t.closest(INTERACTIVE)) return true;
    // A text field that already has words in it keeps double-tap for selecting a word.
    // An empty one does not, so the gesture works anywhere on the screen.
    const f = t.closest('textarea, input');
    return !!(f && f.value && f.value.trim());
  };

  function doubleTap(handler, opts) {
    opts = opts || {};
    let down = null;
    let multi = false;
    let last = { t: 0, x: 0, y: 0 };
    let lastFire = 0;

    const fire = (e) => {
      const now = Date.now();
      if (now - lastFire < 700) return; // a double-tap can also produce a dblclick; count it once
      lastFire = now;
      handler(e);
    };
    const blocked = (e) => (opts.ignore ? opts.ignore(e) : false);

    document.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      if (!e.isPrimary) { multi = true; return; }
      down = { t: Date.now(), x: e.clientX, y: e.clientY, target: e.target };
    }, true);

    document.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse' || !e.isPrimary) return;
      const d = down; down = null;
      if (multi) { multi = false; last.t = 0; return; }
      if (!d) return;
      const now = Date.now();
      if (now - d.t > 320 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12) { last.t = 0; return; }
      if (interactive(e.target) || interactive(d.target) || blocked(e)) { last.t = 0; return; }
      if (now - last.t < 360 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 50) { last.t = 0; fire(e); }
      else last = { t: now, x: e.clientX, y: e.clientY };
    }, true);

    document.addEventListener('pointercancel', () => { down = null; multi = false; }, true);

    document.addEventListener('dblclick', (e) => {
      if (interactive(e.target) || blocked(e)) return;
      fire(e);
    });
  }

  function twoFingerTap(el, handler) {
    let st = null;
    let first = 0;
    const MOVE = 16;

    el.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) { first = Date.now(); st = null; }
      else if (e.touches.length === 2) {
        const now = Date.now();
        if (!first || now - first < 300) {
          st = {
            t: now, moved: false,
            ids: Array.from(e.touches).map((t) => t.identifier),
            pts: Array.from(e.touches).map((t) => [t.clientX, t.clientY]),
          };
        } else st = null;
      } else st = null;
    }, { passive: true });

    el.addEventListener('touchmove', (e) => {
      if (!st || st.moved) return;
      for (const t of Array.from(e.touches)) {
        const i = st.ids.indexOf(t.identifier);
        if (i >= 0 && Math.hypot(t.clientX - st.pts[i][0], t.clientY - st.pts[i][1]) > MOVE) st.moved = true;
      }
    }, { passive: true });

    el.addEventListener('touchend', (e) => {
      if (!st) return;
      const ok = !st.moved && Date.now() - st.t < 450 && e.touches.length <= 1;
      st = null;
      if (ok) handler(e);
    }, { passive: true });

    el.addEventListener('touchcancel', () => { st = null; }, { passive: true });
  }

  return { doubleTap, twoFingerTap };
})();
