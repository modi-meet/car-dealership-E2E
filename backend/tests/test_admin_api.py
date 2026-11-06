from tests.conftest import login

RULE = {"fuel": "petrol", "price_from": 0, "price_to": 1_000_000, "road_tax_bp": 800, "registration_fee": 6500,
        "valid_from": "2027-04-01", "valid_until": "2027-06-30"}


def city_id(client, name="Lucknow"):
    return next(c["id"] for c in client.get("/api/admin/price-tables").json()["cities"] if c["name"] == name)


def test_only_admin(client):
    login(client, "ankit")
    assert client.get("/api/admin/models").status_code == 403
    assert client.get("/api/admin/used").status_code == 403


def test_price_change_shows_up_on_the_site(client):
    login(client, "admin")
    model = next(m for m in client.get("/api/admin/models").json() if m["slug"] == "model-s")
    v = model["variants"][0]
    before = client.get(f"/api/price?variant_id={v['id']}").json()["total"]
    r = client.patch(f"/api/admin/variants/{v['id']}", json={"ex_showroom": v["ex_showroom"] + 10_000})
    assert r.status_code == 200
    after = client.get(f"/api/price?variant_id={v['id']}").json()["total"]
    # 10k more ex-showroom, plus 8% road tax and 3.1% insurance on it
    assert after - before == 10_000 + 800 + 310


def test_overlapping_tax_rule_is_refused(client):
    login(client, "admin")
    lko = city_id(client)
    # the seed already has lucknow petrol 0-10L for oct 2026 to mar 2027
    clash = {**RULE, "city_id": lko, "valid_from": "2027-03-01", "valid_until": "2027-04-30"}
    r = client.post("/api/admin/tax-rules", json=clash)
    assert r.status_code == 422 and "overlaps" in r.json()["detail"]
    # next quarter is fine
    assert client.post("/api/admin/tax-rules", json={**RULE, "city_id": lko}).status_code == 201


def test_bad_rule_values(client):
    login(client, "admin")
    lko = city_id(client)
    assert client.post("/api/admin/tax-rules", json={**RULE, "city_id": lko, "price_from": 5, "price_to": 1}).status_code == 422
    assert client.post("/api/admin/tax-rules", json={**RULE, "city_id": lko, "road_tax_bp": 9000}).status_code == 422
    assert client.post("/api/admin/tax-rules", json={**RULE, "city_id": lko, "valid_from": "2027-07-01"}).status_code == 422


def test_new_city_without_rules_is_price_on_request(client):
    login(client, "admin")
    assert client.post("/api/admin/cities", json={"name": "Sitapur"}).status_code == 201
    v = client.get("/api/admin/models").json()[0]["variants"][0]["id"]
    p = client.get(f"/api/price?variant_id={v}&city=Sitapur").json()
    assert p["available"] is False


def test_used_stock_crud_and_masking(client):
    login(client, "admin")
    body = {"stock_id": "UC-9001", "model_slug": "model-h", "variant": "VX", "fuel": "petrol", "transmission": "Manual",
            "year": 2023, "km": 18000, "owners": 1, "price": 1_050_000, "reg_number": "up32 ab 7788",
            "colour": "Polar White", "showroom_id": 1, "inspection_score": 93}
    r = client.post("/api/admin/used", json=body)
    assert r.status_code == 201 and r.json()["reg_number"] == "UP32 AB 7788"
    assert client.post("/api/admin/used", json=body).status_code == 409  # same stock id
    pub = client.get("/api/used/UC-9001").json()
    assert pub["reg_masked"] == "UP32 •• ••88" and "7788" not in str(pub)
    client.patch(f"/api/admin/used/{r.json()['id']}", json={"status": "sold"})
    assert client.get("/api/used/UC-9001").status_code == 404
    assert client.post("/api/admin/used", json={**body, "stock_id": "UC-9002", "reg_number": "not a reg"}).status_code == 422


def test_variant_in_use_cant_be_deleted(client):
    login(client, "admin")
    demo = client.get("/api/demo-cars").json()[0]
    assert client.delete(f"/api/admin/variants/{demo['variant_id']}").status_code == 409


def test_admin_cant_lock_themselves_out(client):
    login(client, "admin")
    me = client.get("/api/auth/me").json()
    assert client.patch(f"/api/admin/users/{me['id']}", json={"role": "consultant"}).status_code == 422
    buyer = next(u for u in client.get("/api/admin/users").json() if u["role"] == "buyer")
    assert client.patch(f"/api/admin/users/{buyer['id']}", json={"role": "consultant"}).status_code == 422  # no showroom
