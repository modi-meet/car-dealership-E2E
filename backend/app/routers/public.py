from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import Session, col, select

from app.db import get_session
from app.logic.pricing import Breakup, PriceUnavailable, on_road_price
from app.models import AccessoryPack, CarModel, City, InsuranceRule, Showroom, TaxRule, Variant

router = APIRouter(prefix="/api", tags=["public"])

DEFAULT_CITY = "Lucknow"


class VariantOut(BaseModel):
    id: int
    name: str
    fuel: str
    transmission: str
    ex_showroom: int
    stock_id: str | None
    specs: dict
    colours: list[dict]


class ModelCard(BaseModel):
    slug: str
    name: str
    body_type: str
    tagline_en: str
    tagline_hi: str
    hero_image: str
    fuels: list[str]
    from_ex_showroom: int
    # cheapest variant on-road in lucknow, None if a rule is missing
    from_on_road: int | None


class ModelDetail(ModelCard):
    description_en: str
    description_hi: str
    gallery: list[str]
    variants: list[VariantOut]


class AccessoryOut(BaseModel):
    id: int
    name: str
    price: int
    is_default: bool


class PriceOut(BaseModel):
    available: bool
    city: str
    variant_id: int
    total: int | None = None
    lines: list[dict] = []
    valid_until: date | None = None
    note: str | None = None
    accessory_ids: list[int] = []
    reason: str | None = None


def price_for(session: Session, variant: Variant, city_name: str, acc_ids: list[int] | None) -> Breakup:
    city = session.exec(select(City).where(City.name == city_name)).first()
    if not city:
        raise PriceUnavailable(f"we don't have prices for {city_name} yet")
    packs = applicable_packs(session, variant.id)
    # no choice sent means the default packs
    chosen = [p for p in packs if p.is_default] if acc_ids is None else [p for p in packs if p.id in acc_ids]
    return on_road_price(
        ex_showroom=variant.ex_showroom,
        fuel=variant.fuel,
        city=city.name,
        tax_rules=list(session.exec(select(TaxRule).where(TaxRule.city_id == city.id))),
        insurance_rules=list(session.exec(select(InsuranceRule))),
        accessories=chosen,
        today=date.today(),
    )


def applicable_packs(session: Session, variant_id: int) -> list[AccessoryPack]:
    q = select(AccessoryPack).where((AccessoryPack.variant_id == None) | (AccessoryPack.variant_id == variant_id))  # noqa: E711
    return list(session.exec(q.order_by(AccessoryPack.id)))


def card(session: Session, m: CarModel, variants: list[Variant]) -> dict:
    cheapest = min(variants, key=lambda v: v.ex_showroom)
    try:
        on_road = price_for(session, cheapest, DEFAULT_CITY, None).total
    except PriceUnavailable:
        on_road = None
    return dict(
        slug=m.slug, name=m.name, body_type=m.body_type, tagline_en=m.tagline_en, tagline_hi=m.tagline_hi,
        hero_image=m.hero_image, fuels=sorted({v.fuel for v in variants}),
        from_ex_showroom=cheapest.ex_showroom, from_on_road=on_road,
    )


@router.get("/models", response_model=list[ModelCard])
def list_models(session: Session = Depends(get_session)):
    out = []
    for m in session.exec(select(CarModel).where(CarModel.is_published).order_by(CarModel.id)):
        vs = list(session.exec(select(Variant).where(Variant.model_id == m.id)))
        if vs:  # a model with no variants has nothing to sell yet
            out.append(card(session, m, vs))
    return out


@router.get("/models/{slug}", response_model=ModelDetail)
def get_model(slug: str, session: Session = Depends(get_session)):
    m = session.exec(select(CarModel).where(CarModel.slug == slug, CarModel.is_published)).first()
    vs = list(session.exec(select(Variant).where(Variant.model_id == m.id).order_by(Variant.ex_showroom))) if m else []
    if not m or not vs:
        raise HTTPException(404, "we couldn't find that car")
    return {**card(session, m, vs), "description_en": m.description_en, "description_hi": m.description_hi,
            "gallery": m.gallery, "variants": [v.model_dump() for v in vs]}


@router.get("/price", response_model=PriceOut)
def get_price(
    variant_id: int,
    city: str = DEFAULT_CITY,
    acc: str | None = Query(None, description="comma separated pack ids, empty string for none"),
    session: Session = Depends(get_session),
):
    v = session.get(Variant, variant_id)
    if not v:
        raise HTTPException(404, "we couldn't find that variant")
    try:
        acc_ids = None if acc is None else [int(x) for x in acc.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(422, "accessory ids must be numbers")
    try:
        b = price_for(session, v, city, acc_ids)
    except PriceUnavailable as e:
        # the ui turns this into 'price on request' plus an enquiry button
        return PriceOut(available=False, city=city, variant_id=v.id, reason=str(e))
    return PriceOut(available=True, city=b.city, variant_id=v.id, total=b.total,
                    lines=[line.__dict__ for line in b.lines], valid_until=b.valid_until, note=b.note,
                    accessory_ids=b.accessory_ids)


@router.get("/accessories", response_model=list[AccessoryOut])
def list_accessories(variant_id: int, session: Session = Depends(get_session)):
    return applicable_packs(session, variant_id)


@router.get("/cities")
def list_cities(session: Session = Depends(get_session)):
    return [c.name for c in session.exec(select(City).order_by(col(City.name)))]


@router.get("/showrooms")
def list_showrooms(session: Session = Depends(get_session)):
    return list(session.exec(select(Showroom).order_by(Showroom.id)))
