from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


ScheduleStatus = Literal["scheduled", "active", "completed", "cancelled", "delayed", "emergency"]


class ScheduleBase(BaseModel):
    route_id: str = Field(min_length=1)
    vehicle_id: str = Field(min_length=1)
    driver_id: str = Field(min_length=1)
    departure_time: datetime
    arrival_time: datetime
    status: ScheduleStatus = "scheduled"
    emergency_update: bool = False
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("notes")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else value

    @model_validator(mode="after")
    def validate_times(self) -> "ScheduleBase":
        if self.arrival_time <= self.departure_time:
            raise ValueError("Arrival time must be later than departure time.")
        return self


class ScheduleCreateRequest(ScheduleBase):
    pass


class ScheduleUpdateRequest(BaseModel):
    route_id: str | None = None
    vehicle_id: str | None = None
    driver_id: str | None = None
    departure_time: datetime | None = None
    arrival_time: datetime | None = None
    status: ScheduleStatus | None = None
    emergency_update: bool | None = None
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("notes")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else value

    @model_validator(mode="after")
    def validate_times(self) -> "ScheduleUpdateRequest":
        if (
            self.departure_time is not None
            and self.arrival_time is not None
            and self.arrival_time <= self.departure_time
        ):
            raise ValueError("Arrival time must be later than departure time.")
        return self


class EmergencyScheduleUpdateRequest(BaseModel):
    departure_time: datetime | None = None
    arrival_time: datetime | None = None
    vehicle_id: str | None = None
    driver_id: str | None = None
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("notes")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else value

    @model_validator(mode="after")
    def validate_times(self) -> "EmergencyScheduleUpdateRequest":
        if (
            self.departure_time is not None
            and self.arrival_time is not None
            and self.arrival_time <= self.departure_time
        ):
            raise ValueError("Arrival time must be later than departure time.")
        return self


class ScheduleResponse(ScheduleBase):
    id: str
    created_at: datetime
    updated_at: datetime
    created_by: str


class ScheduleConflictResponse(BaseModel):
    has_conflict: bool
    conflicts: list[str]


class ScheduleListQuery(BaseModel):
    route_id: str | None = None
    vehicle_id: str | None = None
    driver_id: str | None = None
    status: ScheduleStatus | None = None
    date_from: datetime | None = None
    date_to: datetime | None = None
