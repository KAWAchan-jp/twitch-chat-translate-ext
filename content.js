'use strict';

// ===== 定数 =====
const TWITCH_WS_URL = 'wss://irc-ws.chat.twitch.tv:443';
const MAX_MESSAGES  = 150;
const WS_RECONNECT_MAX_DELAY_MS = 30000;
const TRANSLATE_DELAY_MS = 100;
const TRANSLATE_SKIP_PATTERNS = [
  /^[!\/]/,
  /^[^\p{L}\p{N}]+$/u,
];
const WHISPER_DEFAULT_PROMPTS = {
  en:      'Twitch stream. Gaming commentary.',
  ja:      'Twitchゲーム実況配信。',
  ko:      '트위치 게임 방송.',
  'zh-CN': 'Twitch游戏直播。',
  'zh-TW': 'Twitch遊戲直播。',
  ru:      'Трансляция игр на Twitch.',
  es:      'Transmisión de juegos en Twitch.',
  fr:      'Stream de jeux sur Twitch.',
  de:      'Twitch Gaming-Stream.',
  pt:      'Stream de jogos na Twitch.',
  id:      'Siaran langsung game di Twitch.',
  hi:      'Twitch गेम स्ट्रीम।',
};

const LANG_SCRIPT_PATTERNS = {
  ja:      /[぀-ゟ゠-ヿ]/,
  ko:      /[가-힯ᄀ-ᇿ]/,
  'zh-CN': /[一-鿿]/,
  'zh-TW': /[一-鿿]/,
  ru:      /[Ѐ-ӿ]/,
  ar:      /[؀-ۿ]/,
  th:      /[฀-๿]/,
  hi:      /[ऀ-ॿ]/,
};
const EXCLUDED_PATHS = new Set([
  'directory', 'settings', 'subscriptions', 'inventory',
  'wallet', 'friends', 'messages', 'following', 'browse',
  'prime', 'drops', 'search', 'u', 'downloads', 'turbo',
  'jobs', 'store', 'popout',
]);

// ===== 状態 =====
let ws              = null;
let wsReconnectDelay = 1000;
let wsReconnectTimer = null;
let currentChannel  = '';
let hasChannelSpecificSettings = false;
let twitchAutoPrompt    = '';
const transcriptHistory = [];
let isActive        = true;
let isAuthenticated = false;
let twitchToken     = '';
let twitchUsername  = '';
let settings = { src_lang: 'auto', tgt_lang: 'ja', show_original: true, auto_scroll: true, subtitle_font_size: 22, vad_threshold: 10, vad_silence_ms: 500, deepl_enabled: false, deepl_chat: true, deepl_voice: true, deepl_own: true, gemini_enabled: false, min_length_enabled: false, min_length: 4, same_lang_filter: false, whisper_model: 'tiny', whisper_prompt: '', whisper_prompt_default: '', whisper_max_chunk_ms: 5000, whisper_num_beams: 1, downloaded_models: [] };

// ===== Shadow DOM 内のDOM参照 =====
let container, shadowRoot, panel, messagesEl, scrollToBottomBtnEl, statusDotEl, channelNameEl, langIndicatorEl, gameNameEl, hintInputEl;
let authBarEl, loginBtnEl, authInfoEl, authUsernameEl, logoutBtnEl;
let scrollPaused = false;
let chatInputEl, sendBtnEl;

// ===== 初期化 =====
async function init() {
  const stored = await chrome.storage.local.get([
    'src_lang', 'tgt_lang', 'show_original', 'auto_scroll',
    'twitch_token', 'twitch_username', 'channel_settings', 'min_length_enabled', 'min_length', 'same_lang_filter', 'whisper_model', 'whisper_prompt', 'whisper_prompt_default', 'whisper_max_chunk_ms', 'whisper_num_beams',
    'subtitle_font_size', 'vad_threshold', 'vad_silence_ms', 'deepl_enabled', 'deepl_chat', 'deepl_voice', 'deepl_own', 'gemini_enabled', 'downloaded_models', 'custom_hallucination_patterns', 'panel_opacity',
  ]);
  settings = { ...settings, ...stored };

  if (stored.twitch_token && stored.twitch_username) {
    twitchToken     = stored.twitch_token;
    twitchUsername  = stored.twitch_username;
    isAuthenticated = true;
  }

  createPanel();
  applyPanelOpacity();
  await detectAndConnect();
  hookNavigation();

  chrome.storage.onChanged.addListener(onSettingsChanged);
  notifyBadge(isActive);
}

function getChannelFromUrl() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts.length >= 1 && !EXCLUDED_PATHS.has(parts[0])) return parts[0].toLowerCase();
  return null;
}

async function detectAndConnect() {
  // SPA ナビゲーションで body が差し替えられた場合にコンテナを再追加
  if (container && !document.body.contains(container)) {
    document.body.appendChild(container);
  }

  const ch = getChannelFromUrl();
  if (ch && ch !== currentChannel) {
    const isChannelSwitch = !!currentChannel;
    disconnect();
    currentChannel = ch;
    if (isChannelSwitch && settings.whisper_prompt) {
      settings.whisper_prompt = '';
      chrome.storage.local.set({ whisper_prompt: '' });
      console.log('[TCT] チャンネル移動 → カスタムヒントをリセット');
    }
    await loadChannelSettings(ch);
    resetMessages();
    updateTwitchAutoPrompt();
    watchForGameLink();
    if (isActive) connect();
    else {
      if (channelNameEl) channelNameEl.textContent = `#${ch} (停止中)`;
      setStatus('error');
    }
  } else if (!ch && currentChannel) {
    disconnect();
    currentChannel = '';
    if (channelNameEl) channelNameEl.textContent = '接続待ち';
    setStatus('connecting');
  }
}

// チャンネル固有の言語設定をストレージから読み込む（なければグローバル設定を使用）
async function loadChannelSettings(channel) {
  const stored = await chrome.storage.local.get(['src_lang', 'tgt_lang', 'channel_settings']);
  const cs = stored.channel_settings?.[channel];
  hasChannelSpecificSettings = !!(cs?.src_lang || cs?.tgt_lang);
  settings.src_lang = cs?.src_lang ?? stored.src_lang ?? 'auto';
  settings.tgt_lang = cs?.tgt_lang ?? stored.tgt_lang ?? 'ja';
  updateInputPlaceholder();
  updateLangIndicator();
}

// ===== Twitch 配信言語自動検出 =====
const TWITCH_LANG_MAP = {
  'japanese': 'ja', '日本語': 'ja',
  'english': 'en',
  'korean': 'ko', '한국어': 'ko',
  'chinese': 'zh-CN', '中文': 'zh-CN', '普通话': 'zh-CN',
  'chinese (traditional)': 'zh-TW', '繁體中文': 'zh-TW',
  'russian': 'ru', 'русский': 'ru',
  'spanish': 'es', 'español': 'es',
  'french': 'fr', 'français': 'fr',
  'german': 'de', 'deutsch': 'de',
  'portuguese': 'pt', 'português': 'pt',
  'arabic': 'ar', 'العربية': 'ar',
  'hindi': 'hi', 'हिन्दी': 'hi',
  'thai': 'th', 'ภาษาไทย': 'th',
  'vietnamese': 'vi', 'tiếng việt': 'vi',
  'indonesian': 'id', 'bahasa indonesia': 'id',
};

function detectTwitchStreamLang() {
  const tagEls = document.querySelectorAll('a[aria-label^="タグ、"]');
  for (const el of tagEls) {
    const label = el.getAttribute('aria-label') ?? '';
    const text = label.replace(/^タグ、/, '').trim().toLowerCase();
    if (text && TWITCH_LANG_MAP[text]) return TWITCH_LANG_MAP[text];
  }
  return null;
}

function updateTwitchAutoPrompt() {
  const ch = currentChannel || getChannelFromUrl() || '';
  const gameEl = document.querySelector('a[data-a-target="stream-game-link"]');
  const gameName = gameEl?.textContent?.trim() ?? '';
  if (gameNameEl) gameNameEl.textContent = gameName;

  const detectedLang = detectTwitchStreamLang();
  if (detectedLang) {
    settings.src_lang = detectedLang;
    updateLangIndicator();
    console.log(`[TCT] 配信言語を自動検出: ${detectedLang}`);
  }

  const base = WHISPER_DEFAULT_PROMPTS[settings.src_lang] || WHISPER_DEFAULT_PROMPTS.ja;
  const parts = [base];
  if (settings.src_lang === 'ja') {
    if (ch) parts.push(`配信者: ${ch}。`);
    if (gameName) parts.push(`ゲーム: ${gameName}。`);
  } else {
    if (ch) parts.push(`Streamer: ${ch}. `);
    if (gameName) parts.push(`Game: ${gameName}. `);
  }
  twitchAutoPrompt = parts.join('');
  console.log(`[TCT] auto prompt: "${twitchAutoPrompt}"`);

  if (hintInputEl && !settings.whisper_prompt && shadowRoot?.activeElement !== hintInputEl) {
    syncHintInput();
  }
}

// 入力欄の表示を現在有効なヒントに同期する
function syncHintInput() {
  if (!hintInputEl) return;
  if (settings.whisper_prompt) {
    hintInputEl.value = settings.whisper_prompt;
    hintInputEl.classList.remove('auto');
  } else {
    hintInputEl.value = twitchAutoPrompt;
    hintInputEl.classList.add('auto');
  }
}

let _gameLinkObserver = null;

// 言語タグが遅れてロードされる場合に備えて最大5回リトライ
function retryLangDetect(attempt = 0) {
  if (attempt >= 5) return;
  setTimeout(() => {
    const detected = detectTwitchStreamLang();
    if (detected) {
      settings.src_lang = detected;
      updateLangIndicator();
      updateTwitchAutoPrompt();
      console.log(`[TCT] 配信言語を遅延検出(${attempt + 1}回目): ${detected}`);
    } else {
      retryLangDetect(attempt + 1);
    }
  }, 500 * (attempt + 1));
}

function watchForGameLink() {
  if (_gameLinkObserver) { _gameLinkObserver.disconnect(); _gameLinkObserver = null; }

  if (document.querySelector('a[data-a-target="stream-game-link"]')) {
    updateTwitchAutoPrompt();
    setTimeout(() => retryLangDetect(), 1000);
    return;
  }

  _gameLinkObserver = new MutationObserver(() => {
    if (document.querySelector('a[data-a-target="stream-game-link"]')) {
      _gameLinkObserver.disconnect();
      _gameLinkObserver = null;
      updateTwitchAutoPrompt();
      setTimeout(() => retryLangDetect(), 1000);
    }
  });
  _gameLinkObserver.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => { if (_gameLinkObserver) { _gameLinkObserver.disconnect(); _gameLinkObserver = null; } }, 60000);
}

function hookNavigation() {
  ['pushState', 'replaceState'].forEach(method => {
    const orig = history[method].bind(history);
    history[method] = (...args) => { orig(...args); setTimeout(() => detectAndConnect(), 300); };
  });
  window.addEventListener('popstate', () => setTimeout(() => detectAndConnect(), 300));

  // Twitch SPA ナビゲーションの確実な検知（タイトル変化を監視）
  const titleEl = document.querySelector('title');
  if (titleEl) {
    new MutationObserver(() => detectAndConnect()).observe(titleEl, { childList: true });
  }
}

function onSettingsChanged(changes) {
  if (changes.channel_settings && currentChannel) {
    const cs = changes.channel_settings.newValue?.[currentChannel];
    if (cs) {
      hasChannelSpecificSettings = !!(cs.src_lang || cs.tgt_lang);
      if (cs.src_lang !== undefined) settings.src_lang = cs.src_lang;
      if (cs.tgt_lang !== undefined) settings.tgt_lang = cs.tgt_lang;
      updateInputPlaceholder();
      updateLangIndicator();
    }
    return;
  }
  if (changes.src_lang) settings.src_lang = changes.src_lang.newValue;
  if (changes.tgt_lang) settings.tgt_lang = changes.tgt_lang.newValue;
  if (changes.show_original) {
    settings.show_original = changes.show_original.newValue;
    panel?.classList.toggle('show-original', settings.show_original);
  }
  if (changes.auto_scroll) {
    settings.auto_scroll = changes.auto_scroll.newValue;
    if (settings.auto_scroll) scrollToBottom();
  }
  if (changes.src_lang || changes.tgt_lang) { updateInputPlaceholder(); updateLangIndicator(); }
  if (changes.subtitle_font_size) settings.subtitle_font_size = changes.subtitle_font_size.newValue;
  if (changes.vad_threshold)  settings.vad_threshold  = changes.vad_threshold.newValue;
  if (changes.vad_silence_ms) settings.vad_silence_ms = changes.vad_silence_ms.newValue;
  if (changes.deepl_enabled) { settings.deepl_enabled = changes.deepl_enabled.newValue; updateLangIndicator(); updateFooter(); }
  if (changes.deepl_chat)    { settings.deepl_chat    = changes.deepl_chat.newValue;    updateLangIndicator(); updateFooter(); }
  if (changes.deepl_voice)   { settings.deepl_voice   = changes.deepl_voice.newValue;   updateFooter(); }
  if (changes.deepl_own)     { settings.deepl_own     = changes.deepl_own.newValue;     updateFooter(); }
  if (changes.gemini_enabled){ settings.gemini_enabled = changes.gemini_enabled.newValue; updateFooter(); }
  if (changes.min_length_enabled) settings.min_length_enabled = changes.min_length_enabled.newValue;
  if (changes.min_length)         settings.min_length         = changes.min_length.newValue;
  if (changes.same_lang_filter)   settings.same_lang_filter   = changes.same_lang_filter.newValue;
  if (changes.whisper_model) {
    settings.whisper_model = changes.whisper_model.newValue;
    restartWhisperWorkers();
  }
  if (changes.whisper_prompt)         settings.whisper_prompt         = changes.whisper_prompt.newValue;
  if (changes.whisper_prompt_default) settings.whisper_prompt_default = changes.whisper_prompt_default.newValue;
  if (changes.whisper_max_chunk_ms)  settings.whisper_max_chunk_ms  = changes.whisper_max_chunk_ms.newValue;
  if (changes.whisper_num_beams)     settings.whisper_num_beams     = changes.whisper_num_beams.newValue;
  if (changes.downloaded_models)          settings.downloaded_models          = changes.downloaded_models.newValue ?? [];
  if (changes.custom_hallucination_patterns) settings.custom_hallucination_patterns = changes.custom_hallucination_patterns.newValue ?? [];
  if (changes.panel_opacity) {
    settings.panel_opacity = changes.panel_opacity.newValue;
    applyPanelOpacity();
  }
}

function notifyBadge(active) {
  chrome.runtime.sendMessage({ type: 'badge_update', active }).catch(() => {});
}

// ===== background.jsからのメッセージ =====
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'toggle') {
    setActive(!isActive);
    sendResponse({ active: isActive });
  }
  if (msg.type === 'twitch_auth_complete') {
    twitchToken     = '';
    twitchUsername  = msg.username;
    isAuthenticated = true;
    chrome.storage.local.get('twitch_token', ({ twitch_token }) => {
      twitchToken = twitch_token || '';
      updateAuthUI();
      addSystemMessage(`ログイン成功: ${msg.username}`);
      if (currentChannel) { disconnect(); connect(); }
    });
  }
  if (msg.type === 'whisper_status' && isVoiceActive) {
    showSubtitle(msg.text, false);
  }
});

function setActive(active) {
  isActive = active;
  if (active) {
    container.style.display = '';
    if (currentChannel && !ws) connect();
  } else {
    container.style.display = 'none';
    disconnect();
  }
  notifyBadge(active);
}

// ===== ユーティリティ =====
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ===== 起動 =====
init();
