import Link from "next/link";
import { SearchX } from "lucide-react";

import { PublicShell } from "@/components/public/public-shell";
import { Button } from "@/components/ui/button";
import { PUBLIC_COPY } from "@/lib/public-stock-copy";

// Same page for an unlisted ticker, a wrong market and a mismatched currency.
// It never says or hints whether the ticker exists anywhere in the app.
export default function PublicNotFound() {
  return (
    <PublicShell>
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <span className="flex size-[72px] items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
          <SearchX aria-hidden="true" className="size-12 text-slate-400" />
        </span>
        <h1 className="text-xl font-semibold">{PUBLIC_COPY.notFoundHeading}</h1>
        <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">
          {PUBLIC_COPY.notFoundLine}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/">{PUBLIC_COPY.goHome}</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/sign-in">{PUBLIC_COPY.signIn}</Link>
          </Button>
        </div>
      </div>
    </PublicShell>
  );
}
