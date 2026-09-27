// 共通ユーティリティと読み上げエンジン
window.DN = window.DN || {};
DN.C = DN.C || {};

(() => {
  // ---------- 数字と文字 ----------
  const U = DN.U = {};
  U.pick = a => a[Math.floor(Math.random() * a.length)];
  U.rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  U.shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  U.clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  U.comma = n => Math.round(n).toLocaleString('ja-JP');
  U.dec = (n, d = 2) => String(+(+n).toFixed(d));
  U.sig = (n, d = 3) => {
    if (!n) return 0;
    const p = Math.pow(10, Math.floor(Math.log10(Math.abs(n))) - (d - 1));
    return Math.round(n / p) * p;
  };
  // 円 → 「1億2,800万円」
  U.yen = n => {
    n = Math.round(n);
    if (n >= 1e8) { const o = Math.floor(n / 1e8), m = Math.round((n % 1e8) / 1e4); return `${U.comma(o)}億${m ? U.comma(m) + '万' : ''}円`; }
    if (n >= 1e4) { const m = Math.floor(n / 1e4), r = Math.round(n % 1e4); return `${U.comma(m)}万${r ? U.comma(r) : ''}円`; }
    return `${U.comma(n)}円`;
  };
  U.man = x => U.yen(x * 1e4);

  // 文中の {表示|読み} を、画面用と音声用に分ける
  const RUBY = /\{([^|}]*)\|([^}]*)\}/g;
  U.disp = s => String(s ?? '').replace(RUBY, '$1');
  U.spk = s => String(s ?? '').replace(RUBY, '$2')
    .replace(/(\d),(?=\d{3})/g, '$1')
    .replace(/%/g, 'パーセント')
    .replace(/×/g, 'かける').replace(/÷/g, 'わる').replace(/[+＋]/g, 'たす').replace(/−/g, 'ひく')
    .replace(/[=＝]/g, 'は').replace(/≈/g, 'およそ').replace(/→/g, '、')
    .replace(/[()()「」]/g, '、')
    .replace(/、{2,}/g, '、');
  U.sentences = s => s.replace(/([。？！?!])/g, '$1\n').split('\n').map(x => x.trim()).filter(Boolean);
  U.sleep = ms => new Promise(r => setTimeout(r, ms));

  // ---------- 読み上げ ----------
  const V = DN.voice = { rate: 1, a: '', b: '', onChange: null };
  const synth = window.speechSynthesis;
  V.ok = !!synth;
  let voices = [];

  const NOVELTY = /eloquence|grandma|grandpa|rocko|shelley|flo\b|reed|sandy|bad news|bells|boing|bubbles|cellos|jester|organ|trinoids|whisper|zarvox|superstar|wobble|albert|fred|junior|ralph|kathy/i;
  const score = v => {
    const id = `${v.name} ${v.voiceURI}`;
    let s = 0;
    if (/premium|プレミアム/i.test(id)) s += 60;
    if (/enhanced|拡張|高品質|natural|neural|online/i.test(id)) s += 50;
    if (/siri/i.test(id)) s += 40;
    if (/o-ren|nanami|keita|google/i.test(id)) s += 15;
    if (/kyoko|otoya|hattori/i.test(id)) s += 10;
    if (NOVELTY.test(id)) s -= 100;
    return s;
  };
  V.quality = v => (/premium/i.test(v.voiceURI) ? '(プレミアム)' : /enhanced/i.test(v.voiceURI) ? '(拡張)' : '');
  V.load = () => {
    if (!synth) return [];
    voices = synth.getVoices().filter(v => /^ja/i.test(v.lang) && !NOVELTY.test(`${v.name} ${v.voiceURI}`))
      .sort((x, y) => score(y) - score(x));
    return voices;
  };
  V.list = () => voices;
  V.hasGood = () => voices.some(v => score(v) >= 40);
  const find = uri => voices.find(v => v.voiceURI === uri) || null;

  V.fill = (selA, selB) => {
    V.load();
    // 声の一覧が届く前は、保存済みの選択を消さない
    if (voices.length && !find(V.a)) V.a = voices[0].voiceURI;
    if (voices.length && !find(V.b)) {
      const other = voices.find(v => v.voiceURI !== V.a && v.name !== (find(V.a) || {}).name);
      V.b = other ? other.voiceURI : V.a;
    }
    [selA, selB].forEach((sel, i) => {
      if (!sel) return;
      sel.innerHTML = '';
      if (!voices.length) { sel.add(new Option('日本語の声が見つかりません', '')); sel.disabled = true; return; }
      sel.disabled = false;
      voices.forEach(v => sel.add(new Option(`${v.name}${V.quality(v)}`, v.voiceURI)));
      sel.value = i ? V.b : V.a;
      sel.onchange = () => { if (i) V.b = sel.value; else V.a = sel.value; V.onChange && V.onChange(); };
    });
  };
  V.watch = cb => {
    if (!synth) return;
    let n = 0;
    const retry = () => { if (V.load().length || n++ > 12) cb(); else setTimeout(retry, 250); };
    try { synth.addEventListener('voiceschanged', cb); } catch (e) { synth.onvoiceschanged = cb; }
    retry();
  };

  function one(text, o) {
    return new Promise(resolve => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP';
      const v = find(o.who === 'B' ? V.b : V.a);
      if (v) u.voice = v;
      u.rate = U.clamp(V.rate * (o.slow ? 0.86 : 1), 0.5, 1.6);
      // 相手役が同じ声しかないときは、高さを変えて聞き分けやすくする
      u.pitch = o.who === 'B' && V.b === V.a ? 0.78 : 1;
      let done = false;
      const fin = () => { if (!done) { done = true; clearTimeout(t); resolve(); } };
      // iOSで終了イベントが来ないことがあるための保険
      const t = setTimeout(fin, 3000 + text.length * 300 / u.rate);
      u.onend = fin; u.onerror = fin;
      synth.speak(u);
    });
  }

  // guard() は中断されたときに例外を投げる関数
  V.say = async (text, o = {}, guard = () => {}) => {
    if (!synth) return;
    for (const part of U.sentences(U.spk(text))) {
      guard();
      await one(part, o);
      guard();
      await U.sleep(o.slow ? 260 : 90);
    }
  };
  // 何も話していないときに cancel すると、直後の発話が消えることがあるため確認してから止める
  V.cancel = () => { try { if (synth && (synth.speaking || synth.pending)) synth.cancel(); } catch (e) {} };
  V.sample = who => {
    V.cancel();
    return who === 'B'
      ? V.say('はい、承知しました。では、来週の火曜日、10時に伺います。', { who: 'B' })
      : V.say('今月の処理量は、1,240トン。前の月より、8%増えました。', { who: 'A' });
  };
})();
