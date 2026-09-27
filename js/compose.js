// 1回分(20分など)の問題を選び、Geminiで読み上げを作り、1本の音声にまとめる
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

  // 台本のおおよその長さ(秒)
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
  K.plan = P => {
    const units = [], seen = new Set();
    const mode = K.MODES.find(m => m.id === P.mode) || K.MODES[0];
    const push = u => { u.est = estimate(u.script, P.pace); units.push(u); return u.est; };
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
        const lv = P.levels[cat];
        let it, n = 0;
        do { it = cat === 'memory' ? C.memory(lv, P.support) : cat === 'listen' ? C.listen(lv, P.support) : C[cat](lv); n++; } while (n < 8 && seen.has(qOf(it)));
        it.q = qOf(it); it.lv = lv; seen.add(it.q);
        used += push({ kind: 'item', label: `${K.CATS[cat].name} Lv${lv}`, log: true, item: it, script: it.script || specScript(it, P) });
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
    const sr = G.SAMPLE_RATE, mock = !!opt.mock, signal = opt.signal;
    const say = x => opt.onProgress && opt.onProgress(x);
    const units = K.plan(P);
    units.forEach(u => { u.segs = segments(u); });
    const jobs = [];
    units.forEach(u => u.segs.forEach(s => { if (s.k === 'tts') jobs.push(s); }));

    // 読み上げを作る(同じ内容は保存済みを使う)
    let done = 0, newSec = 0;
    say({ phase: 'tts', done, total: jobs.length });
    const cfg = { key: P.key, model: P.model, voiceA: P.voiceA, voiceB: P.voiceB, pace: P.pace, mock,
      onWait: ms => say({ phase: 'tts', done, total: jobs.length, wait: ms }) };
    const run = async job => {
      const multi = job.parts.some(p => p.speaker === 'B');
      const id = await ST.hash(JSON.stringify([mock ? 'mock' : P.model, P.voiceA, multi ? P.voiceB : '', P.pace, job.parts.map(p => [p.text, p.speaker, p.narration ? 1 : 0, p.pause >= 900 ? 2 : p.pause ? 1 : 0])]));
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

    // 1本の音声にまとめる
    say({ phase: 'mix', frac: 0 });
    const sink = makeSink(sr), chapters = [], chime = A.chime(sr), beep = A.beep(sr);
    for (let i = 0; i < units.length; i++) {
      const u = units[i], ch = { t: sink.samples() / sr, label: u.label, log: u.log, answerAt: null };
      if (u.item) Object.assign(ch, { q: u.item.q, a: u.item.a, e: u.item.e || '', topic: u.item.topic, cat: u.item.cat, lv: u.item.lv, review: !!u.item.review, item: stripItem(u.item) });
      for (const s of u.segs) {
        if (s.k === 'chime') sink.add(chime);
        else if (s.k === 'tts') sink.add(s.pcm);
        else if (s.k === 'sil') sink.add(A.silence(s.ms, sr));
        else if (s.k === 'think') { sink.add(A.silence(Math.max(500, s.sec * 1000 - 220), sr)); sink.add(beep); }
        else if (s.k === 'mark') ch.answerAt = sink.samples() / sr;
      }
      chapters.push(ch);
      say({ phase: 'mix', frac: (i + 1) / units.length });
      await new Promise(r => setTimeout(r, 0));
    }
    const durationSec = sink.samples() / sr;
    const blob = sink.finish();
    const session = {
      id: `s${Date.now()}`, createdAt: Date.now(), mode: P.mode, dur: P.dur, model: mock ? 'mock' : P.model,
      durationSec, chapters, blob, newSec, usd: mock ? 0 : newSec * G.TOKENS_PER_SEC * (G.PRICE[P.model] || 9) / 1e6, played: false,
    };
    await ST.sessionPut(session);
    return session;
  };

  // 復習用に保存する問題(読み上げの台本も含める)
  function stripItem(it) { const c = Object.assign({}, it); delete c.review; delete c.mark; return c; }

  // MP3に少しずつ書き込む(メモリを節約)。MP3化できない端末ではWAV
  function makeSink(sr) {
    if (window.lamejs && lamejs.Mp3Encoder) {
      try {
        const enc = new lamejs.Mp3Encoder(1, sr, 48), out = [];
        let n = 0;
        return {
          add(pcm) { for (let i = 0; i < pcm.length; i += 1152 * 20) { const b = enc.encodeBuffer(pcm.subarray(i, i + 1152 * 20)); if (b.length) out.push(b); } n += pcm.length; },
          samples: () => n,
          finish() { const e = enc.flush(); if (e.length) out.push(e); return new Blob(out, { type: 'audio/mpeg' }); },
        };
      } catch (e) { console.warn(e); }
    }
    const chunks = [];
    let n = 0;
    return { add(p) { chunks.push(p); n += p.length; }, samples: () => n, finish: () => new Blob([A.wav(A.concat(chunks), sr)], { type: 'audio/wav' }) };
  }

  // 声を試す:短い文を1つ作って返す
  K.sample = async (P, which) => {
    const text = which === 'B' ? 'はい、承知しました。では、来週の火曜日、10時に伺います。' : '今月の処理量は、1,240トン。前の月より、8%増えました。';
    const cfg = { key: P.key, model: P.model, voiceA: which === 'B' ? P.voiceB : P.voiceA, voiceB: P.voiceB, pace: P.pace };
    const pcm = A.trim(A.parse(await G.tts([{ text: U.spk(text), speaker: 'A', narration: true }], cfg), G.SAMPLE_RATE), G.SAMPLE_RATE);
    return new Blob([A.wav(pcm, G.SAMPLE_RATE)], { type: 'audio/wav' });
  };
})();
