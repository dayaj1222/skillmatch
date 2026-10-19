"""FastAPI application: routers, health, and SPA fallback."""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .database import init_db
from .routers import (
    auth,
    comments,
    connections,
    dashboard,
    follows,
    messages,
    oauth,
    payments,
    profiles,
    projects,
    ratings,
    reports,
    schema,
    search,
    skill_assessments,
    skills,
    tasks,
    tips,
)
from .uploads import avatar_dir

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="SkillMatch", version="0.2.0", lifespan=lifespan)

app.include_router(auth.router)
app.include_router(oauth.router)
app.include_router(profiles.router)
app.include_router(skills.router)
app.include_router(search.router)
app.include_router(projects.router)
app.include_router(tasks.router)
app.include_router(comments.router)
app.include_router(dashboard.router)
app.include_router(schema.router)
app.include_router(connections.router)
app.include_router(follows.router)
app.include_router(messages.router)
app.include_router(payments.router)
app.include_router(ratings.router)
app.include_router(reports.router)
app.include_router(skill_assessments.router)
app.include_router(tips.router)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


# Avatars live outside the SPA build output and are always served.
app.mount("/avatars", StaticFiles(directory=avatar_dir()), name="avatars")

if STATIC_DIR.is_dir():
    if (STATIC_DIR / "assets").is_dir():
        app.mount(
            "/assets",
            StaticFiles(directory=STATIC_DIR / "assets"),
            name="assets",
        )

    @app.get("/{full_path:path}")
    def spa(full_path: str) -> FileResponse:
        """Serve the built SPA, letting client-side routing handle unknown paths."""
        candidate = STATIC_DIR / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(STATIC_DIR / "index.html")
