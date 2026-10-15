'use strict';
/* Notebook app: notebooks > sections > pages, block editor, voice dictation,
   handwriting, search, daily log, export and backup. */

(() => {
  /* =====================================================================
     Constants
     ===================================================================== */
  const TEMPLATES = {
    blank: { label: 'Blank', desc: 'Start from nothing.', title: () => '', blocks: () => [['p', '']] },
    idea: { label: 'Idea', desc: 'The idea, why it matters, a first step.', title: () => 'New idea', blocks: () => [['h', 'The idea'], ['p', ''], ['h', 'Why it matters'], ['p', ''], ['h', 'First small step'], ['todo', '']] },
    meeting: { label: 'Meeting', desc: 'Who, notes and action items.', title: () => 'Meeting', blocks: () => [['h', 'Who and when'], ['p', ''], ['h', 'Notes'], ['p', ''], ['h', 'Action items'], ['todo', '']] },
    decision: { label: 'Decision', desc: 'Options, reasons and what you chose.', title: () => 'Decision', blocks: () => [['h', 'What needs deciding'], ['p', ''], ['h', 'Options'], ['bullet', ''], ['bullet', ''], ['h', 'Why'], ['p', ''], ['decision', '']] },
    weekly: { label: 'Weekly review', desc: 'Wins, obstacles and next week.', title: () => 'Weekly review', blocks: () => [['h', 'Wins this week'], ['p', ''], ['h', 'What got in the way'], ['p', ''], ['h', 'Next week'], ['todo', ''], ['todo', ''], ['decision', '']] },
  };

  const LANGS = [
    ['', 'Browser default'], ['en-US', 'English (US)'], ['en-GB', 'English (UK)'],
    ['es-US', 'Spanish (US)'], ['es-MX', 'Spanish (Mexico)'], ['es-ES', 'Spanish (Spain)'],
    ['fr-FR', 'French'], ['de-DE', 'German'], ['it-IT', 'Italian'], ['pt-BR', 'Portuguese (Brazil)'],
    ['ru-RU', 'Russian'], ['uk-UA', 'Ukrainian'], ['pl-PL', 'Polish'], ['tr-TR', 'Turkish'],
    ['ar-SA', 'Arabic'], ['fa-IR', 'Persian'], ['hi-IN', 'Hindi'], ['ur-PK', 'Urdu'], ['bn-BD', 'Bengali'],
    ['vi-VN', 'Vietnamese'], ['zh-CN', 'Chinese (Mandarin)'], ['yue-Hant-HK', 'Chinese (Cantonese)'],
    ['ko-KR', 'Korean'], ['ja-JP', 'Japanese'], ['tl-PH', 'Filipino'], ['sw-KE', 'Swahili'],
  ];

  const DICT_ERRORS = {
    unsupported: "Voice dictation isn't available in this browser. Try Chrome, Edge or Safari.",
    blocked: 'The microphone is blocked. Allow it for this site in your browser settings, then try again.',
    service: 'Dictation is turned off on this device. On iPhone, turn on Dictation in Settings, General, Keyboard.',
    nomic: 'No microphone was found.',
    network: 'Dictation needs an internet connection.',
    lang: "This browser can't dictate in that language. Pick another one in Settings.",
    unavailable: "Dictation couldn't start. Check the microphone and try again.",
  };

  /* =====================================================================
     State
     ===================================================================== */
  const S = {
    notebooks: [], sections: [], pages: [],
    sel: { view: 'section', notebookId: null, sectionId: null, pageId: null, day: startOfDay(Date.now()) },
    query: '',
    editNav: false,
    expanded: new Set(),
  };
  const el = {};
  const Dict = { on: false, target: null, last: null };

  const DEFAULTS = { dbl: true, lang: '', theme: 'auto', lastBackup: 0 };
  let settings = Object.assign({}, DEFAULTS);
  try { Object.assign(settings, JSON.parse(localStorage.getItem('nb.settings') || '{}')); } catch (e) { /* use defaults */ }
  const saveSettings = () => { try { localStorage.setItem('nb.settings', JSON.stringify(settings)); } catch (e) { /* ignore */ } };

  const byOrder = (a, b) => (a.order || 0) - (b.order || 0);
  const nbById = (id) => S.notebooks.find((n) => n.id === id);
  const secById = (id) => S.sections.find((s) => s.id === id);
  const pageById = (id) => S.pages.find((p) => p.id === id);
  const sectionsOf = (nbId) => S.sections.filter((s) => s.notebookId === nbId).sort(byOrder);
  const curPage = () => pageById(S.sel.pageId);
  const newBlock = (type, text) => ({ id: uid(), type, text: text || '', done: false });
  const tplLabel = (p) => (TEMPLATES[p.template] ? TEMPLATES[p.template].label : 'Page');
  const isNarrow = () => window.matchMedia && window.matchMedia('(max-width: 639px)').matches;

  /* =====================================================================
     Saving
     ===================================================================== */
  const pending = new Map();
  let warnedSave = false;
  function saveFail() {
    if (warnedSave) return;
    warnedSave = true;
    toast("Couldn't save. Your browser storage may be full or blocked. Download a backup to be safe.", { ms: 7000 });
  }
  function flushOne(p) { pending.delete(p.id); DB.put('pages', p).catch(saveFail); }
  function savePage(p, now) {
    p.updated = Date.now();
    clearTimeout(pending.get(p.id));
    if (now) flushOne(p); else pending.set(p.id, setTimeout(() => flushOne(p), 350));
    updateMeta();
  }
  function flushAll() {
    pending.forEach((t, id) => { clearTimeout(t); const p = pageById(id); if (p) DB.put('pages', p).catch(saveFail); });
    pending.clear();
  }
  window.addEventListener('pagehide', flushAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { flushAll(); if (Dict.on) stopDict(); } });

  function persistSel() {
    try {
      localStorage.setItem('nb.sel', JSON.stringify({
        view: S.sel.view, sectionId: S.sel.sectionId, pageId: S.sel.pageId, day: S.sel.day,
        screen: el.app ? el.app.dataset.view : 'list',
      }));
    } catch (e) { /* ignore */ }
  }

  /* =====================================================================
     Data operations
     ===================================================================== */
  async function seed() {
    const now = Date.now();
    let order = 0;
    const mk = (name, secs) => {
      const nb = { id: uid(), name, order: order++, created: now };
      S.notebooks.push(nb);
      const out = secs.map((sn, i) => { const s = { id: uid(), notebookId: nb.id, name: sn, order: i }; S.sections.push(s); return s; });
      return out;
    };
    mk('Combridgers', ['Billing', 'Clients', 'Marketing']);
    const ideas = mk('Ideas', ['Inbox']);
    mk('Learning', ['General']);
    mk('Personal', ['General']);
    const welcome = [
      ['h', 'Welcome'],
      ['p', 'Everything you write here stays on this device. Use Backup and restore in the sidebar to keep a copy.'],
      ['h', 'Try these'],
      ['todo', 'Double-tap anywhere on the screen (double-click on a computer) to start dictating. Double-tap again to stop.'],
      ['todo', 'Two-finger tap on a note to write by hand. Two-finger tap again, or press Done, to finish.'],
      ['todo', 'Press New page to start from a template.'],
      ['todo', 'Press Export for Claude to bundle a notebook for summaries and next steps.'],
      ['todo', 'Press Quick note for a fast jot. Tap the color dot to color a note.'],
      ['decision', 'Delete this page whenever you like.'],
    ];
    const p = { id: uid(), sectionId: ideas[0].id, title: 'Start here', template: 'blank', blocks: welcome.map(([t, x]) => newBlock(t, x)), ink: null, created: now, updated: now, pinned: false };
    S.pages.push(p);
    S.sel.pageId = p.id;
    S.sel.sectionId = ideas[0].id;
    S.sel.notebookId = ideas[0].notebookId;
    S.expanded.add(ideas[0].notebookId);
    await DB.putMany('notebooks', S.notebooks);
    await DB.putMany('sections', S.sections);
    await DB.putMany('pages', S.pages);
  }

  function ensureDefaults() {
    if (!S.notebooks.length) {
      const nb = { id: uid(), name: 'Notebook', order: 0, created: Date.now() };
      S.notebooks.push(nb); DB.put('notebooks', nb).catch(saveFail);
    }
    const anyNb = S.notebooks.find((n) => !n.quick) || S.notebooks[0];
    if (!sectionsOf(anyNb.id).length) {
      const s = { id: uid(), notebookId: anyNb.id, name: 'General', order: 0 };
      S.sections.push(s); DB.put('sections', s).catch(saveFail);
    }
    return S.sections[0].id;
  }

  /* Quick notes: one hidden notebook with one section, created when first needed. */
  function quickSection() {
    let sec = S.sections.find((x) => x.quick);
    if (sec) return sec;
    let nb = S.notebooks.find((n) => n.quick);
    if (!nb) {
      nb = { id: uid(), name: 'Quick notes', order: 999, created: Date.now(), quick: true };
      S.notebooks.push(nb); DB.put('notebooks', nb).catch(saveFail);
    }
    sec = { id: uid(), notebookId: nb.id, name: 'Quick notes', order: 0, quick: true };
    S.sections.push(sec); DB.put('sections', sec).catch(saveFail);
    return sec;
  }
  const isQuickSel = () => { const x = secById(S.sel.sectionId); return S.sel.view === 'section' && !!(x && x.quick); };
  function selectQuick() { selectSection(quickSection().id); }
  function newQuickNote(opts) {
    opts = opts || {};
    const sec = quickSection();
    const p = createPage('blank', sec.id);
    const now = Date.now();
    p.title = (opts.voice ? 'Voice note, ' : 'Quick note, ') + fmtShort(now) + ' ' + fmtTime(now);
    savePage(p, true);
    S.sel.view = 'section'; S.query = ''; el.search.value = '';
    S.sel.sectionId = sec.id; S.sel.notebookId = sec.notebookId;
    openPage(p.id);
    if (!opts.voice && p.blocks[0]) focusBlock(p.blocks[0].id, 0);
    return p;
  }

  function createPage(tpl, sectionId) {
    const T = TEMPLATES[tpl] || TEMPLATES.blank;
    const secId = sectionId || S.sel.sectionId || (S.sections.find((x) => !x.quick) || {}).id || ensureDefaults();
    const now = Date.now();
    const p = { id: uid(), sectionId: secId, title: T.title(), template: tpl in TEMPLATES ? tpl : 'blank', blocks: T.blocks().map(([t, x]) => newBlock(t, x)), ink: null, created: now, updated: now, pinned: false };
    S.pages.push(p);
    DB.put('pages', p).catch(saveFail);
    return p;
  }

  function revalidate() {
    if (!S.notebooks.length) ensureDefaults();
    let sec = secById(S.sel.sectionId);
    if (!sec) {
      sec = S.sections.filter((x) => !x.quick).sort(byOrder)[0] || S.sections.slice().sort(byOrder)[0];
      S.sel.sectionId = sec ? sec.id : null;
    }
    S.sel.notebookId = sec ? sec.notebookId : null;
    if (sec) S.expanded.add(sec.notebookId);
    if (S.sel.pageId && !pageById(S.sel.pageId)) S.sel.pageId = null;
  }

  /* =====================================================================
     Navigation
     ===================================================================== */
  function closeDrawer() { el.app.classList.remove('nav-open'); }
  function openDrawer() { el.app.classList.add('nav-open'); }

  function selectSection(id, opts) {
    const s = secById(id);
    if (!s) return;
    S.sel.view = 'section';
    S.sel.sectionId = id;
    S.sel.notebookId = s.notebookId;
    S.expanded.add(s.notebookId);
    S.query = ''; el.search.value = '';
    if (!(opts && opts.keepDrawer)) { closeDrawer(); el.app.dataset.view = 'list'; }
    renderAll();
    persistSel();
  }
  function selectDaily() {
    S.sel.view = 'daily';
    S.query = ''; el.search.value = '';
    closeDrawer();
    el.app.dataset.view = 'list';
    renderAll();
    persistSel();
  }
  function toggleNotebook(id) {
    if (S.expanded.has(id)) { S.expanded.delete(id); renderSidebar(); return; }
    S.expanded.add(id);
    const secs = sectionsOf(id);
    if (S.sel.notebookId !== id && secs[0]) selectSection(secs[0].id, { keepDrawer: true });
    else renderSidebar();
  }

  function openPage(id, opts) {
    if (Dict.on) stopDict();
    if (Ink.active) Ink.exit();
    const p = pageById(id);
    if (!p) return;
    S.sel.pageId = id;
    if (S.sel.view === 'section') {
      S.sel.sectionId = p.sectionId;
      const sec = secById(p.sectionId);
      if (sec) { S.sel.notebookId = sec.notebookId; S.expanded.add(sec.notebookId); }
    }
    el.app.dataset.view = 'editor';
    renderEditor();
    renderAll();
    persistSel();
    if (opts && opts.focusTitle) { el.pgTitle.focus(); el.pgTitle.select(); }
  }

  /* =====================================================================
     Sidebar
     ===================================================================== */
  function renderSidebar() {
    const tree = el.sbTree;
    tree.replaceChildren();
    el.sidebar.classList.toggle('editing', S.editNav);
    el.btnEditNav.setAttribute('aria-pressed', String(S.editNav));

    const qs = S.sections.find((x) => x.quick);
    const qn = qs ? S.pages.filter((p) => p.sectionId === qs.id).length : 0;
    tree.append(h('button', { class: 'sb-item' + (isQuickSel() ? ' on' : ''), type: 'button', onclick: selectQuick },
      icon('bolt', 18), h('span', { class: 'grow' }, 'Quick notes'), qn ? h('span', { class: 'sb-count' }, String(qn)) : null));
    tree.append(h('button', { class: 'sb-item' + (S.sel.view === 'daily' ? ' on' : ''), type: 'button', onclick: selectDaily },
      icon('calendar', 18), h('span', { class: 'grow' }, 'Daily log')));
    tree.append(h('div', { class: 'sb-label' }, 'Notebooks'));

    for (const nb of S.notebooks.filter((n) => !n.quick).sort(byOrder)) {
      const open = S.expanded.has(nb.id);
      const on = S.sel.view === 'section' && S.sel.notebookId === nb.id && !isQuickSel();
      tree.append(h('div', { class: 'sb-row' },
        h('button', { class: 'sb-item' + (on ? ' on' : ''), type: 'button', 'aria-expanded': String(open), onclick: () => toggleNotebook(nb.id) },
          h('span', { class: 'chev' + (open ? ' open' : '') }, icon('chevron', 16)),
          h('span', { class: 'grow' }, nb.name)),
        h('button', { class: 'mini', type: 'button', 'aria-label': 'Rename ' + nb.name, onclick: () => renameNotebook(nb) }, icon('pen', 16)),
        h('button', { class: 'mini', type: 'button', 'aria-label': 'Delete ' + nb.name, onclick: () => deleteNotebook(nb) }, icon('trash', 16))
      ));
      if (open) {
        const secs = h('div', { class: 'sb-secs' });
        for (const sec of sectionsOf(nb.id)) {
          secs.append(h('div', { class: 'sb-row' },
            h('button', { class: 'sb-item sb-sec' + (S.sel.view === 'section' && S.sel.sectionId === sec.id ? ' on' : ''), type: 'button', onclick: () => selectSection(sec.id) },
              h('span', { class: 'grow' }, sec.name)),
            h('button', { class: 'mini', type: 'button', 'aria-label': 'Rename ' + sec.name, onclick: () => renameSection(sec) }, icon('pen', 16)),
            h('button', { class: 'mini', type: 'button', 'aria-label': 'Delete ' + sec.name, onclick: () => deleteSection(sec) }, icon('trash', 16))
          ));
        }
        if (S.editNav) secs.append(h('button', { class: 'sb-add', type: 'button', onclick: () => addSection(nb) }, icon('plus', 16), 'Add section'));
        tree.append(secs);
      }
    }
    tree.append(h('button', { class: 'sb-add', type: 'button', onclick: addNotebook }, icon('plus', 16), 'New notebook'));
    updateBackupNote();
  }

  async function addNotebook() {
    const name = await askText({ title: 'New notebook', placeholder: 'Notebook name', ok: 'Create' });
    if (!name) return;
    const nb = { id: uid(), name, order: Math.max(-1, ...S.notebooks.map((n) => n.order || 0)) + 1, created: Date.now() };
    const sec = { id: uid(), notebookId: nb.id, name: 'General', order: 0 };
    S.notebooks.push(nb); S.sections.push(sec);
    DB.put('notebooks', nb).catch(saveFail); DB.put('sections', sec).catch(saveFail);
    S.expanded.add(nb.id);
    selectSection(sec.id, { keepDrawer: true });
  }
  async function renameNotebook(nb) {
    const name = await askText({ title: 'Rename notebook', value: nb.name, ok: 'Rename' });
    if (!name) return;
    nb.name = name; DB.put('notebooks', nb).catch(saveFail); renderAll();
  }
  async function deleteNotebook(nb) {
    const secs = sectionsOf(nb.id);
    const pages = S.pages.filter((p) => secs.some((s) => s.id === p.sectionId));
    const ok = await confirmBox({ title: 'Delete "' + nb.name + '"?', message: 'This deletes ' + secs.length + ' section' + (secs.length === 1 ? '' : 's') + ' and ' + pages.length + ' page' + (pages.length === 1 ? '' : 's') + '. This cannot be undone. Download a backup first if you are unsure.', ok: 'Delete notebook' });
    if (!ok) return;
    pages.forEach((p) => DB.del('pages', p.id).catch(saveFail));
    secs.forEach((s) => DB.del('sections', s.id).catch(saveFail));
    DB.del('notebooks', nb.id).catch(saveFail);
    S.pages = S.pages.filter((p) => !pages.includes(p));
    S.sections = S.sections.filter((s) => !secs.includes(s));
    S.notebooks = S.notebooks.filter((n) => n !== nb);
    afterStructureChange();
  }
  async function addSection(nb) {
    const name = await askText({ title: 'New section in ' + nb.name, placeholder: 'Section name', ok: 'Create' });
    if (!name) return;
    const sec = { id: uid(), notebookId: nb.id, name, order: Math.max(-1, ...sectionsOf(nb.id).map((s) => s.order || 0)) + 1 };
    S.sections.push(sec); DB.put('sections', sec).catch(saveFail);
    selectSection(sec.id, { keepDrawer: true });
  }
  async function renameSection(sec) {
    const name = await askText({ title: 'Rename section', value: sec.name, ok: 'Rename' });
    if (!name) return;
    sec.name = name; DB.put('sections', sec).catch(saveFail); renderAll();
  }
  async function deleteSection(sec) {
    const pages = S.pages.filter((p) => p.sectionId === sec.id);
    const ok = await confirmBox({ title: 'Delete "' + sec.name + '"?', message: 'This deletes ' + pages.length + ' page' + (pages.length === 1 ? '' : 's') + '. This cannot be undone.', ok: 'Delete section' });
    if (!ok) return;
    pages.forEach((p) => DB.del('pages', p.id).catch(saveFail));
    DB.del('sections', sec.id).catch(saveFail);
    S.pages = S.pages.filter((p) => !pages.includes(p));
    S.sections = S.sections.filter((s) => s !== sec);
    afterStructureChange();
  }
  function afterStructureChange() {
    revalidate();
    if (!curPage()) { renderEditor(); if (isNarrow()) el.app.dataset.view = 'list'; }
    renderAll();
    persistSel();
  }

  function updateBackupNote() {
    const n = el.backupNote;
    if (!n) return;
    const never = !settings.lastBackup;
    const stale = !never && Date.now() - settings.lastBackup > 14 * DAY;
    n.textContent = never ? 'No backup yet' : 'Last backup ' + daysAgo(settings.lastBackup);
    n.classList.toggle('warn', (never && S.pages.length > 3) || stale);
  }

  /* =====================================================================
     Page list
     ===================================================================== */
  function snippet(p) {
    for (const b of p.blocks) if (b.text && b.type !== 'h' && b.text.trim()) return b.text.trim().replace(/\s+/g, ' ');
    for (const b of p.blocks) if (b.text && b.text.trim()) return b.text.trim().replace(/\s+/g, ' ');
    return Ink.hasInk(p) ? 'Handwritten note' : 'Empty page';
  }
  const pageText = (p) => (p.title + '\n' + p.blocks.map((b) => b.text).join('\n')).toLowerCase();
  const crumbOf = (p) => { const s = secById(p.sectionId); const n = s && nbById(s.notebookId); if (s && s.quick) return 'Quick notes'; return (n ? n.name : '') + (s ? ', ' + s.name : ''); };

  function weekDays(anchor) {
    const m = new Date(anchor);
    m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
    m.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(m); d.setDate(m.getDate() + i); return d.getTime(); });
  }

  function renderList() {
    const q = S.query.trim().toLowerCase();
    let pages = [], title = '', sub = '', showCrumb = false;
    el.weekstrip.hidden = true;

    if (q) {
      pages = S.pages.filter((p) => pageText(p).includes(q));
      title = 'Search'; sub = pages.length + ' result' + (pages.length === 1 ? '' : 's') + ' for "' + S.query.trim() + '"'; showCrumb = true;
    } else if (S.sel.view === 'daily') {
      const days = weekDays(S.sel.day);
      const has = new Set();
      S.pages.forEach((p) => { has.add(startOfDay(p.created)); has.add(startOfDay(p.updated)); });
      el.weekstrip.hidden = false;
      el.weekstrip.replaceChildren(
        h('button', { class: 'nav', type: 'button', 'aria-label': 'Previous week', onclick: () => shiftWeek(-7) }, icon('back', 18)),
        ...days.map((d) => h('button', { class: 'day' + (d === S.sel.day ? ' on' : '') + (has.has(d) ? ' has' : ''), type: 'button', 'aria-pressed': String(d === S.sel.day), onclick: () => { S.sel.day = d; renderList(); persistSel(); } },
          h('span', {}, new Date(d).toLocaleDateString([], { weekday: 'narrow' })), h('b', {}, new Date(d).getDate()), h('i'))),
        h('button', { class: 'nav', type: 'button', 'aria-label': 'Next week', onclick: () => shiftWeek(7) }, icon('chevron', 18))
      );
      pages = S.pages.filter((p) => startOfDay(p.created) === S.sel.day || startOfDay(p.updated) === S.sel.day);
      title = 'Daily log'; sub = fmtLong(S.sel.day); showCrumb = true;
    } else {
      const sec = secById(S.sel.sectionId);
      pages = sec ? S.pages.filter((p) => p.sectionId === sec.id) : [];
      title = sec ? sec.name : 'Pages';
      const nb = sec && nbById(sec.notebookId);
      sub = pages.length + ' page' + (pages.length === 1 ? '' : 's') + (nb ? ' in ' + nb.name : '');
    }

    pages.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updated - a.updated);
    el.lpTitle.textContent = title;
    el.lpSub.textContent = sub;
    el.pageList.replaceChildren();
    if (!pages.length) {
      el.pageList.append(h('li', { class: 'list-empty' }, q ? 'Nothing matches that search.' : (S.sel.view === 'daily' ? 'No notes on this day.' : isQuickSel() ? 'No quick notes yet. Press Quick note, or double-tap anywhere and talk.' : 'No pages yet. Press New page to start.')));
      return;
    }
    for (const p of pages) {
      el.pageList.append(h('li', {},
        h('button', { class: 'pg' + (p.id === S.sel.pageId ? ' on' : '') + (p.color ? ' nc-' + p.color : ''), type: 'button', onclick: () => openPage(p.id) },
          h('span', { class: 'pg-title' }, p.pinned ? icon('pin', 14) : null, h('span', {}, p.title || 'Untitled')),
          h('span', { class: 'pg-date' }, relTime(p.updated)),
          h('span', { class: 'pg-snip' }, (Ink.hasInk(p) ? 'Handwriting. ' : '') + snippet(p)),
          h('span', { class: 'pg-meta' }, h('span', { class: 'chip tiny tpl-' + p.template }, tplLabel(p)), showCrumb ? h('span', { class: 'crumb' }, crumbOf(p)) : null)
        )));
    }
  }
  function shiftWeek(days) {
    const d = new Date(S.sel.day);
    d.setDate(d.getDate() + days);
    S.sel.day = startOfDay(d.getTime());
    renderList();
    persistSel();
  }
  const renderListSoon = debounce(() => renderList(), 300);
  const renderAll = () => { renderSidebar(); renderList(); };

  /* =====================================================================
     New page, move, delete
     ===================================================================== */
  function pickTemplate() {
    modal((body, close) => {
      body.append(
        h('h3', {}, 'New page'),
        h('p', { class: 'muted' }, 'Pick a starting point. You can change anything afterwards.'),
        h('div', { class: 'tpl-grid' }, Object.keys(TEMPLATES).map((k) => h('button', {
          class: 'tpl-card', type: 'button',
          onclick: () => {
            close('ok');
            const p = createPage(k, S.sel.sectionId);
            if (S.sel.view !== 'section' || S.query) { S.sel.view = 'section'; S.query = ''; el.search.value = ''; }
            S.sel.sectionId = p.sectionId;
            openPage(p.id, { focusTitle: true });
          },
        }, h('strong', {}, TEMPLATES[k].label), h('span', {}, TEMPLATES[k].desc)))),
        h('div', { class: 'dlg-actions' }, h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => close('cancel') }, 'Cancel'))
      );
    });
  }

  function movePage(p) {
    const opts = [];
    S.notebooks.slice().sort(byOrder).forEach((nb) => sectionsOf(nb.id).forEach((s) => opts.push([s.id, nb.name + ', ' + s.name])));
    modal((body, close) => {
      const sel = h('select', { class: 'field', 'aria-label': 'Move to' }, opts.map(([v, t]) => h('option', { value: v }, t)));
      sel.value = p.sectionId;
      body.append(
        h('h3', {}, 'Move page'), sel,
        h('div', { class: 'dlg-actions' },
          h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => close('cancel') }, 'Cancel'),
          h('button', { class: 'btn btn-primary', type: 'button', onclick: () => { p.sectionId = sel.value; savePage(p, true); close('ok'); selectSection(p.sectionId, { keepDrawer: true }); } }, 'Move'))
      );
    });
  }

  function deletePage(p) {
    flushAll();
    const idx = S.pages.indexOf(p);
    S.pages = S.pages.filter((x) => x !== p);
    DB.del('pages', p.id).catch(saveFail);
    if (S.sel.pageId === p.id) { S.sel.pageId = null; renderEditor(); if (isNarrow()) el.app.dataset.view = 'list'; }
    renderAll();
    persistSel();
    toast('Page deleted', { ms: 7000, action: { label: 'Undo', fn: () => { S.pages.splice(Math.min(idx, S.pages.length), 0, p); DB.put('pages', p).catch(saveFail); renderAll(); } } });
  }

  function pageMenu() {
    const p = curPage();
    if (!p) return;
    menu(el.btnMore, [
      { label: p.pinned ? 'Unpin from top' : 'Pin to top', icon: 'pin', onClick: () => { p.pinned = !p.pinned; savePage(p, true); renderList(); } },
      { label: 'Move to another section', icon: 'chevron', onClick: () => movePage(p) },
      { label: 'Export this page', icon: 'share', onClick: () => openExport('page') },
      Ink.hasInk(p) ? { label: 'Clear handwriting', icon: 'eraser', onClick: async () => {
        if (await confirmBox({ title: 'Clear handwriting?', message: 'This removes all handwriting on this page. Typed text stays.', ok: 'Clear it' })) {
          if (Ink.active) Ink.exit();
          Ink.clearPage(p); savePage(p, true); renderList();
        }
      } } : null,
      { label: 'Delete page', icon: 'trash', danger: true, onClick: () => deletePage(p) },
    ]);
  }

  /* =====================================================================
     Editor
     ===================================================================== */
  function updateMeta() {
    const p = curPage();
    if (!p || !el.pgMeta) return;
    el.pgMeta.replaceChildren(h('span', {}, fmtLong(p.created)), h('span', {}, 'Edited ' + relTime(p.updated)));
  }

  function renderEditor() {
    const p = curPage();
    el.edEmpty.hidden = !!p;
    el.edWrap.hidden = !p;
    Ink.setPage(p || null);
    if (!p) return;
    applyNoteColor(p);
    el.tplChip.textContent = tplLabel(p);
    el.tplChip.className = 'chip tpl-' + p.template;
    el.pgTitle.value = p.title;
    updateMeta();
    renderBlocks();
    el.edScroll.scrollTop = 0;
  }

  /* Note colors: soft paper tints, deliberately different from the plum and amber of the app. */
  const NOTE_COLORS = [['', 'Plain'], ['sky', 'Sky'], ['mint', 'Mint'], ['rose', 'Rose'], ['stone', 'Stone'], ['aqua', 'Aqua']];
  function applyNoteColor(p) {
    const c = (p && p.color) || '';
    el.edWrap.className = 'ed-wrap' + (c ? ' nc-' + c : '');
    el.btnColor.className = 'color-btn' + (c ? ' nc-' + c : '');
  }
  function colorMenu() {
    const p = curPage();
    if (!p) return;
    closeMenu();
    const m = h('div', { class: 'menu colorpop', role: 'menu', 'aria-label': 'Note color' },
      NOTE_COLORS.map(([k, name]) => h('button', {
        class: 'cswatch' + (k ? ' nc-' + k : ' plain') + ((p.color || '') === k ? ' on' : ''), type: 'button', 'aria-label': name, title: name,
        onclick: () => { closeMenu(); p.color = k; savePage(p, true); applyNoteColor(p); renderList(); },
      })));
    document.body.append(m);
    const r = el.btnColor.getBoundingClientRect();
    const mw = m.offsetWidth || 260;
    m.style.top = Math.min(r.bottom + 6, window.innerHeight - 80) + 'px';
    m.style.left = Math.max(8, Math.min(r.left + r.width / 2 - mw / 2, window.innerWidth - mw - 8)) + 'px';
    const outside = (e) => { if (!m.contains(e.target)) closeMenu(); };
    const esc = (e) => { if (e.key === 'Escape') closeMenu(); };
    setTimeout(() => { document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', esc, true); }, 0);
    m._cleanup = () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', esc, true); };
  }

  const fit = (t) => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };
  const fitAll = () => $$('textarea.bt', el.blocks).forEach(fit);

  function placeholderFor(b, p) {
    if (b.type === 'h') return 'Heading';
    if (b.type === 'todo') return 'To do';
    if (b.type === 'bullet') return 'List item';
    if (b.type === 'decision') return 'What did you decide?';
    return p.blocks.length === 1 ? 'Type here, or double-tap anywhere to dictate' : '';
  }

  function blockEl(b, p) {
    const ta = h('textarea', { class: 'bt', rows: '1', spellcheck: 'true', autocapitalize: 'sentences', 'aria-label': 'Note text', placeholder: placeholderFor(b, p) });
    ta.value = b.text;
    const wrap = h('div', { class: 'block b-' + b.type + (b.done ? ' done' : ''), dataset: { id: b.id } });
    if (b.type === 'todo') wrap.append(h('button', { class: 'chk', type: 'button', role: 'checkbox', 'aria-checked': String(!!b.done), 'aria-label': 'Done' }, icon('check', 16)));
    if (b.type === 'bullet') wrap.append(h('span', { class: 'dot' }));
    if (b.type === 'decision') wrap.append(h('div', { class: 'dlabel' }, 'Decision'));
    wrap.append(ta);
    return wrap;
  }

  function renderBlocks(focusId, pos) {
    const p = curPage();
    if (!p) return;
    el.blocks.replaceChildren(...p.blocks.map((b) => blockEl(b, p)));
    fitAll();
    if (focusId) focusBlock(focusId, pos || 0);
  }

  const taOf = (id) => el.blocks.querySelector('[data-id="' + id + '"] textarea');
  function focusBlock(id, pos) {
    const ta = taOf(id);
    if (!ta) return;
    ta.focus();
    try { ta.setSelectionRange(pos, pos); } catch (e) { /* ignore */ }
    if (ta.scrollIntoView) ta.scrollIntoView({ block: 'nearest' });
  }
  const blockIdOf = (ta) => ta.closest('.block').dataset.id;

  function onBlockInput(e) {
    const ta = e.target;
    if (!ta.classList.contains('bt')) return;
    const p = curPage();
    const b = p.blocks.find((x) => x.id === blockIdOf(ta));
    if (!b) return;
    b.text = ta.value;
    fit(ta);
    // Markdown shortcuts at the start of a plain paragraph.
    if (b.type === 'p') {
      const m = /^(- |\* |\[\] |\[ \] |# |> )/.exec(b.text);
      if (m) {
        const map = { '- ': 'bullet', '* ': 'bullet', '[] ': 'todo', '[ ] ': 'todo', '# ': 'h', '> ': 'decision' };
        b.type = map[m[1]];
        b.text = b.text.slice(m[1].length);
        renderBlocks(b.id, Math.max(0, ta.selectionStart - m[1].length));
        savePage(p);
        return;
      }
    }
    if (Dict.last && Dict.last.blockId === b.id) Dict.last.pos = ta.selectionStart;
    savePage(p);
  }

  function onBlockKey(e) {
    const ta = e.target;
    if (!ta.classList.contains('bt')) return;
    const p = curPage();
    const id = blockIdOf(ta);
    const i = p.blocks.findIndex((x) => x.id === id);
    const b = p.blocks[i];
    if (!b) return;

    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      const pos = ta.selectionStart, end = ta.selectionEnd;
      if ((b.type === 'todo' || b.type === 'bullet') && !b.text.trim()) { b.type = 'p'; b.done = false; renderBlocks(b.id, 0); savePage(p); return; }
      const left = b.text.slice(0, pos), right = b.text.slice(end);
      b.text = left;
      const nb = newBlock(b.type === 'todo' || b.type === 'bullet' ? b.type : 'p', right);
      p.blocks.splice(i + 1, 0, nb);
      renderBlocks(nb.id, 0);
      savePage(p);
    } else if (e.key === 'Backspace' && ta.selectionStart === 0 && ta.selectionEnd === 0) {
      if (b.type !== 'p') { e.preventDefault(); b.type = 'p'; b.done = false; renderBlocks(b.id, 0); savePage(p); }
      else if (i > 0) {
        e.preventDefault();
        const prev = p.blocks[i - 1];
        const joinAt = prev.text.length;
        prev.text += b.text;
        p.blocks.splice(i, 1);
        renderBlocks(prev.id, joinAt);
        savePage(p);
      }
    } else if (e.key === 'ArrowUp' && ta.selectionStart === 0 && ta.selectionEnd === 0 && i > 0) {
      e.preventDefault(); focusBlock(p.blocks[i - 1].id, p.blocks[i - 1].text.length);
    } else if (e.key === 'ArrowDown' && ta.selectionStart === ta.value.length && i < p.blocks.length - 1) {
      e.preventDefault(); focusBlock(p.blocks[i + 1].id, 0);
    }
  }

  function onBlockFocus(e) {
    const ta = e.target;
    if (!ta.classList || !ta.classList.contains('bt')) return;
    const p = curPage();
    const id = blockIdOf(ta);
    Dict.last = { pageId: p.id, blockId: id, pos: ta.selectionStart };
    const b = p.blocks.find((x) => x.id === id);
    updateFmt(b ? b.type : null);
  }
  function onBlockBlur(e) {
    const ta = e.target;
    if (ta.classList && ta.classList.contains('bt') && Dict.last && Dict.last.blockId === blockIdOf(ta)) Dict.last.pos = ta.selectionStart;
  }
  function onBlockClick(e) {
    const c = e.target.closest('.chk');
    if (!c) return;
    const p = curPage();
    const wrap = c.closest('.block');
    const b = p.blocks.find((x) => x.id === wrap.dataset.id);
    if (!b) return;
    b.done = !b.done;
    wrap.classList.toggle('done', b.done);
    c.setAttribute('aria-checked', String(b.done));
    savePage(p);
  }

  function updateFmt(type) {
    $$('button', el.fmtbar).forEach((x) => x.classList.toggle('on', x.dataset.type === type));
  }

  function applyType(type) {
    const p = curPage();
    if (!p) return;
    const a = document.activeElement;
    let id = a && a.classList && a.classList.contains('bt') ? blockIdOf(a) : (Dict.last && Dict.last.pageId === p.id ? Dict.last.blockId : null);
    if (!id || !p.blocks.some((b) => b.id === id)) id = p.blocks[p.blocks.length - 1].id;
    const b = p.blocks.find((x) => x.id === id);
    const pos = Dict.last && Dict.last.blockId === id ? Dict.last.pos : b.text.length;
    b.type = b.type === type && type !== 'p' ? 'p' : type;
    if (b.type !== 'todo') b.done = false;
    renderBlocks(b.id, pos);
    updateFmt(b.type);
    savePage(p);
  }

  /* =====================================================================
     Voice dictation
     ===================================================================== */
  function dictTarget() {
    const p = curPage();
    if (!p) return null;
    const a = document.activeElement;
    if (a && a.classList && a.classList.contains('bt')) return { blockId: blockIdOf(a), pos: a.selectionStart };
    if (Dict.last && Dict.last.pageId === p.id) {
      const b = p.blocks.find((x) => x.id === Dict.last.blockId);
      if (b) return { blockId: b.id, pos: Math.min(Dict.last.pos, b.text.length) };
    }
    const lastB = p.blocks[p.blocks.length - 1];
    if (lastB && lastB.type === 'p' && !lastB.text) return { blockId: lastB.id, pos: 0 };
    const nb = newBlock('p');
    p.blocks.push(nb);
    renderBlocks();
    return { blockId: nb.id, pos: 0 };
  }

  const quickNote = () => newQuickNote({ voice: true });

  function startDict() {
    if (!Voice.supported) { toast(DICT_ERRORS.unsupported, { ms: 5000 }); return; }
    // On a phone's page list the editor is out of sight, so start a fresh voice note instead of writing into a hidden page.
    if (!curPage() || (isNarrow() && el.app.dataset.view !== 'editor')) quickNote();
    const t = dictTarget();
    if (!t) return;
    Dict.target = t;
    Voice.setLang(settings.lang);
    Voice.start();
  }
  function stopDict() { Voice.stop(); Dict.target = null; flushAll(); }
  function toggleDict() { if (Dict.on) stopDict(); else startDict(); }

  function insertAtTarget(text) {
    const p = curPage();
    if (!p || !Dict.target) return;
    let b = p.blocks.find((x) => x.id === Dict.target.blockId);
    if (!b) {
      b = newBlock('p');
      p.blocks.push(b);
      Dict.target = { blockId: b.id, pos: 0 };
      renderBlocks();
    }
    const pos = Math.min(Dict.target.pos, b.text.length);
    const before = b.text.slice(0, pos), after = b.text.slice(pos);
    let ins = text;
    if (!before.trim() || /[.!?]\s*$/.test(before)) ins = ins.replace(/^(\s*)(\p{L})/u, (m, s, c) => s + c.toUpperCase());
    if (before && !/\s$/.test(before)) ins = ' ' + ins;
    if (after && !/^\s/.test(after)) ins += ' ';
    b.text = before + ins + after;
    Dict.target.pos = before.length + ins.length;
    const ta = taOf(b.id);
    if (ta) { ta.value = b.text; fit(ta); reveal(ta); }
    savePage(p);
  }

  /* Scroll so the text being dictated stays visible above the floating bars. */
  function reveal(ta) {
    const sc = el.edScroll;
    if (!sc || !ta.getBoundingClientRect) return;
    const r = ta.getBoundingClientRect();
    const bars = [el.dictBar, el.inkBar].filter((x) => x && !x.hidden).map((x) => x.getBoundingClientRect().top);
    const limit = Math.min(window.innerHeight, ...bars) - 28;
    const top = sc.getBoundingClientRect().top + 8;
    if (r.bottom > limit) sc.scrollTop += r.bottom - limit;
    else if (r.top < top) sc.scrollTop -= top - r.top;
  }

  function newBlockAtTarget() {
    const p = curPage();
    if (!p || !Dict.target) return;
    const i = p.blocks.findIndex((x) => x.id === Dict.target.blockId);
    const cur = p.blocks[i];
    const nb = newBlock(cur && (cur.type === 'todo' || cur.type === 'bullet') ? cur.type : 'p');
    p.blocks.splice(i < 0 ? p.blocks.length : i + 1, 0, nb);
    Dict.target = { blockId: nb.id, pos: 0 };
    renderBlocks();
    savePage(p);
  }

  function dictInsert(raw) {
    const parts = raw.split(/\b(new paragraph|new line)\b/i);
    parts.forEach((part, i) => {
      if (i % 2 === 1) newBlockAtTarget();
      else if (part.trim()) insertAtTarget(part.trim());
    });
  }

  function dictHint() { return settings.dbl ? 'Speak now. Double-tap to stop.' : 'Speak now.'; }

  Voice.on({
    final: dictInsert,
    interim: (t) => { el.dictLive.textContent = t || dictHint(); },
    state: (on) => {
      Dict.on = on;
      el.dictBar.hidden = !on;
      el.btnDictate.setAttribute('aria-pressed', String(on));
      if (on) el.dictLive.textContent = dictHint();
    },
    error: (code) => {
      Dict.on = false;
      el.dictBar.hidden = true;
      el.btnDictate.setAttribute('aria-pressed', 'false');
      toast(DICT_ERRORS[code] || 'Dictation stopped.', { ms: 7000 });
    },
  });

  /* =====================================================================
     Handwriting
     ===================================================================== */
  function toggleInk() {
    if (!curPage()) return;
    if (Ink.active) Ink.exit(); else enterInk();
  }
  function enterInk() {
    const a = document.activeElement;
    if (a && a.blur && a !== document.body) a.blur();
    if (Ink.enter()) toast('Write with your finger or a pen. Two-finger tap to finish.', { ms: 3500 });
  }
  function setInkUI(on) {
    el.app.classList.toggle('ink-on', on);
    el.inkBar.hidden = !on;
    el.btnInk.setAttribute('aria-pressed', String(on));
    if (!on) renderListSoon();
  }
  function bindInkBar() {
    $$('[data-tool]', el.inkBar).forEach((b) => b.addEventListener('click', () => {
      Ink.setTool(b.dataset.tool);
      $$('[data-tool]', el.inkBar).forEach((x) => x.classList.toggle('on', x === b));
    }));
    $$('[data-color]', el.inkBar).forEach((b) => b.addEventListener('click', () => {
      Ink.setColor(b.dataset.color);
      $$('[data-color]', el.inkBar).forEach((x) => x.classList.toggle('on', x === b));
      if (Ink.tool !== 'pen') { Ink.setTool('pen'); $$('[data-tool]', el.inkBar).forEach((x) => x.classList.toggle('on', x.dataset.tool === 'pen')); }
    }));
    $$('[data-size]', el.inkBar).forEach((b) => b.addEventListener('click', () => {
      Ink.setSize(Number(b.dataset.size));
      $$('[data-size]', el.inkBar).forEach((x) => x.classList.toggle('on', x === b));
    }));
    el.inkUndo.addEventListener('click', () => { if (!Ink.undo()) toast('Nothing to undo', { ms: 1500 }); });
    el.inkSpace.addEventListener('click', () => { Ink.addSpace(); el.edScroll.scrollTop = el.edScroll.scrollHeight; });
    el.inkDone.addEventListener('click', () => Ink.exit());
  }

  /* =====================================================================
     Export for Claude, backup and settings
     ===================================================================== */
  function mdBlocks(blocks) {
    let s = '', prevList = false, first = true;
    for (const b of blocks) {
      if (!b.text || !b.text.trim()) continue;
      const isList = b.type === 'todo' || b.type === 'bullet';
      let line;
      if (b.type === 'h') line = '#### ' + b.text.trim();
      else if (b.type === 'todo') line = '- [' + (b.done ? 'x' : ' ') + '] ' + b.text.trim();
      else if (b.type === 'bullet') line = '- ' + b.text.trim();
      else if (b.type === 'decision') line = '> **Decision:** ' + b.text.trim();
      else line = b.text.trim();
      if (!first) s += prevList && isList ? '\n' : '\n\n';
      s += line; prevList = isList; first = false;
    }
    return s;
  }
  function mdPage(p) {
    let s = '### ' + (p.title || 'Untitled') + '\n*' + tplLabel(p) + ', ' + new Date(p.created).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' }) + '*\n\n' + mdBlocks(p.blocks);
    if (Ink.hasInk(p)) s += '\n\n*(This page also has handwriting, which is not included in this text export.)*';
    return s.trim() + '\n';
  }
  function mdSection(sec, level) {
    const pages = S.pages.filter((p) => p.sectionId === sec.id).sort((a, b) => a.created - b.created);
    return '#'.repeat(level) + ' ' + sec.name + '\n\n' + (pages.length ? pages.map(mdPage).join('\n') : '*(no pages)*\n');
  }
  function buildMarkdown(scope) {
    const head = 'Notes exported from my Notebook app on ' + new Date().toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' }) + '.\n\n';
    const cp = curPage();
    if (scope === 'page' && cp) {
      const sec = secById(cp.sectionId); const nb = sec && nbById(sec.notebookId);
      return head + (nb ? 'From notebook "' + nb.name + '", section "' + sec.name + '".\n\n' : '') + mdPage(cp);
    }
    const books = scope === 'all' ? S.notebooks.slice().sort(byOrder) : [nbById(S.sel.notebookId) || S.notebooks[0]].filter(Boolean);
    return head + books.map((nb) => '# ' + nb.name + '\n\n' + sectionsOf(nb.id).map((s) => mdSection(s, 2)).join('\n')).join('\n');
  }

  /* ---- PDF: builds a clean printable copy; the browser's Print dialog saves it as PDF ---- */
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const PRINT_INK = { ink: '#241833', blue: '#2458E6', red: '#D6303A', green: '#17895A', hl: '#F5B52E' };
  const PRINT_NOTE = { sky: ['#E3F0FF', '#4C9AEB'], mint: ['#DFF5E7', '#35B37E'], rose: ['#FFE4EB', '#EA5F86'], stone: ['#E9ECEF', '#8A949E'], aqua: ['#D8F4F2', '#1FA7A0'] };

  function inkSvg(p) {
    const ink = p.ink;
    if (!ink || !ink.strokes || !ink.strokes.length) return '';
    const parts = ink.strokes.map((st) => {
      const pts = st.p, col = PRINT_INK[st.c] || PRINT_INK.ink;
      const extra = st.k === 'hl' ? ' stroke-opacity=".38"' : '';
      if (pts.length < 4) return '<circle cx="' + pts[0] + '" cy="' + pts[1] + '" r="' + (st.w / 2) + '" fill="' + col + '"' + extra.replace('stroke-', 'fill-') + '/>';
      const d = [];
      for (let i = 0; i < pts.length; i += 2) d.push(pts[i] + ',' + pts[i + 1]);
      return '<polyline points="' + d.join(' ') + '" fill="none" stroke="' + col + '" stroke-width="' + st.w + '" stroke-linecap="round" stroke-linejoin="round"' + extra + '/>';
    });
    return '<div class="pp-ink"><div class="pp-cap">Handwriting</div><svg viewBox="0 0 800 ' + Math.max(80, ink.h || 400) + '" xmlns="http://www.w3.org/2000/svg">' + parts.join('') + '</svg></div>';
  }
  function printBlocks(blocks) {
    return blocks.filter((b) => b.text && b.text.trim()).map((b) => {
      const t = esc(b.text.trim());
      if (b.type === 'h') return '<h3>' + t + '</h3>';
      if (b.type === 'todo') return '<p class="pp-todo' + (b.done ? ' done' : '') + '"><span class="box">' + (b.done ? '&#10003;' : '') + '</span><span>' + t + '</span></p>';
      if (b.type === 'bullet') return '<p class="pp-bul"><span>&bull;</span><span>' + t + '</span></p>';
      if (b.type === 'decision') return '<p class="pp-dec"><b>Decision</b> ' + t + '</p>';
      return '<p>' + t + '</p>';
    }).join('');
  }
  function printPageHtml(p) {
    const c = PRINT_NOTE[p.color];
    const style = c ? ' style="background:' + c[0] + ';border-left-color:' + c[1] + '"' : '';
    return '<section class="pp"' + style + '><h2>' + esc(p.title || 'Untitled') + '</h2><div class="pp-meta">' + esc(crumbOf(p)) + ' &middot; ' + esc(tplLabel(p)) + ' &middot; ' +
      esc(new Date(p.created).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })) + '</div>' + printBlocks(p.blocks) + inkSvg(p) + '</section>';
  }
  function buildPrintRoot(scope) {
    flushAll();
    const cp = curPage();
    let pages;
    if (scope === 'page' && cp) pages = [cp];
    else {
      const books = scope === 'all' ? S.notebooks.slice().sort(byOrder) : [nbById(S.sel.notebookId) || S.notebooks[0]].filter(Boolean);
      pages = [];
      books.forEach((nb) => sectionsOf(nb.id).forEach((sec) => pages.push(...S.pages.filter((p) => p.sectionId === sec.id).sort((a, b) => a.created - b.created))));
      pages = pages.filter((p) => p.blocks.some((b) => b.text && b.text.trim()) || Ink.hasInk(p));
    }
    let root = document.getElementById('printRoot');
    if (!root) { root = document.createElement('div'); root.id = 'printRoot'; document.body.append(root); }
    const stamp = new Date().toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' });
    root.innerHTML = '<header class="pp-head"><h1>Notebook</h1><div>' + esc(stamp) + ' &middot; ' + pages.length + ' page' + (pages.length === 1 ? '' : 's') + '</div></header>' +
      (pages.length ? pages.map(printPageHtml).join('') : '<p>No notes to print.</p>');
    return pages.length;
  }
  function printPdf(scope) {
    buildPrintRoot(scope);
    const old = document.title;
    document.title = 'Notebook ' + new Date().toISOString().slice(0, 10);
    const back = () => { document.title = old; window.removeEventListener('afterprint', back); };
    window.addEventListener('afterprint', back);
    setTimeout(() => { try { window.print(); } catch (e) { toast("Couldn't open the print dialog."); } setTimeout(back, 4000); }, 80);
  }

  function openExport(initial) {
    let scope = initial || 'notebook';
    if (scope === 'page' && !curPage()) scope = 'notebook';
    const nb = nbById(S.sel.notebookId) || S.notebooks[0];
    modal((body, close) => {
      const out = h('textarea', { class: 'export-out', readonly: true, 'aria-label': 'Exported notes' });
      const stat = h('p', { class: 'note' });
      const seg = h('div', { class: 'seg' });
      const choices = [['page', 'This page', !!curPage()], ['notebook', nb ? 'Notebook: ' + nb.name : 'Notebook', !!nb], ['all', 'Everything', true]].filter((c) => c[2]);
      const refresh = () => {
        const md = buildMarkdown(scope);
        out.value = md;
        stat.textContent = md.trim().split(/\s+/).filter(Boolean).length + ' words. Remove private client or patient details before you share this anywhere.';
        $$('button', seg).forEach((b) => b.classList.toggle('on', b.dataset.scope === scope));
      };
      choices.forEach(([k, label]) => seg.append(h('button', { type: 'button', dataset: { scope: k }, onclick: () => { scope = k; refresh(); } }, label)));
      body.append(
        h('h3', {}, 'Export for Claude'),
        h('p', { class: 'muted' }, 'Bundles your notes as text for Claude, or as a PDF. Paste the text into a chat with Claude and ask for a summary, themes or next steps. For a PDF, choose Save as PDF in the print screen (on iPhone: Share, then Save to Files).'),
        seg, out, stat,
        h('div', { class: 'dlg-actions' },
          h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => close('cancel') }, 'Close'),
          h('button', { class: 'btn btn-soft', type: 'button', onclick: () => { printPdf(scope); } }, 'Save as PDF'),
          h('button', { class: 'btn btn-soft', type: 'button', onclick: () => { download('notes-' + new Date().toISOString().slice(0, 10) + '.md', out.value, 'text/markdown'); } }, 'Download .md'),
          h('button', { class: 'btn btn-primary', type: 'button', onclick: async () => { toast((await copyText(out.value)) ? 'Copied. Paste it into your chat with Claude.' : "Couldn't copy. Use Download instead."); } }, 'Copy text'))
      );
      refresh();
    }, { wide: true });
  }

  function backupData() {
    return { app: 'pro-notebook', version: 1, exported: new Date().toISOString(), notebooks: S.notebooks, sections: S.sections, pages: S.pages };
  }
  function doBackup() {
    flushAll();
    download('notebook-backup-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(backupData()), 'application/json');
    settings.lastBackup = Date.now();
    saveSettings();
    updateBackupNote();
    toast('Backup downloaded. Keep the file somewhere safe.');
  }

  function cleanBackup(d) {
    if (!d || d.app !== 'pro-notebook' || !Array.isArray(d.notebooks) || !Array.isArray(d.sections) || !Array.isArray(d.pages)) throw new Error('This is not a Notebook backup file.');
    const nbs = d.notebooks.filter((n) => n && n.id && typeof n.name === 'string');
    const nbIds = new Set(nbs.map((n) => n.id));
    const secs = d.sections.filter((s) => s && s.id && nbIds.has(s.notebookId) && typeof s.name === 'string');
    const secIds = new Set(secs.map((s) => s.id));
    const pages = d.pages.filter((p) => p && p.id && secIds.has(p.sectionId)).map((p) => ({
      id: p.id, sectionId: p.sectionId, title: String(p.title || ''), template: TEMPLATES[p.template] ? p.template : 'blank',
      blocks: (Array.isArray(p.blocks) ? p.blocks : []).map((b) => ({ id: b.id || uid(), type: ['p', 'h', 'todo', 'bullet', 'decision'].includes(b.type) ? b.type : 'p', text: String(b.text || ''), done: !!b.done })),
      ink: p.ink && Array.isArray(p.ink.strokes) ? p.ink : null,
      created: Number(p.created) || Date.now(), updated: Number(p.updated) || Date.now(), pinned: !!p.pinned,
      color: ['sky', 'mint', 'rose', 'stone', 'aqua'].includes(p.color) ? p.color : '',
    }));
    pages.forEach((p) => { if (!p.blocks.length) p.blocks.push(newBlock('p')); });
    return { notebooks: nbs, sections: secs, pages };
  }

  async function restoreFrom(file, close) {
    let data;
    try { data = cleanBackup(JSON.parse(await file.text())); }
    catch (e) { toast(e.message && e.message.startsWith('This is not') ? e.message : "That file couldn't be read as a Notebook backup.", { ms: 5000 }); return; }
    close('ok');
    modal((body, close2) => {
      body.append(
        h('h3', {}, 'Restore this backup?'),
        h('p', { class: 'muted' }, 'The file has ' + data.notebooks.length + ' notebooks and ' + data.pages.length + ' pages.'),
        h('div', { class: 'stack' },
          h('button', { class: 'btn btn-primary', type: 'button', onclick: () => { close2('ok'); applyRestore(data, 'merge'); } }, 'Add to what I have'),
          h('button', { class: 'btn btn-danger', type: 'button', onclick: () => { close2('ok'); applyRestore(data, 'replace'); } }, 'Replace everything')),
        h('p', { class: 'note' }, 'Adding keeps your current notes. If a page exists in both, the backup version wins.'),
        h('div', { class: 'dlg-actions' }, h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => close2('cancel') }, 'Cancel'))
      );
    });
  }
  async function applyRestore(data, mode) {
    flushAll();
    if (Ink.active) Ink.exit();
    if (mode === 'replace') {
      await DB.clearAll();
      S.notebooks = data.notebooks; S.sections = data.sections; S.pages = data.pages;
    } else {
      const merge = (mine, theirs) => { const m = new Map(mine.map((x) => [x.id, x])); theirs.forEach((x) => m.set(x.id, x)); return Array.from(m.values()); };
      S.notebooks = merge(S.notebooks, data.notebooks); S.sections = merge(S.sections, data.sections); S.pages = merge(S.pages, data.pages);
    }
    await DB.putMany('notebooks', S.notebooks); await DB.putMany('sections', S.sections); await DB.putMany('pages', S.pages);
    S.sel.pageId = null;
    revalidate();
    renderEditor();
    renderAll();
    if (isNarrow()) el.app.dataset.view = 'list';
    persistSel();
    toast('Restored ' + data.pages.length + ' pages.');
  }

  async function storageNote() {
    try {
      if (navigator.storage && navigator.storage.persisted) {
        const yes = await navigator.storage.persisted();
        return yes ? 'Your browser has marked this storage as protected from automatic clean-up.' : 'Your browser may clear this storage if the device runs low on space. Backups protect you.';
      }
    } catch (e) { /* ignore */ }
    return 'Your notes are stored in this browser on this device.';
  }

  function openBackup() {
    modal((body, close) => {
      const file = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: (e) => { const f = e.target.files && e.target.files[0]; if (f) restoreFrom(f, close); } });
      const note = h('p', { class: 'note' }, '');
      storageNote().then((t) => { note.textContent = t; });
      body.append(
        h('h3', {}, 'Backup and restore'),
        h('p', { class: 'muted' }, 'Your notes live only on this device. A backup file lets you recover them or move them to another device.'),
        h('div', { class: 'stack' },
          h('button', { class: 'btn btn-primary', type: 'button', onclick: doBackup }, 'Download a backup (.json)'),
          h('button', { class: 'btn btn-soft', type: 'button', onclick: () => file.click() }, 'Restore from a backup file')),
        file,
        h('p', { class: 'note' }, settings.lastBackup ? 'Last backup ' + daysAgo(settings.lastBackup) + '.' : 'You have not made a backup yet.'),
        note,
        h('div', { class: 'dlg-actions' }, h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => close('ok') }, 'Close'))
      );
    });
  }

  function openSettings() {
    modal((body, close) => {
      const lang = h('select', { class: 'field', style: 'max-width:220px', 'aria-label': 'Dictation language' }, LANGS.map(([v, t]) => h('option', { value: v }, t)));
      lang.value = settings.lang;
      lang.addEventListener('change', () => { settings.lang = lang.value; saveSettings(); Voice.setLang(settings.lang); el.dictLang.value = settings.lang; });
      const sw = h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(settings.dbl), 'aria-label': 'Double-tap to dictate' });
      sw.addEventListener('click', () => { settings.dbl = !settings.dbl; sw.setAttribute('aria-checked', String(settings.dbl)); saveSettings(); });
      const theme = h('div', { class: 'seg', style: 'margin:0' }, [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(([v, t]) => h('button', {
        type: 'button', class: settings.theme === v ? 'on' : '', dataset: { v },
        onclick: () => { settings.theme = v; saveSettings(); applyTheme(); $$('button', theme).forEach((b) => b.classList.toggle('on', b.dataset.v === v)); },
      }, t)));
      body.append(
        h('h3', {}, 'Settings'),
        h('div', { class: 'row' }, h('div', { class: 'lab' }, 'Dictation language', h('small', {}, 'Which language you speak when dictating.')), lang),
        h('div', { class: 'row' }, h('div', { class: 'lab' }, 'Double-tap to dictate', h('small', {}, 'Double-tap an empty spot to start or stop.')), sw),
        h('div', { class: 'row' }, h('div', { class: 'lab' }, 'Appearance'), theme),
        h('p', { class: 'note' }, "Dictation uses your browser's speech service. Chrome sends the audio to Google and Safari to Apple, so don't dictate private patient or client details."),
        h('div', { class: 'dlg-actions' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: () => close('ok') }, 'Done'))
      );
    });
  }

  function applyTheme() {
    const root = document.documentElement;
    if (settings.theme === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', settings.theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', settings.theme === 'dark' ? '#1B1229' : '#2E1F45');
  }

  /* =====================================================================
     Wiring
     ===================================================================== */
  function cacheElements() {
    ['app', 'sidebar', 'sbTree', 'scrim', 'listpane', 'lpTitle', 'lpSub', 'search', 'searchIcon', 'weekstrip', 'pageList', 'editor', 'edEmpty', 'edWrap',
      'tplChip', 'pgTitle', 'pgMeta', 'blocks', 'pageHost', 'edScroll', 'inkCanvas', 'fmtbar', 'dictBar', 'dictLive', 'dictLang', 'dictStop',
      'inkBar', 'inkUndo', 'inkSpace', 'inkDone', 'backupNote', 'btnEditNav', 'btnSettings', 'btnMenu', 'btnNewPage', 'btnBack', 'btnInk',
      'btnInkIc', 'btnColor', 'btnQuick', 'btnQuickIc', 'btnDictate', 'btnDictIc', 'btnMore', 'btnExportClaude', 'btnBackup',
    ].forEach((id) => { el[id] = document.getElementById(id); });
  }

  function decorate() {
    el.btnEditNav.append(icon('pen', 20));
    el.btnSettings.append(icon('sliders', 20));
    el.btnMenu.append(icon('menu'));
    el.btnBack.append(icon('back'));
    el.btnMore.append(icon('more'));
    el.btnInkIc.append(icon('hand', 18));
    el.btnQuickIc.append(icon('bolt', 18));
    el.btnDictIc.append(icon('mic', 18));
    el.searchIcon.append(icon('search', 18));
    el.btnNewPage.prepend(icon('plus', 18));
    $('[data-tool="pen"]', el.inkBar).append(icon('pen', 22));
    $('[data-tool="hl"]', el.inkBar).append(icon('highlighter', 22));
    $('[data-tool="eraser"]', el.inkBar).append(icon('eraser', 22));
    el.inkUndo.append(icon('undo', 22));
    el.inkSpace.append(icon('space', 22));
    LANGS.forEach(([v, t]) => el.dictLang.append(h('option', { value: v }, v ? t : 'Auto')));
    el.dictLang.value = settings.lang;
  }

  function bind() {
    el.btnMenu.addEventListener('click', openDrawer);
    el.scrim.addEventListener('click', closeDrawer);
    el.btnBack.addEventListener('click', () => { el.app.dataset.view = 'list'; persistSel(); });
    el.btnNewPage.addEventListener('click', pickTemplate);
    el.btnEditNav.addEventListener('click', () => { S.editNav = !S.editNav; renderSidebar(); });
    el.btnSettings.addEventListener('click', openSettings);
    el.btnExportClaude.addEventListener('click', () => openExport());
    el.btnBackup.addEventListener('click', openBackup);
    el.btnMore.addEventListener('click', pageMenu);
    el.btnInk.addEventListener('click', toggleInk);
    el.btnColor.addEventListener('click', colorMenu);
    el.btnQuick.addEventListener('click', () => newQuickNote());
    el.btnDictate.addEventListener('click', toggleDict);
    el.dictStop.addEventListener('click', stopDict);
    el.dictLang.addEventListener('change', () => { settings.lang = el.dictLang.value; saveSettings(); Voice.setLang(settings.lang); });

    el.search.addEventListener('input', () => { S.query = el.search.value; renderList(); });
    el.search.addEventListener('keydown', (e) => { if (e.key === 'Escape') { el.search.value = ''; S.query = ''; renderList(); } });

    el.pgTitle.addEventListener('input', () => { const p = curPage(); if (!p) return; p.title = el.pgTitle.value; savePage(p); renderListSoon(); });
    el.pgTitle.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const p = curPage();
      if (p && p.blocks[0]) focusBlock(p.blocks[0].id, 0);
    });

    el.blocks.addEventListener('input', onBlockInput);
    el.blocks.addEventListener('keydown', onBlockKey);
    el.blocks.addEventListener('focusin', onBlockFocus);
    el.blocks.addEventListener('focusout', onBlockBlur);
    el.blocks.addEventListener('click', onBlockClick);

    // Keep keyboard focus (and the caret) in the note when a block-type button is pressed.
    el.fmtbar.addEventListener('mousedown', (e) => e.preventDefault());
    el.fmtbar.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) applyType(b.dataset.type); });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { if (Dict.on) stopDict(); else if (Ink.active) Ink.exit(); else closeDrawer(); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); el.search.focus(); el.search.select(); }
    });

    bindInkBar();

    // Gesture 1: double-tap anywhere on the app to start or stop dictation.
    Gestures.doubleTap(() => {
      if (!settings.dbl || modalOpen()) return;
      toggleDict();
    }, { ignore: (e) => Ink.active || !!(e.target.closest && e.target.closest('.sidebar, .scrim, .dictbar, .inkbar, .toast, .weekstrip')) });

    // Gesture 2: two-finger tap on a note to write by hand (again to finish).
    Gestures.twoFingerTap(el.edScroll, () => {
      if (!curPage() || modalOpen()) return;
      if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) { /* ignore */ } }
      toggleInk();
    });
  }

  function restoreSel() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('nb.sel') || '{}'); } catch (e) { /* ignore */ }
    if (saved.sectionId && secById(saved.sectionId)) S.sel.sectionId = saved.sectionId;
    if (!S.sel.sectionId) {
      // Nothing remembered yet: open the section of the most recently edited page.
      const recent = S.pages.slice().sort((a, b) => b.updated - a.updated)[0];
      if (recent) S.sel.sectionId = recent.sectionId;
    }
    if (saved.view === 'daily') { S.sel.view = 'daily'; if (saved.day) S.sel.day = saved.day; }
    if (saved.pageId && pageById(saved.pageId)) S.sel.pageId = saved.pageId;
    revalidate();
    if (!S.sel.pageId && !isNarrow()) {
      const first = S.pages.filter((p) => p.sectionId === S.sel.sectionId).sort((a, b) => b.updated - a.updated)[0];
      if (first) S.sel.pageId = first.id;
    }
    el.app.dataset.view = saved.screen === 'editor' && S.sel.pageId ? 'editor' : 'list';
  }

  async function init() {
    cacheElements();
    decorate();
    applyTheme();
    bind();
    Ink.init({
      canvas: el.inkCanvas, host: el.pageHost, scroller: el.edScroll,
      onChange: (p) => { savePage(p); renderListSoon(); },
      onActive: setInkUI,
      onResize: fitAll,
    });
    const data = await DB.init();
    S.notebooks = data.notebooks; S.sections = data.sections; S.pages = data.pages;
    if (!S.notebooks.length) await seed();
    restoreSel();
    renderEditor();
    renderAll();
    persistSel();
    if (!DB.ok) toast("This browser isn't letting the notebook save. Try a normal (not private) window.", { ms: 8000 });
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
    window.NB = { buildPrintRoot, S, el, Dict, settings, openPage, createPage, curPage, buildMarkdown, backupData, toggleInk, toggleDict, renderAll, renderEditor }; // handy for debugging
    document.documentElement.setAttribute('data-ready', '1');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
