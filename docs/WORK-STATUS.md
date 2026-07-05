# 作業ステータス（Claude Code / Codex 共有ボード）

複数の AI（**Claude Code** と **Codex**）が並行でこのリポジトリを触るための進捗共有ファイル。
**作業したら必ずここを更新する。** お互いが「どのブランチを・誰が・どこまで・次に何をするか」を
一目で分かるようにするのが目的。

- 更新ルール: 自分の担当ブランチの欄を、着手・進捗・完了のたびに書き換える
- 既存の未コミット変更を勝手に戻さない。作業前に `git status --short --branch` を確認する
- 仕様・実装の詳細は branch/doc 側へ寄せ、このファイルは共有ボードとして短く保つ
- 最終更新: 2026-07-06 / by Codex

---

## ブランチ運用

- 2026-07-06 時点で、古い feature / fix ブランチは整理し、いったん `master` 一本運用に戻す。
- 現在の安定状態は `master` の `v0.7.0.1`。Chrome 拡張本体は `extension/`、Faster-Whisper の uv/Python サーバーは `uv/`。
- 新しい作業を始める場合だけ、目的が明確な短命ブランチを切る。

### feature/faster-whisper-local — **完了・master にマージ済み（v0.7.0）**

- 役割: Faster-Whisper をローカル STT エンジンとして追加する。
- ブランチメモ: `docs/feature-faster-whisper-local.md`（経緯の詳細はこちらを参照）
- 成果（v0.6.30〜v0.7.0 で実装・検証完了）:
  - （Codex）拡張側の Faster-Whisper 設定、STT切替、background 経由の localhost 転送、失敗時フォールバックを実装。
  - （Claude Code）サーバーを uv 対応に変更し実サーバーで動作検証（webm/opus 直読み・large-v3-turbo 認識を確認）。
  - （Claude Code）GPU 対応を追加（CUDA Toolkit 不要、pip 版 NVIDIA ライブラリ自動検出）。RTX 3070 実測で large-v3-turbo ≈0.5〜1秒/7.5秒音声。
  - （Claude Code）「録音開始」から進まないバグ（video 要素差し替え・音量0）を修正。
  - （Claude Code）配布 ZIP を拡張本体と Faster-Whisper サーバーに分離。
  - （Claude Code）README 3言語・help.html にドキュメント整備。
- マージ後、このブランチは削除済み。以後の Faster-Whisper 関連作業は新しいブランチを切る。
- 残タスク: 実ブラウザでのオプション保存・フッター切替・未起動時フォールバックの手動確認（未実施）。

### master — 担当: **共有**

- 役割: 本番リリース用ブランチ。
- 現状: v0.7.0 リリース済み（Faster-Whisper ローカル STT・GPU対応を含む）。リポジトリ整理として拡張本体は `extension/`、uv サーバーは `uv/` に移動済み。
- 注意:
  - `extension/manifest.json` の version は現在 `0.7.0.1`。
  - 実装変更を行ったら、原則として `extension/manifest.json` の version を4桁目だけインクリメントする。上位桁の変更は明示的な指示があった場合のみ。
  - README は `README.md` / `README.en.md` / `README.ru.md` がある。ユーザー向け仕様を変える場合は多言語側の更新漏れに注意する。

---

## 共有ルール

- `AGENTS.md` は Codex 向けの作業入口。初回作業時に読む。
- `CLAUDE.md` は Claude Code 向けの作業入口。Claude Code 側の運用変更があればそちらも更新する。
- Chrome に手動読み込みする場合は、リポジトリルートではなく `extension/` を選ぶ。
- content script は `extension/manifest.json` のロード順で同一スコープを共有する。重複宣言やロード順変更に注意する。
- パネル UI は Shadow DOM 内にある。`shadowRoot.getElementById()` を使い、Twitch 側 DOM と混同しない。
- STT まわりは `extension/content-whisper.js`、`extension/whisper-worker.js`、`extension/background.js`、`extension/options.*`、`extension/manifest.json`、`uv/` が絡む。変更時はフッター表示まで確認する。
- Groq の chunk 転送実装は、大きな音声 Blob を background service worker へ送る時の参考実装として扱う。

---

## 申し送り（時系列・新しい順）

- **2026-07-06 Codex**: リポジトリ構成を整理。Chrome 拡張本体を `extension/` に移動し、Faster-Whisper の uv/Python サーバーを `uv/` に移動。`scripts/build-release.ps1` は `extension/manifest.json` を読みつつ ZIP 内ルートへ `manifest.json` を配置する形に更新、`scripts/build-faster-whisper-server-release.ps1` は `uv/` をパッケージ元に変更。README 3言語、`AGENTS.md`、`CLAUDE.md`、`docs/repository-layout.md` に新配置を記録。version は `0.7.0.1`。追加確認として Windows PowerShell で `twitch-chat-translator-v0.7.0.1.zip` と `faster-whisper-server.zip` の作成に成功。拡張 ZIP は `manifest.json` がルートにあり、`extension/` / `uv/` / Python サーバー files は混入していない。サーバー ZIP は `faster-whisper-server/server.py`、`requirements.txt`、`README.md` のみ。
- **2026-07-06 Codex**: ユーザー指示により、現在の `master` を良好な安定状態としてコミット後、古い feature / fix ブランチを整理して `master` 一本運用へ戻す方針にした。
- **2026-07-05 Claude Code**: `feature/faster-whisper-local` を `master` にマージし、**v0.7.0 としてリリース**（ユーザー指示）。Faster-Whisper ローカル STT（GPU対応・uv対応・CUDA Toolkit不要）が正式機能に。ブランチは削除済み。次に Faster-Whisper を触る場合は新しいブランチを切ること。残タスクは実ブラウザでの手動確認のみ（未実施）。
- **2026-07-05 Claude Code**: ドキュメント整備（v0.6.33・未コミット）。ローカル Whisper / Faster-Whisper は GPU 搭載前提とする方針（ユーザー指示）。README 3言語（日・英・露）に Faster-Whisper の機能説明・サーバー起動（uv + CUDA）・使い方を追記し、help.html に専用セクションを追加。フッター STT の説明も Local → Faster → Groq に統一。残タスクは実ブラウザでの手動テストのみ。
- **2026-07-05 Claude Code**: GPU 対応を追加（v0.6.32・未コミット）。CUDA Toolkit のシステムインストールは不要で、`uv run --with nvidia-cublas-cu12 --with "nvidia-cudnn-cu12>=9,<10" server.py` で GPU 推論できる（server.py が pip 版 NVIDIA DLL を自動検出）。RTX 3070 で large-v3-turbo ≈0.5〜1秒/7.5秒音声となり、拡張の30秒タイムアウト問題も解消。
- **2026-07-05 Claude Code**: Faster-Whisper 作業を引き継ぎ、実サーバー検証を完了（v0.6.31・未コミット）。サーバーは uv 対応にし `uv run server.py` で起動可能。webm/opus は ffmpeg なしで直読み可（PyAV 内蔵 FFmpeg）。CPU では small≈6秒/large-v3-turbo≈30秒（7.5秒音声）のため large 系は GPU 推奨。CUDA ライブラリ欠如環境では起動時ウォームアップで検出して CPU に自動フォールバックする。残タスクは実ブラウザでの拡張UI確認（手動テスト）と多言語README追記。
- **2026-07-04 Codex**: Faster-Whisper を「モデル」ではなく「STT実行エンジン」として実装。オプションでサーバーURLとモデルを設定し、フッターは Local / Faster / Groq を切り替える。未起動・エラー時は既存 Local Whisper へフォールバックする。構文チェックは通過、実ブラウザ/実サーバー検証は未実施。中断指示によりここでチェックポイント保存する。
- **2026-07-04 Codex**: `feature/faster-whisper-local` を作成し、ブランチ用ドキュメント `docs/feature-faster-whisper-local.md` を追加した。以後 Faster-Whisper 作業はこのブランチで進める。
- **2026-07-04 Codex**: 新ブランチ作業前の master チェックポイントとして、既存差分と共有ドキュメントをまとめてコミットした。次は `feature/faster-whisper-local` を作成して Faster-Whisper 追加作業を進める。
- **2026-07-04 Codex**: `docs/WORK-STATUS.md` を新規作成。Minecraft リポジトリの共有ボード運用を参考に、この拡張用の軽量な共有ボードとして整備した。
- **2026-07-04 Codex**: `AGENTS.md` / `CLAUDE.md` に、作業前は必ず `docs/WORK-STATUS.md` を確認し、作業後は必ず更新するルールを追加した。
- **2026-07-04 Codex**: `AGENTS.md` を新規作成。`CLAUDE.md` の内容を Codex 向けに移し、既存差分を戻さないこと、Chrome 拡張の確認手順、STT に Faster-Whisper を追加する場合は `localhost` サーバー経由にすることを明記した。
- **2026-07-04 Codex**: Faster-Whisper 追加の事前調査を開始。現行ローカル Whisper は Transformers.js + ONNX Runtime を Web Worker で動かす構成。Groq は background service worker 経由で API へ送る構成。
