import importlib
import os
import tempfile
import unittest

from fastapi.testclient import TestClient


class ScheduleModuleTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        os.environ["APP_STORAGE_DIR"] = self.temp_dir.name
        os.environ["APP_SECRET_KEY"] = "test-secret-key"
        os.environ["AUTH_PROVIDER"] = "memory"

        import app.config
        import app.firebase_config
        import app.services.auth_service
        import app.services.driver_service
        import app.services.route_service
        import app.services.schedule_service
        import app.services.vehicle_service
        import app.routes.auth
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
        importlib.reload(app.routes.auth)
        importlib.reload(app.routes.routes)
        importlib.reload(app.routes.vehicles)
        importlib.reload(app.routes.drivers)
        importlib.reload(app.routes.schedules)
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
                "route_code": "R-100",
                "route_name": "Central Loop",
                "start_point": "Central Depot",
                "end_point": "Central Depot",
                "distance_km": 22.5,
                "estimated_duration_minutes": 70,
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
                "registration_no": "NB-1200",
                "fleet_number": "BUS-12",
                "model": "B8R",
                "manufacturer": "Volvo",
                "capacity": 48,
                "mileage_km": 10000,
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
                "employee_no": "DRV-10",
                "full_name": "Sunil Silva",
                "license_no": "B1234567",
                "phone_number": "0771111111",
                "years_of_experience": 6,
                "working_hours": 40,
                "status": "available",
                "active": True,
                "assigned_route_id": None,
                "assigned_vehicle_id": None,
                "hire_date": "2022-01-10",
                "assignment_history": [],
            },
        )
        self.driver_id = driver.json()["id"]

    def tearDown(self) -> None:
        os.environ.pop("APP_STORAGE_DIR", None)
        os.environ.pop("APP_SECRET_KEY", None)
        os.environ.pop("AUTH_PROVIDER", None)
        self.temp_dir.cleanup()

    def test_schedule_crud_and_conflict_detection(self) -> None:
        create = self.client.post(
            "/schedules",
            headers=self.admin_headers,
            json={
                "route_id": self.route_id,
                "vehicle_id": self.vehicle_id,
                "driver_id": self.driver_id,
                "departure_time": "2026-06-02T08:00:00+00:00",
                "arrival_time": "2026-06-02T10:00:00+00:00",
                "status": "scheduled",
                "emergency_update": False,
                "notes": "Morning route"
            },
        )
        self.assertEqual(create.status_code, 201)
        schedule_id = create.json()["id"]

        list_schedules = self.client.get("/schedules", headers=self.admin_headers)
        self.assertEqual(list_schedules.status_code, 200)
        self.assertEqual(len(list_schedules.json()), 1)

        conflict_check = self.client.post(
            "/schedules/conflicts",
            headers=self.admin_headers,
            json={
                "route_id": self.route_id,
                "vehicle_id": self.vehicle_id,
                "driver_id": self.driver_id,
                "departure_time": "2026-06-02T09:00:00+00:00",
                "arrival_time": "2026-06-02T11:00:00+00:00",
                "status": "scheduled",
                "emergency_update": False
            },
        )
        self.assertEqual(conflict_check.status_code, 200)
        self.assertTrue(conflict_check.json()["has_conflict"])

        conflicting_create = self.client.post(
            "/schedules",
            headers=self.admin_headers,
            json={
                "route_id": self.route_id,
                "vehicle_id": self.vehicle_id,
                "driver_id": self.driver_id,
                "departure_time": "2026-06-02T09:00:00+00:00",
                "arrival_time": "2026-06-02T11:00:00+00:00",
                "status": "scheduled",
                "emergency_update": False
            },
        )
        self.assertEqual(conflicting_create.status_code, 409)

        emergency_update = self.client.patch(
            f"/schedules/{schedule_id}/emergency",
            headers=self.admin_headers,
            json={
                "departure_time": "2026-06-02T08:30:00+00:00",
                "arrival_time": "2026-06-02T10:30:00+00:00",
                "notes": "Traffic disruption"
            },
        )
        self.assertEqual(emergency_update.status_code, 200)
        self.assertEqual(emergency_update.json()["status"], "emergency")
        self.assertTrue(emergency_update.json()["emergency_update"])

        delete = self.client.delete(f"/schedules/{schedule_id}", headers=self.admin_headers)
        self.assertEqual(delete.status_code, 200)

        missing = self.client.get(f"/schedules/{schedule_id}", headers=self.admin_headers)
        self.assertEqual(missing.status_code, 404)


if __name__ == "__main__":
    unittest.main()
