'use strict';
/* Local storage in the browser's IndexedDB. Everything stays on this device.
   The app keeps a copy in memory and writes changes through to the database. */

const DB = (() => {
  const NAME = 'pro-notebook';
  const VERSION = 1;
  const STORES = ['notebooks', 'sections', 'pages'];
  let db = null;
  let ok = false;

  const wrap = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  async function init() {
    try {
      if (!window.indexedDB) throw new Error('IndexedDB is not available');
      db = await new Promise((res, rej) => {
        const q = indexedDB.open(NAME, VERSION);
        q.onupgradeneeded = () => {
          const d = q.result;
          for (const s of STORES) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' });
        };
        q.onsuccess = () => res(q.result);
        q.onerror = () => rej(q.error);
        q.onblocked = () => rej(new Error('Database blocked'));
      });
      ok = true;
      const out = {};
      for (const s of STORES) out[s] = await wrap(db.transaction(s).objectStore(s).getAll());
      return out;
    } catch (e) {
      console.warn('Storage unavailable, notes will not be saved:', e);
      ok = false;
      return { notebooks: [], sections: [], pages: [] };
    }
  }

  function run(store, fn) {
    if (!ok) return Promise.resolve();
    return new Promise((res, rej) => {
      const t = db.transaction(store, 'readwrite');
      fn(t.objectStore(store));
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('Save was cancelled'));
    });
  }

  return {
    init,
    get ok() { return ok; },
    put: (store, obj) => run(store, (s) => s.put(obj)),
    putMany: (store, arr) => run(store, (s) => arr.forEach((o) => s.put(o))),
    del: (store, id) => run(store, (s) => s.delete(id)),
    clearAll: async () => { for (const s of STORES) await run(s, (st) => st.clear()); },
  };
})();
