# Go-Live checklist — InvestIQ (Long-Term-Investing-)

Plain-English list of what to set up before this goes public. Full context lives in the central `Agents/docs/go-live-and-security-audit.md`.

## Must do before launch
- [ ] **Host: Railway** — `railway.json` is committed and covers the build, runs `prisma migrate deploy` before each deploy, and points the health check at `/api/health`. Create the Railway project and connect this repo.
- [ ] **Set `TRUST_PROXY_HEADERS="true"`** on Railway — the app sits behind Railway's proxy, so without this it would see the proxy's address instead of the real visitor's and rate limits would lump every user together.
- [ ] **Postgres database** → set `DATABASE_URL`.
- [ ] **Generate `BETTER_AUTH_SECRET`** (the `.env.example` shows the command) — at least 32 characters. Do not leave it blank or short: in production the app now refuses to start without one (`src/instrumentation.ts`), so this is caught automatically rather than discovered later.
- [ ] **Set `BETTER_AUTH_URL`** to the real public web address.
- [ ] **Check signups stay OFF:** sign-ups are closed by default — they only open when `ALLOW_SIGNUPS="true"` is set. Make sure the live environment does NOT set it to `"true"` (seeding a fresh database needs it set temporarily; remove it right after). You can confirm the live state from the outside: `/api/health` reports `signups: "open"` or `"closed"`.
- [ ] **Database connections:** if the host runs several copies of the app (serverless functions or more than one instance), add a connection cap to `DATABASE_URL` so Prisma doesn't open more Postgres connections than the database allows — e.g. `postgresql://...../investiq?connection_limit=5`. One always-on instance doesn't need this.
- [ ] **Delete or change the demo login** `owner@example.com` / `investiq-demo` (it's documented publicly).
- [ ] **Turn on automatic database backups, and confirm it on the host's dashboard** — see the Backups section below.

## Optional
- [ ] `FMP_API_KEY` — free Financial Modeling Prep key for live US stock prices (without it, prices are manual/sample, clearly labelled).
- [ ] `ANTHROPIC_API_KEY` — Anthropic key for the AI features (health scores, committee, thesis checks, buy/sell analysis, weekly reviews). **This IS used by the app now** (`src/lib/ai/client.ts`, `src/lib/ai/analysis.ts`) — without it, every AI surface shows the honest "AI features are turned off" notice instead of a made-up analysis; nothing breaks, AI just stays dormant. Every AI call is capped per-user per-day (`DAILY_AI_ANALYSIS_LIMIT`) so a runaway loop can't produce a surprise bill.
- [ ] `CRON_SECRET` — a long random bearer secret for the two scheduled endpoints, `POST /api/cron/weekly-review` and `POST /api/cron/check-alerts`. Leave it unset and both endpoints answer a dormant `503` and do nothing — no scheduling happens. Set it to turn scheduling on, then call either endpoint with `Authorization: Bearer <CRON_SECRET>` (see `.github/workflows/weekly-review.yml.example` and `check-alerts.yml.example`). If it's set but shorter than 16 characters, the app logs a warning at startup (not a hard failure — this only weakens an optional feature) — generate it the same way as `BETTER_AUTH_SECRET`.
- [ ] `RESEND_API_KEY` / `RESEND_FROM` — turn on the optional weekly-review email, sent to a user's own address each time their weekly review finishes. Leave either blank and nothing changes — no network call is ever made. `/api/health`'s `email` field reports `"configured"` or `"dormant"`.
- [ ] `PRIVACY_CONTACT_EMAIL` — the address shown as a mailto link on `/privacy` and `/terms` for questions. Leave it unset and the pages show the owner's own address (`naeljam@hotmail.com`); set it to route those questions to a different inbox.

## Data rights (built in — nothing to set up)
- **Download my data**: any signed-in user can download a complete JSON export of everything the app stores about their account from Settings → "Your data" (`GET /api/account/export`, rate-limited to 5/hour per user).
- **Delete my account**: Settings → "Danger" lets a user permanently delete their account (password-confirmed, rate-limited like sign-in). The database's `ON DELETE CASCADE` wipes every dependent row — sessions, portfolios, transactions, theses, alerts, notifications, AI analyses — in the same operation.
- **Privacy policy and terms**: `/privacy` and `/terms` are public pages, linked from the sign-in/sign-up pages and the footer of every authenticated page. Both are honest templates pending a professional legal review — see the note on each page about when that review happens (once the app makes money).

## Payments
- Payments: none.

## Backups & recovery (engineering-standards.md §8)
- [ ] **Turn on automatic backups at the hosting/database provider** before real users' data exists there, and confirm it's actually on from the provider's dashboard — don't assume a database has backups by default.
- [ ] **Restore-test at least one backup into a scratch database** before launch, and on an ongoing cadence after ("restore-tested" is considered to expire after 90 days). In plain English: (1) take or use the most recent automatic backup, (2) restore it into a NEW, throwaway database — never over the live one, (3) check that a few crown-jewel tables came back correctly (`user`, `Portfolio`, `Transaction`), (4) delete the scratch database when done. This is a host/owner action, not something the code does automatically.
- [ ] **`/data`-style uploads** — this app doesn't currently store uploaded files outside the database, so there is no separate single-copy-file risk to document yet.

## Security note
No committed secrets; login and per-user data scoping are sound. Audit item **B3 is now fixed**: the seed no longer has a hardcoded demo password — it reads `SEED_DEMO_PASSWORD` and refuses to create the demo login unless you set a strong value (≥12 chars), so a guessable public account can't slip through. Sign-ups are now closed by default (they only open when `ALLOW_SIGNUPS="true"` is set) — your step is just making sure the live environment doesn't set it. In production, the app also now refuses to start at all with a missing or short `BETTER_AUTH_SECRET` (see above) — a second, automatic check on top of remembering to set it correctly.
