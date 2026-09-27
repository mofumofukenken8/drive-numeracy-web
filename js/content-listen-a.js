// 会話の聞き取り(listen):共通の組み立てと、場面1〜4
// 場面の関数は { topic, intro, points, names:{A,B}, lines:[[who,text]], qa:[[問い,答え]], summary } を返す
(() => {
  const { pick, rint, shuffle, comma, man, yen, dec } = DN.U;
  DN.C.scenarios = DN.C.scenarios || [];

  function build(sc, lv, sup) {
    const script = [{ t: 'say', text: sc.intro }];
    if (sup >= 1 && sc.points) script.push({ t: 'say', text: `聞き取るポイントは、${sc.points}です。` });
    script.push({ t: 'gap', ms: 500 });
    const play = () => sc.lines.forEach(([who, text]) => script.push({ t: 'say', who, name: sc.names[who], text }, { t: 'gap', ms: 380 }));
    play();
    if (sup >= 2) { script.push({ t: 'gap', ms: 500 }, { t: 'say', text: 'もう一度、流します。' }, { t: 'gap', ms: 300 }); play(); }
    script.push({ t: 'gap', ms: 600 }, { t: 'say', text: '質問です。' });
    sc.qa.forEach(([q, a, sec]) => script.push({ t: 'say', text: q }, { t: 'think', sec: sec || 6, label: '思い出す' }, { t: 'answer', text: a, say: `${a}。` }));
    script.push(
      { t: 'say', text: '最後に、今の話を一言でまとめて、声に出してみましょう。' },
      { t: 'think', sec: 12, label: 'まとめる' },
      { t: 'explain', text: `まとめの例。${sc.summary}` },
    );
    return {
      cat: 'listen', topic: sc.topic,
      q: sc.lines.map(([who, text]) => `${sc.names[who]}「${DN.U.disp(text)}」`).join('\n'),
      a: sc.qa.map(([q, a]) => `${DN.U.disp(q)} → ${DN.U.disp(a)}`).join('\n'),
      e: `まとめの例:${DN.U.disp(sc.summary)}`,
      script,
    };
  }

  let bag = [];
  DN.C.listenMax = 4;
  DN.C.listen = (lv, sup) => {
    if (!bag.length) bag = shuffle(DN.C.scenarios);
    return build(bag.pop()(lv), lv, sup);
  };

  // ---- 1. 電話:回収の依頼 ----
  DN.C.scenarios.push(lv => {
    const d = rint(3, 26), d2 = d + 1, time = pick(['9時', '10時半', '13時', '14時半']);
    const item = pick(['廃プラスチック', '木くず', '金属くず']), bags = rint(4, 12);
    const drums = rint(2, 6), place = pick(['第2工場の北側の搬出口', '本社工場の裏の置き場']);
    const day = lv >= 3 ? d2 : d;
    const L = [
      ['B', 'お世話になっております。山田工業の山田です。回収をお願いしたくて、お電話しました。'],
      ['A', 'いつもありがとうございます。ご希望の日時はありますか。'],
      ['B', `${d}日の${time}でお願いできますか。`],
      ['A', lv <= 1 ? `${d}日の${time}ですね。品目と量を教えてください。` : '承知しました。品目と量を教えてください。'],
      ['B', `${item}が、フレコンバッグで${bags}袋です。`],
    ];
    if (lv >= 2) L.push(['B', `それと、廃油がドラム缶で${drums}本あります。`]);
    L.push(['A', `場所は、いつもの${place}でよろしいですか。`], ['B', 'はい、そこでお願いします。']);
    if (lv >= 3) L.push(['B', `あ、すみません。日にちですが、${d}日ではなく${d2}日でお願いします。時間は同じです。`]);
    L.push(['A', lv >= 4 ? '承知しました。では当日伺います。' : `承知しました。${day}日の${time}に伺います。`]);
    const qa = [['回収は、何日の何時?', `${day}日の${time}`], [`${item}の量は?`, `フレコンバッグ${bags}袋`]];
    if (lv >= 2) qa.push(['ほかに回収するものは?', `廃油、ドラム缶${drums}本`]);
    if (lv >= 3) qa.push(['回収場所は?', place]);
    return { topic: '電話 · 回収の依頼', intro: '電話の聞き取りです。取引先の工場から、回収の依頼です。', points: '日時、品目、量', names: { A: '自社', B: '山田工業' }, lines: L, qa,
      summary: `${day}日の${time}に、${place}で、${item}を${bags}袋${lv >= 2 ? `と廃油${drums}本` : ''}回収する。` };
  });

  // ---- 2. 会議:月次の報告 ----
  DN.C.scenarios.push(lv => {
    const t1 = rint(18, 32) * 50, diff = rint(2, 8) * 10, prev = t1 - diff;
    const S = rint(30, 60) * 100, fuel = rint(8, 15) * 10, fu = rint(3, 12);
    const [plan, due] = pick([['収集ルートを見直す案を作る', '来週の金曜'], ['燃費の悪い車両の入れ替えを検討する', '次の会議'], ['アイドリングを減らすルールを作る', '月末']]);
    const lastYear = t1 + pick([-60, -40, 40, 80]);
    const L = [
      ['A', 'では、今月の数字を報告してください。'],
      ['B', `今月の処理量は${comma(t1)}トンでした。先月は${comma(prev)}トンです。`],
      ['B', `売上は${man(S)}です。`],
    ];
    if (lv >= 3) L.push(['B', `ちなみに、去年の同じ月は${comma(lastYear)}トンでした。`]);
    if (lv >= 2) L.push(['B', `燃料費は${fuel}万円で、先月より${fu}万円増えています。`], ['A', '燃料費が気になるね。']);
    L.push(['A', `では、${plan}。${due}までにお願いします。`], ['B', '承知しました。']);
    const qa = [['今月の処理量は?', `${comma(t1)}トン`], ['先月から何トン増えた?', `${diff}トン`]];
    if (lv >= 2) qa.push(['燃料費は、先月よりいくら増えた?', `${fu}万円`]);
    if (lv >= 3) qa.push(['去年の同じ月と比べると、何トン違う?', `${Math.abs(t1 - lastYear)}トン${t1 > lastYear ? '多い' : '少ない'}`, 8]);
    qa.push(['決まったことと、期限は?', `${plan}。期限は${due}`]);
    return { topic: '会議 · 月次報告', intro: '会議の聞き取りです。所長と業務課長が、今月の数字を話しています。', points: '数字の増減と、決まったこと', names: { A: '所長', B: '業務課長' }, lines: L, qa,
      summary: `処理量は${comma(t1)}トンで先月より${diff}トン増。${lv >= 2 ? `燃料費が${fu}万円増えたので、` : ''}${plan}。期限は${due}。` };
  });

  // ---- 3. 同業者との会話:値上げと人手 ----
  DN.C.scenarios.push(lv => {
    const u = pick([12000, 15000, 18000, 20000]), up = pick([1000, 1500, 2000]), u2 = u + up;
    const clients = pick([40, 50, 60, 80]), lost = rint(2, 5);
    const hire = rint(3, 6), came = rint(1, hire - 1);
    const p0 = pick([900, 1000, 1100]), p = p0 + pick([200, 300, 400]);
    const L = [
      ['B', '最近どうですか。うちは4月から、処分単価を上げましたよ。'],
      ['A', 'どれくらい上げたんですか。'],
      ['B', `1トン${comma(u)}円だったのを、${comma(u2)}円にしました。`],
      ['A', 'お客さんは離れませんでしたか。'],
      ['B', `${clients}社のうち、離れたのは${lost}社だけでした。`],
    ];
    if (lv >= 2) L.push(['B', `それより、人が足りなくて。ドライバーを${hire}人募集して、来たのは${came}人です。`]);
    if (lv >= 3) L.push(['A', '車両も高くなりましたよね。'], ['B', `パッカー車が、前は${comma(p0)}万円くらいだったのが、今は${comma(p)}万円ですよ。`]);
    const qa = [['値上げの幅は、1トンあたりいくら?', `${comma(up)}円`], ['離れた取引先は、何社のうち何社?', `${clients}社のうち${lost}社`]];
    if (lv >= 2) qa.push(['ドライバーは、あと何人足りない?', `${hire - came}人`]);
    if (lv >= 3) qa.push(['値上げは、約何%?', `約${dec(up / u * 100, 1)}%`, 10], ['パッカー車は、いくら上がった?', `${comma(p - p0)}万円`]);
    return { topic: '同業者 · 値上げの話', intro: '同業者との会話です。協会の会合で、同業の会社の人と話しています。', points: '値上げの幅と、その影響', names: { A: '自社', B: '同業者' }, lines: L, qa,
      summary: `同業者は1トン${comma(up)}円の値上げをして、${clients}社中${lost}社が離れただけ。${lv >= 2 ? `ドライバーは${hire - came}人足りない。` : ''}` };
  });

  // ---- 4. 電話:新規の見積もり依頼 ----
  DN.C.scenarios.push(lv => {
    const t = pick([4, 5, 6, 8, 10]), w = pick([1, 2, 3]), cur = pick([22000, 25000, 28000]), u = cur - pick([2000, 3000]);
    const d = pick([1, 10, 15, 20]);
    const L = [
      ['B', 'はじめてお電話します。佐藤食品、総務の佐藤です。産業廃棄物の回収の見積もりをお願いしたいんです。'],
      ['A', 'ありがとうございます。どのようなものが、どれくらい出ますか。'],
      ['B', `工場から出る廃プラスチックが、月に${t}トンくらいです。`],
      ['A', '回収の回数は、どのくらいをご希望ですか。'],
      ['B', `週に${w}回でお願いしたいです。`],
    ];
    if (lv >= 2) L.push(['B', `今の業者さんは1トン${comma(cur)}円なんですが、できれば${comma(u)}円以下にしたくて。`]);
    if (lv >= 3) L.push(['B', `開始は、来月の${d}日からを考えています。見積もりは今週中にいただけますか。`]);
    L.push(['A', '承知しました。確認して、ご連絡します。']);
    const qa = [['月の量は?', `${t}トン`], ['回収は週に何回?', `週${w}回`]];
    if (lv >= 2) qa.push(['希望の単価は?', `1トン${comma(u)}円以下`]);
    if (lv >= 3) qa.push(['希望の単価で受けると、月の売上はいくら?', yen(u * t), 10], ['いつから始めたい?', `来月の${d}日`]);
    return { topic: '電話 · 見積もり依頼', intro: '電話の聞き取りです。新しいお客さまから、見積もりの依頼です。', points: '量、回数、希望の条件', names: { A: '自社', B: '佐藤食品' }, lines: L, qa,
      summary: `佐藤食品の廃プラ月${t}トンを週${w}回回収。${lv >= 2 ? `希望は1トン${comma(u)}円以下。` : ''}${lv >= 3 ? `来月${d}日開始で、見積もりは今週中。` : ''}` };
  });
})();
