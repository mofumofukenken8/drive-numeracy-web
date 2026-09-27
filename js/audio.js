// 音声データの部品:WAVの読み書き、無音・合図音、つなぎ合わせ、MP3化
(() => {
  const A = DN.audio = {};

  A.silence = (ms, sr) => new Int16Array(Math.round(sr * ms / 1000));

  A.tone = (freq, sec, sr, vol = 0.2) => {
    const n = Math.round(sr * sec), out = new Int16Array(n), fade = Math.min(n / 2, sr * 0.02);
    for (let i = 0; i < n; i++) {
      const env = Math.min(1, i / fade, (n - 1 - i) / fade);
      out[i] = Math.round(Math.sin(2 * Math.PI * freq * i / sr) * env * vol * 32767);
    }
    return out;
  };
  // 問題の始まり(2音)と、考える時間の終わり(1音)
  A.chime = sr => A.concat([A.tone(660, 0.12, sr, 0.18), A.silence(40, sr), A.tone(880, 0.16, sr, 0.18)]);
  A.beep = sr => A.tone(988, 0.22, sr, 0.2);

  A.concat = arrs => {
    const out = new Int16Array(arrs.reduce((n, a) => n + a.length, 0));
    let o = 0;
    for (const a of arrs) { out.set(a, o); o += a.length; }
    return out;
  };

  A.wav = (pcm, sr) => {
    const buf = new ArrayBuffer(44 + pcm.length * 2), v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVE');
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, pcm.length * 2, true);
    new Int16Array(buf, 44).set(pcm);
    return new Uint8Array(buf);
  };

  // WAV(またはヘッダーなしの16bit PCM)を読み、指定のサンプルレートのモノラルにそろえる
  A.parse = (bytes, targetSr) => {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const tag = o => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
    let sr = targetSr, ch = 1, bits = 16, start = 0, len = bytes.byteLength;
    if (bytes.byteLength > 12 && tag(0) === 'RIFF' && tag(8) === 'WAVE') {
      let o = 12;
      while (o + 8 <= bytes.byteLength) {
        const id = tag(o), size = v.getUint32(o + 4, true);
        if (id === 'fmt ') { ch = v.getUint16(o + 10, true); sr = v.getUint32(o + 12, true); bits = v.getUint16(o + 22, true); }
        if (id === 'data') { start = o + 8; len = size && size !== 0xffffffff ? Math.min(size, bytes.byteLength - start) : bytes.byteLength - start; break; }
        o += 8 + size + (size % 2);
      }
    }
    if (bits !== 16) throw new Error(`対応していない音声形式です(${bits}bit)`);
    const frames = Math.floor(len / (2 * ch));
    let pcm = new Int16Array(frames);
    for (let i = 0; i < frames; i++) pcm[i] = v.getInt16(start + i * 2 * ch, true);
    if (sr !== targetSr) pcm = resample(pcm, sr, targetSr);
    return pcm;
  };
  function resample(pcm, from, to) {
    const n = Math.round(pcm.length * to / from), out = new Int16Array(n), r = from / to;
    for (let i = 0; i < n; i++) {
      const x = i * r, i0 = Math.floor(x), f = x - i0;
      out[i] = (pcm[i0] || 0) * (1 - f) + (pcm[i0 + 1] || 0) * f;
    }
    return out;
  }

  // 前後の無音を削る(間の長さはこちらで決めるため)
  A.trim = (pcm, sr, keepMs = 60) => {
    const th = 350;
    let s = 0, e = pcm.length - 1;
    while (s < e && Math.abs(pcm[s]) < th) s++;
    while (e > s && Math.abs(pcm[e]) < th) e--;
    const keep = Math.round(sr * keepMs / 1000);
    return pcm.subarray(Math.max(0, s - keep), Math.min(pcm.length, e + keep));
  };

  // MP3にする(失敗したらWAV)。onProgress(0〜1)
  A.encode = async (pcm, sr, onProgress) => {
    if (window.lamejs && lamejs.Mp3Encoder) {
      try {
        const enc = new lamejs.Mp3Encoder(1, sr, 48), parts = [], step = 1152 * 40;
        for (let i = 0; i < pcm.length; i += step) {
          const out = enc.encodeBuffer(pcm.subarray(i, i + step));
          if (out.length) parts.push(out);
          if ((i / step) % 20 === 0) { onProgress && onProgress(i / pcm.length); await new Promise(r => setTimeout(r, 0)); }
        }
        const end = enc.flush();
        if (end.length) parts.push(end);
        onProgress && onProgress(1);
        return new Blob(parts, { type: 'audio/mpeg' });
      } catch (e) { console.warn('MP3化に失敗、WAVで保存します', e); }
    }
    return new Blob([A.wav(pcm, sr)], { type: 'audio/wav' });
  };
})();
