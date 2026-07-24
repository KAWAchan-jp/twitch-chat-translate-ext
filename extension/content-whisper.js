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

const GROQ_AUDIO_CHUNK_BYTES = 48 * 1024;

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
  const requestId = Math.random().toString(36).slice(2);

  const startResponse = await chrome.runtime.sendMessage({
    type: 'groq_audio_start',
    requestId,
    mimeType: blob.type,
    language: language === 'auto' ? null : language,
  });
  if (!startResponse?.ok) throw new Error(startResponse?.error || 'Groq音声送信の開始に失敗しました');

  try {
    for (let i = 0; i < bytes.length; i += GROQ_AUDIO_CHUNK_BYTES) {
      const slice = bytes.subarray(i, i + GROQ_AUDIO_CHUNK_BYTES);
      let binary = '';
      for (let j = 0; j < slice.length; j += 8192) {
        binary += String.fromCharCode(...slice.subarray(j, j + 8192));
      }
      const chunkResponse = await chrome.runtime.sendMessage({
        type: 'groq_audio_chunk',
        requestId,
        chunk: btoa(binary),
      });
      if (!chunkResponse?.ok) throw new Error(chunkResponse?.error || 'Groq音声送信に失敗しました');
    }

    const response = await chrome.runtime.sendMessage({
      type: 'groq_audio_finish',
      requestId,
    });
    if (!response.ok) throw new Error(response.error);

    const text = response.result?.trim() ?? '';
    if (isGroqHallucination(text, settings.custom_hallucination_patterns ?? [])) {
      console.log('[TCT] Groq ハルシネーション検出 → 破棄');
      return '';
    }
    return text;
  } catch (err) {
    chrome.runtime.sendMessage({ type: 'groq_audio_abort', requestId }).catch(() => {});
    throw err;
  }
}

function buildWhisperInitialPrompt() {
  const sessionPrompt = settings.whisper_prompt || twitchAutoPrompt || WHISPER_DEFAULT_PROMPTS[settings.src_lang] || '';
  const basePrompt    = [settings.whisper_prompt_default, sessionPrompt].filter(Boolean).join(' ');
  const historyText   = transcriptHistory.slice(-4).join('');
  return historyText ? `${basePrompt} ${historyText}`.trim() : basePrompt;
}

async function transcribeViaFasterWhisper(blob, language) {
  showSubtitle('Faster-Whisper 認識中...', false);
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const requestId = Math.random().toString(36).slice(2);

  const startResponse = await chrome.runtime.sendMessage({
    type: 'faster_whisper_audio_start',
    requestId,
    mimeType: blob.type,
    language: language === 'auto' ? null : language,
    initialPrompt: buildWhisperInitialPrompt(),
  });
  if (!startResponse?.ok) throw new Error(startResponse?.error || 'Faster-Whisper音声送信の開始に失敗しました');

  try {
    for (let i = 0; i < bytes.length; i += GROQ_AUDIO_CHUNK_BYTES) {
      const slice = bytes.subarray(i, i + GROQ_AUDIO_CHUNK_BYTES);
      let binary = '';
      for (let j = 0; j < slice.length; j += 8192) {
        binary += String.fromCharCode(...slice.subarray(j, j + 8192));
      }
      const chunkResponse = await chrome.runtime.sendMessage({
        type: 'faster_whisper_audio_chunk',
        requestId,
        chunk: btoa(binary),
      });
      if (!chunkResponse?.ok) throw new Error(chunkResponse?.error || 'Faster-Whisper音声送信に失敗しました');
    }

    const response = await chrome.runtime.sendMessage({
      type: 'faster_whisper_audio_finish',
      requestId,
    });
    if (!response.ok) throw new Error(response.error);

    const text = response.result?.trim() ?? '';
    if (isGroqHallucination(text, settings.custom_hallucination_patterns ?? [])) {
      console.log('[TCT] Faster-Whisper ハルシネーション検出 → 破棄');
      return '';
    }
    return text;
  } catch (err) {
    chrome.runtime.sendMessage({ type: 'faster_whisper_audio_abort', requestId }).catch(() => {});
    throw err;
  }
}

function getSupportedRecordingMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
  ];
  return candidates.find(type => MediaRecorder.isTypeSupported(type)) || '';
}

// 音声チャンクを認識エンジンへ送信（Groq → Faster-Whisper の順に試行。両方失敗/未設定ならエラー表示）
async function transcribeViaBackground(blob, mimeType, language) {
  if (settings.groq_enabled && settings.groq_api_key) {
    try {
      return await transcribeViaGroq(blob, language);
    } catch (err) {
      console.warn(`[TCT] Groq失敗: ${err.message}`);
      showSubtitle(err.message ? `⚠ Groq失敗: ${err.message}` : '⚠ Groq失敗', false);
      return null;
    }
  }

  if (settings.faster_whisper_enabled && settings.faster_whisper_url) {
    try {
      return await transcribeViaFasterWhisper(blob, language);
    } catch (err) {
      console.warn(`[TCT] Faster-Whisper失敗: ${err.message}`);
      showSubtitle(err.message ? `⚠ Faster失敗: ${err.message}` : '⚠ Faster失敗', false);
      return null;
    }
  }

  showSubtitle('⚠ 音声認識エンジンが未設定です — 設定でGroqかFaster-Whisperを有効にしてください', false);
  return null;
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

    // MediaElementSourceNode は同一 video 要素に対して1回だけ作成可能。
    // ただし Twitch は SPA 遷移・画質切替・広告で <video> を差し替えることがあり、
    // 古い要素を掴んだままだと無音になり VAD が反応しない（「録音開始」で止まる）。
    // 要素が変わっていたら破棄して作り直す
    if (voiceSourceNode && voiceSourceNode.mediaElement !== videoEl) {
      try { voiceSourceNode.disconnect(); } catch (_) {}
      voiceSourceNode = null;
    }
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

  const mimeType = getSupportedRecordingMimeType();

  function startRecordingCycle() {
    if (!isVoiceActive) return;
    audioChunks = [];
    hadSpeech   = false;
    mediaRecorder = mimeType
      ? new MediaRecorder(voiceStream, { mimeType })
      : new MediaRecorder(voiceStream);
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
      const stoppedMimeType = mediaRecorder?.mimeType || chunks.find(chunk => chunk.type)?.type || mimeType;

      startRecordingCycle();

      console.log(`[TCT] chunk stop: wasSpeech=${wasSpeech} chunks=${chunks.length} level=${cableLevel}% active=${whisperActiveCount}`);
      if (wasSpeech && chunks.length > 0) {
        const blob = new Blob(chunks, { type: stoppedMimeType });
        (async () => {
          whisperActiveCount++;
          if (whisperActiveCount === 1) setSubtitleProcessing(true);
          try {
            const text = await transcribeViaBackground(blob, blob.type || stoppedMimeType, settings.src_lang);
            if (text === null) {
              console.log('[TCT] 認識エンジン失敗/未設定・スキップ');
              return;
            }
            console.log(`[TCT] ← 認識結果: "${text}"`);
            if (!isVoiceActive) return;
            if (text?.trim() && text.trim().length >= 3) {
              transcriptHistory.push(text.trim());
              if (transcriptHistory.length > 6) transcriptHistory.shift();
              await handleFinalTranscript(text.trim());
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
  // 音量0/ミュートだと MediaElementSource の出力も無音になり VAD が反応しない
  if (videoEl.muted || videoEl.volume === 0) {
    showSubtitle('⚠ プレイヤーが音量0/ミュートです。音声認識には音量を少し上げてください', false);
  } else {
    showSubtitle('🎤 録音開始', false);
  }
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
    if (typeof addClipSubtitle === 'function') addClipSubtitle(text);
    speakTranslation(text, settings.tgt_lang);
    return;
  }
  showSubtitle(text, true);
  try {
    const translated = await translateViaBackground(text, from, settings.tgt_lang, 'voice');
    showSubtitle(translated, true);
    if (typeof addClipSubtitle === 'function') addClipSubtitle(translated);
    speakTranslation(translated, settings.tgt_lang);
  } catch {
    // 翻訳失敗時は原文を記録
    if (typeof addClipSubtitle === 'function') addClipSubtitle(text);
  }
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
    fontWeight: isFinal ? '900' : '600',
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
