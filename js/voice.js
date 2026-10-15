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
  let recent = [];      // finals already delivered, newest last
  let processed = 0;    // how many results of the current session were already handled
  let startedAt = 0;
  let quickEnds = 0;

  const langNow = () => lang || navigator.language || 'en-US';

  function make() {
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;

    // Some browsers (notably Chrome on Android) resend earlier results in every event, repeat a final
    // result, or return a final that repeats the previous one with a few words added. Each of those
    // would type the same words two or three times, so only genuinely new words are passed on.
    const fresh = (clean) => {
      const now = Date.now();
      recent = recent.filter((x) => now - x.at < 8000);
      const low = clean.toLowerCase();
      for (let i = recent.length - 1; i >= 0; i--) {
        const prev = recent[i].t.toLowerCase();
        if (low === prev && now - recent[i].at < 3000) return '';
        if (prev.length >= 6 && low.startsWith(prev + ' ')) { recent.push({ t: clean, at: now }); return clean.slice(prev.length).trim(); }
        if (prev.length >= 6 && prev.startsWith(low) && now - recent[i].at < 3000) return '';
      }
      recent.push({ t: clean, at: now });
      return clean;
    };

    r.onresult = (e) => {
      let interim = '';
      if (e.results.length < processed) processed = 0; // the browser started a fresh list
      const from = Math.max(e.resultIndex || 0, processed);
      for (let i = from; i < e.results.length; i++) {
        const res = e.results[i];
        const t = res[0] ? res[0].transcript : '';
        if (res.isFinal) {
          processed = i + 1;
          const out = fresh(t.trim());
          if (out && hooks.final) hooks.final(out);
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
        try { startedAt = Date.now(); processed = 0; r.lang = langNow(); r.start(); }
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
    try { startedAt = Date.now(); processed = 0; recent = []; rec.lang = langNow(); rec.start(); }
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
