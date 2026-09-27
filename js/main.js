// 画面の操作
(() => {
  const U = DN.U, ST = DN.store, K = DN.compose, G = DN.gemini, PL = DN.player;
  const $ = id => document.getElementById(id);
  const P = ST.loadPrefs();
  const save = () => { P.updatedAt = Date.now(); ST.savePrefs(P); };
  const MOCK = new URLSearchParams(location.search).has('mock');
  const SUPPORT_HINT = {
    2: '「何を求めるか」を先に伝え、数字を1つずつ区切って読み、もう一度くり返します。まずはここから。',
    1: '「何を求めるか」を先に伝えてから、2回読みます。',
    0: '会議と同じように、自然な順番で1回だけ読みます。',
  };
  const show = id => ['home', 'settings', 'making', 'player', 'review'].forEach(s => { $(s).hidden = s !== id; window.scrollTo(0, 0); });
  const fmtTime = sec => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

  // ---------- ホーム ----------
  function renderStats() {
    $('stSessions').textContent = P.sessions; $('stQuestions').textContent = P.questions;
    if (P.last) { const d = Math.floor((Date.now() - P.last) / 864e5); $('stLast').textContent = d === 0 ? '今日' : `${d}日前`; }
    $('keyWarn').hidden = !!P.key || MOCK;
  }
  function renderModes() {
    const box = $('modeList'); box.innerHTML = '';
    K.MODES.forEach(m => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'mode'; b.setAttribute('aria-pressed', P.mode === m.id);
      b.innerHTML = '<b></b><span></span><em></em>';
      b.querySelector('b').textContent = m.name; b.querySelector('span').textContent = m.desc;
      b.querySelector('em').textContent = m.plan.length > 1 ? '全ジャンル' : `レベル ${P.levels[m.id]} / ${K.CATS[m.id].max}`;
      b.onclick = () => { P.mode = m.id; save(); renderModes(); };
      box.appendChild(b);
    });
  }
  function bindSeg(el, key, after, num = true) {
    const sync = () => el.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', (num ? +b.dataset.v : b.dataset.v) === P[key]));
    el.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; P[key] = num ? +b.dataset.v : b.dataset.v; sync(); save(); after && after(); });
    sync();
  }
  async function renderSessions() {
    const box = $('sessionList'); box.innerHTML = '';
    const list = await ST.sessionList().catch(() => []);
    if (!list.length) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = 'まだありません。下のボタンで、今日の1回分を作れます。'; box.appendChild(p); return; }
    list.slice().reverse().forEach(s => {
      const mode = K.MODES.find(m => m.id === s.mode) || K.MODES[0];
      const n = s.chapters.filter(c => c.log).length, d = new Date(s.createdAt);
      const el = document.createElement('div'); el.className = s.pinned ? 'session pinned' : 'session';
      el.innerHTML = '<b></b><span></span><div class="acts"><button type="button" class="play">再生</button><button type="button" class="pin"></button><button type="button" class="del" aria-label="削除">削除</button></div>';
      el.querySelector('b').textContent = `${mode.name} · ${Math.round(s.durationSec / 60)}分 · ${n}問`;
      el.querySelector('span').textContent = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')} 作成${s.reused ? ` · 使い回し${s.reused}問` : ''}${s.played ? ' · 再生済み' : ''}${s.model === 'mock' ? ' · 確認用' : ''}`;
      el.querySelector('.play').onclick = () => openPlayer(s.id);
      // 「残す」をつけた回は、自動で消さない
      const pin = el.querySelector('.pin');
      pin.textContent = s.pinned ? '★ 残す' : '☆ 残す';
      pin.setAttribute('aria-pressed', !!s.pinned);
      pin.onclick = async () => { await ST.sessionPin(s.id, !s.pinned); renderSessions(); };
      el.querySelector('.del').onclick = async () => { if (confirm('この回を削除しますか?')) { await ST.sessionDelete(s.id); renderSessions(); } };
      box.appendChild(el);
    });
  }
  function setMakeHint(text, isError) {
    const h = $('makeHint');
    h.textContent = text || 'Wi-Fiにつないだ状態で作るのがおすすめです。1回分で2〜5分ほどかかります。';
    h.className = isError ? 'notice error' : text ? 'notice' : 'hint';
  }

  // ---------- 作る ----------
  let maker = null, wake = null;
  async function make() {
    if (!P.key && !MOCK) { openSettings(); return; }
    ST.persist();
    maker = new AbortController();
    show('making');
    const set = (pct, step, status) => { $('makePct').textContent = `${Math.round(pct)}%`; $('makeBar').style.width = `${pct}%`; $('makeStep').textContent = step; $('makeStatus').textContent = status; };
    set(0, '準備', '問題を選んでいます…');
    try { wake = await navigator.wakeLock.request('screen'); } catch (e) {}
    try {
      const s = await K.build(P, {
        mock: MOCK, signal: maker.signal,
        onProgress: x => {
          if (x.phase === 'tts') set(x.total ? (x.done / x.total) * 88 : 0, `${x.done}/${x.total}`, x.wait ? `混み合っているので、${Math.ceil(x.wait / 1000)}秒待ってから続けます…` : 'Geminiで読み上げを作っています…');
          else set(88 + x.frac * 12, 'まとめ', 'ひとつの音声にまとめています…');
        },
      });
      await pruneSessions();
      const cost = s.usd > 0 ? `新しく作った音声は約${Math.round(s.newSec / 60)}分、料金の目安は約${Math.max(1, Math.round(s.usd * 150))}円(無料枠なら0円)。` : '保存済みの音声だけで作れました。';
      setMakeHint(`できました(${Math.round(s.durationSec / 60)}分)。${s.reused ? `${s.reused}問はためた問題を使い回しました。` : ''}${cost}`);
    } catch (e) {
      setMakeHint(e.name === 'AbortError' ? '中止しました。作った分の音声は保存してあるので、次は速く作れます。' : `作れませんでした。${e.message || e}`, e.name !== 'AbortError');
    } finally {
      maker = null;
      try { wake && wake.release(); } catch (e) {}
      show('home'); renderSessions();
    }
  }
  // 「残す」がついていない回は3つまで(再生済みの古いものから消す)
  async function pruneSessions() {
    const list = (await ST.sessionList()).filter(s => !s.pinned);
    const order = list.slice().sort((a, b) => (a.played === b.played ? a.createdAt - b.createdAt : a.played ? -1 : 1));
    for (let i = 0; i < order.length - 3; i++) await ST.sessionDelete(order[i].id);
  }

  // ---------- 設定 ----------
  function openSettings() {
    $('apiKey').value = P.key; $('apiKey').type = 'password'; $('keyShow').textContent = '表示';
    bankHint();
    show('settings');
  }
  async function bankHint() {
    const list = await ST.bankList().catch(() => []);
    const count = cat => list.filter(e => e.cat === cat).length;
    $('bankHint').textContent = `使い回すのは「数字キープ」「数字で考える」「会話の聞き取り」だけで、暗算と仕事の数字は毎回新しく作ります。同じ問題は翌日以降に出ます。声・速さ・考える時間・聞き取りサポートを変えると、それまでの問題は使い回されません。いまためている問題:数字キープ${count('memory')}問、考える${count('think')}問、会話${count('listen')}問。`;
  }
  $('bankClear').onclick = async () => {
    if (!confirm('ためた問題をすべて消しますか?(作り置きの回は残ります)')) return;
    await ST.bankClear().catch(() => {});
    bankHint();
  };
  function costHint() {
    const usd = 12 * 60 * G.TOKENS_PER_SEC * G.PRICE[P.model] / 1e6;
    $('costHint').textContent = `20分コース1回の料金の目安は約${Math.round(usd * 150)}円(読み上げ約12分として)。無料枠の範囲なら0円です。2027年から単価は2倍になる予定です。`;
  }
  ['voiceA', 'voiceB'].forEach(id => {
    const sel = $(id);
    G.VOICES.forEach(([name, desc]) => sel.add(new Option(`${name} · ${desc}`, name)));
    sel.value = P[id];
    sel.onchange = () => { P[id] = sel.value; save(); };
  });
  $('apiKey').addEventListener('change', e => { P.key = e.target.value.trim(); save(); renderStats(); });
  $('keyShow').onclick = () => { const i = $('apiKey'); i.type = i.type === 'password' ? 'text' : 'password'; $('keyShow').textContent = i.type === 'password' ? '表示' : '隠す'; };
  let sampleAudio = null;
  const test = async which => {
    P.key = $('apiKey').value.trim(); save();
    if (!P.key) { $('testStatus').textContent = '先にAPIキーを入れてください。'; return; }
    $('testStatus').textContent = '声を作っています…';
    try {
      const blob = await K.sample(P, which);
      if (sampleAudio) URL.revokeObjectURL(sampleAudio.src);
      sampleAudio = new Audio(URL.createObjectURL(blob));
      await sampleAudio.play();
      $('testStatus').textContent = `${which === 'B' ? P.voiceB : P.voiceA}の声です。`;
    } catch (e) { $('testStatus').textContent = e.message || String(e); }
  };
  $('testA').onclick = () => test('A');
  $('testB').onclick = () => test('B');

  // ---------- 再生 ----------
  let current = null;
  async function openPlayer(id) {
    const s = await ST.sessionGet(id);
    if (!s) { renderSessions(); return; }
    current = s;
    let pos = 0;
    try { pos = +localStorage.getItem(`pos-${id}`) || 0; } catch (e) {}
    if (pos > s.durationSec - 5) pos = 0;
    PL.load(s, {
      onTime: renderPlayer,
      onState: playing => { $('playBtn').textContent = playing ? '一時停止' : '再生'; },
      onSave: t => { try { localStorage.setItem(`pos-${id}`, String(t)); } catch (e) {} },
      onEnd: () => { try { localStorage.removeItem(`pos-${id}`); } catch (e) {} openReview(s, Infinity); },
      onError: msg => { $('qText').textContent = msg; },
    }, pos);
    show('player');
    renderPlayer(PL.state());
  }
  function renderPlayer(st) {
    if (!current || !st.chapter) return;
    const c = st.chapter, total = st.duration || current.durationSec;
    $('remain').textContent = fmtTime(Math.max(0, total - st.time));
    $('arc').setAttribute('stroke-dasharray', `${Math.min(100, (st.time / total) * 100)} 100`);
    const shown = c.log && c.answerAt != null && st.time >= c.answerAt - 0.2;
    const INTRO = { 'スタート': '始まります。答えは声に出して言ってみましょう。', '今日の数字': '今日の数字を覚えましょう。最後に聞きます。', '終わり': 'お疲れさまでした。到着したら見直しをどうぞ。' };
    $('qCat').textContent = c.log ? `${c.label} · ${c.topic}` : c.label;
    // 覚える練習は、答えの時間まで数字を画面に出さない
    $('qText').textContent = !c.log ? INTRO[c.label] || c.label : c.cat === 'memory' && !shown ? '聞いて、覚えてください。' : U.disp(c.q);
    $('qAns').hidden = $('qExp').hidden = !shown;
    if (shown) { $('qAns').textContent = U.disp(c.a); $('qExp').textContent = U.disp(c.e); $('qExp').hidden = !c.e; }
  }
  $('playBtn').onclick = () => PL.toggle();
  $('prevBtn').onclick = () => PL.prev();
  $('nextBtn').onclick = () => PL.next();
  $('playerBack').onclick = () => { PL.pause(); show('home'); renderSessions(); };
  $('finishBtn').onclick = () => { if (!current) return; const st = PL.state(); PL.pause(); openReview(current, st.index); };

  // ---------- 見直し ----------
  let R = null;
  async function openReview(s, upTo) {
    PL.pause();
    const items = s.chapters.filter((c, i) => c.log && i <= upTo);
    R = { s, items: items.map(c => Object.assign({ mark: null }, c)) };
    if (!s.played) {
      s.played = true;
      P.sessions += 1; P.questions += items.length; P.last = Date.now(); save();
      ST.sessionPut(s).catch(() => {});
    }
    $('sumQ').textContent = items.length;
    $('sumMin').textContent = Math.max(1, Math.round(Math.min(s.durationSec, (upTo === Infinity ? s.durationSec : PL.state().time)) / 60));
    $('levelNote').hidden = true; $('saveMarks').disabled = !items.length; $('saveMarks').textContent = '記録して次回に反映';
    const ol = $('log'); ol.innerHTML = '';
    R.items.forEach(it => {
      const li = document.createElement('li');
      li.innerHTML = '<div class="body"><span class="tag"></span><span class="q"></span><span class="a"></span><span class="e"></span></div><div class="marks"><button type="button" class="ok" aria-label="できた">○</button><button type="button" class="ng" aria-label="できなかった">×</button></div>';
      li.querySelector('.tag').textContent = `${K.CATS[it.cat] ? K.CATS[it.cat].name : ''} · ${it.topic}${it.review ? ' · 復習' : it.lv ? ` · Lv${it.lv}` : ''}`;
      li.querySelector('.q').textContent = U.disp(it.q); li.querySelector('.a').textContent = U.disp(it.a);
      const e = li.querySelector('.e'); e.textContent = U.disp(it.e); e.hidden = !it.e;
      const [ok, ng] = li.querySelectorAll('.marks button');
      const sync = () => { ok.setAttribute('aria-pressed', it.mark === 'ok'); ng.setAttribute('aria-pressed', it.mark === 'ng'); };
      ok.onclick = () => { it.mark = it.mark === 'ok' ? null : 'ok'; sync(); };
      ng.onclick = () => { it.mark = it.mark === 'ng' ? null : 'ng'; sync(); };
      sync(); ol.appendChild(li);
    });
    renderStats();
    show('review');
  }
  $('saveMarks').onclick = () => {
    const by = {};
    R.items.forEach(it => { if (!it.mark || it.review || !K.CATS[it.cat]) return; const c = by[it.cat] || (by[it.cat] = { ok: 0, ng: 0 }); c[it.mark]++; });
    const notes = Object.entries(by).map(([cat, { ok, ng }]) => {
      const n = ok + ng, before = P.levels[cat];
      let after = before;
      if (n >= 3 && ok / n >= 0.8) after = Math.min(K.CATS[cat].max, before + 1);
      else if (n >= 2 && ok / n <= 0.4) after = Math.max(1, before - 1);
      P.levels[cat] = after;
      const move = after > before ? `Lv${before} → Lv${after} に上がります` : after < before ? `Lv${after} に戻して固めます` : `Lv${after} のまま続けます`;
      return `${K.CATS[cat].name}:${n}問中${ok}問 ○。${move}`;
    });
    const asked = R.items.filter(it => it.review).map(it => it.q);
    const wrong = R.items.filter(it => it.mark === 'ng' && it.topic !== '出発時の数字' && it.item).map(it => it.item);
    P.review = [...wrong, ...P.review.filter(r => !asked.includes(r.q) && !wrong.some(w => w.q === r.q))].slice(0, 12);
    save(); renderModes();
    $('levelNote').textContent = (notes.length ? notes.join('\n') : '○×がついていないので、レベルは変わりません。') + (wrong.length ? `\n×の${wrong.length}問は、次の回の最初に復習します。` : '');
    $('levelNote').hidden = false; $('saveMarks').disabled = true; $('saveMarks').textContent = '記録しました';
  };
  $('reviewDone').onclick = () => { show('home'); renderSessions(); };

  // ---------- 初期化 ----------
  const ticks = $('ticks');
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * (1 - i / 10), r1 = 66, r2 = i % 5 ? 62 : 58;
    const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l.setAttribute('x1', 100 + r1 * Math.cos(a)); l.setAttribute('y1', 115 - r1 * Math.sin(a));
    l.setAttribute('x2', 100 + r2 * Math.cos(a)); l.setAttribute('y2', 115 - r2 * Math.sin(a));
    l.setAttribute('stroke', '#8595a2'); l.setAttribute('stroke-width', i % 5 ? 1 : 2);
    ticks.appendChild(l);
  }
  bindSeg($('durSeg'), 'dur'); bindSeg($('thinkSeg'), 'think');
  const supHint = () => { $('supportHint').textContent = SUPPORT_HINT[P.support]; };
  bindSeg($('supportSeg'), 'support', supHint); supHint();
  bindSeg($('modelSeg'), 'model', costHint, false); costHint();
  bindSeg($('paceSeg'), 'pace', null, false);
  bindSeg($('reuseSeg'), 'reuse');
  $('optAnchor').checked = P.anchor;
  $('optAnchor').onchange = e => { P.anchor = e.target.checked; save(); };
  $('makeBtn').onclick = make;
  $('cancelMake').onclick = () => maker && maker.abort();
  $('toSettings').onclick = openSettings;
  $('keyWarnBtn').onclick = openSettings;
  $('settingsBack').onclick = () => { P.key = $('apiKey').value.trim(); save(); renderStats(); show('home'); };
  renderStats(); renderModes(); renderSessions();
  // 読み上げ部品は2週間、ためた問題は3か月使わなければ消す
  ST.clipsPrune(14).catch(() => {});
  ST.bankPrune(K.BANK_CAPS, 90).catch(() => {});
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
