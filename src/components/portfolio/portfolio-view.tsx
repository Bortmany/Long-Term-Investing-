"use client";

// Client root for /portfolio. Owns which dialog is open (Add/Edit
// Transaction, Delete confirm, Update Price) so the page header, the empty
// state, and both cards can all share the same dialog instances. All data
// arrives pre-computed and serialized from the server page — no fetching or
// valuation happens here.
import * as React from "react";
import Link from "next/link";
import { Briefcase } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import type { SourceBadgeProps } from "@/components/source-badge";
import type { Currency } from "@prisma/client";

import { HoldingsCard } from "./holdings-card";
import { TransactionsCard } from "./transactions-card";
import { TransactionDialog } from "./transaction-dialog";
import { DeleteTransactionDialog } from "./delete-transaction-dialog";
import { UpdatePriceDialog, type UpdatePriceTarget } from "./update-price-dialog";
import type {
  HoldingRowData,
  InstrumentOptionData,
  TransactionRowData,
} from "./types";

export function PortfolioView({
  baseCurrency,
  holdings,
  transactions,
  instruments,
  aggregateBadge,
}: {
  baseCurrency: Currency;
  holdings: HoldingRowData[];
  transactions: TransactionRowData[];
  instruments: InstrumentOptionData[];
  aggregateBadge: Pick<SourceBadgeProps, "variant" | "date">;
}) {
  const [txDialogOpen, setTxDialogOpen] = React.useState(false);
  const [editingTransaction, setEditingTransaction] =
    React.useState<TransactionRowData | null>(null);
  const [deleteTarget, setDeleteTarget] =
    React.useState<TransactionRowData | null>(null);
  const [priceTarget, setPriceTarget] =
    React.useState<UpdatePriceTarget | null>(null);

  function openAddTransaction() {
    setEditingTransaction(null);
    setTxDialogOpen(true);
  }

  function openEditTransaction(row: TransactionRowData) {
    setEditingTransaction(row);
    setTxDialogOpen(true);
  }

  function openUpdatePrice(holding: HoldingRowData) {
    // The manual price is stored in the INSTRUMENT's currency, so look that
    // up rather than assuming the trade currency matches.
    const instrument = instruments.find((i) => i.id === holding.instrumentId);
    setPriceTarget({
      instrumentId: holding.instrumentId,
      ticker: holding.ticker,
      currency: instrument?.currency ?? holding.currency,
    });
  }

  const dialogs = (
    <>
      <TransactionDialog
        open={txDialogOpen}
        onOpenChange={setTxDialogOpen}
        editing={editingTransaction}
        instruments={instruments}
        baseCurrency={baseCurrency}
      />
      <DeleteTransactionDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
      <UpdatePriceDialog
        target={priceTarget}
        onClose={() => setPriceTarget(null)}
      />
    </>
  );

  // Zero transactions at all: the entire page is one empty state whose
  // action opens the Add Transaction dialog directly.
  if (transactions.length === 0) {
    return (
      <>
        <EmptyState
          icon={Briefcase}
          heading="Portfolio"
          sentence="Add your first transaction to start tracking your portfolio."
          action={<Button onClick={openAddTransaction}>Add Transaction</Button>}
        />
        {dialogs}
      </>
    );
  }

  return (
    <>
      <div className="mb-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Portfolio</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/portfolio/import">Import CSV</Link>
          </Button>
          <Button onClick={openAddTransaction}>Add Transaction</Button>
        </div>
      </div>

      <HoldingsCard
        holdings={holdings}
        baseCurrency={baseCurrency}
        aggregateBadge={aggregateBadge}
        onUpdatePrice={openUpdatePrice}
      />

      <TransactionsCard
        transactions={transactions}
        onAdd={openAddTransaction}
        onEdit={openEditTransaction}
        onDelete={setDeleteTarget}
      />

      {dialogs}
    </>
  );
}
