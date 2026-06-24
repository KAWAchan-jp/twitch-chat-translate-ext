# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

Twitch チャットをリアルタイム翻訳して Twitch ページ上にフローティングパネルで表示する Chrome 拡張（Manifest V3）。APIキー・サーバー不要。

## ビルド・デバッグ手順

ビルドツールなし。ファイルを直接編集して `chrome://extensions/` でリロードするだけ。

- **拡張リロード**: `chrome://extensions/` → 「Twitch Chat Translator」の更新ボタン
- **background.js のログ**: 拡張カード上の「Service Worker」リンク → DevTools
- **content スクリプトのログ**: Twitch ページで F12 → Console（`[TCT]` プレフィックスで検索）
- **Shadow DOM の検証**: Elements タブ → `#twitch-chat-translator-container` の `#shadow-root`

## ファイル構成と役割

| ファイル | 役割 |
|---|---|
| `manifest.json` | Manifest V3。content_scripts のロード順は `content-panel.js → content-chat.js → content-whisper.js → content.js` |
| `background.js` | Service Worker。翻訳API・Twitch API の CORS プロキシ、コンテキストメニュー管理、OAuth 処理 |
| `content.js` | エントリポイント兼グローバル状態管理。`settings` オブジェクト・WebSocket 接続・チャンネル検出・`chrome.storage.onChanged` ハンドラを持つ |
| `content-panel.js` | Shadow DOM パネルの HTML/CSS 定義と UI 関数群（`createPanel`, `updateInputPlaceholder`, `updateLangIndicator`, `updateFooter` 等）|
| `content-chat.js` | IRC パース・チャット表示・翻訳キュー・弾幕モード・チャット送信 |
| `content-whisper.js` | ローカル Whisper（Web Worker x4スロット）・音声録音・字幕表示 |
| `options.js` | オプションページ（Whisper モデルDL・APIキー設定・クリップ設定等） |
| `auth-callback.js` | OAuth コールバックページ用（`kawachan-jp.github.io` に挿入） |

## アーキテクチャ上の重要な点

### グローバル状態は content.js が持つ
`settings` / `isAuthenticated` / `twitchToken` / `currentChannel` など全ての状態変数は `content.js` のトップレベルに定義されており、他の content スクリプトから直接参照される（バンドル不使用、`manifest.json` のロード順で同一スコープ共有）。

### パネルは Shadow DOM
`container` は `document.body` に追加された Custom Element の Shadow DOM の中にある。これにより Twitch の CSS との干渉を防いでいる。Shadow DOM 内の要素は `shadowRoot.getElementById()` でアクセスし、ドラッグ座標系は `container.getBoundingClientRect()` 基準（`e.clientX` を使う）。

### 言語設定の優先順位
チャンネル固有設定 (`channel_settings[channel]`) > グローバル設定 (`src_lang` / `tgt_lang`)。`loadChannelSettings()` で読み込み、`onSettingsChanged()` でリアルタイム反映。

### UI 更新の連動パターン
言語が変わったら必ず両方を呼ぶ:
- `updateLangIndicator()` — ヘッダーの `EN→JA・Google` 表示
- `updateInputPlaceholder()` — 入力欄のプレースホルダーと disabled 状態

### 翻訳エンジンの優先順位
`background.js` の `translateText()`: Gemini（設定時） → DeepL（設定時） → Google翻訳（常時フォールバック）。`feature` 引数（`'chat'` / `'voice'` / `'own'`）でエンジンごとの on/off を個別制御。

### 弾幕モード
3秒間の流速が 3msg/秒超で ON。ON 時は翻訳をスキップして原文表示し、スクロール停止またはホバー時に可視範囲のみ翻訳する。

### Whisper Web Worker
`content-whisper.js` が 4スロット（WebGPU 検出時は 1 に削減）のワーカープールを管理。`whisper-worker.js` は `@huggingface/transformers` を使用し、モデルは IndexedDB にキャッシュ。Whisper の言語コードは ISO 639-1 のみ（`zh-CN` → `zh` に正規化が必要）。

## よく触れる関数の場所

| 関数 | ファイル | 説明 |
|---|---|---|
| `updateInputPlaceholder()` | `content-panel.js:624` | 入力欄プレースホルダー更新 |
| `updateLangIndicator()` | `content-panel.js:699` | ヘッダー言語表示更新 |
| `updateFooter()` | `content-panel.js` | フッターのエンジン表示更新 |
| `addChatMessage()` | `content-chat.js:182` | チャットメッセージ追加・翻訳 |
| `translateViaBackground()` | `content-chat.js:312` | background.js 経由の翻訳（リトライ付き） |
| `sendUserMessage()` | `content-chat.js:286` | チャット送信（翻訳して IRC に送出） |
| `loadChannelSettings()` | `content.js:138` | チャンネル固有言語設定の読み込み |
| `onSettingsChanged()` | `content.js:273` | storage 変化の一括ハンドラ |
| `updateTwitchAutoPrompt()` | `content.js:177` | 配信言語自動検出・Whisperプロンプト更新 |
| `translateText()` | `background.js:295` | 翻訳エンジン選択ロジック |

## バージョン管理ルール

- バージョンは `manifest.json` の `"version"` フィールドのみ（4桁: `0.6.15`）
- **4桁目だけをインクリメント**（`0.6.15` → `0.6.16`）。上の桁は明示的な指示があるまで変えない
- 修正を行ったら必ずバージョンを上げてユーザーに伝える
- コミットメッセージは日本語: `fix: 説明 v0.6.16`
