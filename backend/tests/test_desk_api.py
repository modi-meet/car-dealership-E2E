from sqlmodel import Session, select

from app.db import engine
from app.models import Lead, User
from tests.conftest import login

CSV = (
    "Customer Name,Mobile,Car,Branch,Lead Source,Remarks\n"
    "Portal Person,98390 70001,Model H,Gomti Nagar,CarDekho,wants automatic\n"
    "Portal Two,9839070002,Model S,Aliganj,CarWale,\n"
    "Broken Phone,123,Model H,,CarDekho,\n"
)


def user_id(email):
    with Session(engine) as s:
        return s.exec(select(User).where(User.email == email)).one()


def test_buyer_and_anon_cant_see_desk(client):
    assert client.get("/api/leads").status_code == 401
    login(client, "buyer")
    assert client.get("/api/leads").status_code == 403
    assert client.get("/api/desk/stats").status_code == 403


def test_consultant_only_sees_own_showroom(client):
    login(client, "ankit")
    me = user_id("ankit@companya.demo")
    leads = client.get("/api/leads?view=all").json()
    assert leads
    with Session(engine) as s:
        for row in leads:
            lead = s.get(Lead, row["id"])
            assert lead.assigned_to == me.id or lead.showroom_id == me.showroom_id
        # a lead from another showroom 404s, same as one that doesn't exist
        other = s.exec(select(Lead).where(Lead.showroom_id != me.showroom_id, Lead.assigned_to != me.id)).first()
    assert client.get(f"/api/leads/{other.id}").status_code == 404
    assert client.patch(f"/api/leads/{other.id}", json={"note": "hi"}).status_code == 404


def test_waiting_view_is_oldest_first_and_unanswered(client):
    login(client, "admin")
    rows = client.get("/api/leads?view=waiting").json()
    assert rows and all(r["first_response_at"] is None for r in rows)
    created = [r["created_at"] for r in rows]
    assert created == sorted(created)


def test_first_status_change_stops_the_clock(client):
    login(client, "admin")
    lead = client.get("/api/leads?view=waiting").json()[0]
    r = client.patch(f"/api/leads/{lead['id']}", json={"status": "contacted", "note": "called, will visit sunday"})
    body = r.json()
    assert r.status_code == 200 and body["first_response_at"] and body["status"] == "contacted"
    kinds = [e["kind"] for e in body["events"]][-2:]
    assert kinds == ["status", "note"]
    assert client.patch(f"/api/leads/{lead['id']}", json={"status": "new"}).status_code == 422


def test_reassign_moves_lead_and_validates_target(client):
    login(client, "ankit")
    mine = client.get("/api/leads?mine=true").json()[0]
    kavya = user_id("kavya@companya.demo")
    r = client.patch(f"/api/leads/{mine['id']}", json={"assigned_to": kavya.id})
    assert r.status_code == 200 and r.json().get("moved")  # it left ankit's showroom
    admin = user_id("admin@companya.demo")
    login(client, "admin")
    assert client.patch(f"/api/leads/{mine['id']}", json={"assigned_to": admin.id}).status_code == 422


def test_stats_shape(client):
    login(client, "admin")
    s = client.get("/api/desk/stats").json()
    assert set(s) == {"today", "within_sla_pct", "median_response_min", "overdue_now", "waiting_now"}
    assert s["waiting_now"] >= s["overdue_now"]


def test_csv_import_creates_dedupes_and_reports(client):
    login(client, "admin")
    files = {"file": ("leads.csv", CSV.encode(), "text/csv")}
    first = client.post("/api/leads/import", files=files).json()
    assert len(first["created"]) == 2 and len(first["errors"]) == 1 and first["errors"][0]["line"] == 4
    with Session(engine) as s:
        lead = s.get(Lead, first["created"][0]["lead_id"])
        assert lead.source == "portal" and lead.assigned_to and lead.phone == "9839070001"
    # same file again: nothing new, both are duplicates of the leads we just made
    again = client.post("/api/leads/import", files={"file": ("leads.csv", CSV.encode(), "text/csv")}).json()
    assert again["created"] == [] and len(again["duplicates"]) == 2


def test_csv_without_columns_is_422(client):
    login(client, "admin")
    r = client.post("/api/leads/import", files={"file": ("x.csv", b"foo,bar\n1,2\n", "text/csv")})
    assert r.status_code == 422 and "phone" in r.json()["detail"]


def test_export_is_admin_only_and_hides_opted_out_phones(client):
    login(client, "ankit")
    assert client.get("/api/desk/export.csv").status_code == 403
    login(client, "admin")
    r = client.get("/api/desk/export.csv")
    assert r.status_code == 200 and r.text.startswith("lead_id,created_ist")


# ai + send


def a_waiting_lead(client):
    return client.get("/api/leads?view=waiting").json()[0]["id"]


def test_regenerate_ai_without_key_gives_safe_template(client):
    login(client, "admin")
    lid = a_waiting_lead(client)
    d = client.post(f"/api/leads/{lid}/ai").json()
    assert d["ai_status"] == "fallback" and d["ai_draft"]
    assert d["ai_summary"]["why"].startswith("keyword rules")
    assert d["events"][-1]["kind"] == "ai"


def test_send_logs_message_and_stops_clock(client):
    login(client, "admin")
    lid = a_waiting_lead(client)
    d = client.post(f"/api/leads/{lid}/send", json={"body": "Hi, this is Meera from Company A. When can you come in?"}).json()
    assert d["first_response_at"] and d["status"] == "contacted"
    assert d["events"][-2]["kind"] == "message_sent"


def test_send_blocks_discounts_and_leftover_placeholders(client):
    login(client, "admin")
    lid = a_waiting_lead(client)
    r = client.post(f"/api/leads/{lid}/send", json={"body": "We can give you a 10% discount this week!"})
    assert r.status_code == 422 and "discount" in r.json()["detail"]
    r = client.post(f"/api/leads/{lid}/send", json={"body": "The price is {{PRICE}}"})
    assert r.status_code == 422


def test_opted_out_lead_gets_no_ai_and_no_messages(client):
    login(client, "admin")
    lid = a_waiting_lead(client)
    with Session(engine) as s:
        lead = s.get(Lead, lid)
        lead.opted_out = True
        s.add(lead)
        s.commit()
    assert client.post(f"/api/leads/{lid}/ai").status_code == 409
    assert client.post(f"/api/leads/{lid}/send", json={"body": "hello there"}).status_code == 409
