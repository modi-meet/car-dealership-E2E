# Company A — Brand X dealership, Lucknow

New and certified used cars with an honest, city-wise on-road price, test-drive booking, and a lead desk where every enquiry gets a consultant and a 5-minute clock.

**FastAPI + SQLModel** backend, **React + Vite + Tailwind** frontend, served as one app. AI (Claude) writes the buyer summary and a first-reply draft, and code checks it before anyone can send it.

- Live: <https://companya-dealership.vercel.app> (admin login `admin@companya.demo` / `demo1234`)
- Run it, deploy it, demo logins: [deployment.md](deployment.md)
- Sample portal export for the CSV import: [samples/portal_leads.csv](samples/portal_leads.csv)

```
backend/app/logic/    the real rules, as pure functions: pricing, slots, assignment, ai guards, csv import
backend/app/routers/  thin http layer: public, booking, desk, admin, auth
frontend/src/pages/   buyer pages, desk, admin
```
