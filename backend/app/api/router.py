from fastapi import APIRouter

from app.api.routes import alerts, forecasts, intraday, prices, summary

api_router = APIRouter(prefix="/api")
api_router.include_router(summary.router)
api_router.include_router(alerts.router)
api_router.include_router(prices.router)
api_router.include_router(forecasts.router)
api_router.include_router(intraday.router)

