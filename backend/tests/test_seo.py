import json
import re

from sqlmodel import Session

from app import seo
from app.db import engine


def head(path):
    with Session(engine) as s:
        return seo.for_path(path, s)


def ld(tags: str) -> dict:
    return json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', tags, re.S).group(1))


def test_model_page_has_title_price_and_car_schema():
    tags, status = head("/cars/model-h")
    assert status == 200
    assert "<title>Model H on-road price in Lucknow" in tags
    data = ld(tags)
    assert data["@type"] == "Car" and data["offers"]["priceCurrency"] == "INR"
    assert data["offers"]["lowPrice"] > 1_049_000  # on-road, not ex-showroom
    assert 'rel="canonical"' in tags and 'rel="preload" as="image"' in tags


def test_used_page_schema_never_leaks_the_reg_number():
    tags, status = head("/used/UC-1182")
    assert status == 200 and "41,200 km" in tags
    assert ld(tags)["mileageFromOdometer"]["value"] == 41200
    assert "4418" not in tags and "MK" not in tags


def test_unknown_and_sold_are_real_404s():
    assert head("/cars/model-zz")[1] == 404
    assert head("/used/UC-1216")[1] == 404  # sold
    assert head("/nothing-here")[1] == 404


def test_staff_pages_are_noindex():
    tags, _ = head("/desk/leads/3")
    assert 'content="noindex"' in tags


def test_text_is_escaped():
    tags = seo.tags('a "quote" <b>', "x</script>", "/x")
    assert "<b>" not in tags and "&quot;quote&quot;" in tags


def test_sitemap_and_robots():
    with Session(engine) as s:
        xml = seo.sitemap(s)
    assert "/cars/model-h" in xml and "/used/UC-1182" in xml and "/used/UC-1190" in xml
    assert "UC-1216" not in xml and "/desk" not in xml
    r = seo.robots()
    assert "Disallow: /desk" in r and "Disallow: /api/" in r and "Sitemap:" in r


def test_boot_data_matches_the_api_and_stays_masked():
    with Session(engine) as s:
        model = dict((tuple(k), v) for k, v in seo.boot("/cars/model-h", "", s))
        used = seo.boot("/used/UC-1182", "", s)
        assert seo.boot("/cars/model-zz", "", s) == []
    assert model[("price", 1, "Lucknow", None)]["available"] is True
    assert model[("model", "model-h")]["variants"][0]["name"] == "LX"
    script = seo.boot_script(used)
    assert "UP32 •• ••18" in script and "4418" not in script
    assert "</script" not in seo.boot_script([[["x"], {"s": "</script><b>"}]]).removesuffix("</script>")


def test_head_works_for_pages(client):
    # uptime checks and link unfurlers send head first
    assert client.head("/cars/model-h").status_code == 200
    assert client.head("/cars/nope").status_code == 404
