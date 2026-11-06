from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exception_handlers import http_exception_handler
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.db import init_db
from app.routers import auth, booking, public
from app.settings import settings


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="Company A dealership", lifespan=lifespan)
app.include_router(auth.router)
app.include_router(public.router)
app.include_router(booking.router)


@app.get("/api/health")
def health():
    return {"ok": True}


# the built react app lives here in prod, same origin so no cors
dist = (Path(__file__).resolve().parent.parent / settings.frontend_dist).resolve()


@app.exception_handler(StarletteHTTPException)
async def spa_fallback(request: Request, exc: StarletteHTTPException):
    # api 404s stay json. any other unknown path is a react route, so hand over index.html
    path = request.url.path
    if exc.status_code != 404 or path.startswith("/api") or request.method != "GET" or not (dist / "index.html").exists():
        return await http_exception_handler(request, exc)
    file = (dist / path.lstrip("/")).resolve()
    if file.is_file() and file.is_relative_to(dist):
        return FileResponse(file)
    return FileResponse(dist / "index.html")


if (dist / "assets").exists():
    app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")
