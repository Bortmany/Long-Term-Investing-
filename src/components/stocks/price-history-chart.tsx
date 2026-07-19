"use client";

// One-year price-history line chart (ui-spec §4.2) — single series, so blue
// is fine here (§2.7). Lazy-loaded via next/dynamic in the page so recharts
// never blocks first paint (same pattern as the Dashboard's donuts/bar chart).
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

export function PriceHistoryChart({
  points,
  currency,
}: {
  points: { date: Date; close: number }[];
  currency: string;
}) {
  const data = points.map((p) => ({ date: p.date.getTime(), close: p.close }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data}>
        <CartesianGrid
          vertical={false}
          className="stroke-slate-100 dark:stroke-slate-800"
        />
        <XAxis
          dataKey="date"
          type="number"
          domain={["dataMin", "dataMax"]}
          tickFormatter={(value) => formatShortDate(new Date(value))}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12, fill: "currentColor" }}
          className="text-slate-500 dark:text-slate-400"
          minTickGap={40}
        />
        <YAxis hide domain={["auto", "auto"]} />
        <Tooltip
          labelFormatter={(value) => formatShortDate(new Date(value as number))}
          formatter={(value) => formatMoney(Number(value), currency)}
        />
        <Line
          type="monotone"
          dataKey="close"
          stroke="#2563eb"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default PriceHistoryChart;
