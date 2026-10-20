"""Watchlists / alerts: standing conditions checked straight against the
broker API (no model call), on the scheduler thread.

Every check runs with a minted broker session, so it sees exactly what the
broker may see. A hit is one event per matched key (a login, a deal, or
'broker' for broker-wide figures); the same key is not reported again until
the alert's cooldown has passed. Events are kept for the bell in the web
chat and sent to Telegram when the broker has linked it.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta
from typing import Any, Callable
from zoneinfo import ZoneInfo

from . import brokereye, delivery, service_auth, store
from .config import settings

log = logging.getLogger("brokereye_ai.alerts")

ALERTS_MAX = 10
CHECK_MIN_MINUTES = 1
CHECK_MAX_MINUTES = 24 * 60

KINDS: dict[str, dict[str, Any]] = {
    "margin_level_below": {
        "label": "Margin level below %",
        "params": ["threshold", "liquidate_type", "logins"],
        "help": "Fires per account whose margin level is below the threshold (default: the system margin-call level).",
    },
    "equity_below": {"label": "Equity below", "params": ["threshold", "logins"],
                     "help": "Fires per account whose equity is below the amount."},
    "balance_below": {"label": "Balance below", "params": ["threshold", "logins"],
                      "help": "Fires per account whose balance is below the amount."},
    "floating_loss_above": {"label": "Floating loss above", "params": ["threshold", "logins"],
                            "help": "Fires per account whose open loss (floating) is worse than -amount."},
    "deposit_above": {"label": "Deposit above", "params": ["threshold", "logins"],
                      "help": "Fires per deposit deal of at least the amount since the last check."},
    "withdrawal_above": {"label": "Withdrawal above", "params": ["threshold", "logins"],
                         "help": "Fires per withdrawal deal of at least the amount since the last check."},
    "credit_available_below": {"label": "Available credit below", "params": ["threshold"],
                               "help": "Fires when the broker's available credit (credit_limit minus used and reserved) is below the amount."},
    "temp_credit_expiring": {"label": "Temporary credit expiring", "params": ["hours", "logins"],
                             "help": "Fires per pending temporary credit that reverses within the next N hours (default 24)."},
}


def _tz() -> ZoneInfo:
    return ZoneInfo(settings().ai_timezone)


def _num(v: Any, default: float = 0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _money(v: Any, cur: str = "") -> str:
    try:
        return f"{float(v):,.2f}{(' ' + cur) if cur else ''}"
    except (TypeError, ValueError):
        return str(v)


def normalize_params(kind: str, params: dict[str, Any] | None) -> dict[str, Any]:
    """Validate / coerce the parameters of a kind. Raises ValueError."""
    if kind not in KINDS:
        raise ValueError(f"kind must be one of {', '.join(KINDS)}")
    p = dict(params or {})
    out: dict[str, Any] = {}
    allowed = KINDS[kind]["params"]
    if "threshold" in allowed:
        thr = p.get("threshold")
        if kind == "margin_level_below":
            out["threshold"] = _num(thr, 0.0)  # 0 = system margin-call level
            if out["threshold"] < 0:
                raise ValueError("threshold must be >= 0")
        else:
            if thr is None or thr == "":
                raise ValueError("threshold (amount) is required")
            out["threshold"] = _num(thr)
            if out["threshold"] <= 0:
                raise ValueError("threshold must be a positive amount")
    if "hours" in allowed:
        out["hours"] = max(1, min(24 * 14, int(_num(p.get("hours"), 24))))
    if "logins" in allowed:
        logins = p.get("logins") or []
        if isinstance(logins, str):
            logins = [x for x in logins.replace(";", ",").split(",") if x.strip()]
        out["logins"] = sorted({int(str(x).strip()) for x in logins if str(x).strip().isdigit()})
    if "liquidate_type" in allowed and p.get("liquidate_type"):
        out["liquidate_type"] = str(p["liquidate_type"])
    return out


def describe(kind: str, params: dict[str, Any]) -> str:
    k = KINDS.get(kind, {})
    thr = params.get("threshold")
    who = f" for {len(params['logins'])} selected login(s)" if params.get("logins") else ""
    if kind == "margin_level_below":
        return (f"margin level below {thr:g}%" if thr else "margin level below the margin-call level") + who
    if kind == "temp_credit_expiring":
        return f"temporary credit reversing within {params.get('hours', 24)} h{who}"
    if kind == "credit_available_below":
        return f"available credit below {_money(thr)}"
    return f"{k.get('label', kind).lower()} {_money(thr)}{who}"


def alert_view(row: dict[str, Any]) -> dict[str, Any]:
    tz = _tz()
    nxt = row.get("next_check_at")
    return {
        "id": row["id"], "name": row["name"], "kind": row["kind"], "kind_label": KINDS.get(row["kind"], {}).get("label", row["kind"]),
        "params": row["params"], "description": describe(row["kind"], row["params"] or {}),
        "check_interval_minutes": row["check_interval_minutes"], "cooldown_minutes": row["cooldown_minutes"],
        "deliver_telegram": bool(row["deliver_telegram"]), "enabled": bool(row["enabled"]), "created_by": row.get("created_by"),
        "next_check_text": nxt.astimezone(tz).strftime("%d %b %H:%M") if nxt else None,
        "last_checked_at": row.get("last_checked_at"), "last_fired_at": row.get("last_fired_at"), "last_error": row.get("last_error"),
        "created_at": row.get("created_at"),
    }


# ---------------------------------------------------------------------------
# checks: each returns a list of hits {key, title, body, data}
# ---------------------------------------------------------------------------
Hit = dict[str, Any]


def _logins_ok(p: dict[str, Any], login: Any) -> bool:
    sel = p.get("logins") or []
    return not sel or int(_num(login, -1)) in sel


def _check_margin(p: dict[str, Any], _since: datetime) -> list[Hit]:
    params: dict[str, Any] = {"sortBy": "marginLevel", "sortOrder": "asc"}
    if p.get("threshold"):
        params["level"] = p["threshold"]
    if p.get("liquidate_type"):
        params["liquidateType"] = p["liquidate_type"]
    data = brokereye.get("/api/broker/clients/margin-call", params)
    thr = data.get("marginThreshold")
    hits: list[Hit] = []
    for a in data.get("accounts") or []:
        if not _logins_ok(p, a.get("login")):
            continue
        login = a.get("login")
        hits.append({
            "key": str(login),
            "title": f"Margin call risk: {login} {a.get('name') or ''}".strip(),
            "body": (f"Margin level {_num(a.get('marginLevel')):.1f}% (threshold {thr}%). Equity {_money(a.get('equity'), a.get('currency') or '')}, "
                     f"margin {_money(a.get('margin'))}, floating {_money(a.get('profit'))}."),
            "data": {k: a.get(k) for k in ("login", "name", "marginLevel", "equity", "margin", "profit", "liquidateType", "currency")},
        })
    return hits


def _check_clients(field: str, op: str, p: dict[str, Any], label: Callable[[dict[str, Any]], str]) -> list[Hit]:
    body: dict[str, Any] = {"page": 1, "limit": 200, "sortBy": field, "sortOrder": "asc",
                            "filters": [{"field": field, "operator": op, "value": p["threshold"] if op != "less_than" or field != "floating" else -p["threshold"]}]}
    if p.get("logins"):
        body["mt5Accounts"] = p["logins"]
    data = brokereye.post("/api/broker/clients/search", body)
    hits: list[Hit] = []
    for c in data.get("clients") or []:
        hits.append({"key": str(c.get("login")), "title": label(c),
                     "body": (f"Balance {_money(c.get('balance'), c.get('currency') or '')}, equity {_money(c.get('equity'))}, "
                              f"credit {_money(c.get('credit'))}, floating {_money(c.get('floating'))}, margin level {_num(c.get('marginLevel')):.1f}%."),
                     "data": {k: c.get(k) for k in ("login", "name", "balance", "equity", "credit", "floating", "marginLevel", "currency")}})
    return hits


def _check_equity(p: dict[str, Any], _since: datetime) -> list[Hit]:
    return _check_clients("equity", "less_than", p, lambda c: f"Equity below {_money(p['threshold'])}: {c.get('login')} {c.get('name') or ''}".strip())


def _check_balance(p: dict[str, Any], _since: datetime) -> list[Hit]:
    return _check_clients("balance", "less_than", p, lambda c: f"Balance below {_money(p['threshold'])}: {c.get('login')} {c.get('name') or ''}".strip())


def _check_floating(p: dict[str, Any], _since: datetime) -> list[Hit]:
    return _check_clients("floating", "less_than", p, lambda c: f"Open loss beyond {_money(p['threshold'])}: {c.get('login')} {c.get('name') or ''}".strip())


def _check_flow(kind: str, p: dict[str, Any], since: datetime) -> list[Hit]:
    now = datetime.now(_tz())
    body: dict[str, Any] = {"page": 1, "limit": 200, "sortBy": "time", "sortOrder": "desc",
                            "from": int(since.timestamp()), "to": int(now.timestamp()),
                            "type": "deposit" if kind == "deposit_above" else "withdrawal"}
    if p.get("logins"):
        body["mt5Accounts"] = p["logins"]
    data = brokereye.post("/api/broker/reports/deposit-withdrawal", body)
    hits: list[Hit] = []
    for r in data.get("rows") or []:
        amt = abs(_num(r.get("amount")))
        if amt < p["threshold"]:
            continue
        word = "Deposit" if kind == "deposit_above" else "Withdrawal"
        when = r.get("time")
        try:
            when_text = datetime.fromtimestamp(int(when), _tz()).strftime("%d %b %H:%M") if when else ""
        except (TypeError, ValueError, OSError):
            when_text = str(when)
        hits.append({"key": f"deal:{r.get('deal')}" if r.get("deal") else f"{r.get('login')}:{when}",
                     "title": f"{word} {_money(amt, r.get('currency') or '')}: {r.get('login')} {r.get('name') or ''}".strip(),
                     "body": f"{when_text}. {r.get('comment') or ''}".strip(),
                     "data": {k: r.get(k) for k in ("login", "name", "amount", "currency", "time", "deal", "comment")}})
    return hits


def _check_credit(p: dict[str, Any], _since: datetime) -> list[Hit]:
    data = brokereye.get("/api/broker/credit")
    avail = data.get("available_credit")
    if avail is None or _num(avail) >= p["threshold"]:
        return []
    return [{"key": "broker",
             "title": f"Available credit down to {_money(avail)}",
             "body": (f"Limit {_money(data.get('credit_limit'))}, used {_money(data.get('used_credit'))}, "
                      f"reserved {_money(data.get('reserved_credit'))} (pending temp credit-outs)."),
             "data": {k: data.get(k) for k in ("credit_limit", "used_credit", "reserved_credit", "available_credit")}}]


def _check_temp_expiring(p: dict[str, Any], _since: datetime) -> list[Hit]:
    data = brokereye.get("/api/broker/temp-credits", {"status": "pending", "limit": 200})
    horizon = time.time() + p.get("hours", 24) * 3600
    hits: list[Hit] = []
    for r in data.get("temp_credits") or []:
        if not _logins_ok(p, r.get("login")):
            continue
        if _num(r.get("expires_at"), float("inf")) > horizon:
            continue
        hits.append({"key": f"temp:{r.get('id')}",
                     "title": f"Temp credit {'in' if r.get('direction') == 'in' else 'out'} of {_money(r.get('amount'))} reverses {r.get('expires_at_text')}: {r.get('login')} {r.get('name') or ''}".strip(),
                     "body": f"{r.get('comment') or ''}".strip() or "Scheduled reversal.",
                     "data": {k: r.get(k) for k in ("id", "login", "name", "direction", "amount", "expires_at_text")}})
    return hits


_CHECKS: dict[str, Callable[[dict[str, Any], datetime], list[Hit]]] = {
    "margin_level_below": _check_margin,
    "equity_below": _check_equity,
    "balance_below": _check_balance,
    "floating_loss_above": _check_floating,
    "deposit_above": lambda p, s: _check_flow("deposit_above", p, s),
    "withdrawal_above": lambda p, s: _check_flow("withdrawal_above", p, s),
    "credit_available_below": _check_credit,
    "temp_credit_expiring": _check_temp_expiring,
}


# ---------------------------------------------------------------------------
# running a check
# ---------------------------------------------------------------------------
def run_check(a: dict[str, Any]) -> dict[str, Any]:
    """Check one alert: evaluate, record new events, deliver. Returns
    {"fired": n, "error": str | None}."""
    broker_id = int(a["broker_id"])
    out: dict[str, Any] = {"fired": 0, "error": None}
    try:
        session = service_auth.mint_broker_session(broker_id)
        brokereye.current_session.set(session)
        since = a.get("last_checked_at") or (datetime.now(_tz()) - timedelta(minutes=int(a["check_interval_minutes"]) * 2))
        hits = _CHECKS[a["kind"]](a["params"] or {}, since)
        now = int(time.time())
        fired = dict(a.get("fired_keys") or {})
        cooldown = int(a["cooldown_minutes"]) * 60
        fresh = [h for h in hits if now - int(_num(fired.get(h["key"]), 0)) >= cooldown]
        # forget keys older than 14 days so the JSON does not grow forever
        fired = {k: v for k, v in fired.items() if now - int(_num(v, 0)) < 14 * 86400}
        if fresh:
            ident = store.broker_identity(broker_id) or {}
            chat_id = ident.get("telegram_id")
            to_tg = bool(a.get("deliver_telegram")) and bool(chat_id) and delivery.telegram_configured()
            lines = []
            for h in fresh[:25]:
                fired[h["key"]] = now
                store.add_alert_event(alert_id=a["id"], broker_id=broker_id, kind=a["kind"], key=h["key"],
                                      title=h["title"], body=h["body"], data=h.get("data"), delivered="telegram" if to_tg else "web")
                lines.append(f"**{h['title']}**\n{h['body']}")
            more = len(fresh) - 25
            text = f"🔔 **{a['name']}**\n\n" + "\n\n".join(lines) + (f"\n\n…and {more} more." if more > 0 else "")
            if to_tg:
                err = delivery.send_telegram(int(chat_id), text)
                if err:
                    out["error"] = f"Telegram delivery failed: {err}"
            out["fired"] = len(fresh)
        store.finish_alert_check(a["id"], fired_keys=fired, fired=bool(fresh), error=out["error"])
        return out
    except Exception as e:  # noqa: BLE001 - one bad alert must not stop the others
        log.warning("alert %s check failed: %s", a.get("id"), e)
        out["error"] = f"{type(e).__name__}: {str(e)[:300]}"
        try:
            store.finish_alert_check(a["id"], fired_keys=None, fired=False, error=out["error"])
        except Exception:  # noqa: BLE001
            log.exception("could not record alert failure")
        return out


def tick() -> None:
    for a in store.due_alerts():
        store.set_alert_next_check(a["id"], int(a["check_interval_minutes"]))
        run_check(a)
