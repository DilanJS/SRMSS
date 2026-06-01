import importlib
import os
import tempfile
import unittest

from fastapi.testclient import TestClient


class RouteModuleTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        os.environ["APP_STORAGE_DIR"] = self.temp_dir.name
        os.environ["APP_SECRET_KEY"] = "test-secret-key"
        os.environ["AUTH_PROVIDER"] = "memory"

        import app.config
        import app.firebase_config
        import app.services.auth_service
        import app.services.route_service
        import app.routes.auth
        import app.routes.routes
        import app.main

        app.config.get_settings.cache_clear()
        app.firebase_config.get_firebase_app.cache_clear()
        app.firebase_config.get_firebase_auth.cache_clear()
        app.firebase_config.get_firebase_db.cache_clear()
        importlib.reload(app.config)
        importlib.reload(app.services.auth_service)
        importlib.reload(app.services.route_service)
        importlib.reload(app.routes.auth)
        importlib.reload(app.routes.routes)
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

    def test_route_crud_and_visualization(self) -> None:
        create = self.client.post(
            "/routes",
            headers=self.admin_headers,
            json={
                "route_code": "R-101",
                "route_name": "Central to Harbor",
                "start_point": "Central Depot",
                "end_point": "Harbor Terminal",
                "distance_km": 18.5,
                "estimated_duration_minutes": 50,
                "service_type": "city",
                "active": True,
                "stops": [
                    {"name": "Central Depot", "latitude": 6.9271, "longitude": 79.8612, "sequence": 1},
                    {"name": "Harbor Terminal", "latitude": 6.9521, "longitude": 79.8445, "sequence": 2},
                ],
                "path_points": [[6.9271, 79.8612], [6.9521, 79.8445]],
            },
        )
        self.assertEqual(create.status_code, 201)
        route_id = create.json()["id"]

        list_routes = self.client.get("/routes", headers=self.user_headers)
        self.assertEqual(list_routes.status_code, 200)
        self.assertEqual(len(list_routes.json()), 1)

        filtered = self.client.get("/routes?search=harbor", headers=self.user_headers)
        self.assertEqual(filtered.status_code, 200)
        self.assertEqual(len(filtered.json()), 1)

        route_detail = self.client.get(f"/routes/{route_id}", headers=self.user_headers)
        self.assertEqual(route_detail.status_code, 200)
        self.assertEqual(route_detail.json()["route_code"], "R-101")

        route_map = self.client.get(f"/routes/{route_id}/map", headers=self.user_headers)
        self.assertEqual(route_map.status_code, 200)
        self.assertEqual(len(route_map.json()["stops"]), 2)

        update = self.client.patch(
            f"/routes/{route_id}",
            headers=self.admin_headers,
            json={"distance_km": 20.0, "estimated_duration_minutes": 55},
        )
        self.assertEqual(update.status_code, 200)
        self.assertEqual(update.json()["distance_km"], 20.0)

        forbidden_create = self.client.post(
            "/routes",
            headers=self.user_headers,
            json={
                "route_code": "R-102",
                "route_name": "Unauthorized Route",
                "start_point": "A",
                "end_point": "B",
                "distance_km": 10,
                "estimated_duration_minutes": 20,
                "service_type": "city",
                "active": True,
            },
        )
        self.assertEqual(forbidden_create.status_code, 403)

        delete = self.client.delete(f"/routes/{route_id}", headers=self.admin_headers)
        self.assertEqual(delete.status_code, 200)

        missing_after_delete = self.client.get(f"/routes/{route_id}", headers=self.user_headers)
        self.assertEqual(missing_after_delete.status_code, 404)


if __name__ == "__main__":
    unittest.main()
