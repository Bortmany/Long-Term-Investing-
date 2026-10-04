// Stock-page caption (gulf-markets-live-ui spec 4b): shown under the price
// ONLY when the price on screen is sample data. Never together with a live,
// delayed or manual badge, so it can't contradict them.
import type { SourceBadgeVariant } from "@/components/source-badge";

export const SAMPLE_PRICE_CAPTION =
  "Sample price for illustration. It is not a real quote.";

/** True only when the displayed price's source badge is "sample". */
export function showSamplePriceCaption(variant: SourceBadgeVariant): boolean {
  return variant === "sample";
}

export function SamplePriceCaption({ variant }: { variant: SourceBadgeVariant }) {
  if (!showSamplePriceCaption(variant)) return null;
  return (
    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
      {SAMPLE_PRICE_CAPTION}
    </p>
  );
}
