from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


DriverStatus = Literal["available", "assigned", "off_duty", "on_leave", "inactive"]


class AssignmentHistoryEntry(BaseModel):
    route_id: str | None = None
    vehicle_id: str | None = None
    assigned_at: datetime
    released_at: datetime | None = None
    notes: str | None = Field(default=None, max_length=300)

    @field_validator("notes")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else value


class DriverBase(BaseModel):
    employee_no: str = Field(min_length=2, max_length=20)
    full_name: str = Field(min_length=3, max_length=120)
    license_no: str = Field(min_length=4, max_length=40)
    license_expiry_date: date | None = None
    phone_number: str = Field(min_length=7, max_length=20)
    years_of_experience: int = Field(ge=0, le=60)
    working_hours: float = Field(ge=0, le=168)
    status: DriverStatus = "available"
    active: bool = True
    assigned_route_id: str | None = None
    assigned_vehicle_id: str | None = None
    hire_date: date
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("employee_no", "license_no")
    @classmethod
    def normalize_codes(cls, value: str) -> str:
        return value.strip().upper()

    @field_validator("full_name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        return value.strip()

    @field_validator("phone_number")
    @classmethod
    def strip_phone(cls, value: str) -> str:
        return value.strip()

    @field_validator("notes")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else value


class DriverCreateRequest(DriverBase):
    assignment_history: list[AssignmentHistoryEntry] = Field(default_factory=list)


class DriverUpdateRequest(BaseModel):
    employee_no: str | None = Field(default=None, min_length=2, max_length=20)
    full_name: str | None = Field(default=None, min_length=3, max_length=120)
    license_no: str | None = Field(default=None, min_length=4, max_length=40)
    license_expiry_date: date | None = None
    phone_number: str | None = Field(default=None, min_length=7, max_length=20)
    years_of_experience: int | None = Field(default=None, ge=0, le=60)
    working_hours: float | None = Field(default=None, ge=0, le=168)
    status: DriverStatus | None = None
    active: bool | None = None
    assigned_route_id: str | None = None
    assigned_vehicle_id: str | None = None
    hire_date: date | None = None
    notes: str | None = Field(default=None, max_length=500)
    assignment_history: list[AssignmentHistoryEntry] | None = None

    @field_validator("employee_no", "license_no")
    @classmethod
    def normalize_codes(cls, value: str | None) -> str | None:
        return value.strip().upper() if value is not None else value

    @field_validator("full_name")
    @classmethod
    def strip_name(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else value

    @field_validator("phone_number")
    @classmethod
    def strip_phone(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else value

    @field_validator("notes")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else value


class DriverResponse(DriverBase):
    id: str
    assignment_history: list[AssignmentHistoryEntry]
    created_at: datetime
    updated_at: datetime
    created_by: str


class DriverAvailabilityResponse(BaseModel):
    total: int
    available: int
    assigned: int
    off_duty: int
    on_leave: int
    inactive: int


class DriverListQuery(BaseModel):
    status: DriverStatus | None = None
    active: bool | None = None
    search: str | None = None
