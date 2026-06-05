from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.routes.auth import get_current_user, require_roles
from app.schemas.auth import MessageResponse, UserResponse
from app.schemas.schedule import (
    EmergencyScheduleUpdateRequest,
    RecurringScheduleRequest,
    RecurringScheduleResponse,
    ScheduleConflictResponse,
    ScheduleCreateRequest,
    ScheduleListQuery,
    ScheduleResponse,
    ScheduleUpdateRequest,
)
from app.services.schedule_service import schedule_manager

router = APIRouter(prefix="/schedules", tags=["Schedules"])


@router.post("", response_model=ScheduleResponse, status_code=status.HTTP_201_CREATED)
def create_schedule(
    payload: ScheduleCreateRequest,
    current_user: Annotated[UserResponse, Depends(require_roles("admin", "manager"))],
) -> ScheduleResponse:
    return schedule_manager.create_schedule(payload, created_by=current_user.id)


@router.post("/recurring", response_model=RecurringScheduleResponse, status_code=status.HTTP_201_CREATED)
def create_recurring_schedules(
    payload: RecurringScheduleRequest,
    current_user: Annotated[UserResponse, Depends(require_roles("admin", "manager"))],
) -> RecurringScheduleResponse:
    return schedule_manager.create_recurring_schedules(payload, created_by=current_user.id)


@router.post("/conflicts", response_model=ScheduleConflictResponse)
def check_schedule_conflicts(
    payload: ScheduleCreateRequest,
    _: Annotated[UserResponse, Depends(require_roles("admin", "manager"))],
) -> ScheduleConflictResponse:
    return schedule_manager.detect_conflicts(payload)


@router.get("", response_model=list[ScheduleResponse])
def list_schedules(
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    route_id: str | None = Query(default=None),
    vehicle_id: str | None = Query(default=None),
    driver_id: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
) -> list[ScheduleResponse]:
    del current_user
    query = ScheduleListQuery(
        route_id=route_id,
        vehicle_id=vehicle_id,
        driver_id=driver_id,
        status=status_filter,
        date_from=date_from,
        date_to=date_to,
    )
    return schedule_manager.list_schedules(query)


@router.get("/{schedule_id}", response_model=ScheduleResponse)
def get_schedule(
    schedule_id: str,
    _: Annotated[UserResponse, Depends(get_current_user)],
) -> ScheduleResponse:
    return schedule_manager.get_schedule(schedule_id)


@router.patch("/{schedule_id}", response_model=ScheduleResponse)
def update_schedule(
    schedule_id: str,
    payload: ScheduleUpdateRequest,
    _: Annotated[UserResponse, Depends(require_roles("admin", "manager"))],
) -> ScheduleResponse:
    return schedule_manager.update_schedule(schedule_id, payload)


@router.patch("/{schedule_id}/emergency", response_model=ScheduleResponse)
def emergency_update_schedule(
    schedule_id: str,
    payload: EmergencyScheduleUpdateRequest,
    _: Annotated[UserResponse, Depends(require_roles("admin", "manager"))],
) -> ScheduleResponse:
    return schedule_manager.emergency_update_schedule(schedule_id, payload)


@router.delete("/{schedule_id}", response_model=MessageResponse)
def delete_schedule(
    schedule_id: str,
    _: Annotated[UserResponse, Depends(require_roles("admin"))],
) -> MessageResponse:
    schedule_manager.delete_schedule(schedule_id)
    return MessageResponse(message="Schedule deleted successfully.")
