"""creating a lead = save it, hand it to a person, send the (mock) whatsapp ack.
kept in one place so web forms, test drives and csv import all behave the same."""

import re

from sqlmodel import Session, func, select

from app.logic.assignment import Candidate, pick_consultant
from app.models import Lead, LeadEvent, LeadStatus, Role, Showroom, User, now

CLOSED = (LeadStatus.won, LeadStatus.lost)


def clean_phone(raw: str) -> str | None:
    """'+91 98390 12345' -> '9839012345', None if it isn't an indian mobile"""
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    return digits if re.fullmatch(r"[6-9]\d{9}", digits) else None


def candidates(session: Session) -> list[Candidate]:
    users = session.exec(select(User).where(User.role == Role.consultant, User.is_active)).all()
    out = []
    for u in users:
        open_n = session.exec(
            select(func.count()).select_from(Lead).where(Lead.assigned_to == u.id, Lead.status.not_in(CLOSED))
        ).one()
        last = session.exec(select(func.max(Lead.created_at)).where(Lead.assigned_to == u.id)).one()
        out.append(Candidate(id=u.id, name=u.name, showroom_id=u.showroom_id, model_ids=u.model_ids or [],
                             open_leads=open_n, last_assigned_at=last))
    return out


def ack_text(lead: Lead, consultant: User | None, showroom: Showroom | None) -> str:
    first = lead.name.split()[0]
    if lead.lang == "hi":
        who = f"{consultant.name}, {showroom.name if showroom else 'Company A'}" if consultant else "Company A की टीम"
        return f"नमस्ते {first}, आपकी रिक्वेस्ट मिल गई है। {who} जल्द ही आपको कॉल करेंगे।"
    who = f"{consultant.name} from {showroom.name if showroom else 'Company A'}" if consultant else "Our team"
    return f"Hi {first}, thanks for your request. {who} will call you shortly."


def create_lead(session: Session, lead: Lead) -> Lead:
    """caller commits. returns the lead with assigned_to filled in when possible"""
    lead.created_at = now()
    session.add(lead)
    session.flush()
    session.add(LeadEvent(lead_id=lead.id, kind="created", body=f"{lead.source} · {lead.type.replace('_', ' ')}"))

    pick = pick_consultant(candidates(session), lead.showroom_id, lead.model_id)
    consultant = session.get(User, pick.id) if pick else None
    if consultant:
        lead.assigned_to = consultant.id
        # test drive at a showroom stays there, otherwise go where the consultant is
        lead.showroom_id = lead.showroom_id or consultant.showroom_id
        session.add(LeadEvent(lead_id=lead.id, kind="assigned", body=f"auto-assigned to {consultant.name}"))
    else:
        # nobody active, the lead desk sees it unassigned
        session.add(LeadEvent(lead_id=lead.id, kind="assigned", body="no consultant available, waiting in the desk"))

    if not lead.opted_out:
        showroom = session.get(Showroom, lead.showroom_id) if lead.showroom_id else None
        session.add(LeadEvent(lead_id=lead.id, kind="message_sent", body=f"WhatsApp (mock): {ack_text(lead, consultant, showroom)}"))
    return lead
