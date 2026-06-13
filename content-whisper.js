'use strict';

// ===== 音声・字幕 状態変数 =====
let voiceStream        = null;
let voiceAudioCtx      = null;
let voiceSourceNode    = null; // MediaElementSourceNode（video 要素につき1回だけ作成）
let voiceDestNode      = null; // MediaStreamDestinationNode（start/stop ごとに再作成）
let mediaRecorder      = null;
let audioChunks        = [];
let hadSpeech          = false;
let voiceSessionTimer  = null;
let cableLevel         = 0;
let isVoiceActive      = false;
let whisperActiveCount = 0;
let subtitleContainer  = null;
let subtitleFadeTimer  = null;

// ===== Whisper Web Worker（並列スロット方式） =====
// 特殊なリポジトリIDを持つモデル（それ以外は Xenova/whisper-{value}）。#light は q4f16 量子化版
const WHISPER_MODEL_IDS = {
  'large-v3-turbo':    'onnx-community/whisper-large-v3-turbo',
  'kotoba-v2.2':       'onnx-community/kotoba-whisper-v2.2-ONNX',
  'kotoba-v2.2-light': 'onnx-community/kotoba-whisper-v2.2-ONNX#light',
};
const WHISPER_WORKER_COUNT  = 4;
const whisperSlots          = [];
const pendingTranscriptions = new Map();
let _decodeAudioCtx = null;
const WHISPER_MAX_CONSECUTIVE_DISCARDS = 8;
let whisperConsecutiveDiscards = 0;

function createWhisperSlot() {
  const scriptUrl = chrome.runtime.getURL('whisper-worker.js');
  const libBase   = chrome.runtime.getURL('lib/');
  const blobUrl   = URL.createObjectURL(
    new Blob([`importScripts(${JSON.stringify(scriptUrl)});`], { type: 'application/javascript' })
  );
  const slot = { worker: null, busy: false, ready: null };
  slot.worker = new Worker(blobUrl);
  URL.revokeObjectURL(blobUrl);

  slot.ready = new Promise((resolve, reject) => {
    slot.worker.addEventListener('message', ({ data }) => {
      if (data.type === 'ready') {
        resolve();
      } else if (data.type === 'device_info') {
        const label = data.device === 'webgpu' ? '🎮 GPU' : '🖥 CPU';
        console.log(`[TCT] Whisper デバイス: ${data.device}`);
        if (data.device === 'webgpu') {
          // WebGPU は高速なのでワーカー数を1に削減
          // （複数ワーカーはモデルをVRAMに複数載せてGPUを同時に叩くため、映像描画がカクつく）
          while (whisperSlots.length > 1) {
            const s = whisperSlots.pop();
            s.worker.terminate();
            for (const [reqId, req] of pendingTranscriptions) {
              if (req.slot === s) {
                clearTimeout(req.timer);
                pendingTranscriptions.delete(reqId);
                req.slot.busy = false;
                req.reject(new Error('worker trimmed'));
              }
            }
          }
        }
        if (isVoiceActive) showSubtitle(`Whisper 準備完了 ✓ (${label})`, false);
      } else if (data.type === 'status') {
        // モデルロード中のステータス → タイムアウトをリセット（シェーダーコンパイル等で数分かかる場合があるため）
        if (isVoiceActive || pendingTranscriptions.size > 0) showSubtitle(data.text, false);
        pendingTranscriptions.forEach((req, id) => {
          clearTimeout(req.timer);
          req.timer = setTimeout(() => {
            pendingTranscriptions.delete(id);
            req.slot.busy = false;
            req.reject(new Error('タイムアウト'));
          }, 180000);
        });
      } else if (data.type === 'infer_status') {
        if (isVoiceActive || pendingTranscriptions.size > 0) showSubtitle(data.text, false);
      } else if (data.type === 'result') {
        const req = pendingTranscriptions.get(data.requestId);
        if (!req) return;
        pendingTranscriptions.delete(data.requestId);
        clearTimeout(req.timer);
        req.slot.busy = false;
        if (data.ok) req.resolve(data.result);
        else req.reject(new Error(data.error));
      }
    });
    slot.worker.addEventListener('error', (e) => {
      slot.busy = false;
      reject(new Error(`Whisper Worker エラー: ${e.message}`));
    });
  });

  slot.worker.postMessage({ type: 'init', libBase });
  return slot;
}

// 全ワーカーを破棄する（モデル切替時のVRAM確実解放用）。次の推論時に新規生成される
function restartWhisperWorkers() {
  if (whisperSlots.length === 0) return;
  console.log('[TCT] モデル変更 → Whisperワーカーを再起動');
  for (const s of whisperSlots) {
    try { s.worker.terminate(); } catch (_) {}
  }
  whisperSlots.length = 0;
  for (const [reqId, req] of pendingTranscriptions) {
    clearTimeout(req.timer);
    req.reject(new Error('worker trimmed'));
  }
  pendingTranscriptions.clear();
}

async function ensureWhisperWorkers() {
  const { whisper_worker_count } = await chrome.storage.local.get('whisper_worker_count');
  const count = Math.min(Math.max(Number(whisper_worker_count) || WHISPER_WORKER_COUNT, 1), 8);
  while (whisperSlots.length < count) whisperSlots.push(createWhisperSlot());
  await Promise.all(whisperSlots.map(s => s.ready));
}

// Groq STT 用ハルシネーションチェック（基本パターンのみ）
const GROQ_HALLUCINATION_PATTERNS = [
  'ご視聴ありがとうございました', 'ご視聴ありがとうございます', 'ありがとうございました',
  'チャンネル登録よろしくお願いします', 'チャンネル登録お願いします', 'チャンネル登録',
  '字幕は自動生成されています', 'thank you for watching', 'thanks for watching',
  'thank you', 'please subscribe', 'subscribe to my channel',
  '(音楽)', '[音楽]', '♪', '(笑)', '(笑い)', '[笑]',
  'terima kasih', 'sampai jumpa',
  '시청해주셔서 감사합니다', '구독과 좋아요',
  'gracias por ver', 'gracias por ver el video',
];

function isGroqHallucination(text, customPatterns = []) {
  const normalized = text.toLowerCase().replace(/[。、！？!?,.\s]/g, '');
  if (normalized.length === 0 || normalized.length < 2) return true;
  if (GROQ_HALLUCINATION_PATTERNS.some(p =>
    normalized === p.toLowerCase().replace(/[。、！？!?,.\s]/g, '')
  )) return true;
  if (customPatterns.length > 0 && customPatterns.some(p => p && text.toLowerCase().includes(p.toLowerCase()))) return true;
  const trimmed = text.trim();
  if (/^\([^()]+\)$/.test(trimmed) || /^\[[^\[\]]+\]$/.test(trimmed) || /^\*[^*\n]+\*$/.test(trimmed)) return true;
  if (trimmed.startsWith('(') && !trimmed.endsWith(')')) return true;
  return false;
}

async function transcribeViaGroq(blob, language) {
  showSubtitle('Groq 認識中...', false);
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  // チャンクに分割してスタックオーバーフローを防ぐ
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  const base64 = btoa(binary);

  const response = await chrome.runtime.sendMessage({
    type: 'groq_transcribe',
    audioBase64: base64,
    mimeType: blob.type,
    language: language === 'auto' ? null : language,
  });
  if (!response.ok) throw new Error(response.error);

  const text = response.result?.trim() ?? '';
  if (isGroqHallucination(text, settings.custom_hallucination_patterns ?? [])) {
    console.log('[TCT] Groq ハルシネーション検出 → 破棄');
    return '';
  }
  return text;
}

// 音声チャンクを Worker へ送信（空きスロットがなければ null を返す）
// Web Worker 内は AudioContext 不可のためメインスレッドで PCM デコードしてから転送
async function transcribeViaBackground(blob, mimeType, language) {
  // Groq STT が有効な場合はクラウドAPIを使用（失敗時はローカルWhisperにフォールバック）
  if (settings.groq_enabled && settings.groq_api_key) {
    try {
      return await transcribeViaGroq(blob, language);
    } catch (err) {
      console.warn(`[TCT] Groq失敗 → ローカルWhisperにフォールバック: ${err.message}`);
      showSubtitle('⚠ Groq失敗 → ローカルで認識中...', false);
    }
  }

  const modelKey = settings.whisper_model ?? 'tiny';
  if (!(settings.downloaded_models ?? []).includes(modelKey)) {
    showSubtitle('⚠ モデル未ダウンロード — 設定ページでDLしてください', false);
    return null;
  }

  await ensureWhisperWorkers();

  const slot = whisperSlots.find(s => !s.busy);
  if (!slot) return null;
  slot.busy = true;

  const rawBuffer = await blob.arrayBuffer();
  if (!_decodeAudioCtx || _decodeAudioCtx.state === 'closed') {
    _decodeAudioCtx = new AudioContext({ sampleRate: 16000 });
  }
  let decoded;
  try {
    decoded = await _decodeAudioCtx.decodeAudioData(rawBuffer);
  } catch (err) {
    slot.busy = false;
    throw err;
  }
  const float32   = new Float32Array(decoded.getChannelData(0));
  const requestId = Math.random().toString(36).slice(2);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingTranscriptions.delete(requestId);
      slot.busy = false;
      reject(new Error('タイムアウト（初回はモデルDL完了後に再試行してください）'));
    }, 180000);

    pendingTranscriptions.set(requestId, { resolve, reject, timer, slot });

    // デフォルトヒント（常時） + 一時ヒント（💡、なければ自動ヒント） + 直近の認識履歴
    const sessionPrompt = settings.whisper_prompt || twitchAutoPrompt || WHISPER_DEFAULT_PROMPTS[settings.src_lang] || '';
    const basePrompt    = [settings.whisper_prompt_default, sessionPrompt].filter(Boolean).join(' ');
    const historyText   = transcriptHistory.slice(-4).join('');
    const initial_prompt = historyText ? `${basePrompt} ${historyText}`.trim() : basePrompt;
    console.log(`[TCT] → Whisper送信 size=${blob.size}bytes model=${settings.whisper_model} slot=${whisperSlots.indexOf(slot)}`);
    slot.worker.postMessage(
      { type: 'transcribe', audioData: float32, sampling_rate: 16000, language, requestId,
        model: WHISPER_MODEL_IDS[settings.whisper_model] ?? `Xenova/whisper-${settings.whisper_model ?? 'tiny'}`, initial_prompt,
        num_beams: settings.whisper_num_beams ?? 1,
        custom_hallucination_patterns: settings.custom_hallucination_patterns ?? [] },
      [float32.buffer]
    );
  });
}

function toLangTag(lang) {
  const map = {
    'en': 'en-US', 'ja': 'ja-JP', 'ko': 'ko-KR',
    'zh-CN': 'zh-CN', 'zh-TW': 'zh-TW',
    'es': 'es-ES', 'fr': 'fr-FR', 'de': 'de-DE',
    'pt': 'pt-BR', 'ru': 'ru-RU', 'ar': 'ar-SA',
    'hi': 'hi-IN', 'th': 'th-TH', 'vi': 'vi-VN',
  };
  return map[lang] || lang;
}

// ===== 音声認識・字幕オーバーレイ =====
function toggleVoice() {
  if (isVoiceActive) stopVoice();
  else startVoice();
}

async function startVoice() {
  ensureSubtitleContainer();

  const videoEl = document.querySelector('video');
  if (!videoEl) {
    showSubtitle('⚠ 動画要素が見つかりません。動画が再生中か確認してください', true);
    return;
  }

  try {
    if (!voiceAudioCtx || voiceAudioCtx.state === 'closed') {
      voiceAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    await voiceAudioCtx.resume();

    // MediaElementSourceNode は同一 video 要素に対して1回だけ作成可能
    if (!voiceSourceNode) {
      voiceSourceNode = voiceAudioCtx.createMediaElementSource(videoEl);
      voiceSourceNode.connect(voiceAudioCtx.destination);
    }

    voiceDestNode = voiceAudioCtx.createMediaStreamDestination();
    voiceSourceNode.connect(voiceDestNode);
    voiceStream = voiceDestNode.stream;
  } catch (e) {
    showSubtitle(`⚠ 音声取得失敗: ${e.message}`, true);
    return;
  }

  isVoiceActive = true;
  updateVoiceBtn();

  cableLevel = 0;
  hadSpeech  = false;
  try {
    const src      = voiceAudioCtx.createMediaStreamSource(voiceStream);
    const analyser = voiceAudioCtx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const sampleLevel = () => {
      if (!isVoiceActive) return;
      analyser.getByteFrequencyData(buf);
      let maxFreq = 0;
      for (let i = 0; i < buf.length; i++) if (buf[i] > maxFreq) maxFreq = buf[i];
      cableLevel = Math.round(maxFreq / 255 * 100);
      if (cableLevel > (settings.vad_threshold ?? 10)) hadSpeech = true;
      setTimeout(sampleLevel, 50);
    };
    sampleLevel();
  } catch (_) {}

  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus' : 'audio/webm';

  function startRecordingCycle() {
    if (!isVoiceActive) return;
    audioChunks = [];
    hadSpeech   = false;
    mediaRecorder = new MediaRecorder(voiceStream, { mimeType });
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };

    let silenceStart = null;
    let vadTimer     = null;
    const checkVAD = () => {
      if (!isVoiceActive || mediaRecorder?.state !== 'recording') return;
      if (cableLevel > (settings.vad_threshold ?? 10)) {
        silenceStart = null;
      } else if (hadSpeech) {
        if (!silenceStart) silenceStart = Date.now();
        if (Date.now() - silenceStart >= (settings.vad_silence_ms ?? 500)) {
          clearTimeout(voiceSessionTimer);
          mediaRecorder.stop();
          return;
        }
      }
      vadTimer = setTimeout(checkVAD, 50);
    };

    mediaRecorder.onstop = () => {
      clearTimeout(vadTimer);
      const chunks     = audioChunks;
      const wasSpeech  = hadSpeech;

      startRecordingCycle();

      console.log(`[TCT] chunk stop: wasSpeech=${wasSpeech} chunks=${chunks.length} level=${cableLevel}% active=${whisperActiveCount}`);
      if (wasSpeech && chunks.length > 0) {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        (async () => {
          whisperActiveCount++;
          if (whisperActiveCount === 1) setSubtitleProcessing(true);
          try {
            const text = await transcribeViaBackground(blob, 'audio/webm', settings.src_lang);
            if (text === null) {
              console.log('[TCT] 全Workerビジー・スキップ');
              return;
            }
            console.log(`[TCT] ← Whisper結果: "${text}"`);
            if (!isVoiceActive) return;
            if (text?.trim() && text.trim().length >= 3) {
              whisperConsecutiveDiscards = 0;
              transcriptHistory.push(text.trim());
              if (transcriptHistory.length > 6) transcriptHistory.shift();
              await handleFinalTranscript(text.trim());
            } else {
              // 発話ありのチャンクが連続で破棄される＝モデルが縮退状態（fp16破損等）の可能性
              whisperConsecutiveDiscards++;
              if (whisperConsecutiveDiscards >= WHISPER_MAX_CONSECUTIVE_DISCARDS) {
                console.warn(`[TCT] 連続${whisperConsecutiveDiscards}回破棄 → 認識が不安定なためワーカーを再起動`);
                whisperConsecutiveDiscards = 0;
                restartWhisperWorkers();
                showSubtitle('認識が不安定なため再初期化中...', false);
              }
            }
          } catch (err) {
            if (err.message === 'worker trimmed') return;
            console.warn(`[TCT] Whisperエラー: ${err.message}`);
            if (isVoiceActive) showSubtitle(`⚠ 認識エラー: ${err.message}`, false);
          } finally {
            whisperActiveCount--;
            if (whisperActiveCount === 0) setSubtitleProcessing(false);
          }
        })();
      }
    };

    mediaRecorder.start(100);
    checkVAD();
    voiceSessionTimer = setTimeout(() => {
      if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
    }, settings.whisper_max_chunk_ms ?? 5000);
  }
  startRecordingCycle();
  showSubtitle('🎤 録音開始', false);
}

function stopVoice() {
  isVoiceActive = false;
  updateVoiceBtn();
  clearTimeout(voiceSessionTimer);
  voiceSessionTimer = null;
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.ondataavailable = null;
    mediaRecorder.onstop = null;
    mediaRecorder.stop();
  }
  mediaRecorder = null;
  audioChunks   = [];
  hadSpeech     = false;
  if (voiceSourceNode && voiceDestNode) {
    try { voiceSourceNode.disconnect(voiceDestNode); } catch (_) {}
  }
  voiceDestNode      = null;
  voiceStream        = null;
  cableLevel         = 0;
  whisperActiveCount = 0;
  whisperSlots.forEach(s => { s.busy = false; });
  clearSubtitle();
}

// 翻訳先言語 → BCP-47 言語タグ（speechSynthesis 用）
const TTS_LANG_MAP = {
  ja: 'ja-JP', en: 'en-US', ko: 'ko-KR',
  'zh-CN': 'zh-CN', 'zh-TW': 'zh-TW',
  es: 'es-ES', fr: 'fr-FR', de: 'de-DE',
  pt: 'pt-BR', ru: 'ru-RU', ar: 'ar-SA',
  hi: 'hi-IN', th: 'th-TH', vi: 'vi-VN', id: 'id-ID',
};

// 言語コードに合った最良の音声を選ぶ（Natural優先 → 同言語通常音声 → なければスキップ）
function pickVoice(bcp47) {
  const voices = speechSynthesis.getVoices();
  const langPrefix = bcp47.toLowerCase().split('-')[0];
  const sameLang = voices.filter(v => v.lang.toLowerCase().startsWith(langPrefix));
  if (sameLang.length === 0) return null; // 対応言語なし → スキップ
  const neural = sameLang.find(v => /natural|online/i.test(v.name));
  return neural ?? sameLang[0];
}

function speakTranslation(text, lang) {
  if (!isTtsActive || !text?.trim()) return;
  const bcp47 = TTS_LANG_MAP[lang] || lang;
  const voice = pickVoice(bcp47);
  if (!voice) {
    console.log(`[TCT] TTS: ${lang} に対応する音声なし → スキップ`);
    return;
  }
  speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.voice  = voice;
  utter.lang   = bcp47;
  utter.rate   = settings.tts_rate ?? 1.0;
  utter.volume = 1.0;
  speechSynthesis.speak(utter);
}

async function handleFinalTranscript(text) {
  const from = (settings.src_lang === 'auto') ? 'auto' : settings.src_lang;
  if (from === settings.tgt_lang) {
    showSubtitle(text, true);
    speakTranslation(text, settings.tgt_lang);
    return;
  }
  showSubtitle(text, true);
  try {
    const translated = await translateViaBackground(text, from, settings.tgt_lang, 'voice');
    showSubtitle(translated, true);
    speakTranslation(translated, settings.tgt_lang);
  } catch { /* 原文表示のまま */ }
}

// ===== 字幕オーバーレイ =====
async function ensureSubtitleContainer() {
  if (subtitleContainer) return;
  subtitleContainer = document.createElement('div');
  subtitleContainer.id = 'tct-subtitle';
  subtitleContainer.style.cssText = [
    'position:fixed',
    'bottom:60px',
    'left:50%',
    'transform:translateX(-50%)',
    'z-index:2147483646',
    'max-width:60vw',
    'min-width:160px',
    'text-align:center',
    'cursor:grab',
  ].join(';');
  document.body.appendChild(subtitleContainer);
  makeSubtitleDraggable(subtitleContainer);

  const { subtitle_pos } = await chrome.storage.local.get('subtitle_pos');
  if (subtitle_pos) {
    subtitleContainer.style.bottom    = '';
    subtitleContainer.style.transform = '';
    subtitleContainer.style.left = subtitle_pos.left + 'px';
    subtitleContainer.style.top  = subtitle_pos.top  + 'px';
  }
}

function makeSubtitleDraggable(el) {
  el.addEventListener('mousedown', e => {
    e.preventDefault();
    e.stopPropagation();

    const rect = el.getBoundingClientRect();
    el.style.bottom    = '';
    el.style.transform = '';
    el.style.top  = rect.top  + 'px';
    el.style.left = rect.left + 'px';
    el.style.cursor = 'grabbing';

    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    const onMove = e => {
      el.style.left = Math.max(0, Math.min(window.innerWidth  - el.offsetWidth,  e.clientX - offsetX)) + 'px';
      el.style.top  = Math.max(0, Math.min(window.innerHeight - el.offsetHeight, e.clientY - offsetY)) + 'px';
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      el.style.cursor = 'grab';
      chrome.storage.local.set({ subtitle_pos: {
        left: parseFloat(el.style.left),
        top:  parseFloat(el.style.top),
      }});
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });
}

function showSubtitle(text, isFinal) {
  if (!subtitleContainer) return;
  clearTimeout(subtitleFadeTimer);
  subtitleContainer.style.opacity    = '1';
  subtitleContainer.style.transition = 'none';

  let textEl = subtitleContainer.querySelector('.tct-sub-text');
  if (!textEl) {
    textEl = document.createElement('span');
    textEl.className = 'tct-sub-text';
    subtitleContainer.insertBefore(textEl, subtitleContainer.firstChild);
    Object.assign(textEl.style, {
      display: 'inline-block',
      maxWidth: '100%',
      whiteSpace: 'normal',
      wordBreak: 'break-word',
      background: 'rgba(0,0,0,0.75)',
      fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      padding: '8px 18px',
      borderRadius: '6px',
      lineHeight: '1.4',
    });
  }

  textEl.textContent = text;
  Object.assign(textEl.style, {
    color:      isFinal ? '#ffffff' : '#aaaaaa',
    fontSize:   `${settings.subtitle_font_size ?? 22}px`,
    fontWeight: isFinal ? '700' : '400',
    fontStyle:  isFinal ? 'normal' : 'italic',
  });

  if (isFinal) {
    subtitleFadeTimer = setTimeout(() => {
      subtitleContainer.style.transition = 'opacity 0.8s';
      subtitleContainer.style.opacity = '0';
    }, 4000);
  }
}

function setSubtitleProcessing(active) {
  if (!subtitleContainer) return;
  let dot = subtitleContainer.querySelector('.tct-sub-dot');
  if (active) {
    if (!dot) {
      dot = document.createElement('span');
      dot.className = 'tct-sub-dot';
      Object.assign(dot.style, {
        position: 'absolute', top: '2px', left: '6px',
        width: '7px', height: '7px',
        background: '#9147ff', borderRadius: '50%',
        animation: 'tct-pulse 1s infinite',
      });
      if (!document.getElementById('tct-sub-style')) {
        const s = document.createElement('style');
        s.id = 'tct-sub-style';
        s.textContent = '@keyframes tct-pulse{0%,100%{opacity:1}50%{opacity:0.2}}';
        document.head.appendChild(s);
      }
      subtitleContainer.style.position = 'fixed';
      subtitleContainer.appendChild(dot);
    }
  } else {
    dot?.remove();
  }
}

function clearSubtitle() {
  if (!subtitleContainer) return;
  clearTimeout(subtitleFadeTimer);
  subtitleContainer.innerHTML = '';
  subtitleContainer.style.opacity = '1';
}
