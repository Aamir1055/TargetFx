"""Server-side chart rendering (matplotlib, Agg) so every channel — the web
chat and the Telegram bot — shows the same picture.

Rendered PNGs live in files/ next to the service for an hour under an
unguessable id and are served by GET /ai/files/{id}.png.
"""
from __future__ import annotations

import math
import secrets
import threading
import time
from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.ticker import FuncFormatter  # noqa: E402

FILES_DIR = Path(__file__).resolve().parent.parent / "files"
TTL_SECONDS = 3600

CHART_TYPES = ("bar", "horizontal_bar", "stacked_bar", "line", "area", "pie", "doughnut")
PALETTE = ["#2563eb", "#7c3aed", "#059669", "#f59e0b", "#dc2626", "#0891b2", "#db2777", "#65a30d", "#9333ea", "#0d9488"]

_lock = threading.Lock()


INDIAN_UNITS = {"INR", "RS", "RS.", "₹", "RUPEE", "RUPEES"}


def _indian_group(n: float) -> str:
    """12,50,000 style digit grouping."""
    neg = n < 0
    s = f"{abs(n):.0f}"
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        s = ",".join(parts) + "," + tail
    return ("-" if neg else "") + s


def _fmt_value(v: float, unit: str, indian: bool | None = None) -> str:
    """Compact money/number formatting. International: 1.2M, 340.5k. Indian
    (INR): 2.80 Cr, 12.5 L, 45,000 — the way the broker's clients read it."""
    if indian is None:
        indian = unit.strip().upper() in INDIAN_UNITS
    a = abs(v)
    if indian:
        if a >= 1e7:
            s = f"{v / 1e7:,.2f} Cr".replace(".00 Cr", " Cr")
        elif a >= 1e5:
            s = f"{v / 1e5:,.2f} L".replace(".00 L", " L")
        elif a >= 1e3:
            s = _indian_group(v)
        elif a >= 1:
            s = f"{v:,.2f}".rstrip("0").rstrip(".")
        else:
            s = f"{v:,.2f}"
    elif a >= 1e6:
        s = f"{v / 1e6:,.2f}M".replace(".00M", "M")
    elif a >= 1e4:
        s = f"{v / 1e3:,.1f}k".replace(".0k", "k")
    elif a >= 1e3:
        s = f"{v:,.0f}"
    elif a >= 1:
        s = f"{v:,.2f}".rstrip("0").rstrip(".")
    else:
        s = f"{v:,.2f}"
    if unit == "%":
        return s + "%"
    return f"{s} {unit}".strip() if unit else s


def _cleanup() -> None:
    cutoff = time.time() - TTL_SECONDS
    for p in FILES_DIR.glob("*.*"):
        try:
            if p.stat().st_mtime < cutoff:
                p.unlink()
        except OSError:
            pass


def render_chart(
    chart_type: str,
    title: str,
    labels: list[str],
    series: list[dict[str, Any]],
    unit: str = "",
    subtitle: str = "",
) -> dict[str, Any]:
    """Render and store a chart. Returns {"chart_id", "path", "title"}."""
    chart_type = (chart_type or "bar").lower().strip()
    if chart_type not in CHART_TYPES:
        raise ValueError(f"chart_type must be one of {', '.join(CHART_TYPES)}")
    if not labels:
        raise ValueError("labels must not be empty")
    if not series or not all(isinstance(s, dict) and isinstance(s.get("values"), list) for s in series):
        raise ValueError("series must be a list of {name, values}")
    series = [{"name": str(s.get("name") or f"Series {i + 1}"),
               "values": [float(x or 0) for x in s["values"]][: len(labels)]}
              for i, s in enumerate(series[:10])]
    for s in series:
        s["values"] += [0.0] * (len(labels) - len(s["values"]))
    labels = [str(x) for x in labels[:40]]
    for s in series:
        s["values"] = s["values"][: len(labels)]

    n = len(labels)
    wide = chart_type in ("horizontal_bar",)
    fig_w, fig_h = (9.6, max(4.2, 0.42 * n + 1.8)) if wide else (max(8.0, min(13.0, 0.6 * n + 4.0)), 5.2)
    if chart_type in ("pie", "doughnut"):
        fig_w, fig_h = 8.0, 5.6

    plt.rcParams.update({
        "font.family": "sans-serif",
        "font.sans-serif": ["Segoe UI", "Helvetica Neue", "Arial", "DejaVu Sans"],
        "axes.spines.top": False, "axes.spines.right": False,
        "axes.edgecolor": "#d4d4d8", "axes.labelcolor": "#374151",
        "xtick.color": "#4b5563", "ytick.color": "#4b5563",
        "axes.titleweight": "bold", "axes.titlesize": 14,
    })
    fig, ax = plt.subplots(figsize=(fig_w, fig_h), dpi=160)
    fig.patch.set_facecolor("white")
    indian = unit.strip().upper() in INDIAN_UNITS
    fmt = FuncFormatter(lambda v, _: _fmt_value(v, "", indian))

    if chart_type in ("pie", "doughnut"):
        vals = series[0]["values"]
        total = sum(abs(v) for v in vals) or 1.0
        keep = [(l, abs(v)) for l, v in zip(labels, vals) if abs(v) > 0]
        if not keep:
            raise ValueError("all values are zero")
        wedges, _ = ax.pie([v for _, v in keep], colors=PALETTE * 4, startangle=90, counterclock=False,
                           wedgeprops={"width": 0.45, "edgecolor": "white"} if chart_type == "doughnut"
                           else {"edgecolor": "white"})
        legend_labels = [f"{l} — {_fmt_value(v, unit)} ({v / total * 100:.1f}%)" for l, v in keep]
        ax.legend(wedges, legend_labels, loc="center left", bbox_to_anchor=(1.0, 0.5), frameon=False, fontsize=9.5)
        ax.set_aspect("equal")
        if chart_type == "doughnut":
            ax.text(0, 0, _fmt_value(total, unit), ha="center", va="center", fontsize=13, fontweight="bold", color="#111827")
    elif chart_type in ("line", "area"):
        x = list(range(n))
        for i, s in enumerate(series):
            color = PALETTE[i % len(PALETTE)]
            ax.plot(x, s["values"], marker="o", markersize=4, linewidth=2.2, color=color, label=s["name"])
            if chart_type == "area":
                ax.fill_between(x, s["values"], alpha=0.12, color=color)
            if n <= 16 and len(series) <= 2:
                for xi, v in zip(x, s["values"]):
                    ax.annotate(_fmt_value(v, "", indian), (xi, v), textcoords="offset points", xytext=(0, 7),
                                ha="center", fontsize=8, color="#374151")
        ax.set_xticks(x, labels, rotation=30 if n > 8 else 0, ha="right" if n > 8 else "center", fontsize=9)
        ax.yaxis.set_major_formatter(fmt)
        ax.grid(axis="y", color="#e5e7eb", linewidth=0.8)
        ax.set_axisbelow(True)
        if len(series) > 1:
            ax.legend(frameon=False, fontsize=9)
    else:
        k = len(series)
        idx = list(range(n))
        if chart_type == "stacked_bar":
            bottoms = [0.0] * n
            for i, s in enumerate(series):
                bars = (ax.barh if wide else ax.bar)(idx, s["values"], 0.62, label=s["name"],
                                                     color=PALETTE[i % len(PALETTE)], **({"left": bottoms} if wide else {"bottom": bottoms}))
                bottoms = [b + v for b, v in zip(bottoms, s["values"])]
            totals = bottoms
            for xi, t in zip(idx, totals):
                if wide:
                    ax.annotate(_fmt_value(t, "", indian), (t, xi), textcoords="offset points", xytext=(4, 0), va="center", fontsize=8, color="#374151")
                else:
                    ax.annotate(_fmt_value(t, "", indian), (xi, t), textcoords="offset points", xytext=(0, 4), ha="center", fontsize=8, color="#374151")
        else:
            width = 0.72 / k
            for i, s in enumerate(series):
                pos = [p + (i - (k - 1) / 2) * width for p in idx]
                colors = [PALETTE[i % len(PALETTE)]] * n if k > 1 else \
                    ["#dc2626" if v < 0 else "#2563eb" for v in s["values"]]
                bars = (ax.barh if wide else ax.bar)(pos, s["values"], width, label=s["name"], color=colors)
                if n * k <= 40:
                    for b, v in zip(bars, s["values"]):
                        if wide:
                            ax.annotate(_fmt_value(v, "", indian), (b.get_width(), b.get_y() + b.get_height() / 2),
                                        textcoords="offset points", xytext=(4 if v >= 0 else -4, 0),
                                        ha="left" if v >= 0 else "right", va="center", fontsize=8, color="#374151")
                        else:
                            ax.annotate(_fmt_value(v, "", indian), (b.get_x() + b.get_width() / 2, b.get_height()),
                                        textcoords="offset points", xytext=(0, 4 if v >= 0 else -11),
                                        ha="center", fontsize=8, color="#374151")
        if wide:
            ax.set_yticks(idx, labels, fontsize=9)
            ax.invert_yaxis()
            ax.xaxis.set_major_formatter(fmt)
            ax.grid(axis="x", color="#e5e7eb", linewidth=0.8)
        else:
            ax.set_xticks(idx, labels, rotation=30 if n > 8 else 0, ha="right" if n > 8 else "center", fontsize=9)
            ax.yaxis.set_major_formatter(fmt)
            ax.grid(axis="y", color="#e5e7eb", linewidth=0.8)
        ax.set_axisbelow(True)
        if k > 1:
            ax.legend(frameon=False, fontsize=9)
        ax.axhline(0, color="#9ca3af", linewidth=0.8) if not wide else ax.axvline(0, color="#9ca3af", linewidth=0.8)

    ax.set_title(title, loc="left", pad=26 if subtitle else 12, color="#111827")
    if subtitle:
        ax.text(0, 1.03, subtitle, transform=ax.transAxes, fontsize=9.5, color="#6b7280", va="bottom")
    if unit and chart_type not in ("pie", "doughnut"):
        (ax.set_xlabel if wide else ax.set_ylabel)(unit, color="#6b7280", fontsize=9)
    fig.tight_layout()

    FILES_DIR.mkdir(exist_ok=True)
    chart_id = secrets.token_urlsafe(18)
    path = FILES_DIR / f"{chart_id}.png"
    with _lock:
        # bbox_inches="tight" keeps legends placed outside the axes (pie/doughnut) in frame.
        fig.savefig(path, format="png", facecolor="white", bbox_inches="tight", pad_inches=0.25)
    plt.close(fig)
    _cleanup()
    return {"chart_id": chart_id, "path": str(path), "title": title}


_ID_CHARS = set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_")


def stored_file(name: str) -> tuple[Path, str] | None:
    """Resolve '<id>.<ext>' (ext: png/csv/xlsx/pdf) to a stored file."""
    if "." not in name:
        name += ".png"
    file_id, _, ext = name.rpartition(".")
    if not file_id or ext not in ("png", "csv", "xlsx", "pdf") or any(c not in _ID_CHARS for c in file_id):
        return None
    p = FILES_DIR / f"{file_id}.{ext}"
    return (p, ext) if p.is_file() else None


def chart_path(chart_id: str) -> Path | None:
    hit = stored_file(chart_id if "." in chart_id else chart_id + ".png")
    return hit[0] if hit else None
