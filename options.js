'use strict';

document.getElementById('version').textContent =
  `v${chrome.runtime.getManifest().version}`;

// ===== ローカル Whisper ウォームアップ =====
const warmupBtn    = document.getElementById('warmupBtn');
const warmupStatus = document.getElementById('warmupStatus');

warmupBtn.addEventListener('click', () => {
  warmupStatus.textContent = 'Twitch ページで 🎤 ボタンを押すと自動的にモデルがロードされます';
  warmupStatus.style.color = '#adadb8';
});

// ===== Whisper モデル選択 =====
const whisperModelEls = document.querySelectorAll('input[name="whisperModel"]');
chrome.storage.local.get('whisper_model', ({ whisper_model }) => {
  const val = whisper_model ?? 'tiny';
  whisperModelEls.forEach(el => { el.checked = el.value === val; });
});
whisperModelEls.forEach(el => {
  el.addEventListener('change', () => {
    if (el.checked) chrome.storage.local.set({ whisper_model: el.value });
  });
});

// ===== Whisper 認識ヒント =====
const whisperPromptEl = document.getElementById('whisperPrompt');
chrome.storage.local.get('whisper_prompt', ({ whisper_prompt }) => {
  whisperPromptEl.value = whisper_prompt ?? '';
});
whisperPromptEl.addEventListener('change', () => {
  chrome.storage.local.set({ whisper_prompt: whisperPromptEl.value.trim() });
});

// ===== 字幕フォントサイズ =====
const fontSizeEl  = document.getElementById('subtitleFontSize');
const fontSizeVal = document.getElementById('subtitleFontSizeVal');

chrome.storage.local.get('subtitle_font_size', ({ subtitle_font_size }) => {
  const size = subtitle_font_size ?? 22;
  fontSizeEl.value       = size;
  fontSizeVal.textContent = `${size}px`;
});

fontSizeEl.addEventListener('input', () => {
  const size = Number(fontSizeEl.value);
  fontSizeVal.textContent = `${size}px`;
  chrome.storage.local.set({ subtitle_font_size: size });
});

// ===== DeepL =====
const deeplEnabledEl = document.getElementById('deeplEnabled');
const deeplChatEl    = document.getElementById('deeplChat');
const deeplVoiceEl   = document.getElementById('deeplVoice');
const deeplOwnEl     = document.getElementById('deeplOwn');
const deeplFeaturesEl = document.getElementById('deeplFeatures');
const deeplKeyEl     = document.getElementById('deeplKey');
const toggleDeeplBtn = document.getElementById('toggleDeeplKey');
const saveDeeplBtn   = document.getElementById('saveDeeplBtn');
const saveDeeplMsg   = document.getElementById('saveDeeplMsg');

function updateDeeplFeaturesVisibility() {
  deeplFeaturesEl.style.opacity = deeplEnabledEl.checked ? '1' : '0.4';
  deeplFeaturesEl.style.pointerEvents = deeplEnabledEl.checked ? '' : 'none';
}

chrome.storage.local.get(['deepl_enabled', 'deepl_api_key', 'deepl_chat', 'deepl_voice', 'deepl_own'], (s) => {
  deeplEnabledEl.checked = !!s.deepl_enabled;
  deeplChatEl.checked    = s.deepl_chat  !== false;
  deeplVoiceEl.checked   = s.deepl_voice !== false;
  deeplOwnEl.checked     = s.deepl_own   !== false;
  if (s.deepl_api_key) deeplKeyEl.value = s.deepl_api_key;
  updateDeeplFeaturesVisibility();
});

toggleDeeplBtn.addEventListener('click', () => {
  const isHidden = deeplKeyEl.type === 'password';
  deeplKeyEl.type = isHidden ? 'text' : 'password';
  toggleDeeplBtn.textContent = isHidden ? '隠す' : '表示';
});

deeplEnabledEl.addEventListener('change', () => {
  chrome.storage.local.set({ deepl_enabled: deeplEnabledEl.checked });
  updateDeeplFeaturesVisibility();
});

deeplChatEl.addEventListener('change',  () => chrome.storage.local.set({ deepl_chat:  deeplChatEl.checked }));
deeplVoiceEl.addEventListener('change', () => chrome.storage.local.set({ deepl_voice: deeplVoiceEl.checked }));
deeplOwnEl.addEventListener('change',   () => chrome.storage.local.set({ deepl_own:   deeplOwnEl.checked }));

saveDeeplBtn.addEventListener('click', async () => {
  const key = deeplKeyEl.value.trim();
  if (!key) { showDeeplMsg('⚠ キーを入力してください', '#e84393'); return; }
  await chrome.storage.local.set({ deepl_api_key: key, deepl_enabled: true });
  deeplEnabledEl.checked = true;
  updateDeeplFeaturesVisibility();
  showDeeplMsg('✓ 保存しました', '#00b894');
});

function showDeeplMsg(text, color) {
  saveDeeplMsg.textContent = text;
  saveDeeplMsg.style.color = color;
  saveDeeplMsg.style.opacity = '1';
  clearTimeout(showDeeplMsg._timer);
  showDeeplMsg._timer = setTimeout(() => {
    saveDeeplMsg.style.opacity = '0';
    setTimeout(() => { saveDeeplMsg.textContent = ''; }, 300);
  }, 3000);
}

// ===== VAD 感度 =====
const vadThresholdEl    = document.getElementById('vadThreshold');
const vadThresholdVal   = document.getElementById('vadThresholdVal');
const vadSilenceMsEl    = document.getElementById('vadSilenceMs');
const vadSilenceMsVal   = document.getElementById('vadSilenceMsVal');

chrome.storage.local.get(['vad_threshold', 'vad_silence_ms'], ({ vad_threshold, vad_silence_ms }) => {
  vadThresholdEl.value      = vad_threshold  ?? 10;
  vadThresholdVal.textContent = vadThresholdEl.value;
  vadSilenceMsEl.value      = vad_silence_ms ?? 500;
  vadSilenceMsVal.textContent = vadSilenceMsEl.value;
});

vadThresholdEl.addEventListener('input', () => {
  vadThresholdVal.textContent = vadThresholdEl.value;
  chrome.storage.local.set({ vad_threshold: Number(vadThresholdEl.value) });
});

vadSilenceMsEl.addEventListener('input', () => {
  vadSilenceMsVal.textContent = vadSilenceMsEl.value;
  chrome.storage.local.set({ vad_silence_ms: Number(vadSilenceMsEl.value) });
});

// ===== 言語フィルター =====
const sameLangFilterEl = document.getElementById('sameLangFilter');
chrome.storage.local.get('same_lang_filter', ({ same_lang_filter }) => {
  sameLangFilterEl.checked = !!same_lang_filter;
});
sameLangFilterEl.addEventListener('change', () => {
  chrome.storage.local.set({ same_lang_filter: sameLangFilterEl.checked });
});

// ===== 最小文字数フィルター =====
const minLengthEnabledEl = document.getElementById('minLengthEnabled');
const minLengthEl        = document.getElementById('minLength');
const minLengthValEl     = document.getElementById('minLengthVal');
const minLengthFieldEl   = document.getElementById('minLengthField');

function updateMinLengthVisibility() {
  minLengthFieldEl.style.opacity      = minLengthEnabledEl.checked ? '1' : '0.4';
  minLengthFieldEl.style.pointerEvents = minLengthEnabledEl.checked ? '' : 'none';
}

chrome.storage.local.get(['min_length_enabled', 'min_length'], ({ min_length_enabled, min_length }) => {
  minLengthEnabledEl.checked  = !!min_length_enabled;
  minLengthEl.value           = min_length ?? 4;
  minLengthValEl.textContent  = minLengthEl.value;
  updateMinLengthVisibility();
});

minLengthEnabledEl.addEventListener('change', () => {
  chrome.storage.local.set({ min_length_enabled: minLengthEnabledEl.checked });
  updateMinLengthVisibility();
});

minLengthEl.addEventListener('input', () => {
  minLengthValEl.textContent = minLengthEl.value;
  chrome.storage.local.set({ min_length: Number(minLengthEl.value) });
});
