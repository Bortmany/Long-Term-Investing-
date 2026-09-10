# InvestIQ AI — user-testing report (2026-09-07)

**Verdict: Not ready** — the ladder was applied mechanically. There is no P0. There are three confirmed P1 code bugs, and one of them (the phone tables) makes the core loop unusable on a phone, which is a "Not ready" trigger on its own. On a laptop the app is in much better shape than that word suggests.

A first-time user can sign in, see their whole portfolio in rials, check their dividend income for the last twelve months, filter their transactions, import a CSV of trades, and read their written investment thesis — all on a laptop, with every number reconciling to the last decimal. They cannot review that portfolio on a phone (the money columns are off the edge of the screen), cannot see a correct total if they switch the base currency away from rials, and cannot get a stock back onto their watchlist once they un-watch it.

The single most important thing to change: make the tables work on a phone — show each holding and each thesis as a stacked card below phone width, so the value, the gain and the thesis verdict are visible without sideways scrolling.

- **First impression: 74 / 100** — the tester understood the product in 45 seconds and wanted to keep going; the honesty badges on every figure were called the best they had seen in a finance app; marks lost for the bare sign-in wall and for the phone screens that hide the answers.
- **Core loop: 65 / 100** — on desktop the sign-in → dashboard → portfolio → dividends journey is flawless and the arithmetic all checks out; the same loop is crippled on a phone, and the AI half of the product is switched off.

## What we tested

| Who | Language | Desktop | Phone | Scenarios passed / failed / blocked |
|---|---|---|---|---|
| Long-term investor — a Gulf-based dividend investor holding US, Muscat and Saudi stocks, who wants to know what the portfolio is worth and what it pays | English | Yes | Yes (390 x 844) | 7 passed / 5 failed / 1 blocked |

Tested on a fresh local copy with demo data only. No real order, payment or message was sent.

## First impressions (blind)

- **Investor, English** — understood the product in **45 seconds**; would continue: **yes**. In their words: *"It answered my dividend question in five seconds and I loved that it tells me which numbers are real — but on my phone I can see the name of my Microsoft thesis and not its verdict, and the AI that's supposed to judge it is switched off."*
  - Confusions: the link opens straight onto a sign-in box with nothing explaining the product; the headline portfolio value carries an orange "Sample data" badge while cash below it says "computed from your transactions", so they could not tell if their own money was real; the thesis page tells them to click a "Check thesis now" button that is not on the page; every phone table is cut off at the right edge with no hint it scrolls; clicking a stock row seemed to do nothing; a guessed address gives a bare grey 404.
  - Delights: every figure carries a badge saying where it came from; the AI-off card says plainly "nothing here is faked in the meantime"; the twelve-month dividend income and income-by-holding answered their main question within seconds; total return shown both with and without dividends; multi-currency handled properly with the rate, its date and its source on show; the "not financial advice" line on every page.
  - Phone vs desktop: desktop is clearly the intended home — the sidebar shows every section, the donut charts breathe, and every column fits. On the phone the same tables are cut off, so the thesis verdict, the price change and the gain/loss simply do not exist for a phone user. The drawer menu, the add-transaction sheet and the charts themselves work well on the phone.

## Findings, most serious first

### P0

None.

### P1

**Switching the base currency away from rials loses a whole holding and quietly under-states dividend income** (investor, desktop and phone, English, Certain)

What happened: sign in, go to Settings, change Base Currency from OMR to USD, then look at the dashboard and the portfolio page.
Expected: the 250 Saudi Aramco shares should be converted into dollars using the two rates the app already stores itself (Saudi riyal to rial, and dollar to rial, which together give riyal to dollar), and the twelve-month dividend income should still include the Aramco payments.
Seen: Aramco drops out of the sector, country and market breakdowns entirely. The dividend income card reads USD 567.00 — about 11% short — and still wears the badge "Computed from your transactions" with no warning of its own. The dashboard does show a general "some positions couldn't be valued" banner; the portfolio page shows no banner at all, even though the Aramco row there says "Unavailable — no exchange rate".
Evidence: `screenshots/investor-en/094-desktop-edge-settings-dashboard-base-usd.png`, `screenshots/investor-en/095-desktop-edge-fx-portfolio-base-usd.png`, `screenshots/investor-en/084-desktop-repro-iq-01-06-dashboard-base-usd.png`
Confirmed by an independent re-test: **yes** (reproduced twice from fresh sessions).
Fix brief: work out a missing exchange rate by going through the rial — divide the Saudi-riyal-to-rial rate by the dollar-to-rial rate — instead of demanding a stored riyal-to-dollar row. Until that lands, keep positions that cannot be valued visible as rows everywhere they appear, show the same "couldn't be valued" banner on the portfolio page as on the dashboard, and attach a plain warning to the dividend income card ("excludes 1 holding — no exchange rate") rather than letting it carry the clean "computed from your transactions" badge. That badge is the product's golden rule and should never sit on an incomplete figure.

**On a phone every table hides its money columns, and scrolling sideways loses the ticker** (investor, phone, English, Certain)

What happened: open the portfolio on a 390-wide phone, read the Holdings table, then drag it sideways. Same on Theses, Stocks and Watchlist. (This is the same defect the blind tester hit first on the Theses page.)
Expected: below phone width each holding should read as a stacked card — ticker and name on one line, value and gain on the next — or the ticker column should stay pinned with a visible "swipe for more" hint.
Seen: only the ticker and name fit, and the quantity is chopped mid-number ("3,0" for 3,000 shares) so it looks like a real figure. There is no fade, shadow or scrollbar suggesting more columns exist. Scroll right and the ticker scrolls away, so "+OMR 171.325 (+10.6%)" belongs to no visible stock. On Theses the Status, Integrity Score and Last Checked columns are all off-screen — exactly what a user opens that page for.
Evidence: `screenshots/investor-en/112-phone-phone-deep-phone-portfolio-scrolled-right.png`, `screenshots/investor-en/075-phone-repro-iq-02-02-portfolio-phone-scrolled-right.png`, `screenshots/investor-en/031-phone-blind-phone-05-theses-phone.png`, `screenshots/investor-en/053-phone-repro-blind-inv-en-01-repro-03-theses-phone.png`
Confirmed by an independent re-test: **yes** (reproduced twice; see the disagreement over how serious it is, below).
Fix brief: below roughly 640px wide, render the Holdings, Theses, Stocks and Watchlist tables as stacked cards — label above value. If the tables are kept, pin the first column with a shadow, add a permanent fade at the right edge and an always-visible thin scrollbar, and add a short "swipe for more" caption. Also cap the thesis statement cell to a couple of lines instead of letting it stretch the table.

**Un-watching a stock you do not own is a one-way door — the app then refuses to add it back** (investor, desktop and phone, English, Certain)

What happened: on Stocks, press the eye button on the Johnson & Johnson row (watched, not held). It vanishes from Stocks, Watchlist and the dashboard. Then use "Track a Stock" to add JNJ back.
Expected: either a confirm or an undo before removing it, or "Track a Stock" puts it back.
Seen: it disappears instantly with no toast and no undo. "Track a Stock" then refuses with "JNJ on US is already tracked — no need to add it again", and there is no search box on Stocks to find it again. The only repair was typing an internal address for that stock and pressing Watch — something no real user could guess.
Evidence: `screenshots/investor-en/091-desktop-rewatch-jnj-track-a-stock-dead-end.png`, `screenshots/investor-en/070-desktop-repro-iq-03-22-track-a-stock-dead-end-error.png`
Confirmed by an independent re-test: **yes** (reproduced first attempt).
Fix brief: in the Track-a-Stock dialog, when the "already tracked" case comes back, look the stock up and add it to this user's watchlist instead of showing an error. Add a search or "browse all stocks" box to the Stocks page so an un-watched stock is reachable without knowing its internal address, and show an undo toast when a watch is removed. Worth noting for the owner [Likely]: that "already tracked" message comes from a shared stock table, so it can also hint that some other account follows a ticker.

**The link opens straight onto a sign-in wall — a first-time visitor learns nothing about the product** (investor, desktop and phone, English, Certain)

What happened: open the app's address in a fresh browser with no session.
Expected: a short public page, or a few lines above the sign-in box, saying what InvestIQ AI does and for whom.
Seen: an immediate jump to the sign-in form showing only the name, the line "Access your portfolio dashboard.", the two fields and a sign-up link.
Evidence: `screenshots/investor-en/024-phone-blind-phone-01-landing-phone.png`
Confirmed by an independent re-test: **not re-tested** — kept at the severity the tester gave it.
Fix brief: add three or four explanatory lines to the sign-in card (what it tracks, the multi-market conversion into rials, and the "no made-up numbers" promise), or a small public landing page. Judgement call for the owner [Likely]: because this is a private, single-investor product with sign-ups closed in production, nobody but the owner will ever see this screen, so this may be worth leaving alone — it is the one P1 here that the product's shape may excuse.

### P2

**After too many sign-in attempts the app blames your password — even when the password is right** (investor, desktop and phone, English, Certain)

What happened: enter the wrong password twelve times, then enter the correct one.
Expected: once the lock-out kicks in, say so — "too many sign-in attempts, try again in a few minutes".
Seen: all twelve attempts, and the correct one afterwards, show the same message: "Incorrect email or password." The server logs prove it switched to a rate-limit response on attempt eleven; the screen never says so.
Evidence: `screenshots/investor-en/100-desktop-edge-lockout-fail-a-locked-out-user-is-told-when-they-can-try-again-and-c.png`
Confirmed by an independent re-test: **not re-tested** (reported once, at P2).
Fix brief: on the sign-in page, handle the rate-limit response separately and show "Too many sign-in attempts. Please wait about N minutes and try again", using the wait time the server already sends back, rather than falling through to the generic wrong-password message. Real risk here [Likely]: a user who typed the right password and was told it was wrong will assume the account has been broken into.

**Empty states tell you to click buttons that are not on the page** (investor, desktop and phone, English, Certain)

What happened: open the MSFT thesis and read the check history; then read the weekly-review card on the dashboard and follow it.
Expected: with the AI switched off, the empty text should say so, not point at a control that has been hidden.
Seen: the thesis page says "No checks yet — click 'Check thesis now' above to run the first one", and there is no such button. The dashboard says "Run your first one from Reviews", and the Reviews page contains nothing but the AI-off card.
Evidence: `screenshots/investor-en/070-desktop-core-detail-thesis-detail.png`
Confirmed by an independent re-test: **not re-tested** (reported once, at P2).
Fix brief: make both empty-state sentences depend on the AI switch. With no key set, say "Thesis checks turn on when the AI key is set" and "Weekly reviews turn on when the AI key is set". Keep the current wording for when the button is actually on screen.

**A mistyped address drops a signed-in user onto a bare grey 404 with no way back** (investor, desktop and phone, English, Certain)

What happened: while signed in, type an address that does not exist, such as /dividends.
Expected: an InvestIQ page with the sidebar, or at least a "back to dashboard" link.
Seen: the plain black-and-white "404 — This page could not be found." No branding, no navigation.
Evidence: `screenshots/investor-en/081-desktop-edge-validation-404-page.png`
Confirmed by an independent re-test: **not re-tested** (the blind tester logged it as P3, the deeper run as P2 — reported here at the higher of the two).
Fix brief: add a not-found page inside the signed-in shell so it keeps the sidebar, with a short "that page doesn't exist" line and a back-to-dashboard button — the same treatment the "Thesis not found" page already gets right.

**The CSV importer accepts a trade dated the year 2099** (investor, desktop, English, Certain)

What happened: upload a CSV whose row has a trade date of 2099-01-01 and validate it.
Expected: "trade date is in the future", or at least a warning.
Seen: the row passes validation and is offered for import. The other four deliberately broken rows — bad date, negative quantity, unknown type, bad currency — were all caught with excellent plain-English messages.
Evidence: `screenshots/investor-en/077-desktop-edge-validation-import-validation-all-bad.png`
Confirmed by an independent re-test: **not re-tested** (reported once, at P2).
Fix brief: reject trade dates later than today in the import checker and in the shared transaction rules, so the Add Transaction form behaves the same way. A typo in a date column would otherwise sit in the history for years and quietly skew every "this year" figure.

**Stock rows look dead — nothing signals that a stock opens its own page** (investor, desktop and phone, English, Certain)

What happened: on Stocks, click anywhere on the Microsoft row except exactly on the ticker text.
Expected: the whole row opens the stock, or the ticker is obviously a link.
Seen: nothing happens. Only the ticker-and-name cell is a link, and it is plain black text with no colour, underline or arrow, so there is no reason to try it. The blind tester concluded there was no per-stock page at all; the deeper run found the page does exist and is rich (price chart, ratios, dividends, news) — it is simply invisible.
Evidence: `screenshots/investor-en/068-desktop-core-detail-stocks-list.png`, `screenshots/investor-en/069-desktop-core-detail-stock-detail.png`
Confirmed by an independent re-test: **not re-tested** (reported once, at P2).
Fix brief: make the whole row a link, with a pointer cursor, a hover background and a chevron at the row end, and style the ticker as a link — on Stocks, Watchlist, the portfolio Holdings table and the dashboard Holdings card. This is the cheapest big win in the report [Likely]: the best page in the product is currently hidden behind an invisible link.

**The stock page says dividend history needs a market-data connection, while your own dividends for that stock sit one click away** (investor, desktop and phone, English, Likely)

What happened: open a held stock, such as Saudi Aramco, and scroll to the dividends section.
Expected: at minimum the dividends actually recorded for that holding — the dashboard already computes exactly this and shows it under "Income by Holding".
Seen: "Dividend history requires a live market-data connection for this instrument", even though the app holds three recorded Aramco dividends and a computed twelve-month total for it.
Evidence: `screenshots/investor-en/069-desktop-core-detail-stock-detail.png`
Confirmed by an independent re-test: **not re-tested** (reported once, at P2).
Fix brief: on the stock page, show a "dividends you've received" block built from the user's own dividend transactions for that stock, badged "computed from your transactions", and keep the "needs live market data" message only for announced or forecast dividends and yield.

### P3

**Phone tap targets are far below the 44-pixel baseline** (investor, phone, English, Certain)

What happened: try to tap the small "?" helper next to "Unrealized gain/loss" on the phone, then the row actions button.
Expected: at least 44 by 44 pixels of touchable area, per the design baseline.
Seen: the four glossary "?" buttons measure 14 by 14; row action buttons 36 by 36; ticker links 34 by 18.
Evidence: `screenshots/investor-en/110-phone-phone-core-fail-tap-targets-on-portfolio-are-at-least-44px.png`
Confirmed by an independent re-test: **not re-tested**.
Fix brief: give icon-only buttons a 44 by 44 touch area through padding or an invisible overlay — the glossary "?" triggers, the row actions button, and the watch star.

**Refreshing in the middle of an import throws the file away without saying so** (investor, desktop, English, Certain)

What happened: upload a CSV, reach the validation step, then press browser refresh.
Expected: either the wizard remembers where you were, or it tells you the file was dropped.
Seen: it silently resets to step 1 with the file and the column mapping gone, and no message.
Evidence: `screenshots/investor-en/079-desktop-edge-validation-import-after-refresh.png`
Confirmed by an independent re-test: **not re-tested**.
Fix brief: remember the step, the parsed rows and the mapping for the length of the browser session, or show "your upload was cleared when the page reloaded — please choose the file again" on step 1.

**The dividend income total is one thousandth of a rial below the sum of its parts** (investor, desktop, English, Certain)

What happened: add up the six "Income by Holding" figures on the dashboard and compare with the headline twelve-month total.
Expected: the headline equals the sum of the parts.
Seen: the parts add to OMR 245.511; the headline says OMR 245.510. The total is rounded from the raw sum while each part is rounded first.
Evidence: `screenshots/investor-en/058-desktop-core-dump-dashboard-full.png`
Confirmed by an independent re-test: **not re-tested**.
Fix brief: add up the already-rounded per-holding figures for the headline, so the card and the breakdown always agree. Tiny, but in an app whose whole pitch is honest numbers, a penny that does not add up nags.

## Owner setup needed before launch (not code bugs)

- **The AI key.** Without it, thesis checks, the Investment Committee, weekly reviews, the health score and recent news are all switched off. Today those pages show an honest card: "AI features are turned off. Add an ANTHROPIC_API_KEY to your environment to turn this on. Nothing here is faked in the meantime." This is the app's headline promise and it is unavailable end to end. Seen on `screenshots/investor-en/062-desktop-core-dump-page-committee.png` and `screenshots/investor-en/063-desktop-core-dump-page-reviews.png`. Until the key is set, consider hiding Committee and Reviews from the sidebar rather than routing people to empty rooms.
- **The market-data key.** Without it, prices carry orange "Sample data" badges, the Change column on Stocks reads "—" on every row, and financial statements, ratios, dividend history and the "refresh rates from the provider" buttons all say they need a live connection.
- **The scheduled job.** Price alerts and weekly reviews cannot run until the scheduler secret is set. The alert dialog says honestly that alerts "only fire on live or manually entered prices — never on sample data".
- **Email.** Notifications and password reset need the email service switched on; it is dormant here.
- **Sign-ups.** Settings states plainly that "sign-up is currently open to anyone who can reach this app". That is the biggest go-live item and it is mentioned only on that one screen. Close it, or move the warning somewhere the owner sees it daily.

## Things that looked wrong but are not bugs

- The orange "Sample data" badge on the headline portfolio value. It is the honesty rule working: the quantities are the owner's, only the prices are stand-ins. It did unsettle the tester, who could not tell whether their own money was real, so the wording is worth softening to something like "your holdings at sample prices" (`screenshots/investor-en/041-desktop-blind-desktop-21-dashboard-desktop.png`).
- The "AI features are turned off" cards on Committee, Reviews, the thesis page and the dashboard health score. Dormant switch, honestly worded, and the tester called it a trust signal.
- The "—" in the Change column on Stocks, and the empty statements and ratios blocks. All waiting on the market-data key.
- Charts that look blank in full-page phone captures. They do draw on the phone once you scroll to them; the tester verified this and did not log it as a bug.
- The "already tracked" error is a symptom of the watchlist bug above, not of anything wrong with the owner's own data.
- The README and go-live docs are known to be out of date; nothing in this run depended on them.

## What worked well

- Every number audited reconciles exactly. Six holdings plus cash equal the headline OMR 9,014.021; each holding equals quantity times the sample price times the exchange rate printed in Settings; the twelve-month dividend income matches the six per-holding figures and the individual payments behind them.
- The CSV import round-trip is genuinely excellent: a four-step wizard, automatic column matching, and a dry-run table naming the row number and the reason in plain English ("Quantity must be greater than zero", "Type SPLIT is not recognized — use Buy, Sell, Dividend..."). After importing, cash and dividend income moved by exactly the amounts calculated by hand.
- Deleting the imported rows restored the original totals to the last decimal. The arithmetic is symmetric; nothing leaks.
- Double-clicking Save created exactly one transaction, going Back after saving did not re-submit, and the dashboard still loaded in 3.6 seconds on a throttled 3G connection.
- Accounts are properly separated: a brand-new account saw a genuinely empty app, and the owner's thesis address returned a friendly "thesis not found" with a way back.
- Destructive actions are handled with real care: deleting an account demands the password *and* typing DELETE; the alerts dialog volunteers that alerts never fire on sample data; "Download my data" returns a complete file in one click.
- Empty forms are rejected field by field ("Pick an instrument for Buy transactions") rather than with one vague error.
- No console errors, no page crashes and no unexpected server failures across twelve desktop and two phone sessions — the only failures in the logs were the deliberate 404 and the deliberate wrong passwords.
- On the phone, the drawer menu, the add-transaction sheet (it fits the screen exactly and the keyboard does not cover the fields), the thesis detail page and Settings all read well.

## What we could not test, and why

- Thesis checks, Investment Committee opinions, weekly reviews, the health score and recent news — the AI key is not set, so every one of those screens shows the documented "AI features are turned off" card.
- Real quotes, the price-change column, financial statements, ratios, dividend history and upcoming dividends — the market-data key is not set, so prices carry "Sample data" badges.
- Whether a price alert actually fires and notifies — the scheduler is dormant, and alerts are designed never to fire on sample prices.
- Email delivery, including notifications and password reset — the email service is dormant here.
- Account deletion from end to end — it would destroy the shared demo account. The confirmation dialog was opened and cancelled.
- "Refresh rates" and "prefill from market data" in Track a Stock — both need the market-data key and say so on screen.

## Phone verdict

This is a desktop-first product and it shows. The phone build is structurally sound: no page scrolls sideways, the hamburger drawer lists every section, the add-transaction sheet fits a 390 by 844 screen exactly and the keyboard does not cover the fields. But it is crippled by its tables. On Portfolio a user sees the ticker and the name but not the market value or the gain. On Theses they see that a thesis exists but not its verdict — the one thing they opened the page for. And when they do scroll a table sideways, the ticker scrolls away, so the numbers left on screen belong to nobody. Graded as a real user would: the phone is fine for a quick glance at the headline dashboard cards, and unusable for anything else. One re-tester found that a genuine finger swipe does reveal the hidden columns, which softens this from "impossible" to "confusing and effortful" — but with no fade, shadow or scrollbar to hint at it, most people will never try [Likely].

## Where testers disagreed

- **How serious the clipped phone tables are.** One re-tester graded it P1: the columns are unreachable, tapping a row does nothing, and the core "check my portfolio" journey has no reasonable workaround on a phone. The other graded the same defect P2: a real finger swipe does scroll the table (measured moving from 0 to 437 pixels across), and the half-cut statement column is a weak hint that more exists, so it is effortful rather than blocking. Both agree it is a real layout bug that needs fixing; they differ on whether it alone blocks a launch. This report keeps it at P1, the higher of the two.
- **Whether a per-stock page exists.** The blind tester concluded there is no per-stock detail page anywhere. The deeper run found the page does exist and is one of the richest in the product — it is only invisible because the link is styled as plain text. Both observations are kept: the page exists, and users will not find it.
- **Small details of the base-currency bug.** The original report said the Aramco holding vanishes from the dashboard Holdings card; the re-test found it is still listed there, honestly marked "Unavailable — no exchange rate", and that the dashboard does carry a general warning banner. The re-tester also measured the thesis statement cell at 256 pixels wide, not the 2,526 first reported. The damaging part — the understated dividend income still wearing the "computed from your transactions" badge, and no banner at all on the portfolio page — was confirmed exactly as reported.

## Numbers

P0 0 · P1 4 · P2 6 · P3 3 · owner-setup 5 · scenarios run 13 (passed 7, failed 5, blocked 1) · screenshots 40 in docs/user-testing/screenshots/. Build tested: commit b28c969 of /home/user/Long-Term-Investing-.

## Who this user really is

He is one person: a disciplined, Gulf-based long-term investor holding a small, concentrated book (5–10% per position) spread across US, Muscat, Tadawul and Dubai stocks in three currencies, who thinks in written reasons rather than tickers. Research section 1 calls him "The Owner-Investor… who thinks in theses, not tickers" [Likely] and states his practical job as "consolidate a multi-market, multi-currency portfolio into one honest OMR-based number and track dividends/returns without lying to himself about what's stale" [Likely]; the emotional job is to "replace daily anxious checking with a calmer weekly ritual he can trust" [Likely]. He is privacy-first and does not want a community feed [Likely], he is not a beginner, and he is not a trader. The single fact that most shapes the product sits in research section 4: "95%+ of Oman's population is online, almost all via smartphone… yet the product is currently built desktop-first" [Likely]. The second persona in the research — an invited friend or spouse — is guesswork only; section 7 admits "zero research evidence exists on what that person would expect" [Guessing], so nothing in the backlog below is built for them.

What he came for, and what he got: one honest number. He wants to open the app, see what the whole book is worth in rials, see what it paid him in dividends over the last twelve months, and never be shown a figure that might be made up — which is exactly what the golden rule in `docs/CONVENTIONS.md` promises, and exactly the weakness that makes people abandon the closest rivals ("cannot rely on the correctness of the info, which makes the tool useless", research section 3) [Likely]. On a laptop he got precisely that. The blind tester understood the product in 45 seconds, would continue, and said "It answered my dividend question in five seconds and I loved that it tells me which numbers are real" (First impressions, blind) [Certain]. Every number audited reconciles to the last decimal, the CSV import round-trip is called "genuinely excellent", and the honesty badges were named the best the tester had seen in a finance app [Certain]. First impression 74/100, core loop 65/100 — and the whole gap between those two numbers is the phone [Likely].

Where the research and the testing agree, and where they collide: they agree loudly on three things. Mobile is the primary surface (research change request 6, "Why isn't there a phone app?") and testing confirmed the phone is where the product falls apart (IQ-02, confirmed twice) [Certain]. Multi-currency display is the category's most-complained-about weakness (change request 3, "Can I see my whole portfolio in USD… instead of only OMR?") and testing found the switch exists but silently drops a holding and under-states dividend income by about 11% (IQ-01, confirmed twice) [Certain]. Trust-through-badges is the differentiator (research section 7: "the golden rule… directly targets the single most-repeated named failure mode") and the tester independently called it the best thing in the app [Likely]. They collide in two places. First, the research assumed the golden rule was safely delivered ("built: yes"); testing showed it can backfire and is in fact broken where it matters most — an orange "Sample data" badge sitting on the headline portfolio value left the tester unable to tell "whether their own money was real" (Things that looked wrong but are not bugs), and a clean "computed from your transactions" badge sat on an incomplete dividend total (IQ-01) [Certain]. Second, the research predicted friction about broker sync, manual price entry, the 25-a-day AI cap and the single-portfolio limit — none of those came up in testing at all; what actually stopped the user was far more ordinary: rows that look dead ("Stock rows look dead — nothing signals that a stock opens its own page", P2), an un-watch button with no way back (IQ-03), empty states pointing at buttons that are not on the page ("Empty states tell you to click buttons that are not on the page", P2), and an AI half of the product that could not be reached at all because the key is unset [Certain]. One thing expected and not found: this report prints short finding ids only in its screenshot filenames (IQ-01, IQ-02, IQ-03 for the three re-tested P1s); the P2 and P3 findings carry no ids, so everything below cites those by their exact headline sentence instead [Certain].

## What they will want

The Kano wishlist from `research.md` section 5, condensed, with what this test run actually saw.

| Item | Kano band | Already built? | Evidence strength | What testing showed |
|---|---|---|---|---|
| Never show a fabricated number; every figure carries a source badge | Must-have | Yes — the repo's golden rule | Strongest in the whole file: 6+ independent sources (competitor complaints + repo rule) [Likely] | **Confirmed and contradicted at once.** The tester called the badges the best they had seen in a finance app [Certain] — but IQ-01 leaves a clean "computed from your transactions" badge on a dividend total that is ~11% short, which is the rule breaking in public [Certain] |
| FX rate locked at each transaction's real date, never re-priced with today's rate | Must-have | Check — multi-currency exists, the lock is not confirmed in the docs | 3 sources [Likely] | **Not observed.** Nothing in the run tested historical re-pricing; it stays an open question [Likely] |
| Consolidated OMR total with each holding still shown in its home currency | Must-have | Check | 3 sources [Likely] | **Confirmed built and correct.** Six holdings plus cash equal the headline OMR 9,014.021, each with its own rate, date and source on show [Certain] |
| Frictionless manual price entry for Muscat, Tadawul and Dubai | Must-have | Yes (path exists); entry quality — check | Repo rule + market facts [Likely] | **Not observed as a complaint.** The tester never objected to manual entry; the research over-weighted this [Likely] |
| Download everything, and password-confirmed deletion | Must-have | Yes | Repo rule + Oman's PDPL [Certain] | **Confirmed.** "Download my data" returns a complete file in one click; deleting an account demands the password *and* typing DELETE [Certain] |
| Dividend tracking with per-holding withholding tax (e.g. Saudi 5%) | Expected | Check | 2 sources [Likely] | **Contradicted — not built.** Dividends are tracked and reconcile exactly, but nothing shows gross vs net of withholding [Certain] |
| Watchlist and alerts — few and high-signal, not generic price pings | Expected | Yes; granularity — check | 2 sources [Likely] | **Built but broken at the edge.** IQ-03: un-watching is a one-way door and the stock cannot be added back [Certain]. Alerts themselves could not fire — scheduler dormant [Certain] |
| A weekly review rhythm rather than a live ticking feed | Expected | Yes | 2 sources plus behavioural-finance backing [Likely] | **Blocked.** Reviews are built but asleep; the page shows only the AI-off card, and the dashboard points at it anyway [Certain] |
| Plain-English glossary next to metric labels | Expected | Yes | 1 source (repo) [Certain] | **Confirmed built, unusable on a phone.** The "?" triggers measure 14 by 14 pixels against a 44-pixel baseline (P3) [Certain] |
| Stock page with one glanceable fundamentals synthesis | Expected | Check | 1 strong source [Likely] | **Built and invisible.** One of the richest pages in the product, reachable only by clicking plain black ticker text ("Stock rows look dead…", P2) [Certain] |
| AI committee: six debating personas with a visible disagreements panel | Delighter | Yes (transcript-level citation — check) | Repo plus a model-prior warning [Guessing] | **Could not be tested.** The AI key is unset, so every committee screen shows the honest AI-off card [Certain] |
| Written thesis with an invalidation condition the weekly review checks | Delighter | Check | 1 emerging-category source [Guessing] | **Half seen.** Theses are written and readable; the checking half is switched off, and the empty state points at a "Check thesis now" button that is not on the page (P2) [Certain] |
| Currency effect vs price effect split out per position | Delighter | Check | 1 strong pain-point source [Likely] | **Not built, not observed.** Worth doing after the FX work lands — it reuses the same plumbing [Likely] |
| Position-concentration alert above a set % of the book | Delighter | Check | 1 low-confidence source on Gulf sizing norms [Guessing] | **Not observed.** Weight per holding is shown; no alert exists [Certain] |
| Genuinely earned invite-only exclusivity | Delighter | Yes | 1 source [Guessing] | **Confirmed as a shape, undermined by two details.** Account separation is real and clean [Certain]; but the sign-in wall explains nothing (P1) and Settings still says sign-ups are open to anyone who can reach the app [Certain] |

## What they will ask to change

The research's twelve predicted change requests, set against what the testers actually saw.

| Request | Seen in testing? | Suggested response |
|---|---|---|
| "Why can't I track a second portfolio — my spouse's, or my taxable vs tax-free buckets?" | Not observed | Say it straight: it was a security tightening, not a product decision, and it is on the list to design properly rather than guess at [Likely] |
| "Why do I have to type in every Muscat, Tadawul and Dubai price by hand?" | Not observed — the tester never complained about it | Hold the line: there is no reliable retail feed for those exchanges, and a fabricated live price is the one thing this app will never do [Certain] |
| "Can I see my whole portfolio in USD, AED or SAR instead of only OMR?" | **Yes — IQ-01**, confirmed twice | Do not promise it; admit it is built and currently wrong. The fix (derive the missing rate through the rial, and never let an incomplete figure wear a clean badge) is spec'd as change #2 below [Certain] |
| "Why does the AI committee only allow 25 debates a day?" | Not observed — the AI is switched off, so the cap was never reached | Keep the guardrail and the explanation; unreached, unverified [Likely] |
| "Can this sync with my broker instead of me uploading CSVs?" | Not observed — and the import was one of the run's highlights | Lean into the import instead: four-step wizard, automatic column matching, plain-English dry run, and a round-trip that restored totals to the last decimal [Certain] |
| "Why isn't there a phone app?" | **Yes — IQ-02**, confirmed twice, and it is the report's only "Not ready" trigger | Agree without hedging and ship change #1: stacked cards below phone width [Certain] |
| "Can I invite my spouse and give them their own portfolio, not just a view of mine?" | Not observed — but account separation was verified clean | Ask rather than guess; the research itself has zero evidence on what a second user expects [Guessing] |
| "Why don't the weekly-brief emails just show the numbers?" | Not observed — email is dormant | Same rule, applied to email: the message links into the app where the figure is live and badged [Likely] |
| "Why doesn't a dividend show what tax was actually withheld?" | Not observed, and confirmed missing | Genuine gap. Show gross and net per market, badged — Saudi's 5% non-resident withholding is real and material [Likely] |
| "The app covers Gulf markets, so why is it English-only, left to right?" | Not observed — only English was tested | A written-down v1 boundary, not an oversight; Arabic and right-to-left is a larger project that has not been scheduled [Certain] |
| "Why six opinions instead of just telling me buy or sell?" | **Could not be observed** — the committee is off end to end | The dissent is the point, but this stays untested until the key is set [Likely] |
| "Can I get a push notification instead of opening the app?" | Not observed — scheduler dormant, no native app | Tied to the phone work; out of scope until the phone surface is fixed [Likely] |
| "Why does an old closed position still show up everywhere?" | Not observed | Offer an archive or filter if it turns out to clutter a view [Guessing] |
| *(new, not predicted)* "I clicked a stock and nothing happened" | **Yes** — "Stock rows look dead…", P2 | The cheapest big win in the report: make the whole row an obvious link (change #3) [Certain] |
| *(new, not predicted)* "Why can't I get a stock back on my watchlist?" | **Yes — IQ-03** | Make Track-a-Stock re-add it, add an undo toast and a search box (folded into change #3) [Certain] |

## What a prospect will object to in a demo

Both lenses merged and de-duplicated. Order: deal-breakers first.

| Objection | Severity | The honest answer the owner can give today |
|---|---|---|
| "Show me on your phone — I opened it and I can't see what anything is worth." | Deal-breaker | You're right, and it is the number one thing being fixed. The app was built laptop-first: on a phone the headline dashboard cards, the drawer menu, the charts, the add-transaction sheet and Settings all work properly, but the tables clip — on Portfolio you see the ticker and the name while the value and gain sit off the right edge with nothing to say they are there, and on Theses you see the name but not the verdict. Use a laptop for now; the fix is stacked cards below phone width and it is the next build item. I won't pretend it works today. |
| "I don't think in rials. Can I see the whole thing in dollars?" | Deal-breaker | There is a switch in Settings, but don't use it yet. With the rates currently stored, one holding drops out of the breakdowns and the twelve-month dividend total comes back about 11% short while still looking like a clean, verified figure. That is a confirmed bug and it is second on the build list precisely because a wrong number wearing an honest badge is the worst thing this app can do. Rials are correct to the decimal; that is the accurate view today. |
| "You called it InvestIQ AI — where is the AI? Every AI page says it's switched off." | Deal-breaker | Correct, and all of it is built: thesis checks, the six-persona committee, weekly reviews, the health score and news all wait on one API key that isn't set on this machine. What you see instead is deliberate — the app says plainly the feature is off and that nothing is faked in the meantime, rather than showing you a made-up score. Judge it today on the parts that are live and correct: your whole book in rials, twelve months of dividends, transactions, CSV import and your written theses. |
| "Why does it say 'Sample data' next to my portfolio value? Is my money made up?" | Friction | Your holdings, quantities and transactions are real; only the prices are stand-ins until the market-data feed is connected. That badge is the product's core rule doing its job — it would rather admit a price is a placeholder than quietly show you something that looks live. Every rival gets complained about for showing numbers you can't trust; this one refuses to. The wording is being softened to "your holdings at sample prices", because it startled our tester too. |
| "I clicked a stock and nothing happened — there's no detail page?" | Friction | There is, and it's one of the richest pages in the app: price chart, ratios, dividends, news. Right now only the ticker text is a link and it's styled as plain black, so the row looks dead. Click exactly on the ticker and it opens. Making the whole row obviously clickable is a same-week fix. |
| "Can it just connect to my broker instead of me uploading files?" | Friction | No, and that's deliberate rather than unfinished — there's no reliable retail feed for Muscat, Tadawul or Dubai, and broken broker syncs are the single most-complained-about feature in every competing product. What there is instead is a very good import: a four-step wizard, automatic column matching, and a dry run naming the row number and the reason in plain English before anything is saved. Our tester imported, checked the totals by hand, deleted the rows, and the numbers came back exactly. |
| "Why do I have to type Muscat and Tadawul prices by hand?" | Friction | Because there is no live price feed for those exchanges available to a retail investor — trading them needs an investor number and a licensed broker, with no self-serve data API. Only US stocks can be priced automatically. The choice is manual entry with an honest "as of" date, or a fabricated live price, and this app will never do the second one. |
| "Can I add my wife's account, or a second portfolio for a different bucket?" | Friction | One portfolio per account today. A second person gets their own account, and testing confirmed the separation is real — a brand-new account sees a genuinely empty app and cannot reach the first account's data. What doesn't exist is any way to share or part-share a portfolio between two people. That hasn't been designed, and I'd rather ask you what you'd expect than guess. |
| "I clicked your link and got a bare login box. What is this thing?" | Friction | It's invitation-only, so there's no marketing page — sign-in is the front door, and today that door explains nothing. Fair criticism, and a few explanatory lines are cheap to add. More important and related: the settings screen currently says sign-up is open to anyone who can reach the app, so that should be closed off before this address is shown around. |
| "How do I know any of these numbers are right?" | Minor | They were checked by hand rather than taken on trust: six holdings plus cash equal the headline total; each holding equals quantity times the printed price times the printed exchange rate; the twelve-month dividend income matches the six per-holding figures and the individual payments behind them. Every figure carries a badge saying where it came from — live, manual with its date, sample, or computed from your own transactions. The one place that rule is currently broken is the dollar view above, and I'd rather tell you that than let you find it. |
| "It's aimed at Gulf markets — is there Arabic?" | Minor | No. English-only, left to right, and that's a documented v1 boundary rather than an oversight — Arabic and right-to-left is a genuinely large project that hasn't been scheduled. The Gulf part of this product is the data: Muscat, Tadawul and Dubai holdings consolidated with US ones into one rial total, which is the thing no other tracker in the research actually does. |

## Top-3 recommended changes

All three are fixes rather than new features, and that is deliberate. The verdict at the top of this report is "Not ready", which lifts the usual limit of one bug-fix bundle [Certain]. It is also the honest read of the evidence: this product is not short of features — every audited number reconciles, the CSV round-trip is excellent, the badges were called the best the tester had seen in a finance app, and first impression scored 74/100 with a 45-second time-to-understanding. The gap between that and the 65/100 core loop is entirely the phone, a broken currency switch, and built work users cannot find [Likely]. Building anything new before these three land would add more surface to a product whose existing surface is not yet reachable [Likely].

**1. Make the phone show the money: stacked cards below 640px, and buttons a thumb can hit**

Why: this is the single item that changes the verdict. IQ-02 is confirmed twice — on a 390-wide phone the Holdings, Theses, Stocks and Watchlist tables show only the ticker and name, the quantity is chopped mid-number ("3,0" standing in for 3,000 shares), and scrolling sideways loses the ticker so a gain belongs to no visible stock [Certain]. A chopped number displayed as if it were whole is a wrong number on screen, which `CONVENTIONS.md` treats as a golden-rule breach rather than a styling preference [Likely]. It sits directly on top of the research's most load-bearing local fact — "95%+ of Oman's population is online, almost all via smartphone… yet the product is currently built desktop-first" (research section 4) and predicted change request 6, "Why isn't there a phone app?" [Likely]. The P3 finding "Phone tap targets are far below the 44-pixel baseline" is folded in, so the phone gets one complete pass instead of two visits [Certain].
Effort: medium — one focused build, front-end only. Four tables plus icon-button touch areas; no database change, no new API, no change to how any figure is calculated [Likely].
Spec: `../../../Agents/docs/specs/investiq/phone-tables-as-cards.md` — absolute: `/home/user/Agents/docs/specs/investiq/phone-tables-as-cards.md`

**2. No wrong number, no clean badge on an incomplete one: derive the missing rate through the rial and warn everywhere**

Why: IQ-01 is the golden rule failing in public, and the golden rule is the whole differentiator. Switching the base currency from rials to dollars drops the Aramco holding out of the sector, country and market breakdowns, and reports twelve-month dividend income about 11% short while still wearing the badge "Computed from your transactions" — with no banner at all on the portfolio page [Certain]. Research section 3 records that the most-repeated complaint about every rival is "cannot rely on the correctness of the info, which makes the tool useless", and predicted change request 3 is exactly "Can I see my whole portfolio in USD… instead of only OMR?" — so this is simultaneously the launch gate and the sellable difference [Likely]. Three smaller findings ride along in the same build because they are the same discipline: the P2 "The CSV importer accepts a trade dated the year 2099" (applied in the shared transaction rules so the Add Transaction form behaves identically), the P3 "The dividend income total is one thousandth of a rial below the sum of its parts", and softening the headline "Sample data" badge to something like "your holdings at sample prices", which the report's not-bugs section shows unsettled the tester [Certain].
Effort: medium — one build, concentrated in the money-and-rates code and the cards that display it, plus one shared validation rule. The dividend functions already return a "what's missing" list, so the honest warning is display work rather than new calculation [Likely].
Spec: `../../../Agents/docs/specs/investiq/honest-currency-switch.md` — absolute: `/home/user/Agents/docs/specs/investiq/honest-currency-switch.md`

**3. Make the best page in the product findable and safe: clickable rows, a reversible un-watch, and the dividends he was actually paid**

Why: this is what makes a demo land with both API keys switched off. The P2 finding "Stock rows look dead — nothing signals that a stock opens its own page" hides the richest page in the app behind plain black text — the blind tester concluded no such page existed at all [Certain]. IQ-03 shares that same screen: un-watching a stock is a one-way door, and Track-a-Stock then refuses with "already tracked", with no search box and no undo, so the only repair was typing an internal address [Certain]. Both fixes live on one page, so shipping them separately would mean touching Stocks twice [Likely]. The build closes with the P2 "The stock page says dividend history needs a market-data connection, while your own dividends for that stock sit one click away" — a "dividends you've received" block badged as derived from the user's own transactions, which is the one item in the whole backlog that creates a first-session aha moment with no keys at all [Likely]. Build in that order — clickable rows, then un-watch reversibility, then the dividends block — so if the first two grow the third slips to the next build rather than splitting the slot.
Effort: small to medium — one build in three ordered pieces; the re-add path reuses the existing rate-limited watchlist action, so nothing new is exposed [Likely].
Spec: `../../../Agents/docs/specs/investiq/findable-stock-pages.md` — absolute: `/home/user/Agents/docs/specs/investiq/findable-stock-pages.md`

### The rest of the backlog

- Tell a locked-out user they are locked out, instead of blaming their password (P2 — a user who typed the right password will assume the account was broken into) [Likely]
- Make every AI-off screen honest end to end — no "Check thesis now" button that does not exist, and hide Committee and Reviews from the sidebar rather than routing people to empty rooms (P2) [Certain]
- A branded not-found page inside the signed-in shell, with a way back — the same treatment "Thesis not found" already gets right (P2) [Certain]
- Do not throw away an in-progress import when the page reloads — remember the step and the mapping, or say plainly that the upload was cleared (P3) [Certain]
- Say what the app is before sign-in: three or four lines on the sign-in card, or a small public landing page (P1, but [Likely] excusable while sign-ups are closed and only the owner ever sees that screen)
- A "since you last looked" card — the weekly ritual built from his own transactions and stored prices, while the AI key is still off (research-derived, not observed in testing) [Guessing]
- Split each position's gain into price move vs currency move — the answer to "is this red because the stock fell or because the dollar moved?" (research delighter; do it after the FX work in #2 lands, it reuses the same plumbing) [Likely]
- Show dividends gross and net of withholding tax, per market — Saudi's 5% non-resident withholding is real and material (research-derived) [Likely]
- Per-market freshness: say which market a price is from and when that market last closed, since Muscat and Dubai trade Sunday to Thursday and the US trades Monday to Friday (research-derived; one global "as of" clock is where the golden rule would quietly break) [Likely]
- Owner setup, not a build: close sign-ups, set the AI key, the market-data key, the scheduler secret and email — this report lists five owner-setup items and calls open sign-ups "the biggest go-live item", mentioned on only one screen [Certain]

## Focus score

**62 / 100.**

This app is closer to finished than its "Not ready" verdict sounds, and that is what carries the score above the middle: almost the whole must-have list is built, every number audited reconciles to the last decimal, and the three confirmed P1s are fixes to work that already exists rather than features still to be invented — a month of focused work plausibly moves it from "Not ready" to shippable [Likely]. It is held back from a higher number by distance to money: the product is private and invitation-only with no price, no payment path and no second user, so a subscription is a later decision rather than a near-term return, and the AI half that gives the product its name has never once been seen working because the key is unset [Certain]. The demand evidence is real but indirect — the research documents loud, repeated complaints about every rival's untrustworthy numbers and currency handling, and no comparable product was found that consolidates Muscat, Tadawul, Dubai and US holdings into one rial total, but not a single Gulf investor's own voice was ever captured, so demand is inferred from competitors' failures rather than observed [Guessing].
