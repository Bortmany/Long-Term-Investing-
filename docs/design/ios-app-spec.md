# InvestIQ AI — iOS App Design Spec

*A written design document only — no code. A future iOS developer (or a
wrapper project) should be able to build from this. The existing Next.js API
is the backend; nothing here changes it. Phases 3–6 features (stock pages, AI
health scores, theses, committee, weekly reviews) are specced in
`docs/BUILD-PLAN.md` but not built yet — the app design leaves quiet room for
them rather than pretending they exist.*

## 1. What the app is and who it's for

InvestIQ is a **private, invite-only** long-term investing companion. It
tracks the owner's portfolios across markets (US, Muscat, Tadawul, Dubai),
derives holdings, cash and dividend income from transactions, and — in later
phases — layers on AI analysis. The golden rule is baked into the code and
must survive the trip to iOS: **the app never shows a made-up number** —
every figure carries a source badge (*live*, *manual as of a date*, or
*sample data*), and when a source is unavailable the app says so instead of
guessing. The audience is one careful long-term investor (and eventually a
small invited circle), not the public. Sign-ups are closed server-side; the
app is a sign-in-only door.

## 2. Navigation model

**Tab bar — 4 tabs (quiet apps don't need five):**

| Tab | Existing screen it maps to |
|---|---|
| Dashboard | Portfolio overview — total value, holdings, cash, dividends |
| Portfolios | Per-portfolio detail across the four markets |
| Activity | Transactions list + entry (the Phase 2 work) |
| More | Settings, data export/delete, source-badge legend, sign out |

**Future phases slot in without redesign:** when Stocks, Theses, Committee
and Reviews are built, "Activity" stays and a fifth "Research" tab gathers
them. Until then the app simply doesn't show them — no "coming soon" tabs on
a phone; placeholders are a web pattern.

**Modals:** add transaction (sheet — buy/sell/dividend/cash, the fields the
Phase 2 server work already accepts), transaction detail (sheet), source-
badge explainer (small sheet from tapping any badge), Face ID unlock
(full-screen cover).

**Deep links** (`investiq://`): `dashboard`, `portfolio/<id>`,
`activity`. Minimal on purpose — a private app has few external doors.
CSV import stays web-only (file mapping is desk work).

## 3. Screen-by-screen notes

Design language: **quiet slate + blue, Linear-like.** Slate surfaces, one
restrained blue accent, generous whitespace, small precise type, no
celebration animations, no red/green emotional coloring beyond a subdued
gain/loss tint. Source badges are tiny grey-outline chips — always present,
never shouting. The app should feel like a well-kept ledger.

**Dashboard** — total portfolio value at top with its badge and an explicit
"as of" line beneath (live values say when fetched; manual values say the
date they were entered — the badge behavior mirrors the web exactly).
Below: value by market (US, Muscat, Tadawul, Dubai) with FX noted, cash
balances by currency, dividend income this year. A single value-over-time
chart, drawn only from data points the server actually has — no
interpolation dressed as history. When the market-data service is
unavailable: the honest state, "US prices unavailable right now — showing
last manual values", never a silent stale number.

**Portfolios** — one card per portfolio; detail shows holdings (ticker,
shares, cost basis, current value + badge, unrealized gain in quiet tint),
cash, and dividends received. Sorting by weight or gain. Every derived
figure traces to transactions — tapping a holding shows the transactions
that built it.

**Activity** — reverse-chronological transactions across portfolios with
filters. Add-transaction sheet: type, instrument, quantity, price, currency,
date, fees — matching the tested Phase 2 server contract. Manual price
entries are badged *manual as of ⟨date⟩* immediately.

**More** — account, **Your data** (download a complete copy — the existing
export; and permanent account deletion — the existing danger card; both are
already product features, so the app inherits App Store compliance for
free), source-badge legend, Face ID settings, links to `/privacy` and
`/terms`, sign out.

## 4. Native affordances

**Face ID / Touch ID — on by default, first-class.** This is a private
financial ledger; the app locks on background, blurs its content in the app
switcher (so portfolio values never appear in screenshots of the multitasking
view), and requires biometrics to reopen. Passcode fallback; optional
"relax to 5 minutes" setting.

**Widget — portfolio value (small + medium), honest by design:** total value
with its source badge and the "as of" timestamp rendered inside the widget
itself. A widget that can go stale MUST show its age — this is the golden
rule applied to WidgetKit. Medium adds per-market values. An optional
"privacy mode" shows the day's change only, hiding absolute value on the
home screen.

**Notifications — almost none, deliberately.** A quiet app doesn't buzz.
Two opt-in triggers only: "Your weekly review is ready" (when Phase 6
exists) and "A dividend was recorded". No price alerts — this is a
long-term companion, not a trading app; price-noise notifications would
betray the product. Requires APNs server support later — flag, don't build.

**Haptics:** nearly silent. A single soft confirm on saving a transaction.
No success fanfares.

**Share sheet:** none in v1. Private means private; an export lives in
Settings, not a share button beside the portfolio value.

## 5. Dark/light mode

**Both, dark-leaning.** The slate palette is designed dark-first (the
Linear feel); light mode is a proper light slate, not inverted colors.
Follow the system; manual override in More. Charts and badges must remain
legible in both.

## 6. Data & sync

- Talks to the existing Next.js API with the Better Auth session; token in
  the Keychain. Sign-ups stay closed (`ALLOW_SIGNUPS` is server-side law);
  the app shows sign-in only and a "registration is closed" note matching
  the web.
- Market data, FX, and portfolio math all stay server-side — the app never
  computes or fetches prices itself, so there is exactly one source of
  badge truth.
- **Offline:** the last-fetched dashboard and portfolios are cached and
  shown with their badges plus a clear "offline — data as of ⟨time⟩"
  banner. Stale is fine; stale-pretending-to-be-live is the one forbidden
  state. New transactions queue offline and submit on reconnect (they are
  dated facts, safe to queue), marked "will sync".

## 7. App Store notes

- **Distribution decision for the owner (flagged):** an invite-only personal
  app may not belong on the public App Store at all. **TestFlight** (free,
  up to 100 internal / 10k external testers, renewable builds) or *Apple
  Business Manager custom apps* fit better than a public listing that
  everyone can download but no one can register for. App Review guideline
  4.2/5.1 friction with "registration is closed" apps is real. Recommended:
  TestFlight first; public listing only if the product opens up.
- If publicly listed: **Category** Finance, **age rating** 4+.
- **Privacy questionnaire (honest answers):** email (account), financial
  info (transactions, holdings, cash balances), linked to the user; no
  tracking, no ads, no data sold. The existing `/privacy` page is the
  written policy; the in-app export and delete controls already satisfy
  Apple's account-deletion requirement.
- AI features (later phases) show an honest "AI is turned off" state without
  a key — keep that behavior in review notes when the time comes.
