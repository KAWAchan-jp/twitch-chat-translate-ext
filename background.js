'use strict';

const TWITCH_CLIENT_ID    = '1vbld5ti60dwqzmxrpfkcnk1oph5jd';
const TWITCH_REDIRECT_URI = 'https://kawachan-jp.github.io/twitch-chat-translate/';

// ===== 言語リスト =====
const SRC_LANGS = [
  ['auto', '自動検出'],
  ['en', '英語'],
  ['ko', '韓国語'],
  ['zh-CN', '中国語（簡体字）'],
  ['zh-TW', '中国語（繁体字）'],
  ['es', 'スペイン語'],
  ['fr', 'フランス語'],
  ['de', 'ドイツ語'],
  ['pt', 'ポルトガル語'],
  ['ru', 'ロシア語'],
  ['ja', '日本語'],
  ['ar', 'アラビア語'],
  ['hi', 'ヒンディー語'],
  ['th', 'タイ語'],
  ['vi', 'ベトナム語'],
  ['id', 'インドネシア語'],
];
const TGT_LANGS = SRC_LANGS.filter(([v]) => v !== 'auto');

const DEFAULT_SETTINGS = {
  src_lang: 'auto',
  tgt_lang: 'ja',
  show_original: true,
  auto_scroll: true,
};

// チャンネルページでないTwitchのパス（content.jsと同じ定義）
const EXCLUDED_PATHS = new Set([
  'directory', 'settings', 'subscriptions', 'inventory',
  'wallet', 'friends', 'messages', 'following', 'browse',
  'prime', 'drops', 'search', 'u', 'downloads', 'turbo',
  'jobs', 'store', 'popout',
]);

// ===== インストール・起動時にコンテキストメニューを構築 =====
chrome.runtime.onInstalled.addListener(buildContextMenus);
chrome.runtime.onStartup.addListener(buildContextMenus);

async function buildContextMenus() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  const s = { ...DEFAULT_SETTINGS, ...stored };
  const { version } = chrome.runtime.getManifest();

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'open_options', title: '⚙ オプションを開く', contexts: ['action'] });
    chrome.contextMenus.create({ id: 'open_help', title: '📖 使い方', contexts: ['action'] });
    chrome.contextMenus.create({ id: 'sep0', type: 'separator', contexts: ['action'] });
    chrome.contextMenus.create({ id: 'src_parent', title: '翻訳元言語', contexts: ['action'] });
    SRC_LANGS.forEach(([val, label]) => {
      chrome.contextMenus.create({
        id: `src_${val}`, parentId: 'src_parent', title: label,
        type: 'radio', checked: val === s.src_lang, contexts: ['action'],
      });
    });

    chrome.contextMenus.create({ id: 'sep1', type: 'separator', contexts: ['action'] });

    chrome.contextMenus.create({ id: 'tgt_parent', title: '翻訳先言語', contexts: ['action'] });
    TGT_LANGS.forEach(([val, label]) => {
      chrome.contextMenus.create({
        id: `tgt_${val}`, parentId: 'tgt_parent', title: label,
        type: 'radio', checked: val === s.tgt_lang, contexts: ['action'],
      });
    });

    chrome.contextMenus.create({ id: 'sep2', type: 'separator', contexts: ['action'] });
    chrome.contextMenus.create({ id: 'show_original', title: '原文を表示', type: 'checkbox', checked: s.show_original, contexts: ['action'] });
    chrome.contextMenus.create({ id: 'auto_scroll', title: '自動スクロール', type: 'checkbox', checked: s.auto_scroll, contexts: ['action'] });

    chrome.contextMenus.create({ id: 'sep3', type: 'separator', contexts: ['action'] });
    chrome.contextMenus.create({ id: 'version', title: `Twitch Chat Translator  v${version}`, enabled: false, contexts: ['action'] });
  });
}

// ===== コンテキストメニュークリック =====
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const { menuItemId, checked } = info;
  const channel = getChannelFromTabUrl(tab?.url);

  if (menuItemId === 'open_options') {
    chrome.runtime.openOptionsPage();
  } else if (menuItemId === 'open_help') {
    chrome.tabs.create({ url: chrome.runtime.getURL('help.html') });
  } else if (menuItemId.startsWith('src_')) {
    await saveChannelLangSetting(channel, 'src_lang', menuItemId.replace('src_', ''));
  } else if (menuItemId.startsWith('tgt_')) {
    await saveChannelLangSetting(channel, 'tgt_lang', menuItemId.replace('tgt_', ''));
  } else if (menuItemId === 'show_original') {
    chrome.storage.local.set({ show_original: checked });
  } else if (menuItemId === 'auto_scroll') {
    chrome.storage.local.set({ auto_scroll: checked });
  }
});

// チャンネル専用の言語設定を保存（グローバルデフォルトも更新）
async function saveChannelLangSetting(channel, key, value) {
  const update = { [key]: value }; // グローバルデフォルトを最後に使用した値に更新

  if (channel) {
    const { channel_settings = {} } = await chrome.storage.local.get('channel_settings');
    channel_settings[channel] = { ...channel_settings[channel], [key]: value };
    update.channel_settings = channel_settings;
  }

  await chrome.storage.local.set(update);
}

// ===== タブ切り替え・URL変化時にメニューのチェック状態を更新 =====
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await syncMenuToTab(tab);
  } catch {}
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url) await syncMenuToTab(tab);
});

// タブのURLに対応するチャンネルの設定をメニューに反映
async function syncMenuToTab(tab) {
  const channel = getChannelFromTabUrl(tab?.url);
  if (!channel) return;

  const stored = await chrome.storage.local.get(['src_lang', 'tgt_lang', 'channel_settings']);
  const cs = stored.channel_settings?.[channel];
  const srcLang = cs?.src_lang ?? stored.src_lang ?? DEFAULT_SETTINGS.src_lang;
  const tgtLang = cs?.tgt_lang ?? stored.tgt_lang ?? DEFAULT_SETTINGS.tgt_lang;

  SRC_LANGS.forEach(([val]) => {
    chrome.contextMenus.update(`src_${val}`, { checked: val === srcLang }).catch(() => {});
  });
  TGT_LANGS.forEach(([val]) => {
    chrome.contextMenus.update(`tgt_${val}`, { checked: val === tgtLang }).catch(() => {});
  });
}

// URLからTwitchチャンネル名を取得
function getChannelFromTabUrl(url) {
  if (!url?.includes('twitch.tv')) return null;
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    if (parts.length >= 1 && !EXCLUDED_PATHS.has(parts[0])) return parts[0].toLowerCase();
  } catch {}
  return null;
}

// ===== アイコン左クリック =====
chrome.action.onClicked.addListener(async (tab) => {
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'toggle' });
    setBadge(tab.id, res.active);
  } catch {}
});

function setBadge(tabId, active) {
  const opts = tabId ? { tabId } : {};
  chrome.action.setBadgeText({ text: active ? 'ON' : 'OFF', ...opts });
  chrome.action.setBadgeBackgroundColor({ color: active ? '#9147ff' : '#555555', ...opts });
}

// ===== メッセージ処理 =====
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'badge_update') {
    if (sender.tab?.id) setBadge(sender.tab.id, message.active);
    return;
  }

  if (message.type === 'twitch_login') {
    const scope = 'chat:read chat:edit';
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}`
      + `&redirect_uri=${encodeURIComponent(TWITCH_REDIRECT_URI)}`
      + `&response_type=token&scope=${encodeURIComponent(scope)}`;
    chrome.tabs.create({ url });
    return;
  }

  if (message.type === 'twitch_auth') {
    handleTwitchAuth(message.token);
    return;
  }

  if (message.type === 'warmup_whisper') {
    // Whisper は Twitch ページの MAIN world で動作するため
    // ウォームアップは 🎤 ボタンを押した時に自動的に開始されます
    sendResponse({ ok: true });
    return;
  }

  if (message.type === 'translate') {
    const { text, from, to, feature } = message;
    translateText(text, from, to, feature)
      .then(result => sendResponse({ ok: true, result }))
      .catch(err  => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === 'groq_transcribe') {
    const { audioBase64, mimeType, language } = message;
    groqTranscribe(audioBase64, mimeType, language)
      .then(result => sendResponse({ ok: true, result }))
      .catch(err  => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === 'twitch_api') {
    const { url, token, clientId } = message;
    fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'Client-Id': clientId } })
      .then(r => r.json())
      .then(data => sendResponse({ ok: true, data }))
      .catch(err  => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});

async function handleTwitchAuth(token) {
  try {
    const res  = await fetch('https://api.twitch.tv/helix/users', {
      headers: { 'Authorization': `Bearer ${token}`, 'Client-Id': TWITCH_CLIENT_ID },
    });
    const data = await res.json();
    const username = data.data[0]?.login;
    if (!username) throw new Error('ユーザー名取得失敗');

    await chrome.storage.local.set({ twitch_token: token, twitch_username: username });

    const tabs = await chrome.tabs.query({ url: '*://www.twitch.tv/*' });
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, { type: 'twitch_auth_complete', username }).catch(() => {});
    }
  } catch (e) {
    console.error('Twitchログイン失敗:', e);
  }
}

async function groqTranscribe(audioBase64, mimeType, language) {
  const stored = await chrome.storage.local.get(['groq_api_key', 'groq_model']);
  const apiKey = stored.groq_api_key;
  if (!apiKey) throw new Error('Groq APIキーが未設定です');

  const model = stored.groq_model || 'whisper-large-v3-turbo';

  const binary = atob(audioBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mimeType });

  const formData = new FormData();
  formData.append('file', blob, 'audio.webm');
  formData.append('model', model);
  if (language) formData.append('language', language);
  formData.append('response_format', 'json');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: formData,
      signal: controller.signal,
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(`Groq HTTP ${res.status}: ${errData.error?.message ?? res.statusText}`);
    }
    const data = await res.json();
    return data.text?.trim() ?? '';
  } finally {
    clearTimeout(timer);
  }
}

const translateCache = new Map();
const CACHE_MAX = 800;

async function translateText(text, from, to, feature = 'chat') {
  const cacheKey = `${from}:${to}:${text}`;
  if (translateCache.has(cacheKey)) return translateCache.get(cacheKey);

  const stored = await chrome.storage.local.get(['deepl_enabled', 'deepl_api_key', 'deepl_chat', 'deepl_voice', 'deepl_own', 'gemini_enabled', 'gemini_api_key', 'gemini_prompt', 'gemini_voice', 'gemini_own']);
  let result;

  // Gemini 優先（音声字幕・入力メッセージ）
  const geminiVoice = stored.gemini_voice !== false;
  const useGemini = stored.gemini_enabled && stored.gemini_api_key &&
    ((feature === 'voice' && geminiVoice) || (feature === 'own' && stored.gemini_own));
  if (useGemini) {
    try { result = await translateWithGemini(text, from, to, stored.gemini_api_key, stored.gemini_prompt || ''); } catch (e) { console.warn('[TCT] Gemini翻訳失敗、フォールバック:', e); }
  }

  if (!result) {
    const featureFlag = feature === 'voice' ? stored.deepl_voice : feature === 'own' ? stored.deepl_own : stored.deepl_chat;
    const useDeepL = stored.deepl_enabled && stored.deepl_api_key && (featureFlag !== false);
    if (useDeepL) {
      try { result = await translateWithDeepl(text, from, to, stored.deepl_api_key); } catch (e) { console.warn('[TCT] DeepL翻訳失敗、Googleにフォールバック:', e); }
    }
  }

  if (!result) result = await translateWithGoogle(text, from, to);

  if (translateCache.size >= CACHE_MAX) translateCache.delete(translateCache.keys().next().value);
  translateCache.set(cacheKey, result);
  return result;
}

// 翻訳先言語コード → Gemini プロンプト用の言語名
const GEMINI_LANG_NAMES = {
  ja: 'Japanese', en: 'English', ko: 'Korean',
  'zh-CN': 'Simplified Chinese', 'zh-TW': 'Traditional Chinese',
  es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese',
  ru: 'Russian', ar: 'Arabic', hi: 'Hindi', th: 'Thai', vi: 'Vietnamese', id: 'Indonesian',
};

const GEMINI_DEFAULT_PROMPT = `Twitchのゲーム配信のリアルタイム字幕翻訳を行います。入力は音声認識結果のため、多少の誤認識や口語表現が含まれる場合があります。ゲーム用語・スラング・配信者の言い回しを保ちながら、{lang}へ自然で簡潔に翻訳してください。翻訳結果のみ出力してください：\n{text}`;

async function translateWithGemini(text, from, to, apiKey, customPrompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  const targetLang = GEMINI_LANG_NAMES[to] || to;
  const promptTemplate = customPrompt || GEMINI_DEFAULT_PROMPT;
  const prompt = promptTemplate.replace('{lang}', targetLang).replace('{text}', text);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 512, temperature: 0.1 },
        }),
        signal: controller.signal,
      }
    );
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? text;
  } finally {
    clearTimeout(timer);
  }
}

async function translateWithDeepl(text, from, to, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  // 無料版（:fx）と有料版でエンドポイントが異なる
  const host = apiKey.endsWith(':fx') ? 'api-free.deepl.com' : 'api.deepl.com';
  const srcLang = from === 'auto' ? null : from.toUpperCase().replace('-', '_');
  const tgtLang = to.toUpperCase().replace('-', '_');
  try {
    const body = new URLSearchParams({ text, target_lang: tgtLang });
    if (srcLang) body.append('source_lang', srcLang);
    const res = await fetch(`https://${host}/v2/translate`, {
      method: 'POST',
      headers: { 'Authorization': `DeepL-Auth-Key ${apiKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`DeepL HTTP ${res.status}`);
    const data = await res.json();
    return data.translations?.[0]?.text ?? text;
  } finally {
    clearTimeout(timer);
  }
}

async function translateWithGoogle(text, from, to) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data[0] ?? []).map(item => item?.[0]).filter(Boolean).join('') || text;
  } finally {
    clearTimeout(timer);
  }
}

