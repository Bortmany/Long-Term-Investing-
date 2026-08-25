# InvestIQ AI

A long-term investing copilot. It tracks a user's portfolios across markets
(US, Muscat, Tadawul, Dubai), works out holdings, cash and dividend income
from their transactions, runs price alerts, and layers on optional AI
analysis (health scores, an "AI committee" review, thesis tracking, weekly
reviews).

**The honesty rule:** the app never shows a made-up number. Every displayed
figure carries a source badge saying where it came from —

- `live` — fetched just now from the market-data provider (Financial Modeling Prep)
- `manual` — entered by hand, shown with its as-of date
- `sample` — seeded demo data
- `derived` — computed purely from the user's own transactions, no external source involved

When a data source is unavailable, the code returns a typed "unavailable"
result and the UI says so — it never falls back to a guessed or padded
number. This rule governs every change to the data and portfolio layers; see
`docs/CONVENTIONS.md` for the full detail if you're changing code there.

## Stack

- **Next.js 16** (App Router, TypeScript strict, Turbopack). Note: Next.js
  16 renamed "middleware" to "proxy" — route protection lives in
  `src/proxy.ts`.
- **Prisma + PostgreSQL**, with real numbered migrations (`prisma/migrations/`).
  Schema changes always go through a migration — never `prisma db push`, never
  hand-edited SQL. Production deploys run `prisma migrate deploy` (applies
  migrations, does not prompt); local development uses
  `prisma migrate dev` (also generates a migration from schema changes).
- **better-auth** for authentication (email/password), with an httpOnly
  session cookie.
- **TanStack Query** on the frontend for server-state, caching and mutations.
- **Vitest** for unit tests, **Playwright** for end-to-end/browser tests.
- **Tailwind CSS v4** + **shadcn/ui** components (`src/components/ui/`).
- **Sentry** for error tracking (optional — dormant until `SENTRY_DSN` is set).

## Project layout

```
src/
  app/            Routes (App Router). API routes under app/api/.
                   Pages stay thin; logic lives in src/lib/.
  lib/
    auth.ts, auth-client.ts, prisma.ts   Auth server instance, Better Auth
                                          React client, Prisma singleton —
                                          import these, never instantiate new ones.
    data/          Market-data layer: provider calls, caching, source badges.
                   Callers never hit the market-data provider directly.
    portfolio/     Pure portfolio math (holdings, cash, value, dividends,
                   FX) — no I/O, unit-testable on its own.
    ai/            AI analysis engine, spend cap, Anthropic client.
    alerts/        Price-alert evaluation.
  proxy.ts         Route protection (Next.js 16's replacement for middleware).
prisma/
  schema.prisma    Data model.
  migrations/      Numbered, applied migrations — the only way schema changes.
  seed.ts          Demo data (one demo user, a year of sample transactions).
tests/
  unit/            Vitest — no database needed, run by `npm test`.
  e2e/             Playwright smoke tests — run only by `npm run test:e2e`.
docs/              Build/architecture notes for this project's own history.
```

## Local setup

1. **PostgreSQL.** Point `DATABASE_URL` at a Postgres 16+ database (local or
   otherwise). Locally that's usually:

   ```
   pg_ctlcluster 16 main start
   su postgres -c "psql -c \"CREATE USER investiq WITH PASSWORD 'investiq' CREATEDB;\" -c \"CREATE DATABASE investiq OWNER investiq;\""
   ```

2. **Environment.** Copy `.env.example` to `.env` and fill in the values —
   see the table below. At minimum you need `DATABASE_URL` and a generated
   `BETTER_AUTH_SECRET`.

3. **Install and migrate:**

   ```
   npm install
   npx prisma migrate dev
   npx prisma db seed
   ```

   (`prisma migrate dev` is for local development — it can create new
   migrations from schema changes. Production/CI uses
   `npx prisma migrate deploy`, which only applies existing migrations and
   never prompts.)

4. **Run it:**

   ```
   npm run dev
   ```

   Open http://localhost:3000. The seed creates a demo login
   (`owner@example.com`, password from `SEED_DEMO_PASSWORD` in your `.env`)
   with a year of sample transactions across six stocks in three currencies.

   Seeding needs `ALLOW_SIGNUPS="true"` set (the seed creates its user
   through the normal sign-up path) — see the sign-ups note below.

## Environment variables

All of these are documented with more detail in `.env.example`; short
version:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string. |
| `BETTER_AUTH_SECRET` | Secret that signs auth session cookies. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Required — the app refuses to start in production without it. |
| `BETTER_AUTH_URL` | The public URL the app runs at. |
| `ALLOW_SIGNUPS` | Gates `/sign-up`. Sign-ups are **closed by default**; only the literal string `"true"` opens them. Needed temporarily while seeding; never set `"true"` on a public deployment. |
| `FMP_API_KEY` | Financial Modeling Prep key for live US stock prices/fundamentals. Empty = manual/sample prices only, clearly badged. |
| `ANTHROPIC_API_KEY` | Enables the AI features (health scores, committee, thesis checks, weekly reviews). Empty = every AI surface shows an honest "AI features are off" notice instead of a fabricated result. |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | Error tracking. Empty = tracking stays off, nothing is sent anywhere. |
| `REDIS_URL` | Shared rate-limit store for multi-instance deployments. Empty = a fast in-memory limiter scoped to one server process. |
| `TRUST_PROXY_HEADERS` | Whether to trust `X-Forwarded-For`/`X-Real-IP` for rate-limiting. Only set `"true"` behind a proxy you control that overwrites the header (e.g. Railway). |
| `CRON_SECRET` | Bearer secret for the scheduled endpoints (`/api/cron/weekly-review`, `/api/cron/check-alerts`). Empty = both answer a dormant 503. |
| `RESEND_API_KEY` / `RESEND_FROM` | Optional weekly-review email via Resend. Either empty = email stays off. |
| `SEED_DEMO_PASSWORD` | Password for the seeded demo login, used only by `prisma db seed`. Must be at least 12 characters; the seed refuses to run without it. |

## Tests

```
npm test          # Vitest unit suite — no database needed
npm run test:e2e   # Playwright browser smoke tests — starts its own dev server
```

Also available: `npm run lint` (ESLint) and `npm run typecheck` (`tsc --noEmit`).

## Deployment (Railway)

`railway.json` in the repo root drives the deploy:

- **Build:** `npx prisma generate && npm run build`
- **Pre-deploy** (runs before the new version takes traffic): `npx prisma migrate deploy`
- **Health check:** `GET /api/health` — reports database connectivity plus
  whether Sentry, cron, and email are configured or dormant, and whether
  sign-ups are currently open or closed.
- **Start:** `npm run start`

Set the environment variables from the table above in Railway's dashboard
before the first deploy. `ALLOW_SIGNUPS` should **not** be `"true"` on a
public deployment — see the note below.

## Sign-ups are closed by default

`/sign-up` shows a "registration is closed" message and the server rejects
sign-up attempts, unless `ALLOW_SIGNUPS` is set to the literal string
`"true"`. Any other value, including leaving it unset, keeps sign-ups
closed. This is deliberate: the app is meant to run as a single owner's
private tool unless someone has explicitly decided to open it up.
