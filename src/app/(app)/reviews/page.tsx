import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasAnthropicKey } from "@/lib/ai/client";
import { weeklyReviewSchema } from "@/lib/ai/schemas";
import { formatIsoWeek } from "@/lib/format";
import { ConnectKeyNotice } from "@/components/connect-key-notice";
import { EmptyState } from "@/components/empty-state";
import { RunReviewButton } from "@/components/reviews/run-review-button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata = { title: "Reviews — InvestIQ AI" };

// /reviews — the weekly, whole-portfolio AI check-in (ui-spec §7.1). The
// "Run weekly review" trigger is hidden entirely when AI is off (§2.5's
// standard no-key page pattern) and ConnectKeyNotice fills the content area
// instead — that takes precedence over the empty-list state.
export default async function ReviewsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/sign-in");
  }
  const userId = session.user.id;

  const hasKey = hasAnthropicKey();

  // Scoped to THIS user's id, never anything else — a WeeklyReview can embed
  // a user's private portfolio composition, so it is read exactly like
  // AiAnalysis: userId always in the where clause.
  const reviews = await prisma.weeklyReview.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  // Parse each row's persisted output defensively (defense in depth, same
  // idiom as stockScoreSchema.safeParse on the stock detail page) — a row
  // that fails to parse (or carries a malformed period string) is skipped
  // rather than crashing the page or showing fabricated data.
  const rows = reviews.flatMap((review) => {
    const parsed = weeklyReviewSchema.safeParse(review.output);
    if (!parsed.success) return [];
    let weekLabel: string;
    try {
      weekLabel = formatIsoWeek(review.period);
    } catch {
      return [];
    }
    const summaryFirstLine = parsed.data.summary.split("\n")[0] ?? "";
    return [{ id: review.id, weekLabel, summary: summaryFirstLine }];
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Reviews</h1>
        {hasKey ? <RunReviewButton /> : null}
      </div>

      {!hasKey ? (
        <ConnectKeyNotice />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          heading="Reviews"
          sentence="Weekly AI reviews of your whole portfolio will appear here."
          action={<RunReviewButton />}
        />
      ) : (
        <Card className="py-0">
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Week</TableHead>
                  <TableHead>Summary</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap">
                      <Link href={`/reviews/${row.id}`} className="hover:underline">
                        {row.weekLabel}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-md">
                      <Link
                        href={`/reviews/${row.id}`}
                        className="block truncate hover:underline"
                      >
                        {row.summary}
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
