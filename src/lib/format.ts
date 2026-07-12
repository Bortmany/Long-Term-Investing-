// Display formatting helpers (pages stay thin; formatting lives here).

/**
 * Format a money amount for display, e.g. formatMoney(24850, "OMR")
 * → "OMR 24,850.000". OMR is conventionally shown to 3 decimals (its minor
 * unit, the baisa, is 1/1000); other currencies use 2 decimals.
 */
export function formatMoney(amount: number, currency: string): string {
  const decimals = currency === "OMR" ? 3 : 2;
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
  return `${currency} ${formatted}`;
}

/** Format a share quantity: whole numbers stay whole, fractions keep up to 4 decimals. */
export function formatQuantity(quantity: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(quantity);
}

/** Short human date, e.g. "Jul 10, 2026" — used by the manual source badge. */
export function formatShortDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
