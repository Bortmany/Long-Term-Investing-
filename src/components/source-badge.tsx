// SourceBadge — the golden-rule component. Every number on screen carries
// one of these so the owner can always see where a figure came from:
//   live   — fetched from a real market-data provider
//   manual — entered by hand, shown with its as-of date
//   sample — seeded demo data
// Two sizes: "default" is the full pill; "sm" is a compact icon-only glyph
// with a tooltip revealing the same label, for dense table cells.
import { Clock, FlaskConical } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatShortDate } from "@/lib/format";
import type { ValueSource } from "@/lib/portfolio";
import { cn } from "@/lib/utils";

export type SourceBadgeVariant = "live" | "manual" | "sample";

export type SourceBadgeProps = {
  variant: SourceBadgeVariant;
  /** Pre-formatted as-of date, e.g. "Jul 10, 2026". Used by the manual variant. */
  date?: string;
  size?: "default" | "sm";
  className?: string;
};

function labelFor(variant: SourceBadgeVariant, date?: string): string {
  switch (variant) {
    case "live":
      return "Live";
    case "manual":
      return date ? `Manual, as of ${date}` : "Manual";
    case "sample":
      return "Sample data";
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

function IconFor({ variant, className }: { variant: SourceBadgeVariant; className?: string }) {
  switch (variant) {
    case "live":
      return <LiveDot className={className} />;
    case "manual":
      return <Clock className={cn("size-3 shrink-0", className)} aria-hidden="true" />;
    case "sample":
      return <FlaskConical className={cn("size-3 shrink-0", className)} aria-hidden="true" />;
  }
}

const pillColors: Record<SourceBadgeVariant, string> = {
  live: "text-slate-600 dark:text-slate-400",
  manual: "text-slate-600 dark:text-slate-400",
  sample:
    "border-amber-600/30 bg-amber-50 text-amber-600 dark:border-amber-400/30 dark:bg-amber-950 dark:text-amber-400",
};

const glyphColors: Record<SourceBadgeVariant, string> = {
  live: "text-slate-600 dark:text-slate-400",
  manual: "text-slate-600 dark:text-slate-400",
  sample: "text-amber-600 dark:text-amber-400",
};

/**
 * Map one ValueSource from the portfolio math library to badge props.
 * "derived" means the figure comes purely from the user's own recorded
 * transactions — in Phase 1 those transactions are seeded demo data, so
 * derived figures honestly wear the "sample data" badge. Revisit when real
 * (non-seeded) transaction entry exists.
 */
export function badgePropsForValueSource(
  source: ValueSource,
): Pick<SourceBadgeProps, "variant" | "date"> {
  if (source.kind === "derived") {
    return { variant: "sample" };
  }
  if (source.kind === "manual") {
    return { variant: "manual", date: formatShortDate(source.asOf) };
  }
  return { variant: source.kind };
}

/**
 * Summarise many ValueSources into one badge for an aggregate figure
 * (e.g. the Total Portfolio Value card). Precedence: if ANY input is sample
 * data the total is sample; else if any is manual the total is manual (with
 * the oldest as-of date, the honest one); else live. Derived-only figures
 * fall back to "sample" for the Phase 1 reason above.
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
  return { variant: "sample" };
}

export function SourceBadge({ variant, date, size = "default", className }: SourceBadgeProps) {
  const label = labelFor(variant, date);

  if (size === "sm") {
    // Compact: icon only, full label in a tooltip (hover or focus/tap).
    return (
      <Tooltip className={className}>
        <TooltipTrigger
          aria-label={label}
          className={cn("items-center justify-center p-0.5", glyphColors[variant])}
        >
          <IconFor variant={variant} className="size-3" />
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Badge variant="outline" className={cn("gap-1.5 font-normal", pillColors[variant], className)}>
      <IconFor variant={variant} className="size-3" />
      {label}
    </Badge>
  );
}
