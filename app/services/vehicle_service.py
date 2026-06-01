import json
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status

from app.config import get_settings
from app.firebase_config import get_firebase_db
from app.schemas.vehicle import (
    VehicleAvailabilityResponse,
    VehicleCreateRequest,
    VehicleListQuery,
    VehicleResponse,
    VehicleUpdateRequest,
)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class LocalVehicleService:
    def __init__(self, storage_dir: Path) -> None:
        self._storage_dir = storage_dir
        self._storage_dir.mkdir(parents=True, exist_ok=True)
        self._vehicles_path = self._storage_dir / "vehicles.json"
        self._lock = Lock()
        if not self._vehicles_path.exists():
            self._vehicles_path.write_text("{}", encoding="utf-8")

    def create_vehicle(self, payload: VehicleCreateRequest, created_by: str) -> VehicleResponse:
        with self._lock:
            vehicles = self._read_vehicles()
            self._ensure_unique_identifiers(vehicles, payload.registration_no, payload.fleet_number)
            vehicle_id = str(uuid4())
            now = _utc_now()
            vehicles[vehicle_id] = {
                **payload.model_dump(),
                "created_at": now.isoformat(),
                "updated_at": now.isoformat(),
                "created_by": created_by,
            }
            self._write_vehicles(vehicles)
            return self._to_response(vehicle_id, vehicles[vehicle_id])

    def list_vehicles(self, query: VehicleListQuery) -> list[VehicleResponse]:
        with self._lock:
            vehicles = self._read_vehicles()
            items = [self._to_response(vehicle_id, payload) for vehicle_id, payload in vehicles.items()]
        return self._apply_filters(items, query)

    def get_vehicle(self, vehicle_id: str) -> VehicleResponse:
        with self._lock:
            vehicles = self._read_vehicles()
            payload = vehicles.get(vehicle_id)
            if not payload:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found.")
            return self._to_response(vehicle_id, payload)

    def update_vehicle(self, vehicle_id: str, payload: VehicleUpdateRequest) -> VehicleResponse:
        with self._lock:
            vehicles = self._read_vehicles()
            existing = vehicles.get(vehicle_id)
            if not existing:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found.")

            updates = payload.model_dump(exclude_unset=True)
            registration_no = updates.get("registration_no", existing["registration_no"])
            fleet_number = updates.get("fleet_number", existing["fleet_number"])
            if (
                registration_no != existing["registration_no"]
                or fleet_number != existing["fleet_number"]
            ):
                self._ensure_unique_identifiers(
                    vehicles,
                    registration_no,
                    fleet_number,
                    exclude_vehicle_id=vehicle_id,
                )
            updates["updated_at"] = _utc_now().isoformat()
            existing.update(updates)
            self._write_vehicles(vehicles)
            return self._to_response(vehicle_id, existing)

    def delete_vehicle(self, vehicle_id: str) -> None:
        with self._lock:
            vehicles = self._read_vehicles()
            if vehicle_id not in vehicles:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found.")
            del vehicles[vehicle_id]
            self._write_vehicles(vehicles)

    def get_availability(self) -> VehicleAvailabilityResponse:
        vehicles = self.list_vehicles(VehicleListQuery())
        return VehicleAvailabilityResponse(
            total=len(vehicles),
            available=sum(1 for vehicle in vehicles if vehicle.status == "available"),
            assigned=sum(1 for vehicle in vehicles if vehicle.status == "assigned"),
            in_service=sum(1 for vehicle in vehicles if vehicle.status == "in_service"),
            maintenance=sum(1 for vehicle in vehicles if vehicle.status == "maintenance"),
            inactive=sum(1 for vehicle in vehicles if vehicle.status == "inactive"),
        )

    def _read_vehicles(self) -> dict[str, Any]:
        raw = self._vehicles_path.read_text(encoding="utf-8").strip()
        return json.loads(raw) if raw else {}

    def _write_vehicles(self, vehicles: dict[str, Any]) -> None:
        self._vehicles_path.write_text(json.dumps(vehicles, indent=2), encoding="utf-8")

    def _ensure_unique_identifiers(
        self,
        vehicles: dict[str, Any],
        registration_no: str,
        fleet_number: str,
        exclude_vehicle_id: str | None = None,
    ) -> None:
        for existing_id, payload in vehicles.items():
            if exclude_vehicle_id and existing_id == exclude_vehicle_id:
                continue
            if payload["registration_no"] == registration_no:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="A vehicle with this registration number already exists.",
                )
            if payload["fleet_number"] == fleet_number:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="A vehicle with this fleet number already exists.",
                )

    def _to_response(self, vehicle_id: str, payload: dict[str, Any]) -> VehicleResponse:
        return VehicleResponse(
            id=vehicle_id,
            registration_no=payload["registration_no"],
            fleet_number=payload["fleet_number"],
            model=payload["model"],
            manufacturer=payload["manufacturer"],
            capacity=payload["capacity"],
            mileage_km=payload["mileage_km"],
            fuel_type=payload["fuel_type"],
            status=payload["status"],
            active=payload["active"],
            assigned_route_id=payload.get("assigned_route_id"),
            assigned_driver_id=payload.get("assigned_driver_id"),
            notes=payload.get("notes"),
            created_at=datetime.fromisoformat(payload["created_at"]),
            updated_at=datetime.fromisoformat(payload["updated_at"]),
            created_by=payload["created_by"],
        )

    def _apply_filters(
        self, vehicles: list[VehicleResponse], query: VehicleListQuery
    ) -> list[VehicleResponse]:
        result = vehicles
        if query.status is not None:
            result = [vehicle for vehicle in result if vehicle.status == query.status]
        if query.active is not None:
            result = [vehicle for vehicle in result if vehicle.active == query.active]
        if query.fuel_type is not None:
            result = [vehicle for vehicle in result if vehicle.fuel_type == query.fuel_type]
        if query.search:
            needle = query.search.strip().lower()
            result = [
                vehicle
                for vehicle in result
                if needle in vehicle.registration_no.lower()
                or needle in vehicle.fleet_number.lower()
                or needle in vehicle.model.lower()
                or needle in vehicle.manufacturer.lower()
            ]
        result.sort(key=lambda vehicle: vehicle.created_at)
        return result


class FirebaseVehicleService:
    def __init__(self) -> None:
        self.db = get_firebase_db()

    def create_vehicle(self, payload: VehicleCreateRequest, created_by: str) -> VehicleResponse:
        vehicles = self.db.child("vehicles").get().val() or {}
        self._ensure_unique_identifiers(vehicles, payload.registration_no, payload.fleet_number)
        vehicle_id = str(uuid4())
        now = _utc_now()
        vehicle_payload = {
            **payload.model_dump(),
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
            "created_by": created_by,
        }
        self.db.child("vehicles").child(vehicle_id).set(vehicle_payload)
        return self._to_response(vehicle_id, vehicle_payload)

    def list_vehicles(self, query: VehicleListQuery) -> list[VehicleResponse]:
        vehicles = self.db.child("vehicles").get().val() or {}
        items = [self._to_response(vehicle_id, payload) for vehicle_id, payload in vehicles.items()]
        return LocalVehicleService._apply_filters(self, items, query)

    def get_vehicle(self, vehicle_id: str) -> VehicleResponse:
        payload = self.db.child("vehicles").child(vehicle_id).get().val()
        if not payload:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found.")
        return self._to_response(vehicle_id, payload)

    def update_vehicle(self, vehicle_id: str, payload: VehicleUpdateRequest) -> VehicleResponse:
        vehicles = self.db.child("vehicles").get().val() or {}
        existing = vehicles.get(vehicle_id)
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found.")

        updates = payload.model_dump(exclude_unset=True)
        registration_no = updates.get("registration_no", existing["registration_no"])
        fleet_number = updates.get("fleet_number", existing["fleet_number"])
        if (
            registration_no != existing["registration_no"]
            or fleet_number != existing["fleet_number"]
        ):
            self._ensure_unique_identifiers(
                vehicles,
                registration_no,
                fleet_number,
                exclude_vehicle_id=vehicle_id,
            )
        updates["updated_at"] = _utc_now().isoformat()
        self.db.child("vehicles").child(vehicle_id).update(updates)
        existing.update(updates)
        return self._to_response(vehicle_id, existing)

    def delete_vehicle(self, vehicle_id: str) -> None:
        payload = self.db.child("vehicles").child(vehicle_id).get().val()
        if not payload:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found.")
        self.db.child("vehicles").child(vehicle_id).remove()

    def get_availability(self) -> VehicleAvailabilityResponse:
        vehicles = self.list_vehicles(VehicleListQuery())
        return VehicleAvailabilityResponse(
            total=len(vehicles),
            available=sum(1 for vehicle in vehicles if vehicle.status == "available"),
            assigned=sum(1 for vehicle in vehicles if vehicle.status == "assigned"),
            in_service=sum(1 for vehicle in vehicles if vehicle.status == "in_service"),
            maintenance=sum(1 for vehicle in vehicles if vehicle.status == "maintenance"),
            inactive=sum(1 for vehicle in vehicles if vehicle.status == "inactive"),
        )

    def _ensure_unique_identifiers(
        self,
        vehicles: dict[str, Any],
        registration_no: str,
        fleet_number: str,
        exclude_vehicle_id: str | None = None,
    ) -> None:
        for existing_id, payload in vehicles.items():
            if exclude_vehicle_id and existing_id == exclude_vehicle_id:
                continue
            if payload.get("registration_no") == registration_no:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="A vehicle with this registration number already exists.",
                )
            if payload.get("fleet_number") == fleet_number:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="A vehicle with this fleet number already exists.",
                )

    def _to_response(self, vehicle_id: str, payload: dict[str, Any]) -> VehicleResponse:
        return VehicleResponse(
            id=vehicle_id,
            registration_no=payload["registration_no"],
            fleet_number=payload["fleet_number"],
            model=payload["model"],
            manufacturer=payload["manufacturer"],
            capacity=payload["capacity"],
            mileage_km=payload["mileage_km"],
            fuel_type=payload["fuel_type"],
            status=payload["status"],
            active=payload["active"],
            assigned_route_id=payload.get("assigned_route_id"),
            assigned_driver_id=payload.get("assigned_driver_id"),
            notes=payload.get("notes"),
            created_at=datetime.fromisoformat(payload["created_at"]),
            updated_at=datetime.fromisoformat(payload["updated_at"]),
            created_by=payload["created_by"],
        )


class VehicleManager:
    def __init__(self) -> None:
        settings = get_settings()
        if settings.auth_provider == "firebase":
            self.provider = FirebaseVehicleService()
        else:
            self.provider = LocalVehicleService(settings.storage_dir)

    def create_vehicle(self, payload: VehicleCreateRequest, created_by: str) -> VehicleResponse:
        return self.provider.create_vehicle(payload, created_by)

    def list_vehicles(self, query: VehicleListQuery) -> list[VehicleResponse]:
        return self.provider.list_vehicles(query)

    def get_vehicle(self, vehicle_id: str) -> VehicleResponse:
        return self.provider.get_vehicle(vehicle_id)

    def update_vehicle(self, vehicle_id: str, payload: VehicleUpdateRequest) -> VehicleResponse:
        return self.provider.update_vehicle(vehicle_id, payload)

    def delete_vehicle(self, vehicle_id: str) -> None:
        self.provider.delete_vehicle(vehicle_id)

    def get_availability(self) -> VehicleAvailabilityResponse:
        return self.provider.get_availability()


vehicle_manager = VehicleManager()
