from __future__ import annotations

import logging
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Ticker
from app.services.forecast_train import TrainSymbolResult, train_symbol
from app.services.prediction_metrics import (
    RecordSymbolResult,
    record_symbol_metrics_backfill,
    record_symbol_metrics_daily,
)
from app.services.price_ingest import IngestSymbolResult, ingest_all

log = logging.getLogger(__name__)


@dataclass
class IngestJobReport:
    results: list[IngestSymbolResult] = field(default_factory=list)

    @property
    def succeeded(self) -> int:
        return sum(1 for r in self.results if r.error is None)

    @property
    def failed(self) -> int:
        return sum(1 for r in self.results if r.error is not None)


@dataclass
class TrainJobReport:
    results: list[TrainSymbolResult] = field(default_factory=list)

    @property
    def succeeded(self) -> int:
        return sum(
            1 for r in self.results if r.prophet_written and r.baseline_written
        )

    @property
    def failed(self) -> int:
        return len(self.results) - self.succeeded


@dataclass
class MetricsJobReport:
    results: list[RecordSymbolResult] = field(default_factory=list)

    @property
    def succeeded(self) -> int:
        return sum(1 for r in self.results if r.error is None)

    @property
    def failed(self) -> int:
        return sum(1 for r in self.results if r.error is not None)

    @property
    def metrics_written(self) -> int:
        return sum(r.metrics_written for r in self.results)


@dataclass
class DailyPipelineReport:
    ingest: IngestJobReport
    metrics: MetricsJobReport
    train: TrainJobReport


def _resolve_symbols(session: Session, symbols: list[str] | None) -> list[str]:
    syms = symbols or settings.get_worker_symbols()
    return [s.upper() for s in syms]


def run_eod_ingest(
    session: Session,
    symbols: list[str] | None = None,
    *,
    period: str | None = None,
    fetch_info: bool | None = None,
) -> IngestJobReport:
    """Download Yahoo daily bars and upsert into ``price_points``."""
    syms = _resolve_symbols(session, symbols)
    log.info("EOD ingest starting for %s", ", ".join(syms))
    results = ingest_all(
        session,
        syms,
        period=period or settings.worker_ingest_period,
        fetch_info=(
            settings.worker_fetch_ticker_info
            if fetch_info is None
            else fetch_info
        ),
    )
    report = IngestJobReport(results=results)
    log.info("EOD ingest done: %d ok, %d failed", report.succeeded, report.failed)
    for r in results:
        if r.error:
            log.error("%s: %s", r.symbol, r.error)
        else:
            log.info("%s: upserted %d rows", r.symbol, r.rows)
    return report


def run_training(
    session: Session,
    symbols: list[str] | None = None,
) -> TrainJobReport:
    """Train Prophet + naive baseline and write ``forecasts`` rows."""
    syms = _resolve_symbols(session, symbols)
    log.info("Training starting for %s", ", ".join(syms))

    results: list[TrainSymbolResult] = []
    for sym in syms:
        ticker = session.scalars(
            select(Ticker).where(Ticker.symbol == sym)
        ).first()
        if ticker is None:
            results.append(
                TrainSymbolResult(
                    symbol=sym,
                    prophet_written=False,
                    baseline_written=False,
                    error="ticker not found (run ingest first)",
                )
            )
            continue

        try:
            outcome = train_symbol(
                session,
                ticker,
                min_rows=settings.worker_train_min_rows,
            )
            if outcome.error:
                session.rollback()
                log.error("%s: %s", sym, outcome.error)
            else:
                session.commit()
                log.info("%s: forecasts written", sym)
            results.append(outcome)
        except Exception as exc:  # noqa: BLE001
            session.rollback()
            log.exception("training failed for %s", sym)
            results.append(
                TrainSymbolResult(
                    symbol=sym,
                    prophet_written=False,
                    baseline_written=False,
                    error=str(exc),
                )
            )

    report = TrainJobReport(results=results)
    log.info("Training done: %d ok, %d failed", report.succeeded, report.failed)
    return report


def _run_metrics(
    session: Session,
    symbols: list[str] | None,
    *,
    record_fn,
    label: str,
) -> MetricsJobReport:
    syms = _resolve_symbols(session, symbols)
    log.info("%s starting for %s", label, ", ".join(syms))

    results: list[RecordSymbolResult] = []
    for sym in syms:
        ticker = session.scalars(
            select(Ticker).where(Ticker.symbol == sym)
        ).first()
        if ticker is None:
            results.append(
                RecordSymbolResult(
                    symbol=sym,
                    metrics_written=0,
                    error="ticker not found (run ingest first)",
                )
            )
            continue

        try:
            outcome = record_fn(session, ticker)
            if outcome.error:
                session.rollback()
                log.error("%s: %s", sym, outcome.error)
            else:
                session.commit()
            results.append(outcome)
        except Exception as exc:  # noqa: BLE001
            session.rollback()
            log.exception("%s failed for %s", label, sym)
            results.append(
                RecordSymbolResult(
                    symbol=sym,
                    metrics_written=0,
                    error=str(exc),
                )
            )

    report = MetricsJobReport(results=results)
    log.info(
        "%s done: %d ok, %d failed, %d rows written",
        label,
        report.succeeded,
        report.failed,
        report.metrics_written,
    )
    return report


def run_metrics_recording(
    session: Session,
    symbols: list[str] | None = None,
) -> MetricsJobReport:
    """Score forecasts for the latest EOD session only (daily worker)."""
    return _run_metrics(
        session,
        symbols,
        record_fn=record_symbol_metrics_daily,
        label="Daily prediction metrics",
    )


def run_metrics_backfill(
    session: Session,
    symbols: list[str] | None = None,
) -> MetricsJobReport:
    """Score all past forecasts with realized closes (one-time catch-up)."""
    return _run_metrics(
        session,
        symbols,
        record_fn=record_symbol_metrics_backfill,
        label="Prediction metrics backfill",
    )


def run_daily_pipeline(
    session: Session,
    symbols: list[str] | None = None,
) -> DailyPipelineReport:
    """End-of-day job: ingest EOD bars, score forecasts, then retrain models."""
    ingest = run_eod_ingest(session, symbols=symbols)
    metrics = run_metrics_recording(session, symbols=symbols)
    train = run_training(session, symbols=symbols)
    return DailyPipelineReport(ingest=ingest, metrics=metrics, train=train)
