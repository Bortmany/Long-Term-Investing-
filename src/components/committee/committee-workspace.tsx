"use client";

// The /committee interactive shell (ui-spec §6.1): instrument picker, the
// three action buttons, exactly one result panel (Committee / Buy / Sell),
// and the Past Runs history table. AI rule: runAnalysis is NEVER triggered
// by rendering — every server action call here is the direct result of an
// explicit click (or a Dialog submit).
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Currency } from "@prisma/client";
import { Info } from "lucide-react";

import {
  conveneCommittee,
  runBuyAnalysis,
  runSellAnalysis,
  type BuyAnalysisAssumptions,
} from "@/app/actions/committee";
import { BuyAnalysisDialog } from "@/components/committee/buy-analysis-dialog";
import {
  BuyResultBody,
  CommitteeResultBody,
  SellResultBody,
  VerdictChip,
} from "@/components/committee/committee-result";
import { ConnectKeyNotice } from "@/components/connect-key-notice";
import { AiPanel, type AiPanelAnalysis } from "@/components/ai-panel";
import type { SourceBadgeProps } from "@/components/source-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type {
  BuyAnalysisOutput,
  CommitteeOutput,
  SellAnalysisOutput,
} from "@/lib/ai/schemas";
import { formatMoney, formatPercent, formatQuantity, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type CommitteeMode = "committee" | "buy" | "sell";

export type CommitteeInstrumentOption = {
  id: string;
  ticker: string;
  name: string;
  currency: Currency;
};

export type CommitteeHoldingInfo = {
  quantity: number;
  avgCost: number | null;
  currency: Currency;
  valuation:
    | { ok: true; marketValue: number }
    | { ok: false; reason: "missing_price" | "missing_fx_rate" };
  gainLoss:
    | { ok: true; amount: number; pct: number | null }
    | { ok: false; reason: "missing_price" | "missing_fx_rate" };
};

export type CommitteeHistoryRow = {
  id: string;
  createdAt: Date;
  type: "COMMITTEE" | "BUY_ANALYSIS" | "SELL_ANALYSIS";
  model: string;
  verdict?: "BUY" | "HOLD" | "SELL";
  score?: number;
};

const TYPE_LABEL: Record<CommitteeHistoryRow["type"], string> = {
  COMMITTEE: "Committee",
  BUY_ANALYSIS: "Buy Analysis",
  SELL_ANALYSIS: "Sell Analysis",
};

export function CommitteeWorkspace({
  instruments,
  selectedId,
  mode,
  hasKey,
  holding,
  activeThesisId,
  history,
  latestCommittee,
  latestBuy,
  latestSell,
  currentPrice,
}: {
  instruments: CommitteeInstrumentOption[];
  selectedId: string | null;
  mode?: CommitteeMode;
  hasKey: boolean;
  holding: CommitteeHoldingInfo | null;
  activeThesisId: string | null;
  history: CommitteeHistoryRow[];
  latestCommittee: { analysis: AiPanelAnalysis; output: CommitteeOutput } | null;
  latestBuy: { analysis: AiPanelAnalysis; output: BuyAnalysisOutput } | null;
  latestSell: { analysis: AiPanelAnalysis; output: SellAnalysisOutput } | null;
  currentPrice: {
    price: number;
    currency: string;
    badge: Pick<SourceBadgeProps, "variant" | "date">;
  } | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState(false);
  const [activeMode, setActiveMode] = React.useState<CommitteeMode | undefined>(mode);
  const [buyDialogOpen, setBuyDialogOpen] = React.useState(false);

  const selectedInstrument = instruments.find((i) => i.id === selectedId) ?? null;

  function handleInstrumentChange(id: string) {
    router.push(`/committee?instrument=${id}`);
  }

  function handleConvene() {
    if (!selectedId) return;
    setError(false);
    setActiveMode("committee");
    startTransition(async () => {
      const result = await conveneCommittee(selectedId);
      if (!result.ok) {
        setError(true);
        return;
      }
      router.refresh();
    });
  }

  function handleSell() {
    if (!selectedId || !holding) return;
    setError(false);
    setActiveMode("sell");
    startTransition(async () => {
      const result = await runSellAnalysis(selectedId);
      if (!result.ok) {
        setError(true);
        return;
      }
      router.refresh();
    });
  }

  async function handleBuySubmit(assumptions: BuyAnalysisAssumptions): Promise<void> {
    if (!selectedId) return;
    setError(false);
    startTransition(async () => {
      const result = await runBuyAnalysis(selectedId, assumptions);
      if (!result.ok) {
        setError(true);
        return;
      }
      setBuyDialogOpen(false);
      setActiveMode("buy");
      router.refresh();
    });
  }

  const sellButton = (
    <Button
      variant="outline"
      aria-disabled={!holding}
      className={!holding ? "cursor-not-allowed opacity-50" : undefined}
      onClick={holding ? handleSell : undefined}
    >
      Run Sell Analysis
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Instrument picker */}
      <Card>
        <CardHeader>
          <CardTitle>Choose an Instrument</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {instruments.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Don&apos;t see the stock you want?{" "}
              <Link href="/stocks" className="text-slate-900 hover:underline dark:text-slate-50">
                Track it first from the Stocks page.
              </Link>
            </p>
          ) : (
            <Select
              value={selectedId ?? ""}
              onValueChange={handleInstrumentChange}
              placeholder="Select an instrument"
              options={instruments.map((i) => ({
                value: i.id,
                label: `${i.ticker} — ${i.name}`,
              }))}
            />
          )}

          {selectedInstrument ? (
            <>
              {holding ? (
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  You hold {formatQuantity(holding.quantity)} shares
                  {holding.avgCost !== null
                    ? ` (avg cost ${formatMoney(holding.avgCost, holding.currency)}, currently `
                    : " (currently "}
                  <GainLossPhrase gainLoss={holding.gainLoss} />)
                </p>
              ) : null}

              {activeThesisId ? (
                <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <Info className="size-3.5 shrink-0" aria-hidden="true" />
                  Your active thesis for {selectedInstrument.ticker} will be included in this
                  analysis.
                </p>
              ) : null}

              {hasKey ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button onClick={handleConvene}>Convene Committee</Button>
                  <Button variant="outline" onClick={() => setBuyDialogOpen(true)}>
                    Run Buy Analysis
                  </Button>
                  {holding ? (
                    sellButton
                  ) : (
                    <Tooltip>
                      <TooltipTrigger tabIndex={-1}>{sellButton}</TooltipTrigger>
                      <TooltipContent>You don&apos;t currently hold this position</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              ) : (
                <div className="mt-4">
                  <ConnectKeyNotice />
                </div>
              )}
            </>
          ) : null}
        </CardContent>
      </Card>

      {/* Result panel — exactly one, matching activeMode */}
      {selectedInstrument && activeMode === "committee" ? (
        <AiPanel
          title="Investment Committee"
          actionLabel="Convene Committee"
          pendingLabel="Convening…"
          onAction={handleConvene}
          analysis={latestCommittee?.analysis ?? null}
          isPending={isPending}
          hasKey={hasKey}
          error={error}
        >
          {latestCommittee ? <CommitteeResultBody output={latestCommittee.output} /> : null}
        </AiPanel>
      ) : null}

      {selectedInstrument && activeMode === "buy" ? (
        <AiPanel
          title="Buy Analysis"
          actionLabel="Run Buy Analysis"
          pendingLabel="Analyzing…"
          onAction={() => setBuyDialogOpen(true)}
          analysis={latestBuy?.analysis ?? null}
          isPending={isPending}
          hasKey={hasKey}
          error={error}
        >
          {latestBuy ? (
            <BuyResultBody
              output={latestBuy.output}
              currentPrice={currentPrice}
              instrumentCurrency={selectedInstrument.currency}
            />
          ) : null}
        </AiPanel>
      ) : null}

      {selectedInstrument && activeMode === "sell" ? (
        <AiPanel
          title="Sell Analysis"
          actionLabel="Run Sell Analysis"
          pendingLabel="Analyzing…"
          onAction={handleSell}
          analysis={latestSell?.analysis ?? null}
          isPending={isPending}
          hasKey={hasKey}
          error={error}
        >
          {latestSell ? <SellResultBody output={latestSell.output} /> : null}
        </AiPanel>
      ) : null}

      {/* Past Runs — only once an instrument is selected. */}
      {selectedInstrument ? (
        <Card className="gap-4">
          <CardHeader>
            <CardTitle>Past Runs</CardTitle>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No runs yet for {selectedInstrument.ticker}.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Verdict/Score</TableHead>
                    <TableHead>Model</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((row) => (
                    <TableRow
                      key={row.id}
                      onClick={() => router.push(`/committee/history/${row.id}`)}
                      className="cursor-pointer"
                    >
                      <TableCell className="text-slate-600 dark:text-slate-400">
                        {formatShortDate(row.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{TYPE_LABEL[row.type]}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {row.verdict ? (
                          <VerdictChip verdict={row.verdict} />
                        ) : (
                          <span className="tabular-nums">{row.score}/100</span>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-400">
                        {row.model}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}

      <BuyAnalysisDialog
        open={buyDialogOpen}
        onOpenChange={setBuyDialogOpen}
        onSubmit={handleBuySubmit}
        isPending={isPending}
      />
    </div>
  );
}

/** The "currently {gain/loss}" fragment — honest unavailable phrase, never a
    fabricated number, when the position couldn't be valued. */
function GainLossPhrase({ gainLoss }: { gainLoss: CommitteeHoldingInfo["gainLoss"] }) {
  if (!gainLoss.ok) {
    return (
      <span className="text-amber-700 dark:text-amber-400">
        {gainLoss.reason === "missing_price"
          ? "unavailable — no price"
          : "unavailable — no exchange rate"}
      </span>
    );
  }
  const color =
    gainLoss.amount > 0
      ? "text-green-600 dark:text-green-400"
      : gainLoss.amount < 0
        ? "text-red-600 dark:text-red-400"
        : undefined;
  if (gainLoss.pct === null) {
    // Zero cost basis — a percent change genuinely can't be computed; never
    // fabricate one.
    return <span className="text-slate-500 dark:text-slate-400">not available</span>;
  }
  return (
    <span className={cn("tabular-nums", color)}>
      {formatPercent(gainLoss.pct, { signed: true })}
    </span>
  );
}
