'use strict';

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
    opacity: var(--panel-opacity, 1);
    transition: opacity 0.2s;
  }
  .panel:hover {
    opacity: 1 !important;
  }

  /* ヘッダー */
  .header {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 7px 10px;
    background: #18181b;
    border-bottom: 1px solid #2d2d2f;
    cursor: grab;
    user-select: none;
    flex-shrink: 0;
  }
  .header:active { cursor: grabbing; }

  .header-row {
    display: flex; align-items: center; gap: 6px; min-width: 0;
  }

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
    font-size: 12px; font-weight: 700; color: #efeff1;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    flex-shrink: 0;
  }
  .game-name {
    font-size: 10px; color: #7d7d8f;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    flex: 1;
  }
  .header-spacer { flex: 1; }
  .version-badge { font-size: 9px; color: #5a5a6e; flex-shrink: 0; }

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

  .hint-btn {
    background: none; border: none; cursor: pointer;
    font-size: 13px; line-height: 1; padding: 0 2px; flex-shrink: 0;
    opacity: 0.5;
  }
  .hint-btn:hover  { opacity: 0.85; }
  .hint-btn.active { opacity: 1; filter: drop-shadow(0 0 4px #f0b429); }

  .hint-bar { padding: 4px 8px; background: #131316; border-bottom: 1px solid #2a2a2e; }
  .hint-input {
    width: 100%; box-sizing: border-box;
    background: #1e1e21; border: 1px solid #3a3a3e; border-radius: 4px;
    color: #efeff1; font-size: 11px; padding: 4px 6px; outline: none;
  }
  .hint-input:focus { border-color: #9147ff; }
  .hint-input.auto  { color: #8a8a92; font-style: italic; }

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

  .scroll-to-bottom {
    position: absolute; bottom: 54px; left: 50%; transform: translateX(-50%);
    background: #9147ff; color: #fff; border: none; border-radius: 14px;
    padding: 4px 14px; font-size: 12px; cursor: pointer; white-space: nowrap;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4); opacity: 0; pointer-events: none;
    transition: opacity 0.2s;
  }
  .scroll-to-bottom.visible { opacity: 1; pointer-events: auto; }

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

  /* フッター（翻訳エンジン表示） */
  .footer {
    display: flex; justify-content: space-between;
    padding: 3px 8px;
    background: #0a0a0c;
    border-top: 1px solid #1e1e21;
    flex-shrink: 0;
    font-size: 10px; color: #5a5a6e;
    font-family: 'Courier New', monospace;
  }
  .footer-item { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .footer-engine { color: #7a7a8e; }
  .footer-engine.gemini { color: #4285f4; }
  .footer-engine.deepl  { color: #0f2b46; filter: brightness(2.5); }

  /* リサイズハンドル */
  .resize-handle {
    position: absolute; bottom: 0; right: 0; width: 14px; height: 14px;
    cursor: nwse-resize; background: linear-gradient(135deg, transparent 50%, #3d3d40 50%);
    border-radius: 0 0 8px 0; z-index: 1;
  }
  .resize-handle:hover { background: linear-gradient(135deg, transparent 50%, #9147ff 50%); }
`;

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
        <div class="header-row">
          <div class="status-dot connecting" id="statusDot"></div>
          <span class="channel-name" id="channelName">接続待ち</span>
          <span class="game-name" id="gameName"></span>
        </div>
        <div class="header-row">
          <span class="lang-indicator" id="langIndicator"></span>
          <div class="header-spacer"></div>
          <span class="version-badge" title="バージョン">${chrome.runtime.getManifest().version}</span>
          <button class="hint-btn" id="hintBtn" title="認識ヒント（固有名詞を入れると音声認識の精度が上がります）">💡</button>
          <button class="voice-btn" id="voiceBtn" title="音声字幕 ON/OFF">🎤</button>
          <button class="close-btn" id="closeBtn" title="閉じる">×</button>
        </div>
      </div>
      <div class="hint-bar" id="hintBar" style="display:none">
        <input type="text" class="hint-input" id="hintInput" autocomplete="off" spellcheck="false"
               placeholder="認識ヒント: 固有名詞をスペース区切りで（即反映）">
      </div>
      <div class="auth-bar" id="authBar">
        <button class="login-btn" id="loginBtn">Twitchでログインしてチャット送信を有効化</button>
        <div class="auth-info hidden" id="authInfo">
          <span class="auth-username" id="authUsername"></span>
          <button class="logout-btn" id="logoutBtn">ログアウト</button>
        </div>
      </div>
      <div class="messages" id="messages"></div>
      <button class="scroll-to-bottom" id="scrollToBottomBtn">↓ 最新へ</button>
      <div class="input-area" id="inputArea">
        <input type="text" class="chat-input" id="chatInput" autocomplete="off" spellcheck="false">
        <button class="send-btn" id="sendBtn">送信</button>
      </div>
      <div class="footer" id="footer">
        <span class="footer-item">チャット: <span class="footer-engine" id="footerChat">-</span></span>
        <span class="footer-item">音声: <span class="footer-engine" id="footerVoice">-</span></span>
      </div>
      <div class="resize-handle" id="resizeHandle"></div>
    </div>
  `;

  document.body.appendChild(container);

  panel             = shadowRoot.getElementById('panel');
  statusDotEl       = shadowRoot.getElementById('statusDot');
  channelNameEl     = shadowRoot.getElementById('channelName');
  gameNameEl        = shadowRoot.getElementById('gameName');
  langIndicatorEl   = shadowRoot.getElementById('langIndicator');
  messagesEl          = shadowRoot.getElementById('messages');
  scrollToBottomBtnEl = shadowRoot.getElementById('scrollToBottomBtn');
  authBarEl           = shadowRoot.getElementById('authBar');
  loginBtnEl     = shadowRoot.getElementById('loginBtn');
  authInfoEl     = shadowRoot.getElementById('authInfo');
  authUsernameEl = shadowRoot.getElementById('authUsername');
  logoutBtnEl    = shadowRoot.getElementById('logoutBtn');
  chatInputEl    = shadowRoot.getElementById('chatInput');
  sendBtnEl      = shadowRoot.getElementById('sendBtn');

  shadowRoot.getElementById('closeBtn').addEventListener('click', () => setActive(false));
  shadowRoot.getElementById('voiceBtn').addEventListener('click', toggleVoice);

  // 認識ヒントバー：💡で開閉、入力は500msデバウンスでストレージ保存（次のチャンクから反映）
  const hintBtn   = shadowRoot.getElementById('hintBtn');
  const hintBar   = shadowRoot.getElementById('hintBar');
  const hintInput = shadowRoot.getElementById('hintInput');
  hintInputEl     = hintInput;
  let hintSaveTimer = null;
  hintBtn.addEventListener('click', () => {
    const open = hintBar.style.display === 'none';
    hintBar.style.display = open ? '' : 'none';
    hintBtn.classList.toggle('active', open);
    if (open) {
      syncHintInput();
      hintInput.focus();
    }
  });
  hintInput.addEventListener('input', () => {
    hintInput.classList.remove('auto');
    clearTimeout(hintSaveTimer);
    hintSaveTimer = setTimeout(() => {
      chrome.storage.local.set({ whisper_prompt: hintInput.value.trim() });
    }, 500);
  });
  // 空のままフォーカスを外したら自動ヒント表示に戻す
  hintInput.addEventListener('blur', () => {
    if (!hintInput.value.trim()) syncHintInput();
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

  messagesEl.addEventListener('scroll', () => {
    const atBottom = messagesEl.scrollTop + messagesEl.clientHeight >= messagesEl.scrollHeight - 30;
    scrollPaused = !atBottom;
    scrollToBottomBtnEl.classList.toggle('visible', scrollPaused);
    scheduleVisibleTranslate();
  });

  // ホバー中は可視範囲の未翻訳メッセージを翻訳（弾幕モード時）
  panel.addEventListener('mouseenter', () => { _panelHover = true; scheduleVisibleTranslate(); });
  panel.addEventListener('mouseleave', () => { _panelHover = false; });

  scrollToBottomBtnEl.addEventListener('click', () => {
    scrollPaused = false;
    scrollToBottomBtnEl.classList.remove('visible');
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });

  updateAuthUI();
  updateInputPlaceholder();
  updateLangIndicator();
  updateFooter();
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
  const engine = (settings.deepl_enabled && settings.deepl_chat) ? 'DeepL' : 'Google';
  langIndicatorEl.textContent = `${src}→${tgt}・${engine}`;
  langIndicatorEl.style.color = hasChannelSpecificSettings ? '#ff9147' : '';
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
  if (currentChannel) { disconnect(); connect(); }
}

// ===== パネル透過率 =====
function applyPanelOpacity() {
  if (!panel) return;
  const opacity = settings.panel_opacity ?? 0.8;
  panel.style.setProperty('--panel-opacity', opacity);
}

// ===== 状態ドット =====
function setStatus(state) { if (statusDotEl) statusDotEl.className = `status-dot ${state}`; }

// ===== 音声ボタン =====
function updateVoiceBtn() {
  const btn = shadowRoot?.getElementById('voiceBtn');
  if (!btn) return;
  btn.classList.toggle('active', isVoiceActive);
  btn.title = isVoiceActive ? '音声字幕 ON（クリックで停止）' : '音声字幕 OFF（クリックで開始）';
}

// ===== フッター更新 =====
function updateFooter() {
  const chatEl  = shadowRoot?.getElementById('footerChat');
  const voiceEl = shadowRoot?.getElementById('footerVoice');
  if (!chatEl || !voiceEl) return;

  // チャット翻訳エンジン
  const chatEngine = (settings.deepl_enabled && settings.deepl_chat) ? 'DeepL' : 'Google';
  chatEl.textContent = chatEngine;
  chatEl.className = 'footer-engine' + (chatEngine === 'DeepL' ? ' deepl' : '');

  // 音声翻訳エンジン
  let voiceEngine;
  if (settings.gemini_enabled) {
    voiceEngine = 'Gemini';
  } else if (settings.deepl_enabled && settings.deepl_voice) {
    voiceEngine = 'DeepL';
  } else {
    voiceEngine = 'Google';
  }
  voiceEl.textContent = voiceEngine;
  voiceEl.className = 'footer-engine' + (voiceEngine === 'Gemini' ? ' gemini' : voiceEngine === 'DeepL' ? ' deepl' : '');
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
    const origRight  = parseFloat(container.style.right)  || 20;
    const origBottom = parseFloat(container.style.bottom) || 20;
    const onMove = e => {
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
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
