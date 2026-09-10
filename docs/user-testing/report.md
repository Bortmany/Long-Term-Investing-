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
