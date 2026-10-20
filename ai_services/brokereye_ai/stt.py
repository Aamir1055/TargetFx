"""Speech to text for voice questions (Telegram voice notes, the web chat's mic).

Two providers (AI_STT_PROVIDER, default "auto": Sarvam when its key is set):

- Sarvam AI (SARVAM_API_KEY): the hosted Indian-language model, about a second
  per question, Gujarati / Hindi / English and their mixes; paid per audio
  minute. Its quick API takes 30 s per call, so longer recordings go in 25 s
  pieces.
- Whisper on this server (faster-whisper, CPU, int8): free and the audio never
  leaves the machine, but slow on a CPU (about 20 s per question with
  large-v3-turbo, the default; "small" is quick but weak in Gujarati). The
  model is downloaded from Hugging Face the first time and loaded in the
  background at startup. Each recording's language is chosen among
  AI_STT_LANGUAGES (en,hi,gu); mixed speech comes out in the language's script
  with the English words in Latin.

Audio is decoded by PyAV (bundled FFmpeg), so Telegram's OGG/Opus and the
browser's WebM/Opus need nothing else installed.
"""
from __future__ import annotations

import io
import json
import logging
import re
import threading
import time
import wave
from typing import Any

from .config import settings

try:  # anthropic 1.x ships httpx2; fall back to httpx on older installs
    import httpx2 as httpx
except ImportError:  # pragma: no cover
    import httpx  # type: ignore

log = logging.getLogger("brokereye_ai.stt")

MAX_AUDIO_BYTES = 10 * 1024 * 1024
MAX_AUDIO_SECONDS = 180
_DIGIT_GROUP = re.compile(r"(?<=\d),(?=\d{2,3}(?:,\d|\D|$))")

# Brokers speak English, Hindi, Gujarati, or Hindi / Gujarati mixed with
# English. Whisper's own detection can take Hindi for Urdu or Marathi, so the
# language is picked among these only (AI_STT_LANGUAGES).
# Per language, a sample in the style to write: the language's own script
# with the trading words, logins and amounts in English, as brokers mix them.
# Whisper continues in the style of its prompt, so "close only", "P&L" and
# 750001 come out as written.
_PROMPTS = {
    "en": ("BrokerEye broker question about MT5 clients: login 750001, P&L, M2M, margin level, credit in, "
           "credit out, temp credit, close only, liquidate, non-SQ, no pending orders, settlement week, bill."),
    "hi": ("आज का P&L दिखाओ। Top 10 loss वाले clients बताओ। Account 750001 को close only पर डालो, "
           "5000 का credit in करो। Margin level, M2M, temp credit, settlement week का bill।"),
    "gu": ("આજ નું P&L બતાવો. Top 10 loss વાળા clients બતાવો. Account 750001 ને close only પર મૂકો, "
           "5000 નું credit in કરો. Margin level, M2M, temp credit, settlement week નું bill."),
}
# The same trading words for Sarvam (saaras:v4 "keyterms", up to 50).
_KEYTERMS = ["BrokerEye", "P&L", "M2M", "MT5", "margin level", "margin call", "credit in", "credit out",
             "temp credit", "close only", "liquidate", "non-SQ", "no pending orders", "settlement week", "bill",
             "brokerage", "equity", "floating", "lots", "login"]
_SARVAM_PIECE_SECONDS = 25
_SARVAM_LIMIT_SECONDS = 29

_model: Any = None
_model_error: str | None = None
_load_lock = threading.Lock()
# Whisper keeps every core busy: one transcription at a time, the rest queue.
_run_lock = threading.Lock()


class SttError(Exception):
    """A voice note that cannot be turned into text (shown to the user)."""


def enabled() -> bool:
    return bool(settings().ai_stt_enabled)


def provider() -> str:
    """"sarvam" or "whisper", as configured (auto: Sarvam when its key is set)."""
    cfg = settings()
    p = (cfg.ai_stt_provider or "auto").strip().lower()
    if p in ("sarvam", "whisper"):
        return p
    return "sarvam" if cfg.sarvam_api_key else "whisper"


def warm_up() -> None:
    """Load the Whisper model in the background (startup), so the first voice question is quick."""
    if not enabled() or provider() != "whisper":
        return

    def run() -> None:
        try:
            _load()
        except SttError:
            pass  # logged; the next voice question tries again

    threading.Thread(target=run, name="stt-warm-up", daemon=True).start()


def status() -> dict[str, Any]:
    p = provider()
    if p == "sarvam":
        ready = bool(settings().sarvam_api_key)
        return {"enabled": enabled() and ready, "provider": p, "loaded": ready, "model": settings().ai_sarvam_stt_model,
                "error": None if ready else "SARVAM_API_KEY is not set"}
    return {"enabled": enabled(), "provider": p, "loaded": _model is not None, "model": settings().ai_stt_model,
            "error": _model_error}


def transcribe(audio: bytes, content_type: str = "") -> dict[str, Any]:
    """Audio bytes (OGG/Opus, WebM, MP3, WAV, M4A ...) -> {"text", "language", "seconds", "provider"}."""
    if not enabled():
        raise SttError("Voice input is switched off on this server.")
    if not audio:
        raise SttError("The recording is empty.")
    if len(audio) > MAX_AUDIO_BYTES:
        raise SttError("That recording is too large; keep voice questions under 3 minutes.")
    started = time.monotonic()
    samples = _decode(audio)
    if len(samples) > (MAX_AUDIO_SECONDS + 5) * 16000:
        raise SttError("That recording is too long; keep voice questions under 3 minutes.")
    p = provider()
    if p == "sarvam":
        text, language = _sarvam(audio, content_type, samples)
    else:
        text, language = _whisper(samples)
    text = text.strip()
    if not text:
        raise SttError("I couldn't hear any words in that recording. Please try again.")
    # Speech models group digits ("750,001", "5,00,000"): a login must stay one number. A comma followed by
    # 2-3 digits and a non-digit is a group separator; "750001,750002" (a list) is left alone.
    text = _DIGIT_GROUP.sub("", text)
    return {"text": text, "language": language, "provider": p, "seconds": round(time.monotonic() - started, 1)}


def _decode(audio: bytes) -> Any:
    """16 kHz mono float samples (also the recording's length)."""
    try:
        from faster_whisper import decode_audio
    except ImportError as e:
        raise SttError("Voice input is not available on this server (audio decoder missing).") from e
    try:
        return decode_audio(io.BytesIO(audio))
    except Exception as e:  # noqa: BLE001 - undecodable audio and the like
        log.warning("audio decode failed: %s: %s", type(e).__name__, e)
        raise SttError("Could not understand that recording (unsupported or damaged audio).") from e


# ---------------------------------------------------------------------------
# Sarvam AI (POST /speech-to-text, multipart, header api-subscription-key)
# ---------------------------------------------------------------------------
_EXT = {"ogg": "ogg", "opus": "ogg", "webm": "webm", "mpeg": "mp3", "mp3": "mp3", "mp4": "m4a", "m4a": "m4a",
        "aac": "aac", "wav": "wav", "x-wav": "wav", "flac": "flac", "amr": "amr"}


def _sarvam_language() -> str:
    lang = (settings().ai_stt_language or "").strip().lower()
    return f"{lang}-IN" if lang in ("en", "hi", "gu") else (lang or "unknown")


def _wav(samples: Any) -> bytes:
    import numpy as np

    pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype("<i2").tobytes()
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(pcm)
    return buf.getvalue()


def _sarvam(audio: bytes, content_type: str, samples: Any) -> tuple[str, str | None]:
    cfg = settings()
    if not cfg.sarvam_api_key:
        raise SttError("Voice input is not set up on this server (no Sarvam key).")
    seconds = len(samples) / 16000
    if seconds <= _SARVAM_LIMIT_SECONDS:
        sub = (content_type or "").split(";")[0].split("/")[-1].strip().lower()
        pieces = [(audio, f"voice.{_EXT.get(sub, 'ogg')}", (content_type or "audio/ogg").split(";")[0])]
    else:
        step = _SARVAM_PIECE_SECONDS * 16000
        pieces = [(_wav(samples[i:i + step]), f"voice-{n}.wav", "audio/wav")
                  for n, i in enumerate(range(0, len(samples), step))]
    texts: list[str] = []
    language: str | None = None
    with httpx.Client(timeout=30.0) as c:
        for data, name, ctype in pieces:
            form = {"model": cfg.ai_sarvam_stt_model, "language_code": language or _sarvam_language()}
            if cfg.ai_sarvam_stt_mode:
                form["mode"] = cfg.ai_sarvam_stt_mode
            if cfg.ai_sarvam_stt_model.startswith("saaras:v4"):
                form["keyterms"] = json.dumps(_KEYTERMS)
            try:
                r = c.post(cfg.sarvam_base_url.rstrip("/") + "/speech-to-text",
                           headers={"api-subscription-key": cfg.sarvam_api_key},
                           data=form, files={"file": (name, data, ctype)})
            except httpx.HTTPError as e:
                log.warning("Sarvam unreachable: %s", e)
                raise SttError("The speech service is not reachable right now. Please try again.") from e
            if r.status_code == 429:
                raise SttError("The speech service is busy right now. Please try again in a moment.")
            if r.status_code >= 400:
                log.warning("Sarvam speech-to-text HTTP %s: %s", r.status_code, r.text[:300])
                raise SttError("The speech service could not read that recording. Please try again.")
            j = r.json()
            texts.append(str(j.get("transcript") or "").strip())
            # Later pieces keep the first piece's language.
            language = language or (j.get("language_code") or None)
    return " ".join(t for t in texts if t), language


# ---------------------------------------------------------------------------
# Whisper on this server
# ---------------------------------------------------------------------------
def _load() -> Any:
    global _model, _model_error
    with _load_lock:
        if _model is not None:
            return _model
        cfg = settings()
        try:
            from faster_whisper import WhisperModel  # heavy import: only when voice is used
        except ImportError as e:
            _model_error = "faster-whisper is not installed on the AI service"
            raise SttError(_model_error) from e
        started = time.monotonic()
        try:
            _model = WhisperModel(cfg.ai_stt_model, device="cpu", compute_type="int8",
                                  cpu_threads=max(0, cfg.ai_stt_threads))
        except Exception as e:  # noqa: BLE001 - a download / load failure is reported, not raised to the event loop
            _model_error = f"Could not load the speech model '{cfg.ai_stt_model}': {type(e).__name__}: {e}"
            log.error(_model_error)
            raise SttError("Voice input is not available right now (the speech model did not load).") from e
        _model_error = None
        log.info("Speech model '%s' loaded in %.1f s", cfg.ai_stt_model, time.monotonic() - started)
        return _model


def _whisper(samples: Any) -> tuple[str, str | None]:
    model = _load()
    cfg = settings()
    with _run_lock:
        try:
            language = (cfg.ai_stt_language or "").strip() or _pick_language(model, samples)
            segments, info = model.transcribe(
                samples,
                language=language,
                beam_size=5,
                vad_filter=True,  # skip silence at the start / end and between sentences
                initial_prompt=_PROMPTS.get(language or "en", _PROMPTS["en"]),
                condition_on_previous_text=False,
            )
            text = " ".join(s.text.strip() for s in segments)
        except Exception as e:  # noqa: BLE001
            log.warning("transcription failed: %s: %s", type(e).__name__, e)
            raise SttError("Could not understand that recording (unsupported or damaged audio).") from e
    return text, getattr(info, "language", None)


def _pick_language(model: Any, samples: Any) -> str | None:
    """The most likely of the allowed languages (AI_STT_LANGUAGES, default en,hi,gu); None lets Whisper decide
    when none is configured or detection fails (e.g. no speech at all)."""
    allowed = [x.strip().lower() for x in (settings().ai_stt_languages or "").split(",") if x.strip()]
    if not allowed:
        return None
    if len(allowed) == 1:
        return allowed[0]
    try:
        _, _, probs = model.detect_language(audio=samples, vad_filter=True, language_detection_segments=2)
    except Exception as e:  # noqa: BLE001 - silence leaves nothing to detect on
        log.info("language detection skipped: %s", type(e).__name__)
        return None
    scores = dict(probs)
    return max(allowed, key=lambda code: scores.get(code, 0.0))
