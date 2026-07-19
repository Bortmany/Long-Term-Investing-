import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Loading state shaped like the real past-run page (back link, ticker + name
// heading, then the analysis panel) so nothing jumps when the data arrives.
export default function CommitteeHistoryLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-4 w-36" />
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-6 w-48" />
      </div>

      <Card className="gap-4">
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div>
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-2 h-10 w-24" />
            </div>
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-3 w-full" />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
