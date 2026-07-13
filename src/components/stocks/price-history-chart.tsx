"use client";

// One-year price history line chart for the stock detail page (ui-spec §4.2).
// Receives plain points (date + close, already converted) from the server
// page and only draws them — no computation, no invented figures. Single data
// series, so the solid blue-600 accent is the right color (§2.7); no
// fill/gradient anywhere per the tokens.
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatMoney, formatShortDate } from "@/lib/format";

export type PricePointData = {
  /** ISO date string (RSC-serializable). */
  date: string;
  close: number;
};

function ChartTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ value?: unknown; payload?: PricePointData }>;
  currency: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0];
  const value = point?.value;
  if (typeof value !== "number" || !point.payload) return null;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="text-slate-500 dark:text-slate-400">
        {formatShortDate(new Date(point.payload.date))}
      </div>
      <div className="font-medium tabular-nums text-slate-900 dark:text-slate-50">
        {formatMoney(value, currency)}
      </div>
    </div>
  );
}

export function PriceHistoryChart({
  points,
  currency,
}: {
  points: PricePointData[];
  currency: string;
}) {
  return (
    <div className="h-[280px] text-slate-500 dark:text-slate-400">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid
            vertical={false}
            className="stroke-slate-100 dark:stroke-slate-800"
          />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            minTickGap={48}
            tick={{ fontSize: 11, fill: "currentColor" }}
            tickFormatter={(value: string) => formatShortDate(new Date(value))}
          />
          <YAxis
            width={64}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "currentColor" }}
            tickFormatter={(value: number) => formatMoney(value, currency)}
            domain={["auto", "auto"]}
          />
          <Tooltip
            cursor={{ stroke: "rgba(148, 163, 184, 0.4)" }}
            content={(props) => <ChartTooltip {...props} currency={currency} />}
          />
          <Line
            type="monotone"
            dataKey="close"
            stroke="#2563eb"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
