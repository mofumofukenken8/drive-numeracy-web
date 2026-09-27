# 通勤数感ドリル(Web版)

通勤の車で、音声だけで「聞いた数字を頭に留める力」と「数字で考える力」を鍛えるWebアプリ。
読み上げは Gemini 3.8 Flash TTS。出発前に1回分(10〜30分)を作ってiPhoneに保存し、車では1本の音声として再生する。

## 使い方
1. iPhoneのSafariで公開URLを開き、共有 →「ホーム画面に追加」
2. 「設定」で Gemini の APIキーを入れる(キーはこの端末の中だけに保存)
3. Wi-Fiにつないだ状態で「今日の1回分を作る」(2〜5分)
4. 車では「再生」。画面を消しても流れ、ロック画面・CarPlay・ハンドルの曲送り/曲戻しで問題を移動できる
5. 到着後、見直しで ○× をつけると、次に作る回のレベルと復習に反映される

## APIキーの安全のために
Google Cloud コンソール →「APIとサービス」→「認証情報」で、このキーに次の制限をかけておく。
- アプリケーションの制限: ウェブサイト → `https://<GitHubのユーザー名>.github.io/*`
- APIの制限: Generative Language API のみ

## 仕組み
- サーバーなし。ブラウザから Gemini API(Interactions API)を直接呼ぶ
- 読み上げ部品は IndexedDB に保存して使い回す(同じ文なら料金がかからない)
- 1回分を MP3(24kHz・48kbps)にまとめ、問題ごとの位置をチャプターとして持つ
- 設定・レベル・復習リストは localStorage

| ファイル | 役割 |
|---|---|
| `js/content-*.js` | 問題の生成(暗算・仕事の数字・考える・数字キープ・会話) |
| `js/compose.js` | 1回分の問題選び、台本 → Gemini への依頼 → 1本の音声 |
| `js/gemini.js` | Gemini TTS の呼び出し |
| `js/audio.js` | WAV の読み書き、無音・合図音 |
| `js/player.js` | 再生とチャプター、ロック画面の操作 |
| `js/store.js` | 保存(localStorage / IndexedDB) |
| `js/main.js` | 画面の操作 |

## 手元で確認
```
python -m http.server 8000
```
`http://localhost:8000/?mock=1` を開くと、Gemini を呼ばずにダミー音声で全体の流れを試せる。

## legacy-artifact/
端末の声(Web Speech)で動く、以前のClaudeページ版のHTMLと進行用スクリプト(記録用)。
共通の問題生成(`js/core.js`・`js/content-*.js`)はルートのものと同じ。公開中の最新版は Claude のページ側にある。
