from fastapi import APIRouter

from app.schemas import AlertsResponse

from app.core.limiter import limiter

router = APIRouter(tags=["alerts"])


@router.get("/alerts", response_model=AlertsResponse)
@limiter.limit("5/minute")
def list_alerts() -> AlertsResponse:
    return AlertsResponse(alerts=[])
