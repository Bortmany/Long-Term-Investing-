import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Loading state shaped like the real /portfolio page (header row, Holdings
// card, Transactions card) so nothing jumps when the data arrives. No source
// badges while loading — nothing is rendered until it's real.
export default function PortfolioLoading() {
  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Portfolio</h1>
        <div className="flex items-center gap-2">
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
              <div key={i} className="grid grid-cols-6 gap-4">
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-14 justify-self-end" />
                <Skeleton className="h-4 w-24 justify-self-end" />
                <Skeleton className="h-4 w-28 justify-self-end" />
                <Skeleton className="h-4 w-24 justify-self-end" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Transactions card */}
      <Card className="mt-6 gap-4">
        <CardHeader className="flex-row items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-10 w-40" />
            <Skeleton className="h-10 w-44" />
            <Skeleton className="h-10 w-36" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="grid grid-cols-6 gap-4">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-4 w-24 justify-self-end" />
                <Skeleton className="h-4 w-24 justify-self-end" />
                <Skeleton className="h-4 w-28" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
