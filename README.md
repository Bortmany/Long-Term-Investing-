# InvestIQ AI

A private long-term investing companion. It tracks a user's portfolios across
markets (US, Muscat, Tadawul, Dubai), works out holdings, cash and dividend
income from their transactions, runs price alerts, and layers on optional AI
analysis (health scores, an "AI committee" review, thesis tracking, weekly
reviews).

**The honesty rule:** the app never shows a made-up number. Every displayed
figure carries a source badge saying where it came from —

- `live` — fetched from the market-data provider (Financial Modeling Prep)
- `manual` — entered by hand, shown with its as-of date
- `sample` — seeded demo data
- `derived` — computed purely from the user's own transactions, no external source involved

When a data source is unavailable, the code returns a typed "unavailable"
result and the UI says so — it never falls back to a guessed or padded
number. This rule governs every change to the data and portfolio layers; see
`docs/CONVENTIONS.md` for the full detail if you're changing code there.

## Where the project stands

All planned phases (portfolio and dividends, stock pages and AI health
scores, thesis tracker, AI committee, weekly reviews, price alerts, and
public-launch readiness) are built. `docs/BUILD-PLAN.md` has the detailed
status, `docs/ROADMAP.md` the one-page summary, and `GO-LIVE.md` the
checklist for putting it online.

## Stack

- **Next.js 16** (App Router, TypeScript strict, Turbopack). Note: Next.js
  16 renamed "middleware" to "proxy" — route protection lives in
  `src/proxy.ts`.
- **Node.js 22** — the exact major version is pinned in `.nvmrc` (and
  `package.json` accepts 22.18 or newer within 22).
- **Prisma + PostgreSQL 16**, with real numbered migrations
  (`prisma/migrations/`). Schema changes always go through
  `npx prisma migrate dev`, which writes a new migration — never
  `prisma db push`, never hand-edited SQL. Everywhere else (setting up a
  database, the pre-push check, GitHub's check, Railway deploys) uses
  `npx prisma migrate deploy`, which only applies migrations that already
  exist and never resets or wipes a database.
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
docs/              Conventions, build plan, roadmap, designs, research.
.github/workflows/ The GitHub check (verify.yml) plus two example schedules.
.husky/pre-push    The check that runs before every `git push`.
```

## Local setup

1. **PostgreSQL 16.** On the Mac:

   ```
   brew services start postgresql@16
   psql postgres -c "CREATE USER investiq WITH PASSWORD 'investiq' CREATEDB;" -c "CREATE DATABASE investiq OWNER investiq;"
   ```

   (The second line is only needed once. On Linux the first line is
   `pg_ctlcluster 16 main start`.)

2. **Node 22.** `nvm use` picks up the version from `.nvmrc`.

3. **Environment.** Copy `.env.example` to `.env` and fill in the values —
   see the table below. At minimum you need `DATABASE_URL`, a generated
   `BETTER_AUTH_SECRET`, and (to seed the demo) a `SEED_DEMO_PASSWORD` of
   at least 12 characters.

4. **Install, apply migrations, add demo data:**

   ```
   npm install
   npx prisma migrate deploy
   npx prisma db seed
   ```

   `npm install` also switches on the pre-push check (see Checks below).
   Only reach for `npx prisma migrate dev` when you are changing the
   database design and need a new migration.

5. **Run it:**

   ```
   npm run dev
   ```

   Open http://localhost:3000. The seed creates a demo login
   (`owner@example.com`, password from `SEED_DEMO_PASSWORD` in your `.env`)
   with a year of sample transactions across six stocks in three currencies.

   Seeding needs `ALLOW_SIGNUPS="true"` set (the seed creates its user
   through the normal sign-up path; `.env.example` already has it) — see the
   sign-ups note below.

## Environment variables

All of these are documented with more detail in `.env.example`; short
version:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string. |
| `BETTER_AUTH_SECRET` | Secret that signs sign-in session cookies. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Required — the app refuses to start in production without it. |
| `BETTER_AUTH_URL` | The public URL the app runs at. |
| `ALLOW_SIGNUPS` | Gates `/sign-up`. Sign-ups are **closed by default**; only the literal string `"true"` opens them. Needed temporarily while seeding; never set `"true"` on a public deployment. |
| `FMP_API_KEY` | Financial Modeling Prep key for live US stock prices/fundamentals. Empty = manual/sample prices only, clearly badged. |
| `ANTHROPIC_API_KEY` | Enables the AI features (health scores, committee, thesis checks, weekly reviews). Empty = every AI surface shows an honest "AI features are off" notice instead of a made-up result. |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | Error tracking. Empty = tracking stays off, nothing is sent anywhere. |
| `REDIS_URL` | Shared rate-limit store for multi-server deployments. Empty = a fast in-memory limiter scoped to one server process. |
| `TRUST_PROXY_HEADERS` | Whether to trust `X-Forwarded-For`/`X-Real-IP` for rate-limiting. Only set `"true"` behind a proxy you control that overwrites the header (e.g. Railway). |
| `CRON_SECRET` | Bearer secret for the scheduled endpoints (`/api/cron/weekly-review`, `/api/cron/check-alerts`). Empty = both answer a dormant 503. |
| `RESEND_API_KEY` / `RESEND_FROM` | Optional weekly-review email via Resend. Either empty = email stays off. |
| `PRIVACY_CONTACT_EMAIL` | Contact address shown on `/privacy` and `/terms`. Empty = the owner's default address. |
| `SEED_DEMO_PASSWORD` | Password for the seeded demo login, used only by `prisma db seed`. Must be at least 12 characters; the seed refuses to run without it. |

## Checks

```
npm run verify      # everything below except the browser tests, in one go
npm run lint        # code style
npm run typecheck   # TypeScript
npm run build       # production build
npm test            # unit tests (no database needed)
npm run test:e2e    # browser smoke tests (starts the dev server itself)
```

`npm run verify` applies any new migrations to the database in `.env`
(`prisma migrate deploy` — it never resets or wipes one), regenerates the
database client, then runs lint, type check, build and the unit tests.

**Before every push.** `.husky/pre-push` runs `npm run verify` on every
`git push`. It refuses to run — and stops the push — if any database
address in the environment or in `.env` / `.env.local` points anywhere other
than this computer, so it can never touch the live Railway database. It also
stops with a plain message if local Postgres isn't running. In an emergency,
`git push --no-verify` skips it.

**On GitHub.** `.github/workflows/verify.yml` runs the same steps on every
pull request and every push to main, against a throwaway Postgres 16
database with a freshly generated, CI-only sign-in secret — no real keys are
used. A red cross on a pull request means one step failed. The browser tests
are left out there, as they are in `npm run verify`.

Browsers for the smoke tests are preinstalled — never run
`playwright install` on this machine.

## Deployment (Railway)

`railway.json` in the repo root drives the deploy:

- **Build:** Railway's standard Node builder (Nixpacks) installs the
  packages and runs `npm run build`.
- **Before each release** (runs before the new version takes traffic):
  `npx prisma migrate deploy`.
- **Start:** `npm start`.
- **Health check:** `GET /api/health`, given up to 5 minutes — it reports
  database connectivity plus whether Sentry, cron and email are configured
  or dormant, and whether sign-ups are open or closed.
- **If it crashes:** Railway restarts it, up to 5 times.

Set the environment variables from the table above in Railway's dashboard
before the first deploy (including `TRUST_PROXY_HEADERS="true"`, since the
app sits behind Railway's proxy). `ALLOW_SIGNUPS` should **not** be
`"true"` on a public deployment — see the note below. `GO-LIVE.md` has the
full checklist.

## Sign-ups are closed by default

`/sign-up` shows a "registration is closed" message and the server rejects
sign-up attempts, unless `ALLOW_SIGNUPS` is set to the literal string
`"true"`. Any other value, including leaving it unset, keeps sign-ups
closed. This is deliberate: the app is meant to run as a single owner's
private tool unless someone has explicitly decided to open it up.

## Privacy & data controls

`/privacy` and `/terms` are public pages (no sign-in needed) describing
exactly what the app stores and how it may be used — linked from the
sign-in/sign-up pages and the footer of every screen. Every signed-in user
can download a complete copy of their own data or permanently delete their
account from the Settings page ("Your data" and "Danger" cards).

## Where things live

- `docs/CONVENTIONS.md` — the rules of this repo (read first).
- `docs/BUILD-PLAN.md` — the owner-approved build plan, with a STATUS section.
- `docs/ROADMAP.md` — what each phase adds, in one page.
- `docs/design/` — the approved screen designs the build follows.
- `GO-LIVE.md` — the checklist for putting the app online.
