import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Loading state shaped like the wizard's first step (title, step indicator,
// tab bar, drop zone, buttons) so nothing jumps when it renders for real.
export default function ImportLoading() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Import CSV</h1>
      <div className="max-w-3xl">
        <Skeleton className="mb-4 h-4 w-48" />
        <Card>
          <CardContent>
            <div className="flex gap-1 border-b border-slate-200 pb-2 dark:border-slate-800">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-6 w-24" />
            </div>
            <Skeleton className="mt-4 h-32 w-full rounded-lg" />
            <Skeleton className="mt-4 h-4 w-44" />
            <div className="mt-4 flex justify-end">
              <Skeleton className="h-10 w-28" />
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
