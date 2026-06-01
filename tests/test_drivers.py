import importlib
import os
import tempfile
import unittest

from fastapi.testclient import TestClient


class DriverModuleTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        os.environ["APP_STORAGE_DIR"] = self.temp_dir.name
        os.environ["APP_SECRET_KEY"] = "test-secret-key"
        os.environ["AUTH_PROVIDER"] = "memory"

        import app.config
        import app.firebase_config
        import app.services.auth_service
        import app.services.driver_service
        import app.routes.auth
        import app.routes.drivers
        import app.main

        app.config.get_settings.cache_clear()
        app.firebase_config.get_firebase_app.cache_clear()
        app.firebase_config.get_firebase_auth.cache_clear()
        app.firebase_config.get_firebase_db.cache_clear()
        importlib.reload(app.config)
        importlib.reload(app.services.auth_service)
        importlib.reload(app.services.driver_service)
        importlib.reload(app.routes.auth)
        importlib.reload(app.routes.drivers)
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

    def test_driver_crud_and_availability(self) -> None:
        create = self.client.post(
            "/drivers",
            headers=self.admin_headers,
            json={
                "employee_no": "DRV-01",
                "full_name": "Kamal Perera",
                "license_no": "B7654321",
                "phone_number": "0771234567",
                "years_of_experience": 8,
                "working_hours": 42,
                "status": "available",
                "active": True,
                "assigned_route_id": None,
                "assigned_vehicle_id": None,
                "hire_date": "2021-03-01",
                "notes": "Long-distance qualified",
                "assignment_history": []
            },
        )
        self.assertEqual(create.status_code, 201)
        driver_id = create.json()["id"]

        list_drivers = self.client.get("/drivers", headers=self.user_headers)
        self.assertEqual(list_drivers.status_code, 200)
        self.assertEqual(len(list_drivers.json()), 1)

        filtered = self.client.get("/drivers?search=kamal", headers=self.user_headers)
        self.assertEqual(filtered.status_code, 200)
        self.assertEqual(len(filtered.json()), 1)

        detail = self.client.get(f"/drivers/{driver_id}", headers=self.user_headers)
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()["license_no"], "B7654321")

        update = self.client.patch(
            f"/drivers/{driver_id}",
            headers=self.admin_headers,
            json={
                "status": "assigned",
                "assigned_vehicle_id": "vehicle-1",
                "assigned_route_id": "route-1",
                "assignment_history": [
                    {
                        "route_id": "route-1",
                        "vehicle_id": "vehicle-1",
                        "assigned_at": "2026-06-02T08:00:00+00:00",
                        "released_at": None,
                        "notes": "Morning shift"
                    }
                ]
            },
        )
        self.assertEqual(update.status_code, 200)
        self.assertEqual(update.json()["status"], "assigned")
        self.assertEqual(len(update.json()["assignment_history"]), 1)

        availability = self.client.get("/drivers/availability", headers=self.user_headers)
        self.assertEqual(availability.status_code, 200)
        self.assertEqual(availability.json()["assigned"], 1)

        forbidden_create = self.client.post(
            "/drivers",
            headers=self.user_headers,
            json={
                "employee_no": "DRV-02",
                "full_name": "Unauthorized User",
                "license_no": "C1234567",
                "phone_number": "0710000000",
                "years_of_experience": 2,
                "working_hours": 20,
                "status": "available",
                "active": True,
                "assigned_route_id": None,
                "assigned_vehicle_id": None,
                "hire_date": "2024-01-01",
                "assignment_history": []
            },
        )
        self.assertEqual(forbidden_create.status_code, 403)

        delete = self.client.delete(f"/drivers/{driver_id}", headers=self.admin_headers)
        self.assertEqual(delete.status_code, 200)

        missing = self.client.get(f"/drivers/{driver_id}", headers=self.user_headers)
        self.assertEqual(missing.status_code, 404)


if __name__ == "__main__":
    unittest.main()
