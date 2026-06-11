'use strict';

// ===== 定数 =====
const TWITCH_WS_URL = 'wss://irc-ws.chat.twitch.tv:443';
const MAX_MESSAGES  = 150;
const TRANSLATE_DELAY_MS = 100;
const TRANSLATE_SKIP_PATTERNS = [
  /^[!\/]/,
  /^[^\p{L}\p{N}]+$/u,
];
const EXCLUDED_PATHS = new Set([
  'directory', 'settings', 'subscriptions', 'inventory',
  'wallet', 'friends', 'messages', 'following', 'browse',
  'prime', 'drops', 'search', 'u', 'downloads', 'turbo',
  'jobs', 'store', 'popout',
]);

// ===== 状態 =====
let ws              = null;
let currentChannel  = '';
let isActive        = true;
let isAuthenticated = false;
let twitchToken     = '';
let twitchUsername  = '';
let translateQueue  = Promise.resolve();
let messageCount    = 0;
let settings = { src_lang: 'auto', tgt_lang: 'ja', show_original: true, auto_scroll: true };

// 音声関連
let voiceStream        = null;
let voiceAudioCtx      = null;
let voiceSourceNode    = null; // MediaElementSourceNode（video 要素につき1回だけ作成）
let voiceDestNode      = null; // MediaStreamDestinationNode（start/stop ごとに再作成）
let mediaRecorder      = null;
let audioChunks        = [];
let hadSpeech          = false;
let isSendingChunk     = false;
let voiceSessionTimer  = null;
let cableLevel         = 0;
let isVoiceActive      = false;

// VAD パラメータ
const VAD_SILENCE_THRESHOLD = 10;   // この % 以下を無音とみなす
const VAD_SILENCE_MS        = 500;  // 無音がこの ms 続いたら処理開始
const VAD_MAX_CHUNK_MS      = 5000; // 最大チャンク長（無音なしの場合の上限）
let subtitleContainer = null;
let subtitleFadeTimer = null;

// ===== Shadow DOM 内のDOM参照 =====
let container, shadowRoot, panel, messagesEl, statusDotEl, channelNameEl, langIndicatorEl, msgCountEl;
let authBarEl, loginBtnEl, authInfoEl, authUsernameEl, logoutBtnEl;
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

  .status-dot {
    width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
  }
  .status-dot.connecting { background: #f0b429; animation: pulse 1.2s infinite; }
  .status-dot.connected  { background: #00b894; }
  .status-dot.error      { background: #e84393; }

  @keyframes pulse {
    0%, 100% { opacity: 1; } 50% { opacity: 0.3; }
  }

  .channel-name {
    flex: 1; font-size: 12px; font-weight: 700; color: #efeff1;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .msg-count { font-size: 11px; color: #adadb8; flex-shrink: 0; }

  .lang-indicator {
    font-size: 10px; color: #adadb8; background: #1e1e21;
    padding: 2px 5px; border-radius: 3px; flex-shrink: 0;
    font-family: 'Courier New', monospace; letter-spacing: 0.3px;
  }

  .voice-btn {
    background: none; border: none; cursor: pointer;
    font-size: 14px; line-height: 1; padding: 0 2px; flex-shrink: 0;
    opacity: 0.4; transition: opacity 0.2s;
  }
  .voice-btn:hover  { opacity: 0.8; }
  .voice-btn.active { opacity: 1; filter: drop-shadow(0 0 5px #ff4444); }

  .close-btn {
    background: none; border: none; color: #adadb8; cursor: pointer;
    font-size: 18px; line-height: 1; padding: 0 2px; flex-shrink: 0;
  }
  .close-btn:hover { color: #efeff1; }

  /* 認証バー */
  .auth-bar {
    display: flex;
    align-items: center;
    padding: 5px 10px;
    background: #0e0e10;
    border-bottom: 1px solid #2d2d2f;
    flex-shrink: 0;
    font-size: 11px;
    min-height: 30px;
  }

  .login-btn {
    background: #9147ff; border: none; border-radius: 4px; color: #fff;
    cursor: pointer; font-size: 11px; padding: 3px 10px; width: 100%;
  }
  .login-btn:hover { background: #772ce8; }

  .auth-info {
    display: flex; align-items: center; gap: 8px; width: 100%; justify-content: space-between;
  }
  .auth-username { color: #9147ff; font-weight: 700; }

  .logout-btn {
    background: none; border: none; color: #adadb8; cursor: pointer; font-size: 11px; padding: 2px 6px;
  }
  .logout-btn:hover { color: #efeff1; }

  /* メッセージ一覧 */
  .messages {
    flex: 1; overflow-y: auto; padding: 8px;
    display: flex; flex-direction: column; gap: 6px; min-height: 0;
  }
  .messages::-webkit-scrollbar       { width: 4px; }
  .messages::-webkit-scrollbar-track { background: transparent; }
  .messages::-webkit-scrollbar-thumb { background: #3d3d40; border-radius: 2px; }

  .msg { font-size: 13px; line-height: 1.45; border-bottom: 1px solid #1e1e21; padding-bottom: 5px; }
  .msg:last-child { border-bottom: none; }
  .msg-user { font-size: 12px; font-weight: 700; }

  .msg-orig {
    color: #7d7d8f; font-size: 11px; margin-top: 2px; word-break: break-word; display: none;
  }
  .panel.show-original .msg-orig { display: block; }

  .msg-trans { color: #efeff1; word-break: break-word; margin-top: 2px; }
  .msg-trans.translating { color: #adadb8; font-style: italic; font-size: 11px; }

  .msg.system .msg-trans { color: #adadb8; font-style: italic; font-size: 12px; margin-top: 0; }

  /* チャット送信エリア */
  .input-area {
    display: flex; gap: 6px; padding: 8px;
    border-top: 1px solid #2d2d2f; background: #18181b; flex-shrink: 0;
  }

  .chat-input {
    flex: 1; min-width: 0; background: #0e0e10;
    border: 1px solid #3d3d40; border-radius: 4px;
    color: #efeff1; font-size: 12px; padding: 6px 8px; outline: none; font-family: inherit;
  }
  .chat-input:focus        { border-color: #9147ff; }
  .chat-input::placeholder { color: #5a5a6a; font-size: 11px; }
  .chat-input:disabled     { opacity: 0.4; cursor: not-allowed; }

  .send-btn {
    background: #9147ff; border: none; border-radius: 4px; color: #fff;
    cursor: pointer; font-size: 12px; font-weight: 600; padding: 6px 10px; flex-shrink: 0;
  }
  .send-btn:hover:not(:disabled) { background: #772ce8; }
  .send-btn:disabled { background: #3d3d40; cursor: default; }

  /* Groq API キーバー */
  .groq-bar {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 5px 10px; background: #18181b;
    border-bottom: 1px solid #2d2d2f; flex-shrink: 0;
  }
  .groq-bar.hidden { display: none; }
  .groq-hint { font-size: 11px; color: #f0b429; flex: 1; }
  .groq-open-btn {
    background: #9147ff; border: none; border-radius: 4px;
    color: #fff; cursor: pointer; font-size: 11px; padding: 4px 10px;
    flex-shrink: 0; white-space: nowrap;
  }
  .groq-open-btn:hover { background: #772ce8; }

  /* リサイズハンドル */
  .resize-handle {
    position: absolute; bottom: 0; right: 0; width: 14px; height: 14px;
    cursor: nwse-resize; background: linear-gradient(135deg, transparent 50%, #3d3d40 50%);
    border-radius: 0 0 8px 0; z-index: 1;
  }
  .resize-handle:hover { background: linear-gradient(135deg, transparent 50%, #9147ff 50%); }
`;

// ===== 初期化 =====
async function init() {
  const stored = await chrome.storage.local.get([
    'src_lang', 'tgt_lang', 'show_original', 'auto_scroll',
    'twitch_token', 'twitch_username', 'channel_settings', 'groq_api_key',
  ]);
  settings = { ...settings, ...stored };

  if (stored.twitch_token && stored.twitch_username) {
    twitchToken     = stored.twitch_token;
    twitchUsername  = stored.twitch_username;
    isAuthenticated = true;
  }

  createPanel();
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
  const ch = getChannelFromUrl();
  if (ch && ch !== currentChannel) {
    disconnect();
    currentChannel = ch;
    await loadChannelSettings(ch);
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

// チャンネル固有の言語設定をストレージから読み込む（なければグローバル設定を使用）
async function loadChannelSettings(channel) {
  const stored = await chrome.storage.local.get(['src_lang', 'tgt_lang', 'channel_settings']);
  const cs = stored.channel_settings?.[channel];
  settings.src_lang = cs?.src_lang ?? stored.src_lang ?? 'auto';
  settings.tgt_lang = cs?.tgt_lang ?? stored.tgt_lang ?? 'ja';
  updateInputPlaceholder();
  updateLangIndicator();
}

function hookNavigation() {
  // pushState / replaceState のラップ
  ['pushState', 'replaceState'].forEach(method => {
    const orig = history[method].bind(history);
    history[method] = (...args) => { orig(...args); setTimeout(() => detectAndConnect(), 300); };
  });
  window.addEventListener('popstate', () => setTimeout(() => detectAndConnect(), 300));

  // <title> の変化を監視（Twitch SPA ナビゲーションの確実な検知）
  // Twitch はチャンネル移動時に必ずタイトルを書き換えるため pushState より信頼性が高い
  const titleEl = document.querySelector('title');
  if (titleEl) {
    new MutationObserver(() => detectAndConnect()).observe(titleEl, { childList: true });
  }
}

function onSettingsChanged(changes) {
  // Groq キーが設定されたらバーを隠す
  // groq_api_key は設定ページでのみ使用（ローカル Whisper では不使用）

  // チャンネル固有設定が変わった場合、現在のチャンネルの設定を反映
  if (changes.channel_settings && currentChannel) {
    const cs = changes.channel_settings.newValue?.[currentChannel];
    if (cs) {
      if (cs.src_lang !== undefined) settings.src_lang = cs.src_lang;
      if (cs.tgt_lang !== undefined) settings.tgt_lang = cs.tgt_lang;
      updateInputPlaceholder();
    }
    return;
  }
  // グローバル設定の変更（チャンネル固有設定がない場合に適用）
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
}

function notifyBadge(active) {
  chrome.runtime.sendMessage({ type: 'badge_update', active }).catch(() => {});
}

// ===== パネル作成 =====
function createPanel() {
  container = document.createElement('div');
  container.id = 'tct-root';
  container.style.cssText = 'position:fixed;bottom:20px;right:20px;width:300px;height:480px;z-index:2147483647;';
  shadowRoot = container.attachShadow({ mode: 'open' });

  shadowRoot.innerHTML = `
    <style>${PANEL_CSS}</style>
    <div class="panel${settings.show_original ? ' show-original' : ''}" id="panel">
      <div class="header" id="header">
        <div class="status-dot connecting" id="statusDot"></div>
        <span class="channel-name" id="channelName">接続待ち</span>
        <span class="lang-indicator" id="langIndicator"></span>
        <span class="msg-count" id="msgCount">0 msgs</span>
        <button class="voice-btn" id="voiceBtn" title="音声字幕 ON/OFF">🎤</button>
        <button class="close-btn" id="closeBtn" title="閉じる">×</button>
      </div>
      <div class="auth-bar" id="authBar">
        <button class="login-btn" id="loginBtn">Twitchでログインしてチャット送信を有効化</button>
        <div class="auth-info hidden" id="authInfo">
          <span class="auth-username" id="authUsername"></span>
          <button class="logout-btn" id="logoutBtn">ログアウト</button>
        </div>
      </div>
      <div class="groq-bar hidden" id="groqBar">
        <span class="groq-hint">⚠ Groq API キー未設定</span>
        <button class="groq-open-btn" id="groqOpenBtn">設定を開く</button>
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

  panel             = shadowRoot.getElementById('panel');
  statusDotEl       = shadowRoot.getElementById('statusDot');
  channelNameEl     = shadowRoot.getElementById('channelName');
  langIndicatorEl   = shadowRoot.getElementById('langIndicator');
  msgCountEl        = shadowRoot.getElementById('msgCount');
  messagesEl     = shadowRoot.getElementById('messages');
  authBarEl      = shadowRoot.getElementById('authBar');
  loginBtnEl     = shadowRoot.getElementById('loginBtn');
  authInfoEl     = shadowRoot.getElementById('authInfo');
  authUsernameEl = shadowRoot.getElementById('authUsername');
  logoutBtnEl    = shadowRoot.getElementById('logoutBtn');
  chatInputEl    = shadowRoot.getElementById('chatInput');
  sendBtnEl      = shadowRoot.getElementById('sendBtn');

  shadowRoot.getElementById('closeBtn').addEventListener('click', () => setActive(false));
  shadowRoot.getElementById('voiceBtn').addEventListener('click', toggleVoice);
  shadowRoot.getElementById('groqOpenBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  loginBtnEl.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'twitch_login' }));
  logoutBtnEl.addEventListener('click', handleLogout);

  // キーボードイベントをShadow DOM内で止めてTwitchのグローバルハンドラに漏らさない
  chatInputEl.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') sendUserMessage();
  });
  chatInputEl.addEventListener('keyup',    e => e.stopPropagation());
  chatInputEl.addEventListener('keypress', e => e.stopPropagation());

  sendBtnEl.addEventListener('click', sendUserMessage);

  updateAuthUI();
  updateInputPlaceholder();
  updateLangIndicator();
  makeDraggable(shadowRoot.getElementById('header'));
  makeResizable(shadowRoot.getElementById('resizeHandle'));
}

// ===== 認証UI =====
function updateAuthUI() {
  if (!loginBtnEl) return;
  if (isAuthenticated) {
    loginBtnEl.style.display       = 'none';
    authInfoEl.style.display       = 'flex';
    authUsernameEl.textContent     = twitchUsername;
  } else {
    loginBtnEl.style.display       = '';
    authInfoEl.style.display       = 'none';
  }
  updateInputPlaceholder();
}

function updateInputPlaceholder() {
  if (!chatInputEl) return;
  if (!isAuthenticated) {
    chatInputEl.placeholder = 'ログインするとチャット送信できます';
    chatInputEl.disabled    = true;
    sendBtnEl.disabled      = true;
    return;
  }
  if (settings.src_lang === 'auto') {
    chatInputEl.placeholder = '⚠ 翻訳元言語を右クリックで設定してください';
    chatInputEl.disabled    = true;
    sendBtnEl.disabled      = true;
    return;
  }
  const srcName = getLangName(settings.src_lang);
  const tgtName = getLangName(settings.tgt_lang);
  chatInputEl.placeholder = `${tgtName}で入力 → ${srcName}に翻訳して送信`;
  chatInputEl.disabled    = false;
  sendBtnEl.disabled      = false;
}

function updateLangIndicator() {
  if (!langIndicatorEl) return;
  const src = settings.src_lang === 'auto' ? 'AUTO' : settings.src_lang.toUpperCase();
  const tgt = settings.tgt_lang.toUpperCase();
  langIndicatorEl.textContent = `${src}→${tgt}`;
}

function getLangName(code) {
  if (code === 'auto') return '自動検出';
  try { return new Intl.DisplayNames(['ja'], { type: 'language' }).of(code) ?? code; }
  catch (_) { return code; }
}

function handleLogout() {
  isAuthenticated = false;
  twitchToken     = '';
  twitchUsername  = '';
  chrome.storage.local.remove(['twitch_token', 'twitch_username']);
  updateAuthUI();
  // 匿名で再接続
  if (currentChannel) { disconnect(); connect(); }
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
    // Whisper モデルのロード進捗を字幕に表示
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

// ===== ドラッグ移動 =====
function makeDraggable(handle) {
  handle.addEventListener('mousedown', e => {
    if (e.target.closest('.close-btn')) return;
    e.preventDefault();
    const rect = container.getBoundingClientRect();
    const startX = e.clientX, startY = e.clientY;
    const origRight  = window.innerWidth  - rect.right;
    const origBottom = window.innerHeight - rect.bottom;
    const onMove = e => {
      container.style.right  = Math.max(0, origRight  - (e.clientX - startX)) + 'px';
      container.style.bottom = Math.max(0, origBottom - (e.clientY - startY)) + 'px';
    };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// ===== リサイズ =====
function makeResizable(handle) {
  handle.addEventListener('mousedown', e => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX, startY = e.clientY;
    const startW = container.offsetWidth, startH = container.offsetHeight;
    // ドラッグ開始時点のright/bottomを取得（ドラッグ移動後も変わっている可能性あり）
    const origRight  = parseFloat(container.style.right)  || 20;
    const origBottom = parseFloat(container.style.bottom) || 20;
    const onMove = e => {
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      // 幅・高さのクランプ後の実際の変化量でright/bottomも動かす
      // → 右端・下端がマウスに追従し、上端・左端は固定される
      const newW = Math.max(220, startW + deltaX);
      const newH = Math.max(200, startH + deltaY);
      container.style.width  = newW + 'px';
      container.style.height = newH + 'px';
      container.style.right  = Math.max(0, origRight  - (newW - startW)) + 'px';
      container.style.bottom = Math.max(0, origBottom - (newH - startH)) + 'px';
    };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
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
    if (isAuthenticated && twitchToken) {
      // 認証済みで接続（チャット送信が可能になる）
      ws.send(`PASS oauth:${twitchToken}`);
      ws.send(`NICK ${twitchUsername}`);
    } else {
      // 匿名で接続（読み取り専用）
      ws.send('PASS oauth:will_not_actually_work');
      ws.send('NICK justinfan' + Math.floor(Math.random() * 99999));
    }
    ws.send(`JOIN #${currentChannel}`);
  };

  ws.onmessage = e => e.data.split('\r\n').filter(Boolean).forEach(handleIRCLine);
  ws.onerror   = () => { setStatus('error'); addSystemMessage('接続エラーが発生しました。'); };
  ws.onclose   = () => {
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
    const authLabel = isAuthenticated ? ` (${twitchUsername} でログイン中)` : '';
    addSystemMessage(`#${currentChannel} に接続しました！${authLabel}`);
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
  el.innerHTML = `
    <span class="msg-user" style="color:${color || '#f0b429'}">${escapeHtml(username)}</span>
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

// 自分が送信したメッセージをパネルに追加（Twitchはエコーバックしないため手動追加）
// sentText: 実際に送信したテキスト（src_lang）、typedText: 入力したテキスト（tgt_lang、翻訳なしの場合は null）
function addOwnMessage(sentText, typedText) {
  const el = document.createElement('div');
  el.className = 'msg own-msg';
  el.innerHTML = `
    <span class="msg-user" style="color:#9147ff">${escapeHtml(twitchUsername)}</span>
    <div class="msg-orig">${escapeHtml(sentText)}</div>
    <div class="msg-trans">${escapeHtml(typedText ?? sentText)}</div>
  `;
  messagesEl.appendChild(el);
  trimMessages();
  messageCount++;
  if (msgCountEl) msgCountEl.textContent = `${messageCount} msgs`;
  if (settings.auto_scroll) scrollToBottom();
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

// ===== チャット送信（IRC WebSocket 経由） =====
async function sendUserMessage() {
  const text = chatInputEl.value.trim();
  if (!text || !isAuthenticated || !ws) return;

  chatInputEl.value    = '';
  chatInputEl.disabled = true;
  sendBtnEl.disabled   = true;

  try {
    // tgt_lang → src_lang に翻訳してからチャンネルに送信
    let sendText = text;
    if (settings.src_lang !== 'auto') {
      sendText = await translateViaBackground(text, settings.tgt_lang, settings.src_lang);
    }
    ws.send(`PRIVMSG #${currentChannel} :${sendText}`);
    // Twitch IRC は自分のメッセージをエコーバックしないので手動でパネルに追加
    addOwnMessage(sendText, sendText !== text ? text : null);
  } catch (e) {
    addSystemMessage(`送信失敗: ${e.message}`);
  } finally {
    chatInputEl.disabled = false;
    sendBtnEl.disabled   = false;
    chatInputEl.focus();
  }
}

// ===== 翻訳リクエスト（background.js経由、リトライあり） =====
async function translateViaBackground(text, from, to) {
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const res = await Promise.race([
        chrome.runtime.sendMessage({ type: 'translate', text, from, to }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('タイムアウト')), 10000)),
      ]);
      if (!res?.ok) throw new Error(res?.error || 'translate failed');
      return res.result;
    } catch (e) {
      if (attempt === 2) throw e;
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

// ===== 音声認識・字幕オーバーレイ =====

function toggleVoice() {
  if (isVoiceActive) stopVoice();
  else startVoice();
}

async function startVoice() {
  ensureSubtitleContainer();

  // Web Audio API で <video> 要素から直接音声を取得（タブ共有バナーなし）
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
      voiceSourceNode.connect(voiceAudioCtx.destination); // 音声を引き続き再生
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

  // AudioContext で音量レベルを計測
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
      cableLevel = Math.round(Math.max(...buf) / 255 * 100);
      if (cableLevel > VAD_SILENCE_THRESHOLD) hadSpeech = true;
      setTimeout(sampleLevel, 100); // 300ms → 100ms で応答性向上
    };
    sampleLevel();
  } catch (_) {}

  isSendingChunk = false;
  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus' : 'audio/webm';

  function startRecordingCycle() {
    if (!isVoiceActive) return;
    audioChunks = [];
    hadSpeech   = false;
    mediaRecorder = new MediaRecorder(voiceStream, { mimeType });
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };

    // VAD: 発話後に VAD_SILENCE_MS の無音が続いたら即処理
    let silenceStart = null;
    let vadTimer     = null;
    const checkVAD = () => {
      if (!isVoiceActive || mediaRecorder?.state !== 'recording') return;
      if (cableLevel > VAD_SILENCE_THRESHOLD) {
        silenceStart = null; // 音があればリセット
      } else if (hadSpeech) {
        if (!silenceStart) silenceStart = Date.now();
        if (Date.now() - silenceStart >= VAD_SILENCE_MS) {
          clearTimeout(voiceSessionTimer);
          mediaRecorder.stop(); // 無音検出 → 即処理
          return;
        }
      }
      vadTimer = setTimeout(checkVAD, 80);
    };

    mediaRecorder.onstop = async () => {
      clearTimeout(vadTimer);
      const wasSpeech = hadSpeech;
      if (wasSpeech && audioChunks.length > 0 && !isSendingChunk) {
        isSendingChunk = true;
        showSubtitle('🔄 認識中...', false);
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        try {
          const text = await transcribeViaBackground(blob, 'audio/webm', settings.src_lang);
          if (text?.trim()) await handleFinalTranscript(text.trim());
          else showSubtitle(`🎤 録音中 (${cableLevel}%)`, false);
        } catch (err) {
          showSubtitle(`⚠ 認識エラー: ${err.message}`, false);
        } finally {
          isSendingChunk = false;
        }
      }
      startRecordingCycle();
    };

    mediaRecorder.start(100); // 100ms ごとにデータを蓄積
    checkVAD();
    // 発話が続く場合の上限（VAD_MAX_CHUNK_MS）
    voiceSessionTimer = setTimeout(() => {
      if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
    }, VAD_MAX_CHUNK_MS);
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
    mediaRecorder.onstop = null; // 再帰呼び出しを防ぐ
    mediaRecorder.stop();
  }
  mediaRecorder = null;
  audioChunks   = [];
  hadSpeech     = false;
  // voiceSourceNode は video 要素と紐づくため再利用する（close しない）
  // voiceDestNode への接続だけ切断
  if (voiceSourceNode && voiceDestNode) {
    try { voiceSourceNode.disconnect(voiceDestNode); } catch (_) {}
  }
  voiceDestNode = null;
  voiceStream   = null;
  cableLevel = 0;
  clearSubtitle();
}

async function handleFinalTranscript(text) {
  try {
    const from = (settings.src_lang === 'auto') ? 'auto' : settings.src_lang;
    const translated = await translateViaBackground(text, from, settings.tgt_lang);
    showSubtitle(translated, true);
  } catch {
    showSubtitle(text, true);
  }
}

// ===== Whisper ページスクリプト注入（MAIN world） =====
let whisperReadyPromise  = null;
const pendingTranscriptions = new Map(); // requestId → { resolve, reject, timer }

function ensureWhisperPageScript() {
  if (whisperReadyPromise) return whisperReadyPromise;

  whisperReadyPromise = new Promise((resolve, reject) => {
    // 結果を受信
    window.addEventListener('__tct_whisper_result', ({ detail }) => {
      const req = pendingTranscriptions.get(detail.requestId);
      if (!req) return;
      pendingTranscriptions.delete(detail.requestId);
      clearTimeout(req.timer);
      if (detail.ok) req.resolve(detail.result);
      else req.reject(new Error(detail.error));
    });

    // ステータスを受信して字幕に表示
    window.addEventListener('__tct_whisper_status', ({ detail }) => {
      if (isVoiceActive) showSubtitle(detail.text, false);
    });

    // 注入完了を待つ（whisper-injected.js の末尾が __tct_whisper_ready を dispatch する）
    window.addEventListener('__tct_whisper_ready', () => resolve(), { once: true });

    // whisper-injected.js を MAIN world に注入
    const script = document.createElement('script');
    script.type    = 'module';
    script.src     = chrome.runtime.getURL('whisper-injected.js');
    script.onerror = () => reject(new Error('whisper-injected.js の読み込みに失敗しました'));
    document.head.appendChild(script);
  });

  return whisperReadyPromise;
}

// 音声チャンクを MAIN world の Whisper スクリプトへ送信
async function transcribeViaBackground(blob, mimeType, language) {
  await ensureWhisperPageScript(); // スクリプト準備完了まで待ってからイベント送信

  const arrayBuffer = await blob.arrayBuffer();
  const audioBase64 = arrayBufferToBase64(arrayBuffer);
  const requestId   = Math.random().toString(36).slice(2);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingTranscriptions.delete(requestId);
      reject(new Error('タイムアウト（初回はモデルDL完了後に再試行してください）'));
    }, 180000);

    pendingTranscriptions.set(requestId, { resolve, reject, timer });

    window.dispatchEvent(new CustomEvent('__tct_whisper_transcribe', {
      detail: { audioBase64, mimeType, language, requestId },
    }));
  });
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + 8192, bytes.length)));
  }
  return btoa(binary);
}

function showGroqBar() { shadowRoot?.getElementById('groqBar')?.classList.remove('hidden'); }
function hideGroqBar() { shadowRoot?.getElementById('groqBar')?.classList.add('hidden'); }

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

// 字幕コンテナを document.body 直下に作成（Shadow DOM外）
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
    'max-width:80vw',
    'min-width:200px',
    'text-align:center',
    'cursor:grab',
  ].join(';');
  document.body.appendChild(subtitleContainer);
  makeSubtitleDraggable(subtitleContainer);

  // 保存済みの位置があれば復元
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

    // bottom/transform → top/left に変換
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
  subtitleContainer.style.opacity   = '1';
  subtitleContainer.style.transition = 'none';
  subtitleContainer.innerHTML = `
    <span style="
      display:inline-block;
      background:rgba(0,0,0,0.75);
      color:${isFinal ? '#ffffff' : '#aaaaaa'};
      font-size:22px;
      font-weight:${isFinal ? '700' : '400'};
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      padding:8px 18px;
      border-radius:6px;
      line-height:1.4;
      font-style:${isFinal ? 'normal' : 'italic'};
    ">${escapeHtml(text)}</span>
  `;
  if (isFinal) {
    // 確定テキストは4秒後にフェードアウト
    subtitleFadeTimer = setTimeout(() => {
      subtitleContainer.style.transition = 'opacity 0.8s';
      subtitleContainer.style.opacity = '0';
    }, 4000);
  }
}

function clearSubtitle() {
  if (!subtitleContainer) return;
  clearTimeout(subtitleFadeTimer);
  subtitleContainer.innerHTML = '';
}

function updateVoiceBtn() {
  const btn = shadowRoot?.getElementById('voiceBtn');
  if (!btn) return;
  btn.classList.toggle('active', isVoiceActive);
  btn.title = isVoiceActive ? '音声字幕 ON（クリックで停止）' : '音声字幕 OFF（クリックで開始）';
}

// ===== 起動 =====
init();
