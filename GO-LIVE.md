# Go-Live checklist — InvestIQ (Long-Term-Investing-)

Plain-English list of what to set up before this goes public. Full context lives in the central `Agents/docs/go-live-and-security-audit.md`.

## Must do before launch
- [ ] **Host: Railway** — `railway.json` is committed and covers the build, runs `prisma migrate deploy` before each deploy, and points the health check at `/api/health`. Create the Railway project and connect this repo.
- [ ] **Set `TRUST_PROXY_HEADERS="true"`** on Railway — the app sits behind Railway's proxy, so without this it would see the proxy's address instead of the real visitor's and rate limits would lump every user together.
- [ ] **Postgres database** → set `DATABASE_URL`.
- [ ] **Generate `BETTER_AUTH_SECRET`** (the `.env.example` shows the command) — at least 32 characters. Do not leave it blank or short: in production the app now refuses to start without one (`src/instrumentation.ts`), so this is caught automatically rather than discovered later.
- [ ] **Set `BETTER_AUTH_URL`** to the real public web address (for example `https://investiq.example`). The links in "confirm your email" and "reset your password" emails are built from it. If it's missing or still points at `localhost`, the live app refuses to send those emails, logs an error, and the screens say plainly that the email couldn't be sent.
- [ ] **Set up email before opening sign-ups (Resend):** set `RESEND_API_KEY` and `RESEND_FROM`. Sign-ups are **open by default**, and every new account must confirm its email address before it can sign in — so on the live site, sign-ups are automatically refused ("unavailable right now because we can't send confirmation emails") until email works. Then sign up once yourself with a real address and confirm the email actually arrives and its link signs you in. Password reset ("Forgot password?") needs email too.
- [ ] **Decide whether sign-ups should be open on day one.** To hold them, set `SIGNUPS_PAUSED="true"` and restart: the sign-up page says "New sign-ups are paused right now" and the server refuses sign-up attempts; people who already have an account can still sign in, reset their password and confirm their email. Remove it (and restart) to open the doors. If an old `ALLOW_SIGNUPS` value is still set, delete it — it no longer does anything (the app logs a warning at startup saying so).
- [ ] **Check the switches from `/api/health`:** while signed in (or calling it with `Authorization: Bearer <CRON_SECRET>`), `/api/health` shows `signups: "open"` or `"paused"` (with `signupsReason` `"SIGNUPS_PAUSED"` or `"email_not_configured"`), `email`, and `billing`. Anyone else only ever sees `status` and `db` — that detail is deliberately hidden from the outside.
- [ ] **Database connections:** if the host runs several copies of the app (serverless functions or more than one instance), add a connection cap to `DATABASE_URL` so Prisma doesn't open more Postgres connections than the database allows — e.g. `postgresql://...../investiq?connection_limit=5`. One always-on instance doesn't need this.
- [ ] **No demo login on the live site:** seed the live database with `NODE_ENV="production"` (Railway sets this). The seed then creates NO `owner@example.com` login and no demo portfolio — only the shared sample prices and exchange rates, which are labelled "sample data". It never asks for `SEED_DEMO_PASSWORD` there. If an older deploy ever created `owner@example.com` on the live database, delete that account (sign in as it and use Settings → Danger → Delete my account).
- [ ] **Turn on automatic database backups, and confirm it on the host's dashboard** — see the Backups section below.

## Optional
- [ ] `FMP_API_KEY` — free Financial Modeling Prep key for live US stock prices (without it, prices are manual/sample, clearly labelled).
- [ ] `ANTHROPIC_API_KEY` — Anthropic key for the AI features (health scores, committee, thesis checks, buy/sell analysis, weekly reviews). **This IS used by the app now** (`src/lib/ai/client.ts`, `src/lib/ai/analysis.ts`) — without it, every AI surface shows the honest "AI features are turned off" notice instead of a made-up analysis; nothing breaks, AI just stays dormant. Three caps stop a surprise bill, checked in this order: an app-wide daily cap (`GLOBAL_AI_DAILY_CAP`, default 100 new analyses a day across everyone; set `0` to pause AI for everybody — pick a number you'd be happy to pay for on a bad day), then a per-person daily cap (Free 2, Pro 10), then a Pro monthly cap (150). All reset on UTC days/months. Plans and limits live in `src/lib/plans.ts`.
- [ ] `CRON_SECRET` — a long random bearer secret for the two scheduled endpoints, `POST /api/cron/weekly-review` and `POST /api/cron/check-alerts`. Leave it unset and both endpoints answer a dormant `503` and do nothing — no scheduling happens. Set it to turn scheduling on, then call either endpoint with `Authorization: Bearer <CRON_SECRET>` (see `.github/workflows/weekly-review.yml.example` and `check-alerts.yml.example`). If it's set but shorter than 16 characters, the app logs a warning at startup (not a hard failure — this only weakens an optional feature) — generate it the same way as `BETTER_AUTH_SECRET`.
- [ ] `RESEND_API_KEY` / `RESEND_FROM` — **required on the live site for sign-ups and password reset** (see "Set up email" above). They also turn on the optional weekly-review email, sent to a user's own address each time their weekly review finishes. Leave either blank and nothing changes — no network call is ever made. `/api/health`'s `email` field reports `"configured"` or `"dormant"`.
- [ ] `PRIVACY_CONTACT_EMAIL` — the address shown as a mailto link on `/privacy` and `/terms` for questions. Leave it unset and the pages show the owner's own address (`naeljam@hotmail.com`); set it to route those questions to a different inbox.

## Data rights (built in — nothing to set up)
- **Download my data**: any signed-in user can download a complete JSON export of everything the app stores about their account from Settings → "Your data" (`GET /api/account/export`, rate-limited to 5/hour per user).
- **Keep payments switched on until every active subscription is cancelled** — deleting an account only cancels the Stripe subscription while billing is on.
- **Scheduled weekly reviews share the app-wide `GLOBAL_AI_DAILY_CAP`** with everything else, so on a busy day they can be skipped once the cap is used up.
- **Delete my account**: Settings → "Danger" lets a user permanently delete their account (password-confirmed, rate-limited like sign-in). The database's `ON DELETE CASCADE` wipes every dependent row — sessions, portfolios, transactions, theses, alerts, notifications, AI analyses — in the same operation.
- **Privacy policy and terms**: `/privacy` and `/terms` are public pages, linked from the sign-in/sign-up pages, the landing page footer and the footer of every authenticated page. Both are honest templates pending a professional legal review. They now cover plans and pricing, billing details kept (never card details), email confirmation, Stripe as reseller, the `iq_anon` security cookie, auto-renewal and the refund line. The `/terms` "is Pro on sale?" sentence follows `BILLING_ENABLED` live. **Before payments are turned on, a lawyer must review both pages** (Gulf and US, per `docs/decisions/advice-wording.md` §3) — this is a hard blocker for switching billing on, not a "once it makes money" item.

## Payments
Payments stay **OFF** (`BILLING_ENABLED` unset) until every box below is ticked. With billing off there are no upgrade buttons and the Stripe webhook answers "dormant" (503).
- [ ] A Stripe account exists (via Stripe Atlas or directly).
- [ ] Managed Payments is enabled on it, and you have confirmed that it is actually active.
- [ ] Live keys, the webhook endpoint (`/api/billing/webhook`) and the live prices (monthly and yearly) are created in Stripe; set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_YEARLY`.
- [ ] A lawyer has reviewed `/terms` and `/privacy`.
- [ ] Only then set `BILLING_ENABLED="true"` and restart. Check `/api/health` shows the billing mode you expect.

### Give someone Pro by hand
Works whether or not billing is on. From a shell pointed at the right database (it reads `DATABASE_URL`):
`npm run plan:set -- --email someone@example.com --plan PRO`
Use `--plan FREE` to put them back. If the person has a Stripe subscription the command refuses; add `--force` only if you really mean to override it.

### Before deploying
- [ ] **Take a database backup before deploying the migration that carries this change** (the plans and billing tables). Confirm the backup exists first.

## Backups & recovery (engineering-standards.md §8)
- [ ] **Turn on automatic backups at the hosting/database provider** before real users' data exists there, and confirm it's actually on from the provider's dashboard — don't assume a database has backups by default.
- [ ] **Restore-test at least one backup into a scratch database** before launch, and on an ongoing cadence after ("restore-tested" is considered to expire after 90 days). In plain English: (1) take or use the most recent automatic backup, (2) restore it into a NEW, throwaway database — never over the live one, (3) check that a few crown-jewel tables came back correctly (`user`, `Portfolio`, `Transaction`), (4) delete the scratch database when done. This is a host/owner action, not something the code does automatically.
- [ ] **`/data`-style uploads** — this app doesn't currently store uploaded files outside the database, so there is no separate single-copy-file risk to document yet.

## Security note
No committed secrets; login and per-user data scoping are sound. Audit item **B3 is now fixed**: the seed no longer has a hardcoded demo password — it reads `SEED_DEMO_PASSWORD` and refuses to create the demo login unless you set a strong value (≥12 chars), so a guessable public account can't slip through — and in production the seed creates no demo login at all. Sign-ups are now open to the public, with three safeguards: every new account must confirm its email address, the live site refuses sign-ups while email isn't set up, and `SIGNUPS_PAUSED="true"` pauses them at any time. Sign-ups are also rate-limited (5 an hour per browser or IP), as are confirmation and reset emails (5 an hour per address). In production, the app also now refuses to start at all with a missing or short `BETTER_AUTH_SECRET` (see above) — a second, automatic check on top of remembering to set it correctly.
