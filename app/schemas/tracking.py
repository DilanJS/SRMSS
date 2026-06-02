from pydantic import BaseModel, Field


class LocationUpdate(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    speed_kmh: float | None = Field(default=None, ge=0, le=300)
    heading: float | None = Field(default=None, ge=0, lt=360)


class VehicleLocationResponse(BaseModel):
    vehicle_id: str
    latitude: float
    longitude: float
    speed_kmh: float | None
    heading: float | None
    updated_at: str
    updated_by: str | None
