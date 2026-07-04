# feature/faster-whisper-local

Faster-Whisper をローカル STT エンジンとして追加するためのブランチ作業メモ。

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
- 2026-07-04: 中断前チェックポイントとして構文確認まで実施。実ブラウザ・実Faster-Whisperサーバーでの動作確認は未実施。

## 確認済み

- `node --check background.js`
- `node --check content-whisper.js`
- `node --check content-panel.js`
- `node --check content.js`
- `node --check options.js`
- `python3 -m py_compile tools/faster-whisper-server/server.py`
- `git diff --check`

## 次にやること

1. 実ブラウザでオプション保存、フッター切替、未起動時フォールバックを確認する。
2. 実 Faster-Whisper サーバーを起動して `large-v3-turbo` で認識できるか確認する。
3. 必要なら音声形式やモデル名の扱いをサーバー側で調整する。
4. README.en.md / README.ru.md / help.html への説明追加を検討する。

## 未決事項

- 実環境で `webm/opus` を ffmpeg なしで faster-whisper が読めるか。読めない場合はサーバー側に変換処理が必要。
- `large-v3-turbo` が利用環境の faster-whisper / CTranslate2 で問題なく取得できるか。
- README.en.md / README.ru.md の更新範囲。

## 再開メモ

- 現在ブランチ: `feature/faster-whisper-local`
- まず `docs/WORK-STATUS.md` とこのファイルを読む。
- 実装チェックポイントはコミット済み。次は動作検証から始める。
