import calendar
import json
from datetime import date as date_type
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import Lock
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status

from app.config import get_settings
from app.firebase_config import get_firebase_db
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
from app.services.driver_service import driver_manager
from app.services.route_service import route_manager
from app.services.vehicle_service import vehicle_manager


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class LocalScheduleService:
    def __init__(self, storage_dir: Path) -> None:
        self._storage_dir = storage_dir
        self._storage_dir.mkdir(parents=True, exist_ok=True)
        self._schedules_path = self._storage_dir / "schedules.json"
        self._lock = Lock()
        if not self._schedules_path.exists():
            self._schedules_path.write_text("{}", encoding="utf-8")

    def create_schedule(self, payload: ScheduleCreateRequest, created_by: str) -> ScheduleResponse:
        with self._lock:
            schedules = self._read_schedules()
            self._validate_references(payload.route_id, payload.vehicle_id, payload.driver_id)
            conflicts = self._collect_conflicts(
                schedules=schedules,
                schedule_id=None,
                vehicle_id=payload.vehicle_id,
                driver_id=payload.driver_id,
                departure_time=payload.departure_time,
                arrival_time=payload.arrival_time,
            )
            if conflicts:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={"message": "Schedule conflict detected.", "conflicts": conflicts},
                )

            schedule_id = str(uuid4())
            now = _utc_now()
            schedules[schedule_id] = {
                **payload.model_dump(mode="json"),
                "created_at": now.isoformat(),
                "updated_at": now.isoformat(),
                "created_by": created_by,
            }
            self._write_schedules(schedules)
            return self._to_response(schedule_id, schedules[schedule_id])

    def list_schedules(self, query: ScheduleListQuery) -> list[ScheduleResponse]:
        with self._lock:
            schedules = self._read_schedules()
            items = [self._to_response(schedule_id, payload) for schedule_id, payload in schedules.items()]
        return self._apply_filters(items, query)

    def get_schedule(self, schedule_id: str) -> ScheduleResponse:
        with self._lock:
            schedules = self._read_schedules()
            payload = schedules.get(schedule_id)
            if not payload:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found.")
            return self._to_response(schedule_id, payload)

    def update_schedule(self, schedule_id: str, payload: ScheduleUpdateRequest) -> ScheduleResponse:
        with self._lock:
            schedules = self._read_schedules()
            existing = schedules.get(schedule_id)
            if not existing:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found.")

            merged = {**existing, **payload.model_dump(exclude_unset=True, mode="json")}
            self._validate_schedule_times(merged["departure_time"], merged["arrival_time"])
            self._validate_references(merged["route_id"], merged["vehicle_id"], merged["driver_id"])
            conflicts = self._collect_conflicts(
                schedules=schedules,
                schedule_id=schedule_id,
                vehicle_id=merged["vehicle_id"],
                driver_id=merged["driver_id"],
                departure_time=datetime.fromisoformat(merged["departure_time"]),
                arrival_time=datetime.fromisoformat(merged["arrival_time"]),
            )
            if conflicts:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={"message": "Schedule conflict detected.", "conflicts": conflicts},
                )

            merged["updated_at"] = _utc_now().isoformat()
            schedules[schedule_id] = merged
            self._write_schedules(schedules)
            return self._to_response(schedule_id, merged)

    def emergency_update_schedule(
        self, schedule_id: str, payload: EmergencyScheduleUpdateRequest
    ) -> ScheduleResponse:
        emergency_payload = ScheduleUpdateRequest(
            **payload.model_dump(exclude_unset=True),
            status="emergency",
            emergency_update=True,
        )
        return self.update_schedule(schedule_id, emergency_payload)

    def delete_schedule(self, schedule_id: str) -> None:
        with self._lock:
            schedules = self._read_schedules()
            if schedule_id not in schedules:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found.")
            del schedules[schedule_id]
            self._write_schedules(schedules)

    def detect_conflicts(self, payload: ScheduleCreateRequest, schedule_id: str | None = None) -> ScheduleConflictResponse:
        with self._lock:
            schedules = self._read_schedules()
        self._validate_references(payload.route_id, payload.vehicle_id, payload.driver_id)
        conflicts = self._collect_conflicts(
            schedules=schedules,
            schedule_id=schedule_id,
            vehicle_id=payload.vehicle_id,
            driver_id=payload.driver_id,
            departure_time=payload.departure_time,
            arrival_time=payload.arrival_time,
        )
        return ScheduleConflictResponse(has_conflict=bool(conflicts), conflicts=conflicts)

    def create_recurring_schedules(
        self, payload: RecurringScheduleRequest, created_by: str
    ) -> RecurringScheduleResponse:
        self._validate_references(payload.route_id, payload.vehicle_id, payload.driver_id)
        occurrences = self._generate_occurrences(
            departure=payload.departure_time,
            arrival=payload.arrival_time,
            recurrence=payload.recurrence,
            recurrence_days=payload.recurrence_days,
            repeat_until=payload.repeat_until,
        )
        created = 0
        skipped = 0
        skipped_dates: list[str] = []
        for dep, arr in occurrences:
            single = ScheduleCreateRequest(
                route_id=payload.route_id,
                vehicle_id=payload.vehicle_id,
                driver_id=payload.driver_id,
                departure_time=dep,
                arrival_time=arr,
                notes=payload.notes,
            )
            try:
                self.create_schedule(single, created_by)
                created += 1
            except HTTPException as exc:
                if exc.status_code == status.HTTP_409_CONFLICT:
                    skipped += 1
                    skipped_dates.append(dep.strftime("%Y-%m-%d %H:%M"))
                else:
                    raise
        return RecurringScheduleResponse(created=created, skipped=skipped, skipped_dates=skipped_dates)

    def _generate_occurrences(
        self,
        departure: datetime,
        arrival: datetime,
        recurrence: str,
        recurrence_days: list[int],
        repeat_until: date_type,
    ) -> list[tuple[datetime, datetime]]:
        duration = arrival - departure
        occurrences: list[tuple[datetime, datetime]] = []
        current = departure.date()

        if recurrence == "daily":
            while current <= repeat_until:
                dep = departure.replace(year=current.year, month=current.month, day=current.day)
                occurrences.append((dep, dep + duration))
                current += timedelta(days=1)

        elif recurrence == "weekly":
            days_set = set(recurrence_days)
            while current <= repeat_until:
                if current.weekday() in days_set:
                    dep = departure.replace(year=current.year, month=current.month, day=current.day)
                    occurrences.append((dep, dep + duration))
                current += timedelta(days=1)

        elif recurrence == "monthly":
            while current <= repeat_until:
                dep = departure.replace(year=current.year, month=current.month, day=current.day)
                occurrences.append((dep, dep + duration))
                month = current.month + 1
                year = current.year
                if month > 12:
                    month = 1
                    year += 1
                max_day = calendar.monthrange(year, month)[1]
                current = date_type(year, month, min(departure.day, max_day))

        return occurrences

    def _read_schedules(self) -> dict[str, Any]:
        raw = self._schedules_path.read_text(encoding="utf-8").strip()
        return json.loads(raw) if raw else {}

    def _write_schedules(self, schedules: dict[str, Any]) -> None:
        self._schedules_path.write_text(json.dumps(schedules, indent=2), encoding="utf-8")

    def _validate_references(self, route_id: str, vehicle_id: str, driver_id: str) -> None:
        route_manager.get_route(route_id)
        vehicle_manager.get_vehicle(vehicle_id)
        driver_manager.get_driver(driver_id)

    def _validate_schedule_times(self, departure_time: str, arrival_time: str) -> None:
        departure = datetime.fromisoformat(departure_time)
        arrival = datetime.fromisoformat(arrival_time)
        if arrival <= departure:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Arrival time must be later than departure time.",
            )

    def _collect_conflicts(
        self,
        schedules: dict[str, Any],
        schedule_id: str | None,
        vehicle_id: str,
        driver_id: str,
        departure_time: datetime,
        arrival_time: datetime,
    ) -> list[str]:
        conflicts: list[str] = []
        for existing_id, payload in schedules.items():
            if schedule_id and existing_id == schedule_id:
                continue
            if payload["status"] == "cancelled":
                continue

            existing_departure = datetime.fromisoformat(payload["departure_time"])
            existing_arrival = datetime.fromisoformat(payload["arrival_time"])
            overlaps = departure_time < existing_arrival and arrival_time > existing_departure
            if not overlaps:
                continue

            dep_str = existing_departure.strftime("%b %d, %H:%M")
            arr_str = existing_arrival.strftime("%H:%M")

            try:
                route = route_manager.get_route(payload["route_id"])
                route_label = f"{route.route_code} – {route.route_name}"
            except Exception:
                route_label = "another route"

            if payload["vehicle_id"] == vehicle_id:
                try:
                    vehicle = vehicle_manager.get_vehicle(vehicle_id)
                    vehicle_label = vehicle.registration_no
                except Exception:
                    vehicle_label = "This vehicle"
                conflicts.append(
                    f"Vehicle {vehicle_label} is already assigned to {route_label} ({dep_str}–{arr_str})."
                )
            if payload["driver_id"] == driver_id:
                try:
                    driver = driver_manager.get_driver(driver_id)
                    driver_label = driver.full_name
                except Exception:
                    driver_label = "This driver"
                conflicts.append(
                    f"Driver {driver_label} is already assigned to {route_label} ({dep_str}–{arr_str})."
                )
        return conflicts

    def _to_response(self, schedule_id: str, payload: dict[str, Any]) -> ScheduleResponse:
        return ScheduleResponse(
            id=schedule_id,
            route_id=payload["route_id"],
            vehicle_id=payload["vehicle_id"],
            driver_id=payload["driver_id"],
            departure_time=datetime.fromisoformat(payload["departure_time"]),
            arrival_time=datetime.fromisoformat(payload["arrival_time"]),
            status=payload["status"],
            emergency_update=payload["emergency_update"],
            notes=payload.get("notes"),
            created_at=datetime.fromisoformat(payload["created_at"]),
            updated_at=datetime.fromisoformat(payload["updated_at"]),
            created_by=payload["created_by"],
        )

    def _apply_filters(
        self, schedules: list[ScheduleResponse], query: ScheduleListQuery
    ) -> list[ScheduleResponse]:
        result = schedules
        if query.route_id is not None:
            result = [schedule for schedule in result if schedule.route_id == query.route_id]
        if query.vehicle_id is not None:
            result = [schedule for schedule in result if schedule.vehicle_id == query.vehicle_id]
        if query.driver_id is not None:
            result = [schedule for schedule in result if schedule.driver_id == query.driver_id]
        if query.status is not None:
            result = [schedule for schedule in result if schedule.status == query.status]
        if query.date_from is not None:
            result = [schedule for schedule in result if schedule.departure_time >= query.date_from]
        if query.date_to is not None:
            result = [schedule for schedule in result if schedule.departure_time <= query.date_to]
        result.sort(key=lambda schedule: schedule.departure_time)
        return result


class FirebaseScheduleService(LocalScheduleService):
    def __init__(self) -> None:
        self.db = get_firebase_db()

    def create_schedule(self, payload: ScheduleCreateRequest, created_by: str) -> ScheduleResponse:
        schedules = self._read_schedules()
        self._validate_references(payload.route_id, payload.vehicle_id, payload.driver_id)
        conflicts = self._collect_conflicts(
            schedules=schedules,
            schedule_id=None,
            vehicle_id=payload.vehicle_id,
            driver_id=payload.driver_id,
            departure_time=payload.departure_time,
            arrival_time=payload.arrival_time,
        )
        if conflicts:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"message": "Schedule conflict detected.", "conflicts": conflicts},
            )

        schedule_id = str(uuid4())
        now = _utc_now()
        schedule_payload = {
            **payload.model_dump(mode="json"),
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
            "created_by": created_by,
        }
        self.db.child("schedules").child(schedule_id).set(schedule_payload)
        return self._to_response(schedule_id, schedule_payload)

    def list_schedules(self, query: ScheduleListQuery) -> list[ScheduleResponse]:
        schedules = self._read_schedules()
        items = [self._to_response(schedule_id, payload) for schedule_id, payload in schedules.items()]
        return self._apply_filters(items, query)

    def get_schedule(self, schedule_id: str) -> ScheduleResponse:
        payload = self.db.child("schedules").child(schedule_id).get().val()
        if not payload:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found.")
        return self._to_response(schedule_id, payload)

    def update_schedule(self, schedule_id: str, payload: ScheduleUpdateRequest) -> ScheduleResponse:
        schedules = self._read_schedules()
        existing = schedules.get(schedule_id)
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found.")

        merged = {**existing, **payload.model_dump(exclude_unset=True, mode="json")}
        self._validate_schedule_times(merged["departure_time"], merged["arrival_time"])
        self._validate_references(merged["route_id"], merged["vehicle_id"], merged["driver_id"])
        conflicts = self._collect_conflicts(
            schedules=schedules,
            schedule_id=schedule_id,
            vehicle_id=merged["vehicle_id"],
            driver_id=merged["driver_id"],
            departure_time=datetime.fromisoformat(merged["departure_time"]),
            arrival_time=datetime.fromisoformat(merged["arrival_time"]),
        )
        if conflicts:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"message": "Schedule conflict detected.", "conflicts": conflicts},
            )

        merged["updated_at"] = _utc_now().isoformat()
        self.db.child("schedules").child(schedule_id).set(merged)
        return self._to_response(schedule_id, merged)

    def delete_schedule(self, schedule_id: str) -> None:
        payload = self.db.child("schedules").child(schedule_id).get().val()
        if not payload:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found.")
        self.db.child("schedules").child(schedule_id).remove()

    def detect_conflicts(self, payload: ScheduleCreateRequest, schedule_id: str | None = None) -> ScheduleConflictResponse:
        schedules = self._read_schedules()
        self._validate_references(payload.route_id, payload.vehicle_id, payload.driver_id)
        conflicts = self._collect_conflicts(
            schedules=schedules,
            schedule_id=schedule_id,
            vehicle_id=payload.vehicle_id,
            driver_id=payload.driver_id,
            departure_time=payload.departure_time,
            arrival_time=payload.arrival_time,
        )
        return ScheduleConflictResponse(has_conflict=bool(conflicts), conflicts=conflicts)

    def _read_schedules(self) -> dict[str, Any]:
        return self.db.child("schedules").get().val() or {}

    def _write_schedules(self, schedules: dict[str, Any]) -> None:
        for schedule_id, payload in schedules.items():
            self.db.child("schedules").child(schedule_id).set(payload)


class ScheduleManager:
    def __init__(self) -> None:
        settings = get_settings()
        if settings.auth_provider == "firebase":
            self.provider = FirebaseScheduleService()
        else:
            self.provider = LocalScheduleService(settings.storage_dir)

    def create_schedule(self, payload: ScheduleCreateRequest, created_by: str) -> ScheduleResponse:
        return self.provider.create_schedule(payload, created_by)

    def create_recurring_schedules(
        self, payload: RecurringScheduleRequest, created_by: str
    ) -> RecurringScheduleResponse:
        return self.provider.create_recurring_schedules(payload, created_by)

    def list_schedules(self, query: ScheduleListQuery) -> list[ScheduleResponse]:
        return self.provider.list_schedules(query)

    def get_schedule(self, schedule_id: str) -> ScheduleResponse:
        return self.provider.get_schedule(schedule_id)

    def update_schedule(self, schedule_id: str, payload: ScheduleUpdateRequest) -> ScheduleResponse:
        return self.provider.update_schedule(schedule_id, payload)

    def emergency_update_schedule(
        self, schedule_id: str, payload: EmergencyScheduleUpdateRequest
    ) -> ScheduleResponse:
        return self.provider.emergency_update_schedule(schedule_id, payload)

    def delete_schedule(self, schedule_id: str) -> None:
        self.provider.delete_schedule(schedule_id)

    def detect_conflicts(
        self, payload: ScheduleCreateRequest, schedule_id: str | None = None
    ) -> ScheduleConflictResponse:
        return self.provider.detect_conflicts(payload, schedule_id)


schedule_manager = ScheduleManager()
