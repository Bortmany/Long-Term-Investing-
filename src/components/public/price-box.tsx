// The price area of a public stock page. Two states, decided on the server by
// src/lib/public-stock.ts:
//   - sign_in (the launch state, every market): a calm "Sign in to see prices"
//     box. No number, no chart, no placeholder that looks like a failed load.
//   - price (only when the owner has switched a written-licence flag on and a
//     fresh stored price from that vendor exists): the price, its source badge
//     and its date.
import Link from "next/link";
import { Lock } from "lucide-react";

import { SourceBadge } from "@/components/source-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { describePriceProvider } from "@/lib/data/provider-info";
import { formatMoney, formatShortDate } from "@/lib/format";
import type { PublicEntry } from "@/lib/public-catalogue";
import type { PublicPriceDecision } from "@/lib/public-stock";
import { PUBLIC_COPY } from "@/lib/public-stock-copy";

const createAccountLink =
  "inline-flex min-h-11 items-center text-sm text-blue-600 underline-offset-4 hover:underline dark:text-blue-400";

export function PriceBox({
  decision,
  entry,
}: {
  decision: PublicPriceDecision;
  entry: PublicEntry;
}) {
  if (decision.kind === "sign_in") {
    return (
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
              <Lock aria-hidden="true" className="size-5 text-slate-500" />
            </span>
            <div>
              <h2 className="text-base font-semibold">{PUBLIC_COPY.priceBoxTitle}</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {PUBLIC_COPY.priceBoxLine}
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="lg" className="w-full">
            <Link href="/sign-in">{PUBLIC_COPY.signInToSeePrices}</Link>
          </Button>
          <Link href="/sign-up" className={createAccountLink}>
            {PUBLIC_COPY.createAccountLink}
          </Link>
        </CardContent>
      </Card>
    );
  }

  // Licensed state: the vendor's own wording names who supplied it and how late.
  const detail = describePriceProvider({
    priceSource: decision.source,
    market: entry.market,
    asOf: decision.asOf,
  });
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {PUBLIC_COPY.latestPriceTitle}
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {formatMoney(decision.price, decision.currency)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <SourceBadge variant="live" detail={detail ?? undefined} />
            <span className="text-xs text-slate-500 dark:text-slate-400">
              As of {formatShortDate(decision.asOf)}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {PUBLIC_COPY.priceDisclaimer}
          </p>
        </div>
        <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
          <p className="text-sm">{PUBLIC_COPY.signInToTrack}</p>
          <Button asChild variant="outline" size="lg" className="w-full">
            <Link href="/sign-in">{PUBLIC_COPY.signIn}</Link>
          </Button>
          <Link href="/sign-up" className={createAccountLink}>
            {PUBLIC_COPY.createAccountLink}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
