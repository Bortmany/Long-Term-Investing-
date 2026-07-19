# InvestIQ AI — UI Spec, Phases 2–6

Desktop-first personal tool (English only, LTR, single owner — no i18n/RTL work). Ground truth for
visual language is `docs/design/ui-spec-phase-1.md` (design tokens, the golden-rule
`SourceBadge` component, app shell, empty-state, loading/error patterns) — **this document does not
repeat those, it builds on them.** Read that spec first. Every rule in `docs/CONVENTIONS.md` (the
golden rule, the AI rule, the data-provider rule) applies to everything below without exception.

The app shell (`src/components/app-shell.tsx`) already defines three breakpoints — desktop ≥1024px
(240px sidebar), tablet 768–1023px (64px icon rail), mobile <768px (top bar + drawer) — and wraps
page content in `max-w-6xl` (or narrower, per-page, see below). Every screen in this document is
specified **desktop-first** because that's how the owner actually uses this tool, but every layout
below states how it collapses at the other two breakpoints. Nothing is phone-only; nothing needs
Arabic/RTL handling.

This is one spec covering five phases so five different builders (working one phase at a time,
without seeing each other's work) land on the same visual language. Section 2 is the shared
foundation — **build it once, early (ideally as part of Phase 2), and every later phase imports
from it rather than re-inventing.**

---

## 1. What's already fixed (do not re-derive)

- Design tokens: slate neutrals, blue accent (primary actions/active states/links only), green/red
  reserved for **signed numeric monetary or return figures** (see the tightened rule in §2.6 below —
  Phase 1 declared green/red for "gains/losses"; this spec narrows exactly what counts), amber for
  warning/needs-attention, no gradients, no glow, `lucide-react` icons, Geist/Inter via `next/font`.
- `SourceBadge` (`src/components/source-badge.tsx`) — `live` / `manual` / `sample`, two sizes
  (`default` pill, `sm` icon+tooltip). Every non-AI number on screen carries one. §2.1 below adds a
  fourth variant, `derived`.
- `EmptyState` (`src/components/empty-state.tsx`) — icon-in-circle + heading + sentence template.
  §2.2 below adds one small required prop.
- `AppShell`, global loading-skeleton pattern (§6 of Phase 1), global error boundary (§7 of Phase 1).
- Hand-written primitives already built, no Radix, CLI unavailable: `Button`, `Card`, `Table`,
  `Badge`, `Skeleton`, `Alert`, `Sheet`, `Tooltip`, `Input`, `Label`, `Avatar`, `Separator`. New
  primitives in this document follow the exact same house style: a small controlled component with
  its own local state/context, mirroring the shadcn component API shape so call sites read the same,
  but with none of the Radix internals. No new npm dependency is introduced anywhere in this spec —
  `recharts` is already installed (`package.json`) and is what powers every chart below.
- Formatting: `formatMoney(amount, currency)` (OMR 3dp, others 2dp), `formatQuantity`,
  `formatShortDate`. This spec asks for two small additions in §2.8.

---

## 2. Shared foundation — build once, reuse in every phase

### 2.1 `SourceBadge` — new `derived` variant (required code change, not just a new screen)

Add a fourth variant to `src/components/source-badge.tsx`:

| Variant | Label text | Color | Icon |
|---|---|---|---|
| `derived` | "Computed from your transactions" | `text-slate-600`/`text-slate-400` (same neutral treatment as `live`/`manual` — this is not a warning) | `Calculator` (lucide) |

Same two sizes (`default` pill, `sm` icon+tooltip) as the existing three variants, same code paths.

**Required follow-up fix, not optional:** `badgePropsForValueSource` and `badgePropsForValueSources`
currently map `{ kind: "derived" }` sources to `variant: "sample"`, with a comment explaining that in
Phase 1 all transactions were seed data so calling it "sample" was the honest choice. Phase 2 adds
real transaction entry (Add Transaction, CSV import) — transactions are no longer only seed data.
Update both helpers to return `variant: "derived"` for `{ kind: "derived" }` sources. Cash Balance
and Trailing Dividend Income on the Dashboard (both purely transaction-derived) switch from "Sample
data" to "Computed from your transactions" the moment Phase 2 ships. Seed-only data (nothing entered
by the user yet) still correctly shows `sample` wherever the underlying price/quote is seeded — this
change only affects the *derived* case.

### 2.2 `EmptyState` — one new optional prop

Several Phase 2–6 empty states need a call-to-action button (New Thesis, Add Transaction, Track a
Stock, Run weekly review), not just the "Coming soon" badge Phase 1 needed. Add:

```
action?: React.ReactNode
```

Rendered last, `mt-4` (replacing the `comingSoon` badge slot when both aren't used together — in
practice a screen uses either `comingSoon` or `action`, never both). No other change to the
component's shape or the four pages (Portfolio/Stocks/Theses/Committee/Watchlist/Reviews/Settings)
that still legitimately show the plain "Coming soon" empty state where this phase set doesn't touch
them (Watchlist standalone page — see the note in §4.1).

### 2.3 New hand-written primitives

All five follow the existing house rules: a local React context/state (no portal library), mirror
the shadcn compound-component *shape* only where it doesn't require floating-UI positioning logic
neither Radix nor this repo has; where a full floating popover isn't worth hand-rolling, this spec
deliberately picks the simpler, more robust option (native `<select>`) over a pixel-perfect shadcn
clone. Put each in `src/components/ui/`, one file per primitive, matching the existing file naming
(`dialog.tsx`, `select.tsx`, `tabs.tsx`, `textarea.tsx`, `dropdown-menu.tsx`).

**`Dialog`** (`dialog.tsx`) — centered modal, built the same way `Sheet` was: React context for
`open`/`onOpenChange`, a fixed `inset-0 bg-black/50` overlay that closes on click, Escape-to-close,
and the same focus-trap/focus-restore logic already written for `SheetContent` (copy it, don't
re-derive it — same `FOCUSABLE_SELECTOR` + `getFocusable` helpers). Difference from `Sheet`: the
panel is centered, not slide-in. `role="dialog" aria-modal="true"`, labelled by `DialogTitle`'s id.
Visual: `bg-white dark:bg-slate-900`, `border border-slate-200 dark:border-slate-800`, `rounded-lg`,
`shadow-lg`, `p-6`, a `size-11` close `X` button top-right identical to `Sheet`'s. Subcomponents:
`Dialog`, `DialogContent` (`className` controls max-width per call site — `max-w-md` (448px) for
short forms like Update Price / confirm-delete, `max-w-lg`/`max-w-xl` for Add Transaction), `DialogHeader`,
`DialogTitle`, `DialogDescription`, `DialogFooter` (`flex justify-end gap-3 mt-6` — always Cancel
first, primary action last). On screens <640px the panel becomes near-full-width
(`inset-x-4` effectively, or `max-w-[calc(100vw-2rem)]`) and scrolls internally if taller than the
viewport (`max-h-[85vh] overflow-y-auto`).

**`Select`** — deliberate, documented deviation from a shadcn-style floating listbox: this is a
styled wrapper around the **native `<select>` element**, visually matching `Input` (`h-10 w-full
rounded-md border border-input bg-transparent px-3 text-sm shadow-sm`, plus a `ChevronDown`
(lucide, 16px) absolutely positioned `right-3` and `pointer-events-none`). API is simpler than
shadcn's compound `Select`/`SelectTrigger`/`SelectContent`/`SelectItem`: a single component,
`<Select value onValueChange options={{value, label}[]} placeholder? disabled? />`, used exactly
like `<Input>`. Reasoning to state plainly for builders: with no Radix, a compound floating listbox
is a lot of hand-rolled positioning/keyboard/scroll-lock code to buy back what a native `<select>`
already gives for free (full keyboard support, screen-reader support, mobile-native picker UI on
touch devices). This is the right trade for a personal tool. Disabled state:
`opacity-50 cursor-not-allowed`.

**`Tabs`** — controlled, context-based. `Tabs` (value/onValueChange), `TabsList`
(`flex gap-1 border-b border-slate-200 dark:border-slate-800`), `TabsTrigger` (`button`, `role="tab"`,
`aria-selected`, `min-h-11 px-3 text-sm font-medium border-b-2 -mb-px`; active:
`border-blue-600 text-blue-700 dark:border-blue-500 dark:text-blue-300`; inactive:
`border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100`),
`TabsContent` (`role="tabpanel"`, `pt-4`). Left/Right arrow-key roving focus between triggers is a
nice-to-have, not required.

**`Textarea`** — identical classes to `Input` but a `<textarea>`, default `rows={4}` `min-h-24
resize-y`. A `className="font-mono text-xs"` override is used once (CSV paste box, §4.2) — that's a
prop override at the call site, not a second component.

**`DropdownMenu`** — non-modal popover for per-row actions (2+ actions; a single action is just a
plain icon button, don't reach for this). `DropdownMenu` (context: open/onOpenChange),
`DropdownMenuTrigger` (usually a `Button variant="ghost" size="icon"` with `MoreVertical`),
`DropdownMenuContent` (`absolute top-full right-0 mt-1 z-50 min-w-40 rounded-md border
border-slate-200 bg-white py-1 shadow-lg dark:border-slate-800 dark:bg-slate-900`),
`DropdownMenuItem` (`button role="menuitem" w-full px-3 py-2 text-left text-sm hover:bg-slate-100
dark:hover:bg-slate-800`; pass `variant="destructive"` for delete-type items →
`text-red-600 dark:text-red-400`), `DropdownMenuSeparator` (`my-1 h-px bg-slate-200
dark:bg-slate-800`). Closes on: item click, an outside `mousedown`, or Escape (focus returns to the
trigger on Escape). No focus trap — it's not modal. Implementation note to flag, not a design
blocker: the panel is positioned with plain CSS (`absolute`), which assumes no `overflow:hidden`
ancestor clips it; if a table's `overflow-x-auto` wrapper clips a menu on the last visible row,
either open upward for rows near the bottom of a table, or size tables so this rarely triggers — a
personal tool with short tables can live with this; not worth hand-rolling a bounding-rect
positioning engine for it.

### 2.4 Confirm-delete pattern (built on `Dialog`, reused everywhere something can be deleted)

One shape, reused for deleting a transaction, an FX rate, or anything else this spec adds:
`DialogTitle` — "Delete {thing}?"; `DialogDescription` — one sentence naming the specific thing being
removed (never generic "Are you sure?"); `DialogFooter` — `Button variant="outline"` "Cancel" +
`Button variant="destructive"` "Delete". While the delete request is in flight, the Delete button
shows `Loader2` + "Deleting…" and is disabled; Cancel is disabled too so the dialog can't be dismissed
mid-request.

### 2.5 AI components — build once in Phase 3, every later phase imports them unchanged

Phase 3 is first to need these, but Phases 4, 5 and 6 all reuse them as-is. Specifying them once
here so a Phase-4/5/6 builder who hasn't seen Phase 3's code still implements the identical thing.

**`ConnectKeyNotice`** (`src/components/connect-key-notice.tsx`) — the first-class "AI is off" state.
Shown instead of *any* AI trigger button or AI output, everywhere, whenever `ANTHROPIC_API_KEY` is
unset server-side. Visual: `border border-slate-200 dark:border-slate-800 bg-slate-50
dark:bg-slate-900 rounded-lg p-6` flex column, centered, `KeyRound` icon (28px, `text-slate-400`),
then:

- Heading (`text-base font-semibold`): **"AI features are turned off"**
- Body (`text-sm text-slate-500 dark:text-slate-400`): **"Add an ANTHROPIC_API_KEY to your
  environment to turn this on. Nothing here is faked in the meantime."**

No button — there is nothing to click in-app (it's a server environment variable, not an in-app
setting; unlike `FMP_API_KEY`'s "Refresh from FMP" button in Settings, there is no AI equivalent
settings control in this scope). This exact component, exact copy, every time — never paraphrased
per-screen.

**Standard no-key page pattern:** on any page whose whole purpose is one AI feature (Committee,
Reviews), the header's primary AI-trigger button ("Convene Committee", "Run weekly review") is
**hidden entirely** (nothing to click) and the main content area shows `ConnectKeyNotice` instead of
the list/table it would otherwise show. On pages where AI is one panel among other real content
(Stocks detail's Health Score panel, Theses detail's Latest Check, a stock's News section), only that
panel's content area is replaced by `ConnectKeyNotice` — the rest of the page (price, statements,
etc.) renders normally, since those don't need AI.

**`AiPanel`** (`src/components/ai-panel.tsx`) — the one container every persisted `AiAnalysis` result
renders through. Props: `title` (CardTitle text), `actionLabel` (button text, e.g. "Convene
Committee"), `onAction` (or a form action), `analysis` (the persisted row, or `null` if none exists
yet), `isPending` (bool, a new run is in flight), `readOnly?` (bool, hides the action button
entirely — used for viewing a specific historical run, see §7.1), `hasKey` (bool, whether
`ANTHROPIC_API_KEY` is set), children/content-renderer for the analysis-specific body.

Structure: `Card`. `CardHeader`, `flex-row items-center justify-between`: `CardTitle` left,
`Button variant="outline" size="sm"` right showing `RefreshCw` + `actionLabel` (hidden when
`readOnly` or `!hasKey`). Directly under the header, when an `analysis` exists, a caption line
(`text-xs text-slate-500 dark:text-slate-400 px-6 -mt-2 mb-2`) in this **exact, fixed format**:

> **"Analysis from {createdAt, short date} · {model} · based on data as of {dataAsOf, short date}"**

(three fields, separated by " · " — space, middle dot, space; both dates through `formatShortDate`;
`{model}` is the literal string stored on `AiAnalysis.model`, e.g. "claude-sonnet-5" — never
paraphrased or reformatted.) `CardContent` holds the analysis-specific structured content (each
phase below defines its shape). `CardFooter` always ends with `AiDisclaimer` (omitted only when
`ConnectKeyNotice` has replaced the content — nothing to disclaim about analysis that isn't shown).

States, in order of precedence:
1. **No key** (`!hasKey`): header shows the title only, no action button, no caption; `CardContent`
   = `ConnectKeyNotice`; no footer.
2. **No analysis yet** (`hasKey && analysis === null && !isPending`): header shows title + action
   button as normal; `CardContent` shows a centered mini-placeholder — `Sparkles` icon,
   `text-sm text-slate-500` — **"No analysis yet. Click '{actionLabel}' to generate one."**
3. **Pending** (a run is in flight): the action button becomes disabled, `Loader2` spin, label
   changes to a present-participle of the action (e.g. "Convening…", "Checking…", "Analyzing…" — each
   phase below states its exact pending label). If a previous `analysis` exists, `CardContent` keeps
   showing it, dimmed (`opacity-60 pointer-events-none`) rather than blanking — never clear real
   content to show a spinner. If this is the very-first run, `CardContent` shows a shaped `Skeleton`
   placeholder matching that phase's content shape instead of the "No analysis yet" text.
4. **Generation failed** (request errored): an `Alert variant="destructive"` appears above
   `CardContent` — title "Analysis failed", body **"Something went wrong generating this analysis.
   Your previous analysis (if any) is unaffected."** The action button returns to its normal
   (non-pending) label so the user can retry. Previous `analysis` content (if any) stays visible
   below, unchanged.
5. **Success**: caption + structured `CardContent` as described per-phase below, `AiDisclaimer` in
   the footer.

**`AiDisclaimer`** (`src/components/ai-disclaimer.tsx`) — one line,
`text-xs text-slate-400 dark:text-slate-500`, exact copy, never paraphrased:

> **"This is analysis to support your own decision, not financial advice."**

**`EvidenceList`** (`src/components/evidence-list.tsx`) — a small shared renderer for the recurring
"point + supporting evidence" shape that shows up in Health Score recommendations, Sell Analysis
reasons/counterarguments, and Thesis Check's supporting/weakening/improving columns. Props:
`items: { point: string; evidence?: string[] }[]`. Renders a `<ul>`; each `<li>` shows the point
(`text-sm font-medium`) and, if `evidence` is present, a nested `<ul>` of smaller muted lines
(`text-xs text-slate-500 dark:text-slate-400 pl-4 mt-0.5`) each prefixed "Evidence: ". Build this
once in Phase 3 (Health Score needs it first); Phases 4 and 5 import it unchanged.

### 2.6 Color rule, tightened for this phase set (resolves every "is this green/red?" question below)

Phase 1 reserved green/red for "gains/losses." This spec is explicit about the boundary so five
different builders make the same call every time:

- **Green/red are used ONLY for signed numeric monetary or percentage return figures** — unrealized
  gain/loss, total return %, margin of safety %, upside/downside case %, a price's day change %.
  These are genuine gain/loss numbers; the existing convention applies directly.
- **Green/red are NEVER used to color a status word, a verdict, or a qualitative AI judgment** —
  not a BUY/HOLD/SELL verdict, not a persona's per-lens recommendation, not a thesis's
  INTACT/BROKEN chip, not "this holding improved/weakened." Those render in neutral slate
  (`text-slate-900 dark:text-slate-50` for the word itself, inside a plain `Badge variant="outline"`
  or `variant="secondary"`), distinguished by **icon**, not color:
  - BUY → `TrendingUp` · HOLD → `Minus` · SELL → `TrendingDown` (all neutral slate icons)
  - Thesis INTACT → `CircleCheck` (slate) · BROKEN → `CircleX` (slate)
  - "Improved" holding → `TrendingUp` (slate) · "Weakened" holding → `TrendingDown` (slate)
- **Amber stays reserved for warning/needs-attention** and gets one legitimate, direct reuse in
  this phase set: Thesis WEAKENING (it genuinely is a "needs attention" state — same amber/
  `TriangleAlert` treatment the `sample` badge and the Dashboard's incomplete-data banner already
  use) and a Weekly Review's "New risks" list items.
- **Cash-flow direction (a transaction's Amount being an inflow or outflow) is NOT a gain/loss** —
  show a plain `+`/`−` sign prefix in normal slate text, never colored. Same for allocation "drift"
  in a Weekly Review (over/underweight isn't inherently good or bad) — plain signed number, slate.

### 2.7 Categorical chart palette (recharts)

Used by the three Dashboard allocation donuts (§3.1) and nowhere else needs more than a single-series
accent color (single-series bar/line charts — the dividend income bar chart, price history line chart,
integrity-score sparkline — use `blue-600` / `#2563eb` alone; that's the one place blue is fine
outside "primary action," because it's the sole data series, not a competing category).

Fixed ordered palette for multi-category donuts (same six hex values in light and dark mode — chosen
for adequate contrast on both `bg-white` and `bg-slate-950`), assigned in this order as categories
are encountered, largest slice first:

```
#2563eb  (blue-600)
#64748b  (slate-500)
#60a5fa  (blue-400)
#94a3b8  (slate-400)
#1d4ed8  (blue-700)
#cbd5e1  (slate-300)
```

If a donut has more than six categories, cycle the palette. **The "Unknown" bucket (holdings with a
null sector/country) is always `#94a3b8` (slate-400) regardless of position, and is always sorted
last in the legend** even if it happens to be numerically large — it should never visually read as
"the biggest, most important category," it should read as "data we don't have."

### 2.8 Two small additions to `src/lib/format.ts`

- `formatPercent(value: number, opts?: { signed?: boolean }): string` — one decimal place,
  `signed: true` prefixes `+` for positive values (negative already gets `-` from the number itself).
  e.g. `formatPercent(9.4, { signed: true })` → `"+9.4%"`.
- `formatIsoWeek(period: string): string` — turns `WeeklyReview.period` (e.g. `"2026-W28"`) into an
  owner-friendly label, e.g. **"Week of Jul 6–12, 2026"**. Raw ISO week strings are never shown in
  the UI.

### 2.9 Reused patterns worth naming once

- **Page header**: `<h1 className="text-2xl font-semibold">` + page title, `mb-6`, with primary
  action button(s) right-aligned on the same row on desktop (`flex items-center justify-between`),
  stacking below the title on mobile (`flex-col items-start gap-3 sm:flex-row sm:items-center`).
- **Filter bar**: one or more `Select`s left-aligned in a card header or just above a table,
  `flex flex-wrap gap-2`, each with a leading "All {thing}" option as the default/cleared state.
- **Table row actions**: a single action → plain ghost icon button. Two or more → `DropdownMenu`
  triggered by a `MoreVertical` ghost icon button, `size-9` inside table cells (still comfortably
  tappable at that size; the global 44px minimum is for primary/standalone controls, not every dense
  in-table icon — this one exception is intentional, matching how `SourceBadge size="sm"` already
  trades density for a slightly smaller in-table target).

---

## 3. PHASE 2 — Portfolio, Dashboard additions, Settings additions

### 3.1 Dashboard additions

Purpose stays the same as Phase 1 (§4 of the Phase 1 spec): at-a-glance portfolio snapshot. This
phase inserts three new sections into the existing page, in this order, and leaves the existing
Summary row and Holdings table structurally untouched:

1. *(existing, unchanged)* incomplete-data amber banner, when applicable.
2. *(existing, unchanged)* Summary row — Total Portfolio Value / Cash Balance / Trailing 12-Month
   Dividend Income.
3. **NEW — Return cards row.** `grid grid-cols-1 sm:grid-cols-2 gap-4`, two `SummaryCard`-shaped
   cards (reuse the existing `SummaryCard` sub-component from `dashboard/page.tsx`):
   - **"Total Return (with dividends)"** — value line combines the signed money amount and the
     percentage on one row: `text-2xl font-semibold tabular-nums` money amount with `+`/`−` sign,
     colored green/red per §2.6, immediately followed by `text-sm font-medium` `(+9.4%)` in the same
     color. `SourceBadge` beneath using `badgePropsForValueSources` over the same price sources that
     feed the Total Portfolio Value card (return depends on the same live/manual/sample prices plus
     the user's own cost-basis transactions).
   - **"Total Return (without dividends)"** — identical shape, price appreciation only.
   - If the portfolio has zero holdings, both cards show `formatMoney(0, base)` and `+0.0%` with a
     `derived` badge (nothing to be incomplete about) rather than being hidden — consistent with the
     Phase 1 rule that summary cards still render at zero rather than disappearing.
4. **NEW — Allocation donuts row.** `grid grid-cols-1 md:grid-cols-3 gap-4`, three `Card`s: "By
   Sector", "By Country", "By Market". Each `CardHeader` = `CardTitle` + one aggregate `SourceBadge`
   (same `badgePropsForValueSources` — these are the same valued holdings, sliced differently, so
   one badge per chart is correct, not per-slice). Each `CardContent`: a recharts `PieChart` donut
   (`innerRadius` ~55%, `outerRadius` ~80%, height 220px, colors from §2.7, no legend drawn inside
   the chart), followed by a plain-text legend list below it (`flex flex-col gap-1 text-xs mt-3`,
   each row: a `size-2.5 rounded-full` color swatch + category label + `formatPercent` share of
   total). Instruments with a null `sector`/`country` group into "Unknown" per §2.7 (the Market donut
   never has an Unknown bucket — `market` is a required enum field). **Empty case** (zero holdings):
   no chart is drawn; `CardContent` shows one centered line, `text-sm text-slate-500` — "No holdings
   to allocate yet."
5. *(existing, unchanged)* Holdings table.
6. **NEW — Dividend module.** One `Card`, `CardHeader` `CardTitle` "Dividend Income" (+ aggregate
   `derived` `SourceBadge`), `CardContent` stacks three sub-sections:
   - **Monthly income bar chart (T12M)** — recharts `BarChart`, 12 bars (one per trailing calendar
     month, oldest to newest, left to right), bars in `blue-600`/`#2563eb` (single series — blue is
     fine here per §2.7), height ~200px, short month labels on the x-axis ("Jan"…), y-axis ticks
     hidden or minimal, tooltip on hover shows the exact `formatMoney` amount for that month.
   - **Income by holding** — a compact list/table below the chart, Ticker (font-mono) | trailing-12M
     amount (`tabular-nums`, right-aligned) | `SourceBadge size="sm"` (`derived`), sorted descending
     by amount, top contributor first.
   - **Upcoming** — heading `text-sm font-semibold mt-4 mb-2` "Upcoming", a list of Ticker | Ex-date
     (`formatShortDate`) | amount-per-share (or, when `amountPerShare` is `null` per the
     `UpcomingDividend` type, the muted fallback text **"Amount not yet announced"** — never a blank
     or a zero, per the golden rule) | `SourceBadge size="sm"`.
   - **Empty case** (zero DIVIDEND transactions ever): the whole card shows one centered
     mini-placeholder instead of a chart of all-zero bars (a chart with no real data is misleading,
     not honest) — `Coins` icon, "No dividend income yet." If dividend history exists but there are
     currently no upcoming dividends, only the "Upcoming" sub-section is replaced with one line,
     "No upcoming dividends found." — the chart and by-holding list still render normally.

**Loading/error**: extend the existing `dashboard/loading.tsx` and `dashboard/error.tsx` shapes —
loading gets three more skeleton blocks (return cards row, three donut-card skeletons with a
circular `Skeleton` standing in for the chart, dividend-module skeleton with a bar-shaped skeleton
row); the error state is unchanged (still one full-page retry — a partial-data failure here is rare
enough not to need per-section granularity for a personal tool).

### 3.2 `/portfolio`

**Purpose:** the real, editable record of every holding and every transaction.

**Zero-transactions state (whole page):** if the signed-in user's portfolio has no transactions at
all, the entire page is one `EmptyState` (icon `Briefcase`, heading "Portfolio", sentence "Add your
first transaction to start tracking your portfolio.", `action` = `Button` "Add Transaction" opening
the dialog in §3.2.2 directly) — no separate empty Holdings/Transactions cards stacked underneath it.

**Normal state — page header:** "Portfolio" title, right-aligned `Button variant="outline"` "Import
CSV" (→ `/portfolio/import`) + `Button` "Add Transaction" (primary, opens the Add Transaction
dialog empty).

**Holdings card** (first, above Transactions): `CardHeader` — `CardTitle` "Holdings" + aggregate
`SourceBadge` (`badgePropsForValueSources`, same helper as the Dashboard). `Table` columns:

| Ticker | Name | Quantity | Avg Cost | Current Price | Market Value | Unrealized Gain/Loss | Weight | |
|---|---|---|---|---|---|---|---|---|

- Ticker: `font-mono font-medium`, clicking navigates to `/stocks/[id]`.
- Avg Cost: `tabular-nums`, right-aligned, derived from BUY transactions net of fees — no per-cell
  badge needed beyond the column-level context (it's arithmetic on the user's own transactions,
  same "derived" provenance as everything else in this row); a `SourceBadge size="sm"` (`derived`)
  still sits next to it per the letter of the golden rule.
- Current Price / Market Value: `SourceBadge size="sm"` immediately after each number, using
  `badgePropsForValueSource` on that holding's own valuation source (can legitimately differ
  row-to-row — one holding might be `live`, another `manual`).
- Unrealized Gain/Loss: signed money + `formatPercent(…, {signed:true})` on the same line, colored
  green/red per §2.6 (this is a genuine return figure).
- Weight: `formatPercent` of `totalValue`, plain `tabular-nums`, **not** colored (not a return
  figure).
- Row that can't be valued (missing price or FX rate): Market Value and Unrealized Gain/Loss cells
  show the same golden-rule text fallback already established on the Dashboard — "Unavailable — no
  price" / "Unavailable — no exchange rate" (`text-sm text-amber-700 dark:text-amber-400`) instead
  of a number.
- Actions column: `DropdownMenu` (kebab): **"Update price"** (only rendered when the holding's
  instrument routes to the manual provider — non-US market, or US without `FMP_API_KEY` set, per
  `resolveProviderName`; live-priced holdings get no pricing action, the price updates itself) →
  opens the Update Price dialog (§3.2.3). **"Sell analysis"** → a plain `Link` to
  `/committee?instrument={instrumentId}&mode=sell`. This is the Phase 2 placeholder the prompt asks
  for: because `/committee` is still the Phase-1 "Coming soon" `EmptyState` until Phase 5 ships, this
  link harmlessly lands there today and becomes real the moment Phase 5's `/committee` page reads
  `instrument`/`mode` query params to pre-select the instrument and open the Sell Analysis flow (see
  §7.1) — no separate stub screen needed. `DropdownMenuSeparator`, then **"View details"** → `Link`
  to `/stocks/[id]`.

**Transactions card** (below Holdings): `CardHeader`, `flex-wrap items-center justify-between gap-3`
— `CardTitle` "Transactions" left; right, the filter bar (§2.9): Type `Select` ("All types" + Buy /
Sell / Dividend / Deposit / Withdrawal / Fee) and Instrument `Select` ("All instruments" + every
ticker appearing in this portfolio's transactions), plus `Button` "Add Transaction" (same dialog).

`Table` columns: Date | Type | Instrument | Quantity | Price | Amount | Currency | Fee | Note |
(actions).

- Type: `Badge variant="outline"`, plain label (Buy/Sell/Dividend/Deposit/Withdrawal/Fee), no color
  (a category, not a status judgment).
- Instrument: ticker, or `—` for cash-only rows (DEPOSIT/WITHDRAWAL/account-level FEE).
- Amount: `+`/`−` sign prefix (inflow vs outflow), plain slate `tabular-nums` — **not** colored, per
  §2.6 (a cash-flow direction, not a return figure).
- Note: truncated to one line (`truncate max-w-40`), full text in a `Tooltip` on hover/focus.
- Actions: `DropdownMenu` — "Edit" (opens the same dialog pre-filled), `DropdownMenuSeparator`,
  "Delete" (`variant="destructive"`) → the confirm-delete pattern (§2.4), description e.g. "Buy of 10
  AAPL on Jul 3, 2026 for OMR 452.100. This can't be undone."
- Sort newest-first by trade date. No dedicated pagination component — a `Button variant="outline"`
  "Load more" beneath the table appends 25 more rows client-side; adequate for a personal portfolio's
  scale, not worth a full pagination primitive.
- **No rows match the current filters** (but transactions exist overall): a single centered row
  inside the table area, "No transactions match these filters." + a `Button variant="link"` "Clear
  filters".

#### 3.2.1 Add Transaction dialog

`Dialog`, `max-w-lg`. Title: "Add Transaction" (or "Edit Transaction" when opened from a row's Edit
action — same dialog, pre-filled, submit label changes to "Save Changes").

**Always present:**
- **Type** (`Select`, required) — Buy / Sell / Dividend / Deposit / Withdrawal / Fee. Changing this
  changes which fields below appear (the form is genuinely dynamic per type, not just relabeled).
- **Trade Date** (`Input type="date"`, required, defaults to today)
- **Note** (`Textarea`, optional, `rows={2}`)

**Type-dependent fields:**

| Type | Fields shown |
|---|---|
| BUY | Instrument (`Select`, required, populated from all instruments) → Quantity (`Input type="number"`, required) → Price per unit (`Input type="number"`, required) → Fee (`Input type="number"`, optional, default 0) → Currency (`Select`, defaults to the chosen instrument's currency, editable). Below the fields, a read-only computed line, `text-sm text-slate-500`: "Amount: {qty × price + fee} {currency}" — **Amount is never a separate editable field for BUY/SELL**, always derived client-side so it can never drift from quantity × price. |
| SELL | Same fields as BUY; computed Amount = qty × price − fee. |
| DIVIDEND | Instrument (required) → Amount (required, the total received) → Fee (optional, default 0, labeled **"Fee / withholding"** for this type specifically) → Currency (defaults to the instrument's currency). No Quantity/Price fields. |
| DEPOSIT | No Instrument field. Amount (required) → Currency (`Select`, defaults to the portfolio's base currency). No Fee field (kept out to keep the form lean; a real deposit fee, if it ever matters, is a separate FEE transaction). |
| WITHDRAWAL | Same shape as DEPOSIT. |
| FEE | Instrument (`Select`, **optional** — leading option "— Account-level (no instrument) —" then the instrument list) → Amount (required, the fee amount) → Currency. |

Validation: inline per-field errors (`text-xs text-red-600 dark:text-red-400 mt-1`), e.g. "Quantity
is required for Buy transactions." `DialogFooter`: Cancel (outline) + primary "Add Transaction" /
"Save Changes"; while submitting, `Loader2` + "Saving…", both buttons disabled.

**If the Instrument select has zero options** (no instruments exist yet — a brand-new install before
anything's been tracked via `/stocks`): a small inline note under the Instrument field, "No
instruments yet — track one from the Stocks page first," and the dialog's primary button stays
disabled for any type that requires an instrument.

#### 3.2.2 Delete Transaction

Confirm-delete pattern from §2.4, as described above under the Transactions table's row actions.

#### 3.2.3 Update Price dialog

`Dialog`, `max-w-md`. Title: "Update Price — {TICKER}". Fields: **Price** (`Input type="number"`,
required), **Currency** (plain read-only text showing the instrument's currency — not editable, kept
simple), **As of** (`Input type="date"`, defaults to today). `DialogFooter`: Cancel + "Save". Saving
writes a new `PriceCache` row with `source = MANUAL`, `fetchedAt = now` — the Holdings row then shows
"Manual, as of {that date}" the next time the page loads.

### 3.3 `/portfolio/import`

**Purpose:** bulk-load transactions from a CSV export (a brokerage statement, a spreadsheet) instead
of one-by-one. A standalone page (not a dialog — too many steps), four sequential steps, each
replacing the page body; a small step indicator at the top (`text-sm text-slate-500`, e.g. "Step 2 of
4 — Column mapping") helps orient.

**Step 1 — Upload or paste.** `Tabs`: "Upload file" / "Paste text". Upload tab: a styled drop-zone
(`border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-8 text-center`, `Upload`
icon, "Drag a CSV file here or click to choose") wrapping a native file input, accepts `.csv` only.
Paste tab: `Textarea` (`font-mono text-xs`, `rows={10}`, placeholder showing one example header row).
Below both tabs: `Button variant="link"` with a `Download` icon, **"Download sample CSV"**, linking
to a static file the builder adds at `public/sample-transactions.csv` with header row `ticker,
market, type, trade_date, quantity, price_per_unit, amount, currency, fee, note` (these exact column
names are also what Step 2's auto-guess matches case-insensitively — fuzzy matching beyond that is a
nice-to-have, not required). `Button` "Continue" (primary, disabled until a file is chosen or the
paste box has content).

**Step 2 — Column mapping preview.** A small table: CSV Column (as found in row 1) | Maps to
(`Select` per row — options: Ticker, Market, Type, Quantity, Price per unit, Amount, Currency, Fee,
Trade date, Note, "— Ignore this column —"), pre-filled by the case-insensitive header match
described above, always user-editable. Below it, a preview `Table` of the first 3 data rows so the
owner can eyeball the mapping against real values before committing. `Button variant="outline"`
"Back" + `Button` "Validate".

**Step 3 — Dry-run validation.** Validates every row against the mapping **without writing to the
database**. Summary line: "**{X} of {Y} rows are ready to import.**" If there are errors, a `Table`
"Rows with errors": Row # | Issue (plain English, e.g. "Unknown ticker 'AAPPL' — check spelling or
track it first," "Missing trade date," "Type 'BUY' requires a Quantity and Price") | Raw row data
(`font-mono text-xs`, truncated). Three sub-states:
- **Zero valid rows**: only "Back" — no Import button — plus "No rows could be imported. Fix the
  issues above and try again."
- **Some valid, some errored**: "You can still import the {X} valid rows now, or go back and fix the
  {Y} errored rows first." Buttons: "Back" + "Import {X} transactions".
- **All valid**: "All {Y} rows look good." Buttons: "Back" + "Import {Y} transactions".

**Step 4 — Import.** Clicking Import shows the button in a loading state (`Loader2` + "Importing…",
disabled) while the write happens. On success: an `Alert` using a new `success` variant (small
addition to `src/components/ui/alert.tsx` — same `cva` pattern as the existing `destructive` variant,
`border-green-600/50 text-green-600 dark:text-green-400`, reusing the already-established green
"positive" token, not a new color) — title "Import complete", body "{N} transactions were added to
your portfolio," `Button` "Go to Portfolio" (→ `/portfolio`). On failure (server error during the
actual write): `Alert variant="destructive"` — "Import failed" / "Something went wrong saving these
transactions. Nothing was imported — you can try again," `Button` "Try again" (returns to Step 3
without re-uploading).

### 3.4 `/settings`

**Purpose:** the small set of things the owner configures directly, rather than the app inferring.
Replaces the Phase 1 `EmptyState` placeholder. Content is narrower than most pages — cap at
`max-w-2xl` (this is a form-heavy settings page, not a data-dense one), stacked `Card`s, `space-y-6`.

**Base Currency card.** `CardTitle` "Base Currency". `Select` — OMR / USD / SAR / AED (the
`Currency` enum) — plus one line of helper text below, `text-sm text-slate-500`: "All totals are
converted to this currency using the FX rates below." Selecting a new value submits immediately (a
server action); the page re-renders with the saved value already selected — no separate "Saved"
toast (no toast system exists in this app; don't add one for this).

**FX Rates card.** `CardHeader` `flex items-center justify-between` — `CardTitle` "FX Rates" left;
right, `Button variant="outline"` "Refresh from FMP" with `RefreshCw` icon. **Disabled** (kept
focusable, `opacity-50 cursor-not-allowed`) whenever `FMP_API_KEY` is unset, wrapped in a `Tooltip`
that reads on hover/focus: **"Add an FMP_API_KEY to your environment to fetch live FX rates."**
`Table`: Base | Quote | Rate | As of | Source (`SourceBadge`, `live` or `manual`) | (delete icon
button, `Trash2`, `variant="ghost" size="icon"` — a single action, so a plain icon button rather than
a `DropdownMenu`, per §2.9 — opens the confirm-delete pattern, §2.4). Below the table, an inline "Add
FX Rate" row: Base (`Select`, Currency enum), Quote (`Select`, Currency enum), Rate (`Input
type="number"`), As of (`Input type="date"`, defaults to today), `Button` "Add" — entries added here
are always `source = MANUAL`.

**Appearance card.** `CardTitle` "Appearance". One informational line, no control (the theme toggle
already lives in the sidebar per Phase 1 and shouldn't be duplicated): "Use the sun/moon icon in the
sidebar to switch light and dark mode."

**Account Access card.** `CardTitle` "Account Access". Plain informational text, neutral (no amber/
red — this is a heads-up, not an active problem right now): "Sign-up is currently open to anyone who
visits this app. That's fine for local use. Before deploying this somewhere public, sign-up should be
disabled or gated." No toggle control — actually gating sign-up is a backend/infra decision, not
something this spec assumes a Settings checkbox can safely flip; see §9 if the owner wants a real
in-app control later.

---

## 4. PHASE 3 — Stocks

### 4.1 `/stocks`

**Purpose:** every instrument worth watching — held or explicitly tracked — in one table, the jump-off
point to each stock's detail page.

**Page header:** "Stocks" title, right `Button` "Track a Stock" (primary) → `Dialog` "Track a Stock",
`max-w-md`: Ticker (`Input`, uppercased as typed), Market (`Select` — US / MSX / TADAWUL / DFM /
OTHER), Name (`Input`). `DialogFooter`: Cancel + "Add". Creates an `Instrument` row and a
`WatchlistItem` row for the signed-in user. This is the entry point that gets a brand-new ticker into
the system at all (Add Transaction's Instrument picker, Theses' instrument picker, and Committee's
instrument picker all read from this same `Instrument` table).

**Table**, columns: Ticker | Name | Quote | Change | | Held | Watch.

- Ticker: `font-mono font-medium`; clicking the row (anywhere except the watch-toggle icon)
  navigates to `/stocks/[id]`.
- Quote: `tabular-nums`, `SourceBadge size="sm"` after it.
- Change: day change %, `formatPercent(…, {signed:true})`, colored green/red (a genuine return
  figure).
- Held: `Badge variant="secondary"` "Held" when the instrument appears in the portfolio's
  transactions, otherwise blank.
- Watch: icon-only toggle button (`Star` filled/`text-blue-600` when watched — this is a "selected
  state," the one legitimate extra use of the accent color per the Phase 1 tokens doc — outline
  `StarOff`/slate when not), adds/removes the `WatchlistItem` row; works independently of "Held."

**States:**
- Loading: skeleton rows, global pattern.
- Empty (zero held + zero watched instruments): `EmptyState` (icon `ChartLine`, heading "Stocks",
  sentence "Add a holding or track a stock to see it here.", `action` = "Track a Stock" button).
- Error: same Alert + Retry pattern as the Dashboard.

**Note on `/watchlist`:** that standalone nav page still shows the plain Phase 1 "Coming soon"
`EmptyState` unless the owner wants it filled in now that watch-toggling is real (flagged in §9 — a
one-screen follow-up, not required by this spec).

### 4.2 `/stocks/[id]`

**Purpose:** everything about one instrument — price, fundamentals, and the AI health score.

**Profile header** (top of page, `flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between`):
left side — Ticker (`text-2xl font-mono font-semibold`) + Name (`text-lg text-slate-600
dark:text-slate-400`) + small `Badge variant="secondary"` tags for Market/Sector/Country (blank
tags omitted, not shown as "Unknown" here — that grouping is a Dashboard-donut-only concept). Right
side — current price block: `text-3xl font-semibold tabular-nums` + day change `formatPercent`
green/red beside it, `SourceBadge` beneath. Below the header row, action buttons:
watch/unwatch toggle (same `Star`/`StarOff` pattern as the Stocks table) + `Button variant="outline"`
"Add Transaction" (opens the Portfolio dialog from §3.2.1 with this instrument pre-selected — a
convenience cross-link, not required for the page to be complete if a builder finds it awkward to
wire cross-page).

**Price history.** `Card`, `CardHeader` `CardTitle` "Price History" + aggregate `SourceBadge` (one
fetch, one source — see the statements reasoning below for why one badge is correct here, not one
per point). `CardContent`: recharts `LineChart`, fixed 1-year range for this phase (no range
selector yet — flag as a nice-to-have, §9), height ~280px, `blue-600` stroke, no fill/gradient (no
gradients anywhere, per tokens), light grid lines (`stroke-slate-100 dark:stroke-slate-800`), hover
tooltip shows date + price. **No-data state**: if `getPriceHistory` returns `unavailable`, the chart
area is replaced by one centered line, "Price history unavailable." — never an empty or flat-lined
chart standing in for missing data.

**Financial statements.** `Card`, `CardHeader` `CardTitle` "Financial Statements". `Tabs`: "Income" /
"Balance Sheet" / "Cash Flow" (`StatementKind` = income/balance/cash-flow). Each `TabsContent`: a
`Table` with fiscal periods as **columns** (most recent leftmost, 5 years, annual period) and line
items as **rows** — start from FMP's known field names already visible in `fmp.ts`'s raw row shape
(e.g. income: revenue, costOfRevenue, grossProfit, operatingIncome, netIncome; balance: totalAssets,
totalLiabilities, totalStockholdersEquity; cash-flow: operatingCashFlow, freeCashFlow), title-casing
any other field present in the payload as a fallback label (e.g. `ebitdaratio` → "Ebitdaratio" is an
acceptable rough fallback, not worth hand-curating every possible FMP field name up front). **Source
badge placement, deliberately different from the Holdings-table pattern**: because one
`getFinancialStatements` call returns all five years from a single fetch (one `asOf`, one `source`
for the whole table), a `SourceBadge size="sm"` sits once per **period column header** (next to "FY2025"
etc.), not once per cell — every cell under that header shares that exact provenance, so a per-column
badge is the honest granularity here, not per-cell noise. (This is different from the Holdings table,
where each row/holding genuinely can have a different source — state the reasoning if a reviewer
asks why these two tables badge differently.) **Unavailable case**: if the statement fetch for a kind
comes back `unavailable` (e.g. this instrument routes to the manual provider, which returns
`not_supported` for statements), that tab's content is replaced with one line, "Financial statements
require a live market-data connection for this instrument." — no empty table shell.

**Ratio strip.** A row of small stat tiles below the statements card, `grid grid-cols-2 sm:grid-cols-4
lg:grid-cols-6 gap-3`, e.g. P/E, P/B, Dividend Yield, Debt/Equity, ROE, Current Ratio (whichever the
underlying statements/quote can compute). Each tile: label (`text-xs text-slate-500`), then either
the value (`text-lg font-semibold tabular-nums`, plain neutral — these are not signed return figures)
or, when a ratio can't be computed (missing statement line, negative earnings making P/E
meaningless, etc.), an em dash **"—"** in place of the number with **"Unavailable"** in
`text-xs text-slate-400` underneath it — every ratio fails independently; one missing ratio never
blanks the whole strip.

**Dividend section.** `Card`, "Dividends" — dividend history (`Table`: Ex-date | Amount per share |
`SourceBadge size="sm"` each row) and upcoming dividends (same shape as the Dashboard's Upcoming
sub-list, §3.1, including the "Amount not yet announced" fallback). Empty: "No dividend history for
this instrument." — no chart here (that aggregate view lives on the Dashboard).

**Health Score panel.** One `AiPanel` instance: `title` "Health Score", `actionLabel` "Generate
investment score" (first run) / "Re-analyze" (once an analysis exists), pending label "Analyzing…".
`CardContent` (once an analysis exists):
- **Hero**: label "Health Score" (`text-sm text-slate-500`) above a big number,
  `text-6xl font-semibold tabular-nums` (0–100, plain neutral — not a return figure, no color
  banding, no gauge/ring widget — flat and quiet per the tokens doc). Beside/below it, a plain
  `Badge variant="secondary"` text label from fixed thresholds: **"Strong"** (≥70), **"Moderate"**
  (40–69), **"Weak"** (<40) — text only, no color-coding by band.
- **7 subscores**, `grid grid-cols-2 sm:grid-cols-4 gap-3` (7 tiles, last row partially filled — fine):
  Diversification, Valuation, Quality, Concentration, Dividend Quality, Risk, Cash — each a label +
  `text-xl font-semibold tabular-nums` 0–100 number, same neutral, no color.
- **Strengths**: `text-sm font-semibold` heading, then a plain bullet list (`Check` icon, slate,
  `text-sm`) — one line per strength, no evidence sub-items (strengths are stated plainly, unlike
  recommendations).
- **Recommendations with evidence**: `text-sm font-semibold` heading "Recommendations", then
  `EvidenceList` (§2.5) — each recommendation is the `point`, its `evidence` array renders as the
  nested "Evidence: …" sub-lines.
- Per the cross-cutting rule in §2.5's caption spec: **none of these AI-computed numbers (hero score,
  the 7 subscores) carry a `SourceBadge`** — their provenance is the panel's caption line
  ("Analysis from … based on data as of …"), which is the AI-specific equivalent of the golden rule.
  Do not add a `derived` badge next to the health score hero number; that would misleadingly imply
  it's a pure transaction-math figure like Cash Balance, when it's actually an AI judgment call.

**News section.** For Phase 3, this is a placeholder card, filled in for real by Phase 6 (§8.2) in
the exact same position (last section on the page): `Card`, `CardHeader` `CardTitle` "Recent News",
`CardContent` uses `EmptyState` in its compact card mode (`className="min-h-32"`, matching the
Dashboard's Holdings-empty pattern) — icon `Newspaper`, sentence "News summaries are coming in a
later phase.", `comingSoon` badge.

**Loading/error/no-key:** page-level loading = shaped skeletons for each card in the order above.
Page-level fetch error = the same full-page Alert+Retry pattern as the Dashboard. The Health Score
panel's no-key state is exactly the `AiPanel`/`ConnectKeyNotice` behavior from §2.5 — nothing else on
the page is affected (price/statements/ratios/dividends are ordinary market data, not AI).

---

## 5. PHASE 4 — Theses

### 5.1 `/theses`

**Purpose:** the list of "why I own this" statements and whether they still hold up.

**Page header:** "Theses" title, right `Button` "New Thesis" (primary) → `Dialog`, `max-w-lg`, title
"New Thesis": Instrument (`Select`, populated from instruments the user holds or watches — i.e. the
same `Instrument` table Phase 3's Stocks page populates), Statement (`Textarea`, `rows={5}`,
placeholder "Why do you believe in this position? What has to stay true?"). `DialogFooter`: Cancel +
"Create". **If the Instrument select is empty** (nothing held or watched yet): inline note "Add a
holding or track a stock first," Create button stays disabled.

**Filter chips**, just under the header: two clickable `Badge`-styled toggle buttons, "Active ({n})"
/ "Closed ({n})", the selected one styled like the sidebar's active-nav treatment
(`bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300`), the other plain
outline. Default: Active.

**List** — `Table`, columns: Instrument (ticker + name) | Statement (one line, truncated,
`text-slate-600 dark:text-slate-400`) | Status (the neutral INTACT/BROKEN-style chip described in
§2.6/§5.2, or for a thesis's overall status here it's just ACTIVE/CLOSED — ACTIVE = `Badge
variant="outline"` with the same calm green dot the `live` `SourceBadge` uses, i.e. reusing that
existing visual idiom for "currently active," not a new color; CLOSED = `Badge variant="secondary"`,
muted) | Latest Integrity Score (`tabular-nums` + a small neutral trend arrow, `TrendingUp`/
`TrendingDown`/`Minus`, slate, comparing the two most recent checks) | Last Checked (`formatShortDate`).
Clicking a row → `/theses/[id]`.

**States:**
- Empty (zero theses ever): `EmptyState` (icon `BookOpen`, heading "Theses", sentence "Track why you
  own a position and let AI check if it still holds up.", `action` = "New Thesis" button).
- Filtered-empty (e.g. zero Closed theses while some Active exist): a plain centered line inside the
  table area, "No closed theses yet." — the filter chips stay visible so switching back is one click.

### 5.2 `/theses/[id]`

**Purpose:** one thesis's full history — the original statement, every integrity check run against
it, and the ability to run a new one.

**Header:** Instrument ticker + name, status chip (ACTIVE/CLOSED, same treatment as the list),
`Link` "← All Theses" above it.

**Statement.** Rendered as a quoted block: `border-l-2 border-slate-300 dark:border-slate-700 pl-4
italic text-slate-700 dark:text-slate-300 text-base leading-relaxed`.

**Instrument snapshot.** One row, `flex flex-wrap gap-x-6 gap-y-2 text-sm`: Ticker, Current Price (+
`SourceBadge size="sm"`), Position (quantity + market value, if held, + `SourceBadge size="sm"`),
Sector, Country.

**Integrity trend sparkline.** A small recharts `LineChart` with no axes/gridlines, height ~48px,
single `blue-600` line, plotting `ThesisCheck.integrityScore` over time (oldest to newest) — one
reusable `IntegrityTrendSparkline` component, `src/components/integrity-trend-sparkline.tsx`, takes
`points: { date: Date; score: number }[]`. If fewer than 2 checks exist, don't render a line with one
point floating in space — show nothing here yet (the "Latest Check" panel below already communicates
there's not much history).

**Latest Check** — one `AiPanel` instance: `title` "Latest Check", `actionLabel` "Check thesis now"
(same label every time, not "re-check"), pending label "Checking…". `CardContent` (once a check
exists):
- **Hero**: "Integrity Score", `text-4xl font-semibold tabular-nums`, 0–100, neutral (no color
  banding — same reasoning as the Health Score hero).
- **Recommendation chip**: INTACT (`CircleCheck`, slate, `Badge variant="outline"`) / WEAKENING
  (`TriangleAlert`, **amber** — the one legitimate reuse per §2.6, `border-amber-600/30 bg-amber-50
  text-amber-600 dark:border-amber-400/30 dark:bg-amber-950 dark:text-amber-400`) / BROKEN
  (`CircleX`, slate, `Badge variant="outline"`).
- **Three evidence columns**, `grid grid-cols-1 md:grid-cols-3 gap-4` (stacks to one column on
  mobile, order: Supporting → Weakening → Improving): "Supporting" (evidence still backing the
  thesis), "Weakening" (evidence undermining it), "Improving" (new positive evidence not in the
  original statement) — each a heading (`text-sm font-semibold`) + plain bullet list
  (`text-sm`, small `Circle` bullet icon).
- **Watch items**: below the three columns, heading "Watch items", a plain `<ul class="list-disc
  list-inside text-sm">` of things to monitor going forward.

**Check history timeline**, below the Latest Check panel: chronological, newest first, a simple
CSS-timeline list (`<ol>` with `border-l-2 border-slate-200 dark:border-slate-800`, each `<li
className="relative pl-4 pb-6">` with a small dot marker) — each entry: date, integrity score,
recommendation chip (same three-state styling as above, smaller), and one truncated line of evidence
summary. Not expandable/collapsible — flat list, oldest checks simply scroll further down; this is a
personal tool, a handful of checks per thesis is the expected scale.

**No-key state:** the Latest Check `AiPanel` shows `ConnectKeyNotice` per §2.5; everything else on
the page (statement, snapshot, sparkline, history — all pre-existing persisted checks) renders
normally, since only *generating a new* check needs AI.

---

## 6. PHASE 5 — Committee

### 6.1 `/committee`

**Purpose:** one workspace for three related AI analyses on a chosen instrument — convening the full
committee debate, a prospective Buy Analysis, or (for something already held) a Sell Analysis. One
page rather than three, because they share the same instrument-picker/context setup and it keeps the
nav simple — flagged as a structural call in §9, not something requiring the owner's sign-off before
building, but easy to split later if it feels crowded in practice.

**Instrument picker section**, top of page, `Card`: Instrument `Select` (populated from all
instruments — this one isn't restricted to held/watched, since Buy Analysis is explicitly for
instruments not yet owned; if the table is empty, a helper line "Don't see the stock you want? Track
it first from the Stocks page." links to `/stocks`). Once an instrument is selected:
- **Optional position context**, shown only when the instrument is currently held: a small inline
  line, "You hold {quantity} shares (avg cost {formatMoney}, currently {formatPercent gain/loss})."
- **Auto-attached active thesis notice**, shown only when an ACTIVE thesis exists for this
  instrument: `Info` icon + "Your active thesis for {TICKER} will be included in this analysis."
  (`text-xs text-slate-500`).
- Three action buttons, `flex flex-wrap gap-2 mt-4`: **"Convene Committee"** (primary), **"Run Buy
  Analysis"** (outline), **"Run Sell Analysis"** (outline; **disabled** with a `Tooltip` — "You don't
  currently hold this position" — when the selected instrument isn't in the portfolio). Reading the
  URL's `?instrument=` and `?mode=` query params (set by Portfolio's "Sell analysis" row action, per
  §3.2) pre-selects the instrument and, when `mode=sell`, immediately shows the Sell Analysis result
  area (as if that button had just been clicked) rather than requiring an extra click.

Whichever action was run, its result renders below the picker card, in an `AiPanel` shaped per §6.2–
§6.4. Only one result section is shown at a time (running a different mode for the same instrument
replaces it, it doesn't stack three result panels).

**No-key state:** per the standard page pattern (§2.5) — all three action buttons are hidden, and a
`ConnectKeyNotice` sits where the instrument picker's action row would otherwise put its buttons
(the picker itself, being ordinary DB data, still renders — the owner can see what they'd analyze,
they just can't run anything yet).

### 6.2 Convene Committee — verdict layout

`AiPanel`: `title` "Investment Committee", `actionLabel` "Convene Committee", pending label
"Convening…". `CardContent`:

- **Verdict header**: a large neutral pill (`Badge variant="outline"`, `text-lg px-4 py-1.5`) showing
  **BUY** / **HOLD** / **SELL** with its icon per §2.6 (`TrendingUp`/`Minus`/`TrendingDown`, all
  slate — no green/red on the verdict word itself), beside it **"Consensus: {0–100}/100"**
  (`tabular-nums`, neutral).
- **Committee table**, six personas — Value, Growth, Dividend, Quality, Macro, Contrarian — columns:
  Persona | Recommendation (small version of the same neutral BUY/HOLD/SELL chip) | Confidence
  (`{0-100}/100`, `tabular-nums`, neutral) | Strongest Point (`text-sm`, wraps).
- **Disagreements panel** — visually prominent, **never collapsed or hidden by default**: its own
  bordered block, `border-2 border-slate-300 dark:border-slate-700 rounded-lg p-4 bg-slate-50
  dark:bg-slate-900` (a deliberately heavier border than a normal `Card`'s hairline, so it reads as
  "pay attention to this" without reaching for a color this app hasn't reserved for the purpose),
  `GitBranch` icon + heading "Where the committee disagreed" (`text-base font-semibold`), then a
  short paragraph or bullet list of the actual disagreement(s).
- **"What would change this verdict"** — directly below or inside the disagreements block, heading
  (`text-sm font-semibold`), a plain bullet list of conditions, e.g. "If Q3 margins fall below 18%,
  the growth lens would likely flip to HOLD."
- **Thesis assessment** — a prose paragraph (`text-sm leading-relaxed`) under heading "Thesis
  Assessment," rendered **only** when an active thesis was auto-attached (per the picker's notice
  above); omitted entirely, not shown empty, when there's no active thesis for this instrument.

### 6.3 Buy Analysis — result layout

`AiPanel`: `title` "Buy Analysis", `actionLabel` "Run Buy Analysis", pending label "Analyzing…".
`CardContent`:

- **Current Price** line at the very top — `text-sm text-slate-500` label + the price +
  `SourceBadge size="sm"`. This is the **one figure in this panel that is real market data, not an AI
  output**, and is the one exception to the "AI numbers don't get a SourceBadge" rule from §4.2's
  Health Score note — call this out explicitly so a builder doesn't skip it or, conversely, doesn't
  over-badge the AI-computed numbers below it.
- **Buy Score** hero, `text-5xl font-semibold tabular-nums`, 0–100, neutral (not a return figure).
- **Fair Value**, labeled with its assumptions: `text-2xl font-semibold tabular-nums` money value,
  then directly beneath it in `text-xs text-slate-500`, the plain-English assumptions string from the
  AI output verbatim (e.g. "DCF with 8% discount rate, 3% terminal growth").
- **Margin of Safety** — `formatPercent(…, {signed:true})`, green/red (a genuine comparison of price
  to fair value — legitimately colored per §2.6).
- **Upside / Downside case** — two small stat tiles side by side, "Upside case" `+X%` green,
  "Downside case" `−X%` red.
- **Suggested allocation** — one line, plain text, e.g. "Suggested position size: 3–5% of portfolio."
- **Alternatives** — a short list (2–3 items) of alternative tickers with one-line reasoning each:
  `font-mono` ticker + `text-slate-600 dark:text-slate-400` reasoning.

### 6.4 Sell Analysis — result layout

`AiPanel`: `title` "Sell Analysis", `actionLabel` "Run Sell Analysis", pending label "Analyzing…".
`CardContent`:

- **Sell Score** hero, same tile pattern as Buy Score, neutral 0–100.
- **Reasons** — heading "Reasons to Sell", `EvidenceList` (§2.5): each reason is the `point`, its
  `evidence` renders as nested "Evidence: …" lines.
- **Counterarguments** — heading "Counterarguments", same `EvidenceList` shape, visually distinguished
  only by a leading `AlertCircle` icon (neutral slate) next to the heading, not by color — this is a
  "consider the other side" section, not a warning.

### 6.5 History of past runs

Below whichever result panel is showing (or below the picker, if nothing's been run for the currently
selected instrument yet), a `Card` "Past Runs": `Table`, Date | Type (`Badge variant="secondary"` —
Committee / Buy Analysis / Sell Analysis) | Verdict/Score (whatever's relevant to that type — the
BUY/HOLD/SELL chip for Committee runs, the numeric score for Buy/Sell) | Model. Filtered to the
currently selected instrument (switching instruments in the picker refreshes this list). Clicking a
row navigates to `/committee/history/[id]` — the same result-layout components as §6.2–§6.4, rendered
through `AiPanel` with `readOnly` set (no action button, caption still shown), plus a `Link` "← Back
to Committee" above the content. This read-only route is also the natural home for a linked-to
historical run from anywhere else in the app later — flagged, not required beyond what's specified
here.

---

## 7. PHASE 6 — Reviews, News

### 7.1 `/reviews`

**Purpose:** the weekly, whole-portfolio AI check-in.

**Page header:** "Reviews" title, right `Button` "Run weekly review" (primary) — **hidden** in the
no-key state per §2.5's standard pattern, replaced by `ConnectKeyNotice` filling the content area
below.

**List** — `Table`, columns: Week (`formatIsoWeek`, §2.8 — never the raw `"2026-W28"` string) |
Summary (first line of the AI summary, truncated one line). Sorted newest first. Clicking a row →
`/reviews/[id]`.

**States:**
- Empty (zero reviews ever, but AI is configured): `EmptyState` (icon `ClipboardCheck`, heading
  "Reviews", sentence "Weekly AI reviews of your whole portfolio will appear here.", `action` = "Run
  weekly review" button).
- No key: per §2.5 — header button hidden, `ConnectKeyNotice` fills the content area (this takes
  precedence over the empty state; there's nothing to "run" either way, but the copy explaining *why*
  matters).

### 7.2 `/reviews/[id]`

**Purpose:** one week's full review.

**Header:** "Week of {date range}" (via `formatIsoWeek`), `Link` "← All Reviews" above it. Not
wrapped in the interactive `AiPanel` chrome (a past review is a fixed historical record, there's
nothing to "re-run" for a week that's already over — each week gets its own new review, never a
re-run of an old one) — instead rendered through `AiPanel` with `readOnly` set (same read-only mode
used by Committee's history view, §6.5): caption line still shown ("Analysis from … · {model} ·
based on data as of …"), no action button, `AiDisclaimer` still in the footer.

`CardContent` sections, in order:
- **Summary** — one paragraph, `text-sm leading-relaxed`.
- **New risks** — heading "New Risks", bullet list, each item with a `TriangleAlert` **amber** icon
  (the other legitimate amber reuse per §2.6 — these genuinely are "needs attention" callouts).
- **Improved / Weakened holdings** — two labeled lists (`grid grid-cols-1 md:grid-cols-2 gap-4`):
  each entry is a ticker + one-line reason, with a neutral slate `TrendingUp` (Improved) or
  `TrendingDown` (Weakened) icon — **not** green/red (qualitative AI judgment, not a P&L number, per
  §2.6).
- **Allocation drift** — a small table or list, Category | Target % | Actual % | Drift (signed,
  `tabular-nums`, plain slate — being over/underweight isn't inherently good or bad, so no color).
- **Suggested actions** — heading "Suggested Actions", plain bullet list (`ArrowRight` icon, slate).
- **Behavioral note** — deliberately quiet, set apart from the punchier bullet sections above it: a
  small uppercase label `text-xs uppercase tracking-wide text-slate-400 mb-1` "Behavioral Note," then
  one italic paragraph, `border-l-2 border-slate-200 dark:border-slate-800 pl-4 py-1 text-sm italic
  text-slate-500 dark:text-slate-400` — no icon (an icon would make it read as another alert, which
  is the opposite of the hushed, reflective tone this section wants).

### 7.2 News summary card (fills the Phase 3 placeholder)

Replaces the "Coming soon" placeholder card at the bottom of `/stocks/[id]` (§4.2) in the exact same
position. `AiPanel`: `title` "Recent News", `actionLabel` "Refresh news", pending label
"Refreshing…". `CardContent`, four labeled paragraph sections stacked (`space-y-4`), each a small
heading (`text-sm font-semibold`) + paragraph (`text-sm leading-relaxed`):
- **What Happened**
- **Why It Matters**
- **Thesis Impact** — rendered only when an ACTIVE thesis exists for this instrument; omitted
  entirely (not shown empty) otherwise, matching the Committee thesis-assessment omission rule
  (§6.2).
- **Should You Care** — the most actionable of the four, can be styled very slightly heavier
  (`font-medium` on the paragraph, not colored) to help it stand out as the takeaway line.

Then **Quotes** — a list of pull-quotes from source articles, each a `blockquote`-style block
(`border-l-2 border-slate-300 dark:border-slate-700 pl-3 italic text-sm text-slate-600
dark:text-slate-400`) with a source attribution line beneath in `text-xs text-slate-400` when
available (e.g. "— Reuters, Jul 10, 2026").

No-key state: standard `AiPanel`/`ConnectKeyNotice` behavior — the rest of the stock detail page is
unaffected.

---

## 8. Cross-cutting checklist (apply to every screen above, no exceptions)

- **Every non-AI number carries a `SourceBadge`** (`live`/`manual`/`sample`/`derived`), sized `sm`
  in dense table cells, `default` next to standalone figures — per the golden rule, restated exactly
  as Phase 1 fixed it. The two documented exceptions in this spec, both explicitly called out inline
  above so a builder doesn't have to guess: (1) financial-statement tables badge once per fiscal-
  period **column**, not per cell, because one fetch produces the whole column (§4.2); (2) AI-computed
  numbers (health/integrity/consensus/buy/sell scores, subscores) carry **no** `SourceBadge` at all —
  their provenance is the `AiPanel` caption line instead (§2.5).
- **Every AI result shows its date + model + data-as-of** via the fixed `AiPanel` caption format —
  never just a bare number with no dating.
- **No-key states are first-class**, specified per-screen above, never an afterthought or a disabled
  button with no explanation.
- **Never fabricate a number.** Every "can't compute this" moment above has an explicit, specific
  copy string (missing price, missing FX rate, unsupported statement source, no upcoming dividend
  amount, zero valid CSV rows) rather than a blank, a zero standing in for "unknown," or a chart drawn
  from placeholder data.
- **Money** always through `formatMoney` (OMR 3dp / others 2dp); **quantities** through
  `formatQuantity`; **dates** through `formatShortDate`; **percentages** through the new
  `formatPercent` (§2.8) — never a one-off `toFixed()` scattered in a page component.
- **Touch targets**: primary/standalone interactive elements stay ≥44×44px per Phase 1's rule; the
  one documented exception is in-table dense icon buttons (`size-9`, §2.9), matching the precedent
  `SourceBadge size="sm"` already set for density-over-target-size trade-offs in dense table cells.
- **Every table on every screen above** follows the same shape: `Table`/`TableHeader`/`TableRow`/
  `TableHead`/`TableCell` from `src/components/ui/table.tsx`, right-aligned numeric columns,
  `tabular-nums`, horizontal scroll on overflow (already built into the `Table` wrapper) rather than
  ever squeezing columns unreadably on a narrow viewport.

---

## 9. Decisions that need the owner's taste, not mine

1. **Committee as one page with three modes**, not three separate pages/nav items (§6.1). This keeps
   the sidebar simple and reuses one instrument-picker, but it does mean Buy/Sell/Committee results
   share screen real estate rather than each getting a dedicated URL people might want to bookmark
   separately. Easy to split into three routes later if it feels crowded in practice — flagging
   before a builder invests in the merged version.
2. **Reusing the semantic amber (`WEAKENING` thesis status, Weekly Review "new risks") and the calm
   green "live" dot (thesis `ACTIVE` status)**, rather than any new color, for status indicators
   (§2.6, §5.1). I deliberately avoided introducing new colors for BUY/HOLD/SELL and INTACT/BROKEN
   (neutral slate + icon only) to keep the app's "one accent, calm neutrals" feel — if the owner would
   rather have a more traffic-light-style Committee verdict (green BUY / red SELL), that's a
   one-place color swap in §6.2, not a rebuild, but it's a real question of taste about how "loud"
   this app should feel at its most decision-critical screen.
3. **`Select` built on a native `<select>`** rather than a custom floating listbox (§2.3) — a
   deliberate scope/complexity trade given no Radix is available. If the owner later wants
   multi-select, search-as-you-type, or richer option rendering (icons inside options, etc.) in any
   of these pickers, that's a real component rebuild, not a styling tweak — worth flagging now while
   the simpler version is still cheap to ship.
4. **`/watchlist` stays a placeholder** even though Phase 3 makes watch-toggling real (§4.1's closing
   note) — the Stocks table already shows held+watched instruments together, so a separate
   watched-only view is arguably redundant. If the owner wants `/watchlist` filled in as its own
   filtered view, that's a very small follow-up (reuse the Stocks table, filtered), not a new pattern.
5. **No in-app control for gating `/sign-up`** (§3.4's Account Access card is informational only). Per
   `docs/CONVENTIONS.md` this is flagged as a "Phase 2 item" that needs deciding before any
   non-local deployment; this spec surfaces it as a visible reminder in Settings but doesn't assume
   it's safe to expose as a self-service toggle without knowing how the owner plans to deploy this.
6. **Price history has no range selector yet** (§4.2, fixed 1-year window). A quick, low-risk
   follow-up (1M/6M/1Y/All buttons above the chart) if the owner wants to zoom around — flagging
   rather than guessing whether it's worth the extra control on a first pass.
