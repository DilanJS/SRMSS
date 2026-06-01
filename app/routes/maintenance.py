from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.routes.auth import get_current_user, require_roles
from app.schemas.auth import UserResponse
from app.schemas.maintenance import (
    FuelLogCreateRequest,
    FuelLogListQuery,
    FuelLogResponse,
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


@router.get("/fuel-logs", response_model=list[FuelLogResponse])
def list_fuel_logs(
    _: Annotated[UserResponse, Depends(get_current_user)],
    vehicle_id: str | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
) -> list[FuelLogResponse]:
    query = FuelLogListQuery(vehicle_id=vehicle_id, date_from=date_from, date_to=date_to)
    return maintenance_manager.list_fuel_logs(query)


@router.post("/maintenance-logs", response_model=MaintenanceLogResponse, status_code=status.HTTP_201_CREATED)
def create_maintenance_log(
    payload: MaintenanceLogCreateRequest,
    current_user: Annotated[UserResponse, Depends(require_roles("admin", "manager"))],
) -> MaintenanceLogResponse:
    return maintenance_manager.create_maintenance_log(payload, created_by=current_user.id)


@router.get("/maintenance-logs", response_model=list[MaintenanceLogResponse])
def list_maintenance_logs(
    _: Annotated[UserResponse, Depends(get_current_user)],
    vehicle_id: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    service_type: str | None = Query(default=None),
) -> list[MaintenanceLogResponse]:
    query = MaintenanceLogListQuery(
        vehicle_id=vehicle_id,
        status=status_filter,
        service_type=service_type,
    )
    return maintenance_manager.list_maintenance_logs(query)


@router.patch("/maintenance-logs/{log_id}", response_model=MaintenanceLogResponse)
def update_maintenance_log(
    log_id: str,
    payload: MaintenanceLogUpdateRequest,
    _: Annotated[UserResponse, Depends(require_roles("admin", "manager"))],
) -> MaintenanceLogResponse:
    return maintenance_manager.update_maintenance_log(log_id, payload)
