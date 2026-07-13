"use client";

// Holdings card for /portfolio. Every displayed figure carries its source
// badge (golden rule); rows that can't be valued SAY so in amber instead of
// showing a padded number.
import Link from "next/link";
import { EllipsisVertical, Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import {
  SourceBadge,
  badgePropsForValueSource,
  type SourceBadgeProps,
} from "@/components/source-badge";
import { formatMoney, formatPercent, formatQuantity } from "@/lib/format";
import type { Currency } from "@prisma/client";

import type { HoldingRowData } from "./types";

// Same look as DropdownMenuItem, but a real link (used for the two
// navigation actions in the row kebab).
const menuLinkClasses =
  "block w-full px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-slate-100 focus-visible:bg-slate-100 dark:hover:bg-slate-800 dark:focus-visible:bg-slate-800";

/** The honest amber fallback for a row that couldn't be valued. */
function UnavailableText({
  reason,
}: {
  reason: "missing_price" | "missing_fx_rate";
}) {
  return (
    <span className="text-sm text-amber-700 dark:text-amber-400">
      {reason === "missing_price"
        ? "Unavailable — no price"
        : "Unavailable — no exchange rate"}
    </span>
  );
}

export function HoldingsCard({
  holdings,
  baseCurrency,
  aggregateBadge,
  onUpdatePrice,
}: {
  holdings: HoldingRowData[];
  baseCurrency: Currency;
  aggregateBadge: Pick<SourceBadgeProps, "variant" | "date">;
  onUpdatePrice: (holding: HoldingRowData) => void;
}) {
  return (
    <Card className="gap-4">
      <CardHeader className="flex-row items-center gap-3">
        <CardTitle>Holdings</CardTitle>
        <SourceBadge {...aggregateBadge} />
      </CardHeader>
      <CardContent>
        {holdings.length === 0 ? (
          <EmptyState
            icon={Inbox}
            heading="Holdings"
            sentence="No holdings yet — add a Buy transaction to open a position."
            className="min-h-48"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticker</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Avg Cost</TableHead>
                <TableHead className="text-right">Current Price</TableHead>
                <TableHead className="text-right">
                  Market Value ({baseCurrency})
                </TableHead>
                <TableHead className="text-right">Unrealized Gain/Loss</TableHead>
                <TableHead className="text-right">Weight</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {holdings.map((holding) => (
                <TableRow key={holding.instrumentId}>
                  <TableCell className="font-mono font-medium">
                    <Link
                      href={`/stocks/${holding.instrumentId}`}
                      className="hover:underline"
                    >
                      {holding.ticker}
                    </Link>
                  </TableCell>
                  <TableCell className="text-slate-600 dark:text-slate-400">
                    {holding.name}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatQuantity(holding.quantity)}
                  </TableCell>
                  <TableCell className="text-right">
                    {holding.avgCost !== null ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="tabular-nums">
                          {formatMoney(holding.avgCost, holding.currency)}
                        </span>
                        {/* Pure arithmetic on the user's own transactions. */}
                        <SourceBadge size="sm" variant="derived" />
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {holding.price.ok ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="tabular-nums">
                          {formatMoney(
                            holding.price.value,
                            holding.price.currency,
                          )}
                        </span>
                        <SourceBadge
                          size="sm"
                          {...badgePropsForValueSource(holding.price.source)}
                        />
                      </span>
                    ) : (
                      <UnavailableText reason="missing_price" />
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {holding.valuation.ok ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="font-medium tabular-nums">
                          {formatMoney(
                            holding.valuation.marketValue,
                            baseCurrency,
                          )}
                        </span>
                        <SourceBadge
                          size="sm"
                          {...badgePropsForValueSource(holding.valuation.source)}
                        />
                      </span>
                    ) : (
                      <UnavailableText reason={holding.valuation.reason} />
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <GainLossCell
                      gainLoss={holding.gainLoss}
                      baseCurrency={baseCurrency}
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {holding.weightPct !== null
                      ? formatPercent(holding.weightPct)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-9"
                          aria-label={`Actions for ${holding.ticker}`}
                        >
                          <EllipsisVertical className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {/* Live-priced holdings get no pricing action — the
                            price updates itself. Only manual-provider
                            instruments can be hand-priced. */}
                        {holding.manualPricing ? (
                          <DropdownMenuItem onClick={() => onUpdatePrice(holding)}>
                            Update price
                          </DropdownMenuItem>
                        ) : null}
                        <Link
                          role="menuitem"
                          className={menuLinkClasses}
                          href={`/committee?instrument=${holding.instrumentId}&mode=sell`}
                        >
                          Sell analysis
                        </Link>
                        <DropdownMenuSeparator />
                        <Link
                          role="menuitem"
                          className={menuLinkClasses}
                          href={`/stocks/${holding.instrumentId}`}
                        >
                          View details
                        </Link>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// Signed money + percent on one line, green/red — a genuine return figure
// (§2.6). Exactly zero stays neutral slate.
function GainLossCell({
  gainLoss,
  baseCurrency,
}: {
  gainLoss: HoldingRowData["gainLoss"];
  baseCurrency: Currency;
}) {
  if (!gainLoss.ok) {
    return <UnavailableText reason={gainLoss.reason} />;
  }
  const { amount, pct } = gainLoss;
  const color =
    amount > 0
      ? "text-green-600 dark:text-green-400"
      : amount < 0
        ? "text-red-600 dark:text-red-400"
        : undefined;
  const sign = amount > 0 ? "+" : amount < 0 ? "−" : "";
  return (
    <span className={color}>
      <span className="tabular-nums">
        {sign}
        {formatMoney(Math.abs(amount), baseCurrency)}
      </span>
      {pct !== null ? (
        <span className="ml-1 text-sm font-medium tabular-nums">
          ({formatPercent(pct, { signed: true })})
        </span>
      ) : null}
    </span>
  );
}
