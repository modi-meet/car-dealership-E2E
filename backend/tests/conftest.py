import os

# point at a throwaway db before the app imports settings
os.environ["DATABASE_URL"] = "sqlite:///./test.db"
os.environ.pop("ANTHROPIC_API_KEY", None)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import seed  # noqa: E402
from app.limits import limiter  # noqa: E402
from app.main import app  # noqa: E402

# every test comes from the same ip, the limit gets its own test
limiter.enabled = False


@pytest.fixture(scope="session", autouse=True)
def seeded():
    seed.run()
    yield
    os.remove("test.db")


@pytest.fixture
def client():
    return TestClient(app)


def login(client: TestClient, who: str) -> TestClient:
    r = client.post("/api/auth/login", json={"email": f"{who}@companya.demo", "password": "demo1234"})
    assert r.status_code == 200, r.text
    return client
