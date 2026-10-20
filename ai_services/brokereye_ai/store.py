"""Postgres persistence for conversations (append-only message log)."""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from .config import settings


def _conn() -> psycopg.Connection:
    # The session timezone follows AI_TIMEZONE so that NOW() and naive
    # timestamp columns agree with the BrokerEye backend.
    cfg = settings()
    return psycopg.connect(cfg.database_url, row_factory=dict_row, options=f"-c TimeZone={cfg.ai_timezone}")


def create_conversation(broker_id: int, channel: str, model: str, external_key: str | None = None) -> str:
    cid = str(uuid.uuid4())
    with _conn() as c:
        c.execute(
            "INSERT INTO ai_conversations (id, broker_id, channel, model, external_key) VALUES (%s, %s, %s, %s, %s)",
            (cid, broker_id, channel, model, external_key),
        )
    return cid


def find_recent_by_key(broker_id: int, external_key: str, max_idle_minutes: int) -> str | None:
    """The latest conversation a channel (e.g. a Telegram chat) was using,
    if it was active within max_idle_minutes; else None (start a new one)."""
    with _conn() as c:
        row = c.execute(
            "SELECT id FROM ai_conversations WHERE broker_id = %s AND external_key = %s AND archived_at IS NULL "
            "AND updated_at >= NOW() - make_interval(mins => %s) ORDER BY updated_at DESC LIMIT 1",
            (broker_id, external_key, max_idle_minutes),
        ).fetchone()
    return row["id"] if row else None


def get_conversation(broker_id: int, conversation_id: str) -> dict[str, Any] | None:
    with _conn() as c:
        return c.execute(
            "SELECT id, broker_id, title, channel, model, created_at, updated_at "
            "FROM ai_conversations WHERE id = %s AND broker_id = %s AND archived_at IS NULL",
            (conversation_id, broker_id),
        ).fetchone()


def list_conversations(broker_id: int, limit: int = 50) -> list[dict[str, Any]]:
    with _conn() as c:
        return c.execute(
            "SELECT id, title, channel, model, created_at, updated_at FROM ai_conversations "
            "WHERE broker_id = %s AND archived_at IS NULL ORDER BY updated_at DESC LIMIT %s",
            (broker_id, limit),
        ).fetchall()


def archive_conversation(broker_id: int, conversation_id: str) -> bool:
    with _conn() as c:
        cur = c.execute(
            "UPDATE ai_conversations SET archived_at = NOW() WHERE id = %s AND broker_id = %s AND archived_at IS NULL",
            (conversation_id, broker_id),
        )
        return cur.rowcount > 0


def set_title(conversation_id: str, title: str) -> None:
    with _conn() as c:
        c.execute("UPDATE ai_conversations SET title = %s WHERE id = %s", (title[:200], conversation_id))


def load_messages(conversation_id: str) -> list[dict[str, Any]]:
    """The conversation exactly as the API saw it: [{role, content}], oldest first."""
    with _conn() as c:
        rows = c.execute(
            "SELECT role, content FROM ai_messages WHERE conversation_id = %s ORDER BY seq",
            (conversation_id,),
        ).fetchall()
    return [{"role": r["role"], "content": r["content"]} for r in rows]


_CHART_KEYS = ("chart_type", "title", "labels", "series", "unit", "subtitle")


def chart_spec(tool_input: Any) -> dict[str, Any] | None:
    """The render_chart input, trimmed to what the web UI needs to draw it."""
    if not isinstance(tool_input, dict) or not tool_input.get("labels"):
        return None
    spec = {k: tool_input[k] for k in _CHART_KEYS if k in tool_input}
    spec["labels"] = [str(x) for x in spec["labels"]][:60]
    spec["series"] = [{"name": str(s.get("name", "")), "values": [v if isinstance(v, (int, float)) else 0 for v in (s.get("values") or [])][:60]}
                      for s in (spec.get("series") or []) if isinstance(s, dict)][:10]
    return spec


def _file_card(result_text: str) -> dict[str, Any] | None:
    """An export tool result -> file card, only while the file is still on disk."""
    try:
        info = json.loads(result_text) if isinstance(result_text, str) else dict(result_text)
    except (ValueError, TypeError):
        return None
    if not isinstance(info, dict) or not info.get("file_id") or not info.get("url"):
        return None
    from .charts import FILES_DIR
    if not (FILES_DIR / f"{info['file_id']}.{info.get('format', '')}").exists():
        return None
    return {k: info.get(k) for k in ("file_id", "filename", "format", "rows", "bytes", "url")}


def load_transcript(conversation_id: str) -> list[dict[str, Any]]:
    """What the UI shows: user text and assistant answers (tool rounds
    summarised), plus the charts and files produced on the way, attached to
    the next assistant message that has prose."""
    with _conn() as c:
        rows = c.execute(
            "SELECT seq, role, kind, display_text, content, usage, created_at FROM ai_messages "
            "WHERE conversation_id = %s ORDER BY seq",
            (conversation_id,),
        ).fetchall()
    out: list[dict[str, Any]] = []
    actions_by_seq: dict[int | None, list[dict[str, Any]]] = {}
    for seq, a in _actions_with_seq(conversation_id):
        actions_by_seq.setdefault(seq, []).append(a)
    pending_actions: list[dict[str, Any]] = []
    pending_charts: list[dict[str, Any]] = []
    pending_files: list[dict[str, Any]] = []
    export_ids: set[str] = set()
    overview_ids: set[str] = set()
    bill_ids: set[str] = set()
    pending_dash: list[dict[str, Any]] = []
    pending_bills: list[dict[str, Any]] = []
    for r in rows:
        content = r["content"] if isinstance(r["content"], list) else []
        if r["kind"] == "tool_results":
            for b in content:
                if not isinstance(b, dict) or b.get("type") != "tool_result":
                    continue
                if b.get("tool_use_id") in export_ids:
                    card = _file_card(b.get("content"))
                    if card:
                        pending_files.append(card)
                elif b.get("tool_use_id") in overview_ids:
                    try:
                        dash = json.loads(b.get("content")).get("dashboard") if isinstance(b.get("content"), str) else None
                    except (ValueError, AttributeError):
                        dash = None
                    if dash:
                        pending_dash.append(dash)
                elif b.get("tool_use_id") in bill_ids:
                    try:
                        info = json.loads(b.get("content")) if isinstance(b.get("content"), str) else None
                    except ValueError:
                        info = None
                    if isinstance(info, dict):
                        if info.get("bill_card"):
                            pending_bills.append(info["bill_card"])
                        card = _file_card(b.get("content")) if info.get("file_id") else None
                        if card:
                            pending_files.append(card)
            continue
        tools = []
        for b in content:
            if not isinstance(b, dict) or b.get("type") != "tool_use":
                continue
            tools.append(b.get("name"))
            if b.get("name") == "render_chart":
                spec = chart_spec(b.get("input"))
                if spec:
                    pending_charts.append({"spec": spec, "title": spec.get("title", "")})
            elif b.get("name") in ("export_table", "export_report"):
                export_ids.add(b.get("id"))
            elif b.get("name") == "get_client_overview":
                overview_ids.add(b.get("id"))
            elif b.get("name") == "settlement_bill":
                bill_ids.add(b.get("id"))
        pending_actions.extend(actions_by_seq.pop(r["seq"], []))
        if r["role"] == "assistant" and not (r["display_text"] or "").strip() and tools:
            continue  # an intermediate tool-calling step with no prose
        msg: dict[str, Any] = {
            "seq": r["seq"], "role": r["role"], "text": r["display_text"] or "",
            "tools": tools, "usage": r["usage"], "created_at": r["created_at"],
        }
        if r["role"] == "assistant":
            msg["charts"], msg["files"], msg["dashboards"] = pending_charts, pending_files, pending_dash
            msg["bills"] = pending_bills
            msg["actions"] = pending_actions
            pending_charts, pending_files, pending_dash, pending_actions, pending_bills = [], [], [], [], []
        out.append(msg)
    leftover = pending_actions + [a for rest in actions_by_seq.values() for a in rest]
    if leftover:
        for m in reversed(out):
            if m["role"] == "assistant":
                m["actions"] = [*m.get("actions", []), *leftover]
                break
    return out


def _actions_with_seq(conversation_id: str) -> list[tuple[int | None, dict[str, Any]]]:
    with _conn() as c:
        c.execute("UPDATE ai_actions SET status = 'expired', decided_at = NOW() "
                  "WHERE conversation_id = %s AND status = 'pending' AND expires_at < NOW()", (conversation_id,))
        rows = c.execute(f"SELECT {_ACTION_COLS} FROM ai_actions WHERE conversation_id = %s ORDER BY created_at",
                         (conversation_id,)).fetchall()
    return [(r["message_seq"], action_view(r)) for r in rows]


def append_message(
    conversation_id: str,
    *,
    role: str,
    kind: str,
    content: Any,
    display_text: str | None = None,
    model: str | None = None,
    stop_reason: str | None = None,
    usage: dict[str, Any] | None = None,
) -> int:
    with _conn() as c:
        seq = c.execute(
            "SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM ai_messages WHERE conversation_id = %s",
            (conversation_id,),
        ).fetchone()["seq"]
        c.execute(
            "INSERT INTO ai_messages (conversation_id, seq, role, kind, content, display_text, model, stop_reason, usage) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (conversation_id, seq, role, kind, Jsonb(content), display_text, model, stop_reason,
             Jsonb(usage) if usage is not None else None),
        )
        c.execute("UPDATE ai_conversations SET updated_at = NOW() WHERE id = %s", (conversation_id,))
    return seq


def log_tool_call(conversation_id: str, broker_id: int, tool_name: str, tool_input: Any, ok: bool,
                  duration_ms: int | None, result_bytes: int, error: str | None) -> None:
    with _conn() as c:
        c.execute(
            "INSERT INTO ai_tool_calls (conversation_id, broker_id, tool_name, tool_input, ok, duration_ms, result_bytes, error) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
            (conversation_id, broker_id, tool_name, Jsonb(tool_input), ok, duration_ms, result_bytes, error),
        )


# ---------------------------------------------------------------------------
# Knowledge (admin rules) and feedback
# ---------------------------------------------------------------------------
def knowledge_for(broker_id: int) -> list[dict[str, Any]]:
    """Active rules that apply to this broker: global ones plus their own."""
    with _conn() as c:
        return c.execute(
            "SELECT id, scope, kind, title, content FROM ai_knowledge WHERE status = 'active' "
            "AND (scope = 'global' OR (scope = 'broker' AND broker_id = %s)) ORDER BY id",
            (broker_id,),
        ).fetchall()


def list_knowledge(status: str | None = None, broker_id: int | None = None) -> list[dict[str, Any]]:
    sql = ("SELECT id, scope, broker_id, kind, title, content, status, source, feedback_id, created_by, "
           "created_at, updated_at FROM ai_knowledge WHERE 1=1")
    args: list[Any] = []
    if status:
        sql += " AND status = %s"
        args.append(status)
    if broker_id is not None:
        sql += " AND (scope = 'global' OR broker_id = %s)"
        args.append(broker_id)
    with _conn() as c:
        return c.execute(sql + " ORDER BY status, id DESC", args).fetchall()


def create_knowledge(*, scope: str, broker_id: int | None, kind: str, title: str, content: str,
                     status: str, source: str, created_by: str, feedback_id: int | None = None) -> int:
    with _conn() as c:
        return c.execute(
            "INSERT INTO ai_knowledge (scope, broker_id, kind, title, content, status, source, feedback_id, created_by) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
            (scope, broker_id if scope == "broker" else None, kind, title[:160], content, status, source, feedback_id, created_by[:64]),
        ).fetchone()["id"]


def update_knowledge(knowledge_id: int, fields: dict[str, Any]) -> bool:
    allowed = {"scope", "broker_id", "kind", "title", "content", "status"}
    sets = {k: v for k, v in fields.items() if k in allowed and v is not None}
    if not sets:
        return False
    assignments = ", ".join(f"{k} = %s" for k in sets) + ", updated_at = NOW()"
    with _conn() as c:
        cur = c.execute(f"UPDATE ai_knowledge SET {assignments} WHERE id = %s", [*sets.values(), knowledge_id])
        return cur.rowcount > 0


def delete_knowledge(knowledge_id: int) -> bool:
    with _conn() as c:
        return c.execute("DELETE FROM ai_knowledge WHERE id = %s", (knowledge_id,)).rowcount > 0


def last_exchange(conversation_id: str, message_seq: int | None) -> tuple[str, str, int | None]:
    """(question, answer, answer_seq) for the assistant message at `message_seq`
    (or the latest one) and the user message before it."""
    with _conn() as c:
        if message_seq is None:
            row = c.execute(
                "SELECT seq FROM ai_messages WHERE conversation_id = %s AND role = 'assistant' "
                "AND COALESCE(display_text, '') <> '' ORDER BY seq DESC LIMIT 1", (conversation_id,)).fetchone()
            if not row:
                return "", "", None
            message_seq = row["seq"]
        answer = c.execute("SELECT display_text FROM ai_messages WHERE conversation_id = %s AND seq = %s",
                           (conversation_id, message_seq)).fetchone()
        question = c.execute(
            "SELECT display_text FROM ai_messages WHERE conversation_id = %s AND seq < %s AND kind = 'text' "
            "ORDER BY seq DESC LIMIT 1", (conversation_id, message_seq)).fetchone()
    return (question["display_text"] if question else "") or "", (answer["display_text"] if answer else "") or "", message_seq


def create_feedback(*, conversation_id: str | None, message_seq: int | None, broker_id: int, channel: str,
                    rating: int, comment: str, question: str, answer: str) -> int:
    with _conn() as c:
        return c.execute(
            "INSERT INTO ai_feedback (conversation_id, message_seq, broker_id, channel, rating, comment, question, answer) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
            (conversation_id, message_seq, broker_id, channel, rating, comment[:2000], question[:4000], answer[:8000]),
        ).fetchone()["id"]


def list_feedback(status: str | None = None, limit: int = 200) -> list[dict[str, Any]]:
    sql = ("SELECT f.id, f.conversation_id, f.message_seq, f.broker_id, f.channel, f.rating, f.comment, f.question, "
           "f.answer, f.status, f.created_at, k.id AS knowledge_id, k.title AS proposed_title, "
           "k.content AS proposed_content, k.status AS proposed_status "
           "FROM ai_feedback f LEFT JOIN ai_knowledge k ON k.feedback_id = f.id WHERE 1=1")
    args: list[Any] = []
    if status:
        sql += " AND f.status = %s"
        args.append(status)
    with _conn() as c:
        return c.execute(sql + " ORDER BY f.created_at DESC LIMIT %s", [*args, limit]).fetchall()


def set_feedback_status(feedback_id: int, status: str) -> bool:
    with _conn() as c:
        return c.execute("UPDATE ai_feedback SET status = %s WHERE id = %s", (status, feedback_id)).rowcount > 0


def audit_rule_change(*, user_id: int | None, username: str, action: str, knowledge_id: int | None,
                      old_values: dict[str, Any] | None, new_values: dict[str, Any] | None,
                      ip: str | None, user_agent: str | None) -> None:
    """Record an AI-rule change in BrokerEye's audit_logs (category 'rules')
    with before / after values and the admin's IP. Best-effort: never fails
    the request that triggered it."""
    try:
        with _conn() as c:
            c.execute(
                "INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values, new_values, "
                "ip_address, user_agent, category, created_at) "
                "VALUES (%s, %s, 'ai_knowledge', %s, %s, %s, %s::inet, %s, 'rules', NOW())",
                (user_id, action, knowledge_id,
                 Jsonb({**old_values, "_by": username}) if old_values is not None else None,
                 Jsonb({**new_values, "_by": username}) if new_values is not None else None,
                 ip or None, (user_agent or "")[:500] or None),
            )
    except Exception:  # noqa: BLE001 - auditing must not break the admin action
        import logging
        logging.getLogger("brokereye_ai.store").warning("audit_rule_change failed", exc_info=True)


def get_knowledge(knowledge_id: int) -> dict[str, Any] | None:
    with _conn() as c:
        return c.execute(
            "SELECT id, scope, broker_id, kind, title, content, status, source FROM ai_knowledge WHERE id = %s",
            (knowledge_id,),
        ).fetchone()


# ---------------------------------------------------------------------------
# Actions proposed in the chat (executed only after the broker confirms)
# ---------------------------------------------------------------------------
ACTION_LABELS = {
    "credit_in": "Credit In", "credit_out": "Credit Out",
    "temp_credit_in": "Temp Credit In", "temp_credit_out": "Temp Credit Out",
    "apply_rule": "Apply rule", "remove_rule": "Remove rule", "bulk_rules": "Bulk rules",
    "disable_trading": "Disable trading", "enable_trading": "Enable trading",
    "disable_account": "Disable account", "enable_account": "Enable account",
    "reset_trading_password": "Reset trading password", "reset_investor_password": "Reset investor password",
}
_ACTION_COLS = ("id, conversation_id, broker_id, message_seq, kind, payload, summary, status, result, error, "
                "channel, created_at, expires_at, decided_at")


def action_view(row: dict[str, Any]) -> dict[str, Any]:
    """What the UI needs to draw the confirmation card."""
    return {
        "id": str(row["id"]), "kind": row["kind"], "label": ACTION_LABELS.get(row["kind"], row["kind"]),
        "summary": row["summary"], "payload": row["payload"], "status": row["status"],
        "result": row["result"], "error": row["error"], "created_at": row["created_at"],
        "expires_at": row["expires_at"], "decided_at": row["decided_at"],
    }


def create_action(*, conversation_id: str, broker_id: int, kind: str, payload: dict[str, Any], summary: str,
                  channel: str, ttl_minutes: int) -> dict[str, Any]:
    aid = str(uuid.uuid4())
    with _conn() as c:
        row = c.execute(
            "INSERT INTO ai_actions (id, conversation_id, broker_id, kind, payload, summary, channel, expires_at) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, NOW() + make_interval(mins => %s)) RETURNING " + _ACTION_COLS,
            (aid, conversation_id, broker_id, kind, Jsonb(payload), summary[:400], channel, ttl_minutes),
        ).fetchone()
    return action_view(row)


def set_action_seq(action_id: str, seq: int | None) -> None:
    if seq is None:
        return
    with _conn() as c:
        c.execute("UPDATE ai_actions SET message_seq = %s WHERE id = %s AND message_seq IS NULL", (seq, action_id))


def get_action(broker_id: int, action_id: str) -> dict[str, Any] | None:
    """The action, with a stale pending proposal flipped to expired on read."""
    with _conn() as c:
        c.execute("UPDATE ai_actions SET status = 'expired', decided_at = NOW() "
                  "WHERE id = %s AND status = 'pending' AND expires_at < NOW()", (action_id,))
        row = c.execute(f"SELECT {_ACTION_COLS} FROM ai_actions WHERE id = %s AND broker_id = %s",
                        (action_id, broker_id)).fetchone()
    return action_view(row) if row else None


def claim_action(broker_id: int, action_id: str) -> dict[str, Any] | None:
    """Atomically move a pending, unexpired action to 'executing' so a double
    click cannot run it twice. None when it was not claimable."""
    with _conn() as c:
        row = c.execute(
            "UPDATE ai_actions SET status = 'executing' WHERE id = %s AND broker_id = %s AND status = 'pending' "
            "AND expires_at >= NOW() RETURNING " + _ACTION_COLS, (action_id, broker_id)).fetchone()
    return action_view(row) if row else None


def finish_action(action_id: str, status: str, *, result: dict[str, Any] | None = None, error: str | None = None) -> dict[str, Any] | None:
    with _conn() as c:
        row = c.execute(
            "UPDATE ai_actions SET status = %s, result = %s, error = %s, decided_at = NOW() WHERE id = %s RETURNING " + _ACTION_COLS,
            (status, Jsonb(result) if result is not None else None, (error or None), action_id)).fetchone()
    return action_view(row) if row else None


def cancel_action(broker_id: int, action_id: str) -> dict[str, Any] | None:
    with _conn() as c:
        row = c.execute(
            "UPDATE ai_actions SET status = 'cancelled', decided_at = NOW() WHERE id = %s AND broker_id = %s "
            "AND status = 'pending' RETURNING " + _ACTION_COLS, (action_id, broker_id)).fetchone()
    return action_view(row) if row else None


def list_actions(conversation_id: str) -> list[dict[str, Any]]:
    with _conn() as c:
        c.execute("UPDATE ai_actions SET status = 'expired', decided_at = NOW() "
                  "WHERE conversation_id = %s AND status = 'pending' AND expires_at < NOW()", (conversation_id,))
        rows = c.execute(f"SELECT {_ACTION_COLS} FROM ai_actions WHERE conversation_id = %s ORDER BY created_at",
                         (conversation_id,)).fetchall()
    return [action_view(r) for r in rows]


def pop_unreported_actions(conversation_id: str) -> list[dict[str, Any]]:
    """Decided actions the model has not been told about yet (fed into the
    next user turn), marked as reported."""
    with _conn() as c:
        c.execute("UPDATE ai_actions SET status = 'expired', decided_at = NOW() "
                  "WHERE conversation_id = %s AND status = 'pending' AND expires_at < NOW()", (conversation_id,))
        rows = c.execute(
            f"UPDATE ai_actions SET reported_at = NOW() WHERE conversation_id = %s AND reported_at IS NULL "
            f"AND status IN ('executed', 'failed', 'cancelled', 'expired') RETURNING {_ACTION_COLS}",
            (conversation_id,)).fetchall()
    return [action_view(r) for r in rows]


# ---------------------------------------------------------------------------
# Saved questions (navigation + command palette) and pinned answers (Home)
# ---------------------------------------------------------------------------
SAVED_MAX = 30
PINS_MAX = 6
_SAVED_COLS = "id, title, question, created_at"
_PIN_COLS = "id, title, question, last_text, last_run_at, last_error, created_at"


def list_saved(broker_id: int) -> list[dict[str, Any]]:
    with _conn() as c:
        return c.execute(f"SELECT {_SAVED_COLS} FROM ai_saved_questions WHERE broker_id = %s ORDER BY id", (broker_id,)).fetchall()


def add_saved(broker_id: int, title: str, question: str) -> dict[str, Any]:
    question = question.strip()
    title = " ".join((title or question).split()).strip()[:80]
    if not question:
        raise ValueError("The question is empty")
    with _conn() as c:
        rows = c.execute("SELECT id, title, question FROM ai_saved_questions WHERE broker_id = %s ORDER BY id", (broker_id,)).fetchall()
        for r in rows:
            if r["question"].strip().lower() == question.lower():
                return {**r, "existing": True}
        if len(rows) >= SAVED_MAX:
            raise ValueError(f"At most {SAVED_MAX} saved questions; remove one first")
        return c.execute(f"INSERT INTO ai_saved_questions (broker_id, title, question) VALUES (%s, %s, %s) RETURNING {_SAVED_COLS}",
                         (broker_id, title, question[:4000])).fetchone()


def remove_saved(broker_id: int, saved_id: int) -> bool:
    with _conn() as c:
        return c.execute("DELETE FROM ai_saved_questions WHERE broker_id = %s AND id = %s", (broker_id, saved_id)).rowcount > 0


def list_pins(broker_id: int) -> list[dict[str, Any]]:
    with _conn() as c:
        return c.execute(f"SELECT {_PIN_COLS} FROM ai_pins WHERE broker_id = %s ORDER BY id", (broker_id,)).fetchall()


def get_pin(broker_id: int, pin_id: int) -> dict[str, Any] | None:
    with _conn() as c:
        return c.execute(f"SELECT {_PIN_COLS} FROM ai_pins WHERE broker_id = %s AND id = %s", (broker_id, pin_id)).fetchone()


def add_pin(broker_id: int, title: str, question: str, last_text: str | None = None) -> dict[str, Any]:
    question = question.strip()
    title = " ".join((title or question).split()).strip()[:80]
    if not question:
        raise ValueError("The question is empty")
    with _conn() as c:
        rows = c.execute(f"SELECT {_PIN_COLS} FROM ai_pins WHERE broker_id = %s ORDER BY id", (broker_id,)).fetchall()
        for r in rows:
            if r["question"].strip().lower() == question.lower():
                return {**r, "existing": True}
        if len(rows) >= PINS_MAX:
            raise ValueError(f"At most {PINS_MAX} pinned answers; unpin one first")
        return c.execute(
            f"INSERT INTO ai_pins (broker_id, title, question, last_text, last_run_at) VALUES (%s, %s, %s, %s, %s) RETURNING {_PIN_COLS}",
            (broker_id, title, question[:4000], last_text, datetime.now(timezone.utc) if last_text else None)).fetchone()


def remove_pin(broker_id: int, pin_id: int) -> bool:
    with _conn() as c:
        return c.execute("DELETE FROM ai_pins WHERE broker_id = %s AND id = %s", (broker_id, pin_id)).rowcount > 0


def set_pin_result(pin_id: int, text: str | None, error: str | None) -> dict[str, Any] | None:
    with _conn() as c:
        return c.execute(
            f"UPDATE ai_pins SET last_text = COALESCE(%s, last_text), last_error = %s, last_run_at = NOW() WHERE id = %s RETURNING {_PIN_COLS}",
            (text, error, pin_id)).fetchone()


# ---------------------------------------------------------------------------
# Brokers (read-only lookups for unattended runs)
# ---------------------------------------------------------------------------
def broker_identity(broker_id: int) -> dict[str, Any] | None:
    with _conn() as c:
        return c.execute(
            "SELECT id, username, full_name, is_active, telegram_id FROM brokers WHERE id = %s", (broker_id,)
        ).fetchone()


# ---------------------------------------------------------------------------
# Scheduled digests
# ---------------------------------------------------------------------------
_DIGEST_COLS = ("id, broker_id, name, prompt, run_time, weekdays, deliver_telegram, enabled, created_by, next_run_at, "
                "last_run_at, last_status, last_error, last_conversation_id, created_at, updated_at")


def list_digests(broker_id: int) -> list[dict[str, Any]]:
    with _conn() as c:
        return c.execute(f"SELECT {_DIGEST_COLS} FROM ai_digests WHERE broker_id = %s ORDER BY id", (broker_id,)).fetchall()


def get_digest(broker_id: int, digest_id: int) -> dict[str, Any] | None:
    with _conn() as c:
        return c.execute(f"SELECT {_DIGEST_COLS} FROM ai_digests WHERE broker_id = %s AND id = %s",
                         (broker_id, digest_id)).fetchone()


def count_digests(broker_id: int) -> int:
    with _conn() as c:
        return int(c.execute("SELECT COUNT(*) AS n FROM ai_digests WHERE broker_id = %s", (broker_id,)).fetchone()["n"])


def create_digest(*, broker_id: int, name: str, prompt: str, run_time: str, weekdays: list[int], deliver_telegram: bool,
                  created_by: str, next_run_at: Any) -> dict[str, Any]:
    with _conn() as c:
        return c.execute(
            "INSERT INTO ai_digests (broker_id, name, prompt, run_time, weekdays, deliver_telegram, created_by, next_run_at) "
            f"VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING {_DIGEST_COLS}",
            (broker_id, name[:80], prompt[:4000], run_time, ",".join(str(d) for d in weekdays), deliver_telegram,
             created_by, next_run_at),
        ).fetchone()


def update_digest(broker_id: int, digest_id: int, fields: dict[str, Any]) -> dict[str, Any] | None:
    allowed = {"name", "prompt", "run_time", "weekdays", "deliver_telegram", "enabled", "next_run_at"}
    sets = {k: v for k, v in fields.items() if k in allowed and v is not None}
    if "weekdays" in sets and isinstance(sets["weekdays"], list):
        sets["weekdays"] = ",".join(str(d) for d in sets["weekdays"])
    if not sets:
        return get_digest(broker_id, digest_id)
    assignments = ", ".join(f"{k} = %s" for k in sets) + ", updated_at = NOW()"
    with _conn() as c:
        return c.execute(f"UPDATE ai_digests SET {assignments} WHERE broker_id = %s AND id = %s RETURNING {_DIGEST_COLS}",
                         [*sets.values(), broker_id, digest_id]).fetchone()


def delete_digest(broker_id: int, digest_id: int) -> bool:
    with _conn() as c:
        return c.execute("DELETE FROM ai_digests WHERE broker_id = %s AND id = %s", (broker_id, digest_id)).rowcount > 0


def due_digests() -> list[dict[str, Any]]:
    with _conn() as c:
        return c.execute(f"SELECT {_DIGEST_COLS} FROM ai_digests WHERE enabled AND next_run_at <= NOW() "
                         "ORDER BY next_run_at LIMIT 20").fetchall()


def set_digest_next_run(digest_id: int, next_run_at: Any) -> None:
    with _conn() as c:
        c.execute("UPDATE ai_digests SET next_run_at = %s WHERE id = %s", (next_run_at, digest_id))


def finish_digest(digest_id: int, status: str, error: str | None, conversation_id: str | None, *, disable: bool = False) -> None:
    with _conn() as c:
        c.execute(
            "UPDATE ai_digests SET last_run_at = NOW(), last_status = %s, last_error = %s, "
            "last_conversation_id = COALESCE(%s, last_conversation_id), enabled = enabled AND NOT %s, updated_at = NOW() "
            "WHERE id = %s",
            (status, (error or None), conversation_id, disable, digest_id),
        )


# ---------------------------------------------------------------------------
# Alerts (standing conditions) and their events
# ---------------------------------------------------------------------------
_ALERT_COLS = ("id, broker_id, name, kind, params, check_interval_minutes, cooldown_minutes, deliver_telegram, enabled, "
               "created_by, next_check_at, last_checked_at, last_fired_at, last_error, fired_keys, created_at, updated_at")


def list_alerts(broker_id: int) -> list[dict[str, Any]]:
    with _conn() as c:
        return c.execute(f"SELECT {_ALERT_COLS} FROM ai_alerts WHERE broker_id = %s ORDER BY id", (broker_id,)).fetchall()


def get_alert(broker_id: int, alert_id: int) -> dict[str, Any] | None:
    with _conn() as c:
        return c.execute(f"SELECT {_ALERT_COLS} FROM ai_alerts WHERE broker_id = %s AND id = %s", (broker_id, alert_id)).fetchone()


def count_alerts(broker_id: int) -> int:
    with _conn() as c:
        return int(c.execute("SELECT COUNT(*) AS n FROM ai_alerts WHERE broker_id = %s", (broker_id,)).fetchone()["n"])


def create_alert(*, broker_id: int, name: str, kind: str, params: dict[str, Any], check_interval_minutes: int,
                 cooldown_minutes: int, deliver_telegram: bool, created_by: str) -> dict[str, Any]:
    with _conn() as c:
        return c.execute(
            "INSERT INTO ai_alerts (broker_id, name, kind, params, check_interval_minutes, cooldown_minutes, deliver_telegram, created_by) "
            f"VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING {_ALERT_COLS}",
            (broker_id, name[:80], kind, Jsonb(params), check_interval_minutes, cooldown_minutes, deliver_telegram, created_by),
        ).fetchone()


def update_alert(broker_id: int, alert_id: int, fields: dict[str, Any]) -> dict[str, Any] | None:
    allowed = {"name", "kind", "params", "check_interval_minutes", "cooldown_minutes", "deliver_telegram", "enabled"}
    sets = {k: (Jsonb(v) if k == "params" else v) for k, v in fields.items() if k in allowed and v is not None}
    if not sets:
        return get_alert(broker_id, alert_id)
    assignments = ", ".join(f"{k} = %s" for k in sets) + ", updated_at = NOW(), next_check_at = NOW()"
    with _conn() as c:
        return c.execute(f"UPDATE ai_alerts SET {assignments} WHERE broker_id = %s AND id = %s RETURNING {_ALERT_COLS}",
                         [*sets.values(), broker_id, alert_id]).fetchone()


def delete_alert(broker_id: int, alert_id: int) -> bool:
    with _conn() as c:
        return c.execute("DELETE FROM ai_alerts WHERE broker_id = %s AND id = %s", (broker_id, alert_id)).rowcount > 0


def due_alerts() -> list[dict[str, Any]]:
    with _conn() as c:
        return c.execute(f"SELECT {_ALERT_COLS} FROM ai_alerts WHERE enabled AND next_check_at <= NOW() "
                         "ORDER BY next_check_at LIMIT 50").fetchall()


def set_alert_next_check(alert_id: int, minutes: int) -> None:
    with _conn() as c:
        c.execute("UPDATE ai_alerts SET next_check_at = NOW() + make_interval(mins => %s) WHERE id = %s", (max(1, minutes), alert_id))


def finish_alert_check(alert_id: int, *, fired_keys: dict[str, Any] | None, fired: bool, error: str | None) -> None:
    with _conn() as c:
        c.execute(
            "UPDATE ai_alerts SET last_checked_at = NOW(), last_error = %s, "
            "last_fired_at = CASE WHEN %s THEN NOW() ELSE last_fired_at END, "
            "fired_keys = COALESCE(%s, fired_keys), updated_at = NOW() WHERE id = %s",
            ((error or None), fired, Jsonb(fired_keys) if fired_keys is not None else None, alert_id),
        )


def add_alert_event(*, alert_id: int, broker_id: int, kind: str, key: str, title: str, body: str,
                    data: dict[str, Any] | None, delivered: str) -> int:
    with _conn() as c:
        return c.execute(
            "INSERT INTO ai_alert_events (alert_id, broker_id, kind, match_key, title, body, data, delivered) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
            (alert_id, broker_id, kind, key[:64], title[:160], body[:2000], Jsonb(data) if data is not None else None, delivered),
        ).fetchone()["id"]


def list_alert_events(broker_id: int, limit: int = 30, after_id: int = 0) -> list[dict[str, Any]]:
    with _conn() as c:
        return c.execute(
            "SELECT e.id, e.alert_id, a.name AS alert_name, e.kind, e.match_key, e.title, e.body, e.data, e.delivered, e.created_at, e.seen_at "
            "FROM ai_alert_events e LEFT JOIN ai_alerts a ON a.id = e.alert_id "
            "WHERE e.broker_id = %s AND e.id > %s ORDER BY e.id DESC LIMIT %s",
            (broker_id, after_id, max(1, min(200, limit))),
        ).fetchall()


def unseen_alert_count(broker_id: int) -> int:
    with _conn() as c:
        return int(c.execute("SELECT COUNT(*) AS n FROM ai_alert_events WHERE broker_id = %s AND seen_at IS NULL",
                             (broker_id,)).fetchone()["n"])


def mark_alert_events_seen(broker_id: int, up_to_id: int | None = None) -> int:
    with _conn() as c:
        if up_to_id:
            cur = c.execute("UPDATE ai_alert_events SET seen_at = NOW() WHERE broker_id = %s AND seen_at IS NULL AND id <= %s",
                            (broker_id, up_to_id))
        else:
            cur = c.execute("UPDATE ai_alert_events SET seen_at = NOW() WHERE broker_id = %s AND seen_at IS NULL", (broker_id,))
        return cur.rowcount


# ---------------------------------------------------------------------------
# Per-broker memory (short notes the assistant keeps across conversations)
# ---------------------------------------------------------------------------
PREFERENCES_MAX = 20


def list_preferences(broker_id: int) -> list[dict[str, Any]]:
    with _conn() as c:
        return c.execute(
            "SELECT id, note, source, created_at FROM ai_broker_preferences WHERE broker_id = %s ORDER BY id",
            (broker_id,),
        ).fetchall()


def add_preference(broker_id: int, note: str, source: str) -> dict[str, Any]:
    """Store one note (deduplicated, case-insensitive). Raises ValueError when
    the note is empty or the broker already has PREFERENCES_MAX notes."""
    note = " ".join(note.split()).strip()[:240]
    if not note:
        raise ValueError("The note is empty")
    with _conn() as c:
        rows = c.execute("SELECT id, note FROM ai_broker_preferences WHERE broker_id = %s ORDER BY id", (broker_id,)).fetchall()
        for r in rows:
            if r["note"].lower() == note.lower():
                return {"id": r["id"], "note": r["note"], "existing": True}
        if len(rows) >= PREFERENCES_MAX:
            raise ValueError(f"At most {PREFERENCES_MAX} notes can be remembered; remove one first")
        row = c.execute(
            "INSERT INTO ai_broker_preferences (broker_id, note, source) VALUES (%s, %s, %s) RETURNING id, note",
            (broker_id, note, source),
        ).fetchone()
    return {"id": row["id"], "note": row["note"], "existing": False}


def remove_preferences(broker_id: int, *, pref_id: int | None = None, text: str = "") -> list[str]:
    """Delete by id, or every note containing `text` (case-insensitive).
    Returns the notes removed."""
    with _conn() as c:
        if pref_id is not None:
            rows = c.execute("DELETE FROM ai_broker_preferences WHERE broker_id = %s AND id = %s RETURNING note",
                             (broker_id, pref_id)).fetchall()
        elif text.strip():
            rows = c.execute("DELETE FROM ai_broker_preferences WHERE broker_id = %s AND note ILIKE %s RETURNING note",
                             (broker_id, "%" + text.strip() + "%")).fetchall()
        else:
            rows = []
    return [r["note"] for r in rows]


# ---------------------------------------------------------------------------
# Admin metrics (tool health, token use, feedback) over the last N days
# ---------------------------------------------------------------------------
def metrics(days: int = 7) -> dict[str, Any]:
    days = max(1, min(90, days))
    with _conn() as c:
        tools = c.execute(
            "SELECT tool_name, COUNT(*) AS calls, COUNT(*) FILTER (WHERE NOT ok) AS errors, "
            "ROUND(AVG(duration_ms)) AS avg_ms, "
            "percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95_ms, "
            "ROUND(AVG(result_bytes)) AS avg_bytes, MAX(created_at) AS last_used "
            "FROM ai_tool_calls WHERE created_at >= NOW() - make_interval(days => %s) "
            "GROUP BY tool_name ORDER BY calls DESC", (days,)).fetchall()
        errors = c.execute(
            "SELECT tool_name, LEFT(error, 160) AS error, COUNT(*) AS n, MAX(created_at) AS last_at "
            "FROM ai_tool_calls WHERE NOT ok AND created_at >= NOW() - make_interval(days => %s) "
            "GROUP BY tool_name, LEFT(error, 160) ORDER BY n DESC LIMIT 20", (days,)).fetchall()
        daily = c.execute(
            "SELECT date_trunc('day', m.created_at)::date AS day, COUNT(*) FILTER (WHERE m.kind = 'text') AS questions, "
            "COUNT(DISTINCT cv.broker_id) AS brokers, "
            "COALESCE(SUM((m.usage->>'input_tokens')::bigint), 0) AS input_tokens, "
            "COALESCE(SUM((m.usage->>'output_tokens')::bigint), 0) AS output_tokens, "
            "COALESCE(SUM((m.usage->>'cache_read_input_tokens')::bigint), 0) AS cache_read, "
            "COALESCE(SUM((m.usage->>'cache_creation_input_tokens')::bigint), 0) AS cache_write "
            "FROM ai_messages m JOIN ai_conversations cv ON cv.id = m.conversation_id "
            "WHERE m.created_at >= NOW() - make_interval(days => %s) GROUP BY 1 ORDER BY 1 DESC", (days,)).fetchall()
        feedback = c.execute(
            "SELECT COUNT(*) FILTER (WHERE rating > 0) AS good, COUNT(*) FILTER (WHERE rating < 0) AS bad, "
            "COUNT(*) FILTER (WHERE status = 'new') AS open FROM ai_feedback "
            "WHERE created_at >= NOW() - make_interval(days => %s)", (days,)).fetchone()
        totals = c.execute(
            "SELECT (SELECT COUNT(*) FROM ai_conversations WHERE created_at >= NOW() - make_interval(days => %s)) AS conversations, "
            "(SELECT COUNT(DISTINCT broker_id) FROM ai_conversations WHERE updated_at >= NOW() - make_interval(days => %s)) AS active_brokers, "
            "(SELECT COUNT(*) FROM ai_actions WHERE created_at >= NOW() - make_interval(days => %s)) AS actions_proposed, "
            "(SELECT COUNT(*) FROM ai_actions WHERE status = 'executed' AND created_at >= NOW() - make_interval(days => %s)) AS actions_executed, "
            "(SELECT COUNT(*) FROM ai_digests WHERE enabled) AS digests_enabled, "
            "(SELECT COUNT(*) FROM ai_alerts WHERE enabled) AS alerts_enabled, "
            "(SELECT COUNT(*) FROM ai_alert_events WHERE created_at >= NOW() - make_interval(days => %s)) AS alert_events, "
            "(SELECT COUNT(*) FROM ai_knowledge WHERE status = 'active') AS rules_active",
            (days, days, days, days, days)).fetchone()
        slow = c.execute(
            "SELECT t.tool_name, t.duration_ms, t.created_at, t.broker_id FROM ai_tool_calls t "
            "WHERE t.created_at >= NOW() - make_interval(days => %s) AND t.duration_ms IS NOT NULL "
            "ORDER BY t.duration_ms DESC LIMIT 10", (days,)).fetchall()
    return {"days": days, "tools": tools, "errors": errors, "daily": daily, "feedback": feedback, "totals": totals, "slowest": slow}


def eval_candidates(limit: int = 200) -> list[dict[str, Any]]:
    """Real questions worth turning into eval cases: well-rated answers (as
    reference) and complaints that were promoted into rules (regressions to
    guard against)."""
    with _conn() as c:
        return c.execute(
            "SELECT f.id, f.rating, f.status, f.comment, f.question, f.answer, f.created_at, k.title AS rule_title "
            "FROM ai_feedback f LEFT JOIN ai_knowledge k ON k.feedback_id = f.id "
            "WHERE COALESCE(f.question, '') <> '' AND (f.rating > 0 OR f.status = 'promoted') "
            "ORDER BY f.created_at DESC LIMIT %s", (max(1, min(1000, limit)),)).fetchall()


def usage_today(broker_id: int) -> dict[str, int]:
    with _conn() as c:
        row = c.execute(
            "SELECT COALESCE(SUM((m.usage->>'input_tokens')::bigint), 0) AS input_tokens, "
            "       COALESCE(SUM((m.usage->>'output_tokens')::bigint), 0) AS output_tokens "
            "FROM ai_messages m JOIN ai_conversations cv ON cv.id = m.conversation_id "
            "WHERE cv.broker_id = %s AND m.role = 'assistant' AND m.created_at >= date_trunc('day', NOW())",
            (broker_id,),
        ).fetchone()
    return {"input_tokens": int(row["input_tokens"]), "output_tokens": int(row["output_tokens"])}
