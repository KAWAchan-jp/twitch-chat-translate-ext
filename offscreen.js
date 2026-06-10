'use strict';

// SpeechRecognition を Offscreen Document で実行
// コンテンツスクリプトと異なり chrome-extension:// オリジンでマイクアクセスが安定する

let recognition = null;
let voiceStream  = null;
let isActive     = false;

// background.js からのメッセージを受信
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target !== 'offscreen') return;
  if (msg.type === 'voice_start') startRecognition(msg.srcLang, msg.tgtLang);
  if (msg.type === 'voice_stop')  stopRecognition();
});

async function startRecognition(srcLang, tgtLang) {
  // getUserMedia で VB-Cable を優先取得（マイク権限も同時に確立）
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const vbCable = devices.find(d =>
      d.kind === 'audioinput' && d.label.toLowerCase().includes('cable output')
    );
    const constraints = vbCable
      ? { audio: { deviceId: { exact: vbCable.deviceId } } }
      : { audio: true };
    voiceStream = await navigator.mediaDevices.getUserMedia(constraints);
    const label = vbCable ? vbCable.label : 'デフォルトマイク';
    send({ type: 'voice_status', text: `🎤 ${label} で認識開始`, isFinal: false });
  } catch (e) {
    send({ type: 'voice_status', text: `⚠ マイク取得失敗: ${e.message}`, isFinal: true });
    send({ type: 'voice_stopped' });
    return;
  }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    send({ type: 'voice_status', text: '⚠ Web Speech API 非対応', isFinal: true });
    send({ type: 'voice_stopped' });
    return;
  }

  isActive = true;
  recognition = new SR();
  recognition.continuous     = true;
  recognition.interimResults = true;
  recognition.lang           = toLangTag(srcLang);

  recognition.onresult = e => {
    let interim = '', final = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) final += t;
      else interim += t;
    }
    if (interim) send({ type: 'voice_interim', text: interim });
    if (final)   send({ type: 'voice_final',   text: final, srcLang, tgtLang });
  };

  recognition.onerror = ev => {
    if (ev.error === 'not-allowed') {
      send({ type: 'voice_status', text: '⚠ マイクの使用が許可されていません', isFinal: true });
      stopRecognition();
      send({ type: 'voice_stopped' });
    } else if (ev.error === 'no-speech') {
      send({ type: 'voice_status', text: '🔇 音声未検出', isFinal: false });
    } else if (ev.error === 'network') {
      send({ type: 'voice_status', text: '⚠ ネットワークエラー（インターネット接続が必要）', isFinal: true });
    } else {
      send({ type: 'voice_status', text: `音声認識エラー: ${ev.error}`, isFinal: false });
    }
  };

  recognition.onend = () => {
    if (isActive) recognition.start();
  };

  recognition.start();
}

function stopRecognition() {
  isActive = false;
  if (recognition) { recognition.onend = null; recognition.stop(); recognition = null; }
  if (voiceStream)  { voiceStream.getTracks().forEach(t => t.stop()); voiceStream = null; }
}

// background.js（service worker）へメッセージ送信
function send(msg) {
  chrome.runtime.sendMessage({ target: 'service-worker', ...msg }).catch(() => {});
}

function toLangTag(lang) {
  const map = {
    'en': 'en-US', 'ja': 'ja-JP', 'ko': 'ko-KR',
    'zh-CN': 'zh-CN', 'zh-TW': 'zh-TW',
    'es': 'es-ES', 'fr': 'fr-FR', 'de': 'de-DE',
    'pt': 'pt-BR', 'ru': 'ru-RU', 'ar': 'ar-SA',
    'hi': 'hi-IN', 'th': 'th-TH', 'vi': 'vi-VN',
  };
  return map[lang] || lang;
}
