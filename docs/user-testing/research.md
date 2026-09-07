# InvestIQ AI — who the users are and what they will want (2026-09-07)

The single most important finding: InvestIQ AI's "never fabricate a number, badge every figure" rule is not just an engineering nicety — it is the exact thing that makes users abandon the closest comparables (getquin's "cannot rely on the correctness of the info, which makes the tool useless"; Simply Wall St's "rigid" unexplained scores; Seeking Alpha's Quant Rating that stayed "Strong Buy" into a crash) [30, 45, 48], and it lines up with real behavioral-finance evidence that anxiety and unexplained numbers erode investing trust and discipline [55, 56]. Across the six research rounds provided, **129 claims** were logged: **26 high-confidence** (mostly the repo's own documented rules — [Certain]), **85 medium-confidence** (search-snippet competitor and sentiment evidence, cross-checked but never fully fetched — [Likely]), and **18 low-confidence** (thin or model-prior reasoning, including the single most load-bearing behavioral claim in the whole product concept — that writing a thesis reduces impulsive selling — which was never actually found in the literature, only asserted as plausible — [Guessing]). In short: the competitive and pricing picture is solid, the psychology of *checking behavior and trust* is solid, but the psychology of *why writing a thesis works* and the *Gulf/Arabic-speaking investor's own voice* are both still guesses.

## 1. Who this user really is

**Persona 1 — "The Owner-Investor" (primary, only fully-evidenced persona)**
One-line bio: A disciplined individual long-term investor, Gulf-based, holding a concentrated book (5–10% per position) [77] across US, MSX, Tadawul and Dubai markets in three currencies, who thinks in theses, not tickers.
- Job to be hired for: *Functional* — consolidate a multi-market, multi-currency portfolio into one honest OMR-based number and track dividends/returns without lying to himself about what's stale [1, 65]. *Emotional* — replace daily anxious checking with a calmer weekly ritual he can trust [54, 55]. *Social* — none required; this is a private tool, not a community one [9 sentiment, 62].
- Anxieties: that a red number is really just currency noise, not a real loss [47]; that an AI "score" is quietly wrong and he won't know it [30, 39]; that he'll panic-sell a position he actually still believes in [55, 56].
- Trigger that brings him in: a drawdown, a dividend payment, or the urge to check before Friday's Gulf-market close when the rest of the world is still trading [72].
- First-session moment that has to happen or he leaves: seeing his *own* real transactions turn into a correctly-priced, source-badged portfolio total within the first sitting — before any thesis-writing or setup chores are asked of him [58, 59].
- What makes him come back tomorrow (habit loop): uncertainty (a market move) → one low-effort tap into the weekly review → a fresh committee take or a thesis flag as the variable reward → refining his thesis, which raises the value of next week's review [57].
- What makes him trust it: every number carrying a badge saying where it came from [1, 21], AI verdicts rendered in neutral color/never disguised as certain data [22], a fixed FX rate locked at each transaction's real date rather than re-priced today [47].
- What makes him abandon it: a number that doesn't reconcile with another view of the "same" number [43]; an AI verdict presented as a naked score with no traceable source [39, 48]; being forced through manual price entry with no visible sense of progress [59].

**Persona 2 — "The Invited Friend" (secondary, thin evidence — mostly model-prior, [Guessing])**
One-line bio: Someone the owner personally invites later — a spouse or trusted friend — onto what is currently a single-owner, single-portfolio tool.
- Job to be hired for: *Social* — being trusted enough to be let in [62]. *Functional* — track their own holdings, possibly in their own base currency [gap-2 model-prior claims].
- Anxieties: uncertain whether they can see/edit the owner's portfolio, or need their own; whether their data is separate from the owner's [gap-2].
- Trigger: a personal invitation, not a marketing funnel — the onboarding should say "X invited you," not run a generic signup screen [66 model-prior].
- First-session moment: understanding immediately what they can and can't see or change — no evidence exists yet on what this should default to.
- Comes back / trusts / abandons: **no real evidence was gathered for this persona in any research round** — three of four gap-fill sweeps aimed at it burned their entire search budget before returning a single search result [gap-2, gap-3]. Treat everything about this persona as provisional until a session with working search re-runs it.

## 2. What the market does

| Product | Offers | Price/yr (approx) | Onboarding | Phone experience | One thing loved | One thing hated |
|---|---|---|---|---|---|---|
| Sharesight | Broker sync, tax reports, multi-currency valuation (32 currencies) [24, 26] | Free tier; Starter ~AUD19/mo [24] | Broker sync + template CSV, AI importer for messy files [25] | App exists, no detail found | Multi-currency valuation-at-any-date report [26] | Scripted support, no phone line, holdings cap counts closed positions too [41, 42] |
| Simply Wall St | "Snowflake" 5-axis scorecard, Narratives (written thesis) [27, 28] | $10–21.50/mo [27] | Broker/CSV; transaction-based tracking only since Feb 2025 [29] | Native app | Visual Snowflake as an "aha moment" in ~5 min [40] | Renewal/billing complaints; rigid, uncalibrated scores capped at 10yr data [40] |
| getquin | Free core, dividend calendar + AI "DeepDive" by country/sector/currency [30] | Free; Premium €89.99, Wealth €149.99 [30] | Broker API/open-banking or manual, community feed | Native app, praised UX | Fast, intuitive, active community [32] | Buggy, syncs break, "cannot rely on the correctness of the info" [31, 61] |
| Stock Rover | 700+ metrics, custom screening | Free–$199/mo [33] | Broker sync | No dedicated mobile app | Deep US-market metric depth [33] | Steep learning curve, no mobile app |
| Snowball Analytics | Dividend-first, rebalancing, per-holding withholding-tax rates [34] | Free–$24.99/mo [34] | Broker (Yodlee/SnapTrade/IBKR) or file | — | UX + fast, effective support, "rare exception" among finance sites | Free tier capped at 1 portfolio/10 holdings |
| Koyfin | Grouping, notes, price/valuation/news alerts across desktop+mobile push [35] | Free–$299/mo [35] | CSV/brokerage statement | Desktop-first, mobile push | Broad alert types as a free-tier baseline | Steep learning curve, inflexible beta settings |
| Seeking Alpha | Quant ratings, "Ask Seeking Alpha" AI assistant [37] | $299–$2,400/yr [37] | — | — | Deep research content | Quant Rating stayed "Strong Buy" into a price collapse; disclaimed, unreviewed AI reports [37, 48] |
| MSX official app / Oman Stocks / Ubhar Capital | Quotes, watchlists, basic gain/loss, NIN-linked portfolio [38, 75] | Free | NIN + FSA-licensed broker required [69] | Native app, quotes-only | Free and official | No thesis, dividend-across-currency, AI, or review features found [39] |

Where InvestIQ AI is different:
- It is the only product found with genuine multi-market Gulf coverage (MSX, Tadawul, Dubai) *combined* with US markets in one OMR-based book — no global comparable advertises confirmed GCC coverage, and the local Gulf apps only do quotes/execution [19, 38, 75].
- Its golden rule (source-badge every figure, never fabricate, AI verdicts never disguised as data) directly targets the single most-repeated named complaint across every competitor sentiment thread found ("cannot rely on the correctness") [1, 30, 61].
- It deliberately forgoes the social/community layer and live broker sync that competitors treat as core, trading sync-breakage risk and a public feed for privacy and manual-entry control — a stated trade-off, not an oversight [9, 60].

## 3. What users say

**Theme: "I can't trust the number" (strong evidence, medium confidence, high volume — 6+ independent complaints)**
- getquin: "cannot rely on the correctness of the info, which makes the tool useless" — Trustpilot [61]
- getquin: automated dividend entries "partly wrong" and can't be deleted; advertised PDF import "doesn't actually work" — Trustpilot [45]
- Delta: fee values "silently changing to wrong numbers," graph gain % not matching the portfolio page's stated percentage — app-store reviews [43]
- Seeking Alpha: a stock stayed rated "Strong Buy" before a large price drop — Reddit, via secondary source [48]

**Theme: "Currency math lies to me" (strong evidence, medium confidence, 4+ sources)**
- getquin users forced into "duplicate portfolios" as a workaround for multi-currency, hiding whether a move is the stock or the FX [60]
- Delta: can't view a multi-asset portfolio priced in a currency other than USD/BTC [44]
- Multi-currency trackers broadly criticized for re-pricing historical entries at today's FX rate, making a portfolio look like it "lost value" from currency noise alone [47]

**Theme: "Support disappears when it matters" (medium evidence, medium confidence)**
- getquin: a user described losing nearly a day trying to reach a human past an AI chatbot when a core feature broke, ticket auto-closed after 5 days [46]
- Sharesight: "scripted, junior support" that doesn't understand technical accounting issues, no phone support [41]

**Theme: "Billing surprises me" (medium evidence, medium confidence — largely moot for InvestIQ AI since it isn't sold)**
- Simply Wall St: "shady renewal practices," no advance reminder before auto-renewal; company itself admitted the cancellation flow wasn't clear [40]
- Sharesight: old/closed holdings count toward the paid-tier holdings cap, punishing long portfolio history [42]

**Theme: checking too often hurts, calmer cadence is wanted (strong evidence, medium confidence, direct behavioral-finance backing)**
- "I check my portfolio nearly every hour... like a gambling dopamine addict, but for personal finance" — developer commentary, used to justify calmer design [51]
- Investors who check most frequently take less-optimal risk and earn less money [54]

**Theme: what's praised (moderate evidence, medium confidence)**
- Simply Wall St's Snowflake as an intuitive "aha moment" within 5 minutes [40]
- Snowball Analytics: consistently strong reviews for clarity and "rare exception" support quality
- Simple Portfolio: CSV imports that are "dead easy" and never create duplicates on re-import [53]

## 4. Local facts that change the design

| Fact | Source, date | Design consequence |
|---|---|---|
| MSX trades Sun–Thu, 10:00–14:00 GST, continuous, no lunch break [69]; DFM trades Sun–Thu 10:00–14:00 GST [72] — different week from US Mon–Fri | tradinghours.com, msx.om (accessed 2026) | "As of" staleness badges must be per-market, not one global clock — a Friday-morning US check is looking at Thursday's Muscat close, not live |
| OMR has been pegged to USD at a fixed 2.6008 rate since 1986 [70] | babypips.com (accessed 2026) | The OMR↔USD leg of the FX engine can safely use the fixed peg instead of a live feed — one less place the golden rule could be broken |
| Trading MSX requires an MCD-issued Investor Number (NIN) plus an FSA-licensed broker; no self-serve API for retail [38, 69] | msx.om, u-capital.net | CSV wizard must be built around whatever a broker back-office (e.g. Ubhar/Easy Tadawul) actually exports, not a clean API feed |
| Saudi Arabia eliminated Qualified Foreign Investor registration in 2026, opening direct Tadawul access via international brokers; 5% withholding tax applies to non-resident dividends [71] | irfaninvest.com, pwc.com (2026) | Expect more Tadawul holdings to arrive via IBKR/Saxo-style exports; dividend entries need gross-vs-net-of-5%-WHT shown with a source badge |
| Oman's PDPL (Royal Decree 6/2022) requires consent, a DPO contact, records of processing, and breach response; fines up to OMR 500,000 [73] | cms.law (2025) | Even a single-owner/invite-only app holding real financial data should document a lawful basis and keep the existing export/delete flow PDPL-ready |
| 95%+ of Oman's population is online, almost all via smartphone; mobile connections = 124% of population [65] | datareportal.com (2025) | Mobile/PWA should be treated as the *primary* surface for this persona, not a companion to desktop — yet the product is currently built desktop-first [21] |
| An official "Oman Stocks" app already gives Omani retail investors free portfolio tracking tied to their MCD holdings [75] | apps.apple.com (2025) | InvestIQ AI cannot differentiate on raw MSX portfolio tracking — it must win on theses/AI analysis/cross-market consolidation instead |

## 5. Feature wishlist, ranked (Kano)

**Must-have — they leave without it**
1. Never show a fabricated number; every figure source-badged (6+ independent sources: competitor complaints + repo rule) [1, 30, 45, 48, 61] — persona: Owner-Investor — built: **yes**, this is the repo's stated golden rule.
2. FX rate locked at each transaction's real date, never re-priced with today's rate (3 sources) [44, 47, 60] — Owner-Investor — built: **check** (multi-currency exists; explicit lock-at-transaction-date behavior not directly confirmed in the docs read).
3. Consolidated OMR total with each holding still shown in its home currency inline (3 sources) [26, 44, 60] — Owner-Investor — built: **check**.
4. Frictionless manual price entry for MSX/Tadawul/DFM, since these are permanently manual, never live (repo rule + market facts) [5, 69] — Owner-Investor — built: **yes** (manual pricing path exists), UX quality of entry — **check**.
5. Data export ("download everything") and password-confirmed deletion (repo rule + PDPL) [12, 73] — Owner-Investor — built: **yes**.

**Expected — they assume it's there**
1. Dividend tracking with per-holding withholding-tax rate (e.g. Saudi 5%) (2 sources) [34, 71] — Owner-Investor — built: **check**.
2. Watchlist + alerts, but few and high-signal rather than generic price pings (2 sources) [35, 50] — Owner-Investor — built: **yes**, alerts exist; granularity per theme — **check**.
3. Weekly review cadence rather than a live ticking feed (2 sources) [15, 54] — Owner-Investor — built: **yes**.
4. Plain-English glossary/explainer next to metric labels (1 source, repo) [16] — Owner-Investor — built: **yes**.
5. Stock page with one glanceable fundamentals synthesis, not raw tables (1 strong source) [27, 40] — Owner-Investor — built: **check**.

**Delighter — they tell a friend**
1. AI committee: 6 debating personas + a visible disagreements panel, every claim source-cited in the transcript, not just above it (repo + model-prior credibility-risk warning) [14, 68] — Owner-Investor — built: **yes** (transcript-level citation — **check**).
2. Written thesis with an explicit invalidation condition the weekly review checks against, going beyond a static note (1 emerging-category source) [52] — Owner-Investor — built: **check**.
3. Currency-effect vs. price-effect shown as separate line items per position, natively, with no paywall (1 strong pain-point source) [60] — Owner-Investor — built: **check**.
4. Position-concentration alert (flag any holding above a configurable % of the book) (1 low-confidence source on GCC sizing norms) [77] — Owner-Investor — built: **check**.
5. Genuinely-earned invite-only exclusivity, framed as a real private tool rather than manufactured scarcity (1 source) [62] — Owner-Investor / Invited Friend — built: **yes**.

## 6. What they will ask to change

1. "Why can't I track a second portfolio — my spouse's account, or my own tax-free vs. taxable buckets?" — the single-portfolio limit was a security fix, not a deliberate product decision [18]. *Response:* "Good catch — that was a security tightening, not a final decision; multi-portfolio is on the list to design properly, not ruled out."
2. "Why do I have to type in every MSX/Tadawul/Dubai price by hand?" — only US instruments get live pricing by design [5]. *Response:* "Because there's no reliable live feed for those exchanges yet — we can make the manual-entry step faster, but we won't fake a live price."
3. "Can I see my whole portfolio in USD (or AED/SAR) instead of only OMR?" — competitors are criticized for locking users into one display currency [44]. *Response:* "Yes, that's a real gap other tools get complaints for too — we'll add a one-tap display-currency switch."
4. "Why does the AI committee only let me run 25 debates a day?" — repo-documented cap [9]. *Response:* "That's a cost/quality guardrail, not a bug; reused (unchanged) analyses don't count against it."
5. "Can this just sync with my broker instead of me uploading CSVs?" — category norm across getquin/Sharesight/Snowball [30, 34]. *Response:* "Deliberately not, for a Gulf book with no broker APIs anyway — but we can make the CSV wizard smarter about auto-mapping and de-duplication."
6. "Why isn't there a phone app?" — GCC is 95%+ smartphone-first and several competitors are criticized for the same gap [33, 65]. *Response:* "Fair — a PWA/mobile-first pass is a real gap, not a stretch goal, given how the target user actually accesses the internet."
7. "Can I invite my spouse or a friend and give them their own portfolio, not just a view of mine?" — no permission model exists yet for a second user [gap-2]. *Response:* "Not yet — we deliberately haven't designed multi-user permissions because we don't have real evidence on what a second user would expect; tell us what you want and we'll build it, not guess."
8. "Why don't the weekly-brief emails just show me the numbers?" — repo rule: emails never carry figures [17]. *Response:* "That's the same 'never risk showing a stale number' rule applied strictly to email — the email links you into the app where the number is live and badged."
9. "Why doesn't a dividend show me what tax was actually withheld?" — Saudi's 5% non-resident dividend WHT is real and material [71]. *Response:* "Good ask — we should show gross vs. net-of-withholding per market, source-badged, not just the headline payout."
10. "The app covers Gulf markets, so why is everything only in English, left-to-right?" — this is an explicit, documented scope decision that sits in tension with the market tilt [21]. *Response:* "That's a deliberate v1 boundary, not an oversight — Arabic/RTL is a real, larger project we haven't scheduled."
11. "Why does the committee give me 6 different opinions instead of just telling me buy or sell?" — the disagreement panel is a deliberate anti-black-box design choice, but a user expecting a single verdict (like Seeking Alpha's rating) may find it noisy [37]. *Response:* "That's on purpose — a single number is exactly what erodes trust in other tools; the dissent is the point, not a bug."
12. "Can I get a push notification instead of having to open the app to see an alert?" — Koyfin's baseline includes desktop+mobile push [35]. *Response:* "Reasonable ask, currently out of scope since there's no native app yet — tied to the mobile-app question above."
13. "Why does my old, closed position from 3 years ago still matter / show up everywhere?" — anticipated by analogy to Sharesight's "closed holdings count against your plan" complaint, even though InvestIQ has no plan limits [42]. *Response:* "It shouldn't slow you down — if it's cluttering a view, tell us where and we'll add an archive/filter."

## 7. What the repo already believed vs what we found

**What the docs got right**
- The golden rule (source badges, never fabricate) is not just an internal engineering constraint — it directly targets the single most-repeated named failure mode ("cannot rely on the correctness of the info") across every competitor sentiment thread found [1, 30, 61].
- Manual pricing for MSX/Tadawul/DFM is the correct call, not a shortcut — there genuinely is no reliable live feed for retail investors on these exchanges [5, 38, 69].
- The weekly-review cadence (instead of a live ticking feed) matches real behavioral-finance evidence that frequent checking causes worse investing outcomes — this is a validated design choice, not just a guess [15, 54].
- Neutral-colored AI verdicts, separate from signed green/red money figures, and disclaimers on every AI panel, are exactly the visual trust cues the fintech-trust literature and the Seeking-Alpha-Quant-Rating backlash both point to [22, 37, 48, 56].
- Invitation-only production matches how this exact persona (privacy-conscious, concentrated-portfolio Gulf investor) is already marketed to by comparable wealth-tech products [4, 78].

**What the docs got wrong or are stale**
- BUILD-PLAN.md's top-line status and the README describe the project as "Phase 1 done, Phase 2 half done" while the competitor-analysis report itself verified (via git log and routes on disk) that all 8 phases are actually built, reviewed, and hardened — the top-line docs need a refresh [23].
- The single-portfolio-per-user limit is documented in the repo as a security fix (commit c77b080), but no research round found any actual evidence of whether users want or complain about single- vs. multi-portfolio — it is currently a technical decision wearing the clothes of a product decision [18].

**What the docs never considered**
- Any permission or data model for a second user (an invited friend or family member) — the roadmap gestures at inviting a small circle later, but zero research evidence exists on what that person would expect [gap-2].
- The tension between the product's Gulf-market data tilt (OMR, MSX, Tadawul, Dubai) and its explicit English-only, desktop-first, no-RTL UI decision — both are true and documented, but never resolved against each other [21].
- Real user sentiment from Gulf or Arabic-speaking investors themselves — every attempt to find it (multiple dedicated search sweeps) came back empty, either from tooling failure or from the searches genuinely surfacing nothing but generic listicles and regulator complaint portals.
- The literature behind the product's core behavioral premise (that writing a thesis reduces impulsive/disposition-effect selling) was never found — only asserted as a plausible, low-confidence model prior [67].

## 8. Sources

| # | Claim (short) | Evidence type | Confidence | Source title | Host | URL / file:line | Date |
|---|---|---|---|---|---|---|---|
| 1 | Never show a fabricated number; every figure carries a source badge | repo-doc | High | CONVENTIONS.md | (repo) | docs/CONVENTIONS.md:8 | n/a |
| 4 | Invitation-only production; ALLOW_SIGNUPS never set live | repo-doc | High | CONVENTIONS.md | (repo) | docs/CONVENTIONS.md:25 | n/a |
| 5 | Only US instruments get live FMP pricing; MSX/Tadawul/DFM/other always manual | repo-doc | High | CONVENTIONS.md | (repo) | docs/CONVENTIONS.md:37 | n/a |
| 9 | 25 new AI analyses/day cap; reuse by hash doesn't count | repo-doc | High | CONVENTIONS.md | (repo) | docs/CONVENTIONS.md:63-68 | n/a |
| 12 | Data export ("download everything") + password-confirmed deletion | repo-doc | High | CONVENTIONS.md | (repo) | docs/CONVENTIONS.md:99-112 | n/a |
| 14 | AI committee = 6 personas + synthesis, disagreements panel | repo-doc | High | BUILD-PLAN.md | (repo) | docs/BUILD-PLAN.md:53-65,135 | n/a |
| 15 | Weekly review computes allocation drift + WoW deltas + behavioral note | repo-doc | High | BUILD-PLAN.md | (repo) | docs/BUILD-PLAN.md:66-74,141 | n/a |
| 16 | ~30-term glossary with click-to-open ExplainerTip | repo-doc | High | BUILD-PLAN.md | (repo) | docs/BUILD-PLAN.md:86-89 | n/a |
| 17 | Weekly-brief email carries no figures in the body | repo-doc | High | BUILD-PLAN.md | (repo) | docs/BUILD-PLAN.md:83-85 | n/a |
| 18 | Single-portfolio-per-user was a security fix, not a deliberate limit | repo-doc | High | competitor-analysis report | (repo) | docs/competitor-analysis/report-2026-09-01.md:66 | 2026-09-01 |
| 19 | No surveyed competitor advertises confirmed GCC (MSX/Tadawul/DFM) coverage | repo-doc | Medium | competitor-analysis report | (repo) | docs/competitor-analysis/report-2026-09-01.md:11-24 | 2026-09-01 |
| 21 | UI is explicitly desktop-first, English-only, LTR, no i18n/RTL planned | repo-doc | High | ui-spec-phases-2-6.md | (repo) | docs/design/ui-spec-phases-2-6.md:3 | n/a |
| 22 | Green/red reserved for signed money figures; AI verdicts always neutral | repo-doc | High | ui-spec-phases-2-6.md | (repo) | docs/design/ui-spec-phases-2-6.md:251-274 | n/a |
| 23 | CONTRADICTION: README/BUILD-PLAN top line stale vs. all 8 phases actually built | repo-doc | High | competitor-analysis report | (repo) | docs/competitor-analysis/report-2026-09-01.md:5-9,95 | 2026-09-01 |
| 24 | Sharesight Starter ~AUD19/mo, broker sync | search-snippet | Medium | Sharesight Software Pricing 2026 | capterra.com | https://www.capterra.com/p/207519/Sharesight/ | 2026 |
| 25 | Sharesight "AI importer" accepts any file format | search-snippet | Medium | AI importer — upload any file format | help.sharesight.com | https://help.sharesight.com/ai-importer/ | n/a |
| 26 | Sharesight 32-currency multi-currency valuation report | search-snippet | Medium | Multi-Currency Valuation Report | help.sharesight.com | https://help.sharesight.com/multi-currency-valuation-report/ | n/a |
| 27 | Simply Wall St $10-21.50/mo, Snowflake scorecard | search-snippet | Medium | Simply Wall St Review 2026 | stockunlock.com | https://stockunlock.com/simply-wall-st-review.html | 2026 |
| 28 | Simply Wall St "Narratives" = written, evolving thesis per stock | search-snippet | Medium | Narratives feature | simplywall.st | https://simplywall.st/ | n/a |
| 29 | Simply Wall St transaction-based tracking only launched Feb 2025 | search-snippet | Medium | Simply Wall St Review 2026 | stockunlock.com | https://stockunlock.com/simply-wall-st-review.html | 2026 |
| 30 | getquin free core + dividend calendar + AI DeepDive | search-snippet | Medium | getquin Review 2026 | findmymoat.com | https://www.findmymoat.com/tools/getquin | 2026 |
| 31 | getquin: broker sync breaks, no tax reports, logout bug | search-snippet | Medium | getquin Portfolio Tracker Review | apppricelens.com | https://apppricelens.com/blog/getquin-portfolio-tracker-review-is-the-free-app-worth-it-IBLtdQ | n/a |
| 32 | getquin praised: intuitive UI, fast sync, community feed | search-snippet | Medium | getquin Overview | benzinga.com | https://www.benzinga.com/money/getquin-review | n/a |
| 33 | Stock Rover pricing $7.99-199/mo, no mobile app complaint | search-snippet | Medium | Stock Rover Plans & Pricing | stockrover.com | https://www.stockrover.com/plans/ | n/a |
| 34 | Snowball Analytics dividend-first, per-holding withholding-tax rate | search-snippet | Medium | Snowball Analytics pricing/features | saasworthy.com | https://snowball-analytics.com/pricing | n/a |
| 35 | Koyfin pricing + price/valuation/technical/news alerts, desktop+mobile push | search-snippet | Medium | Koyfin Pricing / Product Features | koyfin.com | https://www.koyfin.com/pricing-llm-info/ | n/a |
| 37 | Seeking Alpha pricing; Quant Ratings distrust cited by reviewers | search-snippet | Medium | Seeking Alpha Review 2026 | bullishbears.com | https://bullishbears.com/seeking-alpha-review/ | 2026 |
| 38 | MSX official app: quotes, watchlists, basic gain/loss only; Ubhar/MCD execution+NIN | search-snippet | Medium | Muscat Stock Exchange App | apps.apple.com | https://apps.apple.com/us/app/muscat-stock-exchange/id1478733689 | n/a |
| 39 | No evidence MSX/Ubhar apps offer thesis/dividend-across-currency/AI/review features | search-snippet | Low | Muscat Stock Exchange App Store listing | apps.apple.com | https://apps.apple.com/us/app/muscat-stock-exchange/id1478733689 | n/a |
| 40 | Simply Wall St Snowflake = "aha moment"; also billing/renewal complaints | search-snippet | Medium | Simply Wall St Review 2026 | stockunlock.com / trustpilot.com | https://stockunlock.com/simply-wall-st-review.html | 2026 |
| 41 | Sharesight: scripted junior support, no phone support | search-snippet | Medium | Sharesight Reviews | trustpilot.com | https://au.trustpilot.com/review/www.sharesight.com | n/a |
| 42 | Sharesight: closed holdings count toward paid-tier holdings cap | search-snippet | Medium | Sharesight Reviews | trustpilot.com | https://www.trustpilot.com/review/www.sharesight.com | n/a |
| 43 | Delta: fee values silently wrong, gain% mismatches across views | search-snippet | Medium | Delta Investment Tracker Reviews | justuseapp.com | https://justuseapp.com/en/app/1288676542/delta-investment-tracker/reviews | n/a |
| 44 | Delta: can't view portfolio in a currency other than USD/BTC | search-snippet | Medium | Delta Investment Tracker Reviews | justuseapp.com | https://justuseapp.com/en/app/1288676542/delta-investment-tracker/reviews | n/a |
| 45 | getquin: buggy, data/currency mismatches, broken PDF import | search-snippet | Medium | getquin Reviews | trustpilot.com | https://www.trustpilot.com/review/getquin.com | n/a |
| 46 | getquin: core feature broke, support ticket auto-closed after 5 days | search-snippet | Medium | getquin Reviews | trustpilot.com | https://www.trustpilot.com/review/getquin.com | n/a |
| 47 | Multi-currency trackers criticized for re-pricing history at today's FX rate | search-snippet | Medium | Multi-Currency Portfolio Tracker guidance | portfoliopilot.com | https://portfoliopilot.com/net-worth-tracking/resources/net-worth-tracking-multi-currency-fx-that-wont-corrupt-your-history | n/a |
| 48 | Seeking Alpha Quant Rating stayed "Strong Buy" before a large price drop | search-snippet | Medium | Seeking Alpha Reddit Review 2026 | isetupedia.com (citing reddit) | https://isetupedia.com/seeking-alpha-reddit-review/ | 2026 |
| 50 | 10+ alerts/day → users ignore even critical alerts ("alert fatigue") | search-snippet | Medium | Portfolio Risk Alerts | guardfolio.ai | https://www.guardfolio.ai/blog/alerts | n/a |
| 51 | Developer: checked portfolio hourly, "gambling dopamine addict" | search-snippet | Low | check on investments five minutes or less | bankrate.com | https://www.bankrate.com/investing/check-on-investments-five-minutes-or-less/ | n/a |
| 52 | Emerging "thesis tracking" app category (ThesisTrack, Helm Terminal) | search-snippet | Medium | Thesis Tracking Apps in 2026 | helmterminal.dev | https://helmterminal.dev/blog/thesis-tracking-apps | 2026 |
| 53 | Simple Portfolio: CSV imports "dead easy," avoid duplicate transactions | search-snippet | Medium | Simple Portfolio Reviews | trustpilot.com | https://uk.trustpilot.com/review/simpleportfolio.app | n/a |
| 54 | Frequent checkers take less-optimal risk, earn less (myopic loss aversion) | search-snippet | Medium | Avoid Anxiety by Not Checking Your Portfolio | web.brightplan.com | https://web.brightplan.com/blog/stop-checking-your-investment-portfolio | n/a |
| 55 | Losses felt ~2x gains; 2022 avg investor underperformed S&P by 3+ points | search-snippet | Medium | Loss Aversion: A Killer to Successful Investing | whitecoatinvestor.com | https://www.whitecoatinvestor.com/loss-aversion-how-to-beat-it/ | n/a |
| 56 | Anxiety reduces risk tolerance; amygdala activates on anticipated loss | search-snippet | Medium | What Is Behavioral Finance | merceradvisors.com | https://www.merceradvisors.com/investing/what-is-behavioral-finance-and-how-can-it-impact-investing-decisions/ | n/a |
| 57 | Hook Model: trigger → action → variable reward → investment | search-snippet | Medium | Hooked Model | umbrex.com | https://umbrex.com/resources/frameworks/marketing-frameworks/hooked-model-trigger-action-variable-reward-investment/ | n/a |
| 58 | 60-70% of SaaS churn happens in first 90 days; time-to-first-value is the biggest lever | search-snippet | Medium | Why Users Abandon Apps During Onboarding | sparklin.com | https://sparklin.com/blog/why-users-abandon-apps-during-onboarding | n/a |
| 59 | Finance-app onboarding felt as a "compliance obstacle course" | search-snippet | Medium | Onboarding that converts | markswebb.com | https://markswebb.com/insights/onboarding-ux/ | n/a |
| 60 | getquin currency handled via clunky "duplicate portfolios" workaround | search-snippet | Medium | getquin Reviews / Capitally comparison | mycapitally.com | https://www.mycapitally.com/blog/alternatives/best-portfolio-analysis-tool | n/a |
| 61 | getquin: "cannot rely on the correctness of the info, which makes the tool useless" | search-snippet | Medium | getquin Reviews | trustpilot.com | https://uk.trustpilot.com/review/getquin.com?page=2 | n/a |
| 62 | Invite-only signals value/scarcity, but must be authentic or trust erodes | search-snippet | Medium | By Invitation Only: The Psychology of Exclusivity | party.alibaba.com | https://party.alibaba.com/asset/by-invitation-only | n/a |
| 63 | 72% of fintech users muted/uninstalled apps over notification overload | search-snippet | Medium | The Ethics of Push Notifications in Finance Apps | billcut.com | https://www.billcut.com/blogs/the-ethics-of-push-notifications-in-finance-apps/ | n/a |
| 65 | 95%+ of Oman online, mostly via smartphone; GCC RTL/UX conventions | search-snippet | Medium | A Simple Guide for Mobile Banking Apps with Arabic UX/UI | itexus.com | https://itexus.com/a-simple-guide-for-mobile-banking-apps-with-arabic-ux-ui/ | n/a |
| 67 | (model-prior) Thesis-writing as a commitment device reducing impulsive selling | model-prior | Low | — | — | (no source found — see gap-1) | n/a |
| 68 | (model-prior) AI committee credibility risk if claims aren't source-cited in the transcript | model-prior | Low | — | — | — | n/a |
| 69 | MSX trades Sun-Thu 10:00-14:00 GST; NIN + FSA-licensed broker required | search-snippet | Medium | MSM Market Hours & Holidays / Ubhar Capital FAQs | tradinghours.com / u-capital.net | https://www.tradinghours.com/markets/msm | n/a |
| 70 | OMR pegged to USD at 2.6008 since 1986 | search-snippet | Medium | Omani Rial (OMR) Definition | babypips.com | https://www.babypips.com/forexpedia/oman-rials | n/a |
| 71 | Saudi 2026 QFI elimination; 5% non-resident dividend withholding tax | search-snippet | Medium | Investing in the Oman Stock Market (MSX): 2026 Guide / PwC Withholding Taxes | irfaninvest.com / taxsummaries.pwc.com | https://www.irfaninvest.com/insights/invest-muscat-stock-exchange-msx-foreigners-2026 | 2026 |
| 72 | DFM trades Sun-Thu 10:00-14:00 GST — different calendar from Western markets | search-snippet | Medium | DFM Market Hours & Holidays | tradinghours.com | https://www.tradinghours.com/markets/dfm | n/a |
| 73 | Oman PDPL: consent, DPO, records, breach response; fines up to OMR 500,000 | search-snippet | Medium | Oman personal data protection law | cms.law | https://cms.law/en/omn/legal-updates/oman-personal-data-protection-law-entering-the-enforcement-phase | n/a |
| 75 | "Oman Stocks" app already offers free MCD-linked portfolio tracking | search-snippet | Medium | Oman Stocks - App Store | apps.apple.com | https://apps.apple.com/om/app/oman-stocks/id6465174092 | n/a |
| 77 | Dividend-forum discussion of concentrated 5-10%-per-position books | search-snippet | Low | Basic Stock Portfolio Building | financialwisdomforum.org | https://www.financialwisdomforum.org/forum/viewtopic.php?p=815121 | n/a |
| 78 | GCC HNW/family-office marketing leans invite-only, not broad social ads | search-snippet | Low | Family Office Marketing Strategies | wolf.financial | https://wolf.financial/blog/family-office-marketing-strategies-fintech-wealth-management | n/a |

**Blocked hosts — could not fetch, snippet only:** reddit.com, trustpilot.com, g2.com, apple/play store review pages, cbo.gov.om, kubera.com (homepage and /pricing — proxy-blocked, not just uninvestigated). All claims sourced from these hosts above are capped at medium confidence (or low, where noted) per the evidence rules; none were independently verified beyond a search snippet.

**Unresolved gaps (research budget exhausted before completion — not evidence of absence):** the literature behind "thesis-writing reduces impulsive selling" [67]; the Invited Friend persona's actual expectations; Kubera's real current pricing/features; any real Arabic-language or GCC-investor-voice sentiment. A follow-up session with a fresh search budget and working egress to kubera.com is needed before treating any of these as settled.
