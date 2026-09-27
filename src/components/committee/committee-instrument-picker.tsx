"use client";

// The /committee instrument-picker card (ui-spec §6.1): instrument Select
// (all instruments — Buy Analysis is explicitly for stocks not yet owned),
// optional position context, auto-attached-thesis notice, and a mode
// switcher. Changing the instrument or mode navigates to a new
// `?instrument=&mode=` URL — the server page re-renders with fresh data for
// whatever is now selected, the same "server owns the data, client only
// navigates" pattern the rest of this app uses.
//
// The mode switcher is built as a Tabs component (rather than three loose
// buttons) so the currently active mode is always visually obvious; its
// three values carry ui-spec §6.1's exact button copy ("Convene Committee" /
// "Run Buy Analysis" / "Run Sell Analysis"). Selecting a mode doesn't
// generate anything by itself — it just reveals that mode's AiPanel below,
// whose OWN button (same label, ui-spec §6.2-§6.4) is the actual "generate"
// trigger — so arriving via a `?mode=` URL and clicking the matching tab
// both land in the identical place.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Info } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConnectKeyNotice } from "@/components/connect-key-notice";
import { Label } from "@/components/ui/label";
import { Select, type SelectOption } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatMoney, formatPercent, formatQuantity } from "@/lib/format";

export type CommitteeMode = "committee" | "buy" | "sell";
export type CommitteeInstrumentOption = { id: string; ticker: string; name: string };
export type CommitteePosition = {
  quantity: number;
  avgCostPerUnit: number | null;
  currency: string;
  /** Current price vs. avg cost, as a percent — null when today's price is unavailable. */
  gainLossPct: number | null;
};

const MODE_LABELS: Record<CommitteeMode, string> = {
  committee: "Convene Committee",
  buy: "Run Buy Analysis",
  sell: "Run Sell Analysis",
};

export function CommitteeInstrumentPicker({
  instruments,
  heldInstrumentIds,
  selectedInstrumentId,
  mode,
  hasAiKey,
  position,
  activeThesisTicker,
}: {
  instruments: CommitteeInstrumentOption[];
  heldInstrumentIds: string[];
  selectedInstrumentId: string | null;
  mode: CommitteeMode;
  hasAiKey: boolean;
  position: CommitteePosition | null;
  activeThesisTicker: string | null;
}) {
  const router = useRouter();
  const heldSet = new Set(heldInstrumentIds);
  const isHeld = selectedInstrumentId ? heldSet.has(selectedInstrumentId) : false;

  function navigate(nextInstrumentId: string, nextMode: CommitteeMode) {
    router.push(`/committee?instrument=${nextInstrumentId}&mode=${nextMode}`);
  }

  const options: SelectOption[] = instruments.map((instrument) => ({
    value: instrument.id,
    label: `${instrument.ticker} — ${instrument.name}`,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Instrument</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {options.length > 0 ? (
          <div>
            <Label htmlFor="committee-instrument" className="sr-only">
              Instrument
            </Label>
            <Select
              id="committee-instrument"
              value={selectedInstrumentId ?? ""}
              onValueChange={(value) => navigate(value, mode)}
              options={options}
              placeholder="Choose a stock…"
            />
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Don&apos;t see the stock you want?{" "}
            <Link href="/stocks" className="underline">
              Track it first from the Stocks page.
            </Link>
          </p>
        )}

        {selectedInstrumentId ? (
          <>
            {position ? (
              <p className="text-sm text-slate-600 dark:text-slate-400">
                You hold {formatQuantity(position.quantity)} shares
                {position.avgCostPerUnit !== null
                  ? ` (avg cost ${formatMoney(position.avgCostPerUnit, position.currency)}`
                  : " (avg cost unavailable"}
                {position.gainLossPct !== null
                  ? `, currently ${formatPercent(position.gainLossPct, { signed: true })})`
                  : ")"}
                .
              </p>
            ) : null}

            {activeThesisTicker ? (
              <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <Info className="size-3.5" aria-hidden="true" />
                Your active thesis for {activeThesisTicker} will be included in this analysis.
              </p>
            ) : null}
          </>
        ) : null}

        {/* The mode tabs are navigation, not generation — they stay usable
            without an API key so already-saved Committee / Buy / Sell results
            can still be opened. The notice only takes over when there is no
            stock selected, since then there is no panel below to carry it. */}
        {!hasAiKey && !selectedInstrumentId ? (
          <ConnectKeyNotice />
        ) : selectedInstrumentId ? (
          <Tabs
            value={mode}
            onValueChange={(value) => navigate(selectedInstrumentId, value as CommitteeMode)}
          >
            <TabsList>
              <TabsTrigger value="committee">{MODE_LABELS.committee}</TabsTrigger>
              <TabsTrigger value="buy">{MODE_LABELS.buy}</TabsTrigger>
              {isHeld ? (
                <TabsTrigger value="sell">{MODE_LABELS.sell}</TabsTrigger>
              ) : (
                <Tooltip>
                  <TooltipTrigger>
                    <span
                      aria-disabled="true"
                      className="-mb-px flex min-h-11 cursor-not-allowed items-center border-b-2 border-transparent px-3 text-sm font-medium text-slate-400 dark:text-slate-600"
                    >
                      {MODE_LABELS.sell}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>You don&apos;t currently hold this position</TooltipContent>
                </Tooltip>
              )}
            </TabsList>
          </Tabs>
        ) : null}
      </CardContent>
    </Card>
  );
}
