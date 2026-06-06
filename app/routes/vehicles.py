from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.routes.auth import get_current_user, require_roles
from app.schemas.auth import MessageResponse, UserResponse
from app.schemas.common import PaginatedResponse, paginate
from app.schemas.vehicle import (
    VehicleAvailabilityResponse,
    VehicleCreateRequest,
    VehicleListQuery,
    VehicleResponse,
    VehicleUpdateRequest,
)
from app.services.vehicle_service import vehicle_manager

router = APIRouter(prefix="/vehicles", tags=["Vehicles"])


@router.post("", response_model=VehicleResponse, status_code=status.HTTP_201_CREATED)
def create_vehicle(
    payload: VehicleCreateRequest,
    current_user: Annotated[UserResponse, Depends(require_roles("admin", "manager"))],
) -> VehicleResponse:
    return vehicle_manager.create_vehicle(payload, created_by=current_user.id)


@router.get("", response_model=PaginatedResponse[VehicleResponse])
def list_vehicles(
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    status_filter: str | None = Query(default=None, alias="status"),
    active: bool | None = Query(default=None),
    fuel_type: str | None = Query(default=None),
    search: str | None = Query(default=None, min_length=1),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=15, ge=1, le=1000),
) -> PaginatedResponse[VehicleResponse]:
    del current_user
    query = VehicleListQuery(status=status_filter, active=active, fuel_type=fuel_type, search=search)
    all_items = vehicle_manager.list_vehicles(query)
    summary = {
        "available": sum(1 for v in all_items if v.status == "available"),
        "assigned": sum(1 for v in all_items if v.status == "assigned"),
        "maintenance": sum(1 for v in all_items if v.status == "maintenance"),
        "active_fleet": sum(1 for v in all_items if v.active),
    }
    return paginate(all_items, page, page_size, summary)


@router.get("/availability", response_model=VehicleAvailabilityResponse)
def get_vehicle_availability(
    _: Annotated[UserResponse, Depends(get_current_user)],
) -> VehicleAvailabilityResponse:
    return vehicle_manager.get_availability()


@router.get("/{vehicle_id}", response_model=VehicleResponse)
def get_vehicle(
    vehicle_id: str,
    _: Annotated[UserResponse, Depends(get_current_user)],
) -> VehicleResponse:
    return vehicle_manager.get_vehicle(vehicle_id)


@router.patch("/{vehicle_id}", response_model=VehicleResponse)
def update_vehicle(
    vehicle_id: str,
    payload: VehicleUpdateRequest,
    _: Annotated[UserResponse, Depends(require_roles("admin", "manager"))],
) -> VehicleResponse:
    return vehicle_manager.update_vehicle(vehicle_id, payload)


@router.delete("/{vehicle_id}", response_model=MessageResponse)
def delete_vehicle(
    vehicle_id: str,
    _: Annotated[UserResponse, Depends(require_roles("admin"))],
) -> MessageResponse:
    vehicle_manager.delete_vehicle(vehicle_id)
    return MessageResponse(message="Vehicle deleted successfully.")
