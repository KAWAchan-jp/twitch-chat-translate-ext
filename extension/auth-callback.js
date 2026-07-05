'use strict';

// GitHub Pages リダイレクト先でトークンをURLフラグメントから取得して
// background.js に転送し、タブを閉じる

(function () {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const token = hash.get('access_token');
  if (!token) return;

  chrome.runtime.sendMessage({ type: 'twitch_auth', token }, () => {
    window.close();
  });
})();
