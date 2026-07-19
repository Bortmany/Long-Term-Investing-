# InvestIQ AI — Roadmap

Phase 1 (done) laid the foundation: database schema, sign-in, the market-data
layer with honest source badges, portfolio math, and seeded sample data.
Later phases add screens and AI — the schema already supports all of them.

## Phase 2 — Portfolio & dividends, full UI (done)
- Dashboard: total value, holdings table, cash balances — every figure with its source badge.
- Transaction entry screens (buy, sell, dividend, deposit, withdrawal, fee).
- CSV import of transactions.
- Multi-currency display: portfolio in OMR with USD/SAR/AED conversion, missing-rate warnings shown plainly.
- Dividend income view (trailing 12 months, upcoming payments).

## Phase 3 — Stock pages + AI health score (done)
- A page per instrument: price, profile, financials, dividend history.
- AI "health score" per holding, stored in `AiAnalysis` (type `HEALTH_SCORE`), shown with the date of the data it was based on.

## Phase 4 — Thesis tracker (done)
- Write an investment thesis per holding (`Thesis`).
- Periodic AI thesis checks (`ThesisCheck`): integrity score, recommendation (intact / weakening / broken), evidence.

## Phase 5 — AI committee + buy/sell analysis (done)
- Multi-perspective AI "committee" reviews (type `COMMITTEE`): six personas (value, growth,
  dividend, quality, macro, contrarian) vote in parallel, a pure function turns their votes into
  a 0-100 consensus score and BUY/HOLD/SELL verdict, then one synthesis call writes up the
  disagreements and what would change the verdict.
- On-demand buy and sell analyses (`BUY_ANALYSIS`, `SELL_ANALYSIS`), the latter reading the
  holding's own thesis-check history when one exists.

## Phase 6 — Weekly review + news (done)
- Weekly portfolio review (`WeeklyReview`, one row per ISO week per user): a manual "Run weekly
  review" button on `/reviews` calls the regular (non-batch) Messages API through the same
  `runAnalysis` engine every other analysis type uses — real-time reuse-by-input-hash matters more
  here than batch's 50% discount, since a personal, single-portfolio tool runs this at most a
  handful of times a week. The snapshot includes a real DELTA against the previous week's review
  (`src/lib/reviews/delta.ts`), and a scheduled path exists too: `POST /api/cron/weekly-review`,
  disabled by default (answers `503 {status:"dormant"}` with no `CRON_SECRET` set), bearer-token
  authenticated, runs every user with a portfolio in one call. `.github/workflows/weekly-
  review.yml.example` ships disabled (rename to `.yml` to enable) as one way to call it weekly.
- News summaries per stock (`NEWS_SUMMARY`), fetched from FMP through the existing
  `FundamentalsCache` table (its own 1-day freshness rule, shorter than the 7-day fundamentals
  default) and summarized with Haiku (`claude-haiku-4-5`) — cheap enough per-article that the
  Batch API's queuing/polling overhead isn't worth it at this app's volume.
- **Adopt the Batch API when either of these actually happens**: weekly reviews become a
  multi-portfolio/scheduled-at-scale operation (many users' reviews firing in the same batch
  window), or news summaries are generated for many holdings at once on a fixed cadence rather than
  on demand per stock page visit. Until then, the regular API + the existing reuse-by-hash
  mechanism keeps things simple and just as cheap in practice for a single-owner tool.

## AI model choices
- **claude-sonnet-5** for analysis work (health scores, committee, thesis checks, buy/sell).
- **claude-haiku-4-5** for summaries (news, weekly digests).
- Standing rule: AI outputs are persisted in `AiAnalysis` and never regenerated on page view.
