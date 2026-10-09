# InvestIQ AI — Conventions

Every agent and developer working in this repo reads this file first.
Its rules override habits from other projects.

## THE GOLDEN RULE

never display or store a fabricated number — every displayed figure carries a source badge (live / manual as of date / sample data), and when a data source is unavailable the code returns a typed "unavailable" result instead of fake data.

In practice:

- Provider and cache functions return `DataResult<T>` — either `{ ok: true, data }` or `{ ok: false, unavailable: <reason> }`. Never invent a fallback value.
- Currency conversion returns a typed "missing rate" result when no FX rate exists. Never silently multiply by 1.0.
- Portfolio totals report what could NOT be valued (`complete: false` + a `missing` list). The UI must say so, not pad the number.
- Source badges: `live` (fetched from FMP), `manual` (entered by hand, shown with its as-of date), `sample` (seeded demo data). Figures computed purely from the user's own transactions carry `derived` (no external source involved).

## Project structure

- Next.js App Router, TypeScript strict, `src/` directory, `@/*` import alias.
- `src/app/` — routes. API routes in `src/app/api/`. Keep pages thin; logic lives in `src/lib/`.
- `src/lib/auth.ts` / `auth-client.ts` / `prisma.ts` — the auth server instance, the Better Auth React client, and the Prisma singleton. Import these; never create new instances.
- `src/lib/data/` — the market-data layer (see caching rule below).
- `src/lib/portfolio/` — pure portfolio math functions (no I/O; testable without a database).
- `src/proxy.ts` — route protection. Note: Next.js 16 renamed "middleware" to "proxy"; this file plays that role. Public routes: `/` (the welcome page — exact match only; signed-in visitors are sent on to `/dashboard`), `/sign-in`, `/sign-up`, `/check-email`, `/verify-email`, `/forgot-password`, `/reset-password`, `/privacy`, `/terms`, `/s/*` (the public stock pages), `/api/auth`, `/api/health`, `/api/cron` (the cron endpoints check `CRON_SECRET` instead of a session), and the EXACT paths `/api/billing/webhook` (Stripe's signature is its authentication; nothing else under `/api/billing` is public), `/sitemap.xml` and `/robots.txt`. The list lives in `src/lib/public-paths.ts`. Everything else requires a session cookie. **Public pages never show user data or unlicensed prices:** `/s/<MARKET>/<TICKER>` exists only for the owner's short list in `src/lib/public-catalogue.ts` (kept in sync by `npm run catalogue:sync`), shows no user data, AI output or typed-in price, and shows a stored vendor price only when `isPublicDisplayAllowed` says yes (off by default, so "Sign in to see prices" everywhere at launch). The proxy limits anonymous visitors on these paths (60 pages / 10 sitemap-or-robots a minute, in memory, no cookie).
- `/sign-up` is OPEN by default. `SIGNUPS_PAUSED="true"` is the off-switch: the page shows "New sign-ups are paused right now" and the server (the auth route wrapper) refuses sign-up attempts, while existing people can still sign in, reset and confirm. Email is required in production: when `RESEND_API_KEY`/`RESEND_FROM` aren't set there, sign-ups are refused as "unavailable"; when email is set up, a new account must confirm its email before it can sign in. `getSignUpStatus()` in `src/lib/auth.ts` is the one source for all of this — the sign-up page, the landing page, the server gate and `/api/health` all read it. Account emails never pretend: the screens show "couldn't send" when a send failed.
- `tests/unit/` — Vitest unit tests (run by `npm run test`, no database needed).
- `tests/e2e/` — Playwright smoke tests (run by `npm run test:e2e` only, never part of `npm run test`).
- `prisma/` — schema, numbered migrations, seed script.
- shadcn/ui is initialised (`components.json`, neutral base color). Add components into `src/components/ui/` following shadcn's layout.

Naming: files kebab-case (`market-data.ts`), types/components PascalCase, functions camelCase. Plain-English comments; the owner is not a developer.

## Data-provider + caching rule

- Callers NEVER hit Financial Modeling Prep directly. All market data goes through `src/lib/data/market-data.ts` (`getQuote`, `getProfile`, `getFinancialStatements`, `getDividendHistory`, `getUpcomingDividends`, `getPriceHistory`).
- Quote reads go through the `PriceCache` table with a **15-minute TTL**. Fundamentals reads go through `FundamentalsCache` with a **7-day TTL**. The TTL logic is the pure function `isCacheFresh` in `src/lib/data/cache.ts`.
- Provider routing (`resolveProviderName`, in order): US-market instrument + `FMP_API_KEY` set → FMP; a market that is in the Twelve Data table (`src/lib/data/provider-info.ts`: TADAWUL, ADX, QSE, DFM) **and** named in `TWELVE_DATA_MARKETS` (default `TADAWUL,ADX,QSE`; DFM only when named) **and** `TWELVE_DATA_API_KEY` set → Twelve Data; everything else → manual prices from `PriceCache`. **MSX and OTHER never route to any provider** (no vendor exists), and with no Twelve Data key routing is exactly what it was before it existed (the connection is dormant: no request is ever made). Twelve Data gives quotes only; its stocks' history comes from stored prices.
- Every `Quote` carries its true origin (`priceSource`) and, when served from the last stored copy because the provider did not answer, `fallback: true`. The source badge reads these to name the provider and how late the price is (`describePriceProvider`): Tadawul says "end of day" (never "Live"), a market with an unconfirmed delay says "delayed" with the price's own date and never a number of minutes. Only a market with a confirmed delay in the table may name minutes.
- The wrong-stock guard: a Twelve Data reply is used only when its exchange and currency match the table and the price is a positive number; anything else is the typed unavailable result. The only thing the provider path writes to the shared `PriceCache` is a price labelled with the routed provider's own source (FMP or TWELVE_DATA). A user's typed-in price stays in the per-user table and never touches it.
- `isPublicDisplayAllowed(priceSource)` is the one check for showing a vendor price on a signed-out page. It answers **no** by default (yes only with the matching `*_PUBLIC_DISPLAY_LICENSED="true"`; always no for MANUAL and SEED).
- When the routed provider is unreachable, the layer serves the newest stored price with its honest badge and as-of date — or the typed unavailable result if nothing is stored.
- Never log or return `FMP_API_KEY`, `TWELVE_DATA_API_KEY` (or any secret). Error messages must not contain request URLs or the text of a thrown error (both can carry the key). `TWELVE_DATA_BASE_URL` (a developer-only test server) is ignored when `NODE_ENV` is `production`.

## Database rules

- Schema changes ONLY via `npx prisma migrate dev` — numbered migrations in `prisma/migrations/`. Never `db push`, never hand-edited SQL outside a migration.
- Money and quantities are `Decimal` columns. Convert to numbers at the edge with the `fromPrisma*` adapters in `src/lib/portfolio/types.ts`.
- A portfolio's cash balance is DERIVED from transactions (`computeCashBalances`) and never stored.
- A BUY or SELL must be in the tracked stock's own stored currency: the server (`createTransaction`, `updateTransaction`, and file-import row checks) refuses a mismatch with a plain-English message (`src/lib/instrument-currency.ts`), and the Add Transaction dialog shows the same sentence before Save.
- `logger.error` also raises a Sentry alert when `SENTRY_DSN` is set (secret-named values blanked first), so handled failures (webhook, broker sync, Sharia refresh) are not silent.
- Every query for user-owned data (portfolios, transactions, watchlist) is scoped to the signed-in user's id, taken from the server session (`auth.api.getSession`) — never from client input.

## AI rules (Phase 3+)

- **Persist, never regenerate on view.** AI outputs are persisted in `AiAnalysis` and never
  regenerated on page view. A page shows the stored analysis with its `dataAsOf` date;
  generating a new one is an explicit user action (or scheduled job), never a side effect of
  rendering. The engine (`src/lib/ai/analysis.ts`, `runAnalysis`) enforces this by reusing any
  stored row whose input hash still matches instead of calling the API again.
- **AI numbers carry no `SourceBadge`.** A `SourceBadge` states where a fetched/entered figure
  came from; an AI judgment isn't one of those, so it never wears one. Instead every `AiPanel`
  shows a fixed caption — "Analysis from {date} · {model} · based on data as of {dataAsOf}" —
  which is the AI-specific equivalent of the golden rule: it always says when the analysis ran,
  which model produced it, and how fresh the data behind it was.
- **`AiDisclaimer` on every AI surface.** Any screen that shows a persisted `AiAnalysis` result
  shows the exact line "AI-generated research for education only, not a personal recommendation. It doesn't know your full finances and can be wrong. InvestIQ is not licensed to give investment advice in Oman, Saudi Arabia, the US or elsewhere."
  — never paraphrased per-screen (decision: `docs/decisions/advice-wording.md`).
- **AI spend caps.** Three limits, checked in this order — the first that fails wins
  (`src/lib/ai/spend-cap.ts`, limits in `src/lib/plans.ts`): (1) app-wide, new analyses
  today across all users must stay under `GLOBAL_AI_DAILY_CAP` (default 100; `0` pauses AI
  for everyone); (2) per-user daily, Free 2 / Pro 10; (3) Pro monthly, 150. Days and months are
  UTC. One persisted `AiAnalysis` row is one unit, however many model calls produced it (a
  Committee run makes several calls but saves one row). Generations still running count as if
  already saved (in-flight reservations), so simultaneous clicks cannot slip past a cap.
  Reusing a stored analysis by input hash is free and never reaches the cap. Scheduled weekly
  reviews count like any other analysis. A refusal is a typed result carrying a reason and a
  plain-English message (what happened, when it resets, that existing analyses are still
  available) — never a silent failure.
- **No key → `ConnectKeyNotice`, honest and first-class — but stored results still show.**
  When `ANTHROPIC_API_KEY` is unset, every AI *trigger* is switched off: the button renders
  disabled (or is hidden where there is nothing stored to act on), and the `ConnectKeyNotice`
  component explains why. An analysis that is already saved in the database keeps rendering
  in full, with its usual caption ("Analysis from … · model · data as of …") and
  `AiDisclaimer` — hiding real saved results behind the notice would be the opposite of the
  golden rule. Only when a surface has **no stored result and no key** does the notice take
  over the content area on its own (that is also the whole-page pattern for an AI-only page
  with nothing stored). This is never rendered as an error — it's a normal, first-class state.
- **The key is never logged or returned.** `ANTHROPIC_API_KEY` is read once in
  `src/lib/ai/client.ts` and handed to the SDK; it is never written to a log line, an error
  message, or a response body. The shared logger (`src/lib/logger.ts`) also redacts any context
  value whose key name looks like a secret, as a second line of defense.

## Alert honesty rule (Phase 7)

- **An alert never fires on sample data.** `evaluatePriceAlert` in
  `src/lib/alerts/evaluate.ts` refuses to fire whenever the received quote's
  source is `sample` — no matter how far past the threshold the seeded price
  sits — and records an honest outcome instead ("Not checked — only sample
  data is available for this stock."). This is the golden rule applied to
  alerts specifically: a `Notification`'s `priceSource` can only ever be
  `FMP`, `TWELVE_DATA` or `MANUAL`, never `SEED`, because a sample-sourced quote can never
  reach the code path that writes one. A `DAY_DROP` alert with no previous
  closing price on record is the same story — it stays honestly "not
  checked" rather than guessing a drop percentage. This is why the seeded
  demo alert ships `PAUSED`: an `ACTIVE` alert on seed-only data would just
  sit forever saying "not checked," which is honest but not a useful demo
  state.

## Importing trades: broker presets and no double imports

- The import screen starts with "Which broker?". Pick a broker preset (`src/lib/import-presets/`, pure code, one file per broker) or "Other" (the column-by-column mapping). The broker file is read in the browser; only the interpreted rows reach the server.
- **A preset never guesses a row.** Each row is ready, skipped with a plain reason (split, option, unsupported currency, unrecognised word) or cannot-read. Skipped rows never leave the browser and are never stored. A file from the wrong broker is refused.
- **Every imported row can carry an `importReference`** (`Transaction.importReference`, optional, not unique): `<preset>:<broker id>` or a fingerprint (`fingerprintRow` in `src/lib/import-rows.ts` for "Other"). `getKnownImportReferences` lets the screen show repeats as "Already imported"; `importTransactions` re-checks inside the portfolio lock and leaves out repeats (counted in `alreadyImportedCount`, not an error). Hand-typed rows and rows imported before this feature have no reference and cannot be recognised.
- The server still re-validates every row (shared schema, future dates, oversell) whatever the browser says. The reference is personal financial data: it is in the "Your data" download and on `/privacy`.

## Broker connection (read-only Interactive Brokers sync, Step 4b)

- **Read-only, trades only.** `src/lib/broker/` can check a token and download a report; the provider type (`types.ts`) has no operation that changes anything at the broker, and the client (`ibkr-flex/client.ts`) can only call IBKR's two Flex report addresses. Only buys and sells come in; every row is read by the Step 4a IBKR preset and committed through `src/lib/import-commit.ts` (the one shared validate-lock-oversell-write path, also used by the file import). Rows are tagged `syncedFrom` / `syncRunId` ("From broker"), never changed or hidden, and the tag outlives a disconnect. Manual "Sync now" only; no scheduler.
- **Golden rule at work.** A sync adds all its new rows or none. An unrecognised report layout, an untracked ticker, an unreadable row or a sell with no buy in range fails the run with a plain message and adds nothing. Nothing is guessed, converted or created. The synced import reference is exactly what the file preset gives the same row, so a file import and a sync never double-count in either order.
- **Dormant without `BROKER_TOKEN_KEY`.** `isBrokerConnectionEnabled()` is true only for a valid 32-byte key (base64 or 64 hex). Unset or malformed: Settings shows the honest notice, no form, no request to IBKR. Disconnect always works. `PLAN_FEATURES` keeps `broker-connection` as `coming_soon` until the owner flips it after setting the key.
- **The token is secret.** AES-256-GCM in `src/lib/broker/crypto.ts` (the only file that reads `BROKER_TOKEN_KEY`; never the sign-in secret), bound to the user id, so a copied ciphertext fails. Every read leaves the token out except the sync service's `getConnection`. It is never logged, returned, put in an error message, shown after submit, or exported (the "Your data" download carries connection details and sync history only). IBKR's design puts the token in the request address, so the client never puts an address, query string or reply text in an error or log; the base address is a constant (`IBKR_FLEX_BASE_URL` is a test stand-in, ignored in production) and IBKR's own reply address is ignored. Disconnect deletes the row, and the token with it.
- **Server-side gates and limits.** Connect and sync call `requirePro` (typed `PRO_REQUIRED`); every query is filtered by the session user id; connect 5/hour and sync 6/hour per user, a 60-second cooldown, a one-sync-at-a-time claim in the database, at most 5 syncs in flight per server.
- **Testing never touches IBKR.** Unit tests use `tests/support/fake-ibkr-flex-server.ts` and hand-written fixtures in `tests/fixtures/ibkr-flex/` (shaped from IBKR's documented format, not recorded from a live account). `npm run dev:fake-ibkr` starts the pretend server for clicking through the app (token `FAKE-TOKEN-OK`).

## Sharia screen (Step 5, optional Pro badge)

- **A verdict is bought, never computed or guessed.** Compliant / Not compliant come only from the supplier (Musaffa today, behind the `ShariaVendor` seam in `src/lib/sharia/vendor.ts`). There is no ratio function and no fallback source; a test forbids one. "Not screened" is the only fallback, and it is never stored. Anything the supplier says outside Compliant / Not compliant (e.g. "questionable") is "Not screened". The supplier's own ratios are stored but never shown.
- **One display rule.** `resolveShariaDisplay` (`src/lib/sharia/display.ts`, pure) is the only code that may turn a stored row into a verdict. In order: no key or unknown `SHARIA_VENDOR` -> Not screened; exchange not in `coverage.ts` -> Not screened; no row from the active supplier (or no method name) -> Not screened; data date more than 100 whole UTC days old (exactly 100 still shows) or in the future -> Not screened; else exactly as stored.
- **No `SourceBadge`.** A verdict is not one of the four number sources. The badge's panel carries its own line: method name, supplier, "as of" date, "Fetched ..." date, and the fixed "automated screen, not a religious ruling (fatwa)" sentence. Every sentence lives in `src/lib/sharia/wording.ts`. Never "halal"/"haram".
- **Dormant without `MUSAFFA_API_KEY`.** The key is read in one place (`src/lib/sharia/musaffa.ts`), never logged or returned. No key: badges say "Not screened", `POST /api/cron/sharia-refresh` answers 503 dormant (after the `CRON_SECRET` check), no outside call is ever made. Every field mapping in the adapter is marked `UNVERIFIED AGAINST THE REAL API` until the owner has the key and docs.
- **Off by default, Pro only.** `User.shariaScreenEnabled` (personal data: in `/privacy` and the data download). Turning ON needs `requirePro` on the server; turning OFF is always allowed. With the switch off, or a lapsed Pro, `getShariaBadgeData` returns nothing and the verdict table is not queried. Verdicts (`ShariaScreen`) are shared reference data: the read takes no user id; it is not exported.
- **Refresh.** Daily cron (<=500 stocks, <=5 at once, 10 s timeout, no retry, covered exchanges only, stops on rate-limit/auth failure; a "no verdict" deletes the stored row, a failed call keeps it). Switching ON also starts one background fetch of the person's own stocks without a usable verdict (<=25, `SHARIA_REFRESH_RATE_LIMIT` 3 an hour). Page views never call the supplier.
- **Never on public pages or in AI.** `/s/*` and every AI prompt must not show or be told a verdict (a test checks the folders). `PLAN_FEATURES` keeps `sharia-badge` as `coming_soon` until the owner has the key and written display permission.

## Privacy page stays in sync (Phase 8)

- **Any diff that stores a NEW personal field updates `/privacy` in the same
  diff.** `src/app/privacy/page.tsx` is written against exactly what
  `prisma/schema.prisma` stores — a schema change that adds a personal field
  without touching that page is an incomplete diff, not a follow-up.
- Both `/privacy` and `/terms` show a contact address as a mailto link, read
  server-side by `getLegalContactEmail` in `src/lib/legal-contact.ts` from the
  optional env var `PRIVACY_CONTACT_EMAIL` (default: the owner's address,
  `naeljam@hotmail.com`). Never hardcode a contact address in a page.
- Data rights live in Settings: "Your data" (download everything, one JSON
  file, `src/lib/account-export.ts`) and "Danger" (delete my account,
  password-confirmed, rate-limited like sign-in, wipes everything via the
  database's `ON DELETE CASCADE`).

## Plans and billing

- **Where plans live.** The two plans (Free, Pro), their limits, prices and feature list are in `src/lib/plans.ts` (pure data). Who is on Pro is decided in `src/lib/plan-access.ts`: `resolveEffectivePlan` turns the stored `User.plan` plus any subscription into the plan the app actually uses (owner-granted Pro without a Stripe subscription stays Pro; a real subscription is Pro while active/trialing/past due, with a short grace for a late renewal message, or until a cancelled period ends; everything else is Free).
- **Gates are enforced on the server.** Pro-only actions (committee, thesis check, weekly review, review alerts) call `requirePro` and return a typed `PRO_REQUIRED` refusal. Hiding a button is never the protection — the notice is only the explanation.
- **Billing is dormant by default.** It is on only with `BILLING_ENABLED="true"` and all four Stripe values (`getBillingMode` in `src/lib/billing/config.ts`); a live key outside production counts as off. While dormant: the webhook answers 503, the Stripe SDK is never built, and no upgrade UI is shown (screens say Pro is "coming soon").
- **The webhook** (`/api/billing/webhook`, the only public billing path) verifies Stripe's signature before anything else, then records each event id in `BillingEvent` so a repeated delivery is applied once.
- **Who may change a plan.** Only the verified webhook, or the owner's `npm run plan:set` command. Never a client request or a page view.
- **Downgrading never hides saved work.** A Free user keeps seeing every stored committee, thesis check and review with its usual caption and `AiDisclaimer`; only the generate button is replaced by the Pro notice (covered by `tests/unit/downgraded-user-render.test.ts`).
- **Stripe secrets** (`STRIPE_SECRET_KEY`, `STRIPE_PRICE_*`) are read only inside `src/lib/billing/*`; the webhook route passes `STRIPE_WEBHOOK_SECRET` straight into that code. Never log or return them.

## VERIFY RECIPE

Run these in order from the repo root; all must pass before reporting work as done:

```
pg_ctlcluster 16 main start
npm install
npx prisma migrate deploy
npx prisma db seed
npm run lint
npm run typecheck
npm run build
npm run test
```

**Pre-push check.** Every `git push` first runs `npm run verify` through `.husky/pre-push`, installed by `npm install`: `npx prisma migrate deploy` (applies any new migrations to the database in `.env` — it never resets or wipes one), `prisma generate`, then lint, type check, build and tests. It stops straight away with a plain message if local Postgres isn't running, and takes about half a minute to a minute. Seeding is left out. In an emergency, `git push --no-verify` skips it.

**GitHub check.** `.github/workflows/verify.yml` runs the same steps as `npm run verify` on every pull request and every push to main: a throwaway Postgres 16 database, a freshly generated CI-only sign-in secret (no real keys), `npx prisma migrate deploy`, then lint, type check, build and tests. Seeding and the browser tests are left out, as they are locally. Cost: GitHub Actions is free here. The repo is meant to be private, and a private repo on GitHub's free plan gets 2,000 free minutes a month (one run takes a few minutes); while it is public, minutes are unlimited. A newer push to the same branch cancels the older run, which saves minutes.

(Optional extra: `npm run test:e2e` runs the Playwright smoke tests against a dev server; browsers are preinstalled — never run `playwright install`.)
