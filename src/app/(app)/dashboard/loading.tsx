import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Loading state shaped like the real dashboard (same card grids, same section
// order: summary row, return cards, allocation donuts, holdings table,
// dividend module) so nothing jumps when the data arrives. No source badges
// are shown while loading — nothing is rendered until it's real.
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

      {/* Return cards row */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} className="py-0">
            <CardContent className="p-5">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="mt-2 h-8 w-48" />
              <Skeleton className="mt-3 h-5 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Allocation donuts row */}
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="gap-4">
            <CardHeader>
              <Skeleton className="h-5 w-24" />
            </CardHeader>
            <CardContent>
              {/* Circular stand-in for the donut chart. */}
              <div className="flex h-[220px] items-center justify-center">
                <Skeleton className="size-40 rounded-full" />
              </div>
              <div className="mt-3 space-y-2">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="flex items-center gap-2">
                    <Skeleton className="size-2.5 rounded-full" />
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="ml-auto h-3 w-10" />
                  </div>
                ))}
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

      {/* Dividend module */}
      <Card className="mt-6 gap-4">
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          {/* Bar-shaped stand-in for the monthly income chart. */}
          <div className="flex h-[200px] items-end gap-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton
                key={i}
                className="w-full"
                style={{ height: `${35 + (i % 4) * 15}%` }}
              />
            ))}
          </div>
          <div className="mt-4 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="ml-auto h-4 w-28" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
