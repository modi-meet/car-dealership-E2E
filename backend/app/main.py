from contextlib import asynccontextmanager
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exception_handlers import http_exception_handler
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, HTMLResponse, PlainTextResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from sqlmodel import Session

from app import seo
from app.db import engine, init_db
from app.routers import admin, auth, booking, desk, public
from app.settings import settings


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="Company A dealership", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.include_router(auth.router)
app.include_router(public.router)
app.include_router(booking.router)
app.include_router(desk.router)
app.include_router(admin.router)


@app.get("/api/health")
def health():
    return {"ok": True}


# the built react app lives here in prod, same origin so no cors
dist = (Path(__file__).resolve().parent.parent / settings.frontend_dist).resolve()
SEO_START, SEO_END = "<!--seo-->", "<!--/seo-->"


@lru_cache(maxsize=1)
def index_html(mtime: float) -> str:
    # mtime in the key so a fresh build is picked up without a restart
    return (dist / "index.html").read_text()


def page(path: str, query: str = "") -> HTMLResponse:
    raw = index_html((dist / "index.html").stat().st_mtime)
    with Session(engine) as session:
        head, status = seo.for_path(path, session)
        if status == 200:
            head += "\n    " + seo.boot_script(seo.boot(path, query, session))
    a, b = raw.index(SEO_START) + len(SEO_START), raw.index(SEO_END)
    # html itself is never cached, it carries live prices in the meta
    return HTMLResponse(raw[:a] + "\n    " + head + "\n    " + raw[b:], status_code=status, headers={"Cache-Control": "no-cache"})


@app.get("/sitemap.xml", include_in_schema=False)
def sitemap():
    with Session(engine) as session:
        return Response(seo.sitemap(session), media_type="application/xml")


@app.get("/robots.txt", include_in_schema=False)
def robots():
    return PlainTextResponse(seo.robots())


@app.exception_handler(StarletteHTTPException)
async def spa_fallback(request: Request, exc: StarletteHTTPException):
    # api 404s stay json. any other unknown path is a react route, so hand over index.html
    path = request.url.path
    if exc.status_code != 404 or path.startswith("/api") or request.method != "GET" or not (dist / "index.html").exists():
        return await http_exception_handler(request, exc)
    file = (dist / path.lstrip("/")).resolve()
    if file.is_file() and file.is_relative_to(dist) and file.name != "index.html":
        # photos and icons change rarely, a day is plenty
        return FileResponse(file, headers={"Cache-Control": "public, max-age=86400"})
    return page(path, request.url.query)


class CacheAssets(StaticFiles):
    # vite puts a hash in every file name, so these can be cached forever
    async def get_response(self, path, scope):
        resp = await super().get_response(path, scope)
        if resp.status_code == 200:
            resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return resp


if (dist / "assets").exists():
    app.mount("/assets", CacheAssets(directory=dist / "assets"), name="assets")
