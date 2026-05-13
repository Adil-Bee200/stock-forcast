from fastapi import APIRouter

from app.schemas import AlertsResponse

router = APIRouter(tags=["alerts"])


@router.get("/alerts", response_model=AlertsResponse)
def list_alerts() -> AlertsResponse:
    return AlertsResponse(alerts=[])
