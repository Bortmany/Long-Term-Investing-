"use client";

// Integrity-score sparkline for /theses/[id] (ui-spec §5.2) — a small
// recharts LineChart with no axes/gridlines plotting ThesisCheck.
// integrityScore over time. Single series, so blue-600 is fine (§2.7).
// Lazy-loaded via next/dynamic in the page (same pattern as the stock
// detail's PriceHistoryChart) so recharts never blocks first paint.
import { Line, LineChart, ResponsiveContainer } from "recharts";

export function IntegrityTrendSparkline({
  points,
}: {
  points: { date: Date; score: number }[];
}) {
  const data = points.map((p) => ({ date: p.date.getTime(), score: p.score }));

  return (
    <ResponsiveContainer width="100%" height={48}>
      <LineChart data={data}>
        <Line
          type="monotone"
          dataKey="score"
          stroke="#2563eb"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default IntegrityTrendSparkline;
