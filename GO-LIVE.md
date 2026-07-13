# Go-Live checklist — InvestIQ (Long-Term-Investing-)

Plain-English list of what to set up before this goes public. Full context lives in the central `Agents/docs/go-live-and-security-audit.md`.

## Must do before launch
- [ ] **Pick a host** — there is no deploy config committed yet (no Railway/Vercel file). Decide where it runs.
- [ ] **Postgres database** → set `DATABASE_URL`.
- [ ] **Generate `BETTER_AUTH_SECRET`** (the `.env.example` shows the command). Do not leave it blank.
- [ ] **Set `BETTER_AUTH_URL`** to the real public web address.
- [ ] **Turn signups OFF:** set `ALLOW_SIGNUPS="false"`. It defaults to open — anyone could register otherwise.
- [ ] **Delete or change the demo login** `owner@example.com` / `investiq-demo` (it's documented publicly).

## Optional
- [ ] `FMP_API_KEY` — free Financial Modeling Prep key for live US stock prices (without it, prices are manual/sample, clearly labelled).
- [ ] `ANTHROPIC_API_KEY` — listed for a future phase; **not used by any code yet**, so nothing to set up now.

## Payments / email
- None. This app has no payment or email features.

## Security note
No committed secrets; login and per-user data scoping are sound. The two go-live gotchas above (signups + demo account) are the only real exposure.
