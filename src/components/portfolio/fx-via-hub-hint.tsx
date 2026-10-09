// Small grey line under (or beside) a converted holding value when its
// exchange rate was worked out through the rial, e.g.
// "rate via OMR, as of Jul 1, 2026" (the older of the two rate dates).
export function FxViaHubHint({ note }: { note?: string | null }) {
  if (!note) return null;
  return (
    <span className="block text-xs text-slate-500 dark:text-slate-400">{note}</span>
  );
}
