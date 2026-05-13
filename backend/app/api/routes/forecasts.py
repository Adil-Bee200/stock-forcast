from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_ticker_or_404
from app.core.database import get_db
from app.models import Forecast, Ticker
from app.schemas import ForecastOut, ForecastsResponse

router = APIRouter(tags=["forecasts"])

MAX_FORECASTS = 200


def _horizon_label(forecast_for: datetime, generated_at: datetime) -> str:
    """Human label like ``5m`` / ``2h`` / ``3d`` for a forecast horizon."""
    delta = forecast_for - generated_at
    seconds = max(int(delta.total_seconds()), 0)
    if seconds < 3600:
        minutes = max(seconds // 60, 1)
        return f"{minutes}m"
    if seconds < 86_400:
        return f"{seconds // 3600}h"
    return f"{seconds // 86_400}d"


@router.get("/forecasts/{symbol}", response_model=ForecastsResponse)
def get_forecasts(
    ticker: Ticker = Depends(get_ticker_or_404),
    limit: int = Query(default=20, ge=1, le=MAX_FORECASTS),
    db: Session = Depends(get_db),
) -> ForecastsResponse:
    rows = db.scalars(
        select(Forecast)
        .where(
            Forecast.ticker_id == ticker.id,
            Forecast.predicted_price.is_not(None),
        )
        .order_by(Forecast.generated_at.desc())
        .limit(limit)
    ).all()

    forecasts = [
        ForecastOut(
            created_at=f.generated_at,
            horizon_label=_horizon_label(f.forecast_for, f.generated_at),
            predicted_close=f.predicted_price,
            model_version=f.model_name or "unknown",
        )
        for f in rows
    ]

    return ForecastsResponse(symbol=ticker.symbol, forecasts=forecasts)
