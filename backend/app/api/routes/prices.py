from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_ticker_or_404
from app.core.database import get_db
from app.models import PricePoint, Ticker
from app.schemas import PriceCandleOut, PricesResponse

from app.core.limiter import limiter

router = APIRouter(tags=["prices"])

MAX_PRICE_POINTS = 1000


@router.get("/prices/{symbol}", response_model=PricesResponse)
@limiter.limit("5/minute")
def get_prices(
    request: Request,
    ticker: Ticker = Depends(get_ticker_or_404),
    limit: int = Query(default=200, ge=1, le=MAX_PRICE_POINTS),
    db: Session = Depends(get_db),
) -> PricesResponse:
    recent_desc = db.scalars(
        select(PricePoint)
        .where(
            PricePoint.ticker_id == ticker.id,
            PricePoint.close_price.is_not(None),
        )
        .order_by(PricePoint.ts.desc())
        .limit(limit)
    ).all()

    points = [
        PriceCandleOut(
            ts=p.ts,
            open=p.open_price,
            high=p.high_price,
            low=p.low_price,
            close=p.close_price,
            volume=p.volume,
        )
        for p in reversed(recent_desc)
    ]

    return PricesResponse(symbol=ticker.symbol, points=points)
