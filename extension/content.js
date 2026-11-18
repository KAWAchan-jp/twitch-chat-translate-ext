'use strict';

// ===== 定数 =====
const TWITCH_WS_URL = 'wss://irc-ws.chat.twitch.tv:443';
const MAX_MESSAGES  = 150;
const WS_RECONNECT_MIN_DELAY_MS = 1000;
const WS_RECONNECT_MAX_DELAY_MS = 30000;
const WS_RECONNECT_JITTER_RATIO = 0.2;
const NAVIGATION_DEBOUNCE_MS = 300;
const TRANSLATE_DELAY_MS = 100;
const TRANSLATE_SKIP_PATTERNS = [
  /^[!\/]/,
  /^[^\p{L}\p{N}]+$/u,
];
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
let wsReconnectDelay = WS_RECONNECT_MIN_DELAY_MS;
let wsReconnectTimer = null;
let detectConnectTimer = null;
let detectConnectRunning = false;
let detectConnectQueued = false;
let currentChannel  = '';
let hasChannelSpecificSettings = false;
let isActive        = false;
let isAuthenticated = false;
let twitchToken     = '';
let twitchUsername  = '';
let settings = { src_lang: 'auto', tgt_lang: 'ja', show_original: true, auto_scroll: true, deepl_enabled: false, deepl_chat: true, deepl_own: true, gemini_enabled: false, gemini_own: false, min_length_enabled: false, min_length: 4, same_lang_filter: false, ignore_bot_badge: false, ignore_known_bots: true, ignore_users: '', send_confirm: true };

// ===== Shadow DOM 内のDOM参照 =====
let container, shadowRoot, panel, messagesEl, scrollToBottomBtnEl, statusDotEl, channelNameEl, langIndicatorEl, gameNameEl;
let loginBtnEl, authInfoEl, authUsernameEl, logoutBtnEl;
let scrollPaused = false;
let chatInputEl, sendBtnEl, mentionListEl;
let confirmAreaEl, confirmOrigEl, confirmTextEl;
let confirmSendBtnEl, confirmCancelBtnEl;
let pendingSend = null;  // 送信前確認待ちの内容 { sendText, typedText }

// ===== メンション自動補完 =====
let chatters = new Map();   // ユーザー名(小文字)→表示名。最近発言した順（古い→新しい）
let mentionMatches = [];    // 現在表示中の候補 [[lname, displayName], ...]
let mentionActiveIndex = -1;
let mentionTokenStart = -1; // 入力欄内の "@" の位置

async function safeStorageGet(keys, fallback = {}) {
  try {
    return await chrome.storage.local.get(keys);
  } catch (e) {
    console.warn('[TCT] storage.get failed:', e);
    return fallback;
  }
}

async function safeStorageSet(items) {
  try {
    await chrome.storage.local.set(items);
    return true;
  } catch (e) {
    console.warn('[TCT] storage.set failed:', e);
    addSystemMessage?.('設定の保存に失敗しました。ページを更新して再試行してください。');
    return false;
  }
}

async function safeStorageRemove(keys) {
  try {
    await chrome.storage.local.remove(keys);
    return true;
  } catch (e) {
    console.warn('[TCT] storage.remove failed:', e);
    addSystemMessage?.('設定の削除に失敗しました。ページを更新して再試行してください。');
    return false;
  }
}

// ===== 初期化 =====
async function init() {
  const stored = await safeStorageGet([
    'src_lang', 'tgt_lang', 'show_original', 'auto_scroll',
    'twitch_token', 'twitch_username', 'channel_settings', 'min_length_enabled', 'min_length', 'same_lang_filter',
    'deepl_enabled', 'deepl_chat', 'deepl_own', 'gemini_enabled', 'gemini_own', 'panel_opacity',
    'ignore_bot_badge', 'ignore_known_bots', 'ignore_users',
    'panel_collapsed', 'send_confirm',
  ]);
  settings = { ...settings, ...stored };

  if (stored.twitch_token && stored.twitch_username) {
    twitchToken     = stored.twitch_token;
    twitchUsername  = stored.twitch_username;
    isAuthenticated = true;
  }

  createPanel();
  container.style.display = 'none';
  applyPanelOpacity();
  if (stored.panel_collapsed) applyCollapsedState(true);
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
  if (detectConnectRunning) {
    detectConnectQueued = true;
    return;
  }
  detectConnectRunning = true;

  try {
    // SPA ナビゲーションで body が差し替えられた場合にコンテナを再追加
    if (container && !document.body.contains(container)) {
      document.body.appendChild(container);
    }

    const ch = getChannelFromUrl();
    if (ch && ch !== currentChannel) {
      disconnect();
      currentChannel = ch;
      await loadChannelSettings(ch);
      resetMessages();
      updateTwitchStreamInfo();
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
  } catch (e) {
    console.warn('[TCT] チャンネル検出/接続処理に失敗:', e);
    setStatus('error');
  } finally {
    detectConnectRunning = false;
    if (detectConnectQueued) {
      detectConnectQueued = false;
      scheduleDetectAndConnect();
    }
  }
}

// チャンネル固有の言語設定をストレージから読み込む（なければグローバル設定を使用）
async function loadChannelSettings(channel) {
  const stored = await safeStorageGet(['src_lang', 'tgt_lang', 'channel_settings']);
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

function updateTwitchStreamInfo() {
  const gameEl = document.querySelector('a[data-a-target="stream-game-link"]');
  const gameName = gameEl?.textContent?.trim() ?? '';
  if (gameNameEl) gameNameEl.textContent = gameName;

  const detectedLang = detectTwitchStreamLang();
  if (detectedLang) {
    settings.src_lang = detectedLang;
    updateLangIndicator();
    updateInputPlaceholder();
    console.log(`[TCT] 配信言語を自動検出: ${detectedLang}`);
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
      updateTwitchStreamInfo();
      console.log(`[TCT] 配信言語を遅延検出(${attempt + 1}回目): ${detected}`);
    } else {
      retryLangDetect(attempt + 1);
    }
  }, 500 * (attempt + 1));
}

function watchForGameLink() {
  if (_gameLinkObserver) { _gameLinkObserver.disconnect(); _gameLinkObserver = null; }

  if (document.querySelector('a[data-a-target="stream-game-link"]')) {
    updateTwitchStreamInfo();
    setTimeout(() => retryLangDetect(), 1000);
    return;
  }

  _gameLinkObserver = new MutationObserver(() => {
    if (document.querySelector('a[data-a-target="stream-game-link"]')) {
      _gameLinkObserver.disconnect();
      _gameLinkObserver = null;
      updateTwitchStreamInfo();
      setTimeout(() => retryLangDetect(), 1000);
    }
  });
  _gameLinkObserver.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => { if (_gameLinkObserver) { _gameLinkObserver.disconnect(); _gameLinkObserver = null; } }, 60000);
}

function hookNavigation() {
  ['pushState', 'replaceState'].forEach(method => {
    const orig = history[method].bind(history);
    history[method] = (...args) => { orig(...args); scheduleDetectAndConnect(); };
  });
  window.addEventListener('popstate', scheduleDetectAndConnect);

  // Twitch SPA ナビゲーションの確実な検知（タイトル変化を監視）
  const titleEl = document.querySelector('title');
  if (titleEl) {
    new MutationObserver(scheduleDetectAndConnect).observe(titleEl, { childList: true });
  }
}

function scheduleDetectAndConnect() {
  clearTimeout(detectConnectTimer);
  detectConnectTimer = setTimeout(() => detectAndConnect(), NAVIGATION_DEBOUNCE_MS);
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
  if (changes.deepl_enabled) { settings.deepl_enabled = changes.deepl_enabled.newValue; updateLangIndicator(); updateFooter(); }
  if (changes.deepl_chat)    { settings.deepl_chat    = changes.deepl_chat.newValue;    updateLangIndicator(); updateFooter(); }
  if (changes.deepl_own)     { settings.deepl_own     = changes.deepl_own.newValue;     updateFooter(); }
  if (changes.gemini_enabled){ settings.gemini_enabled = changes.gemini_enabled.newValue; updateFooter(); }
  if (changes.gemini_own)    { settings.gemini_own     = changes.gemini_own.newValue;     updateFooter(); }
  if (changes.min_length_enabled) settings.min_length_enabled = changes.min_length_enabled.newValue;
  if (changes.min_length)         settings.min_length         = changes.min_length.newValue;
  if (changes.same_lang_filter)   settings.same_lang_filter   = changes.same_lang_filter.newValue;
  if (changes.ignore_bot_badge)   settings.ignore_bot_badge   = changes.ignore_bot_badge.newValue;
  if (changes.ignore_known_bots) settings.ignore_known_bots = changes.ignore_known_bots.newValue;
  if (changes.ignore_users)      settings.ignore_users      = changes.ignore_users.newValue ?? '';
  if (changes.send_confirm) {
    settings.send_confirm = changes.send_confirm.newValue !== false;
    if (!settings.send_confirm) cancelPendingSend();
    updateFooter();
  }
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
    safeStorageGet('twitch_token').then(({ twitch_token }) => {
      twitchToken = twitch_token || '';
      updateAuthUI();
      addSystemMessage(`ログイン成功: ${msg.username}`);
      if (currentChannel) { disconnect(); connect(); }
    });
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
