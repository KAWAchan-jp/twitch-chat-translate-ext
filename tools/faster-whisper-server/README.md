# Faster-Whisper Local Server

Twitch Chat Translator の Faster-Whisper STT 用ローカルサーバーです。

## Setup

```bash
cd tools/faster-whisper-server
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Windows PowerShell:

```powershell
cd tools\faster-whisper-server
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Run

```bash
uvicorn server:app --host 127.0.0.1 --port 8765
```

Chrome 拡張のオプションで URL を `http://127.0.0.1:8765/transcribe` にします。

## Environment

- `FASTER_WHISPER_MODEL`: default model, default `large-v3-turbo`
- `FASTER_WHISPER_DEVICE`: `auto`, `cpu`, `cuda`, etc.
- `FASTER_WHISPER_COMPUTE_TYPE`: `auto`, `int8`, `float16`, etc.
