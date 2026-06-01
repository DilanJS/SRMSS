from functools import lru_cache

import pyrebase

from app.config import get_settings


def _build_config() -> dict[str, str]:
    settings = get_settings()
    config = {
        "apiKey": settings.firebase_api_key,
        "authDomain": settings.firebase_auth_domain,
        "databaseURL": settings.firebase_database_url,
        "projectId": settings.firebase_project_id,
        "storageBucket": settings.firebase_storage_bucket,
        "messagingSenderId": settings.firebase_messaging_sender_id,
        "appId": settings.firebase_app_id,
    }
    missing = [key for key, value in config.items() if not value]
    if missing:
        raise RuntimeError(
            "Missing Firebase configuration values: " + ", ".join(missing)
        )
    return config


@lru_cache
def get_firebase_app():
    return pyrebase.initialize_app(_build_config())


@lru_cache
def get_firebase_auth():
    return get_firebase_app().auth()


@lru_cache
def get_firebase_db():
    return get_firebase_app().database()
