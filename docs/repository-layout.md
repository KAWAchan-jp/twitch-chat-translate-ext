# リポジトリ構成メモ

最終更新: 2026-07-06 / by Codex

## 2026-07-06 の整理

Chrome 拡張として読み込む本体一式を `extension/` に移動し、Faster-Whisper の uv/Python サーバーを `uv/` に移動した。

## 現在の配置

| パス | 役割 |
|---|---|
| `extension/` | Chrome が直接読み込む Manifest V3 拡張本体。`manifest.json`、content scripts、Service Worker、オプションページ、`lib/`、`icons/` を含む。 |
| `uv/` | Faster-Whisper ローカル STT サーバー。`server.py`、`requirements.txt`、`README.md` を含む。 |
| `scripts/` | リリース ZIP 作成スクリプト。拡張 ZIP は `extension/manifest.json` の version を使い、ZIP 内ルートに `manifest.json` を置く。 |
| `docs/` | 共有ボード、作業メモ、ドキュメント用画像。 |
| `README*.md` | ユーザー向け説明。インストール時は `extension/` を読み込む。 |
| `AGENTS.md` / `CLAUDE.md` | AI 作業者向け入口。新しい配置を前提に更新済み。 |

## 作業時の注意

- Chrome の「Load unpacked / パッケージ化されていない拡張機能を読み込む」ではリポジトリルートではなく `extension/` を選ぶ。
- 拡張側を変更したら `extension/manifest.json` の `version` を4桁目だけインクリメントする。
- `uv/` は拡張とは別配布の Python ツールなので、拡張 ZIP には含めない。
- 旧配置の `tools/faster-whisper-server/` は使わない。
