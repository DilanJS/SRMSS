from datetime import datetime

from pydantic import BaseModel


class ReportRangeQuery(BaseModel):
    date_from: datetime | None = None
    date_to: datetime | None = None


class RoutePerformanceItem(BaseModel):
    route_id: str
    route_code: str
    route_name: str
    trip_count: int
    completed_trips: int
    delayed_trips: int
    emergency_trips: int


class FuelConsumptionItem(BaseModel):
    vehicle_id: str
    registration_no: str
    total_liters: float
    total_cost: float
    log_count: int


class MaintenanceCostItem(BaseModel):
    vehicle_id: str
    registration_no: str
    total_cost: float
    maintenance_count: int
    in_progress_count: int


class OperationsSummaryResponse(BaseModel):
    total_routes: int
    total_schedules: int
    completed_schedules: int
    active_schedules: int
    delayed_schedules: int
    emergency_schedules: int
    total_fuel_cost: float
    total_maintenance_cost: float


class ReportingOverviewResponse(BaseModel):
    route_performance: list[RoutePerformanceItem]
    fuel_consumption: list[FuelConsumptionItem]
    maintenance_costs: list[MaintenanceCostItem]
    operations_summary: OperationsSummaryResponse
