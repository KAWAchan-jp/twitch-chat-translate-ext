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

let _detectedDevice = null;

// WebGPU が使えるか確認（結果をキャッシュ）
async function detectDevice() {
  if (_detectedDevice) return _detectedDevice;
  if (typeof navigator === 'undefined' || !navigator.gpu) {
    console.warn('[TCT-W] WebGPU 不可: navigator.gpu が存在しない');
    return (_detectedDevice = 'wasm');
  }
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (adapter) {
      const info = adapter.info ?? {};
      console.log(`[TCT-W] WebGPU adapter: ${info.vendor ?? '?'} / ${info.architecture ?? '?'} / ${info.description ?? '?'}`);
      return (_detectedDevice = 'webgpu');
    }
    console.warn('[TCT-W] WebGPU 不可: requestAdapter() が null を返した（GPU ブロックリスト or ドライバ問題）');
  } catch (e) {
    console.warn('[TCT-W] WebGPU 不可: requestAdapter() 例外:', e?.message ?? e);
  }
  return (_detectedDevice = 'wasm');
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
  let device  = await detectDevice();
  let modelId = resolveModelId(modelName, device);
  let key     = `${modelId}:${device}`;

  if (transcriber && loadedModelKey === key) return;
  if (loadPromise) { await loadPromise; if (loadedModelKey === key) return; }

  transcriber    = null;
  loadedModelKey = null;
  currentDevice  = null;

  loadPromise = (async () => {
    const { pipeline, env } = await import(LIB_BASE + 'transformers.min.js');
    env.backends.onnx.wasm.wasmPaths = LIB_BASE;
    env.backends.onnx.wasm.numThreads = 1;
    env.useBrowserCache  = true;
    env.allowLocalModels = false;

    const tryLoad = async (dev) => {
      const mid = resolveModelId(modelName, dev);
      const deviceLabel = dev === 'webgpu' ? 'GPU' : 'CPU';
      postMessage({ type: 'status', text: `Whisper モデル準備中... (${deviceLabel})` });
      // WebGPU: fp32エンコーダ（精度安定。大きすぎて失敗した場合は呼び出し側でWASMにfallback）
      // WASM:   q8エンコーダ
      const dtype = dev === 'webgpu'
        ? { encoder_model: 'fp32', decoder_model_merged: 'q4' }
        : { encoder_model: 'q8',   decoder_model_merged: 'q4' };
      return pipeline(
        'automatic-speech-recognition',
        mid,
        {
          device: dev,
          dtype,
          progress_callback: ({ status, name, progress }) => {
            const fname = (name ?? '').split('/').pop().split('?')[0] || '';
            if (status === 'downloading' || status === 'progress') {
              const pct = Math.round(progress ?? 0);
              postMessage({ type: 'download_progress', progress: pct, name: fname });
            } else if (status === 'loading') {
              postMessage({ type: 'status', text: `読込中: ${fname}` });
            }
          },
        },
      );
    };

    // WebGPU で失敗した場合は WASM にフォールバック
    if (device === 'webgpu') {
      try {
        transcriber = await tryLoad('webgpu');
      } catch (gpuErr) {
        console.warn('[TCT-W] WebGPU ロード失敗、WASM にフォールバック:', gpuErr?.message ?? gpuErr);
        device  = 'wasm';
        modelId = resolveModelId(modelName, 'wasm');
        key     = `${modelId}:wasm`;
        transcriber = await tryLoad('wasm');
      }
    } else {
      transcriber = await tryLoad('wasm');
    }

    loadedModelKey = key;
    currentDevice  = device;
    loadPromise    = null;
    const deviceLabel = device === 'webgpu' ? 'GPU' : 'CPU';
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

  if (type === 'download') {
    const { model } = e.data;
    const modelName = model || 'Xenova/whisper-tiny';
    try {
      await ensureTranscriber(modelName);
      postMessage({ type: 'download_complete', ok: true });
    } catch (err) {
      postMessage({ type: 'download_complete', ok: false, error: err.message });
    }
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
        // temperature fallback: 低信頼の出力を高温度で再試行（Whisper本来の動作）
        temperature: [0, 0.2, 0.4, 0.6, 0.8, 1.0],
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
