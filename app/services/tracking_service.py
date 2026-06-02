import json
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any

from app.config import get_settings
from app.firebase_config import get_firebase_db
from app.schemas.tracking import LocationUpdate, VehicleLocationResponse


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class LocalTrackingService:
    def __init__(self, storage_dir: Path) -> None:
        self._storage_dir = storage_dir
        self._storage_dir.mkdir(parents=True, exist_ok=True)
        self._path = self._storage_dir / "vehicle_locations.json"
        self._lock = Lock()
        if not self._path.exists():
            self._path.write_text("{}", encoding="utf-8")

    def update_location(
        self, vehicle_id: str, payload: LocationUpdate, updated_by: str
    ) -> VehicleLocationResponse:
        with self._lock:
            data = self._read()
            data[vehicle_id] = {
                "latitude": payload.latitude,
                "longitude": payload.longitude,
                "speed_kmh": payload.speed_kmh,
                "heading": payload.heading,
                "updated_at": _utc_now().isoformat(),
                "updated_by": updated_by,
            }
            self._write(data)
            return self._to_response(vehicle_id, data[vehicle_id])

    def get_all_locations(self) -> list[VehicleLocationResponse]:
        with self._lock:
            data = self._read()
        return [self._to_response(vid, loc) for vid, loc in data.items()]

    def _read(self) -> dict[str, Any]:
        raw = self._path.read_text(encoding="utf-8").strip()
        return json.loads(raw) if raw else {}

    def _write(self, data: dict[str, Any]) -> None:
        self._path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def _to_response(self, vehicle_id: str, d: dict[str, Any]) -> VehicleLocationResponse:
        return VehicleLocationResponse(
            vehicle_id=vehicle_id,
            latitude=d["latitude"],
            longitude=d["longitude"],
            speed_kmh=d.get("speed_kmh"),
            heading=d.get("heading"),
            updated_at=d.get("updated_at", ""),
            updated_by=d.get("updated_by"),
        )


class FirebaseTrackingService:
    def __init__(self) -> None:
        self.db = get_firebase_db()

    def update_location(
        self, vehicle_id: str, payload: LocationUpdate, updated_by: str
    ) -> VehicleLocationResponse:
        record = {
            "latitude": payload.latitude,
            "longitude": payload.longitude,
            "speed_kmh": payload.speed_kmh,
            "heading": payload.heading,
            "updated_at": _utc_now().isoformat(),
            "updated_by": updated_by,
        }
        self.db.child("vehicle_locations").child(vehicle_id).set(record)
        return VehicleLocationResponse(vehicle_id=vehicle_id, **record)

    def get_all_locations(self) -> list[VehicleLocationResponse]:
        data = self.db.child("vehicle_locations").get().val() or {}
        return [
            VehicleLocationResponse(
                vehicle_id=vid,
                latitude=loc["latitude"],
                longitude=loc["longitude"],
                speed_kmh=loc.get("speed_kmh"),
                heading=loc.get("heading"),
                updated_at=loc.get("updated_at", ""),
                updated_by=loc.get("updated_by"),
            )
            for vid, loc in data.items()
        ]


class TrackingManager:
    def __init__(self) -> None:
        settings = get_settings()
        if settings.auth_provider == "firebase":
            self.provider: LocalTrackingService | FirebaseTrackingService = FirebaseTrackingService()
        else:
            self.provider = LocalTrackingService(settings.storage_dir)

    def update_location(
        self, vehicle_id: str, payload: LocationUpdate, updated_by: str
    ) -> VehicleLocationResponse:
        return self.provider.update_location(vehicle_id, payload, updated_by)

    def get_all_locations(self) -> list[VehicleLocationResponse]:
        return self.provider.get_all_locations()


tracking_manager = TrackingManager()
