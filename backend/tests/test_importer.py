import pytest

from app.logic.importer import CsvRejected, parse_csv

MODELS = {"model h": 1, "model-h": 1, "model c": 2, "model-c": 2}
SHOWROOMS = {"gomti nagar": 1, "aliganj": 2}


def parse(text: str):
    return parse_csv(text.encode(), MODELS, SHOWROOMS)


def test_happy_rows_with_portal_style_headers():
    p = parse("Customer Name,Mobile,Car,Branch,Lead Source\nRahul A,+91 98390 11111,Model H,Gomti Nagar,CarDekho\n")
    assert not p.errors
    r = p.rows[0]
    assert (r.name, r.phone, r.model_id, r.showroom_id, r.portal) == ("Rahul A", "9839011111", 1, 1, "CarDekho")


def test_model_spelled_loosely():
    p = parse("name,phone,model\nA B,9839011111,h\nC D,9839022222,model-c\n")
    assert [r.model_id for r in p.rows] == [1, 2]


def test_bad_rows_are_reported_with_line_numbers():
    p = parse("name,phone,model,showroom\n"
              "Good One,9839011111,Model H,Aliganj\n"
              ",9839022222,,\n"
              "Bad Phone,12345,,\n"
              "Wrong Car,9839033333,Model Z,\n"
              "Wrong Place,9839044444,,Hazratganj\n")
    assert len(p.rows) == 1
    by_line = {e["line"]: e["problems"] for e in p.errors}
    assert by_line[3] == ["name missing"]
    assert "bad phone" in by_line[4][0]
    assert "unknown model" in by_line[5][0]
    assert "unknown showroom" in by_line[6][0]


def test_duplicate_phone_inside_file():
    p = parse("name,phone\nA A,9839011111\nB B,98390 11111\n")
    assert len(p.rows) == 1 and p.errors[0]["problems"] == ["same phone twice in this file"]


def test_blank_lines_and_bom_are_fine():
    p = parse_csv("﻿name,phone\nA A,9839011111\n,\n\n".encode(), MODELS, SHOWROOMS)
    assert len(p.rows) == 1 and not p.errors


def test_missing_required_columns():
    with pytest.raises(CsvRejected):
        parse("name,email\nA,a@b.c\n")


def test_too_big_and_not_utf8():
    with pytest.raises(CsvRejected):
        parse_csv(b"x" * 1_000_001, MODELS, SHOWROOMS)
    with pytest.raises(CsvRejected):
        parse_csv("name,phone\nJosé,9839011111\n".encode("latin-1"), MODELS, SHOWROOMS)


def test_long_fields_are_trimmed():
    p = parse("name,phone,message\n" + "N" * 200 + ",9839011111," + "m" * 5000 + "\n")
    assert len(p.rows[0].name) == 80 and len(p.rows[0].message) == 1000
