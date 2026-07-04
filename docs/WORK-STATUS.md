# 作業ステータス（Claude Code / Codex 共有ボード）

複数の AI（**Claude Code** と **Codex**）が並行でこのリポジトリを触るための進捗共有ファイル。
**作業したら必ずここを更新する。** お互いが「どのブランチを・誰が・どこまで・次に何をするか」を
一目で分かるようにするのが目的。

- 更新ルール: 自分の担当ブランチの欄を、着手・進捗・完了のたびに書き換える
- 既存の未コミット変更を勝手に戻さない。作業前に `git status --short --branch` を確認する
- 仕様・実装の詳細は branch/doc 側へ寄せ、このファイルは共有ボードとして短く保つ
- 最終更新: 2026-07-04 / by Codex

---

## ブランチ別ステータス

### master — 担当: **共有**

- 役割: 現在の作業ブランチ。Chrome 拡張本体の実装・ドキュメント更新を進めている。
- 現状: `origin/master` より 1 commit ahead。既存の未コミット変更が多数あるため、作業者は差分を確認してから触る。
- 注意:
  - `manifest.json` の version は現在 `0.6.29`。
  - 実装変更を行ったら、原則として `manifest.json` の version を4桁目だけインクリメントする。
  - README は `README.md` / `README.en.md` / `README.ru.md` がある。ユーザー向け仕様を変える場合は多言語側の更新漏れに注意する。
- 次の予定:
  - Faster-Whisper をローカル STT エンジンとして追加する設計・実装。
  - ブラウザ拡張内では Python を直接動かせないため、`localhost` のローカル STT サーバーへ音声 Blob を送る構成を検討する。
  - STT エンジン表示、設定 UI、失敗時フォールバック、`host_permissions` の整合性を確認する。

---

## 共有ルール

- `AGENTS.md` は Codex 向けの作業入口。初回作業時に読む。
- `CLAUDE.md` は Claude Code 向けの作業入口。Claude Code 側の運用変更があればそちらも更新する。
- content script は `manifest.json` のロード順で同一スコープを共有する。重複宣言やロード順変更に注意する。
- パネル UI は Shadow DOM 内にある。`shadowRoot.getElementById()` を使い、Twitch 側 DOM と混同しない。
- STT まわりは `content-whisper.js`、`whisper-worker.js`、`background.js`、`options.*`、`manifest.json` が絡む。変更時はフッター表示まで確認する。
- Groq の chunk 転送実装は、大きな音声 Blob を background service worker へ送る時の参考実装として扱う。

---

## 申し送り（時系列・新しい順）

- **2026-07-04 Codex**: 新ブランチ作業前の master チェックポイントとして、既存差分と共有ドキュメントをまとめてコミットした。次は `feature/faster-whisper-local` を作成して Faster-Whisper 追加作業を進める。
- **2026-07-04 Codex**: `docs/WORK-STATUS.md` を新規作成。Minecraft リポジトリの共有ボード運用を参考に、この拡張用の軽量な共有ボードとして整備した。
- **2026-07-04 Codex**: `AGENTS.md` / `CLAUDE.md` に、作業前は必ず `docs/WORK-STATUS.md` を確認し、作業後は必ず更新するルールを追加した。
- **2026-07-04 Codex**: `AGENTS.md` を新規作成。`CLAUDE.md` の内容を Codex 向けに移し、既存差分を戻さないこと、Chrome 拡張の確認手順、STT に Faster-Whisper を追加する場合は `localhost` サーバー経由にすることを明記した。
- **2026-07-04 Codex**: Faster-Whisper 追加の事前調査を開始。現行ローカル Whisper は Transformers.js + ONNX Runtime を Web Worker で動かす構成。Groq は background service worker 経由で API へ送る構成。
