'use strict';

// Whisper が無音・BGM時に頻出するハルシネーションフレーズ
const HALLUCINATION_PATTERNS = [
  'ご視聴ありがとうございました',
  'ご視聴ありがとうございます',
  'チャンネル登録よろしくお願いします',
  'チャンネル登録お願いします',
  'チャンネル登録',
  '字幕は自動生成されています',
  'ご視聴ありがとうございました。',
  'thank you for watching',
  'thanks for watching',
  'please subscribe',
  'subscribe to my channel',
  '(音楽)',
  '[音楽]',
  '♪',
  '(笑)',
  '(笑い)',
  '[笑]',
  '(字幕を覚えてくれてありがとう!)',
  '(字幕を覚えてくれてありがとう)',
];

function isHallucination(text) {
  const normalized = text.toLowerCase().replace(/[。、！？!?,.\s]/g, '');
  if (HALLUCINATION_PATTERNS.some(p =>
    normalized === p.toLowerCase().replace(/[。、！？!?,.\s]/g, '')
  )) return true;
  if (normalized.length < 2) return false;
  // 同一文字の繰り返し（「んんんん」等）
  if (normalized.length >= 4) {
    const freq = [...normalized].reduce((m, c) => (m.set(c, (m.get(c) ?? 0) + 1), m), new Map());
    if (Math.max(...freq.values()) / normalized.length > 0.6) return true;
  }
  // 短いフレーズの繰り返し（「東京都市の東京都市の...」等）
  for (let len = 2; len <= Math.min(8, Math.floor(normalized.length / 2)); len++) {
    const phrase = normalized.slice(0, len);
    const rep = phrase.repeat(Math.floor(normalized.length / len));
    if (normalized.startsWith(rep) && rep.length / normalized.length > 0.7) return true;
  }
  return false;
}

// libBase は init メッセージで受け取る（import.meta.url は classic worker では使えない）
let LIB_BASE          = null;
let transcriber       = null;
let loadedModel       = null;
let loadPromise       = null;
let lastTranscriptText = ''; // 直前の認識テキスト（condition_on_prev_tokens の代替）

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
    env.backends.onnx.logLevel = 'error'; // "Removing initializer" 等の警告を抑制
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
  const { type } = e.data;

  if (type === 'init') {
    LIB_BASE = e.data.libBase;
    postMessage({ type: 'ready' });
    return;
  }

  if (type === 'transcribe') {
    const { audioData, sampling_rate, language, requestId, model, initial_prompt, num_beams } = e.data;
    const modelName = model || 'Xenova/whisper-tiny';
    try {
      await ensureTranscriber(modelName);
      const opts = {
        task: 'transcribe',
        return_timestamps: false,
        sampling_rate: sampling_rate ?? 16000,
        num_beams: num_beams ?? 1,
        temperature: 0,
      };
      if (language && language !== 'auto') opts.language = language;
      // ユーザー設定のプロンプトがあればそれを優先、なければ直前の認識テキストを文脈として使う
      const context = initial_prompt || (lastTranscriptText ? lastTranscriptText.slice(-80) : '');
      if (context) opts.initial_prompt = context;
      console.log(`[TCT-W] 推論開始 model=${modelName} beams=${opts.num_beams} lang=${opts.language ?? 'auto'}`);
      const result = await transcriber(audioData, opts);
      const text = result.text?.trim() ?? '';
      console.log(`[TCT-W] 推論完了: "${text}"`);
      if (isHallucination(text)) {
        console.log('[TCT-W] ハルシネーション検出 → 破棄');
        postMessage({ type: 'result', requestId, ok: true, result: '' });
        return;
      }
      lastTranscriptText = text;
      postMessage({ type: 'result', requestId, ok: true, result: text });
    } catch (err) {
      postMessage({ type: 'result', requestId, ok: false, error: err.message });
    }
  }
});
