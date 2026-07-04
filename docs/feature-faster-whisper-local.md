# feature/faster-whisper-local

Faster-Whisper をローカル STT エンジンとして追加するためのブランチ作業メモ。

> **完了・master にマージ済み（v0.7.0、2026-07-05）。** ブランチは削除済み。以下は経緯の記録として残す。

## 目的

現行のローカル Whisper（Transformers.js + ONNX Runtime）に加えて、ローカル PC 上で動く Faster-Whisper を選べるようにする。
Chrome 拡張内では Python / ネイティブ実行ができないため、拡張から `localhost` のローカル STT サーバーへ音声を送る構成にする。

## 方針

- STT エンジン候補に `Local` / `Groq` / `Faster-Whisper` を並べる。
- Faster-Whisper はローカル HTTP サーバー方式にする。
- 音声 Blob 送信は既存 Groq の chunk 転送実装を参考にしつつ、できるだけ単純な API にする。
- Faster-Whisper が失敗・未起動・タイムアウトした場合は既存ローカル Whisper へフォールバックする。
- ブラウザ拡張の `host_permissions` に `http://127.0.0.1/*` / `http://localhost/*` が必要か確認する。
- 既存の Transformers.js ローカル Whisper は壊さない。
- Faster-Whisper はモデル名ではなく実行エンジンとして扱い、モデルは `small` / `medium` / `large-v3` / `large-v3-turbo` から選ぶ。

## 触る可能性が高いファイル

| ファイル | 用途 |
|---|---|
| `content-whisper.js` | STT エンジン選択、Faster-Whisper 呼び出し、フォールバック |
| `background.js` | 必要なら localhost STT への CORS 回避・chunk 転送 |
| `content-panel.js` | フッター STT 表示・エンジン切替 |
| `options.html` / `options.js` / `options.css` | Faster-Whisper 有効化、URL、モデル名などの設定 |
| `manifest.json` | localhost の host permissions と version 更新 |
| `README*.md` / `help.html` | ユーザー向け説明 |
| `docs/WORK-STATUS.md` | 共有ボード更新 |

## 進捗

- 2026-07-04: `master` で共有ドキュメントをコミット後、`feature/faster-whisper-local` を作成。
- 2026-07-04: このブランチ用ドキュメントを作成。
- 2026-07-04: 拡張側に Faster-Whisper 設定・STT切替・background 経由の localhost 転送・失敗時フォールバックを追加。
- 2026-07-04: `tools/faster-whisper-server/` に FastAPI ベースの最小サーバー雛形を追加。
- 2026-07-04: `manifest.json` を `0.6.30` へ更新し、`http://127.0.0.1/*` / `http://localhost/*` を host permissions に追加。
- 2026-07-05: Claude Code が引き継ぎ。サーバーを uv 対応（PEP 723 + `uv run server.py` 起動）に変更。
- 2026-07-05: 起動時モデル事前ロードと CUDA ライブラリ欠如時の CPU 自動フォールバックを追加。
- 2026-07-05: 実サーバー検証を完了（v0.6.31）。詳細は下記「検証結果」。
- 2026-07-05: GPU 対応を追加（v0.6.32）。pip 版 NVIDIA ライブラリの DLL 自動検出により、CUDA Toolkit 不要で `uv run --with nvidia-cublas-cu12 --with "nvidia-cudnn-cu12>=9,<10" server.py` だけで GPU 推論可能。RTX 3070 実測で large-v3-turbo が7.5秒音声を約0.5〜1秒（CPU比約60倍）。拡張の30秒タイムアウト問題も解消。

## 確認済み（2026-07-04 Codex）

- `node --check` 全対象ファイル、`python3 -m py_compile`、`git diff --check`

## 検証結果（2026-07-05 Claude Code、実サーバー）

- `uv run server.py` で依存解決込みの起動を確認（uv 0.11.19 / Python 3.13）。
- `webm/opus` を **ffmpeg なしで直接デコードできることを確認**（PyAV が FFmpeg ライブラリを内蔵）。→ 未決事項①解消
- `large-v3-turbo` のダウンロード（mobiuslabsgmbh/faster-whisper-large-v3-turbo・約1.6GB）と認識成功を確認。→ 未決事項②解消
- Windows TTS で生成した英語テスト音声（7.5秒）を tiny / small / large-v3-turbo すべてで正しく認識。
- 性能実測（CPU int8）: `small` 約6秒、`large-v3-turbo` 約30秒（拡張の30秒タイムアウトに接触）。**CPU環境は small 推奨、large系は GPU 推奨**。
- GPU はあるが CUDA ライブラリが無い環境で `device=auto` が `cublas64_12.dll is not found` でクラッシュする問題を発見 → 無音1秒のウォームアップ推論で検出して CPU に自動フォールバックする実装を追加し、動作確認済み。

## 次にやること

1. 実ブラウザでオプション保存、フッター切替（Local → Faster → Groq）、未起動時フォールバックを確認する（要手動テスト）。

## 未決事項

- なし（README 3言語・help.html への追記は 2026-07-05 に完了。GPU 搭載前提の方針で記載）。

## 再開メモ

- 現在ブランチ: `feature/faster-whisper-local`
- まず `docs/WORK-STATUS.md` とこのファイルを読む。
- サーバー側の検証は完了。残りは実ブラウザでの拡張側UI確認（ユーザーの手動テスト待ち）。
