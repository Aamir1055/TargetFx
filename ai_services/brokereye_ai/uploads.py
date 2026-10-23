"""Files a broker drops into the chat (CSV / Excel / plain text lists).

The file is parsed on upload into a small table (columns + rows, capped),
stored as JSON under files/ with a 24-hour TTL and bound to the broker who
uploaded it. The model never sees the raw file: the user turn gets a short
description (columns, row count, first rows) and read_upload pages through
the rows on demand — so a 5,000-row statement costs nothing until asked for.
"""
from __future__ import annotations

import base64
import csv
import io
import json
import re
import secrets
import time
from pathlib import Path
from typing import Any

from .charts import FILES_DIR

TTL_SECONDS = 24 * 3600
MAX_BYTES = 8 * 1024 * 1024
MAX_IMAGE_BYTES = 5 * 1024 * 1024  # Anthropic rejects base64 images larger than ~5 MB
MAX_ROWS = 20000
MAX_COLS = 40
_ID_RE = re.compile(r"^[A-Za-z0-9_-]{10,40}$")
_LOGIN_RE = re.compile(r"^\d{3,12}$")

# Image types the model can see directly (sent as an image content block, not parsed into a table).
IMAGE_EXTS = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "gif": "image/gif", "webp": "image/webp"}


def _sniff_image(data: bytes) -> str | None:
    """Best-effort media type from the file's magic bytes, for pasted screenshots
    that may arrive without a reliable extension."""
    if data[:8].startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


class UploadError(ValueError):
    pass


def _cell(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, (int, float, bool)):
        return v
    s = str(v).strip()
    if s == "":
        return None
    # numbers with thousands separators / currency signs -> numbers
    t = s.replace(",", "").replace("₹", "").replace("$", "").strip()
    if re.fullmatch(r"-?\d+(\.\d+)?", t):
        try:
            f = float(t)
            return int(f) if f.is_integer() and "." not in t else f
        except ValueError:
            return s
    return s[:500]


def _parse_csv(data: bytes) -> tuple[list[str], list[list[Any]]]:
    text = data.decode("utf-8-sig", errors="replace")
    sample = text[:20000]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
    rows = [r for r in csv.reader(io.StringIO(text), dialect) if any(str(c).strip() for c in r)]
    if not rows:
        raise UploadError("The file is empty")
    header_like = sum(1 for c in rows[0] if not re.fullmatch(r"[-\d.,\s₹$]+", str(c).strip() or "x")) >= max(1, len(rows[0]) // 2)
    if header_like and len(rows) > 1:
        columns = [str(c).strip() or f"col{i + 1}" for i, c in enumerate(rows[0])]
        body = rows[1:]
    else:
        columns = [f"col{i + 1}" for i in range(len(rows[0]))]
        body = rows
    return columns, [[_cell(c) for c in r] for r in body]


def _parse_xlsx(data: bytes) -> tuple[list[str], list[list[Any]]]:
    import openpyxl

    wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    ws = wb.worksheets[0]
    rows = [list(r) for r in ws.iter_rows(values_only=True) if r and any(c not in (None, "") for c in r)]
    wb.close()
    if not rows:
        raise UploadError("The sheet is empty")
    first = rows[0]
    header_like = sum(1 for c in first if isinstance(c, str)) >= max(1, len(first) // 2)
    if header_like and len(rows) > 1:
        columns = [str(c).strip() if c not in (None, "") else f"col{i + 1}" for i, c in enumerate(first)]
        body = rows[1:]
    else:
        columns = [f"col{i + 1}" for i in range(len(first))]
        body = rows
    out = []
    for r in body:
        out.append([_cell(c.isoformat() if hasattr(c, "isoformat") else c) for c in r])
    return columns, out


def _parse_text(data: bytes) -> tuple[list[str], list[list[Any]]]:
    text = data.decode("utf-8-sig", errors="replace")
    tokens = [t for t in re.split(r"[\s,;]+", text) if t]
    if tokens and all(_LOGIN_RE.match(t) for t in tokens):
        return ["login"], [[int(t)] for t in tokens]
    lines = [ln.rstrip() for ln in text.splitlines() if ln.strip()]
    return ["text"], [[ln[:500]] for ln in lines]


def _save_image(broker_id: int, name: str, data: bytes, media_type: str) -> dict[str, Any]:
    """Store an image upload. The raw bytes are kept (base64) so the agent can
    hand them to the model as an image block; images are never parsed into tables."""
    if len(data) > MAX_IMAGE_BYTES:
        raise UploadError(f"Image too large (max {MAX_IMAGE_BYTES // (1024 * 1024)} MB)")
    upload_id = secrets.token_urlsafe(18)
    doc = {"id": upload_id, "broker_id": broker_id, "filename": name, "kind": "image",
           "media_type": media_type, "data_b64": base64.b64encode(data).decode("ascii"),
           "created_at": int(time.time())}
    _cleanup()
    (FILES_DIR / f"{upload_id}.upload.json").write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    return summary(doc)


def save_upload(broker_id: int, filename: str, data: bytes) -> dict[str, Any]:
    """Parse and store; returns the summary the UI and the model see."""
    if len(data) > MAX_BYTES:
        raise UploadError(f"File too large (max {MAX_BYTES // (1024 * 1024)} MB)")
    name = (filename or "upload").strip()[:120]
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    # Images (incl. pasted screenshots): recognised by extension or by magic bytes.
    img_type = IMAGE_EXTS.get(ext) or _sniff_image(data)
    if img_type:
        return _save_image(broker_id, name, data, img_type)
    if ext in ("xlsx", "xlsm"):
        columns, rows = _parse_xlsx(data)
    elif ext in ("csv", "tsv"):
        columns, rows = _parse_csv(data)
    elif ext in ("txt", "", "log"):
        # a CSV without the extension still parses as one
        text = data[:4000].decode("utf-8-sig", errors="replace")
        columns, rows = _parse_csv(data) if text.count(",") + text.count(";") + text.count("\t") > max(2, text.count("\n") // 2) else _parse_text(data)
    else:
        raise UploadError("Only CSV, Excel (.xlsx) and plain text files are supported")
    columns = columns[:MAX_COLS]
    truncated = len(rows) > MAX_ROWS
    rows = [r[:MAX_COLS] + [None] * (len(columns) - len(r[:MAX_COLS])) for r in rows[:MAX_ROWS]]
    login_col = next((i for i, c in enumerate(columns) if re.fullmatch(r"(mt5 ?)?login|account( ?(no|number|id))?|a/c", c.strip().lower())), None)
    if login_col is None:
        # a column whose values all look like logins
        for i in range(len(columns)):
            vals = [r[i] for r in rows[:200] if r[i] is not None]
            if vals and all(isinstance(v, int) and 100 <= v < 10 ** 12 for v in vals):
                login_col = i
                break
    logins = sorted({int(r[login_col]) for r in rows if login_col is not None and isinstance(r[login_col], int)}) if login_col is not None else []
    upload_id = secrets.token_urlsafe(18)
    doc = {"id": upload_id, "broker_id": broker_id, "filename": name, "columns": columns, "rows": rows, "row_count": len(rows),
           "truncated": truncated, "login_column": columns[login_col] if login_col is not None else None, "logins": logins[:5000],
           "created_at": int(time.time())}
    _cleanup()
    (FILES_DIR / f"{upload_id}.upload.json").write_text(json.dumps(doc, ensure_ascii=False, default=str), encoding="utf-8")
    return summary(doc)


def summary(doc: dict[str, Any]) -> dict[str, Any]:
    if doc.get("kind") == "image":
        return {"id": doc["id"], "filename": doc["filename"], "kind": "image", "media_type": doc.get("media_type"),
                "columns": [], "row_count": 0, "truncated": False, "login_column": None, "login_count": 0, "preview": []}
    return {"id": doc["id"], "filename": doc["filename"], "columns": doc["columns"], "row_count": doc["row_count"],
            "truncated": doc["truncated"], "login_column": doc.get("login_column"), "login_count": len(doc.get("logins") or []),
            "preview": doc["rows"][:5]}


def load_upload(broker_id: int, upload_id: str) -> dict[str, Any] | None:
    if not _ID_RE.match(upload_id or ""):
        return None
    p = FILES_DIR / f"{upload_id}.upload.json"
    if not p.is_file():
        return None
    try:
        doc = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if int(doc.get("broker_id", -1)) != int(broker_id):
        return None
    return doc


def describe_for_model(doc: dict[str, Any]) -> str:
    """The text block added to the user turn when a file is attached."""
    if doc.get("kind") == "image":
        return f'[Attached image "{doc["filename"]}" (upload_id {doc["id"]}). The image itself is included below.]'
    s = summary(doc)
    head = " | ".join(s["columns"])
    lines = [" | ".join("" if c is None else str(c) for c in r) for r in s["preview"]]
    txt = (f"[Attached file \"{s['filename']}\" (upload_id {s['id']}): {s['row_count']} rows"
           f"{' (cut at the row cap)' if s['truncated'] else ''}, columns: {head}.")
    if s["login_column"]:
        txt += f" Column \"{s['login_column']}\" holds {s['login_count']} distinct MT5 logins."
    txt += " First rows:\n" + "\n".join(lines) + "\nUse read_upload to see more rows or to get the login list; do not guess beyond what it returns.]"
    return txt


def _cleanup() -> None:
    cutoff = time.time() - TTL_SECONDS
    for p in FILES_DIR.glob("*.upload.json"):
        try:
            if p.stat().st_mtime < cutoff:
                p.unlink()
        except OSError:
            pass
