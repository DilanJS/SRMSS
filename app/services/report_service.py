from app.schemas.driver import DriverListQuery
from app.schemas.maintenance import FuelLogListQuery, MaintenanceLogListQuery
from app.schemas.report import (
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

        route_performance = self._build_route_performance(routes, schedules)
        fuel_consumption = self._build_fuel_consumption(vehicles, fuel_logs)
        maintenance_costs = self._build_maintenance_costs(vehicles, maintenance_logs)
        operations_summary = self._build_operations_summary(routes, schedules, fuel_logs, maintenance_logs)

        return ReportingOverviewResponse(
            route_performance=route_performance,
            fuel_consumption=fuel_consumption,
            maintenance_costs=maintenance_costs,
            operations_summary=operations_summary,
        )

    def _build_route_performance(self, routes, schedules) -> list[RoutePerformanceItem]:
        items: list[RoutePerformanceItem] = []
        for route in routes:
            related = [schedule for schedule in schedules if schedule.route_id == route.id]
            items.append(
                RoutePerformanceItem(
                    route_id=route.id,
                    route_code=route.route_code,
                    route_name=route.route_name,
                    trip_count=len(related),
                    completed_trips=sum(1 for schedule in related if schedule.status == "completed"),
                    delayed_trips=sum(1 for schedule in related if schedule.status == "delayed"),
                    emergency_trips=sum(1 for schedule in related if schedule.status == "emergency"),
                )
            )
        items.sort(key=lambda item: item.trip_count, reverse=True)
        return items

    def _build_fuel_consumption(self, vehicles, fuel_logs) -> list[FuelConsumptionItem]:
        grouped: dict[str, list] = {}
        for log in fuel_logs:
            grouped.setdefault(log.vehicle_id, []).append(log)

        items: list[FuelConsumptionItem] = []
        for vehicle_id, logs in grouped.items():
            vehicle = vehicles.get(vehicle_id)
            registration_no = vehicle.registration_no if vehicle else "UNKNOWN"
            items.append(
                FuelConsumptionItem(
                    vehicle_id=vehicle_id,
                    registration_no=registration_no,
                    total_liters=round(sum(log.liters for log in logs), 2),
                    total_cost=round(sum(log.cost for log in logs), 2),
                    log_count=len(logs),
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
            total_fuel_cost=round(sum(log.cost for log in fuel_logs), 2),
            total_maintenance_cost=round(sum(log.cost for log in maintenance_logs), 2),
        )


report_service = ReportService()
