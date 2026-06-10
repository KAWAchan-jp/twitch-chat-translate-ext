'use strict';

document.getElementById('version').textContent =
  `v${chrome.runtime.getManifest().version}`;

const groqKeyEl = document.getElementById('groqKey');
const toggleBtn = document.getElementById('toggleKey');
const saveBtn   = document.getElementById('saveBtn');
const saveMsg   = document.getElementById('saveMsg');

// 保存済みキーを読み込む
chrome.storage.local.get('groq_api_key', ({ groq_api_key }) => {
  if (groq_api_key) groqKeyEl.value = groq_api_key;
});

// 表示/非表示トグル
toggleBtn.addEventListener('click', () => {
  const isHidden = groqKeyEl.type === 'password';
  groqKeyEl.type    = isHidden ? 'text' : 'password';
  toggleBtn.textContent = isHidden ? '隠す' : '表示';
});

// Enter キーでも保存
groqKeyEl.addEventListener('keydown', e => {
  if (e.key === 'Enter') saveBtn.click();
});

// 保存
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
