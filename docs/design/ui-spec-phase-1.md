# InvestIQ AI — Phase 1 UI Spec

Personal long-term-investing analysis tool for a single owner. Next.js App Router + Tailwind + shadcn/ui. **English only, LTR** — no i18n/RTL work needed for this app. This is a new repo with no existing screens, so this spec also fixes the visual language other screens must match going forward; treat it as the seed of `docs/CONVENTIONS.md`'s UI section.

---

## 0. Design tokens (fixed by this spec — do not improvise per-screen)

**Feel:** Linear/Notion-like. Neutral, quiet UI; one accent color used sparingly (primary buttons, active nav item, links, focus rings, selected states). No gradients anywhere, no purple. No glow/blur "AI" effects.

**Neutral scale:** Tailwind `slate`.
- Page background: `bg-white` (light) / `bg-slate-950` (dark)
- Card/surface background: `bg-white` with `border-slate-200` (light) / `bg-slate-900` with `border-slate-800` (dark)
- Sidebar background: `bg-slate-50` (light) / `bg-slate-900` (dark), border-right `border-slate-200` / `border-slate-800`
- Primary text: `text-slate-900` (light) / `text-slate-50` (dark)
- Secondary/muted text: `text-slate-500` (light) / `text-slate-400` (dark)
- Borders/dividers: `border-slate-200` (light) / `border-slate-800` (dark)

**Accent color:** Tailwind `blue`. `bg-blue-600 text-white` (light) for primary buttons and active states; `bg-blue-500` in dark mode. Links and focus rings: `text-blue-600`/`text-blue-400`, `ring-blue-600`/`ring-blue-500`. Do not use blue for anything else (keep it meaning "primary action / active").

**Semantic colors** (separate from accent, so they never collide with it):
- Gains / positive: `text-green-600` / `text-green-400`
- Losses / negative: `text-red-600` / `text-red-400`
- Warning / needs-attention (used by the "sample data" badge — see §1): `amber-600` / `amber-400`

**Typography:** Use Next.js's built-in font loader (`next/font`) with **Geist Sans** (ships with the standard `create-next-app` scaffold — zero new dependency) or `Inter` via `next/font/google` if Geist isn't already in the scaffold; either is fine, pick whichever the scaffold already has configured. Numbers in cards (portfolio value, cash, dividend income) use `font-semibold tabular-nums` at a large size (`text-3xl` desktop / `text-2xl` mobile) so digits align and don't jitter.

**Radius & elevation:** shadcn default radius (`0.5rem` / `rounded-lg`). Cards use a hairline border, not a drop shadow (`shadow-sm` at most) — keep it flat/quiet, not glossy.

**Icons:** `lucide-react` (comes bundled with shadcn/ui, no new dependency).

**Dark/light toggle, persisted:** Implement with a small custom `ThemeProvider` (React context + `localStorage` + toggling the `dark` class on `<html>`) rather than installing `next-themes`, so Phase 1 adds zero new dependencies. Flag to the owner: if the builder later wants to avoid a flash-of-wrong-theme on first paint, `next-themes` is the standard fix and is a very small, well-known package — one dependency, worth a nod from the owner before adding.

---

## 1. The golden-rule component: `SourceBadge`

Every number on screen must be visibly traceable to one of three sources. One reusable component, two sizes.

**Variants:**
| Variant | Label text | Color | Icon |
|---|---|---|---|
| `live` | "Live" | slate-600/400, green dot | small filled green dot (2px circle, not an animated pulse — keep it calm) |
| `manual` | "Manual, as of {date}" (e.g. "Manual, as of Jul 10, 2026") | slate-600/400 | `Clock` (lucide) |
| `sample` | "Sample data" | amber-600/400, `amber-50`/`amber-950` background | `FlaskConical` (lucide) |

**Sizes:**
- `default` — full pill (shadcn `Badge`, `variant="outline"`, custom color classes above), icon + label text visible. Used next to standalone numbers (dashboard summary cards).
- `sm` (compact) — icon-only dot/glyph, no visible label, wrapped in shadcn `Tooltip` that reveals the full label text on hover/tap. Used inline in dense contexts like table cells, so a table of 10 holdings doesn't turn into a wall of pills. Tapping/hovering shows the same text as the `default` variant.

Build once as `<SourceBadge variant="live" | "manual" | "sample" date?={string} size="default" | "sm" />`. Every screen that shows a number imports this — never a bespoke label.

---

## 2. App shell

**Purpose:** persistent navigation frame around every authenticated page.

**Desktop (≥1024px):**
- Left sidebar, fixed width 240px, full height, `bg-slate-50`/`bg-slate-900`, right border.
- Top of sidebar: wordmark "InvestIQ AI" (text, no logo mark needed for Phase 1), `text-lg font-semibold`, `px-4 py-4`.
- Nav list below, one item per row, `px-3 py-2` each (44px+ tap target height), icon (20px) + label:
  1. Dashboard — `LayoutDashboard`
  2. Portfolio — `Briefcase`
  3. Stocks — `LineChart`
  4. Theses — `BookOpen`
  5. Committee — `Users`
  6. Watchlist — `Eye`
  7. Reviews — `ClipboardCheck`
  8. Settings — `Settings`
- Active item: `bg-blue-50 text-blue-700` (light) / `bg-blue-950 text-blue-300` (dark), plus a 2px accent bar on the left edge of the row. Inactive: `text-slate-600`/`text-slate-400`, hover `bg-slate-100`/`bg-slate-800`.
- Bottom of sidebar, pinned (`mt-auto`), above a `Separator`:
  - Theme toggle: small icon button, `Sun`/`Moon` icon that swaps with the active theme, `variant="ghost"`.
  - User row: shadcn `Avatar` (initials fallback, no photo upload in Phase 1) + email address (`text-sm`, truncate), and a "Sign out" `Button variant="ghost" size="sm"` beneath or beside it.

**Tablet (768–1023px):** sidebar collapses to a 64px icon-only rail — icons only, centered, no labels; hovering (or long-press on touch) shows the label via shadcn `Tooltip`. Active/inactive styling unchanged. Theme toggle and avatar remain, labels dropped the same way.

**Mobile (<768px):** sidebar is hidden entirely. Replace with a top bar (56px tall, `border-b`): hamburger `Button variant="ghost" size="icon"` (left) that opens the full nav list inside a shadcn `Sheet` (`side="left"`, full nav content reused verbatim from desktop sidebar, including theme toggle and sign out at the bottom) — wordmark centered or left-aligned next to the hamburger — theme toggle icon on the right of the top bar for one-tap access without opening the sheet. No bottom tab bar (8 nav items is too many for a thumb-reachable tab strip; the Sheet drawer keeps one consistent pattern across breakpoints).

**Every nav item and every icon button is at least 44×44px tap target**, per touch-target basics.

---

## 3. Sign-in / Sign-up

**Purpose:** minimal email+password auth gate before the shell loads.

**Layout (all breakpoints — this screen is inherently centered/narrow, no separate mobile variant needed beyond natural reflow):**
- Full-height page, no sidebar, `bg-slate-50`/`bg-slate-950`, content vertically and horizontally centered.
- Wordmark "InvestIQ AI" above the card, `text-xl font-semibold`, `mb-6`.
- shadcn `Card`, `max-w-sm` (384px), centered:
  - `CardHeader`: `CardTitle` — "Sign in" (sign-in page) / "Create your account" (sign-up page). `CardDescription` — "Access your portfolio dashboard." / "Set up InvestIQ AI."
  - `CardContent`, stacked fields (`space-y-4`):
    - `Label` "Email" + `Input type="email"` placeholder "you@example.com"
    - `Label` "Password" + `Input type="password"` placeholder "••••••••"
    - Error state: shadcn `Alert variant="destructive"` above the fields, text e.g. "Incorrect email or password." — appears only after a failed submit, not before.
  - `CardFooter`, stacked (`space-y-3`):
    - Primary `Button` full width — "Sign in" / "Create account". While submitting: `Loader2` spinning icon + button disabled + label "Signing in…" / "Creating account…".
    - Secondary text link, centered, small: "Don't have an account? Sign up" (on sign-in page, links to `/sign-up`) or "Already have an account? Sign in" (on sign-up page, links to `/sign-in`) — styled `text-blue-600`/`text-blue-400`.

No "forgot password" flow in Phase 1 (single owner, low stakes) — leave it out rather than build a dead-end link.

---

## 4. Dashboard (only screen with real computed data in Phase 1)

**Purpose:** at-a-glance snapshot of the portfolio, computed from seed data.

**Header:** page title "Dashboard", `text-2xl font-semibold`, `mb-6`. No date-range picker or filters in Phase 1 — keep it to the one view.

**Summary row — 3 cards, `grid grid-cols-1 sm:grid-cols-3 gap-4` (stack to 1 column below 640px):**

1. **Total Portfolio Value**
   - Label (`text-sm text-slate-500`): "Total Portfolio Value"
   - Big number (`text-3xl font-semibold tabular-nums`): e.g. "OMR 24,850.000" (OMR conventionally shown to 3 decimals)
   - `SourceBadge variant="sample" size="default"` directly under the number
2. **Cash Balance**
   - Label: "Cash Balance"
   - Number: e.g. "OMR 1,240.500"
   - `SourceBadge variant="sample" size="default"`
3. **Trailing Dividend Income**
   - Label: "Trailing 12-Month Dividend Income"
   - Number: e.g. "OMR 612.750"
   - `SourceBadge variant="sample" size="default"`

Each card: shadcn `Card` with `CardContent` only (no header chrome needed — label lives inside), `p-5`.

**Holdings table**, below the summary row, in its own `Card`:
- `CardHeader`: `CardTitle` "Holdings", small `SourceBadge variant="sample" size="default"` inline to the right of the title (covers the whole table's numeric columns at a glance) — **plus**, per the golden rule, every individual value cell still carries its own `SourceBadge size="sm"` (compact dot + tooltip) right next to the number, so no single figure is ever unbadged even when scanning row-by-row.
- shadcn `Table`, columns: Ticker | Name | Quantity | Value (OMR)
  - Ticker: `font-mono font-medium` (e.g. "AAPL")
  - Name: `text-slate-600`/`text-slate-400`
  - Quantity: `tabular-nums`, right-aligned
  - Value (OMR): `tabular-nums font-medium`, right-aligned, `SourceBadge size="sm"` immediately after the number
- Table has 5–8 seeded sample rows for Phase 1.

**States:**
- **Loading:** replace summary cards with 3 shadcn `Skeleton` blocks matching card shape (label-height bar + number-height bar), and replace the table with 5 skeleton rows (a `Skeleton` per cell). No `SourceBadge` shown while loading — nothing rendered until it's real.
- **Error:** if seed data fails to load, replace the whole dashboard body with a centered shadcn `Alert variant="destructive"`: title "Couldn't load your dashboard", body "Something went wrong pulling your portfolio data." + a `Button variant="outline"` "Retry" that re-fetches. **Never fall back to showing stale or placeholder numbers here** — that would violate the golden rule (a blank/error state is always safer than a guessed number).
- **Success:** as described above. Because this is Phase 1, *all* figures are seed/sample data — every single one carries `variant="sample"`, never `live` or `manual`, until real data sources exist.
- **Empty (no holdings seeded):** not expected in Phase 1 since seed data always exists, but if the holdings array is empty, show the shared empty-state pattern from §5 inside the Holdings card only (summary cards still render, likely as "OMR 0.000" with sample badges), icon `Inbox`, text "No holdings yet."

---

## 5. Empty states — Portfolio, Stocks, Theses, Committee, Watchlist, Reviews, Settings

**Shared template** (one component, reused 7 times with different icon/copy): full-height page content area, centered vertically and horizontally, `max-w-sm mx-auto text-center`:
- Icon, 48px, `text-slate-400`/`text-slate-500`, inside a circular `bg-slate-100`/`bg-slate-800` badge (72px) for a bit of visual weight without color.
- Page name as heading, `text-xl font-semibold`, `mt-4`.
- One sentence, `text-sm text-slate-500`/`text-slate-400`, `mt-2`.
- Optional small `Badge variant="secondary"` "Coming soon" beneath the sentence, `mt-4` — quiet, not a nag.

**Per-page icon + exact copy:**

| Page | Icon (lucide) | Heading | Sentence |
|---|---|---|---|
| Portfolio | `Briefcase` | "Portfolio" | "Full holdings and dividend tracking are coming here." |
| Stocks | `LineChart` | "Stocks" | "Stock analysis pages with an AI health score are coming here." |
| Theses | `BookOpen` | "Theses" | "Your investment thesis tracker is coming here." |
| Committee | `Users` | "Committee" | "AI investment committee debates are coming here." |
| Watchlist | `Eye` | "Watchlist" | "The stocks you're watching are coming here." |
| Reviews | `ClipboardCheck` | "Reviews" | "AI weekly portfolio reviews are coming here." |
| Settings | `Settings` | "Settings" | "Preferences and API keys are coming here." |

Keep the sentence to exactly one line at 390px width — all seven above fit comfortably in `max-w-sm`.

---

## 6. Loading skeleton pattern (global)

Use shadcn `Skeleton` everywhere a real component would go — never a spinner-only page for content that has a known shape. Rule of thumb: the skeleton should be shaped like the real layout (same card grid, same table row count) so there's no layout shift when data arrives.
- Text lines: `h-4 rounded` at the width the real text will roughly take (e.g. `w-24` for a label, `w-32` for a number).
- Cards: skeleton the label bar + number bar inside the same `Card` shape used for real content, so the page geometry doesn't jump.
- Tables: 5 skeleton rows, one `Skeleton` per cell, same column widths as real rows.
- Full-page loads (e.g. first paint before auth resolves): centered `Loader2` spinner is acceptable only when there's no known layout to skeleton yet (e.g. blank auth check) — everywhere else, prefer shaped skeletons.

---

## 7. Global error boundary

For unhandled render errors (React error boundary, not a per-fetch error like the dashboard's own error state in §4): centered content within the app shell (sidebar/top bar stays visible so the user can still navigate away), `max-w-sm mx-auto text-center`, vertically centered in the content area:
- `AlertTriangle` icon, 40px, `text-red-600`/`text-red-400`, inside a `bg-red-50`/`bg-red-950` circular badge (same 72px treatment as empty states, so the two "nothing to show" moments feel like one family).
- Heading `text-xl font-semibold`: "Something went wrong."
- Body `text-sm text-slate-500`: "This page hit an error and couldn't load. You can try again or head back to the dashboard."
- Two buttons, `flex gap-3 justify-center mt-4`: `Button` "Try again" (resets the boundary), `Button variant="outline"` "Go to Dashboard" (link to `/dashboard`).

---

## 8. shadcn/ui components to install/use (Phase 1 scope)

`Button`, `Card` (+ CardHeader/CardTitle/CardDescription/CardContent/CardFooter), `Table` (+ TableHeader/TableBody/TableRow/TableHead/TableCell), `Badge`, `Skeleton`, `Alert` (+ AlertTitle/AlertDescription), `Sheet`, `Tooltip`, `Input`, `Label`, `Avatar`, `Separator`. All are standard shadcn/ui components (added via the shadcn CLI, which copies source into the repo rather than adding an npm dependency — consistent with "no new dependencies").

No `DropdownMenu`/`Popover` needed for Phase 1 — the sidebar's user row and theme toggle are plain buttons, keep them simple.

---

## 9. Decisions that need the owner's taste, not mine

1. **Accent color = blue.** I picked Tailwind `blue` (avoiding purple per the brief, and avoiding green/red since those are reserved for gains/losses). If the owner has a preference (e.g. a cooler teal, or a warmer amber-as-accent instead of warning-only), swap it — it's a single token change, not a rebuild.
2. **Wordmark only, no logo mark.** Phase 1 ships with text "InvestIQ AI" as the brand mark in the sidebar and auth screens. If the owner wants an icon/mark, that's a follow-up (no dependency needed either way, just an asset).
3. **`next-themes` vs. hand-rolled theme persistence** (§0): I recommended the zero-dependency hand-rolled approach for Phase 1. If the owner cares about eliminating the brief flash-of-wrong-theme on first load, `next-themes` is the standard one-package fix — flagged, not decided, since it's a new dependency.
4. **OMR formatting** — I used 3 decimal places (OMR's actual minor unit is baisa, 1/1000), comma thousands separator, "OMR" prefix (e.g. "OMR 24,850.000"). If the owner prefers a currency symbol or fewer decimals for readability, that's a one-line formatting decision, not a layout change.
