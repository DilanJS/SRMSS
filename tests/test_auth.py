import importlib
import os
import tempfile
import unittest

from fastapi.testclient import TestClient


class AuthenticationModuleTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        os.environ["APP_STORAGE_DIR"] = self.temp_dir.name
        os.environ["APP_SECRET_KEY"] = "test-secret-key"

        import app.config
        import app.services.auth_service
        import app.routes.auth
        import app.main

        app.config.get_settings.cache_clear()
        importlib.reload(app.config)
        importlib.reload(app.services.auth_service)
        importlib.reload(app.routes.auth)
        self.app_main = importlib.reload(app.main)
        self.client = TestClient(self.app_main.app)

    def tearDown(self) -> None:
        os.environ.pop("APP_STORAGE_DIR", None)
        os.environ.pop("APP_SECRET_KEY", None)
        self.temp_dir.cleanup()

    def test_authentication_and_user_management_flow(self) -> None:
        bootstrap = self.client.post(
            "/auth/register",
            json={
                "email": "admin@srmss.local",
                "password": "Passw0rd!",
                "full_name": "Depot Admin",
                "role": "admin",
            },
        )
        self.assertEqual(bootstrap.status_code, 201)
        bootstrap_body = bootstrap.json()
        access_token = bootstrap_body["access_token"]
        admin_id = bootstrap_body["user"]["id"]
        headers = {"Authorization": f"Bearer {access_token}"}

        public_admin_signup = self.client.post(
            "/auth/register",
            json={
                "email": "second-admin@srmss.local",
                "password": "Passw0rd!",
                "full_name": "Second Admin",
                "role": "admin",
            },
        )
        self.assertEqual(public_admin_signup.status_code, 403)

        create_user = self.client.post(
            "/auth/users",
            headers=headers,
            json={
                "email": "manager@srmss.local",
                "password": "Passw0rd!",
                "full_name": "Ops Manager",
                "role": "manager",
            },
        )
        self.assertEqual(create_user.status_code, 201)
        manager_id = create_user.json()["id"]

        list_users = self.client.get("/auth/users", headers=headers)
        self.assertEqual(list_users.status_code, 200)
        self.assertEqual(len(list_users.json()), 2)

        update_self = self.client.patch(
            "/auth/me",
            headers=headers,
            json={"full_name": "Main Depot Admin"},
        )
        self.assertEqual(update_self.status_code, 200)
        self.assertEqual(update_self.json()["full_name"], "Main Depot Admin")

        user_detail = self.client.get(f"/auth/users/{manager_id}", headers=headers)
        self.assertEqual(user_detail.status_code, 200)
        self.assertEqual(user_detail.json()["email"], "manager@srmss.local")

        sessions = self.client.get("/auth/sessions", headers=headers)
        self.assertEqual(sessions.status_code, 200)
        self.assertEqual(len(sessions.json()), 1)
        self.assertTrue(sessions.json()[0]["is_active"])

        delete_self = self.client.delete(f"/auth/users/{admin_id}", headers=headers)
        self.assertEqual(delete_self.status_code, 400)

        delete_manager = self.client.delete(f"/auth/users/{manager_id}", headers=headers)
        self.assertEqual(delete_manager.status_code, 200)

        logout = self.client.post("/auth/logout", headers=headers)
        self.assertEqual(logout.status_code, 200)

        me_after_logout = self.client.get("/auth/me", headers=headers)
        self.assertEqual(me_after_logout.status_code, 401)


if __name__ == "__main__":
    unittest.main()
