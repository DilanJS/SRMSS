import importlib
import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient


class DashboardModuleTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        os.environ["APP_STORAGE_DIR"] = self.temp_dir.name
        os.environ["APP_SECRET_KEY"] = "test-secret-key"
        os.environ["AUTH_PROVIDER"] = "memory"

        import app.config
        import app.firebase_config
        import app.services.auth_service
        import app.services.dashboard_service
        import app.services.driver_service
        import app.services.route_service
        import app.services.schedule_service
        import app.services.vehicle_service
        import app.routes.auth
        import app.routes.dashboard
        import app.routes.drivers
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
        importlib.reload(app.services.dashboard_service)
        importlib.reload(app.routes.auth)
        importlib.reload(app.routes.routes)
        importlib.reload(app.routes.vehicles)
        importlib.reload(app.routes.drivers)
        importlib.reload(app.routes.schedules)
        importlib.reload(app.routes.dashboard)
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

        manager = self.client.post(
            "/auth/users",
            headers=self.admin_headers,
            json={
                "email": "manager@srmss.local",
                "password": "Passw0rd!",
                "full_name": "Ops Manager",
                "role": "manager",
            },
        )
        self.manager_headers = {"Authorization": f"Bearer {manager.json()['id'] and admin.json()['access_token']}"}
        login_manager = self.client.post(
            "/auth/login",
            json={"email": "manager@srmss.local", "password": "Passw0rd!"},
        )
        self.manager_headers = {"Authorization": f"Bearer {login_manager.json()['access_token']}"}

        route = self.client.post(
            "/routes",
            headers=self.admin_headers,
            json={
                "route_code": "R-200",
                "route_name": "East Loop",
                "start_point": "East Depot",
                "end_point": "East Depot",
                "distance_km": 16,
                "estimated_duration_minutes": 45,
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
                "registration_no": "NB-2200",
                "fleet_number": "BUS-22",
                "model": "B7R",
                "manufacturer": "Volvo",
                "capacity": 50,
                "mileage_km": 5000,
                "fuel_type": "diesel",
                "status": "assigned",
                "active": True,
            },
        )
        self.vehicle_id = vehicle.json()["id"]

        driver = self.client.post(
            "/drivers",
            headers=self.admin_headers,
            json={
                "employee_no": "DRV-22",
                "full_name": "Nimal Fernando",
                "license_no": "B9988776",
                "phone_number": "0772222222",
                "years_of_experience": 10,
                "working_hours": 38,
                "status": "assigned",
                "active": True,
                "assigned_route_id": self.route_id,
                "assigned_vehicle_id": self.vehicle_id,
                "hire_date": "2020-05-01",
                "assignment_history": [],
            },
        )
        self.driver_id = driver.json()["id"]

        now = datetime.now(timezone.utc)
        self.client.post(
            "/schedules",
            headers=self.admin_headers,
            json={
                "route_id": self.route_id,
                "vehicle_id": self.vehicle_id,
                "driver_id": self.driver_id,
                "departure_time": (now + timedelta(minutes=30)).isoformat(),
                "arrival_time": (now + timedelta(hours=2)).isoformat(),
                "status": "active",
                "emergency_update": False,
            },
        )

    def tearDown(self) -> None:
        os.environ.pop("APP_STORAGE_DIR", None)
        os.environ.pop("APP_SECRET_KEY", None)
        os.environ.pop("AUTH_PROVIDER", None)
        self.temp_dir.cleanup()

    def test_dashboard_overview(self) -> None:
        response = self.client.get("/dashboard/overview", headers=self.manager_headers)
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["counts"]["total_routes"], 1)
        self.assertEqual(body["counts"]["total_vehicles"], 1)
        self.assertEqual(body["counts"]["total_drivers"], 1)
        self.assertEqual(body["counts"]["active_trips"], 1)
        self.assertEqual(body["counts"]["assigned_vehicles"], 1)
        self.assertEqual(body["counts"]["assigned_drivers"], 1)
        self.assertEqual(len(body["live_schedule_window"]), 1)
        self.assertGreaterEqual(body["utilization"]["vehicle_utilization_percent"], 100.0)


if __name__ == "__main__":
    unittest.main()
