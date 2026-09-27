// 数字キープ(memory):聞いた数字を頭に留める練習
// script の要素: say{text,who,slow} / gap{ms} / think{sec,label} / answer{text,say} / explain{text}
(() => {
  const { pick, rint, shuffle, comma, man } = DN.U;

  const TIPS = [
    '数字は「何の数字か」と組にして覚えると残ります。',
    '聞いたらすぐ、口の中で一度言い返すのがコツです。',
    '長い数字は区切ります。1,280なら「せんにひゃく」「はちじゅう」の2つです。',
    '頭の中のホワイトボードに、数字を書くイメージを持ちます。',
    '「何を聞かれそうか」を先に考えて聞くと、残りやすくなります。',
  ];

  // 仕事で出てくる「ラベル+数字」
  const LABELS = [
    () => ['今月の処理量', `${comma(rint(8, 30) * 50)}トン`],
    () => ['売上', man(rint(12, 90) * 100)],
    () => ['粗利率', `${rint(18, 42)}%`],
    () => ['稼働している収集車', `${rint(6, 24)}台`],
    () => ['残業時間の合計', `${rint(12, 60) * 5}時間`],
    () => ['燃料費', man(rint(6, 48) * 5)],
    () => ['受注件数', `${rint(12, 96)}件`],
    () => ['見積もり金額', man(rint(15, 99) * 10)],
    () => ['修理の見積もり', yenK(rint(12, 95) * 10)],
    () => ['契約件数', `${rint(40, 320)}件`],
    () => ['納期', `${rint(3, 28)}日`],
    () => ['システムの月額', yenK(rint(2, 19) * 10)],
  ];
  function yenK(k) { return k >= 10 ? `${comma(k * 1000)}円` : `${k}千円`; } // 千円単位の数 → 円表記
  const takeLabels = n => {
    const picked = shuffle(LABELS).slice(0, n).map(f => f());
    return picked;
  };

  // ---- 復唱:聞いた数字を、そのまま言い返す ----
  function echo(lv, sup) {
    const count = [1, 2, 2, 3, 3, 4][lv - 1] || 4;
    const nums = Array.from({ length: count }, () => {
      const k = pick(lv <= 2 ? ['yen3', 'man3'] : ['yen4', 'man4', 'pct', 'ton']);
      if (k === 'yen3') return `${comma(rint(12, 98) * 10)}円`;
      if (k === 'man3') return man(rint(110, 980));
      if (k === 'yen4') return `${comma(rint(101, 998) * 10)}円`;
      if (k === 'man4') return man(rint(1010, 9980));
      if (k === 'pct') return `${rint(11, 89)}.${rint(1, 9)}%`;
      return `${comma(rint(12, 98) * 10 + rint(1, 9))}トン`;
    });
    const slow = sup >= 1 || lv <= 2;
    const script = [
      { t: 'say', text: count === 1 ? '数字を1つ言います。聞いたら、すぐ声に出して言い返してください。' : `数字を${count}つ言います。聞き終わったら、順番に言い返してください。` },
      { t: 'gap', ms: 500 },
    ];
    nums.forEach(n => { script.push({ t: 'say', text: n, slow }, { t: 'gap', ms: lv >= 5 ? 250 : 600 }); });
    script.push(
      { t: 'think', sec: 3 + count * 2.5, label: '言い返す' },
      { t: 'answer', text: nums.join('、'), say: `正解は、${nums.join('、')}。` },
      { t: 'explain', text: pick(TIPS) },
    );
    return { topic: '復唱', q: `数字を${count}つ聞いて言い返す`, a: nums.join('、'), e: '', script };
  }

  // ---- ラベル記憶:いくつかの数字から、聞かれたものを答える ----
  function label(lv, sup) {
    const n = [2, 3, 3, 4, 4, 5][lv - 1] || 5;
    const pairs = takeLabels(n);
    const asks = shuffle(pairs).slice(0, lv >= 4 ? 2 : 1);
    const wait = [2, 3, 5, 6, 8, 10][lv - 1] || 10;
    const script = [
      { t: 'say', text: `報告を聞いて、${n}つの数字を覚えてください。` },
    ];
    if (sup >= 2) script.push({ t: 'say', text: '「何の数字か」と組にして覚えましょう。' });
    script.push({ t: 'gap', ms: 400 });
    pairs.forEach(([k, v]) => script.push({ t: 'say', text: `${k}は、${v}。`, slow: sup >= 1 }, { t: 'gap', ms: 450 }));
    // 少し時間を置く。レベル4以上は、間に別の計算をはさむ
    if (lv >= 4) {
      const a = rint(12, 38), b = rint(11, 29);
      script.push({ t: 'say', text: `覚えたまま、ひとつ計算します。${a} + ${b}は?` }, { t: 'think', sec: 5, label: '計算' }, { t: 'answer', text: `${a + b}`, say: `${a + b}。` });
    } else {
      script.push({ t: 'say', text: '覚えたまま、少し待ちます。' }, { t: 'gap', ms: wait * 1000 });
    }
    asks.forEach(([k, v]) => {
      script.push({ t: 'say', text: `では、${k}は、いくつでしたか?` }, { t: 'think', sec: 5, label: '思い出す' }, { t: 'answer', text: `${k}:${v}`, say: `${k}は、${v}。` });
    });
    script.push({ t: 'explain', text: pick(TIPS) });
    return { topic: '報告の数字', q: pairs.map(([k, v]) => `${k} ${v}`).join(' / '), a: asks.map(([k, v]) => `${k}:${v}`).join(' / '), e: '', script };
  }

  // ---- 比べる:複数の見積もりを覚えて比べる ----
  function compare(lv, sup) {
    const n = lv <= 3 ? 3 : 4;
    const names = ['A社', 'B社', 'C社', 'D社'].slice(0, n);
    const base = pick([9000, 12000, 15000, 18000]);
    const step = lv <= 3 ? 1000 : 500;
    const prices = shuffle([0, 1, 2, 3, 4, 5].map(i => base + i * step)).slice(0, n);
    const min = Math.min(...prices), max = Math.max(...prices);
    const cheapest = names[prices.indexOf(min)];
    const script = [
      { t: 'say', text: `処分費の見積もりが、${n}社から届きました。1トンあたりの単価を覚えてください。` },
      { t: 'gap', ms: 400 },
    ];
    names.forEach((nm, i) => script.push({ t: 'say', text: `${nm}は、${comma(prices[i])}円。`, slow: sup >= 1 }, { t: 'gap', ms: 450 }));
    script.push(
      { t: 'say', text: '一番安いのは、どこ?' }, { t: 'think', sec: 5, label: '思い出す' },
      { t: 'answer', text: `${cheapest}(${comma(min)}円)`, say: `${cheapest}、${comma(min)}円。` },
    );
    if (lv >= 2) script.push(
      { t: 'say', text: '一番高いところとの差は、1トンあたりいくら?' }, { t: 'think', sec: 6, label: '計算' },
      { t: 'answer', text: `${comma(max - min)}円`, say: `${comma(max)}円との差で、${comma(max - min)}円。` },
    );
    script.push({ t: 'explain', text: '比べるときは、全部を覚えず「今いちばん安いのはどれか」だけを更新しながら聞くと楽です。' });
    return { topic: '見積もり比較', q: names.map((nm, i) => `${nm} ${comma(prices[i])}円`).join(' / '), a: `最安 ${cheapest} ${comma(min)}円、差 ${comma(max - min)}円`, e: '', script };
  }

  DN.C.memoryMax = 6;
  DN.C.memory = (lv, sup) => {
    const g = pick(lv <= 1 ? [echo, echo, label] : [echo, label, label, compare]);
    return Object.assign(g(lv, sup), { cat: 'memory' });
  };

  // ---- 出発時に覚えて、到着前に思い出す ----
  DN.C.anchor = lv => {
    const n = lv <= 2 ? 2 : 3;
    const pairs = takeLabels(n);
    const intro = [
      { t: 'say', text: `最初に、今日の数字を${n}つ覚えてください。最後に聞きます。` },
      { t: 'gap', ms: 400 },
    ];
    pairs.forEach(([k, v]) => intro.push({ t: 'say', text: `${k}、${v}。`, slow: true }, { t: 'gap', ms: 500 }));
    intro.push({ t: 'say', text: 'もう一度。' });
    pairs.forEach(([k, v]) => intro.push({ t: 'say', text: `${k}、${v}。` }));
    intro.push({ t: 'say', text: '声に出して、一度言ってみましょう。' }, { t: 'think', sec: 4 + n * 3, label: '言ってみる' });

    const outro = [{ t: 'say', text: '最後の問題です。出発のときに覚えた数字を思い出してください。' }];
    pairs.forEach(([k, v]) => outro.push(
      { t: 'say', text: `${k}は?` }, { t: 'think', sec: 6, label: '思い出す' }, { t: 'answer', text: `${k}:${v}`, say: `${k}は、${v}。` },
    ));
    outro.push({ t: 'explain', text: '時間がたっても思い出せた数字は、組にして覚えられていた証拠です。' });
    return {
      intro, outro,
      item: { cat: 'memory', topic: '出発時の数字', q: '出発時に覚えた数字を、到着前に思い出す', a: pairs.map(([k, v]) => `${k}:${v}`).join(' / '), e: '', script: outro },
    };
  };
})();
