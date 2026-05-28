from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import Forecast, PricePoint, Ticker
from app.schemas import SummaryResponse, SummaryTickerOut

from app.core.limiter import limiter

router = APIRouter(tags=["summary"])


@router.get("/summary", response_model=SummaryResponse)
@limiter.limit("5/minute")
def get_summary(request: Request, db: Session = Depends(get_db)) -> SummaryResponse:
    tickers = db.scalars(select(Ticker).order_by(Ticker.symbol)).all()

    rows: list[SummaryTickerOut] = []
    for t in tickers:
        recent = db.scalars(
            select(PricePoint)
            .where(PricePoint.ticker_id == t.id)
            .order_by(PricePoint.ts.desc())
            .limit(2)
        ).all()

        last_close = recent[0].close_price if recent else None
        last_ts = recent[0].ts if recent else None
        prev_close = recent[1].close_price if len(recent) > 1 else None

        change_pct: float | None = None
        if (
            last_close is not None
            and prev_close not in (None, 0)
        ):
            change_pct = (last_close - prev_close) / prev_close * 100.0

        latest_forecast = db.scalars(
            select(Forecast)
            .where(Forecast.ticker_id == t.id)
            .order_by(Forecast.generated_at.desc())
            .limit(1)
        ).first()

        rows.append(
            SummaryTickerOut(
                symbol=t.symbol,
                last_close=last_close,
                last_ts=last_ts,
                change_pct=change_pct,
                forecast_close=(
                    latest_forecast.predicted_price if latest_forecast else None
                ),
            )
        )

    return SummaryResponse(tickers=rows, as_of=datetime.now(timezone.utc))
