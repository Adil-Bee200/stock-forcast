from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.api.deps import get_ticker_or_404
from app.core.config import settings
from app.core.database import get_db
from app.core.limiter import limiter
from app.models import Ticker
from app.schemas import IntradayResponse
from app.services.twelve_data import get_intraday_series

router = APIRouter(tags=["intraday"])


@router.get("/intraday/{symbol}", response_model=IntradayResponse)
@limiter.limit("30/minute")
def get_intraday(
    request: Request,
    ticker: Ticker = Depends(get_ticker_or_404),
    db: Session = Depends(get_db),
) -> IntradayResponse:
    del db  # ticker resolved via dependency
    if not settings.has_intraday_api():
        raise HTTPException(
            status_code=503,
            detail="Intraday market data is not configured (set MARKET_DATA_API_KEY).",
        )
    try:
        data = get_intraday_series(ticker.symbol)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="Failed to fetch intraday market data.",
        ) from exc
    return data
