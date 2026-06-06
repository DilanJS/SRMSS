from app.schemas.driver import DriverListQuery
from app.schemas.maintenance import FuelLogListQuery, MaintenanceLogListQuery
from app.schemas.report import (
    DriverPerformanceItem,
    FuelConsumptionItem,
    MaintenanceCostItem,
    OperationsSummaryResponse,
    ReportRangeQuery,
    ReportingOverviewResponse,
    RoutePerformanceItem,
)
from app.schemas.route import RouteListQuery
from app.schemas.schedule import ScheduleListQuery
from app.schemas.vehicle import VehicleListQuery
from app.services.driver_service import driver_manager
from app.services.maintenance_service import maintenance_manager
from app.services.route_service import route_manager
from app.services.schedule_service import schedule_manager
from app.services.vehicle_service import vehicle_manager


class ReportService:
    def get_reporting_overview(self, query: ReportRangeQuery) -> ReportingOverviewResponse:
        routes = route_manager.list_routes(RouteListQuery())
        schedules = schedule_manager.list_schedules(
            ScheduleListQuery(date_from=query.date_from, date_to=query.date_to)
        )
        fuel_logs = maintenance_manager.list_fuel_logs(
            FuelLogListQuery(date_from=query.date_from, date_to=query.date_to)
        )
        maintenance_logs = maintenance_manager.list_maintenance_logs(MaintenanceLogListQuery())
        vehicles = {vehicle.id: vehicle for vehicle in vehicle_manager.list_vehicles(VehicleListQuery())}

        drivers = {d.id: d for d in driver_manager.list_drivers(DriverListQuery())}
        route_performance = self._build_route_performance(routes, schedules)
        fuel_consumption = self._build_fuel_consumption(vehicles, fuel_logs)
        maintenance_costs = self._build_maintenance_costs(vehicles, maintenance_logs)
        driver_performance = self._build_driver_performance(schedules, drivers)
        operations_summary = self._build_operations_summary(routes, schedules, fuel_logs, maintenance_logs)

        return ReportingOverviewResponse(
            route_performance=route_performance,
            fuel_consumption=fuel_consumption,
            maintenance_costs=maintenance_costs,
            driver_performance=driver_performance,
            operations_summary=operations_summary,
        )

    def _build_route_performance(self, routes, schedules) -> list[RoutePerformanceItem]:
        items: list[RoutePerformanceItem] = []
        for route in routes:
            related = [schedule for schedule in schedules if schedule.route_id == route.id]
            total = len(related)
            completed = sum(1 for schedule in related if schedule.status == "completed")
            items.append(
                RoutePerformanceItem(
                    route_id=route.id,
                    route_code=route.route_code,
                    route_name=route.route_name,
                    trip_count=total,
                    completed_trips=completed,
                    delayed_trips=sum(1 for schedule in related if schedule.status == "delayed"),
                    emergency_trips=sum(1 for schedule in related if schedule.status == "emergency"),
                    completion_rate=round(completed / total * 100, 1) if total > 0 else 0.0,
                )
            )
        items.sort(key=lambda item: item.trip_count, reverse=True)
        return items

    def _build_driver_performance(self, schedules, drivers: dict) -> list[DriverPerformanceItem]:
        grouped: dict[str, list] = {}
        for schedule in schedules:
            grouped.setdefault(schedule.driver_id, []).append(schedule)
        items: list[DriverPerformanceItem] = []
        for driver_id, driver_schedules in grouped.items():
            driver = drivers.get(driver_id)
            driver_name = driver.full_name if driver else "Unknown Driver"
            total = len(driver_schedules)
            completed = sum(1 for s in driver_schedules if s.status == "completed")
            delayed = sum(1 for s in driver_schedules if s.status == "delayed")
            items.append(
                DriverPerformanceItem(
                    driver_id=driver_id,
                    driver_name=driver_name,
                    trip_count=total,
                    completed_trips=completed,
                    delayed_trips=delayed,
                    completion_rate=round(completed / total * 100, 1) if total > 0 else 0.0,
                )
            )
        items.sort(key=lambda item: item.completion_rate, reverse=True)
        return items

    def _build_fuel_consumption(self, vehicles, fuel_logs) -> list[FuelConsumptionItem]:
        grouped: dict[str, list] = {}
        for log in fuel_logs:
            grouped.setdefault(log.vehicle_id, []).append(log)

        items: list[FuelConsumptionItem] = []
        for vehicle_id, logs in grouped.items():
            vehicle = vehicles.get(vehicle_id)
            registration_no = vehicle.registration_no if vehicle else "UNKNOWN"
            total_liters = round(sum(log.liters for log in logs), 2)
            odometers = [log.odometer_km for log in logs]
            distance_km = max(odometers) - min(odometers) if len(odometers) >= 2 else 0
            efficiency = round(total_liters / distance_km * 100, 2) if distance_km > 0 else None
            items.append(
                FuelConsumptionItem(
                    vehicle_id=vehicle_id,
                    registration_no=registration_no,
                    total_liters=total_liters,
                    total_cost=round(sum(log.cost for log in logs), 2),
                    log_count=len(logs),
                    avg_efficiency_l_per_100km=efficiency,
                )
            )
        items.sort(key=lambda item: item.total_cost, reverse=True)
        return items

    def _build_maintenance_costs(self, vehicles, maintenance_logs) -> list[MaintenanceCostItem]:
        grouped: dict[str, list] = {}
        for log in maintenance_logs:
            grouped.setdefault(log.vehicle_id, []).append(log)

        items: list[MaintenanceCostItem] = []
        for vehicle_id, logs in grouped.items():
            vehicle = vehicles.get(vehicle_id)
            registration_no = vehicle.registration_no if vehicle else "UNKNOWN"
            items.append(
                MaintenanceCostItem(
                    vehicle_id=vehicle_id,
                    registration_no=registration_no,
                    total_cost=round(sum(log.cost for log in logs), 2),
                    maintenance_count=len(logs),
                    in_progress_count=sum(1 for log in logs if log.status == "in_progress"),
                )
            )
        items.sort(key=lambda item: item.total_cost, reverse=True)
        return items

    def _build_operations_summary(self, routes, schedules, fuel_logs, maintenance_logs) -> OperationsSummaryResponse:
        return OperationsSummaryResponse(
            total_routes=len(routes),
            total_schedules=len(schedules),
            completed_schedules=sum(1 for schedule in schedules if schedule.status == "completed"),
            active_schedules=sum(1 for schedule in schedules if schedule.status == "active"),
            delayed_schedules=sum(1 for schedule in schedules if schedule.status == "delayed"),
            emergency_schedules=sum(1 for schedule in schedules if schedule.status == "emergency"),
            cancelled_schedules=sum(1 for schedule in schedules if schedule.status == "cancelled"),
            total_fuel_cost=round(sum(log.cost for log in fuel_logs), 2),
            total_maintenance_cost=round(sum(log.cost for log in maintenance_logs), 2),
        )


report_service = ReportService()
