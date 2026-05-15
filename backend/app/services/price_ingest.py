from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import pandas as pd
import yfinance as yf
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models import PricePoint, Ticker

log = logging.getLogger(__name__)

ET = ZoneInfo("America/New_York")

DEFAULT_SYMBOLS: tuple[str, ...] = (
    "AAPL",
    "MSFT",
    "AMZN",
    "GOOGL",
    "META",
    "NVDA",
    "TSLA",
)


def _to_utc_index(index: pd.DatetimeIndex) -> pd.DatetimeIndex:
    ## Normalize Yahoo daily bar timestamps to UTC-aware datetimes.
    idx = pd.DatetimeIndex(pd.to_datetime(index, utc=False))
    if idx.tz is None:
        idx = idx.tz_localize(
            ET,
            ambiguous="infer",
            nonexistent="shift_forward",
        )
    else:
        idx = idx.tz_convert(ET)
    return idx.tz_convert(timezone.utc)


def _float_or_none(x: object) -> float | None:
    if x is None or (isinstance(x, float) and pd.isna(x)):
        return None
    return float(x)


def _volume_or_none(x: object) -> int | None:
    if x is None or (isinstance(x, float) and pd.isna(x)):
        return None
    try:
        v = int(x)
    except (TypeError, ValueError):
        return None
    if v < 0:
        return None
    return v


def ensure_ticker(session: Session, symbol: str) -> Ticker:
    ## Return existing ``Ticker`` row or insert a new one (symbol uppercased).
    sym = symbol.upper().strip()
    row = session.scalars(select(Ticker).where(Ticker.symbol == sym)).first()
    if row is not None:
        return row
    row = Ticker(symbol=sym, name=None, asset_type="EQUITY", exchange=None)
    session.add(row)
    session.flush()
    return row


def enrich_ticker_metadata(session: Session, ticker: Ticker) -> None:
    try:
        info = yf.Ticker(ticker.symbol).info or {}
    except Exception as exc:  
        log.warning("Could not fetch info for %s: %s", ticker.symbol, exc)
        return
    short = info.get("shortName") or info.get("longName")
    if short and isinstance(short, str):
        ticker.name = short[:100]
    ex = info.get("exchange")
    if ex and isinstance(ex, str):
        ticker.exchange = ex[:100]


def fetch_daily_history(symbol: str, period: str) -> pd.DataFrame:
    ## Return a Yahoo Finance daily history dataframe (may be empty).
    df = yf.Ticker(symbol).history(period=period, interval="1d", auto_adjust=False)
    if df is None or df.empty:
        return pd.DataFrame()
    return df


def upsert_price_points(
    session: Session,
    *,
    ticker_id: int,
    hist: pd.DataFrame,
    source: str = "yfinance",
) -> int:
    ## Insert or update rows in ``price_points`` for ``hist``. Returns rows touched.
    if hist.empty:
        return 0

    utc_index = _to_utc_index(pd.DatetimeIndex(hist.index))
    count = 0

    for ts, (_, row) in zip(utc_index, hist.iterrows()):
        if not isinstance(ts, pd.Timestamp):
            ts = pd.Timestamp(ts)
        ts_py: datetime = ts.to_pydatetime()
        if ts_py.tzinfo is None:
            ts_py = ts_py.replace(tzinfo=timezone.utc)

        o = _float_or_none(row.get("Open"))
        h = _float_or_none(row.get("High"))
        l = _float_or_none(row.get("Low"))
        c = _float_or_none(row.get("Close"))
        v = _volume_or_none(row.get("Volume"))

        stmt = pg_insert(PricePoint).values(
            ticker_id=ticker_id,
            ts=ts_py,
            open_price=o,
            high_price=h,
            low_price=l,
            close_price=c,
            volume=v,
            source=source,
        )
        stmt = stmt.on_conflict_do_update(
            constraint="uix_ticker_ts",
            set_={
                "open_price": stmt.excluded.open_price,
                "high_price": stmt.excluded.high_price,
                "low_price": stmt.excluded.low_price,
                "close_price": stmt.excluded.close_price,
                "volume": stmt.excluded.volume,
                "source": stmt.excluded.source,
            },
        )
        session.execute(stmt)
        count += 1

    return count


@dataclass(frozen=True)
class IngestSymbolResult:
    symbol: str
    rows: int
    error: str | None = None


def ingest_all(
    session: Session,
    symbols: list[str],
    *,
    period: str = "1y",
    fetch_info: bool = True,
) -> list[IngestSymbolResult]:
    ## Ingest each symbol; commit per symbol so one failure does not roll back others.
    results: list[IngestSymbolResult] = []
    for sym in symbols:
        n, err = ingest_symbol(session, sym, period=period, fetch_info=fetch_info)
        if err:
            session.rollback()
            results.append(IngestSymbolResult(symbol=sym.upper(), rows=0, error=err))
        else:
            session.commit()
            results.append(IngestSymbolResult(symbol=sym.upper(), rows=n, error=None))
    return results


def ingest_symbol(
    session: Session,
    symbol: str,
    *,
    period: str = "1y",
    fetch_info: bool = True,
) -> tuple[int, str | None]:
    ## Ingest one symbol. Returns ``(rows_upserted, error_message)``.
    sym = symbol.upper().strip()
    try:
        ticker = ensure_ticker(session, sym)
        if fetch_info:
            enrich_ticker_metadata(session, ticker)
        hist = fetch_daily_history(sym, period)
        if hist.empty:
            return 0, f"no price rows returned for {sym}"
        n = upsert_price_points(session, ticker_id=ticker.id, hist=hist)
        return n, None
    except Exception as exc:  # noqa: BLE001
        log.exception("ingest failed for %s", sym)
        return 0, str(exc)
