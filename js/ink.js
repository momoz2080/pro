'use strict';
/* Handwriting layer. A transparent canvas sits on top of the note.
   Strokes are stored with the page as numbers, on a fixed 800-unit-wide grid,
   so they scale to any screen width and stay sharp. */

const Ink = (() => {
  const UNIT = 800;          // page width in stroke units
  const MAX_PIXELS = 12e6;   // keeps the canvas inside iOS Safari's limit
  const MAX_H = 20000;       // tallest handwriting area, in units
  const SIZES = [3, 5, 9];
  const PALETTE = {
    light: { ink: '#241833', blue: '#2458E6', red: '#D6303A', green: '#17895A', hl: '#F5B52E' },
    dark: { ink: '#F4F0FA', blue: '#7EA6FF', red: '#FF8A90', green: '#5ED79A', hl: '#F5B52E' },
  };

  let canvas = null, ctx = null, host = null, scroller = null, cb = {};
  let page = null, active = false;
  let tool = 'pen', color = 'ink', sizeIdx = 1;
  let undoStack = [];
  const pointers = new Map();
  let mode = null, cur = null, panLast = null, penAt = 0, raf = 0;
  let dpr = 1, scale = 1;

  const r1 = (n) => Math.round(n * 10) / 10;
  const isDark = () => {
    const t = document.documentElement.getAttribute('data-theme');
    if (t === 'dark') return true;
    if (t === 'light') return false;
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  };
  const colorFor = (s) => (isDark() ? PALETTE.dark : PALETTE.light)[s.c] || '#241833';

  /* ---------- sizing ---------- */
  function layout() {
    if (!canvas || !host) return;
    const w = host.clientWidth;
    if (!w) return;
    scale = w / UNIT;
    const hUnits = page && page.ink ? page.ink.h : 0;
    host.style.minHeight = hUnits ? Math.round(hUnits * scale) + 'px' : '';
    sizeCanvas();
  }

  function sizeCanvas() {
    const r = host.getBoundingClientRect();
    const w = Math.round(r.width), hh = Math.round(r.height);
    if (!w || !hh) return;
    let d = window.devicePixelRatio || 1;
    if (w * hh * d * d > MAX_PIXELS) d = Math.sqrt(MAX_PIXELS / (w * hh));
    dpr = d;
    canvas.width = Math.round(w * d);
    canvas.height = Math.round(hh * d);
    canvas.style.width = w + 'px';
    canvas.style.height = hh + 'px';
    renderAll();
  }

  /* ---------- drawing ---------- */
  function setup(g, s) {
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const c = colorFor(s);
    g.strokeStyle = c;
    g.fillStyle = c;
    g.lineWidth = s.w * scale;
    g.globalAlpha = s.k === 'hl' ? 0.38 : 1;
  }

  function drawStroke(s) {
    const p = s.p, n = p.length / 2;
    if (!ctx || !n) return;
    const X = (i) => p[2 * i] * scale, Y = (i) => p[2 * i + 1] * scale;
    ctx.save();
    setup(ctx, s);
    if (n === 1) {
      ctx.beginPath();
      ctx.arc(X(0), Y(0), Math.max(0.7, (s.w * scale) / 2), 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(X(0), Y(0));
      ctx.lineTo((X(0) + X(1)) / 2, (Y(0) + Y(1)) / 2);
      for (let i = 1; i < n - 1; i++) ctx.quadraticCurveTo(X(i), Y(i), (X(i) + X(i + 1)) / 2, (Y(i) + Y(i + 1)) / 2);
      ctx.lineTo(X(n - 1), Y(n - 1));
      ctx.stroke();
    }
    ctx.restore();
  }

  function renderAll() {
    if (!ctx || !canvas) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (page && page.ink) for (const s of page.ink.strokes) drawStroke(s);
    if (cur && cur.s) drawStroke(cur.s);
  }

  function scheduleFull() {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; renderAll(); });
  }

  /* Pen strokes are drawn one small curve at a time while the finger moves. */
  function drawIncremental(s) {
    const p = s.p, n = p.length / 2;
    if (!ctx || n < 2) return;
    const X = (i) => p[2 * i] * scale, Y = (i) => p[2 * i + 1] * scale;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    setup(ctx, s);
    ctx.beginPath();
    if (n === 2) {
      ctx.moveTo(X(0), Y(0));
      ctx.lineTo((X(0) + X(1)) / 2, (Y(0) + Y(1)) / 2);
    } else {
      ctx.moveTo((X(n - 3) + X(n - 2)) / 2, (Y(n - 3) + Y(n - 2)) / 2);
      ctx.quadraticCurveTo(X(n - 2), Y(n - 2), (X(n - 2) + X(n - 1)) / 2, (Y(n - 2) + Y(n - 1)) / 2);
    }
    ctx.stroke();
    ctx.restore();
  }
  function drawTail(s) {
    const p = s.p, n = p.length / 2;
    if (!ctx || n < 2) return;
    const X = (i) => p[2 * i] * scale, Y = (i) => p[2 * i + 1] * scale;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    setup(ctx, s);
    ctx.beginPath();
    ctx.moveTo((X(n - 2) + X(n - 1)) / 2, (Y(n - 2) + Y(n - 1)) / 2);
    ctx.lineTo(X(n - 1), Y(n - 1));
    ctx.stroke();
    ctx.restore();
  }
  function drawDot(s) {
    if (!ctx) return;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    setup(ctx, s);
    ctx.beginPath();
    ctx.arc(s.p[0] * scale, s.p[1] * scale, Math.max(0.7, (s.w * scale) / 2), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* ---------- pointer handling ---------- */
  const pt = (e) => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale]; };

  function centroid() {
    let x = 0, y = 0, n = 0;
    pointers.forEach((p) => { if (p.type === 'touch') { x += p.x; y += p.y; n++; } });
    return n ? { x: x / n, y: y / n } : null;
  }

  function ensureInk() {
    if (!page.ink) {
      layout();
      page.ink = { strokes: [], h: Math.max(900, Math.ceil(host.scrollHeight / (scale || 1)) + 300) };
    }
  }
  function changed() { if (cb.onChange && page) cb.onChange(page); }

  function onDown(e) {
    if (!active || !page) return;
    e.preventDefault();
    const now = Date.now();
    if (e.pointerType === 'pen') penAt = now;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* not supported */ }
    const touches = Array.from(pointers.values()).filter((p) => p.type === 'touch').length;
    if (touches >= 2) { cancelStroke(); startPan(); return; }        // two fingers: scroll the page
    if (e.pointerType === 'touch' && now - penAt < 6000) { startPan(); return; } // palm rejection while a pen is in use
    if (mode === 'pan') return;
    begin(e);
  }

  function startPan() { mode = 'pan'; panLast = centroid(); }

  function begin(e) {
    ensureInk();
    const [x, y] = pt(e);
    mode = 'draw';
    if (tool === 'eraser') {
      cur = { erase: true, items: [], id: e.pointerId };
      eraseAt(x, y);
      return;
    }
    const hl = tool === 'hl';
    const s = { k: hl ? 'hl' : 'pen', c: hl ? 'hl' : color, w: hl ? 22 : SIZES[sizeIdx], p: [r1(clamp0(x)), r1(Math.max(0, y))] };
    cur = { s, id: e.pointerId };
    if (hl) scheduleFull(); else drawDot(s);
  }
  const clamp0 = (x) => Math.max(0, Math.min(UNIT, x));

  function extend(x, y) {
    const s = cur.s, p = s.p, n = p.length;
    x = clamp0(x); y = Math.max(0, y);
    if (n >= 2) { const dx = x - p[n - 2], dy = y - p[n - 1]; if (dx * dx + dy * dy < 0.64) return; }
    p.push(r1(x), r1(y));
    if (s.k === 'pen') drawIncremental(s); else scheduleFull();
    if (y > page.ink.h - 160 && page.ink.h < MAX_H) { page.ink.h = Math.min(MAX_H, page.ink.h + 600); layout(); }
  }

  function onMove(e) {
    if (!active) return;
    const p = pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (mode === 'pan') {
      const c = centroid();
      if (c && panLast && scroller) scroller.scrollTop -= (c.y - panLast.y);
      panLast = c;
      e.preventDefault();
      return;
    }
    if (mode !== 'draw' || !cur || cur.id !== e.pointerId) return;
    e.preventDefault();
    const co = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    const list = co && co.length ? co : [e];
    for (const ev of list) {
      const [x, y] = pt(ev);
      if (cur.erase) eraseAt(x, y); else extend(x, y);
    }
  }

  function onUp(e, cancelled) {
    if (!pointers.delete(e.pointerId)) return;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    if (mode === 'draw' && cur && cur.id === e.pointerId) { if (cancelled) cancelStroke(); else finish(); }
    if (pointers.size === 0) { mode = null; panLast = null; }
    else if (mode === 'pan') panLast = centroid();
  }

  function cancelStroke() {
    if (cur) { const wasErase = cur.erase; cur = null; if (!wasErase) renderAll(); }
  }

  function finish() {
    const c = cur;
    cur = null;
    if (c.erase) {
      if (c.items.length) { undoStack.push({ t: 'erase', items: c.items }); changed(); }
      return;
    }
    const s = c.s;
    if (s.k === 'pen') drawTail(s);
    page.ink.strokes.push(s);
    undoStack.push({ t: 'add', s });
    if (s.k === 'hl') renderAll();
    changed();
  }

  /* ---------- eraser ---------- */
  function segDist2(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx - px, cy = ay + t * dy - py;
    return cx * cx + cy * cy;
  }
  function hit(s, x, y, r) {
    const p = s.p, n = p.length / 2, rr = r + s.w / 2, lim = rr * rr;
    if (n === 1) return (p[0] - x) * (p[0] - x) + (p[1] - y) * (p[1] - y) <= lim;
    for (let i = 0; i < n - 1; i++) if (segDist2(x, y, p[2 * i], p[2 * i + 1], p[2 * i + 2], p[2 * i + 3]) <= lim) return true;
    return false;
  }
  function eraseAt(x, y) {
    const list = page.ink.strokes;
    const r = 16 / scale;
    let removed = false;
    for (let i = list.length - 1; i >= 0; i--) {
      if (hit(list[i], x, y, r)) { cur.items.push({ i, s: list[i] }); list.splice(i, 1); removed = true; }
    }
    if (removed) scheduleFull();
  }

  /* ---------- public ---------- */
  function init(o) {
    canvas = o.canvas; host = o.host; scroller = o.scroller; cb = o;
    ctx = canvas.getContext ? canvas.getContext('2d') : null;
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', (e) => onUp(e, false));
    canvas.addEventListener('pointercancel', (e) => onUp(e, true));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    if (window.ResizeObserver) new ResizeObserver(() => { layout(); if (cb.onResize) cb.onResize(); }).observe(host);
    if (window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', renderAll);
    }
  }

  function setPage(p) {
    if (active) exit();
    page = p || null;
    undoStack = [];
    cur = null;
    pointers.clear();
    mode = null;
    layout();
    renderAll();
  }

  function enter() {
    if (!page || active) return false;
    layout();
    ensureInk();
    page.ink.h = Math.max(page.ink.h, Math.ceil(host.scrollHeight / (scale || 1)));
    active = true;
    layout();
    if (cb.onActive) cb.onActive(true);
    return true;
  }

  function exit() {
    if (!active) return;
    cancelStroke();
    active = false;
    pointers.clear();
    mode = null;
    if (page && page.ink && !page.ink.strokes.length) { page.ink = null; layout(); changed(); }
    if (cb.onActive) cb.onActive(false);
  }

  function undo() {
    const op = undoStack.pop();
    if (!op || !page || !page.ink) return false;
    const list = page.ink.strokes;
    if (op.t === 'add') { const i = list.indexOf(op.s); if (i >= 0) list.splice(i, 1); }
    else for (let k = op.items.length - 1; k >= 0; k--) list.splice(Math.min(op.items[k].i, list.length), 0, op.items[k].s);
    renderAll();
    changed();
    return true;
  }

  function addSpace() {
    if (!page || !page.ink) return;
    page.ink.h = Math.min(MAX_H, page.ink.h + 800);
    layout();
    changed();
  }

  function clearPage(p) {
    if (p) p.ink = null;
    if (p === page) { undoStack = []; layout(); renderAll(); }
  }

  return {
    init, setPage, enter, exit, undo, addSpace, clearPage,
    relayout: layout,
    get active() { return active; },
    setTool(t) { tool = t; },
    setColor(c) { color = c; },
    setSize(i) { sizeIdx = clamp(i, 0, SIZES.length - 1); },
    get tool() { return tool; },
    get canUndo() { return undoStack.length > 0; },
    hasInk(p) { return !!(p && p.ink && p.ink.strokes && p.ink.strokes.length); },
  };
})();
