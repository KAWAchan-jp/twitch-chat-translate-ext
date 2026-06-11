// Whisper 推論専用 Web Worker（モジュールワーカー）
// メインスレッドと完全に分離して実行される
'use strict';

const LIB_BASE = new URL('./lib/', import.meta.url).href;

let transcriber = null;
let loadedModel = null;
let loadPromise = null;

async function ensureTranscriber(modelName) {
  if (transcriber && loadedModel === modelName) return;
  if (loadPromise) { await loadPromise; if (loadedModel === modelName) return; }

  transcriber = null;
  loadedModel = null;

  loadPromise = (async () => {
    postMessage({ type: 'status', text: 'Whisper モデルをロード中...' });

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
            postMessage({ type: 'status', text: `DL中: ${name ?? ''} (${Math.round(progress ?? 0)}%)` });
          } else if (status === 'ready') {
            postMessage({ type: 'status', text: 'Whisper 準備完了 ✓' });
          }
        },
      },
    );

    loadedModel = modelName;
    loadPromise = null;
    postMessage({ type: 'status', text: 'Whisper 準備完了 ✓' });
  })();

  return loadPromise;
}

self.addEventListener('message', async (e) => {
  const { type, audioBuffer, mimeType, language, requestId, model, initial_prompt } = e.data;
  if (type !== 'transcribe') return;

  const modelName = model || 'Xenova/whisper-tiny';
  const blob = new Blob([audioBuffer], { type: mimeType || 'audio/webm' });
  const url  = URL.createObjectURL(blob);

  try {
    await ensureTranscriber(modelName);
    const opts = { task: 'transcribe', return_timestamps: false };
    if (language && language !== 'auto') opts.language = language;
    if (initial_prompt) opts.initial_prompt = initial_prompt;
    const result = await transcriber(url, opts);
    postMessage({ type: 'result', requestId, ok: true, result: result.text?.trim() ?? '' });
  } catch (err) {
    postMessage({ type: 'result', requestId, ok: false, error: err.message });
  } finally {
    URL.revokeObjectURL(url);
  }
});

postMessage({ type: 'ready' });
