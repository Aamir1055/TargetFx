"""HTTP client for the BrokerEye C++ backend.

Every call forwards the broker's own JWT, so the AI can only ever read what
that broker is allowed to read — the access check is BrokerEye's, not ours.
"""
from __future__ import annotations

import hashlib
import threading
import time
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any

try:  # anthropic 1.x ships httpx2; fall back to httpx on older installs
    import httpx2 as httpx
except ImportError:  # pragma: no cover
    import httpx  # type: ignore

from .config import settings


class BrokerEyeError(Exception):
    """A BrokerEye call failed (HTTP error or {"status": "error"} body)."""


@dataclass(frozen=True)
class Session:
    broker_id: int
    username: str
    display_name: str
    token: str
    rights: tuple[str, ...] = ()   # broker rights from /api/auth/broker/me (credit_in, manage_rules, ...)

    def has_right(self, right: str) -> bool:
        return right in self.rights


# The tool functions are plain functions; the current session reaches them
# through this context variable, set by the agent before a turn runs.
current_session: ContextVar[Session] = ContextVar("current_session")
# The conversation / channel a tool call belongs to (actions need them).
current_conversation: ContextVar[str] = ContextVar("current_conversation", default="")
current_channel: ContextVar[str] = ContextVar("current_channel", default="web")
# Whether a person reads this turn as it happens (the web chat, the Telegram
# bot). Automated runs (digests, pinned tiles) are not: nobody could confirm
# an action card there, so the propose_* tools refuse.
current_interactive: ContextVar[bool] = ContextVar("current_interactive", default=False)


_identity_cache: dict[str, tuple[float, Session]] = {}
_identity_lock = threading.Lock()


def _client() -> httpx.Client:
    cfg = settings()
    return httpx.Client(base_url=cfg.brokereye_base_url, timeout=cfg.brokereye_timeout_seconds)


def _unwrap(resp: httpx.Response) -> Any:
    try:
        body = resp.json()
    except ValueError:
        raise BrokerEyeError(f"BrokerEye returned non-JSON (HTTP {resp.status_code})")
    if resp.status_code >= 400 or body.get("status") == "error":
        raise BrokerEyeError(body.get("message") or f"HTTP {resp.status_code}")
    return body.get("data", body)


def resolve_session(token: str) -> Session:
    """Validate a broker JWT against BrokerEye and return who it belongs to."""
    key = hashlib.sha256(token.encode()).hexdigest()
    now = time.time()
    with _identity_lock:
        hit = _identity_cache.get(key)
        if hit and hit[0] > now:
            return hit[1]

    with _client() as c:
        resp = c.get("/api/auth/broker/me", headers={"Authorization": f"Bearer {token}"})
    if resp.status_code in (401, 403):
        raise PermissionError("Invalid or expired broker token")
    data = _unwrap(resp)
    session = Session(
        broker_id=int(data["id"]),
        username=str(data.get("username") or ""),
        display_name=str(data.get("full_name") or data.get("username") or ""),
        token=token,
        rights=tuple(str(r) for r in (data.get("rights") or [])),
    )
    with _identity_lock:
        _identity_cache[key] = (now + 60.0, session)
    return session


@dataclass(frozen=True)
class AdminSession:
    user_id: int
    username: str
    permissions: tuple[str, ...]
    roles: tuple[str, ...]


_admin_cache: dict[str, tuple[float, AdminSession]] = {}


def resolve_admin(token: str) -> AdminSession:
    """Validate a BrokerEye *admin* (back-office user) JWT and require the
    system.admin permission or the admin role."""
    key = hashlib.sha256(token.encode()).hexdigest()
    now = time.time()
    with _identity_lock:
        hit = _admin_cache.get(key)
        if hit and hit[0] > now:
            return hit[1]

    with _client() as c:
        resp = c.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    if resp.status_code in (401, 403):
        raise PermissionError("Invalid or expired admin token")
    data = _unwrap(resp)
    perms = tuple(str(p) for p in (data.get("permissions") or []))
    roles = tuple(str(r.get("name") if isinstance(r, dict) else r) for r in (data.get("roles") or []))
    if "system.admin" not in perms and "ai.manage" not in perms and "admin" not in [r.lower() for r in roles]:
        raise PermissionError("Admin permission required (system.admin)")
    session = AdminSession(int(data["id"]), str(data.get("username") or ""), perms, roles)
    with _identity_lock:
        _admin_cache[key] = (now + 60.0, session)
    return session


def forward_auth(path: str, body: dict[str, Any]) -> Any:
    """Forward an unauthenticated broker auth call (login, verify-2fa,
    refresh) to BrokerEye and return its `data`. Used by the web UI so the
    broker signs in with username / password instead of pasting a JWT; the
    AI service never stores the credentials, it only relays the response."""
    with _client() as c:
        resp = c.post(path, json=body)
    try:
        payload = resp.json()
    except ValueError:
        raise BrokerEyeError(f"BrokerEye returned non-JSON (HTTP {resp.status_code})")
    if resp.status_code >= 400 or payload.get("status") == "error":
        # 401/403/423 carry the user-facing reason (wrong password, locked, ...)
        raise PermissionError(payload.get("message") or f"HTTP {resp.status_code}")
    return payload.get("data", payload)


def get(path: str, params: dict[str, Any] | None = None) -> Any:
    s = current_session.get()
    with _client() as c:
        resp = c.get(path, params=params, headers={"Authorization": f"Bearer {s.token}"})
    return _unwrap(resp)


def post(path: str, body: dict[str, Any]) -> Any:
    s = current_session.get()
    with _client() as c:
        resp = c.post(path, json=body, headers={"Authorization": f"Bearer {s.token}"})
    return _unwrap(resp)


def request_as(session: Session, method: str, path: str, *, body: dict[str, Any] | None = None,
               headers: dict[str, str] | None = None) -> Any:
    """A call on behalf of an explicit session (outside a model turn), e.g. a
    confirmed action. Extra headers let the caller forward the browser's IP
    so BrokerEye's audit trail records the broker, not this service."""
    h = {"Authorization": f"Bearer {session.token}", **(headers or {})}
    with _client() as c:
        resp = c.request(method, path, json=body, headers=h)
    return _unwrap(resp)
