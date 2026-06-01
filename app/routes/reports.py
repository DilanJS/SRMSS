from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.routes.auth import require_roles
from app.schemas.auth import UserResponse
from app.schemas.report import ReportRangeQuery, ReportingOverviewResponse
from app.services.report_service import report_service

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.get("/overview", response_model=ReportingOverviewResponse)
def get_reporting_overview(
    _: Annotated[UserResponse, Depends(require_roles("admin", "manager"))],
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
) -> ReportingOverviewResponse:
    query = ReportRangeQuery(date_from=date_from, date_to=date_to)
    return report_service.get_reporting_overview(query)
