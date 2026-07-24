# AGENTS.md

This file provides guidance to Codex when working with code in this repository.

## プロジェクト概要

Twitch チャットをリアルタイム翻訳して Twitch ページ上にフローティングパネルで表示する Chrome 拡張（Manifest V3）。チャット翻訳は APIキーなしで Google Translate により動作し、任意で DeepL / Gemini を使う。音声字幕（STT）は Faster-Whisper（ローカルサーバー）または Groq（クラウドAPI）のいずれかの設定が必要。

## Codex 作業ルール

- 作業前に必ず `docs/WORK-STATUS.md` を確認し、現在の担当・注意点・申し送りを把握する。
- 作業後に必ず `docs/WORK-STATUS.md` を更新し、変更内容・確認結果・次の作業者への申し送りを残す。
- 既存の未コミット変更を勝手に戻さない。作業前に `git status --short --branch` を確認し、無関係な差分は触らない。
- ビルドツールはない。通常はファイルを直接編集し、Chrome の拡張リロードで確認する。
- 変更は小さく保ち、既存のグローバルスクリプト構成と命名に合わせる。バンドルや新しいフレームワークは追加しない。
- UI 文言は基本的に日本語。README は `README.md` / `README.en.md` / `README.ru.md` があるため、ユーザー向け仕様変更では必要に応じて多言語側も更新する。
- 修正を行ったら `extension/manifest.json` の `"version"` を上げ、最終報告で伝える。バージョンは4桁目だけをインクリメントする。
- コミットを求められた場合のコミットメッセージは日本語: `fix: 説明 v0.6.30`。

## ビルド・デバッグ手順

ビルドコマンドなし。拡張を読み込んでいる Chrome 側で確認する。

- 拡張読み込み: `chrome://extensions/` → 「パッケージ化されていない拡張機能を読み込む」→ `extension/`
- 拡張リロード: `chrome://extensions/` → 「Twitch Chat Translator」の更新ボタン
- `background.js` のログ: 拡張カード上の「Service Worker」リンク → DevTools
- content script のログ: Twitch ページで F12 → Console（`[TCT]` プレフィックスで検索）
- Shadow DOM の検証: Elements タブ → `#twitch-chat-translator-container` の `#shadow-root`
- オプションページ確認: 拡張アイコン右クリック → 「オプション」

## ファイル構成と役割

| ファイル | 役割 |
|---|---|
| `extension/manifest.json` | Manifest V3。content script のロード順は `content-panel.js → content-chat.js → content-whisper.js → content.js` |
| `extension/background.js` | Service Worker。翻訳API・Twitch API・Groq API・Faster-Whisper の CORS プロキシ、コンテキストメニュー管理、OAuth 処理 |
| `extension/content.js` | エントリポイント兼グローバル状態管理。`settings`、WebSocket 接続、チャンネル検出、`chrome.storage.onChanged` ハンドラを持つ |
| `extension/content-panel.js` | Shadow DOM パネルの HTML/CSS 定義と UI 関数群 |
| `extension/content-chat.js` | IRC パース、チャット表示、翻訳キュー、弾幕モード、チャット送信 |
| `extension/content-whisper.js` | 音声録音・VAD・字幕表示・TTS、Faster-Whisper/Groq への音声送信 |
| `extension/options.js` / `extension/options.html` / `extension/options.css` | オプションページ。APIキー、VAD、字幕、録画設定など |
| `extension/offscreen.js/html` | 補助的な実行経路。触る前に現行呼び出し有無を確認する |
| `extension/auth-callback.js` | OAuth コールバックページ用（`kawachan-jp.github.io` に挿入） |
| `uv/` | Faster-Whisper ローカル STT サーバー。`uv run ... server.py` で起動する Python 側 |

## アーキテクチャ上の重要点

### グローバル状態は content.js が持つ

`settings` / `isAuthenticated` / `twitchToken` / `currentChannel` などは `extension/content.js` のトップレベルに定義され、他の content script から直接参照される。バンドル不使用なので、`extension/manifest.json` のロード順が依存関係になる。

### パネルは Shadow DOM

`container` は `document.body` に追加された Custom Element の Shadow DOM の中にある。Shadow DOM 内の要素は `shadowRoot.getElementById()` でアクセスする。ドラッグ座標系は `container.getBoundingClientRect()` 基準で、`e.clientX` / `e.clientY` を使う。

### 言語設定の優先順位

チャンネル固有設定 (`channel_settings[channel]`) > グローバル設定 (`src_lang` / `tgt_lang`)。`loadChannelSettings()` で読み込み、`onSettingsChanged()` でリアルタイム反映する。

### UI 更新の連動パターン

言語やエンジン設定が変わる変更では、必要に応じて以下を連動させる。

- `updateLangIndicator()` — ヘッダーの `EN→JA・Google` 表示
- `updateInputPlaceholder()` — 入力欄のプレースホルダーと disabled 状態
- `updateFooter()` — フッターのチャット入力・音声翻訳・STT エンジン表示

### 翻訳エンジンの優先順位

`background.js` の `translateText()` は Gemini（設定時） → DeepL（設定時） → Google Translate（常時フォールバック）。`feature` 引数（`'chat'` / `'voice'` / `'own'`）でエンジンごとの on/off を個別制御する。

### STT エンジンの考え方

- STT エンジンは Groq（クラウドAPI） → Faster-Whisper（ローカルサーバー）の優先順位。両方未設定・失敗時は字幕にエラー表示するのみで、自動フォールバック先はない（`transcribeViaBackground()` 参照）。
- Groq / Faster-Whisper とも `content-whisper.js` → `background.js` の chunk 転送 → 外部API/ローカルサーバー、という同じ経路を使う。
- ブラウザ拡張内で Python は直接動かせない。Faster-Whisper などネイティブ実行が必要な STT は、`localhost` のローカルサーバーへ音声 Blob を送る設計にする。
- Whisper の言語コードは ISO 639-1 のみ。`zh-CN` / `zh-TW` は `zh` に正規化する。

### 弾幕モード

3秒間の流速が 3msg/秒超で ON。ON 時は翻訳をスキップして原文表示し、スクロール停止またはホバー時に可視範囲のみ翻訳する。

## よく触れる関数

| 関数 | ファイル | 説明 |
|---|---|---|
| `updateInputPlaceholder()` | `extension/content-panel.js` | 入力欄プレースホルダー更新 |
| `updateLangIndicator()` | `extension/content-panel.js` | ヘッダー言語表示更新 |
| `updateFooter()` | `extension/content-panel.js` | フッターのエンジン表示更新 |
| `addChatMessage()` | `extension/content-chat.js` | チャットメッセージ追加・翻訳 |
| `translateViaBackground()` | `extension/content-chat.js` | background.js 経由の翻訳（リトライ付き） |
| `sendUserMessage()` | `extension/content-chat.js` | チャット送信（翻訳して IRC に送出） |
| `loadChannelSettings()` | `extension/content.js` | チャンネル固有言語設定の読み込み |
| `onSettingsChanged()` | `extension/content.js` | storage 変化の一括ハンドラ |
| `updateTwitchAutoPrompt()` | `extension/content.js` | 配信言語自動検出・Whisper プロンプト更新 |
| `transcribeViaBackground()` | `extension/content-whisper.js` | STT エンジン選択と音声認識実行 |
| `translateText()` | `extension/background.js` | 翻訳エンジン選択ロジック |

## 実装時の注意

- content script 間で関数・変数を共有しているため、`const` / `let` の重複宣言に注意する。
- `extension/manifest.json` の content script ロード順を変える場合は、依存しているグローバル参照を確認する。
- Chrome extension の CSP と host permissions に注意する。外部 API や localhost を追加する変更では `extension/manifest.json` の `host_permissions` も確認する。
- 音声 Blob は大きくなるため、background service worker へ送る場合は既存の Groq/Faster-Whisper chunk 転送方式を参考にする。
- ユーザー向け設定を追加したら `chrome.storage.local` の読み書き、`settings` への読み込み、`chrome.storage.onChanged` 反映、フッター表示の整合性を確認する。

## 確認観点

- Chrome 拡張をリロードしてエラーが出ないこと。
- Twitch ページの Console に `[TCT]` エラーが出ないこと。
- オプションページで追加・変更した設定が保存され、ページ再読み込み後も復元されること。
- チャット翻訳、音声字幕、フッター表示がそれぞれ想定エンジンを示すこと。
- STT 変更では Groq / Faster-Whisper それぞれの失敗時のエラー表示（未設定時含む）を確認すること。
