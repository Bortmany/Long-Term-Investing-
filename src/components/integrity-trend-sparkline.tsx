"use client";

// Small reusable sparkline plotting a Thesis's integrity score over time
// (ui-spec §5.2). No axes/gridlines — a quick "is it trending down" glance,
// not a chart to read exact values off. Single series, so the blue-600
// accent is correct per §2.7. Renders nothing when fewer than two points
// exist — never a single point floating in space.
import { Line, LineChart, ResponsiveContainer } from "recharts";

export type IntegrityTrendPoint = {
  date: Date;
  score: number;
};

export function IntegrityTrendSparkline({
  points,
}: {
  points: IntegrityTrendPoint[];
}) {
  if (points.length < 2) return null;

  const data = points.map((p) => ({
    date: p.date.toISOString(),
    score: p.score,
  }));

  return (
    <div className="h-12 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
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
    </div>
  );
}
