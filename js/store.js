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
      key: '', model: 'flash', voiceA: 'Kore', voiceB: 'Charon', pace: 'slow', reuse: 0.7,
      mode: 'mix', dur: 20, think: 15, support: 2, anchor: true,
      review: [], sessions: 0, questions: 0, last: null,
    }, saved);
    p.levels = Object.assign({}, LV0, p.levels);
    if (!Array.isArray(p.review)) p.review = [];
    return p;
  };
  S.savePrefs = p => { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) {} };

  // ---- IndexedDB ----
  // clips: 読み上げ部品(同じ文なら使い回す) / sessions: 作った回 / bank: 使い回す問題の情報 / bankAudio: その音声
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('drive-drill', 2);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('clips')) db.createObjectStore('clips');
      if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('bank')) db.createObjectStore('bank', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('bankAudio')) db.createObjectStore('bankAudio');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const tx = async (stores, mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(stores, mode);
      const out = fn(Array.isArray(stores) ? stores.map(s => t.objectStore(s)) : t.objectStore(stores));
      t.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('保存に失敗しました。iPhoneの空き容量を確認してください。'));
    });
  };
  const each = (os, fn) => { os.openCursor().onsuccess = e => { const c = e.target.result; if (c) { fn(c); c.continue(); } }; };

  S.clipGet = key => tx('clips', 'readonly', os => os.get(key)).then(v => (v ? new Int16Array(v.pcm) : null));
  S.clipPut = (key, pcm) => tx('clips', 'readwrite', os => os.put({ pcm: pcm.slice().buffer, at: Date.now() }, key));
  S.clipsPrune = days => tx('clips', 'readwrite', os => { const limit = Date.now() - days * 864e5; each(os, c => { if (c.value.at < limit) c.delete(); }); });

  S.sessionPut = s => tx('sessions', 'readwrite', os => os.put(s));
  S.sessionGet = id => tx('sessions', 'readonly', os => os.get(id));
  S.sessionDelete = id => tx('sessions', 'readwrite', os => os.delete(id));
  S.sessionList = () => tx('sessions', 'readonly', os => os.getAll())
    .then(list => (list || []).map(({ blob, ...meta }) => Object.assign(meta, { size: blob ? blob.size : 0 })).sort((a, b) => a.createdAt - b.createdAt));
  S.sessionPin = async (id, pinned) => { const s = await S.sessionGet(id); if (s) { s.pinned = pinned; await S.sessionPut(s); } };

  // ---- 問題バンク ----
  S.bankList = () => tx('bank', 'readonly', os => os.getAll()).then(l => l || []);
  S.bankAdd = (entry, blob) => tx(['bank', 'bankAudio'], 'readwrite', ([b, a]) => { a.put(blob, entry.id); return b.put(entry); });
  S.bankAudio = id => tx('bankAudio', 'readonly', os => os.get(id));
  S.bankTouch = ids => tx('bank', 'readwrite', os => {
    ids.forEach(id => { const r = os.get(id); r.onsuccess = () => { const e = r.result; if (e) { e.lastUsed = Date.now(); e.uses = (e.uses || 0) + 1; os.put(e); } }; });
  });
  // ジャンルごとの上限を超えた分と、長く使っていない問題を消す
  S.bankPrune = async (caps, days) => {
    const list = await S.bankList(), limit = Date.now() - days * 864e5, drop = [];
    const by = {};
    list.forEach(e => (by[e.cat] = by[e.cat] || []).push(e));
    Object.entries(by).forEach(([cat, es]) => {
      es.sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
      es.forEach((e, i) => { if (i >= (caps[cat] || 40) || (e.lastUsed || 0) < limit) drop.push(e.id); });
    });
    if (drop.length) await tx(['bank', 'bankAudio'], 'readwrite', ([b, a]) => { drop.forEach(id => { b.delete(id); a.delete(id); }); });
    return drop.length;
  };
  S.bankClear = () => tx(['bank', 'bankAudio'], 'readwrite', ([b, a]) => { b.clear(); a.clear(); });

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
