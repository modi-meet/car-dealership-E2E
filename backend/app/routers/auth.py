from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, EmailStr, Field
from sqlmodel import Session, select

from app.auth import COOKIE, check_password, current_user, make_token
from app.db import get_session
from app.models import User
from app.settings import settings

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class MeOut(BaseModel):
    id: int
    name: str
    email: str
    role: str
    showroom_id: int | None


def to_me(u: User) -> MeOut:
    return MeOut(id=u.id, name=u.name, email=u.email, role=u.role, showroom_id=u.showroom_id)


@router.post("/login", response_model=MeOut)
def login(body: LoginIn, response: Response, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.email == body.email.lower())).first()
    # same message either way so nobody can probe emails
    if not user or not user.is_active or not check_password(body.password, user.password_hash):
        raise HTTPException(401, "wrong email or password")
    response.set_cookie(
        COOKIE,
        make_token(user),
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        max_age=settings.jwt_ttl_hours * 3600,
    )
    return to_me(user)


@router.post("/logout", status_code=204)
def logout(response: Response):
    response.delete_cookie(COOKIE)


@router.get("/me", response_model=MeOut)
def me(user: User = Depends(current_user)):
    return to_me(user)
