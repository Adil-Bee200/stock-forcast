from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import pandas as pd
from prophet import Prophet
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models import Forecast, PricePoint, Ticker

log = logging.getLogger(__name__)

logging.getLogger("prophet").setLevel(logging.WARNING)
logging.getLogger("cmdstanpy").setLevel(logging.WARNING)

PROPHET_MODEL_NAME = "prophet_v1"
NAIVE_MODEL_NAME = "naive_baseline_v1"
ET = ZoneInfo("America/New_York")


@dataclass(frozen=True)
class TrainSymbolResult:
    symbol: str
    prophet_written: bool
    baseline_written: bool
    error: str | None = None


def _load_closes(session: Session, ticker_id: int) -> pd.DataFrame:
    rows = session.scalars(
        select(PricePoint)
        .where(
            PricePoint.ticker_id == ticker_id,
            PricePoint.close_price.is_not(None),
        )
        .order_by(PricePoint.ts.asc())
    ).all()
    if not rows:
        return pd.DataFrame(columns=["ts", "close"])
    return pd.DataFrame(
        {"ts": [r.ts for r in rows], "close": [float(r.close_price) for r in rows]}
    )


def _to_prophet_frame(df: pd.DataFrame) -> pd.DataFrame:
    ds = pd.to_datetime(df["ts"], utc=True).dt.tz_convert("UTC").dt.tz_localize(None)
    return pd.DataFrame({"ds": ds, "y": df["close"].astype(float)})


def _fit_prophet_next_day(prophet_df: pd.DataFrame) -> tuple[float, float, float, datetime]:
    n = len(prophet_df)
    model = Prophet(
        daily_seasonality=False,
        weekly_seasonality=n >= 14,
        yearly_seasonality=n >= 365,
        interval_width=0.95,
        changepoint_prior_scale=0.05,
    )
    model.fit(prophet_df)
    future = model.make_future_dataframe(periods=1, freq="B")
    forecast = model.predict(future)
    row = forecast.iloc[-1]

    pred = float(row["yhat"])
    lower = float(row["yhat_lower"])
    upper = float(row["yhat_upper"])
    # Prophet ``ds`` is a trading calendar date (naive). Anchor at ET midnight
    # so API/frontend show the correct US equity session day.
    trade_day = pd.Timestamp(row["ds"]).date()
    forecast_for = datetime(
        trade_day.year,
        trade_day.month,
        trade_day.day,
        tzinfo=ET,
    ).astimezone(timezone.utc)
    return pred, lower, upper, forecast_for


def _normalize_ts(ts: datetime) -> datetime:
    if ts.tzinfo is None:
        return ts.replace(tzinfo=timezone.utc)
    return ts.astimezone(timezone.utc)


def _persist_forecast(
    session: Session,
    *,
    ticker_id: int,
    forecast_for: datetime,
    predicted_price: float,
    lower_bound: float | None,
    upper_bound: float | None,
    model_name: str,
    generated_at: datetime,
) -> None:
    """Upsert one model row; uses table insert (not ORM ``session.add``)."""
    forecast_for = _normalize_ts(forecast_for)
    generated_at = _normalize_ts(generated_at)

    table = Forecast.__table__
    stmt = pg_insert(table).values(
        ticker_id=ticker_id,
        forecast_for=forecast_for,
        predicted_price=predicted_price,
        lower_bound=lower_bound,
        upper_bound=upper_bound,
        model_name=model_name,
        generated_at=generated_at,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["ticker_id", "forecast_for", "model_name"],
        set_={
            "predicted_price": stmt.excluded.predicted_price,
            "lower_bound": stmt.excluded.lower_bound,
            "upper_bound": stmt.excluded.upper_bound,
            "generated_at": stmt.excluded.generated_at,
        },
    )
    session.execute(stmt)
    session.flush()


def train_symbol(
    session: Session,
    ticker: Ticker,
    *,
    min_rows: int,
) -> TrainSymbolResult:
    ## Fit Prophet + naive baseline and insert two `forecasts` rows
    df = _load_closes(session, ticker.id)
    if len(df) < min_rows:
        return TrainSymbolResult(
            symbol=ticker.symbol,
            prophet_written=False,
            baseline_written=False,
            error=f"need at least {min_rows} EOD rows, have {len(df)}",
        )

    last_ts = df["ts"].iloc[-1]
    generated_at = datetime.now(timezone.utc)
    naive_pred = float(df["close"].iloc[-1])

    try:
        prophet_df = _to_prophet_frame(df)
        prophet_pred, prophet_lower, prophet_upper, forecast_for = _fit_prophet_next_day(
            prophet_df
        )
    except Exception as exc:  # noqa: BLE001
        log.exception("Prophet fit failed for %s", ticker.symbol)
        return TrainSymbolResult(
            symbol=ticker.symbol,
            prophet_written=False,
            baseline_written=False,
            error=str(exc),
        )

    forecast_for = _normalize_ts(forecast_for)

    # Clear prior rows for this horizon so re-runs stay clean (pre-migration DBs too).
    session.execute(
        delete(Forecast).where(
            Forecast.ticker_id == ticker.id,
            Forecast.forecast_for == forecast_for,
        )
    )
    session.flush()

    _persist_forecast(
        session,
        ticker_id=ticker.id,
        forecast_for=forecast_for,
        predicted_price=naive_pred,
        lower_bound=naive_pred,
        upper_bound=naive_pred,
        model_name=NAIVE_MODEL_NAME,
        generated_at=generated_at,
    )
    _persist_forecast(
        session,
        ticker_id=ticker.id,
        forecast_for=forecast_for,
        predicted_price=prophet_pred,
        lower_bound=prophet_lower,
        upper_bound=prophet_upper,
        model_name=PROPHET_MODEL_NAME,
        generated_at=generated_at,
    )

    log.info(
        "%s: prophet=%.2f (%.2f–%.2f) naive=%.2f forecast_for=%s",
        ticker.symbol,
        prophet_pred,
        prophet_lower,
        prophet_upper,
        naive_pred,
        forecast_for.isoformat(),
    )
    return TrainSymbolResult(
        symbol=ticker.symbol,
        prophet_written=True,
        baseline_written=True,
        error=None,
    )
