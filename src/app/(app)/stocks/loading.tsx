import { Skeleton } from "@/components/ui/skeleton";

// Loading state shaped like the real /stocks table (header row + 5 skeleton
// rows) so nothing jumps when the data arrives. No source badges while
// loading — nothing is rendered until it's real.
export default function StocksLoading() {
  return (
    <>
      <div className="mb-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-10 w-36" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="grid grid-cols-6 gap-4">
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-20 justify-self-end" />
            <Skeleton className="h-4 w-16 justify-self-end" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-9 w-9" />
          </div>
        ))}
      </div>
    </>
  );
}
