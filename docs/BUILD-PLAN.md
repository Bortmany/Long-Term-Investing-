# InvestIQ AI — Build plan for Phases 2–6 (owner-approved)

> **For any session resuming this work:** read STATUS below first, then the plan. The screen designs
> for everything here are in `docs/design/ui-spec-phases-2-6.md` (its §2 shared foundation is already
> built). House rules + verify recipe: `docs/CONVENTIONS.md`. Build with the Agents-repo pipeline
> (dev-lead → builders → verifier → code-reviewer, bounded fix loop max 2), commit + push after each
> phase on branch `claude/investiq-next-phases-oulgfj`. Demo login: `owner@example.com` with the
> password from `SEED_DEMO_PASSWORD` in `.env` (the old fixed demo password is refused by the seed).

## STATUS (as of 2026-07-19)

- **Phase 1 — DONE, pushed** (commit `b7d6f02`): foundation, schema, auth, dashboard, data layer, portfolio math, seed, tests.
- **Phase 2 — DONE (Waves 1 + 2), verified and reviewed.** All three screen chunks are built: the
  `/portfolio` page (holdings + transactions with filters, Add/Edit Transaction dialog, delete
  confirm, Update Price dialog, inline new-instrument with FMP prefill, sell-analysis link), the
  `/portfolio/import` 4-step CSV wizard + `/settings` page, and the dashboard additions (return
  cards, three allocation donuts, dividend module). Full verify recipe green (lint, typecheck,
  build, 90 unit tests, 4 e2e tests), code-reviewed (dry-run import action gained the same rate
  limit + row cap as the real import).
  - Built — shared UI foundation: `SourceBadge` variant `derived` + fixed `badgePropsForValueSource(s)` precedence (sample > manual(oldest asOf) > live > derived); new dependency-free primitives `dialog.tsx`, `select.tsx`, `tabs.tsx`, `textarea.tsx`, `dropdown-menu.tsx`; `Alert` variant `success`; `EmptyState` `action?` prop; `format.ts` gained `formatPercent`, `formatIsoWeek`.
  - Built — server/lib layer: `src/lib/action-result.ts` (`ActionResult<T>`); `src/lib/transaction-schema.ts` (zod v4 discriminated union; BUY/SELL never accept a client amount — server derives `amount = qty×price`, fee stays in its own column); server actions `src/app/actions/{transactions,instruments,prices,import-transactions,settings}.ts` (all session-scoped, revalidate /portfolio + /dashboard); CSV parser `src/lib/csv.ts` + row validation `src/lib/import-rows.ts` + `public/sample-transactions.csv`; portfolio math `computeReturns`, `computeAllocation`, `computeMonthlyDividends`, `computeDividendsByHolding`; data-layer FX `getFxRate`/`refreshFxRates` (daily TTL, honest badges); sign-up gating via `ALLOW_SIGNUPS` (docs in README/.env.example); seed gained JNJ + a WatchlistItem; `src/lib/user-portfolio.ts` (find-or-create portfolio helper). `src/components/portfolio/types.ts` exists (a Wave-2 builder's first file — harmless, typechecks).
  - **NOT built (next session starts here)** — the three Wave-2 screen chunks, per ui-spec-phases-2-6.md: (a) `/portfolio` page: holdings + transactions tables with filters, Add/Edit Transaction dialog (type-dependent fields), delete confirm, Update Price dialog (manual GCC pricing), inline new-instrument with FMP prefill, sell-analysis link to `/committee?instrument=<id>&mode=sell`, plus an e2e test (add transaction → dashboard total changes); (b) `/portfolio/import` 4-step CSV wizard + `/settings` page (base currency, FX rates table + add + gated Refresh-from-FMP) + mark Phase 2 in ROADMAP; (c) dashboard additions: return cards (with/without dividends), three allocation donuts (spec palette, Unknown last), dividend module (T12M bar chart, income by holding, upcoming dividends with honest unavailable states). Then verifier (full recipe incl. e2e) + code-reviewer + fix loop, commit, push.
- **Phase 3 — DONE, verified and reviewed.** The user-scoping migration (Thesis, AiAnalysis and
  WeeklyReview now belong to a user, with cascading delete), the AI engine in `src/lib/ai/`
  (reuse-by-hash, daily spend cap of 25 analyses per user, typed no-key states, injectable client),
  the shared AI components (`ai-panel`, `ai-disclaimer`, `connect-key-notice`, `evidence-list`),
  the `/stocks` list + `/stocks/[id]` detail pages (profile, price chart, statements, honest
  per-ratio strip, dividends, investment score panel, news placeholder), and the Portfolio Health
  Score (dashboard card + portfolio section, pure pre-compute in `health-inputs.ts`). 151 unit
  tests green, full recipe + e2e green, code-reviewed clean on all priorities.
- **Phases 4–6 — NOT started.** Full specs below.
- **Keys:** the owner will supply `FMP_API_KEY` and `ANTHROPIC_API_KEY` **at the end** — build everything against injectable mocks + honest "connect your key" states (the `DataResult.unavailable` pattern), then run the finale's live smoke.

## Cross-cutting decisions (owner-approved)

1. **AI layer** (Phase 3, reused by 4–6) — `src/lib/ai/`:
   - `client.ts` wrapping `@anthropic-ai/sdk` (the one new dependency). Models: `ANALYSIS_MODEL = "claude-sonnet-5"`, `FAST_MODEL = "claude-haiku-4-5"`. Missing key → typed `{ok:false, unavailable:"no_api_key"}`. Client injectable for tests.
   - `analysis.ts`: one `runAnalysis({type, subjectType, subjectId, model, buildInput, schema})` engine — stable-stringify + SHA-256 `inputHash`; matching stored `AiAnalysis` (type+subject+inputHash) is **reused; generation only from explicit user actions, never on render**; Messages API with structured outputs (`output_config: {format: {type:"json_schema", schema}}`) + prompt caching (`cache_control` on the shared analyst system prompt); persists `AiAnalysis` with `model`, `output`, `dataAsOf`; returns zod-validated output.
   - `prompts.ts` (shared analyst preamble: evidence/reasoning/confidence/risks/counterarguments, never speculation as fact) + `schemas.ts` (zod + JSON-schema per AiAnalysisType).
   - UI: `AiPanel` ("Analysis from ⟨date⟩ · ⟨model⟩ · based on data as of ⟨dataAsOf⟩" + Re-analyze), `AiDisclaimer` ("This is analysis to support your own decision, not financial advice."), `ConnectKeyNotice` — all specced in ui-spec §2.
   - Tests: fake client + fixtures; assert reuse-by-hash, no-key path, schema-failure path.
2. **Batch API deferred**: weekly review uses the regular API (single-portfolio button flow; batch's 50% discount isn't worth polling infra). ROADMAP notes: adopt Batch when reviews are scheduled/multi-portfolio.
3. **`derived` badge fix** — DONE in Wave 1.
4. **Sign-up gating** — DONE in Wave 1 (`ALLOW_SIGNUPS`).
5. **Dependency policy**: only `@anthropic-ai/sdk` gets added. CSV parser is hand-rolled (done). Charts: recharts (installed), spec palette, tabular-nums.
6. **Execution**: one dev-lead run per phase; verifier (full CONVENTIONS recipe) + code-reviewer each phase; commit + push per phase.
7. **Docs**: mark each phase in `docs/ROADMAP.md`; CONVENTIONS gains the AI rules with Phase 3.

## Phase 2 — remainder
See STATUS "NOT built" above — that list is the complete remaining scope.

## Phase 3 — Stock pages + AI layer + Health Score
- AI layer per cross-cutting §1 (build first, with fixtures).
- `/stocks`: table of held + watched instruments (quote, change, badges, watchlist toggle).
- `/stocks/[id]`: profile header; price-history line chart (`getPriceHistory`; manual instruments chart from PriceCache history); 5y statements in income/balance/cash-flow tabs; ratio strip (each ratio individually unavailable when inputs missing); dividend section (history, yield, payout, 5y growth); "Generate investment score" AiPanel (`STOCK_SCORE`); news placeholder for Phase 6. Everything badged; every FMP block has its typed-unavailable state.
- Portfolio Health Score (dashboard card + /portfolio section): explicit generate → local pre-computation (allocation %, top-holding + sector HHI concentration, dividend metrics, cash %, FX exposure) → Sonnet → `{score 0-100, subscores{diversification, valuation, quality, concentration, dividendQuality, risk, cash}, strengths[], recommendations[](evidence+reasoning)}` → `AiAnalysis(HEALTH_SCORE)`.
- Tests: ai engine (mock client), ratio derivation, HHI math.

## Phase 4 — Thesis Tracker (the centerpiece)
- `/theses`: list (ACTIVE/CLOSED chips), create (instrument picker + statement), close/reopen.
- `/theses/[id]`: statement, instrument snapshot, integrity-score sparkline across checks, check-history timeline, "Check thesis now".
- Check action: snapshot = statement + current fundamentals/quote/dividends from the cached layer (works with whatever exists; output states data recency + gaps) → Sonnet `{integrityScore 0-100, recommendation INTACT|WEAKENING|BROKEN, evidence:{supporting[], weakening[], improving[]}, watchItems[], summary}` → `ThesisCheck` + `AiAnalysis(THESIS_CHECK)`.
- Seed: one ACTIVE thesis on MSFT. Tests: fixtures, enum mapping; e2e create-thesis.

## Phase 5 — AI Committee + Buy/Sell analysis
- `/committee`: instrument picker (honor `?instrument=&mode=` query params from the portfolio link) + optional position context; auto-attach ACTIVE thesis. "Convene committee" → 6 personas (value, growth, dividend, quality, macro, contrarian) as parallel Sonnet calls sharing the cached preamble, each `{recommendation BUY|HOLD|SELL, confidence 0-100, reasoning, evidence[], risks[], counterarguments[]}`; synthesis call → `{verdict, consensusScore 0-100 (start 50, move by vote×confidence; 0-34 SELL / 35-64 HOLD / 65-100 BUY), disagreements, wouldChangeVerdict[], thesisAssessment?}`. ONE `AiAnalysis(COMMITTEE)`. UI: verdict header, committee table, prominent disagreements panel, history per instrument.
- Buy analysis: form (ticker, intended price, horizon, risk tolerance, philosophy) → `BUY_ANALYSIS` `{score, fairValueEstimate{value, assumptions[]}, marginOfSafety, upside/downside, suggestedAllocationPct, confidence, alternatives[{ticker, why}]}`.
- Sell analysis (holdings action): `SELL_ANALYSIS` `{sellScore, reasons[], evidence[], counterarguments[], confidence}` — valuation excess, thesis broken (reads ThesisChecks), management/debt/profitability deterioration, better alternative, concentration.
- Tests: consensus scoring as a pure unit-tested function; fan-out with mock client (6+1 calls, one persisted row); no-key state.

## Phase 6 — Weekly Review + news intelligence
- `/reviews`: "Run weekly review" → snapshot = value/allocations now, deltas vs previous `WeeklyReview`, dividend events, latest health score/thesis checks/committee runs → Sonnet `{summary, newRisks[], improvedHoldings[], weakenedHoldings[], allocationDrift, suggestedActions[], behavioralNote}` → `WeeklyReview(period "2026-Wnn")` + `AiAnalysis(WEEKLY_REVIEW)`; list + detail of past reviews.
- News summaries (stock page + review digest): Haiku `NEWS_SUMMARY` per holding `{whatHappened, whyItMatters, thesisImpact, shouldInvestorCare, quotes[]}` from FMP stock-news through the cached layer.
- Scheduling: manual button now; ship disabled `.github/workflows/weekly-review.yml.example` (token-protected API route) + ROADMAP note.
- Tests: ISO-week period math, delta computation, engine fixtures.

## Finale — keys + live verification
1. Ask the owner for `FMP_API_KEY` + `ANTHROPIC_API_KEY`; put in `.env` (never committed).
2. Live smoke: AAPL quote flips sample→live; FX refresh; generate health score, MSFT stock score, thesis check, committee run, news summary, weekly review — all persisted with correct `dataAsOf`; re-visit pages and confirm **zero regeneration on view** (AiAnalysis row count stable); note approximate spend.
3. Final commit/push + plain-English report.

## Verification (every phase)
`pg_ctlcluster 16 main start` → `npm install` → `npx prisma migrate dev` → `npx prisma db seed` → `npm run lint` → `npm run typecheck` → `npm run build` → `npm run test` → `npm run test:e2e`; plus a live dev-server walkthrough (badges present, unavailable states honest, no AI generation on render). Reviews lead with: user-scoped queries, Decimal edges, golden-rule badges, AI-persistence rule, keys never logged.

## Builder constraints (carry into every brief)
Next 16 (`proxy.ts`, `unstable_retry`, read `node_modules/next/dist/docs/` when unsure) · zod v4 · lucide renames (ChartLine/LoaderCircle/TriangleAlert) · shadcn CLI blocked by the egress proxy — hand-write primitives in the existing dependency-free style · market data ONLY via the `src/lib/data` barrel · money via `fromPrisma*` + `formatMoney` (OMR 3dp) · cash always derived · every figure badged · Playwright uses the preinstalled chromium (never `playwright install`) · Postgres 16 local (`pg_ctlcluster 16 main start`) · agents never commit — the main session commits and pushes per phase.
