import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, TrendingDown, TrendingUp, TriangleAlert } from "lucide-react";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { weeklyReviewSchema, type WeeklyReviewOutput } from "@/lib/ai/schemas";
import { formatIsoWeek, formatPercent } from "@/lib/format";
import { AiPanel } from "@/components/ai-panel";

export const metadata = { title: "Weekly Review — InvestIQ AI" };

// /reviews/[id] — one week's full review (ui-spec §7.2). Next.js 16: dynamic
// route params are async.
export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/sign-in");
  }
  const userId = session.user.id;

  // Scoped to THIS user's id — a review id from the client is never trusted
  // alone. This also correctly 404s another user's review id rather than
  // leaking it, same as every other detail page in this app.
  const row = await prisma.weeklyReview.findFirst({ where: { id, userId } });
  if (!row) {
    notFound();
  }

  const parsed = weeklyReviewSchema.safeParse(row.output);
  if (!parsed.success) {
    // Defense in depth — an honest message, never fabricated data standing
    // in for a row that failed to parse.
    return (
      <div className="flex flex-col gap-4">
        <Link
          href="/reviews"
          className="text-sm text-slate-500 hover:underline dark:text-slate-400"
        >
          ← All Reviews
        </Link>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          This review could not be displayed.
        </p>
      </div>
    );
  }
  const output = parsed.data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/reviews"
          className="text-sm text-slate-500 hover:underline dark:text-slate-400"
        >
          ← All Reviews
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{formatIsoWeek(row.period)}</h1>
      </div>

      {/* A past review is a fixed historical record — nothing to re-run
          (each week gets its own new review, never a re-run of an old one) —
          so this renders through AiPanel's readOnly mode: caption still
          shown, no action button, AiDisclaimer still in the footer. */}
      <AiPanel
        title="Weekly Review"
        actionLabel="Run weekly review"
        pendingLabel="Running…"
        analysis={{ createdAt: row.createdAt, model: row.model, dataAsOf: row.dataAsOf }}
        hasKey={true}
        readOnly
      >
        <ReviewBody output={output} />
      </AiPanel>
    </div>
  );
}

function ReviewBody({ output }: { output: WeeklyReviewOutput }) {
  return (
    <div className="flex flex-col gap-6">
      {/* Summary */}
      <p className="text-sm leading-relaxed">{output.summary}</p>

      {/* New Risks — the other legitimate amber reuse per §2.6. */}
      {output.newRisks.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold">New Risks</h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            {output.newRisks.map((risk, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <TriangleAlert
                  className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
                  aria-hidden="true"
                />
                <span>{risk}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Improved / Weakened holdings — a qualitative AI judgment, so neutral
          slate icons, never green/red (§2.6). */}
      {output.improvedHoldings.length > 0 || output.weakenedHoldings.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold">Improved Holdings</h3>
            {output.improvedHoldings.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-1.5">
                {output.improvedHoldings.map((holding, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <TrendingUp
                      className="mt-0.5 size-4 shrink-0 text-slate-500 dark:text-slate-400"
                      aria-hidden="true"
                    />
                    <span>
                      <span className="font-mono">{holding.ticker}</span>{" "}
                      <span className="text-slate-600 dark:text-slate-400">
                        {holding.reason}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                None this week.
              </p>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold">Weakened Holdings</h3>
            {output.weakenedHoldings.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-1.5">
                {output.weakenedHoldings.map((holding, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <TrendingDown
                      className="mt-0.5 size-4 shrink-0 text-slate-500 dark:text-slate-400"
                      aria-hidden="true"
                    />
                    <span>
                      <span className="font-mono">{holding.ticker}</span>{" "}
                      <span className="text-slate-600 dark:text-slate-400">
                        {holding.reason}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                None this week.
              </p>
            )}
          </div>
        </div>
      ) : null}

      {/* Allocation Drift — over/underweight isn't inherently good or bad, so
          Drift is a plain signed slate number, never colored (§2.6). */}
      {output.allocationDrift.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold">Allocation Drift</h3>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="py-1.5 text-left font-medium text-slate-500 dark:text-slate-400">
                  Category
                </th>
                <th className="py-1.5 text-right font-medium text-slate-500 dark:text-slate-400">
                  Target %
                </th>
                <th className="py-1.5 text-right font-medium text-slate-500 dark:text-slate-400">
                  Actual %
                </th>
                <th className="py-1.5 text-right font-medium text-slate-500 dark:text-slate-400">
                  Drift
                </th>
              </tr>
            </thead>
            <tbody>
              {output.allocationDrift.map((row, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0 dark:border-slate-900">
                  <td className="py-1.5">{row.category}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {formatPercent(row.targetPercent)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {formatPercent(row.actualPercent)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-400">
                    {formatPercent(row.drift, { signed: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* Suggested Actions */}
      {output.suggestedActions.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold">Suggested Actions</h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            {output.suggestedActions.map((action, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <ArrowRight
                  className="mt-0.5 size-4 shrink-0 text-slate-500 dark:text-slate-400"
                  aria-hidden="true"
                />
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Behavioral Note — deliberately quiet/hushed, no icon (an icon would
          make it read as another alert, the opposite of the reflective tone
          this section wants). */}
      <div>
        <p className="mb-1 text-xs uppercase tracking-wide text-slate-400">
          Behavioral Note
        </p>
        <p className="border-l-2 border-slate-200 py-1 pl-4 text-sm italic text-slate-500 dark:border-slate-800 dark:text-slate-400">
          {output.behavioralNote}
        </p>
      </div>
    </div>
  );
}
