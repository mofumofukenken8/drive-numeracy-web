// 保存:設定と記録は localStorage、音声は IndexedDB(どちらもこの端末の中だけ)
(() => {
  const S = DN.store = {};
  const PREF_KEY = 'drive-drill-web-v1';
  const LV0 = { memory: 1, basic: 1, think: 1, biz: 1, listen: 1 };
  S.LV0 = LV0;

  S.loadPrefs = () => {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch (e) {}
    const p = Object.assign({
      key: '', model: 'flash', voiceA: 'Kore', voiceB: 'Charon', pace: 'slow',
      mode: 'mix', dur: 20, think: 15, support: 2, anchor: true,
      review: [], sessions: 0, questions: 0, last: null, keep: 2,
    }, saved);
    p.levels = Object.assign({}, LV0, p.levels);
    if (!Array.isArray(p.review)) p.review = [];
    return p;
  };
  S.savePrefs = p => { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) {} };

  // ---- IndexedDB ----
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('drive-drill', 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      db.createObjectStore('clips');
      db.createObjectStore('sessions', { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const tx = async (store, mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode), os = t.objectStore(store);
      const out = fn(os);
      t.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('保存に失敗しました。空き容量を確認してください。'));
    });
  };

  // 読み上げ音声の部品(同じ文・同じ声なら使い回して、料金を節約)
  S.clipGet = key => tx('clips', 'readonly', os => os.get(key)).then(v => (v ? new Int16Array(v.pcm) : null));
  S.clipPut = (key, pcm) => tx('clips', 'readwrite', os => os.put({ pcm: pcm.slice().buffer, at: Date.now() }, key));
  S.clipsPrune = days => tx('clips', 'readwrite', os => {
    const limit = Date.now() - days * 864e5;
    os.openCursor().onsuccess = e => {
      const c = e.target.result;
      if (!c) return;
      if (c.value.at < limit) c.delete();
      c.continue();
    };
  });

  S.sessionPut = s => tx('sessions', 'readwrite', os => os.put(s));
  S.sessionGet = id => tx('sessions', 'readonly', os => os.get(id));
  S.sessionDelete = id => tx('sessions', 'readwrite', os => os.delete(id));
  S.sessionList = () => tx('sessions', 'readonly', os => os.getAll())
    .then(list => (list || []).map(({ blob, ...meta }) => Object.assign(meta, { size: blob ? blob.size : 0 })).sort((a, b) => a.createdAt - b.createdAt));

  // 文字列 → 短いハッシュ(音声部品のキー)
  S.hash = async str => {
    try {
      const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
      return Array.from(new Uint8Array(d).slice(0, 16), b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      let h1 = 0x811c9dc5, h2 = 0x01000193;
      for (let i = 0; i < str.length; i++) { h1 = Math.imul(h1 ^ str.charCodeAt(i), 16777619); h2 = Math.imul(h2 ^ str.charCodeAt(i), 2246822507); }
      return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16) + str.length.toString(16);
    }
  };

  // iPhoneが容量不足のときに勝手に消さないよう、永続保存をお願いする
  S.persist = () => { try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {} };
})();
