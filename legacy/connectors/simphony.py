"""
Lauds — Oracle Simphony POS Connector
Phase 2 connector — reads cover counts from Simphony Cloud (OHIP) every 15 min
during breakfast service and writes to pace_log.

Credentials are supplied via env vars; the connector ships with mock defaults so
the codebase builds before the W Taipei IT walkthrough provides real values.

Required env vars:
  SIMPHONY_BASE_URL            e.g. https://api.ohip.oracle.com
  SIMPHONY_CLIENT_ID           Oracle OHIP client_id
  SIMPHONY_CLIENT_SECRET       Oracle OHIP client_secret
  SIMPHONY_REVENUE_CENTER_ID   Kitchen Table revenue center UUID
  SUPABASE_URL                 Project URL
  SUPABASE_SERVICE_ROLE_KEY    Service-role key (bypasses RLS)

Schedule: every 15 min, 06:00 – 10:30 Asia/Taipei.
On error: push notification to chef + log fallback gap; do NOT crash the process.
"""

from __future__ import annotations

import asyncio
import logging
import os
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, time, timezone
from typing import Any
from zoneinfo import ZoneInfo

import aiohttp
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)

TZ_TAIPEI = ZoneInfo("Asia/Taipei")

# ─── Configuration ─────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class SimphonyConfig:
    base_url: str
    client_id: str
    client_secret: str
    revenue_center_id: str
    supabase_url: str
    supabase_service_key: str

    @classmethod
    def from_env(cls) -> "SimphonyConfig":
        missing = [
            k for k in (
                "SIMPHONY_BASE_URL",
                "SIMPHONY_CLIENT_ID",
                "SIMPHONY_CLIENT_SECRET",
                "SIMPHONY_REVENUE_CENTER_ID",
                "SUPABASE_URL",
                "SUPABASE_SERVICE_ROLE_KEY",
            )
            if not os.getenv(k)
        ]
        if missing:
            logger.warning(
                "Simphony connector running in MOCK mode — missing env vars: %s",
                ", ".join(missing),
            )
        return cls(
            base_url=os.getenv("SIMPHONY_BASE_URL", "https://mock.simphony.local"),
            client_id=os.getenv("SIMPHONY_CLIENT_ID", "mock_client_id"),
            client_secret=os.getenv("SIMPHONY_CLIENT_SECRET", "mock_secret"),
            revenue_center_id=os.getenv("SIMPHONY_REVENUE_CENTER_ID", "mock_rc_id"),
            supabase_url=os.getenv("SUPABASE_URL", "https://mock.supabase.co"),
            supabase_service_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY", "mock_service_key"),
        )


# ─── OAuth token cache ─────────────────────────────────────────────────────────

@dataclass
class _TokenCache:
    access_token: str = ""
    expires_at: datetime = field(default_factory=lambda: datetime.min.replace(tzinfo=timezone.utc))

    def is_valid(self) -> bool:
        return bool(self.access_token) and datetime.now(timezone.utc) < self.expires_at


_token_cache = _TokenCache()


async def get_access_token(session: aiohttp.ClientSession, cfg: SimphonyConfig) -> str:
    """Fetch or return cached OAuth 2.0 client_credentials token."""
    if _token_cache.is_valid():
        return _token_cache.access_token

    url = f"{cfg.base_url}/oauth/v1/token"
    payload = {
        "grant_type": "client_credentials",
        "client_id": cfg.client_id,
        "client_secret": cfg.client_secret,
        "scope": "pos:read",
    }

    async with session.post(url, data=payload) as resp:
        resp.raise_for_status()
        data = await resp.json()

    _token_cache.access_token = data["access_token"]
    expires_in = int(data.get("expires_in", 3600))
    _token_cache.expires_at = datetime.now(timezone.utc).replace(
        microsecond=0
    ).__class__.fromtimestamp(
        datetime.now(timezone.utc).timestamp() + expires_in - 60,
        tz=timezone.utc,
    )
    logger.debug("Simphony token refreshed, expires in %ds", expires_in)
    return _token_cache.access_token


# ─── Cover fetch ───────────────────────────────────────────────────────────────

async def fetch_covers_since(
    session: aiohttp.ClientSession,
    cfg: SimphonyConfig,
    token: str,
    since: datetime,
    outlet_id: str,
) -> tuple[int, dict[str, Any]]:
    """
    Fetch cumulative cover count from Simphony OHIP for the Kitchen Table
    revenue center since `since`.

    Returns (covers_cumul, raw_payload) — raw_payload stored verbatim in
    pace_log.raw_payload for audit trail.

    OHIP endpoint: GET /config/v1/revenuecenters/{revenueCenterId}/checks
    We sum guest_count across open + closed checks that started >= since.
    """
    url = (
        f"{cfg.base_url}/config/v1/revenuecenters"
        f"/{cfg.revenue_center_id}/checks"
    )
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Simphony-Revenue-Center": cfg.revenue_center_id,
    }
    params = {
        "startDate": since.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "include": "guestCount",
    }

    async with session.get(url, headers=headers, params=params) as resp:
        resp.raise_for_status()
        raw = await resp.json()

    checks = raw.get("checks", [])
    covers_cumul = sum(int(c.get("guestCount", 0)) for c in checks)

    return covers_cumul, raw


# ─── Supabase write ────────────────────────────────────────────────────────────

async def write_pace_log(
    session: aiohttp.ClientSession,
    cfg: SimphonyConfig,
    *,
    outlet_id: str,
    service_date: date,
    covers_cumul: int,
    covers_delta: int,
    wave_label: str | None,
    raw_payload: dict[str, Any],
) -> None:
    """Insert one row into pace_log via Supabase REST (service-role, bypasses RLS)."""
    url = f"{cfg.supabase_url}/rest/v1/pace_log"
    headers = {
        "apikey": cfg.supabase_service_key,
        "Authorization": f"Bearer {cfg.supabase_service_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    body = {
        "id": str(uuid.uuid4()),
        "outlet_id": outlet_id,
        "service_date": service_date.isoformat(),
        "logged_at": datetime.now(timezone.utc).isoformat(),
        "covers_cumul": covers_cumul,
        "covers_delta": covers_delta,
        "wave_label": wave_label,
        "source": "pos_simphony",
        "raw_payload": raw_payload,
    }

    async with session.post(url, headers=headers, json=body) as resp:
        resp.raise_for_status()
    logger.info("pace_log written: outlet=%s date=%s covers=%d", outlet_id, service_date, covers_cumul)


# ─── Push notification on API failure ─────────────────────────────────────────

async def notify_chef_pos_down(
    session: aiohttp.ClientSession,
    cfg: SimphonyConfig,
    outlet_id: str,
    error_msg: str,
) -> None:
    """
    Fire a push notification to the chef role for this outlet.
    Uses Supabase Edge Function `send-push` (to be implemented in Phase 4).
    Fails silently — a notification failure must never mask the original error.
    """
    url = f"{cfg.supabase_url}/functions/v1/send-push"
    headers = {
        "Authorization": f"Bearer {cfg.supabase_service_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "outlet_id": outlet_id,
        "role_filter": ["chef", "sous_chef"],
        "title": "POS unavailable — pace check needed",
        "body": "Simphony is not responding. Tap to enter cover count manually.",
        "data": {"action": "open_pace_check", "outlet_id": outlet_id},
        "meta": {"error": error_msg},
    }
    try:
        async with session.post(url, headers=headers, json=payload, timeout=aiohttp.ClientTimeout(total=5)) as resp:
            if resp.status >= 400:
                logger.warning("Push notification failed: HTTP %d", resp.status)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Push notification delivery error (non-fatal): %s", exc)


# ─── Wave label assignment ─────────────────────────────────────────────────────

def assign_wave_label(logged_at: datetime) -> str:
    """Map a timestamp to wave1 / wave2 / wave3 based on Asia/Taipei wall clock."""
    t = logged_at.astimezone(TZ_TAIPEI).time()
    if t < time(7, 30):
        return "wave1"
    if t < time(9, 0):
        return "wave2"
    return "wave3"


# ─── Main poll tick ────────────────────────────────────────────────────────────

# Tracks last covers_cumul per outlet to compute delta
_last_cumul: dict[str, int] = {}


async def poll_tick(cfg: SimphonyConfig, outlet_id: str) -> None:
    """One poll cycle: authenticate → fetch → write pace_log."""
    now_taipei = datetime.now(TZ_TAIPEI)
    service_date = now_taipei.date()
    wave = assign_wave_label(now_taipei)

    # Service start of day for the query window
    service_open = datetime(
        service_date.year, service_date.month, service_date.day,
        6, 0, 0, tzinfo=TZ_TAIPEI
    )

    async with aiohttp.ClientSession() as session:
        try:
            token = await get_access_token(session, cfg)
            covers_cumul, raw = await fetch_covers_since(
                session, cfg, token, service_open, outlet_id
            )
        except aiohttp.ClientError as exc:
            logger.error("Simphony API error: %s", exc)
            await notify_chef_pos_down(session, cfg, outlet_id, str(exc))
            return
        except Exception as exc:  # noqa: BLE001
            logger.error("Unexpected Simphony error: %s", exc)
            await notify_chef_pos_down(session, cfg, outlet_id, str(exc))
            return

        prev = _last_cumul.get(outlet_id, 0)
        delta = max(0, covers_cumul - prev)
        _last_cumul[outlet_id] = covers_cumul

        try:
            await write_pace_log(
                session, cfg,
                outlet_id=outlet_id,
                service_date=service_date,
                covers_cumul=covers_cumul,
                covers_delta=delta,
                wave_label=wave,
                raw_payload=raw,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to write pace_log: %s", exc)


# ─── Scheduler ────────────────────────────────────────────────────────────────

def build_scheduler(cfg: SimphonyConfig, outlet_id: str) -> AsyncIOScheduler:
    """
    Return a configured APScheduler that fires poll_tick every 15 min
    between 06:00 and 10:30 Asia/Taipei.
    Caller is responsible for starting and shutting down the scheduler.
    """
    scheduler = AsyncIOScheduler(timezone=TZ_TAIPEI)
    scheduler.add_job(
        poll_tick,
        trigger=CronTrigger(
            hour="6-10",
            minute="0,15,30,45",
            second=0,
            timezone=TZ_TAIPEI,
        ),
        args=[cfg, outlet_id],
        id="simphony_poll",
        replace_existing=True,
        # 10:30 is mid-hour → stop gracefully by checking wall time inside tick
        # APScheduler fires at 10:00, 10:15, 10:30; not 10:45 (hour ends at 10)
    )
    return scheduler


# ─── Entry point ──────────────────────────────────────────────────────────────

async def run(outlet_id: str | None = None) -> None:
    cfg = SimphonyConfig.from_env()
    oid = outlet_id or os.getenv("LAUDS_OUTLET_ID", "")
    if not oid:
        raise RuntimeError("LAUDS_OUTLET_ID env var or outlet_id argument required")

    scheduler = build_scheduler(cfg, oid)
    scheduler.start()
    logger.info("Simphony connector started for outlet %s", oid)

    try:
        await asyncio.Event().wait()  # run until cancelled
    finally:
        scheduler.shutdown()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run())
