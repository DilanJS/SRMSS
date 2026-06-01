from datetime import datetime, timedelta, timezone

from app.schemas.dashboard import (
    DashboardCountsResponse,
    DashboardOverviewResponse,
    DashboardScheduleItem,
    DashboardUtilizationResponse,
)
from app.schemas.driver import DriverListQuery
from app.schemas.route import RouteListQuery
from app.schemas.schedule import ScheduleListQuery
from app.schemas.vehicle import VehicleListQuery
from app.services.driver_service import driver_manager
from app.services.route_service import route_manager
from app.services.schedule_service import schedule_manager
from app.services.vehicle_service import vehicle_manager


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class DashboardService:
    def get_overview(self) -> DashboardOverviewResponse:
        routes = route_manager.list_routes(RouteListQuery())
        vehicles = vehicle_manager.list_vehicles(VehicleListQuery())
        drivers = driver_manager.list_drivers(DriverListQuery())
        schedules = schedule_manager.list_schedules(ScheduleListQuery())

        counts = DashboardCountsResponse(
            total_routes=len(routes),
            active_routes=sum(1 for route in routes if route.active),
            total_vehicles=len(vehicles),
            available_buses=sum(1 for vehicle in vehicles if vehicle.status == "available"),
            assigned_vehicles=sum(1 for vehicle in vehicles if vehicle.status == "assigned"),
            total_drivers=len(drivers),
            assigned_drivers=sum(1 for driver in drivers if driver.status == "assigned"),
            active_trips=sum(1 for schedule in schedules if schedule.status in {"active", "emergency"}),
            delayed_trips=sum(1 for schedule in schedules if schedule.status == "delayed"),
            completed_trips=sum(1 for schedule in schedules if schedule.status == "completed"),
        )

        utilization = self._build_utilization(vehicles, drivers)
        live_schedule_window = self._build_live_schedule_window(schedules)

        return DashboardOverviewResponse(
            counts=counts,
            utilization=utilization,
            live_schedule_window=live_schedule_window,
        )

    def _build_utilization(self, vehicles, drivers) -> DashboardUtilizationResponse:
        vehicle_total = len(vehicles)
        driver_total = len(drivers)
        assigned_vehicle_count = sum(1 for vehicle in vehicles if vehicle.status == "assigned")
        assigned_driver_count = sum(1 for driver in drivers if driver.status == "assigned")

        return DashboardUtilizationResponse(
            vehicle_utilization_percent=round(
                (assigned_vehicle_count / vehicle_total * 100) if vehicle_total else 0.0, 2
            ),
            driver_utilization_percent=round(
                (assigned_driver_count / driver_total * 100) if driver_total else 0.0, 2
            ),
        )

    def _build_live_schedule_window(self, schedules) -> list[DashboardScheduleItem]:
        now = _utc_now()
        end_window = now + timedelta(hours=6)
        visible = [
            schedule
            for schedule in schedules
            if schedule.departure_time <= end_window
            and schedule.arrival_time >= now
            and schedule.status not in {"cancelled", "completed"}
        ]
        visible.sort(key=lambda item: item.departure_time)
        return [
            DashboardScheduleItem(
                schedule_id=schedule.id,
                route_id=schedule.route_id,
                vehicle_id=schedule.vehicle_id,
                driver_id=schedule.driver_id,
                departure_time=schedule.departure_time,
                arrival_time=schedule.arrival_time,
                status=schedule.status,
                emergency_update=schedule.emergency_update,
            )
            for schedule in visible[:20]
        ]


dashboard_service = DashboardService()
