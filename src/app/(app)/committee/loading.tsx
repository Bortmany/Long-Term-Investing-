import { Skeleton } from "@/components/ui/skeleton";

// Loading state shaped like the real /committee page (header + picker card +
// result panel) so nothing jumps when the data arrives.
export default function CommitteeLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-56" />
      <div className="space-y-3 rounded-lg border border-slate-200 p-6 dark:border-slate-800">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="space-y-3 rounded-lg border border-slate-200 p-6 dark:border-slate-800">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-20 w-full" />
      </div>
    </div>
  );
}
