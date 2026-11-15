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

  .scroll-to-bottom {
    position: absolute; bottom: 76px; left: 50%; transform: translateX(-50%);
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
    position: relative;
    display: flex; gap: 6px; padding: 8px;
    border-top: 1px solid #2d2d2f; background: #18181b; flex-shrink: 0;
  }

  /* メンション自動補完 */
  .mention-list {
    display: none;
    position: absolute; left: 8px; right: 8px; bottom: 100%; margin-bottom: 4px;
    max-height: 140px; overflow-y: auto;
    background: #18181b; border: 1px solid #3d3d40; border-radius: 4px;
    font-size: 12px; z-index: 5;
  }
  .mention-item { padding: 5px 8px; cursor: pointer; color: #efeff1; }
  .mention-item:hover, .mention-item.active { background: #2d2d2f; }

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
  .footer-engine { color: #7a7a8e; cursor: pointer; border-bottom: 1px dotted transparent; }
  .footer-engine:hover { color: #efeff1; border-bottom-color: #5a5a6e; }
  .footer-engine.gemini { color: #4285f4; }
  .footer-engine.deepl  { color: #00c4a0; }

  /* リサイズハンドル */
  .resize-handle {
    position: absolute; bottom: 0; right: 0; width: 14px; height: 14px;
    cursor: nwse-resize; background: linear-gradient(135deg, transparent 50%, #3d3d40 50%);
    border-radius: 0 0 8px 0; z-index: 1;
  }
  .resize-handle:hover { background: linear-gradient(135deg, transparent 50%, #9147ff 50%); }

  /* 折りたたみ */
  :host(.collapsed) { height: auto; min-height: 0; }
  :host(.collapsed) .auth-bar,
  :host(.collapsed) .messages,
  :host(.collapsed) .scroll-to-bottom,
  :host(.collapsed) .resize-handle { display: none; }

  .collapse-btn {
    background: #000; border: none; color: #adadb8; cursor: pointer;
    font-size: 11px; line-height: 1; padding: 1px 5px; flex-shrink: 0;
    border-radius: 3px;
    transition: color 0.15s;
  }
  .collapse-btn:hover { color: #efeff1; }
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
          <span class="version-badge" title="バージョン">${chrome.runtime.getManifest().version}</span>
          <button class="close-btn" id="closeBtn" title="閉じる">×</button>
        </div>
        <div class="header-row">
          <span class="lang-indicator" id="langIndicator"></span>
          <div class="header-spacer"></div>
          <button class="collapse-btn" id="collapseBtn" title="折りたたむ">▲</button>
        </div>
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
        <div class="mention-list" id="mentionList"></div>
        <input type="text" class="chat-input" id="chatInput" autocomplete="off" spellcheck="false">
        <button class="send-btn" id="sendBtn">送信</button>
      </div>
      <div class="footer" id="footer">
        <span class="footer-item">チャット入力: <span class="footer-engine" id="footerChat">-</span></span>
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
  loginBtnEl     = shadowRoot.getElementById('loginBtn');
  authInfoEl     = shadowRoot.getElementById('authInfo');
  authUsernameEl = shadowRoot.getElementById('authUsername');
  logoutBtnEl    = shadowRoot.getElementById('logoutBtn');
  chatInputEl    = shadowRoot.getElementById('chatInput');
  sendBtnEl      = shadowRoot.getElementById('sendBtn');
  mentionListEl  = shadowRoot.getElementById('mentionList');

  shadowRoot.getElementById('closeBtn').addEventListener('click', () => setActive(false));
  shadowRoot.getElementById('collapseBtn').addEventListener('click', toggleCollapse);

  // フッター：クリックで翻訳エンジンを切替
  shadowRoot.getElementById('footerChat').addEventListener('click', () => cycleFeatureEngine('own'));

  loginBtnEl.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'twitch_login' }));
  logoutBtnEl.addEventListener('click', handleLogout);

  // キーボードイベントをShadow DOM内で止めてTwitchのグローバルハンドラに漏らさない
  chatInputEl.addEventListener('keydown', e => {
    e.stopPropagation();
    if (mentionMatches.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveMentionActive(1); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); moveMentionActive(-1); return; }
      if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); applyMentionSelection(); return; }
      if (e.key === 'Escape') { closeMentionList(); return; }
    }
    if (e.key === 'Enter') sendUserMessage();
  });
  chatInputEl.addEventListener('keyup',    e => e.stopPropagation());
  chatInputEl.addEventListener('keypress', e => e.stopPropagation());
  chatInputEl.addEventListener('input',  updateMentionSuggestions);
  chatInputEl.addEventListener('blur',   () => setTimeout(closeMentionList, 150)); // クリック選択を待ってから閉じる

  // メンション候補をクリック/タップで選択（mousedownでblurより先に確定）
  mentionListEl.addEventListener('mousedown', e => {
    const item = e.target.closest('.mention-item');
    if (!item) return;
    e.preventDefault();
    mentionActiveIndex = Number(item.dataset.i);
    applyMentionSelection();
  });

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

// ===== メンション自動補完 =====
// 入力欄のカーソル直前が「（行頭または空白）+ @ + 空白を含まない文字列」のとき、
// 最近発言したユーザー名から前方一致する候補を表示する
function updateMentionSuggestions() {
  if (!chatInputEl) return;
  const caret    = chatInputEl.selectionStart;
  const uptoCaret = chatInputEl.value.slice(0, caret);
  const m = uptoCaret.match(/(^|\s)@([^\s@]*)$/);
  if (!m) { closeMentionList(); return; }

  const query = m[2].toLowerCase();
  const candidates = [...chatters.entries()]
    .reverse() // 最近発言した順
    .filter(([lname]) => lname.startsWith(query))
    .slice(0, 8);
  if (!candidates.length) { closeMentionList(); return; }

  mentionMatches    = candidates;
  mentionTokenStart = caret - query.length - 1; // "@" の位置
  renderMentionList();
}

function renderMentionList() {
  mentionActiveIndex = 0;
  mentionListEl.innerHTML = mentionMatches.map(([, name], i) =>
    `<div class="mention-item${i === 0 ? ' active' : ''}" data-i="${i}">${escapeHtml(name)}</div>`
  ).join('');
  mentionListEl.style.display = 'block'; // CSSの基本値はnoneなので明示的にblockへ
}

function moveMentionActive(delta) {
  mentionActiveIndex = (mentionActiveIndex + delta + mentionMatches.length) % mentionMatches.length;
  [...mentionListEl.children].forEach((el, i) => el.classList.toggle('active', i === mentionActiveIndex));
}

function applyMentionSelection() {
  if (!mentionMatches.length) return;
  const [, name] = mentionMatches[mentionActiveIndex];
  const before = chatInputEl.value.slice(0, mentionTokenStart);
  const after  = chatInputEl.value.slice(chatInputEl.selectionStart);
  const inserted = `@${name} `;
  chatInputEl.value = before + inserted + after;
  const newPos = (before + inserted).length;
  chatInputEl.setSelectionRange(newPos, newPos);
  closeMentionList();
  chatInputEl.focus();
}

function closeMentionList() {
  mentionMatches     = [];
  mentionActiveIndex = -1;
  if (mentionListEl) mentionListEl.style.display = 'none';
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
  safeStorageRemove(['twitch_token', 'twitch_username']);
  updateAuthUI();
  if (currentChannel) { disconnect(); connect(); }
}

// ===== 折りたたみ =====
let panelCollapsed = false;
let _savedPanelHeight = '480px';

function _updateCollapseBtn() {
  const btn = shadowRoot?.getElementById('collapseBtn');
  if (btn) { btn.textContent = panelCollapsed ? '▼' : '▲'; btn.title = panelCollapsed ? '展開する' : '折りたたむ'; }
}

function toggleCollapse() {
  if (panelCollapsed) {
    // 折りたたみ中 → 展開: クラス変更前に位置を確定（auto height 変化で rect.top がずれるのを防ぐ）
    const rect = container.getBoundingClientRect();
    panelCollapsed = false;
    container.classList.remove('collapsed');
    const h   = parseFloat(_savedPanelHeight) || 480;
    const top = Math.max(0, Math.min(rect.top, window.innerHeight - h - 10));
    container.style.top    = top + 'px';
    container.style.bottom = 'auto';
    container.style.height    = _savedPanelHeight;
    container.style.minHeight = '';
  } else {
    // 展開中 → 折りたたみ: 現在の高さと位置を保存して top アンカーに切り替え
    _savedPanelHeight = container.style.height || '480px';
    const rect = container.getBoundingClientRect();
    panelCollapsed = true;
    container.classList.add('collapsed');
    container.style.top    = Math.max(0, rect.top) + 'px';
    container.style.bottom = 'auto';
    container.style.height    = 'auto';
    container.style.minHeight = '0';
  }
  _updateCollapseBtn();
  safeStorageSet({ panel_collapsed: panelCollapsed });
}

function applyCollapsedState(val) {
  // ページ初期化時の状態復元（getBoundingClientRect未使用・高さのみ制御）
  panelCollapsed = !!val;
  container.classList.toggle('collapsed', panelCollapsed);
  if (panelCollapsed) {
    _savedPanelHeight = container.style.height || '480px';
    container.style.height    = 'auto';
    container.style.minHeight = '0';
  } else {
    container.style.height    = _savedPanelHeight;
    container.style.minHeight = '';
  }
  _updateCollapseBtn();
}

// ===== パネル透過率 =====
function applyPanelOpacity() {
  if (!container) return;
  const opacity = settings.panel_opacity ?? 0.8;
  container.style.setProperty('--panel-opacity', opacity);
}

// ===== 状態ドット =====
function setStatus(state) { if (statusDotEl) statusDotEl.className = `status-dot ${state}`; }

// ===== フッター：エンジン切替 =====
// 「チャット入力」は Gemini / DeepL の有効フラグを切り替えて優先エンジンを変える
const FOOTER_FEATURES = {
  own: { geminiFlag: 'gemini_own', deeplFlag: 'deepl_own' }, // チャット入力（送信メッセージ翻訳）
};

function getFeatureEngine(feature) {
  const f = FOOTER_FEATURES[feature];
  if (settings.gemini_enabled && settings[f.geminiFlag]) return 'Gemini';
  if (settings.deepl_enabled  && settings[f.deeplFlag])  return 'DeepL';
  return 'Google';
}

function getFeatureAvailable() {
  const list = ['Google'];
  if (settings.deepl_enabled)  list.push('DeepL');
  if (settings.gemini_enabled) list.push('Gemini');
  return list;
}

// オプションで有効化済みのエンジンの中だけをクリックで巡回（未設定エンジンには切替できない）
function cycleFeatureEngine(feature) {
  const f = FOOTER_FEATURES[feature];
  const available = getFeatureAvailable();
  if (available.length <= 1) return;
  const current = getFeatureEngine(feature);
  const next = available[(available.indexOf(current) + 1) % available.length];
  safeStorageSet({
    [f.geminiFlag]: next === 'Gemini',
    [f.deeplFlag]:  next === 'DeepL',
  });
}

// ===== フッター更新 =====
function updateFooter() {
  const chatEl = shadowRoot?.getElementById('footerChat');
  if (!chatEl) return;

  const chatAvailable = getFeatureAvailable();
  const chatEngine = getFeatureEngine('own');
  chatEl.textContent = chatEngine;
  chatEl.className = 'footer-engine' + (chatEngine === 'Gemini' ? ' gemini' : chatEngine === 'DeepL' ? ' deepl' : '');
  chatEl.title = chatAvailable.length > 1
    ? `クリックで切替（${chatAvailable.join(' → ')}）`
    : 'オプションでDeepL/Geminiを有効にすると切替できます';
}

// ===== ドラッグ移動 =====
function makeDraggable(handle) {
  handle.addEventListener('mousedown', e => {
    if (e.target.closest('.close-btn, .collapse-btn')) return;
    e.preventDefault();
    const rect = container.getBoundingClientRect();
    const startX = e.clientX, startY = e.clientY;
    const origRight  = window.innerWidth  - rect.right;
    const origBottom = window.innerHeight - rect.bottom;
    container.style.top  = 'auto';
    container.style.left = 'auto';
    container.style.right  = origRight  + 'px';
    container.style.bottom = origBottom + 'px';
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
      _savedPanelHeight = newH + 'px';
      container.style.right  = Math.max(0, origRight  - (newW - startW)) + 'px';
      container.style.bottom = Math.max(0, origBottom - (newH - startH)) + 'px';
    };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}
