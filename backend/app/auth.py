from datetime import UTC, datetime, timedelta

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, status
from sqlmodel import Session

from app.db import get_session
from app.models import Role, User
from app.settings import settings

COOKIE = "session"


def hash_password(raw: str) -> str:
    return bcrypt.hashpw(raw.encode(), bcrypt.gensalt()).decode()


def check_password(raw: str, hashed: str) -> bool:
    return bcrypt.checkpw(raw.encode(), hashed.encode())


def make_token(user: User) -> str:
    exp = datetime.now(UTC) + timedelta(hours=settings.jwt_ttl_hours)
    return jwt.encode({"sub": str(user.id), "role": user.role, "exp": exp}, settings.jwt_secret, "HS256")


def current_user_optional(request: Request, session: Session = Depends(get_session)) -> User | None:
    token = request.cookies.get(COOKIE)
    if not token:
        return None
    try:
        data = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    user = session.get(User, int(data["sub"]))
    return user if user and user.is_active else None


def current_user(user: User | None = Depends(current_user_optional)) -> User:
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "please sign in")
    return user


def require(*roles: Role):
    # usage: Depends(require(Role.consultant, Role.admin))
    def check(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "you don't have access to this")
        return user

    return check
