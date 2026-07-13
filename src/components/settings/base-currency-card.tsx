"use client";

// Settings — Base Currency card. Picking a new currency saves immediately
// through the setBaseCurrency server action (no separate Save button, and no
// toast — the re-rendered page showing the saved value IS the confirmation).

import * as React from "react";
import { Currency } from "@prisma/client";

import { setBaseCurrency } from "@/app/actions/settings";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";

const CURRENCY_OPTIONS = Object.values(Currency).map((currency) => ({
  value: currency,
  label: currency,
}));

export function BaseCurrencyCard({ baseCurrency }: { baseCurrency: Currency }) {
  const [value, setValue] = React.useState<string>(baseCurrency);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function handleChange(next: string) {
    const previous = value;
    setValue(next);
    setError(null);
    startTransition(async () => {
      const result = await setBaseCurrency(next as Currency);
      if (!result.ok) {
        // Save failed — put the old value back rather than showing a
        // selection that was never actually stored.
        setValue(previous);
        setError(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Base Currency</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Select
          value={value}
          onValueChange={handleChange}
          options={CURRENCY_OPTIONS}
          disabled={pending}
          aria-label="Base currency"
          className="max-w-48"
        />
        <p className="text-sm text-slate-500 dark:text-slate-400">
          All totals are converted to this currency using the FX rates below.
        </p>
      </CardContent>
    </Card>
  );
}
