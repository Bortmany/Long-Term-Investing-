// The page for any address that doesn't exist (and for stocks the signed-in
// person isn't allowed to see). Styled like the rest of the app, with a plain
// way back. "/" sends signed-in people on to their dashboard.
import Link from "next/link";
import { SearchX } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Page not found — InvestIQ AI" };

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <EmptyState
        icon={SearchX}
        heading="We can't find that page"
        sentence="It may have moved, or the address may be wrong."
        action={
          <Button asChild size="lg">
            <Link href="/">Go to the home page</Link>
          </Button>
        }
      />
    </main>
  );
}
