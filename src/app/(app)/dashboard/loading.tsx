import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Loading state shaped like the real dashboard (same card grid, same table
// row count, same chart footprints) so nothing jumps when the data arrives.
// No source badges are shown while loading — nothing is rendered until it's
// real.
export default function DashboardLoading() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Dashboard</h1>

      {/* Summary row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="py-0">
            <CardContent className="p-5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-2 h-8 w-40" />
              <Skeleton className="mt-3 h-5 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Weekly Review card */}
      <div className="mt-6">
        <Card className="gap-4">
          <CardHeader className="flex-row items-center gap-3">
            <Skeleton className="size-5 rounded-full" />
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-3 h-4 w-full" />
            <Skeleton className="mt-1.5 h-4 w-full" />
            <Skeleton className="mt-1.5 h-4 w-2/3" />
            <Skeleton className="mt-3 h-4 w-40" />
          </CardContent>
        </Card>
      </div>

      {/* Return cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} className="py-0">
            <CardContent className="p-5">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="mt-2 h-8 w-40" />
              <Skeleton className="mt-3 h-5 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Allocation donuts — a circular skeleton stands in for the chart */}
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="gap-4">
            <CardHeader className="flex-row items-center gap-3">
              <Skeleton className="h-5 w-20" />
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              <Skeleton className="size-[160px] rounded-full" />
              <div className="mt-3 w-full space-y-1.5">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Holdings table */}
      <Card className="mt-6 gap-4">
        <CardHeader>
          <Skeleton className="h-5 w-24" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="grid grid-cols-4 gap-4">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-16 justify-self-end" />
                <Skeleton className="h-4 w-28 justify-self-end" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Dividend module — a bar-shaped skeleton row stands in for the chart */}
      <Card className="mt-6 gap-4">
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <div className="flex h-[200px] items-end gap-1.5">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton
                key={i}
                className="w-full"
                style={{ height: `${25 + ((i * 13) % 65)}%` }}
              />
            ))}
          </div>
          <div className="mt-4 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
