# 作業ステータス（Claude Code / Codex 共有ボード）

複数の AI（**Claude Code** と **Codex**）が並行でこのリポジトリを触るための進捗共有ファイル。
**作業したら必ずここを更新する。** お互いが「どのブランチを・誰が・どこまで・次に何をするか」を
一目で分かるようにするのが目的。

- 更新ルール: 自分の担当ブランチの欄を、着手・進捗・完了のたびに書き換える
- 既存の未コミット変更を勝手に戻さない。作業前に `git status --short --branch` を確認する
- 仕様・実装の詳細は branch/doc 側へ寄せ、このファイルは共有ボードとして短く保つ
- 最終更新: 2026-09-01 / by Codex

---

## ブランチ運用

- 2026-07-07 時点で、通常作業用の `develop` ブランチを作成。安定版は `master`、作業入口は `develop` を基本にする。
- 現在の安定状態は `master` の `v0.7.0.4` / `develop` の `v0.7.1`。Chrome 拡張本体は `extension/`、Faster-Whisper の uv/Python サーバーは `uv/`。
- 現在の作業ブランチ: `develop`（`feature/remove-browser-whisper` はマージ後に削除済み）。
- 新しい作業を始める場合だけ、目的が明確な短命ブランチを切る。

### ブラウザ内Whisper廃止（v0.7.1・develop にマージ済み・GitHub Releaseあり・Chrome手動確認待ち）

- 役割: ブラウザ内Whisper（Transformers.js + Web Worker版、`whisper-worker.js` + `lib/`）をユーザー指示により廃止する。Faster-Whisper（`uv/`）と Groq は維持。
- 変更点:
  - `extension/whisper-worker.js`、`extension/lib/`（ONNX Runtime WASM 一式）、`extension/whisper-injected.js`、`extension/offscreen-whisper.js/html`（デッドコード）を削除。
  - `content-whisper.js` の Web Worker プール管理（`createWhisperSlot` 等）を削除し、`transcribeViaBackground()` を Groq → Faster-Whisper のみに簡略化。両方未設定・失敗時は字幕にエラー表示するだけで、**自動フォールバック先はもうない**（ユーザー指示）。
  - `content.js` / `content-panel.js`（フッターSTT切替 `Faster→Groq`）/ `options.js` / `options.html`（モデルDL UI・ビーム数・並列ワーカー数を削除）/ `manifest.json`（`web_accessible_resources` 全削除、huggingface/jsdelivr host_permissions 削除）/ `background.js`（`warmup_whisper` デッドハンドラ削除）/ `scripts/build-release.ps1`（削除ファイルを一覧から除去）を整合。
  - README 3言語・`help.html`・`AGENTS.md`・`CLAUDE.md` からブラウザ内Whisperの記述を除去し、STT は Faster-Whisper/Groq の2択である旨に更新。
  - `feature/remove-browser-whisper` を `develop` へ fast-forward マージ、ブランチは削除済み。version は当初 `0.7.0.5` としたが、ユーザー指示により `0.7.1`（3桁）に修正。
  - GitHub Release [`v0.7.1`](https://github.com/KAWAchan-jp/twitch-chat-translate-ext/releases/tag/v0.7.1) を作成し、拡張本体 ZIP と `faster-whisper-server.zip` を添付済み（`develop` からのリリース。`master` へは未マージ）。
- 構文チェック（`node --check` 全JS・manifest.json JSON検証）は通過。**Chrome実機での動作確認は未実施**（次の作業者へ: 下記「検証」参照）。

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

### develop — 担当: **共有**

- 役割: 通常作業の入口・統合用ブランチ。
- 現状: `master` の `v0.7.0.2` 先端から作成済み。新しい修正や検証作業は基本的にここから始める。

### fix/hint-bar-placement — **develop にマージ済み（Chrome手動確認待ち）**

- 役割: 展開時の認識ヒント欄をヘッダー直下へ戻し、折りたたみ時のみ入力欄直上に置く。
- ブランチメモ: `docs/fix-hint-bar-placement.md`
- 現状: `hintBar` を複製せず、展開・折りたたみの状態遷移でDOM位置を切り替える実装を追加。`node --check`、manifest JSON 検証、今回の対象差分チェックは通過。Chrome手動確認が残っている。v0.7.0.4 としてコミットし、develop へマージ済み。

### master — 担当: **共有**

- 役割: 本番リリース用ブランチ。
- 現状: v0.7.0.4 まで反映済み（折りたたみ時の認識ヒント欄表示修正を含む）。リポジトリ整理として拡張本体は `extension/`、uv サーバーは `uv/` に移動済み。ブラウザ内Whisper廃止（v0.7.1）は `develop` へマージ・GitHub Release済みだが `master` へは未マージ。
- 注意:
  - `extension/manifest.json` の version は現在 `0.7.0.4`（`master`）。
  - 実装変更を行ったら、原則として `extension/manifest.json` の version を4桁目だけインクリメントする。上位桁の変更は明示的な指示があった場合のみ。
  - README は `README.md` / `README.en.md` / `README.ru.md` がある。ユーザー向け仕様を変える場合は多言語側の更新漏れに注意する。

---

## 共有ルール

- `AGENTS.md` は Codex 向けの作業入口。初回作業時に読む。
- `CLAUDE.md` は Claude Code 向けの作業入口。Claude Code 側の運用変更があればそちらも更新する。
- Chrome に手動読み込みする場合は、リポジトリルートではなく `extension/` を選ぶ。
- content script は `extension/manifest.json` のロード順で同一スコープを共有する。重複宣言やロード順変更に注意する。
- パネル UI は Shadow DOM 内にある。`shadowRoot.getElementById()` を使い、Twitch 側 DOM と混同しない。
- STT まわりは `extension/content-whisper.js`、`extension/background.js`、`extension/options.*`、`extension/manifest.json`、`uv/` が絡む（ブラウザ内Whisperは v0.7.1 で廃止済み）。変更時はフッター表示まで確認する。
- Groq の chunk 転送実装は、大きな音声 Blob を background service worker へ送る時の参考実装として扱う。

---

## 申し送り（時系列・新しい順）

- **2026-09-01 Codex**: 接続エラーの診断詳細を追加。`content-chat.js` で WebSocket の `error` をConsoleへ記録し、`close` の code / reason（未提供時は代表的なコードの説明）をパネルへ表示するようにした。IRC `NOTICE` もパネルとConsoleへ出すため、認証・JOIN拒否などのTwitch側メッセージを確認できる。認証トークンはログ・画面へ出力しない。実機で `Login authentication failed` を確認したため、同通知を受けた場合は保存済み認証を解除して匿名閲覧へ自動切替するよう追加し、無効トークンでの再接続ループを防止した。チャット送信を再開するにはログインし直す。ユーザー指定により `extension/manifest.json` は3桁の `0.7.2` へ更新。拡張ZIPを生成し、GitHub Release `v0.7.2`（`develop` の `2c31fc5`）として公開済み。Chrome実機で自動切替後の接続成功は未確認。構文検証コマンドは実行環境のプロセス起動エラー（Windows error 1920）で実行できなかったため、Chromeリロード時にも確認すること。
- **2026-07-24 Claude Code**: ユーザー指示「ローカルWhisperは効率が悪いのでやめようと思う」を受け、`feature/remove-browser-whisper`（`develop` から分岐）でブラウザ内Whisper（Transformers.js + Web Worker版）を廃止。Faster-Whisper（`uv/`）と Groq は維持。確認の上、削除範囲は「ブラウザ内Whisperのみ」、フォールバック挙動は「未設定/失敗時は字幕にエラー表示のみ（自動フォールバックなし）」とユーザーが選択。`whisper-worker.js`・`lib/`（ONNX Runtime WASM）・`whisper-injected.js`・`offscreen-whisper.*`（デッド）を削除し、`content-whisper.js`/`content.js`/`content-panel.js`/`options.*`/`manifest.json`/`background.js`/`build-release.ps1` を整合。README 3言語・`help.html`・`AGENTS.md`・`CLAUDE.md` も更新。version は当初 `0.7.0.5` としたが、ユーザー指示で3桁の `0.7.1` に修正。`develop` へマージし、GitHub Release `v0.7.1` を作成（拡張ZIP・`faster-whisper-server.zip` 添付）。`node --check` 全JS・manifest JSON検証は通過。**次の作業者へ**: Chrome実機での動作確認（①Faster-Whisper有効時に🎤で認識・フッター表示、②Groq/Faster両方無効時に「エンジン未設定」エラー字幕、③オプションページの音声認識タブが崩れずモデルDL UIなしで表示、④TTS・クリップ字幕がFaster/Groq出力で従来通り動作）が未実施。
- **2026-07-17 Codex**: `fix/hint-bar-placement`（v0.7.0.4）を `develop` へ fast-forward マージ。Chromeで、展開時はヘッダー直下・折りたたみ時は入力欄直上となることを手動確認する。
- **2026-07-17 Codex**: `fix/hint-bar-placement` で認識ヒント欄の位置を状態別に修正。展開時はヘッダー直下、折りたたみ時は入力欄直上とし、同一の `hintBar` 要素を移動するため入力値・イベント・`whisper_prompt` 保存を維持する。`node --check`、manifest JSON 検証、対象差分チェックは通過。Chrome手動確認は未実施。version は v0.7.0.4。
- **2026-07-10 Codex**: Faster-Whisper のモデルキャッシュ上限を `uv/server.py` の `lru_cache(maxsize=1)` に変更（v0.7.0.3）。モデル切り替え時に複数モデルを GPU メモリへ保持し続ける可能性を抑える。構文チェック済み。未確認事項は実 GPU でのメモリ推移と実ブラウザの音声認識。
- **2026-07-10 Codex**: Faster-Whisper / CTranslate2 の GPU 使用量制限可否を調査。現行 `uv/server.py` は `FASTER_WHISPER_DEVICE` / `FASTER_WHISPER_COMPUTE_TYPE` / `FASTER_WHISPER_MODEL` / `FASTER_WHISPER_PRELOAD` のみで、VRAM 上限を直接指定する設定はない。負荷軽減は `compute_type=int8`、小さいモデル、CPU固定、起動時プリロード無効化、将来的には `device_index` / `cpu_threads` / `num_workers` 等の明示化で行うのが現実的。
- **2026-07-07 Codex**: `問題点.md` を読み、ローカルSTT依存・言語コード・翻訳エラー・Whisper Worker・弾幕モード・APIキー/認証情報・グローバル構成をコード調査。大半は既存対策あり。残る主な改善候補は、翻訳フォールバック失敗時のユーザー向け詳細表示、Faster-Whisper の手動確認/導線、弾幕モード状態の視覚表示、APIキー保存方式の注意書き。
- **2026-07-07 Codex**: `master` の `v0.7.0.2` 先端から `develop` ブランチを作成し、現在ブランチを `develop` に切り替えた。
- **2026-07-07 Codex**: `fix/collapsed-hint-bar` を `master` に fast-forward マージ済み。折りたたみ時の💡ヒント欄表示修正は `v0.7.0.2` として `master` に入っている。
- **2026-07-06 Codex**: `fix/collapsed-hint-bar` を作成。パネル折りたたみ中に💡ボタンを押しても認識ヒント欄が表示されない問題を修正中。原因は collapsed CSS が `.hint-bar` を常に `display:none` にしていたこと。ヒント欄はヘッダー直下ではなく、メッセージ一覧の下・チャット入力欄の上へ配置し、入力欄とフッターが下に逃げるようにした。version は `0.7.0.2`。
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
