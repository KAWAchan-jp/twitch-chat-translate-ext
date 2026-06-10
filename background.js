'use strict';

// ===== 翻訳・Twitch APIリクエストのプロキシ =====
// Chrome拡張のpopupから直接fetchするとCORSで弾かれる場合があるため
// Service Worker（background.js）経由でfetchする

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'translate') {
    const { text, from, to } = message;
    translateText(text, from, to)
      .then(result => sendResponse({ ok: true, result }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // 非同期レスポンスのため必須
  }

  if (message.type === 'twitch_api') {
    const { url, token, clientId } = message;
    fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Client-Id': clientId,
      }
    })
      .then(r => r.json())
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
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
