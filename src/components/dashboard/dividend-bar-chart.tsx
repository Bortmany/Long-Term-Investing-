"use client";

// Trailing-12-month dividend income bar chart for the Dashboard's Dividend
// Income card (UI spec §3.1). Receives 12 plain monthly buckets from the
// server page (oldest first, Decimals already converted) and only draws
// them — no computation, no invented figures. Single data series, so the
// solid blue-600 accent is the right color here (§2.7).
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";

import { formatMoney } from "@/lib/format";

export type DividendBar = {
  /** Short month label for the x-axis, e.g. "Jul". */
  label: string;
  /** Dividend income for that month, in the portfolio base currency. */
  total: number;
};

// Hand-rolled tooltip body so it follows the app's light/dark styling and
// shows the exact formatMoney amount (the default recharts tooltip doesn't
// know about dark mode or our money formatting).
function ChartTooltip({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ value?: unknown }>;
  label?: unknown;
  currency: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const value = payload[0]?.value;
  if (typeof value !== "number") return null;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <span className="text-slate-500 dark:text-slate-400">{String(label)}: </span>
      <span className="font-medium tabular-nums text-slate-900 dark:text-slate-50">
        {formatMoney(value, currency)}
      </span>
    </div>
  );
}

export function DividendBarChart({
  bars,
  currency,
}: {
  bars: DividendBar[];
  currency: string;
}) {
  return (
    <div className="h-[200px] text-slate-500 dark:text-slate-400">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={bars} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            interval={0}
            tick={{ fontSize: 11, fill: "currentColor" }}
          />
          {/* No YAxis on purpose — minimal ticks per the spec; the tooltip
              carries the exact amount. */}
          <Tooltip
            cursor={{ fill: "rgba(148, 163, 184, 0.15)" }}
            content={(props) => <ChartTooltip {...props} currency={currency} />}
          />
          <Bar
            dataKey="total"
            fill="#2563eb"
            radius={[2, 2, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
