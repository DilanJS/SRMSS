from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.routes.auth import get_current_user, require_roles
from app.schemas.auth import UserResponse
from app.schemas.common import PaginatedResponse, paginate
from app.schemas.maintenance import (
    FuelLogCreateRequest,
    FuelLogListQuery,
    FuelLogResponse,
    MaintenanceDueReminder,
    MaintenanceLogCreateRequest,
    MaintenanceLogListQuery,
    MaintenanceLogResponse,
    MaintenanceLogUpdateRequest,
)
from app.services.maintenance_service import maintenance_manager

router = APIRouter(prefix="/maintenance", tags=["Fuel & Maintenance"])


@router.post("/fuel-logs", response_model=FuelLogResponse, status_code=status.HTTP_201_CREATED)
def create_fuel_log(
    payload: FuelLogCreateRequest,
    current_user: Annotated[UserResponse, Depends(require_roles("admin", "manager"))],
) -> FuelLogResponse:
    return maintenance_manager.create_fuel_log(payload, created_by=current_user.id)


@router.get("/fuel-logs", response_model=PaginatedResponse[FuelLogResponse])
def list_fuel_logs(
    _: Annotated[UserResponse, Depends(get_current_user)],
    vehicle_id: str | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=15, ge=1, le=1000),
) -> PaginatedResponse[FuelLogResponse]:
    query = FuelLogListQuery(vehicle_id=vehicle_id, date_from=date_from, date_to=date_to)
    all_items = maintenance_manager.list_fuel_logs(query)
    summary = {
        "total_cost": round(sum(l.cost for l in all_items), 2),
        "total_liters": round(sum(l.liters for l in all_items), 2),
        "count": len(all_items),
    }
    return paginate(all_items, page, page_size, summary)


@router.post("/maintenance-logs", response_model=MaintenanceLogResponse, status_code=status.HTTP_201_CREATED)
def create_maintenance_log(
    payload: MaintenanceLogCreateRequest,
    current_user: Annotated[UserResponse, Depends(require_roles("admin", "manager"))],
) -> MaintenanceLogResponse:
    return maintenance_manager.create_maintenance_log(payload, created_by=current_user.id)


@router.get("/maintenance-logs", response_model=PaginatedResponse[MaintenanceLogResponse])
def list_maintenance_logs(
    _: Annotated[UserResponse, Depends(get_current_user)],
    vehicle_id: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    service_type: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=15, ge=1, le=1000),
) -> PaginatedResponse[MaintenanceLogResponse]:
    query = MaintenanceLogListQuery(
        vehicle_id=vehicle_id,
        status=status_filter,
        service_type=service_type,
    )
    all_items = maintenance_manager.list_maintenance_logs(query)
    summary = {
        "total_cost": round(sum(l.cost for l in all_items), 2),
        "pending": sum(1 for l in all_items if l.status in {"scheduled", "in_progress"}),
        "in_progress": sum(1 for l in all_items if l.status == "in_progress"),
        "count": len(all_items),
    }
    return paginate(all_items, page, page_size, summary)


@router.get("/maintenance-logs/{log_id}", response_model=MaintenanceLogResponse)
def get_maintenance_log(
    log_id: str,
    _: Annotated[UserResponse, Depends(get_current_user)],
) -> MaintenanceLogResponse:
    logs = maintenance_manager.list_maintenance_logs(MaintenanceLogListQuery())
    log = next((l for l in logs if l.id == log_id), None)
    if not log:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Maintenance log not found.")
    return log


@router.patch("/maintenance-logs/{log_id}", response_model=MaintenanceLogResponse)
def update_maintenance_log(
    log_id: str,
    payload: MaintenanceLogUpdateRequest,
    _: Annotated[UserResponse, Depends(require_roles("admin", "manager"))],
) -> MaintenanceLogResponse:
    return maintenance_manager.update_maintenance_log(log_id, payload)


@router.get("/due-reminders", response_model=list[MaintenanceDueReminder])
def get_due_reminders(
    _: Annotated[UserResponse, Depends(get_current_user)],
    days_ahead: int = Query(default=30, ge=1, le=365),
) -> list[MaintenanceDueReminder]:
    return maintenance_manager.get_due_reminders(days_ahead)
