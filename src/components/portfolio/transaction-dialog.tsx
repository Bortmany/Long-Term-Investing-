"use client";

// Add/Edit Transaction dialog (UI spec §3.2.1). One dialog handles both Add
// (editing = null) and Edit (editing = the row, pre-filled). The form is
// genuinely dynamic per transaction Type — different fields appear for each
// type, matching the table in the spec exactly. For BUY/SELL the Amount is
// NEVER a text input: it is always computed here (qty × price ± fee) purely
// for display, and the server independently re-derives the persisted amount
// from quantity × price — so the two can never drift or be spoofed from the
// client. This dialog also owns the inline "track a new instrument" flow,
// with an honest "prefill unavailable" state when FMP can't answer (golden
// rule: never invent a name/sector/currency).
import * as React from "react";
import { LoaderCircle } from "lucide-react";
import type { Currency, InstrumentType, Market, TransactionType } from "@prisma/client";

import { createInstrument, prefillInstrumentProfile } from "@/app/actions/instruments";
import { createTransaction, updateTransaction } from "@/app/actions/transactions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, type SelectOption } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/format";
import type { TransactionInput } from "@/lib/transaction-schema";
import { transactionTypeLabel, type InstrumentOptionData, type TransactionRowData } from "./types";

const NEW_INSTRUMENT_VALUE = "__new__";

/** Today's date in the local timezone as an <input type="date"> value. */
function todayLocalIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** A stored trade date (parsed as UTC midnight, since it came from a plain
    "YYYY-MM-DD" string) back to the same <input type="date"> value — using
    UTC accessors so the date shown for editing never shifts by a day
    depending on the server's timezone. */
function toDateInputValue(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}-${day}`;
}

function marketLabel(market: Market): string {
  switch (market) {
    case "US":
      return "US";
    case "MSX":
      return "MSX (Muscat)";
    case "TADAWUL":
      return "Tadawul (Saudi)";
    case "DFM":
      return "DFM (Dubai)";
    case "OTHER":
      return "Other";
  }
}

function instrumentTypeLabel(type: InstrumentType): string {
  switch (type) {
    case "STOCK":
      return "Stock";
    case "ETF":
      return "ETF";
    case "REIT":
      return "REIT";
  }
}

function typeAllowsInstrument(type: TransactionType): boolean {
  return type !== "DEPOSIT" && type !== "WITHDRAWAL";
}

function typeRequiresInstrument(type: TransactionType): boolean {
  return type === "BUY" || type === "SELL" || type === "DIVIDEND";
}

function typeIsTrade(type: TransactionType): type is "BUY" | "SELL" {
  return type === "BUY" || type === "SELL";
}

export function TransactionDialog({
  editing,
  instruments,
  baseCurrency,
  currencies,
  markets,
  instrumentTypes,
  transactionTypes,
  onClose,
}: {
  editing: TransactionRowData | null;
  instruments: InstrumentOptionData[];
  baseCurrency: Currency;
  /** Enum option lists, passed from the server so they can't drift from the schema. */
  currencies: Currency[];
  markets: Market[];
  instrumentTypes: InstrumentType[];
  transactionTypes: TransactionType[];
  onClose: () => void;
}) {
  const [type, setType] = React.useState<TransactionType>(editing?.type ?? "BUY");
  const [localInstruments, setLocalInstruments] = React.useState(instruments);
  const [instrumentId, setInstrumentId] = React.useState(editing?.instrumentId ?? "");
  const [quantity, setQuantity] = React.useState(
    editing?.quantity != null ? String(editing.quantity) : "",
  );
  const [pricePerUnit, setPricePerUnit] = React.useState(
    editing?.pricePerUnit != null ? String(editing.pricePerUnit) : "",
  );
  const [amount, setAmount] = React.useState(
    editing && !typeIsTrade(editing.type) ? String(editing.amount) : "",
  );
  const [fee, setFee] = React.useState(editing ? String(editing.fee) : "0");
  const [currency, setCurrency] = React.useState<Currency>(editing?.currency ?? baseCurrency);
  const [tradeDate, setTradeDate] = React.useState(
    editing ? toDateInputValue(editing.tradeDate) : todayLocalIso(),
  );
  const [note, setNote] = React.useState(editing?.note ?? "");

  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSubmitting, startSubmitting] = React.useTransition();

  // --- Inline "track a new instrument" panel ---
  const [showNewInstrument, setShowNewInstrument] = React.useState(false);
  const [newTicker, setNewTicker] = React.useState("");
  const [newMarket, setNewMarket] = React.useState<Market>(markets[0] ?? "US");
  const [newName, setNewName] = React.useState("");
  const [newCurrency, setNewCurrency] = React.useState<Currency>(
    currencies.find((c) => c === "USD") ?? currencies[0] ?? baseCurrency,
  );
  const [newInstrumentType, setNewInstrumentType] = React.useState<InstrumentType>(
    instrumentTypes[0] ?? "STOCK",
  );
  const [newSector, setNewSector] = React.useState("");
  const [newCountry, setNewCountry] = React.useState("");
  const [prefillMessage, setPrefillMessage] = React.useState<string | null>(null);
  const [prefillError, setPrefillError] = React.useState<string | null>(null);
  const [newInstrumentError, setNewInstrumentError] = React.useState<string | null>(null);
  const [isPrefilling, startPrefilling] = React.useTransition();
  const [isCreatingInstrument, startCreatingInstrument] = React.useTransition();

  const busy = isSubmitting || isCreatingInstrument;

  function handleTypeChange(nextType: TransactionType) {
    setType(nextType);
    setFieldErrors({});
    if (nextType === "DEPOSIT" || nextType === "WITHDRAWAL") {
      setInstrumentId("");
      setCurrency(baseCurrency);
    }
    if (!typeIsTrade(nextType)) {
      setQuantity("");
      setPricePerUnit("");
    }
  }

  function handleInstrumentChange(value: string) {
    if (value === NEW_INSTRUMENT_VALUE) {
      setShowNewInstrument(true);
      return;
    }
    setInstrumentId(value);
    // "Defaults to the chosen instrument's currency, editable" — the Currency
    // select can still be changed afterwards.
    const chosen = localInstruments.find((i) => i.id === value);
    if (chosen) setCurrency(chosen.currency);
  }

  function handlePrefill() {
    setPrefillError(null);
    setPrefillMessage(null);
    startPrefilling(async () => {
      const result = await prefillInstrumentProfile(newTicker, newMarket);
      if (!result.ok) {
        setPrefillError(
          result.message ?? "Prefill unavailable for this ticker — fill the details in by hand.",
        );
        return;
      }
      setNewName(result.data.name);
      if (result.data.sector) setNewSector(result.data.sector);
      if (result.data.country) setNewCountry(result.data.country);
      if (result.data.currency) setNewCurrency(result.data.currency);
      setPrefillMessage("Prefilled from FMP — check the details before saving.");
    });
  }

  function handleCreateInstrument() {
    setNewInstrumentError(null);
    if (!newTicker.trim() || !newName.trim()) {
      setNewInstrumentError("Enter a ticker and a name.");
      return;
    }
    startCreatingInstrument(async () => {
      const result = await createInstrument({
        ticker: newTicker.trim(),
        name: newName.trim(),
        market: newMarket,
        currency: newCurrency,
        type: newInstrumentType,
        sector: newSector.trim() || undefined,
        country: newCountry.trim() || undefined,
      });
      if (!result.ok) {
        setNewInstrumentError(result.error);
        return;
      }
      const created: InstrumentOptionData = {
        id: result.data.id,
        ticker: result.data.ticker,
        name: newName.trim(),
        currency: newCurrency,
        market: newMarket,
      };
      setLocalInstruments((prev) =>
        [...prev, created].sort((a, b) => a.ticker.localeCompare(b.ticker)),
      );
      setInstrumentId(created.id);
      setCurrency(created.currency);
      setShowNewInstrument(false);
      setNewTicker("");
      setNewName("");
      setNewSector("");
      setNewCountry("");
      setPrefillMessage(null);
      setPrefillError(null);
    });
  }

  const computedAmount = React.useMemo(() => {
    if (!typeIsTrade(type)) return null;
    const qty = Number(quantity);
    const price = Number(pricePerUnit);
    if (!quantity.trim() || !pricePerUnit.trim() || Number.isNaN(qty) || Number.isNaN(price)) {
      return null;
    }
    const feeNum = fee.trim() === "" ? 0 : Number(fee) || 0;
    const gross = qty * price;
    return type === "SELL" ? gross - feeNum : gross + feeNum;
  }, [type, quantity, pricePerUnit, fee]);

  function validate(): Record<string, string> {
    const errors: Record<string, string> = {};
    const typeLabel = transactionTypeLabel(type);

    if (!tradeDate) {
      errors.tradeDate = "Enter a trade date.";
    }
    if (typeRequiresInstrument(type) && !instrumentId) {
      errors.instrumentId = `Pick an instrument for ${typeLabel} transactions.`;
    }
    if (typeIsTrade(type)) {
      if (!quantity.trim() || Number(quantity) <= 0) {
        errors.quantity = `Quantity is required for ${typeLabel} transactions.`;
      }
      if (!pricePerUnit.trim() || Number(pricePerUnit) <= 0) {
        errors.pricePerUnit = `Price per unit is required for ${typeLabel} transactions.`;
      }
    } else if (!amount.trim() || Number(amount) <= 0) {
      errors.amount = `Amount is required for ${typeLabel} transactions.`;
    }
    if (fee.trim() !== "" && Number(fee) < 0) {
      errors.fee = "Fee cannot be negative.";
    }
    return errors;
  }

  function buildPayload(): TransactionInput {
    const tradeDateValue = new Date(tradeDate);
    const noteValue = note.trim() ? note.trim() : undefined;
    const feeNum = fee.trim() === "" ? 0 : Number(fee);

    if (typeIsTrade(type)) {
      return {
        type,
        instrumentId,
        quantity: Number(quantity),
        pricePerUnit: Number(pricePerUnit),
        fee: feeNum,
        currency,
        tradeDate: tradeDateValue,
        note: noteValue,
      };
    }
    if (type === "DIVIDEND") {
      return {
        type,
        instrumentId,
        amount: Number(amount),
        fee: feeNum,
        currency,
        tradeDate: tradeDateValue,
        note: noteValue,
      };
    }
    if (type === "DEPOSIT" || type === "WITHDRAWAL") {
      return {
        type,
        amount: Number(amount),
        currency,
        tradeDate: tradeDateValue,
        note: noteValue,
      };
    }
    // FEE
    return {
      type: "FEE",
      instrumentId: instrumentId || undefined,
      amount: Number(amount),
      currency,
      tradeDate: tradeDateValue,
      note: noteValue,
    };
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const errors = validate();
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;

    const payload = buildPayload();
    startSubmitting(async () => {
      const result = editing
        ? await updateTransaction(editing.id, payload)
        : await createTransaction(payload);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      onClose();
    });
  }

  const instrumentOptions: SelectOption[] = [
    ...(type === "FEE" ? [{ value: "", label: "— Account-level (no instrument) —" }] : []),
    ...localInstruments.map((i) => ({ value: i.id, label: `${i.ticker} — ${i.name}` })),
    { value: NEW_INSTRUMENT_VALUE, label: "+ Track a new instrument…" },
  ];

  const currencyOptions: SelectOption[] = currencies.map((c) => ({ value: c, label: c }));
  const marketOptions: SelectOption[] = markets.map((m) => ({ value: m, label: marketLabel(m) }));
  const instrumentTypeOptions: SelectOption[] = instrumentTypes.map((t) => ({
    value: t,
    label: instrumentTypeLabel(t),
  }));
  const typeOptions: SelectOption[] = transactionTypes.map((t) => ({
    value: t,
    label: transactionTypeLabel(t),
  }));

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Transaction" : "Add Transaction"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="tx-type" className="mb-1.5">
              Type
            </Label>
            <Select
              id="tx-type"
              value={type}
              onValueChange={(value) => handleTypeChange(value as TransactionType)}
              options={typeOptions}
            />
          </div>

          {typeAllowsInstrument(type) ? (
            <div>
              <Label htmlFor="tx-instrument" className="mb-1.5">
                Instrument{type === "FEE" ? " (optional)" : ""}
              </Label>
              <Select
                id="tx-instrument"
                value={instrumentId}
                onValueChange={handleInstrumentChange}
                options={instrumentOptions}
                placeholder={type === "FEE" ? undefined : "Choose an instrument"}
              />
              {fieldErrors.instrumentId ? (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {fieldErrors.instrumentId}
                </p>
              ) : null}
              {localInstruments.length === 0 && !showNewInstrument ? (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  No instruments yet — track one below.
                </p>
              ) : null}

              {showNewInstrument ? (
                <div className="mt-3 space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Track a new instrument</h3>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowNewInstrument(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="new-inst-ticker" className="mb-1.5">
                        Ticker
                      </Label>
                      <Input
                        id="new-inst-ticker"
                        value={newTicker}
                        onChange={(event) => setNewTicker(event.target.value.toUpperCase())}
                        placeholder="AAPL"
                      />
                    </div>
                    <div>
                      <Label htmlFor="new-inst-market" className="mb-1.5">
                        Market
                      </Label>
                      <Select
                        id="new-inst-market"
                        value={newMarket}
                        onValueChange={(value) => setNewMarket(value as Market)}
                        options={marketOptions}
                      />
                    </div>
                  </div>
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handlePrefill}
                      disabled={isPrefilling || !newTicker.trim()}
                    >
                      {isPrefilling ? (
                        <>
                          <LoaderCircle className="animate-spin" aria-hidden="true" />
                          Checking…
                        </>
                      ) : (
                        "Prefill from FMP"
                      )}
                    </Button>
                  </div>
                  {/* Golden rule: prefill failure is stated honestly, never a
                      made-up name — the owner just fills the fields by hand. */}
                  {prefillError ? (
                    <p className="text-xs text-amber-700 dark:text-amber-400">{prefillError}</p>
                  ) : null}
                  {prefillMessage ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">{prefillMessage}</p>
                  ) : null}
                  <div>
                    <Label htmlFor="new-inst-name" className="mb-1.5">
                      Name
                    </Label>
                    <Input
                      id="new-inst-name"
                      value={newName}
                      onChange={(event) => setNewName(event.target.value)}
                      placeholder="Apple Inc."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="new-inst-currency" className="mb-1.5">
                        Currency
                      </Label>
                      <Select
                        id="new-inst-currency"
                        value={newCurrency}
                        onValueChange={(value) => setNewCurrency(value as Currency)}
                        options={currencyOptions}
                      />
                    </div>
                    <div>
                      <Label htmlFor="new-inst-type" className="mb-1.5">
                        Type
                      </Label>
                      <Select
                        id="new-inst-type"
                        value={newInstrumentType}
                        onValueChange={(value) => setNewInstrumentType(value as InstrumentType)}
                        options={instrumentTypeOptions}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="new-inst-sector" className="mb-1.5">
                        Sector (optional)
                      </Label>
                      <Input
                        id="new-inst-sector"
                        value={newSector}
                        onChange={(event) => setNewSector(event.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="new-inst-country" className="mb-1.5">
                        Country (optional)
                      </Label>
                      <Input
                        id="new-inst-country"
                        value={newCountry}
                        onChange={(event) => setNewCountry(event.target.value)}
                      />
                    </div>
                  </div>
                  {newInstrumentError ? (
                    <p className="text-xs text-red-600 dark:text-red-400">{newInstrumentError}</p>
                  ) : null}
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleCreateInstrument}
                      disabled={isCreatingInstrument}
                    >
                      {isCreatingInstrument ? (
                        <>
                          <LoaderCircle className="animate-spin" aria-hidden="true" />
                          Adding…
                        </>
                      ) : (
                        "Add Instrument"
                      )}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {typeIsTrade(type) ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="tx-quantity" className="mb-1.5">
                    Quantity
                  </Label>
                  <Input
                    id="tx-quantity"
                    type="number"
                    step="any"
                    min="0"
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                  />
                  {fieldErrors.quantity ? (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                      {fieldErrors.quantity}
                    </p>
                  ) : null}
                </div>
                <div>
                  <Label htmlFor="tx-price" className="mb-1.5">
                    Price per unit
                  </Label>
                  <Input
                    id="tx-price"
                    type="number"
                    step="any"
                    min="0"
                    value={pricePerUnit}
                    onChange={(event) => setPricePerUnit(event.target.value)}
                  />
                  {fieldErrors.pricePerUnit ? (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                      {fieldErrors.pricePerUnit}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="tx-fee" className="mb-1.5">
                    Fee
                  </Label>
                  <Input
                    id="tx-fee"
                    type="number"
                    step="any"
                    min="0"
                    value={fee}
                    onChange={(event) => setFee(event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="tx-currency" className="mb-1.5">
                    Currency
                  </Label>
                  <Select
                    id="tx-currency"
                    value={currency}
                    onValueChange={(value) => setCurrency(value as Currency)}
                    options={currencyOptions}
                  />
                </div>
              </div>
              {/* Amount is NEVER a separate input — always computed here, and
                  independently re-derived server-side, so it can never drift.
                  Shown in the transaction's OWN currency (matching the
                  Currency field right above and the Transactions table,
                  which always shows Amount next to its own Currency column)
                  — never relabeled to the portfolio's base currency without
                  an actual FX conversion, since that would show a wrong
                  number under the wrong currency code (golden rule). */}
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Amount: {computedAmount === null ? "—" : formatMoney(computedAmount, currency)}
              </p>
            </>
          ) : null}

          {type === "DIVIDEND" ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="tx-amount" className="mb-1.5">
                    Amount
                  </Label>
                  <Input
                    id="tx-amount"
                    type="number"
                    step="any"
                    min="0"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                  {fieldErrors.amount ? (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                      {fieldErrors.amount}
                    </p>
                  ) : null}
                </div>
                <div>
                  <Label htmlFor="tx-fee" className="mb-1.5">
                    Fee / withholding
                  </Label>
                  <Input
                    id="tx-fee"
                    type="number"
                    step="any"
                    min="0"
                    value={fee}
                    onChange={(event) => setFee(event.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="tx-currency" className="mb-1.5">
                  Currency
                </Label>
                <Select
                  id="tx-currency"
                  value={currency}
                  onValueChange={(value) => setCurrency(value as Currency)}
                  options={currencyOptions}
                />
              </div>
            </>
          ) : null}

          {type === "DEPOSIT" || type === "WITHDRAWAL" || type === "FEE" ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="tx-amount" className="mb-1.5">
                  Amount
                </Label>
                <Input
                  id="tx-amount"
                  type="number"
                  step="any"
                  min="0"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
                {fieldErrors.amount ? (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {fieldErrors.amount}
                  </p>
                ) : null}
              </div>
              <div>
                <Label htmlFor="tx-currency" className="mb-1.5">
                  Currency
                </Label>
                <Select
                  id="tx-currency"
                  value={currency}
                  onValueChange={(value) => setCurrency(value as Currency)}
                  options={currencyOptions}
                />
              </div>
            </div>
          ) : null}

          <div>
            <Label htmlFor="tx-trade-date" className="mb-1.5">
              Trade Date
            </Label>
            <Input
              id="tx-trade-date"
              type="date"
              value={tradeDate}
              onChange={(event) => setTradeDate(event.target.value)}
            />
            {fieldErrors.tradeDate ? (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {fieldErrors.tradeDate}
              </p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="tx-note" className="mb-1.5">
              Note
            </Label>
            <Textarea
              id="tx-note"
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          {formError ? (
            <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {isSubmitting ? (
                <>
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                  Saving…
                </>
              ) : editing ? (
                "Save Changes"
              ) : (
                "Add Transaction"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
