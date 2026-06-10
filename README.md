# Twitch Chat Translator - Chrome拡張版

Twitchのチャット欄をリアルタイムで日本語翻訳して表示するChrome拡張です。

## Webアプリ版からの変更点

| 項目 | Webアプリ版 | Chrome拡張版 |
|---|---|---|
| 翻訳API呼び出し | popup直接fetch | background.js（Service Worker）経由 |
| 状態保存 | sessionStorage | chrome.storage.local |
| ウィンドウサイズ | 自由 | 520×600px固定 |
| Twitchログイン | ポップアップウィンドウ | 新しいタブで開く |

## インストール方法

1. このフォルダをダウンロード・解凍
2. `icons/` フォルダに icon16.png / icon48.png / icon128.png を用意（省略可）
3. Chromeで `chrome://extensions/` を開く
4. 右上の「デベロッパーモード」をON
5. 「パッケージ化されていない拡張機能を読み込む」→このフォルダを選択

## ファイル構成

```
twitch-chat-translate-ext/
├── manifest.json   # 拡張の設定
├── background.js   # Service Worker（翻訳APIのプロキシ）
├── popup.html      # ポップアップUI
├── popup.css       # スタイル
├── popup.js        # メインロジック
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## 技術的な注意点

### なぜbackground.js経由で翻訳するのか
Chrome拡張のpopupから `translate.googleapis.com` に直接fetchすると、
CORSポリシーで弾かれることがある。
background.js（Service Worker）はCORSの制限が異なるため、
翻訳リクエストはbackground.jsに中継させている。

### OAuth（Twitchログイン）について
- 送信機能を使う場合のみ必要
- ログイン状態は `chrome.storage.local` に保存（ブラウザを閉じても維持）
- `TWITCH_CLIENT_ID` と `TWITCH_REDIRECT_URI` は各自のTwitch Developer設定に合わせて変更すること

### アイコンについて
manifest.jsonでアイコンを指定しているが、iconsフォルダがなくてもインストール・動作はできる。
アイコンなしだとChrome拡張の一覧でデフォルトアイコンが表示される。

## 今後の改善候補

- [ ] Twitchページへのコンテンツスクリプト（チャット欄に直接翻訳を表示）
- [ ] 翻訳失敗時の自動リトライ
- [ ] チャットが多い時の翻訳間引き
- [ ] フォントサイズ等のカスタマイズ設定
- [ ] アイコン画像の用意
