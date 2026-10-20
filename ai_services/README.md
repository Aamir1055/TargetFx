# BrokerEye AI service

Conversational assistant ("Ask AI") for brokers, built on the Claude API
(`claude-sonnet-5-5` by default; Opus 5.5 / Haiku 5.5 via `AI_MODEL`) with tool
use over the existing BrokerEye broker APIs.

```
Browser / Telegram ──SSE──▶ ai_service (Python, FastAPI, Anthropic SDK)
                                  │  tools = BrokerEye REST calls with the broker's own JWT
                                  ▼
                            BrokerEye (C++ Drogon)  ──▶ Postgres / MT5
```

Why a separate process: the agent loop (model ⇄ tools, several rounds,
30 s–minutes with thinking) must never run on the Drogon event loop that
serves trading data and the WebSocket feed. The AI service can be restarted,
scaled or killed without touching BrokerEye.

## Security model

* The broker's JWT is **forwarded** on every tool call. The AI can only read
  what BrokerEye already lets that broker read; there is no separate DB access
  path and no SQL written by the model.
* All tools are read-only. Nothing in this service mutates MT5 or BrokerEye.
* Tool results are capped (rows + bytes) and always carry server-computed
  `totals`, so figures in answers come from BrokerEye, not from the model.
* Every tool call is logged to `ai_tool_calls` (broker, tool, input, ok,
  duration); every model turn's token usage is stored on `ai_messages`.
* Hidden client columns: `address`, `state`, `zipCode`, `company` are removed
  from every tool result and exported file (`tools._scrub`), whatever the
  backend returns, and the prompt tells the model not to infer them.
* Agent (IB) brokerage: group commission rules with `mode = "agent"` are shown
  only when BrokerEye reports `agentCommissionsVisible: true` (the broker can
  see the agent account); otherwise they are dropped and the model is told to
  say they are not visible.
* Admin changes to AI rules (`/ai/admin/knowledge*`, promote / dismiss) are
  written to BrokerEye's `audit_logs` (`AI_RULE_*`, category `rules`) with
  old / new values and the admin's IP.
* A refusal by Anthropic's safety classifiers is retried server-side on the
  recommended fallback model (`fallbacks="default"`), so a false positive is
  not an outage.

## Setup

```powershell
cd D:\CppDev\Projects\BrokerEye\ai_service
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
copy .env.example .env     # then edit: ANTHROPIC_API_KEY, DATABASE_URL, BROKEREYE_BASE_URL
```

Apply the DB migration (BrokerEye's auto-migrations pick up
`migrations/020_add_ai_chat.sql` on next start; or run it with psql).

Run:

```powershell
.venv\Scripts\python -m brokereye_ai.main
```

Open <http://localhost:8090/> and sign in with a BrokerEye broker username
and password (2FA is supported). The page relays the login to BrokerEye
through `POST /ai/login` / `/ai/login/2fa` and keeps the access + refresh
tokens in the browser only; "Have a token? Paste it instead" still accepts a
raw broker JWT. The chat page (`static/index.html`) is a single file with
no build step: sidebar with grouped history and search, streaming Markdown
answers with tables, charts and file cards, a collapsible "worked for Ns"
block that lists the lookups made, copy / thumbs / retry on every answer,
light and dark themes, and a phone layout with a drawer sidebar.

## API

All routes need `Authorization: Bearer <broker JWT>` except the sign-in
relays (`POST /ai/login`, `/ai/login/2fa`, `/ai/login/refresh`), which
forward to BrokerEye's broker auth endpoints and return their `data`.

| Route | Purpose |
|---|---|
| `POST /ai/chat` `{message, conversation_id?}` | Run one turn; streams Server-Sent Events |
| `GET /ai/conversations` | The broker's chats + today's token usage |
| `GET` / `POST` / `DELETE /ai/preferences[/{id}]` | What the assistant remembers about the broker (notes, max 20) |
| `GET /ai/actions/{id}`, `POST /ai/actions/{id}/confirm`, `POST /ai/actions/{id}/cancel` | Credit operations the assistant proposed; confirm applies them through BrokerEye with the broker's token |
| `GET` / `POST /ai/digests`, `PUT` / `DELETE /ai/digests/{id}`, `POST /ai/digests/{id}/run` | Scheduled digests (max 5 per broker) |
| `POST /ai/uploads` (multipart `file`) | Attach a CSV / Excel / text file; returns `{id, filename, columns, row_count, login_column, login_count, preview}`; send the id in `attachments` of the next `/ai/chat` (max 5, 24 h TTL, 8 MB) |
| `GET` / `POST /ai/alerts`, `PUT` / `DELETE /ai/alerts/{id}`, `GET /ai/alerts/events`, `POST /ai/alerts/events/seen` | Alerts (max 10 per broker) and their hits |
| `GET /ai/conversations/{id}/messages` | Transcript for the UI |
| `DELETE /ai/conversations/{id}` | Archive a chat |
| `GET /ai/bills/{week_id}/{login}.{pdf\|xlsx\|csv}` | A settlement bill statement as a file, straight from BrokerEye (no model call) |
| `GET /ai/clients/{login}/panel` | The client side panel: balances, rule tags, pending temporary credits, open positions, last 7 days, which actions the broker's rights allow |
| `GET` / `POST /ai/saved`, `DELETE /ai/saved/{id}` | Saved questions (navigation + Ctrl+K palette, max 30) |
| `GET` / `POST /ai/pins`, `DELETE /ai/pins/{id}`, `POST /ai/pins/{id}/refresh` | Pinned answers on Home (max 6); refresh re-asks the question in a hidden conversation of channel `pin` |
| `GET /ai/status` | Status footer: BrokerEye reachability, scheduler and next digest, alerts enabled, number format |
| `GET /health` | Liveness |

SSE events (`event:` name = `type`):

| type | payload | when |
|---|---|---|
| `meta` | `conversation_id`, `model` | first |
| `progress` | `text` | the model's short note before a tool call |
| `tool_start` / `tool_end` | `name`, `id`, (`ok`, `error`, `bytes`) | each tool call |
| `text` | `delta` | answer tokens |
| `usage` | token counts incl. `cache_read_input_tokens` | after each model turn |
| `done` | `text` (full answer) | end |
| `suggestions` | `items` (up to 3 follow-up questions) | after `done`, when `AI_SUGGESTIONS` is on |
| `action` | `action` (card: id, kind, label, summary, payload.details, status, expires_at; temporary credit also `payload.revert_point` / `payload.reverts_at_text` = the server's weekly revert point, no expiry fields) | a credit operation or a rule (kinds `apply_rule`, `remove_rule`, `bulk_rules` with `payload.items`) waiting for the broker's Confirm |
| `bill` | `data` (week, bills[{login, name, currency, gross, brokerage, net, symbols[], trades[]}], skipped) | a settlement bill statement card |
| `title` | `title` | after the first turn |
| `error` | `message` | on failure (stream still ends normally) |

A second `POST /ai/chat` for the same broker while one is running returns 409.

## Tools (what the model can do)

`search_clients`, `get_client_overview`, `search_open_positions`,
`net_positions_by_exchange`, `margin_call_accounts`, `search_deals`,
`aggregate_deals`, `summary_report`, `deposit_withdrawal_report`,
`credit_report`, `agent_details_report`, `get_group_settings`,
`credit_position` (limits / used / available credit), `temp_credits`
(temporary credits and their expiry), `compare_periods` (two date ranges
side by side with the change, optionally per exchange / symbol / login /
day), `update_preferences` (the broker's memory, see below), `read_upload` (rows
or the login list of a file the user attached), `render_chart`,
`export_table`, `export_report`, `client_rules`, `propose_rule_action`,
`settlement_weeks`, `settlement_bill`, `bill_summary` — see `brokereye_ai/tools.py`. Each data
tool wraps one existing `/api/broker/...` endpoint, so adding a tool is ~20
lines. Nothing changes anything in BrokerEye.

Actions: `propose_credit_action` never changes anything itself. It validates
the request (account accessible, within the credit limits), stores a proposal
in `ai_actions` (migration 028, expires after `AI_ACTION_TTL_MINUTES`, default
15) and the UI shows a card. `POST /ai/actions/{id}/confirm` makes this
service call `/api/broker/clients/{login}/credit-in|credit-out|temp-credit-in|
temp-credit-out` with the broker's own token and the browser's IP in
`X-Forwarded-For`, so rights, limits and the audit row are BrokerEye's. The
outcome is fed to the model in the next user turn. Temporary credit takes no
expiry: BrokerEye reverts it at the next weekly revert
point (`custom_config.temp_credit_revert`, Sunday 00:00 in the configured
timezone by default); the card shows that point (`payload.revert_point`,
`payload.reverts_at_text`, taken from `temp_credit_revert` of the credit
position) and the model is told never to ask for a weekday or time. Confirm
refuses (`failed`) a temporary-credit card whose revert point has passed since
it was shown, or one an older build prepared with its own weekday / time.

Cards (credit, rules, account actions) are prepared in every interactive turn
(the bot's token carries the broker's rights, like the portal login's, so the
same cards are offered as in the web chat):
the web chat (`POST /ai/chat`) and the Telegram bot (`POST /ai/chat/complete`
returns them as `actions[]`; the bot draws Confirm / Cancel buttons and calls
`/ai/actions/{id}/confirm` with a broker token of its own). Automated runs, a
scheduled digest or a pinned tile, have nobody to confirm, so the propose_*
tools refuse there (`agent.run_turn(..., interactive=False)`). When the bot
confirms it sends `X-BrokerEye-Channel: telegram` and `X-Telegram-Chat-Id`, and
the call to BrokerEye carries the user agent `Telegram chat <id> (confirmed in
Ask AI)`, so the broker audit log shows the action under the Telegram channel.

Manager rules: the rules come from the back office's list (`GET
/api/broker/rules`: code, name, the MT5 field and value template), so a custom
rule (for example one that writes Country = "U.A.E.") is handled like the
four standard ones. `client_rules` reads the rules on one login (BrokerEye
keeps them in step with MT5) and lists the available ones; client rows from
`search_clients` / `margin_call_accounts` carry `rules` tags for the standard
markers ("Close Only", "Liquidate", "No Pending", "Non-SQ 5m"), used only
while a standard code still writes its standard marker. `propose_rule_action(apply|remove, rule, logins[,
minutes])` checks the `manage_rules` right, client access and what each
account already has, then stores one card: a single-account card
(`apply_rule` / `remove_rule`) or, for several logins (max 50), a
`bulk_rules` card with one Confirm and a per-row outcome. Confirm calls
`POST /api/broker/clients/{login}/rules` or `DELETE .../rules/{code}` for each
row with the broker's token; a failure on one row does not stop the others.
Whether an account already has the rule comes from its active rule rows,
plus the live tags for a standard rule.

Account actions: `propose_account_action(action, login)` prepares
disable_trading / enable_trading (MT5 trade-disabled flag), disable_account /
enable_account (MT5 login flag) and reset_trading_password /
reset_investor_password; `account_status` reads the flags. Each needs the
matching `mt5.*` broker right (`mt5.trading_disable`, `mt5.account_enable`,
`mt5.trading_password_change`, … re-asserted in `broker_rights` at every
BrokerEye start) and goes through the same card and
`POST /ai/actions/{id}/confirm`. For a password reset the broker types or
generates the new password on the card; it is sent only in the confirm body
(`{"password": …}`), validated (8-64 chars, a letter and a digit) and never
stored or shown to the model.

Settlement bills: `settlement_weeks` lists the admin-defined weeks (the
current one flagged); `settlement_bill(logins, week, format?)` returns the
per-symbol statement from `POST /api/broker/bills` as a `bill` card and,
with a format, as a file; `bill_summary` is Gross / Brokerage / Net per login
with totals; `export_report("bill_summary", week=…)` delivers the whole list.
Week selectors: `current`, `last`, an id, a date inside the week, or part of
the name (`bills.py`).

Scheduled digests: `ai_digests` (migration 029). `manage_digests` (or the
Digests dialog) stores a standing instruction with a time and weekdays. The
in-process scheduler (`scheduler.py`, every 30 s, `AI_SCHEDULER`) runs due
digests as a fresh conversation of channel `digest` — visible in the chat
list — using a broker token it mints itself with BrokerEye's JWT secret
(`service_auth.py`; the same claims the Telegram bot uses for /askai, no
rights, 30 min) and sends the answer with BrokerEye's Telegram bot when the
broker has linked Telegram (`delivery.py`). Both secrets come from
`config.json` via `BROKEREYE_CONFIG`, or `BROKEREYE_JWT_SECRET` /
`TELEGRAM_BOT_TOKEN`. Digests only read data.

Alerts: `ai_alerts` + `ai_alert_events` (migration 030). `manage_alerts` (or
the Alerts dialog) stores a condition — margin level, equity, balance,
floating loss, deposit / withdrawal size, available credit, temporary credit
about to reverse — with a check interval and a cooldown. `alerts.py` runs the
due checks on the scheduler thread straight against the broker API with a
minted session (no model call, so they are free), writes one event per new
login / deal and sends it to Telegram when linked. The web UI shows events
under the bell (polled every minute).

Memory: `ai_broker_preferences` (migration 027) holds up to 20 short notes
per broker ("INR in lakh / crore", "my key clients are …"). The model saves
and removes them with `update_preferences` when the user says "remember" /
"forget"; the web UI has a Memory dialog in the account menu. The notes are
a third cached system block, so they cost nothing until they change.

## Tuning

| Setting | Default | Note |
|---|---|---|
| `AI_MODEL` | `claude-sonnet-5-5` | `claude-opus-5-5` for the best answers ($4/$20 per MTok), `claude-haiku-5-5` cheapest ($0.10/$0.50) |
| `AI_EFFORT` | `medium` | `low` is faster/cheaper for simple chat; `high` for heavy analysis |
| `AI_MAX_TOOL_ROUNDS` | 12 | hard cap on model⇄tool rounds per turn |
| `AI_TIMEZONE` | `custom_config.timezone` of config.json, else `Asia/Kolkata` | how "today / this week" and report dates are interpreted; also the DB session zone |
| `AI_SUGGESTIONS` | `true` | follow-up question chips under each answer (one extra cheap call per turn) |
| `AI_SCHEDULER` | `true` | run the digest scheduler in this process (one instance only) |
| `BROKEREYE_JWT_SECRET` / `TELEGRAM_BOT_TOKEN` | from `BROKEREYE_CONFIG` | needed for unattended digests and Telegram delivery |
| `AI_CLIENT_LINK_TEMPLATE` | empty | e.g. `https://panel.example.com/clients/{login}`: logins in answers get an "open in Broker Eye" link; empty = clicking a login asks for the client overview in the chat |
| `tool_max_rows` / `tool_max_result_chars` | 200 / 60 000 | per-tool result caps |

Prompt caching: the system prompt and tool list are the cached prefix
(`cache_control` on the system block + automatic caching on the conversation
tail). Check `usage.cache_read_input_tokens` in the stream — it should be
non-zero from the second request onwards. Do not interpolate anything
per-request into `prompts.py`; the date and broker name go into the user turn.

## Metrics and evaluation

The admin page (`/admin`, admin JWT) has a **Metrics** tab backed by
`GET /ai/admin/metrics?days=7`: per-tool calls, error rate, average and p95
latency, result size; grouped error messages; per-day questions, brokers and
token use with the cache hit rate; feedback counts; credit actions, digests,
alerts. A tool error rate above 5 % or a cache rate under 50 % is highlighted.

`evals/cases.jsonl` holds the regression cases (one JSON object per line:
the message plus the tools the answer must use, an optional regex, file /
chart counts). Run them against a live service with a broker token for a
test broker — every case is a real model turn and costs tokens:

```
python -m evals.run_eval --base http://127.0.0.1:8090 --token <broker JWT>
python -m evals.run_eval --token ... --filter credit --json report.json
python -m evals.run_eval --token ... --list        # no cost
```

Exit code 1 on any failure, so it can gate a deploy. Add cases from real
usage with the admin page's **Download eval candidates** (well-rated answers
and promoted complaints, as JSON Lines) after writing the expectations.

## Roadmap

1. **Phase 1 (this):** chat with tools, persistence, streaming, test page.
2. **Phase 2:** Telegram `/askai` → this service; exports in chat (reuse the
   C++ report renderer via a `run_custom_report` tool returning a download
   link); suggested follow-ups; admin audit page over `ai_tool_calls`.
3. **Phase 3:** eval set from the broker question bank (expected numbers from
   the DB) run on every prompt change; per-broker daily token budget; rate
   limits; server-side compaction for very long chats.
