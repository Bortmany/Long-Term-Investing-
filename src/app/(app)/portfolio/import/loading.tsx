import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Loading state shaped like the broker screen (UI spec section 2): the step
// text and bar, the card frame with a sub-line, and eight card-shaped blocks
// (one column on a phone, four columns on a wide screen). No numbers show.
export default function ImportLoading() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Import transactions</h1>
      <div className="max-w-6xl">
        <Skeleton className="mb-2 h-4 w-48" />
        <Skeleton className="mb-4 h-1 w-full" />
        <Card>
          <CardContent>
            <Skeleton className="h-5 w-64 max-w-full" />
            <Skeleton className="mt-2 mb-4 h-4 w-96 max-w-full" />
            <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={index} className="h-[72px] w-full rounded-lg sm:h-36" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
