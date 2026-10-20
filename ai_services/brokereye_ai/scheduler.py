"""Unattended runs: scheduled digests (and, later, alerts).

One worker thread, started from the FastAPI startup hook, wakes every
30 seconds, claims the digests whose next_run_at has passed (moving each to
its following run first, so a failure cannot loop), runs every one as a
fresh conversation of channel 'digest' with a minted broker session, and
delivers the answer to the broker's Telegram when linked.

Schedules are expressed in the AI service timezone (AI_TIMEZONE):
run_time "HH:MM" plus a set of weekdays, 0 = Sunday ... 6 = Saturday.
"""
from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from . import agent, alerts, delivery, locks, service_auth, store
from .config import settings

log = logging.getLogger("brokereye_ai.scheduler")

TICK_SECONDS = 30
DIGESTS_MAX = 5
WEEKDAY_NAMES = ("sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday")
_ALIASES = {
    "daily": [0, 1, 2, 3, 4, 5, 6], "everyday": [0, 1, 2, 3, 4, 5, 6], "every day": [0, 1, 2, 3, 4, 5, 6],
    "all": [0, 1, 2, 3, 4, 5, 6], "weekdays": [1, 2, 3, 4, 5], "mon-fri": [1, 2, 3, 4, 5],
    "mon-sat": [1, 2, 3, 4, 5, 6], "weekend": [0, 6], "weekends": [0, 6],
}


def _tz() -> ZoneInfo:
    return ZoneInfo(settings().ai_timezone)


def parse_weekdays(spec: Any) -> list[int]:
    """'mon-fri' | 'daily' | 'mon,wed,fri' | 'monday' | [1,3,5] | '1,2,3' -> sorted weekday indexes."""
    if isinstance(spec, (list, tuple)):
        out: set[int] = set()
        for x in spec:
            out.update(parse_weekdays(str(x)))
        return sorted(out)
    s = str(spec or "").strip().lower()
    if not s:
        raise ValueError("weekdays are required (e.g. mon-fri, daily, mon,wed,fri)")
    if s in _ALIASES:
        return list(_ALIASES[s])
    out = set()
    for part in s.replace(";", ",").split(","):
        part = part.strip()
        if not part:
            continue
        if part in _ALIASES:
            out.update(_ALIASES[part])
            continue
        if "-" in part and not part.lstrip("-").isdigit():
            a, b = (p.strip() for p in part.split("-", 1))
            ia, ib = _weekday_index(a), _weekday_index(b)
            i = ia
            while True:
                out.add(i)
                if i == ib:
                    break
                i = (i + 1) % 7
            continue
        out.add(_weekday_index(part))
    if not out:
        raise ValueError("weekdays are required (e.g. mon-fri, daily, mon,wed,fri)")
    return sorted(out)


def _weekday_index(token: str) -> int:
    t = token.strip().lower()
    if t.isdigit():
        n = int(t)
        if n == 7:
            n = 0
        if 0 <= n <= 6:
            return n
        raise ValueError(f"weekday '{token}' must be 0-6 (0 = Sunday)")
    if len(t) >= 3:
        for i, name in enumerate(WEEKDAY_NAMES):
            if name.startswith(t):
                return i
    raise ValueError(f"'{token}' is not a weekday")


def weekdays_label(days: list[int]) -> str:
    d = sorted(set(days))
    if d == [0, 1, 2, 3, 4, 5, 6]:
        return "daily"
    if d == [1, 2, 3, 4, 5]:
        return "weekdays (Mon-Fri)"
    if d == [1, 2, 3, 4, 5, 6]:
        return "Mon-Sat"
    return ", ".join(WEEKDAY_NAMES[i][:3].capitalize() for i in d)


def parse_time(value: str) -> str:
    parts = str(value or "").strip().split(":")
    if len(parts) != 2 or not all(p.isdigit() for p in parts):
        raise ValueError("run_time must be HH:MM (24-hour clock)")
    h, m = int(parts[0]), int(parts[1])
    if not (0 <= h <= 23 and 0 <= m <= 59):
        raise ValueError("run_time must be HH:MM (24-hour clock)")
    return f"{h:02d}:{m:02d}"


def next_run(run_time: str, weekdays: list[int], after: datetime | None = None) -> datetime:
    """First instant strictly after `after` (default now) that falls on one of
    the weekdays at run_time, in the service timezone."""
    tz = _tz()
    now = (after or datetime.now(tz)).astimezone(tz)
    h, m = (int(x) for x in parse_time(run_time).split(":"))
    days = set(parse_weekdays(weekdays)) if not isinstance(weekdays, list) else set(weekdays)
    for ahead in range(0, 8):
        day = (now + timedelta(days=ahead)).date()
        py_wd = (day.weekday() + 1) % 7  # Monday=0 in Python -> Sunday=0 here
        if py_wd not in days:
            continue
        candidate = datetime(day.year, day.month, day.day, h, m, tzinfo=tz)
        if candidate > now:
            return candidate
    raise ValueError("no weekday selected")


def digest_view(row: dict[str, Any]) -> dict[str, Any]:
    days = [int(x) for x in str(row["weekdays"]).split(",") if x.strip().isdigit()]
    nxt = row.get("next_run_at")
    tz = _tz()
    return {
        "id": row["id"], "name": row["name"], "prompt": row["prompt"], "run_time": row["run_time"],
        "weekdays": days, "schedule": f"{weekdays_label(days)} at {row['run_time']} ({settings().ai_timezone})",
        "deliver_telegram": bool(row["deliver_telegram"]), "enabled": bool(row["enabled"]),
        "created_by": row.get("created_by"),
        "next_run_at": nxt, "next_run_text": nxt.astimezone(tz).strftime("%a %d %b %H:%M") if nxt else None,
        "last_run_at": row.get("last_run_at"), "last_status": row.get("last_status"), "last_error": row.get("last_error"),
        "last_conversation_id": str(row["last_conversation_id"]) if row.get("last_conversation_id") else None,
        "created_at": row.get("created_at"),
    }


# ---------------------------------------------------------------------------
# running one digest
# ---------------------------------------------------------------------------
def run_digest(d: dict[str, Any], *, conversation_id: str | None = None, manual: bool = False) -> dict[str, Any]:
    """Run a digest now. Returns {"status", "conversation_id", "error"}.
    Blocks while the broker has another turn running (up to 2 minutes)."""
    cfg = settings()
    broker_id = int(d["broker_id"])
    result: dict[str, Any] = {"status": "error", "conversation_id": conversation_id, "error": None}
    try:
        session = service_auth.mint_broker_session(broker_id)
        ident = store.broker_identity(broker_id) or {}
        chat_id = ident.get("telegram_id")
        to_telegram = bool(d.get("deliver_telegram")) and bool(chat_id) and delivery.telegram_configured()
        tz = _tz()
        now = datetime.now(tz)
        if not conversation_id:
            conversation_id = store.create_conversation(broker_id, "digest", cfg.ai_model, f"digest:{d['id']}")
            result["conversation_id"] = conversation_id
        store.set_title(conversation_id, f"📰 {d['name']} · {now:%d %b %H:%M}")
        prompt = (
            f"Scheduled digest \"{d['name']}\" ({weekdays_label(digest_view(d)['weekdays'])} at {d['run_time']}). "
            f"Produce it now.\n\nWhat the broker asked for: {d['prompt']}\n\n"
            "This is an automated run: nobody can answer a question, so never ask for clarification. Choose "
            "sensible defaults (yesterday / today / this week as the wording implies), state the period you used, "
            "lead with what matters, keep it compact, and draw a chart only when it clearly helps."
        )
        lock = locks.broker_lock(broker_id)
        if not lock.acquire(timeout=120):
            result.update(status="skipped", error="The broker had another answer in progress")
            return result
        text, error, charts = "", None, []
        try:
            for ev in agent.run_turn(session, conversation_id, prompt, "telegram" if to_telegram else "web",
                                     interactive=False):
                t = ev.get("type")
                if t == "done":
                    text = ev.get("text") or ""
                elif t == "error":
                    error = ev.get("message")
                elif t == "chart":
                    from .charts import FILES_DIR
                    charts.append(FILES_DIR / f"{ev['id']}.png")
        finally:
            lock.release()
        if error and not text:
            result.update(status="error", error=error)
            return result
        if to_telegram:
            # The broker's Telegram as it is now: the link may have moved or gone while the digest ran.
            chat_id = (store.broker_identity(broker_id) or {}).get("telegram_id")
        if to_telegram and chat_id:
            err = delivery.send_telegram(int(chat_id), text, [p for p in charts if Path(p).exists()],
                                         header=f"📰 {d['name']} · {now:%d %b}")
            if err:
                result.update(status="error", error=f"Answer saved in the web chat; Telegram delivery failed: {err}")
                return result
        result.update(status="ok", error=error)
        return result
    except Exception as e:  # noqa: BLE001 - a digest must never kill the worker
        log.exception("digest %s failed", d.get("id"))
        result.update(status="error", error=f"{type(e).__name__}: {str(e)[:300]}")
        return result


# ---------------------------------------------------------------------------
# worker
# ---------------------------------------------------------------------------
_thread: threading.Thread | None = None
_stop = threading.Event()


def _tick() -> None:
    try:
        alerts.tick()
    except Exception:  # noqa: BLE001
        log.exception("alert checks failed")
    due = store.due_digests()
    for d in due:
        try:
            nxt = next_run(d["run_time"], [int(x) for x in str(d["weekdays"]).split(",") if x.strip().isdigit()])
            store.set_digest_next_run(d["id"], nxt)
        except Exception as e:  # noqa: BLE001
            log.warning("digest %s has an invalid schedule (%s); disabling", d["id"], e)
            store.finish_digest(d["id"], "error", f"Invalid schedule: {e}", None, disable=True)
            continue
        log.info("running digest %s (%s) for broker %s", d["id"], d["name"], d["broker_id"])
        r = run_digest(d)
        store.finish_digest(d["id"], r["status"], r.get("error"), r.get("conversation_id"))


def _loop() -> None:
    log.info("scheduler started: digests and alerts every %ss, tz %s", TICK_SECONDS, settings().ai_timezone)
    while not _stop.is_set():
        try:
            _tick()
        except Exception:  # noqa: BLE001
            log.exception("scheduler tick failed")
        _stop.wait(TICK_SECONDS)


def start() -> None:
    global _thread
    if _thread and _thread.is_alive():
        return
    _stop.clear()
    _thread = threading.Thread(target=_loop, name="ai-scheduler", daemon=True)
    _thread.start()


def stop() -> None:
    _stop.set()
