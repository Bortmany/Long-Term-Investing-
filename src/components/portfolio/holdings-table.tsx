"use client";

// Holdings card (UI spec §3.2): every figure carries its source badge, rows
// that can't be valued say so in plain amber text (golden rule — never a
// fake number), and the kebab menu offers Update price (manual-priced
// instruments only), Sell analysis and View details.
import Link from "next/link";
import { EllipsisVertical, Inbox } from "lucide-react";
import type { Currency } from "@prisma/client";

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
import { ExplainerTip } from "@/components/explainer-tip";
import {
  SourceBadge,
  badgePropsForValueSource,
  type SourceBadgeProps,
} from "@/components/source-badge";
import { formatMoney, formatPercent, formatQuantity } from "@/lib/format";
import type { HoldingRowData } from "./types";

/** "+OMR 12.500" / "−OMR 3.000" — sign out front so it never hides in the currency prefix. */
function signedMoney(amount: number, currency: string): string {
  const sign = amount > 0 ? "+" : amount < 0 ? "−" : "";
  return `${sign}${formatMoney(Math.abs(amount), currency)}`;
}

/** Green for gains, red for losses — reserved for genuine return figures (§2.6). */
function gainLossColor(amount: number): string {
  if (amount > 0) return "text-green-600 dark:text-green-400";
  if (amount < 0) return "text-red-600 dark:text-red-400";
  return "";
}

const UNAVAILABLE_TEXT = {
  missing_price: "Unavailable — no price",
  missing_fx_rate: "Unavailable — no exchange rate",
} as const;

// Same look as DropdownMenuItem, but a real link (so open-in-new-tab works).
const MENU_LINK_CLASS =
  "block w-full px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-slate-100 focus-visible:bg-slate-100 dark:hover:bg-slate-800 dark:focus-visible:bg-slate-800";

export function HoldingsTable({
  rows,
  baseCurrency,
  badge,
  weightsNote,
  onUpdatePrice,
}: {
  rows: HoldingRowData[];
  baseCurrency: Currency;
  badge: Pick<SourceBadgeProps, "variant" | "date">;
  /** Shown under the table when Weight can add up to more than 100% (negative cash). */
  weightsNote?: string;
  onUpdatePrice: (row: HoldingRowData) => void;
}) {
  return (
    <Card className="gap-4">
      <CardHeader className="flex-row items-center gap-3">
        <CardTitle>Holdings</CardTitle>
        {/* Aggregate badge over the same valuation sources the totals use. */}
        <SourceBadge {...badge} />
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            icon={Inbox}
            heading="Holdings"
            sentence="No holdings yet."
            className="min-h-48"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticker</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">
                  <span className="inline-flex items-center justify-end gap-1">
                    Avg Cost <ExplainerTip term="avg-cost" />
                  </span>
                </TableHead>
                <TableHead className="text-right">Current Price</TableHead>
                <TableHead className="text-right">
                  <span className="inline-flex items-center justify-end gap-1">
                    Market Value ({baseCurrency}) <ExplainerTip term="market-value" />
                  </span>
                </TableHead>
                <TableHead className="text-right">
                  <span className="inline-flex items-center justify-end gap-1">
                    Unrealized Gain/Loss <ExplainerTip term="unrealized-gain" />
                  </span>
                </TableHead>
                <TableHead className="text-right">
                  <span className="inline-flex items-center justify-end gap-1">
                    Weight <ExplainerTip term="weight" />
                  </span>
                </TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.instrumentId}>
                  <TableCell className="font-mono font-medium">
                    <Link href={`/stocks/${row.instrumentId}`} className="hover:underline">
                      {row.ticker}
                    </Link>
                  </TableCell>
                  <TableCell className="text-slate-600 dark:text-slate-400">
                    {row.name}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatQuantity(row.quantity)}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.avgCost === null ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="tabular-nums">
                          {formatMoney(row.avgCost, row.currency)}
                        </span>
                        {/* Arithmetic on the user's own BUY transactions. */}
                        <SourceBadge size="sm" variant="derived" />
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.price.ok ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="tabular-nums">
                          {formatMoney(row.price.value, row.price.currency)}
                        </span>
                        <SourceBadge
                          size="sm"
                          {...badgePropsForValueSource(row.price.source)}
                        />
                      </span>
                    ) : (
                      <span className="text-sm text-amber-700 dark:text-amber-400">
                        {UNAVAILABLE_TEXT.missing_price}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.valuation.ok ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="font-medium tabular-nums">
                          {formatMoney(row.valuation.marketValue, baseCurrency)}
                        </span>
                        <SourceBadge
                          size="sm"
                          {...badgePropsForValueSource(row.valuation.source)}
                        />
                      </span>
                    ) : (
                      <span className="text-sm text-amber-700 dark:text-amber-400">
                        {UNAVAILABLE_TEXT[row.valuation.reason]}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.gainLoss.ok ? (
                      <span className={`tabular-nums ${gainLossColor(row.gainLoss.amount)}`}>
                        {signedMoney(row.gainLoss.amount, baseCurrency)}
                        {row.gainLoss.pct !== null ? (
                          <span className="ml-1 text-sm font-medium">
                            ({formatPercent(row.gainLoss.pct, { signed: true })})
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <span className="text-sm text-amber-700 dark:text-amber-400">
                        {UNAVAILABLE_TEXT[row.gainLoss.reason]}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.weightPct === null ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      formatPercent(row.weightPct)
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-9"
                          aria-label={`Actions for ${row.ticker}`}
                        >
                          <EllipsisVertical aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {row.manualPricing ? (
                          // Only manually-priced instruments get this action;
                          // live-priced holdings update themselves.
                          <DropdownMenuItem onClick={() => onUpdatePrice(row)}>
                            Update price
                          </DropdownMenuItem>
                        ) : null}
                        <Link
                          role="menuitem"
                          href={`/committee?instrument=${row.instrumentId}&mode=sell`}
                          className={MENU_LINK_CLASS}
                        >
                          Sell analysis
                        </Link>
                        <DropdownMenuSeparator />
                        <Link
                          role="menuitem"
                          href={`/stocks/${row.instrumentId}`}
                          className={MENU_LINK_CLASS}
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
        {/* Honest note: weights are a share of TOTAL value, so when cash is
            negative the holdings alone can add up to more than 100%. Say why
            rather than let the numbers look wrong (golden rule). */}
        {weightsNote && rows.length > 0 ? (
          <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">
            {weightsNote}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
