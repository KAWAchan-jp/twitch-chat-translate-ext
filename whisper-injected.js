// Twitch ページの MAIN world で動作するモジュールスクリプト
// content.js が <script type="module"> として注入する
// @xenova/transformers v2 (自己完結型バンドル、ベアスペシファイアなし)

'use strict';

let transcriber = null;
let loadPromise  = null;

// import.meta.url = chrome-extension://<id>/whisper-injected.js
// lib/ は同じ拡張機能ディレクトリ内にある
const LIB_BASE = new URL('./lib/', import.meta.url).href;

async function ensureTranscriber() {
  if (transcriber) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    emitStatus('Whisper モデルをロード中...');

    const { pipeline, env } = await import(LIB_BASE + 'transformers.min.js');

    // WASM バイナリを拡張機能の lib/ から読み込む（Twitch CSP の影響を受けない）
    // デフォルトは CDN だが、chrome-extension:// の local WASM に上書き
    env.backends.onnx.wasm.wasmPaths = LIB_BASE;
    // スレッドなし = ort-wasm-simd.wasm を使用（SharedArrayBuffer 不要）
    env.backends.onnx.wasm.numThreads = 1;

    env.useBrowserCache  = true;
    env.allowLocalModels = false;

    transcriber = await pipeline(
      'automatic-speech-recognition',
      'Xenova/whisper-tiny',
      {
        quantized: true,
        progress_callback: ({ status, name, progress }) => {
          if (status === 'downloading') {
            emitStatus(`DL中: ${name ?? ''} (${Math.round(progress ?? 0)}%)`);
          } else if (status === 'ready') {
            emitStatus('Whisper 準備完了 ✓');
          }
        },
      },
    );

    loadPromise = null;
    emitStatus('Whisper 準備完了 ✓');
  })();

  return loadPromise;
}

// content.js → このスクリプト: 音声認識リクエスト
window.addEventListener('__tct_whisper_transcribe', async ({ detail }) => {
  const { audioBase64, mimeType, language, requestId } = detail;

  const bytes = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0));
  const url   = URL.createObjectURL(new Blob([bytes], { type: mimeType || 'audio/webm' }));

  try {
    await ensureTranscriber();
    const opts = { task: 'transcribe', return_timestamps: false };
    if (language && language !== 'auto') opts.language = language;
    const result = await transcriber(url, opts);
    window.dispatchEvent(new CustomEvent('__tct_whisper_result', {
      detail: { requestId, ok: true, result: result.text?.trim() ?? '' },
    }));
  } catch (err) {
    window.dispatchEvent(new CustomEvent('__tct_whisper_result', {
      detail: { requestId, ok: false, error: err.message },
    }));
  } finally {
    URL.revokeObjectURL(url);
  }
});

function emitStatus(text) {
  window.dispatchEvent(new CustomEvent('__tct_whisper_status', { detail: { text } }));
}

// リスナー登録完了を content.js に通知
window.dispatchEvent(new CustomEvent('__tct_whisper_ready'));
