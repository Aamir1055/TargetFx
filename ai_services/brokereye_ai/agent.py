"""One chat turn: user text -> (model <-> tools)* -> streamed answer.

Runs synchronously on a worker thread (the tool runner is sync) and yields
UI events as plain dicts; main.py turns them into Server-Sent Events.

History is append-only: every assistant reply and every tool-result turn is
persisted exactly as sent, including thinking blocks, so replays are
byte-identical and the prompt cache (and preserved thinking) keep working.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Iterator
from zoneinfo import ZoneInfo

import anthropic

from . import brokereye, store, tools, uploads
from .config import settings
from .prompts import SYSTEM_PROMPT

log = logging.getLogger("brokereye_ai.agent")

def _model_params(model: str) -> dict[str, Any]:
    """Request parameters that depend on the model family.

    Opus / Sonnet / Fable: adaptive thinking with progress-update display,
    plus server-side refusal fallbacks ("default" routing).
    Haiku: adaptive thinking only — it has neither progress updates nor a
    server-side fallback, and sending those parameters would be rejected.
    """
    name = model.lower()
    if "haiku" in name:
        return {"thinking": {"type": "adaptive"}, "betas": []}
    return {
        "thinking": {"type": "adaptive", "display": "updates"},
        "fallbacks": "default",
        "betas": [
            "server-side-fallback-2026-07-01",      # a classifier false-positive is retried, not an outage
            "thinking-display-updates-2026-08-18",  # progress notes between tool calls ("Fetching deals…")
        ],
    }


_client: anthropic.Anthropic | None = None


def client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        cfg = settings()
        headers = {"anthropic-workspace-id": cfg.anthropic_workspace_id} if cfg.anthropic_workspace_id else None
        _client = anthropic.Anthropic(api_key=cfg.anthropic_api_key or None, default_headers=headers)
    return _client


def _usage_dict(message: Any) -> dict[str, Any]:
    u = message.usage
    return {
        "input_tokens": getattr(u, "input_tokens", 0) or 0,
        "output_tokens": getattr(u, "output_tokens", 0) or 0,
        "cache_read_input_tokens": getattr(u, "cache_read_input_tokens", 0) or 0,
        "cache_creation_input_tokens": getattr(u, "cache_creation_input_tokens", 0) or 0,
    }


def _text_of(message: Any) -> str:
    return "".join(b.text for b in message.content if b.type == "text")


_CHANNEL_HINTS = {
    "telegram": ("Channel: Telegram on a phone. Your Markdown is shown as a Telegram rich message, "
                 "which renders real tables, headings, quotes and collapsible sections, so present data "
                 "visually rather than as prose. Layout: "
                 "(1) Open with a one-line headline answer with the key figure in bold and a status icon "
                 "(🟢 good / profit, 🔴 bad / loss, ⚠️ needs attention). "
                 "(2) Sections start with '### ' + a fitting emoji (### 📊 Summary, ### 💰 Totals, "
                 "### ⚠️ Margin call, ### 🏆 Top clients). "
                 "(3) Any figures for two or more clients, symbols or days go in a Markdown TABLE, never "
                 "one line per client: at most 4 columns, the login in `code`, numeric columns right-aligned "
                 "(|---:|), amounts compact (₹1.25L, ₹45.2K, -₹3.1K), a status icon or ▲/▼ in the figure "
                 "cell, and a last **Total** row in bold when totals make sense. A single client's figures "
                 "go in a two-column table (Field | Value). "
                 "(4) More than ~12 rows: show the top rows, then put the rest inside "
                 "<details><summary>All N clients</summary> ... </details> (Markdown works inside), or "
                 "offer a file when it is longer than ~40 rows. "
                 "(5) The date range and caveats go in one '> ' quote line; separate big sections with ---. "
                 "(6) End with one short follow-up suggestion. "
                 "Do not use task lists ('- [ ]': Telegram draws every box ticked), LaTeX or '$' math, or "
                 "HTML other than <details>/<summary>. "
                 "The web chat's client dashboard and settlement statement card are not shown on "
                 "Telegram: give their key figures (a bill's per-symbol lots, P&L and brokerage) as a "
                 "table in the text."),
}
# Added to an interactive Telegram turn: the bot draws cards as buttons and
# sends files as documents.
_TELEGRAM_CARDS_HINT = (" Confirmation cards work here: the bot shows each one below your answer with "
                        "Confirm / Cancel buttons (for a password reset the broker generates or types the "
                        "password after tapping), so propose credit, rule and account actions as usual. "
                        "Files reach the chat as documents: send the bill as a PDF when the user wants the "
                        "full statement.")
# Added to every automated turn (scheduled digest, pinned tile).
_AUTOMATED_HINT = (" This run is automated: nobody can confirm a card, so never propose credit, rule or "
                   "account actions; report the figures only.")
# Added to an automated Telegram turn (a digest): only text and charts are delivered.
_TELEGRAM_AUTOMATED_HINT = (" Files (PDF, Excel) are not delivered to Telegram in this run: put the key "
                            "figures in the text and do not offer or mention an attachment.")


def _user_turn(user_text: str, session: brokereye.Session, channel: str, conversation_id: str = "",
               attachments: list[str] | None = None, interactive: bool = True) -> list[dict[str, Any]]:
    now = datetime.now(ZoneInfo(settings().ai_timezone))
    context = (
        f"Current date and time: {now:%A, %d %B %Y %H:%M} ({settings().ai_timezone}). "
        f"You are talking to broker \"{session.display_name or session.username}\"."
    )
    hint = _CHANNEL_HINTS.get(channel)
    if hint:
        context += " " + hint
    if not interactive:
        context += _AUTOMATED_HINT
        if channel == "telegram":
            context += _TELEGRAM_AUTOMATED_HINT
    elif channel == "telegram":
        context += _TELEGRAM_CARDS_HINT
    if conversation_id:
        outcomes = store.pop_unreported_actions(conversation_id)
        if outcomes:
            parts = []
            for o in outcomes:
                line = f"{o['summary']} -> {o['status']}"
                res = o.get("result") or {}
                if o["status"] == "executed" and res.get("deal_id"):
                    line += f" (deal {res['deal_id']})"
                tc = res.get("temp_credit") or {}
                if o["status"] == "executed" and tc.get("expires_at_text"):
                    line += f" (reverts {tc['expires_at_text']})"
                if isinstance(res.get("done"), int):
                    line += f" ({res['done']} done, {res.get('failed', 0)} failed, {res.get('skipped', 0)} skipped)"
                    fails = [f"{i.get('login')}: {i.get('error')}" for i in (res.get("items") or []) if i.get("status") == "failed"][:5]
                    if fails:
                        line += " [" + "; ".join(fails) + "]"
                if o.get("error"):
                    line += f": {o['error']}"
                parts.append(line)
            context += (" Outcome of the actions you proposed earlier (decided by the broker on the card): "
                        + "; ".join(parts) + ". Take it as fact; mention it briefly only if relevant.")
    blocks: list[dict[str, Any]] = [{"type": "text", "text": context}]
    for upload_id in attachments or []:
        doc = uploads.load_upload(session.broker_id, upload_id)
        if not doc:
            continue
        blocks.append({"type": "text", "text": uploads.describe_for_model(doc)})
        if doc.get("kind") == "image" and doc.get("data_b64"):
            blocks.append({"type": "image", "source": {"type": "base64",
                                                        "media_type": doc.get("media_type", "image/png"),
                                                        "data": doc["data_b64"]}})
    blocks.append({"type": "text", "text": user_text})
    return blocks


def _system_blocks(broker_id: int) -> list[dict[str, Any]]:
    """The frozen prompt (cached across every broker) plus the admin-maintained
    rules for this broker as a second cached block. Rendered deterministically
    so the cache only invalidates when an admin changes a rule."""
    blocks: list[dict[str, Any]] = [
        {"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}},
    ]
    rules = store.knowledge_for(broker_id)
    if rules:
        lines = ["## Rules maintained by the back office",
                 "These are authoritative and override the defaults above when they conflict. Apply them "
                 "without being asked and without mentioning that they are rules."]
        for r in rules:
            tag = {"rule": "Rule", "fact": "Fact", "glossary": "Term", "example": "Example"}.get(r["kind"], "Rule")
            lines.append(f"- {tag} — {r['title']}: {r['content']}")
        blocks.append({"type": "text", "text": "\n".join(lines), "cache_control": {"type": "ephemeral"}})
    # The broker's own memory: a third cached block that only changes when the
    # broker saves or removes a note (update_preferences / the Memory dialog).
    prefs = store.list_preferences(broker_id)
    if prefs:
        lines = ["## What this broker asked you to remember",
                 "The broker's own standing preferences. Apply them without being asked; the broker can change "
                 "them by telling you (update_preferences) or in the Memory dialog."]
        lines.extend(f"- {p['note']}" for p in prefs)
        blocks.append({"type": "text", "text": "\n".join(lines), "cache_control": {"type": "ephemeral"}})
    return blocks


def run_turn(session: brokereye.Session, conversation_id: str, user_text: str,
             channel: str = "web", attachments: list[str] | None = None,
             interactive: bool = True) -> Iterator[dict[str, Any]]:
    """interactive: a person sees this turn's cards (web chat, Telegram bot);
    False for automated runs (digests, pinned tiles), where actions are refused."""
    cfg = settings()
    brokereye.current_session.set(session)
    brokereye.current_conversation.set(conversation_id)
    brokereye.current_channel.set(channel)
    brokereye.current_interactive.set(interactive)

    history = store.load_messages(conversation_id)
    first_turn = not history
    user_content = _user_turn(user_text, session, channel, conversation_id, attachments, interactive)
    shown = user_text
    for upload_id in attachments or []:
        doc = uploads.load_upload(session.broker_id, upload_id)
        if doc:
            shown += (f"\n\n📎 {doc['filename']}" if doc.get("kind") == "image"
                      else f"\n\n📎 {doc['filename']} ({doc['row_count']} rows)")
    store.append_message(conversation_id, role="user", kind="text", content=user_content, display_text=shown)
    history.append({"role": "user", "content": user_content})
    system_blocks = _system_blocks(session.broker_id)

    yield {"type": "meta", "conversation_id": conversation_id, "model": cfg.ai_model}

    final_text = ""
    final_seq: int | None = None
    json_retries = 0
    while True:  # restarted only when the SDK could not parse a streamed tool input
        try:
            runner = client().beta.messages.tool_runner(
                model=cfg.ai_model,
                max_tokens=cfg.ai_max_tokens,
                system=system_blocks,
                messages=history,
                tools=tools.TOOLS,
                stream=True,
                output_config={"effort": cfg.ai_effort},
                cache_control={"type": "ephemeral"},   # automatic breakpoint on the growing conversation tail
                max_iterations=cfg.ai_max_tool_rounds,
                **_model_params(cfg.ai_model),
                metadata={"user_id": f"broker:{session.broker_id}"},
            )

            for stream in runner:
                turn_text: list[str] = []
                for event in stream:
                    et = event.type
                    if et == "content_block_start":
                        cb = event.content_block
                        if cb.type == "tool_use":
                            yield {"type": "tool_start", "name": cb.name, "id": cb.id}
                    elif et == "content_block_delta":
                        d = event.delta
                        if d.type == "text_delta" and d.text:
                            turn_text.append(d.text)
                            yield {"type": "text", "delta": d.text}
                        elif d.type == "thinking_delta" and d.thinking:
                            yield {"type": "progress", "text": d.thinking}

                message = stream.get_final_message()
                usage = _usage_dict(message)
                text = _text_of(message) or "".join(turn_text)
                tool_uses = [b for b in message.content if b.type == "tool_use"]

                final_seq = store.append_message(
                    conversation_id, role="assistant", kind="assistant",
                    content=message.to_dict(mode="json")["content"], display_text=text,
                    model=message.model, stop_reason=message.stop_reason, usage=usage,
                )
                history.append({"role": "assistant", "content": message.to_dict(mode="json")["content"]})
                yield {"type": "usage", **usage}

                if message.stop_reason == "refusal":
                    yield {"type": "error", "message": "The assistant declined this request."}
                    return
                if not tool_uses:
                    final_text = text
                    break
                if message.stop_reason == "max_tokens":
                    yield {"type": "error", "message": "The answer was cut off (max_tokens). Try a narrower question."}
                    return

                tools.pop_durations()
                tool_response = runner.generate_tool_call_response()
                durations = tools.pop_durations()
                if tool_response is None:
                    final_text = text
                    break

                results = tool_response["content"]
                content_blocks = results if isinstance(results, list) else [results]
                by_id = {b.id: b for b in tool_uses}
                for i, block in enumerate(content_blocks):
                    if not isinstance(block, dict) or block.get("type") != "tool_result":
                        continue
                    tu = by_id.get(block.get("tool_use_id"))
                    raw = block.get("content")
                    raw_text = raw if isinstance(raw, str) else json.dumps(raw, default=str)
                    error = None
                    if block.get("is_error"):
                        error = raw_text[:500]
                    elif raw_text.startswith('{"error"'):
                        try:
                            error = json.loads(raw_text).get("error")
                        except ValueError:
                            error = raw_text[:500]
                    ok = error is None
                    name = tu.name if tu else "?"
                    store.log_tool_call(conversation_id, session.broker_id, name, tu.input if tu else None,
                                        ok, durations[i] if i < len(durations) else None, len(raw_text), error)
                    yield {"type": "tool_end", "name": name, "id": block.get("tool_use_id"), "ok": ok,
                           "error": error, "bytes": len(raw_text)}
                    if ok and name == "render_chart":
                        try:
                            info = json.loads(raw_text)
                            yield {"type": "chart", "id": info["chart_id"], "title": info.get("title", ""),
                                   "url": f"/ai/files/{info['chart_id']}.png",
                                   "spec": store.chart_spec(tu.input if tu else None)}
                        except (ValueError, KeyError):
                            pass
                    elif ok and name in ("export_table", "export_report", "settlement_bill"):
                        try:
                            info = json.loads(raw_text)
                            if info.get("bill_card"):
                                yield {"type": "bill", "data": info["bill_card"]}
                            if info.get("file_id"):
                                yield {"type": "file", "id": info["file_id"], "filename": info["filename"],
                                       "format": info.get("format", ""), "rows": info.get("rows", 0),
                                       "bytes": info.get("bytes", 0), "url": info["url"]}
                        except (ValueError, KeyError, AttributeError):
                            pass
                    elif ok and name in ("propose_credit_action", "propose_rule_action", "propose_account_action"):
                        try:
                            card = json.loads(raw_text).get("card")
                            if card:
                                store.set_action_seq(card["id"], final_seq)
                                yield {"type": "action", "action": card}
                        except (ValueError, AttributeError, KeyError):
                            pass
                    elif ok and name == "get_client_overview":
                        try:
                            dash = json.loads(raw_text).get("dashboard")
                            if dash:
                                yield {"type": "dashboard", "data": dash}
                        except (ValueError, AttributeError):
                            pass

                store.append_message(conversation_id, role="user", kind="tool_results", content=content_blocks)
                history.append({"role": "user", "content": content_blocks})
            break

        except ValueError as e:
            # Eager input streaming: JSON the SDK could not parse at all. Nothing
            # partial was persisted, so restart the turn from the stored history.
            json_retries += 1
            log.warning("unparseable tool input (%s), retry %d", e, json_retries)
            if json_retries > 2:
                yield {"type": "error", "message": "The assistant produced an invalid tool call twice; please retry."}
                return
            history = store.load_messages(conversation_id)
            continue
        except anthropic.RateLimitError:
            yield {"type": "error", "message": "The AI provider is rate-limiting us. Please retry in a minute."}
            return
        except anthropic.APIStatusError as e:
            log.error("Anthropic API error %s: %s", e.status_code, e.message)
            yield {"type": "error", "message": f"AI provider error ({e.status_code})."}
            return
        except anthropic.APIConnectionError:
            yield {"type": "error", "message": "Could not reach the AI provider."}
            return

    yield {"type": "done", "text": final_text, "seq": final_seq}

    if cfg.ai_suggestions and final_text:
        items = make_suggestions(user_text, final_text)
        if items:
            yield {"type": "suggestions", "items": items}

    if first_turn:
        title = make_title(user_text, final_text)
        if title:
            store.set_title(conversation_id, title)
            yield {"type": "title", "title": title}


def draft_rule_from_feedback(comment: str, question: str, answer: str) -> dict[str, str] | None:
    """Turn a user's correction into a concise, reusable rule for admins to
    approve. Cheap model, structured output; None when nothing general can
    be learned (e.g. a one-off data complaint)."""
    schema = {
        "type": "object",
        "properties": {
            "learnable": {"type": "boolean", "description": "true if a general rule can be derived from this feedback"},
            "title": {"type": "string"},
            "content": {"type": "string", "description": "One or two sentences, imperative, applicable to future answers"},
            "kind": {"type": "string", "enum": ["rule", "fact", "glossary", "example"]},
        },
        "required": ["learnable", "title", "content", "kind"],
        "additionalProperties": False,
    }
    try:
        resp = client().messages.create(
            model=settings().ai_title_model,
            max_tokens=400,
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": schema}},
            messages=[{
                "role": "user",
                "content": "A broker gave negative feedback on an answer from a brokerage back-office assistant. "
                           "Write ONE general, reusable instruction the assistant should follow in future so this "
                           "does not happen again (formatting, terminology, business rule, preferred tool, ...). "
                           "If the complaint is about a one-off figure or cannot be generalised, set learnable=false.\n\n"
                           f"User question:\n{question[:1500]}\n\nAssistant answer (excerpt):\n{answer[:1500]}\n\n"
                           f"User feedback:\n{comment[:1000]}",
            }],
        )
        if resp.stop_reason == "refusal":
            return None
        data = json.loads(next(b.text for b in resp.content if b.type == "text"))
        if not data.get("learnable"):
            return None
        return {"title": data["title"][:160], "content": data["content"], "kind": data.get("kind", "rule")}
    except Exception as e:  # drafting is best-effort
        log.warning("rule drafting failed: %s", e)
        return None


def make_suggestions(user_text: str, answer: str) -> list[str]:
    """Up to three follow-up questions for the chips under an answer (cheap
    model, low effort, structured output). Empty on any failure — the chips
    are a convenience, never worth failing or delaying the turn for."""
    schema = {
        "type": "object",
        "properties": {
            "suggestions": {"type": "array", "items": {"type": "string"}, "maxItems": 3,
                            "description": "0 to 3 follow-up questions; empty when none makes sense"},
        },
        "required": ["suggestions"],
        "additionalProperties": False,
    }
    try:
        resp = client().messages.create(
            model=settings().ai_title_model,
            max_tokens=250,
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": schema}},
            messages=[{
                "role": "user",
                "content": "A brokerage back-office user is chatting with an analyst assistant that can look up clients "
                           "and balances, open positions and exposure, deal history and totals, deposits / withdrawals, "
                           "credit (limits, available credit, temporary credits), agent (IB) commission and MT5 group "
                           "settings, and can draw charts and export Excel / PDF / CSV files.\n\n"
                           "Given the last question and answer, write up to 3 follow-up questions the user is likely to "
                           "ask next: each at most 12 words, a complete question that works on its own (repeat the login, "
                           "name or date range it refers to), in the user's language, no numbering. Prefer drilling down "
                           "(one client, one symbol, a chart, an export, the previous period) over repeating the question. "
                           "Return an empty list when the answer was an error, a clarifying question or small talk.\n\n"
                           f"User question:\n{user_text[:1200]}\n\nAssistant answer (excerpt):\n{answer[:2500]}",
            }],
        )
        if resp.stop_reason == "refusal":
            return []
        data = json.loads(next(b.text for b in resp.content if b.type == "text"))
        out: list[str] = []
        for s in data.get("suggestions") or []:
            s = str(s).strip().strip('"')
            if s and s not in out:
                out.append(s[:140])
        return out[:3]
    except Exception as e:  # noqa: BLE001 - best-effort
        log.warning("suggestions failed: %s", e)
        return []


def make_title(user_text: str, answer: str) -> str:
    """Short conversation title from the first exchange (cheap model, low effort)."""
    try:
        resp = client().messages.create(
            model=settings().ai_title_model,
            max_tokens=40,
            output_config={"effort": "low"},
            messages=[{
                "role": "user",
                "content": "Give a 3-6 word title for this chat. Reply with the title only, no quotes.\n\n"
                           f"User: {user_text[:600]}\n\nAssistant: {answer[:600]}",
            }],
        )
        if resp.stop_reason == "refusal":
            return ""
        title = "".join(b.text for b in resp.content if b.type == "text").strip().strip('"')
        return title[:80]
    except Exception as e:  # titles are cosmetic; never fail the turn over them
        log.warning("title generation failed: %s", e)
        return ""
