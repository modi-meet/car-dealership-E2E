from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")

# 45 min drives with a 15 min turnaround, showroom open 10 to 6
SLOTS = ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"]
BOOK_AHEAD_DAYS = 14
# need a little notice to get the car washed and a consultant free
MIN_NOTICE = timedelta(minutes=60)


def now_ist() -> datetime:
    return datetime.now(IST)


def slot_start(day: date, slot: str) -> datetime:
    h, m = map(int, slot.split(":"))
    return datetime.combine(day, time(h, m), IST)


def bookable_day(day: date, now: datetime) -> bool:
    today = now.astimezone(IST).date()
    return today <= day <= today + timedelta(days=BOOK_AHEAD_DAYS)


def free_slots(day: date, booked: set[str], now: datetime) -> list[dict]:
    """every slot for the day, each marked free or not and why"""
    if not bookable_day(day, now):
        return []
    out = []
    for s in SLOTS:
        if s in booked:
            out.append({"slot": s, "free": False, "why": "booked"})
        elif slot_start(day, s) < now + MIN_NOTICE:
            out.append({"slot": s, "free": False, "why": "past"})
        else:
            out.append({"slot": s, "free": True, "why": None})
    return out


def is_bookable(day: date, slot: str, booked: set[str], now: datetime) -> bool:
    return any(x["slot"] == slot and x["free"] for x in free_slots(day, booked, now))
