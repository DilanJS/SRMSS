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
app.include_router(vehicle_router)

frontend_dir = Path("frontend")
if frontend_dir.exists():
    app.mount("/frontend", StaticFiles(directory=frontend_dir, html=True), name="frontend")


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "SRMSS API is running.", "frontend": "/frontend/index.html"}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
