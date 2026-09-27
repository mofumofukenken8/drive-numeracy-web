// 1回分(20分など)の問題を選び、Geminiで読み上げを作り、1本の音声にまとめる。
// 「数字キープ」「考える」「会話」は作った問題を音声ごと問題バンクに保存し、次の回から使い回す
(() => {
  const U = DN.U, C = DN.C, A = DN.audio, G = DN.gemini, ST = DN.store;
  const K = DN.compose = {};

  K.CATS = {
    memory: { name: '数字キープ', max: C.memoryMax },
    basic: { name: '暗算の基礎', max: C.basicMax },
    think: { name: '数字で考える', max: C.thinkMax },
    biz: { name: '仕事の数字', max: C.bizMax },
    listen: { name: '会話の聞き取り', max: C.listenMax },
  };
  K.MODES = [
    { id: 'mix', name: 'おまかせ', desc: '数字キープ → 暗算 → 仕事の数字 → 考える → 会話', plan: [['memory', 0.15], ['basic', 0.25], ['biz', 0.2], ['think', 0.15], ['listen', 0.25]] },
    { id: 'memory', name: '数字キープ', desc: '聞いた数字を頭に留める', plan: [['memory', 1]] },
    { id: 'basic', name: '暗算の基礎', desc: '2桁の足し算から、技を1つずつ', plan: [['basic', 1]] },
    { id: 'think', name: '数字で考える', desc: '直感の落とし穴に気づく', plan: [['think', 1]] },
    { id: 'biz', name: '仕事の数字', desc: '処理量・燃料費・設備・IT・総務', plan: [['biz', 1]] },
    { id: 'listen', name: '会話の聞き取り', desc: '会議・電話・同業者との会話', plan: [['listen', 1]] },
  ];
  // 暗算と仕事の数字は答えを覚えてしまうので、使い回さない
  K.REUSABLE = new Set(['memory', 'think', 'listen']);
  K.BANK_CAPS = { memory: 60, think: 60, listen: 30 };

  // 使い回せるのは、読み方・考える時間・声が同じときだけ
  const META_KEYS = ['support', 'think', 'pace', 'voiceA', 'voiceB', 'model'];
  const metaOf = (P, mock) => ({ support: P.support, think: P.think, pace: P.pace, voiceA: P.voiceA, voiceB: P.voiceB, model: mock ? 'mock' : P.model });
  const sameMeta = (a, b) => !!a && !!b && META_KEYS.every(k => a[k] === b[k]);

  // ---------- 問題 → 読み上げの台本 ----------
  function specScript(it, P) {
    const sup = P.support, s = [], body = it.body || [];
    const nat = (body.length ? body.join('、') + '。' : '') + it.ask;
    if (sup >= 1 && it.focus) s.push({ t: 'say', text: it.focus });
    if (sup >= 2 && body.length) {
      body.forEach(b => s.push({ t: 'say', text: `${b}。` }, { t: 'gap', ms: 400 }));
      s.push({ t: 'say', text: it.ask });
    } else s.push({ t: 'say', text: nat });
    if (sup >= 1 && body.length) s.push({ t: 'gap', ms: 900 }, { t: 'say', text: `もう一度。${nat}` });
    if (it.steps && it.steps.length) {
      s.push({ t: 'say', text: '順番に考えていきます。' });
      it.steps.forEach(st => s.push({ t: 'say', text: st.ask }, { t: 'think', sec: Math.max(5, Math.round(P.think * 0.6)) }, { t: 'answer', text: st.a, say: `${st.a}。` }));
      s.push({ t: 'answer', text: it.a }, { t: 'explain', text: it.e });
    } else {
      s.push({ t: 'think', sec: Math.round(P.think * (it.thinkMul || 1)) }, { t: 'answer', text: it.a }, { t: 'explain', text: it.e });
    }
    return s;
  }
  const qOf = it => it.q || `${(it.body || []).join('、')}${(it.body || []).length ? '。' : ''}${it.ask}`;

  function estimate(script, pace) {
    const cps = pace === 'slow' ? 5.8 : 7;
    return script.reduce((sec, b) => {
      if (b.t === 'gap') return sec + b.ms / 1000;
      if (b.t === 'think') return sec + b.sec;
      const text = b.t === 'answer' ? (b.say || `答え。${b.text}`) : b.text;
      return sec + U.spk(text).length / cps + 0.4;
    }, 2.5);
  }

  // ---------- 1回分の問題を選ぶ ----------
  K.plan = (P, ctx = {}) => {
    const units = [], seen = new Set(), usedBank = new Set();
    const mode = K.MODES.find(m => m.id === P.mode) || K.MODES[0];
    const push = u => { u.est = u.est || estimate(u.script, P.pace); units.push(u); return u.est; };
    const minGap = ctx.mock ? 0 : 20 * 3600e3; // 同じ問題は、少なくとも翌日まで出さない
    const pickBank = cat => {
      if (!K.REUSABLE.has(cat) || !(Math.random() < (P.reuse || 0))) return null;
      const lv = P.levels[cat], now = Date.now();
      const cands = (ctx.bank || []).filter(b => b.cat === cat && b.lv === lv && sameMeta(b.meta, ctx.meta)
        && !usedBank.has(b.id) && !seen.has(b.q) && now - (b.lastUsed || 0) >= minGap);
      if (!cands.length) return null;
      cands.sort((a, b) => (a.lastUsed || 0) - (b.lastUsed || 0));
      const b = cands[Math.floor(Math.random() * Math.min(3, cands.length))];
      usedBank.add(b.id); seen.add(b.q);
      return b;
    };

    const reviewQ = P.review.slice(0, 3);
    push({ kind: 'greet', label: 'スタート', log: false, script: [{ t: 'say', text: `${mode.name}、${P.dur}分コースを始めます。答えは、声に出して言ってみましょう。${reviewQ.length ? `最初に、前回できなかった問題を${reviewQ.length}問、復習します。` : ''}` }] });
    const anchor = P.anchor ? C.anchor(P.levels.memory) : null;
    if (anchor) push({ kind: 'anchor', label: '今日の数字', log: false, script: anchor.intro });
    reviewQ.forEach(it => { seen.add(it.q); push({ kind: 'item', label: `復習 · ${K.CATS[it.cat].name}`, log: true, item: Object.assign({}, it, { review: true }), script: it.script || specScript(it, P) }); });

    const reserve = (anchor ? 45 : 0) + 12;
    const mainSec = Math.max(60, P.dur * 60 - units.reduce((s, u) => s + u.est, 0) - reserve);
    mode.plan.forEach(([cat, share]) => {
      let used = 0, guard = 0;
      while (used < mainSec * share && guard++ < 80) {
        const lv = P.levels[cat], label = `${K.CATS[cat].name} Lv${lv}`;
        const b = pickBank(cat);
        if (b) { used += push({ kind: 'item', label, log: true, bank: b, item: Object.assign({}, b.item), est: b.dur }); continue; }
        let it, n = 0;
        do { it = cat === 'memory' ? C.memory(lv, P.support) : cat === 'listen' ? C.listen(lv, P.support) : C[cat](lv); n++; } while (n < 8 && seen.has(qOf(it)));
        it.q = qOf(it); it.lv = lv; seen.add(it.q);
        used += push({ kind: 'item', label, log: true, eligible: K.REUSABLE.has(cat), item: it, script: it.script || specScript(it, P) });
      }
    });
    if (anchor) push({ kind: 'item', label: '今日の数字', log: true, item: anchor.item, script: anchor.outro });
    const n = units.filter(u => u.log).length;
    push({ kind: 'end', label: '終わり', log: false, script: [{ t: 'say', text: `お疲れさまでした。今日は${n}問でした。到着したら、見直しで、まるとばつをつけてください。` }] });
    return units;
  };

  // ---------- 台本 → 音声の部品(Geminiへの依頼・無音・合図) ----------
  function segments(u) {
    const segs = u.kind === 'greet' ? [] : [{ k: 'chime' }];
    let group = [], pause = 0;
    const flush = () => { if (group.length) segs.push({ k: 'tts', parts: group }); group = []; pause = 0; };
    for (const b of u.script) {
      if (b.t === 'gap') { if (group.length) pause += b.ms; else segs.push({ k: 'sil', ms: b.ms }); continue; }
      if (b.t === 'think') { flush(); segs.push({ k: 'think', sec: b.sec }); continue; }
      if (b.t === 'answer' && !group.length) segs.push({ k: 'mark' });
      const text = b.t === 'answer' ? (b.say || `答え。${b.text}。`) : b.text;
      group.push({ text: U.spk(text), speaker: b.who === 'B' ? 'B' : 'A', narration: !b.who, pause });
      pause = 0;
    }
    flush();
    segs.push({ k: 'sil', ms: 1300 });
    return segs;
  }

  // ---------- 作る ----------
  // onProgress({phase, done, total, wait, frac})
  K.build = async (P, opt = {}) => {
    if (!(window.lamejs && lamejs.Mp3Encoder)) throw new Error('この端末では音声ファイルを作れません。');
    const sr = G.SAMPLE_RATE, mock = !!opt.mock, signal = opt.signal;
    const say = x => opt.onProgress && opt.onProgress(x);
    const meta = metaOf(P, mock);
    const bank = await ST.bankList().catch(() => []);
    const units = K.plan(P, { bank, meta, mock });
    const fresh = units.filter(u => !u.bank);
    fresh.forEach(u => { u.segs = segments(u); });
    const jobs = [];
    fresh.forEach(u => u.segs.forEach(s => { if (s.k === 'tts') jobs.push(s); }));

    // 読み上げを作る(同じ内容は保存済みを使う)
    let done = 0, newSec = 0;
    say({ phase: 'tts', done, total: jobs.length });
    const cfg = { key: P.key, model: P.model, voiceA: P.voiceA, voiceB: P.voiceB, pace: P.pace, mock,
      onWait: ms => say({ phase: 'tts', done, total: jobs.length, wait: ms }) };
    const run = async job => {
      const multi = job.parts.some(p => p.speaker === 'B');
      const id = await ST.hash(JSON.stringify([meta.model, P.voiceA, multi ? P.voiceB : '', P.pace, job.parts.map(p => [p.text, p.speaker, p.narration ? 1 : 0, p.pause >= 900 ? 2 : p.pause ? 1 : 0])]));
      let pcm = await ST.clipGet(id).catch(() => null);
      if (!pcm) {
        pcm = A.trim(A.parse(await G.tts(job.parts, cfg, signal), sr), sr);
        newSec += pcm.length / sr;
        await ST.clipPut(id, pcm).catch(() => {});
      }
      job.pcm = pcm;
      done++;
      say({ phase: 'tts', done, total: jobs.length });
    };
    let next = 0, failed = null;
    const worker = async () => {
      while (next < jobs.length && !failed) {
        if (signal && signal.aborted) throw new DOMException('中止しました', 'AbortError');
        try { await run(jobs[next++]); } catch (e) { failed = failed || e; throw e; }
      }
    };
    await Promise.all(Array.from({ length: Math.min(opt.parallel || 3, jobs.length) }, worker));

    // 問題ごとにMP3にして並べる(バンクの問題は保存済みのMP3をそのまま使う)
    say({ phase: 'mix', frac: 0 });
    const chime = A.chime(sr), beep = A.beep(sr), blobs = [], chapters = [], toBank = [], touched = [];
    let t = 0, reused = 0, created = 0;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      let blob, sec, answerOffset = null;
      if (u.bank) {
        blob = await ST.bankAudio(u.bank.id).catch(() => null);
        if (!blob) continue; // 途中で消えていたら、その問題は飛ばす
        sec = u.bank.dur; answerOffset = u.bank.answerOffset; reused++; touched.push(u.bank.id);
      } else {
        const chunks = [];
        let n = 0;
        const add = p => { chunks.push(p); n += p.length; };
        for (const s of u.segs) {
          if (s.k === 'chime') add(chime);
          else if (s.k === 'tts') add(s.pcm);
          else if (s.k === 'sil') add(A.silence(s.ms, sr));
          else if (s.k === 'think') { add(A.silence(Math.max(500, s.sec * 1000 - 220), sr)); add(beep); }
          else if (s.k === 'mark') answerOffset = n / sr;
        }
        ({ blob, sec } = A.mp3(chunks));
        if (u.log) created++;
        if (u.eligible) {
          toBank.push({ blob, entry: { id: `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, cat: u.item.cat, lv: u.item.lv, q: u.item.q,
            item: stripItem(u.item), dur: sec, answerOffset, meta, createdAt: Date.now(), lastUsed: Date.now(), uses: 1 } });
        }
      }
      const ch = { t, label: u.label, log: u.log, answerAt: answerOffset == null ? null : t + answerOffset, fromBank: !!u.bank };
      if (u.item) Object.assign(ch, { q: u.item.q, a: u.item.a, e: u.item.e || '', topic: u.item.topic, cat: u.item.cat, lv: u.item.lv, review: !!u.item.review, item: stripItem(u.item) });
      chapters.push(ch); blobs.push(blob); t += sec;
      say({ phase: 'mix', frac: (i + 1) / units.length });
      await new Promise(r => setTimeout(r, 0));
    }
    for (const { entry, blob } of toBank) await ST.bankAdd(entry, blob).catch(() => {});
    if (touched.length) await ST.bankTouch(touched).catch(() => {});

    const session = {
      id: `s${Date.now()}`, createdAt: Date.now(), mode: P.mode, dur: P.dur, model: meta.model,
      durationSec: t, chapters, blob: new Blob(blobs, { type: 'audio/mpeg' }), newSec, reused, created, pinned: false,
      usd: mock ? 0 : newSec * G.TOKENS_PER_SEC * (G.PRICE[P.model] || 9) / 1e6, played: false,
    };
    await ST.sessionPut(session);
    return session;
  };

  function stripItem(it) { const c = Object.assign({}, it); delete c.review; delete c.mark; return c; }

  // 声を試す:短い文を1つ作って返す
  K.sample = async (P, which) => {
    const text = which === 'B' ? 'はい、承知しました。では、来週の火曜日、10時に伺います。' : '今月の処理量は、1,240トン。前の月より、8%増えました。';
    const cfg = { key: P.key, model: P.model, voiceA: which === 'B' ? P.voiceB : P.voiceA, voiceB: P.voiceB, pace: P.pace };
    const pcm = A.trim(A.parse(await G.tts([{ text: U.spk(text), speaker: 'A', narration: true }], cfg), G.SAMPLE_RATE), G.SAMPLE_RATE);
    return new Blob([A.wav(pcm, G.SAMPLE_RATE)], { type: 'audio/wav' });
  };
})();
