from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.routes.auth import get_current_user, require_roles
from app.schemas.auth import MessageResponse, UserResponse
from app.schemas.route import (
    RouteCreateRequest,
    RouteListQuery,
    RouteMapResponse,
    RouteResponse,
    RouteUpdateRequest,
)
from app.services.route_service import route_manager

router = APIRouter(prefix="/routes", tags=["Routes"])


@router.post("", response_model=RouteResponse, status_code=status.HTTP_201_CREATED)
def create_route(
    payload: RouteCreateRequest,
    current_user: Annotated[UserResponse, Depends(require_roles("admin", "manager"))],
) -> RouteResponse:
    return route_manager.create_route(payload, created_by=current_user.id)


@router.get("", response_model=list[RouteResponse])
def list_routes(
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    service_type: str | None = Query(default=None),
    active: bool | None = Query(default=None),
    search: str | None = Query(default=None, min_length=1),
) -> list[RouteResponse]:
    del current_user
    query = RouteListQuery(service_type=service_type, active=active, search=search)
    return route_manager.list_routes(query)


@router.get("/{route_id}", response_model=RouteResponse)
def get_route(
    route_id: str,
    _: Annotated[UserResponse, Depends(get_current_user)],
) -> RouteResponse:
    return route_manager.get_route(route_id)


@router.get("/{route_id}/map", response_model=RouteMapResponse)
def get_route_map(
    route_id: str,
    _: Annotated[UserResponse, Depends(get_current_user)],
) -> RouteMapResponse:
    return route_manager.get_route_map(route_id)


@router.patch("/{route_id}", response_model=RouteResponse)
def update_route(
    route_id: str,
    payload: RouteUpdateRequest,
    _: Annotated[UserResponse, Depends(require_roles("admin", "manager"))],
) -> RouteResponse:
    return route_manager.update_route(route_id, payload)


@router.delete("/{route_id}", response_model=MessageResponse)
def delete_route(
    route_id: str,
    _: Annotated[UserResponse, Depends(require_roles("admin"))],
) -> MessageResponse:
    route_manager.delete_route(route_id)
    return MessageResponse(message="Route deleted successfully.")
