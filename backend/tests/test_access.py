import re

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db import engine
from app.limits import limiter
from app.main import app
from app.models import UsedCar
from app.routers import admin, desk
from tests.conftest import login


def routes(router):
    # every route on that router, path ids filled with 1. new routes get checked for free
    for r in router.routes:
        if isinstance(r, APIRoute):
            for m in r.methods:
                yield m, re.sub(r"\{[^}]+\}", "1", r.path)


DESK = sorted(routes(desk.router))
ADMIN = sorted(routes(admin.router))


def test_walk_found_the_routes():
    assert len(DESK) >= 9 and len(ADMIN) >= 20


@pytest.mark.parametrize("method,path", DESK + ADMIN)
def test_anonymous_is_turned_away_everywhere(client, method, path):
    assert client.request(method, path).status_code == 401


@pytest.mark.parametrize("method,path", DESK + ADMIN)
def test_buyer_is_turned_away_everywhere(client, method, path):
    login(client, "buyer")
    assert client.request(method, path).status_code == 403


@pytest.mark.parametrize("method,path", ADMIN + [("GET", "/api/desk/export.csv")])
def test_consultant_cant_reach_admin(client, method, path):
    login(client, "ankit")
    assert client.request(method, path).status_code == 403


def test_deactivated_staff_lose_access_at_once():
    admin, ankit = login(TestClient(app), "admin"), login(TestClient(app), "ankit")
    uid = next(u["id"] for u in admin.get("/api/admin/users").json() if u["email"].startswith("ankit@"))
    try:
        assert admin.patch(f"/api/admin/users/{uid}", json={"is_active": False}).status_code == 200
        # same cookie, but the user row says no
        assert ankit.get("/api/leads").status_code == 401
    finally:
        admin.patch(f"/api/admin/users/{uid}", json={"is_active": True})


def test_role_comes_from_the_db_not_the_token(client):
    # a consultant's token can't be stretched into admin, role is read fresh each request
    login(client, "ankit")
    assert client.get("/api/auth/me").json()["role"] == "consultant"
    assert client.get("/api/admin/users").status_code == 403


def test_public_api_never_shows_a_full_reg_number(client):
    with Session(engine) as s:
        regs = [u.reg_number for u in s.exec(select(UsedCar))]
    listing = client.get("/api/used").text
    detail = client.get("/api/used/UC-1182").text
    for reg in regs:
        assert reg not in listing and reg not in detail
        assert reg.replace(" ", "") not in listing


def test_login_hashes_are_never_returned(client):
    login(client, "admin")
    body = client.get("/api/admin/users").text + client.get("/api/auth/me").text
    assert "password" not in body and "$2b$" not in body


def test_safety_headers_on_pages_and_api(client):
    for path in ["/", "/api/models"]:
        h = client.get(path).headers
        assert h["x-content-type-options"] == "nosniff"
        assert h["x-frame-options"] == "DENY"


@pytest.fixture
def limits_on():
    limiter.reset()
    limiter.enabled = True
    yield
    limiter.enabled = False
    limiter.reset()


def test_public_forms_are_rate_limited(client, limits_on):
    codes = [client.post("/api/optout", json={"phone": "9839012345"}).status_code for _ in range(7)]
    assert codes[:5] == [200] * 5 and codes[5:] == [429, 429]
    assert "wait a minute" in client.post("/api/optout", json={"phone": "9839012345"}).json()["detail"]


def test_login_is_rate_limited(client, limits_on):
    codes = [client.post("/api/auth/login", json={"email": "x@companya.demo", "password": "nope"}).status_code for _ in range(12)]
    assert codes.count(401) == 10 and codes[-1] == 429


def test_dev_secret_refused_when_live(monkeypatch):
    import importlib

    import app.settings as mod
    monkeypatch.setenv("COOKIE_SECURE", "true")
    monkeypatch.delenv("JWT_SECRET", raising=False)
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        importlib.reload(mod)
    monkeypatch.setenv("JWT_SECRET", "x" * 40)
    importlib.reload(mod)
    monkeypatch.undo()
    importlib.reload(mod)
