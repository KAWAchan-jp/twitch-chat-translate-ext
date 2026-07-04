# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "fastapi>=0.115.0",
#     "uvicorn[standard]>=0.30.0",
#     "python-multipart>=0.0.9",
#     "faster-whisper>=1.0.0",
# ]
# ///
# uv がインストール済みなら `uv run server.py` だけで依存解決込みで起動できる（PEP 723）

import glob
import importlib.util
import os
import tempfile
from contextlib import asynccontextmanager
from functools import lru_cache
from pathlib import Path
from typing import Optional


def _add_nvidia_dll_dirs() -> None:
    # pip の nvidia-cublas-cu12 / nvidia-cudnn-cu12 が入っていれば、その DLL を
    # 検索パスへ追加する（Windows）。CUDA Toolkit をシステムにインストールしなくても
    # `uv run --with nvidia-cublas-cu12 --with nvidia-cudnn-cu12 server.py` だけで GPU が使える。
    # ctranslate2 の import 前に実行する必要がある。
    # `uv run --with` の一時環境は site.getsitepackages() に載らないため、
    # namespace パッケージ `nvidia` の実際の場所を importlib で探す
    if os.name != "nt":
        return
    try:
        spec = importlib.util.find_spec("nvidia")
    except (ImportError, ValueError):
        return
    if not spec or not spec.submodule_search_locations:
        return
    for loc in spec.submodule_search_locations:
        for bin_dir in glob.glob(os.path.join(loc, "*", "bin")):
            os.add_dll_directory(bin_dir)
            os.environ["PATH"] = bin_dir + os.pathsep + os.environ.get("PATH", "")


_add_nvidia_dll_dirs()

import numpy as np
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel


DEVICE = os.getenv("FASTER_WHISPER_DEVICE", "auto")
COMPUTE_TYPE = os.getenv("FASTER_WHISPER_COMPUTE_TYPE", "auto")
DEFAULT_MODEL = os.getenv("FASTER_WHISPER_MODEL", "large-v3-turbo")
# 拡張側は30秒でタイムアウトするため、初回リクエスト中のモデルDLは確実に失敗する。
# 起動時にデフォルトモデルを先にロードしておく（FASTER_WHISPER_PRELOAD=0 で無効化）
PRELOAD = os.getenv("FASTER_WHISPER_PRELOAD", "1") != "0"


@lru_cache(maxsize=4)
def get_model(model_name: str) -> WhisperModel:
    return WhisperModel(model_name, device=DEVICE, compute_type=COMPUTE_TYPE)


def warmup(model: WhisperModel) -> None:
    # 無音1秒を1回認識してデバイス初期化を確定させる。
    # GPUはあるがCUDAランタイム（cublas/cuDNN）が無い環境では、モデルロードではなく
    # この最初の推論で RuntimeError になるため、ここで検出する。
    # vad_filter=True だと無音がスキップされ encode まで到達しないので必ず False にする
    segments, _ = model.transcribe(np.zeros(16000, dtype=np.float32), vad_filter=False)
    list(segments)


# ウォームアップ済みモデル名（毎リクエストの無駄な推論を避ける）
_warmed_models: set = set()


def load_model_with_fallback(model_name: str) -> WhisperModel:
    # CUDA初期化失敗（DLL欠如等）を検出したらCPUに切り替えて以後のロードもCPUにする
    global DEVICE
    model = get_model(model_name)
    if model_name in _warmed_models:
        return model
    try:
        warmup(model)
    except RuntimeError as err:
        if DEVICE == "cpu":
            raise
        # ログは Windows コンソール（cp932）での文字化けを避けるため英語にする
        print(f"[warn] GPU init failed ({err}); falling back to CPU")
        DEVICE = "cpu"
        get_model.cache_clear()
        _warmed_models.clear()
        model = get_model(model_name)
        warmup(model)
    _warmed_models.add(model_name)
    return model


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if PRELOAD:
        print(f"[startup] Loading model '{DEFAULT_MODEL}'... (first run downloads the model, may take minutes)")
        load_model_with_fallback(DEFAULT_MODEL)
        print(f"[startup] Model '{DEFAULT_MODEL}' ready on device '{DEVICE}'. Accepting transcribe requests.")
    yield


app = FastAPI(title="Twitch Chat Translator Faster-Whisper Server", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


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
        segments, info = load_model_with_fallback(model).transcribe(
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


if __name__ == "__main__":
    import uvicorn

    # 拡張のデフォルトURL（http://127.0.0.1:8765/transcribe）に合わせたポート
    uvicorn.run(
        app,
        host=os.getenv("FASTER_WHISPER_HOST", "127.0.0.1"),
        port=int(os.getenv("FASTER_WHISPER_PORT", "8765")),
    )
