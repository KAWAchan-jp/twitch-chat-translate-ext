# Twitch Chat Translator

Twitchのチャットをリアルタイム翻訳して、ページ内のフローティングパネルに表示するChrome拡張です。  
ローカル動作の音声認識（Whisper）による字幕機能も搭載しています。

![version](https://img.shields.io/badge/version-0.3.4-9147ff)
![manifest](https://img.shields.io/badge/manifest-v3-blue)

---

## 機能

### チャット翻訳
- **リアルタイム翻訳** — チャットが流れるたびに自動翻訳（Google Translate）
- **フローティングパネル** — ページ右下に常駐。ヘッダーのドラッグで移動、右下のツマミでリサイズ可能
- **言語インジケーター** — ヘッダーに `EN→JA` のような翻訳方向を常時表示
- **チャンネル自動検出** — URL からチャンネルを自動取得。SPA ナビゲーションにも対応
- **チャンネル別言語設定** — チャンネルごとに翻訳元・翻訳先を記憶して自動切り替え
- **翻訳して送信** — Twitch ログイン後、パネルの入力欄から翻訳済みメッセージを送信

### 音声字幕（ローカル Whisper）
- **API キー不要** — OpenAI Whisper Tiny を拡張機能内でローカル実行（@xenova/transformers v2）
- **タブ共有バナーなし** — Web Audio API で `<video>` 要素から直接音声を取得
- **VAD（無音検出）** — 発話終了後 500ms で即座に処理開始（低遅延）
- **字幕ウィンドウ** — 画面上にオーバーレイ表示。ドラッグで位置調整、次回起動時も維持

---

## インストール

1. このリポジトリを ZIP でダウンロード、または `git clone`
2. Chrome で `chrome://extensions/` を開く
3. 右上の **デベロッパーモード** を ON にする
4. **「パッケージ化されていない拡張機能を読み込む」** → ダウンロードしたフォルダを選択
5. Chrome ツールバー右端の **パズルアイコン（🧩）** をクリック → 一覧から **Twitch Chat Translator** の📌をクリックしてピン留め

> **初回の音声字幕利用時**、Whisper モデル（約 38MB）を Hugging Face から自動ダウンロードします。  
> ダウンロード後は IndexedDB にキャッシュされるため、2回目以降は即座に起動します。

---

## 使い方

### チャット翻訳

| 操作 | 動作 |
|------|------|
| アイコンをクリック | パネルの表示 / 非表示を切り替え |
| アイコンを右クリック | 翻訳元・翻訳先言語の変更、表示設定 |
| パネルのヘッダーをドラッグ | パネルを移動 |
| パネル右下のツマミをドラッグ | パネルをリサイズ |

チャンネルごとに言語設定が保存されます。別チャンネルに移動すると自動で切り替わります。

### チャット送信

1. アイコンを右クリック → 翻訳元言語を（自動検出以外に）設定
2. パネルの認証バーにある **「Twitchでログイン」** をクリック
3. ログイン後、パネル下部の入力欄に翻訳先言語で入力して送信
4. 入力テキストが翻訳元言語に翻訳されてチャンネルに投稿されます

### 音声字幕

1. パネルヘッダーの **🎤 ボタン** をクリック
2. 初回はモデルをダウンロード（`DL中: ...` と表示）
3. ダウンロード完了後、ストリームの音声を自動認識して字幕表示
4. 字幕ウィンドウはドラッグで好きな位置に移動できます

> 認識言語はチャンネルの翻訳元言語設定に従います。`自動検出` の場合は Whisper が自動判定します。

---

## ファイル構成

```
twitch-chat-translate-ext/
├── manifest.json           # 拡張の設定（Manifest V3）
├── background.js           # Service Worker（翻訳APIプロキシ、OAuth、設定管理）
├── content.js              # コンテンツスクリプト（パネル、IRC、音声録音、VAD）
├── whisper-injected.js     # Twitch MAIN world で動作する Whisper 推論スクリプト
├── auth-callback.js        # OAuth コールバック用コンテンツスクリプト
├── options.html / options.js
├── lib/
│   ├── transformers.min.js # @xenova/transformers v2 バンドル（Whisper 推論エンジン）
│   ├── ort-wasm-simd.wasm  # ONNX Runtime WASM（SIMD 対応）
│   └── ort-wasm.wasm       # ONNX Runtime WASM（フォールバック）
└── icons/
```

---

## 技術的な詳細

### 翻訳

`translate.googleapis.com` への直接 fetch は CORS で弾かれるため、  
content.js → background.js（Service Worker）経由でリクエストしています。

### チャット受信・送信

Twitch IRC over WebSocket（`wss://irc-ws.chat.twitch.tv:443`）に直接接続します。

- 未ログイン時：`justinfan` の匿名ユーザーで読み取り専用接続
- ログイン時：OAuth トークンで認証し、`PRIVMSG` コマンドで送信

DOM 操作でチャット入力欄に書き込む方式は React の仕組みと競合するため採用していません。

### 音声字幕

**キャプチャ：**  
`getDisplayMedia()`（タブ共有、バナーが出る）の代わりに Web Audio API を使用。  
`AudioContext.createMediaElementSource(<video>)` で Twitch の `<video>` 要素から直接音声をタップします。  
タブ共有ダイアログもバナーも表示されません。

**推論：**  
[`@xenova/transformers`](https://github.com/xenova/transformers.js) v2 の `Xenova/whisper-tiny`（量子化 int8、約 38MB）を使用します。  
Manifest V3 の Service Worker では `import()` が禁止されているため、`<script type="module">` を Twitch ページの MAIN world に注入することで回避しています。  
WASM バイナリは拡張機能の `lib/` にバンドルされており、Twitch の CSP に依存せず読み込めます。

**VAD（Voice Activity Detection）：**  
`AnalyserNode` で音量レベルを 100ms ごとに監視し、発話後に 500ms の無音が続いた時点で即座に処理を開始します。  
従来の固定インターバル方式（3秒ごと）と比べ、短い発話でのレイテンシが大幅に改善されます。

### OAuth

Twitch の Implicit Grant フローを使用します。

1. 拡張が `id.twitch.tv/oauth2/authorize` を新しいタブで開く
2. 認証後、`kawachan-jp.github.io/twitch-chat-translate/` にリダイレクト
3. そのページに注入した `auth-callback.js` が URL フラグメントからトークンを取得し background.js に転送

### パネル

Shadow DOM でページの CSS から分離しています（`attachShadow({ mode: 'open' })`）。

---

## 設定のデフォルト値

| 設定 | デフォルト |
|------|-----------|
| 翻訳元言語 | 自動検出 |
| 翻訳先言語 | 日本語 |
| 原文を表示 | ON |
| 自動スクロール | ON |

---

## 機能要望・改善提案

Issue や Pull Request を歓迎します。  
「こんな機能があったら便利」という要望も気軽にどうぞ。
