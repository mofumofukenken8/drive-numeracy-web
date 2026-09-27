// 再生:1本の音声を流し、問題ごとの区切り(チャプター)で前後に移動する。
// ロック画面・CarPlay・ハンドルのボタンは「前の曲/次の曲」で問題を移動できる
(() => {
  const PL = DN.player = {};
  const audio = new Audio();
  audio.preload = 'auto';
  let session = null, url = null, idx = -1, h = {}, lastPos = 0;

  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {} // 消音スイッチ中も鳴らす

  const chapterAt = t => {
    const cs = session.chapters;
    let i = 0;
    while (i + 1 < cs.length && cs[i + 1].t <= t + 0.05) i++;
    return i;
  };

  function meta() {
    if (!('mediaSession' in navigator) || !session) return;
    const c = session.chapters[idx] || {};
    const n = session.chapters.slice(0, idx + 1).filter(x => x.log).length;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: c.log ? `${n}問目 · ${c.topic || c.label}` : c.label,
        artist: '通勤数感ドリル', album: c.label,
        artwork: [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
      });
    } catch (e) {}
  }
  function position() {
    if (!('mediaSession' in navigator) || !isFinite(audio.duration)) return;
    try { navigator.mediaSession.setPositionState({ duration: audio.duration, position: Math.min(audio.currentTime, audio.duration), playbackRate: 1 }); } catch (e) {}
  }

  audio.addEventListener('timeupdate', () => {
    if (!session) return;
    const i = chapterAt(audio.currentTime);
    if (i !== idx) { idx = i; meta(); position(); }
    h.onTime && h.onTime(PL.state());
    if (Math.abs(audio.currentTime - lastPos) > 5) { lastPos = audio.currentTime; h.onSave && h.onSave(audio.currentTime); }
  });
  audio.addEventListener('play', () => { h.onState && h.onState(true); position(); });
  audio.addEventListener('pause', () => { h.onState && h.onState(false); h.onSave && h.onSave(audio.currentTime); });
  audio.addEventListener('ended', () => { h.onState && h.onState(false); h.onEnd && h.onEnd(); });
  audio.addEventListener('error', () => { h.onError && h.onError('音声を再生できませんでした。もう一度作り直してください。'); });

  if ('mediaSession' in navigator) {
    const set = (a, fn) => { try { navigator.mediaSession.setActionHandler(a, fn); } catch (e) {} };
    set('play', () => PL.play());
    set('pause', () => PL.pause());
    set('previoustrack', () => PL.prev());
    set('nexttrack', () => PL.next());
  }

  PL.load = (s, handlers, startAt = 0) => {
    PL.unload();
    session = s; h = handlers || {}; idx = -1;
    url = URL.createObjectURL(s.blob);
    audio.src = url;
    audio.currentTime = 0;
    if (startAt > 0) audio.addEventListener('loadedmetadata', () => { audio.currentTime = Math.min(startAt, s.durationSec - 1); }, { once: true });
    idx = chapterAt(startAt); meta();
  };
  PL.unload = () => { audio.pause(); if (url) URL.revokeObjectURL(url); url = null; session = null; };
  PL.play = () => audio.play().catch(e => { h.onError && h.onError('再生を始められませんでした。再生ボタンをもう一度押してください。'); });
  PL.pause = () => audio.pause();
  PL.toggle = () => (audio.paused ? PL.play() : PL.pause());
  PL.seekChapter = i => {
    if (!session) return;
    const c = session.chapters[Math.max(0, Math.min(i, session.chapters.length - 1))];
    audio.currentTime = c.t + 0.01;
  };
  // 「前」:問題の途中なら頭から、始まってすぐなら1つ前の問題へ
  PL.prev = () => { if (!session) return; const c = session.chapters[idx]; PL.seekChapter(audio.currentTime - c.t > 3 ? idx : idx - 1); };
  PL.next = () => { if (!session) return; if (idx + 1 < session.chapters.length) PL.seekChapter(idx + 1); };
  PL.state = () => ({
    index: idx, chapter: session ? session.chapters[idx] : null,
    time: audio.currentTime, duration: isFinite(audio.duration) ? audio.duration : session ? session.durationSec : 0,
    playing: !audio.paused,
  });
})();
