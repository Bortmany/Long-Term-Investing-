// ConnectKeyNotice (ui-spec-phases-2-6.md §2.5) — the first-class "AI is
// off" state, shown instead of any AI trigger button or AI output whenever
// ANTHROPIC_API_KEY is unset server-side. This exact component, exact copy,
// every time — never paraphrased per-screen. No button: there is nothing to
// click in-app (it's a server environment variable, not an in-app setting).
import { KeyRound } from "lucide-react";

export function ConnectKeyNotice() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-6 text-center dark:border-slate-800 dark:bg-slate-900">
      <KeyRound className="size-7 text-slate-400" aria-hidden="true" />
      <h3 className="mt-3 text-base font-semibold">AI features are turned off</h3>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Add an ANTHROPIC_API_KEY to your environment to turn this on. Nothing here
        is faked in the meantime.
      </p>
    </div>
  );
}
