import importlib
import os
import tempfile
import unittest

from fastapi.testclient import TestClient


class VehicleModuleTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        os.environ["APP_STORAGE_DIR"] = self.temp_dir.name
        os.environ["APP_SECRET_KEY"] = "test-secret-key"
        os.environ["AUTH_PROVIDER"] = "memory"

        import app.config
        import app.firebase_config
        import app.services.auth_service
        import app.services.vehicle_service
        import app.routes.auth
        import app.routes.vehicles
        import app.main

        app.config.get_settings.cache_clear()
        app.firebase_config.get_firebase_app.cache_clear()
        app.firebase_config.get_firebase_auth.cache_clear()
        app.firebase_config.get_firebase_db.cache_clear()
        importlib.reload(app.config)
        importlib.reload(app.services.auth_service)
        importlib.reload(app.services.vehicle_service)
        importlib.reload(app.routes.auth)
        importlib.reload(app.routes.vehicles)
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

        user = self.client.post(
            "/auth/register",
            json={
                "email": "user@srmss.local",
                "password": "Passw0rd!",
                "full_name": "Regular User",
                "role": "user",
            },
        )
        self.user_headers = {"Authorization": f"Bearer {user.json()['access_token']}"}

    def tearDown(self) -> None:
        os.environ.pop("APP_STORAGE_DIR", None)
        os.environ.pop("APP_SECRET_KEY", None)
        os.environ.pop("AUTH_PROVIDER", None)
        self.temp_dir.cleanup()

    def test_vehicle_crud_and_availability(self) -> None:
        create = self.client.post(
            "/vehicles",
            headers=self.admin_headers,
            json={
                "registration_no": "NB-1234",
                "fleet_number": "BUS-01",
                "model": "B9R",
                "manufacturer": "Volvo",
                "capacity": 54,
                "mileage_km": 125000.5,
                "fuel_type": "diesel",
                "status": "available",
                "active": True,
                "notes": "Primary city bus"
            },
        )
        self.assertEqual(create.status_code, 201)
        vehicle_id = create.json()["id"]

        list_vehicles = self.client.get("/vehicles", headers=self.user_headers)
        self.assertEqual(list_vehicles.status_code, 200)
        self.assertEqual(len(list_vehicles.json()), 1)

        filtered = self.client.get("/vehicles?search=volvo", headers=self.user_headers)
        self.assertEqual(filtered.status_code, 200)
        self.assertEqual(len(filtered.json()), 1)

        detail = self.client.get(f"/vehicles/{vehicle_id}", headers=self.user_headers)
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()["registration_no"], "NB-1234")

        update = self.client.patch(
            f"/vehicles/{vehicle_id}",
            headers=self.admin_headers,
            json={"status": "maintenance", "active": False},
        )
        self.assertEqual(update.status_code, 200)
        self.assertEqual(update.json()["status"], "maintenance")

        availability = self.client.get("/vehicles/availability", headers=self.user_headers)
        self.assertEqual(availability.status_code, 200)
        self.assertEqual(availability.json()["maintenance"], 1)

        forbidden_create = self.client.post(
            "/vehicles",
            headers=self.user_headers,
            json={
                "registration_no": "NB-9999",
                "fleet_number": "BUS-99",
                "model": "X",
                "manufacturer": "Y",
                "capacity": 40,
                "mileage_km": 1000,
                "fuel_type": "diesel",
                "status": "available",
                "active": True,
            },
        )
        self.assertEqual(forbidden_create.status_code, 403)

        delete = self.client.delete(f"/vehicles/{vehicle_id}", headers=self.admin_headers)
        self.assertEqual(delete.status_code, 200)

        missing = self.client.get(f"/vehicles/{vehicle_id}", headers=self.user_headers)
        self.assertEqual(missing.status_code, 404)


if __name__ == "__main__":
    unittest.main()
