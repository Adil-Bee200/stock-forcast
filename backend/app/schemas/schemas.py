from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


# Ticker

class TickerBase(BaseModel):
    symbol: str = Field(..., max_length=16)
    name: str | None = None
    asset_type: str | None = None
    exchange: str | None = None


class TickerCreate(TickerBase):
    pass


class TickerRead(TickerBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime



# PricePoint

class PricePointBase(BaseModel):
    ticker_id: int
    ts: datetime
    open_price: float | None = None
    high_price: float | None = None
    low_price: float | None = None
    close_price: float | None = None
    volume: int | None = None
    source: str | None = Field(default=None, max_length=100)


class PricePointCreate(PricePointBase):
    pass


class PricePointRead(PricePointBase):
    model_config = ConfigDict(from_attributes=True)

    id: int



# Forecast

class ForecastBase(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    ticker_id: int
    forecast_for: datetime
    predicted_price: float | None = None
    lower_bound: float | None = None
    upper_bound: float | None = None
    model_name: str | None = Field(default=None, max_length=100)


class ForecastCreate(ForecastBase):
    pass


class ForecastRead(ForecastBase):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

    id: int
    generated_at: datetime



# PredictionMetrics

class PredictionMetricsBase(BaseModel):
    model_name: str
    date: datetime
    actual_close: float
    predicted_close: float
    absolute_error: float
    percentage_error: float


class ModelMaeOut(BaseModel):
    model_name: str
    mae_7d: float | None = None
    mae_30d: float | None = None
    samples_7d: int = 0
    samples_30d: int = 0


class SymbolMetricsOut(BaseModel):
    symbol: str
    models: list[ModelMaeOut]


class MetricsResponse(BaseModel):
    tickers: list[SymbolMetricsOut]
    as_of: datetime


class MetricTrendPointOut(BaseModel):
    date: datetime
    absolute_error: float
    percentage_error: float


class ModelMetricTrendOut(BaseModel):
    model_name: str
    points: list[MetricTrendPointOut]


class SymbolMetricsTrendOut(BaseModel):
    symbol: str
    models: list[ModelMetricTrendOut]


# API response schemas 

class SummaryTickerOut(BaseModel):
    symbol: str
    last_close: float | None = None
    last_ts: datetime | None = None
    change_pct: float | None = None
    forecast_close: float | None = None


class SummaryResponse(BaseModel):
    tickers: list[SummaryTickerOut]
    as_of: datetime


class PriceCandleOut(BaseModel):
    ts: datetime
    open: float | None = None
    high: float | None = None
    low: float | None = None
    close: float
    volume: int | None = None


class PricesResponse(BaseModel):
    symbol: str
    points: list[PriceCandleOut]


class IntradayResponse(BaseModel):
    symbol: str
    interval: str
    points: list[PriceCandleOut]
    as_of: datetime
    cached: bool = False


class ForecastOut(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    created_at: datetime
    forecast_for: datetime
    horizon_label: str
    predicted_close: float
    lower_bound: float | None = None
    upper_bound: float | None = None
    model_version: str


class ForecastsResponse(BaseModel):
    symbol: str
    forecasts: list[ForecastOut]


class AlertOut(BaseModel):
    id: int
    symbol: str
    kind: str
    severity: str
    message: str
    created_at: datetime


class AlertsResponse(BaseModel):
    alerts: list[AlertOut]
