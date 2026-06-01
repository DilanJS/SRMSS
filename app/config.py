from functools import lru_cache
from os import getenv


class Settings:
    def __init__(self) -> None:
        self.app_name = getenv("APP_NAME", "SRMSS API")
        self.auth_provider = getenv("AUTH_PROVIDER", "memory").lower()
        self.secret_key = getenv("APP_SECRET_KEY", "change-me-in-production")
        self.token_expire_minutes = int(getenv("TOKEN_EXPIRE_MINUTES", "60"))
        self.firebase_api_key = getenv("FIREBASE_API_KEY", "")


@lru_cache
def get_settings() -> Settings:
    return Settings()
