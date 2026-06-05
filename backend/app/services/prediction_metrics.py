from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from statistics import mean
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models import Forecast, PredictionMetrics, PricePoint, Ticker
from app.schemas import (
    MetricTrendPointOut,
    ModelMaeOut,
    ModelMetricTrendOut,
    SymbolMetricsOut,
    SymbolMetricsTrendOut,
)

log = logging.getLogger(__name__)

ET = ZoneInfo("America/New_York")


@dataclass(frozen=True)
class RecordSymbolResult:
    symbol: str
    metrics_written: int
    session_date: str | None = None
    error: str | None = None


def _normalize_ts(ts: datetime) -> datetime:
    if ts.tzinfo is None:
        return ts.replace(tzinfo=timezone.utc)
    return ts.astimezone(timezone.utc)


def _eod_session_key(ts: datetime) -> str:
    return _normalize_ts(ts).astimezone(ET).strftime("%Y-%m-%d")


def _session_midnight_utc(session_key: str) -> datetime:
    year, month, day = (int(part) for part in session_key.split("-"))
    return datetime(year, month, day, tzinfo=ET).astimezone(timezone.utc)


def _compute_errors(actual: float, predicted: float) -> tuple[float, float]:
    absolute_error = abs(actual - predicted)
    if actual == 0:
        percentage_error = 0.0 if predicted == 0 else 100.0
    else:
        percentage_error = absolute_error / abs(actual) * 100.0
    return absolute_error, percentage_error


def _load_actual_closes(session: Session, ticker_id: int) -> dict[str, float]:
    rows = session.scalars(
        select(PricePoint)
        .where(
            PricePoint.ticker_id == ticker_id,
            PricePoint.close_price.is_not(None),
        )
        .order_by(PricePoint.ts.asc())
    ).all()

    actuals: dict[str, float] = {}
    for row in rows:
        actuals[_eod_session_key(row.ts)] = float(row.close_price)
    return actuals


def _latest_eod_session(actuals: dict[str, float]) -> str | None:
    if not actuals:
        return None
    return max(actuals.keys())


def _persist_metric(
    session: Session,
    *,
    ticker_id: int,
    model_name: str,
    date: datetime,
    actual_close: float,
    predicted_close: float,
    absolute_error: float,
    percentage_error: float,
) -> None:
    table = PredictionMetrics.__table__
    stmt = pg_insert(table).values(
        ticker_id=ticker_id,
        model_name=model_name,
        date=_normalize_ts(date),
        actual_close=actual_close,
        predicted_close=predicted_close,
        absolute_error=absolute_error,
        percentage_error=percentage_error,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["ticker_id", "model_name", "date"],
        set_={
            "actual_close": stmt.excluded.actual_close,
            "predicted_close": stmt.excluded.predicted_close,
            "absolute_error": stmt.excluded.absolute_error,
            "percentage_error": stmt.excluded.percentage_error,
        },
    )
    session.execute(stmt)


def _record_symbol_metrics(
    session: Session,
    ticker: Ticker,
    *,
    target_sessions: set[str] | None,
) -> RecordSymbolResult:
    """Score forecasts whose ``forecast_for`` falls in ``target_sessions``.

    ``target_sessions=None`` scores every forecast with a matching actual close.
    """
    try:
        actuals = _load_actual_closes(session, ticker.id)
        if not actuals:
            return RecordSymbolResult(
                symbol=ticker.symbol,
                metrics_written=0,
                error="no EOD price history",
            )

        if target_sessions is not None and not target_sessions:
            return RecordSymbolResult(
                symbol=ticker.symbol,
                metrics_written=0,
                error="no target EOD session",
            )

        forecasts = session.scalars(
            select(Forecast)
            .where(
                Forecast.ticker_id == ticker.id,
                Forecast.model_name.is_not(None),
                Forecast.predicted_price.is_not(None),
            )
            .order_by(Forecast.forecast_for.asc())
        ).all()

        written = 0
        scored_sessions: set[str] = set()
        for forecast in forecasts:
            session_key = _eod_session_key(forecast.forecast_for)
            if target_sessions is not None and session_key not in target_sessions:
                continue

            actual_close = actuals.get(session_key)
            if actual_close is None:
                continue

            predicted_close = float(forecast.predicted_price)
            absolute_error, percentage_error = _compute_errors(
                actual_close,
                predicted_close,
            )
            _persist_metric(
                session,
                ticker_id=ticker.id,
                model_name=str(forecast.model_name),
                date=_session_midnight_utc(session_key),
                actual_close=actual_close,
                predicted_close=predicted_close,
                absolute_error=absolute_error,
                percentage_error=percentage_error,
            )
            written += 1
            scored_sessions.add(session_key)

        session.flush()
        session_date = (
            max(scored_sessions) if len(scored_sessions) == 1 else None
        )
        if target_sessions is not None and len(target_sessions) == 1:
            session_date = next(iter(target_sessions))

        return RecordSymbolResult(
            symbol=ticker.symbol,
            metrics_written=written,
            session_date=session_date,
            error=None,
        )
    except Exception as exc:  # noqa: BLE001
        log.exception("prediction metrics failed for %s", ticker.symbol)
        return RecordSymbolResult(
            symbol=ticker.symbol,
            metrics_written=0,
            error=str(exc),
        )


def record_symbol_metrics_backfill(
    session: Session,
    ticker: Ticker,
) -> RecordSymbolResult:
    """Score every stored forecast that has a realized EOD close."""
    result = _record_symbol_metrics(session, ticker, target_sessions=None)
    if not result.error:
        log.info(
            "%s: backfill recorded %d prediction metric rows",
            ticker.symbol,
            result.metrics_written,
        )
    return result


def record_symbol_metrics_daily(
    session: Session,
    ticker: Ticker,
) -> RecordSymbolResult:
    """Score forecasts for the latest ingested EOD session only."""
    actuals = _load_actual_closes(session, ticker.id)
    latest = _latest_eod_session(actuals)
    if latest is None:
        return RecordSymbolResult(
            symbol=ticker.symbol,
            metrics_written=0,
            error="no EOD price history",
        )

    result = _record_symbol_metrics(
        session,
        ticker,
        target_sessions={latest},
    )
    if not result.error:
        log.info(
            "%s: daily metrics for %s — %d rows",
            ticker.symbol,
            latest,
            result.metrics_written,
        )
    return RecordSymbolResult(
        symbol=result.symbol,
        metrics_written=result.metrics_written,
        session_date=latest,
        error=result.error,
    )


PROPHET_MODEL_NAME = "prophet_v1"
NAIVE_MODEL_NAME = "naive_baseline_v1"
MODEL_ORDER = (PROPHET_MODEL_NAME, NAIVE_MODEL_NAME)


def _window_mae(errors_by_date: dict[str, float], window: int) -> tuple[float | None, int]:
    if not errors_by_date:
        return None, 0
    dates = sorted(errors_by_date.keys(), reverse=True)[:window]
    errors = [errors_by_date[d] for d in dates]
    if not errors:
        return None, 0
    return mean(errors), len(errors)


def _aggregate_ticker_mae(
    rows: list[PredictionMetrics],
) -> list[ModelMaeOut]:
    by_model: dict[str, dict[str, float]] = defaultdict(dict)
    for row in rows:
        session_key = _eod_session_key(row.date)
        by_model[row.model_name][session_key] = float(row.absolute_error)

    models: list[ModelMaeOut] = []
    for model_name in MODEL_ORDER:
        errors_by_date = by_model.get(model_name, {})
        mae_7d, samples_7d = _window_mae(errors_by_date, 7)
        mae_30d, samples_30d = _window_mae(errors_by_date, 30)
        models.append(
            ModelMaeOut(
                model_name=model_name,
                mae_7d=mae_7d,
                mae_30d=mae_30d,
                samples_7d=samples_7d,
                samples_30d=samples_30d,
            )
        )

    for model_name in sorted(by_model.keys()):
        if model_name in MODEL_ORDER:
            continue
        errors_by_date = by_model[model_name]
        mae_7d, samples_7d = _window_mae(errors_by_date, 7)
        mae_30d, samples_30d = _window_mae(errors_by_date, 30)
        models.append(
            ModelMaeOut(
                model_name=model_name,
                mae_7d=mae_7d,
                mae_30d=mae_30d,
                samples_7d=samples_7d,
                samples_30d=samples_30d,
            )
        )

    return models


def get_symbol_metrics(
    session: Session,
    ticker: Ticker,
) -> SymbolMetricsOut:
    rows = session.scalars(
        select(PredictionMetrics)
        .where(PredictionMetrics.ticker_id == ticker.id)
        .order_by(PredictionMetrics.date.desc())
    ).all()
    return SymbolMetricsOut(
        symbol=ticker.symbol,
        models=_aggregate_ticker_mae(rows),
    )


def get_all_symbol_metrics(session: Session) -> list[SymbolMetricsOut]:
    tickers = session.scalars(select(Ticker).order_by(Ticker.symbol)).all()
    if not tickers:
        return []

    ticker_ids = [t.id for t in tickers]
    rows = session.scalars(
        select(PredictionMetrics)
        .where(PredictionMetrics.ticker_id.in_(ticker_ids))
        .order_by(PredictionMetrics.date.desc())
    ).all()

    by_ticker_id: dict[int, list[PredictionMetrics]] = defaultdict(list)
    for row in rows:
        by_ticker_id[row.ticker_id].append(row)

    return [
        SymbolMetricsOut(
            symbol=ticker.symbol,
            models=_aggregate_ticker_mae(by_ticker_id.get(ticker.id, [])),
        )
        for ticker in tickers
    ]


def _build_model_trends(
    rows: list[PredictionMetrics],
    *,
    max_sessions: int | None,
) -> list[ModelMetricTrendOut]:
    by_model: dict[str, list[PredictionMetrics]] = defaultdict(list)
    for row in rows:
        by_model[row.model_name].append(row)

    trends: list[ModelMetricTrendOut] = []
    for model_name in MODEL_ORDER:
        trends.append(
            _model_trend_from_rows(by_model.get(model_name, []), model_name, max_sessions)
        )

    for model_name in sorted(by_model.keys()):
        if model_name in MODEL_ORDER:
            continue
        trends.append(
            _model_trend_from_rows(by_model[model_name], model_name, max_sessions)
        )

    return trends


def _model_trend_from_rows(
    rows: list[PredictionMetrics],
    model_name: str,
    max_sessions: int | None,
) -> ModelMetricTrendOut:
    by_session: dict[str, PredictionMetrics] = {}
    for row in rows:
        session_key = _eod_session_key(row.date)
        by_session[session_key] = row

    sessions = sorted(by_session.keys())
    if max_sessions is not None and max_sessions > 0:
        sessions = sessions[-max_sessions:]

    points = [
        MetricTrendPointOut(
            date=_session_midnight_utc(session_key),
            absolute_error=float(by_session[session_key].absolute_error),
            percentage_error=float(by_session[session_key].percentage_error),
        )
        for session_key in sessions
    ]
    return ModelMetricTrendOut(model_name=model_name, points=points)


def get_symbol_metrics_trend(
    session: Session,
    ticker: Ticker,
    *,
    max_sessions: int = 90,
) -> SymbolMetricsTrendOut:
    rows = session.scalars(
        select(PredictionMetrics)
        .where(PredictionMetrics.ticker_id == ticker.id)
        .order_by(PredictionMetrics.date.asc())
    ).all()
    return SymbolMetricsTrendOut(
        symbol=ticker.symbol,
        models=_build_model_trends(rows, max_sessions=max_sessions),
    )
