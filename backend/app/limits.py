import time
from functools import wraps

from fastapi import HTTPException, Request
from sqlalchemy import text
from sqlmodel import Session

from app.settings import settings

# (hits, seconds) pairs, per ip
FORMS = [(5, 60), (30, 3600)]
LOGIN = [(10, 60)]

BUMP = text(
    "INSERT INTO ratehit (key, count, expires) VALUES (:k, 1, :e) "
    "ON CONFLICT (key) DO UPDATE SET count = ratehit.count + 1 RETURNING count"
)


def client_ip(request: Request) -> str:
    # vercel writes x-real-ip itself and drops whatever the client sent, so it's safe to trust there
    if settings.vercel and (ip := request.headers.get("x-real-ip")):
        return ip
    return request.client.host if request.client else "unknown"


class Limiter:
    # tiny fixed-window counter. memory would reset on every serverless cold start, so it's in the db
    enabled = True

    def hit(self, scope: str, ip: str, rules: list[tuple[int, int]]) -> None:
        from app.db import engine

        now = int(time.time())
        over = False
        with Session(engine) as s:
            for most, secs in rules:
                window = now // secs
                n = s.exec(BUMP, params={"k": f"{scope}|{ip}|{secs}|{window}", "e": (window + 1) * secs}).scalar_one()
                over = over or n > most
            # sweep old windows while we're here, the table stays tiny
            s.exec(text("DELETE FROM ratehit WHERE expires < :now"), params={"now": now})
            s.commit()
        if over:
            raise HTTPException(429, "too many tries, please wait a minute and try again")

    def limit(self, rules: list[tuple[int, int]]):
        def wrap(fn):
            @wraps(fn)
            def inner(*args, request: Request, **kw):
                if self.enabled:
                    self.hit(fn.__name__, client_ip(request), rules)
                return fn(*args, request=request, **kw)

            return inner

        return wrap

    def reset(self) -> None:
        from app.db import engine

        with Session(engine) as s:
            s.exec(text("DELETE FROM ratehit"))
            s.commit()


limiter = Limiter()
