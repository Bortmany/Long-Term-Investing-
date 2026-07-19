"use client";

// Base Currency card (UI spec §3.4). Picking a new currency saves
// immediately through the setBaseCurrency server action — the page then
// re-renders with the saved value, so there is no separate "Saved" toast.

import * as React from "react";
import type { Currency } from "@prisma/client";

import { setBaseCurrency } from "@/app/actions/settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExplainerTip } from "@/components/explainer-tip";
import { Select } from "@/components/ui/select";

export function BaseCurrencyCard({
  baseCurrency,
  currencies,
}: {
  baseCurrency: Currency;
  /** The Currency enum values, passed from the server so the list can't drift from the schema. */
  currencies: Currency[];
}) {
  // While the save is in flight the select shows the value just picked, so it
  // doesn't snap back to the old one until the refreshed page data arrives.
  const [pendingValue, setPendingValue] = React.useState<Currency | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  function handleChange(next: string) {
    const currency = next as Currency;
    setPendingValue(currency);
    setError(null);
    startTransition(async () => {
      const result = await setBaseCurrency(currency);
      if (!result.ok) {
        setError(result.error);
      }
      setPendingValue(null);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="inline-flex items-center gap-1">
          Base Currency <ExplainerTip term="base-currency" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Select
          value={pendingValue ?? baseCurrency}
          onValueChange={handleChange}
          options={currencies.map((c) => ({ value: c, label: c }))}
          disabled={isPending}
          aria-label="Base currency"
          className="max-w-48"
        />
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          All totals are converted to this currency using the FX rates below.
        </p>
        {error ? (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
