"""crawlers get real titles, descriptions and json-ld for every car without us
prerendering anything: we fill the <!--seo--> slot in index.html from the db."""

import html
import json
from datetime import date
from xml.sax.saxutils import escape

from sqlmodel import Session, select

from app.logic.ai_runner import inr
from app.logic.pricing import PriceUnavailable
from app.models import CarModel, UsedCar, UsedStatus, Variant
from app.settings import settings

SITE = "Company A"
DEFAULT_DESC = "New and certified used Brand X cars in Lucknow. See on-road prices by city and book a test drive in a real slot."
PRIVATE = ("/desk", "/admin", "/login")


def url(path: str) -> str:
    return settings.public_url.rstrip("/") + path


def tags(title: str, desc: str, path: str, image: str | None = None, ld: dict | None = None, noindex: bool = False) -> str:
    e = lambda s: html.escape(s, quote=True)  # noqa: E731
    out = [
        f"<title>{e(title)}</title>",
        f'<meta name="description" content="{e(desc)}" />',
        f'<link rel="canonical" href="{e(url(path))}" />',
        f'<meta property="og:title" content="{e(title)}" />',
        f'<meta property="og:description" content="{e(desc)}" />',
        f'<meta property="og:url" content="{e(url(path))}" />',
        '<meta property="og:type" content="website" />',
        f'<meta property="og:site_name" content="{SITE}" />',
    ]
    if image:
        out.append(f'<meta property="og:image" content="{e(url(image))}" />')
        # the hero is the lcp, let the browser start on it before react boots
        out.append(f'<link rel="preload" as="image" href="{e(image.replace(".jpg", "-800.jpg"))}" '
                   f'imagesrcset="{e(image.replace(".jpg", "-800.jpg"))} 800w, {e(image)} 1600w" imagesizes="100vw" />')
    if noindex:
        out.append('<meta name="robots" content="noindex" />')
    if ld:
        # json in a script tag: stop "</" from closing it early
        out.append(f'<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False).replace("</", "<\\/")}</script>')
    return "\n    ".join(out)


def for_path(path: str, session: Session) -> tuple[str, int]:
    """(head tags, status) for a front-end route"""
    p = path.rstrip("/") or "/"
    if p == "/":
        return tags(f"{SITE} — Brand X cars in Lucknow", DEFAULT_DESC, "/", "/media/model-h/hero.jpg",
                    {"@context": "https://schema.org", "@type": "AutoDealer", "name": SITE, "url": url("/"),
                     "address": {"@type": "PostalAddress", "addressLocality": "Lucknow", "addressRegion": "Uttar Pradesh", "addressCountry": "IN"},
                     "telephone": "+91-522-400-1100"}), 200
    if p == "/cars":
        return tags(f"New Brand X cars, on-road prices · {SITE}", "Every model with a full on-road price breakup for Lucknow, Kanpur and Barabanki.", p), 200
    if p == "/used":
        return tags(f"Certified used cars in Lucknow · {SITE}", "Inspected used cars with year, owners, kilometres and a fixed price.", p), 200
    if p == "/test-drive":
        return tags(f"Book a test drive · {SITE}", "Pick a car, a showroom and a free slot. No phone call needed.", p), 200
    if p == "/privacy":
        return tags(f"Privacy & opt-out · {SITE}", "How we use your details under the DPDP Act 2023, and how to opt out.", p), 200
    if p.startswith(PRIVATE):
        return tags(SITE, DEFAULT_DESC, p, noindex=True), 200

    if p.startswith("/cars/"):
        m = session.exec(select(CarModel).where(CarModel.slug == p.split("/")[2], CarModel.is_published)).first()
        vs = list(session.exec(select(Variant).where(Variant.model_id == m.id).order_by(Variant.ex_showroom))) if m else []
        if m and vs:
            from app.routers.public import price_for

            try:
                low = price_for(session, vs[0], "Lucknow", None)
                price, until = low.total, low.valid_until
            except PriceUnavailable:
                price, until = None, None
            desc = (f"{m.name} {m.body_type}: on-road from ₹{inr(price)} in Lucknow with the full breakup. "
                    f"{len(vs)} variants. Book a test drive online." if price else f"{m.name} {m.body_type}. Book a test drive online.")
            ld = {"@context": "https://schema.org", "@type": "Car", "name": f"Brand X {m.name}", "brand": {"@type": "Brand", "name": "Brand X"},
                  "model": m.name, "bodyType": m.body_type, "image": url(m.hero_image), "url": url(p), "description": m.description_en,
                  "vehicleConfiguration": [v.name for v in vs]}
            if price:
                ld["offers"] = {"@type": "AggregateOffer", "priceCurrency": "INR", "lowPrice": price, "offerCount": len(vs),
                                "priceValidUntil": until.isoformat(), "seller": {"@type": "AutoDealer", "name": SITE}}
            return tags(f"{m.name} on-road price in Lucknow · {SITE}", desc, p, m.hero_image, ld), 200

    if p.startswith("/used/"):
        u = session.exec(select(UsedCar).where(UsedCar.stock_id == p.split("/")[2])).first()
        if u and u.status != UsedStatus.sold:
            title = f"{u.year} {u.model_name} {u.variant}, {u.km:,} km · Certified used · {SITE}"
            desc = (f"{u.year} {u.model_name} {u.variant}, {u.fuel}, {u.transmission}, {u.km:,} km, {u.owners} owner(s). "
                    f"₹{inr(u.price)}. Inspection score {u.inspection.get('score', '–')}/100.")
            ld = {"@context": "https://schema.org", "@type": "Car", "name": f"{u.year} Brand X {u.model_name} {u.variant}",
                  "model": u.model_name, "vehicleModelDate": str(u.year), "fuelType": u.fuel, "vehicleTransmission": u.transmission,
                  "color": u.colour, "numberOfPreviousOwners": u.owners, "itemCondition": "https://schema.org/UsedCondition",
                  "mileageFromOdometer": {"@type": "QuantitativeValue", "value": u.km, "unitCode": "KMT"},
                  "image": [url(x) for x in u.photos], "url": url(p),
                  "offers": {"@type": "Offer", "priceCurrency": "INR", "price": u.price,
                             "availability": "https://schema.org/InStock" if u.status == UsedStatus.available else "https://schema.org/LimitedAvailability"}}
            return tags(title, desc, p, u.photos[0] if u.photos else None, ld), 200

    # unknown route: react shows its 404, crawlers get a real 404
    return tags(f"Page not found · {SITE}", DEFAULT_DESC, p, noindex=True), 404


def sitemap(session: Session) -> str:
    today = date.today().isoformat()
    paths = ["/", "/cars", "/used", "/test-drive", "/privacy"]
    paths += [f"/cars/{m.slug}" for m in session.exec(select(CarModel).where(CarModel.is_published))]
    paths += [f"/used/{u.stock_id}" for u in session.exec(select(UsedCar).where(UsedCar.status != UsedStatus.sold))]
    rows = "".join(f"<url><loc>{escape(url(x))}</loc><lastmod>{today}</lastmod></url>" for x in paths)
    return f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{rows}</urlset>'


def robots() -> str:
    return "User-agent: *\n" + "".join(f"Disallow: {p}\n" for p in (*PRIVATE, "/api/")) + f"Sitemap: {url('/sitemap.xml')}\n"


def boot(path: str, query: str, session: Session) -> list:
    """the first api answers each page needs, as [react-query key, data] pairs.
    sent inside the html so the page draws without waiting on a round trip."""
    from app.routers import booking, public

    p = path.rstrip("/") or "/"
    out: list = []
    def dump(model, data):
        # same shape the api sends, run through its response model
        if hasattr(data, "model_dump"):
            data = data.model_dump()
        return model.model_validate(data).model_dump(mode="json")

    try:
        if p in ("/", "/cars"):
            out.append([["models"], [dump(public.ModelCard, x) for x in public.list_models(session)]])
        elif p.startswith("/cars/") and p.count("/") == 2:
            slug = p.split("/")[2]
            detail = dump(public.ModelDetail, public.get_model(slug, session))
            out.append([["model", slug], detail])
            out.append([["cities"], public.list_cities(session)])
            # only the default view, a shared link with ?variant= fetches its own
            if not query:
                vid = detail["variants"][0]["id"]
                out.append([["price", vid, "Lucknow", None], dump(public.PriceOut, public.get_price(vid, "Lucknow", None, session))])
                out.append([["accessories", vid], [dump(public.AccessoryOut, a) for a in public.applicable_packs(session, vid)]])
        elif p == "/used" and not query:
            rows = public.list_used(fuel=None, body=None, transmission=None, max_price=None, min_year=None, max_km=None, sort="newest", session=session)
            out.append([["used", ""], [dump(public.UsedCard, x) for x in rows]])
        elif p.startswith("/used/") and p.count("/") == 2:
            sid = p.split("/")[2]
            out.append([["used-car", sid], dump(public.UsedDetail, public.get_used(sid, session))])
        elif p == "/test-drive":
            out.append([["demo-cars"], booking.demo_cars(session)])
    except Exception:  # noqa: BLE001  a 404 or anything odd: the page just fetches as normal
        return []
    return out


def boot_script(data: list) -> str:
    if not data:
        return ""
    body = json.dumps(data, ensure_ascii=False, default=str).replace("</", "<\\/")
    return f"<script>window.__BOOT__={body}</script>"
