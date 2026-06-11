// Twitch ページの MAIN world で動作するモジュールスクリプト
// content.js が <script type="module"> として注入する
// @xenova/transformers v2 (自己完結型バンドル、ベアスペシファイアなし)

'use strict';

let transcriber   = null;
let loadPromise   = null;
let loadedModel   = null;

// import.meta.url = chrome-extension://<id>/whisper-injected.js
// lib/ は同じ拡張機能ディレクトリ内にある
const LIB_BASE = new URL('./lib/', import.meta.url).href;

async function ensureTranscriber(modelName) {
  if (transcriber && loadedModel === modelName) return;
  if (loadPromise) { await loadPromise; if (loadedModel === modelName) return; }

  // モデルが変わった場合はリセット
  transcriber = null;
  loadedModel = null;

  loadPromise = (async () => {
    emitStatus('Whisper モデルをロード中...');

    const { pipeline, env } = await import(LIB_BASE + 'transformers.min.js');

    env.backends.onnx.wasm.wasmPaths = LIB_BASE;
    env.backends.onnx.wasm.numThreads = 1;
    env.useBrowserCache  = true;
    env.allowLocalModels = false;

    transcriber = await pipeline(
      'automatic-speech-recognition',
      modelName,
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

    loadedModel = modelName;
    loadPromise = null;
    emitStatus('Whisper 準備完了 ✓');
  })();

  return loadPromise;
}

// content.js → このスクリプト: 音声認識リクエスト
window.addEventListener('__tct_whisper_transcribe', async ({ detail }) => {
  const { audioUrl, mimeType, language, requestId, model, initial_prompt } = detail;
  const modelName = model || 'Xenova/whisper-tiny';

  try {
    await ensureTranscriber(modelName);
    const opts = { task: 'transcribe', return_timestamps: false };
    if (language && language !== 'auto') opts.language = language;
    if (initial_prompt) opts.initial_prompt = initial_prompt;
    const result = await transcriber(audioUrl, opts);
    window.dispatchEvent(new CustomEvent('__tct_whisper_result', {
      detail: { requestId, ok: true, result: result.text?.trim() ?? '' },
    }));
  } catch (err) {
    window.dispatchEvent(new CustomEvent('__tct_whisper_result', {
      detail: { requestId, ok: false, error: err.message },
    }));
  } finally {
    URL.revokeObjectURL(audioUrl);
  }
});

function emitStatus(text) {
  window.dispatchEvent(new CustomEvent('__tct_whisper_status', { detail: { text } }));
}

// リスナー登録完了を content.js に通知
window.dispatchEvent(new CustomEvent('__tct_whisper_ready'));
