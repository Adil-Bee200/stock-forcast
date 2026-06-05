from sqlalchemy import (
    BigInteger,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class Ticker(Base):
    __tablename__ = "tickers"

    id = Column(Integer, primary_key=True)
    symbol = Column(String(16), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=True)
    asset_type = Column(String(100), nullable=True)
    exchange = Column(String(100), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    price_points = relationship(
        "PricePoint",
        back_populates="ticker",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    forecasts = relationship(
        "Forecast",
        back_populates="ticker",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class PricePoint(Base):
    __tablename__ = "price_points"

    id = Column(Integer, primary_key=True)
    ticker_id = Column(
        Integer,
        ForeignKey("tickers.id", ondelete="CASCADE"),
        nullable=False,
    )
    ts = Column(DateTime(timezone=True), nullable=False)
    open_price = Column(Float, nullable=True)
    high_price = Column(Float, nullable=True)
    low_price = Column(Float, nullable=True)
    close_price = Column(Float, nullable=True)
    volume = Column(BigInteger, nullable=True)
    source = Column(String(100), nullable=True)

    ticker = relationship("Ticker", back_populates="price_points")

    __table_args__ = (
        Index("ix_price_points_ticker_ts_desc", "ticker_id", ts.desc()),
        UniqueConstraint('ticker_id', 'ts', name='uix_ticker_ts'),
    )


class Forecast(Base):
    __tablename__ = "forecasts"

    id = Column(Integer, primary_key=True)
    ticker_id = Column(
        Integer,
        ForeignKey("tickers.id", ondelete="CASCADE"),
        nullable=False,
    )
    forecast_for = Column(DateTime(timezone=True), nullable=False)
    predicted_price = Column(Float, nullable=True)
    lower_bound = Column(Float, nullable=True)
    upper_bound = Column(Float, nullable=True)
    model_name = Column(String(100), nullable=True)
    generated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    ticker = relationship("Ticker", back_populates="forecasts")

    __table_args__ = (
        Index(
            "ix_forecasts_ticker_forecast_for",
            "ticker_id",
            "forecast_for",
        ),
        UniqueConstraint(
            "ticker_id",
            "forecast_for",
            "model_name",
            name="uix_ticker_forecast_for_model",
        ),
    )


class PredictionMetrics(Base):
    __tablename__ = "prediction_metrics"

    id = Column(Integer, primary_key=True)
    ticker_id = Column(
        Integer,
        ForeignKey("tickers.id", ondelete="CASCADE"),
        nullable=False,
    )
    model_name = Column(String(100), nullable=False)
    date = Column(DateTime(timezone=True), nullable=False)
    actual_close = Column(Float, nullable=False)
    predicted_close = Column(Float, nullable=False)
    absolute_error = Column(Float, nullable=False)
    percentage_error = Column(Float, nullable=False)

    __table_args__ = (
        Index("ix_prediction_metrics_ticker_date", "ticker_id", "date"),
        UniqueConstraint(
            "ticker_id",
            "model_name",
            "date",
            name="uix_prediction_metrics_ticker_model_date",
        ),
    )
