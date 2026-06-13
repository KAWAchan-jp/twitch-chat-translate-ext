'use strict';

// ===== チャット翻訳キュー（3並列・FIFO） =====
const TRANSLATE_CONCURRENCY = 3;
let _translateActive  = 0;
const _translateWaiting = [];
let messageCount = 0;

// ===== 弾幕モード =====
const DANMAKU_WINDOW_MS   = 3000;
const DANMAKU_ENTER_RATE  = 3;   // msg/秒 以上で弾幕モードON
const DANMAKU_EXIT_RATE   = 1.5; // msg/秒 以下で弾幕モードOFF（ヒステリシス）
const _msgTimestamps = [];
let danmakuMode = false;
let _panelHover = false;
let _visTransTimer = null;

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
      ws.send(`PASS oauth:${twitchToken}`);
      ws.send(`NICK ${twitchUsername}`);
    } else {
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
    addSystemMessage(`接続が切断されました。${wsReconnectDelay / 1000}秒後に再接続します...`);
    wsReconnectTimer = setTimeout(() => {
      if (!currentChannel) return;
      wsReconnectDelay = Math.min(wsReconnectDelay * 2, WS_RECONNECT_MAX_DELAY_MS);
      connect();
    }, wsReconnectDelay);
  };
}

function disconnect() {
  if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }
  wsReconnectDelay = 1000;
  if (ws) { ws.onclose = null; ws.close(); ws = null; }
}

function resetMessages() {
  if (!messagesEl) return;
  messagesEl.innerHTML = '';
  messageCount = 0;
  scrollPaused = false;
  scrollToBottomBtnEl?.classList.remove('visible');
}

// ===== IRCメッセージ処理 =====
function handleIRCLine(line) {
  if (line.startsWith('PING')) { ws?.send('PONG :tmi.twitch.tv'); return; }
  if (line.includes(`JOIN #${currentChannel}`)) {
    setStatus('connected');
    wsReconnectDelay = 1000;
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
  } catch (e) { console.warn('[TCT] IRCメッセージのパース失敗:', e); }
  return null;
}

function parseTags(tagStr) {
  const tags = {};
  tagStr.split(';').forEach(pair => { const [k, v] = pair.split('='); tags[k] = v || ''; });
  return tags;
}

// ===== 弾幕モード判定 =====
function updateDanmakuMode() {
  const now = Date.now();
  _msgTimestamps.push(now);
  while (_msgTimestamps.length && _msgTimestamps[0] < now - DANMAKU_WINDOW_MS) _msgTimestamps.shift();
  const rate = _msgTimestamps.length / (DANMAKU_WINDOW_MS / 1000);
  if (!danmakuMode && rate >= DANMAKU_ENTER_RATE) {
    danmakuMode = true;
    console.log('[TCT] 弾幕モード ON（流速が速いため可視範囲のみ翻訳）');
  } else if (danmakuMode && rate <= DANMAKU_EXIT_RATE) {
    danmakuMode = false;
    console.log('[TCT] 弾幕モード OFF');
  }
}

// パネル内に見えている未翻訳メッセージを翻訳する（弾幕モード時のスクロール停止・ホバーで発動）
function translateVisibleMessages() {
  if (!messagesEl) return;
  const viewRect = messagesEl.getBoundingClientRect();
  for (const el of messagesEl.children) {
    if (!el._rawText || el._translated) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom >= viewRect.top && r.top <= viewRect.bottom) {
      el._translated = true;
      translateMessageEl(el);
    }
  }
}

function scheduleVisibleTranslate() {
  clearTimeout(_visTransTimer);
  _visTransTimer = setTimeout(translateVisibleMessages, 200);
}

// ===== 翻訳タスクを並列数制限付きで実行 =====
function enqueueTranslation(task) {
  return new Promise((resolve, reject) => {
    _translateWaiting.push({ task, resolve, reject });
    pumpTranslateQueue();
  });
}

function pumpTranslateQueue() {
  while (_translateActive < TRANSLATE_CONCURRENCY && _translateWaiting.length > 0) {
    const { task, resolve, reject } = _translateWaiting.shift();
    _translateActive++;
    task().then(resolve, reject).finally(() => {
      _translateActive--;
      pumpTranslateQueue();
    });
  }
}

function translateMessageEl(el) {
  const text    = el._rawText;
  const transEl = el.querySelector('.msg-trans');
  if (!text || !transEl) return;
  enqueueTranslation(() =>
    sleep(TRANSLATE_DELAY_MS)
      .then(() => translateViaBackground(text, settings.src_lang, settings.tgt_lang, 'chat'))
  ).then(translated => { transEl.textContent = translated; })
   .catch(() => { /* 原文表示のまま */ });
}

// ===== メッセージ表示・翻訳 =====
function addChatMessage(username, text, color) {
  updateDanmakuMode();

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
  if (settings.auto_scroll) scrollToBottom();

  const transEl = el.querySelector('.msg-trans');
  if (shouldSkipTranslation(text)) {
    transEl.textContent = text;
    transEl.classList.remove('translating');
    return;
  }

  // 弾幕モード：原文をそのまま表示し、ユーザーがスクロールを止めた／ホバーしたときに可視分だけ翻訳
  if (danmakuMode) {
    transEl.textContent = text;
    transEl.classList.remove('translating');
    el._rawText = text;
    if (scrollPaused || _panelHover) scheduleVisibleTranslate();
    return;
  }

  // 通常時：受信順にキューイングして3並列で翻訳
  enqueueTranslation(() =>
    sleep(TRANSLATE_DELAY_MS)
      .then(() => translateViaBackground(text, settings.src_lang, settings.tgt_lang, 'chat'))
  ).then(translated => {
    transEl.textContent = translated;
    transEl.classList.remove('translating');
    if (settings.auto_scroll) scrollToBottom();
  }).catch(() => {
    transEl.textContent = text + '（翻訳失敗）';
    transEl.classList.remove('translating');
  });
}

// 自分が送信したメッセージをパネルに追加（Twitchはエコーバックしないため手動追加）
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
  if (TRANSLATE_SKIP_PATTERNS.some(p => p.test(text))) return true;
  if (settings.min_length_enabled && text.length < (settings.min_length ?? 4)) return true;
  if (settings.same_lang_filter) {
    const pattern = LANG_SCRIPT_PATTERNS[settings.tgt_lang];
    if (pattern?.test(text)) return true;
  }
  return false;
}

function trimMessages() {
  while (messagesEl.children.length > MAX_MESSAGES) messagesEl.removeChild(messagesEl.firstChild);
}

function scrollToBottom() {
  if (scrollPaused) return;
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ===== チャット送信（IRC WebSocket 経由） =====
async function sendUserMessage() {
  const text = chatInputEl.value.trim();
  if (!text || !isAuthenticated || !ws) return;

  chatInputEl.value    = '';
  chatInputEl.disabled = true;
  sendBtnEl.disabled   = true;

  try {
    let sendText = text;
    if (settings.src_lang !== 'auto') {
      sendText = await translateViaBackground(text, settings.tgt_lang, settings.src_lang, 'own');
    }
    ws.send(`PRIVMSG #${currentChannel} :${sendText}`);
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
async function translateViaBackground(text, from, to, feature = 'chat') {
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const res = await Promise.race([
        chrome.runtime.sendMessage({ type: 'translate', text, from, to, feature }),
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
