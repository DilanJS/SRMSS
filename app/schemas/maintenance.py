from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


MaintenanceStatus = Literal["scheduled", "in_progress", "completed", "cancelled"]
ServiceType = Literal["inspection", "oil_change", "repair", "engine_service", "tire_service", "other"]


class FuelLogBase(BaseModel):
    vehicle_id: str = Field(min_length=1)
    liters: float = Field(gt=0, le=2000)
    cost: float = Field(ge=0, le=1_000_000)
    odometer_km: float = Field(ge=0, le=5_000_000)
    filled_at: datetime
    station_name: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=300)

    @field_validator("station_name", "notes")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else value


class FuelLogCreateRequest(FuelLogBase):
    pass


class FuelLogResponse(FuelLogBase):
    id: str
    created_at: datetime
    created_by: str


class MaintenanceLogBase(BaseModel):
    vehicle_id: str = Field(min_length=1)
    service_type: ServiceType
    status: MaintenanceStatus
    service_date: date
    next_due_date: date | None = None
    cost: float = Field(ge=0, le=1_000_000)
    workshop_name: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=500)

    @field_validator("workshop_name", "description")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else value


class MaintenanceLogCreateRequest(MaintenanceLogBase):
    pass


class MaintenanceLogUpdateRequest(BaseModel):
    service_type: ServiceType | None = None
    status: MaintenanceStatus | None = None
    service_date: date | None = None
    next_due_date: date | None = None
    cost: float | None = Field(default=None, ge=0, le=1_000_000)
    workshop_name: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=500)

    @field_validator("workshop_name", "description")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else value


class MaintenanceLogResponse(MaintenanceLogBase):
    id: str
    created_at: datetime
    updated_at: datetime
    created_by: str


class FuelLogListQuery(BaseModel):
    vehicle_id: str | None = None
    date_from: datetime | None = None
    date_to: datetime | None = None


class MaintenanceLogListQuery(BaseModel):
    vehicle_id: str | None = None
    status: MaintenanceStatus | None = None
    service_type: ServiceType | None = None


class MaintenanceDueReminder(BaseModel):
    log_id: str
    vehicle_id: str
    service_type: ServiceType
    next_due_date: date
    days_until_due: int
    workshop_name: str | None = None
    description: str | None = None
