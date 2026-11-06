"""who gets the lead. same showroom first. inside the showroom the fewest open leads wins,
but a model specialist gets a head start of SPECIALIST_EDGE leads, so they win unless
they're already that much busier. ties go to whoever waited longest for a lead."""

from dataclasses import dataclass
from datetime import datetime

SPECIALIST_EDGE = 2


@dataclass
class Candidate:
    id: int
    name: str
    showroom_id: int | None
    model_ids: list[int]
    open_leads: int
    last_assigned_at: datetime | None


def pick_consultant(candidates: list[Candidate], showroom_id: int | None, model_id: int | None) -> Candidate | None:
    if not candidates:
        return None
    # nobody at that showroom (or no showroom given) -> anyone can take it
    pool = [c for c in candidates if c.showroom_id == showroom_id] or candidates
    def key(c: Candidate):
        # an empty model list means they sell everything, a list means only those models
        if model_id is not None and c.model_ids and model_id not in c.model_ids:
            fit = 1  # handles other models, only if nobody else can
        else:
            fit = 0
        edge = SPECIALIST_EDGE if model_id is not None and model_id in c.model_ids else 0
        # timestamps, so a db time (tz-aware) and 'never' compare without a fuss
        waited = c.last_assigned_at.timestamp() if c.last_assigned_at else float("-inf")
        return (fit, c.open_leads - edge, waited, c.id)

    return min(pool, key=key)
