from datetime import date, datetime
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


RecurrencePattern = Literal["daily", "weekly", "monthly"]


class RecurringScheduleRequest(BaseModel):
    route_id: str = Field(min_length=1)
    vehicle_id: str = Field(min_length=1)
    driver_id: str = Field(min_length=1)
    departure_time: datetime
    arrival_time: datetime
    notes: str | None = Field(default=None, max_length=500)
    recurrence: RecurrencePattern
    recurrence_days: list[int] = Field(default_factory=list)
    repeat_until: date

    @field_validator("notes")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else value

    @field_validator("recurrence_days")
    @classmethod
    def validate_days(cls, v: list[int]) -> list[int]:
        if any(d < 0 or d > 6 for d in v):
            raise ValueError("recurrence_days must be integers 0 (Mon) through 6 (Sun).")
        return sorted(set(v))

    @model_validator(mode="after")
    def validate_recurring(self) -> "RecurringScheduleRequest":
        if self.arrival_time <= self.departure_time:
            raise ValueError("Arrival time must be later than departure time.")
        if self.repeat_until < self.departure_time.date():
            raise ValueError("repeat_until must be on or after the departure date.")
        if self.recurrence == "weekly" and not self.recurrence_days:
            raise ValueError("recurrence_days is required for weekly recurrence.")
        return self


class RecurringScheduleResponse(BaseModel):
    created: int
    skipped: int
    skipped_dates: list[str]
