"""One active model turn per broker.

A second message (or a scheduled digest) while a turn is running must wait
or be refused instead of racing the append-only conversation history. Shared
by the HTTP handlers and the scheduler.
"""
from __future__ import annotations

import threading

_active: dict[int, threading.Lock] = {}
_guard = threading.Lock()


def broker_lock(broker_id: int) -> threading.Lock:
    with _guard:
        return _active.setdefault(broker_id, threading.Lock())
