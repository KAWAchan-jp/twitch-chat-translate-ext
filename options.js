'use strict';

document.getElementById('version').textContent =
  `v${chrome.runtime.getManifest().version}`;

// ===== ローカル Whisper ウォームアップ =====
const warmupBtn    = document.getElementById('warmupBtn');
const warmupStatus = document.getElementById('warmupStatus');

warmupBtn.addEventListener('click', async () => {
  warmupBtn.disabled = true;
  warmupStatus.textContent = 'バックグラウンドでモデルをダウンロード中...';
  warmupStatus.style.color = '#adadb8';

  // whisper_status を設定ページに中継するため直接 offscreen へ
  chrome.runtime.onMessage.addListener(function handler(msg) {
    if (msg.type === 'whisper_status') {
      warmupStatus.textContent = msg.text;
      if (msg.text.includes('準備完了')) {
        warmupBtn.disabled = false;
        chrome.runtime.onMessage.removeListener(handler);
      }
    }
  });

  try {
    await chrome.runtime.sendMessage({ type: 'warmup_whisper' });
    warmupStatus.textContent = 'Whisper 準備完了 ✓';
    warmupStatus.style.color = '#00b894';
  } catch (e) {
    warmupStatus.textContent = `⚠ エラー: ${e.message}`;
    warmupStatus.style.color = '#e84393';
    warmupBtn.disabled = false;
  }
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
