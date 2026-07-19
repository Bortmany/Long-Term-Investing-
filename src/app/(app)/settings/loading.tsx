import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Loading state shaped like the real settings page (four stacked cards at the
// same max width) so nothing jumps when the data arrives.
export default function SettingsLoading() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Settings</h1>
      <div className="max-w-2xl space-y-6">
        {/* Base Currency */}
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-10 w-48" />
            <Skeleton className="mt-3 h-4 w-72" />
          </CardContent>
        </Card>

        {/* FX Rates */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-10 w-40" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="grid grid-cols-5 gap-4">
                  <Skeleton className="h-4 w-10" />
                  <Skeleton className="h-4 w-10" />
                  <Skeleton className="h-4 w-16 justify-self-end" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
            <Skeleton className="mt-6 h-10 w-full" />
          </CardContent>
        </Card>

        {/* Appearance + Account Access */}
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-28" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-full max-w-md" />
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
