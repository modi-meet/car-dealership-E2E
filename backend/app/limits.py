from fastapi import Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

# per ip, in memory. fine for one instance, swap storage_uri for redis if we ever scale out
limiter = Limiter(key_func=get_remote_address)

FORMS = "5/minute;30/hour"
LOGIN = "10/minute"


def too_many(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse({"detail": "too many tries, please wait a minute and try again"}, status_code=429)
