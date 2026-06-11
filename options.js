'use strict';

document.getElementById('version').textContent =
  `v${chrome.runtime.getManifest().version}`;

// ===== モデルテーブル =====
const MODEL_DEFS = [
  { value: 'tiny',           label: 'Tiny',           size: '約38MB',  note: '高速・標準精度・CPU可' },
  { value: 'base',           label: 'Base',           size: '約74MB',  note: 'やや遅い・高精度・CPU可' },
  { value: 'small',          label: 'Small',          size: '約244MB', note: 'GPU推奨・空きVRAM 1GB以上・⭐ 日本語おすすめ' },
  { value: 'medium',         label: 'Medium',         size: '約769MB', note: 'GPU必須・空きVRAM 2GB以上・最高精度' },
  { value: 'large-v3-turbo', label: 'Large-v3-Turbo', size: '約809MB', note: 'GPU必須・空きVRAM 3GB以上・Mediumより高速・高精度' },
];

let selectedModel    = 'tiny';
let downloadedModels = [];
let activeDownload   = null;

function getModelName(value) {
  return value === 'large-v3-turbo'
    ? 'onnx-community/whisper-large-v3-turbo'
    : `Xenova/whisper-${value}`;
}

function getModelCachePrefixes(value) {
  if (value === 'large-v3-turbo') return ['onnx-community/whisper-large-v3-turbo'];
  // medium は量子化版リポジトリ（-ONNX）を WebGPU で使用するため両方を含める
  if (value === 'medium') return ['Xenova/whisper-medium', 'onnx-community/whisper-medium-ONNX'];
  return [`Xenova/whisper-${value}`, `onnx-community/whisper-${value}`];
}

function setModelStatus(value, html) {
  const el = document.getElementById(`model-status-${value}`);
  if (el) el.innerHTML = html;
}

function renderModelTable() {
  const table = document.getElementById('modelTable');
  table.innerHTML = '';
  for (const m of MODEL_DEFS) {
    const isDownloaded = downloadedModels.includes(m.value);
    const isSelected   = selectedModel === m.value;
    const row = document.createElement('div');
    row.className = 'model-row';
    row.id = `model-row-${m.value}`;
    row.innerHTML = `
      <label class="radio-label model-radio">
        <input type="radio" name="whisperModel" value="${m.value}"${isSelected ? ' checked' : ''}>
        <span><strong>${m.label}</strong>（${m.size}・${m.note}）</span>
      </label>
      <div class="model-status-area" id="model-status-${m.value}">
        ${statusHTML(m.value, isDownloaded)}
      </div>`;
    table.appendChild(row);
  }

  table.querySelectorAll('input[name="whisperModel"]').forEach(el => {
    el.addEventListener('change', () => {
      if (el.checked) {
        selectedModel = el.value;
        chrome.storage.local.set({ whisper_model: el.value });
      }
    });
  });

  table.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, model } = btn.dataset;
    if (action === 'download') startDownload(model);
    else if (action === 'delete') startDelete(model);
    else if (action === 'skip' && activeDownload?.value === model && activeDownload.finish) activeDownload.finish();
  });
}

function statusHTML(value, isDownloaded) {
  if (isDownloaded) {
    return `<span class="dl-badge dl-badge--ok">ダウンロード済み ✓</span>
            <button class="btn-ghost btn-sm" data-action="delete" data-model="${value}">削除</button>`;
  }
  return `<span class="dl-badge dl-badge--no">未ダウンロード</span>
          <button class="btn-primary btn-sm" data-action="download" data-model="${value}">ダウンロード</button>`;
}

function startDownload(value) {
  if (activeDownload) return;

  setModelStatus(value, `
    <span class="dl-badge dl-badge--progress" id="dl-txt-${value}">準備中...</span>
    <div class="dl-progress-bar"><div class="dl-progress-fill" id="dl-fill-${value}" style="width:0%"></div></div>`);

  const worker = new Worker(chrome.runtime.getURL('whisper-worker.js'));
  let idleTimer = null;
  let shaderInterval = null;
  activeDownload = { value, worker };

  worker.addEventListener('error', (e) => {
    clearTimeout(idleTimer);
    clearInterval(shaderInterval);
    console.error('[TCT-DL] worker error:', e.message, e);
    worker.terminate();
    activeDownload = null;
    setModelStatus(value, `
      <span class="dl-badge dl-badge--err">エラー: ${e.message ?? 'worker crashed'}</span>
      <button class="btn-primary btn-sm" data-action="download" data-model="${value}">再試行</button>`);
  });

  const finishDownload = async () => {
    clearTimeout(idleTimer);
    clearInterval(shaderInterval);
    worker.terminate();
    activeDownload = null;
    downloadedModels = [...new Set([...downloadedModels, value])];
    await chrome.storage.local.set({ downloaded_models: downloadedModels });
    setModelStatus(value, statusHTML(value, true));
  };
  activeDownload.finish = finishDownload;

  worker.addEventListener('message', async ({ data }) => {
    const { type } = data;
    if (type === 'ready') {
      worker.postMessage({ type: 'download', model: getModelName(value) });
    } else if (type === 'download_progress') {
      const pct   = Math.round(data.progress ?? 0);
      const fname = data.name ?? '';
      const txt  = document.getElementById(`dl-txt-${value}`);
      const fill = document.getElementById(`dl-fill-${value}`);
      if (txt)  txt.textContent  = `DL中... ${pct}%　${fname}`;
      if (fill) fill.style.width = `${pct}%`;
      clearTimeout(idleTimer);
    } else if (type === 'status') {
      const txt  = document.getElementById(`dl-txt-${value}`);
      const fill = document.getElementById(`dl-fill-${value}`);
      if (txt)  txt.textContent  = data.text;
      if (fill) fill.style.width = '100%';
      // シェーダーコンパイル中のステータスが届いたときだけスキップボタンを表示
      if (data.text.includes('シェーダー')) {
        const statusEl = document.getElementById(`model-status-${value}`);
        if (statusEl && !statusEl.querySelector('[data-action="skip"]')) {
          const skipBtn = document.createElement('button');
          skipBtn.className = 'btn-ghost btn-sm';
          skipBtn.dataset.action = 'skip';
          skipBtn.dataset.model = value;
          skipBtn.textContent = 'スキップ';
          statusEl.appendChild(skipBtn);
        }
      }
    } else if (type === 'download_complete') {
      if (data.ok) {
        await finishDownload();
      } else {
        clearTimeout(idleTimer);
        clearInterval(shaderInterval);
        worker.terminate();
        activeDownload = null;
        setModelStatus(value, `
          <span class="dl-badge dl-badge--err">エラー: ${data.error ?? 'ロード失敗'}</span>
          <button class="btn-primary btn-sm" data-action="download" data-model="${value}">再試行</button>`);
      }
    }
  });

  worker.postMessage({ type: 'init', libBase: chrome.runtime.getURL('lib/') });
}

async function startDelete(value) {
  const m = MODEL_DEFS.find(d => d.value === value);
  if (!confirm(`「${m?.label}」のキャッシュを削除しますか？`)) return;

  setModelStatus(value, `<span class="dl-badge dl-badge--no">削除中...</span>`);

  const prefixes = getModelCachePrefixes(value);
  try {
    const cache = await caches.open('transformers-cache');
    const keys  = await cache.keys();
    for (const req of keys) {
      if (prefixes.some(p => req.url.includes(p))) await cache.delete(req);
    }
  } catch (err) {
    console.warn('[TCT] cache delete error:', err);
  }

  downloadedModels = downloadedModels.filter(v => v !== value);
  await chrome.storage.local.set({ downloaded_models: downloadedModels });
  setModelStatus(value, statusHTML(value, false));
}

chrome.storage.local.get(['whisper_model', 'downloaded_models'], ({ whisper_model, downloaded_models }) => {
  selectedModel    = whisper_model     ?? 'tiny';
  downloadedModels = downloaded_models ?? [];
  renderModelTable();
});

// ===== Whisper 認識ヒント =====
const whisperPromptEl = document.getElementById('whisperPrompt');
chrome.storage.local.get('whisper_prompt', ({ whisper_prompt }) => {
  whisperPromptEl.value = whisper_prompt ?? '';
});
whisperPromptEl.addEventListener('change', () => {
  chrome.storage.local.set({ whisper_prompt: whisperPromptEl.value.trim() });
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

// ===== DeepL =====
const deeplEnabledEl = document.getElementById('deeplEnabled');
const deeplChatEl    = document.getElementById('deeplChat');
const deeplVoiceEl   = document.getElementById('deeplVoice');
const deeplOwnEl     = document.getElementById('deeplOwn');
const deeplFeaturesEl = document.getElementById('deeplFeatures');
const deeplKeyEl     = document.getElementById('deeplKey');
const toggleDeeplBtn = document.getElementById('toggleDeeplKey');
const saveDeeplBtn   = document.getElementById('saveDeeplBtn');
const saveDeeplMsg   = document.getElementById('saveDeeplMsg');

function updateDeeplFeaturesVisibility() {
  deeplFeaturesEl.style.opacity = deeplEnabledEl.checked ? '1' : '0.4';
  deeplFeaturesEl.style.pointerEvents = deeplEnabledEl.checked ? '' : 'none';
}

chrome.storage.local.get(['deepl_enabled', 'deepl_api_key', 'deepl_chat', 'deepl_voice', 'deepl_own'], (s) => {
  deeplEnabledEl.checked = !!s.deepl_enabled;
  deeplChatEl.checked    = s.deepl_chat  !== false;
  deeplVoiceEl.checked   = s.deepl_voice !== false;
  deeplOwnEl.checked     = s.deepl_own   !== false;
  if (s.deepl_api_key) deeplKeyEl.value = s.deepl_api_key;
  updateDeeplFeaturesVisibility();
});

toggleDeeplBtn.addEventListener('click', () => {
  const isHidden = deeplKeyEl.type === 'password';
  deeplKeyEl.type = isHidden ? 'text' : 'password';
  toggleDeeplBtn.textContent = isHidden ? '隠す' : '表示';
});

deeplEnabledEl.addEventListener('change', () => {
  chrome.storage.local.set({ deepl_enabled: deeplEnabledEl.checked });
  updateDeeplFeaturesVisibility();
});

deeplChatEl.addEventListener('change',  () => chrome.storage.local.set({ deepl_chat:  deeplChatEl.checked }));
deeplVoiceEl.addEventListener('change', () => chrome.storage.local.set({ deepl_voice: deeplVoiceEl.checked }));
deeplOwnEl.addEventListener('change',   () => chrome.storage.local.set({ deepl_own:   deeplOwnEl.checked }));

saveDeeplBtn.addEventListener('click', async () => {
  const key = deeplKeyEl.value.trim();
  if (!key) { showDeeplMsg('⚠ キーを入力してください', '#e84393'); return; }
  await chrome.storage.local.set({ deepl_api_key: key, deepl_enabled: true });
  deeplEnabledEl.checked = true;
  updateDeeplFeaturesVisibility();
  showDeeplMsg('✓ 保存しました', '#00b894');
});

function showDeeplMsg(text, color) {
  saveDeeplMsg.textContent = text;
  saveDeeplMsg.style.color = color;
  saveDeeplMsg.style.opacity = '1';
  clearTimeout(showDeeplMsg._timer);
  showDeeplMsg._timer = setTimeout(() => {
    saveDeeplMsg.style.opacity = '0';
    setTimeout(() => { saveDeeplMsg.textContent = ''; }, 300);
  }, 3000);
}

// ===== VAD 感度 =====
const vadThresholdEl    = document.getElementById('vadThreshold');
const vadThresholdVal   = document.getElementById('vadThresholdVal');
const vadSilenceMsEl    = document.getElementById('vadSilenceMs');
const vadSilenceMsVal   = document.getElementById('vadSilenceMsVal');

chrome.storage.local.get(['vad_threshold', 'vad_silence_ms'], ({ vad_threshold, vad_silence_ms }) => {
  vadThresholdEl.value      = vad_threshold  ?? 10;
  vadThresholdVal.textContent = vadThresholdEl.value;
  vadSilenceMsEl.value      = vad_silence_ms ?? 500;
  vadSilenceMsVal.textContent = vadSilenceMsEl.value;
});

vadThresholdEl.addEventListener('input', () => {
  vadThresholdVal.textContent = vadThresholdEl.value;
  chrome.storage.local.set({ vad_threshold: Number(vadThresholdEl.value) });
});

vadSilenceMsEl.addEventListener('input', () => {
  vadSilenceMsVal.textContent = vadSilenceMsEl.value;
  chrome.storage.local.set({ vad_silence_ms: Number(vadSilenceMsEl.value) });
});

// ===== 言語フィルター =====
const sameLangFilterEl = document.getElementById('sameLangFilter');
chrome.storage.local.get('same_lang_filter', ({ same_lang_filter }) => {
  sameLangFilterEl.checked = !!same_lang_filter;
});
sameLangFilterEl.addEventListener('change', () => {
  chrome.storage.local.set({ same_lang_filter: sameLangFilterEl.checked });
});

// ===== 最小文字数フィルター =====
const minLengthEnabledEl = document.getElementById('minLengthEnabled');
const minLengthEl        = document.getElementById('minLength');
const minLengthValEl     = document.getElementById('minLengthVal');
const minLengthFieldEl   = document.getElementById('minLengthField');

function updateMinLengthVisibility() {
  minLengthFieldEl.style.opacity      = minLengthEnabledEl.checked ? '1' : '0.4';
  minLengthFieldEl.style.pointerEvents = minLengthEnabledEl.checked ? '' : 'none';
}

chrome.storage.local.get(['min_length_enabled', 'min_length'], ({ min_length_enabled, min_length }) => {
  minLengthEnabledEl.checked  = !!min_length_enabled;
  minLengthEl.value           = min_length ?? 4;
  minLengthValEl.textContent  = minLengthEl.value;
  updateMinLengthVisibility();
});

minLengthEnabledEl.addEventListener('change', () => {
  chrome.storage.local.set({ min_length_enabled: minLengthEnabledEl.checked });
  updateMinLengthVisibility();
});

minLengthEl.addEventListener('input', () => {
  minLengthValEl.textContent = minLengthEl.value;
  chrome.storage.local.set({ min_length: Number(minLengthEl.value) });
});

// ===== Whisper ビーム数 =====
const whisperNumBeamsEls = document.querySelectorAll('input[name="whisperNumBeams"]');
chrome.storage.local.get('whisper_num_beams', ({ whisper_num_beams }) => {
  const val = String(whisper_num_beams ?? 1);
  whisperNumBeamsEls.forEach(el => { el.checked = el.value === val; });
});
whisperNumBeamsEls.forEach(el => {
  el.addEventListener('change', () => {
    if (el.checked) chrome.storage.local.set({ whisper_num_beams: Number(el.value) });
  });
});

// ===== 並列ワーカー数 =====
const whisperWorkerCountEl  = document.getElementById('whisperWorkerCount');
const whisperWorkerCountVal = document.getElementById('whisperWorkerCountVal');

chrome.storage.local.get('whisper_worker_count', ({ whisper_worker_count }) => {
  const n = whisper_worker_count ?? 4;
  whisperWorkerCountEl.value       = n;
  whisperWorkerCountVal.textContent = n;
});

whisperWorkerCountEl.addEventListener('input', () => {
  const n = Number(whisperWorkerCountEl.value);
  whisperWorkerCountVal.textContent = n;
  chrome.storage.local.set({ whisper_worker_count: n });
});

// ===== チャンク最大長 =====
const whisperMaxChunkMsEl  = document.getElementById('whisperMaxChunkMs');
const whisperMaxChunkMsVal = document.getElementById('whisperMaxChunkMsVal');

chrome.storage.local.get('whisper_max_chunk_ms', ({ whisper_max_chunk_ms }) => {
  const ms = whisper_max_chunk_ms ?? 5000;
  whisperMaxChunkMsEl.value       = ms;
  whisperMaxChunkMsVal.textContent = (ms / 1000).toFixed(1).replace('.0', '');
});

whisperMaxChunkMsEl.addEventListener('input', () => {
  const ms = Number(whisperMaxChunkMsEl.value);
  whisperMaxChunkMsVal.textContent = (ms / 1000).toFixed(1).replace('.0', '');
  chrome.storage.local.set({ whisper_max_chunk_ms: ms });
});

// ===== カスタムハルシネーション除外パターン =====
const customHallucinationPatternsEl = document.getElementById('customHallucinationPatterns');
const saveCustomPatternsBtn         = document.getElementById('saveCustomPatterns');
const saveCustomPatternsMsgEl       = document.getElementById('saveCustomPatternsMsg');

chrome.storage.local.get('custom_hallucination_patterns', ({ custom_hallucination_patterns }) => {
  customHallucinationPatternsEl.value = (custom_hallucination_patterns ?? []).join('\n');
});

saveCustomPatternsBtn.addEventListener('click', () => {
  const patterns = customHallucinationPatternsEl.value
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);
  chrome.storage.local.set({ custom_hallucination_patterns: patterns }, () => {
    saveCustomPatternsMsgEl.style.display = 'inline';
    setTimeout(() => { saveCustomPatternsMsgEl.style.display = 'none'; }, 2000);
  });
});
