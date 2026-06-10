'use strict';

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
    // バージョン表示（クリック不可）
    chrome.contextMenus.create({
      id: 'version',
      title: `Twitch Chat Translator  v${version}`,
      enabled: false,
      contexts: ['action'],
    });
    chrome.contextMenus.create({ id: 'sep0', type: 'separator', contexts: ['action'] });

    // 翻訳元言語のサブメニュー
    chrome.contextMenus.create({ id: 'src_parent', title: '翻訳元言語', contexts: ['action'] });
    SRC_LANGS.forEach(([val, label]) => {
      chrome.contextMenus.create({
        id: `src_${val}`,
        parentId: 'src_parent',
        title: label,
        type: 'radio',
        checked: val === s.src_lang,
        contexts: ['action'],
      });
    });

    chrome.contextMenus.create({ id: 'sep1', type: 'separator', contexts: ['action'] });

    // 翻訳先言語のサブメニュー
    chrome.contextMenus.create({ id: 'tgt_parent', title: '翻訳先言語', contexts: ['action'] });
    TGT_LANGS.forEach(([val, label]) => {
      chrome.contextMenus.create({
        id: `tgt_${val}`,
        parentId: 'tgt_parent',
        title: label,
        type: 'radio',
        checked: val === s.tgt_lang,
        contexts: ['action'],
      });
    });

    chrome.contextMenus.create({ id: 'sep2', type: 'separator', contexts: ['action'] });

    // 表示設定のトグル
    chrome.contextMenus.create({
      id: 'show_original',
      title: '原文を表示',
      type: 'checkbox',
      checked: s.show_original,
      contexts: ['action'],
    });
    chrome.contextMenus.create({
      id: 'auto_scroll',
      title: '自動スクロール',
      type: 'checkbox',
      checked: s.auto_scroll,
      contexts: ['action'],
    });
  });
}

// ===== コンテキストメニュークリック: 設定を保存 =====
chrome.contextMenus.onClicked.addListener((info) => {
  const { menuItemId, checked } = info;
  if (menuItemId.startsWith('src_')) {
    chrome.storage.local.set({ src_lang: menuItemId.replace('src_', '') });
  } else if (menuItemId.startsWith('tgt_')) {
    chrome.storage.local.set({ tgt_lang: menuItemId.replace('tgt_', '') });
  } else if (menuItemId === 'show_original') {
    chrome.storage.local.set({ show_original: checked });
  } else if (menuItemId === 'auto_scroll') {
    chrome.storage.local.set({ auto_scroll: checked });
  }
});

// ===== アイコン左クリック: コンテンツスクリプトにトグルを依頼してバッジを更新 =====
chrome.action.onClicked.addListener(async (tab) => {
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'toggle' });
    setBadge(tab.id, res.active);
  } catch {
    // Twitchページ以外（コンテンツスクリプト未注入）は何もしない
  }
});

// ===== バッジ更新（ON=紫 / OFF=グレー） =====
function setBadge(tabId, active) {
  const opts = tabId ? { tabId } : {};
  chrome.action.setBadgeText({ text: active ? 'ON' : 'OFF', ...opts });
  chrome.action.setBadgeBackgroundColor({ color: active ? '#9147ff' : '#555555', ...opts });
}

// ===== メッセージ処理 =====
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // コンテンツスクリプトからのバッジ更新通知
  if (message.type === 'badge_update') {
    if (sender.tab?.id) setBadge(sender.tab.id, message.active);
    return;
  }

  // 翻訳リクエスト（CORSを回避するためService Worker経由でfetch）
  if (message.type === 'translate') {
    const { text, from, to } = message;
    translateText(text, from, to)
      .then(result => sendResponse({ ok: true, result }))
      .catch(err  => sendResponse({ ok: false, error: err.message }));
    return true; // 非同期レスポンスのため必須
  }

  // Twitch APIリクエスト（CORSを回避するためService Worker経由でfetch）
  if (message.type === 'twitch_api') {
    const { url, token, clientId } = message;
    fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'Client-Id': clientId } })
      .then(r => r.json())
      .then(data => sendResponse({ ok: true, data }))
      .catch(err  => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});

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
