"""Delivering unattended answers (digests, alerts) to a broker's Telegram.

Uses the same bot as BrokerEye's TelegramBotPlugin (its token is read from
config.json, or TELEGRAM_BOT_TOKEN) and the same HTML formatting the bot
uses for /askai answers, so a digest looks like any other bot message.
Best-effort: failures are logged and reported to the caller, never raised.
"""
from __future__ import annotations

import logging
import time
from pathlib import Path

try:  # anthropic 1.x ships httpx2; fall back to httpx on older installs
    import httpx2 as httpx
except ImportError:  # pragma: no cover
    import httpx  # type: ignore

from .config import settings
from .telegram_format import RICH_LIMIT, escape_rich_markdown, markdown_to_telegram_html, split_for_telegram

log = logging.getLogger("brokereye_ai.delivery")


def telegram_configured() -> bool:
    return bool(settings().telegram_bot_token)


def _api(method: str) -> str:
    cfg = settings()
    return f"{cfg.telegram_api_base.rstrip('/')}/bot{cfg.telegram_bot_token}/{method}"


# Telegram allows about one message per second in a chat
# (core.telegram.org/bots/faq); the bot's live messages may already use it.
_CHAT_GAP_SECONDS = 1.1
_MAX_RETRY_AFTER = 30


def _retry_after(r: "httpx.Response") -> int:
    """Seconds Telegram asks to wait (HTTP 429), 0 for any other reply."""
    if r.status_code != 429:
        return 0
    try:
        return max(1, int((r.json().get("parameters") or {}).get("retry_after") or 1))
    except (ValueError, AttributeError):
        return 1


def _post(c: "httpx.Client", method: str, **kw) -> "httpx.Response":
    """A Bot API call that waits out Telegram's flood limit once (429 retry_after)."""
    r = c.post(_api(method), **kw)
    wait = _retry_after(r)
    if wait and wait <= _MAX_RETRY_AFTER:
        log.info("Telegram %s hit the flood limit; retrying in %s s", method, wait)
        time.sleep(wait)
        for f in (kw.get("files") or {}).values():   # rewind uploads for the second attempt
            fh = f[1] if isinstance(f, tuple) else f
            if hasattr(fh, "seek"):
                fh.seek(0)
        r = c.post(_api(method), **kw)
    return r


def send_telegram(chat_id: int, markdown: str, photos: list[Path] | None = None, header: str = "") -> str | None:
    """Send an answer as one rich message (Bot API 10.1+: the Markdown's
    tables and headings as they are, up to 32768 characters), or, when
    Telegram refuses it, as one or more HTML messages; then optional chart
    photos, about a second apart. Returns None on success, else a short
    error string."""
    if not telegram_configured():
        return "Telegram bot token not configured on the AI service"
    html = markdown_to_telegram_html(markdown or "")
    if header:
        html = f"<b>{header}</b>\n\n" + html
    chunks = split_for_telegram(html) or [html[:4000]]
    rich_md = (markdown or "").strip()
    if header and rich_md:
        rich_md = f"### {header}\n\n" + rich_md
    rich_md = escape_rich_markdown(rich_md)
    try:
        with httpx.Client(timeout=30.0) as c:
            if rich_md and len(rich_md) <= RICH_LIMIT:
                r = _post(c, "sendRichMessage", json={"chat_id": chat_id, "rich_message": {
                    "markdown": rich_md, "skip_entity_detection": True}})
                if r.status_code == 429:
                    return f"Telegram flood limit (HTTP 429): {r.text[:200]}"
                if r.status_code < 400:
                    chunks = []  # sent whole; only the photos follow
                else:
                    log.warning("sendRichMessage refused (%s %s); sending HTML", r.status_code, r.text[:200])
                    time.sleep(_CHAT_GAP_SECONDS)
            first = True
            for chunk in chunks:
                if not first:
                    time.sleep(_CHAT_GAP_SECONDS)
                first = False
                r = _post(c, "sendMessage", json={"chat_id": chat_id, "text": chunk, "parse_mode": "HTML",
                                                  "disable_web_page_preview": True})
                if r.status_code == 429:
                    return f"Telegram flood limit (HTTP 429): {r.text[:200]}"
                if r.status_code >= 400:
                    # HTML the formatter could not make Telegram-safe: retry as plain text.
                    r2 = _post(c, "sendMessage", json={"chat_id": chat_id, "text": _strip_tags(chunk)})
                    if r2.status_code >= 400:
                        return f"Telegram sendMessage HTTP {r2.status_code}: {r2.text[:200]}"
            for p in photos or []:
                time.sleep(_CHAT_GAP_SECONDS)
                try:
                    with open(p, "rb") as fh:
                        r = _post(c, "sendPhoto", data={"chat_id": str(chat_id)}, files={"photo": (p.name, fh, "image/png")})
                    if r.status_code >= 400:
                        log.warning("sendPhoto failed: %s %s", r.status_code, r.text[:200])
                except OSError as e:
                    log.warning("chart file missing: %s", e)
    except httpx.HTTPError as e:
        return f"Telegram unreachable: {e}"
    return None


def _strip_tags(html: str) -> str:
    import re
    text = re.sub(r"<[^>]+>", "", html)
    return text.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
