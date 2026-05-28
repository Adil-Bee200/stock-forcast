from fastapi import APIRouter, Request

from app.core.limiter import limiter
from app.schemas import AlertsResponse

router = APIRouter(tags=["alerts"])


@router.get("/alerts", response_model=AlertsResponse)
@limiter.limit("5/minute")
def list_alerts(request: Request) -> AlertsResponse:
    return AlertsResponse(alerts=[])
