'use strict';

// ===== 定数 =====
const TWITCH_WS_URL = 'wss://irc-ws.chat.twitch.tv:443';
const MAX_MESSAGES  = 150;
const TRANSLATE_DELAY_MS = 100;
const TRANSLATE_SKIP_PATTERNS = [
  /^[!\/]/,             // コマンド（!ban, /me など）
  /^[^\p{L}\p{N}]+$/u, // 文字・数字を含まない（記号・絵文字のみ）
];

// チャンネルページでないTwitchのパス
const EXCLUDED_PATHS = new Set([
  'directory', 'settings', 'subscriptions', 'inventory',
  'wallet', 'friends', 'messages', 'following', 'browse',
  'prime', 'drops', 'search', 'u', 'downloads', 'turbo',
  'jobs', 'store', 'popout',
]);

// ===== 状態 =====
let ws           = null;
let currentChannel = '';
let isActive     = true;  // アイコンクリックでON/OFF
let translateQueue = Promise.resolve();
let messageCount = 0;
let settings = {
  src_lang:      'auto',
  tgt_lang:      'ja',
  show_original: true,
  auto_scroll:   true,
};

// ===== Shadow DOM 内のDOM参照 =====
let container, shadowRoot, panel, messagesEl, statusDotEl, channelNameEl, msgCountEl;

// ===== フローティングパネルのCSS =====
const PANEL_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }

  :host {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 2147483647;
  }

  .panel {
    width: 300px;
    height: 440px;
    background: #0e0e10;
    border: 1px solid #2d2d2f;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 4px 24px rgba(0,0,0,0.65);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif;
  }

  /* ヘッダー */
  .header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: #18181b;
    border-bottom: 1px solid #2d2d2f;
    cursor: grab;
    user-select: none;
    flex-shrink: 0;
  }
  .header:active { cursor: grabbing; }

  /* 接続状態インジケーター */
  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .status-dot.connecting { background: #f0b429; animation: pulse 1.2s infinite; }
  .status-dot.connected  { background: #00b894; }
  .status-dot.error      { background: #e84393; }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.3; }
  }

  .channel-name {
    flex: 1;
    font-size: 12px;
    font-weight: 700;
    color: #efeff1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .msg-count {
    font-size: 11px;
    color: #adadb8;
    flex-shrink: 0;
  }

  .close-btn {
    background: none;
    border: none;
    color: #adadb8;
    cursor: pointer;
    font-size: 18px;
    line-height: 1;
    padding: 0 2px;
    flex-shrink: 0;
  }
  .close-btn:hover { color: #efeff1; }

  /* メッセージ一覧 */
  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .messages::-webkit-scrollbar       { width: 4px; }
  .messages::-webkit-scrollbar-track { background: transparent; }
  .messages::-webkit-scrollbar-thumb { background: #3d3d40; border-radius: 2px; }

  /* チャットメッセージ */
  .msg { font-size: 13px; line-height: 1.45; }

  .msg-user {
    font-size: 12px;
    font-weight: 700;
  }

  /* 原文（show_original=false のとき非表示） */
  .msg-orig {
    color: #7d7d8f;
    font-size: 11px;
    margin-top: 2px;
    word-break: break-word;
    display: none;
  }
  .panel.show-original .msg-orig { display: block; }

  .msg-trans {
    color: #efeff1;
    word-break: break-word;
    margin-top: 2px;
  }
  .msg-trans.translating {
    color: #adadb8;
    font-style: italic;
    font-size: 11px;
  }

  /* システムメッセージ */
  .msg.system .msg-trans {
    color: #adadb8;
    font-style: italic;
    font-size: 12px;
    margin-top: 0;
  }
`;

// ===== 初期化 =====
async function init() {
  // 保存済みの設定を読み込む
  const stored = await chrome.storage.local.get(['src_lang', 'tgt_lang', 'show_original', 'auto_scroll']);
  settings = { ...settings, ...stored };

  createPanel();
  detectAndConnect();
  hookNavigation();

  // 設定変更をリアルタイムに反映
  chrome.storage.onChanged.addListener(onSettingsChanged);

  // 起動時のバッジをONに設定
  notifyBadge(isActive);
}

// ===== URLからチャンネル名を取得 =====
function getChannelFromUrl() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts.length >= 1 && !EXCLUDED_PATHS.has(parts[0])) {
    return parts[0].toLowerCase();
  }
  return null;
}

// ===== URLを見てチャンネルが変わっていれば再接続 =====
function detectAndConnect() {
  const ch = getChannelFromUrl();
  if (ch && ch !== currentChannel) {
    disconnect();
    currentChannel = ch;
    resetMessages();
    if (isActive) connect();
    else {
      // OFFのままチャンネルだけ更新
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

// ===== TwitchはSPAなのでhistory APIをフックしてURL変化を検知 =====
function hookNavigation() {
  ['pushState', 'replaceState'].forEach(method => {
    const orig = history[method].bind(history);
    history[method] = (...args) => {
      orig(...args);
      setTimeout(detectAndConnect, 200);
    };
  });
  window.addEventListener('popstate', () => setTimeout(detectAndConnect, 200));
}

// ===== 設定変更ハンドラ =====
function onSettingsChanged(changes) {
  if (changes.src_lang)      settings.src_lang = changes.src_lang.newValue;
  if (changes.tgt_lang)      settings.tgt_lang = changes.tgt_lang.newValue;
  if (changes.show_original) {
    settings.show_original = changes.show_original.newValue;
    panel?.classList.toggle('show-original', settings.show_original);
  }
  if (changes.auto_scroll) {
    settings.auto_scroll = changes.auto_scroll.newValue;
    if (settings.auto_scroll) scrollToBottom();
  }
}

// ===== background.jsへバッジ更新を通知 =====
function notifyBadge(active) {
  chrome.runtime.sendMessage({ type: 'badge_update', active }).catch(() => {});
}

// ===== フローティングパネル作成（Shadow DOM） =====
function createPanel() {
  container = document.createElement('div');
  container.id = 'tct-root';
  shadowRoot = container.attachShadow({ mode: 'open' });

  shadowRoot.innerHTML = `
    <style>${PANEL_CSS}</style>
    <div class="panel${settings.show_original ? ' show-original' : ''}" id="panel">
      <div class="header" id="header">
        <div class="status-dot connecting" id="statusDot"></div>
        <span class="channel-name" id="channelName">接続待ち</span>
        <span class="msg-count" id="msgCount">0 msgs</span>
        <button class="close-btn" id="closeBtn" title="閉じる（アイコンクリックで再表示）">×</button>
      </div>
      <div class="messages" id="messages"></div>
    </div>
  `;

  document.body.appendChild(container);

  panel         = shadowRoot.getElementById('panel');
  statusDotEl   = shadowRoot.getElementById('statusDot');
  channelNameEl = shadowRoot.getElementById('channelName');
  msgCountEl    = shadowRoot.getElementById('msgCount');
  messagesEl    = shadowRoot.getElementById('messages');

  // ×ボタン: OFFに切り替え（アイコンクリックで復帰可能）
  shadowRoot.getElementById('closeBtn').addEventListener('click', () => {
    setActive(false);
  });

  makeDraggable(shadowRoot.getElementById('header'));
}

// ===== ON/OFFを切り替える共通関数 =====
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

// ===== background.jsからのメッセージ =====
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'toggle') {
    setActive(!isActive);
    sendResponse({ active: isActive });
  }
});

// ===== ヘッダーをドラッグしてパネルを移動 =====
function makeDraggable(handle) {
  handle.addEventListener('mousedown', e => {
    if (e.target.closest('.close-btn')) return;
    e.preventDefault();

    const rect     = container.getBoundingClientRect();
    const startX   = e.clientX;
    const startY   = e.clientY;
    const origRight  = window.innerWidth  - rect.right;
    const origBottom = window.innerHeight - rect.bottom;

    const onMove = e => {
      // 右・下のオフセットで位置管理（画面外に出ないようクランプ）
      container.style.right  = Math.max(0, origRight  - (e.clientX - startX)) + 'px';
      container.style.bottom = Math.max(0, origBottom - (e.clientY - startY)) + 'px';
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// ===== WebSocket接続 =====
function connect() {
  if (!currentChannel) return;
  setStatus('connecting');
  channelNameEl.textContent = `#${currentChannel}`;
  addSystemMessage(`#${currentChannel} に接続中...`);

  ws = new WebSocket(TWITCH_WS_URL);

  ws.onopen = () => {
    ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
    // 匿名ログイン（justinfan + 乱数）
    ws.send('PASS oauth:will_not_actually_work');
    ws.send('NICK justinfan' + Math.floor(Math.random() * 99999));
    ws.send(`JOIN #${currentChannel}`);
  };

  ws.onmessage = e => {
    e.data.split('\r\n').filter(Boolean).forEach(handleIRCLine);
  };

  ws.onerror = () => {
    setStatus('error');
    addSystemMessage('接続エラーが発生しました。');
  };

  ws.onclose = () => {
    // disconnect()による意図的なクローズはcurrentChannelが空になっている
    if (!currentChannel) return;
    setStatus('error');
    addSystemMessage('接続が切断されました。');
  };
}

function disconnect() {
  if (ws) { ws.onclose = null; ws.close(); ws = null; }
  // currentChannelは保持（再接続時に使用）
}

function resetMessages() {
  if (!messagesEl) return;
  messagesEl.innerHTML = '';
  messageCount = 0;
  if (msgCountEl) msgCountEl.textContent = '0 msgs';
}

// ===== IRCメッセージ処理 =====
function handleIRCLine(line) {
  if (line.startsWith('PING')) {
    ws?.send('PONG :tmi.twitch.tv');
    return;
  }
  if (line.includes(`JOIN #${currentChannel}`)) {
    setStatus('connected');
    addSystemMessage(`#${currentChannel} に接続しました！`);
    return;
  }
  if (!line.includes('PRIVMSG')) return;
  const parsed = parseIRCMessage(line);
  if (parsed) addChatMessage(parsed.username, parsed.text, parsed.color);
}

function parseIRCMessage(line) {
  try {
    // タグ付きメッセージ（display-name, colorなどが含まれる）
    const withTags = line.match(/^@([^ ]+) :(\w+)!\w+@\S+ PRIVMSG #\w+ :(.+)$/);
    if (withTags) {
      const tags = parseTags(withTags[1]);
      return { username: tags['display-name'] || withTags[2], text: withTags[3], color: tags['color'] || null };
    }
    // タグなしメッセージ
    const plain = line.match(/:(\w+)!\w+@\S+ PRIVMSG #\w+ :(.+)$/);
    if (plain) return { username: plain[1], text: plain[2], color: null };
  } catch (_) {}
  return null;
}

function parseTags(tagStr) {
  const tags = {};
  tagStr.split(';').forEach(pair => {
    const [k, v] = pair.split('=');
    tags[k] = v || '';
  });
  return tags;
}

// ===== メッセージ表示・翻訳 =====
function addChatMessage(username, text, color) {
  const el = document.createElement('div');
  el.className = 'msg';
  const userColor = color || '#f0b429';

  el.innerHTML = `
    <span class="msg-user" style="color:${userColor}">${escapeHtml(username)}</span>
    <div class="msg-orig">${escapeHtml(text)}</div>
    <div class="msg-trans translating">翻訳中...</div>
  `;

  messagesEl.appendChild(el);
  trimMessages();
  messageCount++;
  msgCountEl.textContent = `${messageCount} msgs`;
  if (settings.auto_scroll) scrollToBottom();

  const transEl = el.querySelector('.msg-trans');

  // 翻訳不要なメッセージはそのまま表示
  if (shouldSkipTranslation(text)) {
    transEl.textContent = text;
    transEl.classList.remove('translating');
    return;
  }

  // 翻訳キューに追加（連続リクエストを抑制）
  translateQueue = translateQueue.then(() =>
    sleep(TRANSLATE_DELAY_MS)
      .then(() => translateViaBackground(text, settings.src_lang, settings.tgt_lang))
      .then(translated => {
        transEl.textContent = translated;
        transEl.classList.remove('translating');
        if (settings.auto_scroll) scrollToBottom();
      })
      .catch(() => {
        transEl.textContent = text + '（翻訳失敗）';
        transEl.classList.remove('translating');
      })
  ).catch(() => {});
}

function addSystemMessage(text) {
  if (!messagesEl) return;
  const el = document.createElement('div');
  el.className = 'msg system';
  el.innerHTML = `<div class="msg-trans">${escapeHtml(text)}</div>`;
  messagesEl.appendChild(el);
  if (settings.auto_scroll) scrollToBottom();
}

function shouldSkipTranslation(text) {
  return TRANSLATE_SKIP_PATTERNS.some(p => p.test(text));
}

function trimMessages() {
  while (messagesEl.children.length > MAX_MESSAGES) {
    messagesEl.removeChild(messagesEl.firstChild);
  }
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ===== 翻訳リクエスト（background.js経由） =====
// サービスワーカーが落ちている場合に備えてリトライする
async function translateViaBackground(text, from, to) {
  const MAX_RETRIES = 2;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await Promise.race([
        chrome.runtime.sendMessage({ type: 'translate', text, from, to }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('タイムアウト')), 10000)),
      ]);
      if (!res?.ok) throw new Error(res?.error || 'translate failed');
      return res.result;
    } catch (e) {
      if (attempt === MAX_RETRIES) throw e;
      // Service Workerが起動中の可能性があるため少し待ってリトライ
      await sleep(300 * (attempt + 1));
    }
  }
}

// ===== ユーティリティ =====
function setStatus(state) {
  if (!statusDotEl) return;
  statusDotEl.className = `status-dot ${state}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ===== 起動 =====
init();
