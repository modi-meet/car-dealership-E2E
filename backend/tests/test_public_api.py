def test_models_list_has_on_road_from_price(client):
    r = client.get("/api/models")
    assert r.status_code == 200
    cars = r.json()
    assert len(cars) == 6
    h = next(c for c in cars if c["slug"] == "model-h")
    assert h["from_ex_showroom"] == 1_049_000
    assert h["from_on_road"] > h["from_ex_showroom"]


def test_model_detail_and_unknown_slug(client):
    r = client.get("/api/models/model-h")
    assert r.status_code == 200
    assert r.json()["variants"][0]["name"] == "LX"
    assert client.get("/api/models/nope").status_code == 404


def test_price_matches_worked_example(client):
    v = next(v for v in client.get("/api/models/model-h").json()["variants"] if v["stock_id"] == "NEW-H-02")
    p = client.get(f"/api/price?variant_id={v['id']}&city=Lucknow").json()
    assert p["available"] and p["total"] == 1_442_045
    assert p["valid_until"] == "2026-12-31"
    assert "may change" in p["note"].lower()


def test_price_differs_by_city(client):
    v = client.get("/api/models/model-s").json()["variants"][0]["id"]
    lko = client.get(f"/api/price?variant_id={v}&city=Lucknow").json()["total"]
    knp = client.get(f"/api/price?variant_id={v}&city=Kanpur").json()["total"]
    assert lko != knp


def test_unknown_city_is_price_on_request_not_an_error(client):
    v = client.get("/api/models/model-s").json()["variants"][0]["id"]
    p = client.get(f"/api/price?variant_id={v}&city=Delhi").json()
    assert p["available"] is False and p["total"] is None


def test_accessory_choice(client):
    v = client.get("/api/models/model-s").json()["variants"][0]["id"]
    none = client.get(f"/api/price?variant_id={v}&acc=").json()
    default = client.get(f"/api/price?variant_id={v}").json()
    assert default["total"] - none["total"] == 15_000
    assert client.get(f"/api/price?variant_id={v}&acc=abc").status_code == 422
