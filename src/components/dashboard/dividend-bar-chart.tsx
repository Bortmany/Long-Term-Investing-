"use client";

// Trailing-12-month dividend income bar chart (UI spec §3.1). Single-series
// chart, so blue is fine here (§2.7) — it's the sole data series, not a
// competing category. Lazy-loaded via next/dynamic so recharts never blocks
// first paint.
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatMoney } from "@/lib/format";
import type { MonthlyDividendBucket } from "@/lib/portfolio";

export function DividendBarChart({
  buckets,
  baseCurrency,
}: {
  buckets: MonthlyDividendBucket[];
  baseCurrency: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={buckets}>
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12, fill: "currentColor" }}
          className="text-slate-500 dark:text-slate-400"
        />
        <YAxis hide />
        <Tooltip
          cursor={{ fill: "rgba(148, 163, 184, 0.15)" }}
          formatter={(value) => formatMoney(Number(value), baseCurrency)}
        />
        <Bar dataKey="total" fill="#2563eb" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default DividendBarChart;
