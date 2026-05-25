from fastapi import APIRouter

from app.schemas import AlertsResponse

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

router = APIRouter(tags=["alerts"])


@router.get("/alerts", response_model=AlertsResponse)
@limiter.limit("5/minute")
def list_alerts() -> AlertsResponse:
    return AlertsResponse(alerts=[])
