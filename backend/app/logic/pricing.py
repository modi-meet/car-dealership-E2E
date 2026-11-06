"""on-road price = ex-showroom + road tax + registration + insurance + tcs + accessories.
every number comes from the admin tables, we never guess."""

from dataclasses import dataclass, field
from datetime import date

from app.models import AccessoryPack, Fuel, InsuranceRule, TaxRule

TCS_THRESHOLD = 1_000_000  # 1% tcs kicks in above ₹10 lakh ex-showroom
TCS_BP = 100
NOTE = "Prices may change. Final on-road price is confirmed on the booking invoice."


class PriceUnavailable(Exception):
    """a rule is missing or expired, so the ui shows 'price on request'"""


@dataclass
class Line:
    key: str
    label: str
    amount: int
    detail: str = ""


@dataclass
class Breakup:
    city: str
    ex_showroom: int
    lines: list[Line]
    total: int
    valid_until: date
    note: str = NOTE
    accessory_ids: list[int] = field(default_factory=list)


def pct(amount: int, bp: int) -> int:
    # integer maths, rounds half up to the rupee
    return (amount * bp + 5000) // 10000


def bp_label(bp: int) -> str:
    return f"{bp / 100:g}%"


def _live(rule, today: date) -> bool:
    return rule.valid_from <= today <= rule.valid_until


def on_road_price(
    *,
    ex_showroom: int,
    fuel: Fuel,
    city: str,
    tax_rules: list[TaxRule],
    insurance_rules: list[InsuranceRule],
    accessories: list[AccessoryPack],
    today: date,
) -> Breakup:
    # tax_rules should already be filtered to this city
    tax = next(
        (r for r in tax_rules if r.fuel == fuel and r.price_from <= ex_showroom <= r.price_to and _live(r, today)),
        None,
    )
    if not tax:
        raise PriceUnavailable(f"no live road-tax rule for {fuel} in {city}")
    ins = next((r for r in insurance_rules if r.fuel == fuel and _live(r, today)), None)
    if not ins:
        raise PriceUnavailable(f"no live insurance rule for {fuel}")

    lines = [
        Line("ex_showroom", "Ex-showroom price", ex_showroom),
        Line("road_tax", "Road tax", pct(ex_showroom, tax.road_tax_bp),
             f"{bp_label(tax.road_tax_bp)} of ex-showroom" if tax.road_tax_bp else "exempt"),
        Line("registration", "Registration & handling", tax.registration_fee, city),
        Line("insurance", "Insurance (1 yr comprehensive)", pct(ex_showroom, ins.pct_bp),
             f"{bp_label(ins.pct_bp)} of ex-showroom"),
    ]
    if ex_showroom > TCS_THRESHOLD:
        lines.append(Line("tcs", "TCS", pct(ex_showroom, TCS_BP), "1%, above ₹10 lakh, claimable in ITR"))
    for a in accessories:
        lines.append(Line(f"acc_{a.id}", a.name, a.price, "accessory"))

    return Breakup(
        city=city,
        ex_showroom=ex_showroom,
        lines=lines,
        total=sum(x.amount for x in lines),
        # the price is only as fresh as the oldest rule we used
        valid_until=min(tax.valid_until, ins.valid_until),
        accessory_ids=[a.id for a in accessories],
    )
