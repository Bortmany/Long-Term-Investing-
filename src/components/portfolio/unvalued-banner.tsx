// The one amber "Some positions couldn't be valued" banner, shared by the
// Dashboard and the Portfolio page. Amber means "needs your attention" only.
// Golden rule: it names what was left out and why, instead of padding the
// totals. Hidden entirely when nothing is incomplete (the caller passes null).
import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { UnvaluedSummary } from "@/lib/portfolio";

const linkClass =
  "inline-flex min-h-11 items-center text-sm font-medium text-blue-600 underline-offset-4 hover:underline dark:text-blue-400";

export function UnvaluedBanner({
  summary,
  priceHref,
  className,
}: {
  /** From describeUnvalued(); null means nothing is incomplete. */
  summary: UnvaluedSummary | null;
  /** Where "Update price" goes: the holdings on /portfolio. */
  priceHref: string;
  className?: string;
}) {
  if (!summary) return null;
  return (
    <Alert variant="warning" className={className}>
      <TriangleAlert aria-hidden="true" />
      <AlertTitle className="line-clamp-none">{summary.title}</AlertTitle>
      <AlertDescription>
        <p>{summary.description}</p>
        {summary.needsRate || summary.needsPrice ? (
          <div className="flex flex-col gap-x-6 sm:flex-row">
            {summary.needsRate ? (
              <Link href="/settings#exchange-rates" className={linkClass}>
                Add an exchange rate
              </Link>
            ) : null}
            {summary.needsPrice ? (
              <Link href={priceHref} className={linkClass}>
                Update price
              </Link>
            ) : null}
          </div>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
