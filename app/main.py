from fastapi import FastAPI

from app.config import get_settings
from app.routes.auth import router as auth_router
from app.routes.routes import router as route_router

settings = get_settings()

app = FastAPI(title=settings.app_name)
app.include_router(auth_router)
app.include_router(route_router)


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "SRMSS API is running."}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
