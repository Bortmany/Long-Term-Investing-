import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Loading state for the /stocks table (ui-spec §4.1): header + skeleton rows.
export default function StocksLoading() {
  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-10 w-32" />
      </div>
      <Card className="py-0">
        <CardContent className="p-4">
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="grid grid-cols-6 gap-4">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-20 justify-self-end" />
                <Skeleton className="h-4 w-16 justify-self-end" />
                <Skeleton className="h-5 w-12" />
                <Skeleton className="size-6 justify-self-end rounded-md" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
