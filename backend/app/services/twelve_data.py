from __future__ import annotations

import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import httpx

from app.core.config import settings
from app.schemas import IntradayResponse, PriceCandleOut
from app.services.intraday_cache import IntradayCache

log = logging.getLogger(__name__)

ET = ZoneInfo("America/New_York")
TWELVE_DATA_BASE = "https://api.twelvedata.com/time_series"
INTRADAY_INTERVAL = "5min"
# ~6.5h regular session + buffer; Twelve Data max 5000 per request.
INTRADAY_OUTPUT_SIZE = 200

_cache: IntradayCache[IntradayResponse] | None = None


def _get_cache() -> IntradayCache[IntradayResponse]:
    global _cache
    if _cache is None:
        _cache = IntradayCache(settings.intraday_cache_ttl_seconds)
    return _cache


def _parse_bar_datetime(raw: str) -> datetime:
    naive = datetime.strptime(raw.strip(), "%Y-%m-%d %H:%M:%S")
    return naive.replace(tzinfo=ET).astimezone(timezone.utc)


def _fetch_from_api(symbol: str) -> IntradayResponse:
    api_key = settings.market_data_api_key
    if not api_key or not api_key.strip():
        raise RuntimeError("MARKET_DATA_API_KEY is not configured")

    params = {
        "symbol": symbol.upper(),
        "interval": INTRADAY_INTERVAL,
        "outputsize": INTRADAY_OUTPUT_SIZE,
        "timezone": "America/New_York",
        "order": "asc",
        "prepost": "false",
        "apikey": api_key.strip(),
    }

    with httpx.Client(timeout=30.0) as client:
        resp = client.get(TWELVE_DATA_BASE, params=params)
        resp.raise_for_status()
        payload = resp.json()

    status = payload.get("status")
    if status == "error":
        message = payload.get("message") or "Twelve Data request failed"
        raise RuntimeError(message)

    values = payload.get("values") or []
    points: list[PriceCandleOut] = []
    for row in values:
        try:
            points.append(
                PriceCandleOut(
                    ts=_parse_bar_datetime(str(row["datetime"])),
                    open=float(row["open"]),
                    high=float(row["high"]),
                    low=float(row["low"]),
                    close=float(row["close"]),
                    volume=int(float(row["volume"])) if row.get("volume") else None,
                )
            )
        except (KeyError, TypeError, ValueError) as exc:
            log.warning("Skipping invalid intraday bar for %s: %s", symbol, exc)

    return IntradayResponse(
        symbol=symbol.upper(),
        interval=INTRADAY_INTERVAL,
        points=points,
        as_of=datetime.now(timezone.utc),
        cached=False,
    )


def get_intraday_series(symbol: str) -> IntradayResponse:
    """Return 5min intraday candles; upstream fetch at most once per cache TTL."""
    cache = _get_cache()
    sym = symbol.upper()

    hit = cache.get(sym)
    if hit is not None:
        data = hit.data
        return data.model_copy(update={"cached": True})

    stale = cache.get_stale(sym)
    try:
        fresh = _fetch_from_api(sym)
        cache.set(sym, fresh.model_copy(update={"cached": False}))
        return fresh
    except Exception:
        if stale is not None:
            log.warning("Twelve Data fetch failed for %s; serving stale cache", sym)
            return stale.data.model_copy(update={"cached": True})
        raise
