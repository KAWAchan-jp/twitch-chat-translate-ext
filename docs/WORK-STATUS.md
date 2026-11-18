# 作業ステータス（Claude Code / Codex 共有ボード）

複数の AI（**Claude Code** と **Codex**）が並行でこのリポジトリを触るための進捗共有ファイル。
**作業したら必ずここを更新する。** お互いが「どのブランチを・誰が・どこまで・次に何をするか」を
一目で分かるようにするのが目的。

- 更新ルール: 自分の担当ブランチの欄を、着手・進捗・完了のたびに書き換える
- 既存の未コミット変更を勝手に戻さない。作業前に `git status --short --branch` を確認する
- 仕様・実装の詳細は branch/doc 側へ寄せ、このファイルは共有ボードとして短く保つ
- 最終更新: 2026-11-16 / by Command Code

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

- **2026-11-18 Command Code**: `develop` 上で **v0.8.3**。Gemini オプション整理＋フォールバック可視化＋ヘルプ画像修正。
  - **ヘルプ画像が出ない不具合**: `extension/help.html` が `docs/images/...` を参照していたが、拡張を `extension/` から読み込むとそのパスは存在しない（リリース ZIP だけルート配置で偶然一致していた）。画像を `extension/images/` に複製し、`help.html` の参照を `images/...` に変更。`build-release.ps1` に `images/*` を追加（README 用の `docs/images/*` はそのまま ZIP に同梱され、GitHub と ZIP 内の双方で表示が壊れない）。
  - ヘルプにパネル全体のスクリーンショット（`images/panel-overview.png`）を追加。元ファイルは `docs/images/スクリーンショット 2026-11-18 143614.png`。
  - 注意: 画像を追加・更新するときは **`docs/images/`（README用）と `extension/images/`（ヘルプ用）の両方**を更新する必要がある。片方だけだと表示が崩れる。

- **2026-11-18 Command Code**: `develop` 上で **v0.8.2.3**。フォールバックの可視化。
  - 発端: 「Gemini のキーを保存していないのに翻訳された」→ 仕様どおり Google へフォールバックしていたが、フッターはキー有無を見ずに「Gemini」と表示していたため実態と食い違っていた。
  - `background.js`: `translateText()` が `{ result, engine }` を返すように変更（実際に成功したエンジン名）。キャッシュにもこのオブジェクトを保存し、キャッシュヒット時もエンジン名が保たれる。`translate` メッセージ応答に `engine` を追加。
  - `content.js`: `settings.gemini_api_key` を読み込み対象に追加。`lastOwnEngine` を追加。storage 変更で `gemini_api_key` / `deepl_api_key` もフッター再描画のトリガーに。
  - `content-panel.js`: `getFeatureEngine()` が `gemini_api_key` の有無も判定。`updateFooter()` で想定と違うエンジンなら「Google（FB）」＋黄色（`.footer-engine.fallback`）で表示し、ツールチップに理由を出す。
  - `content-chat.js`: `noteTranslateEngine()` を追加。フォールバック検知時に1回だけパネル通知（解消したらフラグを戻す）。
  - 検証: `node --check` 全対象は通過。**Chrome 実機は未確認**（確認観点: ①Gemini 有効・キー未保存で送信→フッターが「Google（FB）」、②キー保存後は「Gemini」表示に戻り通知も再点火、③キャッシュヒット時も表示が正しい）。

- **2026-11-18 Command Code**: `develop` 上で **v0.8.2.2**。Gemini を `gemini-3.5-flash-lite` 固定に変更（v0.8.2.1 の2択選択を撤回）。
  - 理由: 無料枠が Flash-Lite は **1日500リクエスト**（Flash 系は 20）。短文チャット翻訳では品質差が体感しにくく、毎日使える枠を優先。
  - `options.html`: 「使用モデル」のラジオ選択を削除し、固定モデル名の表示に変更。無料枠の説明を追記。
  - `options.js`: `GEMINI_MODEL = 'gemini-3.5-flash-lite'` を定義し、保存時にその値を書き込む。モデル選択の読み書きロジックを削除。
  - `background.js`: `translateWithGemini()` から `model` 引数を削除し固定値に。`TRANSLATE_SETTING_KEYS` から `gemini_model` を除外（読まなくなったため）。Hydrogen 用の出力予算 2048 / タイムアウト 30 秒を 512 / 10 秒に戻した。
  - `content-chat.js`: 待機タイムアウトを 35 秒 → 15 秒に戻した。
  - 無料枠の誤記修正: README/help の「1,500リクエスト/日・15リクエスト/分」→「1日500・10/分」（Flash-Lite の実値）。
  - 注意: API キーは依然必要（無料・課金設定不要）。キーなしでは Google 翻訳のみ。
  - 検証: `node --check`（background / options / content-chat / content-panel）は通過。**Chrome 実機は未確認**（確認観点: ①オプションにモデル選択が無く固定表示、②Gemini 有効で送信翻訳が Flash-Lite で通る、③`gemini_model` に旧値が残っていても影響しない）。

- **2026-11-18 Command Code**: `develop` 上で **v0.8.2.1**。Gemini のモデルを精度重視の2択に絞り、入力メッセージ専用であることを明記。
  - `options.html`: モデル選択を **Gemini 3.5 Flash（高精度・推奨）/ Gemini 4 Hydrogen（最高精度）** の2つに削減。Gemini が入力メッセージ翻訳専用である旨をカード冒頭とトグル説明に明記。
  - `options.js`: 既定モデルを `gemini-3.5-flash` に変更（読み込み時・保存時の両方）。
  - `background.js`: 既定モデルを `gemini-3.5-flash` に変更。Hydrogen は thinking トークンが `maxOutputTokens` に含まれるため 2048 に拡大、タイムアウトも 30 秒に延長（他モデルは従来どおり 512 / 10 秒）。
  - `content-chat.js`: `translateViaBackground()` の待機タイムアウトを 10 秒 → 35 秒に延長（background 側の Hydrogen 30 秒を待てるように）。
  - README 3言語・`help.html`・`CHANGELOG.md` を更新。Gemini の適用範囲（入力して送信するメッセージ専用、受信チャットは Google / DeepL）を明記。
  - Gemini の入力専用制御は既存実装（`background.js` の `feature === 'own' && stored.gemini_own`）で成立済みで、コード変更なし。
  - 検証: `node --check`（background / content / content-chat / content-panel / options）と manifest JSON 検証は通過。**Chrome 実機の動作確認は未実施**（確認観点: ①オプションのモデルが2択、②3.5 Flash で翻訳送信、③Hydrogen で時間はかかるが訳文が切れずに返る、④受信チャット翻訳が Google / DeepL のまま）。

- **2026-11-18 Command Code**: `feature/send-confirm`（`develop` から分岐、**v0.8.2**）でチャット送信前の翻訳結果確認（ワンクッション）を追加。
  - `content-chat.js`: `sendUserMessage()` の翻訳後に `showSendConfirm()` で確認UIへ。`confirmPendingSend()` / `cancelPendingSend()` を追加。確認中は入力欄を無効化し、`window` の capture キーダウンで Enter=送信 / Esc=キャンセル。`disconnect()` 時に確認を破棄。
  - `content-panel.js`: 入力欄の上に `.confirm-area`（翻訳前原文・翻訳結果・送信/キャンセル）を追加。フッター右側に「確認」トグル（`footerConfirmToggle`）を追加し、`toggleSendConfirm()` で `send_confirm` を保存＆即時反映。`updateFooter()` でON/OFF状態を反映。
  - `content.js`: `settings.send_confirm`（デフォルト `true`）、`pendingSend`、`confirmAreaEl` ほかDOM参照、`init()` の読み込みキー、`onSettingsChanged()` の反映を追加。
  - `options.*`: 「翻訳設定」カードに「送信前に翻訳結果を確認する」トグルを追加（デフォルトON）。
  - README 3言語・`help.html` を更新。`node --check` 全JS・manifest JSON検証は通過。**Chrome 実機の手動確認は未実施**（確認観点: ①送信→プレビュー表示、②Enter送信 / Escキャンセルで入力欄復元、③フッターの「確認」トグルとオプショントグルが双方向に同期、④OFF時は従来どおり即送信、⑤原文と翻訳が同じ場合は原文行が非表示）。

- **2026-11-16 Command Code**: `fix/translate-rate-limit`（`develop` から分岐、**v0.8.1.2**）で Google 翻訳のレート制限対策。
  - 背景: Google 翻訳は非公式エンドポイント（`translate_a/single?client=gtx`）で、アクセス集中時に 429/403 が返り得る。従来は失敗時に最大3回リトライしていたため、制限中はさらに負荷をかけていた。
  - `background.js`: 429/403 を `code: 'rate_limited'` + `retryAfterMs` として返し、`translateCooldownUntil` で約60秒間はリクエスト自体を送らない。`translate` メッセージ応答に `code` / `retryAfterMs` を追加。
  - `content-chat.js`: `rate_limited` はリトライしない。クールダウン中は翻訳をスキップして原文のみ表示（「（翻訳失敗）」を付けない）。通知はクールダウン開始時と再開時の各1回だけ（`addSystemMessage`）。折りたたみ中は通知しない。送信メッセージの翻訳がレート制限中なら「1分ほど待って再送」を表示。
  - `help.html`: Google 翻訳の「無料・無制限」表記を修正し、一時的な制限とクールダウン動作を追記。
  - 検証: `node --check` 全 JS、manifest JSON、ESLint `no-undef` 0件。fetch スタブで 429 → `rate_limited`（`retryAfterMs` 60000）・2回目はリクエストを送らないこと、実ネットワークで通常翻訳が成功することを確認。**Chrome 実機の手動確認は未実施**。
  - `develop` へ fast-forward マージ済み（`1ad791f`）。`fix/translate-rate-limit` は削除済み。GitHub Release は未実施（ユーザーの実機確認待ち）。`master` は v0.7.0.4 のまま。

- **2026-11-16 Command Code**: 報告「チャット翻訳が `（翻訳失敗）` になる」を調査し、**v0.8.1.1** で修正。
  - 原因: v0.8.1 の整理で `background.js` の `const translateCache = new Map(); const CACHE_MAX = 800;` の2行だけが削除され、`translateText()` 内の参照が残っていた。結果、翻訳リクエストが毎回 `ReferenceError: translateCache is not defined` で失敗し、`content-chat.js` の catch が `text + '（翻訳失敗）'` を表示していた（Google/DeepL/Gemini 側の問題ではない）。
  - 同種の取り残しを全数チェックし、`options.js` の `showDeeplMsg` / `showGeminiMsg` も未定義だったため復元（DeepL/Gemini キー保存時に成功メッセージが出ず Console に `ReferenceError`。保存自体は成功していた）。
  - 再発防止として、`content-chat.js` の翻訳失敗 catch で握り潰さず `console.warn('[TCT] 翻訳失敗:', e)` を出すように変更。
  - 検証: `node --check`（extension 内の全 JS）、manifest JSON 検証、content 3ファイル連結＋background/options の ESLint `no-undef`（0 件）、background.js を vm で読み込み `translateText()` を実ネットワークで実行して日本語訳が返ることを確認。**Chrome 実機の手動確認は未実施**（拡張リロード後に Twitch チャットで翻訳が出ることを確認してください）。
  - リリース対応: `develop` へ push 済み（`e30e3b7`）。`scripts/build-release.ps1` で `twitch-chat-translator-v0.8.1.1.zip` を生成し、GitHub Release [`v0.8.1.1`](https://github.com/KAWAchan-jp/twitch-chat-translate-ext/releases/tag/v0.8.1.1) を Latest として公開。壊れた `v0.8.1` の ZIP は削除し、v0.8.1 の本文に v0.8.1.1 への案内を追記した。
  - 申し送り: Chrome 実機での手動確認は未実施。README / help.html は仕様変更がないため未更新。

- **2026-11-15 Command Code**: ユーザー指示「チャット翻訳に特化したい」を受け、**v0.8.1** でクリップ録画と API 利用状況パネルを削除。チャット翻訳・送信・フィルター・弾幕・エンジン切替は維持。
  - `content-panel.js`: 🔴/📊 ボタン、録画インジケーター、利用状況パネルと関連 CSS/関数（`toggleClipRecording`・`startClipRecording`・`toggleUsagePanel` ほか）を削除。
  - `options.*`: 「録画」タブ、最大録画時間・ffmpeg パス・シェル種別、Gemini/DeepL の利用状況表示とリセットを削除。タブは「翻訳」「表示」のみ。
  - `content.js`: `clip_*` / `ffmpeg_*` 設定と利用状況キーの監視を削除。`background.js`: 利用量の記録処理と未使用の `twitch_api` ハンドラを削除。
  - デッドコード掃除: `messageCount`（write-only、content-chat.js）、`authBarEl`（content.js/content-panel.js）、`geminiFeaturesField` id、options.css の未使用スタイル（モデルテーブル・DL バッジ・`.btn-sm`）。
  - `docs/images/panel-usage.png` を削除し `build-release.ps1` から除外。README 3言語・`help.html`・`AGENTS.md`/`CLAUDE.md`・`CHANGELOG.md` を更新。
  - 検証: `node --check` 全 JS・manifest JSON 検証は通過。`clip|ffmpeg|usage|録画|利用状況` の残存参照は 0 件。**Chrome 実機の手動確認は未実施**。
  - 申し送り: `docs/images/panel-header.png` / `panel-footer.png` は最新UI（🎤/📊/🔴 なし）に更新済み。既知の改善候補: 配信言語の自動検出がチャンネル個別の `src_lang` を上書きする、タグ検出が日本語 UI 固定（`aria-label^="タグ、"`）、可視範囲翻訳の失敗時に再試行されない、翻訳キャッシュのキーに feature を含めていない。

- **2026-11-15 Command Code**: ユーザー指示「音声認識は別アプリにしてるので削除したい」を受け、拡張から音声認識（STT）・翻訳読み上げ（TTS）・クリップ字幕生成を削除し **v0.8.0** とした（未コミットの 0.7.3 変更も含む）。TTS は音声字幕の翻訳結果を読み上げる実装しかなく発火元がなくなるため、クリップ字幕は内容が STT 出力由来で空になるため、ユーザー確認のうえ併せて削除。`uv/`・Faster-Whisper 配布 ZIP・専用ビルドスクリプト・関連 docs も削除。
  - 削除ファイル: `extension/content-whisper.js`、`extension/offscreen.js`/`offscreen.html`（未使用・createDocument 呼び出しなし）、`uv/`、`scripts/build-faster-whisper-server-release.ps1`、`docs/feature-faster-whisper-local.md`、`docs/images/clip-subtitle-options.png`、ルートの `faster-whisper-server.zip`。
  - 変更: `manifest.json`（content script から content-whisper を除去、Groq/127.0.0.1/localhost の host permissions を削除、CSP の `wasm-unsafe-eval` を削除、version 0.8.0）、`content.js`（STT/TTS 設定・ヒント・`updateTwitchAutoPrompt` を `updateTwitchStreamInfo` に改名し言語自動検出とゲーム名表示のみ残す）、`content-panel.js`（🎤/🔊/💡・フッター音声/STT・Groq 利用状況行・ASS 字幕生成を削除。クリップ録画と ffmpeg コマンド生成は維持）、`background.js`（Groq/Faster-Whisper の音声転送・文字起こしを削除、`feature` は `chat`/`own` のみ）、`options.*`（音声認識/読み上げタブ、字幕設定を削除）、`help.html`、README 3言語、`AGENTS.md`/`CLAUDE.md`、`docs/repository-layout.md`、`.gitignore`、`CHANGELOG.md`。
  - 検証: `node --check`（extension 内の全 JS）と manifest JSON 検証は通過。`whisper|transcribe|groq|vad_|tts|speechSynthesis|clip_sub|subtitle|hintInput|isVoiceActive` の残存参照は 0 件。`scripts/build-release.ps1 -OutputDirectory <scratch>` で v0.8.0 ZIP を生成し、`content-whisper.js` / `offscreen.*` が含まれないことを確認済み。**Chrome 実機での手動確認は未実施**（確認観点: ①パネルに 🎤/🔊/💡 が無い、②チャット翻訳・送信・弾幕が従来どおり、③オプションが「翻訳/表示/録画」タブのみ、④録画が webm＋ffmpeg コマンドで動作、⑤Service Worker と Console にエラーなし）。
  - 申し送り: `docs/images/panel-header.png` / `panel-footer.png` / `panel-usage.png` は削除した UI が写ったままなので撮り直しが必要。`chrome.storage.local` の旧キー（`groq_api_key` 等）は残るが動作に影響しない（必要なら一括削除を別途実施）。

- **2026-11-06 Command Code**: Twitch ページを開いた直後はパネルを非表示で開始し、拡張アイコンをクリックしたときだけ ON にする変更（v0.7.3）。`content.js` の `isActive` 初期値を `false` にし、`init()` で `createPanel()` 直後に `container.style.display = 'none'` を適用（ちらつき防止）。チャット接続・翻訳・バッジ（OFF 表示）は従来どおり初期状態に追従する。SPA ナビゲーション中は ON/OFF 状態を維持し、ページ再読み込みで再び OFF に戻る。README 3言語・`help.html` の操作表に「初期状態は非表示」を追記。`node --check`（content.js / background.js）と manifest JSON 検証は通過。**Chrome 実機での手動確認は未実施**（確認観点: ①Twitch チャンネルを開いてパネルが出ないこと・バッジが OFF、②アイコンクリックでパネル表示＋接続＋バッジ ON、③もう一度クリックで非表示＋切断、④リロードで OFF に戻ること）。

- **2026-09-01 Codex**: 接続エラーの診断詳細を追加。`content-chat.js` で WebSocket の `error` をConsoleへ記録し、`close` の code / reason（未提供時は代表的なコードの説明）をパネルへ表示するようにした。IRC `NOTICE` もパネルとConsoleへ出すため、認証・JOIN拒否などのTwitch側メッセージを確認できる。認証トークンはログ・画面へ出力しない。実機で `Login authentication failed` を確認したため、同通知を受けた場合は保存済み認証を解除して匿名閲覧へ自動切替するよう追加し、無効トークンでの再接続ループを防止した。チャット送信を再開するにはログインし直す。ユーザー指定により `extension/manifest.json` は3桁の `0.7.2` へ更新。拡張ZIPを生成し、GitHub Release `v0.7.2`（`develop` の `2c31fc5`）として公開済み。初回のリリース本文に改行エスケープが文字列として入ったため、実際のMarkdown改行へ修正済み。Chrome実機で自動切替後の接続成功は未確認。構文検証コマンドは実行環境のプロセス起動エラー（Windows error 1920）で実行できなかったため、Chromeリロード時にも確認すること。
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
