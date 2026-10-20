"""Broker sessions for unattended runs (scheduled digests, alerts).

Interactive turns carry the broker's own JWT. A scheduled run has nobody
logged in, so the service mints a short-lived broker token itself, exactly
the way BrokerEye's Telegram bot does for /askai: user_type "broker", the
broker's id and username, no rights (the data tools need none; nothing that
changes anything is ever run unattended). The signing secret is BrokerEye's
own `custom_config.jwt_secret`, read from config.json (BROKEREYE_CONFIG) or
given as BROKEREYE_JWT_SECRET.
"""
from __future__ import annotations

import json
import time

import jwt

from . import store
from .brokereye import Session
from .config import settings

TOKEN_MINUTES = 30


def configured() -> bool:
    return bool(settings().brokereye_jwt_secret)


def mint_broker_session(broker_id: int) -> Session:
    secret = settings().brokereye_jwt_secret
    if not secret:
        raise RuntimeError("Unattended runs need BrokerEye's JWT secret: set BROKEREYE_CONFIG (config.json) or "
                           "BROKEREYE_JWT_SECRET in the AI service .env")
    b = store.broker_identity(broker_id)
    if not b:
        raise RuntimeError(f"Broker {broker_id} not found")
    if not b.get("is_active", True):
        raise RuntimeError(f"Broker {broker_id} is inactive")
    now = int(time.time())
    payload = {
        "iss": "brokereye",
        "iat": now,
        "exp": now + TOKEN_MINUTES * 60,
        "user_id": str(broker_id),
        "username": b["username"] or "",
        "email": "",
        "user_type": "broker",
        "roles": json.dumps(["broker"]),
        "permissions": json.dumps([]),
    }
    token = jwt.encode(payload, secret, algorithm="HS256")
    return Session(broker_id=broker_id, username=b["username"] or "",
                   display_name=b.get("full_name") or b["username"] or f"Broker {broker_id}", token=token)
