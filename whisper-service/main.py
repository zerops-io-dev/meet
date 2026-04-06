"""Zerops Whisper Service — GPU-accelerated audio transcription via faster-whisper."""

import os
import tempfile
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from faster_whisper import WhisperModel

# Config
MODEL_SIZE = os.getenv("WHISPER_MODEL", "large-v3")
DEVICE = os.getenv("WHISPER_DEVICE", "cuda")
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "float16")
PORT = int(os.getenv("PORT", "8787"))
API_KEY = os.getenv("WHISPER_API_KEY", "zrps_wh_k8x2mP9vLqR4nT6wJ3yF5hB7dA0cE1gS")

model: WhisperModel | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load model on startup."""
    global model
    print(f"Loading Whisper model: {MODEL_SIZE} on {DEVICE} ({COMPUTE_TYPE})...")
    start = time.time()
    model = WhisperModel(MODEL_SIZE, device=DEVICE, compute_type=COMPUTE_TYPE)
    print(f"Model loaded in {time.time() - start:.1f}s")
    yield
    print("Shutting down...")


app = FastAPI(title="Zerops Whisper", lifespan=lifespan)


class AuthMiddleware(BaseHTTPMiddleware):
    """Require API key on all routes except /health."""

    async def dispatch(self, request: Request, call_next):
        if request.url.path == "/health" and request.method == "GET":
            return await call_next(request)

        auth = request.headers.get("x-api-key") or request.headers.get(
            "authorization", ""
        ).replace("Bearer ", "")
        if auth != API_KEY:
            return JSONResponse({"error": "Unauthorized"}, status_code=401)

        return await call_next(request)


app.add_middleware(AuthMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "model": MODEL_SIZE, "device": DEVICE}


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: str | None = None,
):
    """Transcribe an audio file. Accepts any format ffmpeg supports."""
    if not model:
        raise HTTPException(503, "Model not loaded yet")

    # Save uploaded file to temp
    suffix = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        start = time.time()
        segments, info = model.transcribe(
            tmp_path,
            language=language,
            beam_size=5,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500),
        )

        # Collect all segments
        text_segments = []
        full_text = []
        for seg in segments:
            text_segments.append(
                {
                    "start": round(seg.start, 2),
                    "end": round(seg.end, 2),
                    "text": seg.text.strip(),
                }
            )
            full_text.append(seg.text.strip())

        elapsed = time.time() - start

        return {
            "text": " ".join(full_text),
            "segments": text_segments,
            "language": info.language,
            "language_probability": round(info.language_probability, 3),
            "duration": round(info.duration, 2),
            "processing_time": round(elapsed, 2),
        }
    finally:
        os.unlink(tmp_path)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=PORT)
