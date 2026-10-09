// AiLimitNotice (go-public-ui.md §4) — the calm grey "you've hit an AI
// limit" box. A limit is a normal state, not an error, so this is never red
// and never titled "Analysis failed". It always says which limit, when it
// resets, and that saved work is still there (the fixed sentence comes from
// the server, word for word). The "Upgrade to Pro" link appears ONLY when the
// server sent one — a Free user's daily limit while payments are switched on.
import Link from "next/link";
import { Clock } from "lucide-react";

import type { AiLimitCode } from "@/lib/ai/limit-messages";
import { cn } from "@/lib/utils";

const HEADINGS: Record<AiLimitCode, string> = {
  AI_LIMIT_FREE_DAILY: "You've hit today's AI limit",
  AI_LIMIT_PRO_DAILY: "You've hit today's AI limit",
  AI_LIMIT_PRO_MONTHLY: "You've hit this month's AI limit",
  AI_LIMIT_GLOBAL_DAILY: "InvestIQ's AI limit for today has been reached",
};

export function AiLimitNotice({
  code,
  message,
  upgradeHref,
  id,
  className,
}: {
  code: AiLimitCode;
  /** The fixed limit sentence from the server — shown as-is, never shortened. */
  message: string;
  /** Present only when an upgrade is genuinely on offer. */
  upgradeHref?: string;
  id?: string;
  className?: string;
}) {
  const showOmanHint = code !== "AI_LIMIT_PRO_MONTHLY";
  return (
    <div
      id={id}
      role="status"
      className={cn(
        "flex max-w-2xl items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-left sm:p-6 dark:border-slate-800 dark:bg-slate-900",
        className,
      )}
    >
      <Clock className="mt-0.5 size-6 shrink-0 text-slate-400" aria-hidden="true" />
      <div className="min-w-0 space-y-2">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
          {HEADINGS[code]}
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
        {showOmanHint ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Midnight UTC is 4:00 am in Oman.
          </p>
        ) : null}
        {upgradeHref ? (
          <Link
            href={upgradeHref}
            className="inline-flex min-h-11 items-center text-sm font-medium text-blue-600 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:text-blue-400"
          >
            Upgrade to Pro
          </Link>
        ) : null}
      </div>
    </div>
  );
}
