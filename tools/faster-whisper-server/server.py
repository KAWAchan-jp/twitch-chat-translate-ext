import os
import tempfile
from functools import lru_cache
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel


DEVICE = os.getenv("FASTER_WHISPER_DEVICE", "auto")
COMPUTE_TYPE = os.getenv("FASTER_WHISPER_COMPUTE_TYPE", "auto")
DEFAULT_MODEL = os.getenv("FASTER_WHISPER_MODEL", "large-v3-turbo")

app = FastAPI(title="Twitch Chat Translator Faster-Whisper Server")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


@lru_cache(maxsize=4)
def get_model(model_name: str) -> WhisperModel:
    return WhisperModel(model_name, device=DEVICE, compute_type=COMPUTE_TYPE)


@app.get("/health")
def health():
    return {
        "ok": True,
        "default_model": DEFAULT_MODEL,
        "device": DEVICE,
        "compute_type": COMPUTE_TYPE,
    }


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    model: str = Form(DEFAULT_MODEL),
    language: Optional[str] = Form(None),
    initial_prompt: Optional[str] = Form(None),
):
    suffix = Path(file.filename or "audio.webm").suffix or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        segments, info = get_model(model).transcribe(
            tmp_path,
            language=language or None,
            initial_prompt=initial_prompt or None,
            vad_filter=True,
        )
        text = "".join(segment.text for segment in segments).strip()
        return {
            "text": text,
            "language": getattr(info, "language", None),
            "language_probability": getattr(info, "language_probability", None),
            "model": model,
        }
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
