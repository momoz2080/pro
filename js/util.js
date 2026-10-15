'use strict';
/* Small helpers shared by every other script: DOM builder, icons, dates,
   toast, popup menu, dialogs, download and clipboard. No dependencies. */

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

/* h('div', {class:'x', onclick: fn}, child, 'text') builds DOM safely (no innerHTML for user text). */
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) {
    for (const k of Object.keys(attrs)) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'dataset') Object.assign(e.dataset, v);
      else if (k === 'value') e.value = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, v);
    }
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return e;
}

const ICONS = {
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  pen: '<path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z"/><path d="M14.5 6.5l3 3"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  more: '<circle cx="5" cy="12" r="1.7" fill="currentColor"/><circle cx="12" cy="12" r="1.7" fill="currentColor"/><circle cx="19" cy="12" r="1.7" fill="currentColor"/>',
  back: '<path d="m14 6-6 6 6 6"/>',
  trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6"/>',
  pin: '<path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v7"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  undo: '<path d="M8 6 3 11l5 5"/><path d="M3 11h11a5 5 0 0 1 0 10H9"/>',
  eraser: '<path d="m15 4 5 5-9.5 9.5H6L3.5 16 15 4z"/><path d="M9 10l5 5M11 20h10"/>',
  highlighter: '<path d="m15 3.5 5.5 5.5-9 9H6.5v-5z"/><path d="M4 21h8"/>',
  share: '<path d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  space: '<path d="M12 4v16M8 16l4 4 4-4"/>',
  bolt: '<path d="M13 3L5 13h6l-1 8 8-10h-6z"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-.9 2-1.8 0-1.4-1.3-1.6-1.3-3 0-1 .8-1.7 1.9-1.7H17a4 4 0 0 0 4-4C21 6.7 17 3 12 3z"/>',
  hand: '<path d="M8 12V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L3.5 14a1.6 1.6 0 0 1 2.6-1.8L8 14.5"/>',
};

function icon(name, size) {
  const s = document.createElement('span');
  s.className = 'ic';
  s.setAttribute('aria-hidden', 'true');
  const n = size || 22;
  s.innerHTML = '<svg viewBox="0 0 24 24" width="' + n + '" height="' + n + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || '') + '</svg>';
  return s;
}

/* ---------- dates ---------- */
const DAY = 864e5;
function startOfDay(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
function fmtTime(t) { return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
function fmtShort(t) { return new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' }); }
function fmtLong(t) { return new Date(t).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }); }
function relTime(t) {
  const now = Date.now();
  const diff = Math.round((startOfDay(now) - startOfDay(t)) / DAY);
  if (diff === 0) return fmtTime(t);
  if (diff === 1) return 'Yesterday';
  const sameYear = new Date(t).getFullYear() === new Date(now).getFullYear();
  return new Date(t).toLocaleDateString([], sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}
function daysAgo(t) {
  const d = Math.round((startOfDay(Date.now()) - startOfDay(t)) / DAY);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  return d + ' days ago';
}

function debounce(fn, ms) {
  let t;
  return function () { const a = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(null, a), ms); };
}

/* ---------- toast ---------- */
let toastTimer;
function toast(msg, opts) {
  opts = opts || {};
  const box = document.getElementById('toast');
  if (!box) return;
  clearTimeout(toastTimer);
  box.replaceChildren(
    h('span', {}, msg),
    opts.action ? h('button', { class: 'toast-act', type: 'button', onclick: () => { box.classList.remove('show'); opts.action.fn(); } }, opts.action.label) : null
  );
  box.classList.add('show');
  toastTimer = setTimeout(() => box.classList.remove('show'), opts.ms || 3200);
}

/* ---------- popup menu ---------- */
function closeMenu() {
  const m = $('.menu');
  if (m) { if (m._cleanup) m._cleanup(); m.remove(); }
}
function menu(anchor, items) {
  closeMenu();
  const m = h('div', { class: 'menu', role: 'menu' },
    items.filter(Boolean).map(it => h('button', {
      class: 'menu-item' + (it.danger ? ' danger' : ''), role: 'menuitem', type: 'button',
      onclick: () => { closeMenu(); it.onClick(); }
    }, it.icon ? icon(it.icon, 18) : null, h('span', {}, it.label))));
  document.body.append(m);
  const r = anchor.getBoundingClientRect();
  const mw = m.offsetWidth || 230, mh = m.offsetHeight || 200;
  m.style.top = Math.max(8, Math.min(r.bottom + 6, window.innerHeight - mh - 8)) + 'px';
  m.style.left = Math.max(8, Math.min(r.right - mw, window.innerWidth - mw - 8)) + 'px';
  const outside = (e) => { if (!m.contains(e.target)) closeMenu(); };
  const esc = (e) => { if (e.key === 'Escape') closeMenu(); };
  setTimeout(() => { document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', esc, true); }, 0);
  m._cleanup = () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', esc, true); };
}

/* ---------- dialogs ---------- */
function modal(build, opts) {
  opts = opts || {};
  const d = document.createElement('dialog');
  d.className = 'dlg' + (opts.wide ? ' wide' : '');
  const close = (v) => {
    if (d.close) { try { d.close(v); return; } catch (e) { /* fall through */ } }
    d.removeAttribute('open'); d.returnValue = v || ''; d.dispatchEvent(new Event('close'));
  };
  const body = h('div', { class: 'dlg-body' });
  d.append(body);
  build(body, close);
  d.addEventListener('close', () => { d.remove(); if (opts.onClose) opts.onClose(d.returnValue); });
  d.addEventListener('click', (e) => { if (e.target === d) close('cancel'); });
  document.body.append(d);
  if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  return d;
}
function modalOpen() { return !!$('dialog[open]'); }

function askText(o) {
  return new Promise((resolve) => {
    let result = null;
    modal((body, close) => {
      const input = h('input', { class: 'field', type: 'text', value: o.value || '', placeholder: o.placeholder || '', 'aria-label': o.title, autocomplete: 'off', enterkeyhint: 'done' });
      const submit = () => { const v = input.value.trim(); if (!v) { input.focus(); return; } result = v; close('ok'); };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
      body.append(
        h('h3', {}, o.title),
        o.message ? h('p', { class: 'muted' }, o.message) : null,
        input,
        h('div', { class: 'dlg-actions' },
          h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => close('cancel') }, 'Cancel'),
          h('button', { class: 'btn btn-primary', type: 'button', onclick: submit }, o.ok || 'Save'))
      );
      setTimeout(() => { input.focus(); input.select(); }, 30);
    }, { onClose: () => resolve(result) });
  });
}

function confirmBox(o) {
  return new Promise((resolve) => {
    let yes = false;
    modal((body, close) => {
      body.append(
        h('h3', {}, o.title),
        o.message ? h('p', { class: 'muted' }, o.message) : null,
        h('div', { class: 'dlg-actions' },
          h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => close('cancel') }, 'Cancel'),
          h('button', { class: 'btn ' + (o.danger === false ? 'btn-primary' : 'btn-danger'), type: 'button', onclick: () => { yes = true; close('ok'); } }, o.ok || 'Delete'))
      );
    }, { onClose: () => resolve(yes) });
  });
}

/* ---------- files and clipboard ---------- */
function download(name, text, type) {
  const blob = new Blob([text], { type: type || 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) {
    const ta = h('textarea', { style: 'position:fixed;opacity:0;top:0;left:0' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
    ta.remove();
    return ok;
  }
}
