# Build Plan — Company A dealership site (FastAPI + React)

Goal: ship the CORE BUILD slice end to end, polished, on realistic seed data, in 7 days.
Principle: **simple backend, careful UI.** Logic lives in a few pure, tested functions; everything else is plain CRUD.

---

## 1. Scope

### In (core — must work end to end)
1. Model list + model/variant page with **on-road price breakup by city** (from admin tables, validity date, "prices may change")
2. Certified used-car list (filters) + detail (photos, inspection report, price, masked reg no.)
3. Test-drive booking: showroom → demo car → date → real free slot
4. Lead capture (web forms + portal CSV import) → **auto-assign** to a consultant by showroom + model → mock WhatsApp ack
5. Consultant lead inbox: 5-min response timer, status, re-assign, AI buyer summary + first-reply draft
6. Admin: models, variants, prices/tax tables, used stock
7. Sign-in with roles: `buyer`, `consultant`, `admin`
8. DPDP consent checkbox + opt-out, Hindi/English, mobile-first, indexable car pages

### Depth (only if core is done — in this order)
- EMI calculator on car pages (pure frontend function, cheap)
- Trade-in request form (just another lead type)
- Admin users/roles screen, offers/banners
- AI used-car price band (visible to used-car manager only)

### Out (state in TDD)
Payments, real WhatsApp/SMS, DMS integration (mock daily CSV export endpoint at most), service booking, spare parts.

---

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| Backend | FastAPI + SQLModel | One class = DB table + validation schema. Minimal code. |
| DB | SQLite (local) / Postgres on Neon (prod) | Only `DATABASE_URL` changes. |
| Auth | Email + password (bcrypt), JWT in **httpOnly cookie** | Same-origin deploy → no CORS, no token in localStorage. |
| AI | Claude API (`claude-haiku-5-5`), JSON output | Fast + cheap; strict validator + template fallback. |
| Frontend | React + Vite + TypeScript + Tailwind | Hand-built small components, no heavy UI kit. |
| Data fetching | TanStack Query | Free loading/error/retry states. |
| i18n | react-i18next (EN/HI) | UI strings in JSON; model descriptions stored `_en`/`_hi`. |
| Deploy | **One Render web service**: FastAPI serves API + built React | One URL, one deploy, one set of env vars. |
| Tests | pytest (backend), vitest (EMI + formatters) | |

**SEO decision:** FastAPI serves `index.html` for `/cars/{slug}` and `/used/{id}` with **per-page `<title>`, meta description, OG tags and JSON-LD (`Car`/`Product`) injected from the DB**, plus a DB-generated `sitemap.xml`. Every car gets its own crawlable URL, always fresh, no build-time coupling. (Prerendering with vite-react-ssg was considered — rejected: pages go stale when admin edits a price.)

**Perf (<2.5s on 4G):** route-level code splitting, WebP images with `srcset` + lazy loading, system/one web font, no carousel libraries.

---

## 3. Data model (SQLModel tables)

```
Showroom        id, name, locality, city, address, phone
User            id, name, email, password_hash, role[buyer|consultant|admin],
                showroom_id?, model_ids[] (models they handle), is_active
CarModel        id, slug, name, body_type, tagline_en/hi, description_en/hi,
                hero_image, gallery[], is_published
Variant         id, model_id, name, fuel, transmission, ex_showroom,
                specs{engine, power, mileage, seats, boot...}, colours[{name,hex,image}]
City            id, name, state
TaxRule         id, city_id, fuel, price_from, price_to, road_tax_pct,
                registration_fee, valid_from, valid_until
InsuranceRule   id, fuel, pct_of_ex_showroom, valid_from, valid_until
AccessoryPack   id, variant_id?, name, price, is_default
UsedCar         id, stock_id, model_name, variant, fuel, transmission, year, km, owners,
                price, reg_number (stored full, never sent publicly), city,
                photos[], inspection{score, checks[{item, status, note}]}, status[Available|Booked|Sold]
DemoCar         id, showroom_id, variant_id, colour, is_active
TestDrive       id, demo_car_id, date, slot("10:00"), lead_id, status[booked|done|cancelled]
                UNIQUE(demo_car_id, date, slot)        ← no double booking
Lead            id, name, phone, email?, lang, source[web|portal|walkin], type[enquiry|test_drive|used|trade_in],
                model_id?, variant_id?, used_car_id?, showroom_id, city, message,
                consent, consent_at, opted_out,
                assigned_to, status[new|contacted|test_drive|negotiation|won|lost],
                created_at, first_response_at?,
                ai_summary{}, ai_draft, ai_status[ok|needs_review|fallback|error]
LeadEvent       id, lead_id, kind[created|assigned|reassigned|status|note|message_sent|ai],
                body, actor_id?, at                    ← timeline + mock WhatsApp log
```

Slots are config, not a table: showroom hours 10:00–18:00, 45-min drives → fixed slot list.

---

## 4. The only real logic (pure functions, fully tested)

### 4.1 `on_road_price(variant, city, accessories, today)` — the hard part
```
ex_showroom      = variant.ex_showroom
rule             = TaxRule matching (city, fuel, ex_showroom in band, valid today)
road_tax         = ex_showroom × rule.road_tax_pct
registration     = rule.registration_fee
insurance        = ex_showroom × InsuranceRule(fuel, valid today).pct
tcs              = 1% of ex_showroom if ex_showroom > ₹10,00,000      [ASSUMPTION]
accessories      = sum(selected packs)
on_road          = sum of above
valid_until      = earliest valid_until of all rules used
```
Returns line items + total + `valid_until` + note. **If any rule is missing → returns "price on request" (UI shows enquiry CTA), never a guessed number.** Rounded to the rupee, integer maths (paise) to avoid float drift.

Worked example for seed (all numbers ASSUMPTIONS, admin-editable): Model H ZX AT petrol, Lucknow, ex-showroom ₹12,45,000 → road tax 10% ₹1,24,500 · registration & handling ₹6,500 · insurance 3.1% ₹38,595 · TCS 1% ₹12,450 · essentials pack ₹15,000 → **₹14,42,045** (locked in `test_pricing.py`).

### 4.2 `assign_lead(lead, consultants, open_counts, last_assigned)`
1. Active consultants at `lead.showroom_id`
2. Prefer those whose `model_ids` include the lead's model (fallback: all at showroom; then any showroom)
3. Fewest open leads → tie-break: longest since last assignment
Then: log `assigned` event + mock WhatsApp ack template ("Hi {name}, {consultant} from Company A {showroom} will call you shortly"). Manual re-assign by consultant/admin logs `reassigned`.

### 4.3 Slot booking
`GET /slots` = config slots − booked rows − past times today. `POST /test-drives` inserts; DB unique constraint → `IntegrityError` → **409 "slot just taken"**, UI refreshes slots. Race-safe without locks.

### 4.4 Response timer
`due_at = created_at + 5 min`. Inbox sorts overdue first; badge: green (<3 min), amber, red (overdue). `first_response_at` set on first status change or sent message. Admin header shows "% called within 5 min (today)" — the client's success metric.

### 4.5 CSV import
Columns: `name, phone, email, model, city, showroom, source, message`. Per-row validation (10-digit Indian mobile, known model/showroom), **dedupe by phone within 30 days** (adds note to existing lead instead), result screen: `42 imported · 3 duplicates · 2 errors (row 7: invalid phone)`.

### 4.6 Masking
`mask_reg("UP32 AB 1234") → "UP32 •• ••34"`. Public schemas exclude `reg_number`; only the masked field is serialized. Tested.

---

## 5. AI: buyer summary + first-reply draft

**Trigger:** background task on lead create; "Regenerate" button in lead detail.

**Input (no extra PII beyond what's needed):** first name, lead type, model/variant, message, source, language, and *table-sourced* price facts.

**Output (JSON):**
```json
{ "summary": "Wants an automatic petrol SUV for family, budget ~14L, buying in 1 month",
  "intent": "hot|warm|cold", "timeframe": "...", "budget": "...",
  "missing_info": ["preferred showroom", "trade-in?"], "confidence": 0.0-1.0,
  "draft": "Namaste Rahul ... on-road price in Lucknow is {{ON_ROAD_PRICE}} ..." }
```

**Guardrails (code, not prompt-only):**
- AI may only reference price via `{{ON_ROAD_PRICE}}` — **code fills it from the price table**
- Validator rejects drafts with: discount/offer/cashback/"% off"/free words (EN+HI), any raw ₹/Rs/lakh figure, >600 chars, wrong language
- Invalid JSON / validator fail / timeout (8s) / no API key → **template fallback**, `ai_status=fallback`, banner "AI unavailable — template draft"
- `confidence < 0.6` or empty `missing_info` handling → `needs_review` badge
- Draft is **never auto-sent**: consultant edits → "Send (mock WhatsApp)" → logged as event
- Opted-out leads: no AI, no messages

All guardrails unit-tested with canned bad outputs (discount phrase, raw price, broken JSON).

---

## 6. API (~16 endpoints, 4 router files)

```
auth.py      POST /api/auth/login   POST /api/auth/logout   GET /api/me
public.py    GET  /api/models                  GET /api/models/{slug}?city=&acc=
             GET  /api/cities                  GET /api/showrooms
             GET  /api/used?fuel=&max_price=&year=&km=&body=
             GET  /api/used/{stock_id}
             GET  /api/slots?demo_car_id=&date=
             POST /api/leads                   (enquiry / test drive / used / trade-in; consent required)
             POST /api/optout                  (phone → opted_out)
desk.py      GET  /api/leads?status=&mine=     GET /api/leads/{id}
             PATCH /api/leads/{id}             (status, assigned_to, note)
             POST /api/leads/{id}/ai           POST /api/leads/{id}/send
             POST /api/leads/import            (CSV)
admin.py     CRUD /api/admin/models|variants|tax-rules|insurance|accessories|used|users
```
Role check = one dependency: `Depends(require("consultant", "admin"))`.

---

## 7. Screens (8 core)

| # | Route | Who | Key content |
|---|---|---|---|
| 1 | `/` | buyer | Full-bleed hero car, model grid (photo, "from ₹ on-road"), used-car strip, one CTA |
| 2 | `/cars/:slug` | buyer | Gallery, colour swatches, variant tabs, specs, **city selector → price breakup card** (line items, validity, note), sticky bottom bar on mobile: price + "Book test drive" |
| 3 | `/used` | buyer | Filter chips (fuel, budget, year, km), cards with year · owners · km · price, Booked badge |
| 4 | `/used/:id` | buyer | Photos, inspection score + checklist, masked reg, price, "Enquire" / "Test drive" |
| 5 | `/test-drive` (sheet from car page) | buyer | 3 steps: showroom → date + slot grid → details + consent → confirmation |
| 6 | `/desk` | consultant | Inbox list: timer badge, name, model, source, status; filters; empty state "All caught up" |
| 7 | `/desk/leads/:id` | consultant | AI summary card, editable draft + send, timeline, status, re-assign |
| 8 | `/admin/*` | admin | Tabs: Cars & variants · Prices (tax/insurance/accessories) with live preview of a breakup · Used stock · CSV import |

Plus `/login`, `/privacy` (consent text + opt-out form), 404.

---

## 8. Design system ("Google-calm", no AI-slop)

- **Do:** white/near-white surfaces, 8-px spacing grid, generous whitespace, one accent (deep blue `#1A56DB`-ish, single hue), neutral greys, 1-px hairline borders, 12-px radius, one font family (Inter; Noto Sans Devanagari for Hindi), real hierarchy via size/weight not colour.
- **Don't:** gradients, glassmorphism, emoji icons, drop-shadow stacks, purple-blue AI gradients, stock "hero illustration", 5 CTAs per card.
- Every car page: **price + one primary action** visible above the fold (and sticky on mobile).
- Skeleton loaders shaped like real content; empty states with one sentence + one action; inline error with retry.
- Mobile-first: test at 360 px; tap targets ≥ 44 px; slot grid as large chips.
- Numbers in Indian format (`₹14,36,145`, `41,200 km`).
- Photos: royalty-free (Unsplash), no brand logos — labelled assumption.

---

## 9. Security & privacy checklist
- `.env` git-ignored, `.env.example` with names only; seed passwords from `DEMO_PASSWORD` env
- Pydantic validation on every input; phone/email formats; CSV size + row limits
- Role dependency on every desk/admin route; consultant sees only own + showroom leads
- httpOnly + SameSite=Lax cookie; bcrypt; simple rate limit on public POSTs (slowapi)
- Consent required (400 without it), `consent_at` stored; opt-out stops AI + messages
- Full reg number never in public responses; no real personal data in seed

---

## 10. Tests (the ones that matter)
- `test_pricing.py` — breakup sums, band edges (exactly ₹10L), TCS threshold, missing rule → price on request, expired rule ignored, validity = earliest
- `test_assignment.py` — showroom match, model preference, least-loaded, tie-break, no consultant fallback
- `test_slots.py` — past slots hidden, double booking → 409
- `test_ai_guard.py` — discount phrase (EN/HI), raw price, bad JSON, timeout → fallback, placeholder filled from table
- `test_import.py` — valid rows, bad phone, duplicate phone
- `test_access.py` — buyer can't hit desk, consultant can't hit admin, masked reg in public API
- `emi.test.ts` — EMI formula, 0% rate edge

---

## 11. Seed data (realistic, Lucknow)
- 3 showrooms: Gomti Nagar, Aliganj, Alambagh · cities: Lucknow, Kanpur, Barabanki
- 6 models (Model H, C, S + 3 more), 2–4 variants each, incl. **NEW-H-02 Model H ZX automatic petrol ₹12,45,000**
- 14 used cars incl. **UC-1182 Model C VX diesel 2022 41,200 km ₹8,45,000 Available** and **UC-1190 Model S LX petrol 2021 58,600 km ₹5,12,000 Booked**
- 2 demo cars per showroom, some pre-booked slots
- 6 consultants (2 per showroom), 1 admin, 1 buyer
- ~40 leads across statuses/sources, some overdue, with timelines; one sample portal CSV in `/samples`

---

## 12. Repo layout
```
backend/
  app/main.py  db.py  models.py  auth.py  settings.py
  app/routers/{auth,public,desk,admin}.py
  app/logic/{pricing,assignment,slots,ai,importer,masking}.py
  app/seed.py
  tests/
frontend/
  src/pages/  src/components/  src/lib/{api,format,emi}.ts  src/i18n/{en,hi}.json
samples/portal_leads.csv
.env.example  README.md  deployment.md
```

---

## 13. 7-day schedule
| Day | Deliverable |
|---|---|
| 1 | Repo, FastAPI + SQLModel skeleton, all tables, seed script, auth + roles, React shell + design tokens, **deploy to Render on day 1** |
| 2 | Pricing engine + tests, models API, home + model page with city breakup |
| 3 | Used list/detail (filters, masking), slots + test-drive booking flow + tests |
| 4 | Lead create + auto-assign + mock ack, desk inbox with timer, lead detail, CSV import + tests |
| 5 | AI summary/draft, guardrails, fallback + tests; admin CMS (cars, prices with live preview, used stock) |
| 6 | Design polish pass, Hindi, mobile at 360 px, loading/empty/error everywhere, SEO meta + sitemap, Lighthouse check; depth: EMI + trade-in |
| 7 | Test gaps, access-control review, TDD (with assumptions list + screenshots), deployment.md, demo logins, final deploy + smoke test, zip |

Commit small and often with clear messages (reviewers read history).

---

## 14. Assumptions to label in TDD
- Road-tax %, insurance %, registration fee, TCS rule, accessory prices — illustrative, admin-editable
- Ex-showroom price same across listed cities (single state, UP)
- 45-min test-drive slots, 10:00–18:00, one buyer per demo car per slot
- 5-min SLA measured to first status change or sent message
- Buyers can book as guests; buyer login only for "my bookings" + opt-out
- Car photos are royalty-free stand-ins; Brand X has no real logo
- WhatsApp/SMS, payments and DMS are mocked
