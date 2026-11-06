"""who gets the lead. same showroom first, then someone who handles that model,
then whoever has the fewest open leads, then whoever waited longest for one."""

from dataclasses import dataclass
from datetime import datetime


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
    if model_id is not None:
        specialists = [c for c in pool if model_id in c.model_ids]
        # an empty model list means they sell everything, still counts as a fit
        generalists = [c for c in pool if not c.model_ids]
        pool = specialists or generalists or pool

    never = datetime.min

    def key(c: Candidate):
        return (c.open_leads, c.last_assigned_at or never, c.id)

    return min(pool, key=key)
