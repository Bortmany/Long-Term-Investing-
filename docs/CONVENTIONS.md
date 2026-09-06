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
- `src/proxy.ts` — route protection. Note: Next.js 16 renamed "middleware" to "proxy"; this file plays that role. Public routes: `/sign-in`, `/sign-up`, `/api/auth`, `/api/health`. Everything else requires a session cookie.
- `/sign-up` is CLOSED by default: the page shows a "registration is closed" message and the server rejects sign-up attempts unless `ALLOW_SIGNUPS="true"` is set (needed briefly when seeding a fresh database — remove it afterwards). The app is invitation-only; a live deployment must never set it.
- `tests/unit/` — Vitest unit tests (run by `npm run test`, no database needed).
- `tests/e2e/` — Playwright smoke tests (run by `npm run test:e2e` only, never part of `npm run test`).
- `prisma/` — schema, numbered migrations, seed script.
- shadcn/ui is initialised (`components.json`, neutral base color). Add components into `src/components/ui/` following shadcn's layout.

Naming: files kebab-case (`market-data.ts`), types/components PascalCase, functions camelCase. Plain-English comments; the owner is not a developer.

## Data-provider + caching rule

- Callers NEVER hit Financial Modeling Prep directly. All market data goes through `src/lib/data/market-data.ts` (`getQuote`, `getProfile`, `getFinancialStatements`, `getDividendHistory`, `getUpcomingDividends`, `getPriceHistory`).
- Quote reads go through the `PriceCache` table with a **15-minute TTL**. Fundamentals reads go through `FundamentalsCache` with a **7-day TTL**. The TTL logic is the pure function `isCacheFresh` in `src/lib/data/cache.ts`.
- Provider routing (`resolveProviderName`): US-market instrument + `FMP_API_KEY` set → FMP; everything else (MSX, TADAWUL, DFM, OTHER, or no key) → manual prices from `PriceCache`.
- When FMP is unreachable, the layer serves the newest stored price with its honest badge and as-of date — or the typed unavailable result if nothing is stored.
- Never log or return `FMP_API_KEY` (or any secret). Error messages must not contain request URLs (they carry the key).

## Database rules

- Schema changes ONLY via `npx prisma migrate dev` — numbered migrations in `prisma/migrations/`. Never `db push`, never hand-edited SQL outside a migration.
- Money and quantities are `Decimal` columns. Convert to numbers at the edge with the `fromPrisma*` adapters in `src/lib/portfolio/types.ts`.
- A portfolio's cash balance is DERIVED from transactions (`computeCashBalances`) and never stored.
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
  shows the exact line "This is analysis to support your own decision, not financial advice."
  — never paraphrased per-screen.
- **Daily spend cap.** Each user may generate at most `DAILY_AI_ANALYSIS_LIMIT` (25) new
  `AiAnalysis` rows per UTC day (`src/lib/ai/spend-cap.ts`). One persisted row is one unit
  against the cap, regardless of how many model calls produced it (e.g. a Committee run makes
  several API calls but persists one row). Reusing a stored analysis by input hash never counts
  against the cap. A refusal is a typed result with a plain-English message: what happened, when
  it resets, and that existing analyses are still available — never a silent failure.
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
  `FMP` or `MANUAL`, never `SEED`, because a sample-sourced quote can never
  reach the code path that writes one. A `DAY_DROP` alert with no previous
  closing price on record is the same story — it stays honestly "not
  checked" rather than guessing a drop percentage. This is why the seeded
  demo alert ships `PAUSED`: an `ACTIVE` alert on seed-only data would just
  sit forever saying "not checked," which is honest but not a useful demo
  state.

## Privacy page stays in sync (Phase 8)

- **Any diff that stores a NEW personal field updates `/privacy` in the same
  diff.** `src/app/privacy/page.tsx` is written against exactly what
  `prisma/schema.prisma` stores — a schema change that adds a personal field
  without touching that page is an incomplete diff, not a follow-up.
- Data rights live in Settings: "Your data" (download everything, one JSON
  file, `src/lib/account-export.ts`) and "Danger" (delete my account,
  password-confirmed, rate-limited like sign-in, wipes everything via the
  database's `ON DELETE CASCADE`).

## VERIFY RECIPE

Run these in order from the repo root; all must pass before reporting work as done:

```
pg_ctlcluster 16 main start
npm install
npx prisma migrate dev
npx prisma db seed
npm run lint
npm run typecheck
npm run build
npm run test
```

(Optional extra: `npm run test:e2e` runs the Playwright smoke tests against a dev server; browsers are preinstalled — never run `playwright install`.)
