from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.deps import get_ticker_or_404
from app.core.database import get_db
from app.core.limiter import limiter
from app.models import Ticker
from app.schemas import MetricsResponse, SymbolMetricsOut, SymbolMetricsTrendOut
from app.services.prediction_metrics import (
    get_all_symbol_metrics,
    get_symbol_metrics,
    get_symbol_metrics_trend,
)

router = APIRouter(tags=["metrics"])


@router.get("/metrics", response_model=MetricsResponse)
@limiter.limit("10/minute")
def get_metrics(
    request: Request,
    db: Session = Depends(get_db),
) -> MetricsResponse:
    tickers = get_all_symbol_metrics(db)
    return MetricsResponse(tickers=tickers, as_of=datetime.now(timezone.utc))


@router.get("/metrics/{symbol}", response_model=SymbolMetricsOut)
@limiter.limit("10/minute")
def get_symbol_metrics_route(
    request: Request,
    ticker: Ticker = Depends(get_ticker_or_404),
    db: Session = Depends(get_db),
) -> SymbolMetricsOut:
    return get_symbol_metrics(db, ticker)


@router.get("/metrics/{symbol}/trend", response_model=SymbolMetricsTrendOut)
@limiter.limit("10/minute")
def get_symbol_metrics_trend_route(
    request: Request,
    ticker: Ticker = Depends(get_ticker_or_404),
    sessions: int = Query(default=90, ge=1, le=365),
    db: Session = Depends(get_db),
) -> SymbolMetricsTrendOut:
    return get_symbol_metrics_trend(db, ticker, max_sessions=sessions)
