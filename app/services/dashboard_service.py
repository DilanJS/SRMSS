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


def _compute_on_time_status(schedule, now: datetime) -> str:
    if schedule.status == "active":
        return "on-time" if now <= schedule.arrival_time else "overrunning"
    return schedule.status


class DashboardService:
    def get_overview(self) -> DashboardOverviewResponse:
        routes = route_manager.list_routes(RouteListQuery())
        vehicles = vehicle_manager.list_vehicles(VehicleListQuery())
        drivers = driver_manager.list_drivers(DriverListQuery())
        schedules = schedule_manager.list_schedules(ScheduleListQuery())

        routes_by_id = {r.id: r for r in routes}
        vehicles_by_id = {v.id: v for v in vehicles}
        drivers_by_id = {d.id: d for d in drivers}

        now = _utc_now()
        active_schedules = [s for s in schedules if s.status in {"active", "emergency"}]
        on_time_trips = sum(1 for s in active_schedules if _compute_on_time_status(s, now) == "on-time")

        counts = DashboardCountsResponse(
            total_routes=len(routes),
            active_routes=sum(1 for route in routes if route.active),
            total_vehicles=len(vehicles),
            available_buses=sum(1 for vehicle in vehicles if vehicle.status == "available"),
            assigned_vehicles=sum(1 for vehicle in vehicles if vehicle.status == "assigned"),
            total_drivers=len(drivers),
            assigned_drivers=sum(1 for driver in drivers if driver.status == "assigned"),
            active_trips=len(active_schedules),
            on_time_trips=on_time_trips,
            delayed_trips=sum(1 for schedule in schedules if schedule.status == "delayed"),
            completed_trips=sum(1 for schedule in schedules if schedule.status == "completed"),
        )

        utilization = self._build_utilization(vehicles, drivers)
        live_schedule_window = self._build_live_schedule_window(
            schedules, now, routes_by_id, vehicles_by_id, drivers_by_id
        )

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

    def _build_live_schedule_window(
        self, schedules, now: datetime, routes_by_id: dict, vehicles_by_id: dict, drivers_by_id: dict
    ) -> list[DashboardScheduleItem]:
        end_window = now + timedelta(hours=6)
        visible = [
            schedule
            for schedule in schedules
            if schedule.departure_time <= end_window
            and schedule.arrival_time >= now
            and schedule.status not in {"cancelled", "completed"}
        ]
        visible.sort(key=lambda item: item.departure_time)
        items = []
        for schedule in visible[:20]:
            route = routes_by_id.get(schedule.route_id)
            vehicle = vehicles_by_id.get(schedule.vehicle_id)
            driver = drivers_by_id.get(schedule.driver_id)
            items.append(DashboardScheduleItem(
                schedule_id=schedule.id,
                route_id=schedule.route_id,
                vehicle_id=schedule.vehicle_id,
                driver_id=schedule.driver_id,
                departure_time=schedule.departure_time,
                arrival_time=schedule.arrival_time,
                status=schedule.status,
                emergency_update=schedule.emergency_update,
                on_time_status=_compute_on_time_status(schedule, now),
                route_code=route.route_code if route else "",
                route_name=route.route_name if route else "",
                vehicle_registration=vehicle.registration_no if vehicle else "",
                driver_name=driver.full_name if driver else "",
            ))
        return items


dashboard_service = DashboardService()
