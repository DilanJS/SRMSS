from functools import lru_cache
from os import environ, getenv
from pathlib import Path


def _load_dotenv() -> None:
    env_path = Path(".env")
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in environ:
            environ[key] = value


_load_dotenv()


class Settings:
    def __init__(self) -> None:
        self.app_name = getenv("APP_NAME", "SRMSS API")
        self.auth_provider = getenv("AUTH_PROVIDER", "memory").lower()
        self.secret_key = getenv("APP_SECRET_KEY", "change-me-in-production")
        self.token_expire_minutes = int(getenv("TOKEN_EXPIRE_MINUTES", "60"))
        self.firebase_api_key = getenv("FIREBASE_API_KEY", "")
        self.firebase_auth_domain = getenv("FIREBASE_AUTH_DOMAIN", "")
        self.firebase_database_url = getenv("FIREBASE_DATABASE_URL", "")
        self.firebase_project_id = getenv("FIREBASE_PROJECT_ID", "")
        self.firebase_storage_bucket = getenv("FIREBASE_STORAGE_BUCKET", "")
        self.firebase_messaging_sender_id = getenv("FIREBASE_MESSAGING_SENDER_ID", "")
        self.firebase_app_id = getenv("FIREBASE_APP_ID", "")
        self.storage_dir = Path(getenv("APP_STORAGE_DIR", "data"))


@lru_cache
def get_settings() -> Settings:
    return Settings()
