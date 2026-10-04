"use client";

// Holdings card (UI spec §3.2): every figure carries its source badge, rows
// that can't be valued say so in plain amber text (golden rule — never a
// fake number), and the kebab menu offers Update price (manual-priced
// instruments only), Downside check and View details.
import Link from "next/link";
import { ChevronRight, EllipsisVertical, Inbox } from "lucide-react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ResponsiveRows } from "@/components/ui/responsive-rows";
import { RowCard, ROW_CARD_LINK } from "@/components/ui/row-card";
import {
  CARD_LINK_TAP_AREA,
  TABLE_ROW_LINK,
  TABLE_ROW_LINKED,
  TABLE_ROW_RAISED,
} from "@/components/ui/row-link";
import { EmptyState } from "@/components/empty-state";
import { ExplainerTip } from "@/components/explainer-tip";
import {
  SourceBadge,
  badgePropsForValueSource,
  type SourceBadgeProps,
} from "@/components/source-badge";
import {
  formatMoney,
  formatPercent,
  formatQuantity,
  formatQuantityCompact,
} from "@/lib/format";
import { ShariaBadge } from "@/components/sharia/sharia-badge";
import { FxViaHubHint } from "./fx-via-hub-hint";
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

/**
 * One holding as a phone/tablet card (shown below 1280px). Same figures, same
 * source badges and the same honest amber words as the table row; nothing is
 * dropped and nothing is cut off (only the company name may be shortened).
 */
function HoldingCard({
  row,
  baseCurrency,
  onUpdatePrice,
}: {
  row: HoldingRowData;
  baseCurrency: Currency;
  onUpdatePrice: (row: HoldingRowData) => void;
}) {
  return (
    <RowCard
      chevron
      identity={
        <Link
          href={`/stocks/${row.instrumentId}`}
          className={`${ROW_CARD_LINK} ${CARD_LINK_TAP_AREA}`}
        >
          {row.ticker}
        </Link>
      }
      name={row.name}
      badges={
        row.sharia ? (
          <span className={TABLE_ROW_RAISED}>
            <ShariaBadge data={row.sharia} />
          </span>
        ) : undefined
      }
      headline={
        <>
          {row.valuation.ok ? (
            <div>
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <span
                  data-figure
                  className="text-base font-semibold tabular-nums"
                >
                  {formatMoney(row.valuation.marketValue, baseCurrency)}
                </span>
                <span className={TABLE_ROW_RAISED}>
                  <SourceBadge
                    size="sm"
                    {...badgePropsForValueSource(row.valuation.source)}
                    detail={row.valuation.detail}
                  />
                </span>
              </span>
              <FxViaHubHint note={row.valuation.fxNote} />
            </div>
          ) : (
            <span className="text-sm text-amber-700 dark:text-amber-400">
              {UNAVAILABLE_TEXT[row.valuation.reason]}
            </span>
          )}
          {row.gainLoss.ok ? (
            <span
              data-figure
              className={`text-right text-sm tabular-nums ${gainLossColor(row.gainLoss.amount)}`}
            >
              {signedMoney(row.gainLoss.amount, baseCurrency)}
              {row.gainLoss.pct !== null ? (
                <span className="block font-medium">
                  ({formatPercent(row.gainLoss.pct, { signed: true })})
                </span>
              ) : null}
            </span>
          ) : (
            <span className="text-sm text-amber-700 dark:text-amber-400">
              {UNAVAILABLE_TEXT[row.gainLoss.reason]}
            </span>
          )}
        </>
      }
      details={[
        {
          label: "Quantity",
          // Short form only for huge numbers; the exact value is in the hover/label text.
          value: (
            <span
              data-figure
              className="tabular-nums"
              title={`${formatQuantity(row.quantity)} shares`}
              aria-label={`${formatQuantity(row.quantity)} shares`}
            >
              {formatQuantityCompact(row.quantity)}
            </span>
          ),
          title: `${formatQuantity(row.quantity)} shares`,
        },
        {
          label: "Weight",
          value:
            row.weightPct === null ? (
              <span className="text-slate-400">—</span>
            ) : (
              <span data-figure className="tabular-nums">
                {formatPercent(row.weightPct)}
              </span>
            ),
        },
        {
          label: "Avg Cost",
          value:
            row.avgCost === null ? (
              <span className="text-slate-400">—</span>
            ) : (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <span data-figure className="tabular-nums">
                  {formatMoney(row.avgCost, row.currency)}
                </span>
                <span className={TABLE_ROW_RAISED}>
                  <SourceBadge size="sm" variant="derived" />
                </span>
              </span>
            ),
        },
        {
          label: "Current Price",
          value: row.price.ok ? (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <span data-figure className="tabular-nums">
                {formatMoney(row.price.value, row.price.currency)}
              </span>
              <span className={TABLE_ROW_RAISED}>
                <SourceBadge
                  size="sm"
                  {...badgePropsForValueSource(row.price.source)}
                  detail={row.price.detail}
                />
              </span>
            </span>
          ) : (
            <span className="text-amber-700 dark:text-amber-400">
              {UNAVAILABLE_TEXT.missing_price}
            </span>
          ),
        },
      ]}
      action={
        <HoldingActions
          row={row}
          onUpdatePrice={onUpdatePrice}
          buttonClassName="size-11"
        />
      }
    />
  );
}

/** The three-dot actions menu, shared by the table row and the phone card. */
function HoldingActions({
  row,
  onUpdatePrice,
  buttonClassName = "size-9",
}: {
  row: HoldingRowData;
  onUpdatePrice: (row: HoldingRowData) => void;
  buttonClassName?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Tooltip>
          <TooltipTrigger>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={buttonClassName}
              aria-label={`Actions for ${row.ticker}`}
            >
              <EllipsisVertical aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">{`Actions for ${row.ticker}`}</TooltipContent>
        </Tooltip>
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
          Downside check
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
  );
}

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
          <ResponsiveRows
            breakpoint="xl"
            listLabel="Holdings"
            cards={rows.map((row) => (
              <HoldingCard
                key={row.instrumentId}
                row={row}
                baseCurrency={baseCurrency}
                onUpdatePrice={onUpdatePrice}
              />
            ))}
            table={
              <Table className="[&_td]:px-1 [&_th]:whitespace-normal [&_th]:px-1">
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
                        Market Value ({baseCurrency}){" "}
                        <ExplainerTip term="market-value" />
                      </span>
                    </TableHead>
                    <TableHead className="text-right">
                      <span className="inline-flex items-center justify-end gap-1">
                        Unrealized Gain/Loss{" "}
                        <ExplainerTip term="unrealized-gain" />
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
                    <TableHead className="w-10">
                      <span className="sr-only">Open</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow
                      key={row.instrumentId}
                      className={TABLE_ROW_LINKED}
                    >
                      <TableCell>
                        <Link
                          href={`/stocks/${row.instrumentId}`}
                          className={TABLE_ROW_LINK}
                        >
                          {row.ticker}
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-normal break-words text-slate-600 dark:text-slate-400">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span>{row.name}</span>
                          {row.sharia ? (
                            <span className={TABLE_ROW_RAISED}>
                              <ShariaBadge data={row.sharia} />
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span data-figure>{formatQuantity(row.quantity)}</span>
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
                            <span className={TABLE_ROW_RAISED}>
                              <SourceBadge size="sm" variant="derived" />
                            </span>
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.price.ok ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="tabular-nums">
                              {formatMoney(row.price.value, row.price.currency)}
                            </span>
                            <span className={TABLE_ROW_RAISED}>
                              <SourceBadge
                                size="sm"
                                {...badgePropsForValueSource(row.price.source)}
                                detail={row.price.detail}
                              />
                            </span>
                          </span>
                        ) : (
                          <span className="whitespace-normal text-sm text-amber-700 dark:text-amber-400">
                            {UNAVAILABLE_TEXT.missing_price}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.valuation.ok ? (
                          <>
                            <span className="inline-flex items-center gap-1.5">
                              <span className="font-medium tabular-nums">
                                {formatMoney(
                                  row.valuation.marketValue,
                                  baseCurrency,
                                )}
                              </span>
                              {/* Same wording as the price column: an end-of-day
                              price is never called Live. */}
                              <span className={TABLE_ROW_RAISED}>
                                <SourceBadge
                                  size="sm"
                                  {...badgePropsForValueSource(
                                    row.valuation.source,
                                  )}
                                  detail={row.valuation.detail}
                                />
                              </span>
                            </span>
                            <FxViaHubHint note={row.valuation.fxNote} />
                          </>
                        ) : (
                          <span className="whitespace-normal text-sm text-amber-700 dark:text-amber-400">
                            {UNAVAILABLE_TEXT[row.valuation.reason]}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.gainLoss.ok ? (
                          <span
                            className={`whitespace-normal tabular-nums ${gainLossColor(row.gainLoss.amount)}`}
                          >
                            <span className="whitespace-nowrap">
                              {signedMoney(row.gainLoss.amount, baseCurrency)}
                            </span>
                            {row.gainLoss.pct !== null ? (
                              <span className="ml-1 inline-block whitespace-nowrap text-sm font-medium">
                                (
                                {formatPercent(row.gainLoss.pct, {
                                  signed: true,
                                })}
                                )
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="whitespace-normal text-sm text-amber-700 dark:text-amber-400">
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
                        {/* Raised above the row's link layer: opening the menu never opens the stock. */}
                        <div className={TABLE_ROW_RAISED}>
                          <HoldingActions
                            row={row}
                            onUpdatePrice={onUpdatePrice}
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <ChevronRight
                          aria-hidden="true"
                          className="size-4 text-slate-400"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            }
          />
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
