from typing import Annotated

from fastapi import APIRouter, Depends

from app.routes.auth import require_roles
from app.schemas.auth import UserResponse
from app.schemas.dashboard import DashboardOverviewResponse
from app.services.dashboard_service import dashboard_service

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/overview", response_model=DashboardOverviewResponse)
def get_dashboard_overview(
    _: Annotated[UserResponse, Depends(require_roles("admin", "manager"))],
) -> DashboardOverviewResponse:
    return dashboard_service.get_overview()
