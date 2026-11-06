from fastapi import Depends

from app.auth import require
from app.main import app
from app.models import Role, User
from tests.conftest import login


# tiny throwaway routes so we can check the role gate on its own
@app.get("/api/_test/desk")
def _desk(u: User = Depends(require(Role.consultant, Role.admin))):
    return {"ok": u.role}


@app.get("/api/_test/admin")
def _admin(u: User = Depends(require(Role.admin))):
    return {"ok": u.role}


def test_login_sets_httponly_cookie(client):
    r = client.post("/api/auth/login", json={"email": "ankit@companya.demo", "password": "demo1234"})
    assert r.status_code == 200
    assert "httponly" in r.headers["set-cookie"].lower()
    assert client.get("/api/auth/me").json()["role"] == "consultant"


def test_wrong_password_and_unknown_email_look_the_same(client):
    a = client.post("/api/auth/login", json={"email": "ankit@companya.demo", "password": "x"})
    b = client.post("/api/auth/login", json={"email": "nobody@companya.demo", "password": "x"})
    assert a.status_code == b.status_code == 401
    assert a.json() == b.json()


def test_bad_email_is_rejected(client):
    assert client.post("/api/auth/login", json={"email": "not-an-email", "password": "x"}).status_code == 422


def test_anonymous_gets_401(client):
    assert client.get("/api/_test/desk").status_code == 401


def test_buyer_cant_open_desk(client):
    login(client, "buyer")
    assert client.get("/api/_test/desk").status_code == 403


def test_consultant_can_open_desk_but_not_admin(client):
    login(client, "ankit")
    assert client.get("/api/_test/desk").status_code == 200
    assert client.get("/api/_test/admin").status_code == 403


def test_admin_gets_everything(client):
    login(client, "admin")
    assert client.get("/api/_test/desk").status_code == 200
    assert client.get("/api/_test/admin").status_code == 200


def test_tampered_cookie_is_ignored(client):
    client.cookies.set("session", "garbage.token.here")
    assert client.get("/api/auth/me").status_code == 401


def test_logout_clears_session(client):
    login(client, "ankit")
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").status_code == 401


def test_api_404_stays_json(client):
    r = client.get("/api/does-not-exist")
    assert r.status_code == 404 and r.headers["content-type"].startswith("application/json")
