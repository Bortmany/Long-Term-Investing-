import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Loading state shaped like the real portfolio page (header row, holdings
// card, transactions card with the same row counts) so nothing jumps when
// the data arrives. No source badges while loading — nothing is rendered
// until it's real.
export default function PortfolioLoading() {
  return (
    <>
      {/* Page header: title left, Import CSV + Add Transaction right */}
      <div className="mb-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-8 w-36" />
        <div className="flex gap-3">
          <Skeleton className="h-10 w-28" />
          <Skeleton className="h-10 w-36" />
        </div>
      </div>

      {/* Holdings card */}
      <Card className="gap-4">
        <CardHeader>
          <Skeleton className="h-5 w-24" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="grid grid-cols-8 gap-4">
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-12 justify-self-end" />
                <Skeleton className="h-4 w-20 justify-self-end" />
                <Skeleton className="h-4 w-20 justify-self-end" />
                <Skeleton className="h-4 w-24 justify-self-end" />
                <Skeleton className="h-4 w-24 justify-self-end" />
                <Skeleton className="h-4 w-12 justify-self-end" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Transactions card */}
      <Card className="mt-6 gap-4">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-5 w-32" />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-36" />
            <Skeleton className="h-10 w-36" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="grid grid-cols-6 gap-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-4 w-20 justify-self-end" />
                <Skeleton className="h-4 w-24 justify-self-end" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
