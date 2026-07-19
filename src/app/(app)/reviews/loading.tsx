import { Skeleton } from "@/components/ui/skeleton";

// Loading state shaped like the real /reviews page (header + table rows) so
// nothing jumps when the data arrives — same pattern as /theses/loading.tsx.
export default function ReviewsLoading() {
  return (
    <>
      <div className="mb-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-10 w-40" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="grid grid-cols-2 gap-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
    </>
  );
}
