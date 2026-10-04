// ProFeatureNotice (go-public-ui.md §5) — shown instead of the generate
// button on the Pro-only screens (Committee, thesis check-up, weekly review)
// for a Free user. Same grey shell as AiLimitNotice. It never replaces a
// saved result: anything already stored keeps rendering below it with its
// caption and disclaimer.
//
// The server still refuses the action on its own (src/lib/plan-access.ts);
// this notice is the honest explanation, not the protection.
import Link from "next/link";
import { Lock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PLANS_CARD_HREF } from "@/lib/ai/limit-messages";
import { cn } from "@/lib/utils";

export function ProFeatureNotice({
  billingEnabled,
  className,
}: {
  /** From isBillingEnabled() on the server. Off: "coming soon", no button. */
  billingEnabled: boolean;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex max-w-2xl items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-left sm:p-6 dark:border-slate-800 dark:bg-slate-900",
        className,
      )}
    >
      <Lock className="mt-0.5 size-6 shrink-0 text-slate-400" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
            This is part of Pro
          </h3>
          {billingEnabled ? null : <Badge variant="secondary">Coming soon</Badge>}
        </div>
        {billingEnabled ? (
          <>
            {/* DORMANT while billing is off — never rendered in that state. */}
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Upgrade to run the full Investment Committee, thesis check-ups and the weekly AI
              review.
            </p>
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href={PLANS_CARD_HREF}>See Pro plans</Link>
            </Button>
          </>
        ) : (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Pro is coming soon. For now, everything you&apos;ve saved is still here.
          </p>
        )}
      </div>
    </div>
  );
}
