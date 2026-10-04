// Phone loading shapes (phone-tables-as-cards spec, sections 2.2 and 4.1).
// Below 768px a loading page shows grey card-shaped blocks instead of
// table-row bars, so the page does not jump from table shapes to cards when
// the data arrives. Laptop (768 and up) keeps each page's own table-row
// skeletons. These render nothing real: no figures, no source badges.
//
// Use: put <CardSkeletonList /> where the phone cards will be (it hides
// itself from 768 up) and wrap the existing table skeleton in
// <div className={LAPTOP_ONLY}> so it hides on a phone.
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Put on the existing table-row skeleton wrapper: hidden on a phone, shown from 768 up. */
export const LAPTOP_ONLY = "hidden md:block";
/** Same, for Holdings and Transactions, whose cards stay until 1280 (spec decision 1). */
export const LAPTOP_ONLY_XL = "hidden xl:block";

const FRAME = "overflow-hidden rounded-lg border border-slate-200 p-4 dark:border-slate-800";

/** One standard card (96px): ticker bar, name bar, figure bar, round rail button. */
function StandardCardSkeleton() {
  return (
    <div className={cn(FRAME, "flex h-24 gap-2")}>
      <div className="min-w-0 flex-1 space-y-1">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-3.5 w-40 max-w-full" />
        <Skeleton className="mt-2 h-5 w-[120px] max-w-full" />
      </div>
      <Skeleton className="size-8 shrink-0 rounded-full" />
    </div>
  );
}

/** One compact card (72px): the figure bar sits on the ticker line, no name line. */
function CompactCardSkeleton() {
  return (
    <div className={cn(FRAME, "flex h-[72px] items-start gap-2")}>
      <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-5 w-[120px] max-w-[50%]" />
      </div>
      <Skeleton className="size-8 shrink-0 rounded-full" />
    </div>
  );
}

/** One theses card (152px): identity + status pill, two statement bars, two small detail blocks. */
function ThesisCardSkeleton() {
  return (
    <div className={cn(FRAME, "h-[152px] space-y-2")}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-[120px] max-w-full" />
        </div>
        <Skeleton className="h-6 w-14 shrink-0 rounded-full" />
      </div>
      <Skeleton className="h-3.5 w-full" />
      <Skeleton className="h-3.5 w-[70%]" />
      <div className="grid grid-cols-2 gap-4 pt-1">
        <Skeleton className="h-6 w-12" />
        <Skeleton className="h-3.5 w-20" />
      </div>
    </div>
  );
}

/**
 * A stack of grey card-shaped blocks for the phone (hidden from 768 up).
 * `standard` = 96px cards, `compact` = 72px cards, `thesis` = 152px cards.
 */
export function CardSkeletonList({
  count = 4,
  density = "standard",
  hideFrom = "md",
  className,
}: {
  count?: number;
  density?: "standard" | "compact" | "thesis";
  /** Width the cards disappear at: "md" (768, default) or "xl" (1280, Holdings/Transactions). */
  hideFrom?: "md" | "xl";
  className?: string;
}) {
  const Item =
    density === "compact"
      ? CompactCardSkeleton
      : density === "thesis"
        ? ThesisCardSkeleton
        : StandardCardSkeleton;
  return (
    <div aria-hidden="true" className={cn("flex flex-col gap-2", hideFrom === "xl" ? "xl:hidden" : "md:hidden", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Item key={i} />
      ))}
    </div>
  );
}

/** Two filter-chip blocks (88 x 44) for the Theses phone loading page. */
export function ChipSkeletons({ className }: { className?: string }) {
  return (
    <div className={cn("flex gap-2", className)}>
      <Skeleton className="h-11 w-[88px]" />
      <Skeleton className="h-11 w-[88px]" />
    </div>
  );
}
