import { Skeleton } from "@/components/ui/skeleton";

// Loading state shaped like the real /theses page (header + filter chips +
// table rows) so nothing jumps when the data arrives.
export default function ThesesLoading() {
  return (
    <>
      <div className="mb-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="mb-4 flex gap-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="grid grid-cols-5 gap-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-4 w-16 justify-self-end" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </>
  );
}
