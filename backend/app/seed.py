"""wipes the db and fills it with demo data. run: uv run python -m app.seed"""

import random
from datetime import date, datetime, timedelta

from sqlmodel import Session, SQLModel, select

from app.auth import hash_password
from app.logic.assignment import Candidate, pick_consultant
from app.db import engine
from app.models import (
    AccessoryPack,
    CarModel,
    City,
    DemoCar,
    Fuel,
    InsuranceRule,
    Lead,
    LeadEvent,
    LeadSource,
    LeadStatus,
    LeadType,
    Role,
    Showroom,
    TaxRule,
    TestDrive,
    UsedCar,
    UsedStatus,
    User,
    Variant,
    now,
)
from app.settings import settings

# all prices, tax and insurance rates below are illustrative assumptions

VALID_FROM = date(2026, 10, 1)
VALID_UNTIL = date(2027, 3, 31)  # end of the indian financial year

SHOWROOMS = [
    ("Company A Gomti Nagar", "Gomti Nagar", "Vibhuti Khand, Gomti Nagar, Lucknow 226010", "0522 400 1100"),
    ("Company A Aliganj", "Aliganj", "Sector Q, Aliganj, Lucknow 226024", "0522 400 2200"),
    ("Company A Alambagh", "Alambagh", "Kanpur Road, Alambagh, Lucknow 226005", "0522 400 3300"),
]

# (city, registration + handling fee)
CITIES = [("Lucknow", 6500), ("Kanpur", 6800), ("Barabanki", 6200)]

COLOURS = [
    {"name": "Polar White", "hex": "#F4F4F2"},
    {"name": "Lunar Silver", "hex": "#A9ADB1"},
    {"name": "Graphite Grey", "hex": "#4A4D52"},
    {"name": "Midnight Black", "hex": "#16171A"},
    {"name": "Deep Ocean Blue", "hex": "#1F3B5C"},
    {"name": "Garnet Red", "hex": "#7A1E25"},
]

MODELS = [
    {
        "slug": "model-h",
        "name": "Model H",
        "body_type": "SUV",
        "tagline_en": "Room for everyone, poise for every road.",
        "tagline_hi": "सबके लिए जगह, हर सड़क पर संतुलन।",
        "description_en": "A five-seat SUV with a quiet cabin, 208 mm ground clearance and a smooth automatic that makes city traffic easy.",
        "description_hi": "पाँच सीटों वाली SUV — शांत केबिन, 208 मिमी ग्राउंड क्लीयरेंस और स्मूद ऑटोमैटिक, जिससे शहर का ट्रैफ़िक आसान लगे।",
        "variants": [
            ("LX", Fuel.petrol, "Manual", 1049000, None),
            ("VX", Fuel.petrol, "Manual", 1149000, None),
            ("ZX automatic", Fuel.petrol, "Automatic (CVT)", 1245000, "NEW-H-02"),
            ("ZX hybrid", Fuel.hybrid, "e-CVT", 1695000, None),
        ],
        "specs": {"engine": "1.5 L i-VTEC", "power": "121 PS", "mileage": "16.9 km/l", "seats": 5, "boot": "458 L", "safety": "6 airbags, ADAS"},
    },
    {
        "slug": "model-c",
        "name": "Model C",
        "body_type": "Sedan",
        "tagline_en": "The long-distance sedan, refined.",
        "tagline_hi": "लंबी दूरी की सेडान, और भी बेहतर।",
        "description_en": "A full-size sedan with rear-seat comfort, a 506 L boot and a frugal diesel built for highway runs to Kanpur and beyond.",
        "description_hi": "पीछे की सीट पर आराम, 506 लीटर बूट और हाईवे के लिए किफ़ायती डीज़ल वाली फुल-साइज़ सेडान।",
        "variants": [
            ("SV", Fuel.petrol, "Manual", 1199000, None),
            ("VX", Fuel.petrol, "Automatic (CVT)", 1395000, None),
            ("VX", Fuel.diesel, "Manual", 1465000, None),
            ("ZX", Fuel.hybrid, "e-CVT", 1995000, None),
        ],
        "specs": {"engine": "1.5 L", "power": "121 PS", "mileage": "18.4 km/l", "seats": 5, "boot": "506 L", "safety": "6 airbags, ADAS"},
    },
    {
        "slug": "model-s",
        "name": "Model S",
        "body_type": "Compact sedan",
        "tagline_en": "Compact outside, generous inside.",
        "tagline_hi": "बाहर से कॉम्पैक्ट, अंदर से खुली।",
        "description_en": "A sub-four-metre sedan with a big boot, easy parking and running costs that suit a first family car.",
        "description_hi": "चार मीटर से छोटी सेडान — बड़ा बूट, आसान पार्किंग और पहली फ़ैमिली कार के हिसाब से कम ख़र्च।",
        "variants": [
            ("E", Fuel.petrol, "Manual", 729000, None),
            ("LX", Fuel.petrol, "Manual", 819000, None),
            ("VX", Fuel.petrol, "Automatic (CVT)", 919000, None),
            ("VX", Fuel.cng, "Manual", 899000, None),
        ],
        "specs": {"engine": "1.2 L i-VTEC", "power": "90 PS", "mileage": "19.5 km/l", "seats": 5, "boot": "416 L", "safety": "6 airbags"},
    },
    {
        "slug": "model-a",
        "name": "Model A",
        "body_type": "Hatchback",
        "tagline_en": "Light on its feet, easy on the city.",
        "tagline_hi": "हल्की-फुल्की, शहर के लिए आसान।",
        "description_en": "A nimble hatchback with a tight turning circle and a bright, practical cabin for daily commutes.",
        "description_hi": "छोटा टर्निंग सर्कल और रोज़ के सफ़र के लिए खुला, काम का केबिन — एक फुर्तीली हैचबैक।",
        "variants": [
            ("E", Fuel.petrol, "Manual", 599000, None),
            ("S", Fuel.petrol, "Manual", 665000, None),
            ("V", Fuel.petrol, "Automatic (AMT)", 735000, None),
        ],
        "specs": {"engine": "1.2 L", "power": "90 PS", "mileage": "20.1 km/l", "seats": 5, "boot": "320 L", "safety": "6 airbags"},
    },
    {
        "slug": "model-e",
        "name": "Model E",
        "body_type": "Electric SUV",
        "tagline_en": "Silent, swift, and fully electric.",
        "tagline_hi": "शांत, तेज़ और पूरी तरह इलेक्ट्रिक।",
        "description_en": "An electric SUV with up to 460 km of range, home charging included, and instant torque for overtakes.",
        "description_hi": "460 किमी तक की रेंज, होम चार्जिंग शामिल और ओवरटेक के लिए तुरंत टॉर्क वाली इलेक्ट्रिक SUV।",
        "variants": [
            ("Standard range", Fuel.electric, "Single-speed", 1799000, None),
            ("Long range", Fuel.electric, "Single-speed", 2149000, None),
        ],
        "specs": {"battery": "50.5 kWh / 61 kWh", "power": "174 PS", "range": "up to 460 km", "seats": 5, "boot": "440 L", "safety": "6 airbags, ADAS"},
    },
    {
        "slug": "model-t",
        "name": "Model T",
        "body_type": "MPV",
        "tagline_en": "Seven seats, zero compromise.",
        "tagline_hi": "सात सीटें, कोई समझौता नहीं।",
        "description_en": "A seven-seat MPV with a flat third row, rear AC vents and sliding second-row seats for big families.",
        "description_hi": "बड़े परिवारों के लिए — फ़्लैट तीसरी पंक्ति, पीछे AC वेंट और खिसकने वाली दूसरी पंक्ति की सीटों वाली सात-सीटर MPV।",
        "variants": [
            ("LX", Fuel.petrol, "Manual", 1089000, None),
            ("VX", Fuel.petrol, "Automatic", 1229000, None),
            ("VX", Fuel.cng, "Manual", 1179000, None),
        ],
        "specs": {"engine": "1.5 L", "power": "105 PS", "mileage": "17.3 km/l", "seats": 7, "boot": "209 L (all rows up)", "safety": "6 airbags"},
    },
]

# (stock id, model, variant, body, fuel, transmission, year, km, owners, price, reg, colour, status, inspection score)
USED = [
    ("UC-1182", "Model C", "VX", "Sedan", Fuel.diesel, "Manual", 2022, 41200, 1, 845000, "UP32 MK 4418", "Lunar Silver", UsedStatus.available, 92),
    ("UC-1190", "Model S", "LX", "Compact sedan", Fuel.petrol, "Manual", 2021, 58600, 1, 512000, "UP32 KT 2093", "Polar White", UsedStatus.booked, 86),
    ("UC-1194", "Model H", "VX", "SUV", Fuel.petrol, "Manual", 2023, 22800, 1, 1015000, "UP32 NB 7731", "Graphite Grey", UsedStatus.available, 95),
    ("UC-1197", "Model A", "S", "Hatchback", Fuel.petrol, "Manual", 2020, 63400, 2, 385000, "UP32 HD 1187", "Garnet Red", UsedStatus.available, 81),
    ("UC-1201", "Model H", "ZX automatic", "SUV", Fuel.petrol, "Automatic (CVT)", 2024, 14100, 1, 1235000, "UP32 PR 5520", "Deep Ocean Blue", UsedStatus.available, 97),
    ("UC-1203", "Model T", "VX", "MPV", Fuel.petrol, "Automatic", 2022, 47900, 1, 935000, "UP78 FG 3304", "Lunar Silver", UsedStatus.available, 88),
    ("UC-1206", "Model C", "SV", "Sedan", Fuel.petrol, "Manual", 2019, 82500, 2, 565000, "UP32 GE 9012", "Polar White", UsedStatus.available, 79),
    ("UC-1208", "Model S", "VX", "Compact sedan", Fuel.petrol, "Automatic (CVT)", 2023, 18700, 1, 765000, "UP32 NA 4471", "Midnight Black", UsedStatus.available, 94),
    ("UC-1211", "Model A", "V", "Hatchback", Fuel.petrol, "Automatic (AMT)", 2022, 29300, 1, 545000, "UP41 BC 6620", "Deep Ocean Blue", UsedStatus.available, 90),
    ("UC-1214", "Model E", "Standard range", "Electric SUV", Fuel.electric, "Single-speed", 2024, 16900, 1, 1525000, "UP32 EV 0815", "Polar White", UsedStatus.available, 96),
    ("UC-1216", "Model T", "LX", "MPV", Fuel.cng, "Manual", 2021, 91200, 1, 715000, "UP32 JC 3378", "Graphite Grey", UsedStatus.sold, 77),
    ("UC-1219", "Model C", "VX", "Sedan", Fuel.petrol, "Automatic (CVT)", 2021, 52100, 1, 895000, "UP32 LM 2246", "Garnet Red", UsedStatus.available, 87),
    ("UC-1221", "Model S", "VX", "Compact sedan", Fuel.cng, "Manual", 2022, 68800, 1, 615000, "UP33 TA 5109", "Lunar Silver", UsedStatus.available, 84),
    ("UC-1224", "Model H", "LX", "SUV", Fuel.petrol, "Manual", 2020, 74300, 2, 725000, "UP32 FZ 8853", "Midnight Black", UsedStatus.booked, 82),
]

CHECKS = ["Engine & gearbox", "Brakes", "Suspension & steering", "Tyres", "Body & paint", "Electricals", "Interior", "AC & cooling", "Service history", "Documents & insurance"]

CONSULTANTS = [
    # (name, email, showroom index, models they handle)
    ("Ankit Srivastava", "ankit", 0, ["model-h", "model-e"]),
    ("Priya Verma", "priya", 0, []),
    ("Rohit Mishra", "rohit", 1, ["model-c", "model-s"]),
    ("Neha Tiwari", "neha", 1, []),
    ("Saurabh Yadav", "saurabh", 2, ["model-t", "model-a"]),
    ("Kavya Singh", "kavya", 2, []),
]

BUYER_NAMES = [
    "Rahul Agarwal", "Sneha Gupta", "Vikas Pandey", "Pooja Saxena", "Amit Shukla", "Ritu Bajpai", "Manish Dubey",
    "Shalini Rastogi", "Arjun Kapoor", "Nidhi Awasthi", "Deepak Chaurasia", "Megha Tandon", "Aditya Trivedi",
    "Swati Mehrotra", "Gaurav Jaiswal", "Anjali Nigam", "Harsh Vardhan", "Komal Rawat", "Nitin Bhatia", "Isha Khanna",
]

MESSAGES = [
    "Looking for an automatic for city driving, budget around 13 lakh. Want to buy before Diwali.",
    "Need a 7 seater for joint family, mostly highway trips to Kanpur. Please share on-road price.",
    "Is the diesel still available? I drive 2,000 km a month.",
    "Want to exchange my 2017 hatchback. What would I get?",
    "Can I take a test drive this weekend at Gomti Nagar?",
    "First car for my daughter, something safe and easy to park.",
    "Comparing with other brands, what is the waiting period?",
    "Interested in the EV. How long does home charging take?",
    "Please call after 6 pm.",
    "मुझे ऑटोमैटिक कार चाहिए, बजट 10 लाख तक है। कृपया कॉल करें।",
    "",
]


def photo(slug: str, name: str) -> str:
    # brand-free studio shots generated for the demo, live in frontend/public/media
    return f"/media/{slug}/{name}.jpg"


def gallery(slug: str) -> list[str]:
    return [photo(slug, "hero"), photo(slug, "g2"), "/media/shared/dash.jpg", "/media/shared/seats.jpg"]


def run() -> None:
    rnd = random.Random(42)
    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)
    pw = hash_password(settings.demo_password)

    with Session(engine) as s:
        showrooms = [Showroom(name=n, locality=l, city="Lucknow", address=a, phone=p) for n, l, a, p in SHOWROOMS]
        s.add_all(showrooms)
        s.flush()

        # tax table: 8% up to 10 lakh, 10% above, evs exempt
        for city_name, reg_fee in CITIES:
            city = City(name=city_name, state="Uttar Pradesh")
            s.add(city)
            s.flush()
            for fuel in Fuel:
                bands = [(0, 9_999_999, 0)] if fuel == Fuel.electric else [(0, 1_000_000, 800), (1_000_001, 9_999_999, 1000)]
                for lo, hi, bp in bands:
                    s.add(TaxRule(city_id=city.id, fuel=fuel, price_from=lo, price_to=hi, road_tax_bp=bp,
                                  registration_fee=reg_fee, valid_from=VALID_FROM, valid_until=VALID_UNTIL))

        for fuel, bp in [(Fuel.petrol, 310), (Fuel.diesel, 330), (Fuel.cng, 320), (Fuel.hybrid, 300), (Fuel.electric, 280)]:
            s.add(InsuranceRule(fuel=fuel, pct_bp=bp, valid_from=VALID_FROM, valid_until=VALID_UNTIL))

        s.add_all([
            AccessoryPack(name="Essentials pack (mats, mud flaps, number plates)", price=15000, is_default=True),
            AccessoryPack(name="Protection pack (body cover, underbody coat, ceramic)", price=22000),
            AccessoryPack(name="Extended warranty, 2 more years", price=18500),
        ])

        models: dict[str, CarModel] = {}
        variants: list[Variant] = []
        for m in MODELS:
            cm = CarModel(
                slug=m["slug"], name=m["name"], body_type=m["body_type"],
                tagline_en=m["tagline_en"], tagline_hi=m["tagline_hi"],
                description_en=m["description_en"], description_hi=m["description_hi"],
                hero_image=photo(m["slug"], "hero"),
                gallery=gallery(m["slug"]),
            )
            s.add(cm)
            s.flush()
            models[m["slug"]] = cm
            for vname, fuel, trans, price, stock in m["variants"]:
                v = Variant(model_id=cm.id, stock_id=stock, name=vname, fuel=fuel, transmission=trans,
                            ex_showroom=price, specs=m["specs"], colours=rnd.sample(COLOURS, 4))
                s.add(v)
                variants.append(v)
        s.flush()

        for i, (sid, mname, var, body, fuel, trans, year, km, owners, price, reg, colour, status, score) in enumerate(USED):
            slug = mname.lower().replace(" ", "-")
            checks = []
            for item in CHECKS:
                ok = rnd.random() < score / 100 + 0.05
                checks.append({"item": item, "status": "ok" if ok else "attention",
                               "note": "" if ok else "minor wear, priced in"})
            s.add(UsedCar(
                stock_id=sid, model_name=mname, variant=var, body_type=body, fuel=fuel, transmission=trans,
                year=year, km=km, owners=owners, price=price, reg_number=reg, colour=colour, city="Lucknow",
                showroom_id=showrooms[i % 3].id, photos=gallery(slug),
                inspection={"score": score, "inspected_on": "2026-10-20", "checks": checks}, status=status,
                created_at=now() - timedelta(days=rnd.randint(1, 40)),
            ))

        admin = User(name="Meera Kulshreshtha", email="admin@companya.demo", password_hash=pw, role=Role.admin)
        buyer = User(name="Rahul Agarwal", email="buyer@companya.demo", password_hash=pw, role=Role.buyer)
        s.add_all([admin, buyer])
        consultants = []
        for name, handle, si, slugs in CONSULTANTS:
            u = User(name=name, email=f"{handle}@companya.demo", password_hash=pw, role=Role.consultant,
                     showroom_id=showrooms[si].id, model_ids=[models[x].id for x in slugs])
            s.add(u)
            consultants.append(u)
        s.flush()

        # three demo cars per showroom, popular models at more than one
        demo_plan = [(0, "model-h"), (0, "model-e"), (0, "model-c"),
                     (1, "model-c"), (1, "model-s"), (1, "model-h"),
                     (2, "model-t"), (2, "model-a"), (2, "model-s")]
        demos = []
        for si, slug in demo_plan:
            vs = [v for v in variants if v.model_id == models[slug].id]
            # demo the automatic where there is one, that's what people ask to drive
            v = next((v for v in vs if "Manual" not in v.transmission), vs[0])
            d = DemoCar(showroom_id=showrooms[si].id, variant_id=v.id, colour=v.colours[0]["name"])
            s.add(d)
            demos.append(d)
        s.flush()

        # leads: a mix of fresh, overdue and worked ones
        t = now()
        model_list = list(models.values())
        taken: set = set()
        load = {c.id: 0 for c in consultants}
        for i in range(40):
            name = BUYER_NAMES[i % len(BUYER_NAMES)]
            sr = showrooms[i % 3]
            cm = rnd.choice(model_list)
            if i < 6:
                # still waiting, a spread of fresh and overdue
                mins_ago, status = [2, 4, 7, 12, 26, 55][i], LeadStatus.new
            elif i < 14:
                # earlier today and already called, so today's sla number is real
                mins_ago = rnd.randint(40, 300)
                status = rnd.choice([LeadStatus.contacted, LeadStatus.test_drive, LeadStatus.negotiation])
            else:
                mins_ago = rnd.randint(60 * 6, 60 * 24 * 21)
                status = rnd.choice([x for x in LeadStatus if x != LeadStatus.new])
            created = t - timedelta(minutes=mins_ago)
            ltype = rnd.choice([LeadType.enquiry, LeadType.enquiry, LeadType.test_drive, LeadType.trade_in])
            msg = rnd.choice(MESSAGES)
            # same rule as live leads, with running counts so the seed spreads like real life
            pick = pick_consultant([Candidate(id=c.id, name=c.name, showroom_id=c.showroom_id, model_ids=c.model_ids,
                                              open_leads=load[c.id], last_assigned_at=None) for c in consultants], sr.id, cm.id)
            owner = next(c for c in consultants if c.id == pick.id)
            responded = None if status == LeadStatus.new else created + timedelta(minutes=rnd.choice([1, 2, 2, 3, 4, 4, 7, 18]))
            lead = Lead(
                name=name, phone=f"9{rnd.randint(100000000, 999999999)}",
                email=f"{name.split()[0].lower()}.{i}@example.com",
                lang="hi" if "मुझे" in msg else "en",
                source=rnd.choice([LeadSource.web, LeadSource.web, LeadSource.portal, LeadSource.walkin]),
                type=ltype, model_id=cm.id, showroom_id=sr.id, message=msg, consent=True, consent_at=created,
                assigned_to=owner.id, status=status, created_at=created, first_response_at=responded,
            )
            s.add(lead)
            s.flush()
            if status not in (LeadStatus.won, LeadStatus.lost):
                load[owner.id] += 1
            s.add(LeadEvent(lead_id=lead.id, kind="created", body=f"{lead.source} enquiry for {cm.name}", at=created))
            s.add(LeadEvent(lead_id=lead.id, kind="assigned", body=f"auto-assigned to {owner.name}", at=created))
            s.add(LeadEvent(lead_id=lead.id, kind="message_sent",
                            body=f"WhatsApp (mock): Hi {name.split()[0]}, {owner.name} from {sr.name} will call you shortly.",
                            at=created + timedelta(seconds=5)))
            if responded:
                s.add(LeadEvent(lead_id=lead.id, kind="status", body=f"status → {status}", actor_id=owner.id, at=responded))

            # some upcoming test drives so the slot grid isn't empty
            if ltype == LeadType.test_drive and i % 2 == 0:
                demo = next(d for d in demos if d.showroom_id == sr.id)
                day = date.today() + timedelta(days=1 + i % 3)
                free = [x for x in ["10:00", "11:00", "12:00", "15:00", "16:00"] if (demo.id, day, x) not in taken]
                slot = rnd.choice(free)
                taken.add((demo.id, day, slot))
                s.add(TestDrive(demo_car_id=demo.id, date=day, slot=slot, lead_id=lead.id))
                s.flush()

        s.commit()
    print("seeded ✓  logins: admin@ / ankit@ / buyer@companya.demo")


def run_if_empty() -> None:
    # deploys call this on boot, so a restart never wipes real data
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        if s.exec(select(User)).first():
            print("db already has data, skipping seed")
            return
    run()


if __name__ == "__main__":
    import sys

    run_if_empty() if "--if-empty" in sys.argv else run()
