"""Markdown (what the model writes) -> Telegram HTML (what the bot sends).

Telegram's HTML dialect only knows <b>, <i>, <u>, <s>, <code>, <pre>, <a>.
Tables and headings do not exist there, so tables become monospace blocks and
headings become bold lines. Output is split into chunks under Telegram's
4096-character message limit, never inside a tag.
"""
from __future__ import annotations

import html
import re

TELEGRAM_LIMIT = 4000  # leave headroom under the 4096 hard limit
RICH_LIMIT = 30000     # rich messages (sendRichMessage) hold 32768 characters
_NUMERIC_RE = re.compile(r"[-+−]?[\d,.  ]*\d[\d,.]*\s*(%|[A-Z]{3}|lots?|k|K|M|L|Cr)?")


def _inline(text: str) -> str:
    """Escape, then apply inline markdown inside one line."""
    out: list[str] = []
    # Protect code spans first: they are escaped but not further formatted.
    parts = re.split(r"(`[^`\n]+`)", text)
    for part in parts:
        if part.startswith("`") and part.endswith("`") and len(part) > 1:
            out.append("<code>" + html.escape(part[1:-1]) + "</code>")
            continue
        s = html.escape(part, quote=False)
        s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
        s = re.sub(r"__(.+?)__", r"<b>\1</b>", s)
        s = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"<i>\1</i>", s)
        s = re.sub(r"(?<![\w_])_(?!\s)(.+?)(?<!\s)_(?![\w_])", r"<i>\1</i>", s)
        s = re.sub(r"~~(.+?)~~", r"<s>\1</s>", s)
        s = re.sub(r"\[([^\]]+)\]\((https?://[^)\s]+)\)", r'<a href="\2">\1</a>', s)
        out.append(s)
    return "".join(out)


def _table_block(rows: list[str]) -> str:
    """Render a markdown table so it wraps on a phone: one block per row,
    the first column bold as the title and the other columns as
    "label: value" pairs. (A <pre> table cannot wrap in Telegram.)"""
    cells = []
    for r in rows:
        r = r.strip()
        if re.fullmatch(r"\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?", r):
            continue  # separator line
        cells.append([c.strip() for c in r.strip("|").split("|")])
    if not cells:
        return ""
    width = max(len(r) for r in cells)
    for r in cells:
        r.extend([""] * (width - len(r)))
    header, body = cells[0], cells[1:]
    if not body:  # header only
        return " · ".join(_inline(h) for h in header if h)

    # A leading row-number column ("#", "No.", "Sr") is a prefix, not the title.
    numbered = width > 2 and re.fullmatch(r"#|no\.?|sr\.?|s\.?no\.?|rank|idx", header[0].strip().lower() or "x") is not None
    title_col = 1 if numbered else 0

    def value(v: str) -> str:
        # Figures in monospace so they line up and stand out; text as-is.
        s = v.strip()
        return "<code>" + html.escape(s, quote=False) + "</code>" if _NUMERIC_RE.fullmatch(s) else _inline(s)

    blocks = []
    for r in body:
        title = _inline(r[title_col])
        if numbered and r[0]:
            title = _inline(r[0]) + ". " + title
        pairs = [f"{_inline(header[i])}: {value(r[i])}"
                 for i in range(width) if i != title_col and (not numbered or i != 0) and r[i] != ""]
        if len(pairs) == 1:
            blocks.append(f"<b>{title}</b> — {pairs[0].split(': ', 1)[1] if header[1 - title_col] else pairs[0]}")
        else:
            blocks.append("<b>" + title + "</b>" + ("\n" + " · ".join(pairs) if pairs else ""))
    return "\n".join(blocks) if all(len(b.splitlines()) == 1 for b in blocks) else "\n\n".join(blocks)


def _escape_rich(m: re.Match) -> str:
    if m.group(1):  # already escaped by the writer
        return m.group(1)
    return "\\" + m.group(2)


def escape_rich_markdown(md: str) -> str:
    """Markdown for a rich message (core.telegram.org/bots/api#rich-markdown-style),
    which is GitHub Markdown plus a few extras the model does not mean:
    "$...$" is a formula ("$500 and $600"), "~" strikes text through
    ("~5L"), "==" marks it. Those are escaped outside code; everything
    else (tables, headings, lists) is sent as written. Same rules as
    tgrich::escapeRichMarkdown in the bot."""
    out: list[str] = []
    fenced = False
    for line in md.replace("\r\n", "\n").split("\n"):
        if line.lstrip().startswith("```"):
            fenced = not fenced
            out.append(line)
            continue
        if fenced:
            out.append(line)
            continue
        parts = re.split(r"(`[^`\n]+`)", line)  # inline code spans stay as written
        for i in range(0, len(parts), 2):
            parts[i] = re.sub(r"(\\.)|(\$|~|=(?==))", _escape_rich, parts[i])
        out.append("".join(parts))
    return "\n".join(out)


_SUMMARY_RE = re.compile(r"<summary>(.*?)</summary>", re.I | re.S)
_DETAILS_RE = re.compile(r"</?details(\s+open)?\s*>", re.I)


def markdown_to_telegram_html(md: str) -> str:
    # Collapsible sections (rich messages only): here the summary becomes a
    # bold line and the content follows as usual.
    md = _DETAILS_RE.sub("", _SUMMARY_RE.sub(lambda m: "\n**" + m.group(1).strip() + "**\n", md))
    lines = md.replace("\r\n", "\n").split("\n")
    out: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if stripped.startswith("```"):
            block = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith("```"):
                block.append(lines[i])
                i += 1
            i += 1
            # <code> wraps in Telegram, <pre> does not.
            out.append("<code>" + html.escape("\n".join(block), quote=False) + "</code>")
            continue

        if stripped.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append(lines[i])
                i += 1
            out.append(_table_block(rows))
            continue

        m = re.match(r"^(#{1,6})\s+(.*)$", stripped)
        if m:
            # Headings: bold + underline for top levels, bold for sub-levels,
            # with a blank line before so sections stand apart.
            level = len(m.group(1))
            title = _inline(m.group(2))
            if out and out[-1] != "":
                out.append("")
            out.append(("<b><u>" + title + "</u></b>") if level <= 2 else ("<b>" + title + "</b>"))
            i += 1
            continue

        if stripped.startswith(">"):
            # Quote lines -> Telegram blockquote (date ranges, caveats, notes).
            quote = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                quote.append(_inline(lines[i].strip()[1:].strip()))
                i += 1
            out.append("<blockquote>" + "\n".join(quote) + "</blockquote>")
            continue

        m = re.match(r"^(\s*)([-*+]|\d+[.)])\s+(.*)$", line)
        if m:
            indent = "  " * (len(m.group(1)) // 2)
            bullet = "•" if not m.group(2)[0].isdigit() else m.group(2)
            out.append(f"{indent}{bullet} " + _inline(m.group(3)))
            i += 1
            continue

        if stripped in ("---", "***", "___"):
            out.append("──────────")
            i += 1
            continue

        out.append(_inline(line))
        i += 1

    text = "\n".join(out)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def split_for_telegram(html_text: str, limit: int = TELEGRAM_LIMIT) -> list[str]:
    """Split on paragraph/line boundaries so no chunk exceeds the limit and
    no <pre> block is cut in half when it fits in a chunk by itself."""
    if len(html_text) <= limit:
        return [html_text] if html_text else []
    chunks: list[str] = []
    current = ""
    # Keep multi-line <code>...</code> blocks atomic.
    pieces = re.split(r"(<code>[^<]*\n[^<]*</code>)", html_text, flags=re.S)
    units: list[str] = []
    for p in pieces:
        if p.startswith("<code>") and "\n" in p:
            units.append(p)
        else:
            units.extend(p.split("\n"))
    for u in units:
        candidate = (current + "\n" + u) if current else u
        if len(candidate) <= limit:
            current = candidate
            continue
        if current:
            chunks.append(current)
            current = ""
        while len(u) > limit:  # a single oversized unit: hard-cut
            chunks.append(u[:limit])
            u = u[limit:]
        current = u
    if current:
        chunks.append(current)
    return chunks
