import json
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status

from app.config import get_settings
from app.firebase_config import get_firebase_db
from app.schemas.driver import DriverUpdateRequest
from app.schemas.route import (
    RouteCreateRequest,
    RouteListQuery,
    RouteMapResponse,
    RouteResponse,
    RouteUpdateRequest,
)
from app.schemas.vehicle import VehicleUpdateRequest


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class LocalRouteService:
    def __init__(self, storage_dir: Path) -> None:
        self._storage_dir = storage_dir
        self._storage_dir.mkdir(parents=True, exist_ok=True)
        self._routes_path = self._storage_dir / "routes.json"
        self._lock = Lock()
        if not self._routes_path.exists():
            self._routes_path.write_text("{}", encoding="utf-8")

    def create_route(self, payload: RouteCreateRequest, created_by: str) -> RouteResponse:
        with self._lock:
            routes = self._read_routes()
            self._ensure_unique_route_code(routes, payload.route_code)
            route_id = str(uuid4())
            now = _utc_now()
            routes[route_id] = {
                "route_code": payload.route_code,
                "route_name": payload.route_name,
                "start_point": payload.start_point,
                "start_latitude": payload.start_latitude,
                "start_longitude": payload.start_longitude,
                "end_point": payload.end_point,
                "end_latitude": payload.end_latitude,
                "end_longitude": payload.end_longitude,
                "distance_km": payload.distance_km,
                "estimated_duration_minutes": payload.estimated_duration_minutes,
                "service_type": payload.service_type,
                "active": payload.active,
                "stops": [stop.model_dump() for stop in payload.stops],
                "path_points": [list(point) for point in payload.path_points],
                "assigned_vehicle_id": None,
                "assigned_driver_id": None,
                "created_at": now.isoformat(),
                "updated_at": now.isoformat(),
                "created_by": created_by,
            }
            self._write_routes(routes)
            return self._to_response(route_id, routes[route_id])

    def list_routes(self, query: RouteListQuery) -> list[RouteResponse]:
        with self._lock:
            routes = self._read_routes()
            items = [self._to_response(route_id, payload) for route_id, payload in routes.items()]
        return self._apply_filters(items, query)

    def get_route(self, route_id: str) -> RouteResponse:
        with self._lock:
            routes = self._read_routes()
            payload = routes.get(route_id)
            if not payload:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found.")
            return self._to_response(route_id, payload)

    def update_route(self, route_id: str, payload: RouteUpdateRequest) -> RouteResponse:
        with self._lock:
            routes = self._read_routes()
            existing = routes.get(route_id)
            if not existing:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found.")

            updates = payload.model_dump(exclude_unset=True)
            if "route_code" in updates and updates["route_code"] != existing["route_code"]:
                self._ensure_unique_route_code(routes, updates["route_code"], exclude_route_id=route_id)
            if "path_points" in updates and updates["path_points"] is not None:
                updates["path_points"] = [list(point) for point in updates["path_points"]]
            updates["updated_at"] = _utc_now().isoformat()

            existing.update(updates)
            self._write_routes(routes)
            return self._to_response(route_id, existing)

    def delete_route(self, route_id: str) -> None:
        with self._lock:
            routes = self._read_routes()
            if route_id not in routes:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found.")
            del routes[route_id]
            self._write_routes(routes)

    def get_route_map(self, route_id: str) -> RouteMapResponse:
        route = self.get_route(route_id)
        return RouteMapResponse(
            id=route.id,
            route_code=route.route_code,
            route_name=route.route_name,
            start_point=route.start_point,
            start_latitude=route.start_latitude,
            start_longitude=route.start_longitude,
            end_point=route.end_point,
            end_latitude=route.end_latitude,
            end_longitude=route.end_longitude,
            stops=route.stops,
            path_points=route.path_points,
        )

    def _read_routes(self) -> dict[str, Any]:
        raw = self._routes_path.read_text(encoding="utf-8").strip()
        return json.loads(raw) if raw else {}

    def _write_routes(self, routes: dict[str, Any]) -> None:
        self._routes_path.write_text(json.dumps(routes, indent=2), encoding="utf-8")

    def _ensure_unique_route_code(
        self, routes: dict[str, Any], route_code: str, exclude_route_id: str | None = None
    ) -> None:
        for existing_id, payload in routes.items():
            if exclude_route_id and existing_id == exclude_route_id:
                continue
            if payload["route_code"] == route_code:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="A route with this code already exists.",
                )

    def assign_route(self, route_id: str, vehicle_id: str, driver_id: str) -> RouteResponse:
        from app.services.driver_service import driver_manager
        from app.services.vehicle_service import vehicle_manager

        vehicle = vehicle_manager.get_vehicle(vehicle_id)
        driver = driver_manager.get_driver(driver_id)

        with self._lock:
            routes = self._read_routes()
            existing = routes.get(route_id)
            if not existing:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found.")

            if vehicle.status != "available" and vehicle.assigned_route_id != route_id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Vehicle '{vehicle.fleet_number}' is not available (status: {vehicle.status}).",
                )
            if driver.status != "available" and driver.assigned_route_id != route_id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Driver '{driver.full_name}' is not available (status: {driver.status}).",
                )

            old_vehicle_id = existing.get("assigned_vehicle_id")
            old_driver_id = existing.get("assigned_driver_id")
            existing["assigned_vehicle_id"] = vehicle_id
            existing["assigned_driver_id"] = driver_id
            existing["updated_at"] = _utc_now().isoformat()
            self._write_routes(routes)

        if old_vehicle_id and old_vehicle_id != vehicle_id:
            try:
                old_v = vehicle_manager.get_vehicle(old_vehicle_id)
                if old_v.assigned_route_id == route_id:
                    vehicle_manager.update_vehicle(
                        old_vehicle_id,
                        VehicleUpdateRequest(status="available", assigned_route_id=None, assigned_driver_id=None),
                    )
            except HTTPException:
                pass

        if old_driver_id and old_driver_id != driver_id:
            try:
                old_d = driver_manager.get_driver(old_driver_id)
                if old_d.assigned_route_id == route_id:
                    driver_manager.update_driver(
                        old_driver_id,
                        DriverUpdateRequest(status="available", assigned_route_id=None, assigned_vehicle_id=None),
                    )
            except HTTPException:
                pass

        vehicle_manager.update_vehicle(
            vehicle_id,
            VehicleUpdateRequest(status="assigned", assigned_route_id=route_id, assigned_driver_id=driver_id),
        )
        driver_manager.update_driver(
            driver_id,
            DriverUpdateRequest(status="assigned", assigned_route_id=route_id, assigned_vehicle_id=vehicle_id),
        )
        return self.get_route(route_id)

    def unassign_route(self, route_id: str) -> RouteResponse:
        from app.services.driver_service import driver_manager
        from app.services.vehicle_service import vehicle_manager

        with self._lock:
            routes = self._read_routes()
            existing = routes.get(route_id)
            if not existing:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found.")

            old_vehicle_id = existing.get("assigned_vehicle_id")
            old_driver_id = existing.get("assigned_driver_id")
            if not old_vehicle_id and not old_driver_id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Route has no current assignment to remove.",
                )

            existing["assigned_vehicle_id"] = None
            existing["assigned_driver_id"] = None
            existing["updated_at"] = _utc_now().isoformat()
            self._write_routes(routes)

        if old_vehicle_id:
            try:
                old_v = vehicle_manager.get_vehicle(old_vehicle_id)
                if old_v.assigned_route_id == route_id:
                    vehicle_manager.update_vehicle(
                        old_vehicle_id,
                        VehicleUpdateRequest(status="available", assigned_route_id=None, assigned_driver_id=None),
                    )
            except HTTPException:
                pass

        if old_driver_id:
            try:
                old_d = driver_manager.get_driver(old_driver_id)
                if old_d.assigned_route_id == route_id:
                    driver_manager.update_driver(
                        old_driver_id,
                        DriverUpdateRequest(status="available", assigned_route_id=None, assigned_vehicle_id=None),
                    )
            except HTTPException:
                pass

        return self.get_route(route_id)

    def _to_response(self, route_id: str, payload: dict[str, Any]) -> RouteResponse:
        return RouteResponse(
            id=route_id,
            route_code=payload["route_code"],
            route_name=payload["route_name"],
            start_point=payload["start_point"],
            start_latitude=payload.get("start_latitude"),
            start_longitude=payload.get("start_longitude"),
            end_point=payload["end_point"],
            end_latitude=payload.get("end_latitude"),
            end_longitude=payload.get("end_longitude"),
            distance_km=payload["distance_km"],
            estimated_duration_minutes=payload["estimated_duration_minutes"],
            service_type=payload["service_type"],
            active=payload["active"],
            stops=payload["stops"],
            path_points=[tuple(point) for point in payload.get("path_points", [])],
            assigned_vehicle_id=payload.get("assigned_vehicle_id"),
            assigned_driver_id=payload.get("assigned_driver_id"),
            created_at=datetime.fromisoformat(payload["created_at"]),
            updated_at=datetime.fromisoformat(payload["updated_at"]),
            created_by=payload["created_by"],
        )

    def _apply_filters(self, routes: list[RouteResponse], query: RouteListQuery) -> list[RouteResponse]:
        result = routes
        if query.service_type is not None:
            result = [route for route in result if route.service_type == query.service_type]
        if query.active is not None:
            result = [route for route in result if route.active == query.active]
        if query.search:
            needle = query.search.strip().lower()
            result = [
                route
                for route in result
                if needle in route.route_code.lower()
                or needle in route.route_name.lower()
                or needle in route.start_point.lower()
                or needle in route.end_point.lower()
            ]
        result.sort(key=lambda route: route.created_at)
        return result


class FirebaseRouteService:
    def __init__(self) -> None:
        self.db = get_firebase_db()

    def create_route(self, payload: RouteCreateRequest, created_by: str) -> RouteResponse:
        routes = self.db.child("routes").get().val() or {}
        self._ensure_unique_route_code(routes, payload.route_code)
        route_id = str(uuid4())
        now = _utc_now()
        route_payload = {
            "route_code": payload.route_code,
            "route_name": payload.route_name,
            "start_point": payload.start_point,
            "start_latitude": payload.start_latitude,
            "start_longitude": payload.start_longitude,
            "end_point": payload.end_point,
            "end_latitude": payload.end_latitude,
            "end_longitude": payload.end_longitude,
            "distance_km": payload.distance_km,
            "estimated_duration_minutes": payload.estimated_duration_minutes,
            "service_type": payload.service_type,
            "active": payload.active,
            "stops": [stop.model_dump() for stop in payload.stops],
            "path_points": [list(point) for point in payload.path_points],
            "assigned_vehicle_id": None,
            "assigned_driver_id": None,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
            "created_by": created_by,
        }
        self.db.child("routes").child(route_id).set(route_payload)
        return self._to_response(route_id, route_payload)

    def list_routes(self, query: RouteListQuery) -> list[RouteResponse]:
        routes = self.db.child("routes").get().val() or {}
        items = [self._to_response(route_id, payload) for route_id, payload in routes.items()]
        return LocalRouteService._apply_filters(self, items, query)

    def get_route(self, route_id: str) -> RouteResponse:
        payload = self.db.child("routes").child(route_id).get().val()
        if not payload:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found.")
        return self._to_response(route_id, payload)

    def update_route(self, route_id: str, payload: RouteUpdateRequest) -> RouteResponse:
        routes = self.db.child("routes").get().val() or {}
        existing = routes.get(route_id)
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found.")

        updates = payload.model_dump(exclude_unset=True)
        if "route_code" in updates and updates["route_code"] != existing["route_code"]:
            self._ensure_unique_route_code(routes, updates["route_code"], exclude_route_id=route_id)
        if "path_points" in updates and updates["path_points"] is not None:
            updates["path_points"] = [list(point) for point in updates["path_points"]]
        updates["updated_at"] = _utc_now().isoformat()
        self.db.child("routes").child(route_id).update(updates)
        existing.update(updates)
        return self._to_response(route_id, existing)

    def delete_route(self, route_id: str) -> None:
        payload = self.db.child("routes").child(route_id).get().val()
        if not payload:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found.")
        self.db.child("routes").child(route_id).remove()

    def get_route_map(self, route_id: str) -> RouteMapResponse:
        route = self.get_route(route_id)
        return RouteMapResponse(
            id=route.id,
            route_code=route.route_code,
            route_name=route.route_name,
            start_point=route.start_point,
            start_latitude=route.start_latitude,
            start_longitude=route.start_longitude,
            end_point=route.end_point,
            end_latitude=route.end_latitude,
            end_longitude=route.end_longitude,
            stops=route.stops,
            path_points=route.path_points,
        )

    def _ensure_unique_route_code(
        self, routes: dict[str, Any], route_code: str, exclude_route_id: str | None = None
    ) -> None:
        for existing_id, payload in routes.items():
            if exclude_route_id and existing_id == exclude_route_id:
                continue
            if payload.get("route_code") == route_code:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="A route with this code already exists.",
                )

    def assign_route(self, route_id: str, vehicle_id: str, driver_id: str) -> RouteResponse:
        from app.services.driver_service import driver_manager
        from app.services.vehicle_service import vehicle_manager

        vehicle = vehicle_manager.get_vehicle(vehicle_id)
        driver = driver_manager.get_driver(driver_id)

        existing = self.db.child("routes").child(route_id).get().val()
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found.")

        if vehicle.status != "available" and vehicle.assigned_route_id != route_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Vehicle '{vehicle.fleet_number}' is not available (status: {vehicle.status}).",
            )
        if driver.status != "available" and driver.assigned_route_id != route_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Driver '{driver.full_name}' is not available (status: {driver.status}).",
            )

        old_vehicle_id = existing.get("assigned_vehicle_id")
        old_driver_id = existing.get("assigned_driver_id")

        self.db.child("routes").child(route_id).update({
            "assigned_vehicle_id": vehicle_id,
            "assigned_driver_id": driver_id,
            "updated_at": _utc_now().isoformat(),
        })

        if old_vehicle_id and old_vehicle_id != vehicle_id:
            try:
                old_v = vehicle_manager.get_vehicle(old_vehicle_id)
                if old_v.assigned_route_id == route_id:
                    vehicle_manager.update_vehicle(
                        old_vehicle_id,
                        VehicleUpdateRequest(status="available", assigned_route_id=None, assigned_driver_id=None),
                    )
            except HTTPException:
                pass

        if old_driver_id and old_driver_id != driver_id:
            try:
                old_d = driver_manager.get_driver(old_driver_id)
                if old_d.assigned_route_id == route_id:
                    driver_manager.update_driver(
                        old_driver_id,
                        DriverUpdateRequest(status="available", assigned_route_id=None, assigned_vehicle_id=None),
                    )
            except HTTPException:
                pass

        vehicle_manager.update_vehicle(
            vehicle_id,
            VehicleUpdateRequest(status="assigned", assigned_route_id=route_id, assigned_driver_id=driver_id),
        )
        driver_manager.update_driver(
            driver_id,
            DriverUpdateRequest(status="assigned", assigned_route_id=route_id, assigned_vehicle_id=vehicle_id),
        )
        return self.get_route(route_id)

    def unassign_route(self, route_id: str) -> RouteResponse:
        from app.services.driver_service import driver_manager
        from app.services.vehicle_service import vehicle_manager

        existing = self.db.child("routes").child(route_id).get().val()
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found.")

        old_vehicle_id = existing.get("assigned_vehicle_id")
        old_driver_id = existing.get("assigned_driver_id")
        if not old_vehicle_id and not old_driver_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Route has no current assignment to remove.",
            )

        self.db.child("routes").child(route_id).update({
            "assigned_vehicle_id": None,
            "assigned_driver_id": None,
            "updated_at": _utc_now().isoformat(),
        })

        if old_vehicle_id:
            try:
                old_v = vehicle_manager.get_vehicle(old_vehicle_id)
                if old_v.assigned_route_id == route_id:
                    vehicle_manager.update_vehicle(
                        old_vehicle_id,
                        VehicleUpdateRequest(status="available", assigned_route_id=None, assigned_driver_id=None),
                    )
            except HTTPException:
                pass

        if old_driver_id:
            try:
                old_d = driver_manager.get_driver(old_driver_id)
                if old_d.assigned_route_id == route_id:
                    driver_manager.update_driver(
                        old_driver_id,
                        DriverUpdateRequest(status="available", assigned_route_id=None, assigned_vehicle_id=None),
                    )
            except HTTPException:
                pass

        return self.get_route(route_id)

    def _to_response(self, route_id: str, payload: dict[str, Any]) -> RouteResponse:
        return RouteResponse(
            id=route_id,
            route_code=payload["route_code"],
            route_name=payload["route_name"],
            start_point=payload["start_point"],
            start_latitude=payload.get("start_latitude"),
            start_longitude=payload.get("start_longitude"),
            end_point=payload["end_point"],
            end_latitude=payload.get("end_latitude"),
            end_longitude=payload.get("end_longitude"),
            distance_km=payload["distance_km"],
            estimated_duration_minutes=payload["estimated_duration_minutes"],
            service_type=payload["service_type"],
            active=payload["active"],
            stops=payload.get("stops", []),
            path_points=[tuple(point) for point in payload.get("path_points", [])],
            assigned_vehicle_id=payload.get("assigned_vehicle_id"),
            assigned_driver_id=payload.get("assigned_driver_id"),
            created_at=datetime.fromisoformat(payload["created_at"]),
            updated_at=datetime.fromisoformat(payload["updated_at"]),
            created_by=payload["created_by"],
        )


class RouteManager:
    def __init__(self) -> None:
        settings = get_settings()
        if settings.auth_provider == "firebase":
            self.provider = FirebaseRouteService()
        else:
            self.provider = LocalRouteService(settings.storage_dir)

    def create_route(self, payload: RouteCreateRequest, created_by: str) -> RouteResponse:
        return self.provider.create_route(payload, created_by)

    def list_routes(self, query: RouteListQuery) -> list[RouteResponse]:
        return self.provider.list_routes(query)

    def get_route(self, route_id: str) -> RouteResponse:
        return self.provider.get_route(route_id)

    def update_route(self, route_id: str, payload: RouteUpdateRequest) -> RouteResponse:
        return self.provider.update_route(route_id, payload)

    def delete_route(self, route_id: str) -> None:
        self.provider.delete_route(route_id)

    def assign_route(self, route_id: str, vehicle_id: str, driver_id: str) -> RouteResponse:
        return self.provider.assign_route(route_id, vehicle_id, driver_id)

    def unassign_route(self, route_id: str) -> RouteResponse:
        return self.provider.unassign_route(route_id)

    def get_route_map(self, route_id: str) -> RouteMapResponse:
        return self.provider.get_route_map(route_id)


route_manager = RouteManager()
