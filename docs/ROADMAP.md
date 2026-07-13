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

## Phase 4 — Thesis tracker
- Write an investment thesis per holding (`Thesis`).
- Periodic AI thesis checks (`ThesisCheck`): integrity score, recommendation (intact / weakening / broken), evidence.

## Phase 5 — AI committee + buy/sell analysis
- Multi-perspective AI "committee" reviews (type `COMMITTEE`).
- On-demand buy and sell analyses (`BUY_ANALYSIS`, `SELL_ANALYSIS`).

## Phase 6 — Weekly review + news
- Automated weekly portfolio review (`WeeklyReview`), generated via the Anthropic Batch API.
- News summaries per holding (`NEWS_SUMMARY`), also via the Batch API to keep costs low.

## AI model choices
- **claude-sonnet-5** for analysis work (health scores, committee, thesis checks, buy/sell).
- **claude-haiku-4-5** for summaries (news, weekly digests).
- Standing rule: AI outputs are persisted in `AiAnalysis` and never regenerated on page view.
