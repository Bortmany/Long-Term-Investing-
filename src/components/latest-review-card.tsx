// The Dashboard's "latest Weekly Review" card (BUILD-PLAN.md Phase 7).
// Reads whatever is already stored for the signed-in user and nothing
// else — THE AI RULE: never generates anything on render (see
// src/app/actions/reviews.ts / src/lib/reviews/run-for-user.ts for the only
// two places a review is ever produced).
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { weeklyReviewSchema } from "@/lib/ai/schemas";
import { formatIsoWeek, formatShortDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * `userId` is expected to already come from the caller's own server
 * session (e.g. DashboardPage's `session.user.id`) — never from client
 * input — so the query below stays correctly scoped without a second
 * session lookup in this component.
 */
export async function LatestReviewCard({ userId }: { userId: string }) {
  const review = await prisma.weeklyReview.findFirst({
    where: { userId },
    orderBy: { period: "desc" },
  });

  const parsed = review ? weeklyReviewSchema.safeParse(review.output) : null;
  const summary = parsed?.success ? parsed.data.summary : "Summary unavailable.";

  return (
    <Card className="gap-4">
      <CardHeader className="flex-row items-center gap-3">
        <ClipboardCheck
          className="size-5 text-slate-400 dark:text-slate-500"
          aria-hidden="true"
        />
        <CardTitle>Weekly Review</CardTitle>
      </CardHeader>
      <CardContent>
        {!review ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No weekly review yet.{" "}
            <Link
              href="/reviews"
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              Run your first one from Reviews →
            </Link>
          </p>
        ) : (
          <div>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
              <p className="text-sm font-medium">{formatIsoWeek(review.period)}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                generated {formatShortDate(review.createdAt)}
              </p>
            </div>
            <p className="mt-2 line-clamp-3 text-sm text-slate-600 dark:text-slate-400">
              {summary}
            </p>
            <Link
              href={`/reviews/${review.id}`}
              className="mt-3 inline-block text-sm text-blue-600 hover:underline dark:text-blue-400"
            >
              Read the full review →
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
