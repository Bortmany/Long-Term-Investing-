import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ClipboardCheck, TrendingDown, TrendingUp, TriangleAlert } from "lucide-react";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ANALYSIS_MODEL, getAiClient } from "@/lib/ai/client";
import {
  extractSectorDrift,
  extractWeeklyReviewFields,
  extractWeeklyReviewMeta,
} from "@/lib/reviews/output";
import { AiPanel } from "@/components/ai-panel";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatIsoWeek, formatPercent } from "@/lib/format";

// Ownership-checked, honest not-found (this exact bug class — a page title
// lookup that skipped the userId scope — appeared in Phase 4, so
// generateMetadata below is session-scoped exactly like the page body).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  const review = session
    ? await prisma.weeklyReview.findFirst({ where: { id, userId: session.user.id } })
    : null;
  return {
    title: review ? `${formatIsoWeek(review.period)} — InvestIQ AI` : "Review — InvestIQ AI",
  };
}

function notFound() {
  return (
    <EmptyState
      icon={ClipboardCheck}
      heading="Review not found"
      sentence="This weekly review doesn't exist or has been removed."
      action={
        <Button asChild>
          <Link href="/reviews">Back to Reviews</Link>
        </Button>
      }
    />
  );
}

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/sign-in");
  }
  const userId = session.user.id;
  const { id } = await params;

  // Ownership check: only THIS user's own review, never a client-supplied id
  // trusted on its own.
  const review = await prisma.weeklyReview.findFirst({ where: { id, userId } });
  if (!review) return notFound();

  const output = extractWeeklyReviewFields(review.output);
  if (!output) return notFound();

  const meta = extractWeeklyReviewMeta(review.output, review.createdAt, ANALYSIS_MODEL);
  const sectorDrift = extractSectorDrift(review.output);
  const hasAiKey = getAiClient().ok;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/reviews"
          className="text-sm text-slate-500 hover:underline dark:text-slate-400"
        >
          ← All Reviews
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{formatIsoWeek(review.period)}</h1>
      </div>

      {/* A past review is a fixed historical record — nothing to "re-run" for
          a week that's already over; readOnly hides the action button while
          still showing the standard AiPanel caption + disclaimer. */}
      <AiPanel
        title="Weekly Review"
        actionLabel="Run weekly review"
        pendingLabel="Running…"
        analysis={meta}
        hasKey={hasAiKey}
        readOnly
      >
        <div className="space-y-6">
          <p className="text-sm leading-relaxed">{output.summary}</p>

          {output.newRisks.length > 0 ? (
            <div>
              <h3 className="text-sm font-semibold">New Risks</h3>
              <ul className="mt-2 space-y-1.5">
                {output.newRisks.map((risk, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm">
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

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold">Improved Holdings</h3>
              {output.improvedHoldings.length > 0 ? (
                <ul className="mt-2 space-y-1.5">
                  {output.improvedHoldings.map((holding, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm">
                      <TrendingUp
                        className="mt-0.5 size-4 shrink-0 text-slate-500 dark:text-slate-400"
                        aria-hidden="true"
                      />
                      <span>
                        <span className="font-mono font-medium">{holding.ticker}</span> —{" "}
                        {holding.reason}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">None noted.</p>
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold">Weakened Holdings</h3>
              {output.weakenedHoldings.length > 0 ? (
                <ul className="mt-2 space-y-1.5">
                  {output.weakenedHoldings.map((holding, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm">
                      <TrendingDown
                        className="mt-0.5 size-4 shrink-0 text-slate-500 dark:text-slate-400"
                        aria-hidden="true"
                      />
                      <span>
                        <span className="font-mono font-medium">{holding.ticker}</span> —{" "}
                        {holding.reason}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">None noted.</p>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Allocation Drift</h3>
            <p className="mt-2 text-sm leading-relaxed">{output.allocationDrift}</p>
            {/* The Last Week/This Week/Drift numbers below are computed purely
                in code (src/lib/reviews/delta.ts), never asked of the model —
                same discipline src/lib/ai/committee.ts uses for
                consensusScore. Labeled "Last Week"/"This Week" rather than
                ui-spec's literal "Target %"/"Actual %": this app has no
                target-allocation feature, so "Target" would imply a goal
                that doesn't exist — a deliberate, documented deviation in
                service of the golden rule (never a misleading label). */}
            {sectorDrift && sectorDrift.length > 0 ? (
              <Table className="mt-3">
                <TableHeader>
                  <TableRow>
                    <TableHead>Sector</TableHead>
                    <TableHead className="text-right">Last Week</TableHead>
                    <TableHead className="text-right">This Week</TableHead>
                    <TableHead className="text-right">Drift</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sectorDrift.map((row) => (
                    <TableRow key={row.label}>
                      <TableCell>{row.label}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.previousPercent === null ? "New" : formatPercent(row.previousPercent)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPercent(row.currentPercent)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.driftPercent === null
                          ? "—"
                          : formatPercent(row.driftPercent, { signed: true })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : null}
          </div>

          {output.suggestedActions.length > 0 ? (
            <div>
              <h3 className="text-sm font-semibold">Suggested Actions</h3>
              <ul className="mt-2 space-y-1.5">
                {output.suggestedActions.map((action, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm">
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

          <div>
            <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">
              Behavioral Note
            </p>
            <blockquote className="mt-1 border-l-2 border-slate-200 py-1 pl-4 text-sm text-slate-500 italic dark:border-slate-800 dark:text-slate-400">
              {output.behavioralNote}
            </blockquote>
          </div>
        </div>
      </AiPanel>
    </div>
  );
}
