# Copilot Instructions

Twitch チャットリアルタイム翻訳 Chrome 拡張（Manifest V3）。ビルドツールなし。

## ファイル役割

- `background.js` — Service Worker。翻訳API/Twitch API の CORS プロキシ、OAuth、コンテキストメニュー
- `content.js` — エントリポイント。グローバル状態(`settings`, `ws`, `currentChannel` 等)、WebSocket、SPA ナビゲーション検知
- `content-panel.js` — Shadow DOM パネルの HTML/CSS/UI 関数（`updateInputPlaceholder`, `updateLangIndicator` 等）
- `content-chat.js` — IRC パース、チャット表示、翻訳キュー（3並列）、弾幕モード、チャット送信
- `content-whisper.js` — ローカル Whisper Web Worker（4スロット）、音声録音、字幕表示
- `options.js` — オプションページ（モデルDL・APIキー設定）

## 重要なルール

1. content スクリプトはバンドルなし。`manifest.json` のロード順（panel→chat→whisper→content）で同一スコープを共有する
2. パネルは Shadow DOM。ドラッグ座標は `container.getBoundingClientRect()` 基準、`e.clientX` を使う
3. 言語変更時は `updateLangIndicator()` と `updateInputPlaceholder()` を必ず両方呼ぶ
4. 翻訳エンジン優先順位: Gemini → DeepL → Google（`background.js` の `translateText()` で制御）
5. 言語設定はチャンネル固有（`channel_settings[ch]`）がグローバル（`src_lang`/`tgt_lang`）より優先
6. Whisper 言語コードは ISO 639-1 のみ（`zh-CN` → `zh` に正規化すること）
7. バージョンは `manifest.json` の 4桁目だけをインクリメント（`0.6.15` → `0.6.16`）
8. コミットメッセージは日本語
