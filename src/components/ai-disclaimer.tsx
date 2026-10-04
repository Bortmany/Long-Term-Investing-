// AiDisclaimer (ui-spec-phases-2-6.md §2.5) — one fixed line shown in the
// footer of every AiPanel. Exact copy, never paraphrased per-screen.
// Wording approved in docs/decisions/advice-wording.md section 2.
export function AiDisclaimer() {
  return (
    <p className="text-xs text-slate-400 dark:text-slate-500">
      AI-generated research for education only, not a personal recommendation. It doesn&apos;t know your full finances and can be wrong. InvestIQ is not licensed to give investment advice in Oman, Saudi Arabia, the US or elsewhere.
    </p>
  );
}
