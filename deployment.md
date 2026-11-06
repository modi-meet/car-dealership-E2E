# Deployment

Company A's site is one FastAPI service that also serves the built React app. Because both come from the same origin, there's no CORS setup and no second deploy.

- **Live:** <https://companya-dealership.onrender.com> (the Render free tier sleeps when idle, so the first request can take about 30 s)
- **Code:** <https://github.com/modi-meet/car-dealership-E2E>

## Demo logins

Every account uses the password `demo1234`, unless the deploy set its own `DEMO_PASSWORD`.

| Role | Email | Sees |
|---|---|---|
| Admin | `admin@companya.demo` | Everything: prices, cars, used stock, team, all leads, DMS export |
| Consultant, Gomti Nagar | `ankit@companya.demo`, `priya@companya.demo` | Their own leads and their showroom's leads |
| Consultant, Aliganj | `rohit@companya.demo`, `neha@companya.demo` | Same |
| Consultant, Alambagh | `saurabh@companya.demo`, `kavya@companya.demo` | Same |
| Buyer | `buyer@companya.demo` | The public site only. Buyers don't need an account to enquire or book. |

## Run it locally

You need Python 3.12 with [uv](https://docs.astral.sh/uv/), and Node 22.

```bash
cd backend
cp ../.env.example .env              # all optional locally, the defaults work
uv sync
uv run python -m app.seed            # wipes and reseeds dealership.db
uv run uvicorn app.main:app --reload --port 8000
```

In a second terminal:

```bash
cd frontend
npm ci
npm run dev                          # http://localhost:5173, /api is proxied to :8000
```

To try it the way production runs it, serve the built app from FastAPI. Build it first with `npm run build` in `frontend/`, then open <http://localhost:8000>.

### Tests

```bash
cd backend && uv run pytest -q          # 193 tests: pricing, slots, assignment, ai guards, access matrix, seo
cd frontend && npm test && npm run lint # 16 tests: formatting, timers, emi
```

## Environment variables

These are names only. Real values live in `backend/.env` locally, which is git-ignored, or in the Render dashboard.

| Name | Needed in prod | What it does |
|---|---|---|
| `DATABASE_URL` | yes | A Postgres URL, for example from Neon. `postgres://` and `postgresql://` both work. Defaults to `sqlite:///./dealership.db`. |
| `JWT_SECRET` | yes | Signs session cookies. The app **refuses to start** with the dev default, or with a secret under 32 characters, when `COOKIE_SECURE=true`. |
| `COOKIE_SECURE` | yes (`true`) | Marks cookies as HTTPS-only and turns on HSTS. |
| `PUBLIC_URL` | yes | The site's own URL, used for canonical links, the sitemap and Open Graph tags. |
| `DEMO_PASSWORD` | no | The password for the seeded accounts. |
| `ANTHROPIC_API_KEY` | no | Turns on the live AI buyer summary and first-reply draft. Without it, leads get a rule-based summary and a template reply, labelled "fallback" on the desk. |
| `AI_MODEL` | no | Defaults to `claude-opus-5-5`. |

## Deploy: Render + Neon

The deploy uses Render for the web service, built from the `Dockerfile`, and Neon for Postgres. Both have free tiers. Neon is used because Render's free Postgres expires after 30 days, and its free disks are wiped on every deploy.

1. **Create the database.** Make a project on [neon.tech](https://neon.tech) in AWS Singapore, the region closest to Lucknow. Copy the pooled connection string. It looks like `postgresql://user:pass@ep-xxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`.
2. **Create the web service.** In Render, choose **New → Blueprint** and pick this repo. Render reads `render.yaml`, which describes one Docker web service in Singapore, health-checked on `/api/health`, with `JWT_SECRET` auto-generated.
3. **Fill in the prompted values:**
   - `DATABASE_URL`: the Neon string from step 1.
   - `PUBLIC_URL`: `https://<service>.onrender.com`.
   - `DEMO_PASSWORD`: optional.
   - `ANTHROPIC_API_KEY`: optional.
4. **Deploy.** The container:
   - builds the React app;
   - installs the backend from `uv.lock`;
   - on boot, runs `python -m app.seed --if-empty`, which seeds only an empty database, so restarts and redeploys keep real data;
   - starts uvicorn with `--proxy-headers`, so rate limits see the real client IP rather than Render's proxy.

After that, every push to `main` redeploys automatically.

### Smoke test after a deploy

- [ ] `GET /api/health` returns `{"ok": true}`.
- [ ] Open `/cars/model-h` and switch the city to Kanpur. The total changes. Open the page source: the `<title>` and the JSON-LD carry the price.
- [ ] Book a test drive for tomorrow. You get a reference number and a consultant's name. Try to book the same slot again: it is refused.
- [ ] Sign in as `ankit@`. The new lead is at the top of **Waiting** with a 5-minute timer counting down. Open it and check the buyer read and draft.
- [ ] Sign in as `admin@`. Change Lucknow's road tax in **Prices**: the preview updates and the public price updates. Then change it back.
- [ ] Open `/sitemap.xml` and `/robots.txt`. Open `/desk` while signed out: it sends you to sign-in.

### Reset the demo data

The seed wipes the database and loads it again. Run it from a Render shell, or locally with the production `DATABASE_URL` exported:

```bash
cd backend && uv run python -m app.seed
```

## Limits worth knowing

- **Rate limits** are kept in memory, per instance: 5 form posts a minute (30 an hour) and 10 login tries a minute, per IP. If the service ever runs on more than one instance, point slowapi at Redis.
- **AI calls** run in the background after the lead is saved. A buyer never waits on the model, and a slow or failed call falls back to the template.
- **WhatsApp acknowledgements** are mocked. They show up in the lead's timeline as "sent" without leaving the server.
