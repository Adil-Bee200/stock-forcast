from fastapi import Depends, HTTPException, Path, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import Ticker


def get_ticker_or_404(
    symbol: str = Path(..., min_length=1, max_length=16),
    db: Session = Depends(get_db),
) -> Ticker:
    ticker = db.scalars(
        select(Ticker).where(Ticker.symbol == symbol.upper())
    ).first()
    if ticker is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown ticker symbol: {symbol}",
        )
    return ticker
