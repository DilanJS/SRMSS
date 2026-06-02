from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.routes.auth import get_current_user
from app.schemas.auth import UserResponse
from app.schemas.tracking import LocationUpdate, VehicleLocationResponse
from app.services.tracking_service import tracking_manager

router = APIRouter(prefix="/tracking", tags=["Tracking"])


@router.post("/{vehicle_id}", response_model=VehicleLocationResponse, status_code=status.HTTP_200_OK)
def update_vehicle_location(
    vehicle_id: str,
    payload: LocationUpdate,
    current_user: Annotated[UserResponse, Depends(get_current_user)],
) -> VehicleLocationResponse:
    return tracking_manager.update_location(vehicle_id, payload, updated_by=current_user.id)


@router.get("", response_model=list[VehicleLocationResponse])
def get_all_locations(
    _: Annotated[UserResponse, Depends(get_current_user)],
) -> list[VehicleLocationResponse]:
    return tracking_manager.get_all_locations()
