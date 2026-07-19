import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAiClient } from "@/lib/ai/client";
import { weeklyReviewSchema } from "@/lib/ai/schemas";
import { ConnectKeyNotice } from "@/components/connect-key-notice";
import { EmptyState } from "@/components/empty-state";
import { RunWeeklyReviewButton } from "@/components/reviews/run-weekly-review-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatIsoWeek } from "@/lib/format";

export const metadata = { title: "Reviews — InvestIQ AI" };

/** First line of a paragraph, trimmed for the list's Summary column. */
function firstLine(text: string): string {
  const line = text.split("\n")[0] ?? text;
  return line.length > 140 ? `${line.slice(0, 140)}…` : line;
}

// /reviews — the weekly, whole-portfolio AI check-in (ui-spec §7.1). No-key
// state takes precedence over the empty-vs-populated list: the header button
// is hidden entirely and ConnectKeyNotice explains why, whether or not any
// past review exists (there's genuinely nothing to run either way).
export default async function ReviewsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/sign-in");
  }
  const userId = session.user.id;

  const hasAiKey = getAiClient().ok;

  if (!hasAiKey) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Reviews</h1>
        <ConnectKeyNotice />
      </div>
    );
  }

  const reviews = await prisma.weeklyReview.findMany({
    where: { userId },
    orderBy: { period: "desc" },
  });

  const rows = reviews.map((review) => {
    const parsed = weeklyReviewSchema.safeParse(review.output);
    return {
      id: review.id,
      period: review.period,
      summary: parsed.success ? firstLine(parsed.data.summary) : "Summary unavailable.",
    };
  });

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        heading="Reviews"
        sentence="Weekly AI reviews of your whole portfolio will appear here."
        action={<RunWeeklyReviewButton />}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Reviews</h1>
        <RunWeeklyReviewButton />
      </div>

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
              <TableCell className="font-medium whitespace-nowrap">
                <Link href={`/reviews/${row.id}`} className="hover:underline">
                  {formatIsoWeek(row.period)}
                </Link>
              </TableCell>
              <TableCell className="max-w-xl truncate text-slate-600 dark:text-slate-400">
                {row.summary}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
