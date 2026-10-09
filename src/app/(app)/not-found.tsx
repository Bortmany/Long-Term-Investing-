// Not-found inside the signed-in app: keeps the sidebar and header, and gives
// a plain way back. Used for missing pages and for stocks the person may not
// see (same answer for both, so nothing about other people's data leaks).
import Link from "next/link";
import { SearchX } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export default function AppNotFound() {
  return (
    <EmptyState
      icon={SearchX}
      heading="We can't find that page"
      sentence="It may have moved, been removed, or the address may be wrong."
      action={
        <Button asChild size="lg">
          <Link href="/dashboard">Back to the dashboard</Link>
        </Button>
      }
    />
  );
}
