from sqlalchemy import BigInteger, Column, Integer, String, DateTime, Float, ForeignKey, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base

class Tickers(Base):
    __tablename__ = "tickers"

    id = Column(Integer, primary_key=True)
    symbol = Column(String(16), unique=True)
    name = Column(String(100), nullable=True)
    asset_type = Column(String(100), nullable=True)
    exchange = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class price_points(Base):
    __tablename__ = "price_points"

    id = Column(Integer, primary_key=True)
    ticker_id = Column(Integer, ForeignKey("tickers.id"))
    ts = Column(DateTime(timezone=True))
    open_price = Column(Float, nullable=True)
    high_price = Column(Float, nullable=True)
    low_price = Column(Float, nullable=True)
    close_price = Column(Float, nullable=True)
    volume = Column(BigInteger, nullable=True)
    source = Column(String(100), nullable=True)
    
    __table_args__ = (
        Index("ix_price_points_desc",ts.desc()),
    )

    ticker = relationship("Tickers", back_populates="price_points")



class forecasts(Base):
    __tablename__ = "forecasts"

    id = Column(Integer, primary_key=True)
    ticker_id = Column(Integer, ForeignKey("tickers.id"))
    forecast_for = Column(DateTime(timezone=True))
    predicted_price = Column(Float, nullable=True)
    lower_bound = Column(Float, nullable=True)
    upper_bound = Column(Float, nullable=True)
    model_name = Column(String(100), nullable=True)
    generated_at = Column(DateTime(timezone=True), server_default=func.now())

    ticker = relationship("Tickers", back_populates="forecasts")

