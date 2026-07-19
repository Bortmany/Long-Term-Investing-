import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Loading state shaped like the real thesis detail page (header, quoted
// statement, snapshot line, Latest Check panel, check history) so nothing
// jumps when the data arrives.
export default function ThesisDetailLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-2 h-8 w-64" />
      </div>
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-5 w-full" />

      <Card className="gap-4">
        <CardHeader>
          <Skeleton className="h-5 w-28" />
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div>
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-2 h-10 w-24" />
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

      <div>
        <Skeleton className="h-4 w-32" />
        <div className="mt-3 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
