// 画面とセッションの進行
(() => {
  const U = DN.U, V = DN.voice, C = DN.C;
  const $ = id => document.getElementById(id);

  const CATS = {
    memory: { name: '数字キープ', max: C.memoryMax },
    basic: { name: '暗算の基礎', max: C.basicMax },
    think: { name: '数字で考える', max: C.thinkMax },
    biz: { name: '仕事の数字', max: C.bizMax },
    listen: { name: '会話の聞き取り', max: C.listenMax },
  };
  const MODES = [
    { id: 'mix', name: 'おまかせ', desc: '数字キープ → 暗算 → 仕事の数字 → 考える → 会話', plan: [['memory', 0.15], ['basic', 0.25], ['biz', 0.2], ['think', 0.15], ['listen', 0.25]] },
    { id: 'memory', name: '数字キープ', desc: '聞いた数字を頭に留める', plan: [['memory', 1]] },
    { id: 'basic', name: '暗算の基礎', desc: '2桁の足し算から、技を1つずつ', plan: [['basic', 1]] },
    { id: 'think', name: '数字で考える', desc: '直感の落とし穴に気づく', plan: [['think', 1]] },
    { id: 'biz', name: '仕事の数字', desc: '処理量・燃料費・設備・IT・総務', plan: [['biz', 1]] },
    { id: 'listen', name: '会話の聞き取り', desc: '会議・電話・同業者との会話', plan: [['listen', 1]] },
  ];
  const SUPPORT_HINT = {
    2: '「何を求めるか」を先に伝え、数字を1つずつゆっくり区切って読み、もう一度くり返します。まずはここから。',
    1: '「何を求めるか」を先に伝えてから、ふつうの速さで2回読みます。',
    0: '会議と同じように、自然な順番で1回だけ読みます。',
  };

  // ---------- 保存(この端末のみ) ----------
  const STORE = 'drive-numeracy-v2';
  const read = k => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch (e) { return {}; } };
  const saveLocal = () => { try { localStorage.setItem(STORE, JSON.stringify(P)); } catch (e) {} };
  const save = () => { P.updatedAt = Date.now(); saveLocal(); queueCloud(); };
  const LV0 = { memory: 1, basic: 1, think: 1, biz: 1, listen: 1 };
  const P = Object.assign({ mode: 'mix', dur: 20, think: 15, support: 2, anchor: true, rate: 1, voiceA: '', voiceB: '', review: [], sessions: 0, questions: 0, last: null }, read(STORE));
  P.levels = Object.assign({}, LV0, P.levels);
  if (!P.sessions) { const v1 = read('drive-numeracy-v1'); if (v1.sessions) Object.assign(P, { sessions: v1.sessions, questions: v1.questions || 0, last: v1.last || null }); }
  if (![10, 15, 25].includes(P.think)) P.think = 15;
  if (!Array.isArray(P.review)) P.review = [];

  // 声の選択は端末ごとに違うので、同期しない
  const SYNC_KEYS = ['mode', 'dur', 'think', 'support', 'anchor', 'rate', 'levels', 'review', 'sessions', 'questions', 'last', 'updatedAt'];
  let cloud = null, cloudTimer = null, cloudChain = Promise.resolve();
  function pack() {
    const o = {};
    SYNC_KEYS.forEach(k => { if (P[k] !== undefined) o[k] = P[k]; });
    o.levels = Object.assign({}, P.levels); o.review = P.review.slice();
    while (o.review.length && JSON.stringify(o).length > 180000) o.review.pop(); // 1件256KBの上限に収める
    return o;
  }
  function queueCloud() {
    if (!cloud) return;
    clearTimeout(cloudTimer);
    cloudTimer = setTimeout(() => {
      const body = pack();
      cloudChain = cloudChain.then(() => cloud.doc('state/prefs').set(body)).catch(() => {});
    }, 800);
  }
  function applyRemote(d) {
    SYNC_KEYS.forEach(k => { if (d[k] !== undefined) P[k] = d[k]; });
    P.levels = Object.assign({}, LV0, P.levels);
    if (!Array.isArray(P.review)) P.review = [];
    saveLocal(); syncAll();
  }
  function syncAll() {
    segSyncs.forEach(f => f());
    $('optAnchor').checked = P.anchor;
    $('rate').value = P.rate; $('rateOut').textContent = (+P.rate).toFixed(2); V.rate = P.rate;
    renderModes(); renderStats();
  }
  const setSync = where => {
    $('syncNote').textContent = where === 'cloud'
      ? '記録はクラウドに保存されます。iPhoneでもパソコンでも、同じ記録の続きになります。'
      : 'この画面では、記録がこの端末のブラウザにだけ残ります。消えてしまうときは、iPhoneのSafariで開いてください。';
  };

  // ---------- 設定画面 ----------
  function renderModes() {
    const box = $('modeList'); box.innerHTML = '';
    MODES.forEach(m => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'mode'; b.setAttribute('aria-pressed', P.mode === m.id);
      const lv = m.plan.length > 1 ? '全ジャンル' : `レベル ${P.levels[m.id]} / ${CATS[m.id].max}`;
      b.innerHTML = '<b></b><span></span><em></em>';
      b.querySelector('b').textContent = m.name; b.querySelector('span').textContent = m.desc; b.querySelector('em').textContent = lv;
      b.onclick = () => { P.mode = m.id; save(); renderModes(); };
      box.appendChild(b);
    });
  }
  const segSyncs = [];
  function bindSeg(el, key, after) {
    const sync = () => el.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.v === P[key]));
    el.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; P[key] = +b.dataset.v; sync(); save(); after && after(); });
    segSyncs.push(after ? () => { sync(); after(); } : sync);
    sync();
  }
  function renderStats() {
    $('stSessions').textContent = P.sessions; $('stQuestions').textContent = P.questions;
    if (P.last) { const d = Math.floor((Date.now() - P.last) / 864e5); $('stLast').textContent = d === 0 ? '今日' : `${d}日前`; }
  }
  function voiceHint() {
    const h = $('voiceHint');
    if (!V.ok) { $('voiceWarn').hidden = false; h.textContent = ''; return; }
    if (!V.list().length) h.textContent = '日本語の声が見つかりません。iPhoneの設定で日本語の声を追加してから、開き直してください。';
    else if (!V.hasGood()) h.textContent = 'もっと自然な声にするには、iPhoneの「設定」→「アクセシビリティ」→「読み上げコンテンツ」→「声」→「日本語」で、名前に「拡張」や「プレミアム」とつく声をダウンロードしてから、このページを開き直してください。';
    else h.textContent = '「拡張」「プレミアム」とつく声が自然で聞き取りやすいです。聞き比べて選んでください。';
  }

  renderModes(); renderStats();
  bindSeg($('durSeg'), 'dur'); bindSeg($('thinkSeg'), 'think');
  const supHint = () => { $('supportHint').textContent = SUPPORT_HINT[P.support]; };
  bindSeg($('supportSeg'), 'support', supHint); supHint();
  $('optAnchor').checked = P.anchor;
  $('optAnchor').onchange = e => { P.anchor = e.target.checked; save(); };
  V.rate = P.rate; $('rate').value = P.rate; $('rateOut').textContent = (+P.rate).toFixed(2);
  $('rate').oninput = e => { P.rate = V.rate = +e.target.value; $('rateOut').textContent = (+e.target.value).toFixed(2); save(); };
  V.a = P.voiceA; V.b = P.voiceB;
  V.onChange = () => { if (!V.list().length) return; P.voiceA = V.a; P.voiceB = V.b; save(); };
  V.watch(() => { V.fill($('voiceA'), $('voiceB')); V.onChange(); voiceHint(); });
  voiceHint();
  $('testA').onclick = () => V.sample('A');
  $('testB').onclick = () => V.sample('B');

  const ticks = $('ticks');
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * (1 - i / 10), r1 = 66, r2 = i % 5 ? 62 : 58;
    const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l.setAttribute('x1', 100 + r1 * Math.cos(a)); l.setAttribute('y1', 115 - r1 * Math.sin(a));
    l.setAttribute('x2', 100 + r2 * Math.cos(a)); l.setAttribute('y2', 115 - r2 * Math.sin(a));
    l.setAttribute('stroke', '#8595a2'); l.setAttribute('stroke-width', i % 5 ? 1 : 2);
    ticks.appendChild(l);
  }

  // ---------- 表示の部品 ----------
  const show = id => ['setup', 'drive', 'done'].forEach(s => { $(s).hidden = s !== id; });
  function phase(p, label) {
    $('phQ').classList.toggle('on', p === 'q'); $('phT').classList.toggle('on', p === 't'); $('phA').classList.toggle('on', p === 'a');
    $('phT').textContent = p === 't' && label ? label : '考える';
  }
  const bar = f => { $('thinkBar').style.width = `${Math.min(100, f * 100)}%`; };
  function line(b) {
    $('qText').textContent = (b.name ? `${b.name}\n` : '') + U.disp(b.text);
    $('qAns').hidden = $('qExp').hidden = true; bar(0);
  }

  let actx = null;
  function beep(freq, dur) {
    try {
      if (!actx) return;
      const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
      o.frequency.value = freq; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + 0.05);
    } catch (e) {}
  }

  // ---------- 進行 ----------
  class Abort extends Error {}
  let runId = 0, S = null, D = null, tick = null, wakeLock = null;
  const check = id => { if (id !== runId) throw new Abort(); };
  const wait = (ms, id) => U.sleep(ms).then(() => check(id));
  const elapsed = () => S.acc + (S.running ? Date.now() - S.since : 0);
  const total = () => S.dur * 60000;
  const mainEnd = () => total() - (S.anchor ? 50000 : 0);

  async function lockScreen() {
    try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (e) {}
  }
  function renderClock() {
    if (!S) return;
    const e = Math.min(elapsed(), total()), rem = Math.max(0, total() - e);
    $('remain').textContent = `${Math.floor(rem / 60000)}:${String(Math.floor(rem / 1000) % 60).padStart(2, '0')}`;
    $('arc').setAttribute('stroke-dasharray', `${(e / total()) * 100} 100`);
  }

  function specScript(it) {
    const sup = S.support, s = [], body = it.body || [];
    const nat = (body.length ? body.join('、') + '。' : '') + it.ask;
    if (sup >= 1 && it.focus) s.push({ t: 'say', text: it.focus });
    if (sup >= 2 && body.length) {
      body.forEach(b => s.push({ t: 'say', text: `${b}。`, slow: true }, { t: 'gap', ms: 350 }));
      s.push({ t: 'say', text: it.ask });
    } else s.push({ t: 'say', text: nat });
    if (sup >= 1 && body.length) s.push({ t: 'gap', ms: 700 }, { t: 'say', text: `もう一度。${nat}` });
    if (it.steps && it.steps.length) {
      s.push({ t: 'say', text: '順番に考えていきます。' });
      it.steps.forEach(st => s.push({ t: 'say', text: st.ask }, { t: 'think', sec: Math.max(5, Math.round(S.think * 0.6)) }, { t: 'answer', text: st.a, say: `${st.a}。` }));
      s.push({ t: 'answer', text: it.a }, { t: 'explain', text: it.e });
    } else {
      s.push({ t: 'think', sec: Math.round(S.think * (it.thinkMul || 1)) }, { t: 'answer', text: it.a }, { t: 'explain', text: it.e });
    }
    return s;
  }
  const qOf = it => it.q || `${(it.body || []).join('、')}${(it.body || []).length ? '。' : ''}${it.ask}`;

  function gen(cat) {
    const lv = P.levels[cat];
    let it, n = 0;
    do {
      it = cat === 'memory' ? C.memory(lv, S.support) : cat === 'listen' ? C.listen(lv, S.support) : C[cat](lv);
      n++;
    } while (n < 6 && S.log.some(l => l.q === qOf(it)));
    return Object.assign(it, { q: qOf(it), lv });
  }
  function currentCat() {
    const plan = MODES.find(m => m.id === S.mode).plan;
    if (plan.length === 1) return plan[0][0];
    if (S.mainStart == null) S.mainStart = elapsed();
    const f = (elapsed() - S.mainStart) / Math.max(1, mainEnd() - S.mainStart);
    let acc = 0;
    for (const [c, w] of plan) { acc += w; if (f < acc) return c; }
    return plan[plan.length - 1][0];
  }
  const unitOf = (it, review) => ({ item: Object.assign(it, { review: !!review }), script: it.script || specScript(it), log: true, label: review ? `復習 · ${CATS[it.cat].name}` : `${CATS[it.cat].name} Lv${it.lv}` });

  function nextUnit() {
    if (S.stage === 'greet') {
      S.stage = 'anchor';
      const m = MODES.find(x => x.id === S.mode);
      const rv = S.reviewQ.length ? `最初に、前回できなかった問題を${S.reviewQ.length}問、復習します。` : '';
      return { script: [{ t: 'say', text: `${m.name}、${S.dur}分コースを始めます。答えは、声に出して言ってみましょう。${rv}` }], log: false, label: 'スタート', greet: true };
    }
    if (S.stage === 'anchor') {
      S.stage = 'review';
      if (S.anchorData) return { script: S.anchorData.intro, log: false, label: '今日の数字' };
    }
    if (S.stage === 'review') {
      if (S.reviewQ.length && elapsed() < mainEnd()) { const it = S.reviewQ.shift(); S.askedReview.push(it.q); return unitOf(it, true); }
      S.stage = 'main';
    }
    if (S.stage === 'main') {
      if (elapsed() < mainEnd()) return unitOf(gen(currentCat()), false);
      S.stage = 'outro';
    }
    if (S.stage === 'outro') {
      S.stage = 'end';
      if (S.anchorData) return { item: S.anchorData.item, script: S.anchorData.outro, log: true, label: '今日の数字' };
    }
    return null;
  }

  async function play(script, id) {
    for (const b of script) {
      check(id);
      if (b.t === 'say') { phase('q'); line(b); await V.say(b.text, { who: b.who, slow: b.slow }, () => check(id)); }
      else if (b.t === 'gap') await wait(b.ms, id);
      else if (b.t === 'think') {
        phase('t', b.label);
        const ms = b.sec * 1000, t0 = Date.now();
        while (Date.now() - t0 < ms) { bar((Date.now() - t0) / ms); await wait(200, id); }
        bar(1); beep(988, 0.2); await wait(300, id);
      } else if (b.t === 'answer') {
        phase('a'); $('qAns').textContent = U.disp(b.text); $('qAns').hidden = false; $('qExp').hidden = true;
        await V.say(b.say || `答え。${b.text}。`, {}, () => check(id)); await wait(250, id);
      } else if (b.t === 'explain') {
        phase('a'); $('qExp').textContent = U.disp(b.text); $('qExp').hidden = false;
        await V.say(b.text, {}, () => check(id));
      }
    }
  }

  async function runUnit(u, id) {
    $('blockLabel').textContent = u.label;
    $('qCat').textContent = u.item ? `${u.label} · ${u.item.topic}` : u.label;
    $('qAns').hidden = $('qExp').hidden = true; bar(0);
    if (!u.greet) { beep(660, 0.12); await wait(400, id); }
    await play(u.script, id);
    if (u.log) S.log.push(u.item);
    S.cur = null;
    await wait(1200, id);
  }

  async function loop() {
    const id = ++runId;
    try {
      if (S.cur) await runUnit(S.cur, id); // 途中の問題は最初から
      for (let u = nextUnit(); u; u = nextUnit()) { S.cur = u; await runUnit(u, id); }
      await finish(id);
    } catch (e) { if (!(e instanceof Abort)) console.error(e); }
  }

  function stopClock() { if (S.running) { S.acc += Date.now() - S.since; S.running = false; } }
  function setPauseBtn(paused) { $('pauseBtn').textContent = paused ? '再開' : '一時停止'; $('pauseBtn').classList.toggle('paused', paused); }
  function pause() { runId++; V.cancel(); stopClock(); setPauseBtn(true); phase(null); }
  function resume() { S.since = Date.now(); S.running = true; setPauseBtn(false); lockScreen(); loop(); }

  async function finish(id) {
    if (!S || S.finishing) return;
    S.finishing = true; stopClock(); clearInterval(tick);
    if (id !== undefined) {
      phase(null); $('qCat').textContent = 'コース終了'; $('qText').textContent = 'お疲れさまでした。';
      try { await V.say(`お疲れさまでした。今日は${S.log.length}問でした。到着したら、見直しで、まるとばつをつけてください。`, {}, () => check(id)); } catch (e) {}
    }
    P.sessions += 1; P.questions += S.log.length; P.last = Date.now(); save(); renderStats();
    try { wakeLock && wakeLock.release(); } catch (e) {}
    D = { log: S.log, askedReview: S.askedReview, minutes: Math.max(1, Math.round(S.acc / 60000)) };
    S = null;
    renderReview(); show('done'); window.scrollTo(0, 0);
  }

  // ---------- 見直し ----------
  function renderReview() {
    $('sumQ').textContent = D.log.length; $('sumMin').textContent = D.minutes;
    $('levelNote').hidden = true; $('saveMarks').disabled = false; $('saveMarks').textContent = '記録して次回に反映';
    const ol = $('log'); ol.innerHTML = '';
    if (!D.log.length) { const li = document.createElement('li'); li.textContent = '回答した問題はありません。'; ol.appendChild(li); $('saveMarks').disabled = true; return; }
    D.log.forEach(it => {
      const li = document.createElement('li');
      li.innerHTML = '<div class="body"><span class="tag"></span><span class="q"></span><span class="a"></span><span class="e"></span></div><div class="marks"><button type="button" class="ok" aria-label="できた">○</button><button type="button" class="ng" aria-label="できなかった">×</button></div>';
      li.querySelector('.tag').textContent = `${CATS[it.cat].name} · ${it.topic}${it.review ? ' · 復習' : it.lv ? ` · Lv${it.lv}` : ''}`;
      li.querySelector('.q').textContent = U.disp(it.q); li.querySelector('.a').textContent = U.disp(it.a);
      const e = li.querySelector('.e'); e.textContent = U.disp(it.e); e.hidden = !it.e;
      const [ok, ng] = li.querySelectorAll('.marks button');
      const sync = () => { ok.setAttribute('aria-pressed', it.mark === 'ok'); ng.setAttribute('aria-pressed', it.mark === 'ng'); };
      ok.onclick = () => { it.mark = it.mark === 'ok' ? null : 'ok'; sync(); };
      ng.onclick = () => { it.mark = it.mark === 'ng' ? null : 'ng'; sync(); };
      sync(); ol.appendChild(li);
    });
  }
  $('saveMarks').onclick = () => {
    const by = {};
    D.log.forEach(it => { if (!it.mark || it.review) return; const c = by[it.cat] || (by[it.cat] = { ok: 0, ng: 0 }); c[it.mark]++; });
    const notes = Object.entries(by).map(([cat, { ok, ng }]) => {
      const n = ok + ng, before = P.levels[cat];
      let after = before;
      if (n >= 3 && ok / n >= 0.8) after = Math.min(CATS[cat].max, before + 1);
      else if (n >= 2 && ok / n <= 0.4) after = Math.max(1, before - 1);
      P.levels[cat] = after;
      const move = after > before ? `Lv${before} → Lv${after} に上がります` : after < before ? `Lv${after} に戻して固めます` : `Lv${after} のまま続けます`;
      return `${CATS[cat].name}:${n}問中${ok}問 ○。${move}`;
    });
    const strip = it => { const c = Object.assign({}, it); delete c.mark; delete c.review; delete c.lv; return c; };
    const wrong = D.log.filter(it => it.mark === 'ng' && it.topic !== '出発時の数字').map(strip);
    P.review = [...wrong, ...P.review.filter(r => !D.askedReview.includes(r.q) && !wrong.some(w => w.q === r.q))].slice(0, 12);
    save(); renderModes();
    const tail = wrong.length ? `\n×の${wrong.length}問は、次回の最初に復習します。` : '';
    $('levelNote').textContent = (notes.length ? notes.join('\n') : '○×がついていないので、レベルは変わりません。') + tail;
    $('levelNote').hidden = false; $('saveMarks').disabled = true; $('saveMarks').textContent = '記録しました';
  };
  $('againBtn').onclick = () => { show('setup'); window.scrollTo(0, 0); };

  // ---------- 操作 ----------
  $('startBtn').onclick = () => {
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch (e) {}
    V.cancel(); V.load();
    S = {
      mode: P.mode, dur: P.dur, think: P.think, support: P.support, anchor: P.anchor,
      acc: 0, since: Date.now(), running: true, stage: 'greet', log: [], cur: null, mainStart: null,
      reviewQ: P.review.slice(0, 3), askedReview: [],
    };
    S.anchorData = S.anchor ? C.anchor(P.levels.memory) : null;
    setPauseBtn(false); phase(null);
    $('qCat').textContent = 'スタート'; $('qText').textContent = 'まもなく始まります。';
    show('drive'); window.scrollTo(0, 0); renderClock(); lockScreen();
    clearInterval(tick); tick = setInterval(renderClock, 500);
    loop(); // タップの直後に最初の読み上げを始める(iOSの制約)
  };
  $('pauseBtn').onclick = () => { if (!S || S.finishing) return; if (S.running) pause(); else resume(); };
  $('repeatBtn').onclick = () => {
    if (!S || S.finishing || !S.cur) return;
    runId++; V.cancel();
    if (!S.running) { S.since = Date.now(); S.running = true; setPauseBtn(false); }
    loop();
  };
  $('endBtn').onclick = () => { if (!S) return; if (S.finishing) { V.cancel(); return; } runId++; V.cancel(); finish(); };

  // 画面が隠れたら止め、戻ったら今の問題から再開する
  document.addEventListener('visibilitychange', () => {
    if (!S || S.finishing) return;
    if (document.visibilityState === 'hidden' && S.running) { pause(); S.autoPaused = true; }
    else if (document.visibilityState === 'visible' && S.autoPaused) { S.autoPaused = false; resume(); }
  });

  // ---------- 記録の保存先を決める ----------
  (async () => {
    try {
      const db = window.claude && window.claude.use ? await window.claude.use('db') : null;
      if (!db) { setSync('local'); return; }
      cloud = db;
      const snap = await db.doc('state/prefs').get();
      const d = snap.exists ? snap.data() : null;
      if (d && (d.updatedAt || 0) > (P.updatedAt || 0)) applyRemote(d);
      else if (P.sessions || P.updatedAt) queueCloud();
      setSync('cloud');
    } catch (e) { setSync('local'); }
  })();
})();
