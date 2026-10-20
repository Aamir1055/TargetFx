"""Run the Ask AI eval cases against a running AI service.

Every case is a real model turn (it costs tokens), run as a fresh
conversation for the broker whose token you pass. A case passes when the
tools it expects were used, no error came back, the answer matches the
optional regex, and files / charts counts are met.

    python -m evals.run_eval --base http://127.0.0.1:8090 --token <broker JWT>
    python -m evals.run_eval --token ... --filter credit        # only matching names
    python -m evals.run_eval --token ... --cases evals/mine.jsonl --json report.json

Case format (one JSON object per line, see cases.jsonl):
    {"name", "message", "expect": {"tools_any": [...], "tools_none": [...], "answer_regex": "...",
     "no_error": true, "files_min": 0, "charts_min": 0, "max_seconds": 180},
     "followups": [{"message", "expect"}]}        # continue the same conversation

Exit code 1 when any case fails, so it can gate a deploy.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path
from typing import Any

import httpx


def load_cases(path: Path) -> list[dict[str, Any]]:
    cases = []
    for ln in path.read_text(encoding="utf-8").splitlines():
        ln = ln.strip()
        if ln and not ln.startswith("#"):
            cases.append(json.loads(ln))
    return cases


def check(expect: dict[str, Any], resp: dict[str, Any], seconds: float) -> list[str]:
    fails: list[str] = []
    tools = resp.get("tools") or []
    if expect.get("no_error", True) and resp.get("error"):
        fails.append(f"error: {resp['error']}")
    if expect.get("tools_any") and not any(t in tools for t in expect["tools_any"]):
        fails.append(f"expected one of {expect['tools_any']}, used {tools or 'no tools'}")
    for t in expect.get("tools_none") or []:
        if t in tools:
            fails.append(f"must not use {t}")
    if expect.get("answer_regex") and not re.search(expect["answer_regex"], resp.get("text") or ""):
        fails.append(f"answer does not match /{expect['answer_regex']}/")
    if len(resp.get("files") or []) < int(expect.get("files_min", 0)):
        fails.append("expected a file")
    if len(resp.get("charts") or []) < int(expect.get("charts_min", 0)):
        fails.append("expected a chart")
    if seconds > float(expect.get("max_seconds", 180)):
        fails.append(f"took {seconds:.0f}s")
    return fails


def run_case(client: httpx.Client, case: dict[str, Any]) -> dict[str, Any]:
    steps = [{"message": case["message"], "expect": case.get("expect", {})}] + list(case.get("followups") or [])
    conversation_id = None
    results = []
    total_usage: dict[str, int] = {}
    for i, step in enumerate(steps):
        body: dict[str, Any] = {"message": step["message"], "channel": "web"}
        if conversation_id:
            body["conversation_id"] = conversation_id
        else:
            body["new_conversation"] = True
        t0 = time.perf_counter()
        try:
            r = client.post("/ai/chat/complete", json=body)
            seconds = time.perf_counter() - t0
            if r.status_code != 200:
                results.append({"step": i, "fails": [f"HTTP {r.status_code}: {r.text[:200]}"], "seconds": seconds})
                break
            resp = r.json()
        except httpx.HTTPError as e:
            results.append({"step": i, "fails": [f"request failed: {e}"], "seconds": time.perf_counter() - t0})
            break
        conversation_id = resp.get("conversation_id")
        for k, v in (resp.get("usage") or {}).items():
            total_usage[k] = total_usage.get(k, 0) + int(v or 0)
        results.append({"step": i, "fails": check(step.get("expect", {}), resp, seconds), "seconds": seconds,
                        "tools": resp.get("tools"), "answer": (resp.get("text") or "")[:300]})
    return {"name": case["name"], "conversation_id": conversation_id, "steps": results,
            "ok": all(not s["fails"] for s in results), "usage": total_usage,
            "seconds": round(sum(s["seconds"] for s in results), 1)}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", default="http://127.0.0.1:8090")
    ap.add_argument("--token", required=True, help="broker JWT of the eval broker")
    ap.add_argument("--cases", default=str(Path(__file__).with_name("cases.jsonl")))
    ap.add_argument("--filter", default="", help="only cases whose name contains this")
    ap.add_argument("--json", default="", help="write the full report here")
    ap.add_argument("--list", action="store_true", help="list cases and exit (no cost)")
    args = ap.parse_args()

    cases = [c for c in load_cases(Path(args.cases)) if args.filter in c["name"]]
    if args.list or not cases:
        for c in cases:
            print(f"{c['name']:<22} {c['message']}")
        return 0

    report = []
    with httpx.Client(base_url=args.base, timeout=240.0, headers={"Authorization": f"Bearer {args.token}"}) as client:
        me = client.get("/ai/me")
        if me.status_code != 200:
            print(f"token rejected: HTTP {me.status_code} {me.text[:200]}")
            return 2
        who = me.json()
        print(f"eval broker {who.get('broker_id')} ({who.get('username')}) · model {who.get('model')} · {len(cases)} cases\n")
        for c in cases:
            r = run_case(client, c)
            report.append(r)
            mark = "PASS" if r["ok"] else "FAIL"
            tools = ", ".join(sorted({t for s in r["steps"] for t in (s.get("tools") or [])})) or "-"
            print(f"{mark} {r['name']:<22} {r['seconds']:>6.1f}s  tools: {tools}")
            for s in r["steps"]:
                for f in s["fails"]:
                    print(f"       step {s['step']}: {f}")

    passed = sum(1 for r in report if r["ok"])
    tok_in = sum(r["usage"].get("input_tokens", 0) for r in report)
    tok_out = sum(r["usage"].get("output_tokens", 0) for r in report)
    cached = sum(r["usage"].get("cache_read_input_tokens", 0) for r in report)
    print(f"\n{passed}/{len(report)} passed · {tok_in:,} in ({cached:,} cached) · {tok_out:,} out · "
          f"{sum(r['seconds'] for r in report):.0f}s")
    if args.json:
        Path(args.json).write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"report written to {args.json}")
    return 0 if passed == len(report) else 1


if __name__ == "__main__":
    sys.exit(main())
