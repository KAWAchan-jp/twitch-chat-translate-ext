'use strict';

document.getElementById('version').textContent =
  `v${chrome.runtime.getManifest().version}`;

// ===== ページナビゲーション =====
(function () {
  const pages    = document.querySelectorAll('.page');
  const navItems = document.querySelectorAll('.nav-item');

  function showPage(id) {
    pages.forEach(p => p.classList.toggle('active', p.id === `page-${id}`));
    navItems.forEach(n => n.classList.toggle('active', n.dataset.page === id));
    localStorage.setItem('options_page', id);
  }

  navItems.forEach(item => {
    item.addEventListener('click', () => showPage(item.dataset.page));
  });

  const savedRaw = localStorage.getItem('options_page');
  const saved = (savedRaw === 'stt' || savedRaw === 'tts' || savedRaw === 'clip') ? 'translate' : (savedRaw || 'translate');
  showPage(saved);
})();

// ===== DeepL =====
const deeplEnabledEl = document.getElementById('deeplEnabled');
const deeplChatEl    = document.getElementById('deeplChat');
const deeplOwnEl     = document.getElementById('deeplOwn');
const deeplFeaturesEl = document.getElementById('deeplFeatures');
const deeplKeyEl     = document.getElementById('deeplKey');
const toggleDeeplBtn = document.getElementById('toggleDeeplKey');
const saveDeeplBtn   = document.getElementById('saveDeeplBtn');
const saveDeeplMsg   = document.getElementById('saveDeeplMsg');

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

function updateDeeplFeaturesVisibility() {
  deeplFeaturesEl.style.opacity = deeplEnabledEl.checked ? '1' : '0.4';
  deeplFeaturesEl.style.pointerEvents = deeplEnabledEl.checked ? '' : 'none';
}

chrome.storage.local.get(['deepl_enabled', 'deepl_api_key', 'deepl_chat', 'deepl_own'], (s) => {
  deeplEnabledEl.checked = !!s.deepl_enabled;
  deeplChatEl.checked    = s.deepl_chat  !== false;
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
deeplOwnEl.addEventListener('change',   () => chrome.storage.local.set({ deepl_own:   deeplOwnEl.checked }));

saveDeeplBtn.addEventListener('click', async () => {
  const key = deeplKeyEl.value.trim();
  if (!key) { showDeeplMsg('⚠ キーを入力してください', '#e84393'); return; }
  await chrome.storage.local.set({ deepl_api_key: key, deepl_enabled: true });
  deeplEnabledEl.checked = true;
  updateDeeplFeaturesVisibility();
  showDeeplMsg('✓ 保存しました', '#00b894');
});

// ===== Gemini =====
const GEMINI_DEFAULT_PROMPT = `Twitchのゲーム配信のリアルタイム翻訳を行います。ゲーム用語・スラング・配信者の言い回しを保ちながら、{lang}へ自然で簡潔に翻訳してください。翻訳結果のみ出力してください：\n{text}`;

const geminiEnabledEl    = document.getElementById('geminiEnabled');
const geminiOwnEl        = document.getElementById('geminiOwn');
const geminiKeyEl        = document.getElementById('geminiKey');
const geminiPromptEl     = document.getElementById('geminiPrompt');
const toggleGeminiBtn    = document.getElementById('toggleGeminiKey');
const resetGeminiPromBtn = document.getElementById('resetGeminiPrompt');
const saveGeminiBtn      = document.getElementById('saveGeminiBtn');
const saveGeminiMsg      = document.getElementById('saveGeminiMsg');
const geminiModelEls     = document.querySelectorAll('input[name="geminiModel"]');

function showGeminiMsg(text, color) {
  saveGeminiMsg.textContent = text;
  saveGeminiMsg.style.color = color;
  saveGeminiMsg.style.opacity = '1';
  clearTimeout(showGeminiMsg._timer);
  showGeminiMsg._timer = setTimeout(() => {
    saveGeminiMsg.style.opacity = '0';
    setTimeout(() => { saveGeminiMsg.textContent = ''; }, 300);
  }, 3000);
}

chrome.storage.local.get(['gemini_enabled', 'gemini_own', 'gemini_api_key', 'gemini_prompt', 'gemini_model'], (s) => {
  geminiEnabledEl.checked = !!s.gemini_enabled;
  geminiOwnEl.checked     = !!s.gemini_own;
  if (s.gemini_api_key) geminiKeyEl.value = s.gemini_api_key;
  geminiPromptEl.value = s.gemini_prompt ?? GEMINI_DEFAULT_PROMPT;
  const model = s.gemini_model || 'gemini-2.5-flash';
  geminiModelEls.forEach(el => { el.checked = el.value === model; });
});

toggleGeminiBtn.addEventListener('click', () => {
  const isHidden = geminiKeyEl.type === 'password';
  geminiKeyEl.type = isHidden ? 'text' : 'password';
  toggleGeminiBtn.textContent = isHidden ? '隠す' : '表示';
});

resetGeminiPromBtn.addEventListener('click', () => {
  geminiPromptEl.value = GEMINI_DEFAULT_PROMPT;
});

geminiModelEls.forEach(el => {
  el.addEventListener('change', () => {
    if (el.checked) chrome.storage.local.set({ gemini_model: el.value });
  });
});

geminiEnabledEl.addEventListener('change', () => {
  chrome.storage.local.set({ gemini_enabled: geminiEnabledEl.checked });
});
geminiOwnEl.addEventListener('change', () => {
  chrome.storage.local.set({ gemini_own: geminiOwnEl.checked });
});

saveGeminiBtn.addEventListener('click', async () => {
  const key = geminiKeyEl.value.trim();
  if (!key) { showGeminiMsg('⚠ キーを入力してください', '#e84393'); return; }
  const prompt = geminiPromptEl.value.trim();
  const model = [...geminiModelEls].find(el => el.checked)?.value ?? 'gemini-2.5-flash';
  await chrome.storage.local.set({
    gemini_api_key: key, gemini_enabled: true,
    gemini_own: geminiOwnEl.checked,
    gemini_prompt: prompt, gemini_model: model,
  });
  geminiEnabledEl.checked = true;
  showGeminiMsg('✓ 保存しました', '#00b894');
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

// ===== デフォルト翻訳先言語 =====
const defaultTgtLangEl = document.getElementById('defaultTgtLang');

chrome.storage.local.get('tgt_lang', ({ tgt_lang }) => {
  defaultTgtLangEl.value = tgt_lang ?? 'ja';
});

defaultTgtLangEl.addEventListener('change', () => {
  chrome.storage.local.set({ tgt_lang: defaultTgtLangEl.value });
});

// ===== 送信前確認（ワンクッション） =====
const sendConfirmEl = document.getElementById('sendConfirm');

chrome.storage.local.get('send_confirm', ({ send_confirm }) => {
  sendConfirmEl.checked = send_confirm !== false; // デフォルトON
});

sendConfirmEl.addEventListener('change', () => {
  chrome.storage.local.set({ send_confirm: sendConfirmEl.checked });
});

// ===== パネル透過率 =====
const panelOpacityEl    = document.getElementById('panelOpacity');
const panelOpacityValEl = document.getElementById('panelOpacityVal');

chrome.storage.local.get('panel_opacity', ({ panel_opacity }) => {
  const v = panel_opacity ?? 0.8;
  panelOpacityEl.value       = v;
  panelOpacityValEl.textContent = Math.round(v * 100);
});

panelOpacityEl.addEventListener('input', () => {
  const v = Number(panelOpacityEl.value);
  panelOpacityValEl.textContent = Math.round(v * 100);
  chrome.storage.local.set({ panel_opacity: v });
});

// ===== ボット・ユーザー無視 =====
const ignoreKnownBotsEl   = document.getElementById('ignoreKnownBots');
const ignoreBotBadgeEl    = document.getElementById('ignoreBotBadge');
const ignoreUsersEl       = document.getElementById('ignoreUsers');
const saveIgnoreUsersBtn  = document.getElementById('saveIgnoreUsers');
const saveIgnoreUsersMsgEl = document.getElementById('saveIgnoreUsersMsg');

chrome.storage.local.get(['ignore_known_bots', 'ignore_bot_badge', 'ignore_users'], ({ ignore_known_bots, ignore_bot_badge, ignore_users }) => {
  ignoreKnownBotsEl.checked = ignore_known_bots !== false; // デフォルトON
  ignoreBotBadgeEl.checked  = !!ignore_bot_badge;
  ignoreUsersEl.value       = ignore_users ?? '';
});

ignoreKnownBotsEl.addEventListener('change', () => {
  chrome.storage.local.set({ ignore_known_bots: ignoreKnownBotsEl.checked });
});

ignoreBotBadgeEl.addEventListener('change', () => {
  chrome.storage.local.set({ ignore_bot_badge: ignoreBotBadgeEl.checked });
});

saveIgnoreUsersBtn.addEventListener('click', () => {
  chrome.storage.local.set({ ignore_users: ignoreUsersEl.value.trim() }, () => {
    saveIgnoreUsersMsgEl.style.display = 'inline';
    setTimeout(() => { saveIgnoreUsersMsgEl.style.display = 'none'; }, 2000);
  });
});
