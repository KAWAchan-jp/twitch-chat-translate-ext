// Transformers.js + Whisper ローカル音声認識
// MV3 offscreen document として動作する
// WASM は Transformers.js が自動的に CDN から取得してキャッシュする

import { pipeline, env } from './lib/transformers.web.min.js';

const MODEL_ID = 'onnx-community/whisper-tiny';

// ブラウザキャッシュ（IndexedDB）を有効化
env.useBrowserCache = true;
env.allowLocalModels = false;

let transcriber = null;
let loadPromise  = null;

// ===== メッセージハンドラ =====
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.target !== 'offscreen-whisper') return false;

  if (msg.type === 'transcribe') {
    handleTranscribe(msg)
      .then(text => sendResponse({ ok: true, result: text }))
      .catch(err  => sendResponse({ ok: false, error: err.message }));
    return true; // async
  }

  if (msg.type === 'warmup') {
    ensureTranscriber()
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  return false;
});

// ===== モデル初期化 =====
async function ensureTranscriber() {
  if (transcriber) return transcriber;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    notify('Whisper モデルをダウンロード中... (初回のみ約20MB)');

    const onProgress = ({ status, name, progress }) => {
      if (status === 'downloading') {
        const pct = progress != null ? Math.round(progress) : '...';
        notify(`ダウンロード中: ${name ?? ''} (${pct}%)`);
      } else if (status === 'loading') {
        notify('モデルを読み込み中...');
      } else if (status === 'ready') {
        notify('Whisper 準備完了 ✓');
      }
    };

    const device = (typeof navigator !== 'undefined' && navigator.gpu)
      ? 'webgpu' : 'wasm';

    transcriber = await pipeline(
      'automatic-speech-recognition',
      MODEL_ID,
      { device, dtype: 'q4', progress_callback: onProgress },
    );

    loadPromise = null;
    notify('Whisper 準備完了 ✓');
    return transcriber;
  })();

  return loadPromise;
}

// ===== 文字起こし =====
async function handleTranscribe({ audioBase64, mimeType, language }) {
  const t = await ensureTranscriber();

  // base64 → Blob URL → Transformers.js が内部でデコード＆16kHz リサンプル
  const bytes = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0));
  const blob  = new Blob([bytes], { type: mimeType || 'audio/webm' });
  const url   = URL.createObjectURL(blob);

  try {
    const opts = { task: 'transcribe', return_timestamps: false };
    if (language && language !== 'auto') opts.language = language;
    const result = await t(url, opts);
    return result.text?.trim() ?? '';
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ===== ステータス通知（→ background.js → content.js） =====
function notify(text) {
  chrome.runtime.sendMessage({ type: 'whisper_status', text }).catch(() => {});
}
