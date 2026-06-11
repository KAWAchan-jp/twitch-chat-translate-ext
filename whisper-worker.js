'use strict';

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
  if (normalized.length === 0) return true; // 句読点・記号のみ（「。。。。」等）
  if (normalized.length < 2) return false;
  // Whisper 非音声アノテーション：テキスト全体が (…) または […] で囲まれている
  // 例：(小声) (シャッシュ) (パンッ) (お腹が空いている) (♪) [音楽]
  const trimmed = text.trim();
  if (/^\([^()]+\)$/.test(trimmed) || /^\[[^\[\]]+\]$/.test(trimmed)) return true;
  // 音楽記号・波線のみ（「♪~♪~」「♫♫♫」等）
  const noMusicSymbols = normalized.replace(/[♪♫♬♩~～〜ー]/g, '');
  if (noMusicSymbols.length === 0) return true;
  // 同一文字の繰り返し（「んんんん」等）
  if (normalized.length >= 4) {
    const freq = [...normalized].reduce((m, c) => (m.set(c, (m.get(c) ?? 0) + 1), m), new Map());
    if (Math.max(...freq.values()) / normalized.length > 0.6) return true;
  }
  // 短いフレーズの繰り返し（3回以上）—— 2回は「飲んでた、飲んでた」等の正常発話の可能性あり
  for (let len = 2; len <= Math.min(8, Math.floor(normalized.length / 2)); len++) {
    const repCount = Math.floor(normalized.length / len);
    if (repCount < 3) continue;
    const phrase = normalized.slice(0, len);
    const rep = phrase.repeat(repCount);
    if (normalized.startsWith(rep) && rep.length / normalized.length > 0.7) return true;
  }
  // n-gram高頻度繰り返し（「スッシュッシュッ」等、先頭から始まらない繰り返しも検出）
  if (normalized.length >= 12) {
    for (let n = 2; n <= 4; n++) {
      const grams = new Map();
      for (let i = 0; i <= normalized.length - n; i++) {
        const g = normalized.slice(i, i + n);
        grams.set(g, (grams.get(g) ?? 0) + 1);
      }
      if (Math.max(...grams.values()) * n / normalized.length > 0.5) return true;
    }
  }
  return false;
}

// WebGPU が使えるか確認
async function detectDevice() {
  if (typeof navigator !== 'undefined' && navigator.gpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) return 'webgpu';
    } catch {}
  }
  return 'wasm';
}

// WebGPU 用は fp16 バリアントを持つ onnx-community モデルを使用
function resolveModelId(modelName, device) {
  if (device === 'webgpu') {
    return modelName.replace('Xenova/', 'onnx-community/');
  }
  return modelName;
}

let LIB_BASE          = null;
let transcriber       = null;
let loadedModelKey    = null; // "modelId:device"
let loadPromise       = null;
let currentDevice     = null;

async function ensureTranscriber(modelName) {
  const device  = await detectDevice();
  const modelId = resolveModelId(modelName, device);
  const key     = `${modelId}:${device}`;

  if (transcriber && loadedModelKey === key) return;
  if (loadPromise) { await loadPromise; if (loadedModelKey === key) return; }

  transcriber    = null;
  loadedModelKey = null;
  currentDevice  = null;

  loadPromise = (async () => {
    const deviceLabel = device === 'webgpu' ? 'GPU' : 'CPU';
    postMessage({ type: 'status', text: `Whisper ロード中... (${deviceLabel})` });

    const { pipeline, env } = await import(LIB_BASE + 'transformers.min.js');
    env.backends.onnx.wasm.wasmPaths = LIB_BASE;
    env.backends.onnx.wasm.numThreads = 1;
    env.useBrowserCache  = true;
    env.allowLocalModels = false;

    // WebGPU: fp32エンコーダ＋q4デコーダ（fp16/q4は精度不安定のためfp32で安定性優先）
    // WASM:   q8エンコーダ＋q4デコーダ（サイズ優先）
    const dtype = device === 'webgpu'
      ? { encoder_model: 'fp32', decoder_model_merged: 'q4' }
      : { encoder_model: 'q8',   decoder_model_merged: 'q4' };

    transcriber = await pipeline(
      'automatic-speech-recognition',
      modelId,
      {
        device,
        dtype,
        progress_callback: ({ status, name, progress }) => {
          if (status === 'downloading') {
            postMessage({ type: 'status', text: `DL中: ${name ?? ''} (${Math.round(progress ?? 0)}%)` });
          }
        },
      },
    );

    loadedModelKey = key;
    currentDevice  = device;
    loadPromise    = null;
    postMessage({ type: 'device_info', device });
    postMessage({ type: 'status', text: `Whisper 準備完了 ✓ (${deviceLabel})` });
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
        max_new_tokens: 128,
      };
      if (language && language !== 'auto') opts.language = language;
      if (initial_prompt) opts.initial_prompt = initial_prompt;
      console.log(`[TCT-W] 推論開始 model=${loadedModelKey} beams=${opts.num_beams} lang=${opts.language ?? 'auto'}`);
      const result = await transcriber(audioData, opts);
      const text = result.text?.trim() ?? '';
      console.log(`[TCT-W] 推論完了: "${text}"`);
      if (isHallucination(text)) {
        console.log('[TCT-W] ハルシネーション検出 → 破棄');
        postMessage({ type: 'result', requestId, ok: true, result: '' });
        return;
      }
      postMessage({ type: 'result', requestId, ok: true, result: text });
    } catch (err) {
      postMessage({ type: 'result', requestId, ok: false, error: err.message });
    }
  }
});
