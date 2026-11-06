from datetime import UTC, datetime, timedelta

from app.logic.assignment import Candidate, pick_consultant
from app.logic.masking import mask_reg
from app.logic.slots import IST, free_slots, is_bookable

# masking


def test_mask_keeps_state_and_last_two():
    assert mask_reg("UP32 MK 4418") == "UP32 •• ••18"
    assert mask_reg("up-32-mk-4418") == "UP32 •• ••18"


def test_mask_never_leaks_short_or_odd_input():
    assert "4418" not in mask_reg("4418")
    assert mask_reg("") == "•• •• ••••"


# slots

MORNING = datetime(2026, 11, 6, 9, 0, tzinfo=IST)
TODAY = MORNING.date()


def free(day, booked=frozenset(), now=MORNING):
    return [s["slot"] for s in free_slots(day, set(booked), now) if s["free"]]


def test_whole_day_free_when_early():
    assert free(TODAY)[0] == "10:00" and len(free(TODAY)) == 8


def test_booked_slot_is_taken():
    assert "11:00" not in free(TODAY, {"11:00"})


def test_needs_an_hour_of_notice():
    now = datetime(2026, 11, 6, 10, 30, tzinfo=IST)
    # 11:00 is only 30 min away, 12:00 is fine
    assert free(TODAY, now=now)[0] == "12:00"


def test_utc_clock_still_uses_ist():
    # servers run on utc. 05:00 utc is 10:30 ist, so 11:00 is too soon
    now_utc = datetime(2026, 11, 6, 5, 0, tzinfo=UTC)
    assert free(TODAY, now=now_utc)[0] == "12:00"


def test_no_past_days_and_no_more_than_two_weeks_ahead():
    assert free(TODAY - timedelta(days=1)) == []
    assert free(TODAY + timedelta(days=15)) == []
    assert free(TODAY + timedelta(days=14))


def test_is_bookable_rejects_made_up_slot():
    assert not is_bookable(TODAY, "10:30", set(), MORNING)
    assert is_bookable(TODAY, "10:00", set(), MORNING)


# assignment

T0 = datetime(2026, 11, 1, 10, 0)


def c(id, showroom, models=(), open_leads=0, last=None):
    return Candidate(id=id, name=f"c{id}", showroom_id=showroom, model_ids=list(models), open_leads=open_leads, last_assigned_at=last)


def test_same_showroom_wins():
    assert pick_consultant([c(1, 1), c(2, 2)], showroom_id=2, model_id=None).id == 2


def test_model_specialist_preferred():
    got = pick_consultant([c(1, 1, open_leads=0), c(2, 1, models=[7], open_leads=5)], showroom_id=1, model_id=7)
    assert got.id == 2


def test_generalist_beats_wrong_specialist():
    got = pick_consultant([c(1, 1, models=[3]), c(2, 1, models=[])], showroom_id=1, model_id=7)
    assert got.id == 2


def test_least_loaded_then_longest_waiting():
    a = c(1, 1, open_leads=3)
    b = c(2, 1, open_leads=1, last=T0 + timedelta(hours=2))
    d = c(3, 1, open_leads=1, last=T0)
    assert pick_consultant([a, b, d], 1, None).id == 3


def test_never_assigned_goes_first_on_a_tie():
    assert pick_consultant([c(1, 1, last=T0), c(2, 1)], 1, None).id == 2


def test_unknown_showroom_falls_back_to_anyone():
    assert pick_consultant([c(1, 1, open_leads=2), c(2, 2)], showroom_id=99, model_id=None).id == 2


def test_nobody_to_assign():
    assert pick_consultant([], 1, 1) is None

