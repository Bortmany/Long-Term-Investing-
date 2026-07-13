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
- `/sign-up` allows public self-registration. Acceptable for local use only — it must be disabled or gated before any non-local deployment (Phase 2 item).
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

## AI rule

AI outputs are persisted in `AiAnalysis` and NEVER regenerated on page view. A page shows the stored analysis with its `createdAt`/`model`/`dataAsOf`; generating a new one only happens from an explicit user action (a button click via a server action, or a scheduled job) — never as a side effect of rendering or of a Server Component's data-fetching.

In practice (`src/lib/ai/`):

- `runAnalysis({ type, subjectType, subjectId, model, buildInput, schema })` (`src/lib/ai/analysis.ts`) is the one engine every phase calls. It stable-stringifies (sorted keys) and SHA-256-hashes the built input into an `inputHash`; a stored `AiAnalysis` row matching `{type, subjectType, subjectId, inputHash}` is reused as-is — **zero API calls** — after re-validating its stored output against the zod schema. Only a genuinely new input triggers a new model call.
- No `ANTHROPIC_API_KEY` (`src/lib/ai/client.ts`, `hasAnthropicKey()`/`createAiClient()`) → a typed `{ok:false, unavailable:"no_api_key"}` result, same `DataResult` pattern as the market-data layer. Never throw, never fabricate a client, never fabricate an analysis.
- A failed generation (network error, or output that fails schema validation) returns a typed failure and persists nothing — the UI shows "Analysis failed", never a fake or partial result.
- `AiPanel` (`src/components/ai-panel.tsx`) is the one container every persisted result renders through, with `ConnectKeyNotice` (`src/components/connect-key-notice.tsx`) as the fixed "AI is off" state and `AiDisclaimer` (`src/components/ai-disclaimer.tsx`) in its footer. Never paraphrase either component's copy.

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
