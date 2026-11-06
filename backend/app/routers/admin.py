"""admin cms: cars, the price tables, used stock, team. plain crud with validation,
plus one real rule: tax rules can't overlap, or the on-road price would be ambiguous."""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.auth import require
from app.db import get_session
from app.logic.leads import CLOSED
from app.models import (AccessoryPack, CarModel, City, DemoCar, Fuel, InsuranceRule, Lead, Role, Showroom, TaxRule,
                        UsedCar, UsedStatus, User, Variant)

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require(Role.admin))])

SLUG = r"^[a-z0-9]+(-[a-z0-9]+)*$"
REG = r"^[A-Z]{2}\s?\d{1,2}\s?[A-Z]{0,3}\s?\d{1,4}$"


def get_or_404(session: Session, model, id_: int):
    row = session.get(model, id_)
    if not row:
        raise HTTPException(404, "not found")
    return row


def save(session: Session, row, patch: BaseModel | None = None):
    if patch is not None:
        for k, v in patch.model_dump(exclude_unset=True).items():
            setattr(row, k, v)
    session.add(row)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, "that clashes with an existing record (duplicate slug, stock id or email?)")
    session.refresh(row)
    return row


# cars


class ModelIn(BaseModel):
    slug: str = Field(pattern=SLUG, max_length=40)
    name: str = Field(min_length=2, max_length=40)
    body_type: str = Field(min_length=2, max_length=30)
    tagline_en: str = Field(max_length=120)
    tagline_hi: str = Field(max_length=120)
    description_en: str = Field(max_length=1000)
    description_hi: str = Field(max_length=1000)
    hero_image: str = Field(pattern=r"^/media/[\w\-/]+\.jpg$")
    gallery: list[str] = Field(default_factory=list, max_length=8)
    is_published: bool = True


class ModelPatch(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=40)
    body_type: str | None = Field(None, min_length=2, max_length=30)
    tagline_en: str | None = Field(None, max_length=120)
    tagline_hi: str | None = Field(None, max_length=120)
    description_en: str | None = Field(None, max_length=1000)
    description_hi: str | None = Field(None, max_length=1000)
    is_published: bool | None = None


class VariantIn(BaseModel):
    model_id: int
    name: str = Field(min_length=1, max_length=40)
    fuel: Fuel
    transmission: str = Field(min_length=2, max_length=30)
    ex_showroom: int = Field(ge=100_000, le=50_000_000)
    stock_id: str | None = Field(None, max_length=20)


class VariantPatch(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=40)
    fuel: Fuel | None = None
    transmission: str | None = Field(None, min_length=2, max_length=30)
    ex_showroom: int | None = Field(None, ge=100_000, le=50_000_000)


@router.get("/models")
def admin_models(session: Session = Depends(get_session)):
    out = []
    for m in session.exec(select(CarModel).order_by(CarModel.id)):
        vs = session.exec(select(Variant).where(Variant.model_id == m.id).order_by(Variant.ex_showroom)).all()
        out.append({**m.model_dump(), "variants": [v.model_dump() for v in vs]})
    return out


@router.post("/models", status_code=201)
def create_model(body: ModelIn, session: Session = Depends(get_session)):
    return save(session, CarModel(**body.model_dump(), gallery=body.gallery or [body.hero_image]))


@router.patch("/models/{model_id}")
def update_model(model_id: int, body: ModelPatch, session: Session = Depends(get_session)):
    return save(session, get_or_404(session, CarModel, model_id), body)


@router.post("/variants", status_code=201)
def create_variant(body: VariantIn, session: Session = Depends(get_session)):
    model = get_or_404(session, CarModel, body.model_id)
    # new variants borrow the model's specs and colours, admin can tune later
    sibling = session.exec(select(Variant).where(Variant.model_id == model.id)).first()
    return save(session, Variant(**body.model_dump(), specs=sibling.specs if sibling else {}, colours=sibling.colours if sibling else []))


@router.patch("/variants/{variant_id}")
def update_variant(variant_id: int, body: VariantPatch, session: Session = Depends(get_session)):
    return save(session, get_or_404(session, Variant, variant_id), body)


@router.delete("/variants/{variant_id}", status_code=204)
def delete_variant(variant_id: int, session: Session = Depends(get_session)):
    v = get_or_404(session, Variant, variant_id)
    used_by = session.exec(select(Lead.id).where(Lead.variant_id == v.id)).first() or session.exec(select(DemoCar.id).where(DemoCar.variant_id == v.id)).first()
    if used_by:
        raise HTTPException(409, "leads or a demo car point at this variant, unpublish the model instead")
    session.delete(v)
    session.commit()


# price tables


class TaxIn(BaseModel):
    city_id: int
    fuel: Fuel
    price_from: int = Field(ge=0)
    price_to: int = Field(ge=0)
    road_tax_bp: int = Field(ge=0, le=3000)  # 0 to 30%
    registration_fee: int = Field(ge=0, le=100_000)
    valid_from: date
    valid_until: date

    @model_validator(mode="after")
    def ranges(self):
        if self.price_from > self.price_to:
            raise ValueError("price band 'from' is above 'to'")
        if self.valid_from > self.valid_until:
            raise ValueError("valid from is after valid until")
        return self


def overlaps(a: TaxRule | TaxIn, b: TaxRule) -> bool:
    return (a.city_id == b.city_id and a.fuel == b.fuel
            and a.price_from <= b.price_to and b.price_from <= a.price_to
            and a.valid_from <= b.valid_until and b.valid_from <= a.valid_until)


def check_no_overlap(session: Session, rule: TaxIn, ignore_id: int | None = None):
    for other in session.exec(select(TaxRule).where(TaxRule.city_id == rule.city_id, TaxRule.fuel == rule.fuel)):
        if other.id != ignore_id and overlaps(rule, other):
            raise HTTPException(422, f"overlaps rule #{other.id} (₹{other.price_from:,}–₹{other.price_to:,}, "
                                     f"{other.valid_from} to {other.valid_until}); a car would get two road-tax rates")


@router.get("/price-tables")
def price_tables(session: Session = Depends(get_session)):
    return {
        "cities": list(session.exec(select(City).order_by(City.name))),
        "tax_rules": list(session.exec(select(TaxRule).order_by(TaxRule.city_id, TaxRule.fuel, TaxRule.price_from))),
        "insurance": list(session.exec(select(InsuranceRule).order_by(InsuranceRule.fuel))),
        "accessories": list(session.exec(select(AccessoryPack).order_by(AccessoryPack.id))),
    }


@router.post("/tax-rules", status_code=201)
def create_tax(body: TaxIn, session: Session = Depends(get_session)):
    get_or_404(session, City, body.city_id)
    check_no_overlap(session, body)
    return save(session, TaxRule(**body.model_dump()))


@router.put("/tax-rules/{rule_id}")
def update_tax(rule_id: int, body: TaxIn, session: Session = Depends(get_session)):
    rule = get_or_404(session, TaxRule, rule_id)
    check_no_overlap(session, body, ignore_id=rule.id)
    for k, v in body.model_dump().items():
        setattr(rule, k, v)
    return save(session, rule)


@router.delete("/tax-rules/{rule_id}", status_code=204)
def delete_tax(rule_id: int, session: Session = Depends(get_session)):
    session.delete(get_or_404(session, TaxRule, rule_id))
    session.commit()


class InsurancePatch(BaseModel):
    pct_bp: int | None = Field(None, ge=0, le=1500)
    valid_from: date | None = None
    valid_until: date | None = None


@router.patch("/insurance/{rule_id}")
def update_insurance(rule_id: int, body: InsurancePatch, session: Session = Depends(get_session)):
    rule = get_or_404(session, InsuranceRule, rule_id)
    merged = {**rule.model_dump(), **body.model_dump(exclude_unset=True)}
    if merged["valid_from"] > merged["valid_until"]:
        raise HTTPException(422, "valid from is after valid until")
    return save(session, rule, body)


class CityIn(BaseModel):
    name: str = Field(min_length=2, max_length=40)
    state: str = Field("Uttar Pradesh", min_length=2, max_length=40)


@router.post("/cities", status_code=201)
def create_city(body: CityIn, session: Session = Depends(get_session)):
    # a city with no rules yet shows 'price on request', which is the honest answer
    return save(session, City(**body.model_dump()))


class AccessoryIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    price: int = Field(ge=0, le=500_000)
    is_default: bool = False
    variant_id: int | None = None


class AccessoryPatch(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=80)
    price: int | None = Field(None, ge=0, le=500_000)
    is_default: bool | None = None


@router.post("/accessories", status_code=201)
def create_accessory(body: AccessoryIn, session: Session = Depends(get_session)):
    return save(session, AccessoryPack(**body.model_dump()))


@router.patch("/accessories/{pack_id}")
def update_accessory(pack_id: int, body: AccessoryPatch, session: Session = Depends(get_session)):
    return save(session, get_or_404(session, AccessoryPack, pack_id), body)


@router.delete("/accessories/{pack_id}", status_code=204)
def delete_accessory(pack_id: int, session: Session = Depends(get_session)):
    session.delete(get_or_404(session, AccessoryPack, pack_id))
    session.commit()


# used stock. admin sees the full reg number, nobody else does


class UsedIn(BaseModel):
    stock_id: str = Field(pattern=r"^UC-\d{3,6}$")
    model_slug: str = Field(pattern=SLUG)
    variant: str = Field(min_length=1, max_length=40)
    fuel: Fuel
    transmission: str = Field(min_length=2, max_length=30)
    year: int = Field(ge=2005, le=date.today().year)
    km: int = Field(ge=0, le=500_000)
    owners: int = Field(ge=1, le=6)
    price: int = Field(ge=50_000, le=50_000_000)
    reg_number: str = Field(pattern=REG)
    colour: str = Field(min_length=2, max_length=30)
    showroom_id: int
    inspection_score: int = Field(ge=0, le=100)

    @field_validator("reg_number", mode="before")
    @classmethod
    def tidy_reg(cls, v: str) -> str:
        # 'up32 ab  7788' -> 'UP32 AB 7788' before the pattern check
        return " ".join(str(v).upper().split())


class UsedPatch(BaseModel):
    price: int | None = Field(None, ge=50_000, le=50_000_000)
    km: int | None = Field(None, ge=0, le=500_000)
    status: UsedStatus | None = None
    owners: int | None = Field(None, ge=1, le=6)


@router.get("/used")
def admin_used(session: Session = Depends(get_session)):
    return list(session.exec(select(UsedCar).order_by(UsedCar.created_at.desc())))


@router.post("/used", status_code=201)
def create_used(body: UsedIn, session: Session = Depends(get_session)):
    model = session.exec(select(CarModel).where(CarModel.slug == body.model_slug)).first()
    if not model:
        raise HTTPException(422, "unknown model")
    get_or_404(session, Showroom, body.showroom_id)
    data = body.model_dump(exclude={"model_slug", "inspection_score"})
    checks = [{"item": i, "status": "ok", "note": ""} for i in
              ["Engine & gearbox", "Brakes", "Suspension & steering", "Tyres", "Body & paint", "Electricals",
               "Interior", "AC & cooling", "Service history", "Documents & insurance"]]
    return save(session, UsedCar(**data, model_name=model.name, body_type=model.body_type, city="Lucknow",
                                 photos=model.gallery, inspection={"score": body.inspection_score,
                                                                   "inspected_on": date.today().isoformat(), "checks": checks}))


@router.patch("/used/{used_id}")
def update_used(used_id: int, body: UsedPatch, session: Session = Depends(get_session)):
    return save(session, get_or_404(session, UsedCar, used_id), body)


# team


class UserPatch(BaseModel):
    role: Role | None = None
    showroom_id: int | None = None
    is_active: bool | None = None


@router.get("/users")
def admin_users(session: Session = Depends(get_session)):
    rows = []
    for u in session.exec(select(User).order_by(User.role, User.name)):
        open_n = len(session.exec(select(Lead.id).where(Lead.assigned_to == u.id, Lead.status.not_in(CLOSED))).all())
        rows.append({"id": u.id, "name": u.name, "email": u.email, "role": u.role, "showroom_id": u.showroom_id,
                     "is_active": u.is_active, "open_leads": open_n})
    return rows


@router.patch("/users/{user_id}")
def update_user(user_id: int, body: UserPatch, me: User = Depends(require(Role.admin)), session: Session = Depends(get_session)):
    u = get_or_404(session, User, user_id)
    if u.id == me.id and (body.role not in (None, Role.admin) or body.is_active is False):
        raise HTTPException(422, "you can't remove your own admin access")
    if body.showroom_id is not None:
        get_or_404(session, Showroom, body.showroom_id)
    if (body.role or u.role) == Role.consultant and not (body.showroom_id or u.showroom_id):
        raise HTTPException(422, "a consultant needs a showroom")
    save(session, u, body)
    return {"id": u.id, "role": u.role, "showroom_id": u.showroom_id, "is_active": u.is_active}
