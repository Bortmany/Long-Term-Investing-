// SourceBadge — the golden-rule component. Every number on screen carries
// one of these so the owner can always see where a figure came from:
//   live    — fetched from a real market-data provider
//   manual  — entered by hand, shown with its as-of date
//   sample  — seeded demo data
//   derived — computed purely from the user's own recorded transactions
// Two sizes: "default" is the full pill; "sm" is a compact icon-only glyph
// with a tooltip revealing the same label, for dense table cells.
//
// A "live" badge can also carry `detail` (see describePriceProvider in
// src/lib/data/provider-info.ts): it names the provider and says how late the
// price is ("Twelve Data · end of day, Sep 28, 2026"). The detail replaces the
// word "Live" — an end-of-day or unconfirmed-delay price is never called live —
// and when the provider was not answering it turns amber and says so.
import { Calculator, Clock, FlaskConical } from "lucide-react";
import type { Market, PriceSource } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatShortDate } from "@/lib/format";
import {
  describePriceProvider,
  type ProviderBadgeDetail,
} from "@/lib/data/provider-info";
import type { ValueSource } from "@/lib/portfolio";
import { cn } from "@/lib/utils";

export type SourceBadgeVariant = "live" | "manual" | "sample" | "derived";

export type SourceBadgeProps = {
  variant: SourceBadgeVariant;
  /** Pre-formatted as-of date, e.g. "Jul 10, 2026". Used by the manual variant. */
  date?: string;
  /** Provider and delay wording for a live price. Replaces the word "Live". */
  detail?: ProviderBadgeDetail;
  size?: "default" | "sm";
  className?: string;
};

function labelFor(variant: SourceBadgeVariant, date?: string, detail?: ProviderBadgeDetail): string {
  if (detail && variant === "live") return detail.text;
  switch (variant) {
    case "live":
      return "Live";
    case "manual":
      return date ? `Manual, as of ${date}` : "Manual";
    case "sample":
      return "Sample data";
    case "derived":
      return "Computed from your transactions";
  }
}

/** Small filled green dot — calm, not an animated pulse. */
function LiveDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-2 shrink-0 rounded-full bg-green-600 dark:bg-green-400", className)}
    />
  );
}

function IconFor({
  variant,
  detail,
  className,
}: {
  variant: SourceBadgeVariant;
  detail?: ProviderBadgeDetail;
  className?: string;
}) {
  // A provider price gets a green dot ONLY when it says "Live" (a confirmed
  // short delay); end-of-day and unconfirmed-delay prices get a clock.
  if (detail && variant === "live" && detail.icon === "clock") {
    return <Clock className={cn("size-3 shrink-0", className)} aria-hidden="true" />;
  }
  switch (variant) {
    case "live":
      return <LiveDot className={className} />;
    case "manual":
      return <Clock className={cn("size-3 shrink-0", className)} aria-hidden="true" />;
    case "sample":
      return <FlaskConical className={cn("size-3 shrink-0", className)} aria-hidden="true" />;
    case "derived":
      return <Calculator className={cn("size-3 shrink-0", className)} aria-hidden="true" />;
  }
}

const pillColors: Record<SourceBadgeVariant, string> = {
  live: "text-slate-600 dark:text-slate-400",
  manual: "text-slate-600 dark:text-slate-400",
  sample:
    "border-amber-600/30 bg-amber-50 text-amber-600 dark:border-amber-400/30 dark:bg-amber-950 dark:text-amber-400",
  // Derived is not a warning — same neutral slate treatment as live/manual.
  derived: "text-slate-600 dark:text-slate-400",
};

const glyphColors: Record<SourceBadgeVariant, string> = {
  live: "text-slate-600 dark:text-slate-400",
  manual: "text-slate-600 dark:text-slate-400",
  sample: "text-amber-600 dark:text-amber-400",
  derived: "text-slate-600 dark:text-slate-400",
};

// The provider-not-answering look: the same amber treatment as sample data.
const fallbackPill = pillColors.sample;
const fallbackGlyph = glyphColors.sample;

/**
 * Map one ValueSource from the portfolio math library to badge props.
 * "derived" means the figure comes purely from the user's own recorded
 * transactions — no external data source involved — so it wears the
 * "Computed from your transactions" badge. (Phase 1 mapped derived to
 * "sample" because every transaction was seed data back then; Phase 2 adds
 * real transaction entry, so derived is now its own honest badge.)
 */
export function badgePropsForValueSource(
  source: ValueSource,
): Pick<SourceBadgeProps, "variant" | "date"> {
  if (source.kind === "derived") {
    return { variant: "derived" };
  }
  if (source.kind === "manual") {
    return { variant: "manual", date: formatShortDate(source.asOf) };
  }
  return { variant: source.kind };
}

/**
 * Badge props for a price: the usual badge, plus the provider/delay wording
 * when the price came from Twelve Data. `priceSource` is the true origin
 * (Quote.priceSource, or a stored price's source); when it is unset the price
 * is treated exactly as before.
 */
export function badgePropsForPrice(
  price: {
    source: "live" | "manual" | "sample";
    asOf: Date;
    priceSource?: PriceSource;
    fallback?: boolean;
  },
  market: Market,
): Pick<SourceBadgeProps, "variant" | "date" | "detail"> {
  const base = badgePropsForValueSource({ kind: price.source, asOf: price.asOf });
  const detail = describePriceProvider({
    priceSource: price.priceSource,
    market,
    asOf: price.asOf,
    fallback: price.fallback,
  });
  return detail ? { ...base, detail } : base;
}

/**
 * Badge props for ONE holding's market value. The value wears the same
 * badge as the price it was worked out from, so an end-of-day Tadawul price
 * says "Twelve Data · end of day, <date>" (clock icon) and never "Live".
 * Aggregate figures (totals, cash) keep using badgePropsForValueSources.
 */
export function badgePropsForHoldingValue(
  valuation: { source: ValueSource; priceSource?: PriceSource },
  market: Market,
): Pick<SourceBadgeProps, "variant" | "date" | "detail"> {
  const { source } = valuation;
  if (source.kind === "derived") return badgePropsForValueSource(source);
  return badgePropsForPrice(
    {
      source: source.kind,
      asOf: source.asOf,
      priceSource: valuation.priceSource,
    },
    market,
  );
}

/**
 * Summarise many ValueSources into one badge for an aggregate figure
 * (e.g. the Total Portfolio Value card). Precedence: if ANY input is sample
 * data the total is sample; else if any is manual the total is manual (with
 * the oldest as-of date, the honest one); else if any is live the total is
 * live; else (every input is derived) the total is derived.
 */
export function badgePropsForValueSources(
  sources: ValueSource[],
): Pick<SourceBadgeProps, "variant" | "date"> {
  if (sources.some((s) => s.kind === "sample")) {
    return { variant: "sample" };
  }
  const manual = sources.filter(
    // Every non-derived ValueSource carries an asOf date.
    (s): s is Exclude<ValueSource, { kind: "derived" }> => s.kind === "manual",
  );
  if (manual.length > 0) {
    const oldest = manual.reduce((a, b) => (a.asOf <= b.asOf ? a : b));
    return { variant: "manual", date: formatShortDate(oldest.asOf) };
  }
  if (sources.some((s) => s.kind === "live")) {
    return { variant: "live" };
  }
  return { variant: "derived" };
}

export function SourceBadge({ variant, date, detail, size = "default", className }: SourceBadgeProps) {
  const label = labelFor(variant, date, detail);
  const providerDetail = variant === "live" ? detail : undefined;
  const isFallback = Boolean(providerDetail?.fallbackNote);

  if (size === "sm") {
    // Compact: icon only, full label in a tooltip (hover or focus/tap).
    // The invisible ::before widens the tap area to 44 x 44px while the
    // glyph itself stays small.
    const hintLines = providerDetail
      ? [
          providerDetail.text,
          providerDetail.meaning,
          providerDetail.timeZoneNote,
          providerDetail.fallbackNote,
        ].filter((line): line is string => Boolean(line))
      : [label];
    return (
      <Tooltip className={className}>
        <TooltipTrigger
          aria-label={hintLines.join(" ")}
          className={cn(
            "relative items-center justify-center p-0.5 before:absolute before:left-1/2 before:top-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']",
            isFallback ? fallbackGlyph : glyphColors[variant],
          )}
        >
          <IconFor variant={variant} detail={providerDetail} className="size-3" />
        </TooltipTrigger>
        <TooltipContent
          className={providerDetail ? "w-max max-w-64 whitespace-normal text-left" : undefined}
        >
          {hintLines.map((line, index) => (
            <span key={index} className="block">
              {line}
            </span>
          ))}
        </TooltipContent>
      </Tooltip>
    );
  }

  const pill = (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 font-normal",
        isFallback ? fallbackPill : pillColors[variant],
        // Provider wording can be long: let it wrap instead of being cut off.
        providerDetail && "h-auto max-w-full whitespace-normal py-1 text-left",
        !isFallback && className,
      )}
      title={
        providerDetail
          ? [providerDetail.meaning, providerDetail.timeZoneNote].filter(Boolean).join(" ")
          : undefined
      }
    >
      <IconFor variant={variant} detail={providerDetail} className="size-3" />
      {label}
    </Badge>
  );

  if (!providerDetail?.fallbackNote) return pill;

  // Provider not answering: the amber pill plus one line saying why.
  return (
    <span className={cn("inline-flex max-w-full flex-col items-start gap-1", className)}>
      {pill}
      <span className="text-xs text-amber-700 dark:text-amber-400">{providerDetail.fallbackNote}</span>
    </span>
  );
}
