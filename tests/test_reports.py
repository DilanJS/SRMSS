import importlib
import os
import tempfile
import unittest

from fastapi.testclient import TestClient


class ReportingModuleTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        os.environ["APP_STORAGE_DIR"] = self.temp_dir.name
        os.environ["APP_SECRET_KEY"] = "test-secret-key"
        os.environ["AUTH_PROVIDER"] = "memory"

        import app.config
        import app.firebase_config
        import app.services.auth_service
        import app.services.driver_service
        import app.services.maintenance_service
        import app.services.report_service
        import app.services.route_service
        import app.services.schedule_service
        import app.services.vehicle_service
        import app.routes.auth
        import app.routes.drivers
        import app.routes.maintenance
        import app.routes.reports
        import app.routes.routes
        import app.routes.schedules
        import app.routes.vehicles
        import app.main

        app.config.get_settings.cache_clear()
        app.firebase_config.get_firebase_app.cache_clear()
        app.firebase_config.get_firebase_auth.cache_clear()
        app.firebase_config.get_firebase_db.cache_clear()
        importlib.reload(app.config)
        importlib.reload(app.services.auth_service)
        importlib.reload(app.services.route_service)
        importlib.reload(app.services.vehicle_service)
        importlib.reload(app.services.driver_service)
        importlib.reload(app.services.schedule_service)
        importlib.reload(app.services.maintenance_service)
        importlib.reload(app.services.report_service)
        importlib.reload(app.routes.auth)
        importlib.reload(app.routes.routes)
        importlib.reload(app.routes.vehicles)
        importlib.reload(app.routes.drivers)
        importlib.reload(app.routes.schedules)
        importlib.reload(app.routes.maintenance)
        importlib.reload(app.routes.reports)
        self.app_main = importlib.reload(app.main)
        self.client = TestClient(self.app_main.app)

        admin = self.client.post(
            "/auth/register",
            json={
                "email": "admin@srmss.local",
                "password": "Passw0rd!",
                "full_name": "Depot Admin",
                "role": "admin",
            },
        )
        self.admin_headers = {"Authorization": f"Bearer {admin.json()['access_token']}"}

        route = self.client.post(
            "/routes",
            headers=self.admin_headers,
            json={
                "route_code": "R-500",
                "route_name": "North Link",
                "start_point": "North Depot",
                "end_point": "Town Center",
                "distance_km": 30,
                "estimated_duration_minutes": 60,
                "service_type": "city",
                "active": True,
                "stops": [],
                "path_points": [],
            },
        )
        self.route_id = route.json()["id"]

        vehicle = self.client.post(
            "/vehicles",
            headers=self.admin_headers,
            json={
                "registration_no": "NB-5500",
                "fleet_number": "BUS-55",
                "model": "B10M",
                "manufacturer": "Volvo",
                "capacity": 50,
                "mileage_km": 70000,
                "fuel_type": "diesel",
                "status": "available",
                "active": True,
            },
        )
        self.vehicle_id = vehicle.json()["id"]

        driver = self.client.post(
            "/drivers",
            headers=self.admin_headers,
            json={
                "employee_no": "DRV-55",
                "full_name": "Ajith Kumar",
                "license_no": "B5566778",
                "phone_number": "0775555555",
                "years_of_experience": 12,
                "working_hours": 44,
                "status": "available",
                "active": True,
                "assigned_route_id": None,
                "assigned_vehicle_id": None,
                "hire_date": "2019-01-15",
                "assignment_history": [],
            },
        )
        self.driver_id = driver.json()["id"]

        self.client.post(
            "/schedules",
            headers=self.admin_headers,
            json={
                "route_id": self.route_id,
                "vehicle_id": self.vehicle_id,
                "driver_id": self.driver_id,
                "departure_time": "2026-06-02T06:00:00+00:00",
                "arrival_time": "2026-06-02T07:00:00+00:00",
                "status": "completed",
                "emergency_update": False,
            },
        )

        self.client.post(
            "/maintenance/fuel-logs",
            headers=self.admin_headers,
            json={
                "vehicle_id": self.vehicle_id,
                "liters": 90,
                "cost": 25000,
                "odometer_km": 70120,
                "filled_at": "2026-06-02T05:30:00+00:00",
            },
        )

        self.client.post(
            "/maintenance/maintenance-logs",
            headers=self.admin_headers,
            json={
                "vehicle_id": self.vehicle_id,
                "service_type": "inspection",
                "status": "completed",
                "service_date": "2026-06-02",
                "next_due_date": "2026-07-02",
                "cost": 12000,
                "workshop_name": "Main Depot Workshop",
            },
        )

    def tearDown(self) -> None:
        os.environ.pop("APP_STORAGE_DIR", None)
        os.environ.pop("APP_SECRET_KEY", None)
        os.environ.pop("AUTH_PROVIDER", None)
        self.temp_dir.cleanup()

    def test_reporting_overview(self) -> None:
        response = self.client.get("/reports/overview", headers=self.admin_headers)
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["operations_summary"]["total_routes"], 1)
        self.assertEqual(body["operations_summary"]["completed_schedules"], 1)
        self.assertEqual(body["operations_summary"]["total_fuel_cost"], 25000)
        self.assertEqual(body["operations_summary"]["total_maintenance_cost"], 12000)
        self.assertEqual(len(body["route_performance"]), 1)
        self.assertEqual(body["route_performance"][0]["trip_count"], 1)
        self.assertEqual(len(body["fuel_consumption"]), 1)
        self.assertEqual(len(body["maintenance_costs"]), 1)


if __name__ == "__main__":
    unittest.main()
