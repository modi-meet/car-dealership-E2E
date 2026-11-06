from datetime import date

import pytest

from app.logic.pricing import PriceUnavailable, on_road_price, pct
from app.models import AccessoryPack, Fuel, InsuranceRule, TaxRule

TODAY = date(2026, 11, 6)
FROM, UNTIL = date(2026, 10, 1), date(2026, 12, 31)


def tax(fuel=Fuel.petrol, lo=0, hi=1_000_000, bp=800, until=UNTIL, frm=FROM):
    return TaxRule(city_id=1, fuel=fuel, price_from=lo, price_to=hi, road_tax_bp=bp,
                   registration_fee=6500, valid_from=frm, valid_until=until)


UP_PETROL = [tax(lo=0, hi=1_000_000, bp=800), tax(lo=1_000_001, hi=9_999_999, bp=1000)]
INS = [InsuranceRule(fuel=Fuel.petrol, pct_bp=310, valid_from=FROM, valid_until=UNTIL)]
ESSENTIALS = AccessoryPack(id=1, name="Essentials", price=15000, is_default=True)


def price(ex, **kw):
    args = dict(ex_showroom=ex, fuel=Fuel.petrol, city="Lucknow", tax_rules=UP_PETROL,
                insurance_rules=INS, accessories=[ESSENTIALS], today=TODAY)
    args.update(kw)
    return on_road_price(**args)


def amounts(b):
    return {line.key: line.amount for line in b.lines}


def test_model_h_zx_worked_example():
    # the number we quote in the tdd: NEW-H-02, lucknow
    b = price(1_245_000)
    assert amounts(b) == {
        "ex_showroom": 1_245_000,
        "road_tax": 124_500,
        "registration": 6_500,
        "insurance": 38_595,
        "tcs": 12_450,
        "acc_1": 15_000,
    }
    assert b.total == 1_442_045
    assert b.total == sum(amounts(b).values())


def test_exactly_ten_lakh_is_lower_band_and_no_tcs():
    a = amounts(price(1_000_000))
    assert a["road_tax"] == 80_000
    assert "tcs" not in a


def test_one_rupee_over_ten_lakh_flips_band_and_adds_tcs():
    a = amounts(price(1_000_001))
    assert a["road_tax"] == 100_000
    assert a["tcs"] == 10_000


def test_ev_exempt_shows_zero_and_label():
    b = price(1_799_000, fuel=Fuel.electric,
              tax_rules=[tax(fuel=Fuel.electric, hi=9_999_999, bp=0)],
              insurance_rules=[InsuranceRule(fuel=Fuel.electric, pct_bp=280, valid_from=FROM, valid_until=UNTIL)])
    road = next(x for x in b.lines if x.key == "road_tax")
    assert road.amount == 0 and road.detail == "exempt"


def test_no_accessories_is_fine():
    assert "acc_1" not in amounts(price(729_000, accessories=[]))


def test_missing_tax_rule_refuses_to_guess():
    with pytest.raises(PriceUnavailable):
        price(729_000, tax_rules=[])


def test_wrong_fuel_rule_doesnt_count():
    with pytest.raises(PriceUnavailable):
        price(729_000, fuel=Fuel.diesel, insurance_rules=[
            InsuranceRule(fuel=Fuel.diesel, pct_bp=330, valid_from=FROM, valid_until=UNTIL)])


def test_expired_rule_is_ignored():
    with pytest.raises(PriceUnavailable):
        price(729_000, tax_rules=[tax(until=date(2026, 9, 30))])


def test_future_rule_is_ignored():
    with pytest.raises(PriceUnavailable):
        price(729_000, tax_rules=[tax(frm=date(2027, 1, 1), until=date(2027, 3, 31))])


def test_missing_insurance_refuses():
    with pytest.raises(PriceUnavailable):
        price(729_000, insurance_rules=[])


def test_valid_until_is_the_earliest_rule():
    b = price(729_000, tax_rules=[tax(until=date(2026, 11, 30))])
    assert b.valid_until == date(2026, 11, 30)


def test_rounding_is_half_up_and_integer():
    assert pct(1_000_050, 310) == 31_002  # 31001.55 -> 31002
    assert pct(100, 50) == 1  # 0.5 -> 1
    assert isinstance(pct(999_999, 333), int)
