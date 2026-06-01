from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


VehicleStatus = Literal["available", "assigned", "in_service", "maintenance", "inactive"]
FuelType = Literal["diesel", "petrol", "electric", "hybrid", "cng"]


class VehicleBase(BaseModel):
    registration_no: str = Field(min_length=4, max_length=20)
    fleet_number: str = Field(min_length=2, max_length=20)
    model: str = Field(min_length=2, max_length=100)
    manufacturer: str = Field(min_length=2, max_length=100)
    capacity: int = Field(ge=1, le=300)
    mileage_km: float = Field(ge=0, le=5_000_000)
    fuel_type: FuelType
    status: VehicleStatus = "available"
    active: bool = True
    assigned_route_id: str | None = None
    assigned_driver_id: str | None = None
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("registration_no", "fleet_number")
    @classmethod
    def normalize_codes(cls, value: str) -> str:
        return value.strip().upper()

    @field_validator("model", "manufacturer")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("notes")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else value


class VehicleCreateRequest(VehicleBase):
    pass


class VehicleUpdateRequest(BaseModel):
    registration_no: str | None = Field(default=None, min_length=4, max_length=20)
    fleet_number: str | None = Field(default=None, min_length=2, max_length=20)
    model: str | None = Field(default=None, min_length=2, max_length=100)
    manufacturer: str | None = Field(default=None, min_length=2, max_length=100)
    capacity: int | None = Field(default=None, ge=1, le=300)
    mileage_km: float | None = Field(default=None, ge=0, le=5_000_000)
    fuel_type: FuelType | None = None
    status: VehicleStatus | None = None
    active: bool | None = None
    assigned_route_id: str | None = None
    assigned_driver_id: str | None = None
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("registration_no", "fleet_number")
    @classmethod
    def normalize_codes(cls, value: str | None) -> str | None:
        return value.strip().upper() if value is not None else value

    @field_validator("model", "manufacturer")
    @classmethod
    def strip_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else value

    @field_validator("notes")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else value


class VehicleResponse(VehicleBase):
    id: str
    created_at: datetime
    updated_at: datetime
    created_by: str


class VehicleAvailabilityResponse(BaseModel):
    total: int
    available: int
    assigned: int
    in_service: int
    maintenance: int
    inactive: int


class VehicleListQuery(BaseModel):
    status: VehicleStatus | None = None
    active: bool | None = None
    fuel_type: FuelType | None = None
    search: str | None = None
