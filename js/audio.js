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

  // 問題1つ分をMP3にする。MP3はフレーム単位でそのままつなげられるので、
  // 作った問題を保存しておけば、次の回は再変換なしで並べるだけで使い回せる
  A.mp3 = chunks => {
    const enc = new lamejs.Mp3Encoder(1, DN.gemini.SAMPLE_RATE, 48), parts = [];
    for (const pcm of chunks) {
      for (let i = 0; i < pcm.length; i += 1152 * 20) { const b = enc.encodeBuffer(pcm.subarray(i, i + 1152 * 20)); if (b.length) parts.push(b); }
    }
    const end = enc.flush();
    if (end.length) parts.push(end);
    const bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) { bytes.set(new Uint8Array(p.buffer, p.byteOffset, p.length), o); o += p.length; }
    return { blob: new Blob([bytes], { type: 'audio/mpeg' }), sec: A.mp3Seconds(bytes) };
  };

  // MP3の長さ(秒)をフレームを数えて正確に出す(問題の区切り位置の計算に使う)
  const BR1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const BR2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const SRS = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
  A.mp3Seconds = b => {
    let i = 0, sec = 0;
    if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) i = 10 + (((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f));
    while (i + 4 <= b.length) {
      if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) { i++; continue; }
      const ver = (b[i + 1] >> 3) & 3, layer = (b[i + 1] >> 1) & 3, bri = b[i + 2] >> 4, sri = (b[i + 2] >> 2) & 3, pad = (b[i + 2] >> 1) & 1;
      if (ver === 1 || layer !== 1 || bri === 0 || bri === 15 || sri === 3) { i++; continue; }
      const rate = SRS[ver][sri], kbps = (ver === 3 ? BR1 : BR2)[bri];
      const len = Math.floor((ver === 3 ? 144 : 72) * kbps * 1000 / rate) + pad;
      sec += (ver === 3 ? 1152 : 576) / rate;
      i += Math.max(len, 1);
    }
    return sec;
  };
})();
