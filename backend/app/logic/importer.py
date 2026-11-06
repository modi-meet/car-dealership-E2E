"""portal csv -> clean rows. pure, no db, so it's easy to test every bad row."""

import csv
import io
from dataclasses import dataclass, field

from app.logic.leads import clean_phone

MAX_BYTES = 1_000_000
MAX_ROWS = 2_000

# portals don't agree on headers, map the usual suspects
ALIASES = {
    "name": {"name", "full name", "customer", "customer name", "lead name"},
    "phone": {"phone", "mobile", "mobile number", "phone number", "contact"},
    "email": {"email", "email id", "e-mail"},
    "model": {"model", "car", "car model", "interested model"},
    "showroom": {"showroom", "dealer location", "branch", "outlet"},
    "city": {"city", "location"},
    "source": {"source", "portal", "lead source"},
    "message": {"message", "comments", "remarks", "notes"},
}


@dataclass
class Row:
    line: int
    name: str
    phone: str
    email: str | None
    model_id: int | None
    showroom_id: int | None
    city: str
    message: str
    portal: str


@dataclass
class Parsed:
    rows: list[Row] = field(default_factory=list)
    errors: list[dict] = field(default_factory=list)


class CsvRejected(ValueError):
    """the whole file is unusable"""


def _header_map(headers: list[str]) -> dict[str, str]:
    out = {}
    for h in headers:
        key = (h or "").strip().lower()
        for field_name, names in ALIASES.items():
            if key in names and field_name not in out:
                out[field_name] = h
    return out


def _lookup(value: str, table: dict[str, int]) -> int | None:
    v = value.strip().lower()
    if not v:
        return None
    # "Model H", "model-h", "H" all point at the same car
    for k, id_ in table.items():
        if v == k or v.replace(" ", "-") == k or f"model {v}" == k:
            return id_
    return None


def parse_csv(raw: bytes, models: dict[str, int], showrooms: dict[str, int]) -> Parsed:
    """models / showrooms are lowercase name -> id (both names and slugs welcome)"""
    if len(raw) > MAX_BYTES:
        raise CsvRejected("file is over 1 MB, split it and try again")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise CsvRejected("save the file as UTF-8 CSV and try again")
    reader = csv.DictReader(io.StringIO(text))
    hmap = _header_map(reader.fieldnames or [])
    if "name" not in hmap or "phone" not in hmap:
        raise CsvRejected("we need at least a name and a phone column")

    out = Parsed()
    seen: set[str] = set()
    for i, rec in enumerate(reader, start=2):  # line 1 is the header
        if i - 1 > MAX_ROWS:
            raise CsvRejected(f"more than {MAX_ROWS} rows, split the file")

        def get(f: str) -> str:
            return (rec.get(hmap[f]) or "").strip() if f in hmap else ""

        if not any((v or "").strip() for v in rec.values() if isinstance(v, str)):
            continue  # blank line, skip quietly
        name, phone = get("name"), clean_phone(get("phone"))
        problems = []
        if len(name) < 2:
            problems.append("name missing")
        if not phone:
            problems.append(f"bad phone '{get('phone')}'")
        model_raw, showroom_raw = get("model"), get("showroom")
        model_id = _lookup(model_raw, models)
        if model_raw and model_id is None:
            problems.append(f"unknown model '{model_raw}'")
        showroom_id = _lookup(showroom_raw, showrooms)
        if showroom_raw and showroom_id is None:
            problems.append(f"unknown showroom '{showroom_raw}'")
        if phone and phone in seen:
            problems.append("same phone twice in this file")
        if problems:
            out.errors.append({"line": i, "name": name, "problems": problems})
            continue
        seen.add(phone)
        out.rows.append(Row(line=i, name=name[:80], phone=phone, email=get("email") or None, model_id=model_id,
                            showroom_id=showroom_id, city=get("city")[:40] or "Lucknow",
                            message=get("message")[:1000], portal=get("source")[:40] or "portal"))
    return out
