"use client";

// Portfolio X-ray — the landing page's interactive demo. The visitor picks
// up to four holdings from a preset list and dashboard-style cards render
// instantly: total value, a derived cash balance, derived dividend income,
// and an allocation donut by market.
//
// Everything here is hard-coded sample data — no network calls, no real
// prices — and per the golden rule EVERY figure wears a visible
// `SourceBadge variant="sample"`, exactly like seeded data does in the app.
// The cash balance is intentionally computed (sample deposit minus the cost
// of the picked holdings) to demonstrate the app's core idea: cash and
// dividends are derived from transactions, never typed in.
import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

import { SourceBadge } from "@/components/source-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney, formatPercent, formatQuantity } from "@/lib/format";
import { cn } from "@/lib/utils";

type DemoMarket = "United States" | "Muscat (MSX)" | "Tadawul" | "Dubai (DFM)";

type DemoHolding = {
  ticker: string;
  name: string;
  market: DemoMarket;
  quantity: number;
  /** What the sample transactions paid for this position, in OMR. */
  cost: number;
  /** Sample market value today, in OMR. */
  value: number;
  /** Sample dividends received over the trailing 12 months, in OMR. */
  dividendTtm: number;
};

// Preset sample holdings. Values are invented demo figures in OMR — that is
// exactly why every number rendered from them carries the sample badge.
const PRESET_HOLDINGS: DemoHolding[] = [
  { ticker: "AAPL", name: "Apple", market: "United States", quantity: 10, cost: 700, value: 845.2, dividendTtm: 3.85 },
  { ticker: "MSFT", name: "Microsoft", market: "United States", quantity: 6, cost: 850, value: 1012.5, dividendTtm: 7.2 },
  { ticker: "V", name: "Visa", market: "United States", quantity: 4, cost: 640, value: 702.8, dividendTtm: 2.4 },
  { ticker: "BKMB", name: "Bank Muscat", market: "Muscat (MSX)", quantity: 3000, cost: 810, value: 936.0, dividendTtm: 48.6 },
  { ticker: "2222", name: "Saudi Aramco", market: "Tadawul", quantity: 320, cost: 890, value: 921.6, dividendTtm: 37.44 },
  { ticker: "EMAAR", name: "Emaar Properties", market: "Dubai (DFM)", quantity: 700, cost: 620, value: 771.4, dividendTtm: 35.0 },
];

// The demo's single sample "deposit" transaction, in OMR. Cash below is
// derived from it, never stated directly.
const SAMPLE_DEPOSIT = 5000;

const MAX_PICKS = 4;

// One fixed chart-token color per market, so a market keeps its color no
// matter which holdings are picked (tokens come from globals.css).
const MARKET_COLORS: Record<DemoMarket, string> = {
  "United States": "var(--chart-1)",
  "Muscat (MSX)": "var(--chart-2)",
  Tadawul: "var(--chart-3)",
  "Dubai (DFM)": "var(--chart-4)",
};

function SummaryFigure({ label, amount }: { label: string; amount: number }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums sm:text-3xl">
          {formatMoney(amount, "OMR")}
        </p>
        <SourceBadge variant="sample" className="mt-2" />
      </CardContent>
    </Card>
  );
}

export function PortfolioXray() {
  const [picked, setPicked] = useState<string[]>(["AAPL", "BKMB", "2222"]);

  function toggle(ticker: string) {
    setPicked((current) => {
      if (current.includes(ticker)) {
        // Keep at least one holding picked so the cards never go blank.
        if (current.length === 1) return current;
        return current.filter((t) => t !== ticker);
      }
      if (current.length >= MAX_PICKS) return current;
      return [...current, ticker];
    });
  }

  const holdings = useMemo(
    () => PRESET_HOLDINGS.filter((h) => picked.includes(h.ticker)),
    [picked],
  );

  const totalValue = holdings.reduce((sum, h) => sum + h.value, 0);
  const totalCost = holdings.reduce((sum, h) => sum + h.cost, 0);
  // Derived, the way the real app derives it: deposits minus purchases.
  const cashBalance = SAMPLE_DEPOSIT - totalCost;
  const dividendIncome = holdings.reduce((sum, h) => sum + h.dividendTtm, 0);

  // Allocation by market, largest first.
  const slices = useMemo(() => {
    const byMarket = new Map<DemoMarket, number>();
    for (const h of holdings) {
      byMarket.set(h.market, (byMarket.get(h.market) ?? 0) + h.value);
    }
    return [...byMarket.entries()]
      .map(([market, value]) => ({ market, value }))
      .sort((a, b) => b.value - a.value);
  }, [holdings]);

  const atLimit = picked.length >= MAX_PICKS;

  return (
    <div>
      {/* Holding picker */}
      <div className="flex flex-wrap justify-center gap-2">
        {PRESET_HOLDINGS.map((holding) => {
          const selected = picked.includes(holding.ticker);
          return (
            <button
              key={holding.ticker}
              type="button"
              onClick={() => toggle(holding.ticker)}
              aria-pressed={selected}
              disabled={!selected && atLimit}
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background outline-none",
                selected
                  ? "border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950 dark:text-blue-300"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-900",
              )}
            >
              {selected ? <Check className="size-4" aria-hidden="true" /> : null}
              <span className="font-mono font-medium">{holding.ticker}</span>
              <span className="hidden sm:inline">{holding.name}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400">
        Pick up to four sample holdings — the cards below recompute instantly.
      </p>

      {/* Summary cards */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryFigure label="Total Holdings Value" amount={totalValue} />
        <SummaryFigure label="Cash Balance" amount={cashBalance} />
        <SummaryFigure label="Trailing 12-Month Dividend Income" amount={dividendIncome} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Allocation donut by market */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Allocation by Market</CardTitle>
            <SourceBadge variant="sample" />
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="market"
                  innerRadius="55%"
                  outerRadius="80%"
                  stroke="none"
                  isAnimationActive={false}
                >
                  {slices.map((slice) => (
                    <Cell key={slice.market} fill={MARKET_COLORS[slice.market]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <ul className="mt-3 flex flex-col gap-1 text-xs">
              {slices.map((slice) => (
                <li key={slice.market} className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: MARKET_COLORS[slice.market] }}
                  />
                  <span className="flex-1 truncate text-slate-600 dark:text-slate-400">
                    {slice.market}
                  </span>
                  <span className="tabular-nums text-slate-500 dark:text-slate-400">
                    {formatPercent(totalValue > 0 ? (slice.value / totalValue) * 100 : 0)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Holdings list */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Holdings</CardTitle>
            <SourceBadge variant="sample" />
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {holdings.map((holding) => (
                <li key={holding.ticker} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="w-16 shrink-0 font-mono font-medium">{holding.ticker}</span>
                  <span className="flex-1 truncate text-slate-600 dark:text-slate-400">
                    {formatQuantity(holding.quantity)} shares
                  </span>
                  <span className="tabular-nums font-medium">
                    {formatMoney(holding.value, "OMR")}
                  </span>
                  <SourceBadge variant="sample" size="sm" />
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
              Cash here is derived: an {formatMoney(SAMPLE_DEPOSIT, "OMR")} sample deposit minus
              what the picked holdings cost. In the app, cash and dividends are computed from
              your recorded transactions the same way — never typed in.
            </p>
          </CardContent>
        </Card>
      </div>

      <p className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400">
        Every figure above is labeled <span className="font-medium">Sample data</span>. Inside
        the app, each number carries its real source — live, manual with its date, or derived
        from your own transactions. A number is never shown without one.
      </p>
    </div>
  );
}

export default PortfolioXray;
