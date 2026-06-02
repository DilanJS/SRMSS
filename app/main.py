from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.routes.auth import router as auth_router
from app.routes.dashboard import router as dashboard_router
from app.routes.drivers import router as driver_router
from app.routes.maintenance import router as maintenance_router
from app.routes.reports import router as reports_router
from app.routes.routes import router as route_router
from app.routes.schedules import router as schedule_router
from app.routes.tracking import router as tracking_router
from app.routes.vehicles import router as vehicle_router

settings = get_settings()

app = FastAPI(title=settings.app_name)
app.include_router(auth_router)
app.include_router(dashboard_router)
app.include_router(driver_router)
app.include_router(maintenance_router)
app.include_router(reports_router)
app.include_router(route_router)
app.include_router(schedule_router)
app.include_router(tracking_router)
app.include_router(vehicle_router)


@app.get("/api/firebase-config")
def get_firebase_config() -> dict:
    if settings.auth_provider != "firebase":
        return {"mode": "local"}
    return {
        "mode": "firebase",
        "apiKey": settings.firebase_api_key,
        "authDomain": settings.firebase_auth_domain,
        "databaseURL": settings.firebase_database_url,
        "projectId": settings.firebase_project_id,
        "storageBucket": settings.firebase_storage_bucket,
        "messagingSenderId": settings.firebase_messaging_sender_id,
        "appId": settings.firebase_app_id,
    }

frontend_dir = Path("frontend")
if frontend_dir.exists():
    app.mount("/frontend", StaticFiles(directory=frontend_dir, html=True), name="frontend")


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "SRMSS API is running.", "frontend": "/frontend/index.html"}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
