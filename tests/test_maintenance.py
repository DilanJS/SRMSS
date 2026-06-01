import importlib
import os
import tempfile
import unittest

from fastapi.testclient import TestClient


class MaintenanceModuleTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        os.environ["APP_STORAGE_DIR"] = self.temp_dir.name
        os.environ["APP_SECRET_KEY"] = "test-secret-key"
        os.environ["AUTH_PROVIDER"] = "memory"

        import app.config
        import app.firebase_config
        import app.services.auth_service
        import app.services.maintenance_service
        import app.services.vehicle_service
        import app.routes.auth
        import app.routes.maintenance
        import app.routes.vehicles
        import app.main

        app.config.get_settings.cache_clear()
        app.firebase_config.get_firebase_app.cache_clear()
        app.firebase_config.get_firebase_auth.cache_clear()
        app.firebase_config.get_firebase_db.cache_clear()
        importlib.reload(app.config)
        importlib.reload(app.services.auth_service)
        importlib.reload(app.services.vehicle_service)
        importlib.reload(app.services.maintenance_service)
        importlib.reload(app.routes.auth)
        importlib.reload(app.routes.vehicles)
        importlib.reload(app.routes.maintenance)
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

        vehicle = self.client.post(
            "/vehicles",
            headers=self.admin_headers,
            json={
                "registration_no": "NB-3300",
                "fleet_number": "BUS-33",
                "model": "B11R",
                "manufacturer": "Volvo",
                "capacity": 52,
                "mileage_km": 45000,
                "fuel_type": "diesel",
                "status": "available",
                "active": True,
            },
        )
        self.vehicle_id = vehicle.json()["id"]

    def tearDown(self) -> None:
        os.environ.pop("APP_STORAGE_DIR", None)
        os.environ.pop("APP_SECRET_KEY", None)
        os.environ.pop("AUTH_PROVIDER", None)
        self.temp_dir.cleanup()

    def test_fuel_and_maintenance_flow(self) -> None:
        fuel_log = self.client.post(
            "/maintenance/fuel-logs",
            headers=self.admin_headers,
            json={
                "vehicle_id": self.vehicle_id,
                "liters": 120.5,
                "cost": 35000,
                "odometer_km": 45200.5,
                "filled_at": "2026-06-02T07:30:00+00:00",
                "station_name": "IOC Depot Station",
                "notes": "Morning top-up"
            },
        )
        self.assertEqual(fuel_log.status_code, 201)

        list_fuel = self.client.get(
            f"/maintenance/fuel-logs?vehicle_id={self.vehicle_id}",
            headers=self.admin_headers,
        )
        self.assertEqual(list_fuel.status_code, 200)
        self.assertEqual(len(list_fuel.json()), 1)

        maintenance_log = self.client.post(
            "/maintenance/maintenance-logs",
            headers=self.admin_headers,
            json={
                "vehicle_id": self.vehicle_id,
                "service_type": "inspection",
                "status": "in_progress",
                "service_date": "2026-06-02",
                "next_due_date": "2026-07-02",
                "cost": 15000,
                "workshop_name": "Main Depot Workshop",
                "description": "Quarterly inspection"
            },
        )
        self.assertEqual(maintenance_log.status_code, 201)
        log_id = maintenance_log.json()["id"]

        vehicle_after_maintenance = self.client.get(
            f"/vehicles/{self.vehicle_id}",
            headers=self.admin_headers,
        )
        self.assertEqual(vehicle_after_maintenance.status_code, 200)
        self.assertEqual(vehicle_after_maintenance.json()["status"], "maintenance")

        update_maintenance = self.client.patch(
            f"/maintenance/maintenance-logs/{log_id}",
            headers=self.admin_headers,
            json={"status": "completed", "cost": 18000},
        )
        self.assertEqual(update_maintenance.status_code, 200)

        vehicle_after_completion = self.client.get(
            f"/vehicles/{self.vehicle_id}",
            headers=self.admin_headers,
        )
        self.assertEqual(vehicle_after_completion.status_code, 200)
        self.assertEqual(vehicle_after_completion.json()["status"], "available")

        list_maintenance = self.client.get(
            f"/maintenance/maintenance-logs?vehicle_id={self.vehicle_id}",
            headers=self.admin_headers,
        )
        self.assertEqual(list_maintenance.status_code, 200)
        self.assertEqual(len(list_maintenance.json()), 1)


if __name__ == "__main__":
    unittest.main()
