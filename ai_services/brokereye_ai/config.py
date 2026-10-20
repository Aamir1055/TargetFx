from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Strings are kept, // and /* */ comments are dropped (BrokerEye's config.json
# is jsoncpp-style JSON with comments; "https://..." inside strings must survive).
_COMMENT_RE = re.compile(r'("(?:\\.|[^"\\])*")|//[^\n]*|/\*.*?\*/', re.S)


def load_brokereye_config(path: str) -> dict:
    """BrokerEye's config.json as a dict (comments stripped)."""
    raw = Path(path).read_text(encoding="utf-8")
    text = _COMMENT_RE.sub(lambda m: m.group(1) or "", raw)
    return json.loads(text)


def database_url_from_brokereye_config(path: str) -> str:
    """Build a Postgres URL from BrokerEye's config.json (db_clients[0]) so the
    AI service shares the backend's credentials instead of duplicating them."""
    cfg = load_brokereye_config(path)
    db = cfg["db_clients"][0]
    user = quote(str(db.get("user", "postgres")), safe="")
    pw = quote(str(db.get("passwd", "")), safe="")
    return f"postgresql://{user}:{pw}@{db.get('host', '127.0.0.1')}:{db.get('port', 5432)}/{db.get('dbname', 'broker_eye')}"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    anthropic_api_key: str = ""
    # Required when the API key is an org-level (service account) key that is
    # not scoped to a workspace: the id (wrkspc_...) from Console > Settings >
    # Workspaces. Leave empty for a workspace-scoped key.
    anthropic_workspace_id: str = ""
    brokereye_base_url: str = "http://127.0.0.1:8080"
    # Either set DATABASE_URL, or point BROKEREYE_CONFIG at BrokerEye's
    # config.json and the db_clients[0] credentials are used.
    database_url: str = ""
    brokereye_config: str = ""

    # Unattended runs (scheduled digests, alerts) mint short-lived broker
    # tokens with BrokerEye's own JWT secret and deliver to Telegram with the
    # bot BrokerEye's TelegramBotPlugin uses. Both are read from config.json
    # (BROKEREYE_CONFIG) when not set here.
    brokereye_jwt_secret: str = ""
    telegram_bot_token: str = ""
    telegram_api_base: str = "https://api.telegram.org"
    # The in-process scheduler for digests; set false on a second instance.
    ai_scheduler: bool = True

    @model_validator(mode="after")
    def _resolve_from_brokereye_config(self):
        cfg: dict = {}
        if self.brokereye_config:
            try:
                cfg = load_brokereye_config(self.brokereye_config)
            except (OSError, ValueError, KeyError):
                cfg = {}
        if not self.database_url:
            if cfg:
                self.database_url = database_url_from_brokereye_config(self.brokereye_config)
            else:
                self.database_url = "postgresql://postgres:postgres@127.0.0.1:5432/broker_eye"
        custom = cfg.get("custom_config") or {}
        # One timezone for the whole product: BrokerEye's custom_config.timezone
        # unless AI_TIMEZONE is set explicitly.
        if "ai_timezone" not in self.model_fields_set and custom.get("timezone"):
            self.ai_timezone = str(custom["timezone"])
        if not self.brokereye_jwt_secret:
            self.brokereye_jwt_secret = str(custom.get("jwt_secret") or (custom.get("auth") or {}).get("jwt_secret") or "")
        if not self.telegram_bot_token:
            for p in cfg.get("plugins") or []:
                if p.get("name") == "drogon::TelegramBotPlugin":
                    pc = p.get("config") or {}
                    self.telegram_bot_token = str(pc.get("bot_token") or "")
                    if pc.get("api_base"):
                        self.telegram_api_base = str(pc["api_base"])
            if not self.telegram_bot_token:
                self.telegram_bot_token = str((custom.get("telegram") or {}).get("bot_token") or "")
            if self.telegram_bot_token == "change_me":
                self.telegram_bot_token = ""
        return self

    # claude-haiku-5-5 ($0.10/$0.50 per MTok) is the default; claude-sonnet-5-5
    # ($2/$10) for stronger multi-step answers, claude-opus-5-5 ($4/$20) best.
    ai_model: str = "claude-haiku-5-5"
    ai_effort: str = "medium"
    ai_max_tokens: int = 32000
    ai_max_tool_rounds: int = 12
    ai_title_model: str = "claude-haiku-5-5"
    # Display timezone for dates the broker types and for schedules. Defaults
    # to custom_config.timezone of BrokerEye's config.json (BROKEREYE_CONFIG).
    ai_timezone: str = "Asia/Kolkata"
    # Follow-up question chips under each answer: one extra call to the cheap
    # title model per turn (about 1k input tokens). Set false to switch off.
    ai_suggestions: bool = True
    # Where a client login shown in an answer links to, e.g.
    # "https://panel.example.com/clients/{login}". Empty: clicking a login asks
    # the assistant for that client's overview instead of leaving the chat.
    ai_client_link_template: str = ""
    # Credit operations proposed in the chat must be confirmed within this
    # many minutes; afterwards the card expires and the user has to ask again.
    ai_action_ttl_minutes: int = 15
    # Voice questions (Telegram voice notes, the web mic), transcribed on this
    # server by Whisper (faster-whisper). Languages: the ones brokers speak
    # (English, Hindi, Gujarati and their mixes with English); each recording
    # is detected among these only. Language: force one (e.g. "gu") instead.
    # Model: small (fast, weak in Gujarati) | medium | large-v3-turbo |
    # large-v3 (best, slowest). Threads: 0 = all cores.
    # Provider: "auto" = Sarvam AI when SARVAM_API_KEY is set (about a second
    # per question, paid per audio minute), else Whisper on this server;
    # "sarvam" / "whisper" force one. Sarvam model saaras:v4; mode "" (default
    # output) or "codemix" / "translit" (saaras:v3).
    ai_stt_provider: str = "auto"
    sarvam_api_key: str = ""
    sarvam_base_url: str = "https://api.sarvam.ai"
    ai_sarvam_stt_model: str = "saaras:v4"
    ai_sarvam_stt_mode: str = ""
    ai_stt_enabled: bool = True
    ai_stt_model: str = "large-v3-turbo"
    ai_stt_languages: str = "en,hi,gu"
    ai_stt_language: str = ""
    ai_stt_threads: int = 0

    ai_host: str = "0.0.0.0"
    ai_port: int = 8090
    ai_cors_origins: str = "*"

    # Tool result caps: keep the model's context small and the bill predictable.
    tool_max_rows: int = 200
    tool_max_result_chars: int = 60_000
    brokereye_timeout_seconds: float = 60.0


@lru_cache
def settings() -> Settings:
    return Settings()
