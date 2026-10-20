"""Settlement bills: week resolution, compact views of BrokerEye's bill
responses, the statement card the web UI draws, and the Excel / PDF / CSV
statement file. Shared by the chat tools and the direct download endpoint."""
from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any

from . import exports

MAX_LOGINS = 50          # BrokerEye's cap on POST /api/broker/bills
TRADE_DETAIL_CAP = 300   # trades kept per bill in the card


def _d(v: Any) -> date | None:
    try:
        return date.fromisoformat(str(v)[:10])
    except (TypeError, ValueError):
        return None


def week_label(w: dict[str, Any]) -> str:
    s, e = _d(w.get("start_date")), _d(w.get("end_date"))
    span = f"{s:%d %b} – {e:%d %b %Y}" if s and e else f"{w.get('start_date')} – {w.get('end_date')}"
    name = (w.get("name") or "").strip() or f"Week #{w.get('id')}"
    return f"{name} · {span}"


def resolve_week(weeks: list[dict[str, Any]], spec: str, today: date) -> dict[str, Any]:
    """Pick a settlement week from the admin-defined list.

    spec: "" / "current" / "this" -> the newest week that has started and not
    ended (else the newest started week); "last" / "previous" -> the one before
    it; an integer -> by id; YYYY-MM-DD -> the week containing that date;
    anything else -> a case-insensitive name match."""
    rows = [w for w in weeks if _d(w.get("start_date")) and _d(w.get("end_date"))]
    rows.sort(key=lambda w: (_d(w["start_date"]), int(w.get("id") or 0)), reverse=True)
    if not rows:
        raise ValueError("No settlement weeks are defined; ask an admin to add them under Settlement weeks.")
    s = (spec or "").strip().lower()
    started = [w for w in rows if _d(w["start_date"]) <= today]
    current = next((w for w in started if _d(w["end_date"]) >= today), started[0] if started else rows[-1])

    def view(w: dict[str, Any]) -> dict[str, Any]:
        return {"id": int(w["id"]), "name": w.get("name") or "", "start_date": str(w["start_date"])[:10],
                "end_date": str(w["end_date"])[:10], "label": week_label(w), "current": w is current}

    if s in ("", "current", "this", "this week", "now", "latest"):
        return view(current)
    if s in ("last", "previous", "last week", "previous week", "prev"):
        idx = rows.index(current)
        if idx + 1 >= len(rows):
            raise ValueError("There is no settlement week before the current one.")
        return view(rows[idx + 1])
    if s.isdigit():
        for w in rows:
            if int(w.get("id") or 0) == int(s):
                return view(w)
        raise ValueError(f"No settlement week has id {s}.")
    m = re.fullmatch(r"(\d{4}-\d{2}-\d{2})", s)
    if m:
        d = _d(m.group(1))
        for w in rows:
            if _d(w["start_date"]) <= d <= _d(w["end_date"]):
                return view(w)
        raise ValueError(f"No settlement week covers {s}.")
    for w in rows:
        if s in (w.get("name") or "").lower():
            return view(w)
    options = "; ".join(week_label(w) for w in rows[:6])
    raise ValueError(f"Unknown settlement week '{spec}'. Latest weeks: {options}.")


def _f(v: Any) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def compact_bill(bill: dict[str, Any], *, with_trades: bool) -> dict[str, Any]:
    """BrokerEye's bill (TotalGrossAmount, Symbols[{BUY:[...], SELL:[...]}]) as
    the compact object the model reads and the card draws."""
    symbols, trades = [], []
    for s in bill.get("Symbols") or []:
        buys, sells = s.get("BUY") or [], s.get("SELL") or []
        symbols.append({
            "symbol": s.get("Symbol"), "buy_lots": round(_f(s.get("TotalBuy")), 2), "sell_lots": round(_f(s.get("TotalSell")), 2),
            "trades": len(buys) + len(sells), "pnl": round(_f(s.get("TotalGrossAmount")), 2),
            "brokerage": round(_f(s.get("TotalBrokerage")), 2), "net": round(_f(s.get("TotalNetAmount")), 2),
        })
        if with_trades:
            for side, rows in (("BUY", buys), ("SELL", sells)):
                for t in rows:
                    trades.append({"symbol": s.get("Symbol"), "side": side, "qty": round(_f(t.get("Quantity")), 2),
                                   "price": _f(t.get("Price")), "brokerage": round(_f(t.get("Brokerage")), 2),
                                   "pnl": round(_f(t.get("PnL")), 2), "time": t.get("Datetime")})
    trades.sort(key=lambda t: t.get("time") or "")
    out = {
        "login": int(bill.get("Login") or 0), "name": bill.get("Name") or "",
        "gross": round(_f(bill.get("TotalGrossAmount")), 2), "brokerage": round(_f(bill.get("TotalBrokerage")), 2),
        "net": round(_f(bill.get("TotalNetAmount")), 2), "symbols": symbols,
    }
    if with_trades:
        out["trades"] = trades[:TRADE_DETAIL_CAP]
        out["trades_truncated"] = len(trades) > TRADE_DETAIL_CAP
    return out


def bill_card(week: dict[str, Any], bills: list[dict[str, Any]], skipped: list[dict[str, Any]],
              currency: dict[int, str]) -> dict[str, Any]:
    return {
        "week": {k: week.get(k) for k in ("id", "name", "start_date", "end_date", "label")},
        "bills": [{**b, "currency": currency.get(b["login"], "")} for b in bills],
        "skipped": [{"login": s.get("login"), "reason": s.get("reason")} for s in skipped or []],
        "generated_at": datetime.now().isoformat(timespec="seconds"),
    }


_COLUMNS = ["Symbol", "Buy lots", "Sell lots", "Trades", "P&L", "Brokerage", "Net"]


def bill_file(fmt: str, week: dict[str, Any], bills: list[dict[str, Any]], currency: dict[int, str]) -> dict[str, Any]:
    """One statement (one login) or a combined statement (several logins) as
    xlsx / pdf / csv through exports.export_table."""
    if not bills:
        raise ValueError("No bill rows to export")
    if len(bills) == 1:
        b = bills[0]
        cur = currency.get(b["login"], "")
        rows = [[s["symbol"], s["buy_lots"], s["sell_lots"], s["trades"], s["pnl"], s["brokerage"], s["net"]] for s in b["symbols"]]
        totals = {"Buy lots": round(sum(s["buy_lots"] for s in b["symbols"]), 2), "Sell lots": round(sum(s["sell_lots"] for s in b["symbols"]), 2),
                  "Trades": sum(s["trades"] for s in b["symbols"]), "P&L": b["gross"], "Brokerage": b["brokerage"], "Net": b["net"]}
        title = f"Settlement bill {b['login']} {b['name']}".strip()
        sub = f"{week.get('label')}" + (f" · {cur}" if cur else "") + f" · Gross {b['gross']:,.2f} − Brokerage {b['brokerage']:,.2f} = Net {b['net']:,.2f}"
        return exports.export_table(fmt, title, _COLUMNS, rows, totals=totals, subtitle=sub, filename=f"{title} {week.get('start_date')} to {week.get('end_date')}")
    cols = ["Login", "Name", *_COLUMNS]
    rows = []
    for b in bills:
        for s in b["symbols"]:
            rows.append([b["login"], b["name"], s["symbol"], s["buy_lots"], s["sell_lots"], s["trades"], s["pnl"], s["brokerage"], s["net"]])
    totals = {"P&L": round(sum(b["gross"] for b in bills), 2), "Brokerage": round(sum(b["brokerage"] for b in bills), 2),
              "Net": round(sum(b["net"] for b in bills), 2), "Trades": sum(s["trades"] for b in bills for s in b["symbols"])}
    title = f"Settlement bills {len(bills)} logins"
    return exports.export_table(fmt, title, cols, rows, totals=totals, subtitle=str(week.get("label") or ""),
                                filename=f"Settlement bills {week.get('start_date')} to {week.get('end_date')}")
