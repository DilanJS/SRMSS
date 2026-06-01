from datetime import datetime

from pydantic import BaseModel


class DashboardCountsResponse(BaseModel):
    total_routes: int
    active_routes: int
    total_vehicles: int
    available_buses: int
    assigned_vehicles: int
    total_drivers: int
    assigned_drivers: int
    active_trips: int
    delayed_trips: int
    completed_trips: int


class DashboardScheduleItem(BaseModel):
    schedule_id: str
    route_id: str
    vehicle_id: str
    driver_id: str
    departure_time: datetime
    arrival_time: datetime
    status: str
    emergency_update: bool


class DashboardUtilizationResponse(BaseModel):
    vehicle_utilization_percent: float
    driver_utilization_percent: float


class DashboardOverviewResponse(BaseModel):
    counts: DashboardCountsResponse
    utilization: DashboardUtilizationResponse
    live_schedule_window: list[DashboardScheduleItem]
