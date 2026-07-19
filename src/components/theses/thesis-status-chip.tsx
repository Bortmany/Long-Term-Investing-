// ACTIVE/CLOSED status chip, shared by the /theses list and /theses/[id]
// header (ui-spec §5.1/§5.2). ACTIVE reuses the calm green dot the `live`
// SourceBadge already uses for "currently active" rather than inventing a
// new color; CLOSED is a plain muted secondary badge.
import { Badge } from "@/components/ui/badge";
import type { ThesisStatus } from "@prisma/client";

export function ThesisStatusChip({ status }: { status: ThesisStatus }) {
  if (status === "ACTIVE") {
    return (
      <Badge
        variant="outline"
        className="gap-1.5 font-normal text-slate-600 dark:text-slate-400"
      >
        <span
          aria-hidden="true"
          className="inline-block size-2 shrink-0 rounded-full bg-green-600 dark:bg-green-400"
        />
        Active
      </Badge>
    );
  }
  return <Badge variant="secondary">Closed</Badge>;
}
