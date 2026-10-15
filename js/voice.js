'use strict';
/* Voice dictation using the browser's built-in speech recognition.
   Works in Chrome, Edge and Safari. Chrome and Safari send the audio to their
   own speech service, so dictation needs an internet connection. */

const Voice = (() => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supported = !!SR;
  let rec = null;
  let want = false;
  let lang = '';
  let hooks = {};
  let lastFinal = { t: '', at: 0 };
  let startedAt = 0;
  let quickEnds = 0;

  const langNow = () => lang || navigator.language || 'en-US';

  function make() {
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;

    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const t = res[0] ? res[0].transcript : '';
        if (res.isFinal) {
          const clean = t.trim();
          const now = Date.now();
          // Some Android versions repeat a final result; ignore an identical one that arrives right away.
          if (clean && !(clean === lastFinal.t && now - lastFinal.at < 1500)) {
            lastFinal = { t: clean, at: now };
            if (hooks.final) hooks.final(clean);
          }
        } else {
          interim += t;
        }
      }
      if (hooks.interim) hooks.interim(interim.trim());
    };

    r.onerror = (e) => {
      const code = e && e.error;
      if (code === 'not-allowed' || code === 'service-not-allowed') { want = false; if (hooks.error) hooks.error(code === 'not-allowed' ? 'blocked' : 'service'); }
      else if (code === 'audio-capture') { want = false; if (hooks.error) hooks.error('nomic'); }
      else if (code === 'network') { want = false; if (hooks.error) hooks.error('network'); }
      else if (code === 'language-not-supported') { want = false; if (hooks.error) hooks.error('lang'); }
      /* 'no-speech' and 'aborted' are normal: the browser ends the session and we restart it below. */
    };

    r.onend = () => {
      if (hooks.interim) hooks.interim('');
      if (!want) { if (hooks.state) hooks.state(false); return; }
      // Browsers end a continuous session on their own after a pause. Start it again.
      quickEnds = (Date.now() - startedAt < 1200) ? quickEnds + 1 : 0;
      if (quickEnds > 5) { want = false; if (hooks.error) hooks.error('unavailable'); if (hooks.state) hooks.state(false); return; }
      setTimeout(() => {
        if (!want) return;
        try { startedAt = Date.now(); r.lang = langNow(); r.start(); }
        catch (err) { want = false; if (hooks.state) hooks.state(false); }
      }, 250);
    };
    return r;
  }

  function start() {
    if (!supported) { if (hooks.error) hooks.error('unsupported'); return false; }
    if (want) return true;
    want = true;
    quickEnds = 0;
    if (!rec) rec = make();
    try { startedAt = Date.now(); rec.lang = langNow(); rec.start(); }
    catch (e) { /* already running */ }
    if (hooks.state) hooks.state(true);
    return true;
  }

  function stop() {
    want = false;
    if (rec) { try { rec.stop(); } catch (e) { /* not running */ } }
    if (hooks.state) hooks.state(false);
  }

  function setLang(l) {
    lang = l || '';
    if (want && rec) { try { rec.abort(); } catch (e) { /* ignore */ } } // onend restarts with the new language
  }

  return {
    supported,
    start, stop, setLang,
    get active() { return want; },
    on(h) { hooks = h || {}; },
  };
})();
