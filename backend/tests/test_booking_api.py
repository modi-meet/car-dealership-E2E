from datetime import timedelta

from sqlmodel import Session, select

from app.db import engine
from app.logic.slots import now_ist
from app.models import Lead, LeadEvent

TOMORROW = (now_ist().date() + timedelta(days=1)).isoformat()


def person(**kw):
    return {"name": "Test Buyer", "phone": "+91 98390 12345", "consent": True, **kw}


def demo(client, slug="model-h"):
    return next(d for d in client.get("/api/demo-cars").json() if d["model_slug"] == slug)


# used cars


def test_used_list_hides_sold_and_full_reg(client):
    cars = client.get("/api/used").json()
    ids = {c["stock_id"] for c in cars}
    assert "UC-1182" in ids and "UC-1190" in ids  # booked still shows
    assert "UC-1216" not in ids  # sold
    assert all("reg_number" not in c and "reg_masked" not in c for c in cars)


def test_used_filters(client):
    diesel = client.get("/api/used?fuel=diesel").json()
    assert diesel and all(c["fuel"] == "diesel" for c in diesel)
    cheap = client.get("/api/used?max_price=600000&sort=price_asc").json()
    assert all(c["price"] <= 600000 for c in cheap)
    assert [c["price"] for c in cheap] == sorted(c["price"] for c in cheap)
    auto = client.get("/api/used?transmission=automatic").json()
    assert auto and all(c["transmission"] != "Manual" for c in auto)
    assert client.get("/api/used?sort=hack").status_code == 422


def test_used_detail_is_masked(client):
    d = client.get("/api/used/UC-1182").json()
    assert d["reg_masked"] == "UP32 •• ••18"
    assert "4418" not in str(d)
    assert d["inspection"]["score"] == 92
    assert client.get("/api/used/UC-1216").status_code == 404  # sold


# test drives


def test_booking_happy_path_assigns_a_consultant(client):
    d = demo(client)
    r = client.post("/api/test-drives", json=person(demo_car_id=d["id"], day=TOMORROW, slot="17:00"))
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["consultant"] and body["ref"].startswith("TD-")
    # slot now shows taken
    slots = client.get(f"/api/slots?demo_car_id={d['id']}&day={TOMORROW}").json()
    assert next(s for s in slots if s["slot"] == "17:00")["why"] == "booked"
    # phone was normalised, lead got the mock whatsapp
    with Session(engine) as s:
        lead = s.exec(select(Lead).order_by(Lead.id.desc())).first()
        assert lead.phone == "9839012345" and lead.assigned_to
        kinds = [e.kind for e in s.exec(select(LeadEvent).where(LeadEvent.lead_id == lead.id))]
        # testclient runs background tasks inline, so the ai (fallback here, no key) has run too
        assert kinds == ["created", "assigned", "message_sent", "ai"]
        assert lead.ai_status == "fallback" and lead.ai_draft.startswith("Hi Test")


def test_double_booking_is_409(client):
    d = demo(client, "model-s")
    first = client.post("/api/test-drives", json=person(demo_car_id=d["id"], day=TOMORROW, slot="16:00"))
    again = client.post("/api/test-drives", json=person(demo_car_id=d["id"], day=TOMORROW, slot="16:00", name="Someone Else"))
    assert first.status_code == 201 and again.status_code == 409


def test_bad_bookings(client):
    d = demo(client)["id"]
    assert client.post("/api/test-drives", json=person(demo_car_id=d, day=TOMORROW, slot="10:30")).status_code == 422
    assert client.post("/api/test-drives", json=person(demo_car_id=d, day="2020-01-01", slot="10:00")).status_code == 422
    assert client.post("/api/test-drives", json=person(demo_car_id=9999, day=TOMORROW, slot="10:00")).status_code == 404


def test_no_consent_no_lead(client):
    d = demo(client)["id"]
    r = client.post("/api/test-drives", json=person(demo_car_id=d, day=TOMORROW, slot="13:00", consent=False))
    assert r.status_code == 422


def test_bad_phone_rejected(client):
    r = client.post("/api/leads", json=person(phone="12345"))
    assert r.status_code == 422 and "mobile" in r.text


# enquiries + opt-out


def test_used_enquiry_routes_to_that_car(client):
    r = client.post("/api/leads", json=person(used_stock_id="UC-1182", message="is it still there?"))
    assert r.status_code == 201
    with Session(engine) as s:
        lead = s.exec(select(Lead).order_by(Lead.id.desc())).first()
        assert lead.type == "used" and lead.used_car_id


def test_opt_out_marks_every_lead_for_that_phone(client):
    client.post("/api/leads", json=person(phone="9000000001"))
    client.post("/api/leads", json=person(phone="9000000001", model_slug="model-c"))
    assert client.post("/api/optout", json={"phone": "+91 90000 00001"}).json() == {"ok": True}
    with Session(engine) as s:
        leads = s.exec(select(Lead).where(Lead.phone == "9000000001")).all()
        assert len(leads) == 2 and all(lead.opted_out for lead in leads)
    # unknown number looks the same
    assert client.post("/api/optout", json={"phone": "9111111111"}).json() == {"ok": True}
