from datetime import UTC, date, datetime
from enum import StrEnum

from sqlalchemy import JSON, Column, UniqueConstraint
from sqlmodel import Field, SQLModel


def now() -> datetime:
    return datetime.now(UTC)


# money is whole rupees, percentages are basis points (1000 = 10%)


class Role(StrEnum):
    buyer = "buyer"
    consultant = "consultant"
    admin = "admin"


class Fuel(StrEnum):
    petrol = "petrol"
    diesel = "diesel"
    cng = "cng"
    hybrid = "hybrid"
    electric = "electric"


class Showroom(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    locality: str
    city: str
    address: str
    phone: str


class User(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    email: str = Field(unique=True, index=True)
    password_hash: str
    role: Role = Role.buyer
    showroom_id: int | None = Field(default=None, foreign_key="showroom.id")
    # which car models this consultant handles, empty means all
    model_ids: list[int] = Field(default_factory=list, sa_column=Column(JSON))
    is_active: bool = True


class CarModel(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    slug: str = Field(unique=True, index=True)
    name: str
    body_type: str
    tagline_en: str
    tagline_hi: str
    description_en: str
    description_hi: str
    hero_image: str
    gallery: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    is_published: bool = True


class Variant(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    model_id: int = Field(foreign_key="carmodel.id", index=True)
    stock_id: str | None = None
    name: str
    fuel: Fuel
    transmission: str
    ex_showroom: int
    specs: dict = Field(default_factory=dict, sa_column=Column(JSON))
    # [{name, hex}]
    colours: list[dict] = Field(default_factory=list, sa_column=Column(JSON))


class City(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(unique=True)
    state: str


class TaxRule(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    city_id: int = Field(foreign_key="city.id", index=True)
    fuel: Fuel
    price_from: int
    price_to: int
    road_tax_bp: int
    registration_fee: int
    valid_from: date
    valid_until: date


class InsuranceRule(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    fuel: Fuel
    pct_bp: int
    valid_from: date
    valid_until: date


class AccessoryPack(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    # null variant means it fits every car
    variant_id: int | None = Field(default=None, foreign_key="variant.id")
    name: str
    price: int
    is_default: bool = False


class UsedStatus(StrEnum):
    available = "available"
    booked = "booked"
    sold = "sold"


class UsedCar(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    stock_id: str = Field(unique=True, index=True)
    model_name: str
    variant: str
    body_type: str
    fuel: Fuel
    transmission: str
    year: int
    km: int
    owners: int
    price: int
    # full number stays in here, public api only ever sends the masked one
    reg_number: str
    colour: str
    city: str
    showroom_id: int | None = Field(default=None, foreign_key="showroom.id")
    photos: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    # {score, checks: [{item, status, note}]}
    inspection: dict = Field(default_factory=dict, sa_column=Column(JSON))
    status: UsedStatus = UsedStatus.available
    created_at: datetime = Field(default_factory=now)


class DemoCar(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    showroom_id: int = Field(foreign_key="showroom.id", index=True)
    variant_id: int = Field(foreign_key="variant.id")
    colour: str
    is_active: bool = True


class TestDrive(SQLModel, table=True):
    __test__ = False  # stop pytest thinking this is a test class
    # one buyer per car per slot, the db enforces it
    __table_args__ = (UniqueConstraint("demo_car_id", "date", "slot"),)

    id: int | None = Field(default=None, primary_key=True)
    demo_car_id: int = Field(foreign_key="democar.id")
    date: date
    slot: str
    lead_id: int = Field(foreign_key="lead.id")
    status: str = "booked"


class LeadSource(StrEnum):
    web = "web"
    portal = "portal"
    walkin = "walkin"


class LeadType(StrEnum):
    enquiry = "enquiry"
    test_drive = "test_drive"
    used = "used"
    trade_in = "trade_in"


class LeadStatus(StrEnum):
    new = "new"
    contacted = "contacted"
    test_drive = "test_drive"
    negotiation = "negotiation"
    won = "won"
    lost = "lost"


class Lead(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    phone: str = Field(index=True)
    email: str | None = None
    lang: str = "en"
    source: LeadSource = LeadSource.web
    type: LeadType = LeadType.enquiry
    model_id: int | None = Field(default=None, foreign_key="carmodel.id")
    variant_id: int | None = Field(default=None, foreign_key="variant.id")
    used_car_id: int | None = Field(default=None, foreign_key="usedcar.id")
    showroom_id: int | None = Field(default=None, foreign_key="showroom.id")
    city: str = "Lucknow"
    message: str = ""
    consent: bool = False
    consent_at: datetime | None = None
    opted_out: bool = False
    assigned_to: int | None = Field(default=None, foreign_key="user.id", index=True)
    status: LeadStatus = LeadStatus.new
    created_at: datetime = Field(default_factory=now, index=True)
    first_response_at: datetime | None = None
    ai_summary: dict = Field(default_factory=dict, sa_column=Column(JSON))
    ai_draft: str = ""
    # ok | needs_review | fallback | pending
    ai_status: str = "pending"


class LeadEvent(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    lead_id: int = Field(foreign_key="lead.id", index=True)
    # created | assigned | reassigned | status | note | message_sent | ai
    kind: str
    body: str
    actor_id: int | None = Field(default=None, foreign_key="user.id")
    at: datetime = Field(default_factory=now)


class RateHit(SQLModel, table=True):
    # one row per ip per time window. lives in the db so every serverless box sees the same count
    key: str = Field(primary_key=True)
    count: int = 0
    expires: int = Field(index=True)
