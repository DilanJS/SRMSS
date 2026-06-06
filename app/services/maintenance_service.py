import json
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status

from app.config import get_settings
from app.firebase_config import get_firebase_db
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
from app.schemas.vehicle import VehicleUpdateRequest
from app.services.vehicle_service import vehicle_manager


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class LocalMaintenanceService:
    def __init__(self, storage_dir: Path) -> None:
        self._storage_dir = storage_dir
        self._storage_dir.mkdir(parents=True, exist_ok=True)
        self._fuel_logs_path = self._storage_dir / "fuel_logs.json"
        self._maintenance_logs_path = self._storage_dir / "maintenance_logs.json"
        self._lock = Lock()
        if not self._fuel_logs_path.exists():
            self._fuel_logs_path.write_text("{}", encoding="utf-8")
        if not self._maintenance_logs_path.exists():
            self._maintenance_logs_path.write_text("{}", encoding="utf-8")

    def create_fuel_log(self, payload: FuelLogCreateRequest, created_by: str) -> FuelLogResponse:
        with self._lock:
            vehicle_manager.get_vehicle(payload.vehicle_id)
            fuel_logs = self._read_json(self._fuel_logs_path)
            log_id = str(uuid4())
            now = _utc_now()
            fuel_logs[log_id] = {
                **payload.model_dump(mode="json"),
                "created_at": now.isoformat(),
                "created_by": created_by,
            }
            self._write_json(self._fuel_logs_path, fuel_logs)
            vehicle_manager.update_vehicle(
                payload.vehicle_id,
                VehicleUpdateRequest(mileage_km=payload.odometer_km),
            )
            return self._to_fuel_response(log_id, fuel_logs[log_id])

    def list_fuel_logs(self, query: FuelLogListQuery) -> list[FuelLogResponse]:
        with self._lock:
            fuel_logs = self._read_json(self._fuel_logs_path)
            items = [self._to_fuel_response(log_id, payload) for log_id, payload in fuel_logs.items()]
        return self._apply_fuel_filters(items, query)

    def create_maintenance_log(
        self, payload: MaintenanceLogCreateRequest, created_by: str
    ) -> MaintenanceLogResponse:
        with self._lock:
            vehicle_manager.get_vehicle(payload.vehicle_id)
            maintenance_logs = self._read_json(self._maintenance_logs_path)
            log_id = str(uuid4())
            now = _utc_now()
            maintenance_logs[log_id] = {
                **payload.model_dump(mode="json"),
                "created_at": now.isoformat(),
                "updated_at": now.isoformat(),
                "created_by": created_by,
            }
            self._write_json(self._maintenance_logs_path, maintenance_logs)
            self._sync_vehicle_status(payload.vehicle_id, payload.status)
            return self._to_maintenance_response(log_id, maintenance_logs[log_id])

    def list_maintenance_logs(self, query: MaintenanceLogListQuery) -> list[MaintenanceLogResponse]:
        with self._lock:
            maintenance_logs = self._read_json(self._maintenance_logs_path)
            items = [
                self._to_maintenance_response(log_id, payload)
                for log_id, payload in maintenance_logs.items()
            ]
        return self._apply_maintenance_filters(items, query)

    def update_maintenance_log(
        self, log_id: str, payload: MaintenanceLogUpdateRequest
    ) -> MaintenanceLogResponse:
        with self._lock:
            maintenance_logs = self._read_json(self._maintenance_logs_path)
            existing = maintenance_logs.get(log_id)
            if not existing:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Maintenance log not found.",
                )
            updates = payload.model_dump(exclude_unset=True, mode="json")
            updates["updated_at"] = _utc_now().isoformat()
            existing.update(updates)
            maintenance_logs[log_id] = existing
            self._write_json(self._maintenance_logs_path, maintenance_logs)
            if "status" in updates:
                self._sync_vehicle_status(existing["vehicle_id"], existing["status"])
            return self._to_maintenance_response(log_id, existing)

    def get_due_reminders(self, days_ahead: int) -> list[MaintenanceDueReminder]:
        from datetime import date, timedelta
        with self._lock:
            maintenance_logs = self._read_json(self._maintenance_logs_path)
        today = date.today()
        cutoff = today + timedelta(days=days_ahead)
        reminders: list[MaintenanceDueReminder] = []
        for log_id, payload in maintenance_logs.items():
            if payload.get("status") in {"completed", "cancelled"}:
                continue
            raw_due = payload.get("next_due_date")
            if not raw_due:
                continue
            due = date.fromisoformat(raw_due)
            if today <= due <= cutoff:
                reminders.append(
                    MaintenanceDueReminder(
                        log_id=log_id,
                        vehicle_id=payload["vehicle_id"],
                        service_type=payload["service_type"],
                        next_due_date=due,
                        days_until_due=(due - today).days,
                        workshop_name=payload.get("workshop_name"),
                        description=payload.get("description"),
                    )
                )
        reminders.sort(key=lambda r: r.days_until_due)
        return reminders

    def _sync_vehicle_status(self, vehicle_id: str, maintenance_status: str) -> None:
        if maintenance_status in {"scheduled", "in_progress"}:
            vehicle_manager.update_vehicle(vehicle_id, VehicleUpdateRequest(status="maintenance"))
        elif maintenance_status == "completed":
            vehicle_manager.update_vehicle(vehicle_id, VehicleUpdateRequest(status="available"))

    def _read_json(self, path: Path) -> dict[str, Any]:
        raw = path.read_text(encoding="utf-8").strip()
        return json.loads(raw) if raw else {}

    def _write_json(self, path: Path, payload: dict[str, Any]) -> None:
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def _to_fuel_response(self, log_id: str, payload: dict[str, Any]) -> FuelLogResponse:
        return FuelLogResponse(
            id=log_id,
            vehicle_id=payload["vehicle_id"],
            liters=payload["liters"],
            cost=payload["cost"],
            odometer_km=payload["odometer_km"],
            filled_at=datetime.fromisoformat(payload["filled_at"]),
            station_name=payload.get("station_name"),
            notes=payload.get("notes"),
            created_at=datetime.fromisoformat(payload["created_at"]),
            created_by=payload["created_by"],
        )

    def _to_maintenance_response(self, log_id: str, payload: dict[str, Any]) -> MaintenanceLogResponse:
        from datetime import date

        return MaintenanceLogResponse(
            id=log_id,
            vehicle_id=payload["vehicle_id"],
            service_type=payload["service_type"],
            status=payload["status"],
            service_date=date.fromisoformat(payload["service_date"]),
            next_due_date=date.fromisoformat(payload["next_due_date"])
            if payload.get("next_due_date")
            else None,
            cost=payload["cost"],
            workshop_name=payload.get("workshop_name"),
            description=payload.get("description"),
            created_at=datetime.fromisoformat(payload["created_at"]),
            updated_at=datetime.fromisoformat(payload["updated_at"]),
            created_by=payload["created_by"],
        )

    def _apply_fuel_filters(
        self, fuel_logs: list[FuelLogResponse], query: FuelLogListQuery
    ) -> list[FuelLogResponse]:
        result = fuel_logs
        if query.vehicle_id is not None:
            result = [log for log in result if log.vehicle_id == query.vehicle_id]
        if query.date_from is not None:
            result = [log for log in result if log.filled_at >= query.date_from]
        if query.date_to is not None:
            result = [log for log in result if log.filled_at <= query.date_to]
        result.sort(key=lambda log: log.filled_at, reverse=True)
        return result

    def _apply_maintenance_filters(
        self, maintenance_logs: list[MaintenanceLogResponse], query: MaintenanceLogListQuery
    ) -> list[MaintenanceLogResponse]:
        result = maintenance_logs
        if query.vehicle_id is not None:
            result = [log for log in result if log.vehicle_id == query.vehicle_id]
        if query.status is not None:
            result = [log for log in result if log.status == query.status]
        if query.service_type is not None:
            result = [log for log in result if log.service_type == query.service_type]
        result.sort(key=lambda log: log.service_date, reverse=True)
        return result


class FirebaseMaintenanceService(LocalMaintenanceService):
    def __init__(self) -> None:
        self.db = get_firebase_db()

    def create_fuel_log(self, payload: FuelLogCreateRequest, created_by: str) -> FuelLogResponse:
        vehicle_manager.get_vehicle(payload.vehicle_id)
        log_id = str(uuid4())
        now = _utc_now()
        log_payload = {
            **payload.model_dump(mode="json"),
            "created_at": now.isoformat(),
            "created_by": created_by,
        }
        self.db.child("fuel_logs").child(log_id).set(log_payload)
        vehicle_manager.update_vehicle(
            payload.vehicle_id,
            VehicleUpdateRequest(mileage_km=payload.odometer_km),
        )
        return self._to_fuel_response(log_id, log_payload)

    def list_fuel_logs(self, query: FuelLogListQuery) -> list[FuelLogResponse]:
        fuel_logs = self.db.child("fuel_logs").get().val() or {}
        items = [self._to_fuel_response(log_id, payload) for log_id, payload in fuel_logs.items()]
        return self._apply_fuel_filters(items, query)

    def create_maintenance_log(
        self, payload: MaintenanceLogCreateRequest, created_by: str
    ) -> MaintenanceLogResponse:
        vehicle_manager.get_vehicle(payload.vehicle_id)
        log_id = str(uuid4())
        now = _utc_now()
        log_payload = {
            **payload.model_dump(mode="json"),
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
            "created_by": created_by,
        }
        self.db.child("maintenance_logs").child(log_id).set(log_payload)
        self._sync_vehicle_status(payload.vehicle_id, payload.status)
        return self._to_maintenance_response(log_id, log_payload)

    def list_maintenance_logs(self, query: MaintenanceLogListQuery) -> list[MaintenanceLogResponse]:
        maintenance_logs = self.db.child("maintenance_logs").get().val() or {}
        items = [
            self._to_maintenance_response(log_id, payload)
            for log_id, payload in maintenance_logs.items()
        ]
        return self._apply_maintenance_filters(items, query)

    def update_maintenance_log(
        self, log_id: str, payload: MaintenanceLogUpdateRequest
    ) -> MaintenanceLogResponse:
        existing = self.db.child("maintenance_logs").child(log_id).get().val()
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Maintenance log not found.",
            )
        updates = payload.model_dump(exclude_unset=True, mode="json")
        updates["updated_at"] = _utc_now().isoformat()
        self.db.child("maintenance_logs").child(log_id).update(updates)
        existing.update(updates)
        if "status" in updates:
            self._sync_vehicle_status(existing["vehicle_id"], existing["status"])
        return self._to_maintenance_response(log_id, existing)

    def get_due_reminders(self, days_ahead: int) -> list[MaintenanceDueReminder]:
        from datetime import date, timedelta
        maintenance_logs = self.db.child("maintenance_logs").get().val() or {}
        today = date.today()
        cutoff = today + timedelta(days=days_ahead)
        reminders: list[MaintenanceDueReminder] = []
        for log_id, payload in maintenance_logs.items():
            if payload.get("status") in {"completed", "cancelled"}:
                continue
            raw_due = payload.get("next_due_date")
            if not raw_due:
                continue
            due = date.fromisoformat(raw_due)
            if today <= due <= cutoff:
                reminders.append(
                    MaintenanceDueReminder(
                        log_id=log_id,
                        vehicle_id=payload["vehicle_id"],
                        service_type=payload["service_type"],
                        next_due_date=due,
                        days_until_due=(due - today).days,
                        workshop_name=payload.get("workshop_name"),
                        description=payload.get("description"),
                    )
                )
        reminders.sort(key=lambda r: r.days_until_due)
        return reminders


class MaintenanceManager:
    def __init__(self) -> None:
        settings = get_settings()
        if settings.auth_provider == "firebase":
            self.provider = FirebaseMaintenanceService()
        else:
            self.provider = LocalMaintenanceService(settings.storage_dir)

    def create_fuel_log(self, payload: FuelLogCreateRequest, created_by: str) -> FuelLogResponse:
        return self.provider.create_fuel_log(payload, created_by)

    def list_fuel_logs(self, query: FuelLogListQuery) -> list[FuelLogResponse]:
        return self.provider.list_fuel_logs(query)

    def create_maintenance_log(
        self, payload: MaintenanceLogCreateRequest, created_by: str
    ) -> MaintenanceLogResponse:
        return self.provider.create_maintenance_log(payload, created_by)

    def list_maintenance_logs(self, query: MaintenanceLogListQuery) -> list[MaintenanceLogResponse]:
        return self.provider.list_maintenance_logs(query)

    def update_maintenance_log(
        self, log_id: str, payload: MaintenanceLogUpdateRequest
    ) -> MaintenanceLogResponse:
        return self.provider.update_maintenance_log(log_id, payload)

    def get_due_reminders(self, days_ahead: int) -> list[MaintenanceDueReminder]:
        return self.provider.get_due_reminders(days_ahead)


maintenance_manager = MaintenanceManager()
