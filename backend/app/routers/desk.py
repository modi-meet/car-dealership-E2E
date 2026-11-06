import csv
import io
from datetime import datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlmodel import Session, or_, select

from app.auth import require
from app.db import get_session
from app.logic import ai_runner
from app.logic.ai import check_draft
from app.logic.importer import CsvRejected, parse_csv
from app.logic.leads import CLOSED, create_lead
from app.logic.slots import IST, now_ist
from app.models import (CarModel, DemoCar, Lead, LeadEvent, LeadSource, LeadStatus, LeadType, Role, Showroom, TestDrive,
                        UsedCar, User, Variant, now)

router = APIRouter(prefix="/api", tags=["desk"])
staff = require(Role.consultant, Role.admin)
admin_only = require(Role.admin)

SLA = timedelta(minutes=5)
DEDUPE_WINDOW = timedelta(days=30)


def scoped(q, user: User):
    # consultants see their own leads and anything at their showroom, admin sees all
    if user.role == Role.admin:
        return q
    return q.where(or_(Lead.assigned_to == user.id, Lead.showroom_id == user.showroom_id))


def can_see(user: User, lead: Lead) -> bool:
    return user.role == Role.admin or lead.assigned_to == user.id or (lead.showroom_id is not None and lead.showroom_id == user.showroom_id)


def get_visible(session: Session, user: User, lead_id: int) -> Lead:
    lead = session.get(Lead, lead_id)
    # same 404 for "doesn't exist" and "not yours", no fishing
    if not lead or not can_see(user, lead):
        raise HTTPException(404, "lead not found")
    return lead


def names(session: Session, model, ids) -> dict:
    ids = {i for i in ids if i}
    return {r.id: r for r in session.exec(select(model).where(model.id.in_(ids)))} if ids else {}


def row(lead: Lead, models: dict, users: dict, showrooms: dict) -> dict:
    m, u, s = models.get(lead.model_id), users.get(lead.assigned_to), showrooms.get(lead.showroom_id)
    return {
        "id": lead.id, "name": lead.name, "phone": lead.phone, "type": lead.type, "source": lead.source,
        "status": lead.status, "model": m.name if m else None, "message": lead.message[:140],
        "assignee": u.name if u else None, "assignee_id": lead.assigned_to, "showroom": s.locality if s else None,
        "created_at": lead.created_at, "due_at": lead.created_at + SLA, "first_response_at": lead.first_response_at,
        "opted_out": lead.opted_out, "ai_status": lead.ai_status, "intent": (lead.ai_summary or {}).get("intent"),
    }


@router.get("/leads")
def list_leads(
    view: str = Query("open", pattern="^(waiting|open|closed|all)$"),
    mine: bool = False,
    q: str | None = Query(None, max_length=60),
    user: User = Depends(staff),
    session: Session = Depends(get_session),
):
    stmt = scoped(select(Lead), user)
    if mine:
        stmt = stmt.where(Lead.assigned_to == user.id)
    if view == "waiting":
        stmt = stmt.where(Lead.first_response_at == None)  # noqa: E711
    elif view == "open":
        stmt = stmt.where(Lead.status.not_in(CLOSED))
    elif view == "closed":
        stmt = stmt.where(Lead.status.in_(CLOSED))
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Lead.name.ilike(like), Lead.phone.like(like)))
    # waiting ones first (oldest at the top, they're the most overdue), then newest
    leads = list(session.exec(stmt.order_by(Lead.created_at.desc()).limit(300)))
    leads.sort(key=lambda x: (x.first_response_at is not None, x.created_at if x.first_response_at is None else -x.created_at.timestamp()))
    models = names(session, CarModel, [x.model_id for x in leads])
    users = names(session, User, [x.assigned_to for x in leads])
    rooms = names(session, Showroom, [x.showroom_id for x in leads])
    return [row(x, models, users, rooms) for x in leads]


@router.get("/desk/stats")
def stats(user: User = Depends(staff), session: Session = Depends(get_session)):
    # "today" is the indian day, stored times are utc
    start = datetime.combine(now_ist().date(), datetime.min.time(), IST)
    leads = list(session.exec(scoped(select(Lead), user).where(Lead.created_at >= start)))
    t = now()
    answered = [x for x in leads if x.first_response_at]
    fast = [x for x in answered if x.first_response_at - x.created_at <= SLA]
    waiting_all = list(session.exec(scoped(select(Lead), user).where(Lead.first_response_at == None, Lead.status.not_in(CLOSED))))  # noqa: E711
    mins = sorted((x.first_response_at - x.created_at).total_seconds() / 60 for x in answered)
    return {
        "today": len(leads),
        "within_sla_pct": round(100 * len(fast) / len(leads)) if leads else None,
        "median_response_min": round(mins[len(mins) // 2], 1) if mins else None,
        "overdue_now": sum(1 for x in waiting_all if t > x.created_at + SLA),
        "waiting_now": len(waiting_all),
    }


@router.get("/consultants")
def consultants(_: User = Depends(staff), session: Session = Depends(get_session)):
    rows = session.exec(select(User, Showroom).join(Showroom, Showroom.id == User.showroom_id)
                        .where(User.role == Role.consultant, User.is_active).order_by(Showroom.id, User.name))
    return [{"id": u.id, "name": u.name, "showroom": s.locality} for u, s in rows]


@router.get("/leads/{lead_id}")
def lead_detail(lead_id: int, user: User = Depends(staff), session: Session = Depends(get_session)):
    lead = get_visible(session, user, lead_id)
    model = session.get(CarModel, lead.model_id) if lead.model_id else None
    variant = session.get(Variant, lead.variant_id) if lead.variant_id else None
    used = session.get(UsedCar, lead.used_car_id) if lead.used_car_id else None
    td = session.exec(select(TestDrive).where(TestDrive.lead_id == lead.id)).first()
    td_out = None
    if td:
        demo = session.get(DemoCar, td.demo_car_id)
        room = session.get(Showroom, demo.showroom_id)
        td_out = {"day": td.date, "slot": td.slot, "showroom": room.locality, "status": td.status}
    events = list(session.exec(select(LeadEvent).where(LeadEvent.lead_id == lead.id).order_by(LeadEvent.at, LeadEvent.id)))
    actors = names(session, User, [e.actor_id for e in events])
    base = row(lead, {model.id: model} if model else {}, names(session, User, [lead.assigned_to]),
               names(session, Showroom, [lead.showroom_id]))
    return {
        **base,
        "email": lead.email, "lang": lead.lang, "city": lead.city, "message": lead.message,
        "consent_at": lead.consent_at, "model_slug": model.slug if model else None,
        "variant": variant.name if variant else None, "variant_id": lead.variant_id,
        "used_car": {"stock_id": used.stock_id, "title": f"{used.year} {used.model_name} {used.variant}",
                     "price": used.price, "km": used.km} if used else None,
        "test_drive": td_out,
        "ai_summary": lead.ai_summary, "ai_draft": lead.ai_draft,
        "events": [{"id": e.id, "kind": e.kind, "body": e.body, "at": e.at,
                    "actor": actors[e.actor_id].name if e.actor_id in actors else None} for e in events],
    }


class LeadPatch(BaseModel):
    status: LeadStatus | None = None
    assigned_to: int | None = None
    note: str | None = Field(None, min_length=1, max_length=1000)


@router.patch("/leads/{lead_id}")
def update_lead(lead_id: int, body: LeadPatch, user: User = Depends(staff), session: Session = Depends(get_session)):
    lead = get_visible(session, user, lead_id)
    if body.status is not None and body.status != lead.status:
        if body.status == LeadStatus.new:
            raise HTTPException(422, "a lead can't go back to new")
        session.add(LeadEvent(lead_id=lead.id, kind="status", body=f"status → {body.status.replace('_', ' ')}", actor_id=user.id))
        lead.status = body.status
        # the 5 minute clock stops at the first real action
        if lead.first_response_at is None:
            lead.first_response_at = now()
    if body.assigned_to is not None and body.assigned_to != lead.assigned_to:
        to = session.get(User, body.assigned_to)
        if not to or to.role != Role.consultant or not to.is_active:
            raise HTTPException(422, "pick an active consultant")
        session.add(LeadEvent(lead_id=lead.id, kind="reassigned", body=f"re-assigned to {to.name}", actor_id=user.id))
        lead.assigned_to = to.id
        # follows the person, so their showroom team can see it too
        lead.showroom_id = to.showroom_id
    if body.note:
        session.add(LeadEvent(lead_id=lead.id, kind="note", body=body.note.strip(), actor_id=user.id))
    session.add(lead)
    session.commit()
    return lead_detail(lead.id, user, session) if can_see(user, lead) else {"id": lead.id, "moved": True}


# portal csv in, dms csv out


@router.post("/leads/import")
async def import_leads(bg: BackgroundTasks, file: UploadFile = File(...), user: User = Depends(staff), session: Session = Depends(get_session)):
    raw = await file.read(1_000_001)
    lookup_models = {}
    for m in session.exec(select(CarModel)):
        lookup_models[m.name.lower()] = m.id
        lookup_models[m.slug] = m.id
    lookup_rooms = {}
    for s in session.exec(select(Showroom)):
        lookup_rooms[s.locality.lower()] = s.id
        lookup_rooms[s.name.lower()] = s.id
    try:
        parsed = parse_csv(raw, lookup_models, lookup_rooms)
    except CsvRejected as e:
        raise HTTPException(422, str(e))

    created, duplicates = [], []
    since = now() - DEDUPE_WINDOW
    for r in parsed.rows:
        existing = session.exec(select(Lead).where(Lead.phone == r.phone, Lead.created_at >= since)
                                .order_by(Lead.created_at.desc())).first()
        if existing:
            # same buyer again, don't make a second lead, tell the owner instead
            session.add(LeadEvent(lead_id=existing.id, kind="note", actor_id=user.id,
                                  body=f"came in again via {r.portal}" + (f": {r.message}" if r.message else "")))
            duplicates.append({"line": r.line, "name": r.name, "lead_id": existing.id})
            continue
        lead = Lead(name=r.name, phone=r.phone, email=r.email, source=LeadSource.portal, type=LeadType.enquiry,
                    model_id=r.model_id, showroom_id=r.showroom_id, city=r.city,
                    message=r.message, consent=True, consent_at=now())
        create_lead(session, lead)
        session.add(LeadEvent(lead_id=lead.id, kind="note", body=f"imported from {r.portal} csv, consent taken by the portal"))
        created.append({"line": r.line, "name": r.name, "lead_id": lead.id})
    session.commit()
    for c in created:
        bg.add_task(ai_runner.run_in_background, c["lead_id"])
    return {"created": created, "duplicates": duplicates, "errors": parsed.errors}


@router.get("/desk/export.csv")
def export_csv(day: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"), _: User = Depends(admin_only),
               session: Session = Depends(get_session)):
    # stand-in for the dms integration: one file a day the dms team can load
    d = datetime.fromisoformat(day).date() if day else now_ist().date()
    start = datetime.combine(d, datetime.min.time(), IST)
    leads = list(session.exec(select(Lead).where(Lead.created_at >= start, Lead.created_at < start + timedelta(days=1))
                              .order_by(Lead.created_at)))
    models = names(session, CarModel, [x.model_id for x in leads])
    users = names(session, User, [x.assigned_to for x in leads])
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["lead_id", "created_ist", "name", "phone", "source", "type", "model", "status", "consultant", "first_response_min", "opted_out"])
    for x in leads:
        resp = round((x.first_response_at - x.created_at).total_seconds() / 60, 1) if x.first_response_at else ""
        w.writerow([x.id, x.created_at.astimezone(IST).strftime("%Y-%m-%d %H:%M"), x.name,
                    "" if x.opted_out else x.phone, x.source, x.type,
                    models[x.model_id].name if x.model_id in models else "", x.status,
                    users[x.assigned_to].name if x.assigned_to in users else "", resp, x.opted_out])
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="leads-{d}.csv"'})


# ai read + draft, and the (mock) whatsapp send


@router.post("/leads/{lead_id}/ai")
def regenerate_ai(lead_id: int, user: User = Depends(staff), session: Session = Depends(get_session)):
    lead = get_visible(session, user, lead_id)
    if lead.opted_out:
        raise HTTPException(409, "this buyer opted out, no AI or messages")
    ai_runner.apply(session, lead, actor_id=user.id)
    session.commit()
    return lead_detail(lead.id, user, session)


class SendIn(BaseModel):
    body: str = Field(min_length=2, max_length=1000)


@router.post("/leads/{lead_id}/send")
def send_message(lead_id: int, msg: SendIn, user: User = Depends(staff), session: Session = Depends(get_session)):
    lead = get_visible(session, user, lead_id)
    if lead.opted_out:
        raise HTTPException(409, "this buyer opted out, we can't message them")
    text = msg.body.strip()
    # same rule for people as for the ai: no discounts in writing
    if any(p == "mentions a discount or offer" for p in check_draft(text, lead.lang)):
        raise HTTPException(422, "messages can't mention discounts or offers, talk about those in person")
    if "{{" in text:
        raise HTTPException(422, "there's a placeholder left in the message")
    session.add(LeadEvent(lead_id=lead.id, kind="message_sent", body=f"WhatsApp (mock) by {user.name}: {text}", actor_id=user.id))
    if lead.first_response_at is None:
        lead.first_response_at = now()
    if lead.status == LeadStatus.new:
        lead.status = LeadStatus.contacted
        session.add(LeadEvent(lead_id=lead.id, kind="status", body="status → contacted", actor_id=user.id))
    session.add(lead)
    session.commit()
    return lead_detail(lead.id, user, session)
