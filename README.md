# Twitch Chat Translator

Twitchのチャットをリアルタイム翻訳して、ページ内のフローティングパネルに表示するChrome拡張です。

![version](https://img.shields.io/badge/version-0.1.8-9147ff)
![manifest](https://img.shields.io/badge/manifest-v3-blue)

---

## 機能

- **リアルタイム翻訳** — チャットが流れるたびに自動翻訳（Google Translate）
- **フローティングパネル** — Twitchページ右下に常駐。ドラッグ移動・角のツマミでリサイズ可能
- **チャンネル自動検出** — URL から現在のチャンネルを自動取得。SPA ナビゲーションにも対応
- **チャンネル別言語設定** — チャンネルごとに翻訳元・翻訳先を記憶（自動で切り替わる）
- **翻訳して送信** — Twitch アカウントでログインするとパネルの入力欄から翻訳済みメッセージを送信可能
- **ON / OFF トグル** — アイコンをクリックでパネルの表示切り替え。バッジで状態を視覚化

---

## インストール

1. このリポジトリを ZIP でダウンロード、または `git clone`
2. Chrome で `chrome://extensions/` を開く
3. 右上の **デベロッパーモード** を ON にする
4. **「パッケージ化されていない拡張機能を読み込む」** → ダウンロードしたフォルダを選択

---

## 使い方

### 基本操作

| 操作 | 動作 |
|------|------|
| アイコンをクリック | パネルの表示 / 非表示を切り替え |
| アイコンを右クリック | 翻訳元・翻訳先言語の変更、表示設定 |
| パネルのヘッダーをドラッグ | パネルを移動 |
| パネル右下のツマミをドラッグ | パネルをリサイズ |

### チャンネル別言語設定

右クリックメニューで言語を変更すると、そのチャンネル専用の設定として保存されます。
別のチャンネルに移動すると、そのチャンネルの設定が自動でロードされます（設定がないチャンネルはグローバルデフォルトを使用）。

### チャット送信

1. アイコンを右クリック → 翻訳元言語を（自動検出以外に）設定
2. パネルの認証バーにある **「Twitchでログイン」** をクリック
3. ログイン後、パネル下部の入力欄に翻訳先言語で入力して送信
4. 入力テキストが翻訳元言語に翻訳されてチャンネルに投稿されます

---

## ファイル構成

```
twitch-chat-translate-ext/
├── manifest.json      # 拡張の設定（Manifest V3）
├── background.js      # Service Worker（設定管理、翻訳APIプロキシ、OAuth）
├── content.js         # コンテンツスクリプト（フローティングパネル、IRC WebSocket）
├── auth-callback.js   # OAuth コールバック用コンテンツスクリプト
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

---

## 技術的な詳細

### 翻訳

`translate.googleapis.com` への直接 fetch は CORS で弾かれるため、
content.js → background.js（Service Worker）経由でリクエストしています。
Service Worker が休止している場合のタイムアウト対策として、最大 2 回のリトライを実装しています。

### チャット受信・送信

Twitch IRC over WebSocket（`wss://irc-ws.chat.twitch.tv:443`）に直接接続します。

- 未ログイン時：`justinfan` の匿名ユーザーで読み取り専用接続
- ログイン時：OAuth トークンで認証し、`PRIVMSG` コマンドで送信

DOM 操作でチャット入力欄に書き込む方式は React の仕組みと競合するため採用していません。

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
