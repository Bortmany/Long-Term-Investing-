"use client";

// The /portfolio client view. The server page loads and values everything;
// this component owns the interactive parts: the Add/Edit Transaction
// dialog, the Update Price dialog, the delete confirmation, and the two
// tables. When the portfolio has no transactions at all, the whole page is
// one empty state whose call-to-action opens the Add Transaction dialog.
import * as React from "react";
import Link from "next/link";
import { Briefcase } from "lucide-react";
import type { Currency, InstrumentType, Market, TransactionType } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import type { SourceBadgeProps } from "@/components/source-badge";
import { HoldingsTable } from "./holdings-table";
import { TransactionsTable } from "./transactions-table";
import { TransactionDialog } from "./transaction-dialog";
import { UpdatePriceDialog } from "./update-price-dialog";
import { DeleteTransactionDialog } from "./delete-transaction-dialog";
import type {
  HoldingRowData,
  InstrumentOptionData,
  TransactionRowData,
} from "./types";

export function PortfolioView({
  baseCurrency,
  holdings,
  holdingsBadge,
  weightsNote,
  transactions,
  instruments,
  currencies,
  markets,
  instrumentTypes,
  transactionTypes,
}: {
  baseCurrency: Currency;
  holdings: HoldingRowData[];
  holdingsBadge: Pick<SourceBadgeProps, "variant" | "date">;
  /** Honest caption for the Weight column when it can exceed 100% (negative cash). */
  weightsNote?: string;
  transactions: TransactionRowData[];
  instruments: InstrumentOptionData[];
  /** Enum option lists, passed from the server so they can't drift from the schema. */
  currencies: Currency[];
  markets: Market[];
  instrumentTypes: InstrumentType[];
  transactionTypes: TransactionType[];
}) {
  // Which dialogs are open. The transaction dialog is one component for both
  // Add (editing = null) and Edit (editing = the row).
  const [txDialog, setTxDialog] = React.useState<{
    open: boolean;
    editing: TransactionRowData | null;
  }>({ open: false, editing: null });
  const [priceTarget, setPriceTarget] = React.useState<HoldingRowData | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<TransactionRowData | null>(null);

  const openAdd = () => setTxDialog({ open: true, editing: null });

  const dialogs = (
    <>
      {txDialog.open ? (
        <TransactionDialog
          key={txDialog.editing?.id ?? "new"}
          editing={txDialog.editing}
          instruments={instruments}
          baseCurrency={baseCurrency}
          currencies={currencies}
          markets={markets}
          instrumentTypes={instrumentTypes}
          transactionTypes={transactionTypes}
          onClose={() => setTxDialog({ open: false, editing: null })}
        />
      ) : null}
      {priceTarget ? (
        <UpdatePriceDialog
          holding={priceTarget}
          // The manual price is stored in the instrument's own currency.
          instrumentCurrency={
            instruments.find((i) => i.id === priceTarget.instrumentId)?.currency ??
            priceTarget.currency
          }
          onClose={() => setPriceTarget(null)}
        />
      ) : null}
      {deleteTarget ? (
        <DeleteTransactionDialog
          transaction={deleteTarget}
          onClose={() => setDeleteTarget(null)}
        />
      ) : null}
    </>
  );

  // Zero transactions: the entire page is one empty state (UI spec §3.2).
  if (transactions.length === 0) {
    return (
      <>
        <EmptyState
          icon={Briefcase}
          heading="Portfolio"
          sentence="Add your first transaction to start tracking your portfolio."
          action={
            <Button type="button" onClick={openAdd}>
              Add Transaction
            </Button>
          }
        />
        {dialogs}
      </>
    );
  }

  return (
    <>
      {/* Page header: title left, actions right (stacks on mobile). */}
      <div className="mb-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Portfolio</h1>
        <div className="flex gap-3">
          <Button variant="outline" asChild>
            <Link href="/portfolio/import">Import CSV</Link>
          </Button>
          <Button type="button" onClick={openAdd}>
            Add Transaction
          </Button>
        </div>
      </div>

      <HoldingsTable
        rows={holdings}
        baseCurrency={baseCurrency}
        badge={holdingsBadge}
        weightsNote={weightsNote}
        onUpdatePrice={setPriceTarget}
      />

      <TransactionsTable
        rows={transactions}
        transactionTypes={transactionTypes}
        onAdd={openAdd}
        onEdit={(row) => setTxDialog({ open: true, editing: row })}
        onDelete={setDeleteTarget}
      />

      {dialogs}
    </>
  );
}
