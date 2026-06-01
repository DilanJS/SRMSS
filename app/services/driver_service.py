import json
from datetime import date, datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status

from app.config import get_settings
from app.firebase_config import get_firebase_db
from app.schemas.driver import (
    DriverAvailabilityResponse,
    DriverCreateRequest,
    DriverListQuery,
    DriverResponse,
    DriverUpdateRequest,
)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class LocalDriverService:
    def __init__(self, storage_dir: Path) -> None:
        self._storage_dir = storage_dir
        self._storage_dir.mkdir(parents=True, exist_ok=True)
        self._drivers_path = self._storage_dir / "drivers.json"
        self._lock = Lock()
        if not self._drivers_path.exists():
            self._drivers_path.write_text("{}", encoding="utf-8")

    def create_driver(self, payload: DriverCreateRequest, created_by: str) -> DriverResponse:
        with self._lock:
            drivers = self._read_drivers()
            self._ensure_unique_identifiers(drivers, payload.employee_no, payload.license_no)
            driver_id = str(uuid4())
            now = _utc_now()
            drivers[driver_id] = {
                **payload.model_dump(mode="json"),
                "created_at": now.isoformat(),
                "updated_at": now.isoformat(),
                "created_by": created_by,
            }
            self._write_drivers(drivers)
            return self._to_response(driver_id, drivers[driver_id])

    def list_drivers(self, query: DriverListQuery) -> list[DriverResponse]:
        with self._lock:
            drivers = self._read_drivers()
            items = [self._to_response(driver_id, payload) for driver_id, payload in drivers.items()]
        return self._apply_filters(items, query)

    def get_driver(self, driver_id: str) -> DriverResponse:
        with self._lock:
            drivers = self._read_drivers()
            payload = drivers.get(driver_id)
            if not payload:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Driver not found.")
            return self._to_response(driver_id, payload)

    def update_driver(self, driver_id: str, payload: DriverUpdateRequest) -> DriverResponse:
        with self._lock:
            drivers = self._read_drivers()
            existing = drivers.get(driver_id)
            if not existing:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Driver not found.")

            updates = payload.model_dump(exclude_unset=True, mode="json")
            employee_no = updates.get("employee_no", existing["employee_no"])
            license_no = updates.get("license_no", existing["license_no"])
            if employee_no != existing["employee_no"] or license_no != existing["license_no"]:
                self._ensure_unique_identifiers(
                    drivers,
                    employee_no,
                    license_no,
                    exclude_driver_id=driver_id,
                )
            updates["updated_at"] = _utc_now().isoformat()
            existing.update(updates)
            self._write_drivers(drivers)
            return self._to_response(driver_id, existing)

    def delete_driver(self, driver_id: str) -> None:
        with self._lock:
            drivers = self._read_drivers()
            if driver_id not in drivers:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Driver not found.")
            del drivers[driver_id]
            self._write_drivers(drivers)

    def get_availability(self) -> DriverAvailabilityResponse:
        drivers = self.list_drivers(DriverListQuery())
        return DriverAvailabilityResponse(
            total=len(drivers),
            available=sum(1 for driver in drivers if driver.status == "available"),
            assigned=sum(1 for driver in drivers if driver.status == "assigned"),
            off_duty=sum(1 for driver in drivers if driver.status == "off_duty"),
            on_leave=sum(1 for driver in drivers if driver.status == "on_leave"),
            inactive=sum(1 for driver in drivers if driver.status == "inactive"),
        )

    def _read_drivers(self) -> dict[str, Any]:
        raw = self._drivers_path.read_text(encoding="utf-8").strip()
        return json.loads(raw) if raw else {}

    def _write_drivers(self, drivers: dict[str, Any]) -> None:
        self._drivers_path.write_text(json.dumps(drivers, indent=2), encoding="utf-8")

    def _ensure_unique_identifiers(
        self,
        drivers: dict[str, Any],
        employee_no: str,
        license_no: str,
        exclude_driver_id: str | None = None,
    ) -> None:
        for existing_id, payload in drivers.items():
            if exclude_driver_id and existing_id == exclude_driver_id:
                continue
            if payload["employee_no"] == employee_no:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="A driver with this employee number already exists.",
                )
            if payload["license_no"] == license_no:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="A driver with this license number already exists.",
                )

    def _to_response(self, driver_id: str, payload: dict[str, Any]) -> DriverResponse:
        return DriverResponse(
            id=driver_id,
            employee_no=payload["employee_no"],
            full_name=payload["full_name"],
            license_no=payload["license_no"],
            phone_number=payload["phone_number"],
            years_of_experience=payload["years_of_experience"],
            working_hours=payload["working_hours"],
            status=payload["status"],
            active=payload["active"],
            assigned_route_id=payload.get("assigned_route_id"),
            assigned_vehicle_id=payload.get("assigned_vehicle_id"),
            hire_date=date.fromisoformat(payload["hire_date"]),
            notes=payload.get("notes"),
            assignment_history=payload.get("assignment_history", []),
            created_at=datetime.fromisoformat(payload["created_at"]),
            updated_at=datetime.fromisoformat(payload["updated_at"]),
            created_by=payload["created_by"],
        )

    def _apply_filters(self, drivers: list[DriverResponse], query: DriverListQuery) -> list[DriverResponse]:
        result = drivers
        if query.status is not None:
            result = [driver for driver in result if driver.status == query.status]
        if query.active is not None:
            result = [driver for driver in result if driver.active == query.active]
        if query.search:
            needle = query.search.strip().lower()
            result = [
                driver
                for driver in result
                if needle in driver.employee_no.lower()
                or needle in driver.full_name.lower()
                or needle in driver.license_no.lower()
                or needle in driver.phone_number.lower()
            ]
        result.sort(key=lambda driver: driver.created_at)
        return result


class FirebaseDriverService:
    def __init__(self) -> None:
        self.db = get_firebase_db()

    def create_driver(self, payload: DriverCreateRequest, created_by: str) -> DriverResponse:
        drivers = self.db.child("drivers").get().val() or {}
        self._ensure_unique_identifiers(drivers, payload.employee_no, payload.license_no)
        driver_id = str(uuid4())
        now = _utc_now()
        driver_payload = {
            **payload.model_dump(mode="json"),
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
            "created_by": created_by,
        }
        self.db.child("drivers").child(driver_id).set(driver_payload)
        return self._to_response(driver_id, driver_payload)

    def list_drivers(self, query: DriverListQuery) -> list[DriverResponse]:
        drivers = self.db.child("drivers").get().val() or {}
        items = [self._to_response(driver_id, payload) for driver_id, payload in drivers.items()]
        return LocalDriverService._apply_filters(self, items, query)

    def get_driver(self, driver_id: str) -> DriverResponse:
        payload = self.db.child("drivers").child(driver_id).get().val()
        if not payload:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Driver not found.")
        return self._to_response(driver_id, payload)

    def update_driver(self, driver_id: str, payload: DriverUpdateRequest) -> DriverResponse:
        drivers = self.db.child("drivers").get().val() or {}
        existing = drivers.get(driver_id)
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Driver not found.")

        updates = payload.model_dump(exclude_unset=True, mode="json")
        employee_no = updates.get("employee_no", existing["employee_no"])
        license_no = updates.get("license_no", existing["license_no"])
        if employee_no != existing["employee_no"] or license_no != existing["license_no"]:
            self._ensure_unique_identifiers(
                drivers,
                employee_no,
                license_no,
                exclude_driver_id=driver_id,
            )
        updates["updated_at"] = _utc_now().isoformat()
        self.db.child("drivers").child(driver_id).update(updates)
        existing.update(updates)
        return self._to_response(driver_id, existing)

    def delete_driver(self, driver_id: str) -> None:
        payload = self.db.child("drivers").child(driver_id).get().val()
        if not payload:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Driver not found.")
        self.db.child("drivers").child(driver_id).remove()

    def get_availability(self) -> DriverAvailabilityResponse:
        drivers = self.list_drivers(DriverListQuery())
        return DriverAvailabilityResponse(
            total=len(drivers),
            available=sum(1 for driver in drivers if driver.status == "available"),
            assigned=sum(1 for driver in drivers if driver.status == "assigned"),
            off_duty=sum(1 for driver in drivers if driver.status == "off_duty"),
            on_leave=sum(1 for driver in drivers if driver.status == "on_leave"),
            inactive=sum(1 for driver in drivers if driver.status == "inactive"),
        )

    def _ensure_unique_identifiers(
        self,
        drivers: dict[str, Any],
        employee_no: str,
        license_no: str,
        exclude_driver_id: str | None = None,
    ) -> None:
        for existing_id, payload in drivers.items():
            if exclude_driver_id and existing_id == exclude_driver_id:
                continue
            if payload.get("employee_no") == employee_no:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="A driver with this employee number already exists.",
                )
            if payload.get("license_no") == license_no:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="A driver with this license number already exists.",
                )

    def _to_response(self, driver_id: str, payload: dict[str, Any]) -> DriverResponse:
        return DriverResponse(
            id=driver_id,
            employee_no=payload["employee_no"],
            full_name=payload["full_name"],
            license_no=payload["license_no"],
            phone_number=payload["phone_number"],
            years_of_experience=payload["years_of_experience"],
            working_hours=payload["working_hours"],
            status=payload["status"],
            active=payload["active"],
            assigned_route_id=payload.get("assigned_route_id"),
            assigned_vehicle_id=payload.get("assigned_vehicle_id"),
            hire_date=date.fromisoformat(payload["hire_date"]),
            notes=payload.get("notes"),
            assignment_history=payload.get("assignment_history", []),
            created_at=datetime.fromisoformat(payload["created_at"]),
            updated_at=datetime.fromisoformat(payload["updated_at"]),
            created_by=payload["created_by"],
        )


class DriverManager:
    def __init__(self) -> None:
        settings = get_settings()
        if settings.auth_provider == "firebase":
            self.provider = FirebaseDriverService()
        else:
            self.provider = LocalDriverService(settings.storage_dir)

    def create_driver(self, payload: DriverCreateRequest, created_by: str) -> DriverResponse:
        return self.provider.create_driver(payload, created_by)

    def list_drivers(self, query: DriverListQuery) -> list[DriverResponse]:
        return self.provider.list_drivers(query)

    def get_driver(self, driver_id: str) -> DriverResponse:
        return self.provider.get_driver(driver_id)

    def update_driver(self, driver_id: str, payload: DriverUpdateRequest) -> DriverResponse:
        return self.provider.update_driver(driver_id, payload)

    def delete_driver(self, driver_id: str) -> None:
        self.provider.delete_driver(driver_id)

    def get_availability(self) -> DriverAvailabilityResponse:
        return self.provider.get_availability()


driver_manager = DriverManager()
