# Deployment

Company A's site is one FastAPI app that also serves the built React app. Because both come from the same origin, there's no CORS setup and no second deploy.

- **Live:** <https://companya-dealership.vercel.app> (Vercel, Singapore region, with Neon Postgres)
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
cd backend && uv run pytest -q          # 204 tests: pricing, slots, assignment, ai guards, access matrix, seo
cd frontend && npm test && npm run lint # 16 tests: formatting, timers, emi
```

## Environment variables

These are names only. Real values live in `backend/.env` locally, which is git-ignored, or in the Vercel project settings.

| Name | Needed in prod | What it does |
|---|---|---|
| `DATABASE_URL` | yes | A Postgres URL, for example from Neon. `postgres://` and `postgresql://` both work. Defaults to `sqlite:///./dealership.db`. |
| `JWT_SECRET` | yes | Signs session cookies. The app **refuses to start** with the dev default, or with a secret under 32 characters, when `COOKIE_SECURE=true`. |
| `COOKIE_SECURE` | yes (`true`) | Marks cookies as HTTPS-only and turns on HSTS. |
| `PUBLIC_URL` | yes | The site's own URL, used for canonical links, the sitemap and Open Graph tags. |
| `DEMO_PASSWORD` | no | The password for the seeded accounts. |
| `ANTHROPIC_API_KEY` | no | Turns on the live AI buyer summary and first-reply draft. Without it, leads get a rule-based summary and a template reply, labelled "fallback" on the desk. |
| `AI_MODEL` | no | Defaults to `claude-opus-5-5`. |
| `GEMINI_API_KEY` | no | Used only when `ANTHROPIC_API_KEY` is empty. It sends the same prompt and schema to Gemini, and the same draft checks apply. |
| `GEMINI_MODEL` | no | Defaults to `gemini-flash-latest`. |
| `GEMINI_BACKUP_MODEL` | no | Tried once when the main model answers 503 (busy). Defaults to `gemini-flash-lite-latest`. |

## Deploy: Vercel + Neon (what's live)

On Vercel, FastAPI runs as one Python function (`api/index.py` just imports `backend/app/main.py`). `vercel.json` does three things:

- It builds the React app and copies it to `static/` without `index.html`, so Vercel's CDN serves `/assets`, `/media` and the favicon directly.
- It rewrites every other path to the function. Pages still get their server-filled SEO head and boot data, because the function reads `frontend/dist/index.html`.
- It pins the function to `sin1` (Singapore), the same region as the Neon database.

Python dependencies come from `requirements.txt` at the root. It's generated from `backend/uv.lock`, so regenerate it after changing backend dependencies:

```bash
cd backend && uv export --no-dev --no-hashes --no-emit-project --frozen -o ../requirements.txt
```

First-time setup, with the Vercel CLI:

```bash
npm i -g vercel && vercel login
vercel project create companya-dealership
vercel link --yes --project companya-dealership
vercel integration add neon --name companya-db --meta region=sin1   # free plan, sets DATABASE_URL
openssl rand -hex 32 | tr -d '\n' | vercel env add JWT_SECRET production --sensitive
printf true | vercel env add COOKIE_SECURE production
printf https://companya-dealership.vercel.app | vercel env add PUBLIC_URL production
# optional, either one: vercel env add ANTHROPIC_API_KEY production --sensitive
#                      vercel env add GEMINI_API_KEY production --sensitive
```

Vercel has no boot step to run the seed, so create and seed the database once from your machine. Pull only `DATABASE_URL` from the production env:

```bash
vercel env pull --environment=production .env.prod
grep '^DATABASE_URL=' .env.prod > backend/.env && rm .env.prod
cd backend && uv run python -m app.seed --if-empty && rm .env
```

The project is connected to the GitHub repo, so every push to `main` deploys to production, and Vercel builds the frontend itself. To deploy from your machine instead, without pushing:

```bash
cd frontend && npm run build && cd .. && vercel deploy --prod
```

`.vercelignore` keeps `.env` files, the local SQLite database, `node_modules`, `.venv`, the docs and the brief out of the upload.

### Serverless notes

- **Rate limits** are stored in Postgres, in the `ratehit` table, rather than in memory, because each serverless instance has its own memory and counts kept there would never add up. The client IP comes from Vercel's `x-real-ip` header. Vercel sets that header itself and drops any value the visitor sends, and the app trusts it only when `VERCEL=1`.
- **The AI read** still runs as a FastAPI background task. On Vercel, the function stays alive until that task finishes.
- **No local disk:** SQLite isn't an option on Vercel, so `DATABASE_URL` must point at Postgres.

## Alternative: Docker on Render

The `Dockerfile` and `render.yaml` still work for a long-running container. In Render, choose New → Blueprint on this repo and fill in `DATABASE_URL` and `PUBLIC_URL` when prompted. On boot, the container runs `python -m app.seed --if-empty` and then starts uvicorn with `--proxy-headers`.

### Smoke test after a deploy

- [ ] `GET /api/health` returns `{"ok": true}`.
- [ ] Open `/cars/model-h` and switch the city to Kanpur. The total changes. Open the page source: the `<title>` and the JSON-LD carry the price.
- [ ] Book a test drive for tomorrow. You get a reference number and a consultant's name. Try to book the same slot again: it is refused.
- [ ] Sign in as `ankit@`. The new lead is at the top of **Waiting** with a 5-minute timer counting down. Open it and check the buyer read and draft.
- [ ] Sign in as `admin@`. Change Lucknow's road tax in **Prices**: the preview updates and the public price updates. Then change it back.
- [ ] Open `/sitemap.xml` and `/robots.txt`. Open `/desk` while signed out: it sends you to sign-in.

### Reset the demo data

The seed wipes the database and loads it again. Run it locally with the production `DATABASE_URL` exported, as in the first-time setup:

```bash
cd backend && uv run python -m app.seed
```

## Limits worth knowing

- **Rate limits** are fixed windows stored in Postgres: 5 form posts a minute (30 an hour) and 10 login tries a minute, per IP. A visitor whose network rotates between several public IPs gets a separate allowance on each one.
- **AI calls** run in the background after the lead is saved. A buyer never waits on the model, and a slow or failed call falls back to the template.
- **WhatsApp acknowledgements** are mocked. They show up in the lead's timeline as "sent" without leaving the server.
