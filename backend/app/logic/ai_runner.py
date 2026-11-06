"""glue between a lead in the db and the ai module: gather facts, run, save."""

import logging

from sqlmodel import Session, select

from app.db import engine
from app.logic import ai
from app.logic.pricing import PriceUnavailable
from app.models import CarModel, DemoCar, Lead, LeadEvent, Showroom, TestDrive, UsedCar, User, Variant

log = logging.getLogger("ai")


def inr(n: int) -> str:
    # indian grouping: 1442045 -> 14,42,045
    s = str(n)
    if len(s) <= 3:
        return s
    head, tail = s[:-3], s[-3:]
    parts = []
    while len(head) > 2:
        parts.insert(0, head[-2:])
        head = head[:-2]
    if head:
        parts.insert(0, head)
    return ",".join(parts + [tail])


def facts_for(session: Session, lead: Lead) -> ai.Facts:
    # local import, public.py imports from logic and we don't want a loop
    from app.routers.public import price_for

    model = session.get(CarModel, lead.model_id) if lead.model_id else None
    variant = session.get(Variant, lead.variant_id) if lead.variant_id else None
    if model and not variant:
        variant = session.exec(select(Variant).where(Variant.model_id == model.id).order_by(Variant.ex_showroom)).first()
    used = session.get(UsedCar, lead.used_car_id) if lead.used_car_id else None
    room = session.get(Showroom, lead.showroom_id) if lead.showroom_id else None
    owner = session.get(User, lead.assigned_to) if lead.assigned_to else None

    price_text = None
    if used:
        price_text = f"₹{inr(used.price)}"
    elif variant:
        try:
            b = price_for(session, variant, lead.city or "Lucknow", None)
            when = b.valid_until.strftime("%-d %b %Y")
            label = "from " if not lead.variant_id else ""
            price_text = (f"{label}₹{inr(b.total)} on-road in {b.city} (valid till {when})" if lead.lang != "hi"
                          else f"{b.city} में ऑन-रोड {label and 'शुरुआती '}₹{inr(b.total)} ({when} तक मान्य)")
        except PriceUnavailable:
            price_text = None

    td = session.exec(select(TestDrive).where(TestDrive.lead_id == lead.id)).first()
    td_text = None
    if td:
        demo = session.get(DemoCar, td.demo_car_id)
        where = session.get(Showroom, demo.showroom_id)
        h, m = map(int, td.slot.split(":"))
        td_text = f"{td.date.strftime('%a %-d %b')}, {((h + 11) % 12) + 1}:{m:02d} {'am' if h < 12 else 'pm'} at {where.locality}"

    return ai.Facts(
        lead_id=lead.id, first_name=lead.name.split()[0], lang=lead.lang, lead_type=lead.type, source=lead.source,
        message=lead.message, model=model.name if model else None,
        variant=variant.name if (variant and lead.variant_id) else None, showroom=room.locality if room else None,
        consultant_first=owner.name.split()[0] if owner else None, price_text=price_text,
        used_car=f"{used.year} {used.model_name} {used.variant}" if used else None, test_drive=td_text,
    )


def apply(session: Session, lead: Lead, caller=ai.call_claude, actor_id: int | None = None) -> ai.Result | None:
    """caller commits"""
    if lead.opted_out:
        # they withdrew consent, so no profiling and no drafts
        lead.ai_status, lead.ai_summary, lead.ai_draft = "skipped", {}, ""
        session.add(lead)
        return None
    r = ai.run(facts_for(session, lead), caller=caller)
    lead.ai_status, lead.ai_summary, lead.ai_draft = r.status, {**r.summary, "problems": r.problems}, r.draft
    session.add(lead)
    note = {"ok": "AI read and draft ready", "needs_review": "AI draft needs a careful look: " + "; ".join(r.problems),
            "fallback": "AI unavailable, template draft used"}[r.status]
    session.add(LeadEvent(lead_id=lead.id, kind="ai", body=note, actor_id=actor_id))
    return r


def run_in_background(lead_id: int) -> None:
    # own session: the request that made the lead has already returned
    try:
        with Session(engine) as s:
            lead = s.get(Lead, lead_id)
            if lead:
                apply(s, lead)
                s.commit()
    except Exception:  # noqa: BLE001
        log.exception("background ai failed for lead %s", lead_id)
