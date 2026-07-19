// INTACT / WEAKENING / BROKEN chip (ui-spec §5.2, color rule §2.6). These are
// qualitative AI judgments, never a status word colored green/red — INTACT
// and BROKEN render in plain neutral slate, distinguished only by icon.
// WEAKENING is the one legitimate reuse of amber in this phase (a genuine
// "needs attention" state), same treatment the `sample` SourceBadge uses.
import { CircleCheck, CircleX, TriangleAlert } from "lucide-react";
import type { ThesisRecommendation } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function RecommendationChip({
  recommendation,
  className,
}: {
  recommendation: ThesisRecommendation;
  className?: string;
}) {
  if (recommendation === "WEAKENING") {
    return (
      <Badge
        variant="outline"
        className={cn(
          "gap-1.5 font-normal border-amber-600/30 bg-amber-50 text-amber-600 dark:border-amber-400/30 dark:bg-amber-950 dark:text-amber-400",
          className,
        )}
      >
        <TriangleAlert className="size-3.5" aria-hidden="true" />
        Weakening
      </Badge>
    );
  }
  if (recommendation === "BROKEN") {
    return (
      <Badge
        variant="outline"
        className={cn("gap-1.5 font-normal text-slate-600 dark:text-slate-400", className)}
      >
        <CircleX className="size-3.5" aria-hidden="true" />
        Broken
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 font-normal text-slate-600 dark:text-slate-400", className)}
    >
      <CircleCheck className="size-3.5" aria-hidden="true" />
      Intact
    </Badge>
  );
}
