// "Dividends you've received" — the dividends THIS user recorded for this
// stock, in their base currency. Built only from their own DIVIDEND
// transactions, so every figure wears the derived badge ("Computed from your
// transactions") — or, when a payment could not be converted, the amber
// partial-total warning instead (golden rule: a figure that left something out
// never wears the clean badge). No green or red: these are not gains/losses.
import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import { SourceBadge } from "@/components/source-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { decideDividendCard } from "@/lib/portfolio/dividend-card";
import type { StockDividends } from "@/lib/portfolio/dividends";
import { formatMoney, formatShortDate } from "@/lib/format";

const WARNING_TEXT = "text-amber-700 dark:text-amber-400";

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** The amber pill that replaces the clean badge when a payment is left out. */
function PartialTotalPill({ count }: { count: number }) {
  return (
    <Tooltip className="max-w-full">
      <TooltipTrigger className="items-center gap-1 rounded-md border border-amber-600/30 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600 dark:border-amber-400/30 dark:bg-amber-950 dark:text-amber-400">
        <TriangleAlert className="size-3 shrink-0" aria-hidden="true" />
        <span>Partial total: {plural(count, "payment", "payments")} not converted</span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="start-0 w-64 translate-x-0 whitespace-normal">
        We need an exchange rate for that currency to add it to the total. You can add one in
        Settings.
      </TooltipContent>
    </Tooltip>
  );
}

export function ReceivedDividendsCard({
  ticker,
  dividends,
  loadError,
}: {
  ticker: string;
  /** null only when `loadError` is true. */
  dividends: StockDividends | null;
  loadError?: boolean;
}) {
  const heading = (
    <h3 className="text-base font-semibold">Dividends you&apos;ve received</h3>
  );

  if (loadError) {
    return (
      <div className="space-y-2">
        {heading}
        <p className={`text-sm ${WARNING_TEXT}`}>
          We couldn&apos;t load your dividend payments just now. Please refresh the page.
        </p>
      </div>
    );
  }

  if (!dividends || dividends.payments.length === 0) {
    // Nothing recorded: say so plainly. No badge, no total, no zero.
    return (
      <div className="space-y-2">
        {heading}
        <p className="text-sm text-slate-500 dark:text-slate-400">
          You haven&apos;t recorded any dividends from {ticker} yet. When you add a dividend
          transaction for it, it will show up here.
        </p>
        <Link
          href="/portfolio"
          className="inline-flex min-h-11 items-center text-sm font-medium text-blue-600 underline-offset-4 hover:underline dark:text-blue-400"
        >
          Go to Portfolio
        </Link>
      </div>
    );
  }

  const { payments, trailing, baseCurrency, missing } = dividends;

  // Same badge-or-warning decision the dashboard's dividend card uses.
  const card = decideDividendCard({
    baseCurrency,
    income: { missing },
    monthly: { missing },
    byHolding: { missing },
    labelFor: () => ticker,
  });
  const partial = card.kind === "warning";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        {heading}
        {partial ? (
          <PartialTotalPill count={missing.length} />
        ) : (
          <SourceBadge variant="derived" />
        )}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Built from the dividend transactions you recorded for this stock, shown in{" "}
        {baseCurrency}.
      </p>

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        {/* The total, next to the evidence for it. */}
        <div className="self-start rounded-lg border border-slate-200 p-4 dark:border-slate-800">
          <p className="text-sm text-slate-500 dark:text-slate-400">Last 12 months</p>
          {trailing ? (
            <>
              <p
                data-figure
                className="mt-1 break-words text-2xl font-semibold tabular-nums"
              >
                {formatMoney(trailing.total, baseCurrency)}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {plural(trailing.count, "payment", "payments")}
                {partial ? ". Doesn't include the payment(s) marked below." : ""}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {partial
                ? "No payments in the last 12 months could be added up. See the payment(s) marked below."
                : "No payments in the last 12 months"}
            </p>
          )}
        </div>

        {/* Phone and tablet: a list. */}
        <ul className="divide-y divide-slate-100 dark:divide-slate-800 lg:hidden">
          {payments.map((p, index) => (
            <li key={index} className="flex min-h-12 flex-col justify-center py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  {formatShortDate(p.tradeDate)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span data-figure className="text-sm font-medium tabular-nums">
                    {p.baseAmount === null
                      ? formatMoney(p.amount, p.currency)
                      : formatMoney(p.baseAmount, baseCurrency)}
                  </span>
                  <SourceBadge size="sm" variant="derived" />
                </span>
              </div>
              {p.baseAmount === null ? (
                <p className={`mt-1 text-xs ${WARNING_TEXT}`}>
                  Couldn&apos;t convert to {baseCurrency}: no exchange rate.
                </p>
              ) : null}
            </li>
          ))}
        </ul>

        {/* Laptop: a table. */}
        <div className="hidden lg:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-start">Date</TableHead>
                <TableHead className="text-end">Amount ({baseCurrency})</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p, index) => (
                <TableRow key={index} className="h-12">
                  <TableCell>{formatShortDate(p.tradeDate)}</TableCell>
                  <TableCell className="text-end">
                    <span className="inline-flex flex-col items-end">
                      <span className="inline-flex items-center gap-1.5">
                        <span data-figure className="tabular-nums">
                          {p.baseAmount === null
                            ? formatMoney(p.amount, p.currency)
                            : formatMoney(p.baseAmount, baseCurrency)}
                        </span>
                        <SourceBadge size="sm" variant="derived" />
                      </span>
                      {p.baseAmount === null ? (
                        <span className={`text-xs ${WARNING_TEXT}`}>
                          Couldn&apos;t convert to {baseCurrency}: no exchange rate.
                        </span>
                      ) : null}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
