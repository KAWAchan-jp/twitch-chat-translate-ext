// Twitch ページの MAIN world で動作するモジュールスクリプト
// content.js が <script type="module"> として注入する
// Service Worker / offscreen document 不要

'use strict';

let transcriber = null;
let loadPromise  = null;

async function ensureTranscriber() {
  if (transcriber) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    emitStatus('Whisper モデルをロード中...');

    // import.meta.url = chrome-extension://<id>/whisper-injected.js
    // → ./lib/ は chrome-extension://<id>/lib/ に解決される
    const { pipeline, env } = await import('./lib/transformers.web.min.js');
    env.useBrowserCache  = true;
    env.allowLocalModels = false;

    transcriber = await pipeline(
      'automatic-speech-recognition',
      'onnx-community/whisper-tiny',
      {
        device: 'auto',
        dtype:  'q4',
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

  // WebM blob → Blob URL → Transformers.js が内部でデコード＆リサンプリング
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
