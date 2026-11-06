from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select, update

from app.db import get_session
from app.limits import FORMS, limiter
from app.logic import ai_runner
from app.logic.leads import clean_phone, create_lead
from app.logic.slots import free_slots, is_bookable, now_ist
from app.models import CarModel, DemoCar, Lead, LeadSource, LeadType, Showroom, TestDrive, UsedCar, User, Variant, now

router = APIRouter(prefix="/api", tags=["booking"])


class Contact(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    phone: str
    email: EmailStr | None = None
    message: str = Field("", max_length=1000)
    lang: str = Field("en", pattern="^(en|hi)$")
    # dpdp: no tick, no lead
    consent: bool

    @field_validator("name", "message")
    @classmethod
    def strip(cls, v: str) -> str:
        return v.strip()

    @field_validator("phone")
    @classmethod
    def phone_ok(cls, v: str) -> str:
        p = clean_phone(v)
        if not p:
            raise ValueError("enter a 10-digit indian mobile number")
        return p

    @field_validator("consent")
    @classmethod
    def consent_given(cls, v: bool) -> bool:
        if not v:
            raise ValueError("please agree so we can contact you")
        return v


def first_name(session: Session, user_id: int | None) -> str | None:
    u = session.get(User, user_id) if user_id else None
    return u.name.split()[0] if u else None


# demo cars + slots


@router.get("/demo-cars")
def demo_cars(session: Session = Depends(get_session)):
    rows = session.exec(
        select(DemoCar, Variant, CarModel, Showroom)
        .join(Variant, Variant.id == DemoCar.variant_id)
        .join(CarModel, CarModel.id == Variant.model_id)
        .join(Showroom, Showroom.id == DemoCar.showroom_id)
        .where(DemoCar.is_active)
        .order_by(Showroom.id, CarModel.id)
    ).all()
    return [
        {"id": d.id, "colour": d.colour, "variant": v.name, "variant_id": v.id, "fuel": v.fuel,
         "transmission": v.transmission, "model": m.name, "model_slug": m.slug, "hero_image": m.hero_image,
         "showroom_id": s.id, "showroom": s.name, "locality": s.locality, "address": s.address}
        for d, v, m, s in rows
    ]


@router.get("/slots")
def slots(demo_car_id: int, day: date, session: Session = Depends(get_session)):
    if not session.get(DemoCar, demo_car_id):
        raise HTTPException(404, "we couldn't find that demo car")
    booked = set(session.exec(select(TestDrive.slot).where(
        TestDrive.demo_car_id == demo_car_id, TestDrive.date == day, TestDrive.status == "booked")).all())
    return free_slots(day, booked, now_ist())


class BookingIn(Contact):
    demo_car_id: int
    day: date
    slot: str


@router.post("/test-drives", status_code=201)
@limiter.limit(FORMS)
def book_test_drive(request: Request, body: BookingIn, bg: BackgroundTasks, session: Session = Depends(get_session)):
    demo = session.get(DemoCar, body.demo_car_id)
    if not demo or not demo.is_active:
        raise HTTPException(404, "we couldn't find that demo car")
    booked = set(session.exec(select(TestDrive.slot).where(
        TestDrive.demo_car_id == demo.id, TestDrive.date == body.day, TestDrive.status == "booked")).all())
    if body.slot in booked:
        raise HTTPException(409, "that slot was just taken, please pick another")
    if not is_bookable(body.day, body.slot, booked, now_ist()):
        raise HTTPException(422, "that slot isn't available")

    variant = session.get(Variant, demo.variant_id)
    lead = Lead(name=body.name, phone=body.phone, email=body.email, lang=body.lang, source=LeadSource.web,
                type=LeadType.test_drive, model_id=variant.model_id, variant_id=variant.id,
                showroom_id=demo.showroom_id, message=body.message, consent=True, consent_at=now())
    try:
        create_lead(session, lead)
        session.add(TestDrive(demo_car_id=demo.id, date=body.day, slot=body.slot, lead_id=lead.id))
        session.commit()
    except IntegrityError:
        # two people hit the same slot at once, the unique key picked a winner
        session.rollback()
        raise HTTPException(409, "that slot was just taken, please pick another")
    # ai read runs after we've answered the buyer, they never wait on it
    bg.add_task(ai_runner.run_in_background, lead.id)

    showroom = session.get(Showroom, demo.showroom_id)
    model = session.get(CarModel, variant.model_id)
    return {"ref": f"TD-{lead.id:05d}", "day": body.day, "slot": body.slot, "model": model.name,
            "variant": variant.name, "showroom": showroom.name, "address": showroom.address,
            "phone": showroom.phone, "consultant": first_name(session, lead.assigned_to)}


# plain enquiries: model page, used car, trade-in


class EnquiryIn(Contact):
    type: LeadType = LeadType.enquiry
    model_slug: str | None = None
    variant_id: int | None = None
    used_stock_id: str | None = None
    showroom_id: int | None = None
    city: str = Field("Lucknow", max_length=40)


@router.post("/leads", status_code=201)
@limiter.limit(FORMS)
def enquire(request: Request, body: EnquiryIn, bg: BackgroundTasks, session: Session = Depends(get_session)):
    if body.type == LeadType.test_drive:
        raise HTTPException(422, "use the test drive booking for that")
    model = session.exec(select(CarModel).where(CarModel.slug == body.model_slug)).first() if body.model_slug else None
    used = session.exec(select(UsedCar).where(UsedCar.stock_id == body.used_stock_id)).first() if body.used_stock_id else None
    if body.used_stock_id and not used:
        raise HTTPException(404, "we couldn't find that car")
    if body.showroom_id and not session.get(Showroom, body.showroom_id):
        raise HTTPException(422, "unknown showroom")

    lead = Lead(name=body.name, phone=body.phone, email=body.email, lang=body.lang, source=LeadSource.web,
                type=LeadType.used if used else body.type, model_id=model.id if model else None,
                variant_id=body.variant_id, used_car_id=used.id if used else None,
                showroom_id=body.showroom_id or (used.showroom_id if used else None),
                city=body.city, message=body.message, consent=True, consent_at=now())
    create_lead(session, lead)
    session.commit()
    bg.add_task(ai_runner.run_in_background, lead.id)
    return {"ref": f"EN-{lead.id:05d}", "consultant": first_name(session, lead.assigned_to)}


# dpdp opt-out


class OptOutIn(BaseModel):
    phone: str

    @field_validator("phone")
    @classmethod
    def phone_ok(cls, v: str) -> str:
        p = clean_phone(v)
        if not p:
            raise ValueError("enter a 10-digit indian mobile number")
        return p


@router.post("/optout")
@limiter.limit(FORMS)
def opt_out(request: Request, body: OptOutIn, session: Session = Depends(get_session)):
    session.execute(update(Lead).where(Lead.phone == body.phone).values(opted_out=True))
    session.commit()
    # same answer whether or not we knew the number, nothing to probe
    return {"ok": True}
