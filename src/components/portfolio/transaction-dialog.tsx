"use client";

// Add / Edit Transaction dialog (§3.2.1). One dialog for both modes; the
// fields are genuinely dynamic per transaction type. GOLDEN RULE detail: for
// BUY/SELL the client NEVER sends an amount — a read-only computed line shows
// qty × price ± fee, and the server derives the stored amount itself.
//
// Validation is the shared zod schema in src/lib/transaction-schema.ts (the
// single source of truth), run client-side for inline per-field errors and
// again server-side by the action.
import * as React from "react";
import { useRouter } from "next/navigation";
import { Currency, InstrumentType, Market, TransactionType } from "@prisma/client";
import { LoaderCircle } from "lucide-react";

import { createTransaction, updateTransaction } from "@/app/actions/transactions";
import {
  createInstrument,
  prefillInstrumentProfile,
} from "@/app/actions/instruments";
import { transactionInputSchema } from "@/lib/transaction-schema";
import { formatMoney } from "@/lib/format";
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
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import type { InstrumentOptionData, TransactionRowData } from "./types";
import { transactionTypeLabel } from "./types";

/** Sentinel for FEE's "no instrument" choice (native selects need a value). */
const NO_INSTRUMENT = "none";

const CURRENCY_OPTIONS = Object.values(Currency).map((c) => ({
  value: c,
  label: c,
}));

/** Today's date in the local timezone, shaped for <input type="date">. */
function todayInputValue(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Stored trade dates are UTC midnight, so the UTC calendar date is right. */
function storedDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** UI convenience only: a sensible default currency per market, always editable. */
function defaultCurrencyForMarket(market: Market): Currency {
  switch (market) {
    case "US":
      return "USD";
    case "MSX":
      return "OMR";
    case "TADAWUL":
      return "SAR";
    case "DFM":
      return "AED";
    case "OTHER":
      return "OMR";
  }
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-600 dark:text-red-400">{message}</p>;
}

export function TransactionDialog({
  open,
  onOpenChange,
  editing,
  instruments,
  baseCurrency,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog is in Edit mode, pre-filled from this row. */
  editing: TransactionRowData | null;
  instruments: InstrumentOptionData[];
  baseCurrency: Currency;
}) {
  const router = useRouter();
  const isEdit = editing !== null;

  // Form state — everything is a string until the zod schema coerces it.
  const [type, setType] = React.useState<TransactionType>("BUY");
  const [instrumentId, setInstrumentId] = React.useState("");
  const [quantity, setQuantity] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [fee, setFee] = React.useState("");
  const [currency, setCurrency] = React.useState<Currency>(baseCurrency);
  const [tradeDate, setTradeDate] = React.useState(todayInputValue);
  const [note, setNote] = React.useState("");

  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  // Instruments created inline during this dialog session, merged into the
  // picker immediately (the server props catch up on the next refresh).
  const [extraInstruments, setExtraInstruments] = React.useState<
    InstrumentOptionData[]
  >([]);
  const [showNewInstrument, setShowNewInstrument] = React.useState(false);

  // Reset the form whenever the dialog (re)opens.
  React.useEffect(() => {
    if (!open) return;
    if (editing) {
      setType(editing.type);
      setInstrumentId(
        editing.instrumentId ?? (editing.type === "FEE" ? NO_INSTRUMENT : ""),
      );
      setQuantity(editing.quantity !== null ? String(editing.quantity) : "");
      setPrice(editing.pricePerUnit !== null ? String(editing.pricePerUnit) : "");
      setAmount(
        editing.type === "BUY" || editing.type === "SELL"
          ? ""
          : String(editing.amount),
      );
      setFee(editing.fee > 0 ? String(editing.fee) : "");
      setCurrency(editing.currency);
      setTradeDate(storedDateInputValue(editing.tradeDate));
      setNote(editing.note ?? "");
    } else {
      setType("BUY");
      setInstrumentId("");
      setQuantity("");
      setPrice("");
      setAmount("");
      setFee("");
      setCurrency(baseCurrency);
      setTradeDate(todayInputValue());
      setNote("");
    }
    setFieldErrors({});
    setServerError(null);
    setShowNewInstrument(false);
  }, [open, editing, baseCurrency]);

  const allInstruments = React.useMemo(() => {
    const byId = new Map(instruments.map((i) => [i.id, i]));
    for (const extra of extraInstruments) {
      if (!byId.has(extra.id)) byId.set(extra.id, extra);
    }
    return [...byId.values()].sort((a, b) => a.ticker.localeCompare(b.ticker));
  }, [instruments, extraInstruments]);

  const hasInstrumentField =
    type === "BUY" || type === "SELL" || type === "DIVIDEND" || type === "FEE";
  const instrumentRequired = type === "BUY" || type === "SELL" || type === "DIVIDEND";
  const isTrade = type === "BUY" || type === "SELL";
  const noInstrumentsYet = allInstruments.length === 0;

  function changeType(next: string) {
    const nextType = next as TransactionType;
    setType(nextType);
    setFieldErrors({});
    // FEE defaults to account-level; cash types drop the instrument.
    if (nextType === "FEE") {
      setInstrumentId((current) => (current === "" ? NO_INSTRUMENT : current));
    } else if (nextType === "DEPOSIT" || nextType === "WITHDRAWAL") {
      setCurrency(baseCurrency);
    }
  }

  function changeInstrument(id: string) {
    setInstrumentId(id);
    const instrument = allInstruments.find((i) => i.id === id);
    // Currency defaults to the chosen instrument's currency, still editable.
    if (instrument) setCurrency(instrument.currency);
  }

  // Read-only computed amount for BUY/SELL — never an editable field, so it
  // can never drift from quantity × price.
  const quantityNumber = Number(quantity);
  const priceNumber = Number(price);
  const feeNumber = fee === "" ? 0 : Number(fee);
  const amountComputable =
    quantity !== "" &&
    price !== "" &&
    Number.isFinite(quantityNumber) &&
    Number.isFinite(priceNumber) &&
    quantityNumber > 0 &&
    priceNumber > 0 &&
    Number.isFinite(feeNumber);
  const computedAmount =
    type === "BUY"
      ? quantityNumber * priceNumber + feeNumber
      : quantityNumber * priceNumber - feeNumber;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setServerError(null);

    // Build the raw input for the shared schema. BUY/SELL deliberately carry
    // NO amount — the server derives it.
    const raw: Record<string, unknown> = {
      type,
      tradeDate,
      currency,
      note: note.trim() === "" ? undefined : note,
    };
    if (isTrade) {
      raw.instrumentId = instrumentId;
      raw.quantity = quantity;
      raw.pricePerUnit = price;
      raw.fee = fee === "" ? undefined : fee;
    } else if (type === "DIVIDEND") {
      raw.instrumentId = instrumentId;
      raw.amount = amount;
      raw.fee = fee === "" ? undefined : fee;
    } else if (type === "FEE") {
      raw.instrumentId = instrumentId === NO_INSTRUMENT ? undefined : instrumentId;
      raw.amount = amount;
    } else {
      raw.amount = amount;
    }

    const parsed = transactionInputSchema.safeParse(raw);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "form");
        if (!errors[field]) errors[field] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    setPending(true);
    const result = isEdit
      ? await updateTransaction(editing.id, parsed.data)
      : await createTransaction(parsed.data);
    setPending(false);

    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    onOpenChange(false);
    router.refresh();
  }

  const submitDisabled =
    pending || (instrumentRequired && (noInstrumentsYet || instrumentId === ""));

  return (
    <Dialog
      open={open}
      // Never dismissable mid-save — the request outcome must be seen.
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Transaction" : "Add Transaction"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="tx-type">Type</Label>
              <Select
                id="tx-type"
                className="mt-1.5"
                value={type}
                onValueChange={changeType}
                options={Object.values(TransactionType).map((t) => ({
                  value: t,
                  label: transactionTypeLabel(t),
                }))}
              />
            </div>
            <div>
              <Label htmlFor="tx-date">Trade Date</Label>
              <Input
                id="tx-date"
                type="date"
                className="mt-1.5"
                value={tradeDate}
                onChange={(e) => setTradeDate(e.target.value)}
              />
              <FieldError message={fieldErrors.tradeDate} />
            </div>
          </div>

          {hasInstrumentField ? (
            <div>
              <Label htmlFor="tx-instrument">Instrument</Label>
              <Select
                id="tx-instrument"
                className="mt-1.5"
                value={instrumentId}
                onValueChange={changeInstrument}
                placeholder={
                  type === "FEE" || instrumentId !== "" ? undefined : "Pick an instrument"
                }
                options={[
                  ...(type === "FEE"
                    ? [{ value: NO_INSTRUMENT, label: "— Account-level (no instrument) —" }]
                    : []),
                  ...allInstruments.map((i) => ({
                    value: i.id,
                    label: `${i.ticker} — ${i.name}`,
                  })),
                ]}
              />
              <FieldError message={fieldErrors.instrumentId} />
              {noInstrumentsYet && instrumentRequired ? (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  No instruments yet — track one from the Stocks page first, or
                  create one below.
                </p>
              ) : null}
              {!showNewInstrument ? (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="mt-1 h-auto p-0 text-xs"
                  onClick={() => setShowNewInstrument(true)}
                >
                  New instrument
                </Button>
              ) : null}
            </div>
          ) : null}

          {showNewInstrument ? (
            <NewInstrumentFields
              onCreated={(instrument) => {
                setExtraInstruments((prev) => [...prev, instrument]);
                setInstrumentId(instrument.id);
                setCurrency(instrument.currency);
                setShowNewInstrument(false);
              }}
              onCancel={() => setShowNewInstrument(false)}
            />
          ) : null}

          {isTrade ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="tx-quantity">Quantity</Label>
                <Input
                  id="tx-quantity"
                  type="number"
                  step="any"
                  min="0"
                  className="mt-1.5"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
                <FieldError message={fieldErrors.quantity} />
              </div>
              <div>
                <Label htmlFor="tx-price">Price per unit</Label>
                <Input
                  id="tx-price"
                  type="number"
                  step="any"
                  min="0"
                  className="mt-1.5"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
                <FieldError message={fieldErrors.pricePerUnit} />
              </div>
            </div>
          ) : null}

          {!isTrade ? (
            <div>
              <Label htmlFor="tx-amount">Amount</Label>
              <Input
                id="tx-amount"
                type="number"
                step="any"
                min="0"
                className="mt-1.5"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <FieldError message={fieldErrors.amount} />
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            {isTrade || type === "DIVIDEND" ? (
              <div>
                <Label htmlFor="tx-fee">
                  {type === "DIVIDEND" ? "Fee / withholding" : "Fee"}
                </Label>
                <Input
                  id="tx-fee"
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0"
                  className="mt-1.5"
                  value={fee}
                  onChange={(e) => setFee(e.target.value)}
                />
                <FieldError message={fieldErrors.fee} />
              </div>
            ) : null}
            <div>
              <Label htmlFor="tx-currency">Currency</Label>
              <Select
                id="tx-currency"
                className="mt-1.5"
                value={currency}
                onValueChange={(v) => setCurrency(v as Currency)}
                options={CURRENCY_OPTIONS}
              />
              <FieldError message={fieldErrors.currency} />
            </div>
          </div>

          {isTrade ? (
            // Read-only derived amount — the server computes the stored value.
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Amount: {amountComputable ? formatMoney(computedAmount, currency) : "—"}
            </p>
          ) : null}

          <div>
            <Label htmlFor="tx-note">Note</Label>
            <Textarea
              id="tx-note"
              rows={2}
              className="mt-1.5 min-h-0"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <FieldError message={fieldErrors.note} />
          </div>

          {serverError ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {serverError}
            </p>
          ) : null}
          <FieldError message={fieldErrors.form} />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitDisabled}>
              {pending ? (
                <>
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                  Saving…
                </>
              ) : isEdit ? (
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

// ---------------------------------------------------------------------------
// Inline new-instrument creation, with honest FMP prefill: prefill only works
// for US tickers with an FMP key; every other case shows the typed
// unavailable message and the owner types the details by hand — nothing is
// ever fabricated into the form.
// ---------------------------------------------------------------------------

function NewInstrumentFields({
  onCreated,
  onCancel,
}: {
  onCreated: (instrument: InstrumentOptionData) => void;
  onCancel: () => void;
}) {
  const [ticker, setTicker] = React.useState("");
  const [market, setMarket] = React.useState<Market>("US");
  const [instrumentType, setInstrumentType] = React.useState<InstrumentType>("STOCK");
  const [name, setName] = React.useState("");
  const [instrumentCurrency, setInstrumentCurrency] = React.useState<Currency>("USD");
  const [sector, setSector] = React.useState("");
  const [country, setCountry] = React.useState("");

  const [prefillPending, setPrefillPending] = React.useState(false);
  const [prefillNote, setPrefillNote] = React.useState<string | null>(null);
  const [createPending, setCreatePending] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);

  function changeMarket(value: string) {
    const nextMarket = value as Market;
    setMarket(nextMarket);
    setInstrumentCurrency(defaultCurrencyForMarket(nextMarket));
  }

  async function handlePrefill() {
    setPrefillPending(true);
    setPrefillNote(null);
    const result = await prefillInstrumentProfile(ticker, market);
    setPrefillPending(false);
    if (result.ok) {
      setName(result.data.name);
      if (result.data.sector) setSector(result.data.sector);
      if (result.data.country) setCountry(result.data.country);
      if (result.data.currency) setInstrumentCurrency(result.data.currency);
      setPrefillNote("Prefilled from FMP — check the details before creating.");
    } else {
      // Honest unavailable: show the typed reason, leave the form as-is.
      setPrefillNote(
        result.message ?? "Prefill unavailable — fill the details in by hand.",
      );
    }
  }

  async function handleCreate() {
    setCreatePending(true);
    setCreateError(null);
    const result = await createInstrument({
      ticker,
      name,
      market,
      currency: instrumentCurrency,
      type: instrumentType,
      sector: sector.trim() === "" ? undefined : sector,
      country: country.trim() === "" ? undefined : country,
    });
    setCreatePending(false);
    if (!result.ok) {
      setCreateError(result.error);
      return;
    }
    onCreated({
      id: result.data.id,
      ticker: result.data.ticker,
      name: name.trim(),
      currency: instrumentCurrency,
      market,
    });
  }

  return (
    <div className="space-y-3 rounded-md border border-slate-200 p-4 dark:border-slate-800">
      <p className="text-sm font-medium">New instrument</p>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="ni-ticker">Ticker</Label>
          <Input
            id="ni-ticker"
            className="mt-1.5 uppercase"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
          />
        </div>
        <div>
          <Label htmlFor="ni-market">Market</Label>
          <Select
            id="ni-market"
            className="mt-1.5"
            value={market}
            onValueChange={changeMarket}
            options={Object.values(Market).map((m) => ({ value: m, label: m }))}
          />
        </div>
      </div>
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={prefillPending || ticker.trim() === ""}
          onClick={handlePrefill}
        >
          {prefillPending ? (
            <>
              <LoaderCircle className="animate-spin" aria-hidden="true" />
              Fetching…
            </>
          ) : (
            "Prefill from FMP"
          )}
        </Button>
        {prefillNote ? (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {prefillNote}
          </p>
        ) : null}
      </div>
      <div>
        <Label htmlFor="ni-name">Name</Label>
        <Input
          id="ni-name"
          className="mt-1.5"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="ni-type">Type</Label>
          <Select
            id="ni-type"
            className="mt-1.5"
            value={instrumentType}
            onValueChange={(v) => setInstrumentType(v as InstrumentType)}
            options={[
              { value: "STOCK", label: "Stock" },
              { value: "ETF", label: "ETF" },
              { value: "REIT", label: "REIT" },
            ]}
          />
        </div>
        <div>
          <Label htmlFor="ni-currency">Currency</Label>
          <Select
            id="ni-currency"
            className="mt-1.5"
            value={instrumentCurrency}
            onValueChange={(v) => setInstrumentCurrency(v as Currency)}
            options={CURRENCY_OPTIONS}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="ni-sector">Sector (optional)</Label>
          <Input
            id="ni-sector"
            className="mt-1.5"
            value={sector}
            onChange={(e) => setSector(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="ni-country">Country (optional)</Label>
          <Input
            id="ni-country"
            className="mt-1.5"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          />
        </div>
      </div>
      {createError ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {createError}
        </p>
      ) : null}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" size="sm" disabled={createPending} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={createPending || ticker.trim() === "" || name.trim() === ""}
          onClick={handleCreate}
        >
          {createPending ? (
            <>
              <LoaderCircle className="animate-spin" aria-hidden="true" />
              Creating…
            </>
          ) : (
            "Create instrument"
          )}
        </Button>
      </div>
    </div>
  );
}
