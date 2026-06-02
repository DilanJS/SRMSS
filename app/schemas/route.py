from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


ServiceType = Literal["city", "suburban", "express", "intercity", "school", "special"]


class RouteStop(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    sequence: int = Field(ge=1)


class RouteBase(BaseModel):
    route_code: str = Field(min_length=2, max_length=30)
    route_name: str = Field(min_length=3, max_length=120)
    start_point: str = Field(min_length=2, max_length=100)
    start_latitude: float | None = Field(default=None, ge=-90, le=90)
    start_longitude: float | None = Field(default=None, ge=-180, le=180)
    end_point: str = Field(min_length=2, max_length=100)
    end_latitude: float | None = Field(default=None, ge=-90, le=90)
    end_longitude: float | None = Field(default=None, ge=-180, le=180)
    distance_km: float = Field(gt=0, le=5000)
    estimated_duration_minutes: int = Field(gt=0, le=10080)
    service_type: ServiceType
    active: bool = True
    stops: list[RouteStop] = Field(default_factory=list)
    path_points: list[tuple[float, float]] = Field(default_factory=list)

    @field_validator("route_code")
    @classmethod
    def normalize_route_code(cls, value: str) -> str:
        return value.strip().upper()

    @field_validator("route_name", "start_point", "end_point")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("stops")
    @classmethod
    def validate_stops(cls, stops: list[RouteStop]) -> list[RouteStop]:
        if not stops:
            return stops
        sequences = sorted(stop.sequence for stop in stops)
        expected = list(range(1, len(stops) + 1))
        if sequences != expected:
            raise ValueError("Route stops must use contiguous sequence values starting from 1.")
        return stops


class RouteCreateRequest(RouteBase):
    pass


class RouteUpdateRequest(BaseModel):
    route_code: str | None = Field(default=None, min_length=2, max_length=30)
    route_name: str | None = Field(default=None, min_length=3, max_length=120)
    start_point: str | None = Field(default=None, min_length=2, max_length=100)
    start_latitude: float | None = Field(default=None, ge=-90, le=90)
    start_longitude: float | None = Field(default=None, ge=-180, le=180)
    end_point: str | None = Field(default=None, min_length=2, max_length=100)
    end_latitude: float | None = Field(default=None, ge=-90, le=90)
    end_longitude: float | None = Field(default=None, ge=-180, le=180)
    distance_km: float | None = Field(default=None, gt=0, le=5000)
    estimated_duration_minutes: int | None = Field(default=None, gt=0, le=10080)
    service_type: ServiceType | None = None
    active: bool | None = None
    stops: list[RouteStop] | None = None
    path_points: list[tuple[float, float]] | None = None

    @field_validator("route_code")
    @classmethod
    def normalize_route_code(cls, value: str | None) -> str | None:
        return value.strip().upper() if value is not None else value

    @field_validator("route_name", "start_point", "end_point")
    @classmethod
    def strip_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else value

    @field_validator("stops")
    @classmethod
    def validate_stops(cls, stops: list[RouteStop] | None) -> list[RouteStop] | None:
        if stops is None or not stops:
            return stops
        sequences = sorted(stop.sequence for stop in stops)
        expected = list(range(1, len(stops) + 1))
        if sequences != expected:
            raise ValueError("Route stops must use contiguous sequence values starting from 1.")
        return stops


class RouteResponse(RouteBase):
    id: str
    created_at: datetime
    updated_at: datetime
    created_by: str


class RouteMapResponse(BaseModel):
    id: str
    route_code: str
    route_name: str
    start_point: str
    start_latitude: float | None
    start_longitude: float | None
    end_point: str
    end_latitude: float | None
    end_longitude: float | None
    stops: list[RouteStop]
    path_points: list[tuple[float, float]]


class RouteListQuery(BaseModel):
    service_type: ServiceType | None = None
    active: bool | None = None
    search: str | None = None
