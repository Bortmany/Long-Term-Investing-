# Go-Live checklist — InvestIQ (Long-Term-Investing-)

One ordered list for the owner. Work top to bottom; each part says whether it is needed to open the doors or can wait. Anything marked "switched OFF" is built but does nothing until you set its key, so skipping it breaks nothing. Full background lives in the central `Agents/docs/go-live-and-security-audit.md`.

## Part 1 — Before you deploy (do these first)

- [ ] **Take a database backup, and confirm the backup file really exists.** This deploy carries **5 new database changes** (plans and billing, Gulf markets, import references, broker connection, Sharia screen). They only add things and never delete, but a backup is the undo button. See "Backups and recovery" at the bottom for how.
- [ ] **Host: Railway.** `railway.json` is committed: it covers the build, runs the database upgrade (`prisma migrate deploy`) before each deploy, and points the health check at `/api/health`. Create the Railway project and connect this repo.
- [ ] **Postgres database** → set `DATABASE_URL`. If the host ever runs more than one copy of the app, add a connection cap, e.g. `postgresql://...../investiq?connection_limit=5`. One always-on copy doesn't need this.
- [ ] **Run ONE copy of the app for now.** Rate limits (sign-in, sign-up, public pages, AI bursts) are counted inside each running copy, so two copies would each allow the full amount. A shared counter is a later job; the AI daily caps are kept in the database and are already safe with several copies.

## Part 2 — Required settings (the app will not start or open properly without these)

- [ ] **`BETTER_AUTH_SECRET`** — generate it with the command in `.env.example`; at least 32 characters. In production the app refuses to start without one (`src/instrumentation.ts`).
- [ ] **`BETTER_AUTH_URL`** — the real public address, e.g. `https://investiq.example`. The links in "confirm your email" and "reset your password" emails, the sitemap and each public stock page's "official address" are built from it. If it is missing or still says `localhost`, the live app refuses to send those emails and the screens say so plainly.
- [ ] **`TRUST_PROXY_HEADERS="true"`** — Railway sits in front of the app; without this the app sees Railway's address instead of the visitor's and every visitor shares one rate limit.
- [ ] **Email (Resend): `RESEND_API_KEY` and `RESEND_FROM`.** Sign-ups are **open by default** and every new account must confirm its email before it can sign in, so until email works the live site automatically refuses sign-ups ("unavailable right now because we can't send confirmation emails"). Password reset needs email too. Then sign up once yourself with a real address and check the email arrives and its link signs you in. (Email also powers the optional weekly-review email.)
- [ ] **Decide whether sign-ups are open on day one.** To hold them, set `SIGNUPS_PAUSED="true"` and restart: the page says "New sign-ups are paused right now"; existing people can still sign in, reset and confirm. Remove it and restart to open the doors. If an old `ALLOW_SIGNUPS` is still set, delete it (it does nothing; the app warns at startup).
- [ ] **`GLOBAL_AI_DAILY_CAP`** — the most new AI analyses allowed per day across ALL users (default 100; `0` pauses AI for everyone). Pick a number you would happily pay for on a bad day. On top of it: each person gets Free 2 / Pro 10 a day, and Pro 150 a month (all UTC). Needs `ANTHROPIC_API_KEY` to do anything; without that key every AI screen shows the honest "AI features are turned off" notice and already-saved analyses still show.
- [ ] **No demo login on the live site.** Seed the live database with `NODE_ENV="production"` (Railway sets it): no `owner@example.com` login and no demo portfolio are created. If an older deploy ever created that account on the live database, sign in as it and use Settings → Danger → Delete my account.

## Part 3 — Deploy, then immediately after

- [ ] Deploy. Watch the build and the health check go green.
- [ ] **Run `npm run catalogue:sync` once against the live database.** It creates or corrects only the stock rows in the public list (`src/lib/public-catalogue.ts`); it touches no user data and is safe to repeat. A stock only gets a public page and a sitemap entry once its row exists. Repeat it after any later deploy that changes that list.
- [ ] **Check `/api/health`** (signed in, or with `Authorization: Bearer <CRON_SECRET>`). It shows `signups` (`open`/`paused`, with a reason), `email`, `billing`, `twelveData`, `sharia`, `sentry`. Anyone else only sees `status` and `db`.
- [ ] **Turn on error alerts (recommended):** set `SENTRY_DSN` (and `NEXT_PUBLIC_SENTRY_DSN` for the browser). Without it nothing is sent anywhere and errors are only in the host's logs. With it, failed payment events, failed broker syncs and failed Sharia refreshes raise an alert too (secrets are blanked out first).
- [ ] Submit `/sitemap.xml` in Google Search Console.
- [ ] Review the public stock list's names, sectors and countries — they become public.

## Part 4 — Before you invite real people

- [ ] **Automatic database backups ON and confirmed** on the host dashboard, and **one restore tested** into a scratch database (see the bottom section).
- [ ] **Read `/privacy` and `/terms` on the live site.** They are written against what the app really stores (accounts, portfolios, trades, import references, broker connection details, Sharia choice, session address and browser, the `iq_anon` security cookie, billing references; outside services: Resend, Stripe, Twelve Data, Interactive Brokers, Musaffa, Sentry — each only when switched on). They are honest templates, not legal advice.
- [ ] **Lawyer review** of the advice wording (`docs/decisions/advice-wording.md`), `/privacy`, `/terms` and the refund line — Gulf and US. This is a hard blocker before Pro opens (Part 6), not a "once it makes money" item. It is wise before a big public launch too.
- [ ] Data rights need nothing from you: Settings → "Your data" downloads everything as one file (5 an hour per person); Settings → "Danger" deletes the account (password-confirmed). **Keep payments switched on until every active subscription is cancelled** — deleting an account only cancels its Stripe subscription while billing is on.
- [ ] Optional: `PRIVACY_CONTACT_EMAIL` — the address shown on `/privacy` and `/terms` (default is yours, `naeljam@hotmail.com`).
- [ ] Optional: `CRON_SECRET` (long random, 16+ characters) for the scheduled jobs; leave it unset and every `/api/cron/*` route answers "dormant" and does nothing. Schedules are the `.yml.example` files in `.github/workflows/` (weekly review, alert checks, Sharia refresh). Rename one to `.yml` and add the `APP_URL` and `CRON_SECRET` secrets in GitHub to turn it on.
- [ ] Optional: `FMP_API_KEY` for live US prices (without it prices are typed-in or sample, always labelled).

## Part 5 — Optional extras, each switched OFF until you set its key

### Gulf live prices (Twelve Data) — Saudi, Abu Dhabi, Qatar
Muscat (MSX) has no data vendor anywhere, so it stays typed-in whatever you do. It was tested only with made-up replies shaped like the vendor's (`tests/fixtures/twelve-data/`).
1. [ ] Get Twelve Data's written quote and licence. Confirm it covers **signed-in users of a public app**, plus which markets and delays each plan gives.
2. [ ] Make one real call per market, replace the made-up fixtures with the real recorded replies, and **correct the market table** in `src/lib/data/provider-info.ts` (every row says "UNVERIFIED until first real call"). Re-run the tests.
3. [ ] Set `TWELVE_DATA_API_KEY`. **Never put the free (non-commercial) key on the live site**, and never a paid key before the written licence. `/api/health` should then show `twelveData: "configured"`.
4. [ ] `TWELVE_DATA_MARKETS` — default `TADAWUL,ADX,QSE`; add `DFM` only once you've bought the dearer plan.
5. [ ] **Licence flags — leave both UNSET** until a written licence explicitly allows showing prices to signed-out visitors: `TWELVE_DATA_PUBLIC_DISPLAY_LICENSED` and `FMP_PUBLIC_DISPLAY_LICENSED`. While unset every public page says "Sign in to see prices".
6. [ ] Check the plan's allowance: each tracked Gulf stock costs at most about 96 calls a day, shared by everyone.
7. [ ] `TWELVE_DATA_BASE_URL` is developer-only; the app ignores it in production. Never set it live.

### Broker connection (Interactive Brokers, read-only) — Pro
1. [ ] Make a key: `openssl rand -base64 32`, set it as `BROKER_TOKEN_KEY`. Never reuse `BETTER_AUTH_SECRET`.
2. [ ] **Keep a copy of that key somewhere safe, separate from the database.** Lose it and every saved broker token becomes unreadable (no trades are lost; people just reconnect).
3. [ ] Optional: try it once yourself with an IBKR **paper** account (you create the token and paste it; never an agent).
4. [ ] Then flip `broker-connection` to `available` in `src/lib/plans.ts`.

### Sharia screen badge (Musaffa) — Pro
Built and tested with made-up replies only; every field read from a real Musaffa reply is marked `UNVERIFIED AGAINST THE REAL API` in `src/lib/sharia/musaffa.ts`.
1. [ ] Email Musaffa for a quote and **written permission to show their verdicts to our users inside the app**. Choose the plan covering US, Saudi and UAE; get the covered exchanges in writing (Muscat and Qatar will say "Not screened"; fix `src/lib/sharia/coverage.ts` if the list is wrong).
2. [ ] Have a builder check each `UNVERIFIED` item against Musaffa's docs or sandbox (`MUSAFFA_API_BASE_URL`), including the method name they report.
3. [ ] **Only after the permission:** set `MUSAFFA_API_KEY` (and confirm `CRON_SECRET` is set).
4. [ ] Turn on the daily schedule: rename `.github/workflows/sharia-refresh.yml.example` to `.yml` (calls `POST /api/cron/sharia-refresh` at 03:00 UTC with the cron secret).
5. [ ] Spot-check two or three stocks against Musaffa's own site (e.g. Aramco and one US stock).
6. [ ] Then flip `sharia-badge` to `available` in `src/lib/plans.ts`.

## Part 6 — Opening Pro (payments) — only when every box is ticked

Payments stay **OFF** (`BILLING_ENABLED` unset) until then: no upgrade buttons, the Stripe webhook answers "dormant" (503), screens say Pro is "coming soon". Giving Pro by hand works either way (see below).
- [ ] A Stripe account exists (Atlas or direct), and **Managed Payments is enabled and confirmed active**.
- [ ] In Stripe, create the **live** monthly and yearly prices and a webhook pointing at `https://<your address>/api/billing/webhook`.
- [ ] **Live payment keys:** set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_YEARLY`. (A live key outside production keeps billing off on purpose.)
- [ ] Lawyer review done (Part 4), including the refund line and auto-renewal wording.
- [ ] Only then set `BILLING_ENABLED="true"` and restart. `/api/health` should show `billing: "live"`. Do one real small purchase and one refund yourself; confirm the plan flips on the webhook.
- [ ] **Which "coming soon" rows in `src/lib/plans.ts` to flip, and when:**
  - `broker-presets` (free ready-made broker file formats) — built and needs no key; flip it once you've imported one real file from a broker you use.
  - `broker-connection` — after `BROKER_TOKEN_KEY` is set (Part 5).
  - `sharia-badge` — after Musaffa's written permission and key (Part 5).
  - Other rows are already `available`; Pro features show as available but stay gated on the server until someone is actually on Pro.

### Give someone Pro by hand
From a shell pointed at the right database (it reads `DATABASE_URL`): `npm run plan:set -- --email someone@example.com --plan PRO`. Use `--plan FREE` to put them back. If the person has a Stripe subscription it refuses; add `--force` only if you really mean to.

## Backups and recovery (engineering-standards.md section 8)

- [ ] **Automatic backups ON at the database host**, confirmed on its dashboard — never assumed. Before every deploy that changes the database, also take a manual backup and check the file exists.
- [ ] **Restore-test at least once before launch, then about every 90 days.** In plain English: (1) take the latest automatic backup; (2) restore it into a NEW, throwaway database — never over the live one; (3) check a few key tables came back with sensible rows (`user`, `Portfolio`, `Transaction`, `Subscription`); (4) delete the throwaway database. This is a host/owner action; the code doesn't do it.
- [ ] **If the live database is ever lost or damaged:** stop the app (or pause sign-ups with `SIGNUPS_PAUSED="true"`), restore the latest backup into a new database, point `DATABASE_URL` at it, redeploy (the upgrade step brings it fully up to date), run `npm run catalogue:sync`, then check `/api/health` and sign in. People who signed up or traded after the backup was taken will need to redo that; tell them plainly.
- [ ] **Keep separate safe copies of the secrets that can't be re-made:** `BROKER_TOKEN_KEY` (lose it and saved broker tokens are unreadable) and `BETTER_AUTH_SECRET` (change it and everyone is signed out). Neither lives in the database.
- [ ] Uploaded files: this app stores none outside the database, so there is no separate single-copy file risk.

## Security note
No committed secrets; login and per-user data scoping are sound (a test proves one person cannot change another's trades, alerts or theses). The seed has no hardcoded demo password — it needs `SEED_DEMO_PASSWORD` (12+ characters) and creates no demo login at all in production. Sign-ups are open with three safeguards: new accounts must confirm their email, the live site refuses sign-ups while email isn't set up, and `SIGNUPS_PAUSED="true"` pauses them at any time. Sign-ups are limited to 5 an hour per browser or address, as are confirmation and reset emails (per email address). Public stock pages, the sitemap and robots are limited per visitor in the proxy. In production the app refuses to start with a missing or short `BETTER_AUTH_SECRET`.
