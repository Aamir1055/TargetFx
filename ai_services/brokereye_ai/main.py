"""FastAPI app: broker-authenticated chat with Server-Sent Events.

    POST   /ai/chat                         {message, conversation_id?} -> SSE stream
    GET    /ai/conversations                list the broker's chats
    GET    /ai/conversations/{id}/messages  transcript for the UI
    DELETE /ai/conversations/{id}           archive
    GET    /health

Auth: `Authorization: Bearer <broker JWT>` — the same token the broker uses
against BrokerEye. It is verified by asking BrokerEye who it belongs to and
forwarded on every tool call.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import threading
from pathlib import Path
from typing import Any

import psycopg
from fastapi import Depends, FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from . import agent, alerts, brokereye, locks, scheduler, store, stt, tools, uploads
from .config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("brokereye_ai")

# Always keep a rotating log file next to the service (logs/ai_service.log),
# whatever supervises the process (NSSM, a scheduled task, a console).
try:
    from logging.handlers import RotatingFileHandler

    _log_dir = Path(__file__).resolve().parent.parent / "logs"
    _log_dir.mkdir(exist_ok=True)
    _fh = RotatingFileHandler(_log_dir / "ai_service.log", maxBytes=10_000_000, backupCount=5, encoding="utf-8")
    _fh.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    logging.getLogger().addHandler(_fh)
except OSError as _e:  # read-only location: console logging still works
    log.warning("file logging disabled: %s", _e)

app = FastAPI(title="BrokerEye AI", version="0.1.0")


@app.exception_handler(Exception)
def _unhandled(_: Request, e: Exception):
    """Log the traceback and return the reason as JSON so callers (the
    Telegram bot, the web page) can show something better than 'HTTP 500'."""
    log.exception("unhandled error: %s", e)
    return JSONResponse(status_code=500, content={"detail": f"{type(e).__name__}: {str(e)[:300]}"})


@app.on_event("startup")
def _check_database() -> None:
    """Fail loudly (in the log) when the DB is unreachable or migration 020 is
    missing, instead of surfacing a traceback on the first chat."""
    cfg = settings()
    safe_url = cfg.database_url.split("@")[-1]
    try:
        with psycopg.connect(cfg.database_url, connect_timeout=5, options=f"-c TimeZone={cfg.ai_timezone}") as c:
            n = c.execute(
                "SELECT count(*) FROM information_schema.tables "
                "WHERE table_name IN ('ai_conversations', 'ai_messages', 'ai_tool_calls')"
            ).fetchone()[0]
        if n < 3:
            log.error("Database %s is missing the ai_* tables: run migrations/020_add_ai_chat.sql "
                      "(or restart BrokerEye so its auto-migrations apply it).", safe_url)
        else:
            log.info("Database OK (%s)", safe_url)
    except psycopg.OperationalError as e:
        log.error("Cannot connect to database %s: %s — check DATABASE_URL / BROKEREYE_CONFIG in .env",
                  safe_url, str(e).strip())
    if not cfg.anthropic_api_key:
        log.error("ANTHROPIC_API_KEY is not set; chat requests will fail.")
    if cfg.ai_scheduler:
        if not cfg.brokereye_jwt_secret:
            log.warning("Scheduled digests cannot run: BrokerEye's JWT secret is unknown (set BROKEREYE_CONFIG or BROKEREYE_JWT_SECRET)")
        if not cfg.telegram_bot_token:
            log.info("Telegram delivery off: no bot token (TelegramBotPlugin config / custom_config.telegram.bot_token / TELEGRAM_BOT_TOKEN)")
        scheduler.start()
    stt.warm_up()


@app.on_event("shutdown")
def _stop_scheduler() -> None:
    scheduler.stop()


@app.exception_handler(psycopg.Error)
def _db_error(_: Request, e: psycopg.Error):
    log.error("database error: %s", str(e).strip())
    hint = (". Check DATABASE_URL / BROKEREYE_CONFIG in the AI service .env."
            if isinstance(e, psycopg.OperationalError)
            else ". Are all migrations/0*.sql applied to this database?")
    return JSONResponse(status_code=503, content={
        "detail": "Database error: " + str(e).strip().splitlines()[0] + hint,
    })
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings().ai_cors_origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)

_STATIC = Path(__file__).resolve().parent.parent / "static"

# One active turn per broker: a second message while one is running gets 409
# instead of racing the append-only history (shared with the scheduler).
_broker_lock = locks.broker_lock


def get_session(authorization: str = Header(default="")) -> brokereye.Session:
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Broker bearer token required")
    try:
        return brokereye.resolve_session(authorization[7:].strip())
    except PermissionError as e:
        raise HTTPException(401, str(e))
    except brokereye.BrokerEyeError as e:
        raise HTTPException(502, f"BrokerEye unavailable: {e}")


# ---------------------------------------------------------------------------
# Sign-in relay for the web UI (same origin as the page, no CORS needed).
# BrokerEye does the authentication; this only forwards the request and
# returns what it returns (access_token / refresh_token, or requires_2fa +
# temp_token for the second step).
# ---------------------------------------------------------------------------
class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=200)


class TwoFactorRequest(BaseModel):
    temp_token: str = Field(min_length=1, max_length=4000)
    code: str = Field(min_length=1, max_length=32)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1, max_length=4000)


def _relay_auth(path: str, body: dict[str, Any]) -> dict[str, Any]:
    try:
        return brokereye.forward_auth(path, body)
    except PermissionError as e:
        raise HTTPException(401, str(e))
    except brokereye.BrokerEyeError as e:
        raise HTTPException(502, f"BrokerEye unavailable: {e}")


@app.post("/ai/login")
def login(req: LoginRequest):
    return _relay_auth("/api/auth/broker/login", {"username": req.username, "password": req.password})


@app.post("/ai/login/2fa")
def login_2fa(req: TwoFactorRequest):
    return _relay_auth("/api/auth/broker/verify-2fa", {"temp_token": req.temp_token, "code": req.code})


@app.post("/ai/login/refresh")
def login_refresh(req: RefreshRequest):
    return _relay_auth("/api/auth/broker/refresh", {"refresh_token": req.refresh_token})


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    conversation_id: str | None = None
    # Channel-side continuity: a stable key such as "telegram:<chat id>". When
    # given (and conversation_id is not), the latest conversation under that
    # key is resumed unless it has been idle longer than max_idle_minutes or
    # new_conversation is set.
    external_key: str | None = Field(default=None, max_length=128)
    new_conversation: bool = False
    max_idle_minutes: int = Field(default=120, ge=1, le=7 * 24 * 60)
    channel: str = Field(default="web", pattern=r"^(web|telegram)$")
    # Ids returned by POST /ai/uploads to attach to this message (max 5).
    attachments: list[str] | None = Field(default=None, max_length=5)


def _resolve_conversation(req: ChatRequest, session: brokereye.Session) -> str:
    if req.conversation_id:
        if not store.get_conversation(session.broker_id, req.conversation_id):
            raise HTTPException(404, "Conversation not found")
        return req.conversation_id
    if req.external_key and not req.new_conversation:
        found = store.find_recent_by_key(session.broker_id, req.external_key, req.max_idle_minutes)
        if found:
            return found
    return store.create_conversation(session.broker_id, req.channel, settings().ai_model, req.external_key)


def _sse(event: dict[str, Any]) -> str:
    return f"event: {event['type']}\ndata: {json.dumps(event, default=str)}\n\n"


# Progress of in-flight non-streaming turns, so a bot can poll
# GET /ai/turns/{turn_id} and animate a status line while it waits.
_turns: dict[str, dict[str, Any]] = {}
_turns_guard = threading.Lock()


def _turn_update(turn_id: str | None, **fields: Any) -> None:
    if not turn_id:
        return
    with _turns_guard:
        t = _turns.get(turn_id)
        if t is not None:
            t.update(fields)


class TurnRequest(ChatRequest):
    turn_id: str | None = Field(default=None, max_length=64, pattern=r"^[A-Za-z0-9:_-]*$")


@app.post("/ai/chat/complete")
def chat_complete(req: TurnRequest, session: brokereye.Session = Depends(get_session)):
    """Non-streaming variant for bots: runs the whole turn and returns the
    final answer as text plus Telegram-ready HTML chunks. Pass a client
    generated `turn_id` to follow progress on GET /ai/turns/{turn_id}."""
    import time as _time

    from .telegram_format import markdown_to_telegram_html, split_for_telegram

    conversation_id = _resolve_conversation(req, session)
    lock = _broker_lock(session.broker_id)
    if not lock.acquire(blocking=False):
        raise HTTPException(409, "A reply is still being generated for this broker; wait for it to finish.")
    if req.turn_id:
        with _turns_guard:
            _turns[req.turn_id] = {"broker_id": session.broker_id, "started": _time.time(), "stage": "",
                                   "tools": [], "tokens": 0, "cached": 0, "done": False}
    try:
        text, title, error, tools_used, usage, charts, files, suggestions, actions = "", None, None, [], {}, [], [], [], []
        partial = ""
        for ev in agent.run_turn(session, conversation_id, req.message, req.channel, req.attachments):
            t = ev["type"]
            if t == "done":
                text = ev["text"]
            elif t == "suggestions":
                suggestions = ev["items"]
            elif t == "action":
                actions.append(ev["action"])
            elif t == "chart":
                charts.append({"id": ev["id"], "title": ev["title"], "url": ev["url"]})
            elif t == "file":
                files.append({k: ev[k] for k in ("id", "filename", "format", "rows", "bytes", "url")})
            elif t == "title":
                title = ev["title"]
            elif t == "error":
                error = ev["message"]
            elif t == "tool_start":
                tools_used.append(ev["name"])
                # Text before a tool call is a preamble, not the answer.
                partial = ""
                _turn_update(req.turn_id, stage="Fetching " + ev["name"].replace("_", " "),
                             tools=[*tools_used], partial="")
            elif t == "progress":
                _turn_update(req.turn_id, stage=ev["text"][:80])
            elif t == "text":
                # The answer so far: the bot shows it as it is written.
                partial += ev.get("delta") or ""
                _turn_update(req.turn_id, stage="Writing", partial=partial[:30000])
            elif t == "usage":
                for k, v in ev.items():
                    if k != "type":
                        usage[k] = usage.get(k, 0) + v
                _turn_update(req.turn_id, tokens=usage.get("input_tokens", 0) + usage.get("output_tokens", 0),
                             cached=usage.get("cache_read_input_tokens", 0))
    finally:
        lock.release()
        if req.turn_id:
            _turn_update(req.turn_id, done=True)
            with _turns_guard:  # forget turns older than a minute
                cutoff = _time.time() - 60
                for k in [k for k, v in _turns.items() if v["done"] and v["started"] < cutoff]:
                    _turns.pop(k, None)

    html = markdown_to_telegram_html(text) if text else ""
    return {
        "conversation_id": conversation_id,
        "text": text,
        "html_chunks": split_for_telegram(html),
        "title": title,
        "error": error,
        "tools": tools_used,
        "charts": charts,
        "files": files,
        "suggestions": suggestions,
        "actions": actions,
        "usage": usage,
    }


@app.post("/ai/uploads")
async def upload(file: UploadFile = File(...), session: brokereye.Session = Depends(get_session)):
    """Attach a CSV / Excel / text file to the next message. Parsed on the
    server into a small table bound to this broker (24 h TTL); returns the
    id to send in `attachments` plus a preview for the UI."""
    data = await file.read()
    try:
        return uploads.save_upload(session.broker_id, file.filename or "upload", data)
    except uploads.UploadError as e:
        raise HTTPException(400, str(e))
    except Exception as e:  # noqa: BLE001 - a broken sheet must not 500
        log.warning("upload parse failed: %s", e)
        raise HTTPException(400, f"Could not read the file: {type(e).__name__}")


@app.post("/ai/transcribe")
async def transcribe(request: Request, session: brokereye.Session = Depends(get_session)):
    """A voice question as text: the raw audio is the request body (Telegram's
    OGG/Opus voice note, the browser's WebM/Opus recording, MP3, WAV ...).
    Transcribed on this server (stt.py); the text is then asked like a typed
    question. 400 with a readable detail when the audio cannot be used."""
    from starlette.concurrency import run_in_threadpool

    audio = await request.body()
    try:
        out = await run_in_threadpool(stt.transcribe, audio, request.headers.get("content-type", ""))
    except stt.SttError as e:
        raise HTTPException(400, str(e))
    log.info("voice question from broker %s: %.1f s to transcribe (%s, %s)", session.broker_id, out["seconds"],
             out["provider"], out["language"])
    return out


@app.get("/ai/transcribe/status")
def transcribe_status(session: brokereye.Session = Depends(get_session)):
    """Whether voice input works here (the web page shows the mic only then)."""
    return stt.status()


@app.get("/ai/files/{name}")
def stored_file(name: str, filename: str | None = None):
    """Rendered charts and exported files. The id is an unguessable 144-bit
    token and the file expires after an hour, so the URL works as a
    short-lived capability (the web page links/embeds it, the bot downloads
    and re-uploads). `?filename=` sets the download name."""
    from fastapi.responses import FileResponse as _FileResponse

    from .charts import stored_file as _resolve
    from .exports import MEDIA_TYPES, safe_filename

    hit = _resolve(name)
    if not hit:
        raise HTTPException(404, "Not found")
    path, ext = hit
    headers = {"Cache-Control": "private, max-age=3600"}
    if ext != "png":
        headers["Content-Disposition"] = f'attachment; filename="{safe_filename(filename or path.stem, ext)}"'
    return _FileResponse(path, media_type=MEDIA_TYPES.get(ext, "application/octet-stream"), headers=headers)


@app.post("/ai/chat")
async def chat(req: ChatRequest, session: brokereye.Session = Depends(get_session)):
    conversation_id = _resolve_conversation(req, session)

    lock = _broker_lock(session.broker_id)
    if not lock.acquire(blocking=False):
        raise HTTPException(409, "A reply is still being generated for this broker; wait for it to finish.")

    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()

    def producer() -> None:
        # The whole turn runs on this one thread so the tool functions see the
        # session context variable set inside agent.run_turn().
        try:
            for ev in agent.run_turn(session, conversation_id, req.message, "web", req.attachments):
                loop.call_soon_threadsafe(queue.put_nowait, ev)
        except Exception as e:  # last-resort: never leave the stream hanging
            log.exception("turn failed")
            loop.call_soon_threadsafe(queue.put_nowait, {"type": "error", "message": f"Internal error: {e}"})
        finally:
            lock.release()
            loop.call_soon_threadsafe(queue.put_nowait, None)

    threading.Thread(target=producer, name=f"ai-turn-{session.broker_id}", daemon=True).start()

    async def events():
        while True:
            ev = await queue.get()
            if ev is None:
                break
            yield _sse(ev)

    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ---------------------------------------------------------------------------
# Feedback (brokers) and knowledge (admins) — the improvement loop
# ---------------------------------------------------------------------------
class FeedbackRequest(BaseModel):
    rating: int = Field(ge=-1, le=1)
    comment: str = Field(default="", max_length=2000)
    conversation_id: str | None = None
    external_key: str | None = Field(default=None, max_length=128)
    message_seq: int | None = None
    channel: str = Field(default="web", pattern=r"^(web|telegram)$")


@app.post("/ai/feedback")
def feedback(req: FeedbackRequest, session: brokereye.Session = Depends(get_session)):
    """Thumbs up/down with an optional correction. A negative comment is
    drafted into a *pending* rule that an admin can activate."""
    conversation_id = req.conversation_id
    if not conversation_id and req.external_key:
        conversation_id = store.find_recent_by_key(session.broker_id, req.external_key, 7 * 24 * 60)
    if conversation_id and not store.get_conversation(session.broker_id, conversation_id):
        raise HTTPException(404, "Conversation not found")
    question, answer, seq = store.last_exchange(conversation_id, req.message_seq) if conversation_id else ("", "", None)
    fid = store.create_feedback(conversation_id=conversation_id, message_seq=seq, broker_id=session.broker_id,
                                channel=req.channel, rating=req.rating, comment=req.comment,
                                question=question, answer=answer)
    proposed = None
    if req.rating < 0 and req.comment.strip():
        draft = agent.draft_rule_from_feedback(req.comment, question, answer)
        if draft:
            kid = store.create_knowledge(scope="global", broker_id=None, kind=draft["kind"], title=draft["title"],
                                         content=draft["content"], status="pending", source="feedback",
                                         created_by=f"broker:{session.username or session.broker_id}", feedback_id=fid)
            proposed = {"id": kid, **draft}
    return {"ok": True, "feedback_id": fid, "proposed_rule": proposed}


@app.get("/ai/knowledge")
def knowledge(session: brokereye.Session = Depends(get_session)):
    """The active rules that apply to this broker (read-only)."""
    return {"rules": store.knowledge_for(session.broker_id)}


def get_admin(authorization: str = Header(default="")) -> brokereye.AdminSession:
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Admin bearer token required")
    try:
        return brokereye.resolve_admin(authorization[7:].strip())
    except PermissionError as e:
        raise HTTPException(403, str(e))
    except brokereye.BrokerEyeError as e:
        raise HTTPException(502, f"BrokerEye unavailable: {e}")


class KnowledgeIn(BaseModel):
    scope: str = Field(default="global", pattern=r"^(global|broker)$")
    broker_id: int | None = None
    kind: str = Field(default="rule", pattern=r"^(rule|fact|glossary|example)$")
    title: str = Field(min_length=1, max_length=160)
    content: str = Field(min_length=1, max_length=4000)
    status: str = Field(default="active", pattern=r"^(active|pending|disabled)$")


class KnowledgePatch(BaseModel):
    scope: str | None = Field(default=None, pattern=r"^(global|broker)$")
    broker_id: int | None = None
    kind: str | None = Field(default=None, pattern=r"^(rule|fact|glossary|example)$")
    title: str | None = Field(default=None, max_length=160)
    content: str | None = Field(default=None, max_length=4000)
    status: str | None = Field(default=None, pattern=r"^(active|pending|disabled)$")


@app.get("/ai/admin/me")
def admin_me(admin: brokereye.AdminSession = Depends(get_admin)):
    return {"user_id": admin.user_id, "username": admin.username}


def _client_ip(request: Request) -> str | None:
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[0].strip()
    real = request.headers.get("x-real-ip")
    if real:
        return real
    return request.client.host if request.client else None


def _audit_rule(request: Request, admin: brokereye.AdminSession, action: str, knowledge_id: int | None,
                old: dict[str, Any] | None, new: dict[str, Any] | None) -> None:
    """Rules changes are audited (old / new values + IP), like BrokerEye's own rules."""
    store.audit_rule_change(user_id=admin.user_id, username=admin.username, action=action, knowledge_id=knowledge_id,
                            old_values=old, new_values=new, ip=_client_ip(request),
                            user_agent=request.headers.get("user-agent"))


@app.get("/ai/admin/knowledge")
def admin_knowledge(status: str | None = None, admin: brokereye.AdminSession = Depends(get_admin)):
    return {"rules": store.list_knowledge(status)}


@app.post("/ai/admin/knowledge")
def admin_knowledge_create(k: KnowledgeIn, request: Request, admin: brokereye.AdminSession = Depends(get_admin)):
    if k.scope == "broker" and not k.broker_id:
        raise HTTPException(400, "broker_id required for scope=broker")
    kid = store.create_knowledge(scope=k.scope, broker_id=k.broker_id, kind=k.kind, title=k.title, content=k.content,
                                 status=k.status, source="admin", created_by=f"admin:{admin.username}")
    _audit_rule(request, admin, "AI_RULE_CREATED", kid, None, store.get_knowledge(kid))
    return {"id": kid}


@app.put("/ai/admin/knowledge/{knowledge_id}")
def admin_knowledge_update(knowledge_id: int, k: KnowledgePatch, request: Request,
                           admin: brokereye.AdminSession = Depends(get_admin)):
    before = store.get_knowledge(knowledge_id)
    if not store.update_knowledge(knowledge_id, k.model_dump(exclude_none=True)):
        raise HTTPException(404, "Rule not found or nothing to change")
    _audit_rule(request, admin, "AI_RULE_UPDATED", knowledge_id, before, store.get_knowledge(knowledge_id))
    return {"ok": True}


@app.delete("/ai/admin/knowledge/{knowledge_id}")
def admin_knowledge_delete(knowledge_id: int, request: Request, admin: brokereye.AdminSession = Depends(get_admin)):
    before = store.get_knowledge(knowledge_id)
    if not store.delete_knowledge(knowledge_id):
        raise HTTPException(404, "Rule not found")
    _audit_rule(request, admin, "AI_RULE_DELETED", knowledge_id, before, None)
    return {"ok": True}


@app.get("/ai/admin/feedback")
def admin_feedback(status: str | None = None, admin: brokereye.AdminSession = Depends(get_admin)):
    return {"feedback": store.list_feedback(status)}


@app.get("/ai/admin/metrics")
def admin_metrics(days: int = 7, admin: brokereye.AdminSession = Depends(get_admin)):
    """Tool health (calls, errors, latency), daily token use, feedback and
    feature counts for the admin page."""
    return store.metrics(days)


@app.get("/ai/admin/eval/candidates")
def admin_eval_candidates(limit: int = 200, admin: brokereye.AdminSession = Depends(get_admin)):
    """Real questions as eval case candidates (JSON Lines, ready for
    evals/cases.jsonl after a human adds the expectations)."""
    from fastapi.responses import PlainTextResponse

    lines = []
    for f in store.eval_candidates(limit):
        case = {
            "name": f"feedback-{f['id']}",
            "message": f["question"][:2000],
            "expect": {"no_error": True},
            "reference_answer": (f["answer"] or "")[:1500],
            "source": {"rating": f["rating"], "status": f["status"], "comment": f["comment"], "rule": f["rule_title"],
                       "created_at": f["created_at"].isoformat() if f.get("created_at") else None},
        }
        lines.append(json.dumps(case, ensure_ascii=False))
    return PlainTextResponse("\n".join(lines) + ("\n" if lines else ""), media_type="application/x-ndjson",
                             headers={"Content-Disposition": 'attachment; filename="eval_candidates.jsonl"'})


@app.post("/ai/admin/feedback/{feedback_id}/promote")
def admin_feedback_promote(feedback_id: int, request: Request, k: KnowledgeIn | None = None,
                           admin: brokereye.AdminSession = Depends(get_admin)):
    """Activate the drafted rule for this feedback (or create one from the
    supplied body) and mark the feedback as promoted."""
    rows = [r for r in store.list_feedback() if r["id"] == feedback_id]
    if not rows:
        raise HTTPException(404, "Feedback not found")
    row = rows[0]
    before = store.get_knowledge(row["knowledge_id"]) if row["knowledge_id"] else None
    if k is not None:
        if row["knowledge_id"]:
            store.update_knowledge(row["knowledge_id"], {**k.model_dump(), "status": "active"})
            kid = row["knowledge_id"]
        else:
            kid = store.create_knowledge(scope=k.scope, broker_id=k.broker_id, kind=k.kind, title=k.title,
                                         content=k.content, status="active", source="feedback",
                                         created_by=f"admin:{admin.username}", feedback_id=feedback_id)
    elif row["knowledge_id"]:
        store.update_knowledge(row["knowledge_id"], {"status": "active"})
        kid = row["knowledge_id"]
    else:
        raise HTTPException(400, "No drafted rule for this feedback; send the rule in the body")
    store.set_feedback_status(feedback_id, "promoted")
    _audit_rule(request, admin, "AI_RULE_PROMOTED", kid, before, {**(store.get_knowledge(kid) or {}), "feedback_id": feedback_id})
    return {"ok": True, "knowledge_id": kid}


@app.post("/ai/admin/feedback/{feedback_id}/dismiss")
def admin_feedback_dismiss(feedback_id: int, request: Request, admin: brokereye.AdminSession = Depends(get_admin)):
    rows = [r for r in store.list_feedback() if r["id"] == feedback_id]
    if not rows:
        raise HTTPException(404, "Feedback not found")
    if rows[0]["knowledge_id"] and rows[0]["proposed_status"] == "pending":
        before = store.get_knowledge(rows[0]["knowledge_id"])
        store.update_knowledge(rows[0]["knowledge_id"], {"status": "disabled"})
        _audit_rule(request, admin, "AI_RULE_DISMISSED", rows[0]["knowledge_id"], before,
                    {**(store.get_knowledge(rows[0]["knowledge_id"]) or {}), "feedback_id": feedback_id})
    store.set_feedback_status(feedback_id, "dismissed")
    return {"ok": True}


@app.get("/admin")
def admin_page():
    return FileResponse(_STATIC / "admin.html")


@app.get("/ai/turns/{turn_id}")
def turn_progress(turn_id: str, session: brokereye.Session = Depends(get_session)):
    import time as _time

    with _turns_guard:
        t = _turns.get(turn_id)
        if not t or t["broker_id"] != session.broker_id:
            raise HTTPException(404, "Unknown turn")
        return {"stage": t["stage"], "tools": t["tools"], "tokens": t["tokens"], "cached": t["cached"],
                "elapsed": int(_time.time() - t["started"]), "done": t["done"], "partial": t.get("partial", "")}


@app.get("/ai/me")
def me(session: brokereye.Session = Depends(get_session)):
    return {"broker_id": session.broker_id, "username": session.username, "display_name": session.display_name,
            "model": settings().ai_model, "client_link_template": settings().ai_client_link_template,
            "rights": list(session.rights),
            "telegram_linked": bool((store.broker_identity(session.broker_id) or {}).get("telegram_id"))}


# ---------------------------------------------------------------------------
# Actions proposed by the assistant: the broker confirms or cancels the card
# ---------------------------------------------------------------------------
_ACTION_PATHS = {"credit_in": "credit-in", "credit_out": "credit-out",
                 "temp_credit_in": "temp-credit-in", "temp_credit_out": "temp-credit-out"}


@app.get("/ai/actions/{action_id}")
def get_action(action_id: str, session: brokereye.Session = Depends(get_session)):
    a = store.get_action(session.broker_id, action_id)
    if not a:
        raise HTTPException(404, "Action not found")
    return a


class ConfirmRequest(BaseModel):
    # Password resets only; never stored. Its rules (8-64 characters, ...) are
    # checked by confirm_action, so every bad password gets the same 400.
    password: str | None = Field(default=None, max_length=4096)


_PASSWORD_RE = re.compile(r"^(?=.*[A-Za-z])(?=.*\d)\S{8,64}$")


def _stale_temp_card(session: brokereye.Session, p: dict[str, Any]) -> str:
    """Why a temporary-credit card can no longer be applied as the broker saw it ('' = it can): it was
    prepared before the expiry became BrokerEye's weekly revert point (it names its own weekday / time),
    or the revert point it shows has passed since, so the credit would last a week longer."""
    if "expire_weekday" in p or "expire_time" in p:
        return (f"This card was prepared before temporary credit moved to the weekly revert point (it shows "
                f"{p.get('expire_weekday')} {p.get('expire_time')}); ask again for a new card")
    shown = p.get("reverts_at_text")
    if not shown:
        return ""
    try:
        pos = brokereye.request_as(session, "GET", f"/api/broker/clients/{int(p['login'])}/credit")
    except Exception as e:  # noqa: BLE001 - refuse rather than apply unchecked
        return f"Could not check the weekly revert point: {str(e)[:200]}"
    now = ((pos or {}).get("temp_credit_revert") or {}).get("next_at_text")
    if now and now != shown:
        return (f"The revert point on this card ({shown}) has passed; the credit would now revert {now}. "
                "Ask again for a new card")
    return ""


_TELEGRAM_CHAT_RE = re.compile(r"^-?\d{1,20}$")


def _audit_headers(request: Request) -> dict[str, str]:
    """IP and User-Agent for BrokerEye's audit row of a confirmed action: the browser's, or, when the Telegram bot
    confirms (X-BrokerEye-Channel: telegram, X-Telegram-Chat-Id), the chat's, so the broker audit log shows the
    action under the Telegram channel like the bot's own operations."""
    ip = _client_ip(request) or "0.0.0.0"
    chat = request.headers.get("x-telegram-chat-id", "").strip()
    if request.headers.get("x-brokereye-channel", "").strip().lower() == "telegram" and _TELEGRAM_CHAT_RE.match(chat):
        return {"X-Forwarded-For": ip, "User-Agent": f"Telegram chat {chat} (confirmed in Ask AI)"}
    return {"X-Forwarded-For": ip, "User-Agent": "BrokerEye-AI (confirmed in Ask AI chat)"}


@app.post("/ai/actions/{action_id}/confirm")
def confirm_action(action_id: str, request: Request, body_in: ConfirmRequest | None = None,
                   session: brokereye.Session = Depends(get_session)):
    """Apply a proposed operation (credit, rule, account action). The call to
    BrokerEye uses the broker's own token, so rights, credit limits and the
    audit trail are BrokerEye's; the browser's IP is forwarded for the audit row."""
    pending = store.get_action(session.broker_id, action_id)
    if pending and pending["status"] == "pending" and pending["kind"].startswith("reset_"):
        pw = (body_in.password if body_in else None) or ""
        if not _PASSWORD_RE.match(pw):
            raise HTTPException(400, "The new password must be 8-64 characters with at least one letter and one digit, no spaces")
    claimed = store.claim_action(session.broker_id, action_id)
    if not claimed:
        a = store.get_action(session.broker_id, action_id)
        if not a:
            raise HTTPException(404, "Action not found")
        raise HTTPException(409, f"This action is already {a['status']}")
    p = claimed["payload"]
    headers = _audit_headers(request)
    kind = claimed["kind"]
    if kind in ("apply_rule", "remove_rule", "bulk_rules"):
        return _confirm_rules(action_id, session, kind, p, headers)
    if kind in tools.ACCOUNT_ACTIONS:
        return _confirm_account(action_id, session, kind, p, headers, (body_in.password if body_in else None) or "")
    body: dict[str, Any] = {"amount": p["amount"], "comment": p.get("comment") or ""}
    if kind.startswith("temp_"):
        # Temporary credit sends the same body: BrokerEye reverts it at its weekly revert point. A card whose
        # terms no longer hold is refused instead of applied with a different expiry.
        stale = _stale_temp_card(session, p)
        if stale:
            log.info("action %s refused: %s", action_id, stale)
            return store.finish_action(action_id, "failed", error=stale)
    try:
        data = brokereye.request_as(session, "POST", f"/api/broker/clients/{int(p['login'])}/{_ACTION_PATHS[kind]}",
                                    body=body, headers=headers)
    except brokereye.BrokerEyeError as e:
        log.warning("action %s failed: %s", action_id, e)
        return store.finish_action(action_id, "failed", error=str(e)[:500])
    except Exception as e:  # noqa: BLE001 - network etc.; the card must not stay 'executing'
        log.exception("action %s errored", action_id)
        return store.finish_action(action_id, "failed", error=f"{type(e).__name__}: {str(e)[:300]}")
    credit = data.get("credit") or {}
    tc = data.get("temp_credit") or {}
    result = {
        "deal_id": data.get("deal_id"),
        "credit": {k: credit.get(k) for k in ("used_credit", "reserved_credit", "available_credit") if k in credit},
        "account_credit": ((credit.get("account") or {}).get("credit")),
        "temp_credit": {k: tc.get(k) for k in ("id", "status", "expires_at_text") if k in tc} or None,
        "message": data.get("message"),
    }
    log.info("action %s executed for broker %s: %s", action_id, session.broker_id, claimed["summary"])
    return store.finish_action(action_id, "executed", result=result)


def _rule_call(session: brokereye.Session, act: str, login: int, rule_code: str, time_parameter: str, headers: dict[str, str]) -> dict[str, Any]:
    """Apply or remove one rule on one login through BrokerEye (right + access + audit are BrokerEye's)."""
    if act == "apply":
        body: dict[str, Any] = {"rule_code": rule_code}
        if time_parameter:
            body["time_parameter"] = time_parameter
        return brokereye.request_as(session, "POST", f"/api/broker/clients/{login}/rules", body=body, headers=headers) or {}
    return brokereye.request_as(session, "DELETE", f"/api/broker/clients/{login}/rules/{rule_code}", headers=headers) or {}


def _confirm_account(action_id: str, session: brokereye.Session, kind: str, p: dict[str, Any], headers: dict[str, str], password: str):
    spec = tools.ACCOUNT_ACTIONS[kind]
    body = {"password": password} if kind.startswith("reset_") else None
    try:
        data = brokereye.request_as(session, "POST", f"/api/broker/clients/{int(p['login'])}/{spec['path']}", body=body, headers=headers) or {}
    except brokereye.BrokerEyeError as e:
        log.warning("account action %s failed: %s", action_id, e)
        return store.finish_action(action_id, "failed", error=str(e)[:500])
    except Exception as e:  # noqa: BLE001
        log.exception("account action %s errored", action_id)
        return store.finish_action(action_id, "failed", error=f"{type(e).__name__}: {str(e)[:300]}")
    log.info("account action %s (%s) executed for broker %s on %s", action_id, kind, session.broker_id, p.get("login"))
    result = {"login": p.get("login"), "action": kind, "label": spec["label"], "message": data.get("message")}
    for k in ("account_enabled", "trading_enabled", "type"):
        if k in data:
            result[k] = data[k]
    return store.finish_action(action_id, "executed", result=result)   # the password itself is never stored


def _confirm_rules(action_id: str, session: brokereye.Session, kind: str, p: dict[str, Any], headers: dict[str, str]):
    if kind != "bulk_rules":
        act = "apply" if kind == "apply_rule" else "remove"
        try:
            data = _rule_call(session, act, int(p["login"]), p["rule_code"], p.get("time_parameter") or "", headers)
        except brokereye.BrokerEyeError as e:
            log.warning("rule action %s failed: %s", action_id, e)
            return store.finish_action(action_id, "failed", error=str(e)[:500])
        except Exception as e:  # noqa: BLE001
            log.exception("rule action %s errored", action_id)
            return store.finish_action(action_id, "failed", error=f"{type(e).__name__}: {str(e)[:300]}")
        log.info("rule action %s executed for broker %s: %s", action_id, session.broker_id, p.get("tag"))
        return store.finish_action(action_id, "executed", result={"client_rule_id": data.get("client_rule_id"), "rule_code": p["rule_code"],
                                                                   "tag": p.get("tag"), "login": p.get("login"), "message": data.get("message")})
    # Bulk: every row on its own; a failure on one does not stop the others.
    act = p.get("action") or "apply"
    items = []
    done = failed = skipped = 0
    for it in p.get("items") or []:
        row = {"login": it.get("login"), "name": it.get("name"), "status": it.get("status"), "note": it.get("note") or ""}
        if it.get("status") != "pending":
            skipped += 1
            items.append(row)
            continue
        try:
            _rule_call(session, act, int(it["login"]), p["rule_code"], p.get("time_parameter") or "", headers)
            row["status"] = "done"
            done += 1
        except brokereye.BrokerEyeError as e:
            row.update(status="failed", error=str(e)[:200])
            failed += 1
        except Exception as e:  # noqa: BLE001
            row.update(status="failed", error=f"{type(e).__name__}: {str(e)[:160]}")
            failed += 1
        items.append(row)
    result = {"items": items, "done": done, "failed": failed, "skipped": skipped, "tag": p.get("tag"), "action": act}
    log.info("bulk rule action %s for broker %s: %d done, %d failed, %d skipped", action_id, session.broker_id, done, failed, skipped)
    if done == 0 and failed:
        return store.finish_action(action_id, "failed", result=result, error=f"All {failed} accounts failed")
    return store.finish_action(action_id, "executed", result=result)


@app.post("/ai/actions/{action_id}/cancel")
def cancel_action(action_id: str, session: brokereye.Session = Depends(get_session)):
    a = store.cancel_action(session.broker_id, action_id)
    if not a:
        cur = store.get_action(session.broker_id, action_id)
        if not cur:
            raise HTTPException(404, "Action not found")
        raise HTTPException(409, f"This action is already {cur['status']}")
    return a


# ---------------------------------------------------------------------------
# Scheduled digests (the Digests dialog)
# ---------------------------------------------------------------------------
class DigestRequest(BaseModel):
    name: str | None = Field(default=None, max_length=80)
    prompt: str | None = Field(default=None, max_length=4000)
    run_time: str | None = Field(default=None, max_length=5)
    weekdays: list[int] | str | None = None
    deliver_telegram: bool | None = None
    enabled: bool | None = None


def _digest_payload(broker_id: int) -> dict[str, Any]:
    ident = store.broker_identity(broker_id) or {}
    return {"digests": [scheduler.digest_view(r) for r in store.list_digests(broker_id)],
            "max": scheduler.DIGESTS_MAX, "telegram_linked": bool(ident.get("telegram_id")),
            "telegram_configured": bool(settings().telegram_bot_token),
            "scheduler_ready": bool(settings().brokereye_jwt_secret) and settings().ai_scheduler,
            "timezone": settings().ai_timezone}


@app.get("/ai/digests")
def digests(session: brokereye.Session = Depends(get_session)):
    return _digest_payload(session.broker_id)


@app.post("/ai/digests")
def create_digest(req: DigestRequest, session: brokereye.Session = Depends(get_session)):
    if not (req.name and req.prompt and req.run_time and req.weekdays):
        raise HTTPException(400, "name, prompt, run_time and weekdays are required")
    if store.count_digests(session.broker_id) >= scheduler.DIGESTS_MAX:
        raise HTTPException(400, f"At most {scheduler.DIGESTS_MAX} digests")
    try:
        days = scheduler.parse_weekdays(req.weekdays)
        t = scheduler.parse_time(req.run_time)
        nxt = scheduler.next_run(t, days)
    except ValueError as e:
        raise HTTPException(400, str(e))
    store.create_digest(broker_id=session.broker_id, name=req.name.strip(), prompt=req.prompt.strip(), run_time=t, weekdays=days,
                        deliver_telegram=True if req.deliver_telegram is None else req.deliver_telegram,
                        created_by="web", next_run_at=nxt)
    return _digest_payload(session.broker_id)


@app.put("/ai/digests/{digest_id}")
def update_digest(digest_id: int, req: DigestRequest, session: brokereye.Session = Depends(get_session)):
    cur = store.get_digest(session.broker_id, digest_id)
    if not cur:
        raise HTTPException(404, "Digest not found")
    fields: dict[str, Any] = {}
    try:
        days = scheduler.parse_weekdays(req.weekdays) if req.weekdays else [int(x) for x in str(cur["weekdays"]).split(",") if x.strip().isdigit()]
        t = scheduler.parse_time(req.run_time) if req.run_time else cur["run_time"]
        if req.weekdays:
            fields["weekdays"] = days
        if req.run_time:
            fields["run_time"] = t
        if req.weekdays or req.run_time or (req.enabled and not cur["enabled"]):
            fields["next_run_at"] = scheduler.next_run(t, days)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if req.name:
        fields["name"] = req.name.strip()
    if req.prompt:
        fields["prompt"] = req.prompt.strip()
    if req.deliver_telegram is not None:
        fields["deliver_telegram"] = req.deliver_telegram
    if req.enabled is not None:
        fields["enabled"] = req.enabled
    store.update_digest(session.broker_id, digest_id, fields)
    return _digest_payload(session.broker_id)


@app.delete("/ai/digests/{digest_id}")
def delete_digest(digest_id: int, session: brokereye.Session = Depends(get_session)):
    if not store.delete_digest(session.broker_id, digest_id):
        raise HTTPException(404, "Digest not found")
    return _digest_payload(session.broker_id)


@app.post("/ai/digests/{digest_id}/run")
def run_digest_now(digest_id: int, session: brokereye.Session = Depends(get_session)):
    """Run a digest immediately (in the background) with the caller's own
    session; the result appears as a new conversation in the chat list."""
    d = store.get_digest(session.broker_id, digest_id)
    if not d:
        raise HTTPException(404, "Digest not found")
    cid = store.create_conversation(session.broker_id, "digest", settings().ai_model, f"digest:{digest_id}")
    store.set_title(cid, f"📰 {d['name']} · running…")

    def worker() -> None:
        r = scheduler.run_digest(d, conversation_id=cid, manual=True)
        store.finish_digest(digest_id, r["status"], r.get("error"), cid)

    threading.Thread(target=worker, name=f"ai-digest-{digest_id}", daemon=True).start()
    return {"ok": True, "conversation_id": cid}


# ---------------------------------------------------------------------------
# Alerts (the Alerts dialog + the bell)
# ---------------------------------------------------------------------------
class AlertRequest(BaseModel):
    name: str | None = Field(default=None, max_length=80)
    kind: str | None = Field(default=None, max_length=32)
    params: dict[str, Any] | None = None
    check_interval_minutes: int | None = Field(default=None, ge=1, le=1440)
    cooldown_minutes: int | None = Field(default=None, ge=1, le=7 * 24 * 60)
    deliver_telegram: bool | None = None
    enabled: bool | None = None


def _alerts_payload(broker_id: int) -> dict[str, Any]:
    ident = store.broker_identity(broker_id) or {}
    return {"alerts": [alerts.alert_view(r) for r in store.list_alerts(broker_id)], "max": alerts.ALERTS_MAX,
            "kinds": {k: {"label": v["label"], "params": v["params"], "help": v["help"]} for k, v in alerts.KINDS.items()},
            "telegram_linked": bool(ident.get("telegram_id")), "telegram_configured": bool(settings().telegram_bot_token),
            "scheduler_ready": bool(settings().brokereye_jwt_secret) and settings().ai_scheduler}


@app.get("/ai/alerts")
def list_alerts(session: brokereye.Session = Depends(get_session)):
    return _alerts_payload(session.broker_id)


@app.post("/ai/alerts")
def create_alert(req: AlertRequest, session: brokereye.Session = Depends(get_session)):
    if not (req.name and req.kind):
        raise HTTPException(400, "name and kind are required")
    if store.count_alerts(session.broker_id) >= alerts.ALERTS_MAX:
        raise HTTPException(400, f"At most {alerts.ALERTS_MAX} alerts")
    try:
        params = alerts.normalize_params(req.kind, req.params)
    except ValueError as e:
        raise HTTPException(400, str(e))
    store.create_alert(broker_id=session.broker_id, name=req.name.strip(), kind=req.kind, params=params,
                       check_interval_minutes=req.check_interval_minutes or 5, cooldown_minutes=req.cooldown_minutes or 240,
                       deliver_telegram=True if req.deliver_telegram is None else req.deliver_telegram, created_by="web")
    return _alerts_payload(session.broker_id)


@app.put("/ai/alerts/{alert_id}")
def update_alert(alert_id: int, req: AlertRequest, session: brokereye.Session = Depends(get_session)):
    cur = store.get_alert(session.broker_id, alert_id)
    if not cur:
        raise HTTPException(404, "Alert not found")
    fields: dict[str, Any] = {}
    kind = req.kind or cur["kind"]
    if req.kind or req.params is not None:
        try:
            fields["kind"] = kind
            fields["params"] = alerts.normalize_params(kind, {**(cur["params"] or {}), **(req.params or {})} if not req.kind else (req.params or {}))
        except ValueError as e:
            raise HTTPException(400, str(e))
    for k in ("name", "check_interval_minutes", "cooldown_minutes", "deliver_telegram", "enabled"):
        v = getattr(req, k)
        if v is not None:
            fields[k] = v.strip() if isinstance(v, str) else v
    store.update_alert(session.broker_id, alert_id, fields)
    return _alerts_payload(session.broker_id)


@app.delete("/ai/alerts/{alert_id}")
def delete_alert(alert_id: int, session: brokereye.Session = Depends(get_session)):
    if not store.delete_alert(session.broker_id, alert_id):
        raise HTTPException(404, "Alert not found")
    return _alerts_payload(session.broker_id)


@app.get("/ai/alerts/events")
def alert_events(limit: int = 30, after_id: int = 0, session: brokereye.Session = Depends(get_session)):
    """Latest alert hits (newest first) and how many are unseen — polled by the bell."""
    return {"events": store.list_alert_events(session.broker_id, limit=limit, after_id=after_id),
            "unseen": store.unseen_alert_count(session.broker_id)}


class SeenRequest(BaseModel):
    up_to_id: int | None = None


@app.post("/ai/alerts/events/seen")
def alert_events_seen(req: SeenRequest, session: brokereye.Session = Depends(get_session)):
    return {"ok": True, "marked": store.mark_alert_events_seen(session.broker_id, req.up_to_id),
            "unseen": store.unseen_alert_count(session.broker_id)}


class PreferenceRequest(BaseModel):
    note: str = Field(min_length=1, max_length=240)


@app.get("/ai/preferences")
def preferences(session: brokereye.Session = Depends(get_session)):
    """What the assistant remembers about this broker (the Memory dialog)."""
    return {"preferences": store.list_preferences(session.broker_id), "max": store.PREFERENCES_MAX}


@app.post("/ai/preferences")
def add_preference(req: PreferenceRequest, session: brokereye.Session = Depends(get_session)):
    try:
        saved = store.add_preference(session.broker_id, req.note, "web")
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"ok": True, **saved, "preferences": store.list_preferences(session.broker_id)}


@app.delete("/ai/preferences/{pref_id}")
def delete_preference(pref_id: int, session: brokereye.Session = Depends(get_session)):
    if not store.remove_preferences(session.broker_id, pref_id=pref_id):
        raise HTTPException(404, "Note not found")
    return {"ok": True, "preferences": store.list_preferences(session.broker_id)}


# ---------------------------------------------------------------------------
# Settlement bills: direct statement download (no model call)
# ---------------------------------------------------------------------------
@app.get("/ai/bills/{week_id}/{login}.{fmt}")
def bill_download(week_id: int, login: int, fmt: str, session: brokereye.Session = Depends(get_session)):
    from . import bills, exports
    fmt = fmt.lower()
    if fmt not in ("pdf", "xlsx", "csv"):
        raise HTTPException(400, "format must be pdf, xlsx or csv")
    try:
        wk_raw = brokereye.request_as(session, "GET", f"/api/broker/settlement-weeks/{int(week_id)}") or {}
        wk = {"id": int(wk_raw.get("id") or week_id), "name": wk_raw.get("name") or "", "start_date": str(wk_raw.get("start_date"))[:10],
              "end_date": str(wk_raw.get("end_date"))[:10], "label": bills.week_label(wk_raw)}
        data = brokereye.request_as(session, "POST", "/api/broker/bills", body={"week_id": wk["id"], "logins": [int(login)]}) or {}
    except brokereye.BrokerEyeError as e:
        raise HTTPException(502, str(e)[:300])
    rows = [bills.compact_bill(b, with_trades=False) for b in data.get("Bills") or []]
    if not rows:
        raise HTTPException(404, "No bill for this login in that week (not accessible, or no trades)")
    currency: dict[int, str] = {}
    try:
        cs = brokereye.request_as(session, "POST", "/api/broker/clients/search", body={"mt5Accounts": [int(login)], "limit": 1, "page": 1, "sortBy": "login", "sortOrder": "asc"}) or {}
        for c in cs.get("clients") or []:
            currency[int(c.get("login"))] = str(c.get("currency") or "")
            if not rows[0]["name"]:
                rows[0]["name"] = c.get("name") or ""
    except Exception:  # noqa: BLE001 - currency is cosmetic
        pass
    out = bills.bill_file(fmt, wk, rows, currency)
    from .charts import FILES_DIR
    return FileResponse(FILES_DIR / f"{out['file_id']}.{fmt}", media_type=exports.MEDIA_TYPES.get(fmt, "application/octet-stream"), filename=out["filename"])


# ---------------------------------------------------------------------------
# Client side panel: one call, everything the broker needs before acting
# ---------------------------------------------------------------------------
@app.get("/ai/clients/{login}/panel")
def client_panel(login: int, session: brokereye.Session = Depends(get_session)):
    from datetime import datetime, timedelta
    from zoneinfo import ZoneInfo
    from . import tools as _tools
    login = int(login)
    out: dict[str, Any] = {"login": login, "client": None, "credit": None, "rules": [], "temp_credits": [], "positions": [],
                           "last7": None, "status": None, "errors": [],
                           "rights": {r: session.has_right(r) for r in ("credit_in", "credit_out", "manage_rules", "mt5.trading_disable", "mt5.trading_enable",
                                                                         "mt5.account_disable", "mt5.account_enable", "mt5.trading_password_change",
                                                                         "mt5.investor_password_change", "mt5.account_status")}}

    def call(name: str, fn):
        try:
            return fn()
        except brokereye.BrokerEyeError as e:
            out["errors"].append(f"{name}: {str(e)[:160]}")
        except Exception as e:  # noqa: BLE001
            out["errors"].append(f"{name}: {type(e).__name__}")
        return None

    cs = call("client", lambda: brokereye.request_as(session, "POST", "/api/broker/clients/search",
                                                     body={"mt5Accounts": [login], "limit": 1, "page": 1, "sortBy": "login", "sortOrder": "asc"}))
    clients = (cs or {}).get("clients") or []
    if not clients:
        raise HTTPException(404, "This login is not one of your clients")
    c = clients[0]
    out["client"] = {k: c.get(k) for k in ("login", "name", "group", "accountType", "currency", "country", "liquidateType", "balance", "credit",
                                           "equity", "margin", "marginFree", "marginLevel", "profit", "floating", "pnl", "dailyPnL",
                                           "thisWeekPnL", "tradingEnabled", "leverage") if k in c}
    out["rules"] = [str(t) for t in (c.get("rules") or [])]
    if session.has_right("manage_rules"):
        # The back office's active rules (the panel's rule buttons) and the ones on this account, custom rules
        # included; the client row's tags only know the four standard rules.
        defs = call("rule_definitions", lambda: brokereye.request_as(session, "GET", "/api/broker/rules"))
        if defs is not None:
            out["rule_defs"] = [{"code": d["rule_code"], "name": d.get("rule_name") or d["rule_code"],
                                 "needs_minutes": bool(d.get("requires_time_parameter"))}
                                for d in (defs.get("rules") or []) if d.get("rule_code")]
        cr_rules = call("client_rules", lambda: brokereye.request_as(session, "GET", f"/api/broker/clients/{login}/rules"))
        if cr_rules is not None:
            out["active_rules"] = [{"code": r.get("rule_code"), "name": r.get("rule_name") or r.get("rule_code"),
                                    "time_parameter": r.get("time_parameter") or ""}
                                   for r in (cr_rules.get("rules") or []) if r.get("is_active") and r.get("rule_code")]
    if session.has_right("mt5.account_status"):
        st = call("status", lambda: brokereye.request_as(session, "GET", f"/api/broker/clients/{login}/account-status"))
        if st:
            out["status"] = {k: st.get(k) for k in ("account_enabled", "trading_enabled", "investor", "readonly", "expert_allowed", "api_enabled") if k in st}
    elif c.get("tradingEnabled") is not None:
        out["status"] = {"trading_enabled": bool(c.get("tradingEnabled"))}
    cr = call("credit", lambda: brokereye.request_as(session, "GET", f"/api/broker/clients/{login}/credit"))
    if cr:
        acc = cr.get("account") or {}
        out["credit"] = {"account_credit": acc.get("credit"), "reserved": acc.get("reserved_credit"), "headroom": acc.get("available_credit"),
                         "max_per_account": acc.get("max_credit_per_account"), "broker_available": cr.get("available_credit"),
                         "broker_limit": cr.get("credit_limit")}
    tc = call("temp_credits", lambda: brokereye.request_as(session, "GET", f"/api/broker/temp-credits?login={login}&status=pending&limit=10&page=1"))
    if tc:
        out["temp_credits"] = [{k: t.get(k) for k in ("id", "direction", "amount", "expires_at_text", "comment") if k in t} for t in tc.get("temp_credits") or []]
    ps = call("positions", lambda: brokereye.request_as(session, "POST", "/api/broker/positions/search",
                                                        body={"mt5Accounts": [login], "limit": 50, "page": 1, "sortBy": "profit", "sortOrder": "asc"}))
    if ps:
        out["positions"] = [{k: p.get(k) for k in ("symbol", "action", "volume", "profit", "priceOpen", "priceCurrent") if k in p} for p in ps.get("positions") or []]
        out["positions_total"] = ps.get("total", len(out["positions"]))
    tz = ZoneInfo(settings().ai_timezone)
    today = datetime.now(tz).date()
    lo, hi = _tools._range((today - timedelta(days=6)).isoformat(), today.isoformat())
    sm = call("last7", lambda: brokereye.request_as(session, "POST", "/api/broker/reports/summary",
                                                    body={"from": lo, "to": hi, "mt5Accounts": [login], "limit": 1, "page": 1, "sortBy": "login", "sortOrder": "asc"}))
    if sm:
        rows = sm.get("rows") or []
        r = rows[0] if rows else {}
        out["last7"] = {"from": (today - timedelta(days=6)).isoformat(), "to": today.isoformat(), "deposit": r.get("deposit", 0), "withdrawal": r.get("withdrawal", 0),
                        "profit": r.get("profit", 0), "volume": r.get("volume", 0), "commission": r.get("commission", 0)}
    return out


# ---------------------------------------------------------------------------
# Saved questions, pinned answers, status footer
# ---------------------------------------------------------------------------
class SavedRequest(BaseModel):
    title: str | None = Field(default=None, max_length=80)
    question: str = Field(max_length=4000)


class PinRequest(BaseModel):
    title: str | None = Field(default=None, max_length=80)
    question: str = Field(max_length=4000)
    text: str | None = Field(default=None, max_length=20000)


_PIN_NUM = re.compile(r"[₹$€£]?\s?[-−+]?\d[\d,]*(?:\.\d+)?\s?(?:Cr|L|lakh|crore|%|USD|INR|USC|lots?)?", re.I)


def _pin_view(row: dict[str, Any]) -> dict[str, Any]:
    text = (row.get("last_text") or "").strip()
    lines = [re.sub(r"[#*_`>|]+", " ", ln).strip() for ln in text.splitlines()]
    lines = [" ".join(ln.split()) for ln in lines if ln.strip()]
    first = lines[0] if lines else ""
    m = next((x.group(0).strip() for x in _PIN_NUM.finditer(first) if len(x.group(0).strip()) >= 2), None)
    if not m:
        for ln in lines[1:6]:
            x = next((y.group(0).strip() for y in _PIN_NUM.finditer(ln) if len(y.group(0).strip()) >= 2), None)
            if x:
                m = x
                break
    return {"id": row["id"], "title": row["title"], "question": row["question"], "figure": m or "", "caption": first[:160],
            "last_text": text[:4000], "last_run_at": row.get("last_run_at"), "last_error": row.get("last_error"), "created_at": row.get("created_at")}


def _run_hidden(session: brokereye.Session, question: str) -> tuple[str, str | None]:
    """One unattended model turn in a hidden (archived) conversation; (text, error)."""
    cid = store.create_conversation(session.broker_id, "pin", settings().ai_model, None)
    store.archive_conversation(session.broker_id, cid)
    lock = locks.broker_lock(session.broker_id)
    if not lock.acquire(timeout=5):
        raise HTTPException(409, "Another answer is in progress; try again in a moment")
    text, error = "", None
    try:
        prompt = (f"{question}\n\nThis is a pinned tile being refreshed automatically: nobody can answer a question, so never ask for "
                  "clarification; choose sensible defaults, lead with the single figure or short table that matters, keep it under 8 lines, no chart.")
        for ev in agent.run_turn(session, cid, prompt, "web", interactive=False):
            t = ev.get("type")
            if t == "done":
                text = ev.get("text") or ""
            elif t == "error":
                error = ev.get("message")
    finally:
        lock.release()
    return text, error


@app.get("/ai/saved")
def saved_questions(session: brokereye.Session = Depends(get_session)):
    return {"saved": store.list_saved(session.broker_id), "max": store.SAVED_MAX}


@app.post("/ai/saved")
def add_saved_question(req: SavedRequest, session: brokereye.Session = Depends(get_session)):
    try:
        row = store.add_saved(session.broker_id, req.title or "", req.question)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"ok": True, "item": row, "saved": store.list_saved(session.broker_id)}


@app.delete("/ai/saved/{saved_id}")
def delete_saved_question(saved_id: int, session: brokereye.Session = Depends(get_session)):
    if not store.remove_saved(session.broker_id, saved_id):
        raise HTTPException(404, "Saved question not found")
    return {"ok": True, "saved": store.list_saved(session.broker_id)}


@app.get("/ai/pins")
def pins(session: brokereye.Session = Depends(get_session)):
    return {"pins": [_pin_view(r) for r in store.list_pins(session.broker_id)], "max": store.PINS_MAX}


@app.post("/ai/pins")
def add_pin(req: PinRequest, session: brokereye.Session = Depends(get_session)):
    try:
        row = store.add_pin(session.broker_id, req.title or "", req.question, req.text)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"ok": True, "item": _pin_view(row), "pins": [_pin_view(r) for r in store.list_pins(session.broker_id)]}


@app.delete("/ai/pins/{pin_id}")
def delete_pin(pin_id: int, session: brokereye.Session = Depends(get_session)):
    if not store.remove_pin(session.broker_id, pin_id):
        raise HTTPException(404, "Pin not found")
    return {"ok": True, "pins": [_pin_view(r) for r in store.list_pins(session.broker_id)]}


@app.post("/ai/pins/{pin_id}/refresh")
def refresh_pin(pin_id: int, session: brokereye.Session = Depends(get_session)):
    pin = store.get_pin(session.broker_id, pin_id)
    if not pin:
        raise HTTPException(404, "Pin not found")
    text, error = _run_hidden(session, pin["question"])
    row = store.set_pin_result(pin_id, text or None, (error or None) if not text else None)
    return {"ok": bool(text), "item": _pin_view(row or pin)}


@app.get("/ai/status")
def status_footer(session: brokereye.Session = Depends(get_session)):
    """The status footer: Broker Eye reachability, the scheduler, alerts, the number format in use."""
    cfg = settings()
    ok = True
    try:
        brokereye.request_as(session, "GET", "/api/auth/broker/me")
    except Exception:  # noqa: BLE001
        ok = False
    digests = [scheduler.digest_view(d) for d in store.list_digests(session.broker_id)]
    nxt = sorted((d for d in digests if d.get("enabled") and d.get("next_run_at")), key=lambda d: str(d["next_run_at"]))
    alerts_on = sum(1 for a in store.list_alerts(session.broker_id) if a.get("enabled"))
    notes = " ".join((p.get("note") or "").lower() for p in store.list_preferences(session.broker_id))
    indian = any(k in notes for k in ("lakh", "crore", "indian"))
    return {"brokereye_ok": ok, "model": cfg.ai_model, "timezone": cfg.ai_timezone,
            "scheduler_ready": bool(cfg.brokereye_jwt_secret) and cfg.ai_scheduler,
            "next_digest": {"name": nxt[0]["name"], "when": nxt[0].get("next_run_text")} if nxt else None,
            "digests_enabled": sum(1 for d in digests if d.get("enabled")), "alerts_enabled": alerts_on,
            "number_format": "lakh / crore" if indian else None}


@app.get("/ai/conversations")
def conversations(session: brokereye.Session = Depends(get_session)):
    return {"conversations": store.list_conversations(session.broker_id), "usage_today": store.usage_today(session.broker_id)}


@app.get("/ai/conversations/{conversation_id}/messages")
def messages(conversation_id: str, session: brokereye.Session = Depends(get_session)):
    conv = store.get_conversation(session.broker_id, conversation_id)
    if not conv:
        raise HTTPException(404, "Conversation not found")
    return {"conversation": conv, "messages": store.load_transcript(conversation_id)}


@app.delete("/ai/conversations/{conversation_id}")
def delete_conversation(conversation_id: str, session: brokereye.Session = Depends(get_session)):
    if not store.archive_conversation(session.broker_id, conversation_id):
        raise HTTPException(404, "Conversation not found")
    return {"ok": True}


@app.get("/health")
def health():
    return {"ok": True, "model": settings().ai_model}


@app.get("/")
def index():
    return FileResponse(_STATIC / "index.html")


def run() -> None:
    import uvicorn

    cfg = settings()
    uvicorn.run("brokereye_ai.main:app", host=cfg.ai_host, port=cfg.ai_port, reload=False)


if __name__ == "__main__":
    run()
