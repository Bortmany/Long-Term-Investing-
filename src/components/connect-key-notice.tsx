// ConnectKeyNotice (ui-spec-phases-2-6.md §2.5) — the first-class "AI is
// off" state, shown whenever ANTHROPIC_API_KEY is unset server-side. It
// explains why the AI triggers are switched off; it does NOT hide results
// that are already saved in the database. Those keep rendering in full with
// their usual caption and disclaimer (docs/CONVENTIONS.md, AI rules) — this
// notice only takes over a content area when there is nothing stored to
// show. This exact component, exact copy, every time — never paraphrased
// per-screen. No button: there is nothing to click in-app (it's a server
// environment variable, not an in-app setting).
import { KeyRound } from "lucide-react";

/** Plain wording for ordinary users; the developer hint only outside production. */
export const AI_OFF_MESSAGE = "AI analysis isn't switched on for this site yet.";
export const AI_OFF_DEV_HINT =
  "Add an ANTHROPIC_API_KEY to your environment to turn this on.";

export function ConnectKeyNotice() {
  const isDev = process.env.NODE_ENV !== "production";
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-6 text-center dark:border-slate-800 dark:bg-slate-900">
      <KeyRound className="size-7 text-slate-400" aria-hidden="true" />
      <h3 className="mt-3 text-base font-semibold">AI features are turned off</h3>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        {AI_OFF_MESSAGE}
        {isDev ? ` ${AI_OFF_DEV_HINT}` : ""} Nothing here is faked in the meantime.
      </p>
    </div>
  );
}
