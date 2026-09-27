// Gemini TTS クライアント。ブラウザから直接呼ぶ(APIキーはこの端末にだけ保存)
(() => {
  const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
  const G = DN.gemini = {};

  G.MODELS = { flash: 'gemini-3.8-flash-tts', lite: 'gemini-3.8-flash-lite-tts' };
  G.PRICE = { flash: 9, lite: 6 };      // 音声出力 1M トークンあたりのドル(2026年末まで)
  G.TOKENS_PER_SEC = 25;
  G.SAMPLE_RATE = 24000;

  // [名前, 声の印象] Gemini の標準の声
  G.VOICES = [
    ['Kore', '芯がある'], ['Charon', '説明向き'], ['Iapetus', 'クリア'], ['Erinome', 'クリア'],
    ['Schedar', '落ち着いた'], ['Sulafat', 'あたたかい'], ['Achernar', 'やわらか'], ['Vindemiatrix', 'やさしい'],
    ['Sadaltager', '知的'], ['Rasalgethi', '説明向き'], ['Gacrux', '大人っぽい'], ['Alnilam', '芯がある'],
    ['Orus', '芯がある'], ['Achird', '親しみやすい'], ['Aoede', 'さわやか'], ['Puck', 'はずむ'],
    ['Zephyr', '明るい'], ['Autonoe', '明るい'], ['Leda', '若々しい'], ['Despina', 'なめらか'],
    ['Algieba', 'なめらか'], ['Callirrhoe', 'おおらか'], ['Umbriel', 'おおらか'], ['Laomedeia', 'はずむ'],
    ['Pulcherrima', '前に出る'], ['Sadachbia', 'いきいき'], ['Zubenelgenubi', 'カジュアル'], ['Fenrir', '元気'],
    ['Enceladus', '息まじり'], ['Algenib', 'ハスキー'],
  ];

  const PACE = { slow: ' Speak slowly, with a clear pause after each number.', normal: '' };
  G.style = (kind, pace) => kind === 'dialogue'
    ? 'Natural Japanese business conversation at a realistic, easy-to-follow pace.'
    : 'Calm, warm and very clear Japanese narrator for listening practice while driving. Articulate every number carefully.' + (PACE[pace] || '');

  const tag = ms => (ms >= 900 ? ' <long pause> ' : ' <short pause> ');

  // parts: [{text, speaker:'A'|'B', pause(ms, 直前の間)}]
  // o: {key, model, voiceA, voiceB, pace}
  G.body = (parts, o) => {
    const multi = parts.some(p => p.speaker === 'B');
    let content, speech;
    if (multi) {
      content = parts.map(p => ({ type: 'text', text: p.text,
        annotations: [{ type: 'speech_metadata', speaker: p.speaker === 'B' ? 'B' : 'A', style: p.narration ? G.style('narration', o.pace) : G.style('dialogue') }] }));
      speech = { mode: 'conversational', speakers: [{ speaker: 'A', voice: o.voiceA }, { speaker: 'B', voice: o.voiceB }] };
    } else {
      const text = parts.map((p, i) => (i && p.pause ? tag(p.pause) : i ? ' ' : '') + p.text).join('');
      content = [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style: G.style('narration', o.pace) }] }];
      speech = [{ voice: o.voiceA }];
    }
    return {
      model: G.MODELS[o.model] || G.MODELS.flash,
      input: [{ type: 'user_input', content }],
      response_format: { type: 'audio', mime_type: 'audio/wav', sample_rate: G.SAMPLE_RATE },
      generation_config: { speech_config: speech },
    };
  };

  // 応答のどこかにある base64 の音声を探す(steps[].content[].data が基本)
  function findAudio(node, depth = 0) {
    if (!node || typeof node !== 'object' || depth > 8) return null;
    if (typeof node.data === 'string' && (node.type === 'audio' || /^audio\//.test(node.mime_type || node.mimeType || ''))) return node.data;
    for (const v of Array.isArray(node) ? node : Object.values(node)) {
      const hit = findAudio(v, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  const b64ToBytes = b64 => { const s = atob(b64); const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; };

  function apiError(status, text) {
    let msg = '';
    try { msg = JSON.parse(text).error.message || ''; } catch (e) { msg = text.slice(0, 200); }
    const head = status === 400 ? 'リクエストが受け付けられませんでした'
      : status === 401 || status === 403 ? 'APIキーが無効か、このサイトからの利用が許可されていません'
      : status === 429 ? '利用の上限に達しました。無料枠の1日の上限かもしれません'
      : `Geminiでエラーが起きました(${status})`;
    const e = new Error(`${head}。${msg}`);
    e.status = status;
    return e;
  }
  function retryDelay(attempt, text) {
    const m = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(text || '');
    const base = m ? +m[1] * 1000 : Math.min(60000, 2000 * Math.pow(2, attempt));
    return base + Math.random() * 800;
  }

  // WAV のバイト列を返す。o.onWait(ms) は混雑で待つときに呼ばれる
  G.tts = async (parts, o, signal) => {
    if (o.mock) return mockWav(parts);
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(ENDPOINT, {
        method: 'POST', signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': o.key },
        body: JSON.stringify(G.body(parts, o)),
      });
      if (res.ok) {
        const b64 = findAudio(await res.json());
        if (!b64) throw new Error('Geminiから音声が返ってきませんでした。');
        return b64ToBytes(b64);
      }
      const text = await res.text();
      if ((res.status === 429 || res.status >= 500) && attempt < 5) {
        const ms = retryDelay(attempt, text);
        o.onWait && o.onWait(ms);
        await new Promise(r => setTimeout(r, ms));
        continue;
      }
      throw apiError(res.status, text);
    }
  };

  // 確認用:文字数に応じた長さの小さな音を作る(URLに ?mock=1)
  function mockWav(parts) {
    const A = DN.audio, sr = G.SAMPLE_RATE, chunks = [];
    parts.forEach(p => {
      chunks.push(A.silence(p.pause || 150, sr));
      chunks.push(A.tone(p.speaker === 'B' ? 330 : 440, Math.max(0.4, DN.U.spk(p.text).length * 0.11), sr, 0.05));
    });
    return new Promise(r => setTimeout(() => r(A.wav(A.concat(chunks), sr)), 60));
  }
})();
