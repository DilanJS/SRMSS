from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.routes.auth import get_current_user, require_roles
from app.schemas.auth import MessageResponse, UserResponse
from app.schemas.driver import (
    DriverAvailabilityResponse,
    DriverCreateRequest,
    DriverListQuery,
    DriverResponse,
    DriverUpdateRequest,
)
from app.services.driver_service import driver_manager

router = APIRouter(prefix="/drivers", tags=["Drivers"])


@router.post("", response_model=DriverResponse, status_code=status.HTTP_201_CREATED)
def create_driver(
    payload: DriverCreateRequest,
    current_user: Annotated[UserResponse, Depends(require_roles("admin", "manager"))],
) -> DriverResponse:
    return driver_manager.create_driver(payload, created_by=current_user.id)


@router.get("", response_model=list[DriverResponse])
def list_drivers(
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    status_filter: str | None = Query(default=None, alias="status"),
    active: bool | None = Query(default=None),
    search: str | None = Query(default=None, min_length=1),
) -> list[DriverResponse]:
    del current_user
    query = DriverListQuery(status=status_filter, active=active, search=search)
    return driver_manager.list_drivers(query)


@router.get("/availability", response_model=DriverAvailabilityResponse)
def get_driver_availability(
    _: Annotated[UserResponse, Depends(get_current_user)],
) -> DriverAvailabilityResponse:
    return driver_manager.get_availability()


@router.get("/{driver_id}", response_model=DriverResponse)
def get_driver(
    driver_id: str,
    _: Annotated[UserResponse, Depends(get_current_user)],
) -> DriverResponse:
    return driver_manager.get_driver(driver_id)


@router.patch("/{driver_id}", response_model=DriverResponse)
def update_driver(
    driver_id: str,
    payload: DriverUpdateRequest,
    _: Annotated[UserResponse, Depends(require_roles("admin", "manager"))],
) -> DriverResponse:
    return driver_manager.update_driver(driver_id, payload)


@router.delete("/{driver_id}", response_model=MessageResponse)
def delete_driver(
    driver_id: str,
    _: Annotated[UserResponse, Depends(require_roles("admin"))],
) -> MessageResponse:
    driver_manager.delete_driver(driver_id)
    return MessageResponse(message="Driver deleted successfully.")
