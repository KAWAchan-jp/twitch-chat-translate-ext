'use strict';

document.getElementById('version').textContent =
  `v${chrome.runtime.getManifest().version}`;

// ===== ローカル Whisper ウォームアップ =====
const warmupBtn    = document.getElementById('warmupBtn');
const warmupStatus = document.getElementById('warmupStatus');

warmupBtn.addEventListener('click', () => {
  warmupStatus.textContent = 'Twitch ページで 🎤 ボタンを押すと自動的にモデルがロードされます';
  warmupStatus.style.color = '#adadb8';
});

// ===== 字幕フォントサイズ =====
const fontSizeEl  = document.getElementById('subtitleFontSize');
const fontSizeVal = document.getElementById('subtitleFontSizeVal');

chrome.storage.local.get('subtitle_font_size', ({ subtitle_font_size }) => {
  const size = subtitle_font_size ?? 22;
  fontSizeEl.value       = size;
  fontSizeVal.textContent = `${size}px`;
});

fontSizeEl.addEventListener('input', () => {
  const size = Number(fontSizeEl.value);
  fontSizeVal.textContent = `${size}px`;
  chrome.storage.local.set({ subtitle_font_size: size });
});

// ===== Groq API キー =====
const groqKeyEl = document.getElementById('groqKey');
const toggleBtn = document.getElementById('toggleKey');
const saveBtn   = document.getElementById('saveBtn');
const saveMsg   = document.getElementById('saveMsg');

chrome.storage.local.get('groq_api_key', ({ groq_api_key }) => {
  if (groq_api_key) groqKeyEl.value = groq_api_key;
});

toggleBtn.addEventListener('click', () => {
  const isHidden = groqKeyEl.type === 'password';
  groqKeyEl.type    = isHidden ? 'text' : 'password';
  toggleBtn.textContent = isHidden ? '隠す' : '表示';
});

groqKeyEl.addEventListener('keydown', e => {
  if (e.key === 'Enter') saveBtn.click();
});

saveBtn.addEventListener('click', async () => {
  const key = groqKeyEl.value.trim();
  if (!key) {
    showMsg('⚠ キーを入力してください', '#e84393');
    return;
  }
  await chrome.storage.local.set({ groq_api_key: key });
  showMsg('✓ 保存しました', '#00b894');
});

function showMsg(text, color) {
  saveMsg.textContent  = text;
  saveMsg.style.color  = color;
  saveMsg.style.opacity = '1';
  clearTimeout(showMsg._timer);
  showMsg._timer = setTimeout(() => {
    saveMsg.style.opacity = '0';
    setTimeout(() => { saveMsg.textContent = ''; }, 300);
  }, 3000);
}
