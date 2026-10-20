"""Tools the model can call. Each one is a thin, read-only wrapper over an
existing BrokerEye broker API, called with the broker's own token.

Design rules:
  * Results are JSON strings, capped in rows and bytes, and always carry the
    server-computed `totals` so the model never has to add rows itself.
  * Dates come in as YYYY-MM-DD (inclusive) and are converted to the epoch
    bounds BrokerEye expects, in the configured timezone.
  * Nothing here changes anything in BrokerEye. Keep it that way. The only
    write is update_preferences, which edits the AI service's own memory
    table for the broker who is talking.
  * Privacy: client address / state / zip / company never leave this module
    (see _scrub), and agent (IB) commission rules of a group are shown only
    when BrokerEye says the broker can see the agent account.
"""
from __future__ import annotations

import json
import re
import time
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from anthropic import beta_tool

from . import brokereye
from .config import settings

Filters = list[dict[str, Any]] | None
Logins = list[int] | None

# Fields of a client row worth showing the model (the full row has ~50).
_CLIENT_FIELDS = (
    "login", "name", "group", "accountType", "currency", "country", "liquidateType",
    "balance", "credit", "equity", "margin", "marginFree", "marginLevel", "profit",
    "floating", "pnl", "dailyPnL", "thisWeekPnL", "thisMonthPnL", "lifetimePnL",
    "tradingEnabled", "status", "email", "phone", "leverage", "rules",
)
_POSITION_FIELDS = (
    "login", "name", "position", "symbol", "exchange", "action", "volume", "priceOpen",
    "priceCurrent", "priceSL", "priceTP", "profit", "storage", "timeCreate", "comment",
)
# Compact: ~120 chars per row so 200 rows fit the result cap without truncation.
_DEAL_FIELDS = (
    "deal", "login", "time", "symbol", "action", "entry", "volume", "price",
    "profit", "storage", "commission", "comment",
)


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def _tz() -> ZoneInfo:
    return ZoneInfo(settings().ai_timezone)


def _day_start(d: str) -> int:
    return int(datetime.strptime(d, "%Y-%m-%d").replace(tzinfo=_tz()).timestamp())


def _day_end(d: str) -> int:
    nxt = datetime.strptime(d, "%Y-%m-%d").replace(tzinfo=_tz()) + timedelta(days=1)
    return int(nxt.timestamp()) - 1


def _range(from_date: str, to_date: str) -> tuple[int, int]:
    if not from_date or not to_date:
        raise ValueError("from_date and to_date are required (YYYY-MM-DD)")
    lo, hi = _day_start(from_date), _day_end(to_date)
    if lo > hi:
        raise ValueError("from_date must not be after to_date")
    return lo, hi


def _pick(row: dict[str, Any], fields: tuple[str, ...]) -> dict[str, Any]:
    out = {k: row[k] for k in fields if k in row}
    if isinstance(out.get("comment"), str) and len(out["comment"]) > 40:
        out["comment"] = out["comment"][:37] + "…"
    # keep the broker-share siblings when present, they are cheap and often asked for
    for k in fields:
        pk = f"{k}_percentage"
        if pk in row:
            out[pk] = row[pk]
    return out


# Client columns no broker may see through Ask AI, whatever the backend
# returns (MT5 stores internal markers in some of them, e.g. applied rules).
_HIDDEN_KEYS = frozenset({"address", "company", "zipCode", "zipcode", "zip_code", "zip"})
# "state" is also an order field (order state), so it is only dropped from
# client-like objects — those carrying any of these identity keys.
_CLIENT_MARKERS = ("group", "country", "city", "email", "phone", "liquidateType", "balance", "equity")


def _scrub(value: Any) -> Any:
    """Recursively remove hidden client columns from a tool payload."""
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        client_like = any(k in value for k in _CLIENT_MARKERS)
        for k, v in value.items():
            if k in _HIDDEN_KEYS or (client_like and k == "state"):
                continue
            out[k] = _scrub(v)
        return out
    if isinstance(value, list):
        return [_scrub(v) for v in value]
    return value


def _cap(rows: list[Any], limit: int | None = None) -> tuple[list[Any], bool]:
    cap = limit or settings().tool_max_rows
    return (rows[:cap], True) if len(rows) > cap else (rows, False)


def _result(payload: dict[str, Any]) -> str:
    payload = _scrub(payload)
    text = json.dumps(payload, ensure_ascii=False, default=str)
    cap = settings().tool_max_result_chars
    if len(text) > cap:
        # Keep as many rows as fit (not a blind quarter), and say exactly how
        # many were kept so the model can page with that as the limit.
        for key in ("rows", "clients", "deals", "positions", "accounts", "exchanges"):
            if key in payload and isinstance(payload[key], list) and payload[key]:
                rows = payload[key]
                per_row = max(1, (len(text) - 400) // len(rows))
                keep = max(5, min(len(rows), (cap - 600) // per_row))
                payload = {**payload, key: rows[:keep], "truncated": True, "returned": keep,
                           "note": f"Result too large: only the first {keep} of {len(rows)} rows are included. "
                                   f"Re-query with limit={keep} and page through, or use an aggregate tool "
                                   f"(aggregate_deals / the report tools) instead of raw rows."}
                break
        text = json.dumps(payload, ensure_ascii=False, default=str)
        if len(text) > cap:
            text = text[:cap]
    return text


def _error(msg: str) -> str:
    return json.dumps({"error": msg})


def _search_body(
    *, search: str, filters: Filters, sort_by: str, sort_order: str, limit: int, page: int,
    logins: Logins = None, extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "page": max(1, page),
        "limit": max(1, min(limit, settings().tool_max_rows)),
        "sortBy": sort_by,
        "sortOrder": "asc" if sort_order.lower() == "asc" else "desc",
    }
    if search:
        body["search"] = search
    if filters:
        body["filters"] = filters
    if logins:
        body["mt5Accounts"] = [int(x) for x in logins]
    if extra:
        body.update(extra)
    return body


def _rows_result(data: dict[str, Any], key: str, fields: tuple[str, ...] | None, limit: int, **extra: Any) -> str:
    raw = data.get(key) or []
    rows = [_pick(r, fields) for r in raw] if fields else raw
    rows, truncated = _cap(rows, limit)
    total = data.get("total", len(raw))
    return _result({
        key: rows,
        "returned": len(rows),
        "total": total,
        "truncated": truncated or (isinstance(total, int) and total > len(rows)),
        "page": data.get("page", 1),
        "pages": data.get("pages"),
        "totals": data.get("totals"),
        **extra,
    })


def _guard(fn, *args, **kwargs) -> str:
    """Run a tool body; turn backend/validation failures into an error payload
    the model can read and recover from instead of crashing the turn."""
    t0 = time.perf_counter()
    try:
        return fn(*args, **kwargs)
    except brokereye.BrokerEyeError as e:
        return _error(f"BrokerEye error: {e}")
    except ValueError as e:
        return _error(str(e))
    finally:
        _last_duration_ms.append(int((time.perf_counter() - t0) * 1000))


_last_duration_ms: list[int] = []


def pop_durations() -> list[int]:
    out = list(_last_duration_ms)
    _last_duration_ms.clear()
    return out


# ---------------------------------------------------------------------------
# tools
# ---------------------------------------------------------------------------
@beta_tool(eager_input_streaming=True)
def search_clients(
    search: str = "",
    filters: Filters = None,
    sort_by: str = "balance",
    sort_order: str = "desc",
    limit: int = 50,
    page: int = 1,
    currency: str = "Combined",
) -> str:
    """List / search the broker's client accounts with live balances. Call this when the user asks about clients, accounts, balances, equity, margin, PnL, who is in profit/loss, top N accounts, or wants to find a login by name/email/phone.

    Args:
        search: Free text matched against login, name, email, phone, group, country, comment (case-insensitive).
        filters: Field filters, each {"field", "operator", "value"}. Fields: balance, credit, equity, profit, floating, pnl, margin, marginFree, marginLevel, dailyPnL, thisWeekPnL, thisMonthPnL, lifetimePnL, leverage, login, name, email, phone, group, country, liquidateType, status, currency, accountType, processorType, tradingEnabled. Operators: equal, not_equal, greater_than, less_than, greater_than_or_equal, less_than_or_equal, contains, starts_with, ends_with, in (value = list).
        sort_by: Any field above (default balance).
        sort_order: "asc" or "desc".
        limit: Rows to return (1-200).
        page: Page number for paging through large result sets.
        currency: "Combined" (all), "INR" or "USD" to restrict by account currency.
    """
    def run() -> str:
        body = _search_body(search=search, filters=filters, sort_by=sort_by, sort_order=sort_order,
                            limit=limit, page=page, extra={"currency": currency})
        data = brokereye.post("/api/broker/clients/search", body)
        return _rows_result(data, "clients", _CLIENT_FIELDS, limit)
    return _guard(run)


def _overview_dashboard(login: int, data: dict[str, Any], trend_from: str, trend_to: str) -> dict[str, Any]:
    """The figures the web UI draws as the client dashboard (same cards as the
    Broker Eye client overview): account info, allocation, profit trend,
    volume / margin / deals donuts, performance and profitability."""
    acc = data.get("account") or {}
    st = data.get("dealsStats") or {}
    trend: list[dict[str, Any]] = []
    try:
        lo, hi = _range(trend_from, trend_to)
        pnl = brokereye.get(f"/api/broker/clients/{login}/pnl-overview", {"from": lo, "to": hi})
        trend = [{"date": d.get("date"), "pnl": d.get("pnl"), "equity": d.get("equity")} for d in (pnl.get("days") or [])][-62:]
    except (brokereye.BrokerEyeError, ValueError):
        trend = []
    last = data.get("lastTradingDate")
    return {
        "login": login, "name": acc.get("name"), "currency": acc.get("currency"),
        "lastTradingDate": datetime.fromtimestamp(int(last), _tz()).strftime("%d/%m/%Y") if last else None,
        "account": {k: acc.get(k) for k in ("balance", "credit", "equity", "floatingProfit", "margin", "marginFree", "marginLevel")},
        "stats": {k: st.get(k) for k in ("totalDeals", "tradingDeals", "buyDeals", "sellDeals", "buyVolume", "sellVolume", "totalVolume",
                                         "profitableDealCount", "losingDealCount", "profitableDealsSum", "losingDealsSum",
                                         "averageProfitPerDeal", "averageLossPerDeal", "averageVolumePerDeal",
                                         "maxProfit", "maxLoss", "winRate", "totalCommission", "totalStorage", "totalPnL")},
        "trend": trend, "trendFrom": trend_from, "trendTo": trend_to,
        "positionCount": data.get("positionCount", 0), "orderCount": data.get("orderCount", 0),
    }


@beta_tool(eager_input_streaming=True)
def get_client_overview(login: int, trend_from: str = "", trend_to: str = "") -> str:
    """Full picture of ONE client: account details and live balances, open positions and pending orders, lifetime deal statistics (buy/sell volume, profitable vs losing deals, win rate, average and max profit/loss, commission) and a daily P&L trend. Call this when the user asks about a specific login/account ("overview of 750001", "what is 750001 holding", "show me account X"). The web UI draws these figures as a dashboard automatically, so keep your text to a short summary of what stands out.

    Args:
        login: The MT5 login (account number).
        trend_from: Start of the P&L trend window, YYYY-MM-DD (default: 7 days ago).
        trend_to: End of the trend window, YYYY-MM-DD (default: today).
    """
    def run() -> str:
        data = brokereye.get(f"/api/broker/clients/{int(login)}/overview")
        positions, p_trunc = _cap([_pick(p, _POSITION_FIELDS) for p in data.get("positions") or []], 100)
        orders, o_trunc = _cap(data.get("orders") or [], 50)
        today = datetime.now(_tz()).date()
        t_to = trend_to or today.isoformat()
        t_from = trend_from or (today - timedelta(days=6)).isoformat()
        dashboard = _overview_dashboard(int(login), data, t_from, t_to)
        return _result({
            "account": data.get("account"),
            "dealsStats": data.get("dealsStats"),
            "lastTradingDate": dashboard["lastTradingDate"],
            "pnlTrend": dashboard["trend"], "trendWindow": {"from": t_from, "to": t_to},
            "positions": positions, "positionCount": data.get("positionCount", len(positions)),
            "orders": orders, "orderCount": data.get("orderCount", len(orders)),
            "truncated": p_trunc or o_trunc,
            "dashboard": dashboard,
            "note": "A dashboard with these figures (account info, allocation, profit trend, volume, margin, deals "
                    "summary, performance, profitability) is shown to the user automatically. Summarise what stands "
                    "out in a few lines instead of repeating every number.",
        })
    return _guard(run)


@beta_tool(eager_input_streaming=True)
def search_open_positions(
    search: str = "",
    filters: Filters = None,
    logins: Logins = None,
    sort_by: str = "profit",
    sort_order: str = "asc",
    limit: int = 100,
    page: int = 1,
) -> str:
    """Open (live) positions across the broker's clients, one row per position. Call this for "who is holding X", "open positions in GOLD", "biggest losing positions right now", exposure by login/symbol.

    Args:
        search: Free text matched against symbol, login, name, comment.
        filters: Field filters {"field", "operator", "value"}. Fields: symbol, exchange, login, name, action (BUY/SELL), volume, profit, storage, priceOpen, priceCurrent. Operators as in search_clients.
        logins: Restrict to these MT5 logins.
        sort_by: symbol | login | volume | profit | storage | priceOpen | timeCreate.
        sort_order: "asc" or "desc".
        limit: Rows to return (1-200).
        page: Page number.
    """
    def run() -> str:
        body = _search_body(search=search, filters=filters, sort_by=sort_by, sort_order=sort_order,
                            limit=limit, page=page, logins=logins)
        data = brokereye.post("/api/broker/positions/search", body)
        return _rows_result(data, "positions", _POSITION_FIELDS, limit)
    return _guard(run)


@beta_tool(eager_input_streaming=True)
def net_positions_by_exchange(
    search: str = "",
    filters: Filters = None,
    logins: Logins = None,
    sort_by: str = "netVolume",
    sort_order: str = "desc",
) -> str:
    """Net open exposure per symbol, grouped by exchange (CMX / MCX / STOCK ...), with per-exchange and grand totals (net lots, floating profit, swap, client count, position count). Call this for "net position", "exposure", "how much GOLD are we net long/short", "book by exchange".

    Args:
        search: Free text matched against symbol / exchange.
        filters: Field filters {"field", "operator", "value"} on symbol, exchange, login.
        logins: Restrict to these MT5 logins.
        sort_by: symbol | netVolume | totalProfit | totalStorage | clientCount | positionCount.
        sort_order: "asc" or "desc".
    """
    def run() -> str:
        body = _search_body(search=search, filters=filters, sort_by=sort_by, sort_order=sort_order,
                            limit=settings().tool_max_rows, page=1, logins=logins)
        data = brokereye.post("/api/broker/positions/net/by-exchange", body)
        exchanges = []
        truncated = False
        for ex in data.get("exchanges") or []:
            rows, t = _cap(ex.get("positions") or [], 60)
            truncated = truncated or t
            exchanges.append({"exchange": ex.get("exchange"), "totals": ex.get("totals"), "positions": rows})
        return _result({"exchanges": exchanges, "totals": data.get("totals"), "truncated": truncated})
    return _guard(run)


@beta_tool(eager_input_streaming=True)
def margin_call_accounts(
    level: float = 0,
    liquidate_type: str = "",
    sort_by: str = "marginLevel",
    sort_order: str = "asc",
) -> str:
    """Accounts whose margin level is below the margin-call threshold (risk of stop-out). Call this for "margin call", "who is close to stop out", "risky accounts", "low margin level".

    Args:
        level: Margin level % threshold. 0 = use the system default (margin_call_level setting).
        liquidate_type: "" for all, or "Liquidate" (India) / "Non-Liquidate" (UAE); comma-separate for both.
        sort_by: marginLevel | login | name | equity | margin | balance | profit | liquidateType.
        sort_order: "asc" or "desc".
    """
    def run() -> str:
        params: dict[str, Any] = {"sortBy": sort_by, "sortOrder": sort_order}
        if level and level > 0:
            params["level"] = level
        if liquidate_type:
            params["liquidateType"] = liquidate_type
        data = brokereye.get("/api/broker/clients/margin-call", params)
        rows, truncated = _cap(data.get("accounts") or [])
        return _result({
            "accounts": rows, "returned": len(rows), "total": data.get("count", len(rows)),
            "marginThreshold": data.get("marginThreshold"), "truncated": truncated,
        })
    return _guard(run)


@beta_tool(eager_input_streaming=True)
def search_deals(
    from_date: str,
    to_date: str,
    login: int = 0,
    search: str = "",
    filters: Filters = None,
    sort_by: str = "time",
    sort_order: str = "desc",
    limit: int = 100,
    page: int = 1,
) -> str:
    """Deal history (executed trades and balance operations) for a date range — raw rows. Prefer the report tools for totals; use this when the user wants the actual deals ("show trades of 750001 last week", "all GOLD deals today", "which deals had commission").

    Args:
        from_date: Start date, YYYY-MM-DD (inclusive).
        to_date: End date, YYYY-MM-DD (inclusive).
        login: Restrict to one MT5 login (0 = all accessible clients).
        search: Free text matched against symbol and comment.
        filters: Field filters {"field", "operator", "value"}. Fields: symbol, action (BUY, SELL, BALANCE, CREDIT, AGENT, AGENT_DAILY, AGENT_MONTHLY, ...), entry (IN, OUT, INOUT, OUT_BY), login, deal, order, position, price, volume, profit, storage, commission, comment, reason. Operators: equal, not_equal, in, contains, starts_with, ends_with, greater_than, less_than, greater_than_equal, less_than_equal.
        sort_by: time | deal | login | symbol | action | price | volume | profit | storage | commission.
        sort_order: "asc" or "desc".
        limit: Rows to return (1-200).
        page: Page number.
    """
    def run() -> str:
        lo, hi = _range(from_date, to_date)
        body = _search_body(search=search, filters=filters, sort_by=sort_by, sort_order=sort_order,
                            limit=limit, page=page, extra={"from": lo, "to": hi})
        path = f"/api/broker/clients/{int(login)}/deals/search" if login else "/api/broker/deals/search"
        data = brokereye.post(path, body)
        return _rows_result(data, "deals", _DEAL_FIELDS, limit, from_date=from_date, to_date=to_date)
    return _guard(run)


@beta_tool(eager_input_streaming=True)
def aggregate_deals(
    from_date: str,
    to_date: str,
    group_by: list[str] | None = None,
    login: int = 0,
    logins: Logins = None,
    search: str = "",
    filters: Filters = None,
    trades_only: bool = True,
    sort_by: str = "profit",
    sort_order: str = "desc",
    limit: int = 50,
) -> str:
    """Exact totals of deals grouped by exchange, symbol, login, day, action or entry — computed by the server over ALL matching deals (no paging). Use this for any "profit / volume / commission by X" question: P&L by exchange, top symbols by volume, per-day trend, per-client realized profit. Returns deals count, volume (lots), profit, commission, storage (swap) and net (profit+commission+storage) per group, plus grand totals. Prefer this over paging through search_deals.

    Args:
        from_date: Start date, YYYY-MM-DD (inclusive).
        to_date: End date, YYYY-MM-DD (inclusive).
        group_by: One or two of: exchange, symbol, login, day, action, entry. Default ["symbol"]. Example ["exchange"], ["day"], ["exchange", "symbol"], ["login"].
        login: Restrict to one MT5 login (0 = all accessible clients).
        logins: Restrict to these MT5 logins.
        search: Free text matched against symbol and comment.
        filters: Field filters {"field", "operator", "value"} on deal columns (symbol, action, entry, login, volume, profit, commission, comment, ...).
        trades_only: true (default) counts BUY/SELL trades only; false includes balance, credit, agent and other operations.
        sort_by: deals | volume | profit | commission | storage | net, or a group key. Default profit.
        sort_order: "asc" or "desc".
        limit: Groups to return (1-500). Grand totals always cover every group.
    """
    def run() -> str:
        lo, hi = _range(from_date, to_date)
        body: dict[str, Any] = {"from": lo, "to": hi, "group_by": group_by or ["symbol"], "trades_only": bool(trades_only),
                                "sort_by": sort_by, "sort_order": sort_order, "limit": max(1, min(500, limit))}
        if login:
            body["login"] = int(login)
        if logins:
            body["mt5Accounts"] = [int(x) for x in logins]
        if search:
            body["search"] = search
        if filters:
            body["filters"] = filters
        data = brokereye.post("/api/broker/deals/aggregate", body)
        groups = data.get("groups") or []
        return _result({
            "group_by": data.get("group_by"), "groups": groups, "returned": len(groups),
            "total_groups": data.get("total_groups", len(groups)),
            "truncated": data.get("total_groups", len(groups)) > len(groups),
            "totals": data.get("totals"), "trades_only": data.get("trades_only", True),
            "from_date": from_date, "to_date": to_date,
        })
    return _guard(run)


def _report(path: str, from_date: str, to_date: str, *, search: str, filters: Filters, logins: Logins,
            sort_by: str, sort_order: str, limit: int, page: int, extra: dict[str, Any] | None = None) -> str:
    lo, hi = _range(from_date, to_date)
    body = _search_body(search=search, filters=filters, sort_by=sort_by, sort_order=sort_order,
                        limit=limit, page=page, logins=logins, extra={"from": lo, "to": hi, **(extra or {})})
    data = brokereye.post(path, body)
    return _rows_result(data, "rows", None, limit, from_date=from_date, to_date=to_date)


@beta_tool(eager_input_streaming=True)
def summary_report(
    from_date: str,
    to_date: str,
    hide_inactive: bool = True,
    search: str = "",
    filters: Filters = None,
    logins: Logins = None,
    sort_by: str = "login",
    sort_order: str = "asc",
    limit: int = 100,
    page: int = 1,
) -> str:
    """Per-client Summary Report for a date range: deposit, withdrawal, in_out (net), credit, additional, volume (lots), commission, profit, swap, plus live balance and equity, with grand totals. Call this for "summary", "how much did clients deposit/withdraw", "total volume/profit this week", "per-client performance", settlement figures.

    Args:
        from_date: Start date, YYYY-MM-DD (inclusive).
        to_date: End date, YYYY-MM-DD (inclusive).
        hide_inactive: Drop clients with no deals in the range (default true).
        search: Free text matched against login, name, group, currency.
        filters: Field filters {"field", "operator", "value"} on any column: login, name, group, currency, deposit, withdrawal, in_out, credit, additional, volume, commission, profit, swap, balance, equity, deals.
        logins: Restrict to these MT5 logins.
        sort_by: Any column (default login).
        sort_order: "asc" or "desc".
        limit: Rows to return (1-200).
        page: Page number.
    """
    return _guard(_report, "/api/broker/reports/summary", from_date, to_date, search=search, filters=filters,
                  logins=logins, sort_by=sort_by, sort_order=sort_order, limit=limit, page=page,
                  extra={"hideInactive": bool(hide_inactive)})


@beta_tool(eager_input_streaming=True)
def deposit_withdrawal_report(
    from_date: str,
    to_date: str,
    kind: str = "all",
    search: str = "",
    filters: Filters = None,
    logins: Logins = None,
    sort_by: str = "time",
    sort_order: str = "desc",
    limit: int = 100,
    page: int = 1,
) -> str:
    """Deposit & Withdrawal Report: one row per deposit/withdrawal (login, name, time, comment, amount, currency, type) with totals (deposit, withdrawal, in_out, counts). Call this for "deposits today", "withdrawals of client X", "cash in/out this month".

    Args:
        from_date: Start date, YYYY-MM-DD (inclusive).
        to_date: End date, YYYY-MM-DD (inclusive).
        kind: "all", "deposit" or "withdrawal".
        search: Free text matched against login, name, comment, currency, type.
        filters: Field filters {"field", "operator", "value"} on login, name, comment, amount, currency, type, deal.
        logins: Restrict to these MT5 logins.
        sort_by: time | login | name | amount | currency | type.
        sort_order: "asc" or "desc".
        limit: Rows to return (1-200).
        page: Page number.
    """
    return _guard(_report, "/api/broker/reports/deposit-withdrawal", from_date, to_date, search=search,
                  filters=filters, logins=logins, sort_by=sort_by, sort_order=sort_order, limit=limit, page=page,
                  extra={"type": kind})


@beta_tool(eager_input_streaming=True)
def credit_report(
    from_date: str,
    to_date: str,
    search: str = "",
    filters: Filters = None,
    logins: Logins = None,
    sort_by: str = "time",
    sort_order: str = "desc",
    limit: int = 100,
    page: int = 1,
) -> str:
    """Credit Report: one row per credit in/out operation (login, name, time, comment, amount, currency, type) with totals (credit_in, credit_out, net_credit, counts). Call this for "credit given", "bonus/credit history", "credit out".

    Args:
        from_date: Start date, YYYY-MM-DD (inclusive).
        to_date: End date, YYYY-MM-DD (inclusive).
        search: Free text matched against login, name, comment, currency, type.
        filters: Field filters {"field", "operator", "value"} on login, name, comment, amount, currency, type, deal.
        logins: Restrict to these MT5 logins.
        sort_by: time | login | name | amount | currency | type.
        sort_order: "asc" or "desc".
        limit: Rows to return (1-200).
        page: Page number.
    """
    return _guard(_report, "/api/broker/reports/credit", from_date, to_date, search=search, filters=filters,
                  logins=logins, sort_by=sort_by, sort_order=sort_order, limit=limit, page=page)


@beta_tool(eager_input_streaming=True)
def agent_details_report(
    from_date: str,
    to_date: str,
    search: str = "",
    filters: Filters = None,
    logins: Logins = None,
    sort_by: str = "time",
    sort_order: str = "desc",
    limit: int = 100,
    page: int = 1,
) -> str:
    """Agent (IB) commission details: one row per agent-commission deal joined to the client trade that generated it (deal, login, name, time, symbol, volume, action, entry, price, commission, type, currency, agent_login, agent_name), with totals and a per-agent breakdown (agent_commission, agent_login, agent_name). Call this for "agent commission", "IB payout", "how much did agent X earn".

    Args:
        from_date: Start date, YYYY-MM-DD (inclusive).
        to_date: End date, YYYY-MM-DD (inclusive).
        search: Free text matched against deal, login, name, symbol, comment, agent_login, agent_name, type.
        filters: Field filters {"field", "operator", "value"} on any column incl. agent_login, agent_name, symbol, type (AGENT, AGENT_DAILY, AGENT_MONTHLY), commission, volume.
        logins: Restrict to these MT5 logins (matches agent OR client login).
        sort_by: time | commission | volume | symbol | login | agent_login.
        sort_order: "asc" or "desc".
        limit: Rows to return (1-200).
        page: Page number.
    """
    return _guard(_report, "/api/broker/reports/agent-details", from_date, to_date, search=search, filters=filters,
                  logins=logins, sort_by=sort_by, sort_order=sort_order, limit=limit, page=page)


@beta_tool(eager_input_streaming=True)
def get_group_settings(
    group: str = "",
    login: int = 0,
    symbol: str = "",
    list_all: bool = False,
) -> str:
    """MT5 group configuration: account limits (max pending orders, max open positions, max symbols), margin-call and stop-out levels, margin mode, trade flags (swaps, hedging prohibited, FIFO, EA allowed...), per-symbol trading rules (volume min / max / step / per-symbol volume limit in lots, trade mode such as disabled / long only / close only / full, margin rates, swaps) and commission rules with tiers. Call this for "max lot", "lot size", "margin call level", "stop out", "which symbols can group X trade", "what commission does client Y pay", "leverage of group", "group settings". Agent (IB) commission rules appear only when the broker can see the agent account (agentCommissionsVisible); otherwise they are omitted and agentCommissionsHidden says how many.

    Args:
        group: Exact group path, e.g. "demo\\INR-Standard". Leave empty when using login or list_all.
        login: Resolve the group from this client's MT5 login (0 = none).
        symbol: Also return the symbol rule that applies to this symbol (e.g. "GOLDDEC", "EURUSD").
        list_all: true lists every group of your clients with limits / margin / trade flags (no per-symbol rules); use it to find group names first.
    """
    def run() -> str:
        if list_all or (not group and not login):
            data = brokereye.get("/api/broker/groups", {"details": "0"})
            groups, truncated = _cap(data.get("groups") or [], 100)
            return _result({"groups": groups, "returned": len(groups), "total": data.get("count", len(groups)),
                            "truncated": truncated, "note": "Call again with group=<name> or login=<login> for symbol rules and commissions."})
        params: dict[str, Any] = {}
        if symbol:
            params["symbol"] = symbol
        if login:
            data = brokereye.get(f"/api/broker/clients/{int(login)}/group", params)
        else:
            data = brokereye.get("/api/broker/groups/detail", {**params, "name": group})
        # Agent (IB) commission rules are visible only when the broker can also
        # see the agent account behind the group's clients. BrokerEye already
        # strips them and sets agentCommissionsVisible; this is the belt to
        # that suspenders, so no agent brokerage can leak through the AI.
        comms_all = data.get("commissions") or []
        if data.get("agentCommissionsVisible") is not True:
            kept = [c for c in comms_all if str(c.get("mode", "")).lower() != "agent"]
            hidden = len(comms_all) - len(kept)
            data["commissions"] = comms_all = kept
            data["agentCommissionsVisible"] = False
            if hidden or data.get("agentCommissionsHidden"):
                data["agentCommissionsHidden"] = max(hidden, int(data.get("agentCommissionsHidden") or 0))
                data["agentCommissionsNote"] = ("Agent (IB) commission rules are hidden: the broker has no visibility "
                                                "of the agent account linked to these clients. Say so if asked.")
        # Keep the payload readable: cap symbol rules and commissions.
        syms, t1 = _cap(data.get("symbols") or [], 60)
        comms, t2 = _cap(comms_all, 30)
        data["symbols"], data["commissions"] = syms, comms
        data["truncated"] = t1 or t2
        return _result(data)
    return _guard(run)


@beta_tool(eager_input_streaming=True)
def render_chart(
    chart_type: str,
    title: str,
    labels: list[str],
    series: list[dict[str, Any]],
    unit: str = "",
    subtitle: str = "",
) -> str:
    """Draw a chart from figures you have ALREADY fetched with the other tools and show it to the user. Call this whenever a picture helps: top-N comparisons (bar / horizontal_bar), trends over days or weeks (line / area), share breakdowns (pie / doughnut), composition per client or exchange (stacked_bar). The chart is displayed automatically next to your answer — just refer to it ("see the chart below"). Do not invent numbers; use values from tool results.

    Args:
        chart_type: One of bar, horizontal_bar, stacked_bar, line, area, pie, doughnut. Use horizontal_bar for more than ~8 named items (logins, symbols).
        title: Short chart title, e.g. "Top 5 clients by profit — this week".
        labels: Category labels (x-axis / slices), e.g. logins with names, symbols, dates. Max 40.
        series: One or more data series, each {"name": "Profit (INR)", "values": [..numbers in the same order as labels..]}. Pie/doughnut use the first series only. Max 10 series.
        unit: Unit or currency shown on the axis / legend, e.g. "INR", "USD", "lots", "%".
        subtitle: Optional note under the title, e.g. the date range or filters applied.
    """
    def run() -> str:
        from . import charts
        out = charts.render_chart(chart_type, title, labels, series, unit=unit, subtitle=subtitle)
        return json.dumps({"chart_id": out["chart_id"], "title": title,
                           "note": "Chart rendered and shown to the user automatically."})
    return _guard(run)


@beta_tool(eager_input_streaming=True)
def export_table(
    format: str,
    title: str,
    columns: list[str],
    rows: list[list[Any]],
    totals: dict[str, Any] | None = None,
    subtitle: str = "",
    filename: str = "",
) -> str:
    """Hand the user a FILE (Excel .xlsx, PDF or CSV) of a table you have assembled from tool results. Call this when the user asks for a file, a download, "excel", "pdf", "csv", "send me the sheet", or when a result is too long to read in chat (more than ~20 rows). The file is delivered automatically (download link on the web, document in Telegram) — just mention it in your answer. Use export_report instead when the user wants a complete report with all rows.

    Args:
        format: "xlsx" (default choice for data), "pdf" (for sharing / printing) or "csv".
        title: Title shown in the file, e.g. "Deposits & withdrawals — Oct 2026".
        columns: Column headers in order, e.g. ["Login", "Name", "Deposit (INR)", "Withdrawal (INR)"].
        rows: Data rows, each a list of values in the same order as columns (numbers as numbers, not strings).
        totals: Optional totals keyed by column name, e.g. {"Deposit (INR)": 125000.5}.
        subtitle: Optional note under the title (date range, filters).
        filename: Optional file name without extension.
    """
    def run() -> str:
        from . import exports
        out = exports.export_table(format, title, columns, rows, totals=totals, subtitle=subtitle, filename=filename)
        return json.dumps({**out, "note": "File delivered to the user automatically."})
    return _guard(run)


_EXPORTABLE = {
    "bill_summary": ("/api/broker/bills/summary", "Bills", None),
    "summary": ("/api/broker/reports/summary", "rows", None),
    "credit": ("/api/broker/reports/credit", "rows", None),
    "deposit_withdrawal": ("/api/broker/reports/deposit-withdrawal", "rows", None),
    "agent_details": ("/api/broker/reports/agent-details", "rows", None),
    "deals": ("/api/broker/deals/search", "deals", _DEAL_FIELDS),
    "clients": ("/api/broker/clients/search", "clients", _CLIENT_FIELDS),
    "open_positions": ("/api/broker/positions/search", "positions", _POSITION_FIELDS),
}


@beta_tool(eager_input_streaming=True)
def export_report(
    report: str,
    format: str = "xlsx",
    from_date: str = "",
    to_date: str = "",
    search: str = "",
    filters: Filters = None,
    logins: Logins = None,
    sort_by: str = "",
    sort_order: str = "desc",
    max_rows: int = 5000,
    title: str = "",
    week: str = "",
) -> str:
    """Export a COMPLETE report as a file (all rows, fetched page by page on the server — nothing is truncated and the data never passes through you). Use this when the user wants the full summary / deposit-withdrawal / credit / agent / deals / clients / open-positions / bill-summary data as Excel, PDF or CSV. The file is delivered automatically; mention it and the row count in your answer.

    Args:
        report: One of summary, credit, deposit_withdrawal, agent_details, deals, clients, open_positions, bill_summary (Gross / Brokerage / Net per login for one settlement week).
        week: bill_summary only: the settlement week — "current" (default), "last", a week id, a date YYYY-MM-DD inside the week, or part of its name.
        format: "xlsx" (default), "pdf" or "csv".
        from_date: Start date YYYY-MM-DD (required for the date-ranged reports: summary, credit, deposit_withdrawal, agent_details, deals).
        to_date: End date YYYY-MM-DD (inclusive).
        search: Free-text filter as in the matching search tool.
        filters: Field filters {"field", "operator", "value"} as in the matching tool.
        logins: Restrict to these MT5 logins.
        sort_by: Sort column (report default when empty).
        sort_order: "asc" or "desc".
        max_rows: Safety cap on rows exported (1-20000, default 5000).
        title: Optional title for the file.
    """
    def run() -> str:
        from . import exports
        key = report.lower().strip()
        if key not in _EXPORTABLE:
            raise ValueError(f"report must be one of {', '.join(_EXPORTABLE)}")
        path, rows_key, fields = _EXPORTABLE[key]
        dated = key in ("summary", "credit", "deposit_withdrawal", "agent_details", "deals")
        extra: dict[str, Any] = {}
        if dated:
            lo, hi = _range(from_date, to_date)
            extra = {"from": lo, "to": hi}
        if key == "summary":
            extra["hideInactive"] = True
        wk = None
        if key == "bill_summary":
            wk = _resolve_week(week)
            extra = {"week_id": wk["id"], "hideZeroNet": True}
        cap = max(1, min(20000, max_rows))
        page_size = 500 if key not in ("deals", "bill_summary") else 1000
        collected: list[dict[str, Any]] = []
        totals = None
        page = 1
        while len(collected) < cap:
            body = _search_body(search=search, filters=filters, sort_by=sort_by or ("login" if key in ("summary", "clients") else "net" if key == "bill_summary" else "time" if dated else "profit"),
                                sort_order=sort_order, limit=min(page_size, cap - len(collected)), page=page,
                                logins=logins, extra=extra)
            body["limit"] = min(page_size, cap - len(collected))  # bypass the chat cap for exports
            data = brokereye.post(path, body)
            batch = data.get(rows_key) or []
            if totals is None:
                totals = data.get("totals")
            collected.extend(batch)
            total = data.get("total", (data.get("pagination") or {}).get("total", len(collected)))
            if not batch or len(collected) >= total or len(batch) < body["limit"]:
                break
            page += 1
        if key == "bill_summary":
            collected = [{"Login": r.get("Login"), "Name": r.get("Name"), "Gross": r.get("TotalGrossAmount"),
                          "Brokerage": r.get("TotalBrokerage"), "Net": r.get("TotalNetAmount")} for r in collected]
            if isinstance(totals, dict):
                totals = {"Gross": totals.get("TotalGrossAmount"), "Brokerage": totals.get("TotalBrokerage"), "Net": totals.get("TotalNetAmount")}
        if fields:
            collected = [_pick(r, fields) for r in collected]
        collected = _scrub(collected)  # hidden client columns never reach the file either
        if not collected:
            return json.dumps({"error": "The report has no rows for these parameters; nothing exported."})
        # Column order: union of keys in first-seen order, percentage siblings last.
        columns: list[str] = []
        for r in collected[:200]:
            for k in r:
                if k not in columns:
                    columns.append(k)
        columns = [c for c in columns if not c.endswith("_percentage")] + [c for c in columns if c.endswith("_percentage")]
        tot = {k: v for k, v in (totals or {}).items() if k in columns and isinstance(v, (int, float))} if isinstance(totals, dict) else None
        label = title or (f"Bill summary {wk['start_date']} to {wk['end_date']}" if wk else f"{key.replace('_', ' ').title()} report" + (f" {from_date} to {to_date}" if dated else ""))
        sub = (f"{from_date} – {to_date}" if dated else wk["label"] if wk else "") + (f" · {len(collected)} rows" if collected else "")
        out = exports.export_table(format, label, columns, collected, totals=tot, subtitle=sub.strip(" ·"), filename=label)
        return json.dumps({**out, "truncated": len(collected) >= cap, "note": "File delivered to the user automatically."})
    return _guard(run)


_TEMP_CREDIT_FIELDS = (
    "id", "login", "name", "direction", "operation", "amount", "comment", "expire_weekday", "expire_time",
    "expires_at_text", "status", "reversed_amount", "reversal_trigger", "attempts", "last_error", "source",
    "created_at_text", "reversed_at_text",
)


@beta_tool(eager_input_streaming=True)
def credit_position(login: int = 0) -> str:
    """The broker's credit position: credit_limit (total allowed across all their accounts), used_credit (live credit on the accounts), reserved_credit (pending temporary credit-outs that will be restored), available_credit, and max_credit_per_account; with a login also that account's own credit, reserved amount and available headroom. A null limit means unlimited. Also temp_credit_revert {weekday, time, timezone, next_at_text} = the next weekly revert point: temporary credit given now reverts then, and no pending temporary credit reverts later (a credit due earlier keeps its own time: see its expires_at_text in temp_credits). Call this for "how much credit can I still give", "credit limit", "available credit", "can I give 50,000 credit to 750001", "credit headroom", "how much credit is out", "when does temp credit revert".

    Args:
        login: MT5 login to include the per-account position for (0 = broker totals only).
    """
    def run() -> str:
        data = brokereye.get("/api/broker/credit", {"login": int(login)} if login else None)
        return _result(data)
    return _guard(run)


@beta_tool(eager_input_streaming=True)
def temp_credits(status: str = "pending", login: int = 0, limit: int = 50, page: int = 1) -> str:
    """Temporary credits: credit given (direction in) or removed (direction out) for a limited time and reversed automatically at the weekly revert point (every Sunday 00:00 server time by default; credit_position reports the exact next instant in temp_credit_revert). One row per temporary credit with amount, the revert weekday / time and the exact instant (expires_at_text), status (pending = waiting, reversed = done, cancelled = the broker kept the change permanently, failed = the reversal still failed a day after it was due and needs a manual reverse), the amount actually reversed and any error. Call this for "temp credit", "which credits expire this weekend", "pending temporary credit of 750001", "failed reversals", "what will be reversed on Sunday".

    Args:
        status: pending (default), reversed, cancelled, failed, or "" for all statuses.
        login: Restrict to one MT5 login (0 = all).
        limit: Rows to return (1-200), newest first.
        page: Page number.
    """
    def run() -> str:
        params: dict[str, Any] = {"page": max(1, page), "limit": max(1, min(limit, settings().tool_max_rows))}
        if status:
            params["status"] = status
        if login:
            params["login"] = int(login)
        data = brokereye.get("/api/broker/temp-credits", params)
        rows = [{k: r.get(k) for k in _TEMP_CREDIT_FIELDS if k in r} for r in (data.get("temp_credits") or [])]
        rows, truncated = _cap(rows, limit)
        total = data.get("total", len(rows))
        return _result({"temp_credits": rows, "returned": len(rows), "total": total,
                        "page": data.get("page", page), "total_pages": data.get("total_pages"),
                        "truncated": truncated or (isinstance(total, int) and total > len(rows)),
                        "status_filter": status or "all"})
    return _guard(run)


# ---------------------------------------------------------------------------
# period comparison
# ---------------------------------------------------------------------------
_COMPARE_PRESETS = ("today_vs_yesterday", "this_week_vs_last_week", "this_month_vs_last_month",
                    "last_7_days_vs_previous_7", "last_30_days_vs_previous_30")
_FLOW_KEYS = ("deposit", "withdrawal", "in_out", "credit", "additional", "clients", "deals")
_TRADE_KEYS = ("deals", "volume", "profit", "commission", "storage", "net")


def _preset_ranges(preset: str) -> tuple[tuple[str, str], tuple[str, str], str]:
    """(period_a, period_b, note) for a named comparison, to-date style: the
    previous period covers the same number of days as the current one so far."""
    today = datetime.now(_tz()).date()
    iso = lambda d: d.isoformat()  # noqa: E731
    if preset == "today_vs_yesterday":
        y = today - timedelta(days=1)
        return (iso(today), iso(today)), (iso(y), iso(y)), "today vs yesterday"
    if preset == "this_week_vs_last_week":
        monday = today - timedelta(days=today.weekday())
        days = (today - monday).days
        pm = monday - timedelta(days=7)
        return (iso(monday), iso(today)), (iso(pm), iso(pm + timedelta(days=days))), \
            "this week to date vs the same days of last week (weeks start Monday)"
    if preset == "this_month_vs_last_month":
        first = today.replace(day=1)
        last_month_end = first - timedelta(days=1)
        pf = last_month_end.replace(day=1)
        pt = pf + timedelta(days=min(today.day, last_month_end.day) - 1)
        return (iso(first), iso(today)), (iso(pf), iso(pt)), "this month to date vs the same days of last month"
    if preset == "last_7_days_vs_previous_7":
        return (iso(today - timedelta(days=6)), iso(today)), (iso(today - timedelta(days=13)), iso(today - timedelta(days=7))), \
            "last 7 days vs the 7 days before"
    if preset == "last_30_days_vs_previous_30":
        return (iso(today - timedelta(days=29)), iso(today)), (iso(today - timedelta(days=59)), iso(today - timedelta(days=30))), \
            "last 30 days vs the 30 days before"
    raise ValueError(f"preset must be one of {', '.join(_COMPARE_PRESETS)}")


def _num(v: Any) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def _delta(a: Any, b: Any) -> dict[str, Any]:
    fa, fb = _num(a), _num(b)
    change = round(fa - fb, 2)
    pct = round((fa - fb) / abs(fb) * 100, 1) if abs(fb) > 1e-9 else None
    return {"current": round(fa, 2), "previous": round(fb, 2), "change": change, "change_pct": pct}


@beta_tool(eager_input_streaming=True)
def compare_periods(
    preset: str = "",
    from_a: str = "",
    to_a: str = "",
    from_b: str = "",
    to_b: str = "",
    group_by: str = "",
    login: int = 0,
    logins: Logins = None,
    search: str = "",
    filters: Filters = None,
    limit: int = 20,
) -> str:
    """Compare two date ranges side by side with exact server totals and the change between them (absolute and %): trading (deals, volume in lots, profit, commission, swap/storage, net) and money flow (deposit, withdrawal, in_out, credit, additional, active clients). Optionally broken down per exchange, symbol, login or day. Call this for "this week vs last week", "compared to last month", "how did October do against September", "is volume up or down", "which symbols gained / lost the most vs the previous period". Period A is the current / later period, period B the one it is compared with.

    Args:
        preset: Named comparison, to-date style (the previous period covers the same number of days): today_vs_yesterday, this_week_vs_last_week, this_month_vs_last_month, last_7_days_vs_previous_7, last_30_days_vs_previous_30. Leave empty to give the dates yourself.
        from_a: Start of period A, YYYY-MM-DD (ignored with a preset).
        to_a: End of period A, YYYY-MM-DD (inclusive).
        from_b: Start of period B, YYYY-MM-DD.
        to_b: End of period B, YYYY-MM-DD (inclusive).
        group_by: "" for totals only, or exchange | symbol | login | day for a per-group comparison (trades only; groups sorted by the size of the change in profit).
        login: Restrict to one MT5 login (0 = all accessible clients).
        logins: Restrict to these MT5 logins.
        search: Free text matched against symbol and comment (trading figures only).
        filters: Field filters {"field", "operator", "value"} on deal columns (trading figures only).
        limit: Groups to return (1-200).
    """
    def run() -> str:
        if preset:
            (fa, ta), (fb, tb), note = _preset_ranges(preset.strip().lower())
        else:
            fa, ta, fb, tb, note = from_a, to_a, from_b, to_b, "custom periods"
        ranges = {"a": _range(fa, ta), "b": _range(fb, tb)}
        gkey = (group_by or "").strip().lower()
        if gkey and gkey not in ("exchange", "symbol", "login", "day"):
            raise ValueError("group_by must be empty or one of exchange, symbol, login, day")

        def fetch(lo: int, hi: int) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, Any]]:
            body: dict[str, Any] = {"from": lo, "to": hi, "group_by": [gkey or "exchange"], "trades_only": True,
                                    "sort_by": "profit", "sort_order": "desc", "limit": 500}
            if login:
                body["login"] = int(login)
            if logins:
                body["mt5Accounts"] = [int(x) for x in logins]
            if search:
                body["search"] = search
            if filters:
                body["filters"] = filters
            agg = brokereye.post("/api/broker/deals/aggregate", body)
            sbody = _search_body(search="", filters=None, sort_by="login", sort_order="asc", limit=1, page=1,
                                 logins=[int(login)] if login else logins, extra={"from": lo, "to": hi, "hideInactive": True})
            summ = brokereye.post("/api/broker/reports/summary", sbody)
            return agg.get("totals") or {}, agg.get("groups") or [], summ.get("totals") or {}

        ta_tot, ga, fa_tot = fetch(*ranges["a"])
        tb_tot, gb, fb_tot = fetch(*ranges["b"])
        out: dict[str, Any] = {
            "comparison": note,
            "period_a": {"from": fa, "to": ta}, "period_b": {"from": fb, "to": tb},
            "trading": {k: _delta(ta_tot.get(k), tb_tot.get(k)) for k in _TRADE_KEYS},
            "money_flow": {k: _delta(fa_tot.get(k), fb_tot.get(k)) for k in _FLOW_KEYS},
            "note": "trading = BUY/SELL deals only; money_flow from the summary report (clients = accounts with deals in the period). "
                    "change = current - previous; change_pct relative to the previous period (null when it was 0).",
        }
        if gkey == "day":
            out["days"] = {
                "period_a": [{"day": g.get("day"), **{k: g.get(k) for k in _TRADE_KEYS}} for g in ga][:limit],
                "period_b": [{"day": g.get("day"), **{k: g.get(k) for k in _TRADE_KEYS}} for g in gb][:limit],
            }
        elif gkey:
            merged: dict[str, dict[str, Any]] = {}
            for side, groups in (("a", ga), ("b", gb)):
                for g in groups:
                    key = str(g.get(gkey))
                    row = merged.setdefault(key, {gkey: g.get(gkey), **({"name": g.get("name")} if gkey == "login" else {})})
                    row[side] = g
            rows = []
            for key, row in merged.items():
                a, b = row.get("a") or {}, row.get("b") or {}
                item = {k: v for k, v in row.items() if k not in ("a", "b")}
                item.update({k: _delta(a.get(k), b.get(k)) for k in ("deals", "volume", "profit", "net")})
                rows.append(item)
            rows.sort(key=lambda r: abs(r["profit"]["change"]), reverse=True)
            cap = max(1, min(200, limit))
            out["groups"] = rows[:cap]
            out["group_by"] = gkey
            out["total_groups"] = len(rows)
            out["truncated"] = len(rows) > cap
        return _result(out)
    return _guard(run)


# ---------------------------------------------------------------------------
# actions (proposed here, executed only after the broker confirms the card)
# ---------------------------------------------------------------------------
_ACTION_KINDS = ("credit_in", "credit_out", "temp_credit_in", "temp_credit_out")


def _require_interactive(what: str) -> None:
    """Action cards need someone to press Confirm: the web chat and the Telegram bot have that, automated runs
    (scheduled digests, pinned tiles) do not."""
    if not brokereye.current_interactive.get():
        raise ValueError(f"{what} cannot be prepared in an automated run (digest or pinned tile): nobody could "
                         "confirm the card. Report the figures only.")


def _money(v: Any, currency: str = "") -> str:
    try:
        s = f"{float(v):,.2f}"
    except (TypeError, ValueError):
        s = str(v)
    return f"{s} {currency}".strip()


@beta_tool(eager_input_streaming=True)
def propose_credit_action(
    action: str,
    login: int,
    amount: float,
    comment: str = "",
) -> str:
    """PREPARE a credit operation for the broker to confirm — nothing is applied by this call. It checks that the account is accessible and (for credit in) within the broker's credit limits, then shows the user a confirmation card with Confirm / Cancel; only Confirm applies it, through BrokerEye with the broker's own rights and audit trail. Call this when the user clearly asks to give or remove credit: "give 5000 credit to 750001", "credit out 2000 from 750001", "temp credit 10k to 750001", "remove the credit of 750001 for this week". Make sure login and amount are known first; ask if not. Temporary credit (temp_credit_in / temp_credit_out) is applied now and reversed by the server at the weekly revert point fixed by the back office (every Sunday 00:00 server time by default): there is nothing to choose, so do NOT ask for a weekday or time. If the user names a day or time anyway, propose the credit all the same — the card shows the server's revert point — and tell them that is when it reverts. After calling it, tell the user in one line to confirm the card. Never say the credit has been given.

    Args:
        action: credit_in | credit_out | temp_credit_in | temp_credit_out.
        login: The client's MT5 login.
        amount: Positive amount in the account currency.
        comment: Optional comment stored on the MT5 deal (default: a short note that it came from Ask AI).
    """
    def run() -> str:
        kind = action.strip().lower()
        if kind not in _ACTION_KINDS:
            raise ValueError(f"action must be one of {', '.join(_ACTION_KINDS)}")
        _require_interactive("Credit actions")
        if not login or int(login) <= 0:
            raise ValueError("login is required")
        amt = float(amount)
        if not amt > 0:
            raise ValueError("Amount must be positive")
        temp = kind.startswith("temp_")
        payload: dict[str, Any] = {"login": int(login), "amount": round(amt, 2),
                                   "comment": (comment or "").strip()[:120] or "Ask AI (confirmed in chat)"}

        pos = brokereye.get(f"/api/broker/clients/{int(login)}/credit")  # 403 when not accessible
        acc = pos.get("account") or {}
        # Temporary credit reverts at the server's weekly revert point (custom_config.temp_credit_revert);
        # the broker cannot choose it, the card only shows it.
        rev = (pos.get("temp_credit_revert") or {}) if temp else {}
        revert_point = f"{str(rev['weekday']).capitalize()} {rev['time']}" if rev.get("weekday") and rev.get("time") else ""
        if revert_point:
            payload["revert_point"] = revert_point.lower()
            if rev.get("next_at_text"):
                payload["reverts_at_text"] = rev["next_at_text"]
        currency = acc.get("currency") or ""
        credit_now = float(acc.get("credit") or 0)
        adds = kind.endswith("_in")
        available = acc.get("available_credit")
        if adds and available is not None and amt > float(available) + 1e-9:
            return _error(f"Credit limit: account {int(login)} can take at most {_money(available, currency)} more credit "
                          f"(broker available {_money(pos.get('available_credit'), currency) if pos.get('available_credit') is not None else 'unlimited'}, "
                          f"per-account limit {_money(acc.get('max_credit_per_account'), currency) if acc.get('max_credit_per_account') is not None else 'unlimited'}). "
                          f"Nothing was proposed; tell the user the limit and the possible amount.")
        if not adds and amt > credit_now + 1e-9:
            payload["warning"] = f"The account holds only {_money(credit_now, currency)} credit; MT5 may refuse or the credit goes negative."

        after = credit_now + amt if adds else credit_now - amt
        who = f"{int(login)}" + (f" ({acc.get('name')})" if acc.get("name") else "")
        label = {"credit_in": "Credit In", "credit_out": "Credit Out", "temp_credit_in": "Temp Credit In",
                 "temp_credit_out": "Temp Credit Out"}[kind]
        summary = f"{label} {_money(amt, currency)} {'to' if adds else 'from'} {who}"
        if temp:
            summary += f", reverts {revert_point}" if revert_point else ", reverts at the weekly revert point"
        details = [["Account", who], ["Amount", _money(amt, currency)], ["Comment", payload["comment"]]]
        if temp:
            if revert_point:
                when = revert_point + (f" ({rev['timezone']})" if rev.get("timezone") else "")
                if rev.get("next_at_text"):
                    when += f", next on {rev['next_at_text']}"
                details.append(["Reverts automatically", when])
            else:
                details.append(["Reverts automatically", "At the weekly revert point (every Sunday by default)"])
        details.append(["Credit now → after", f"{_money(credit_now, currency)} → {_money(after, currency)}"])
        if adds and available is not None:
            details.append(["Account headroom after", _money(float(available) - amt, currency)])
        if pos.get("available_credit") is not None:
            details.append(["Broker available credit now", _money(pos.get("available_credit"), currency)])
        if payload.get("warning"):
            details.append(["Warning", payload["warning"]])
        payload["details"] = details
        payload["currency"] = currency
        payload["name"] = acc.get("name")

        from . import store
        card = store.create_action(
            conversation_id=brokereye.current_conversation.get(), broker_id=brokereye.current_session.get().broker_id,
            kind=kind, payload=payload, summary=summary, channel=brokereye.current_channel.get(),
            ttl_minutes=settings().ai_action_ttl_minutes)
        note = (f"A confirmation card is now shown to the user; it expires in {settings().ai_action_ttl_minutes} minutes. "
                "Tell them in one line to press Confirm (or Cancel). Do NOT say the credit was applied; you will be "
                "told the outcome in the next turn.")
        if temp:
            note += (" The credit reverts at the server's weekly revert point shown on the card; nobody can pick another "
                     "day or time, so if the user asked for one, say that this point applies instead.")
        return json.dumps({
            "action_id": card["id"], "status": "pending", "summary": summary, "details": details, "card": card,
            "note": note,
        }, ensure_ascii=False, default=str)
    return _guard(run)


# ---------------------------------------------------------------------------
# scheduled digests
# ---------------------------------------------------------------------------
@beta_tool(eager_input_streaming=True)
def manage_digests(
    action: str,
    digest_id: int = 0,
    name: str = "",
    prompt: str = "",
    run_time: str = "",
    weekdays: str = "",
    deliver_telegram: bool = True,
    enabled: bool = True,
) -> str:
    """Scheduled digests: recurring summaries the assistant produces by itself at a set time and sends to the broker's Telegram (when linked) and to their chat list. Call this when the user wants something regularly: "every morning at 9 send me yesterday's deposits and margin calls", "weekly summary on Monday 8am", "stop the daily digest", "what digests do I have". Actions: list, create, update, delete. A digest is a standing instruction in the broker's words (what to include, which period) plus a time and weekdays.

    Args:
        action: list | create | update | delete.
        digest_id: The digest to update or delete (from list).
        name: Short name, e.g. "Morning digest" (create / update).
        prompt: What to produce, in the broker's words, e.g. "Yesterday's deposits and withdrawals with totals, accounts below margin call, top 5 clients by profit" (create / update).
        run_time: "HH:MM", 24-hour clock, service timezone (create / update).
        weekdays: "daily", "weekdays" (Mon-Fri), "mon-sat", "weekend", or a list like "mon,wed,fri" (create / update).
        deliver_telegram: Also send to Telegram when the broker has linked it (default true).
        enabled: update only: false pauses the digest, true resumes it.
    """
    def run() -> str:
        from . import scheduler, store
        broker_id = brokereye.current_session.get().broker_id
        ident = store.broker_identity(broker_id) or {}
        linked = bool(ident.get("telegram_id"))
        act = action.strip().lower()
        tg_note = ("Telegram is linked: digests are sent there and kept in the web chat list." if linked else
                   "Telegram is NOT linked for this broker: digests appear in the web chat list only. To get them "
                   "on Telegram, open the BrokerEye bot and link the account (Telegram Mini App login).")
        if act == "list":
            rows = [scheduler.digest_view(r) for r in store.list_digests(broker_id)]
            return json.dumps({"digests": rows, "count": len(rows), "max": scheduler.DIGESTS_MAX, "telegram": tg_note},
                              ensure_ascii=False, default=str)
        if act == "create":
            if not (name.strip() and prompt.strip() and run_time.strip() and weekdays.strip()):
                raise ValueError("create needs name, prompt, run_time and weekdays")
            if store.count_digests(broker_id) >= scheduler.DIGESTS_MAX:
                raise ValueError(f"At most {scheduler.DIGESTS_MAX} digests per broker; delete one first")
            days = scheduler.parse_weekdays(weekdays)
            t = scheduler.parse_time(run_time)
            row = store.create_digest(broker_id=broker_id, name=name.strip(), prompt=prompt.strip(), run_time=t, weekdays=days,
                                      deliver_telegram=bool(deliver_telegram), created_by="chat",
                                      next_run_at=scheduler.next_run(t, days))
            return json.dumps({"created": scheduler.digest_view(row), "telegram": tg_note,
                               "note": "Confirm to the user what will run and when (next_run_text), and where it will arrive."},
                              ensure_ascii=False, default=str)
        if act in ("update", "delete"):
            if not digest_id:
                raise ValueError("digest_id is required (use action=list to find it)")
            cur = store.get_digest(broker_id, int(digest_id))
            if not cur:
                raise ValueError("No such digest")
            if act == "delete":
                store.delete_digest(broker_id, int(digest_id))
                return json.dumps({"deleted": cur["name"], "remaining": store.count_digests(broker_id)}, ensure_ascii=False)
            fields: dict[str, Any] = {}
            if name.strip():
                fields["name"] = name.strip()
            if prompt.strip():
                fields["prompt"] = prompt.strip()
            days = scheduler.parse_weekdays(weekdays) if weekdays.strip() else [int(x) for x in str(cur["weekdays"]).split(",") if x.strip().isdigit()]
            t = scheduler.parse_time(run_time) if run_time.strip() else cur["run_time"]
            if weekdays.strip():
                fields["weekdays"] = days
            if run_time.strip():
                fields["run_time"] = t
            if weekdays.strip() or run_time.strip():
                fields["next_run_at"] = scheduler.next_run(t, days)
            fields["deliver_telegram"] = bool(deliver_telegram)
            fields["enabled"] = bool(enabled)
            row = store.update_digest(broker_id, int(digest_id), fields)
            return json.dumps({"updated": scheduler.digest_view(row), "telegram": tg_note}, ensure_ascii=False, default=str)
        raise ValueError("action must be list, create, update or delete")
    return _guard(run)


# ---------------------------------------------------------------------------
# alerts / watchlists
# ---------------------------------------------------------------------------
@beta_tool(eager_input_streaming=True)
def manage_alerts(
    action: str,
    alert_id: int = 0,
    name: str = "",
    kind: str = "",
    threshold: float = 0,
    logins: Logins = None,
    hours: int = 0,
    liquidate_type: str = "",
    check_interval_minutes: int = 0,
    cooldown_minutes: int = 0,
    deliver_telegram: bool = True,
    enabled: bool = True,
) -> str:
    """Alerts (watchlists): standing conditions the service checks by itself every few minutes and reports on Telegram (when linked) and in the chat's bell — without you. Call this when the user wants to be told when something happens: "alert me when any client's margin level drops below 120%", "tell me about deposits above 10 lakh", "watch 750001 and 750002 for equity below 50,000", "warn me when my available credit is under 1 lakh", "remind me before temp credits reverse". Actions: list, create, update, delete, kinds (what can be watched), recent (the latest alert events). Kinds: margin_level_below (threshold = %, 0 = system margin-call level), equity_below, balance_below, floating_loss_above, deposit_above, withdrawal_above (threshold = amount), credit_available_below (amount), temp_credit_expiring (hours). Each matched login / deal is reported once per cooldown.

    Args:
        action: list | create | update | delete | kinds | recent.
        alert_id: The alert to update or delete (from list).
        name: Short name, e.g. "Margin watch" (create / update).
        kind: One of the kinds above (create / update).
        threshold: Percent for margin_level_below, otherwise an amount in account currency.
        logins: Only these MT5 logins (empty = all accessible clients).
        hours: temp_credit_expiring only: how many hours ahead (default 24).
        liquidate_type: margin_level_below only: "", "Liquidate" or "Non-Liquidate".
        check_interval_minutes: How often to check (1-1440, default 5; deposits / withdrawals look at what happened since the last check).
        cooldown_minutes: Do not repeat the same login / deal within this many minutes (default 240).
        deliver_telegram: Also send to Telegram when linked (default true).
        enabled: update only: false pauses, true resumes.
    """
    def run() -> str:
        from . import alerts, store
        broker_id = brokereye.current_session.get().broker_id
        act = action.strip().lower()
        ident = store.broker_identity(broker_id) or {}
        tg_note = ("Telegram is linked: alerts are sent there and shown by the bell in the web chat." if ident.get("telegram_id") else
                   "Telegram is NOT linked: alerts appear only in the web chat (bell). Link the account in the BrokerEye bot to get them on Telegram.")
        if act == "kinds":
            return json.dumps({"kinds": {k: {"label": v["label"], "params": v["params"], "help": v["help"]} for k, v in alerts.KINDS.items()}},
                              ensure_ascii=False)
        if act == "list":
            rows = [alerts.alert_view(r) for r in store.list_alerts(broker_id)]
            return json.dumps({"alerts": rows, "count": len(rows), "max": alerts.ALERTS_MAX, "telegram": tg_note}, ensure_ascii=False, default=str)
        if act == "recent":
            ev = store.list_alert_events(broker_id, limit=30)
            return json.dumps({"events": [{k: e.get(k) for k in ("id", "alert_name", "kind", "title", "body", "created_at")} for e in ev]},
                              ensure_ascii=False, default=str)
        raw_params = {"threshold": threshold, "logins": logins or [], "hours": hours or 24, "liquidate_type": liquidate_type}
        if act == "create":
            if not (name.strip() and kind.strip()):
                raise ValueError("create needs name and kind")
            if store.count_alerts(broker_id) >= alerts.ALERTS_MAX:
                raise ValueError(f"At most {alerts.ALERTS_MAX} alerts per broker; delete one first")
            params = alerts.normalize_params(kind.strip().lower(), raw_params)
            row = store.create_alert(broker_id=broker_id, name=name.strip(), kind=kind.strip().lower(), params=params,
                                     check_interval_minutes=max(alerts.CHECK_MIN_MINUTES, min(alerts.CHECK_MAX_MINUTES, check_interval_minutes or 5)),
                                     cooldown_minutes=max(1, cooldown_minutes or 240), deliver_telegram=bool(deliver_telegram), created_by="chat")
            return json.dumps({"created": alerts.alert_view(row), "telegram": tg_note,
                               "note": "Confirm to the user what is watched, how often, and where alerts arrive. The first check runs within a minute."},
                              ensure_ascii=False, default=str)
        if act in ("update", "delete"):
            if not alert_id:
                raise ValueError("alert_id is required (use action=list to find it)")
            cur = store.get_alert(broker_id, int(alert_id))
            if not cur:
                raise ValueError("No such alert")
            if act == "delete":
                store.delete_alert(broker_id, int(alert_id))
                return json.dumps({"deleted": cur["name"], "remaining": store.count_alerts(broker_id)}, ensure_ascii=False)
            fields: dict[str, Any] = {"deliver_telegram": bool(deliver_telegram), "enabled": bool(enabled)}
            if name.strip():
                fields["name"] = name.strip()
            new_kind = kind.strip().lower() or cur["kind"]
            if kind.strip() or threshold or logins is not None or hours or liquidate_type:
                merged = dict(cur["params"] or {})
                if threshold:
                    merged["threshold"] = threshold
                if logins is not None:
                    merged["logins"] = logins
                if hours:
                    merged["hours"] = hours
                if liquidate_type:
                    merged["liquidate_type"] = liquidate_type
                fields["kind"] = new_kind
                fields["params"] = alerts.normalize_params(new_kind, merged)
            if check_interval_minutes:
                fields["check_interval_minutes"] = max(alerts.CHECK_MIN_MINUTES, min(alerts.CHECK_MAX_MINUTES, check_interval_minutes))
            if cooldown_minutes:
                fields["cooldown_minutes"] = max(1, cooldown_minutes)
            row = store.update_alert(broker_id, int(alert_id), fields)
            return json.dumps({"updated": alerts.alert_view(row), "telegram": tg_note}, ensure_ascii=False, default=str)
        raise ValueError("action must be list, create, update, delete, kinds or recent")
    return _guard(run)


# ---------------------------------------------------------------------------
# attached files
# ---------------------------------------------------------------------------
@beta_tool(eager_input_streaming=True)
def read_upload(
    upload_id: str,
    page: int = 1,
    limit: int = 100,
    column: str = "",
    contains: str = "",
    logins_only: bool = False,
) -> str:
    """Rows of a file the user attached to the chat (CSV / Excel / list of logins) — the upload_id is given in the user turn that carried the file. Use logins_only=true to get the distinct MT5 logins in the file (then pass them as `logins` to search_clients, summary_report, aggregate_deals, etc. to compare the file with live data); otherwise page through the rows, optionally keeping only rows where a column contains a text.

    Args:
        upload_id: The id from the attachment note in the user turn.
        page: Page number (1-based).
        limit: Rows per page (1-200).
        column: Optional column name to filter on.
        contains: Keep only rows whose `column` contains this text (case-insensitive).
        logins_only: true returns just the list of distinct logins found in the file.
    """
    def run() -> str:
        from . import uploads
        doc = uploads.load_upload(brokereye.current_session.get().broker_id, upload_id)
        if not doc:
            raise ValueError("That attachment is no longer available (uploads are kept for 24 hours); ask the user to attach it again")
        if logins_only:
            logins = doc.get("logins") or []
            return _result({"filename": doc["filename"], "login_column": doc.get("login_column"), "logins": logins[:5000],
                            "count": len(logins), "note": "Pass these as `logins` to the data tools." if logins else
                            "No column with MT5 logins was recognised; look at the rows instead."})
        rows = doc["rows"]
        cols = doc["columns"]
        if column and contains:
            if column not in cols:
                raise ValueError(f"column must be one of {', '.join(cols)}")
            i = cols.index(column)
            needle = contains.lower()
            rows = [r for r in rows if r[i] is not None and needle in str(r[i]).lower()]
        lim = max(1, min(200, limit))
        start = (max(1, page) - 1) * lim
        chunk = rows[start:start + lim]
        return _result({"filename": doc["filename"], "columns": cols, "rows": chunk, "returned": len(chunk), "total": len(rows),
                        "page": max(1, page), "pages": (len(rows) + lim - 1) // lim, "truncated": start + len(chunk) < len(rows),
                        "login_column": doc.get("login_column")})
    return _guard(run)


# ---------------------------------------------------------------------------
# memory
# ---------------------------------------------------------------------------
@beta_tool(eager_input_streaming=True)
def update_preferences(add: str = "", remove: str = "") -> str:
    """Remember or forget something about THIS broker for all future conversations: wording and format preferences ("INR in lakh / crore", "answer in Hinglish", "no charts"), default choices ("my week is Monday to Saturday", "default currency USD"), standing context ("my key clients are 750001 and 750002", "GOLD is our main symbol"). Call this when the user says "remember", "always", "from now on", "by default", "my ... are", or "forget" / "stop doing" / "don't remember". One note per call, written as a short standing instruction. Never store passwords, tokens, or figures from reports.

    Args:
        add: The note to remember (max 240 characters), e.g. "Show INR amounts in lakh and crore".
        remove: Words of an existing note to forget (every note containing them is removed), e.g. "lakh".
    """
    def run() -> str:
        broker_id = brokereye.current_session.get().broker_id
        from . import store
        out: dict[str, Any] = {}
        if remove.strip():
            out["removed"] = store.remove_preferences(broker_id, text=remove)
        if add.strip():
            saved = store.add_preference(broker_id, add, "chat")
            out["saved"] = saved["note"]
            out["already_present"] = saved["existing"]
        if not out:
            raise ValueError("Give something to add or to remove")
        out["notes"] = [p["note"] for p in store.list_preferences(broker_id)]
        out["note"] = "Confirm in one short line what you now remember or forgot."
        return json.dumps(out, ensure_ascii=False, default=str)
    return _guard(run)


# Order is part of the cached prompt prefix — keep it stable (sorted by name).
# ---------------------------------------------------------------------------
# manager rules: the back office's rule list (rule_definitions, GET
# /api/broker/rules); the four standard ones are Close Only, Liquidate,
# No Pending Orders and Non-SQ Time
# ---------------------------------------------------------------------------
_RULE_NAMES = {"CLOSE_ONLY": "Close Only", "LIQUIDATE": "Liquidate", "NO_PENDING_ORDERS": "No Pending Orders",
               "NON_SQ_TIME": "Non-SQ Time"}
_RULE_ALIASES = {
    "close only": "CLOSE_ONLY", "closeonly": "CLOSE_ONLY", "close_only": "CLOSE_ONLY", "close-only": "CLOSE_ONLY",
    "liquidate": "LIQUIDATE", "liquidation": "LIQUIDATE",
    "no pending": "NO_PENDING_ORDERS", "no pending orders": "NO_PENDING_ORDERS", "no_pending_orders": "NO_PENDING_ORDERS",
    "nopending": "NO_PENDING_ORDERS", "no-pending": "NO_PENDING_ORDERS", "pending": "NO_PENDING_ORDERS",
    "non-sq": "NON_SQ_TIME", "non sq": "NON_SQ_TIME", "nonsq": "NON_SQ_TIME", "non_sq": "NON_SQ_TIME",
    "non_sq_time": "NON_SQ_TIME", "non-sq time": "NON_SQ_TIME", "non sq time": "NON_SQ_TIME", "reject": "NON_SQ_TIME",
    "reject time": "NON_SQ_TIME", "sq": "NON_SQ_TIME",
}
_NON_SQ_TIMES = ("1m", "2m", "3m", "5m", "10m", "15m", "30m", "45m", "60m")
# The tag BrokerEye derives from the standard markers (client JSON "rules").
_RULE_TAGS = {"CLOSE_ONLY": "Close Only", "LIQUIDATE": "Liquidate", "NO_PENDING_ORDERS": "No Pending", "NON_SQ_TIME": "Non-SQ"}
# The standard markers (field, value template); the tags only know these.
_STANDARD_MARKERS = {"CLOSE_ONLY": ("city", "close only"), "LIQUIDATE": ("state", "liquidate"),
                     "NO_PENDING_ORDERS": ("zipcode", "no pending"), "NON_SQ_TIME": ("comment", "reject {time}")}


def _is_standard(defn: dict[str, Any]) -> bool:
    """A standard rule still writing its standard marker (the back office may redefine a code, e.g. LIQUIDATE
    writing Country = "U.A.E."); only then do the client-row tags and the standard wording apply."""
    field = re.sub(r"\s+", "", str(defn.get("mt5_field") or "")).lower()
    value = str(defn.get("mt5_value_template") or "").strip().lower()
    return _STANDARD_MARKERS.get(str(defn.get("rule_code") or "")) == (field, value)


def _rule_definitions() -> list[dict[str, Any]]:
    """The back office's active rules: code, name, the MT5 field and value template each writes, whether it
    takes minutes. Custom rules (e.g. one that writes Country = "U.A.E.") come with the four standard ones."""
    data = brokereye.get("/api/broker/rules")
    return [r for r in (data.get("rules") or []) if r.get("rule_code")]


def _norm_code(value: str) -> str:
    return re.sub(r"[\s\-]+", "_", (value or "").strip().upper())


def _rule_def(value: str, defs: list[dict[str, Any]]) -> dict[str, Any]:
    """The definition the user means: its code, its name, or a known alias of a standard rule."""
    s = (value or "").strip()
    by_code = {str(d["rule_code"]).upper(): d for d in defs}
    for key in (_norm_code(s), _RULE_ALIASES.get(s.lower(), "")):
        if key and key in by_code:
            return by_code[key]
    for d in defs:
        if str(d.get("rule_name") or "").strip().lower() == s.lower():
            return d
    hits = [d for d in defs if s and s.lower() in str(d.get("rule_name") or "").lower()]
    if len(hits) == 1:
        return hits[0]
    names = ", ".join(f"{d.get('rule_name')} ({d['rule_code']})" for d in defs) or "none"
    raise ValueError(f"Unknown rule '{value}'. Rules available: {names}.")


def _switched_off_rule(value: str, logins: list[int]) -> dict[str, Any] | None:
    """A rule the back office has switched off is not in its list, but accounts can still carry it and BrokerEye
    still removes it: the definition as the accounts' own active rules name it (code and name only)."""
    seen: dict[str, dict[str, Any]] = {}
    for lg in logins:
        try:
            rows = _active_rules(lg)
        except brokereye.BrokerEyeError:
            continue  # not one of the broker's clients: the card skips it
        for r in rows:
            code = str(r.get("rule_code") or "")
            if code and code not in seen:
                seen[code] = {"rule_code": code, "rule_name": r.get("rule_name") or _RULE_NAMES.get(code) or code,
                              "switched_off": True}
    if not seen:
        return None
    try:
        return _rule_def(value, list(seen.values()))
    except ValueError:
        return None


def _time_param(value: str) -> str:
    m = re.search(r"(\d+)", str(value or ""))
    if not m:
        raise ValueError("This rule needs the minutes: one of " + ", ".join(t[:-1] for t in _NON_SQ_TIMES))
    tp = f"{int(m.group(1))}m"
    if tp not in _NON_SQ_TIMES:
        raise ValueError(f"The minutes must be one of {', '.join(t[:-1] for t in _NON_SQ_TIMES)}")
    return tp


def _rule_value(template: str, time_parameter: str = "") -> str:
    """What a rule writes to MT5 (RuleService / RuleMarkers): the template with "{time}" as "<N> min"."""
    t = time_parameter or ""
    return (template or "").replace("{time}", f"{t[:-1]} min" if t.endswith("m") else t, 1)


def _rule_tag(code: str, time_parameter: str = "", name: str = "", standard: bool = True) -> str:
    tag = (_RULE_TAGS.get(code) if standard else None) or name or code
    return f"{tag} {time_parameter}" if time_parameter else tag


def _has_tag(tags: list[str], code: str) -> bool:
    want = (_RULE_TAGS.get(code) or "").lower()
    return bool(want) and any(str(t).lower().startswith(want) for t in tags or [])


def _active_rules(login: int) -> list[dict[str, Any]]:
    """Rules this broker applied to the login (BrokerEye returns removed rows too)."""
    data = brokereye.get(f"/api/broker/clients/{int(login)}/rules")
    out = []
    for r in data.get("rules") or []:
        if not r.get("is_active"):
            continue
        out.append({k: r.get(k) for k in ("rule_code", "rule_name", "time_parameter", "mt5_applied_value", "applied_at") if r.get(k) is not None})
    return out


def _logins_list(logins: Any) -> list[int]:
    if logins is None:
        return []
    if isinstance(logins, (int, float)):
        return [int(logins)]
    if isinstance(logins, str):
        logins = re.split(r"[\s,;]+", logins.strip())
    out: list[int] = []
    for x in logins:
        try:
            v = int(str(x).strip())
        except ValueError:
            continue
        if v > 0 and v not in out:
            out.append(v)
    return out


def _clients_by_login(logins: list[int]) -> dict[int, dict[str, Any]]:
    """Name, currency and rule tags for accessible logins in one search call."""
    out: dict[int, dict[str, Any]] = {}
    for i in range(0, len(logins), 200):
        chunk = logins[i:i + 200]
        data = brokereye.post("/api/broker/clients/search", {"mt5Accounts": chunk, "limit": len(chunk), "page": 1, "sortBy": "login", "sortOrder": "asc"})
        for c in data.get("clients") or []:
            try:
                out[int(c.get("login"))] = c
            except (TypeError, ValueError):
                continue
    return out


@beta_tool(eager_input_streaming=True)
def client_rules(login: int) -> str:
    """The manager rules on one MT5 account (the standard Close Only, Liquidate, No Pending Orders, Non-SQ Time with its minutes, and any custom rule of the back office, e.g. one that sets the Country), with when each was applied, plus the list of rules that can be applied (available_rules: code, name, the MT5 field and value it writes). The list is kept in step with MT5, so a rule a dealer set directly on MT5 shows here too. Call this for "which rules does 750112 have", "is 750001 close only", "non-SQ time on this account", "which rules can I put on an account". The four standard rules also appear as `rules` tags on client rows from search_clients and margin_call_accounts.

    Args:
        login: The client's MT5 login.
    """
    def run() -> str:
        rules = _active_rules(int(login))
        defs = _rule_definitions()
        std = {str(d["rule_code"]): _is_standard(d) for d in defs}
        tags = [_rule_tag(r.get("rule_code", ""), r.get("time_parameter", ""), r.get("rule_name", ""),
                          std.get(str(r.get("rule_code")), True)) for r in rules]
        return _result({"login": int(login), "rules": rules, "tags": tags,
                        "available_rules": [{"code": d["rule_code"], "name": d.get("rule_name"), "field": d.get("mt5_field"),
                                             "value": d.get("mt5_value_template"),
                                             "needs_minutes": bool(d.get("requires_time_parameter"))} for d in defs],
                        "minutes": [t[:-1] for t in _NON_SQ_TIMES]})
    return _guard(run)


@beta_tool(eager_input_streaming=True)
def propose_rule_action(action: str, rule: str, logins: Logins, time_parameter: str = "") -> str:
    """PREPARE applying or removing a manager rule on one or many MT5 accounts for the broker to confirm — nothing changes by this call. It checks the broker's manage_rules right, that each login is one of their clients, and what each account already has; then shows a confirmation card (one account) or a bulk card (several accounts, one Confirm, per-row outcome). Only Confirm applies it, through BrokerEye with the broker's rights and audit trail. Call this when the user clearly asks to put / set / apply / remove a rule: "put 750112 on close only", "non-SQ 5 minutes for 750112", "remove liquidate from 750088", "apply close only to all accounts below 110% margin" (fetch the logins first, then call once with all of them, up to 50). After calling it, tell the user in one line to confirm the card. Never say the rule was applied.

    Args:
        action: "apply" or "remove".
        rule: The rule's name or code from the back office's list (client_rules lists them): Close Only | Liquidate | No Pending Orders | Non-SQ Time (codes CLOSE_ONLY, LIQUIDATE, NO_PENDING_ORDERS, NON_SQ_TIME), or a custom rule such as one that sets the Country.
        logins: The MT5 logins (1-50).
        time_parameter: Only for a rule that takes minutes (Non-SQ Time), when applying — 1, 2, 3, 5, 10, 15, 30, 45 or 60.
    """
    def run() -> str:
        act = (action or "").strip().lower()
        if act not in ("apply", "remove"):
            raise ValueError("action must be 'apply' or 'remove'")
        _require_interactive("Rule changes")
        session = brokereye.current_session.get()
        if not session.has_right("manage_rules"):
            return _error("This broker does not have the manage_rules right, so rules cannot be applied or removed from Ask AI. "
                          "Tell the user to ask an admin for the right.")
        defs = _rule_definitions()
        try:
            defn = _rule_def(rule, defs)
        except ValueError as e:
            if act != "remove":
                raise
            # Switched off in the back office: it can still be removed from the accounts that carry it.
            defn = _switched_off_rule(rule, _logins_list(logins)[:50])
            if not defn:
                raise ValueError(f"{e} None of these accounts carries a rule called '{rule}' either.") from None
        code = str(defn["rule_code"])
        standard = _is_standard(defn)
        std = {str(d["rule_code"]): _is_standard(d) for d in defs}
        timed = bool(defn.get("requires_time_parameter")) or "{time}" in str(defn.get("mt5_value_template") or "")
        tp = _time_param(time_parameter) if (timed and act == "apply") else ""
        wanted = _logins_list(logins)
        if not wanted:
            raise ValueError("At least one login is required")
        if len(wanted) > 50:
            raise ValueError("At most 50 logins per card; split the list")
        clients = _clients_by_login(wanted)
        items: list[dict[str, Any]] = []
        for lg in wanted:
            c = clients.get(lg)
            if not c:
                items.append({"login": lg, "name": "", "current": [], "status": "skipped", "note": "Not in your range"})
                continue
            # What the account carries: its active rules (kept in step with MT5 by BrokerEye's rule sync), and for
            # the standard rules also the live MT5 tags on the client row.
            active = {str(r.get("rule_code")): r for r in _active_rules(lg)}
            tags = [str(t) for t in (c.get("rules") or [])]
            current = sorted({*tags, *(_rule_tag(k, r.get("time_parameter", ""), r.get("rule_name", ""), std.get(k, True))
                                       for k, r in active.items())})
            has_it = code in active or (standard and _has_tag(tags, code))
            item = {"login": lg, "name": c.get("name") or "", "current": current, "status": "pending", "note": ""}
            if act == "apply" and has_it and not timed:
                item.update(status="skipped", note="Already set")
            elif act == "remove" and not has_it:
                item.update(status="skipped", note="Not applied")
            items.append(item)
        todo = [i for i in items if i["status"] == "pending"]
        if not todo:
            return _error("Nothing to do: " + "; ".join(f"{i['login']}: {i['note']}" for i in items) + ". No card was shown.")

        rule_name = str(defn.get("rule_name") or _RULE_NAMES.get(code) or code)
        tag = _rule_tag(code, tp, rule_name, standard)
        field = str(defn.get("mt5_field") or "")
        value = _rule_value(str(defn.get("mt5_value_template") or ""), tp or ("Nm" if timed else ""))
        if act == "apply":
            writes = f'{field} = "{value}"'
        elif field:
            writes = f'{field} = "" (cleared while it holds the rule\'s value)'
        else:
            writes = "Its MT5 field is cleared while it holds the rule's value (the back office has switched this rule off)"

        effect = {
            "CLOSE_ONLY": "Marks the account close-only on MT5; new positions are refused by the trading rules, existing ones can be closed.",
            "LIQUIDATE": "Marks the account for liquidation handling on MT5.",
            "NO_PENDING_ORDERS": "Marks the account so pending orders are refused; market orders stay allowed.",
            "NON_SQ_TIME": f"Marks the account to reject trades for {tp[:-1] if tp else 'N'} minutes (Non-SQ time); existing positions stay open.",
        }.get(code if standard else "", f"Sets {field} to \"{value}\" on the MT5 account (the back office's {rule_name} rule).") \
            if act == "apply" else f"Clears the {rule_name} marker from the MT5 account."
        from . import store
        if len(wanted) == 1:
            it = todo[0]
            who = f"{it['login']}" + (f" · {it['name']}" if it["name"] else "")
            summary = f"{'Apply' if act == 'apply' else 'Remove'} {tag} {'to' if act == 'apply' else 'from'} {who}"
            details = [["Account", who], ["Rule", tag], ["Effect", effect],
                       ["Current rules", ", ".join(it["current"]) or "none"], ["Writes to MT5", writes]]
            payload = {"login": it["login"], "name": it["name"], "rule_code": code, "rule_name": rule_name, "tag": tag,
                       "time_parameter": tp, "current": it["current"], "details": details, "right": "manage_rules"}
            card = store.create_action(conversation_id=brokereye.current_conversation.get(), broker_id=session.broker_id,
                                       kind="apply_rule" if act == "apply" else "remove_rule", payload=payload, summary=summary,
                                       channel=brokereye.current_channel.get(), ttl_minutes=settings().ai_action_ttl_minutes)
        else:
            n_skip = len(items) - len(todo)
            summary = f"{'Apply' if act == 'apply' else 'Remove'} {tag} {'to' if act == 'apply' else 'from'} {len(todo)} accounts" + (f" ({n_skip} skipped)" if n_skip else "")
            details = [["Rule", tag], ["Accounts", f"{len(todo)} to {act}" + (f", {n_skip} skipped" if n_skip else "")],
                       ["Effect", effect], ["Writes to MT5", writes]]
            payload = {"action": act, "rule_code": code, "rule_name": rule_name, "tag": tag, "time_parameter": tp,
                       "items": items, "details": details, "right": "manage_rules",
                       "note": "Each account is applied separately; a failure on one does not stop the others."}
            card = store.create_action(conversation_id=brokereye.current_conversation.get(), broker_id=session.broker_id,
                                       kind="bulk_rules", payload=payload, summary=summary,
                                       channel=brokereye.current_channel.get(), ttl_minutes=settings().ai_action_ttl_minutes)
        return json.dumps({
            "action_id": card["id"], "status": "pending", "summary": summary, "items": items, "card": card,
            "note": f"A confirmation card is now shown to the user; it expires in {settings().ai_action_ttl_minutes} minutes. "
                    "Tell them in one line to press Confirm (or Cancel). Do NOT say the rule was applied; you will be told the outcome in the next turn.",
        }, ensure_ascii=False, default=str)
    return _guard(run)


# ---------------------------------------------------------------------------
# account actions: trading on/off, account on/off, password resets
# ---------------------------------------------------------------------------
ACCOUNT_ACTIONS: dict[str, dict[str, str]] = {
    "disable_trading": {"right": "mt5.trading_disable", "path": "disable-trading", "label": "Disable trading",
                        "effect": "Sets the MT5 'trade disabled' flag: the client can log in and see the account but cannot open or close positions."},
    "enable_trading": {"right": "mt5.trading_enable", "path": "enable-trading", "label": "Enable trading",
                       "effect": "Clears the MT5 'trade disabled' flag; the client can trade again."},
    "disable_account": {"right": "mt5.account_disable", "path": "disable-account", "label": "Disable account",
                        "effect": "Clears the MT5 'enabled' flag: the client cannot log in to the terminal at all."},
    "enable_account": {"right": "mt5.account_enable", "path": "enable-account", "label": "Enable account",
                       "effect": "Sets the MT5 'enabled' flag; the client can log in again."},
    "reset_trading_password": {"right": "mt5.trading_password_change", "path": "change-trading-password", "label": "Reset trading password",
                               "effect": "Sets a new main (trading) password on the MT5 account. The broker types or generates the password on the card; it never passes through the assistant."},
    "reset_investor_password": {"right": "mt5.investor_password_change", "path": "change-investor-password", "label": "Reset investor password",
                                "effect": "Sets a new investor (read-only) password on the MT5 account. The broker types or generates it on the card."},
}
_ACCOUNT_ALIASES = {
    "disable trading": "disable_trading", "stop trading": "disable_trading", "block trading": "disable_trading", "trade disable": "disable_trading",
    "enable trading": "enable_trading", "allow trading": "enable_trading", "unblock trading": "enable_trading",
    "disable account": "disable_account", "block account": "disable_account", "deactivate": "disable_account", "disable login": "disable_account",
    "enable account": "enable_account", "activate": "enable_account", "unblock account": "enable_account",
    "reset password": "reset_trading_password", "reset trading password": "reset_trading_password", "change password": "reset_trading_password",
    "main password": "reset_trading_password", "trading password": "reset_trading_password",
    "reset investor password": "reset_investor_password", "investor password": "reset_investor_password", "change investor password": "reset_investor_password",
}


def _account_action(value: str) -> str:
    s = (value or "").strip().lower().replace("-", " ")
    key = s.replace(" ", "_")
    if key in ACCOUNT_ACTIONS:
        return key
    code = _ACCOUNT_ALIASES.get(s)
    if not code:
        raise ValueError("action must be one of " + ", ".join(ACCOUNT_ACTIONS))
    return code


@beta_tool(eager_input_streaming=True)
def account_status(login: int) -> str:
    """The MT5 account flags of one client: account_enabled (can log in), trading_enabled / trading_disabled, password_change_allowed, investor, expert_allowed, readonly, api_enabled. Call this for "is 750112 blocked", "can this account trade", "is trading disabled on 750001". Needs the broker's mt5.account_status right.

    Args:
        login: The client's MT5 login.
    """
    def run() -> str:
        data = brokereye.get(f"/api/broker/clients/{int(login)}/account-status")
        keys = ("login", "account_enabled", "trading_enabled", "trading_disabled", "password_change_allowed", "investor",
                "trailing_allowed", "expert_allowed", "reports_allowed", "readonly", "api_enabled")
        return _result({k: data.get(k) for k in keys if k in data})
    return _guard(run)


@beta_tool(eager_input_streaming=True)
def propose_account_action(action: str, login: int) -> str:
    """PREPARE an account action for the broker to confirm — nothing changes by this call: disable_trading / enable_trading (the MT5 trade-disabled flag), disable_account / enable_account (the MT5 login-enabled flag), reset_trading_password / reset_investor_password (a new password the broker types or generates on the card; you never see it). It checks the broker's right for that action and that the login is one of their clients, then shows a confirmation card; only Confirm applies it, through BrokerEye with the broker's rights and audit trail. Call this when the user clearly asks: "disable trading for 750112", "block 750001's account", "reset the password of 750112", "enable trading again". After calling it, tell the user in one line to confirm the card (and, for passwords, to type or generate the new password there). Never say it is done.

    Args:
        action: disable_trading | enable_trading | disable_account | enable_account | reset_trading_password | reset_investor_password.
        login: The client's MT5 login.
    """
    def run() -> str:
        kind = _account_action(action)
        spec = ACCOUNT_ACTIONS[kind]
        _require_interactive("Account actions")
        session = brokereye.current_session.get()
        if not session.has_right(spec["right"]):
            return _error(f"This broker does not have the {spec['right']} right, so '{spec['label']}' cannot be done from Ask AI. "
                          "Tell the user to ask an admin for the right.")
        lg = int(login)
        if lg <= 0:
            raise ValueError("login is required")
        c = _clients_by_login([lg]).get(lg)
        if not c:
            return _error(f"Login {lg} is not one of this broker's clients; nothing was proposed.")
        who = f"{lg}" + (f" · {c.get('name')}" if c.get("name") else "")
        state = []
        try:
            st = brokereye.get(f"/api/broker/clients/{lg}/account-status")
            state = [f"account {'enabled' if st.get('account_enabled') else 'disabled'}", f"trading {'enabled' if st.get('trading_enabled') else 'disabled'}"]
            if kind == "disable_trading" and st.get("trading_disabled"):
                return _error(f"Trading is already disabled on {who}; nothing to do.")
            if kind == "enable_trading" and st.get("trading_enabled"):
                return _error(f"Trading is already enabled on {who}; nothing to do.")
            if kind == "disable_account" and not st.get("account_enabled"):
                return _error(f"Account {who} is already disabled; nothing to do.")
            if kind == "enable_account" and st.get("account_enabled"):
                return _error(f"Account {who} is already enabled; nothing to do.")
        except Exception:  # noqa: BLE001 - status needs its own right; the card still works without it
            te = c.get("tradingEnabled")
            if te is not None:
                state = [f"trading {'enabled' if te else 'disabled'}"]
        summary = f"{spec['label']} · {who}"
        details = [["Account", who], ["Action", spec["label"]], ["Effect", spec["effect"]]]
        if state:
            details.append(["Current state", ", ".join(state)])
        if kind.startswith("reset_"):
            details.append(["New password", "typed or generated on the card, shown to you once; not stored by Ask AI"])
        payload = {"login": lg, "name": c.get("name") or "", "action": kind, "right": spec["right"], "details": details,
                   "needs_password": kind.startswith("reset_")}
        from . import store
        card = store.create_action(conversation_id=brokereye.current_conversation.get(), broker_id=session.broker_id,
                                   kind=kind, payload=payload, summary=summary, channel=brokereye.current_channel.get(),
                                   ttl_minutes=settings().ai_action_ttl_minutes)
        return json.dumps({
            "action_id": card["id"], "status": "pending", "summary": summary, "details": details, "card": card,
            "note": f"A confirmation card is now shown to the user; it expires in {settings().ai_action_ttl_minutes} minutes. "
                    + ("Tell them to type or generate the new password on the card and press Confirm. " if kind.startswith("reset_") else "Tell them in one line to press Confirm (or Cancel). ")
                    + "Do NOT say it was done; you will be told the outcome in the next turn.",
        }, ensure_ascii=False, default=str)
    return _guard(run)


# ---------------------------------------------------------------------------
# settlement weeks and bills
# ---------------------------------------------------------------------------
def _weeks() -> list[dict[str, Any]]:
    data = brokereye.get("/api/broker/settlement-weeks", {"limit": 200, "page": 1})
    return data.get("weeks") or []


def _resolve_week(spec: str) -> dict[str, Any]:
    from . import bills as _bills
    from datetime import datetime as _dt
    return _bills.resolve_week(_weeks(), spec, _dt.now(_tz()).date())


@beta_tool(eager_input_streaming=True)
def settlement_weeks(limit: int = 12) -> str:
    """The admin-defined settlement weeks (billing windows), newest first, with the current one flagged. Call this when the user asks which settlement week it is, for the dates of "this week's bill", or to pick a week by name or date before a bill.

    Args:
        limit: Weeks to return (1-50).
    """
    def run() -> str:
        from . import bills as _bills
        from datetime import datetime as _dt
        weeks = _weeks()
        today = _dt.now(_tz()).date()
        try:
            cur = _bills.resolve_week(weeks, "current", today)
        except ValueError:
            cur = None
        rows = sorted(weeks, key=lambda w: (str(w.get("start_date")), int(w.get("id") or 0)), reverse=True)[:max(1, min(limit, 50))]
        out = [{"id": w.get("id"), "name": w.get("name") or "", "start_date": str(w.get("start_date"))[:10], "end_date": str(w.get("end_date"))[:10],
                "label": _bills.week_label(w), "current": bool(cur and cur["id"] == w.get("id"))} for w in rows]
        return _result({"weeks": out, "today": today.isoformat(), "current": cur})
    return _guard(run)


@beta_tool(eager_input_streaming=True)
def settlement_bill(logins: Logins, week: str = "current", format: str = "") -> str:
    """The settlement bill (statement) of one or more clients for a settlement week: per symbol the buy and sell lots, number of trades, P&L and brokerage, then Gross − Brokerage = Net for the account. Shown to the user as a statement card automatically; with a format it is also delivered as a file. Call this for "bill for 750001", "statement of 750001 this week", "send 750001's bill as PDF". For all clients at once use bill_summary.

    Args:
        logins: MT5 logins (1-50).
        week: "current" (default), "last", a week id, a date YYYY-MM-DD inside the week, or part of the week's name.
        format: "" for the card only, or "pdf" / "xlsx" / "csv" to also deliver the statement as a file.
    """
    def run() -> str:
        from . import bills as _bills
        wanted = _logins_list(logins)
        if not wanted:
            raise ValueError("At least one login is required")
        if len(wanted) > _bills.MAX_LOGINS:
            raise ValueError(f"At most {_bills.MAX_LOGINS} logins per bill call; use bill_summary for everyone")
        fmt = (format or "").strip().lower()
        if fmt and fmt not in ("pdf", "xlsx", "csv"):
            raise ValueError("format must be pdf, xlsx or csv")
        wk = _resolve_week(week)
        data = brokereye.post("/api/broker/bills", {"week_id": wk["id"], "logins": wanted})
        with_trades = len(wanted) <= 3
        bills = [_bills.compact_bill(b, with_trades=with_trades) for b in data.get("Bills") or []]
        skipped = data.get("SkippedLogins") or []
        clients = _clients_by_login([b["login"] for b in bills])
        currency = {lg: str(c.get("currency") or "") for lg, c in clients.items()}
        for b in bills:
            if not b["name"]:
                b["name"] = (clients.get(b["login"]) or {}).get("name") or ""
        card = _bills.bill_card(wk, bills, skipped, currency)
        out: dict[str, Any] = {
            "week": wk, "bills": [{k: v for k, v in b.items() if k not in ("trades", "trades_truncated")} for b in bills],
            "skipped": skipped, "bill_card": card,
            "note": "The statement card is shown to the user automatically; summarise in one or two lines (net per account, the week) and do not repeat every row.",
        }
        if fmt and bills:
            file = _bills.bill_file(fmt, wk, bills, currency)
            out.update(file)
            out["note"] += " The file is delivered automatically; mention it."
        return _result(out)
    return _guard(run)


@beta_tool(eager_input_streaming=True)
def bill_summary(
    week: str = "current",
    search: str = "",
    logins: Logins = None,
    sort_by: str = "net",
    sort_order: str = "desc",
    limit: int = 50,
    page: int = 1,
    hide_zero_net: bool = True,
) -> str:
    """Gross, Brokerage and Net per client for one settlement week across all the broker's clients, with grand totals (for the whole filtered set, not only the page). Call this for "bills for all my clients this week", "bill summary", "who owes the most this settlement", "total brokerage this week". For every row use export_report("bill_summary") to deliver the Excel file.

    Args:
        week: "current" (default), "last", a week id, a date YYYY-MM-DD inside the week, or part of the week's name.
        search: Login or name filter.
        logins: Restrict to these MT5 logins.
        sort_by: net | gross | brokerage | login | name.
        sort_order: "asc" or "desc".
        limit: Rows to return (1-200).
        page: Page number.
        hide_zero_net: Skip accounts with no trades (net 0). Default true.
    """
    def run() -> str:
        wk = _resolve_week(week)
        body = _search_body(search=search, filters=None, sort_by=sort_by or "net", sort_order=sort_order, limit=limit, page=page,
                            logins=logins, extra={"week_id": wk["id"], "hideZeroNet": bool(hide_zero_net)})
        data = brokereye.post("/api/broker/bills/summary", body)
        rows = [{"login": r.get("Login"), "name": r.get("Name"), "gross": r.get("TotalGrossAmount"),
                 "brokerage": r.get("TotalBrokerage"), "net": r.get("TotalNetAmount")} for r in data.get("Bills") or []]
        pg = data.get("pagination") or {}
        tot = data.get("totals") or {}
        total = pg.get("total", len(rows))
        return _result({
            "week": wk, "rows": rows, "returned": len(rows), "total": total, "page": pg.get("page", page), "total_pages": pg.get("total_pages"),
            "truncated": isinstance(total, int) and total > len(rows),
            "totals": {"gross": tot.get("TotalGrossAmount"), "brokerage": tot.get("TotalBrokerage"), "net": tot.get("TotalNetAmount")},
            "note": "Present as a table Login · Name · Gross · Brokerage · Net with the totals row; say the week. For a file call export_report with report='bill_summary'.",
        })
    return _guard(run)


TOOLS = sorted(
    [
        account_status,
        propose_account_action,
        client_rules,
        propose_rule_action,
        settlement_weeks,
        settlement_bill,
        bill_summary,
        compare_periods,
        read_upload,
        manage_alerts,
        manage_digests,
        propose_credit_action,
        update_preferences,
        credit_position,
        temp_credits,
        render_chart,
        aggregate_deals,
        get_group_settings,
        export_table,
        export_report,
        agent_details_report,
        credit_report,
        deposit_withdrawal_report,
        get_client_overview,
        margin_call_accounts,
        net_positions_by_exchange,
        search_clients,
        search_deals,
        search_open_positions,
        summary_report,
    ],
    key=lambda t: t.name,
)
