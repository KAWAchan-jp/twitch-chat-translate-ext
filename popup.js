'use strict';

// ===== 設定 =====
const TWITCH_WS_URL   = 'wss://irc-ws.chat.twitch.tv:443';
const TWITCH_CLIENT_ID = '1vbld5ti60dwqzmxrpfkcnk1oph5jd';
// OAuthリダイレクト先（GitHub Pages経由でトークンを受け取る）
const TWITCH_REDIRECT_URI = `https://kawachan-jp.github.io/twitch-chat-translate/`;
const MAX_MESSAGES        = 200;
const TRANSLATE_DELAY_MS  = 100;
const TRANSLATE_SKIP_PATTERNS = [
  /^[!\/]/,
  /^[^\p{L}\p{N}]+$/u,
];

// ===== 言語リスト =====
const SRC_LANGS = [
  ['auto', '自動検出'],
  ['en', '英語'],
  ['ko', '韓国語'],
  ['zh-CN', '中国語簡体字'],
  ['zh-TW', '中国語繁体字'],
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
];

const TGT_LANGS = SRC_LANGS.filter(([v]) => v !== 'auto');

// ===== 状態 =====
let ws = null;
let channel = '';
let sourceLang = 'auto';
let targetLang = 'ja';
let messageCount = 0;
let translateQueue = Promise.resolve();
let autoScroll = true;

// 送信機能
let twitchUsername = '';
let twitchToken = '';
let isAuthenticated = false;

// ===== DOM =====
const setupScreen      = document.getElementById('setup-screen');
const chatScreen       = document.getElementById('chat-screen');
const channelInput     = document.getElementById('channel-input');
const langSelect       = document.getElementById('lang-select');
const targetLangSelect = document.getElementById('target-lang-select');
const connectBtn       = document.getElementById('connect-btn');
const channelName      = document.getElementById('channel-name');
const statusDot        = document.getElementById('status-dot');
const chatMessages     = document.getElementById('chat-messages');
const chatContainer    = document.getElementById('chat-container');
const msgCountEl       = document.getElementById('msg-count');
const disconnectBtn    = document.getElementById('disconnect-btn');
const showOrigCb       = document.getElementById('show-original');
const autoScrollCb     = document.getElementById('auto-scroll');
const headerSrcLang    = document.getElementById('header-src-lang');
const headerTgtLang    = document.getElementById('header-tgt-lang');
const experimentalToggle = document.getElementById('experimental-toggle');
const chatInputArea    = document.getElementById('chat-input-area');
const authPanel        = document.getElementById('auth-panel');
const sendPanel        = document.getElementById('send-panel');
const twitchLoginBtn   = document.getElementById('twitch-login-btn');
const messageInput     = document.getElementById('message-input');
const sendBtn          = document.getElementById('send-btn');
const logoutBtn        = document.getElementById('logout-btn');

// ===== 言語セレクトを動的生成 =====
function buildLangOptions(selectEl, langs, defaultVal) {
  langs.forEach(([val, label]) => {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = label;
    if (val === defaultVal) opt.selected = true;
    selectEl.appendChild(opt);
  });
}

buildLangOptions(langSelect,       SRC_LANGS, 'auto');
buildLangOptions(targetLangSelect, TGT_LANGS, 'ja');
buildLangOptions(headerSrcLang,    SRC_LANGS, 'auto');
buildLangOptions(headerTgtLang,    TGT_LANGS, 'ja');

// ===== chrome.storage から状態を復元 =====
chrome.storage.local.get(['twitch_token', 'twitch_username', 'src_lang', 'tgt_lang', 'last_channel'], (data) => {
  if (data.twitch_token && data.twitch_username) {
    twitchToken   = `oauth:${data.twitch_token}`;
    twitchUsername = data.twitch_username;
    isAuthenticated = true;
  }
  if (data.src_lang) {
    langSelect.value = data.src_lang;
    headerSrcLang.value = data.src_lang;
    sourceLang = data.src_lang;
  }
  if (data.tgt_lang) {
    targetLangSelect.value = data.tgt_lang;
    headerTgtLang.value = data.tgt_lang;
    targetLang = data.tgt_lang;
  }
  if (data.last_channel) {
    channelInput.value = data.last_channel;
  }
});

// ===== イベント =====
connectBtn.addEventListener('click', () => {
  const raw = channelInput.value.trim().toLowerCase().replace(/^#/, '');
  if (!raw) { channelInput.focus(); return; }
  channel    = raw;
  sourceLang = langSelect.value;
  targetLang = targetLangSelect.value;
  headerSrcLang.value = sourceLang;
  headerTgtLang.value = targetLang;
  chrome.storage.local.set({ src_lang: sourceLang, tgt_lang: targetLang, last_channel: channel });
  startChat();
});

channelInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') connectBtn.click(); });
disconnectBtn.addEventListener('click', () => { disconnect(); showSetup(); });

headerSrcLang.addEventListener('change', () => {
  sourceLang = headerSrcLang.value;
  chrome.storage.local.set({ src_lang: sourceLang });
  updateSendPlaceholder();
});
headerTgtLang.addEventListener('change', () => {
  targetLang = headerTgtLang.value;
  chrome.storage.local.set({ tgt_lang: targetLang });
});

autoScrollCb.addEventListener('change', () => {
  autoScroll = autoScrollCb.checked;
  if (autoScroll) scrollToBottom();
});

showOrigCb.addEventListener('change', () => {
  document.querySelectorAll('.msg-original').forEach(el =>
    el.classList.toggle('hidden-orig', !showOrigCb.checked)
  );
});

chatContainer.addEventListener('scroll', () => {
  const el = chatContainer;
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  if (!atBottom && autoScrollCb.checked) { autoScrollCb.checked = false; autoScroll = false; }
  if (atBottom && !autoScrollCb.checked) { autoScrollCb.checked = true;  autoScroll = true; }
});

// ===== 実験的: 送信機能 =====
experimentalToggle.addEventListener('change', () => {
  if (experimentalToggle.checked) {
    chatInputArea.classList.remove('hidden');
    if (isAuthenticated) {
      authPanel.classList.add('hidden');
      sendPanel.classList.remove('hidden');
      sendPanel.querySelector('.send-user').textContent = twitchUsername;
      updateSendPlaceholder();
    }
  } else {
    chatInputArea.classList.add('hidden');
  }
});

twitchLoginBtn.addEventListener('click', () => {
  const scope = 'chat:read chat:edit';
  const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${encodeURIComponent(TWITCH_REDIRECT_URI)}&response_type=token&scope=${encodeURIComponent(scope)}`;
  // 拡張のポップアップから新しいタブで開く
  chrome.tabs.create({ url });
});

// GitHub Pages経由でOAuthトークンを受け取る
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'twitch_auth' && message.token) {
    handleOAuthToken(message.token);
  }
});

async function handleOAuthToken(rawToken) {
  try {
    // background.js経由でTwitch APIを呼ぶ
    const res = await chrome.runtime.sendMessage({
      type: 'twitch_api',
      url: 'https://api.twitch.tv/helix/users',
      token: rawToken,
      clientId: TWITCH_CLIENT_ID,
    });
    if (!res.ok) throw new Error(res.error);
    twitchUsername  = res.data.data[0].login;
    twitchToken     = `oauth:${rawToken}`;
    isAuthenticated = true;
    chrome.storage.local.set({ twitch_token: rawToken, twitch_username: twitchUsername });

    authPanel.classList.add('hidden');
    sendPanel.classList.remove('hidden');
    sendPanel.querySelector('.send-user').textContent = twitchUsername;
    updateSendPlaceholder();

    if (channel) { disconnect(); startChat(); }
  } catch (e) {
    addSystemMessage('Twitchログインに失敗しました。再度お試しください。');
  }
}

logoutBtn.addEventListener('click', () => {
  isAuthenticated = false;
  twitchUsername  = '';
  twitchToken     = '';
  chrome.storage.local.remove(['twitch_token', 'twitch_username']);
  sendPanel.classList.add('hidden');
  authPanel.classList.remove('hidden');
  if (channel) { disconnect(); startChat(); }
});

sendBtn.addEventListener('click', () => sendUserMessage());
messageInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendUserMessage(); });

async function sendUserMessage() {
  const text = messageInput.value.trim();
  if (!text || !ws || !isAuthenticated) return;
  messageInput.value = '';
  messageInput.focus();

  let sendText = text;
  if (sourceLang !== 'auto') {
    try { sendText = await translateViaBackground(text, 'auto', sourceLang); } catch (_) {}
  }
  ws.send(`PRIVMSG #${channel} :${sendText}`);
}

function updateSendPlaceholder() {
  messageInput.placeholder = sourceLang === 'auto'
    ? '⚠ 自動検出では翻訳できません。翻訳元言語を指定してください'
    : 'メッセージを入力（チャット言語に翻訳して送信）';
}

// ===== IRC / WebSocket =====
function startChat() {
  setupScreen.classList.add('hidden');
  chatScreen.classList.remove('hidden');
  chatMessages.innerHTML = '';
  messageCount = 0;
  updateMsgCount();
  channelName.textContent = channel;
  setStatus('connecting');
  addSystemMessage(`#${channel} に接続中...`);

  ws = new WebSocket(TWITCH_WS_URL);

  ws.onopen = () => {
    ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
    if (isAuthenticated) {
      ws.send(`PASS ${twitchToken}`);
      ws.send(`NICK ${twitchUsername}`);
    } else {
      ws.send('PASS oauth:will_not_actually_work');
      ws.send('NICK justinfan' + Math.floor(Math.random() * 99999));
    }
    ws.send(`JOIN #${channel}`);
  };

  ws.onmessage = (event) => {
    event.data.split('\r\n').filter(Boolean).forEach(handleIRCLine);
  };

  ws.onerror = () => {
    setStatus('error');
    addSystemMessage('接続エラーが発生しました。チャンネル名を確認してください。');
  };

  ws.onclose = () => {
    if (chatScreen.classList.contains('hidden')) return;
    setStatus('error');
    addSystemMessage('接続が切断されました。');
  };
}

function disconnect() {
  if (ws) { ws.onclose = null; ws.close(); ws = null; }
}

function showSetup() {
  setupScreen.classList.remove('hidden');
  chatScreen.classList.add('hidden');
}

function handleIRCLine(line) {
  if (line.startsWith('PING')) { ws.send('PONG :tmi.twitch.tv'); return; }
  if (line.includes(`JOIN #${channel}`)) {
    setStatus('connected');
    addSystemMessage(`#${channel} に接続しました！${isAuthenticated ? ' (送信機能 ON)' : ''}`);
    return;
  }
  if (!line.includes('PRIVMSG')) return;
  const parsed = parseIRCMessage(line);
  if (parsed) addChatMessage(parsed.username, parsed.text, parsed.color);
}

function parseIRCMessage(line) {
  try {
    const tagMatch = line.match(/^@([^ ]+) :(\w+)!\w+@\S+ PRIVMSG #\w+ :(.+)$/);
    if (tagMatch) {
      const tags = parseTags(tagMatch[1]);
      return { username: tags['display-name'] || tagMatch[2], text: tagMatch[3], color: tags['color'] || null };
    }
    const noTagMatch = line.match(/:(\w+)!\w+@\S+ PRIVMSG #\w+ :(.+)$/);
    if (noTagMatch) return { username: noTagMatch[1], text: noTagMatch[2], color: null };
  } catch (e) { console.warn('parse error:', e); }
  return null;
}

function parseTags(tagStr) {
  const tags = {};
  tagStr.split(';').forEach(pair => { const [k, v] = pair.split('='); tags[k] = v || ''; });
  return tags;
}

// ===== メッセージ表示 =====
function addChatMessage(username, text, color) {
  const el = document.createElement('div');
  el.className = 'chat-msg';
  const time = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const userColor = color || '#f0b429';

  el.innerHTML = `
    <div class="msg-meta">
      <span class="msg-username" style="color:${userColor}">${escapeHtml(username)}</span>
      <span class="msg-time">${time}</span>
    </div>
    <div class="msg-original${showOrigCb.checked ? '' : ' hidden-orig'}">${escapeHtml(text)}</div>
    <div class="msg-translated translating">翻訳中...</div>
  `;

  chatMessages.appendChild(el);
  trimMessages();
  messageCount++;
  updateMsgCount();
  if (autoScroll) scrollToBottom();

  const translatedEl = el.querySelector('.msg-translated');

  if (shouldSkipTranslation(text)) {
    translatedEl.textContent = text;
    translatedEl.classList.remove('translating');
    return;
  }

  translateQueue = translateQueue.then(() =>
    sleep(TRANSLATE_DELAY_MS)
      .then(() => translateViaBackground(text, sourceLang, targetLang))
      .then(translated => {
        translatedEl.textContent = translated;
        translatedEl.classList.remove('translating');
        translatedEl.classList.add('ja');
        if (autoScroll) scrollToBottom();
      })
      .catch(() => {
        translatedEl.textContent = text + '（翻訳失敗）';
        translatedEl.classList.remove('translating');
      })
  ).catch(() => {});
}

function addSystemMessage(text) {
  const el = document.createElement('div');
  el.className = 'chat-msg system';
  el.innerHTML = `<div class="msg-translated">${escapeHtml(text)}</div>`;
  chatMessages.appendChild(el);
  if (autoScroll) scrollToBottom();
}

function shouldSkipTranslation(text) {
  return TRANSLATE_SKIP_PATTERNS.some(p => p.test(text));
}

function trimMessages() {
  while (chatMessages.children.length > MAX_MESSAGES) chatMessages.removeChild(chatMessages.firstChild);
}

function updateMsgCount() { msgCountEl.textContent = `${messageCount} メッセージ`; }
function scrollToBottom() { chatContainer.scrollTop = chatContainer.scrollHeight; }

// ===== 翻訳 - background.js経由 =====
function translateViaBackground(text, from, to) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'translate', text, from, to }, (res) => {
      if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
      if (res?.ok) resolve(res.result);
      else reject(new Error(res?.error || 'translate failed'));
    });
  });
}

// ===== ユーティリティ =====
function setStatus(state) { statusDot.className = `status-dot ${state}`; }

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
