import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Loading state shaped like the real /watchlist page (header, the Watched &
// Held Stocks table card, then the Alerts card) so nothing jumps when the
// data arrives. No source badges while loading — a badge is a statement
// about real data, and there is none yet.
export default function WatchlistLoading() {
  return (
    <>
      <div className="mb-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-8 w-32" />
      </div>

      <Card className="mb-6 gap-4">
        <CardHeader>
          <Skeleton className="h-5 w-44" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="grid grid-cols-4 gap-4">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-24 justify-self-end" />
                <Skeleton className="h-4 w-10 justify-self-end" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <Skeleton className="h-5 w-20" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="grid grid-cols-3 gap-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-16 justify-self-end" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
