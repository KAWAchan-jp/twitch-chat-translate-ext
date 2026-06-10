'use strict';

const TWITCH_CLIENT_ID   = '1vbld5ti60dwqzmxrpfkcnk1oph5jd';
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
];
const TGT_LANGS = SRC_LANGS.filter(([v]) => v !== 'auto');

const DEFAULT_SETTINGS = {
  src_lang: 'auto',
  tgt_lang: 'ja',
  show_original: true,
  auto_scroll: true,
};

// ===== インストール・起動時にコンテキストメニューを構築 =====
chrome.runtime.onInstalled.addListener(buildContextMenus);
chrome.runtime.onStartup.addListener(buildContextMenus);

async function buildContextMenus() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  const s = { ...DEFAULT_SETTINGS, ...stored };
  const { version } = chrome.runtime.getManifest();

  chrome.contextMenus.removeAll(() => {
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

    // バージョン番号はメニュー末尾に表示（Chromeが先頭に拡張名を自動追加するため末尾に配置）
    chrome.contextMenus.create({ id: 'sep3', type: 'separator', contexts: ['action'] });
    chrome.contextMenus.create({ id: 'version', title: `Twitch Chat Translator  v${version}`, enabled: false, contexts: ['action'] });
  });
}

chrome.contextMenus.onClicked.addListener((info) => {
  const { menuItemId, checked } = info;
  if (menuItemId.startsWith('src_')) chrome.storage.local.set({ src_lang: menuItemId.replace('src_', '') });
  else if (menuItemId.startsWith('tgt_')) chrome.storage.local.set({ tgt_lang: menuItemId.replace('tgt_', '') });
  else if (menuItemId === 'show_original') chrome.storage.local.set({ show_original: checked });
  else if (menuItemId === 'auto_scroll')   chrome.storage.local.set({ auto_scroll: checked });
});

// ===== アイコン左クリック =====
chrome.action.onClicked.addListener(async (tab) => {
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'toggle' });
    setBadge(tab.id, res.active);
  } catch { /* Twitch以外のタブ */ }
});

function setBadge(tabId, active) {
  const opts = tabId ? { tabId } : {};
  chrome.action.setBadgeText({ text: active ? 'ON' : 'OFF', ...opts });
  chrome.action.setBadgeBackgroundColor({ color: active ? '#9147ff' : '#555555', ...opts });
}

// ===== メッセージ処理 =====
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // バッジ更新
  if (message.type === 'badge_update') {
    if (sender.tab?.id) setBadge(sender.tab.id, message.active);
    return;
  }

  // Twitchログイン: OAuthタブを開く
  if (message.type === 'twitch_login') {
    const scope = 'chat:read chat:edit';
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}`
      + `&redirect_uri=${encodeURIComponent(TWITCH_REDIRECT_URI)}`
      + `&response_type=token&scope=${encodeURIComponent(scope)}`;
    chrome.tabs.create({ url });
    return;
  }

  // auth-callback.jsからのトークン受信
  if (message.type === 'twitch_auth') {
    handleTwitchAuth(message.token, sender.tab?.id);
    return;
  }

  // 翻訳プロキシ
  if (message.type === 'translate') {
    const { text, from, to } = message;
    translateText(text, from, to)
      .then(result => sendResponse({ ok: true, result }))
      .catch(err  => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  // Twitch APIプロキシ
  if (message.type === 'twitch_api') {
    const { url, token, clientId } = message;
    fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'Client-Id': clientId } })
      .then(r => r.json())
      .then(data => sendResponse({ ok: true, data }))
      .catch(err  => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});

// トークンからユーザー名を取得してストレージに保存し、Twitchタブに通知
async function handleTwitchAuth(token) {
  try {
    const res  = await fetch('https://api.twitch.tv/helix/users', {
      headers: { 'Authorization': `Bearer ${token}`, 'Client-Id': TWITCH_CLIENT_ID },
    });
    const data = await res.json();
    const username = data.data[0]?.login;
    if (!username) throw new Error('ユーザー名取得失敗');

    await chrome.storage.local.set({ twitch_token: token, twitch_username: username });

    // 開いているTwitchタブすべてに通知
    const tabs = await chrome.tabs.query({ url: '*://www.twitch.tv/*' });
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, { type: 'twitch_auth_complete', username }).catch(() => {});
    }
  } catch (e) {
    console.error('Twitchログイン失敗:', e);
  }
}

async function translateText(text, from, to) {
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
