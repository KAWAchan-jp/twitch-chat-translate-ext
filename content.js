'use strict';

// ===== 定数 =====
const TWITCH_WS_URL = 'wss://irc-ws.chat.twitch.tv:443';
const MAX_MESSAGES  = 150;
const TRANSLATE_DELAY_MS = 100;
const TRANSLATE_SKIP_PATTERNS = [
  /^[!\/]/,             // コマンド（!ban, /me など）
  /^[^\p{L}\p{N}]+$/u, // 文字・数字を含まない（記号・絵文字のみ）
];

const EXCLUDED_PATHS = new Set([
  'directory', 'settings', 'subscriptions', 'inventory',
  'wallet', 'friends', 'messages', 'following', 'browse',
  'prime', 'drops', 'search', 'u', 'downloads', 'turbo',
  'jobs', 'store', 'popout',
]);

// ===== 状態 =====
let ws             = null;
let currentChannel = '';
let isActive       = true;
let translateQueue = Promise.resolve();
let messageCount   = 0;
let settings = {
  src_lang:      'auto',
  tgt_lang:      'ja',
  show_original: true,
  auto_scroll:   true,
};

// ===== Shadow DOM 内のDOM参照 =====
let container, shadowRoot, panel, messagesEl, statusDotEl, channelNameEl, msgCountEl;
let chatInputEl, sendBtnEl;

// ===== フローティングパネルのCSS =====
const PANEL_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }

  :host {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 2147483647;
    width: 300px;
    height: 480px;
    min-width: 220px;
    min-height: 200px;
  }

  .panel {
    width: 100%;
    height: 100%;
    background: #0e0e10;
    border: 1px solid #2d2d2f;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 4px 24px rgba(0,0,0,0.65);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif;
    position: relative;
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
    min-height: 0;
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

  /* チャット送信エリア */
  .input-area {
    display: flex;
    gap: 6px;
    padding: 8px;
    border-top: 1px solid #2d2d2f;
    background: #18181b;
    flex-shrink: 0;
  }

  .chat-input {
    flex: 1;
    min-width: 0;
    background: #0e0e10;
    border: 1px solid #3d3d40;
    border-radius: 4px;
    color: #efeff1;
    font-size: 12px;
    padding: 6px 8px;
    outline: none;
    font-family: inherit;
  }
  .chat-input:focus        { border-color: #9147ff; }
  .chat-input::placeholder { color: #5a5a6a; font-size: 11px; }
  .chat-input:disabled     { opacity: 0.4; cursor: not-allowed; }

  .send-btn {
    background: #9147ff;
    border: none;
    border-radius: 4px;
    color: #fff;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    padding: 6px 10px;
    flex-shrink: 0;
    white-space: nowrap;
  }
  .send-btn:hover:not(:disabled) { background: #772ce8; }
  .send-btn:disabled { background: #3d3d40; cursor: default; }

  /* リサイズハンドル（右下コーナー） */
  .resize-handle {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 14px;
    height: 14px;
    cursor: nwse-resize;
    background: linear-gradient(135deg, transparent 50%, #3d3d40 50%);
    border-radius: 0 0 8px 0;
    z-index: 1;
  }
  .resize-handle:hover {
    background: linear-gradient(135deg, transparent 50%, #9147ff 50%);
  }
`;

// ===== 初期化 =====
async function init() {
  const stored = await chrome.storage.local.get(['src_lang', 'tgt_lang', 'show_original', 'auto_scroll']);
  settings = { ...settings, ...stored };

  createPanel();
  detectAndConnect();
  hookNavigation();

  chrome.storage.onChanged.addListener(onSettingsChanged);

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

// ===== TwitchのSPAナビゲーションに追従 =====
function hookNavigation() {
  ['pushState', 'replaceState'].forEach(method => {
    const orig = history[method].bind(history);
    history[method] = (...args) => { orig(...args); setTimeout(detectAndConnect, 200); };
  });
  window.addEventListener('popstate', () => setTimeout(detectAndConnect, 200));
}

// ===== 設定変更ハンドラ =====
function onSettingsChanged(changes) {
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
  // 言語設定が変わったら入力欄のプレースホルダーを更新
  if (changes.src_lang || changes.tgt_lang) updateInputPlaceholder();
}

function notifyBadge(active) {
  chrome.runtime.sendMessage({ type: 'badge_update', active }).catch(() => {});
}

// ===== フローティングパネル作成（Shadow DOM） =====
function createPanel() {
  container = document.createElement('div');
  container.id = 'tct-root';
  // 初期サイズをstyleに設定（リサイズで上書きされる）
  container.style.cssText = 'position:fixed;bottom:20px;right:20px;width:300px;height:480px;z-index:2147483647;';
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
      <div class="input-area" id="inputArea">
        <input type="text" class="chat-input" id="chatInput" autocomplete="off" spellcheck="false">
        <button class="send-btn" id="sendBtn">送信</button>
      </div>
      <div class="resize-handle" id="resizeHandle"></div>
    </div>
  `;

  document.body.appendChild(container);

  panel         = shadowRoot.getElementById('panel');
  statusDotEl   = shadowRoot.getElementById('statusDot');
  channelNameEl = shadowRoot.getElementById('channelName');
  msgCountEl    = shadowRoot.getElementById('msgCount');
  messagesEl    = shadowRoot.getElementById('messages');
  chatInputEl   = shadowRoot.getElementById('chatInput');
  sendBtnEl     = shadowRoot.getElementById('sendBtn');

  shadowRoot.getElementById('closeBtn').addEventListener('click', () => setActive(false));

  // Twitchはdocumentレベルでキーイベントを監視してチャット入力欄にフォーカスを奪う
  // stopPropagationで Shadow DOM 外への漏れを防ぐ
  chatInputEl.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') sendUserMessage();
  });
  chatInputEl.addEventListener('keyup',    e => e.stopPropagation());
  chatInputEl.addEventListener('keypress', e => e.stopPropagation());

  sendBtnEl.addEventListener('click', sendUserMessage);

  updateInputPlaceholder();
  makeDraggable(shadowRoot.getElementById('header'));
  makeResizable(shadowRoot.getElementById('resizeHandle'));
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

// ===== ヘッダードラッグ移動 =====
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

// ===== 右下ハンドルでリサイズ =====
function makeResizable(handle) {
  handle.addEventListener('mousedown', e => {
    e.preventDefault();
    e.stopPropagation();

    const startX  = e.clientX;
    const startY  = e.clientY;
    const startW  = container.offsetWidth;
    const startH  = container.offsetHeight;

    const onMove = e => {
      // 幅は右方向に広がるが右端固定なので左方向に広がる
      const newW = Math.max(220, startW + (e.clientX - startX));
      // 高さは上方向に広がる（下端固定）
      const newH = Math.max(200, startH - (e.clientY - startY));
      container.style.width  = newW + 'px';
      container.style.height = newH + 'px';
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
    ws.send('PASS oauth:will_not_actually_work');
    ws.send('NICK justinfan' + Math.floor(Math.random() * 99999));
    ws.send(`JOIN #${currentChannel}`);
  };

  ws.onmessage = e => e.data.split('\r\n').filter(Boolean).forEach(handleIRCLine);

  ws.onerror = () => { setStatus('error'); addSystemMessage('接続エラーが発生しました。'); };

  ws.onclose = () => {
    if (!currentChannel) return;
    setStatus('error');
    addSystemMessage('接続が切断されました。');
  };
}

function disconnect() {
  if (ws) { ws.onclose = null; ws.close(); ws = null; }
}

function resetMessages() {
  if (!messagesEl) return;
  messagesEl.innerHTML = '';
  messageCount = 0;
  if (msgCountEl) msgCountEl.textContent = '0 msgs';
}

// ===== IRCメッセージ処理 =====
function handleIRCLine(line) {
  if (line.startsWith('PING')) { ws?.send('PONG :tmi.twitch.tv'); return; }
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
    const withTags = line.match(/^@([^ ]+) :(\w+)!\w+@\S+ PRIVMSG #\w+ :(.+)$/);
    if (withTags) {
      const tags = parseTags(withTags[1]);
      return { username: tags['display-name'] || withTags[2], text: withTags[3], color: tags['color'] || null };
    }
    const plain = line.match(/:(\w+)!\w+@\S+ PRIVMSG #\w+ :(.+)$/);
    if (plain) return { username: plain[1], text: plain[2], color: null };
  } catch (_) {}
  return null;
}

function parseTags(tagStr) {
  const tags = {};
  tagStr.split(';').forEach(pair => { const [k, v] = pair.split('='); tags[k] = v || ''; });
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

  if (shouldSkipTranslation(text)) {
    transEl.textContent = text;
    transEl.classList.remove('translating');
    return;
  }

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
  while (messagesEl.children.length > MAX_MESSAGES) messagesEl.removeChild(messagesEl.firstChild);
}

function scrollToBottom() { messagesEl.scrollTop = messagesEl.scrollHeight; }

// ===== チャット送信 =====

// 入力欄のプレースホルダーを設定に合わせて更新
function updateInputPlaceholder() {
  if (!chatInputEl) return;
  if (settings.src_lang === 'auto') {
    chatInputEl.placeholder = '⚠ 翻訳元言語を右クリックで設定してください';
    chatInputEl.disabled = true;
    sendBtnEl.disabled   = true;
  } else {
    const srcName = getLangName(settings.src_lang);
    const tgtName = getLangName(settings.tgt_lang);
    chatInputEl.placeholder = `${tgtName}で入力 → ${srcName}に翻訳して送信`;
    chatInputEl.disabled = false;
    sendBtnEl.disabled   = false;
  }
}

// Intl APIで言語名を取得（'ja' → '日本語' など）
function getLangName(code) {
  if (code === 'auto') return '自動検出';
  try {
    return new Intl.DisplayNames(['ja'], { type: 'language' }).of(code) ?? code;
  } catch (_) { return code; }
}

// ユーザーのメッセージを翻訳してTwitchのチャット入力欄に渡す
async function sendUserMessage() {
  const text = chatInputEl.value.trim();
  if (!text) return;

  chatInputEl.value   = '';
  chatInputEl.disabled = true;
  sendBtnEl.disabled  = true;

  try {
    // tgt_lang → src_lang 方向に翻訳
    const translated = await translateViaBackground(text, settings.tgt_lang, settings.src_lang);
    await injectToTwitchChat(translated);
  } catch (e) {
    addSystemMessage(`送信失敗: ${e.message}`);
  } finally {
    chatInputEl.disabled = false;
    sendBtnEl.disabled   = false;
    chatInputEl.focus();
  }
}

// Twitchのチャット入力欄を探して翻訳済みテキストを注入・送信
async function injectToTwitchChat(text) {
  const input = (
    document.querySelector('[data-a-target="chat-input"]') ||
    document.querySelector('[data-test-selector="chat-input"]') ||
    document.querySelector('.chat-input__textarea [contenteditable="true"]')
  );
  if (!input) throw new Error('チャット入力欄が見つかりません。Twitchにログインしているか確認してください。');

  // contenteditable div の既存テキストを選択して置換
  input.focus();
  const sel   = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(input);
  sel.removeAllRanges();
  sel.addRange(range);
  document.execCommand('insertText', false, text);

  // Reactの状態更新を待ってからEnterで送信
  await sleep(80);
  input.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true,
  }));
}

// ===== 翻訳リクエスト（background.js経由、リトライあり） =====
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
      await sleep(300 * (attempt + 1));
    }
  }
}

// ===== ユーティリティ =====
function setStatus(state) { if (statusDotEl) statusDotEl.className = `status-dot ${state}`; }

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ===== 起動 =====
init();
