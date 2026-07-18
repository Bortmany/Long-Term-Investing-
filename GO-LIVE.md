# Go-Live checklist — InvestIQ (Long-Term-Investing-)

Plain-English list of what to set up before this goes public. Full context lives in the central `Agents/docs/go-live-and-security-audit.md`.

## Must do before launch
- [ ] **Pick a host** — there is no deploy config committed yet (no Railway/Vercel file). Decide where it runs.
- [ ] **Postgres database** → set `DATABASE_URL`.
- [ ] **Generate `BETTER_AUTH_SECRET`** (the `.env.example` shows the command). Do not leave it blank.
- [ ] **Set `BETTER_AUTH_URL`** to the real public web address.
- [ ] **Check signups stay OFF:** sign-ups are closed by default — they only open when `ALLOW_SIGNUPS="true"` is set. Make sure the live environment does NOT set it to `"true"` (seeding a fresh database needs it set temporarily; remove it right after).
- [ ] **Database connections:** if the host runs several copies of the app (serverless functions or more than one instance), add a connection cap to `DATABASE_URL` so Prisma doesn't open more Postgres connections than the database allows — e.g. `postgresql://...../investiq?connection_limit=5`. One always-on instance doesn't need this.
- [ ] **Delete or change the demo login** `owner@example.com` / `investiq-demo` (it's documented publicly).

## Optional
- [ ] `FMP_API_KEY` — free Financial Modeling Prep key for live US stock prices (without it, prices are manual/sample, clearly labelled).
- [ ] `ANTHROPIC_API_KEY` — listed for a future phase; **not used by any code yet**, so nothing to set up now.

## Payments / email
- None. This app has no payment or email features.

## Security note
No committed secrets; login and per-user data scoping are sound. Audit item **B3 is now fixed**: the seed no longer has a hardcoded demo password — it reads `SEED_DEMO_PASSWORD` and refuses to create the demo login unless you set a strong value (≥12 chars), so a guessable public account can't slip through. Sign-ups are now closed by default (they only open when `ALLOW_SIGNUPS="true"` is set) — your step is just making sure the live environment doesn't set it.
