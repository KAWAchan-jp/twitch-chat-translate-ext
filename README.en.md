# Twitch Chat Translator

[日本語](README.md) | [English](README.en.md) | [Русский](README.ru.md)

![version](https://img.shields.io/badge/version-0.7.0.5-9147ff)
![manifest](https://img.shields.io/badge/manifest-v3-blue)
![license](https://img.shields.io/badge/license-MIT-green)

📖 **For detailed usage, FAQ, and troubleshooting, see the [Wiki](https://github.com/KAWAchan-jp/twitch-chat-translate-ext/wiki)** (English overview available)

**A Chrome extension that removes the language barrier from Twitch**

> *“Sans Babel”* means “without Babel” in French.
> According to the Book of Genesis, the Tower of Babel caused people’s languages to be confused and created language barriers.
> This extension was built to remove those barriers.

| | |
|---|---|
| 💬 **Translate chat in real time** | Instantly translate fast-moving chat into Japanese and enjoy foreign-language streams together with the chat |
| 🎙️ **Show streamer speech as subtitles** | Automatically recognize stream audio and display real-time subtitles, using Faster-Whisper (local server) or the Groq API |
| ✏️ **Join chat in Japanese** | Type in Japanese and send automatically translated messages, even when the streamer uses another language |
| 🤖 **Gemini AI translation** | Use Gemini AI for voice subtitles and sent-message translation. It produces natural translations for game terms and slang |
| 🖥️ **Faster-Whisper STT** | Run Whisper large models on your PC's GPU via a local server for high-accuracy, low-latency recognition (GPU required) |
| ⚡ **Groq Whisper STT** | High-accuracy, fast cloud speech recognition for subtitles |
| 🔊 **Translation text-to-speech (TTS)** | Automatically reads translated subtitles aloud so you can listen while understanding the streamer |
| 📊 **API usage panel** | Shows Gemini, Groq, and DeepL usage in real time to help prevent overuse |
| 🎬 **Clip recording** | Record the stream and export a video with translated subtitles burned in via ffmpeg |

---

## Features

### Chat Translation

- **Real-time translation** — Automatically translates messages as they arrive using Google Translate or DeepL, with three-way parallel processing.
- **High-speed chat mode** — When chat is moving quickly (3 messages/sec or more), translation is automatically reduced and original messages are shown. Pause scrolling or hover to translate only the visible range and save API usage.
- **Translation engine display** — The header always shows the translation direction and engine, such as `JA→JA・Google`. It turns orange when channel-specific settings are active.
- **Footer translation engine indicators** — The bottom of the panel shows your message translation engine, voice subtitle translation engine, and STT engine in real time. Click to cycle through enabled engines.
- **Automatic stream language detection** — Reads Twitch tags and automatically sets the source language.
- **Floating panel** — Stays in the lower-right corner of the page. Drag the header to move it, drag the lower-right handle to resize it, and adjust opacity.
- **Automatic channel detection** — Detects the channel from the URL and supports Twitch SPA navigation.
- **Per-channel language settings** — Remembers source and target languages per channel and switches automatically.
- **Scroll pause** — Scrolling upward pauses auto-scroll and shows a “↓ Latest” button.
- **Translation cache** — Reuses cached results for identical text to save DeepL character usage.
- **Translate and send** — After logging in to Twitch, send translated messages from the panel input field.
- **Minimum length filter** — Skips short taunts or emote-like strings. The character count can be adjusted.
- **Same-language filter** — Skips messages already written in the target language.

### Gemini AI Translation

- **Model selection** — Choose from Gemini 2.5 Flash (recommended), 3.1 Flash Lite, 3 Flash, and 3.5 Flash.
- **Per-feature selection** — Turn Gemini on/off separately for voice subtitles and sent messages. Chat translation remains Google / DeepL because chat volume is high and Google is recommended.
- **Prompt editing** — Freely customize the translation prompt from the options page. `{lang}` is replaced with the target language and `{text}` with the recognized text.
- **Fallback** — If Gemini is disabled or fails, the extension automatically falls back in order: DeepL → Google Translate.
- **Free tier** — 1,500 requests/day and 15 requests/minute. Get an API key from Google AI Studio.

### Groq Whisper STT (Optional)

- **Cloud speech recognition** — Runs Whisper Large-v3-Turbo / Large-v3 on Groq’s high-speed inference platform.
- **Free tier available** — Monthly reset with a $0.00/month free tier. After the limit is reached or on error, subtitles show an error message.
- **API key only** — Enable it simply by entering a Groq API key on the options page.

> You can get a Groq API key for free at [console.groq.com](https://console.groq.com).

### Faster-Whisper STT (Local Server, GPU Required)

- **Run high-accuracy models on your own PC** — Uses Faster-Whisper / CTranslate2 to run Large-v3 / Large-v3-Turbo on a local server.
- **Inference outside the browser** — Audio is sent to a local server such as `http://127.0.0.1:8765/transcribe` instead of running inside the Chrome extension.
- **Error shown on failure** — If the server is not running, fails, or times out, subtitles show an error message (there is no automatic fallback).
- **Server included** — A FastAPI-based server is provided in `uv/`.

> Faster-Whisper is not a model name but an execution engine that runs Whisper models fast.
> On the options page you enable it as an STT engine and select the model (e.g. Large-v3-Turbo) separately.

#### Starting the server (GPU / CUDA)

An NVIDIA GPU is assumed. **You do not need to install the CUDA Toolkit** — with
[uv](https://docs.astral.sh/uv/) installed, a single command is enough
(the pip builds of cuBLAS / cuDNN are downloaded and detected automatically):

```powershell
cd uv
uv run --with nvidia-cublas-cu12 --with "nvidia-cudnn-cu12>=9,<10" server.py
```

If uv is not installed yet, install it first:

```powershell
# Windows (PowerShell)
irm https://astral.sh/uv/install.ps1 | iex
```

```bash
# macOS / Linux
curl -LsSf https://astral.sh/uv/install.sh | sh
```

- Requirements: NVIDIA GPU (4 GB+ VRAM recommended) and a CUDA 12 compatible driver (version 525 or later).
- On first run, cuBLAS / cuDNN (about 1.2 GB) and the model itself (Large-v3-Turbo, about 1.6 GB) are downloaded.
- The server is ready once the console shows `Model '...' ready`.
- Without CUDA the server falls back to CPU automatically, but large models then exceed the extension's
  30-second timeout and are not practical (measured on GPU: 7.5 s of audio recognized in about 0.5–1 s).

#### How to use

1. Start the server with the command above and wait for `Model '...' ready`.
2. On the extension options page, enable **Faster-Whisper**, select a model, and save
   (keep the default URL `http://127.0.0.1:8765/transcribe`).
3. On a Twitch page, confirm the panel footer shows **STT:** <span style="color:#c084fc">Faster</span>
   (if Groq is also enabled, click it to cycle Faster ↔ Groq).
4. Start voice recognition with 🎤 — subtitles are now recognized by the Faster-Whisper server.

See [uv/README.md](uv/README.md) for details
(environment variables, API reference, measured performance, and venv-based setup).

### Voice Subtitles: Common Features

- **No tab-sharing banner** — Captures audio directly from the `<video>` element with the Web Audio API. Recognition works even at low volume, but **at volume 0 or when the player is muted the capture is silent and nothing is recognized** (muting the browser tab is fine).
- **VAD (silence detection)** — Starts processing immediately after speech ends for low latency.
- **Context carryover** — Passes recent utterances as prompts to keep recognition context (Faster-Whisper only).
- **Hallucination countermeasures** — Automatically removes Whisper-specific repetitions, silence annotations, and common boilerplate. Custom exclusion patterns can also be registered.
- **Recognition hints (two layers)** — Improve recognition with “default hints” in options and temporary hints from the panel 💡. When empty, the streamer name and game name are used automatically.
- **Subtitle overlay** — Shows subtitles over the stream. The overlay can be dragged to any position.

### Translation Text-to-Speech (TTS)

- **Web Speech API** — Reads translated text aloud with the browser’s built-in speech synthesis engine.
- **Automatic voice selection** — Prioritizes neural voices with natural pronunciation, then falls back to standard voices in the same language.
- **Three-step fallback** — Natural/online voice → same-language voice → skip unsupported languages.
- **Speed control** — Adjust playback speed on the options page (0.5x to 2.0x).
- **Supported languages** — Japanese, English, Korean, Chinese, Spanish, French, German, Portuguese, Russian, Arabic, Hindi, Thai, Vietnamese, and Indonesian.

> On Windows 11, installing neural voices such as Nanami and Keita improves audio quality.
> Add them from Settings → Time & language → Speech → Add voices.

### Clip Recording

- **Recording** — Records the stream video in WebM format (maximum duration configurable in options).
- **ASS subtitle export** — Automatically exports recognized and translated subtitles as an `.ass` file alongside the recording.
- **Subtitle style settings** — Customize font, size, position (X/Y), and background (none / light / medium / dark / solid) on the options page.
- **ffmpeg command generation** — Automatically generates a subtitle burn-in command for PowerShell, CMD, or bash.

---

## Requirements

- **Chrome** latest version with Manifest V3 support.
- **For voice subtitles**: either a Faster-Whisper local server (NVIDIA GPU, 4 GB+ VRAM recommended) or a Groq API key is required (see each feature's section for details).

---

## Installation

1. Download this repository as a ZIP file, or run `git clone`.
2. Open `chrome://extensions/` in Chrome.
3. Turn on **Developer mode** in the upper-right corner.
4. Click **Load unpacked** and select the `extension/` folder.
5. Click the puzzle icon (🧩) in the toolbar and pin **Twitch Chat Translator**.

---

## Setup (Voice Subtitles)

To use voice subtitles, enable either the **Faster-Whisper local server** (see “Starting the server” above) or a **Groq API key** on the options page. If neither is configured, turning on 🎤 shows a “speech recognition engine not configured” error in the subtitles.

---

## Usage

### Panel Header

![Panel header](docs/images/panel-header.png)

| Display | Description |
|---------|-------------|
| ● Status dot | Chat connection status: green = connected, blinking yellow = connecting, pink = disconnected/stopped |
| **#channel name** | Connected channel. The game being played is also shown on the right |
| **EN→JA・Google** | Translation direction and engine. **Orange** means channel-specific language settings are saved |
| Number such as 0.6.37 | Extension version |
| **💡** | Opens/closes the recognition hint input bar |
| **🎤** | Toggles voice subtitles on/off |
| **🔊** | Toggles translation text-to-speech (TTS) on/off |
| **📊** | Shows/hides the API usage panel |
| **🔴** | Opens/closes the clip recording panel (blinks red during recording) |
| **×** | Closes the panel and stops chat receiving/translation |

**💡 Recognition hint bar**  
Edit hints passed to the recognition engine on the spot. Add proper nouns such as streamer names, character names, or technical terms separated by spaces to improve recognition accuracy. Input is saved automatically and applied from the next utterance. Update it quickly when the topic changes.

### Panel Footer

![Panel footer](docs/images/panel-footer.png)

The panel footer shows the currently used translation engines in real time.

| Display | Description |
|---------|-------------|
| **Chat input:** | Translation engine for messages you type and send (Google / <span style="color:#00c4a0">DeepL</span> / <span style="color:#4285f4">Gemini</span>) |
| **Voice:** | Translation engine for recognized streamer speech (Google / <span style="color:#00c4a0">DeepL</span> / <span style="color:#4285f4">Gemini</span>) |
| **STT:** | Speech recognition engine (<span style="color:#c084fc">Faster</span> = Faster-Whisper local server / <span style="color:#f0971d">Groq</span> = Groq Whisper API) |

Changes made on the options page are reflected in the footer in real time. **Clicking a footer item cycles through the engines you've enabled** (Chat input/Voice: Google→DeepL→Gemini, STT: Faster→Groq — engines not enabled in options are skipped).

| Action | Behavior |
|--------|----------|
| Click the icon | Toggle the panel on/off |
| Right-click the icon | Change source/target languages and display settings |
| Drag the panel header | Move the panel |
| Drag the lower-right handle | Resize the panel |
| Scroll upward in the panel | Pause auto-scroll |
| “↓ Latest” button | Move to the bottom and resume auto-scroll |

Language settings are saved per channel. They switch automatically when you move to another channel.

### Usage Panel

![Usage panel](docs/images/panel-usage.png)

A translucent floating panel that can be opened from the header **📊** button. It shows Gemini, Groq, and DeepL API usage in real time.

| Item | Description |
|------|-------------|
| **🤖 Gemini requests** | Number of translation requests |
| **🤖 Gemini input/output** | Number of characters sent and received |
| **⚡ Groq requests** | Number of speech recognition requests |
| **⚡ Groq estimated audio time** | Total recognized audio time in seconds |
| **🔵 DeepL requests** | Number of translation requests |
| **🔵 DeepL input/output** | Number of characters sent and received |

Usage counters can be reset from the options page. The panel can be dragged to any position.

### Switching Translation Engines

Click any item in the footer to cycle through the engines you've enabled in options — no need to open the settings page.

| Footer item | Engines cycled on click |
|---|---|
| **Chat input:** | Google → DeepL → Gemini (enabled ones only) |
| **Voice:** | Google → DeepL → Gemini (enabled ones only) |
| **STT:** | Faster → Groq (Groq appears when its API key is set) |

> An engine must have its API key set and be enabled on the options page to appear in the cycle. Disabled engines are skipped.

### Sending Chat

1. Right-click the icon and set the source language.
2. Click **Log in with Twitch** in the panel.
3. After logging in, type in Japanese in the input field at the bottom of the panel and send.
4. The message is translated automatically and posted to the channel.

### Voice Subtitles

1. Click the **🎤 button** in the panel header.
2. The extension recognizes stream audio automatically and displays subtitles.
3. Drag the subtitle window to your preferred position.

> The recognition language follows the channel source-language setting. If it is set to `Auto detect`, the recognition engine detects the language automatically.

### Translation Text-to-Speech

1. Click the **🔊 button** in the panel header to turn it on.
2. When the streamer’s speech is recognized and translated, it is read aloud automatically.
3. Click again to stop.

> Lowering the streamer’s volume or using headphones is recommended.

### Clip Recording

1. Click the **🔴 button** in the panel header to open the recording panel.
2. Click **"● Start Recording"** to begin recording (maximum duration is configurable in options; default is 3 minutes).
3. While recording, the 🔴 button blinks red and shows the elapsed time.
4. Click **"■ Stop"** to finish. `clip_channelname_timestamp.webm` is downloaded automatically.
5. If "Include subtitles in recording" is enabled in options, the `.ass` subtitle file is also downloaded.
6. An ffmpeg command for burning subtitles into the video is automatically generated and copied to the clipboard.

> Subtitles are only recorded while **🎤** voice subtitles are active. Turn on **🎤** before starting recording.

---

## Options

Open options by right-clicking the extension icon and choosing **Options**.

| Setting | Description |
|---------|-------------|
| **Default recognition hints** | Always-on hints for all channels. These are combined before the temporary panel 💡 hints (Faster-Whisper only) |
| **Subtitle font size** | Voice subtitle text size (14-56 px) |
| **Enable Faster-Whisper** | Recognize speech via the local GPU server. Shows an error in subtitles if not running or on failure |
| **Faster-Whisper server URL** | Only `localhost` / `127.0.0.1` allowed. Default: `http://127.0.0.1:8765/transcribe` |
| **Faster-Whisper model** | Choose Small / Medium / Large-v3 / Large-v3-Turbo (recommended) |
| **Enable Groq STT** | Recognize speech with the Groq Whisper API. Shows an error in subtitles on failure |
| **Groq model** | Choose Large-v3-Turbo (fast) or Large-v3 (high accuracy) |
| **Groq API key** | Get one from [console.groq.com](https://console.groq.com) for free |
| **Enable DeepL** | Use DeepL instead of Google Translate |
| **DeepL feature selection** | Toggle DeepL separately for chat translation, voice subtitles, and sent messages |
| **DeepL API key** | Supports both free keys ending in `:fx` and paid keys |
| **Enable Gemini** | Enables Gemini AI. Per-feature toggles let you choose voice subtitles and sent messages separately |
| **Gemini model** | 2.5 Flash (recommended) / 3.1 Flash Lite / 3 Flash / 3.5 Flash |
| **Gemini API key** | Get one from Google AI Studio. Free tier: 1,500 requests/day and 15 requests/minute |
| **Gemini prompt** | Customize translation instructions. `{lang}` = target language, `{text}` = recognized text |
| **Translation TTS speed** | TTS playback speed (0.5x to 2.0x) |
| **Default target language** | Target language used when no channel-specific setting exists |
| **Same-language filter** | Skip messages already in the target language |
| **Minimum length filter** | Skip messages shorter than the specified character count |
| **VAD silence threshold** | Speech detection sensitivity. Lower values are more sensitive. Default: 10% |
| **VAD silence duration** | Wait time from speech end to processing start. Default: 500 ms |
| **Maximum chunk length** | Forced processing interval when silence is not detected. Default: 5 seconds |
| **Panel opacity** | Panel background opacity: 30-100%, default 80%. The panel becomes opaque on hover |
| **Hallucination exclusion patterns** | Register Whisper misgeneration phrases to remove them from subtitles automatically |

> The DeepL free tier allows 500,000 characters per month. The Gemini free tier allows 1,500 requests/day and 15 requests/minute. Use per-feature toggles to enable them only where needed.

---

## File Structure

```text
twitch-chat-translate-ext/
├── extension/              # Extension package loaded by Chrome
│   ├── manifest.json       # Extension settings (Manifest V3)
│   ├── background.js       # Service Worker (translation API proxy, cache, OAuth)
│   ├── content.js          # Content script main (constants, state, initialization, settings)
│   ├── content-panel.js    # Content script (Shadow DOM panel and UI)
│   ├── content-chat.js     # Content script (IRC, chat translation, high-speed chat)
│   ├── content-whisper.js  # Content script (speech recognition, subtitles, TTS; sends audio to Faster-Whisper/Groq)
│   ├── auth-callback.js    # Content script for OAuth callback
│   ├── help.html           # Usage page (right-click icon → “📖 Help”)
│   ├── options.html / options.js / options.css
│   └── icons/
├── scripts/
│   ├── build-release.ps1                        # Release ZIP packaging script (extension)
│   └── build-faster-whisper-server-release.ps1  # Release ZIP packaging script (Faster-Whisper server)
├── docs/images/            # Documentation images
└── uv/                    # Faster-Whisper STT server (distributed separately, Python)
    ├── server.py
    ├── requirements.txt
    └── README.md
```

---

## Technical Details

### Translation

Direct `fetch` requests to `translate.googleapis.com` are blocked by CORS, so requests are routed from `content.js` through `background.js` (Service Worker).

Translation engine priority: **Gemini → DeepL → Google**. Higher-priority engines are used when enabled, and the extension automatically falls back on errors.
Chat translation supports Google / DeepL only because chat volume is high and Gemini is not recommended for it. Voice subtitles and sent messages can also use Gemini.
Results for identical text and language pairs are stored in an in-memory LRU cache to skip repeated translations.

### Chat Receiving and Sending

The extension connects directly to Twitch IRC over WebSocket: `wss://irc-ws.chat.twitch.tv:443`.

- Not logged in: read-only connection as an anonymous `justinfan` user.
- Logged in: authenticates with an OAuth token and sends messages using the `PRIVMSG` command.

### Voice Subtitles

**Capture:**  
Instead of `getDisplayMedia()` (tab sharing, which shows a banner), the extension uses the Web Audio API. It taps audio directly from the Twitch `<video>` element with `AudioContext.createMediaElementSource(<video>)`.

**Inference (Faster-Whisper):**
Recorded audio chunks are sent through `background.js` (Service Worker) to `uv/server.py` (FastAPI + faster-whisper/CTranslate2).
Large-family models run on the local PC's GPU, and results are returned to the content script. On failure or timeout, subtitles show an error.

**Inference (Groq):**
Audio data is Base64-encoded and sent to `api.groq.com` through `background.js` (Service Worker).
This avoids CORS restrictions while running Whisper Large-v3-Turbo / Large-v3 in the cloud.
If Groq fails, subtitles show an error (there is no automatic fallback).

**VAD (Voice Activity Detection):**  
An `AnalyserNode` monitors volume level and starts processing when the configured silence duration continues after speech.

**Hallucination countermeasures:**  
Whisper-specific bad outputs, including boilerplate phrases, non-speech annotations, repeated text, and symbol-only output, are detected and removed automatically.

### OAuth

Twitch Implicit Grant flow is used.

1. The extension opens `id.twitch.tv/oauth2/authorize` in a new tab.
2. After authentication, Twitch redirects to `kawachan-jp.github.io/twitch-chat-translate/`.
3. `auth-callback.js`, injected into that page, reads the token from the URL fragment and forwards it to `background.js`.

### Panel

The panel uses Shadow DOM to isolate it from page CSS: `attachShadow({ mode: 'open' })`.
The usage panel is independently positioned with `position: fixed` in the same Shadow DOM and shares the main panel opacity setting.

---

## Default Settings

| Setting | Default |
|---------|---------|
| Source language | Auto detect |
| Target language | Japanese |
| Show original text | ON |
| Auto-scroll | ON |
| Faster-Whisper STT | OFF |
| Groq STT | OFF |
| Use DeepL | OFF |
| Use Gemini | OFF |
| Gemini model | 2.5 Flash |
| Translation text-to-speech (TTS) | OFF |
| TTS speed | 1.0x |
| Same-language filter | OFF |
| Minimum length filter | OFF (4 characters) |
| VAD silence threshold | 10% |
| VAD silence duration | 500 ms |
| Maximum chunk length | 5 seconds |
| Subtitle font size | 22 px |
| Panel opacity | 80% |

---

## Creating a Release ZIP

Create distribution ZIP files with the packaging scripts instead of manually zipping the whole repository.
**The extension itself (for the Chrome Web Store) and the Faster-Whisper server (a Python tool) are packaged
into separate ZIP files.** The extension ZIP never contains Python files, so it can be submitted to the
Chrome Web Store review as-is.

```powershell
# Extension (twitch-chat-translator-vX.Y.Z.zip)
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-release.ps1

# Faster-Whisper server (faster-whisper-server.zip, distributed separately from the extension)
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-faster-whisper-server-release.ps1
```

The first script uses the version from `extension/manifest.json` and generates `twitch-chat-translator-vX.Y.Z.zip`. In the ZIP, `manifest.json` is placed at the archive root. Development files such as `.github/`, `.gitignore`, and `CLAUDE.md` are not included in the release ZIP.
The Faster-Whisper server is an independent tool and is not versioned; the second script packages only
`server.py`, `requirements.txt`, and `README.md` into `faster-whisper-server.zip`.

---

## Feature Requests and Improvements

Issues and pull requests are welcome. Feel free to suggest features that would make the extension more useful.

---

## License

[MIT License](LICENSE)
