'use strict';

const HALLUCINATION_PATTERNS = [
  'ご視聴ありがとうございました',
  'ご視聴ありがとうございます',
  'ありがとうございました',
  'チャンネル登録よろしくお願いします',
  'チャンネル登録お願いします',
  'チャンネル登録',
  '字幕は自動生成されています',
  'ご視聴ありがとうございました。',
  'thank you for watching',
  'thanks for watching',
  'thank you', // 英語版Whisperの定番ハルシネーション（無音時に出る）。完全一致なので長文の本物は残る
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
  // インドネシア語
  'terima kasih',
  'terima kasih.',
  'terima kasih telah menonton',
  'terima kasih telah menonton!',
  'terima kasih sudah menonton',
  'sampai jumpa',
  // 韓国語
  '시청해주셔서 감사합니다',
  '구독과 좋아요',
  // スペイン語
  'gracias por ver',
  'gracias por ver el video',
];

function isHallucination(text, customPatterns = []) {
  const normalized = text.toLowerCase().replace(/[。、！？!?,.\s]/g, '');
  if (HALLUCINATION_PATTERNS.some(p =>
    normalized === p.toLowerCase().replace(/[。、！？!?,.\s]/g, '')
  )) return true;
  // ユーザー定義パターン（部分一致）
  if (customPatterns.length > 0 && customPatterns.some(p => p && text.toLowerCase().includes(p.toLowerCase()))) return true;
  if (normalized.length === 0) return true; // 句読点・記号のみ（「。。。。」等）
  if (normalized.length < 2) return true;  // 1文字は発話の断片として破棄
  // Whisper 非音声アノテーション：テキスト全体が (…) / […] / *…* で囲まれている
  // 例：(小声) [音楽] *laughs* *giggle*
  const trimmed = text.trim();
  if (/^\([^()]+\)$/.test(trimmed) || /^\[[^\[\]]+\]$/.test(trimmed) || /^\*[^*\n]+\*$/.test(trimmed)) return true;
  // (で始まるが)で終わらない → Whisper の自己コメント（"(I'm not sure..." 等）
  if (trimmed.startsWith('(') && !trimmed.endsWith(')')) return true;
  // 音楽記号・波線のみ（「♪~♪~」「♫♫♫」等）
  const noMusicSymbols = normalized.replace(/[♪♫♬♩~～〜ー]/g, '');
  if (noMusicSymbols.length === 0) return true;
  // 同一文字の繰り返し（「んんんん」等）
  if (normalized.length >= 4) {
    const freq = [...normalized].reduce((m, c) => (m.set(c, (m.get(c) ?? 0) + 1), m), new Map());
    let maxCount = 0;
    for (const v of freq.values()) if (v > maxCount) maxCount = v;
    if (maxCount / normalized.length > 0.6) return true;
  }
  // 短いフレーズの繰り返し（3回以上）—— 2回は「飲んでた、飲んでた」等の正常発話の可能性あり
  for (let len = 2; len <= Math.min(8, Math.floor(normalized.length / 2)); len++) {
    const repCount = Math.floor(normalized.length / len);
    if (repCount < 3) continue;
    const phrase = normalized.slice(0, len);
    const rep = phrase.repeat(repCount);
    if (normalized.startsWith(rep) && rep.length / normalized.length > 0.7) return true;
  }
  // *word* 形式アノテーションの繰り返し（例: *giggle* *giggle* *giggle*...）
  const asteriskAnnotations = text.match(/\*[^*\n]+\*/g) ?? [];
  if (asteriskAnnotations.length >= 3) {
    const counts = {};
    for (const a of asteriskAnnotations) {
      const key = a.toLowerCase();
      counts[key] = (counts[key] ?? 0) + 1;
      if (counts[key] >= 3) return true;
    }
  }
  // n-gram高頻度繰り返し（「スッシュッシュッ」等、先頭から始まらない繰り返しも検出）
  if (normalized.length >= 12) {
    for (let n = 2; n <= 6; n++) {
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

// GPU シェーダーコンパイルが異常に長引いた場合のタイムアウト（5分）
const GPU_LOAD_TIMEOUT_MS = 5 * 60 * 1000;

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

// WebGPU 用は onnx-community モデルを使用（fp16 量子化・GPU最適化済み）
// medium は onnx-community/whisper-medium が存在しないため -ONNX サフィックス版を使用
// モデル名は「リポジトリID#バリアント」形式（例: ...-ONNX#light は q4f16 軽量量子化版）
function resolveModelId(modelName, device) {
  const [id, variant] = modelName.split('#');
  const suffix = variant ? `#${variant}` : '';
  // onnx-community モデルはそのまま使用（既に最適化済み）
  if (id.startsWith('onnx-community/')) return id + suffix;
  if (device === 'webgpu') {
    if (id === 'Xenova/whisper-medium') {
      return 'onnx-community/whisper-medium-ONNX' + suffix;
    }
    return id.replace('Xenova/', 'onnx-community/') + suffix;
  }
  return id + suffix;
}

let LIB_BASE          = null;
let transcriber       = null;
let loadedModelKey    = null; // "modelId:device"
let loadPromise       = null;
let currentDevice     = null;
let loadError         = null; // { modelName, error } - 直近のロード失敗情報（無限リトライ防止）

async function ensureTranscriber(modelName, { useTimeout = true } = {}) {
  // 同じモデルで既にロードに失敗している場合は即エラー（毎リクエストごとの無限リトライを防ぐ）
  if (loadError?.modelName === modelName) throw loadError.error;

  let device  = await detectDevice();
  let modelId = resolveModelId(modelName, device);
  let key     = `${modelId}:${device}`;

  if (transcriber && loadedModelKey === key) return;
  // WASMフォールバック後は detectDevice() が 'webgpu' を返しても
  // 実際は 'wasm' でロード済みなので currentDevice ベースでも確認する
  if (transcriber && currentDevice && currentDevice !== device) {
    const altKey = `${resolveModelId(modelName, currentDevice)}:${currentDevice}`;
    if (loadedModelKey === altKey) return;
  }
  if (loadPromise) {
    await loadPromise;
    if (loadedModelKey === key) return;
    if (transcriber && currentDevice) {
      const altKey = `${resolveModelId(modelName, currentDevice)}:${currentDevice}`;
      if (loadedModelKey === altKey) return;
    }
  }

  transcriber    = null;
  loadedModelKey = null;
  currentDevice  = null;
  loadError      = null;

  loadPromise = (async () => {
    const { pipeline, env } = await import(LIB_BASE + 'transformers.min.js');
    env.backends.onnx.wasm.wasmPaths = LIB_BASE;
    env.backends.onnx.wasm.numThreads = 1;
    env.useBrowserCache  = true;
    env.allowLocalModels = false;

    const tryLoad = async (dev, cancelRef = {}) => {
      const [mid, variant] = resolveModelId(modelName, dev).split('#');
      const isLight = variant === 'light'; // q4f16 軽量量子化版（GPU負荷・VRAM約1/3）
      const deviceLabel = dev === 'webgpu' ? 'GPU' : 'CPU';
      postMessage({ type: 'status', text: `Whisper モデル準備中... (${deviceLabel})` });
      // onnx-community リポジトリは fp16 エンコーダーを使用（GPU最適化済み）
      // Xenova リポジトリは fp32 エンコーダーを使用
      const isOnnxCommunity = mid.startsWith('onnx-community/');
      const dtype = dev === 'webgpu'
        ? (isLight
            ? { encoder_model: 'q4f16', decoder_model_merged: 'q4f16' }
            : { encoder_model: isOnnxCommunity ? 'fp16' : 'fp32', decoder_model_merged: 'q4' })
        : { encoder_model: 'q8', decoder_model_merged: 'q4' };

      let idleTimer = null;
      let shaderInterval = null;

      try {
        const result = await pipeline(
          'automatic-speech-recognition',
          mid,
          {
            device: dev,
            dtype,
            progress_callback: ({ status, name, progress }) => {
              // ファイル受信中はシェーダー待機メッセージをリセット
              clearTimeout(idleTimer);
              clearInterval(shaderInterval);
              shaderInterval = null;

              const fname = (name ?? '').split('/').pop().split('?')[0] || '';
              if (status === 'downloading' || status === 'progress') {
                const pct = Math.round(progress ?? 0);
                postMessage({ type: 'download_progress', progress: pct, name: fname });
              } else if (status === 'loading') {
                postMessage({ type: 'status', text: `読込中: ${fname}` });
              } else if (status === 'initiate') {
                postMessage({ type: 'status', text: `取得中: ${fname}` });
              }

              // ファイル処理が2秒止まったらシェーダーコンパイル中とみなす（経過時間付きで表示）
              idleTimer = setTimeout(() => {
                let elapsed = 0;
                const sendShaderMsg = () => {
                  if (cancelRef.cancelled) { clearInterval(shaderInterval); return; }
                  postMessage({ type: 'status', text: `GPU シェーダー初期化中... ${elapsed}秒経過（初回のみ）` });
                  elapsed += 4;
                };
                sendShaderMsg();
                shaderInterval = setInterval(sendShaderMsg, 4000);
              }, 2000);
            },
          },
        );
        return result;
      } finally {
        // 例外発生時もタイマーを必ずクリア
        clearTimeout(idleTimer);
        clearInterval(shaderInterval);
      }
    };

    // WebGPU で失敗またはタイムアウトした場合は WASM にフォールバック
    if (device === 'webgpu') {
      try {
        const cancelRef = {};
        const gpuLoadPromise = tryLoad('webgpu', cancelRef);
        if (useTimeout) {
          let gpuTimeoutId;
          const gpuTimeoutPromise = new Promise((_, reject) => {
            gpuTimeoutId = setTimeout(() => {
              cancelRef.cancelled = true;
              reject(new Error('GPU_SHADER_TIMEOUT'));
            }, GPU_LOAD_TIMEOUT_MS);
          });
          transcriber = await Promise.race([gpuLoadPromise, gpuTimeoutPromise]);
          clearTimeout(gpuTimeoutId);
        } else {
          transcriber = await gpuLoadPromise;
        }
      } catch (gpuErr) {
        // ネットワーク一時障害なら GPU で一度だけ再試行（セッション全体がCPUモードに落ちるのを防ぐ）
        let recovered = false;
        if (gpuErr?.message !== 'GPU_SHADER_TIMEOUT' && /network/i.test(gpuErr?.message ?? '')) {
          console.warn('[TCT-W] ネットワークエラー → GPUロードを再試行:', gpuErr.message);
          postMessage({ type: 'status', text: 'ネットワークエラー → 再試行中...' });
          try {
            transcriber = await tryLoad('webgpu');
            recovered = true;
          } catch (retryErr) {
            console.warn('[TCT-W] GPU再試行も失敗:', retryErr?.message ?? retryErr);
          }
        }
        if (!recovered) {
        if (gpuErr?.message === 'GPU_SHADER_TIMEOUT') {
          postMessage({ type: 'status', text: 'GPU初期化がタイムアウト → CPUモードに切り替えます' });
        } else {
          console.warn('[TCT-W] WebGPU ロード失敗、WASM にフォールバック:', gpuErr?.message ?? gpuErr);
        }
        device  = 'wasm';
        modelId = resolveModelId(modelName, 'wasm');
        key     = `${modelId}:wasm`;
        postMessage({ type: 'status', text: 'CPUモードで再読込中...' });
        transcriber = await tryLoad('wasm');
        }
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
  })().catch(err => {
    loadPromise = null;
    // バッファ確保失敗はVRAM/メモリ不足なのでわかりやすいエラーに変換
    const finalErr = err?.message?.includes('failed to allocate a buffer')
      ? new Error('VRAM/メモリ不足でモデルをロードできません。より小さいモデル（Small等）に切り替えてください')
      : err;
    loadError = { modelName, error: finalErr };
    throw finalErr;
  });

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
      await ensureTranscriber(modelName, { useTimeout: false });
      postMessage({ type: 'download_complete', ok: true });
    } catch (err) {
      postMessage({ type: 'download_complete', ok: false, error: err.message });
    }
    return;
  }

  if (type === 'transcribe') {
    const { audioData, sampling_rate, language, requestId, model, initial_prompt, num_beams, custom_hallucination_patterns } = e.data;
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

      // 推論が2秒以上かかる場合（初回GPUシェーダーコンパイル等）に経過時間を表示
      // infer_status はメインスレッド側でタイムアウトをリセットしない（load_status と区別）
      const INFER_TIMEOUT_MS = 90000;
      let inferElapsed = 0;
      let inferInterval = null;
      let inferTimedOut = false;
      const inferDisplayTimer = setTimeout(() => {
        const tick = () => {
          postMessage({ type: 'infer_status', text: `推論中... ${inferElapsed}秒経過` });
          inferElapsed += 4;
        };
        tick();
        inferInterval = setInterval(tick, 4000);
      }, 2000);
      const inferTimeoutTimer = setTimeout(() => {
        inferTimedOut = true;
        postMessage({ type: 'result', requestId, ok: false, error: `推論タイムアウト（${INFER_TIMEOUT_MS / 1000}秒）。モデルが重すぎるかVRAM不足の可能性があります` });
      }, INFER_TIMEOUT_MS);

      let result;
      try {
        result = await transcriber(audioData, opts);
      } catch (inferErr) {
        // token_ids エラーはトークナイザー非互換が原因の場合がある
        // → initial_prompt と language を外して再試行
        if (inferErr?.message?.includes('token_ids')) {
          console.warn('[TCT-W] token_ids エラー → initial_prompt/language なしで再試行');
          const { initial_prompt: _p, language: _l, ...optsBase } = opts;
          result = await transcriber(audioData, optsBase);
        } else {
          throw inferErr;
        }
      } finally {
        clearTimeout(inferDisplayTimer);
        clearTimeout(inferTimeoutTimer);
        clearInterval(inferInterval);
      }
      // タイムアウト済みの場合は既にエラーを送信しているため結果を破棄
      if (inferTimedOut) return;
      const text = result.text?.trim() ?? '';
      console.log(`[TCT-W] 推論完了: "${text}"`);
      if (isHallucination(text, custom_hallucination_patterns ?? [])) {
        console.log('[TCT-W] ハルシネーション検出 → 破棄');
        postMessage({ type: 'result', requestId, ok: true, result: '' });
        return;
      }
      postMessage({ type: 'result', requestId, ok: true, result: text });
    } catch (err) {
      // ensureTranscriber が失敗した場合は loadError が設定済み。
      // transcriber() 呼び出し自体が失敗（空エラー・セッション破損など）した場合は
      // ここで検出してモデルをリセットし、同じモデルへの再試行を止める。
      if (!loadError) {
        const msg = err?.message ?? '';
        if (!msg || msg.includes('allocate') || msg.includes('session')) {
          try { await transcriber?.dispose?.(); } catch (_) {}
          transcriber    = null;
          loadedModelKey = null;
          currentDevice  = null;
          const finalMsg = msg || 'VRAM/メモリ不足でモデルをロードできません。より小さいモデル（Small等）に切り替えてください';
          loadError = { modelName, error: new Error(finalMsg) };
        }
      }
      const errMsg = loadError?.error?.message ?? err?.message ?? '不明なエラー';
      postMessage({ type: 'result', requestId, ok: false, error: errMsg });
    }
  }
});
