# InvestIQ AI

A private long-term investing companion. It tracks your portfolios across
markets (US, Muscat, Tadawul, Dubai), works out holdings, cash and dividend
income from your transactions, and — in later phases — adds AI analysis of
your holdings.

**Honesty rule built into the code:** the app never shows a made-up number.
Every figure carries a badge saying where it came from — *live* (fetched from
the market-data service), *manual as of a date* (entered by hand), or
*sample data* (the demo seed). When a data source is unavailable the app says
so instead of guessing. See `docs/CONVENTIONS.md`.

## Where the project stands

- **Phase 1 — done.** Sign-in, database, market-data layer with source
  badges, portfolio math, and a seeded demo portfolio.
- **Phase 2 — half done.** The server side (transaction entry, CSV import,
  FX, returns and dividend math) is built and tested; the screens for it are
  the next thing to build.
- **Phases 3–6 (stock pages, AI health scores, thesis tracker, AI committee,
  weekly reviews) — designed but not started.** Their pages exist as
  "coming soon" placeholders.

The exact hand-over state lives in `docs/BUILD-PLAN.md` (STATUS section at
the top) — any session resuming the build starts there.

## Run it locally

1. **Start PostgreSQL** (already installed on this machine):

   ```
   pg_ctlcluster 16 main start
   ```

   The app expects a database `investiq` owned by user `investiq` with
   password `investiq`. Create it once if it does not exist:

   ```
   su postgres -c "psql -c \"CREATE USER investiq WITH PASSWORD 'investiq' CREATEDB;\" -c \"CREATE DATABASE investiq OWNER investiq;\""
   ```

2. **Configure environment**: copy `.env.example` to `.env` and fill in
   `BETTER_AUTH_SECRET` (the file explains how to generate one).

3. **Install and set up**:

   ```
   npm install
   npx prisma migrate dev
   npx prisma db seed
   ```

4. **Start the app**:

   ```
   npm run dev
   ```

   Open http://localhost:3000 and sign in with the demo account:
   **owner@example.com** / **investiq-demo**. The seed gives it a year of
   realistic sample transactions across six stocks in three currencies.

> **Security note:** sign-ups are CLOSED by default — the `/sign-up` page
> shows a "registration is closed" message and the server rejects sign-up
> attempts too. Only setting `ALLOW_SIGNUPS="true"` (the literal string)
> opens them; any other value, including leaving it unset, keeps them closed.
> The demo seed creates its user through the normal sign-up path, so keep
> `ALLOW_SIGNUPS="true"` in your local `.env` (the `.env.example` already has
> it) while running `npx prisma db seed` on a fresh database — and never set
> it on a public deployment.

## API keys (optional — get these later)

The app works fully with sample data without any keys.

- **FMP_API_KEY** — a free-tier key from [Financial Modeling Prep](https://financialmodelingprep.com/). With it, US stock prices and fundamentals come in live. Without it, US instruments use manually entered / sample prices, clearly badged.
- **ANTHROPIC_API_KEY** — an [Anthropic](https://www.anthropic.com/) key for the AI features arriving in Phase 3+. Not used yet.

Put either into `.env` when you have them.

## Checks

```
npm run lint        # code style
npm run typecheck   # TypeScript
npm run build       # production build
npm run test        # unit tests (no database needed)
npm run test:e2e    # browser smoke tests (starts the dev server itself)
```

Browsers for the smoke tests are preinstalled under `/opt/pw-browsers` —
never run `playwright install` on this machine.

## Where things live

- `docs/CONVENTIONS.md` — the rules of this repo (read first).
- `docs/BUILD-PLAN.md` — the owner-approved plan for Phases 2–6, with a
  STATUS section saying what is built and what comes next.
- `docs/ROADMAP.md` — what each future phase adds, in one page.
- `docs/design/` — the approved screen designs the build follows.
- `prisma/` — database schema, migrations, and the demo seed.
- `src/lib/data/` — market data with caching and source badges.
- `src/lib/portfolio/` — portfolio math (holdings, cash, value, dividends, FX).
