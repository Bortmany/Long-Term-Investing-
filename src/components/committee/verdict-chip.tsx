// Neutral BUY / HOLD / SELL chip — never green/red on a verdict word
// (ui-spec §2.6 color rule), distinguished only by icon: BUY -> TrendingUp,
// HOLD -> Minus, SELL -> TrendingDown, all slate. Two sizes: "lg" for the
// Committee panel's verdict header (§6.2), "sm" (default) for the committee
// table's per-persona chip and the Past Runs table.
import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type Verdict = "BUY" | "HOLD" | "SELL";

const ICONS: Record<Verdict, typeof TrendingUp> = {
  BUY: TrendingUp,
  HOLD: Minus,
  SELL: TrendingDown,
};

export function VerdictChip({
  verdict,
  size = "sm",
  className,
}: {
  verdict: Verdict;
  size?: "sm" | "lg";
  className?: string;
}) {
  const Icon = ICONS[verdict];
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 font-normal text-slate-900 dark:text-slate-50",
        size === "lg" && "px-4 py-1.5 text-lg",
        className,
      )}
    >
      <Icon className={size === "lg" ? "size-5" : "size-3.5"} aria-hidden="true" />
      {verdict}
    </Badge>
  );
}
